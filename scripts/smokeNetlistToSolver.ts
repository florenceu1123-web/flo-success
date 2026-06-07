/**
 * netlistToSolverNetwork oracle 검증 smoke.
 *
 *  opamp.ts 빌더는 같은 회로의 (netlist, solverNet) 쌍을 만든다.
 *  → 변환기가 netlist로부터 만든 SolverNetwork의 MNA 해가
 *    빌더의 수동 solverNet MNA 해와 일치해야 한다 (node 전압 기준).
 *
 *  실행: npx tsx scripts/smokeNetlistToSolver.ts
 */
import { generateOpamp, type OpampArchetype } from "../lib/generation/topologies/opamp";
import { netlistToSolverNetwork } from "../lib/solver/netlistToSolver";
import { solveMNA } from "../lib/solver/mna";

const ARCHETYPES: OpampArchetype[] = [
  "inverting", "non_inverting", "summing", "difference", "voltage_follower", "cascade",
];
const EPS = 1e-6;

let failures = 0;
let total = 0;

for (const archetype of ARCHETYPES) {
  for (let seed = 1; seed <= 5; seed++) {
    total++;
    let gen;
    try {
      gen = generateOpamp({ seed, archetype });
    } catch (e) {
      console.log(`  ⚠ ${archetype} seed=${seed}: generateOpamp 실패 — ${String(e)}`);
      failures++;
      continue;
    }

    // oracle: 빌더 수동 solverNet
    const oracle = solveMNA(gen.solverNet);

    // 변환기: netlist → solverNet
    let converted;
    try {
      converted = netlistToSolverNetwork(gen.netlist);
    } catch (e) {
      console.log(`  ✗ ${archetype} seed=${seed}: 변환 실패 — ${String(e)}`);
      failures++;
      continue;
    }
    const test = solveMNA(converted.net);

    // 공통 노드 전압 비교
    const oracleNodes = Object.keys(oracle.nodeVoltages);
    const diffs: string[] = [];
    for (const node of oracleNodes) {
      const vO = oracle.nodeVoltages[node];
      const vT = test.nodeVoltages[node];
      if (vT === undefined) { diffs.push(`${node}: 변환결과에 없음`); continue; }
      if (Math.abs(vO - vT) > EPS) diffs.push(`${node}: oracle=${vO.toFixed(4)} vs conv=${vT.toFixed(4)}`);
    }

    if (diffs.length > 0) {
      console.log(`  ✗ ${archetype} seed=${seed}: 불일치`);
      for (const d of diffs) console.log(`       ${d}`);
      if (converted.warnings.length) console.log(`       warnings: ${converted.warnings.join("; ")}`);
      failures++;
    } else {
      const voutO = oracle.nodeVoltages.Vout ?? oracle.nodeVoltages[Object.keys(oracle.nodeVoltages)[0]];
      console.log(`  ✓ ${archetype} seed=${seed}: 일치 (Vout=${voutO?.toFixed(3)}, nodes=${oracleNodes.length}${converted.warnings.length ? `, warn=${converted.warnings.length}` : ""})`);
    }
  }
}

console.log(`\n결과: ${total - failures}/${total} 통과`);
process.exit(failures > 0 ? 1 : 0);
