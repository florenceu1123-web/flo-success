import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateActiveLowpassFilter } from "@/lib/generation/topologies/activeLowpassFilter";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runActiveLowpassFilterPipeline");

/**
 * 재검출 안전망 — stale analysis(이전 분류기 버전·프론트 state 잔존)로 circuitType이
 * generic opamp로 와도, 텍스트/인벤토리가 "OPAMP + C + 저역필터/대역폭"이면 여기서 판별.
 * route가 이걸로 circuitType을 강제 보정 → 반전증폭기 변질 차단. (분류기와 동일 시그니처.)
 */
export function detectActiveLowpassFilter(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const inv = analysis.componentInventory ?? [];
  const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`.toLowerCase();
  const opampCtx = inv.some((c) => String(c.type ?? "").toUpperCase() === "OPAMP") ||
    analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(text);
  const hasCap = inv.some((c) => String(c.type ?? "").toUpperCase() === "C") ||
    /커패시터|capacitor|콘덴서|축전기|정전용량/.test(text);
  const filterKw = /저역\s*필터|저역통과|저역\s*통과|저주파\s*통과|low[\s-]?pass|고역\s*필터|고역통과|high[\s-]?pass|대역폭|bandwidth|차단\s*주파수|차단주파수|cutoff|1차\s*필터|능동\s*필터|active\s*filter/.test(text);
  const integDiff = /적분기|미분기|integrator|differentiator/.test(text);
  return opampCtx && hasCap && filterKw && !integDiff;
}

/**
 * 1차 능동 저역통과 필터 대역폭 분석 (임용 31번 전자회로) — 결정론 파이프라인. GPT 없음.
 *  (가) 회로 + 3단계 풀이(f_c=1/(2πRC) → 변경 전/후 → 변화량).
 *  ★ generic opamp 경로는 커패시터·필터·대역폭을 잃어 단순 반전증폭기로 변질 → 전용 archetype.
 */
export async function runActiveLowpassFilterPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey, mode } = args;
  const genMode: "exam_similar" | "exam_variant" = mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateActiveLowpassFilter({ seed, mode: genMode, index: i });
    const v = gen.values;
    const a = gen.answer;
    log.info("active_lowpass_filter_generated", {
      mode: genMode, changed: v.changed, fcBefore: a.fcBefore, fcAfter: a.fcAfter,
      deltaNice: a.deltaNice, direction: a.direction,
    });

    const fmtR = (r: number) => `${r / 1000}kΩ`;
    const fmtC = (c: number) => `${c * 1e9}nF`;

    let content: string, conditions: string[], question: string, answer: string, solution: string;

    if (v.changed === "C") {
      // 원본 형식 — C 변경
      content = [
        `그림 (가)는 연산증폭기를 이용한 1차 저역통과 필터 회로이다.`,
        `커패시터 C를 ${fmtC(v.Cbefore)}에서 ${fmtC(v.Cafter)}으로 바꾸었을 때 대역폭[Hz]의 변화로 옳은 것을 <해석 절차>에 따라 각 단계별 풀이과정과 함께 구하시오.`,
        `(단, π는 3.14로 계산하고, 연산증폭기는 이상적인 조건으로 동작한다.)`,
      ].join(" ");
      conditions = [
        `입력 저항 R=${fmtR(v.R)}, 피드백 저항 R_f=${v.Rf / 1000}kΩ`,
        `커패시터 C: ${fmtC(v.Cbefore)} → ${fmtC(v.Cafter)}`,
      ];
      question = [
        `[단계 1] 1차 저역통과 필터의 대역폭(차단주파수) 공식을 쓴다.`,
        `[단계 2] C=${fmtC(v.Cbefore)}일 때와 C=${fmtC(v.Cafter)}일 때의 대역폭 f_c [Hz]를 구한다.`,
        `[단계 3] 대역폭의 변화량 Δf [Hz]를 구한다 (증가/감소).`,
      ].join("\n");
      answer = [
        `[단계 1] f_c = 1/(2πRC)`,
        `[단계 2] f_c(${fmtC(v.Cbefore)}) ≈ ${a.fcBefore} Hz,  f_c(${fmtC(v.Cafter)}) ≈ ${a.fcAfter} Hz`,
        `[단계 3] Δf ≈ ${a.delta} Hz → 약 ${a.deltaNice} Hz ${a.direction}`,
      ].join("\n");
      solution = [
        `[단계 1] 입력단 R-C 저역통과가 대역폭을 결정한다(OPAMP는 이상적 버퍼, 이득은 대역폭 불변).`,
        `  ⇒ 대역폭 = 차단주파수 f_c = 1/(2πRC).`,
        `[단계 2] R=${fmtR(v.R)}, π=3.14 대입:`,
        `  f_c(${fmtC(v.Cbefore)}) = 1/(2·3.14·${v.R}·${v.Cbefore}) ≈ ${a.fcBefore} [Hz].`,
        `  f_c(${fmtC(v.Cafter)}) = 1/(2·3.14·${v.R}·${v.Cafter}) ≈ ${a.fcAfter} [Hz].`,
        `  (C가 ${v.Cafter / v.Cbefore}배 → 대역폭은 1/${v.Cafter / v.Cbefore}배.)`,
        `[단계 3] Δf = f_c(후) − f_c(전) ≈ ${a.fcAfter} − ${a.fcBefore} = ${a.delta} [Hz].`,
        `  ⇒ 대역폭은 약 ${a.deltaNice} [Hz] ${a.direction}한다.`,
      ].join("\n");
    } else {
      // 변형 — R 변경 (C 고정)
      content = [
        `그림 (가)는 연산증폭기를 이용한 1차 저역통과 필터 회로이다.`,
        `입력 저항 R을 ${fmtR(v.Rbefore)}에서 ${fmtR(v.Rafter)}으로 바꾸었을 때 대역폭[Hz]의 변화로 옳은 것을 <해석 절차>에 따라 각 단계별 풀이과정과 함께 구하시오.`,
        `(단, π는 3.14로 계산하고, 연산증폭기는 이상적인 조건으로 동작한다.)`,
      ].join(" ");
      conditions = [
        `커패시터 C=${fmtC(v.C!)}, 피드백 저항 R_f=${v.Rf / 1000}kΩ`,
        `입력 저항 R: ${fmtR(v.Rbefore)} → ${fmtR(v.Rafter)}`,
      ];
      question = [
        `[단계 1] 1차 저역통과 필터의 대역폭(차단주파수) 공식을 쓴다.`,
        `[단계 2] R=${fmtR(v.Rbefore)}일 때와 R=${fmtR(v.Rafter)}일 때의 대역폭 f_c [Hz]를 구한다.`,
        `[단계 3] 대역폭의 변화량 Δf [Hz]를 구한다 (증가/감소).`,
      ].join("\n");
      answer = [
        `[단계 1] f_c = 1/(2πRC)`,
        `[단계 2] f_c(${fmtR(v.Rbefore)}) ≈ ${a.fcBefore} Hz,  f_c(${fmtR(v.Rafter)}) ≈ ${a.fcAfter} Hz`,
        `[단계 3] Δf ≈ ${a.delta} Hz → 약 ${a.deltaNice} Hz ${a.direction}`,
      ].join("\n");
      solution = [
        `[단계 1] 입력단 R-C 저역통과가 대역폭을 결정한다(OPAMP는 이상적 버퍼).`,
        `  ⇒ 대역폭 = 차단주파수 f_c = 1/(2πRC).`,
        `[단계 2] C=${fmtC(v.C!)}, π=3.14 대입:`,
        `  f_c(${fmtR(v.Rbefore)}) = 1/(2·3.14·${v.Rbefore}·${v.C}) ≈ ${a.fcBefore} [Hz].`,
        `  f_c(${fmtR(v.Rafter)}) = 1/(2·3.14·${v.Rafter}·${v.C}) ≈ ${a.fcAfter} [Hz].`,
        `  (R이 1/${v.Rbefore / v.Rafter}배 → 대역폭은 ${v.Rbefore / v.Rafter}배.)`,
        `[단계 3] Δf = f_c(후) − f_c(전) ≈ ${a.fcAfter} − ${a.fcBefore} = ${a.delta} [Hz].`,
        `  ⇒ 대역폭은 약 ${a.deltaNice} [Hz] ${a.direction}한다.`,
      ].join("\n");
    }

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_active_lpf_${i + 1}`,
        label: "(가) 1차 능동 저역통과 필터",
        role: "original_circuit",
        diagramType: "active_lowpass_filter_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return {
      id: randomUUID(),
      content, conditions, question, answer, solution,
      topicKey, figureVariants,
    };
  });
}
