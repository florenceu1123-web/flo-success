import { solveMNA, type SolverNetwork } from "./mna";

/**
 * Thevenin 등가회로 추출.
 *  - V_th: 단자 a-b 사이 개방 전압 (V(a) - V(b))
 *  - R_th: 모든 독립 source를 zero out한 상태에서 a-b 사이 등가 저항
 *          (V → short = 0Ω wire / I → open = 제거)
 *
 *  주의: 입력 회로에 a-b 사이 부하가 이미 있으면 안 됨 (Open-circuit 가정).
 *        부하 placeholder(R_L)는 SolverNetwork 외부 개념이라 영향 없음.
 */
export function solveThevenin(args: {
  net: SolverNetwork;
  terminalA: string;
  terminalB: string;
}): { Vth: number; Rth: number } {
  const { net, terminalA, terminalB } = args;

  // 1) V_th: 그대로 풀어 V(a) - V(b)
  const sol = solveMNA(net);
  const Vth = sol.nodeVoltages[terminalA] - sol.nodeVoltages[terminalB];

  // 2) R_th: 모든 독립 source 제거 + 1A 시험 전류 a→b 주입 → V(a) - V(b) = R_th
  const testNet: SolverNetwork = {
    nodeIds: net.nodeIds,
    groundId: net.groundId,
    resistors: [...net.resistors],
    vsources: [],
    isources: [{ id: "I_test", a: terminalB, b: terminalA, I: 1 }],
  };
  // V 소스를 short(=wire)로 대체: 같은 두 노드를 매우 낮은 저항(1e-9Ω)으로 묶으면 풀이 안정.
  // 더 정확한 방법은 노드 병합인데, 일단 미세 저항으로 처리.
  for (const v of net.vsources) {
    testNet.resistors.push({ id: `${v.id}_short`, a: v.a, b: v.b, R: 1e-9 });
  }
  // I 소스는 open = 제거 (zero current 가정). vsources를 빈 배열로 둔 것과 같이 isources도 제외.

  const testSol = solveMNA(testNet);
  const Rth = testSol.nodeVoltages[terminalA] - testSol.nodeVoltages[terminalB];

  return { Vth, Rth };
}

/**
 * Thevenin 등가 — V_OC / I_SC 방식. **종속전원(VCVS/VCCS/OPAMP)을 살린 채** 계산하므로
 * 종속전원이 있는 회로(예: 임용 9번 2i_x)에 정확하다.
 *  - V_th = 개방전압 V(a)−V(b)   (부하 R_L 제거 상태의 netlist)
 *  - I_sc = a-b 단락 시 단락 전류 (a→b)
 *  - R_th = V_th / I_sc
 *
 *  ※ solveThevenin(위)은 독립원만 zero out하고 종속원을 빠뜨리므로 종속원 회로엔 부정확.
 *    이 함수는 두 번 다 전체 회로(종속원 포함)를 풀어 종속원 효과를 보존한다.
 */
export function solveTheveninViaSc(args: {
  net: SolverNetwork;
  terminalA: string;
  terminalB: string;
}): { Vth: number; Rth: number; Isc: number } {
  const { net, terminalA, terminalB } = args;

  // 1) V_OC — 부하 없는 상태(개방) 그대로 풀이.
  const ocSol = solveMNA(net);
  const Vth = ocSol.nodeVoltages[terminalA] - ocSol.nodeVoltages[terminalB];

  // 2) I_SC — a-b를 0V 전압원으로 단락하고 그 전류 측정 (종속원 그대로 유지).
  const SC_ID = "__Isc_short";
  const scNet: SolverNetwork = {
    ...net,
    vsources: [...net.vsources, { id: SC_ID, a: terminalA, b: terminalB, V: 0 }],
  };
  const scSol = solveMNA(scNet);
  // 외부 단락전류(a→b) = −(0V원의 내부 a→b 전류). V_th와 같은 기준이 되도록 부호 정렬 → R_th>0.
  const Isc = -(scSol.vsourceCurrents[SC_ID] ?? 0);

  const Rth = Math.abs(Isc) > 1e-12 ? Vth / Isc : Infinity;
  return { Vth, Rth, Isc };
}
