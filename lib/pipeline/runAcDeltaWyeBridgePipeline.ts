import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateAcDeltaWyeBridge,
  matchesDeltaWyeAsk,
  matchesDeltaWyeSignature,
  numFmt as n2,
  yieldsDeltaWyeToSibling,
  type Complex,
} from "@/lib/generation/topologies/acDeltaWyeBridge";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcDeltaWyeBridgePipeline");

/** 복소수 R±jX 표기 (0 성분 정리, 계수 1은 생략 — "j1" 대신 "j"). */
function zTex(z: Complex): string {
  const re = Math.round(z.re * 1e6) / 1e6, im = Math.round(z.im * 1e6) / 1e6;
  const jm = (x: number) => (Math.abs(x) === 1 ? "j" : `j${n2(Math.abs(x))}`);
  if (im === 0) return `${n2(re)}`;
  if (re === 0) return `${im < 0 ? "−" : ""}${jm(im)}`;
  return `${n2(re)} ${im < 0 ? "−" : "+"} ${jm(im)}`;
}
/**
 * k√2 표기.
 * ★★ 소수 근삿값을 절대 쓰지 마라 — route의 **전역 분수 변환기**(CLAUDE.md 1-4-3)가
 *   `4.243` → `140/33` 으로 뭉갠다(실측 E2E에서 정답이 "a = 3√2 ≈ 140/33"으로 나왔다).
 *   위상이 ±45°라 답이 항상 무리수이므로 **근호 형태로만** 적는다(형제 ac_thevenin_two_box와 동일).
 */
function rootTwoTex(m: number): string {
  return m === 1 ? "√2" : `${n2(m)}√2`;
}

/**
 * 교류 브리지 + **Δ-Y 변환** → 등가 임피던스 Z_AB → 전류 크기 a (임용 2번 회로이론)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  [단계 1] 상단 델타(A·L·R)를 Y로 변환해 세 팔을 구한다.
 *  [단계 2] 두 직렬 가지의 병렬 합성 → 단자 A-B 등가 임피던스 Z.
 *  [단계 3] I = V/Z → a.
 *
 *  유사 = 원본 배치(좌상 L·가교 C·좌하 L, Z 유도성 → I=a∠−45°)
 *  변형 = 소자 종류 교환(좌상 C·가교 L·좌하 C, Z 용량성 → I=a∠+45°)
 */
export async function runAcDeltaWyeBridgePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  // ※ 유사/변형 차이(소자 종류 교환 → 위상 부호)는 generator가 만들고, 텍스트는 그 결과(a.iPhase·소자 라벨)를
  //   그대로 인용하므로 여기서 mode를 다시 분기하지 않는다.
  return generateInParallel(count, async (idx, seed) => {
    const gen = generateAcDeltaWyeBridge({ seed, mode });
    const v = gen.values, a = gen.answer;
    /** arm 라벨 ("j2[Ω]" 등) — 발문·풀이에서 소자 값을 그대로 인용한다. */
    const L = (k: keyof typeof gen.bridgeDiagram.arms) => gen.bridgeDiagram.arms[k].label ?? "";
    const phaseTxt = a.iPhase < 0 ? "−45°" : "45°";
    const kind = v.inductive ? "유도성" : "용량성";

    log.info("ac_delta_wye_bridge_generated", {
      mode, X: v.X, t: v.t, V: v.V, inductive: v.inductive,
      Zab: zTex(a.Zab), absZ: a.absZ, m: a.m, a: a.a, iPhase: a.iPhase,
    });

    const content = [
      "그림 (가)는 교류 전원이 포함된 RLC 회로이고, 그림 (나)는 Δ-Y 변환을 포함한 그림 (가)의 등가 회로이다.",
      `그림 (나)의 회로에서 단자 A-B 사이의 등가 임피던스 Z[Ω]를 구하고,`,
      `V=${n2(v.V)}∠0°[V]를 인가한 경우 I=a∠${phaseTxt}[A]가 흐를 때, a의 값을 구하시오.`,
      "(단, 커패시터와 인덕터의 초깃값은 모두 0으로 가정한다.)",
    ].join(" ");

    const conditions = [
      `(가) 단자 A(상)·B(하) 사이의 브리지: 좌상 ${L("topLeft")}, 우상 ${L("topRight")}, ` +
        `가운데 가교 ${L("bridge")}, 좌하 ${L("botLeft")}, 우하 ${L("botRight")}.`,
      `상단 델타는 단자 A와 좌·우 두 마디로 이루어진 ${L("topLeft")}·${L("topRight")}·${L("bridge")}의 Δ 결선이다.`,
      `(나)는 그 Δ를 Y로 변환한 등가 회로이며, 좌하 ${L("botLeft")}·우하 ${L("botRight")}는 그대로 남는다.`,
      `교류 전원 V=${n2(v.V)}∠0°[V]가 단자 A-B에 인가되고, 전류 I가 단자 A로 유입된다.`,
    ];

    const question = [
      `[단계 1] 그림 (가)의 상단 Δ 결선(${L("topLeft")}·${L("topRight")}·${L("bridge")})을 Y로 변환하여 세 팔의 임피던스를 구한다.`,
      `[단계 2] [단계 1]의 결과를 이용하여 단자 A-B 사이의 등가 임피던스 Z[Ω]를 구한다.`,
      `[단계 3] V=${n2(v.V)}∠0°[V]를 인가할 때 I=a∠${phaseTxt}[A]가 흐른다고 할 때, a의 값을 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] Z_A = ${zTex(a.Za)}[Ω], Z_1 = ${zTex(a.Zl)}[Ω], Z_2 = ${zTex(a.Zr)}[Ω]`,
      `[단계 2] Z = ${zTex(a.Zab)}[Ω] (= ${rootTwoTex(a.k)}∠${a.iPhase < 0 ? "" : "−"}45°[Ω])`,
      `[단계 3] a = ${rootTwoTex(a.m)}`,
    ].join("\n");

    const sumTex = `${L("topLeft")} + ${L("topRight")} + ${L("bridge")}`;
    const solution = [
      `[단계 1] Δ-Y 변환 공식: 각 Y 팔 = (그 마디에 붙은 두 Δ 변의 곱)/(Δ 세 변의 합).`,
      `  세 변의 합 = ${sumTex} = ${n2(v.X)}[Ω] — ★ 리액턴스 두 개가 크기가 같고 부호가 반대라 상쇄되어`,
      `  합이 **실수 ${n2(v.X)}[Ω]** 가 되는 것이 이 회로의 핵심이다(그래서 세 팔이 모두 깔끔하게 떨어진다).`,
      `  · Z_A (단자 A쪽 팔) = (${L("topLeft")})·(${L("topRight")})/${n2(v.X)} = **${zTex(a.Za)}[Ω]**`,
      `  · Z_1 (좌 마디쪽 팔) = (${L("topLeft")})·(${L("bridge")})/${n2(v.X)} = **${zTex(a.Zl)}[Ω]**`,
      `  · Z_2 (우 마디쪽 팔) = (${L("topRight")})·(${L("bridge")})/${n2(v.X)} = **${zTex(a.Zr)}[Ω]**`,
      `[단계 2] (나)에서 Z_1은 좌하 ${L("botLeft")}와, Z_2는 우하 ${L("botRight")}와 각각 **직렬**이고,`,
      `  그 두 가지가 **병렬**로 묶인 뒤 Z_A와 직렬이다.`,
      `  · 좌 가지 = ${zTex(a.Zl)} + (${L("botLeft")}) = ${zTex(a.b1)}[Ω]`,
      `  · 우 가지 = ${zTex(a.Zr)} + (${L("botRight")}) = ${zTex(a.b2)}[Ω]`,
      `  ★ 두 가지가 **켤레 복소수 쌍**이므로 병렬 합성이 간단해진다:`,
      `    (${zTex(a.b1)})(${zTex(a.b2)})/[(${zTex(a.b1)}) + (${zTex(a.b2)})] = ${zTex(a.Zpar)}[Ω]`,
      `  ∴ Z = Z_A + ${zTex(a.Zpar)} = **${zTex(a.Zab)}[Ω]** = ${rootTwoTex(a.k)}∠${a.iPhase < 0 ? "" : "−"}45°[Ω]`,
      `  (실수부와 허수부의 크기가 같으므로 위상이 정확히 ${a.iPhase < 0 ? "+" : "−"}45°인 ${kind} 임피던스다.)`,
      `[단계 3] I = V/Z = ${n2(v.V)}∠0° / (${rootTwoTex(a.k)}∠${a.iPhase < 0 ? "" : "−"}45°)`,
      `  = [${n2(v.V)}/(${rootTwoTex(a.k)})]∠${phaseTxt} = ${rootTwoTex(a.m)}∠${phaseTxt}[A]`,
      `  ∴ **a = ${rootTwoTex(a.m)}**`,
      `  (검산: |Z|² = ${n2(a.k)}² + ${n2(a.k)}² = ${n2(2 * a.k * a.k)} → |Z| = ${rootTwoTex(a.k)}[Ω],`,
      `   a = |V|/|Z| = ${n2(v.V)}/(${rootTwoTex(a.k)}) = ${rootTwoTex(a.m)}.)`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_dwye_${idx + 1}`,
        label: "(가) 교류 전원이 포함된 RLC 브리지 회로",
        role: "original_circuit",
        diagramType: "ac_delta_wye_bridge_circuit",
        diagram: gen.bridgeDiagram,
      },
      {
        id: `fig_dwye_eq_${idx + 1}`,
        label: "(나) Δ-Y 변환을 포함한 (가)의 등가 회로",
        role: "equivalent_circuit",
        diagramType: "ac_delta_wye_equiv_circuit",
        diagram: gen.equivDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 교류 브리지 + **Δ-Y 변환** 등가 임피던스 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-04, 사용자 신고): 전용 archetype이 없어 `ac_parallel_branches`(임용 5번,
 *   V_s+R_top+I_s+(L∥L∥R∥C))가 가로챘다 — L 2개 + C + R + "단자 a·b 없음"이라는 넓은 조건에
 *   그대로 걸린다. 그 형제는 Δ-Y도, 브리지 구조도, 등가 임피던스 요구도 재현하지 못한다.
 *
 * 판별선 = **Δ-Y(델타-와이) 변환** — 다른 어떤 형제도 쓰지 않는 고유 절차다.
 *   형제 양보: 최대(평균)전력·테브난 부하 설계(→ ac_bridge_max_power·ac_thevenin_*),
 *             3상 결선(→ 미지원, generic), 종속전원(→ ac_thevenin_dependent).
 */
export function detectAcDeltaWyeBridge(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // ★ 시그니처는 분류기와 **같은 매처**를 쓴다 (복제하면 한쪽만 고쳐져 드리프트한다).
  if (!matchesDeltaWyeSignature(text)) return false;
  if (!matchesDeltaWyeAsk(text)) return false;
  if (yieldsDeltaWyeToSibling(text)) return false;   // 최대전력·3상·종속전원 → 형제 archetype
  return true;
}
