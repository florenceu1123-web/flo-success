import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import {
  generateThevenin,
  type TheveninArchetype,
  type TheveninGeneration,
} from "./thevenin";
import { makeRand, round3 } from "./_helpers";

/**
 * 최대 전력 전달 (Maximum Power Transfer) 문제 generator.
 *
 *  Thevenin 등가회로에서 단자 a-b 사이에 부하 R_L을 연결할 때,
 *    R_L = R_th 일 때 P_L 최대.
 *    P_max = V_th² / (4·R_th)
 *
 *  Thevenin generator를 그대로 재활용:
 *    - 같은 archetype (voltage_divider / vi_two_source)
 *    - 같은 topology + 값
 *    - netlist에 loadPlaceholder(R_L) 추가만
 *    - 정답은 R_L_opt, P_max
 */

export type MaxPowerGeneration = TheveninGeneration & {
  /** 최적 부하 저항 (= R_th) */
  RLopt: number;
  /** 최대 전력 (W) */
  Pmax: number;
};

export function generateMaxPowerTransfer(args: {
  params?: CircuitTypeParams;
  archetype?: TheveninArchetype;
  seed?: number;
}): MaxPowerGeneration {
  // Thevenin 결과 재활용
  const thev = generateThevenin(args);
  const { Vth, Rth } = thev.answer;

  // 부하 placeholder를 netlist에 추가 (a ↔ GND 사이 점선 박스)
  const netlist: CircuitNetlist = {
    ...thev.netlist,
    loadPlaceholders: [
      { betweenNodes: [thev.terminalA, thev.terminalB], label: "R_L", emphasize: true },
    ],
  };

  const Pmax = (Vth * Vth) / (4 * Rth);

  return {
    ...thev,
    netlist,
    RLopt: round3(Rth),
    Pmax: round3(Pmax),
  };
}

// seed 생성을 위한 export (legacy 호환)
export { makeRand };
