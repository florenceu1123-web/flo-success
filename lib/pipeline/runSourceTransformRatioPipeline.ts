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

  // ★ 배제 가드 — 임용 7번 전원변환 전압비 문제에는 "없는" 신호가 있으면 양보한다.
  //   종속전원(VCCS/CCCS/CCVS/VCVS)·스위치(SW)·초메쉬(supermesh)/초마디(supernode)는
  //   임용 8번(종속전류원 0.2V_3 + SW + supermesh)의 정의적 특징이며 전압비 전제와 무관하다.
  //   이때 V_1·V_2·V_3는 단순 노드 라벨일 뿐 "전압비"가 아니므로, universal_dc
  //   (dc_dependent_source·switched_dc·dc_supermesh)로 흡수돼야 한다. [[feedback_universal_path]]
  const inv = analysis.componentInventory ?? [];
  const hasDependentSource = inv.some((c) =>
    ["VCCS", "CCCS", "CCVS", "VCVS"].includes(String(c?.type).toUpperCase()),
  );
  const hasSwitch =
    inv.some((c) => String(c?.type).toUpperCase() === "SW") ||
    /스위치|초\s*메쉬|초메시|초\s*마디|supermesh|supernode/i.test(text);
  if (hasDependentSource || hasSwitch) return null;

  // ★ 가변저항 양보 가드 (2026-07-29, 실측 신고) — 임용 10번(2전원 + **가변저항 R** 단계별 해석:
  //   R=10Ω일 때 V_1·V_2 → 전력 총합 → V_2가 목표값이 되도록 R 조정)이 이 감지기에 걸려
  //   전혀 다른 "전원변환 전압비" 문제로 생성됐다(로그 dispatch=source_transform_ratio_pipeline).
  //   ★ 전원변환 전압비 원본(임용 7번)에는 **가변저항이 없다** — 고정 R로 V_1:V_2:V_3 비를 만족시킨다.
  //   반면 임용 10번은 가변저항이 정의적 특징이다(IMYONG_10_DC_NODAL 전용 archetype 소관).
  const hasVariableResistor =
    /가변\s*저항|가변저항|variable\s*resistor|저항\s*r\s*(의)?\s*값을\s*조(정|절)|r을\s*조(정|절)/i.test(text) ||
    inv.some((c) => /가변|variable/i.test(String(c?.value ?? "")));
  if (hasVariableResistor) return null;

  // ★ 전원변환 신호 — **명시 근거**와 **약한 근거**를 구분한다 (2026-08-02 실측 신고).
  //   기존엔 "전류원 언급 + 전압원 언급"만으로도 전원변환으로 인정했는데, 그건
  //   **V·I 혼합 DC 회로면 전부 해당**하는 일반 서술이다. 실제로 "전압원과 전류원이 포함된
  //   저항 회로에서 I₁·I₂를 구하라"(임용 3번류)가 이 감지기에 걸려, 원본에 없는
  //   "(가)→(나) 전원변환 + 전압비 3:2:1" 문제로 통째 변질됐다(로그 dispatch=source_transform_ratio).
  const strongTransform =
    /전원\s*변환|소스\s*변환|source\s*transform|등가\s*변환/i.test(text) ||
    Boolean(analysis.semantic?.hasEquivalentTransformation);
  const weakTransform = /전류원/i.test(text) && /전압원/i.test(text);
  if (!strongTransform && !weakTransform) return null;

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
  //   ★ 전압비 근거도 강·약을 구분한다: nodeAnnotations의 V_1·V_2 라벨은 **일반 DC 회로에도 흔하다**
  //     (Vision이 마디에 자동으로 붙인다) → 그것만으로는 이 유형이라 볼 수 없다.
  const strongRatio =
    /V[_\s]*1\s*:\s*V[_\s]*2\s*:\s*V[_\s]*3/i.test(text) ||
    /전압\s*비/.test(text) ||
    extractRatio(text) !== null;
  const weakRatio = vNodeLabels.size >= 2;

  // ★★ 최후의 구조 신호 (사용자 신고 2026-08-05 "생성 실패: 문제 생성 중 오류가 발생했습니다"):
  //   Vision이 **비율 숫자(3:2:1)도, nodeAnnotations의 V_1·V_2·V_3도 둘 다 흘린** 회차가 있었다.
  //   그 회차는 strongRatio·weakRatio가 모두 false라 이 감지기가 null을 냈고 → **universal_dc**로 떨어져
  //   generic 경로가 floating source 회로를 만들어 `figure 검증 실패`로 **500 에러**가 사용자 화면에 떴다
  //   (로그: `dispatch universal_dc_pipeline` → `figure_critical_validation_failed: V_leg1_1 … closed loop 없음`).
  //   → 이 원본에 **항상 남는 구조**로 구제한다: 명시적 "전원 변환" + **독립 전류원** + **값이 기호인 미지 저항**.
  //     (원본은 (가)의 전류원을 (나)의 전압원으로 바꾸고, [단계 2]에서 미지 R₃를 구하는 형식이다.
  //      Vision은 그 저항을 `R=R3` 또는 값이 빈 `R=`로 3/3 회차 모두 남겼다.)
  //   ※ semantic 플래그(hasEquivalentTransformation)는 테브난 유형도 켜므로 **낱말 근거만** 쓴다 —
  //     그래야 형제(테브난·노턴 등가)를 뺏지 않는다.
  const explicitTransform = /전원\s*변환|소스\s*변환|source\s*transform/i.test(text);
  const hasCurrentSource =
    inv.some((c) => String(c?.type ?? "").toUpperCase() === "I") || /전류원/.test(text);
  const symbolicUnknownR = inv.some((c) => {
    if (String(c?.type ?? "").toUpperCase() !== "R") return false;
    const val = String(c?.value ?? "").trim();
    return val === "" || /^R_?\d?$/i.test(val);
  });
  const structuralRatio = explicitTransform && hasCurrentSource && symbolicUnknownR;

  // 전원변환·전압비 근거가 **모두 약하면** 이 유형이 아니다 → universal_dc로 보낸다.
  //   (전원변환이 명시돼 있으면 Vision이 비율 숫자를 흘려도 라벨 맥락·구조 신호로 인정.)
  if (!((strongTransform && (strongRatio || weakRatio || structuralRatio)) || (weakTransform && strongRatio))) {
    return null;
  }

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
