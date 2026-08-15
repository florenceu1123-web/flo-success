import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSwitchedRlSourceSwitch } from "@/lib/generation/topologies/switchedRlSourceSwitch";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlSourceSwitchPipeline");

const DEP_TYPES = ["CCVS", "CCCS", "VCVS", "VCCS"];

/**
 * 2전원 SPDT 스위치 RL 과도응답 (임용 3번 회로이론) 검출.
 *
 *  generic rl_step(단일 전원·초기 0)으로 흡수되면 스위치·2번째 전원을 잃으므로, 그 앞에서 가로챈다.
 *  조건: switched_rl/rl_step + L 존재 + 종속전원 없음(있으면 switched_rl_dependent/dep_i가 처리) +
 *       "전원 스위칭" 시그니처((V 소스 2개+) OR 스위치 OR "단자 A↔B" 텍스트).
 *
 *  ※ Vision 비결정성 대응: 스위치·2번째 전원을 inventory에서 흘려도(단일 RL로 변질),
 *    텍스트("스위치 S가 단자 A에서 단자 B로", "단자 A"·"단자 B")로 잡는다.
 *  ※ circuitType 게이팅은 호출부(route)에서 한다.
 */
/**
 * 두 전원이 **동시에 인가되고 중첩·테브난으로 푸는** 형식이면 이 archetype이 아니다(임용 4번).
 * 스위치 절체가 아니라 선형 중첩이 주제라 회로도·해법이 완전히 다르다.
 */
const SUPERPOSITION_YIELD_RE =
  /중첩의?\s*원리|superposition|테브난\s*등가|단위\s*계단|단위계단|u\s*\(\s*t\s*\)|합성\s*저항\s*R_?eq|정현파.*전압원|전압원.*정현파/i;

