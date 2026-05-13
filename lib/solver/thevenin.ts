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
