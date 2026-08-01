import type { GenerationMode, FunctionGeneratorCircuitDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 비정현파 발진기(함수발생기) — 전용 archetype (임용 29번 형식). GPT 없음.
 *
 *  구조: (가) 슈미트 비교기(구형파) + (나) 적분기(삼각파)가 피드백 루프로 연결.
 *    (가): OPAMP U1, (−)→GND, (+)= R₂(↔(가) 출력)·R₃(↔(나) 출력) 분압. 출력 = ±V_sat(구형파).
 *    R₁: (가) → (나) 적분기 (−)입력. (나): OPAMP U2, C 피드백, (+)→GND → 삼각파.
 *
 *  닫힌형(GPT 없음):
 *    · (가) 구형파 진폭 = ±V_sat.
 *    · (나) 삼각파 진폭 V_tri = (R₃/R₂)·V_sat  [비교기 문턱 V+=0 → (나)=−(R₃/R₂)(가)].
 *    · 발진 주파수 f = R₂ / (4·R₁·R₃·C)  [적분기 기울기 V_sat/(R₁C), 반주기에 2·V_tri 이동].
 *
 *  값은 규칙 열거 + 정수/깔끔 필터(예시 목록 아님). 원본 튜플 제외.
 */

export type FunctionGeneratorGeneration = {
  values: {
    R1_k: number; R2_k: number; R3_k: number; // kΩ
    C_uF: number;                              // µF
    Vsat: number;                              // 포화 전압 (V)
  };
  answer: {
    squarePeak: number; // ±V_sat
    triPeak: number;    // (R₃/R₂)·V_sat
    freqHz: number;     // R₂/(4 R₁ R₃ C)
  };
  circuitDiagram: FunctionGeneratorCircuitDiagram;
};

type ParamSet = { R1_k: number; R2_k: number; R3_k: number; C_uF: number; Vsat: number };

/**
 * 규칙 열거 + 필터로 깔끔한 파라미터 집합 생성.
 *  삼각파 진폭 (R₃/R₂)·Vsat이 정수/반정수, 주파수 f가 정수[Hz]가 되도록 필터.
 */
function buildSpace(): ParamSet[] {
  const R1s = [10, 20, 50, 100];   // kΩ (적분기 입력)
  const R2s = [10, 20, 40];        // kΩ (분압)
  const R3s = [10, 20, 40];        // kΩ (분압·피드백)
  const Cs = [0.01, 0.02, 0.05, 0.1]; // µF
  const Vsats = [10, 12, 15];      // V
  const out: ParamSet[] = [];
  for (const R1_k of R1s) for (const R2_k of R2s) for (const R3_k of R3s) {
    // 삼각파 진폭 = (R3/R2)·Vsat — 비 R3/R2가 0.5·1·2 등 깔끔하게.
    const ratio = R3_k / R2_k;
    if (![0.5, 1, 2].includes(ratio)) continue;
    for (const C_uF of Cs) for (const Vsat of Vsats) {
      const triPeak = ratio * Vsat;
      if (!Number.isInteger(triPeak * 2)) continue; // 정수/반정수
      // f = R2/(4 R1 R3 C) [Hz] — R kΩ·C µF: (R2·1e3)/(4·R1·1e3·R3·1e3·C·1e-6)=R2/(4·R1·R3·C·1e-3)
      const f = (R2_k) / (4 * R1_k * R3_k * C_uF * 1e-3);
      if (f < 20 || f > 20000) continue;
      if (!Number.isInteger(f)) continue; // 깔끔한 정수 Hz
      out.push({ R1_k, R2_k, R3_k, C_uF, Vsat });
    }
  }
  return out;
}

function key(p: ParamSet): string {
  return `${p.R1_k}-${p.R2_k}-${p.R3_k}-${p.C_uF}-${p.Vsat}`;
}

const SPACE = buildSpace();
// 원본(임용 29번은 값 미제시 — 대표 튜플 하나를 참조·제외용으로): R1=10·R2=20·R3=10·C=0.1·Vsat=12
const ORIGINAL_KEY = "10-20-10-0.1-12";
const SIMILAR_SPACE = SPACE.filter((p) => key(p) !== ORIGINAL_KEY);
// 변형: 소자 크기 교환 효과가 드러나는 족(R₂≠R₃ → 삼각파 진폭 ≠ 구형파 진폭).
const VARIANT_SPACE = SIMILAR_SPACE.filter((p) => p.R2_k !== p.R3_k);

/**
 * 결정론 생성 — seed로 파라미터 선택, 물리 공식으로 정답 재계산.
 */
export function generateFunctionGenerator(args: {
  seed?: number;
  mode: GenerationMode;
}): FunctionGeneratorGeneration {
  const rand = makeRand(args.seed);
  const pool = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const p = pick(pool.length ? pool : SIMILAR_SPACE, rand);

  const triPeak = (p.R3_k / p.R2_k) * p.Vsat;
  const freqHz = p.R2_k / (4 * p.R1_k * p.R3_k * p.C_uF * 1e-3);

  const circuitDiagram: FunctionGeneratorCircuitDiagram = {
    r1Label: `R₁ = ${p.R1_k}kΩ`,
    r2Label: `R₂ = ${p.R2_k}kΩ`,
    r3Label: `R₃ = ${p.R3_k}kΩ`,
    cLabel: `C = ${p.C_uF}µF`,
    gaLabel: "(가)",
    naLabel: "(나)",
  };

  return {
    values: { R1_k: p.R1_k, R2_k: p.R2_k, R3_k: p.R3_k, C_uF: p.C_uF, Vsat: p.Vsat },
    answer: { squarePeak: p.Vsat, triPeak, freqHz },
    circuitDiagram,
  };
}
