import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateSwitchedCapShortRl,
  matchesCapShortAsk,
  matchesCapShortSignature,
  yieldsCapShortToSibling,
  type CapShortSignals,
} from "@/lib/generation/topologies/switchedCapShortRl";
import { effectiveComponentType } from "@/lib/analysis/reactiveValue";
import { isDependentComponent } from "@/lib/analysis/dependentSource";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runSwitchedCapShortRlPipeline");

/** 인벤토리 구조 신호 (리액티브는 값 기준 정규화 — `-j1`을 R로 읽는 회차 대비). */
function capShortSignals(analysis: AnalysisResult): CapShortSignals | undefined {
  const inv = analysis.componentInventory ?? [];
  if (inv.length === 0) return undefined;
  const s: CapShortSignals = { v: 0, i: 0, c: 0, l: 0, dep: 0 };
  for (const c of inv) {
    const raw = { type: String(c?.type ?? ""), value: c?.value };
    if (isDependentComponent(raw)) {
      s.dep++;
      continue;
    }
    const t = effectiveComponentType(raw);
    if (t === "V") s.v++;
    else if (t === "I") s.i++;
    else if (t === "C") s.c++;
    else if (t === "L") s.l++;
  }
  return s;
}

/**
 * **스위치가 커패시터를 단락** → 1차 RL 계단응답 (임용 7번 회로이론) 감지.
 *
 * ★ 실측 오분류(2026-08-10 사용자 신고): 전용 항목이 없어 `switched_rlc_step`(v1)이 가로챘고,
 *   원본에 **없는 전류원 2A와 SPDT 스위치**가 들어간 회로로 변질됐다(묻는 양도 i_L(t) → v_C(t)).
 *   그 회차의 Vision 요약·인벤토리는 정확했다(V:12V·R:4Ω·C:1F·L:2H) — 받아 줄 항목이 없던 것이 원인이다.
 * ★ 분류기와 **같은 매처**를 공유한다(복제 금지 — 한쪽만 고쳐져 조용히 드리프트한다).
 */
export function detectSwitchedCapShortRl(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;
  if (!matchesCapShortSignature(text, capShortSignals(analysis))) return false;
  if (!matchesCapShortAsk(text)) return false;
  if (yieldsCapShortToSibling(text)) return false;
  return true;
}

/**
 * 스위치가 커패시터를 단락시키는 RLC → 1차 RL 계단응답 (임용 7번 회로이론) — 결정론 파이프라인.
 *
 *  [단계 1] i_L(0⁻)·i_L(0⁺)  — C가 직류를 차단하므로 둘 다 0.
 *  [단계 2] KVL로 1차 미분방정식 V_s = R·i_L + L·di_L/dt 를 유도하고 해를 구한다.
 *  [단계 3] 초기값을 적용한 완전응답 i_L(t)  (변형: 인덕터 양단 전압 v_L(t)).
 */
export async function runSwitchedCapShortRlPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateSwitchedCapShortRl({ seed, index: idx, mode });
    const v = gen.values, a = gen.answer;
    const askTex = gen.asksVoltage ? "v_L(t)" : "i_L(t)";

    log.info("switched_cap_short_rl_generated", {
      mode, Vs: v.Vs, R: v.R, C: v.C, L: v.L, iInf: a.iInf, rate: a.rate, asks: askTex,
    });

    const content =
      `그림은 직류 전압원을 포함하는 RLC 회로이다. 스위치가 t=0에서 닫힐 때, t>0에서 ` +
      `${gen.asksVoltage ? `인덕터 양단의 전압 ${askTex}[V]` : `인덕터에 흐르는 전류 ${askTex}[A]`}를 ` +
      `제시된 <해석 절차>에 따라 구하고 풀이과정과 함께 쓰시오. ` +
      `(단, t<0일 때, 회로는 직류 정상상태로 가정한다.)`;

    const conditions = [
      `직류 전압원 V_s = ${v.Vs}[V], R = ${v.R}[Ω], C = ${v.C}[F], L = ${v.L}[H]이다.`,
      `스위치는 **커패시터와 병렬**로 연결되어 있고, t=0에서 닫힌다(닫히면 커패시터를 단락시킨다).`,
      `모든 소자는 이상적이며, ${gen.asksVoltage ? "인덕터 양단 전압의 (+)는 위쪽이다." : "i_L(t)의 기준 방향은 그림의 화살표와 같다."}`,
    ];

    const question = [
      `[단계 1] 인덕터에 흐르는 전류의 초기값 i_L(0⁻)[A]와 i_L(0⁺)[A]를 구한다.`,
      `[단계 2] 키르히호프의 전압법칙을 이용하여 i_L(t)[A]에 대한 미분방정식을 유도하고 해를 구한다.`,
      `[단계 3] [단계 1]에서 구한 초기값을 이용하여 완전응답 ${askTex}[${gen.asksVoltage ? "V" : "A"}]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] i_L(0⁻) = 0[A], i_L(0⁺) = 0[A]`,
      `[단계 2] ${v.Vs} = ${v.R}i_L + ${v.L}\\dfrac{di_L}{dt},  일반해 i_L(t) = ${a.iInf} + Ke^{-${a.rate}t}`,
      `[단계 3] ${askTex} = \\(${gen.asksVoltage ? a.vLTex : a.iLTex}\\) [${gen.asksVoltage ? "V" : "A"}]`,
    ].join("\n");

    const solution = [
      `[단계 1] t<0에서 스위치가 열려 있고 회로는 직류 정상상태다. **커패시터가 직류를 차단**하므로`,
      `  직렬 루프에는 전류가 흐를 수 없다 → **i_L(0⁻) = 0[A]**.`,
      `  (이때 R·L 양단 전압 강하가 없으므로 커패시터에는 전원 전압이 그대로 걸린다: v_C(0⁻) = ${a.vC0}[V].)`,
      `  인덕터 전류는 연속이므로 **i_L(0⁺) = i_L(0⁻) = 0[A]**.`,
      `[단계 2] t≥0에서 스위치가 닫혀 **커패시터가 단락**되므로 회로는 V_s·R·L 직렬만 남는다.`,
      `  KVL: ${v.Vs} = ${v.R}i_L + ${v.L}\\dfrac{di_L}{dt} → \\dfrac{di_L}{dt} + ${a.rate}i_L = ${a.iInf * a.rate}.`,
      `  시정수 τ = L/R = ${v.L}/${v.R} = ${a.tauTex}[s], 정상상태 값 I_∞ = V_s/R = ${v.Vs}/${v.R} = ${a.iInf}[A]이므로`,
      `  일반해는 i_L(t) = ${a.iInf} + Ke^{-${a.rate}t}이다.`,
      `[단계 3] i_L(0⁺) = 0을 대입하면 0 = ${a.iInf} + K → K = −${a.iInf}.`,
      `  따라서 **i_L(t) = \\(${a.iLTex}\\)[A]**.`,
      ...(gen.asksVoltage
        ? [
            `  인덕터 양단 전압은 v_L(t) = L·di_L/dt = ${v.L}·${a.iInf * a.rate}e^{-${a.rate}t}`,
            `  → **v_L(t) = \\(${a.vLTex}\\)[V]** (t=0에서 전원 전압 ${v.Vs}[V]가 그대로 인덕터에 걸리고 지수적으로 감소한다).`,
          ]
        : [
            `  검산: t=0에서 ${a.iInf}(1−1)=0 ✓, t→∞에서 ${a.iInf}[A] = V_s/R ✓.`,
          ]),
      `★ 커패시턴스 ${v.C}[F]는 답에 관여하지 않는다 — t<0에서 직류를 차단하는 역할만 하고 t≥0에는 단락된다.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_cap_short_rl_${idx + 1}`,
        label: "주어진 RLC 회로 (스위치는 커패시터와 병렬, t=0에서 닫힘)",
        role: "original_circuit",
        diagramType: "switched_cap_short_rl_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
