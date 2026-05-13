import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { TopologyDrivenGeneration } from "../../generation/topologyDriven/buildFromTopology";

const log = createLogger("lib/generation/topologies/topologyDrivenTextWriter");

export type TopologyDrivenTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * Topology-driven 회로(원본 구조를 그대로 따라간 회로)에 대한 GPT 텍스트 작성.
 *
 *  결정론 generator가 만들어 둔 netlist + 솔버 결과를 prompt로 박고 GPT는 문제 문장만 작성.
 *  SW가 있으면 (가)·(나) 두 상태(open/closed) 모두 풀이 단계로 설명.
 */
export async function writeTopologyDrivenText(args: {
  generation: TopologyDrivenGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<TopologyDrivenTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const {
    netlistOpen,
    branchCurrentsOpen,
    branchCurrentsClosed,
    solutionOpen,
    solutionClosed,
    values,
    hasSwitch,
    hasDependentSource,
    isSupermesh,
  } = generation;

  const componentListText = netlistOpen.components.map((c) => {
    const v = c.value ?? (c.gain !== undefined ? `${c.gain}${c.control ?? ""}` : "");
    return `  - ${c.id} (${c.type})${v ? ` = ${v}` : ""}`;
  }).join("\n");

  const valuesText = Object.entries(values).map(([k, v]) => `${k}=${v}`).join(", ");

  // node→임용 표기 매핑: 회로의 vertical leg attach node를 V_1, V_2... 로 라벨링.
  // (왼쪽 vertical leg가 부착된 top node = V_1, 다음 = V_2, ...)
  const nodeLabelMap = buildNodeLabelMap(netlistOpen);
  const labelMapText = Array.from(nodeLabelMap.entries())
    .map(([node, label]) => `${label} ≡ V(${node})`)
    .join(", ");

  const switchNote = hasSwitch
    ? `[SW 두 상태]\n  - (가) SW open: ${stringifyVoltagesLabeled(solutionOpen.nodeVoltages, nodeLabelMap)}, 주요 branch 전류 = ${stringifyCurrents(branchCurrentsOpen)}\n  - (나) SW closed: ${stringifyVoltagesLabeled(solutionClosed?.nodeVoltages ?? {}, nodeLabelMap)}, 주요 branch 전류 = ${stringifyCurrents(branchCurrentsClosed ?? {})}`
    : `[솔버 결과]\n  - ${stringifyVoltagesLabeled(solutionOpen.nodeVoltages, nodeLabelMap)}\n  - 주요 branch 전류 = ${stringifyCurrents(branchCurrentsOpen)}`;

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 회로 해석 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 패턴]
${isSupermesh ? "- 슈퍼메시(supermesh) 패턴 — 두 mesh가 한 vertical chain을 공유." : "- 일반 mesh/nodal 패턴."}
${hasSwitch ? "- 스위치 SW 포함 — (가) open / (나) closed 두 상태 비교." : ""}
${hasDependentSource ? "- 종속전원(VCCS/VCVS) 포함 — 제어 변수에 비례하는 source." : ""}

[소자]
${componentListText}
ground = ${netlistOpen.ground ?? "GND"}

[사용 값] ${valuesText}

[노드 라벨 매핑] ${labelMapText || "(없음)"}
  · 임용 표기 V_1, V_2 등은 솔버의 위 라벨에 정확히 대응. 풀이에서 V_1·V_2를 언급할 땐 반드시 이 매핑을 따를 것.

${switchNote}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). 원본의 구조·해석 원리(supermesh / SW 상태비교 / 종속전원)를 그대로 유지함을 명시.",
  "conditions": ["주요 소자 값 (V/I/R)", "${hasSwitch ? "(가) SW 열림 / (나) SW 닫힘 두 상태" : "단일 상태"}", "${hasDependentSource ? "종속전원 = 제어 변수 × gain" : ""}"],
  "question":   "${hasSwitch ? "[단계 1] (가) 회로에서 V_1·I_1을 구하시오. [단계 2] (나) 회로에서 supermesh 해석으로 V_2·I_2를 구하시오." : "회로의 주요 전압·전류를 구하시오."}",
  "answer":     "${composeAnswer(generation, nodeLabelMap)}",
  "solution":   "단계별 풀이를 작성. SW가 있으면 두 상태 각각, 종속전원이 있으면 제어식을 명시. 솔버 결과 값(위의 V_top_nodes·branch 전류)을 그대로 사용."
}

[규칙]
- answer는 위 솔버 결과 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 supermesh KVL·VCCS 제어식·SW 두 상태 분석을 모두 포함.
- 회로 도식 다시 만들지 마라. 코드가 처리.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<TopologyDrivenTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<TopologyDrivenTextOutput>; }
  catch (e) { throw new Error(`TopologyDriven text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = composeAnswer(generation, nodeLabelMap);
  if (parsed.answer && !parsed.answer.includes(enforcedAnswer.split(",")[0].trim())) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "원본 회로의 구조를 유지한 유사 회로 해석 문제.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "회로의 주요 전압·전류를 구하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function stringifyVoltages(v: Record<string, number>): string {
  const entries = Object.entries(v);
  if (entries.length === 0) return "(없음)";
  return entries.map(([k, val]) => `${k}=${round3(val)}V`).join(", ");
}

function stringifyVoltagesLabeled(v: Record<string, number>, labelMap: Map<string, string>): string {
  const entries = Object.entries(v);
  if (entries.length === 0) return "(없음)";
  return entries.map(([k, val]) => {
    const lab = labelMap.get(k);
    return lab ? `${lab}=V(${k})=${round3(val)}V` : `V(${k})=${round3(val)}V`;
  }).join(", ");
}

/** vertical leg attach node에 V_1, V_2... 라벨 부여. SW/load leg 등 attach node도 포함. */
function buildNodeLabelMap(netlist: { components: Array<{ pins: Array<{ node: string }> }>; ground?: string }): Map<string, string> {
  // top rail R 양 끝 노드들 (= top nodes)를 등장 순서대로 V_i 라벨링.
  // 단, GND는 제외. nodeIds는 회로에서 발견된 순서대로.
  const seen = new Set<string>();
  const ordered: string[] = [];
  const gnd = netlist.ground ?? "GND";
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (p.node !== gnd && !p.node.startsWith("mid_") && !seen.has(p.node)) {
        seen.add(p.node);
        ordered.push(p.node);
      }
    }
  }
  const map = new Map<string, string>();
  ordered.forEach((n, i) => map.set(n, `V_${i + 1}`));
  return map;
}

function stringifyCurrents(c: Record<string, number>): string {
  const entries = Object.entries(c);
  if (entries.length === 0) return "(없음)";
  return entries.map(([k, val]) => `${k}=${round3(val)}A`).join(", ");
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function composeAnswer(gen: TopologyDrivenGeneration, nodeLabelMap: Map<string, string>): string {
  const parts: string[] = [];
  const suffix = gen.hasSwitch ? "(open)" : "";
  for (const [node, label] of nodeLabelMap) {
    const v = gen.solutionOpen.nodeVoltages[node];
    if (v === undefined) continue;
    parts.push(`${label}${suffix} = ${round3(v)}V`);
  }
  if (gen.solutionClosed) {
    for (const [node, label] of nodeLabelMap) {
      const v = gen.solutionClosed.nodeVoltages[node];
      if (v === undefined) continue;
      parts.push(`${label}(closed) = ${round3(v)}V`);
    }
  }
  return parts.join(", ");
}
