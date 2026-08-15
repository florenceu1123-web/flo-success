import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateRlcStateEquation } from "@/lib/generation/topologies/rlcStateEquation";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runRlcStateEquationPipeline");

/** 행렬을 사람이 읽는 2×2 문자열로. */
function matTex(M: [[number, number], [number, number]]): string {
  return `[[${M[0][0]}, ${M[0][1]}], [${M[1][0]}, ${M[1][1]}]]`;
}

/**
 * 직류 전압원·전류원 RLC 회로의 **상태 방정식** (임용 6번 회로이론) — 결정론 파이프라인. GPT 없음.
 *
 *  [1] V₁을 포함하는 i에 대한 1차 미분방정식
 *  [2] I₁을 포함하는 v에 대한 1차 미분방정식
 *  [3] 두 식으로부터 행렬 A·B  (변형: A·B가 주어지고 소자 값을 역산)
 */
export async function runRlcStateEquationPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlcStateEquation({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("rlc_state_equation_generated", {
      mode, R1: v.R1, L: v.lLabel, C: v.cLabel, R2: v.R2, A: matTex(a.A), B: matTex(a.B),
    });

    const stateForm =
      `[di/dt, dv/dt]ᵀ = A·[i, v]ᵀ + B·[V₁, I₁]ᵀ`;

    const content = variant
      ? [
          `그림 (가)는 직류 전압원과 전류원을 포함하는 RLC 회로이다.`,
          `인덕터 전류 i[A]와 커패시터 양단 전압 v[V]에 대한 회로의 상태 방정식을 (나)의 형태로 표현했을 때`,
          `행렬 A와 B가 각각 A = ${matTex(a.A)}, B = ${matTex(a.B)}였다.`,
          `이때 회로의 소자 값 R₁[Ω], L[H], C[F], R₂[Ω]를 제시된 <해석 절차>에 따라 구하여 서술하시오.`,
        ].join(" ")
      : [
          `그림 (가)는 직류 전압원과 전류원을 포함하는 RLC 회로이다.`,
          `인덕터 전류 i[A]와 커패시터 양단 전압 v[V]에 대한 회로의 상태 방정식을 (나)의 형태로 표현하고자 한다.`,
          `행렬 A와 B를 제시된 <해석 절차>에 따라 구하여 서술하시오.`,
        ].join(" ");

    const conditions = variant
      ? [
          `(가) 좌측: 직류 전압원 V₁[V] — 저항 R₁[Ω] — 인덕터 L[H](전류 i, 왼쪽→오른쪽) — 마디 A`,
          `(가) 마디 A와 접지 사이: 커패시터 C[F](양단 전압 v, 위쪽이 +) ∥ 저항 R₂[Ω] ∥ 직류 전류원 I₁[A](마디 A로 유입)`,
          `(나) 상태 방정식 형태: ${stateForm}`,
          `주어진 행렬: A = ${matTex(a.A)}, B = ${matTex(a.B)}`,
        ]
      : [
          `(가) 좌측: 직류 전압원 V₁[V] — 저항 ${v.r1Label} — 인덕터 ${v.lLabel}(전류 i, 왼쪽→오른쪽) — 마디 A`,
          `(가) 마디 A와 접지 사이: 커패시터 ${v.cLabel}(양단 전압 v, 위쪽이 +) ∥ 저항 ${v.r2Label} ∥ 직류 전류원 I₁[A](마디 A로 유입)`,
          `(나) 상태 방정식 형태: ${stateForm}`,
        ];

    const question = variant
      ? [
          `[단계 1] 전압원 V₁을 포함하는 전류 i[A]에 대한 1차 미분방정식을 소자 값 R₁·L·C·R₂의 기호로 구한다.`,
          `[단계 2] 전류원 I₁을 포함하는 전압 v[V]에 대한 1차 미분방정식을 소자 값의 기호로 구한다.`,
          `[단계 3] [단계 1]과 [단계 2]의 계수를 주어진 행렬 A = ${matTex(a.A)}, B = ${matTex(a.B)}와 비교하여 R₁[Ω], L[H], C[F], R₂[Ω]를 구한다.`,
        ].join("\n")
      : [
          `[단계 1] 전압원 V₁을 포함하는 전류 i[A]에 대한 1차 미분방정식을 구한다.`,
          `[단계 2] 전류원 I₁을 포함하는 전압 v[V]에 대한 1차 미분방정식을 구한다.`,
          `[단계 3] [단계 1]과 [단계 2]에서 구한 미분방정식을 이용하여 (나)의 행렬 A와 B를 구한다.`,
        ].join("\n");

    // 기호식 (변형에서 [단계 1]·[단계 2] 정답)
    const symDi = `di/dt = (−R₁·i − v + V₁)/L`;
    const symDv = `dv/dt = (i − v/R₂ + I₁)/C`;

    const answer = variant
      ? [
          `[단계 1] ${symDi}`,
          `[단계 2] ${symDv}`,
          `[단계 3] R₁ = ${v.R1}[Ω], L = ${v.lLabel}, C = ${v.cLabel}, R₂ = ${v.R2}[Ω]`,
        ].join("\n")
      : [
          `[단계 1] ${a.diText}`,
          `[단계 2] ${a.dvText}`,
          `[단계 3] A = ${matTex(a.A)}, B = ${matTex(a.B)}`,
        ].join("\n");

    const kvl = variant
      ? `V₁ = R₁·i + L·(di/dt) + v`
      : `V₁ = ${v.R1}·i + ${v.lLabel.replace("[H]", "")}·(di/dt) + v`;
    const kcl = variant
      ? `i + I₁ = C·(dv/dt) + v/R₂`
      : `i + I₁ = ${v.cLabel.replace("[F]", "")}·(dv/dt) + v/${v.R2}`;

    const solution = [
      `[단계 1] 좌측 루프에 KVL을 적용한다. 전압원 → R₁ → L → 커패시터 양단 전압 v 순서로 돌면`,
      `  ${kvl}`,
      `  di/dt에 대해 정리하면 ${symDi}${variant ? "" : `  →  ${a.diText}`}`,
      `[단계 2] 마디 A에 KCL을 적용한다. 인덕터 전류 i와 전류원 I₁이 마디로 들어오고, 커패시터 전류와 R₂ 전류가 나간다.`,
      `  ${kcl}`,
      `  dv/dt에 대해 정리하면 ${symDv}${variant ? "" : `  →  ${a.dvText}`}`,
      variant
        ? `[단계 3] 두 식을 ${stateForm} 형태로 쓰면 A = [[−R₁/L, −1/L], [1/C, −1/(R₂C)]], B = [[1/L, 0], [0, 1/C]]이다.`
        : `[단계 3] 두 식을 ${stateForm} 형태로 정리하면 A = [[−R₁/L, −1/L], [1/C, −1/(R₂C)]], B = [[1/L, 0], [0, 1/C]]이므로`,
      variant
        ? [
            `  성분을 하나씩 대응시킨다. B₁₁ = 1/L = ${a.B[0][0]} → L = ${v.lLabel},  B₂₂ = 1/C = ${a.B[1][1]} → C = ${v.cLabel}.`,
            `  A₁₁ = −R₁/L = ${a.A[0][0]} → R₁ = ${Math.abs(a.A[0][0])}/${a.B[0][0]} = ${v.R1}[Ω].`,
            `  A₂₂ = −1/(R₂C) = ${a.A[1][1]} → R₂ = 1/(${Math.abs(a.A[1][1])}·C) = ${v.R2}[Ω].`,
            `  (검산: A₁₂ = −1/L = ${a.A[0][1]}, A₂₁ = 1/C = ${a.A[1][0]} — 모두 일치.)`,
          ].join("\n")
        : [
            `  −R₁/L = −${v.R1}/(${v.lLabel.replace("[H]", "")}) = ${a.A[0][0]},  −1/L = ${a.A[0][1]},`,
            `  1/C = ${a.A[1][0]},  −1/(R₂C) = ${a.A[1][1]},  1/L = ${a.B[0][0]},  1/C = ${a.B[1][1]}`,
            `  ∴ A = ${matTex(a.A)},  B = ${matTex(a.B)}`,
            `  (검산: 상태 방정식을 수치 적분한 결과가 원회로를 직접 적분한 결과와 일치한다.)`,
          ].join("\n"),
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_rlcstate_${i + 1}`,
        label: "(가) 직류 전압원·전류원 RLC 회로",
        role: "original_circuit",
        diagramType: "rlc_state_equation_circuit",
        diagram: {
          r1Label: variant ? "R₁[Ω]" : v.r1Label,
          lLabel: variant ? "L[H]" : v.lLabel,
          cLabel: variant ? "C[F]" : v.cLabel,
          r2Label: variant ? "R₂[Ω]" : v.r2Label,
          vLabel: "V₁[V]",
          iLabel: "I₁[A]",
        },
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 상태 방정식(state equation) RLC 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-03): 이 원본이 `ac_superposition`(교류 중첩)으로 dispatch돼 전혀 다른
 *   "교류 전압원+전류원 중첩" 문제가 생성됐다(사용자 신고). Vision 요약은 정확했고
 *   (topic="RLC 회로의 상태 방정식", topicKey=rlc_response) 인벤토리도 맞았는데,
 *   분류기가 **V=1·I=1·L=1·C=1** 만 보고 AC 중첩으로 넘긴 것 — 요구(상태 방정식)를 안 봤다.
 *
 * 시그니처: **상태 방정식/상태 변수/행렬 A·B** + RLC(L·C) + 스위치·과도응답 아님.
 *   · 형제 양보: 교류·페이저(정상상태 해석), 테브난·최대전력, 공진·역률, 스위치 과도.
 */
export function detectRlcStateEquation(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // 이 유형 고유 요구 — 상태 방정식/상태 변수/상태 공간, 또는 행렬 A·B 표현.
  const stateSig =
    /상태\s*방정식|상태방정식|state\s*equation|상태\s*변수|상태\s*공간|state[- ]?space/.test(text) ||
    /행렬\s*a와\s*b|행렬\s*a\s*,?\s*b|행렬\s*a·b/.test(text);
  if (!stateSig) return false;

  // 형제 양보 — 페이저 정상상태·테브난·공진·역률은 상태방정식 유형이 아니다.
  if (/페이저|phasor|∠|테브난|thevenin|최대\s*전력|공진|resonance|역률|어드미턴스/.test(text)) return false;
  // 스위치 과도(초기조건·t=0)는 형제 switched_rlc_* 소관.
  if (/스위치|switch|t\s*=\s*0|초기\s*조건|초깃값/.test(text)) return false;

  const inv = analysis.componentInventory ?? [];
  const up = (x: unknown) => String(x ?? "").toUpperCase();
  const nL = inv.filter((c) => up(c.type) === "L").length;
  const nC = inv.filter((c) => up(c.type) === "C").length;
  // 인벤토리가 흔들리는 회차 대비 — 텍스트에 RLC/인덕터·커패시터가 있으면 인정.
  const hasRlc = (nL >= 1 && nC >= 1) || /rlc|인덕터.*커패시터|커패시터.*인덕터/.test(text);
  return hasRlc;
}
