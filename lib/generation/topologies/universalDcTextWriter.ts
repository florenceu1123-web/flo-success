import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { DcQueryResult } from "@/lib/solver/universalDc";
import type { DcConceptLead } from "../topologyDriven/inferDcQueries";
import type { TopologyDrivenGeneration } from "../topologyDriven/buildFromTopology";

const log = createLogger("lib/generation/topologies/universalDcTextWriter");

export type UniversalDcTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 임의 DC 회로(V/I/R) + 다단계 query에 대한 텍스트 작성.
 *
 *   결정론 layer:
 *     - 회로(소자/값/연결): buildFromTopology가 결정
 *     - 정답(node V, 전력, inverse R): universalDc solver가 산출
 *   GPT layer: content/conditions/question 자연어. answer/solution은 solver 결과로 강제.
 *
 *   query 그룹화 규칙 (단계 매핑):
 *     - solve   : node voltage·branch current
 *     - power   : totalPower·resistorPower
 *     - inverse : inverseR (가변 R 역산)
 *
 *   ★ 단계 번호는 query 종류가 아니라 **실제로 존재하는 그룹의 순서**로 매긴다.
 *     (전력만 물으면 "[단계 1] 전력" — 예전엔 power를 무조건 2번으로 박아
 *      1단계 없이 "[단계 2]"부터 시작하는 문제가 생성됐다.)
 */
