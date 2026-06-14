/**
 * 디지털 순서논리(D-FF + 게이트) generic 추출 — GPT가 업로드 회로를 LogicNetworkDiagram으로.
 *  임용 12번: 2 D-FF + 조합게이트(NAND 등) + 외부입력 A·B + 클록 + 상태 Q1Q0.
 *
 *  ★ 예시 하드코딩 금지: 업로드 구조(FF 개수·게이트 연결·점선부)를 GPT가 추출 →
 *    seqSpecFromLogicNetwork + simulateSequential로 상태 시퀀스 결정론 계산.
 */

import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { seqSpecFromLogicNetwork, simulateSequential } from "@/lib/digital/sequentialSim";
import type { AnalysisResult, GenerationMode, LogicNetworkDiagram, LogicGate, LogicGateType } from "@/types";

const log = createLogger("lib/generation/digital/extractSequentialLogic");

const GATE_TYPES = new Set<LogicGateType>(["NOT", "AND", "OR", "NAND", "NOR", "XOR", "XNOR", "DFF", "TFF", "JKFF", "MUX"]);

type RawGate = { id: string; type: string; inputs: string[]; output: string; clockSignal?: string };
type RawDiagram = {
  inputs: string[];     // 외부 입력 (A, B, CLK)
  outputs: string[];    // Q 출력 (Q1, Q0)
  gates: RawGate[];
  signalLabels?: Record<string, string>;
  dashedRegionGateIds?: string[];   // [단계 3] 설계 대상 (점선부) 게이트 id
};

export type SequentialExtraction = {
  diagram: LogicNetworkDiagram;
  ffOutputs: string[];   // FF 출력 신호 (상태 비트, MSB first 권장)
  warnings: string[];
};

function adapt(raw: RawDiagram): LogicNetworkDiagram {
  const gates: LogicGate[] = (raw.gates ?? [])
    .filter((g) => GATE_TYPES.has(String(g.type).toUpperCase() as LogicGateType))
    .map((g) => {
      const type = String(g.type).toUpperCase() as LogicGateType;
      const isFF = ["DFF", "TFF", "JKFF"].includes(type);
      return {
        id: g.id, type, inputs: (g.inputs ?? []).filter(Boolean), output: g.output,
        clockSignal: isFF ? (g.clockSignal ?? "CLK") : undefined,
      };
    });
  return {
    inputs: raw.inputs ?? [],
    outputs: raw.outputs ?? [],
    gates,
    signalLabels: raw.signalLabels,
    dashedRegions: raw.dashedRegionGateIds?.length ? [{ gateIds: raw.dashedRegionGateIds, label: "㉢" }] : undefined,
  };
}

const SYSTEM = `너는 전자 임용시험 디지털 순서논리(D 플립플롭) 회로를 구조화하는 엔진이다.
업로드된 원본 회로를 LogicNetworkDiagram JSON으로 출력한다.

[절대 규칙]
- 원본 구조 보존: D 플립플롭 개수, 각 FF의 D입력을 만드는 조합게이트(NAND/AND/OR/NOT 등)와 연결,
  외부 입력(A,B), 클록(CLK), 출력 Q를 그대로.
- D 플립플롭은 type "DFF", inputs=[D입력 신호 1개], output=Q신호명, clockSignal="CLK".
- 조합 게이트는 type(NAND/AND/OR/NOT/XOR 등), inputs=[신호명들], output=새 신호명.
- 신호명은 외부입력(A,B) · 게이트 output · FF output(Q1,Q0)을 참조. 모든 gate input은 어딘가의 신호여야.
- FF output(Q1,Q0)이 다시 게이트 입력으로 피드백되는 순서논리 구조를 유지(상태머신).
- inputs에 "CLK" 포함. outputs에 Q들(MSB 먼저, 예 ["Q1","Q0"]).
- [단계 3] "점선 부분을 최소 AND/OR로 설계"가 있으면 그 부분 게이트 id들을 dashedRegionGateIds에 넣는다.

[출력 JSON] (이 키만, 코드펜스 금지)
{
  "inputs": ["A","B","CLK"],
  "outputs": ["Q1","Q0"],
  "gates": [
    {"id":"g1","type":"NAND","inputs":["A","Q0"],"output":"n1"},
    {"id":"g2","type":"NAND","inputs":["B","n1"],"output":"D1"},
    {"id":"FF1","type":"DFF","inputs":["D1"],"output":"Q1","clockSignal":"CLK"},
    {"id":"g3","type":"AND","inputs":["A","Q1"],"output":"D0"},
    {"id":"FF0","type":"DFF","inputs":["D0"],"output":"Q0","clockSignal":"CLK"}
  ],
  "signalLabels": {"D1":"D_1","D0":"D_0"},
  "dashedRegionGateIds": ["g3"]
}`;

