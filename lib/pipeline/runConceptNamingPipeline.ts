import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildContextHint } from "./_common";
import { generateProblemsJson, asStr, asStrArray } from "./_gptGen";
import { GENERATION_MODE_LABEL, GENERATION_POLICIES } from "@/types";
import type {
  AnalysisResult,
  GeneratedProblem,
  GenerationMode,
  SubjectKey,
  TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runConceptNamingPipeline");

/**
 * 개념 명칭형 파이프라인 — "설명을 읽고 원리·법칙·소자의 **이름**을 쓰는" 문항.
 *
 * ★ 왜 별도 경로인가(실측 신고): 원본(㉠=키르히호프 전압법칙, ㉡=중첩의 원리)은 수치 계산이
 *   전혀 없는 개념 문항인데, 원본에 **예시 회로 그림**이 딸려 있어 Vision이 소자·topologySignature를
 *   뽑아냈다. 그러면 route가 topology_driven·universal_dc 같은 **결정론 회로 파이프라인**으로 보내고,
 *   그 경로는 GPT 프롬프트(개념형 지시문)를 아예 거치지 않으므로
 *     - "각 노드의 전압 V_1…V_13을 구하시오" 같은 엉뚱한 계산 문제
 *     - 접지로만 이어진 독립 회로 4개짜리 기괴한 회로도
 *   가 그대로 생성됐다. classifier를 unsupported로 고쳐도 이 경로는 막히지 않는다.
 *   → 전자기학·교육학처럼 **회로 dispatch 체인 전체를 우회**하는 텍스트 전용 경로가 필요하다.
 *
 * figure는 만들지 않는다(`figureVariants: []`). 검증 쪽도 개념형이면 requiredFigureRoles를
 * 비우므로(rules·roleTriggers) 어긋나지 않는다.
 */
export async function runConceptNamingPipeline(args: {
  analysis?: AnalysisResult | null;
  subjectKey: SubjectKey;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, subjectKey, mode, count, topicKey } = args;
  const ctx = buildContextHint(analysis) ?? "(원본 컨텍스트 없음)";
  const policy = GENERATION_POLICIES[mode];
  log.info("dispatch", { subjectKey, mode, count, topicKey });

  // ★ 개념 문항에도 두 갈래가 있다 (2026-07-30 실측 신고: pn 접합 원본이 "원리·법칙 이름" 발문으로
  //   생성돼 정답이 "다이오드의 바이어스 특성" 같은 **서술구**가 됐다).
  //   · 법칙형: 회로 해석 원리·법칙 이름 (KVL·중첩의 원리 …)
  //   · **용어형**: 소자·물리 현상의 전문 용어 (전위 장벽·공핍층·제너 항복·터널링 …)
  //   원본 컨텍스트에 반도체·소자 물리 신호가 있으면 용어형으로 발문·정답 형식을 맞춘다.
  const isTermStyle = /pn\s*접합|p-n\s*접합|공핍|전위\s*장벽|에너지\s*(장벽|대역)|전도대역|가전자대역|터널링|항복|캐리어|정공|도핑|다이오드|트랜지스터|반도체/.test(ctx);
  const askLabel = isTermStyle ? "용어" : "원리 또는 법칙의 이름";
  const askPhrase = `${askLabel}${isTermStyle ? "를" : "을"}`;
  // ★ 변형유형은 **원본과 다른 개념**이 정답이어야 한다(사용자 요구) — 원본이 다룬 개념을 회피 목록으로 넘긴다.
  const avoidList = (analysis?.relatedConcepts ?? [])
    .map((c) => String(c).trim())
    .filter((c) => c.length >= 2 && c.length <= 20)
    .slice(0, 10)
    .join(", ");
  const answerShape = isTermStyle
    ? '"㉠ 전위 장벽, ㉡ 제너 항복"처럼 **각각 하나의 전문 용어(명사)**만'
    : '"㉠ …의 법칙, ㉡ …의 원리"처럼 두 이름만';

  const system = `당신은 중등 교원임용시험 전자·회로 분야 출제 전문가입니다.
주어진 원본은 **설명을 읽고 ${askPhrase} 쓰는 개념 문항**입니다.
${isTermStyle
  ? `- 이 원본은 **소자·반도체 물리 용어**를 묻습니다. 정답은 "전위 장벽", "공핍층", "제너 항복",
  "애벌랜치 항복", "터널링", "확산 전류", "드리프트 전류", "역포화 전류", "내부 전위" 같은
  **표준 전문 용어 하나**여야 합니다. "…의 특성", "…의 개념" 같은 **서술구는 정답이 될 수 없습니다**.`
  : `- 정답은 널리 쓰이는 법칙·원리의 이름이어야 합니다.`}
- 수치 계산 문제로 바꾸지 마세요. 전압·전류·전력을 구하라고 하면 안 됩니다.
- 회로도·그림을 만들지 마세요(순수 텍스트). 본문에 "다음 회로", "그림 (가)" 같은 그림 참조 표현 금지.
- 출력은 반드시 JSON 하나. 마크다운 코드펜스 없이 순수 JSON만.`;

  const user = `[원본 분석 컨텍스트]
${ctx}

[생성 요청]
- 생성 모드: ${GENERATION_MODE_LABEL[mode]} (${policy.description})
- 개수: ${count}개 (서로 다루는 ${isTermStyle ? "용어" : "원리·법칙"}가 겹치지 않게)
- 세부 주제(topicKey): ${topicKey ?? "원본과 동일"}

[문항 구조 — 원본과 동일하게 유지]
1. 본문(content)에 ${isTermStyle ? "현상·용어" : "원리·법칙"}를 **설명하는 문장 2개**를 ㉠, ㉡ 기호를 붙여 나열한다.
   (예: "㉠ 임의의 폐경로를 따라 …", "㉡ 여러 개의 독립 전원이 …")
   설명만 읽고 이름을 특정할 수 있도록 그 법칙의 **정의를 정확히** 서술한다.
2. 질문(question)은 "㉠, ㉡에 해당하는 ${askPhrase} 순서대로 쓰시오." 형식.
3. 정답(answer)은 ${answerShape} 순서대로. 해설(solution)에 각 설명이 왜 그 법칙인지 근거를 쓴다.

[모드 규칙]
- exam_similar(기출유사유형): 원본과 같은 구조·같은 분야에서 ${isTermStyle ? "인접한 용어" : "기본 원리"}로,
  설명 대상만 바꾼다(같은 단원 안에서 난이도·형식 유지).
- exam_variant(기출변형유형): ★★ **정답이 되는 ${isTermStyle ? "용어" : "법칙·개념"}이 원본과 반드시 달라야 한다** ★★
  (사용자 요구, 2026-07-30). 같은 분야 안에서 **다른 개념 쌍**을 골라 출제하라.
  ${avoidList ? `아래 목록은 원본이 다룬 것이므로 **정답으로 쓰지 마라**: ${avoidList}.` : ""}
  ${isTermStyle
    ? "예: 원본이 전위 장벽·제너 항복이면 → 애벌랜치 항복·공핍층 폭, 확산 전류·드리프트 전류, 역포화 전류·문턱 전압 등 **다른 쌍**."
    : "예: 원본이 KVL·중첩의 원리면 → 테브난 정리·최대 전력 전달 정리, 노턴 정리·상反성 정리 등 **다른 쌍**."}
- ★ 두 모드 모두 원본과 **같은 조합을 그대로 반복하지 마라**(원본은 참고용).

[출력 JSON 스키마]
{
  "problems": [
    {
      "content": "㉠ …에 대한 설명.\\n㉡ …에 대한 설명.",
      "conditions": ["부가 조건이 있으면 (없으면 빈 배열)"],
      "question": "㉠, ㉡에 해당하는 ${askPhrase} 순서대로 쓰시오.",
      "answer": "${isTermStyle ? "㉠ 전위 장벽, ㉡ 제너 항복" : "㉠ …의 법칙, ㉡ …의 원리"}",
      "solution": "각 설명이 해당 법칙인 근거를 서술."
    }
  ]
}
정확히 ${count}개의 problems를 생성하세요. figure 키는 넣지 마세요(개념형은 그림 없음).`;

  const raw = await generateProblemsJson({ system, user, label: "concept_naming" });

  return raw.slice(0, count).map((p) => ({
    id: randomUUID(),
    content: asStr(p.content),
    conditions: asStrArray(p.conditions),
    question: asStr(p.question),
    answer: asStr(p.answer),
    solution: asStr(p.solution),
    topicKey,
    figureVariants: [], // ★ 개념형은 회로 figure를 만들지 않는다
  } satisfies GeneratedProblem));
}
