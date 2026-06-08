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
