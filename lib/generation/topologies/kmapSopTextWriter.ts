import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { KmapSopGeneration } from "./kmapSop";

const log = createLogger("lib/generation/topologies/kmapSopTextWriter");

export type KmapSopTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeKmapSopText(args: {
  generation: KmapSopGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<KmapSopTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { func, sopExpression, archetype, values } = generation;

  const mintermText = func.minterms.map((m) => `m${m}`).join(", ");
  const varNamesText = func.varNames.join(",");
  const dontCareText = func.dontCares.length > 0
    ? `d(${func.dontCares.join(",")})` : "(없음)";
  // truthTableBlank 모드 — varNames가 W,X,Y,Z 인지로 판단 (kmapSop.ts에서 강제).
  const truthTableBlank = func.varNames.join("") === "WXYZ";
  // [단계 3] 점선 박스가 있는 케이스만 3단계. ㉠가 입력 직결(단일 게이트)이면 점선 부분 없음 → 2단계.
  const hasDashed = Boolean(generation.logicNetworkDiagram.dashedRegions?.length);
  const step3Question = hasDashed
    ? "\\n  [단계 3] 그림 (나)의 점선 부분에 해당하는 1개의 논리게이트를 구한다."
    : "";
  const step3Answer = hasDashed ? " / 점선 부분 = (단계 3에서 도출)" : "";
  const step3Solution = hasDashed
    ? "\\n\\n[단계 3] 점선 부분\\n  점선 박스 안의 부분 함수가 최종 SOP에서 어떤 sub-term을 담당하는지 식별. 점선 영역 입력/출력 관계 + 단계 2의 분해 결과로 1개 논리게이트(예: AND, OR, NAND, NOR, XOR)를 결정."
    : "";
  const stepCountText = hasDashed ? "[단계 1]·[단계 2]·[단계 3] 3단계" : "[단계 1]·[단계 2] 2단계";

  const sharedHeader = `다음 정보로 임용 시험 스타일의 K-map / SOP 최소화 문제 텍스트를 작성하세요.
문제 데이터(변수·minterm·SOP·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[archetype] ${archetype} (${func.vars}변수)${truthTableBlank ? " · 임용 5번 정보과 형식 (진리표 + ㉠ 빈칸 회로)" : ""}
[변수] ${varNamesText}
[F=1인 minterm 인덱스] ${mintermText}
[don't care 인덱스] ${dontCareText}
[원본 함수 표현] F(${varNamesText}) = Σm(${func.minterms.join(",")})${func.dontCares.length > 0 ? ` + d(${func.dontCares.join(",")})` : ""}

[솔버 결과 — 절대 변경 금지]
최소 SOP: F = ${sopExpression}
SOP term 수: ${values.sopTerms}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}`;

  const userPrompt = truthTableBlank
    ? `${sharedHeader}

[출력 JSON — 임용 5번 정보과 형식]
{
  "content":    "다음 표 (가)는 어떤 조합논리회로의 진리표이고, 그림 (나)는 (가)를 간략화하여 표현한 조합논리회로이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 진리표에서 ×는 무관(don't care)항을 나타내며, 그림 (나)에서 모든 소자는 이상적으로 동작한다.)",
  "conditions": ["(가) 진리표: F(W,X,Y,Z) = Σm(${func.minterms.join(",")})${func.dontCares.length > 0 ? ` + d(${func.dontCares.join(",")})` : ""}", "(나) 간략화된 조합논리회로 — 인버터·AND·㉠ 빈칸 게이트 포함"],
  "question":   "<해석 절차>\\n  [단계 1] (가)를 이용하여 출력 F(W,X,Y,Z)의 카르노도를 구한다.\\n  [단계 2] [단계 1]의 결과를 이용하여 최소화된 불 함수 F(W,X,Y,Z)를 구하고, 그림 (나)와 입력이 2개인 논리회로로 표현하였을 때 ㉠에 해당하는 1개의 논리게이트를 구한다.${step3Question}",
  "answer":     "F = ${sopExpression} / ㉠ = (단계 2에서 도출)${step3Answer}",
  "solution":   "[단계 1] 카르노도\\n  W,X(행)·Y,Z(열) 4×4 K-map을 작성하고 minterm ${func.minterms.join(",")}에 1, don't care ${func.dontCares.join(",")}에 ×를 표시.\\n\\n[단계 2] 최소 SOP\\n  인접 1과 ×를 가장 큰 2의 거듭제곱(1·2·4·8) 그룹으로 묶어 essential prime implicant 도출.\\n  결과: F = ${sopExpression}\\n  ㉠ 게이트: 그림 (나)의 인버터 출력과 한 입력 wire가 만나 ㉠으로 들어가고 ㉠의 출력이 최종 결합 단으로 전달된다. 솔버 SOP를 (나)의 회로 형태에 맞춰 분해해 ㉠ 게이트(2-입력) 종류를 식별하라.${step3Solution}"
}

[규칙]
- answer는 솔버 SOP를 정확히 포함하고 ㉠·점선 부분 게이트는 풀이에서 자연스럽게 도출되도록 작성.
- conditions 첫 항은 정확히 "F(W,X,Y,Z) = Σm(...)" 표기 보존.
- question은 ${stepCountText} 정확히 명시.${hasDashed ? "" : " (이 문제는 점선 부분이 없으므로 [단계 3]을 만들지 마라.)"}
- ㉠${hasDashed ? "·점선 부분" : ""} 게이트 종류는 솔버 SOP에서 학생이 도출하도록 풀이 절차를 서술 (구체 게이트 명을 하드코딩하지 말 것 — 변형 수치에 따라 달라짐).
- (가) 진리표·(나) 회로는 코드가 자동 figure로 생성. 텍스트로 다시 그리지 마라.
- JSON 객체 하나만. 코드펜스 금지.`
    : `${sharedHeader}

[출력 JSON]
{
  "content":    "문제 설명 (한국어). F(${varNamesText}) = Σm(${func.minterms.join(",")}) 함수가 주어진다고 명시.",
  "conditions": ["F(${varNamesText}) = Σm(${func.minterms.join(",")})", "${func.vars}변수 K-map으로 최소화"],
  "question":   "K-map을 이용해 최소 SOP를 구하고 회로로 구현하시오",
  "answer":     "F = ${sopExpression}",
  "solution":   "단계별 풀이:\\n  1) F=1인 minterm을 K-map cell에 표시\\n  2) 인접 1셀들을 가장 큰 2의 거듭제곱(1·2·4·8) 그룹으로 묶기 — Gray code 인접성\\n  3) 모든 1을 cover하는 essential prime implicant 선택\\n  4) 각 그룹에서 변하지 않는 변수만 남겨 product term 추출\\n  5) 결과: F = ${sopExpression}\\n  6) 회로 구현: NOT 게이트로 보수 신호 생성 → AND 게이트로 각 product term → OR 게이트로 합산"
}

[규칙]
- answer는 솔버 SOP 그대로. 다른 식으로 바꾸지 마라.
- solution은 K-map 그루핑 절차를 명시. LaTeX inline 가능.
- 회로 도식·K-map·진리표를 다시 만들지 마라. 코드가 3개 figure 모두 자동 생성.
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
  let parsed: Partial<KmapSopTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<KmapSopTextOutput>; }
  catch (e) { throw new Error(`KmapSop text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `F = ${sopExpression}`;
  if (parsed.answer && !parsed.answer.includes(sopExpression)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? `함수 F(${varNamesText}) = Σm(${func.minterms.join(",")})의 최소 SOP를 구하시오.`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "K-map으로 최소 SOP를 구하고 회로로 구현하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
