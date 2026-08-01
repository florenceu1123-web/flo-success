import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateBjtCharacteristicCurve } from "@/lib/generation/topologies/bjtCharacteristicCurve";
import { writeBjtCharacteristicCurveText } from "@/lib/generation/topologies/bjtCharacteristicCurveTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtCharacteristicCurvePipeline");

/**
 * 출력특성곡선 원본이 **〈해석 절차〉형(임용 6번)** 인지 판별 — region_naming(영역 명칭+ON/OFF)과 구분.
 *
 * ★ 실측 신고: 원본은 "채널 타입 → 포화 시작점 점선의 V_DS·V_GS·V_T 관계식 → ㉠ 용어" 3단계인데,
 *   기존 경로가 발문을 "㉠·㉡ 영역 이름과 ON/OFF"로 **하드코딩**해 단계가 통째로 사라졌다.
 *   두 형식 모두 같은 figure(출력특성곡선)를 쓰므로 **하위 구조**로 갈라 준다.
 */
export function detectPinchOffProcedure(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const mosfetCtx = /mosfet|모스펫|금속[\s-]?산화막|v_?ds|v_?gs|드레인/.test(text);
  // 이 유형 고유 신호 — 하나만 있어도 충분(Vision이 셋 중 무엇을 남길지 흔들린다)
  const procedureSig =
    /핀치오프|pinch[\s-]?off|채널\s*타입|채널의?\s*(형식|종류|상태)|문턱\s*전압|v_?t\b|v_?th\b|채널\s*형성|해석\s*절차|단계\s*[123]/.test(text);
  // 관계식·점선 궤적 신호
  const relationSig =
    /점선|일정하게\s*유지|포화\s*시작|관계식|v_?ds\s*=\s*v_?gs|v_?gs\s*-\s*v_?t|채널\s*상태|용어/.test(text);
  // 기존 형식(영역 명칭 + ON/OFF 스위칭)이 명시적이면 그쪽을 유지
  if (/스위칭\s*동작|on\s*\/\s*off|영역의?\s*(명칭|이름)/.test(text)) return false;
  return mosfetCtx && procedureSig && relationSig;
}

/**
 * BJT/MOSFET 출력특성곡선 파이프라인 — 단일 figure(diagramType="characteristic_curve").
 *
 * 결정론 데이터(영역명·ON/OFF)는 generator가 산출, textWriter가 GPT로 문장 작성하되
 * answer 필드는 솔버 강제(enforced).
 */
export async function runBjtCharacteristicCurvePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);
  // ★ 하위 구조 결정 — 〈해석 절차〉형(임용 6번)이면 결정론 3단계 경로로.
  const structure = detectPinchOffProcedure(analysis) ? "pinch_off_procedure" : "region_naming";
  log.info("characteristic_curve_structure", { structure, mode });

  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtCharacteristicCurve({ params: analysis?.circuitType?.params, mode, seed, index: i, structure });

    // ── 〈해석 절차〉 3단계 (결정론, GPT 없음) ─────────────────────────
    if (gen.structure === "pinch_off_procedure" && gen.procedureAnswers) {
      const p = gen.procedureAnswers;
      const vgs = (gen.values.vgsValues ?? []).map((v) => `${v > 0 ? "+" : ""}${v}`).join(", ");
      log.info("characteristic_curve_procedure_generated", {
        mode, channel: gen.values.channelKind, vgs, marker: p.marker,
      });

      const content =
        "그림은 MOSFET(Metal-Oxide-Semiconductor Field Effect Transistor)에서 게이트(gate)의 바이어스 " +
        "\\( V_{GS} \\)에 따른 드레인(drain) 전압 \\( V_{DS} \\)과 전류 \\( I_D \\)를 나타낸 것이다. " +
        "\\( V_{GS} \\)와 \\( V_{DS} \\) 조건에 따른 채널 형성 관계를 해석하려고 한다. 제시된 〈해석 절차〉에 따라 " +
        "각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, \\( V_T \\)는 문턱전압이고, 채널변조(channel length " +
        "modulation) 효과는 고려하지 않는다.)";

      const conditions = [
        `그림의 각 곡선은 \\( V_{GS} = ${vgs}\\,[\\mathrm{V}] \\) 조건에 해당한다.`,
        `\\( V_{DS} \\)가 일정 값 이상이면 \\( I_D \\)가 거의 일정하게 유지되며, 그 시작점들을 이은 것이 그림의 **점선**이다.`,
        `점선 위의 ${p.marker}는 그 경계에서의 채널 상태를 가리킨다.`,
      ];

      const question = [
        "[단계 1] 그림과 같은 특성을 갖는 MOSFET의 채널 타입과 그 이유를 서술한다.",
        `[단계 2] 그림에서 특정된 드레인 전압 \\( V_{DS} \\) 이상에서는 드레인 전류가 일정하게 유지되는데, ` +
          `이 지점을 각 게이트 전압 \\( V_{GS} \\) 조건에 따라 점선으로 표시하였다. ` +
          `이때 \\( V_{DS} \\)와 \\( V_{GS} \\) 그리고 \\( V_T \\)의 관계식을 구한다.`,
        `[단계 3] [단계 1]과 [단계 2]의 결과를 통해 그림의 ${p.marker}에 해당하는 채널의 상태를 표현하는 용어를 쓴다.`,
      ].join("\n");

      const answer = [
        `[단계 1] ${p.channelKr}`,
        `[단계 2] \\( ${p.relation} \\)`,
        `[단계 3] ${p.termKr}`,
      ].join("\n");

      const solution = [
        `[단계 1] ${p.channelReason}`,
        `[단계 2] 드레인 쪽 채널이 유지되려면 게이트-드레인 전압이 문턱전압보다 커야 한다. ` +
          `\\( V_{GD} = V_{GS} - V_{DS} > V_T \\)이면 채널이 이어져 있고(선형 영역), ` +
          `등호가 성립하는 \\( V_{GD} = V_T \\) 지점이 전류가 일정해지기 시작하는 경계다. ` +
          `따라서 점선의 관계식은 \\( ${p.relation} \\)이다. ` +
          `\\( V_{GS} \\)가 클수록 이 경계 \\( V_{DS} \\)도 커지므로 점선은 오른쪽 위로 향한다.`,
        `[단계 3] ${p.termReason} 따라서 ${p.marker}가 가리키는 채널의 상태는 **${p.termKr}**이다.`,
      ].join("\n");

      return {
        id: randomUUID(),
        content, conditions, question, answer, solution, topicKey,
        figureVariants: [{
          id: `fig_curve_${i + 1}`,
          label: "MOSFET 출력특성곡선 (I_D-V_DS) — 포화 시작점 점선",
          role: "main_circuit",
          diagramType: "characteristic_curve",
          diagram: gen.diagram,
        }],
      };
    }

    log.info("characteristic_curve_generated", {
      device: gen.values.device,
      curveCount: gen.values.curveCount,
      regions: gen.regionAnswers.map((r) => `${r.marker}:${r.nameKr}/${r.switchState}`),
    });

    const text = await writeBjtCharacteristicCurveText({ generation: gen, mode, topicLabel, contextHint });

    const figureLabel = gen.values.device === "bjt"
      ? "BJT 출력특성곡선 (I_C-V_CE)"
      : "MOSFET 출력특성곡선 (I_D-V_DS)";

    // role을 main_circuit으로 — 단일 figure 문제이므로 main_circuit alias 그룹으로 validator 통과.
    // (figure 자체는 회로 netlist가 아닌 특성곡선 graph지만, 이 문제의 "주 figure" 역할).
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_curve_${i + 1}`,
        label: figureLabel,
        role: "main_circuit",
        diagramType: "characteristic_curve",
        diagram: gen.diagram,
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
      figureVariants,
    };
  });
}
