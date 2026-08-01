import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampSeriesRegulator } from "@/lib/generation/topologies/opampSeriesRegulator";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampSeriesRegulatorPipeline");

/**
 * 재검출 안전망 — stale analysis로 circuitType이 generic opamp/zener로 와도, 텍스트/인벤토리가
 * "OPAMP + 제너 + 트랜지스터 + 정전압 안정화"면 여기서 판별 → route가 circuitType 강제 보정.
 */
export function detectOpampSeriesRegulator(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const inv = analysis.componentInventory ?? [];
  const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`.toLowerCase();
  const opampCtx = inv.some((c) => String(c.type ?? "").toUpperCase() === "OPAMP") ||
    analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(text);
  const hasZener = /제너|zener|정전압|전압\s*안정|전압안정/.test(text) ||
    inv.some((c) => {
      const t = String(c.type ?? "").toUpperCase();
      return t === "ZD" || t === "DZ" || t === "ZENER" || (t === "D" && /\d/.test(String(c.value ?? "")));
    });
  const hasBjt = /트랜지스터|transistor|bjt|npn|pnp|컬렉터|이미터|베이스|이미터 팔로|emitter follow/.test(text) ||
    inv.some((c) => ["BJT", "NPN", "PNP", "Q", "TR"].includes(String(c.type ?? "").toUpperCase()));
  const regulator = /정전압|전압\s*안정|전압안정|안정화|레귤레이터|regulator|기준\s*전압|기준전압|reference/.test(text);
  return opampCtx && hasZener && hasBjt && regulator;
}

/**
 * OPAMP(오차증폭기) 기반 직렬형 전압 레귤레이터 (임용 30번 전자회로) — 결정론 파이프라인. GPT 없음.
 *  (가) 회로 + 3단계 풀이.
 *  ★ zener_bjt_regulator(임용 8번, 션트형·OPAMP 없음)와 다름 — OPAMP 가상단락으로 출력 되먹임.
 */
export async function runOpampSeriesRegulatorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey, mode } = args;
  // gpt_generated 모드는 이 결정론 경로에 도달하지 않지만 타입 안전을 위해 좁혀둠.
  const genMode: "exam_similar" | "exam_variant" = mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampSeriesRegulator({ seed, mode: genMode, index: i });
    const v = gen.values;
    const a = gen.answer;
    log.info("opamp_series_regulator_generated", {
      mode: genMode, Vdd: v.Vdd, Vz: v.Vz, Ra: v.Ra, Rb: v.Rb, RL: v.RL,
      Vo: a.Vo, If: a.If_mA, IL: a.IL_mA, IE: a.IE_mA,
    });

    const RaRb = v.Ra + v.Rb;

    if (genMode === "exam_variant") {
      // 역문제 — 목표 V_o 주고 피드백 저항 R_a를 설계(도출).
      const content = [
        `그림 (가)는 제너다이오드와 연산증폭기(OPAMP)를 이용한 직렬형 정전압 안정화 회로이다.`,
        `연산증폭기와 트랜지스터는 이상적으로 동작한다고 할 때, 출력전압 V_o가 ${a.Vo}[V]로 안정화되도록 <해석 절차>에 따라 각 단계별 풀이과정과 함께 결과를 구하시오.`,
        `(단, 제너전압 V_z=${v.Vz}[V], R_b=${v.Rb}[kΩ], 부하 R_L=${v.RL}[kΩ]로 한다.)`,
      ].join(" ");

      const conditions = [
        `공급전압 V_DD=${v.Vdd}V, 기준 제너전압 V_z=${v.Vz}V`,
        `피드백 분압 저항 R_a는 미지 (학생 도출), R_b=${v.Rb}kΩ`,
        `부하 R_L=${v.RL}kΩ, 목표 출력 V_o=${a.Vo}V`,
      ];

      const question = [
        `[단계 1] 연산증폭기 가상단락 조건으로 반전입력 단자 전압을 구한다.`,
        `[단계 2] 피드백 저항 R_a [kΩ]를 구한다.`,
        `[단계 3] 피드백 분압기 전류 I_f [mA]와 부하 전류 I_L [mA]를 구한다.`,
      ].join("\n");

      const answer = [
        `[단계 1] V_− = V_+ = V_z = ${v.Vz} V`,
        `[단계 2] R_a = ${a.Ra} kΩ`,
        `[단계 3] I_f = ${a.If_mA} mA,  I_L = ${a.IL_mA} mA`,
      ].join("\n");

      const solution = [
        `[단계 1] 이상적 OPAMP는 두 입력 전압이 같다(가상단락). 비반전(+) 입력에 제너 기준전압이 걸리므로`,
        `  ⇒ V_− = V_+ = V_z = ${v.Vz} [V].`,
        `[단계 2] 피드백 분압으로 V_− = V_o·R_b/(R_a+R_b) = V_z. R_a에 대해 풀면`,
        `  R_a = R_b·(V_o/V_z − 1) = ${v.Rb}·(${a.Vo}/${v.Vz} − 1) = ${a.Ra} [kΩ].`,
        `[단계 3] 분압기 전류 I_f = V_z/R_b = ${v.Vz}/${v.Rb} = ${a.If_mA} [mA] (= V_o/(R_a+R_b) = ${a.Vo}/${RaRb}).`,
        `  부하 전류 I_L = V_o/R_L = ${a.Vo}/${v.RL} = ${a.IL_mA} [mA].`,
      ].join("\n");

      return buildProblem(i, gen, { content, conditions, question, answer, solution }, topicKey);
    }

    // exam_similar — V_o·전류 도출 (원본 구조).
    const content = [
      `그림 (가)는 제너다이오드와 연산증폭기(OPAMP)를 이용한 직렬형 정전압 안정화 회로이다.`,
      `연산증폭기와 트랜지스터는 이상적으로 동작한다고 할 때, 회로가 안정화된 후의 상태를 <해석 절차>에 따라 각 단계별 풀이과정과 함께 결과를 구하시오.`,
      `(단, 제너전압 V_z=${v.Vz}[V]이고 모든 소자는 이상적으로 동작한다.)`,
    ].join(" ");

    const conditions = [
      `공급전압 V_DD=${v.Vdd}V, 기준 제너전압 V_z=${v.Vz}V`,
      `피드백 분압 저항 R_a=${v.Ra}kΩ, R_b=${v.Rb}kΩ`,
      `부하 R_L=${v.RL}kΩ`,
    ];

    const question = [
      `[단계 1] 출력전압 V_o [V]를 구한다.`,
      `[단계 2] 피드백 분압기 전류 I_f [mA]와 부하 전류 I_L [mA]를 구한다.`,
      `[단계 3] 트랜지스터가 공급하는 이미터 전류 I_E [mA]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_o = ${a.Vo} V`,
      `[단계 2] I_f = ${a.If_mA} mA,  I_L = ${a.IL_mA} mA`,
      `[단계 3] I_E = ${a.IE_mA} mA`,
    ].join("\n");

    const solution = [
      `[단계 1] 이상적 OPAMP 가상단락으로 반전입력(−) = 비반전입력(+) = 제너 기준전압 V_z=${v.Vz}[V].`,
      `  피드백 분압 V_− = V_o·R_b/(R_a+R_b) = V_z 이므로`,
      `  ⇒ V_o = V_z·(R_a+R_b)/R_b = ${v.Vz}·${RaRb}/${v.Rb} = ${a.Vo} [V].`,
      `[단계 2] 분압기 전류 I_f = V_z/R_b = ${v.Vz}/${v.Rb} = ${a.If_mA} [mA] (= V_o/(R_a+R_b) = ${a.Vo}/${RaRb}).`,
      `  부하 전류 I_L = V_o/R_L = ${a.Vo}/${v.RL} = ${a.IL_mA} [mA].`,
      `[단계 3] 출력 노드 KCL: 트랜지스터 이미터 전류 = 부하 전류 + 분압기 전류.`,
      `  ⇒ I_E = I_L + I_f = ${a.IL_mA} + ${a.If_mA} = ${a.IE_mA} [mA].`,
    ].join("\n");

    return buildProblem(i, gen, { content, conditions, question, answer, solution }, topicKey);
  });
}

function buildProblem(
  i: number,
  gen: ReturnType<typeof generateOpampSeriesRegulator>,
  text: { content: string; conditions: string[]; question: string; answer: string; solution: string },
  topicKey?: TopicKey,
): GeneratedProblem {
  const figureVariants: FigureVariant[] = [
    {
      id: `fig_opamp_series_reg_${i + 1}`,
      label: "(가) OPAMP 직렬형 정전압 안정화 회로",
      role: "original_circuit",
      diagramType: "opamp_series_regulator_circuit",
      diagram: gen.circuitDiagram,
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
}
