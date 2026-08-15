import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcTheveninDependent } from "@/lib/generation/topologies/acTheveninDependent";
import { generateInParallel } from "./_common";
import { hasReactiveComponent } from "@/lib/analysis/reactiveValue";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcTheveninDependentPipeline");

/**
 * 독립 전류원 + ★종속전원★ 페이저 회로 → 테브난 등가(단락전류법) + 복소 켤레 최대평균전력
 * (임용 6번 회로이론) — 결정론 파이프라인. GPT 없음.
 *
 *  [1] 단자 A–B 개방 → 테브난 등가 전압 V_AB
 *  [2] A–B 단락 전류 I_AB → Z_AB = V_AB / I_AB   (★종속전원이 있어 전원 무효화법 불가★)
 *  [3] 켤레 정합 Z_L = Z_AB* = R + jX → P_L(max) = |V_AB|²/(4·R_AB)
 */
export async function runAcTheveninDependentPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcTheveninDependent({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("ac_thevenin_dependent_generated", {
      mode, Is: v.isrcLabel, z1: `${v.z1Type}${v.z1Mag}`, k: v.k, z2: `${v.z2Type}${v.z2Mag}`,
      Vth: a.VthLabel, Zth: a.ZthLabel, ZL: a.ZLLabel, Pmax: a.PmaxLabel,
    });

    const content = [
      "그림 (가)는 독립 전원과 종속 전원이 포함된 회로이고, (나)는 (가)의 점선 영역을 테브난 등가 회로로 변환하여 부하 Z_L을 연결한 회로이다.",
      "Z_L에 전달되는 최대 평균 전력 P_L[W]를 제시된 <해석 절차>에 따라 구하여 서술하시오.",
      "(단, 커패시터 초기 전압은 0[V]이고, 인덕터 초기 전류는 0[A]이다. 모든 소자는 이상적으로 동작하며, 전원은 실효값(RMS) 페이저이다.)",
    ].join(" ");

    const conditions = [
      `(가) 독립 전류원 ${v.isrcLabel} — 마디 1에 션트 ${v.z1Label}(${v.z1Type === "L" ? "인덕터" : "커패시터"}) 병렬.`,
      `상단 가지에 종속 전압원 ${v.k === 0.5 ? "½" : v.k} ${v.ctrlLabel}[V] (제어 전류 ${v.ctrlLabel} = ${v.z2Label} 소자에 흐르는 전류)가 직렬로 있다.`,
      `마디 2에 션트 ${v.z2Label}(${v.z2Type === "L" ? "인덕터" : "커패시터"}) 병렬, 그 위쪽 마디가 단자 A, 하단 도선이 단자 B이다.`,
      `(나) 테브난 등가(V_AB 직렬 Z_AB)에 복소 부하 Z_L = R + jX[Ω] 연결.`,
    ];

    const question = [
      `[단계 1] (가)에서 단자 A–B 사이의 테브난 등가 전압 V_AB[V]를 구한다.`,
      `[단계 2] [단계 1]의 결과와, (가)에서 단자 A와 B를 단락시켰을 때 A–B에 흐르는 전류 I_AB[A]를 이용하여 테브난 등가 임피던스 Z_AB[Ω]를 구한다.`,
      `[단계 3] (나)에서 Z_L에 전달되는 평균 전력이 최대가 되기 위한 Z_L의 값 R + jX[Ω]과, 이때 소비되는 최대 평균 전력 P_L[W]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_AB = ${a.VthLabel}`,
      `[단계 2] I_AB = ${a.IscLabel},  Z_AB = V_AB / I_AB = ${a.ZthLabel}`,
      `[단계 3] Z_L = Z_AB* = ${a.ZLLabel} (R = ${a.RL} Ω, X = ${a.XL} Ω),  P_L(max) = ${a.PmaxLabel}`,
    ].join("\n");

    const zSum = `${v.z1Label} + ${v.z2Label} + ${v.kLabel}`;
    const solution = [
      `[단계 1] 단자 A–B가 개방이므로 상단 가지에는 션트 ${v.z2Label}의 전류 ${v.ctrlLabel}가 그대로 흐른다.`,
      `  마디 2: V_AB = ${v.ctrlLabel}·Z₂,  종속 전압원: V₁ = V_AB + ${v.kLabel}·${v.ctrlLabel}.`,
      `  마디 1 KCL: I_s = V₁/Z₁ + ${v.ctrlLabel} → ${v.ctrlLabel} = I_s·Z₁/(Z₁+Z₂+k) 이므로`,
      `  V_AB = I_s·Z₁Z₂/(Z₁+Z₂+k) = ${a.IscLabel} × (${v.z1Label}·${v.z2Label})/(${zSum}) = ${a.VthLabel}.`,
      `[단계 2] ★종속 전원이 있으므로 전원을 0으로 두는 방법(무효화)을 쓸 수 없다 — 단락 전류로 구한다.`,
      `  A–B를 단락하면 V_AB = 0 → ${v.ctrlLabel} = 0 → 종속 전압원 = 0 → V₁ = 0 → Z₁에 흐르는 전류도 0.`,
      `  따라서 독립 전류원의 전류가 모두 단락 도선으로 흘러 I_AB = I_s = ${a.IscLabel}.`,
      `  Z_AB = V_AB/I_AB = ${a.ZthLabel}.`,
      `[단계 3] 최대 평균 전력 전달 조건은 부하가 테브난 임피던스의 켤레 복소수일 때이다: Z_L = Z_AB* = ${a.ZLLabel}`,
      `  (R = R_AB = ${a.RL} Ω, X = −X_AB = ${a.XL} Ω — 리액턴스 상쇄.)`,
      `  정합 시 전체 임피던스는 2R_AB(실수)이므로, 실효값 페이저에서 P_L(max) = |V_AB|²/(4·R_AB) = ${a.VthMag}²/(4·${a.Rth}) = ${a.PmaxLabel}.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_actd_${i + 1}`,
        label: "(가) 독립 전원 + 종속 전원 페이저 회로 (점선 영역 → 테브난 등가)",
        role: "original_circuit",
        diagramType: "ac_thevenin_dep_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_actd_eq_${i + 1}`,
        label: "(나) 테브난 등가 회로 + 부하 Z_L = R + jX",
        role: "equivalent_circuit",
        diagramType: "ac_thevenin_dep_equiv_circuit",
        diagram: gen.equivDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 종속전원 포함 AC 테브난 + 복소 켤레 최대전력 감지 — route 재검출 안전망(stale analysis 방어).
 *
 * ★ 실측(2026-08-02): 이 원본이 **`switched_rl_dep_i_pipeline`**(직류 스위치 RL + 종속전원 과도)로
 *   가로채여 전혀 다른 문제가 생성됐다(서버 로그 `generic_dispatch_warning`). 그 감지기는
 *   "종속전원 + L"만 보고 **교류·페이저 문맥을 확인하지 않는다**.
 *
 * 구조 시그니처(표현 무관): 종속전원 + 리액티브(L|C) + 테브난/등가 임피던스 + 최대(평균) 전력.
 *   · 형제 양보: 스위치·과도(t=0·정상상태 후 스위칭), 공진·역률·어드미턴스·대역폭·브리지.
 *   · `ac_thevenin_ladder`(종속전원 없음)·`theveninMaxPower`(2독립전원·순저항 부하)와는 종속전원 유무로 갈린다.
 */
export function detectAcTheveninDependent(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((f) => `${f?.sentence ?? ""} ${f?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const DEP_TYPES = new Set(["CCVS", "CCCS", "VCVS", "VCCS"]);
  // 종속전원 — inventory type · 값 패턴(예 "1/2 I_c"·"2i_x") · topology feature · 텍스트 어느 쪽이든.
  const hasDepInv = inv.some((c) => DEP_TYPES.has(String(c.type ?? "").toUpperCase()));
  const hasDepValue = inv.some((c) => /^[0-9./]*\s*[a-z]?\s*i_?[a-z0-9]|^[0-9./]*\s*v_?[a-z0-9]/i.test(String(c.value ?? "").trim()) &&
    /i_|v_|i₂|i_c|i_l/i.test(String(c.value ?? "")));
  const hasDepText = /종속\s*전원|종속\s*전압원|종속\s*전류원|dependent\s*source|제어\s*전류|제어\s*전압/.test(text);
  const hasDepFeature = Boolean(analysis.topologySignature?.features?.hasDependentSource);
  if (!(hasDepInv || hasDepValue || hasDepText || hasDepFeature)) return false;

  // 리액티브 — inventory 또는 텍스트(임피던스·페이저 표기).
  // ★ 타입 문자만 보지 말 것 — Vision이 `j[Ω]`를 R로 뱉는 회차가 있다(실측). 값 기준 정규화 필수.
  const hasReactive =
    hasReactiveComponent(inv) ||
    /페이저|phasor|임피던스|impedance|리액턴스|교류|∠|jx|−j|-j/.test(text);
  if (!hasReactive) return false;

  // 요구 — 테브난 등가 + 최대(평균) 전력.
  const theveninKw = /테브난|thevenin|등가\s*임피던스|등가임피던스|등가\s*전압|등가\s*회로/.test(text);
  const maxPowerKw = /최대\s*전력|최대\s*평균\s*전력|최대전력|maximum\s*power|전력\s*정합|정합/.test(text);
  if (!(theveninKw && maxPowerKw)) return false;

  // 형제 양보 — 스위치·과도, 공진·역률·어드미턴스·대역폭·브리지, 직류.
  if (/스위치|switch|t\s*=\s*0|과도|transient|시정수|시상수/.test(text)) return false;
  if (/공진|resonance|역률|어드미턴스|admittance|대역폭|bandwidth|브리지|bridge|휘트스톤/.test(text)) return false;
  return true;
}