/**
 * 원본(임용 12번) 클럭 구조 강제 — 첫 FF는 클럭 직결, 두 번째 FF는 NOT 게이트를 거친
 * 반전 클럭(CLK')으로 구동(하강 에지 트리거). 유사·변형 모드 모두 적용.
 *
 *   - FF가 2개 미만이면 변경 없음.
 *   - ffOutputs 순서(MSB 먼저) 기준 첫 FF=clockSignal "CLK", 두 번째 FF=clockSignal "CLK_n".
 *   - NOT(CLK)→CLK_n 게이트를 회로에 1개 추가(이미 있으면 재사용).
 *   - 시뮬레이터(seqSpecFromLogicNetwork)가 CLK_n을 negEdge로 인식 → 2-phase 타이밍 반영.
 */
export function enforceSecondFfInvertedClock(diagram: LogicNetworkDiagram, ffOutputs: string[]): LogicNetworkDiagram {
  const FF = new Set<LogicGateType>(["DFF", "TFF", "JKFF"]);
  const ffGates = diagram.gates.filter((g) => FF.has(g.type));
  if (ffGates.length < 2) return diagram;
  const firstQ = ffOutputs[0] ?? ffGates[0].output;
  const secondQ = ffOutputs[1] ?? ffGates[1].output;
  const clkN = "CLK_n";
  const gates: LogicGate[] = diagram.gates.map((g) => {
    if (!FF.has(g.type)) return g;
    if (g.output === secondQ) return { ...g, clockSignal: clkN };       // 두 번째 FF: 반전 클럭
    if (g.output === firstQ) return { ...g, clockSignal: "CLK" };        // 첫 FF: 클럭 직결
    return g;
  });
  const hasInv = gates.some((g) => g.type === "NOT" && g.output === clkN && /^clk$/i.test(g.inputs[0] ?? ""));
  const finalGates = hasInv ? gates : [{ id: "clkinv", type: "NOT" as LogicGateType, inputs: ["CLK"], output: clkN }, ...gates];
  const inputs = diagram.inputs.some((n) => /^clk$/i.test(n)) ? diagram.inputs : [...diagram.inputs, "CLK"];
  const signalLabels = { ...(diagram.signalLabels ?? {}) };
  signalLabels[clkN] = "CLK'";
  log.info("second_ff_inverted_clock", { firstQ, secondQ, clkN });
  return { ...diagram, inputs, gates: finalGates, signalLabels };
}

/**
 * 기출변형유형(exam_variant) 전용 — 2개 이상의 D-FF 중 하나를 T 플립플롭으로 등가 변환한다.
 *
 *   변환: 대상 FF의 T 입력 = (원래 D 신호) ⊕ Q.
 *   효과: Q_next = Q ⊕ T = Q ⊕ (D ⊕ Q) = D  →  상태 시퀀스·정답 동일(학습목표 유지),
 *         소자 종류만 1개 변형(D-FF → T-FF + 변환 XOR). exam_variant 정책에 부합.
 *
 *   - D-FF가 2개 미만이면 변형 불가 → 원본 그대로 반환.
 *   - seed로 어느 FF를 변환할지 결정론적 선택(문항마다 다른 비트 변형 가능).
 *   - 특정 회로 하드코딩 없음 — 추출된 임의 D-FF 순서논리에 범용 적용.
 */
