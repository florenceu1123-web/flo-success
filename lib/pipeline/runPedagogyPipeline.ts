import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildContextHint } from "./_common";
import { generateProblemsJson, asStr, asStrArray } from "./_gptGen";
import { GENERATION_MODE_LABEL, GENERATION_POLICIES } from "@/types";
import type {
  AnalysisResult,
  GeneratedProblem,
  GenerationMode,
  TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runPedagogyPipeline");

/**
 * 교육학(교직) 파이프라인 — GPT 기반 교육 이론·논술형 문제 생성.
 *
 * 회로·코드·수식 도식이 아니라 교육학 개념·이론 문제다. figure(그림)는 사용하지 않는다.
 * 원본 분석을 컨텍스트로 GPT에게 count개 문제를 요청하고, 개념 설명·사례 적용·서술형 답안을
 * content·question·answer·solution 텍스트로 받는다.
 *
 * exam_similar=같은 이론·구하는 관점 유지, 사례·수치만 변형 /
 * exam_variant=같은 이론 유지하되 발문·구하는 관점(비교·적용·평가)을 변형.
 */
export async function runPedagogyPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const ctx = buildContextHint(analysis) ?? "(원본 컨텍스트 없음 — 일반적인 교육학 이론 문제)";
  const policy = GENERATION_POLICIES[mode];
  log.info("dispatch", { mode, count, topicKey });

  const system = `당신은 중등 교원임용시험 교육학(교직) 논술·전공 출제·해설 전문가입니다.
주어진 원본 문제와 같은 이론·학습목표를 유지하면서 새로운 교육학 문제를 만듭니다.
- 교육학 이론·학자·개념을 정확히 반영하세요. 예: 교육심리(피아제·비고츠키 ZPD·브루너 발견학습·콜버그 도덕성 발달·매슬로/데시-라이언 동기), 교육과정(타일러 목표모형·브루너 나선형·백워드 설계·잠재적/영 교육과정), 교육평가(진단·형성·총괄평가·규준/준거참조·타당도·신뢰도·문항분석), 교육방법·공학(ADDIE·가네 9사태·구성주의·협동학습·에듀테크), 교육행정(과학적 관리·인간관계론·지도성 이론·장학·교육법규), 교육사회학(기능론·갈등론·재생산이론·문화자본), 교육철학·교육사(항존주의·본질주의·진보주의·실존주의), 생활지도·상담(정신분석·행동주의·인간중심·인지행동 상담).
- 개념 정의·특징·사례 적용·이론 간 비교를 정확하고 구체적으로 서술하세요.
- 회로도·수식 도식·코드·그림은 사용하지 않습니다(순수 텍스트).
- 출력은 반드시 JSON 하나. 마크다운 코드펜스 없이 순수 JSON만.`;

  const user = `[원본 분석 컨텍스트]
${ctx}

[생성 요청]
- 생성 모드: ${GENERATION_MODE_LABEL[mode]} (${policy.description})
- 개수: ${count}개 (서로 사례·발문이 다르게)
- 세부 주제(topicKey): ${topicKey ?? "원본과 동일 이론 유지"}
- 모드 규칙:
  · exam_similar(기출유사유형): 원본과 같은 이론·구하는 관점을 유지하고 사례·상황·세부 조건만 변형.
  · exam_variant(기출변형유형): 같은 이론을 유지하되 발문의 관점(개념 설명→사례 적용, 비교→평가 등)을 바꾸거나 조건을 일부 변형 가능.

[출력 JSON 스키마]
{
  "problems": [
    {
      "content": "문제 상황·제시문(교육 현장 사례나 이론 배경) 서술.",
      "conditions": ["주어진 조건·단서 목록 (없으면 빈 배열)"],
      "question": "구하는 것(개념 설명·사례 적용·비교·서술 지시).",
      "answer": "핵심 정답(요지) — 반드시 포함할 개념·용어·논점.",
      "solution": "모범 답안·해설 — 이론 근거와 함께 단계적으로 서술."
    }
  ]
}
정확히 ${count}개의 problems를 생성하세요. figure 키는 넣지 마세요(교육학은 그림 없음).`;

  const raw = await generateProblemsJson({ system, user, label: "pedagogy" });

  const problems: GeneratedProblem[] = raw.slice(0, count).map((p) => ({
    id: randomUUID(),
    content: asStr(p.content),
    conditions: asStrArray(p.conditions),
    question: asStr(p.question),
    answer: asStr(p.answer),
    solution: asStr(p.solution),
    topicKey: topicKey,
    figureVariants: [],
  } satisfies GeneratedProblem));

  return problems;
}