export function detectSwitchedRlDualSource(analysis: AnalysisResult | null | undefined): boolean {
  if (!analysis) return false;
  const inv = analysis.componentInventory ?? [];
  const txt = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`;

  const upper = (t: unknown) => String(t).toUpperCase();
  const hasDependent = inv.some((c) => DEP_TYPES.includes(upper(c.type)));
  if (hasDependent) return false; // 종속전원 케이스는 별도 archetype

  const hasL = inv.some((c) => upper(c.type) === "L") || /\bRL\b|인덕터|코일|\bL\s*\[?H/i.test(txt);
  if (!hasL) return false;

  const vCount = inv.filter((c) => upper(c.type) === "V").length;
  const hasSW = inv.some((c) => upper(c.type) === "SW");
  // "단자 A↔B 스위치" 또는 "스위치 S ... 이동" 텍스트
  const abSwitchText =
    (/단자\s*A/.test(txt) && /단자\s*B/.test(txt)) ||
    /스위치\s*S?[^.]*이동/.test(txt);

  // ★ bare SW는 근거가 될 수 없다 — 스위치가 있는 **모든** RL 문제를 이 archetype이 가져가
  //   전혀 다른 회로(2전원 SPDT)로 변질됐다(실측 신고: 임용 2번 i(t) 램프 문제가 여기로 샘).
  //   이 유형의 고유 신호는 **전원이 2개**이거나 **단자 A↔B로 스위치가 이동**하는 것이다.
  // ★★ 그런데 `vCount >= 2`만으로도 여전히 너무 넓었다 (사용자 신고 2026-08-12):
  //   **전압원 2개 + 인덕터**이기만 하면 잡혀서, 스위치가 **아예 없는** 임용 4번
  //   (단위계단 v₁ + 정현파 v₂를 **중첩**으로 푸는 5단계 서술형)이 통째로 이 유형으로 변질됐다
  //   (생성물: 단자 A·B SPDT + V_A 12V·V_B 4V).
  //   ⇒ 이 archetype의 고유 신호는 "두 전원을 **스위치로 절체**"하는 것이다. 전원 개수만으로는 안 된다.
  if (SUPERPOSITION_YIELD_RE.test(txt)) return false;
  return (vCount >= 2 && (hasSW || abSwitchText)) || abSwitchText;
}

/**
 * 2전원 SPDT 스위치 RL 과도응답 (임용 3번 회로이론) — 결정론 파이프라인 (GPT 없음).
 *
 *  generic rl_step(buildSimpleEnergizing)이 단일 전원·초기 0으로 변질시키는 문제를 피하기 위해,
 *  기존 RL 과도 솔버를 재사용하되 "0이 아닌 초기전류(i(0⁻)=V_A/R)"로 전원 스위칭을 재현한다.
 *  텍스트는 결정론으로 작성 — 닫힌형 해(i(0⁻)·i(∞)·τ·i(t1))를 그대로 사용.
 */
export async function runSwitchedRlSourceSwitchPipeline(args: {
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRlSourceSwitch({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("switched_rl_source_switch_generated", {
      mode, Va: v.Va, Vb: v.Vb, R: v.R, L: v.L, i0: a.i0, iinf: a.iinf, tau: a.tauSec, t1: a.t1Sec, iAtT1: a.iAtT1,
    });

    const content = [
      `그림은 t=0에서 스위치 S가 단자 A에서 단자 B로 이동하는 RL 회로이다.`,
      `t=${a.t1Sec}[s]일 때 i(t)[A]와 t=∞일 때 i(t)[A]를 구하여 순서대로 쓰시오.`,
      `(단, 모든 소자는 이상적으로 동작하고, t<0에서 회로는 정상 상태이다.)`,
    ].join(" ");

    const conditions = [
      `전원: 단자 A 쪽 ${v.Va}[V], 단자 B 쪽 ${v.Vb}[V] (스위치 S로 선택 연결).`,
      `직렬 R = ${v.R}[Ω], L = ${v.L}[H]. 측정 전류 i(t)는 R·L 가지를 흐른다.`,
      `t<0: 스위치 S는 단자 A에 접속(정상 상태). t=0에서 단자 B로 이동.`,
    ];

    const question = [
      `[단계 1] t<0 정상 상태에서 i(0⁻)를 구한다. (정상 상태에서 L은 단락)`,
      `[단계 2] t→∞ 정상 상태에서 i(∞)를 구한다.`,
      `[단계 3] 시정수 τ와 i(t)=i(∞)+[i(0⁻)−i(∞)]e^(−t/τ)로 t=${a.t1Sec}[s]에서의 i(t)를 구한다.`,
    ].join("\n");

    const answer = `i(${a.t1Sec}[s]) = \\(${a.iAtT1Exact}\\) ≈ ${a.iAtT1} [A],   i(∞) = ${a.iinf} [A]`;

    const solution = [
      `[단계 1] t<0: 스위치가 단자 A → 전원 ${v.Va}[V]가 R·L 직렬에 인가. 정상 상태에서 L은 단락 → i(0⁻) = ${v.Va}/${v.R} = ${a.i0} [A].`,
      `[단계 2] t≥0: 스위치가 단자 B → 전원 ${v.Vb}[V]가 인가. 정상 상태(t→∞)에서 L 단락 → i(∞) = ${v.Vb}/${v.R} = ${a.iinf} [A].`,
      `[단계 3] τ = L/R = ${v.L}/${v.R} = ${a.tauSec} [s]. i(t) = ${a.iinf} + (${a.i0} − ${a.iinf})e^(−t/τ). t = ${a.t1Sec}[s] = ${v.m}τ → e^(−${v.m}) → i = \\(${a.iAtT1Exact}\\) ≈ ${a.iAtT1} [A].`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_srl_dual_${i + 1}`,
        label: "주어진 RL 회로 (스위치 S: 단자 A↔B)",
        role: "original_circuit",
        diagramType: "switched_rl_dual_src_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