export function convertOneDffToTff(diagram: LogicNetworkDiagram, seed: number): LogicNetworkDiagram {
  const dffs = diagram.gates.filter((g) => g.type === "DFF");
  if (dffs.length < 2) return diagram;
  const pick = dffs[seed % dffs.length];
  const dSig = pick.inputs[0] ?? "0";
  const q = pick.output;
  const tSig = `T_${q}`;                       // 변환 XOR 출력(= T 입력) 내부 신호명
  const xor: LogicGate = { id: `tconv_${pick.id}`, type: "XOR", inputs: [dSig, q], output: tSig };
  const gates: LogicGate[] = [];
  for (const g of diagram.gates) {
    if (g.id === pick.id) {
      gates.push(xor);                          // FF 앞에 변환 XOR 삽입(T = D ⊕ Q)
      gates.push({ ...g, type: "TFF", inputs: [tSig] });
    } else {
      gates.push(g);
    }
  }
  const signalLabels = { ...(diagram.signalLabels ?? {}) };
  signalLabels[tSig] = q.replace(/^Q/i, "T");   // 표시 라벨: Q1→T1, Q_0→T_0
  log.info("dff_to_tff_variant", { convertedFf: pick.id, q, dSig, tSig });
  return { ...diagram, gates, signalLabels };
}

export async function extractSequentialLogic(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  seed?: number;
  maxAttempts?: number;
}): Promise<SequentialExtraction> {
  const { analysis } = args;
  const maxAttempts = args.maxAttempts ?? 7;
  const openai = getOpenAI();
  const inv = (analysis?.componentInventory ?? [])
    .map((c) => `  - ${c.id} (${c.type})${c.value ? ` = ${c.value}` : ""}`).join("\n");
  const userPrompt = [
    `[모드] ${args.mode}`,
    `[원본 주제] ${analysis?.topic ?? ""}`,
    `[원본 해석] ${analysis?.interpretation ?? ""}`,
    `[입출력 신호] ${JSON.stringify(analysis?.signals ?? {})}`,
    `[소자 인벤토리]\n${inv || "  (없음)"}`,
    ``,
    `위 D-FF 순서논리 회로를 LogicNetworkDiagram JSON으로 출력하라 (FF·게이트·피드백 보존).`,
  ].join("\n");

  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let raw: RawDiagram | null = null;
    try {
      const c = await withRateLimitRetry(() =>
        openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: attempt === 0 ? userPrompt : `${userPrompt}\n\n[재시도 ${attempt}] 직전 실패: ${lastErr}\n반드시: DFF≥1, 모든 gate input이 정의된 신호(외부입력/게이트출력/Q), FF output이 게이트로 피드백, 시뮬레이션 가능.` },
          ],
          response_format: { type: "json_object" }, max_tokens: 1800, temperature: attempt === 0 ? 0.4 : 0.7,
        }),
      );
      raw = JSON.parse(c.choices[0]?.message?.content ?? "{}") as RawDiagram;
    } catch (e) { lastErr = `JSON 실패: ${String(e)}`; continue; }

    const diagram = adapt(raw);
    const ffs = diagram.gates.filter((g) => g.type === "DFF" || g.type === "TFF");
    if (ffs.length === 0) { lastErr = "D-FF 없음 (순서논리인데 FF 누락)"; log.warn("no_ff", { attempt }); continue; }

    // 신호 정의 검증: 모든 gate input이 외부입력·게이트output·FF output 중 하나여야 (CLK 제외).
    const defined = new Set<string>([...diagram.inputs, ...diagram.gates.map((g) => g.output)]);
    const undef: string[] = [];
    for (const g of diagram.gates) for (const inp of g.inputs) {
      if (!/^clk$/i.test(inp) && !defined.has(inp)) undef.push(`${g.id}:${inp}`);
    }
    if (undef.length > 0) { lastErr = `미정의 신호 입력: ${undef.join(", ")}`; log.warn("undef_signal", { attempt, undef }); continue; }

    // 시뮬레이션 가능성 — 짧게 돌려 예외/비결정 확인.
    try {
      const spec = seqSpecFromLogicNetwork(diagram);
      const inputWaves: Record<string, number[]> = {};
      for (const inp of spec.inputs) inputWaves[inp] = [0, 1, 1, 0, 1, 0];
      const r = simulateSequential({ spec, inputWaves, cycles: 6 });
      if (r.stateSeq.length !== 6) throw new Error("상태열 길이 이상");
    } catch (e) { lastErr = `시뮬레이션 실패: ${String(e)}`; log.warn("sim_failed", { attempt, lastErr }); continue; }

    const ffOutputs = ffs.map((g) => g.output);
    log.info("seq_extract_ok", { attempt, ffCount: ffs.length, gateCount: diagram.gates.length, ffOutputs });
    return { diagram, ffOutputs, warnings: [] };
  }
  throw new Error(`extractSequentialLogic: ${maxAttempts}회 실패 — ${lastErr}`);
}
