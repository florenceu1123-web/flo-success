import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSourceTransformRatio } from "@/lib/generation/topologies/sourceTransformRatio";
import { writeSourceTransformRatioText } from "@/lib/generation/topologies/sourceTransformRatioTextWriter";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runSourceTransformRatioPipeline");

/**
 * 전원변환 + 전압비 → 미지 R 도출 (임용 7번 형식) — 전용 결정론 파이프라인.
 *   generic perturbation은 전압비 전제(R_1:R_2=a:b)를 깨뜨려 못 만든다.
 *   (가) 전류원 폼 + (나) 전압원 폼 두 figure를 함께 emit.
 */
export async function runSourceTransformRatioPipeline(args: {
  ratio: [number, number, number];
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { ratio, mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateSourceTransformRatio({ ratio, seed, mode });
    log.info("source_transform_ratio_problem", {
      ratio: gen.values.ratio.join(":"),
      R_x: gen.values.R_x, V_s: gen.values.V_s, I: gen.values.I, I_x: gen.values.I_x,
    });
    const text = writeSourceTransformRatioText({ generation: gen });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_original_${i + 1}`,
        label: "(가) 전류원 회로",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.originalNetlist,
      },
      {
        id: `fig_equivalent_${i + 1}`,
        label: "(나) 전원변환 회로",
        role: "equivalent_circuit",
        diagramType: "analog_netlist",
        diagram: gen.equivalentNetlist,
      },
    ];

    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      semantic: {
        hasStateTransition: false,
        hasEquivalentTransformation: true,
        hasWaveformEvolution: false,
        requiresMultiFigure: true,
      },
      figureVariants,
    };
  });
}

/**
 * 전원변환 + 전압비 문제 detector.
 *   조건: (전원변환/소스변환 키워드 OR hasEquivalentTransformation) + 전압비 a:b:c 추출 가능.
 *   반환: 추출된 ratio [a,b,c] 또는 null.
 *
 *   ★ universal_dc·topology_driven 앞에서 라우팅 — generic 경로는 전압비 제약을 못 다룬다.
 */
export function detectSourceTransformRatio(analysis: AnalysisResult | null | undefined): [number, number, number] | null {
  if (!analysis) return null;

  // fillInTheBlanks: 빈칸을 answer로 치환해 완전한 문장 복원 (예: "= ____:2:1" + "3" → "= 3:2:1").
  const blankTexts = (analysis.fillInTheBlanks ?? []).map((bk) => {
    const sentence = bk?.sentence ?? "";
    const ans = bk?.answer ?? "";
    return sentence.replace(/_{2,}|\(\s*\)|（\s*）|□|\[\s*\]/, ans);
  });
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    ...blankTexts,
  ].join(" \n ");

  // 전원변환 신호 (모든 Vision run에서 신뢰성 높음 — 문제의 정의적 특징)
  const hasSourceTransform =
    /전원\s*변환|소스\s*변환|source\s*transform/i.test(text) ||
    (/전류원/i.test(text) && /전압원/i.test(text)) ||
    Boolean(analysis.semantic?.hasEquivalentTransformation);
  if (!hasSourceTransform) return null;

  // ★ 전압비 "맥락"으로 트리거 (숫자 아님) — Vision 비결정성으로 숫자 비율(3:2:1)·텍스트 비율
  //   표현은 run마다 통째로 누락되지만, ★ nodeAnnotations의 V_1·V_2·V_3 라벨은 모든 run에 안정적
  //   으로 존재(실측 확인) ★. 텍스트 맥락(V_1:V_2:V_3·전압비) 또는 nodeAnnotations에 V_1·V_2·V_3가
  //   2개 이상이면 트리거 — 이래야 universal_dc 추락(정답/풀이 없음)을 원천 차단.
  //   Thevenin/Norton(단자 a·b annotation)과 구별: V_1·V_2·V_3 전압 라벨 동반.
  const vNodeLabels = new Set(
    (analysis.nodeAnnotations ?? [])
      .map((a) => (a?.label ?? "").replace(/[\s]/g, "").toUpperCase())
      .filter((l) => /^V_?[123]$/.test(l))
      .map((l) => l.replace("_", "")),
  );
  const hasVoltageRatioContext =
    /V[_\s]*1\s*:\s*V[_\s]*2\s*:\s*V[_\s]*3/i.test(text) ||
    /전압\s*비/.test(text) ||
    vNodeLabels.size >= 2;
  if (!hasVoltageRatioContext) return null;

  // 숫자 비율은 있으면 추출, 없으면 3:2:1 기본값(임용 7번 원본). 기본값 사용 시 경고.
  const ratio = extractRatio(text);
  if (!ratio) {
    log.warn("voltage_ratio_number_missing_default_321", {
      reason: "Vision이 숫자 비율(예 3:2:1) 미추출 — 전원변환+V_1:V_2:V_3 맥락으로 트리거, [3,2,1] 기본값 사용",
    });
    return [3, 2, 1];
  }
  return ratio;
}

/** 텍스트에서 a:b:c 정수 비율 추출 (V_1:V_2:V_3 인접 우선). */
function extractRatio(text: string): [number, number, number] | null {
  // 1) "V_1:V_2:V_3 = a:b:c" 형태 — = 뒤의 숫자 3중.
  const labeled = text.match(
    /V[_\s]*1\s*:\s*V[_\s]*2\s*:\s*V[_\s]*3\s*=?\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)/i,
  );
  if (labeled) return [Number(labeled[1]), Number(labeled[2]), Number(labeled[3])];
  // 2) 임의 3중 콜론 비율 (숫자:숫자:숫자)
  const generic = text.match(/(\d+)\s*:\s*(\d+)\s*:\s*(\d+)/);
  if (generic) return [Number(generic[1]), Number(generic[2]), Number(generic[3])];
  return null;
}