export async function writeUniversalDcText(args: {
  generation: TopologyDrivenGeneration;
  queryResults: DcQueryResult[];
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
  /** 개념형 "원리의 명칭 쓰기" lead (예: 중첩의 원리). 있으면 명칭 소문항을 앞에 추가. */
  conceptLead?: DcConceptLead | null;
}): Promise<UniversalDcTextOutput> {
  const { generation, queryResults, mode, topicLabel, contextHint, conceptLead } = args;

  // 단계별 query 분류
  const stage1 = queryResults.filter((q) => q.query.kind === "nodeVoltage" || q.query.kind === "branchCurrent");
  const stage2 = queryResults.filter((q) => q.query.kind === "totalPower" || q.query.kind === "resistorPower");
  const stage3 = queryResults.filter((q) => q.query.kind === "inverseR");

  // ★ 실제로 존재하는 그룹만 모아 1부터 연속 번호 부여 — 비어 있는 그룹은 번호를 소비하지 않는다.
  //   step("power")는 그룹이 없으면 0을 반환하지만, 호출부는 항상 해당 그룹이 비지 않은
  //   분기 안에서만 사용한다.
  const presentStages: Array<"solve" | "power" | "inverse"> = [];
  if (stage1.length > 0) presentStages.push("solve");
  if (stage2.length > 0) presentStages.push("power");
  if (stage3.length > 0) presentStages.push("inverse");
  const step = (key: "solve" | "power" | "inverse"): number => presentStages.indexOf(key) + 1;

  // resistorPower 대상 저항의 표시 라벨(현재 perturbed 값) — 발문·풀이에서 "N Ω 저항" 지목용.
  //   id로 netlist 컴포넌트를 찾아 값 표기(예 "15Ω"). 못 찾으면 라벨 생략.
  const resistorPowerLabel = (q: DcQueryResult): string => {
    if (q.query.kind !== "resistorPower") return "";
    const targetId = q.query.resistorId;
    const comp = generation.netlistOpen.components.find((c) => c.id === targetId);
    const val = comp?.value ? String(comp.value).replace(/\s/g, "") : "";
    return val ? `${val} 저항` : "해당 저항";
  };
  const hasResistorPower = stage2.some((q) => q.query.kind === "resistorPower");

  const fmt = (v: number, unit: string, meta?: Record<string, unknown>) => {
    if (!Number.isFinite(v)) return `(NaN)${unit}`;
    const base = Number.isInteger(v) ? `${v}${unit}` : `${Number(v.toFixed(3))}${unit}`;
    // inverseR이 수렴 실패면 표시
    if (meta && meta.converged === false) {
      return `${base} (※수렴 실패: 회로 토폴로지가 목표 전압에 도달 불가)`;
    }
    return base;
  };

  // enforcedAnswer
  const ansLines: string[] = [];
  // ★ 개념형 lead — "원리의 명칭 쓰기"가 있으면 첫 소문항으로 강제.
  if (conceptLead) {
    ansLines.push(`[원리] ${conceptLead.principleName}`);
  }
  if (stage1.length > 0) {
    ansLines.push(
      `[단계 ${step("solve")}] ${stage1.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage2.length > 0) {
    ansLines.push(
      `[단계 ${step("power")}] ${stage2.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage3.length > 0) {
    ansLines.push(
      `[단계 ${step("inverse")}] ${stage3.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  const enforcedAnswer = ansLines.join("\n") || "(query 없음)";

  // enforcedSolution — 솔버 결과 + 일반적인 분석 절차 서술
  const solLines: string[] = [];
  // ★ 내부 component id(R_leg3_1 등)를 GPT에 노출하면 본문/질문에 그대로 새어 나온다.
  //   type+value만 전달하고, id 사용 금지 규칙도 프롬프트에 명시한다.
  const components = generation.netlistOpen.components
    .map((c) => `${c.type}${c.value ? `=${c.value}` : ""}`)
    .join(", ");
  if (conceptLead) {
    solLines.push(
      `[원리] 여러 독립 전원이 있는 선형 회로에서 각 전원이 단독으로 작용할 때의 응답을 합산하는 해석법 → ${conceptLead.principleName}.`,
    );
  }
  if (stage1.length > 0) {
    solLines.push(
      `[단계 ${step("solve")}] KVL/KCL 또는 메시·노드 해석으로 회로를 풀어 ${stage1.map((q) => q.query.label).join("·")}을(를) 얻는다.\n` +
      `  · 솔버 결과: ${stage1.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage2.length > 0) {
    // resistorPower(특정 저항) vs totalPower(전체 합) 서술 분기.
    //   ★ 앞 단계 참조는 그 단계가 실제로 있을 때만 — 없으면 회로에서 바로 푼다고 서술.
    const solDesc = hasResistorPower
      ? `대상 저항 양단 전압 V로부터 P = V²/R (또는 P = I²R)로 소비전력을 구한다`
      : stage1.length > 0
        ? `단계 ${step("solve")}의 결과를 이용해 각 저항의 전력 P_i = V_i²/R_i를 합산하여 ${stage2[0].query.label}을 구한다`
        : `노드 해석으로 각 저항의 전압·전류를 구한 뒤 전력 P_i = V_i²/R_i를 합산하여 ${stage2[0].query.label}을 구한다`;
    solLines.push(
      `[단계 ${step("power")}] ${solDesc}.\n` +
      `  · ${stage2.map((q) => `${q.query.label}${resistorPowerLabel(q) ? `(${resistorPowerLabel(q)})` : ""} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage3.length > 0) {
    solLines.push(
      `[단계 ${step("inverse")}] 가변 저항 R을 미지수로 두고 노드 해석을 다시 수행. 목표 노드 전압이 주어진 값이 되는 R을 도출.\n` +
      `  · ${stage3.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  const enforcedSolution = solLines.join("\n");

  // ── 질문(발문) 템플릿 동적 구성 — 개념 lead·전력 대상 저항을 반영.
  const questionParts: string[] = [];
  if (conceptLead) {
    questionParts.push(`(1) 위 <해석 절차>에 사용된 회로 해석 원리의 명칭을 쓰시오.`);
  }
  // conceptLead가 있으면 첫 단계 앞에만 "(2) "를 붙인다(개념 소문항이 (1)).
  const leadPrefix = (key: "solve" | "power" | "inverse") =>
    conceptLead && step(key) === 1 ? "(2) " : "";
  if (stage1.length > 0) {
    questionParts.push(
      `${leadPrefix("solve")}[단계 ${step("solve")}] ${stage1.map((q) => q.query.label).join("·")}을(를) 구한다.`,
    );
  }
  if (stage2.length > 0) {
    const p = stage2[0];
    const powerAsk = hasResistorPower
      ? `${resistorPowerLabel(p)}에서 소비되는 전력 ${p.query.label}`
      : `전체 저항이 소비하는 전력 ${p.query.label}`;
    questionParts.push(`${leadPrefix("power")}[단계 ${step("power")}] ${powerAsk}을(를) 구한다.`);
  }
  if (stage3.length > 0) {
    questionParts.push(
      `${leadPrefix("inverse")}[단계 ${step("inverse")}] 가변 저항 R을 조정하여 목표 조건을 만족하는 R 값을 구한다.`,
    );
  }
  const questionTemplate = questionParts.join("\\n");

  const conceptNote = conceptLead
    ? `\n[개념 소문항] 이 문제는 먼저 해석 원리의 명칭(정답: ${conceptLead.principleName})을 묻는다. question에 "(1) … 원리의 명칭을 쓰시오." 소문항을 반드시 포함하고, content 도입부에 "<해석 절차>에 사용된 원리의 명칭을 쓰고, 이를 적용하여 …"처럼 명칭 쓰기+수치 계산 두 파트임을 드러내라. 단, 본문에 원리 이름(${conceptLead.principleName})을 직접 노출하지 마라(정답 누설 금지) — 대신 원리의 정의("여러 독립 전원이 있는 회로에서 특정 소자의 전압·전류는 각 전원이 단독으로 존재할 때의 값의 합과 같다")를 <보기>/설명 박스로 제시하라.`
    : "";

  const userPrompt = `다음 DC 회로 + 다단계 query 문제의 자연어 텍스트(content/conditions/question)만 작성하세요.
회로(소자·값·연결)와 정답(answer/solution)은 코드가 결정 — 변경 금지.

[회로 소자] ${components}
ground = ${generation.netlistOpen.ground ?? "GND"}

[단계별 정답 — 변경 금지]
${enforcedAnswer}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}${conceptNote}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":   "그림은 직류 전원과 저항을 포함한 회로이다. 제시된 <해석 절차>에 따라 각 단계별 풀이 과정과 함께 결과를 서술하시오.",
  "conditions": ["회로의 소자 값은 그림에 표시", "모든 소자는 이상적으로 동작"],
  "question":  "${questionTemplate}",
  "answer":    "(솔버 강제)",
  "solution":  "(솔버 강제)"
}

[규칙]
- 회로 figure 재생성 금지.
- conditions·question 자연스럽게. question은 위 템플릿 구조·소문항을 유지.
- ★ [단계 N] 번호는 템플릿에 있는 그대로 쓴다 — 번호를 바꾸거나, 템플릿에 없는 단계를 추가/삭제하지 마라.
  (템플릿이 [단계 1] 하나뿐이면 그 한 단계만 묻는다. 없는 단계를 지어내지 마라.)
- ★ 내부 식별자(R_leg…, n0/n1 등)를 본문·질문에 절대 쓰지 마라. 사람이 읽는 라벨(R, V_1, 저항값 등)만 사용.
- ★ 전력을 묻는 저항은 그 저항값(예 "15Ω 저항")으로 지목하라 — 임의 라벨 날조 금지.
- JSON 객체 하나만, 코드펜스 금지.`;

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
  let parsed: Partial<UniversalDcTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<UniversalDcTextOutput>;
  } catch (e) {
    throw new Error(`UniversalDc text JSON 파싱 실패: ${String(e)}`);
  }

  log.info("universal_dc_text_generated", {
    queryCount: queryResults.length,
    answer: enforcedAnswer.split("\n").join(" / "),
  });

  return {
    content: parsed.content ?? "DC 회로 해석 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "회로의 단계별 해석을 수행하시오.",
    answer: enforcedAnswer,
    solution: enforcedSolution,
  };
}
