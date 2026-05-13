import { solveThevenin } from "./thevenin";
import type { SolverNetwork } from "./mna";

/**
 * 1차 RL 과도응답 솔버 (single inductor, 단일 시정수).
 *
 *  접근 (RC dual):
 *   1) L을 제거한 R-only 네트워크에서 L 양 단자 a, b 사이의 Thevenin 등가 추출
 *      → V_th = L 양단의 정상상태 KVL 기준 — 단, L의 정상상태는 short circuit
 *        실제 사용: τ는 Norton 등가에서 I_∞ = I_n, R_th 만으로 결정
 *   2) τ = L / R_th
 *   3) I_L(t) = I_∞ + (I_L(0) - I_∞)·e^(-t/τ)
 *      where I_∞ = (L을 short으로 대체했을 때 L 자리에 흐르는 전류) = V_th / R_th
 *
 *  단순 charging (V·R·L 직렬): I_∞ = V/R, V_th = V (open-cap 기준 a 노드 전압)
 *  자세히는 Thevenin 솔버가 V_th, R_th 둘 다 산출 → I_∞ = V_th / R_th
 *
 *  한계: 다중 L (2차+) 미지원, dependent source 미지원.
 */

export type RlTransientResult = {
  /** 정상상태 전류 (L이 short으로 대체될 때 흐르는 전류) */
  Iinf: number;
  /** Thevenin 등가저항 */
  Rth: number;
  /** 시정수 (초). L을 H 단위로 넣으면 자동. */
  tauSec: number;
  /** ms 단위 (UI 표시 편의) */
  tauMs: number;
  /**
   * 임의 t(초)에서 I_L(t).
   * I_L(t) = I_∞ + (I_L(0) - I_∞)·e^(-t/τ)
   */
  Il: (tSec: number) => number;
};

/**
 * @param netWithoutL     L을 제거한 R-only 네트워크
 * @param lPositiveNode   L의 + 단자 (전류 방향 기준 + 쪽)
 * @param lNegativeNode   L의 - 단자
 * @param inductanceH     L 값 (Henry)
 * @param initialIl       t=0에서 I_L 초기값 (A)
 */
export function solveRlTransient(args: {
  netWithoutL: SolverNetwork;
  lPositiveNode: string;
  lNegativeNode: string;
  inductanceH: number;
  initialIl: number;
}): RlTransientResult {
  const { netWithoutL, lPositiveNode, lNegativeNode, inductanceH, initialIl } = args;

  const { Vth, Rth } = solveThevenin({
    net: netWithoutL,
    terminalA: lPositiveNode,
    terminalB: lNegativeNode,
  });

  const Iinf = Vth / Rth;
  const tauSec = inductanceH / Rth;

  return {
    Iinf,
    Rth,
    tauSec,
    tauMs: tauSec * 1000,
    Il: (tSec: number) => Iinf + (initialIl - Iinf) * Math.exp(-tSec / tauSec),
  };
}
