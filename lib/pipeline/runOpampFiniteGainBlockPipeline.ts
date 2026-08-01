import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampFiniteGainBlock } from "@/lib/generation/topologies/opampFiniteGainBlock";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type BlockDiagram,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampFiniteGainBlockPipeline");

/**
 * 연산증폭기 유한 개방루프 이득 + 블록도 (임용 11번) — 결정론 파이프라인. GPT 없음.
 *  [1] α·β (R₁·R₂), [2] A_s=α/(1+β·A(s)), [3] DC 수치 V⁻[mV] 도출.
 */
/**
 * 임용 11번(OPAMP 유한 개방루프 이득 + 블록도) 재검출 — generate 단계 안전망.
 *
 * ★ 프론트가 analysis를 React state에 캐시하므로, 분류가 정상이어도 **이전 분석**이 넘어오면
 *   generic/다른 경로로 빠진다. 그 경로들이 내는 빈 concept_diagram 때문에 화면에
 *   "concept_diagram: nodes 비어있음" 에러가 뜬 것으로 보인다(실측 신고).
 *   이 archetype은 (가) 전용 회로 + (나) block_diagram만 내므로 concept_diagram이 나올 수 없다.
 *
 * 시그니처: OPAMP 문맥 + 유한 개방루프 이득(A(s)·A₀·ω₀·개방루프) + (블록도 OR 중첩 α·β).
 */
export function detectOpampFiniteGainBlock(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
  if (!text.trim()) return false;
  const opampCtx = /연산\s*증폭기|op\s*-?\s*amp|opamp|반전\s*입력|가상\s*단락/i.test(text);
  // ★ 완화 (2026-07-27): 블록도·α·β는 선택 신호다. Vision이 그 표현을 흘려도
  //   "OPAMP + 유한 개방루프 이득"만으로 이 유형을 특정할 수 있다(실측 신고).
  const strongFiniteGain = /개방\s*루프|open\s*loop|a\(s\)|a_?0\b|ω_?0|ω₀/i.test(text);
  const weakFiniteGain = /차단\s*주파수|직류\s*이득/i.test(text);
  const blockOrBeta = /블록도|block\s*diagram|α|β|알파|베타|중첩/i.test(text);
  // "차단 주파수"는 능동 저역통과 필터(임용 31번)와 겹치므로 필터 문맥이면 양보.
  const lowpassCtx = /저역|대역폭|필터|low\s*-?pass/i.test(text);
  // ★ 정귀환(임용 6번)에 양보 — 그쪽도 "개방 루프 이득 A(s)"를 쓰므로 완화된 조건에 걸린다.
  //   실측 회귀: 분류기가 opamp_positive_feedback으로 맞게 분류했는데 이 안전망이 덮어써
  //   임용 11번(반전+블록도) 문제가 생성됐다. 정귀환은 부귀환(11번)과 배타적이다.
  const positiveFb =
    /정귀환|정궤환|정\s*귀환|정\s*궤환|positive\s*feedback|양의\s*(귀환|궤환|피드백|되먹임)/i.test(text) ||
    /비반전\s*입력/.test(text);
  if (positiveFb) return false;
  if (!opampCtx) return false;
  if (blockOrBeta) return strongFiniteGain || weakFiniteGain;
  return strongFiniteGain && !lowpassCtx;
}

export async function runOpampFiniteGainBlockPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampFiniteGainBlock({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("opamp_finite_gain_generated", { R1: v.R1_k, R2: v.R2_k, A0: v.A0, Vin: v.Vin, Vminus_mV: a.Vminus_mV });

    const A0sci = sci(v.A0);
    const sum = v.R1_k + v.R2_k;
    const alphaStr = `${v.R2_k}/${sum} = ${trim(v.alpha)}`;
    const betaStr = `${v.R1_k}/${sum} = ${trim(v.beta)}`;

    const content = [
      "그림 (가)는 연산 증폭기 응용 회로이며 그림 (나)는 (가)의 블록도이다.",
      "제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.",
      "(단, 연산 증폭기의 개방 루프 이득은 A(s)=A₀ω₀/(s+ω₀)이며, s는 복소 주파수, A₀는 직류 이득, ω₀는 차단 주파수이다.",
      "또한, 연산 증폭기의 입력 임피던스는 무한대, 출력 임피던스는 0이라고 가정한다.)",
    ].join(" ");

    const conditions = [
      `(가) 회로: V_in ─ R₁ ─ 반전 입력 단자(V⁻) ─ R₂ ─ V_out (피드백). 비반전 입력 V⁺는 접지(GND).`,
      `(나) 블록도: V_in→α→Σ→A(s)→V_out, 그리고 V_out→β→Σ (피드백).`,
      `[단계 3] 수치 조건: R₁ = ${v.R1_k}[kΩ], R₂ = ${v.R2_k}[kΩ], A₀ = ${A0sci}, V_in = ${trim(v.Vin)}[V].`,
    ];

    const question = [
      `[단계 1] 중첩의 원리를 적용하여 반전 입력 단자의 전압을 V⁻ = α·V_in + β·V_out으로 쓸 때, R₁과 R₂로 표현되는 α와 β를 각각 구하시오.`,
      `[단계 2] A(s) = A₀ω₀/(s+ω₀)와 [단계 1]에서 구한 V⁻를 이용하여 V⁻ = A_s·V_in으로 쓸 때, α, β 및 A(s)로 표현되는 A_s를 구하시오.`,
      `[단계 3] V⁻[mV]를 구하시오. (단, 결과는 소수점 이하 둘째 자리에서 반올림하여 첫째 자리까지 쓰시오.)`,
    ].join("\n");

    const answer = [
      `[단계 1] α = R₂/(R₁+R₂) = ${alphaStr},  β = R₁/(R₁+R₂) = ${betaStr}`,
      `[단계 2] A_s = α / (1 + β·A(s))`,
      `[단계 3] V⁻ ≈ ${trim(a.Vminus_mV)} mV`,
    ].join("\n");

    const solution = [
      `[단계 1] V⁻ 노드는 R₁(→V_in)과 R₂(→V_out) 사이의 분기점이고, 연산 증폭기 입력 전류는 0(입력 임피던스 무한대)이다.`,
      `  중첩의 원리: V_out 단락 시 V⁻ = V_in·R₂/(R₁+R₂) → α = R₂/(R₁+R₂) = ${alphaStr}.`,
      `  V_in 단락 시 V⁻ = V_out·R₁/(R₁+R₂) → β = R₁/(R₁+R₂) = ${betaStr}.`,
      `[단계 2] V⁺=0이므로 V_out = A(s)·(V⁺−V⁻) = −A(s)·V⁻.`,
      `  [단계 1]에 대입: V⁻ = α·V_in + β·(−A(s)·V⁻) → V⁻·(1 + β·A(s)) = α·V_in.`,
      `  ∴ V⁻ = [α/(1 + β·A(s))]·V_in이므로 A_s = α/(1 + β·A(s)).`,
      `[단계 3] 직류(s→0)에서 A(s)→A₀ = ${A0sci}. β·A₀ = ${trim(v.beta)}×${A0sci} = ${sci(v.beta * v.A0)}.`,
      `  V⁻ = α·V_in/(1 + β·A₀) = ${trim(v.alpha)}×${trim(v.Vin)} / (1 + ${sci(v.beta * v.A0)}) ≈ ${exp(gen)} V`,
      `     = ${trim(a.Vminus_mV)} mV. (유한 이득이라 V⁻은 0이 아닌 작은 유한값.)`,
    ].join("\n");

    // (나) 블록도 — 값과 무관한 고정 구조 (V_in→α→Σ→A(s)→V_out, V_out→β→Σ).
    const blockDiagram: BlockDiagram = {
      nodes: [
        { id: "vin", kind: "input", label: "V_in", x: 40, y: 90 },
        { id: "sum", kind: "junction", label: "Σ", x: 230, y: 90 },
        { id: "vout", kind: "output", label: "V_out", x: 540, y: 90 },
      ],
      blocks: [
        { id: "alpha", label: "α", x: 135, y: 90, width: 56, height: 38 },
        { id: "As", label: "A(s)", x: 380, y: 90, width: 80, height: 46, shape: "triangle" },
        { id: "beta", label: "β", x: 380, y: 200, width: 56, height: 38 },
      ],
      edges: [
        { from: "vin", to: "alpha" },
        { from: "alpha", to: "sum", sign: "+" },
        { from: "sum", to: "As" },
        { from: "As", to: "vout" },
        { from: "vout", to: "beta", routeHint: "below" },
        { from: "beta", to: "sum", sign: "+", routeHint: "below" },
      ],
    };

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_opfg_a_${i + 1}`,
        label: "(가) 연산 증폭기 응용 회로",
        role: "original_circuit",
        diagramType: "opamp_finite_gain_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_opfg_b_${i + 1}`,
        label: "(나) (가)의 블록도",
        role: "block_diagram",
        diagramType: "block_diagram",
        diagram: blockDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/** 1.0e5 같은 과학적 표기 (정수 mantissa면 10ⁿ 표기). */
function sci(x: number): string {
  if (x === 0) return "0";
  const exp10 = Math.round(Math.log10(Math.abs(x)));
  const mant = x / Math.pow(10, exp10);
  if (Math.abs(mant - 1) < 1e-9) return `10^${exp10}`;
  if (Math.abs(mant - Math.round(mant)) < 1e-9) return `${Math.round(mant)}×10^${exp10}`;
  return `${trim(mant)}×10^${exp10}`;
}

/** V⁻ 정확값(과학표기) — 풀이 중간식 표시용. */
function exp(gen: ReturnType<typeof generateOpampFiniteGainBlock>): string {
  const v = gen.values;
  const exact = (v.alpha * v.Vin) / (1 + v.beta * v.A0);
  return sci(exact);
}

function trim(x: number): string {
  return String(Math.round(x * 1e6) / 1e6);
}
