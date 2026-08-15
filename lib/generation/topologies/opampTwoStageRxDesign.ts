import type { OpampTwoStageRxCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 2단 OPAMP 응용회로 — **저항 R_X 설계** + 출력 전압 (임용 2번 전자회로) 전용 archetype. GPT 없음(닫힌형).
 *
 *  (가) 고정 토폴로지:
 *    1단 U₁ — V₁ ─R_a─ (−) ─R_b(피드백)─ V_X
 *             ★비반전 입력은 **3입력**★: V₂─R_1─, V₃─R_2─, V₄─R_3─ 가 (+) 마디에 모이고 (+) ─R_X─ GND
 *    2단 U₂ — V_X ─R_d─ (+) ─R_e─ GND,   GND ─R_f─ (−) ─R_g(피드백)─ V_o,   V_o ─R_L─ GND(부하)
 *   ※ 사용자 지정(2026-08-02): 원본은 (+)에 입력이 1개였으나 **3개로 확장**한다(구조 강화).
 *
 * ★ 물리(이상 OPAMP 가상단락, 닫힌형):
 *    (+) 마디 KCL(입력 전류 0): Σ(V_i − V₊)/R_i = V₊/R_X
 *      → **V₊ = (Σ V_i/R_i) / (1/R_X + Σ 1/R_i)**,  역으로 **R_X = 1 / [ (Σ V_i/R_i)/V₊ − Σ 1/R_i ]**
 *    (−) 마디 KCL: (V₁−V₋)/R_a + (V_X−V₋)/R_b = 0,  V₋ = V₊
 *      → **V_X = V₊(1 + R_b/R_a) − V₁·R_b/R_a**
 *    2단: V₊₂ = V_X·R_e/(R_d+R_e),  **V_o = (1 + R_g/R_f)·V₊₂**  (비반전 증폭, 부하 R_L은 이상 OPAMP라 무관)
 *
 * ★ 왜 전용 archetype인가: 실측에서 generic `analog_netlist`(opamp_generic)로 떨어져 **없던 전원(V₃·V_ref)과
 *   가변저항이 생기고 두 OPAMP의 배선이 무너진** 회로가 나왔다. 형제도 재현 못 한다 —
 *   `opamp_two_stage`(V_P given → V_i·V_o, 저항 설계 아님)·`opamp_three_stage_sum`(3단·반전가산 R_f 설계)·
 *   `opamp_generic`(단일단 가산/차동). ★"다입력 비반전 분압 + R_X 설계 + 2단 비반전 증폭"★이 이 유형 고유.
 *
 * ★ 값은 예시 hardcode가 아니라 ★규칙 열거+정수 필터★.
 */

export type OpampTwoStageRxGeneration = {
  values: {
    V1: number; Ra: number; Rb: number;                  // 1단 반전측
    plusInputs: Array<{ v: number; r: number }>;         // ★1단 비반전측 3입력 (V_i, R_i)
    Rd: number; Re: number; Rf: number; Rg: number; RL: number;   // 2단
    targetVx: number; targetVo: number;
  };
  answer: {
    Rx: number;      // 도출된 R_X [kΩ]
    Vplus: number;   // 1단 (+) 전압
    Vx: number;      // V_X [V]
    Vplus2: number;  // 2단 (+) 전압
    Vo: number;      // V_o [V]
    gain2: number;   // 1 + R_g/R_f
    sumIn: number;   // Σ V_i/R_i [mA]
    sumG: number;    // Σ 1/R_i [1/kΩ]
  };
  circuitDiagram: OpampTwoStageRxCircuitDiagram;
};

type Family = {
  V1: number; Ra: number; Rb: number;
  ins: Array<{ v: number; r: number }>;
  Rd: number; Re: number; Rf: number; Rg: number; RL: number;
  Vx: number;
};

function solve(f: Family, mode: GenerationMode): OpampTwoStageRxGeneration {
  const { V1, Ra, Rb, ins, Rd, Re, Rf, Rg, RL, Vx } = f;
  const k = Rb / Ra;
  const Vplus = (Vx + V1 * k) / (1 + k);                 // V₊ = V₋
  const sumIn = ins.reduce((s, x) => s + x.v / x.r, 0);  // Σ V_i/R_i
  const sumG = ins.reduce((s, x) => s + 1 / x.r, 0);     // Σ 1/R_i
  const Rx = 1 / (sumIn / Vplus - sumG);                 // R_X [kΩ]
  const Vplus2 = (Vx * Re) / (Rd + Re);
  const gain2 = 1 + Rg / Rf;
  const Vo = gain2 * Vplus2;

  const circuitDiagram: OpampTwoStageRxCircuitDiagram = {
    v1Label: `${V1}[V]`,
    raLabel: `${Ra}[kΩ]`, rbLabel: `${Rb}[kΩ]`,
    plusInputs: ins.map((x, i) => ({ vLabel: `${x.v}[V]`, rLabel: `${x.r}[kΩ]`, name: `V_${i + 2}` })),
    rxLabel: "R_X[kΩ]",
    rdLabel: `${Rd}[kΩ]`, reLabel: `${Re}[kΩ]`, rfLabel: `${Rf}[kΩ]`, rgLabel: `${Rg}[kΩ]`,
    rlLabel: `${RL}[kΩ]`,
    vxLabel: "V_X[V]", voLabel: "V_o[V]",
    unknown: mode === "exam_variant" ? "Vo" : "Vx",
  };

  return {
    values: {
      V1, Ra, Rb, plusInputs: ins, Rd, Re, Rf, Rg, RL,
      targetVx: Vx, targetVo: Vo,
    },
    answer: { Rx: round3(Rx), Vplus, Vx, Vplus2, Vo, gain2, sumIn: round3(sumIn), sumG: round3(sumG) },
    circuitDiagram,
  };
}
function round3(x: number): number { return Math.round(x * 1000) / 1000; }

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *   · R_X가 **양의 정수 [kΩ]** (1~20) — 3입력 합성이라 조건이 빡세다
 *   · V₊·V₊₂가 0.5 배수, V_o가 정수(1~15)이고 V_X와 다름
 *   · 3입력은 서로 다른 전압을 갖는다(같은 값 3개면 단일 입력과 다름없다)
 */
function buildSpace(): Family[] {
  const out: Family[] = [];
  const half = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
  const Rset = [1, 2, 4];
  const Vset = [2, 3, 4, 6, 8, 12];
  for (const Ra of [1, 2, 4])
    for (const Rb of [1, 2, 4])
      for (const V1 of [2, 3, 4, 6])
        for (const Vx of [1, 2, 3, 4]) {
          const k = Rb / Ra;
          const Vplus = (Vx + V1 * k) / (1 + k);
          if (!(Vplus > 0) || !half(Vplus)) continue;
          for (const r1 of Rset) for (const r2 of Rset) for (const r3 of Rset)
            for (const va of Vset) for (const vb of Vset) for (const vc of Vset) {
              if (va === vb && vb === vc) continue;              // 3입력이 모두 같으면 의미 없음
              if (!(va <= vb && vb <= vc)) continue;             // 중복 조합 제거(오름차순만)
              const ins = [{ v: va, r: r1 }, { v: vb, r: r2 }, { v: vc, r: r3 }];
              const sumIn = ins.reduce((s, x) => s + x.v / x.r, 0);
              const sumG = ins.reduce((s, x) => s + 1 / x.r, 0);
              const denom = sumIn / Vplus - sumG;
              if (!(denom > 1e-9)) continue;                     // R_X > 0 (V₊가 가중평균보다 작아야)
              const Rx = 1 / denom;
              if (!Number.isInteger(Math.round(Rx * 1e6) / 1e6)) continue;
              if (Math.abs(Rx - Math.round(Rx)) > 1e-9) continue;
              if (Rx < 1 || Rx > 20) continue;
              for (const Rd of [1, 2, 4]) for (const Re of [1, 2, 4]) {
                const Vplus2 = (Vx * Re) / (Rd + Re);
                if (!half(Vplus2) || Vplus2 <= 0) continue;
                for (const Rf of [1, 2]) for (const Rg of [2, 4, 6]) {
                  const Vo = (1 + Rg / Rf) * Vplus2;
                  if (!Number.isInteger(Vo) || Vo < 1 || Vo > 15) continue;
                  if (Vo === Vx) continue;
                  if (out.length >= 4000) return out;   // 열거 상한 — 다양성엔 충분, 메모리 절약
                  out.push({ V1, Ra, Rb, ins, Rd, Re, Rf, Rg, RL: 10, Vx });
                }
              }
            }
        }
  return out;
}
const SPACE = buildSpace();

/**
 * 유사·변형 모두 **같은 회로**. 모드는 ★목표(구하는 양)★만 바꾼다:
 *   exam_similar = **V_X가 목표값**이 되는 R_X와 그때의 V_o
 *   exam_variant = **V_o가 목표값**이 되는 R_X와 그때의 V_X (2단을 거슬러 올라간다)
 * 값 풀은 절반씩 나눠 두 모드가 서로 다른 수치를 쓰게 한다.
 */
export function generateOpampTwoStageRx(args: { seed?: number; mode: GenerationMode }): OpampTwoStageRxGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const halfN = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8
    ? SPACE
    : args.mode === "exam_variant" ? SPACE.slice(halfN) : SPACE.slice(0, halfN);
  return solve(pick(pool.length ? pool : SPACE, rand), args.mode);
}

/** 스모크용 — 생성 풀 크기. */
export function __opampTwoStageRxPoolSize(): number { return SPACE.length; }

/**
 * 검증용 — 원본(단일 입력) 값을 3입력으로 확장한 참조 케이스.
 *   원본 1단: V₁=4·R_a=R_b=2k·V₂=6·R_c=4k, 목표 V_X=2 → V₊=3·R_X=4k.
 *   3입력으로 바꾸면 같은 V₊=3을 만드는 R_X가 달라진다(합성 저항이 바뀌므로) — 공식 검증용.
 */
export function __opampTwoStageRxReferenceSolve(f: {
  V1: number; Ra: number; Rb: number; ins: Array<{ v: number; r: number }>;
  Rd: number; Re: number; Rf: number; Rg: number; Vx: number;
}): OpampTwoStageRxGeneration {
  return solve({ ...f, RL: 10 }, "exam_similar");
}
