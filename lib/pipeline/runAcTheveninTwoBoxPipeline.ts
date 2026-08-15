import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcTheveninTwoBox } from "@/lib/generation/topologies/acTheveninTwoBox";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcTheveninTwoBoxPipeline");

/**
 * 점선 박스 2개(전압원망 a-b + 전류원망 c-d) 병렬(a–c·b–d 접속) → 테브난 합성 + 순저항 R_L 최대평균전력
 * (임용 10번 회로이론) — 결정론 파이프라인. GPT 없음.
 *   유사 = [1] a-b의 Z(전압원망) · [2] c-d의 V_th(전류원망)  ← 원본
 *   변형 = 구하는 대상 교환([1] c-d의 Z · [2] a-b의 V_th). 회로·절차는 동일.
 */
export async function runAcTheveninTwoBoxPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcTheveninTwoBox({ seed, mode });
    const v = gen.values, a = gen.answer;
    const variant = mode === "exam_variant";
    log.info("ac_thevenin_two_box_generated", {
      mode, Vs: v.Vs, R1: v.R1, Is: v.Is, R2: v.R2, RL: a.RL, Pmax: a.Pmax,
    });

    // 단계 1·2에서 묻는 대상 (모드에 따라 교환)
    const step1 = variant
      ? { port: "c-d", src: "전류원", z: a.z2Text, expr: `−j${v.Xc2} + (${v.R2} ∥ j${v.Xl2})` }
      : { port: "a-b", src: "전압원", z: a.z1Text, expr: `j${v.Xl1} + (${v.R1} ∥ −j${v.Xc1})` };
    const step2 = variant
      ? { port: "a-b", src: "전압원", v: a.v1Text, vc: a.V1 }
      : { port: "c-d", src: "전류원", v: a.v2Text, vc: a.V2 };

    const content =
      "그림은 2개의 교류 전원이 각각 점선으로 표시된 회로망을 이루고, 두 회로망이 단자 a–c·b–d를 " +
      "통해 병렬로 순저항 부하 R_L에 연결된 것이다. 제시된 <해석 절차>에 따라 각 단계의 풀이 과정과 함께 " +
      "결과를 서술하시오. (단, 모든 값은 페이저(실효값) 표기이다.)";

    const conditions = [
      `위쪽 점선 회로망: 교류 전압원 ${v.Vs}∠0°[V] — ${v.R1}[Ω] — 마디 m — j${v.Xl1}[Ω] — 단자 a, ` +
      `마디 m과 단자 b(접지) 사이에 −j${v.Xc1}[Ω]`,
      `아래쪽 점선 회로망: 교류 전류원 ${v.Is}∠0°[A] — 마디 n, ` +
      `마디 n과 단자 d(접지) 사이에 ${v.R2}[Ω]과 j${v.Xl2}[Ω]이 병렬, 마디 n — −j${v.Xc2}[Ω] — 단자 c`,
      `단자 a와 단자 c가, 단자 b와 단자 d가 각각 연결되어 두 회로망이 같은 단자쌍에서 병렬로 부하 R_L을 구동한다.`,
    ];

    const question = [
      `[단계 1] 단자 ${step1.port}에서 ${step1.src}을 포함한 회로망을 바라본 테브난 등가 임피던스 [Ω]를 구한다.`,
      `[단계 2] 단자 ${step2.port}에서 ${step2.src}을 포함한 회로망을 바라본 테브난 등가 전압 [V]를 페이저로 구한다.`,
      `[단계 3] 부하 R_L에 최대 평균 전력이 전달되도록 하는 R_L [Ω]과 그때의 최대 평균 전력 P_max를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] Z = ${step1.z} [Ω]`,
      `[단계 2] V_th = ${step2.v} [V] (= ${fmtRect(step2.vc)})`,
      `[단계 3] R_L = ${a.RL} [Ω],  P_max = ${a.pmaxText}`,
    ].join("\n");

    const solution = [
      `[단계 1] ${step1.src}을 무효화(전압원은 단락, 전류원은 개방)하고 단자 ${step1.port}에서 들여다본다.`,
      `  Z = ${step1.expr} = ${step1.z} [Ω].`,
      `[단계 2] 단자를 개방하면 직렬 소자에 전류가 흐르지 않으므로 그 소자의 전압 강하는 0이다.`,
      variant
        ? `  V_th = ${v.Vs}∠0° × (−j${v.Xc1})/(${v.R1} − j${v.Xc1}) = ${step2.v} [V].`
        : `  V_th = ${v.Is}∠0° × (${v.R2} ∥ j${v.Xl2}) = ${step2.v} [V].`,
      `[단계 3] 단자 a–c, b–d가 연결되어 두 회로망이 **같은 단자쌍에 병렬**로 붙으므로,`,
      `  각 회로망을 노턴 등가(I_k = V_k/Z_k)로 바꿔 합친다.`,
      `  Z_th = (${a.z1Text}) ∥ (${a.z2Text}) = ${a.zthText} [Ω],`,
      `  V_th = (V₁/Z₁ + V₂/Z₂)·Z_th = (${a.v1Text} / ${a.z1Text} + ${a.v2Text} / ${a.z2Text})·Z_th = ${a.vthText} [V].`,
      `  Z_th가 순저항이므로 순저항 부하의 최대 평균 전력 조건은 R_L = |Z_th| = ${a.RL} [Ω]이고,`,
      `  P_max = |V_th|²/(4R_th) = (${round3(mag(a.Vth))})²/(4 × ${a.RL}) = ${a.pmaxText}.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_tb_${i + 1}`,
        label: "2전원 회로망(점선) 병렬 + 부하 R_L",
        role: "original_circuit",
        diagramType: "ac_thevenin_two_box_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const mag = (z: { re: number; im: number }) => Math.hypot(z.re, z.im);
function fmtRect(z: { re: number; im: number }): string {
  const re = round3(z.re), im = round3(z.im);
  if (Math.abs(im) < 1e-9) return `${re}`;
  return `${re} ${im < 0 ? "−" : "+"} j${Math.abs(im)}`;
}

/**
 * 점선 박스 2개 직렬 테브난 감지 — 분류·route 안전망.
 *
 * ★ 형제 `theveninMaxPower`(같은 임용 10번을 단자쌍 하나로 모델링)와의 판별선 =
 *   **단자쌍이 둘(a-b와 c-d)** 이라는 구조. 실측에서 그 archetype이 이 원본을 가로채
 *   단자쌍 하나짜리 회로로 변질됐고 풀이의 Z_th 계산도 틀렸다.
 * ※ Vision이 단자 라벨을 흘리는 회차에는 이 감지기가 안 잡힌다 — 그때는 route가
 *   `params.theveninMaxPower` 시그니처(같은 원본 전용)를 이 archetype으로 흡수한다.
 */
export function detectAcTheveninTwoBox(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // 테브난·최대전력 문맥이 아니면 이 유형이 아니다.
  if (!/테브난|thevenin|등가\s*임피던스/.test(text)) return false;
  if (!/최대\s*(평균\s*)?전력|최대전력|max(imum)?\s*power/.test(text)) return false;

  // ★ 판별자: 단자쌍이 둘 — a-b와 c-d가 모두 언급된다.
  //   Vision이 "단자 a-b"·"단자 c-d"·"a와 b"·"c-d 단자" 등으로 흔들려도 잡히게 느슨히 본다.
  const ab = /a\s*[-–~]\s*b|단자\s*a\b/.test(text);
  const cd = /c\s*[-–~]\s*d|단자\s*c\b/.test(text);
  if (!ab || !cd) return false;

  // 형제 양보 — 종속전원(임용 6번)·브리지·공진은 각자 전용 archetype.
  if (/종속|dependent|vccs|ccvs/.test(text)) return false;
  if (/브리지|bridge|휘트스톤/.test(text)) return false;

  // 교류(리액티브) 문맥이어야 한다.
  const inv = (analysis.componentInventory ?? []).map((c) => String(c?.type ?? "").toUpperCase());
  const reactive = inv.includes("L") || inv.includes("C") || /리액턴스|임피던스|페이저|교류|∠|j\d/.test(text);
  return reactive;
}
