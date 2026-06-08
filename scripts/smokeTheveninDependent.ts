/**
 * 종속전원(CCVS 2i_x) 테브난 솔버 검증 (임용 9번 형식, GPT 불필요).
 *  실행: npx tsx scripts/smokeTheveninDependent.ts
 *
 *  테스트 회로: 9V — 5Ω — CCVS(2i_x) — 1Ω — n4 —[R=4Ω→GND, i_x 흐름]— 2Ω — a, b=GND.
 *  손계산(개방, CCVS가 전류방향으로 +2i_x):
 *    개방: i=i_x, 9=(5+2+1+4)i=12i → i=0.75, V_th=V(n4)=4·0.75=3V.
 *    단락(a=GND): n4에서 R(4)∥2Ω. i_x·4=i2·2 → i2=2i_x, i=3i_x. 9=24i_x → i_x=0.375, I_sc=i2=0.75.
 *    R_th=V_th/I_sc=3/0.75=4Ω.
 */
import { netlistToSolverNetwork } from "../lib/solver/netlistToSolver";
import { solveTheveninViaSc } from "../lib/solver/thevenin";
import type { CircuitNetlist } from "../types";

const pin = (id: string, type: string, nodes: string[], value?: string, control?: string) =>
  ({ id, type: type as never, value, control, pins: nodes.map((n, i) => ({ id: `${id}_p${i}`, node: n, side: "left" as never })) });

const netlist: CircuitNetlist = {
  ground: "GND",
  components: [
    { ...pin("V1", "V", ["n1", "GND"], "9V") },
    { ...pin("R1", "R", ["n1", "n2"], "5Ω") },
    { ...pin("E1", "CCVS", ["n2", "n3"], "2i_x", "Rx") },   // 2·i_x, i_x = Rx 전류
    { ...pin("R2", "R", ["n3", "n4"], "1Ω") },
    { ...pin("Rx", "R", ["n4", "GND"], "4Ω") },             // i_x 흐르는 저항(제어)
    { ...pin("R3", "R", ["n4", "a"], "2Ω") },
  ],
  nodeAnnotations: [{ node: "a", label: "a", style: "label_only" }],
};

const { net, warnings } = netlistToSolverNetwork(netlist);
console.log("변환 warnings:", warnings.filter(w => /CCVS|변환/.test(w)).join(" | ") || "(없음)");
console.log("vcvs:", JSON.stringify(net.vcvs));
const { Vth, Rth, Isc } = solveTheveninViaSc({ net, terminalA: "a", terminalB: "GND" });
console.log(`V_th=${Vth.toFixed(3)}V (기대 3), I_sc=${Isc.toFixed(3)}A (기대 0.75), R_th=${Rth.toFixed(3)}Ω (기대 4)`);
const ok = Math.abs(Vth - 3) < 1e-6 && Math.abs(Rth - 4) < 1e-6 && Math.abs(Isc - 0.75) < 1e-6;
console.log(ok ? "✓ 종속원 테브난 정확" : "✗ 불일치 (CCVS 부호/변환 확인)");
process.exit(ok ? 0 : 1);
