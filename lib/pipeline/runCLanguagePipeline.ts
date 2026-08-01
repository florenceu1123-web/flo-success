import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildContextHint } from "./_common";
import { generateProblemsJson, asStr, asStrArray } from "./_gptGen";
import { GENERATION_MODE_LABEL, GENERATION_POLICIES } from "@/types";
import type {
  AnalysisResult,
  CodeBlockDiagram,
  FigureVariant,
  GeneratedProblem,
  GenerationMode,
  TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runCLanguagePipeline");

/**
 * C언어 파이프라인 — GPT 기반 코드 분석·출력 예측 문제 생성.
 *
 * 회로가 아니라 프로그래밍이므로 결정론 archetype이 없다. 원본 분석(주제·해석·개념)을
 * 컨텍스트로 GPT에게 count개 서로 다른 문제를 요청한다. 각 문제는 컴파일 가능한 C 코드
 * 스니펫(code_block figure)과 그 실행 결과·변수값을 정답으로 갖는다.
 *
 * exam_similar=같은 문법 개념·구조, 값/코드만 변형 / exam_variant=같은 개념, 코드 구조 일부 변형.
 */
export async function runCLanguagePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const ctx = buildContextHint(analysis) ?? "(원본 컨텍스트 없음 — 일반적인 C 코드 분석 문제)";
  const policy = GENERATION_POLICIES[mode];
  log.info("dispatch", { mode, count, topicKey });

  const system = `당신은 중등 정보·전자 임용시험 C언어 출제·해설 전문가입니다.
주어진 원본 문제와 같은 문법 개념·학습목표를 유지하면서 새로운 "코드 분석·출력 예측" 문제를 만듭니다.
반드시 컴파일·실행 가능한 정확한 C 코드를 제시하고, 그 실행 결과(표준출력) 또는 지정된 변수의 최종 값을 정확히 계산해 정답으로 냅니다.
- 코드의 실제 실행 결과를 직접 손으로 추적해 정답을 도출하세요(추측 금지). 포인터·증감연산자·연산자 우선순위·형변환·정수 나눗셈·오버플로에 주의.
- 회로도·수식 도식은 없습니다. 지문 코드가 곧 figure입니다.
- 출력은 반드시 JSON 하나. 마크다운 코드펜스(\`\`\`) 없이 순수 JSON만.`;

  const user = `[원본 분석 컨텍스트]
${ctx}

[생성 요청]
- 생성 모드: ${GENERATION_MODE_LABEL[mode]} (${policy.description})
- 개수: ${count}개 (서로 값·코드가 다르게)
- 세부 주제(topicKey): ${topicKey ?? "원본과 동일 개념 유지"}
- 모드 규칙:
  · exam_similar(기출유사유형): 원본과 같은 문법 개념·코드 구조를 유지하고 변수 값·리터럴·연산만 변형.
  · exam_variant(기출변형유형): 같은 학습목표(예: 재귀·포인터)를 유지하되 코드 구조를 일부 변형(반복↔재귀, 배열 인덱싱 방식 등) 가능.

[출력 JSON 스키마]
{
  "problems": [
    {
      "content": "문제 상황 설명 (예: '다음 C 프로그램의 실행 결과를 쓰시오.'). 코드가 아래 figure로 제시됨을 전제.",
      "code": "완전한 C 코드 문자열 (개행 \\n·들여쓰기 포함, #include 포함, main 포함, 컴파일 가능).",
      "codeCaption": "코드 상단 캡션 (예: '[프로그램]') — 선택",
      "conditions": ["추가 조건·가정 (없으면 빈 배열)"],
      "question": "구하는 것 (예: '위 프로그램의 출력은?').",
      "answer": "정확한 정답 (표준출력 문자열 또는 변수 최종 값). 여러 줄 출력이면 실제 개행 반영.",
      "solution": "단계별 풀이 — 변수 추적/실행 흐름을 순서대로 설명."
    }
  ]
}
정확히 ${count}개의 problems를 생성하세요. code는 반드시 실제로 실행했을 때 answer가 나오도록 검증하세요.`;

  const raw = await generateProblemsJson({ system, user, label: "c_language" });

  const problems: GeneratedProblem[] = raw.slice(0, count).map((p, i) => {
    const code = asStr(p.code);
    const figureVariants: FigureVariant[] = [];
    if (code.trim()) {
      const diagram: CodeBlockDiagram = {
        code,
        language: "c",
        caption: asStr(p.codeCaption) || undefined,
      };
      figureVariants.push({
        id: `fig_code_${i + 1}`,
        label: asStr(p.codeCaption) || "프로그램 코드",
        role: "concept_diagram",
        diagramType: "code_block",
        diagram,
      });
    }
    return {
      id: randomUUID(),
      content: asStr(p.content),
      conditions: asStrArray(p.conditions),
      question: asStr(p.question),
      answer: asStr(p.answer),
      solution: asStr(p.solution),
      topicKey: topicKey,
      figureVariants,
    } satisfies GeneratedProblem;
  });

  return problems;
}
