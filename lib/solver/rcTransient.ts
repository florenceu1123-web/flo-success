import { solveThevenin } from "./thevenin";
import type { SolverNetwork } from "./mna";

/**
 * 1차 RC 과도응답 솔버 (single capacitor, 단일 시정수).
 *
 *  접근:
 *   1) 커패시터를 제거한 R-only 네트워크에서 cap 양 단자 a, b 사이의 Thevenin 등가 추출
 *      → V_∞ = V_th (정상상태에서 cap 양단 전압)
 *      → R_th (방전 회로 등가 저항)
 *   2) τ = R_th · C
 *   3) V_C(t) = V_∞ + (V_C(0) - V_∞)·e^(-t/τ)
 *
 *  한계: 다중 캡(2차+) 미지원, dependent source 미지원 (다음 phase).
 */

export type RcTransientResult = {
  /** Thevenin 등가전압 (V_C 정상상태값) */
  Vinf: number;
  /** Thevenin 등가저항 (방전 경로) */
  Rth: number;
  /** 시정수 (초). C를 F 단위로 넣으면 자동. */
  tauSec: number;
  /** ms 단위 (UI 표시 편의) */
  tauMs: number;
  /**
   * 임의 t(초)에서 V_C(t).
   * V_C(t) = V_∞ + (V_C(0) - V_∞)·e^(-t/τ)
   */
  Vc: (tSec: number) => number;
};

/**
 * @param netWithoutCap   캡을 제거한 R-only 네트워크 (V/I 소스는 포함)
 * @param capPositiveNode 캡의 + 단자 (V_C 측정 기준 + 쪽)
 * @param capNegativeNode 캡의 - 단자 (GND인 경우가 흔함)
 * @param capacitanceF    캡 용량 (Farad)
 * @param initialVc       t=0에서 V_C 초기값 (V)
 */
export function solveRcTransient(args: {
  netWithoutCap: SolverNetwork;
  capPositiveNode: string;
  capNegativeNode: string;
  capacitanceF: number;
  initialVc: number;
}): RcTransientResult {
  const { netWithoutCap, capPositiveNode, capNegativeNode, capacitanceF, initialVc } = args;

  const { Vth, Rth } = solveThevenin({
    net: netWithoutCap,
    terminalA: capPositiveNode,
    terminalB: capNegativeNode,
  });

  const tauSec = Rth * capacitanceF;
  const Vinf = Vth;

  return {
    Vinf,
    Rth,
    tauSec,
    tauMs: tauSec * 1000,
    Vc: (tSec: number) => Vinf + (initialVc - Vinf) * Math.exp(-tSec / tauSec),
  };
}
