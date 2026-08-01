import type { GenerationMode, SwitchedRlDualSrcCircuitDiagram } from "@/types";
import type { SolverNetwork } from "@/lib/solver/mna";
import { solveRlTransient } from "@/lib/solver/rlTransient";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * 2전원 SPDT 스위치 RL 과도응답 generator (임용 3번 회로이론).
 *
 *  구조 (원본 충실): 단자 A 쪽 전원 V_A · 단자 B 쪽 전원 V_B 가 SPDT 스위치 S로 선택되어
 *  직렬 R + L 가지를 구동. t<0 스위치는 단자 A(정상상태), t=0에 단자 B로 이동.
 *
 *  ★ 새 archetype이 아니라 기존 rl_step 솔버(solveRlTransient)를 그대로 재사용 — 1차 RL 과도에
 *    "0이 아닌 초기전류"만 주면 전원 스위칭이 표현된다. generic rl_step(buildSimpleEnergizing)은
 *    단일 전원·초기 0만 만들어 스위치·2번째 전원을 잃으므로(단일 RL로 변질), 이 경로로 분기한다.
 *
 *  닫힌형: i(0⁻)=V_A/R, i(∞)=V_B/R, τ=L/R, i(t)=i(∞)+[i(0⁻)−i(∞)]e^(−t/τ).
 *  단위: R[Ω], L[H] → τ[s] (원본 τ=L/R=1/2=0.5s).
 */

export type SwitchedRlSourceSwitchGen = {
  values: { Va: number; Vb: number; R: number; L: number; m: number };
  answer: {
    i0: number;          // i(0⁻) = V_A/R
    iinf: number;        // i(∞)  = V_B/R
    tauSec: number;      // τ = L/R
    t1Sec: number;       // 질문 시각 = m·τ
    iAtT1: number;       // i(t1) 수치
    iAtT1Exact: string;  // i(t1) 기호형 (LaTeX): "1 + e^{-1}" 등
  };
  circuitDiagram: SwitchedRlDualSrcCircuitDiagram;
};

const R_VALUES = [1, 2, 4, 5];
const TAUS = [0.25, 0.5, 1, 2];   // τ = L/R [s]
const M_VALUES = [1, 2];          // 질문 시각 = m·τ
const CURRENTS = [1, 2, 3, 4];    // i(0⁻)·i(∞) [A] — R로 나누어 떨어지게 V를 구성

type Tuple = { Va: number; Vb: number; R: number; L: number; tau: number; m: number; i0: number; iinf: number };

/**
 * 규칙 기반 값 열거 + 필터 (특정 예시 hardcode 금지).
 *  - 유사(exam_similar): 전류 감소(원본 4→2처럼 i0>iinf).
 *  - 변형(exam_variant): 전류 증가(스위치가 더 큰 전원 선택, i0<iinf) — 구조 동일·시나리오 반전.
 *  - 원본 튜플(V_A=4·V_B=2·R=2·L=1)은 생성 풀에서 제외(참조 전용).
 */
function buildPool(mode: GenerationMode): Tuple[] {
  const out: Tuple[] = [];
  for (const R of R_VALUES) {
    for (const i0 of CURRENTS) {
      for (const iinf of CURRENTS) {
        if (i0 === iinf) continue;
        const directionOk = mode === "exam_variant" ? i0 < iinf : i0 > iinf;
        if (!directionOk) continue;
        for (const tau of TAUS) {
          for (const m of M_VALUES) {
            const Va = i0 * R, Vb = iinf * R, L = round3(tau * R);
            if (Va > 30 || Vb > 30) continue;
            // 원본 제외
            if (Va === 4 && Vb === 2 && R === 2 && Math.abs(L - 1) < 1e-9) continue;
            out.push({ Va, Vb, R, L, tau, m, i0, iinf });
          }
        }
      }
    }
  }
  return out;
}

/** i(t1) = iinf + (i0−iinf)e^(−m) 의 기호형 (LaTeX). m은 정수. */
function fmtExact(iinf: number, i0: number, m: number): string {
  const d = round3(i0 - iinf);
  if (d === 0) return `${iinf}`;
  const expo = `e^{-${m}}`;
  const sign = d > 0 ? "+" : "-";
  const mag = Math.abs(d);
  const coeff = mag === 1 ? "" : `${mag}`;
  return `${iinf} ${sign} ${coeff}${expo}`;
}

export function generateSwitchedRlSourceSwitch(args: {
  seed?: number;
  mode: GenerationMode;
}): SwitchedRlSourceSwitchGen {
  const rand = makeRand(args.seed);
  const pool = buildPool(args.mode);
  const t = pick(pool, rand);

  // ── 솔버 재사용 ── t≥0 활성 전원 = V_B(직렬 R). 초기전류 i(0⁻)=V_A/R 를 initialIl로.
  //   netWithoutL: top ─R─ a, V_B(top↔GND). L 자리는 a↔GND.
  //   solveRlTransient → I_∞ = V_B/R, R_th = R, τ = L/R.
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [{ id: "R1", a: "top", b: "a", R: t.R }],
    vsources: [{ id: "VB", a: "top", b: "GND", V: t.Vb }],
    isources: [],
  };
  const rl = solveRlTransient({
    netWithoutL: solverNet,
    lPositiveNode: "a",
    lNegativeNode: "GND",
    inductanceH: t.L,
    initialIl: t.Va / t.R,
  });

  const i0 = round3(t.Va / t.R);
  const iinf = round3(rl.Iinf);
  const t1Sec = round3(t.m * rl.tauSec);
  const iAtT1 = round3(rl.Il(t1Sec));

  return {
    values: { Va: t.Va, Vb: t.Vb, R: t.R, L: t.L, m: t.m },
    answer: {
      i0,
      iinf,
      tauSec: round3(rl.tauSec),
      t1Sec,
      iAtT1,
      iAtT1Exact: fmtExact(iinf, i0, t.m),
    },
    circuitDiagram: {
      vaLabel: `${t.Va}[V]`,
      vbLabel: `${t.Vb}[V]`,
      rLabel: `${t.R}[Ω]`,
      lLabel: `${t.L}[H]`,
      currentLabel: "i(t)",
    },
  };
}
