import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSwitchedRlcDualSwitch } from "@/lib/generation/topologies/switchedRlcDualSwitch";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlcDualSwitchPipeline");

/**
 * SW₁ 닫힘 + SW₂(접점 b→c) 2전압원 RLC → 초기조건 + 2차 미분방정식 + v_c(t) (2022 전기 B-5)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  ★ 원본은 같은 회로를 **라플라스 행렬식**으로 물었지만, 사용자 지정에 따라
 *    **회로는 그대로 두고 발문만 미분방정식 형식**으로 낸다(답은 동일 — 손검산 완료).
 *  [1] i₁(0₊)·v_c(0₊)  [2] v_c에 대한 2차 미분방정식 + v_c'(0₊)  [3] v_c(t)  (변형: i₁(t))
 */
export async function runSwitchedRlcDualSwitchPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRlcDualSwitch({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("switched_rlc_dual_switch_generated", {
      mode, Vs: v.Vs, R1: v.R1, L: v.L, C: `${v.Cn}/${v.Cd}`, R2: v.R2, Vb: v.Vb,
      ode: a.odeText, roots: a.roots.join(","), target: variant ? a.i1Text : a.vcText,
    });

    const targetSym = variant ? "인덕터에 흐르는 전류 i₁(t)[A]" : "커패시터 양단 전압 v_c(t)[V]";
    const content = [
      `그림은 t=0에서 스위치 SW₁이 닫히고 스위치 SW₂가 접점 b에서 접점 c로 이동하는 RLC 회로이다.`,
      `t ≥ 0일 때 ${targetSym}를 제시된 <해석 절차>에 따라 구하여 서술하시오.`,
      `(단, t<0일 때 회로는 직류 정상 상태로 가정한다.)`,
    ].join(" ");

    const conditions = [
      `좌측: 직류 전압원 ${v.vsLabel} — SW₁(t=0에 닫힘) — 저항 ${v.r1Label} — 인덕터 ${v.lLabel}(전류 i₁(t)) — 노드 a`,
      `노드 a와 접지 사이: 커패시터 ${v.cLabel} (양단 전압 v_c(t), 위쪽이 +)`,
      `노드 a: SW₂(t=0에 접점 b→c). 접점 b = 직류 전압원 ${v.vbLabel}, 접점 c = 저항 ${v.r2Label}`,
      `t<0에서 회로는 직류 정상 상태 (SW₁ 열림, SW₂는 접점 b)`,
    ];

    const question = [
      `[단계 1] 인덕터에 흐르는 전류의 초깃값 i₁(0₊)[A]와 커패시터 전압의 초깃값 v_c(0₊)[V]를 각각 순서대로 구한다.`,
      `[단계 2] t ≥ 0일 때 KVL과 노드 a에서의 KCL을 결합하여 v_c(t)에 대한 2차 미분방정식을 세우고, v_c'(0₊)[V/s]를 구한다.`,
      variant
        ? `[단계 3] [단계 2]의 결과를 이용하여 t ≥ 0일 때 인덕터에 흐르는 전류 i₁(t)[A]를 구한다.`
        : `[단계 3] [단계 2]의 결과를 이용하여 t ≥ 0일 때 커패시터 양단 전압 v_c(t)[V]를 구한다.`,
    ].join("\n");

    const [p, r] = a.roots;
    const answer = [
      `[단계 1] i₁(0₊) = ${a.i1_0} [A], v_c(0₊) = ${a.vc_0} [V]`,
      `[단계 2] ${a.odeText},  v_c'(0₊) = ${a.dvc_0}`,
      variant ? `[단계 3] ${a.i1Text}` : `[단계 3] ${a.vcText}`,
    ].join("\n");

    const solution = [
      `[단계 1] t<0에서 SW₁이 열려 있으므로 좌측 가지에 전류가 흐르지 않는다 → i₁(0₋) = 0 [A].`,
      `  SW₂는 접점 b에 있어 커패시터가 전압원 ${v.vbLabel}에 직결되고, 직류 정상 상태에서 커패시터 전류는 0이므로 v_c(0₋) = ${a.vc_0} [V].`,
      `  인덕터 전류와 커패시터 전압은 연속이므로 i₁(0₊) = ${a.i1_0} [A], v_c(0₊) = ${a.vc_0} [V].`,
      `[단계 2] t ≥ 0에서 SW₁ 닫힘·SW₂ = 접점 c(부하 ${v.r2Label}).`,
      `  KVL(좌측 루프): ${v.Vs} = ${v.R1}·i₁ + ${v.L}·(di₁/dt) + v_c`,
      `  KCL(노드 a): i₁ = C·(dv_c/dt) + v_c/${v.R2}`,
      `  KCL을 KVL에 대입해 i₁을 소거하면 ${a.odeRawText}  →  ${a.odeText}`,
      `  또 KCL을 t=0₊에 적용하면 v_c'(0₊) = (i₁(0₊) − v_c(0₊)/${v.R2})/C = ${a.dvc_0}.`,
      `[단계 3] 특성방정식의 근이 s = −${p}, −${r} (서로 다른 실근 → 과제동)이고, 강제응답은 v_c(∞) = ${a.vInf} [V]이다.`,
      `  v_c(t) = ${a.vInf} + A·e^(−${p}t) + B·e^(−${r}t)에 초기조건 v_c(0₊) = ${a.vc_0}, v_c'(0₊) = ${a.dvc_0}를 대입해 A·B를 정하면`,
      `  ${a.vcText}`,
      ...(variant
        ? [`  구하는 값은 인덕터 전류이므로 KCL i₁ = C·(dv_c/dt) + v_c/${v.R2}에 대입하면  ${a.i1Text}`,
           `  (검산: i₁(0₊) = 0 [A], i₁(∞) = ${a.i1Inf} [A] = ${v.Vs}/(${v.R1}+${v.R2}) — 정상상태에서 인덕터 단락·커패시터 개방.)`]
        : [`  (검산: v_c(0₊) = ${a.vc_0} [V], v_c(∞) = ${a.vInf} [V] = ${v.Vs}·${v.R2}/(${v.R1}+${v.R2}) — 정상상태에서 커패시터 개방·인덕터 단락.)`]),
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_srlcds_${i + 1}`,
        label: "SW₁ 닫힘 + SW₂(b→c) RLC 회로",
        role: "original_circuit",
        diagramType: "switched_rlc_dual_switch_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * SW₁ 닫힘 + SW₂(b→c) 2전압원 RLC 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-02): 이 원본이 `switched_rlc_step`(v1 3-leg: **전류원** + R_c+L 병렬가지)으로 가서
 *   전류원이 없는 회로가 전류원 회로로 변질됐다. 구조 시그니처로 먼저 잡는다.
 *
 * 시그니처: 스위치 2개(또는 SW₁·SW₂ 표기) + RLC(L·C 모두) + **독립 전압원 2개** + 전류원 없음
 *   + (초기조건·과도·라플라스·미분방정식 중 하나). 전류원이 있으면 형제(switched_rlc_step·5leg)에 양보.
 */
export function detectSwitchedRlcDualSwitch(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const up = (x: unknown) => String(x ?? "").toUpperCase();
  const nV = inv.filter((c) => up(c.type) === "V").length;
  const nI = inv.filter((c) => up(c.type) === "I").length;
  const nL = inv.filter((c) => up(c.type) === "L").length;
  const nC = inv.filter((c) => up(c.type) === "C").length;
  const nSW = inv.filter((c) => up(c.type) === "SW").length;
  // 종속전원이 있으면 다른 유형(종속전원 archetype) 소관.
  if (inv.some((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(up(c.type)))) return false;
  // 전류원이 있으면 형제(switched_rlc_step v1·5leg)에 양보 — 이 회로는 전압원 2개뿐이다.
  if (nI > 0) return false;

  const twoSwitches = nSW >= 2 || /sw\s*_?\s*1|sw₁|스위치\s*1|두\s*개의\s*스위치/.test(text);
  const hasRlc = nL >= 1 && nC >= 1;
  const twoSources = nV >= 2;
  if (!(hasRlc && twoSources && twoSwitches)) return false;

  // 과도해석 문맥 (라플라스·미분방정식·초기조건·과도응답 중 하나)
  return /라플라스|laplace|미분\s*방정식|초기\s*조건|초깃값|과도|t\s*=\s*0/.test(text);
}
