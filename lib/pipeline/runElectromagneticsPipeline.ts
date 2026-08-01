import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateInParallel } from "./_common";
import { classifyElectromagnetics, detectDielectricArrangement, detectDielectricPotentialMode, detectCoaxTwoDielectric, detectDielectricBoundary, detectCurlLineIntegral, detectSheetRingEfield, detectFluxLoopInducedCurrent, detectSheetLineEfieldSuperposition, detectPointLineChargeForce, detectSheetCurrentsVectorPotential, detectTwoPointCharges, detectCylinderConductorField, detectCoaxLineMagneticField } from "@/lib/analysis/classifyElectromagnetics";
import {
  generateElectromagnetics,
  emTopicOf,
} from "@/lib/generation/topologies/electromagnetics";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runElectromagneticsPipeline");

/**
 * 전자기학 파이프라인 — 규칙 기반 범용 공식 레지스트리 생성기 구동.
 *
 *  1. 분석 텍스트로 공식 항목(entryId) 분류 (한 번).
 *  2. count개 문제를 결정론 생성기로 병렬 생성 (수치만 변형, 정답 재계산).
 *  3. 각 인스턴스를 GeneratedProblem + em_field_diagram figure로 매핑.
 *
 *  exam_similar=수치 변형 / exam_variant=구하는 양 변경(전계→전위, 정전용량→에너지 등).
 */
export async function runElectromagneticsPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count } = args;
  // 전위 분포 하위구조(임용 24번: E 비율·경계전위 → V(z))인지 감지 — 전하·정전용량 구조와 직교.
  const dielectricStructure = detectDielectricPotentialMode(analysis) ? "potential_distribution" as const : undefined;
  // ★ 감지 안전망(순서대로 우선): 명확한 시그니처가 있으면 entryId를 강제해 classify 노이즈 무력화.
  //   (1) 유전체 경계면 전계 굴절(임용 20번) — 벡터·전계 표기로 자속 면벡터·평판에 오분류되기 쉬움.
  //   (2) 실린더형 두 유전체(임용 22번) — "두 유전체"로 평판형/단일동축에 오분류되기 쉬움.
  //   (3) 전위 분포 유전체(임용 24번) — "전위·전계"로 potential_to_charge_density에 오분류되기 쉬움.
  //   (4) 폐경로 선적분→회전(임용 11번) — "자계" 일반어로 straight_wire_B에 오분류되기 쉬움.
  //   (5) 면전하+원형 링 선전하 합성 전계(임용 12번) — Vision이 "원형 루프"·"합성 전계"를
  //       둘 다 흘리면 "면전하·무한 평면" 일반어만 남아 charged_sheet_field(단일 대전 평면)나
  //       sheet_line_efield_superposition(직선 선전하)이 가져간다(실측 신고).
  //   (6) ★ 시변 자속 유도 전류(flux_loop_induced_current) — 이미 구현돼 있던 항목인데, 나중에 추가된
  //       curl_from_line_integral의 strong 키워드(bare 폐경로·선적분·회전)가 Vision의 패러데이 서술과
  //       겹쳐 점수로 이겨 정자계 ∇×H 문제로 변질됐다(실측 dispatch 로그, 사용자 회귀 신고).
  //       **curl보다 먼저** 강제한다 — 시간 변화 + 유도 기전력/전류는 정자계 유형엔 없는 신호다.
  //   (0) ★ 동축선로 영역별 자계(임용 11번) — 실측에서 curl_field_current_density가 가져가
  //       ∇×H→J 문제로 변질됐다(사용자 신고). 동축 구조 + 자계는 이 항목 고유이고 형제
  //       동축 항목(정전용량·저항)은 감지기 안에서 양보하므로 **체인 맨 앞**에 둔다.
  const entryId = detectCoaxLineMagneticField(analysis)
    ? "coax_line_magnetic_field"
    : detectDielectricBoundary(analysis)
    ? "dielectric_boundary_field"
    : detectCoaxTwoDielectric(analysis)
      ? "coax_two_dielectric_axial"
      : dielectricStructure
        ? "dielectric_two_region_cap"
        : detectFluxLoopInducedCurrent(analysis)
          ? "flux_loop_induced_current"
          : detectCurlLineIntegral(analysis)
            ? "curl_from_line_integral"
            : detectSheetRingEfield(analysis)
              ? "sheet_ring_efield_ratio"
              //   (6.5) ★ 점전하 + 무한 선전하 → 크기 비로 k 역산 + 힘 (2023 전기 A-10).
              //        실측 신고: 아래 (7) 면전하+선전하가 가로채 "비슷하지만 전혀 다른" 문제가 나왔다.
              //        점전하와 선전하가 함께 나오는 조합은 이 유형 고유 → (7)보다 **앞**에 둔다.
              //   (6.4) ★ 두 무한 면전류 + 벡터/스칼라 자위 + 사각형 통과 자속 (임용 10번).
              //        면전류+선전류 합성 자계(sheet_line_superposition)와 낱말이 겹쳐 점수로 안 갈린다.
              : detectSheetCurrentsVectorPotential(analysis)
                ? "sheet_currents_vector_potential"
              : detectPointLineChargeForce(analysis)
                ? "point_line_charge_force"
              //   (7) ★ 면전하 + 직선 선전하 합성 전계 — strong 키워드가 "합성 전계" 하나뿐이라
              //       Vision이 "전위·전계"를 많이 쓰면 potential_to_charge_density에 점수로 밀린다
              //       (실측 dispatch 로그, 사용자 신고 "완전 다른 문제"). 구조 시그니처로 강제한다.
              : detectSheetLineEfieldSuperposition(analysis)
                ? "sheet_line_efield_superposition"
                //   (8) ★ 직각 좌표계 두 점전하 → 합성 전계·전위 — 단일 점전하(point_charge_field)와
                //       키워드가 거의 같아 점수로 갈리지 않는다(실측 오탈취) → 구조로 강제.
                : detectTwoPointCharges(analysis)
                  ? "two_point_charges_field_potential"
                  //   (9) ★ 무한 직선 원통 도체(도전율) → 외부 자계 — 형제 coax_resistance(동축 두 도체
                  //       사이 저항)와 키워드가 겹쳐 점수로 갈리지 않는다(실측 오탈취) → 구조로 강제.
                  : detectCylinderConductorField(analysis)
                    ? "cylinder_conductor_current_field"
                    : classifyElectromagnetics(analysis);
  const topicKey = emTopicOf(entryId) as TopicKey;
  // 두 유전체 커패시터의 배치(직렬 적층/병렬 나란히)를 감지해 유사유형이 원본 배치를 보존.
  const dielectricArrangement = detectDielectricArrangement(analysis) ?? undefined;
  log.info("dispatch", { entryId, topicKey, mode, count, dielectricArrangement, dielectricStructure });

  return generateInParallel(count, async (i, seed) => {
    const inst = generateElectromagnetics({ seed, mode, entryId, hints: { dielectricArrangement, dielectricStructure } });

    const content = inst.content;
    const conditions = inst.givens;
    const question = inst.question;
    const answer = inst.answer;
    const solution = inst.steps.join("\n");

    // 원본에 그림이 없는 유형(예: 유전체 경계조건)은 diagram 생략 → figure 없음.
    const figureVariants: FigureVariant[] = inst.diagram
      ? [
          {
            id: `fig_em_${i + 1}`,
            label: inst.title,
            role: "concept_diagram",
            diagramType: "em_field_diagram",
            diagram: inst.diagram,
          },
        ]
      : [];

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey: inst.topicKey as TopicKey,
      figureVariants,
    } satisfies GeneratedProblem;
  });
}
