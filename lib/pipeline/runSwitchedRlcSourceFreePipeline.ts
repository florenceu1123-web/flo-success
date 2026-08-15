import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSwitchedRlcSourceFree } from "@/lib/generation/topologies/switchedRlcSourceFree";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlcSourceFreePipeline");

/**
 * t=0에 스위치 **개방** → 무전원 직렬 RLC 자연응답 (임용 5번 회로이론) — 결정론 파이프라인. GPT 없음.
 *
 *  [1] v(0⁻)·i(0⁻)  [2] i(t)에 대한 2차 미분방정식  [3] i(t)  (변형: v(t))
 */
export async function runSwitchedRlcSourceFreePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateSwitchedRlcSourceFree({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("switched_rlc_source_free_generated", {
      mode, Vs: v.Vs, Rs: v.Rs, Rp: v.Rp, R3: v.R3, L: v.lLabel, C: v.cLabel,
      v0: a.v0, alpha: v.alpha, target: variant ? a.vText : a.iText,
    });

    const target = variant ? "커패시터 양단 전압 v(t)[V]" : "전류 i(t)[A]";
    const content = [
      `그림은 t=0에서 스위치가 개방되는 RLC 회로이다.`,
      `t ≥ 0에서 ${target}를 제시된 <해석 절차>에 따라 구하여 서술하시오.`,
      `(단, t<0일 때 회로는 직류 정상 상태를 가정한다.)`,
    ].join(" ");

    const conditions = [
      `좌측: 직류 전압원 ${v.vsLabel} — 저항 ${v.rsLabel} — 스위치(t=0에 개방) — 마디 N`,
      `마디 N과 접지 사이: 저항 ${v.rpLabel}`,
      `마디 N에서 우측으로: 저항 ${v.r3Label} — 커패시터 ${v.cLabel}(양단 전압 v(t), 위쪽이 +) — 인덕터 ${v.lLabel}(전류 i(t), 아래 방향) — 접지 (셋은 직렬)`,
      `t<0에서 회로는 직류 정상 상태`,
    ];

    const question = [
      `[단계 1] 커패시터 전압의 초깃값 v(0⁻)[V]와 인덕터에 흐르는 전류의 초깃값 i(0⁻)[A]를 구한다.`,
      `[단계 2] t > 0일 때, 키르히호프 법칙을 이용하여 전류 i(t)에 대한 2차 미분방정식을 구한다.`,
      variant
        ? `[단계 3] [단계 2]의 결과를 이용하여 커패시터 양단 전압 v(t)[V]를 구한다.`
        : `[단계 3] [단계 2]의 결과를 이용하여 전류 i(t)[A]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] v(0⁻) = ${a.v0} [V], i(0⁻) = 0 [A]`,
      `[단계 2] ${a.odeText}`,
      variant ? `[단계 3] ${a.vText}` : `[단계 3] ${a.iText}`,
    ].join("\n");

    const solution = [
      `[단계 1] t<0에서 스위치가 닫혀 있고 직류 정상 상태이므로 커패시터는 개방, 인덕터는 단락으로 본다.`,
      `  커패시터가 개방이므로 우측 가지(${v.r3Label}–커패시터–인덕터)에는 전류가 흐르지 않는다 → i(0⁻) = 0 [A].`,
      `  전류가 0이면 ${v.r3Label}과 인덕터 양단 강하도 0이므로, 커패시터 전압은 ${v.rpLabel} 양단 전압과 같다.`,
      `  분압으로 v(0⁻) = ${v.Vs}·${v.Rp}/(${v.Rs}+${v.Rp}) = ${a.v0} [V].`,
      `  (인덕터 전류·커패시터 전압은 연속이므로 i(0⁺) = 0 [A], v(0⁺) = ${a.v0} [V].)`,
      `[단계 2] t > 0에서 스위치가 열려 전원 가지가 분리된다. 남는 것은 ${v.rpLabel}·${v.r3Label}·커패시터·인덕터가 이루는`,
      `  **무전원 직렬 RLC 루프**이고 총 저항은 R = ${v.Rp}+${v.R3} = ${a.R} [Ω]이다.`,
      `  KVL: v + L·(di/dt) + R·i = 0,  커패시터 관계식: i = C·(dv/dt)`,
      `  v를 소거하면 L·C·(d²i/dt²) + R·C·(di/dt) + i = 0  →  ${a.odeText}`,
      `  또 t=0⁺에서 L·(di/dt) = −v(0⁺) − R·i(0⁺) 이므로 i'(0⁺) = −${a.v0}/${v.lLabel.replace("[H]", "")} = ${a.ip0} [A/s].`,
      `[단계 3] α = R/(2L) = ${v.alpha}, ω₀ = 1/√(LC) = ${v.alpha} 로 **α = ω₀ (임계제동)** 이므로 특성근은 s = −${v.alpha} 중근이다.`,
      `  따라서 i(t) = (A + Bt)·e^(−${v.alpha}t) 꼴이고, i(0⁺) = 0 → A = 0, i'(0⁺) = B = ${a.ip0} 이므로`,
      `  ${a.iText}`,
      ...(variant
        ? [
            `  구하는 값은 커패시터 전압이므로 v = −L·(di/dt) − R·i 에 대입하면 ${a.vText}`,
            `  (검산: v(0) = ${a.v0} [V], t→∞에서 v→0 — 무전원 회로라 모든 에너지가 저항에서 소비된다.)`,
          ]
        : [
            `  (검산: i(0) = 0 [A], i가 음수인 것은 커패시터 방전 전류가 그림의 기준 방향과 반대임을 뜻한다.`,
            `   t→∞에서 i→0 — 무전원 회로라 모든 에너지가 저항에서 소비된다.)`,
          ]),
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_swrlcfree_${idx + 1}`,
        label: "t=0에서 스위치가 개방되는 RLC 회로",
        role: "original_circuit",
        diagramType: "switched_rlc_source_free_circuit",
        diagram: {
          vsLabel: v.vsLabel, rsLabel: v.rsLabel, rpLabel: v.rpLabel,
          r3Label: v.r3Label, cLabel: v.cLabel, lLabel: v.lLabel,
        },
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * t=0 스위치 **개방** → 무전원 직렬 RLC 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-03, 사용자 신고): 이 원본이 `switched_rlc_step`(v1: SPDT + **전류원** + R_c+L 병렬가지)로
 *   dispatch돼 **원본에 없는 전류원과 SPDT 스위치**가 있는 회로로 변질됐다.
 *
 * 판별선 = **전류원이 없다 + 전압원 1개 + 스위치 1개(개방)**.
 *   · 형제 양보: 전류원 있음(switched_rlc_step·5leg), 전압원 2개(switched_rlc_dual_switch),
 *     종속전원, 교류·페이저, 테브난·최대전력.
 */
export function detectSwitchedRlcSourceFree(analysis?: AnalysisResult | null): boolean {
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

  if (inv.some((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(up(c.type)))) return false;
  if (nI > 0) return false;                 // 전류원이 있으면 형제 소관
  if (nV >= 2) return false;                // 전압원 2개면 dual_switch 소관
  if (/페이저|phasor|∠|테브난|thevenin|최대\s*전력|공진|역률/.test(text)) return false;

  const hasRlc = (nL >= 1 && nC >= 1) || /rlc/.test(text);
  if (!hasRlc) return false;

  // 스위치가 **열리는** 구조 — "개방"·"열리"·"끊" 중 하나 + t=0 문맥.
  const opensAtZero =
    /스위치가?\s*(개방|열리|열린|끊)|개방되는|switch\s*(opens|is\s*opened)/.test(text) &&
    /t\s*=\s*0|t=0/.test(text);
  if (!opensAtZero) return false;

  // 과도해석 요구
  return /과도|transient|미분\s*방정식|자연\s*응답|초깃값|초기\s*조건|정상\s*상태/.test(text);
}
