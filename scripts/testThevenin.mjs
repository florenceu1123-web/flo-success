// Thevenin 솔버 sanity test.
//   archetype 1 (voltage divider): V1=12V, R1=3Ω, R2=6Ω → Vth=8, Rth=2
//   archetype 2 (vi_two_source): 임의값, solver 결과 검산.
//
// 실행: node scripts/testThevenin.mjs
// (tsx 없이 tsc 컴파일 결과로 import — 우선 inline solver로 검증)

// ───── inline MNA + Thevenin (테스트 환경에서 TS 모듈 import 불가하면 fallback) ─────
function solveMNA(net) {
  const { nodeIds, groundId, resistors, vsources, isources } = net;
  const n = nodeIds.length;
  const m = vsources.length;
  const size = n + m;
  const idx = new Map();
  nodeIds.forEach((id, i) => idx.set(id, i));
  const M = Array.from({ length: size }, () => Array(size + 1).fill(0));
  for (const r of resistors) {
    const g = 1 / r.R;
    const i = idx.get(r.a), j = idx.get(r.b);
    if (i !== undefined) M[i][i] += g;
    if (j !== undefined) M[j][j] += g;
    if (i !== undefined && j !== undefined) { M[i][j] -= g; M[j][i] -= g; }
  }
  for (const s of isources) {
    const ia = idx.get(s.a), ib = idx.get(s.b);
    if (ia !== undefined) M[ia][size] -= s.I;
    if (ib !== undefined) M[ib][size] += s.I;
  }
  vsources.forEach((s, k) => {
    const row = n + k;
    const ia = idx.get(s.a), ib = idx.get(s.b);
    if (ia !== undefined) { M[ia][row] -= 1; M[row][ia] += 1; }
    if (ib !== undefined) { M[ib][row] += 1; M[row][ib] -= 1; }
    M[row][size] = s.V;
  });
  for (let i = 0; i < size; i++) {
    let pivotRow = i;
    let pivotVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < size; k++) {
      const v = Math.abs(M[k][i]);
      if (v > pivotVal) { pivotVal = v; pivotRow = k; }
    }
    if (pivotVal < 1e-12) throw new Error(`singular at ${i}`);
    if (pivotRow !== i) [M[i], M[pivotRow]] = [M[pivotRow], M[i]];
    const piv = M[i][i];
    for (let j = i; j <= size; j++) M[i][j] /= piv;
    for (let k = 0; k < size; k++) {
      if (k === i) continue;
      const f = M[k][i];
      if (f === 0) continue;
      for (let j = i; j <= size; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = M.map((row) => row[size]);
  const nodeVoltages = { [groundId]: 0 };
  nodeIds.forEach((id, i) => { nodeVoltages[id] = x[i]; });
  const vsourceCurrents = {};
  vsources.forEach((s, k) => { vsourceCurrents[s.id] = x[n + k]; });
  return { nodeVoltages, vsourceCurrents };
}

function solveThevenin({ net, terminalA, terminalB }) {
  const sol = solveMNA(net);
  const Vth = sol.nodeVoltages[terminalA] - sol.nodeVoltages[terminalB];
  const testNet = {
    nodeIds: net.nodeIds,
    groundId: net.groundId,
    resistors: [
      ...net.resistors,
      ...net.vsources.map((v) => ({ id: `${v.id}_short`, a: v.a, b: v.b, R: 1e-9 })),
    ],
    vsources: [],
    isources: [{ id: "I_test", a: terminalB, b: terminalA, I: 1 }],
  };
  const testSol = solveMNA(testNet);
  const Rth = testSol.nodeVoltages[terminalA] - testSol.nodeVoltages[terminalB];
  return { Vth, Rth };
}

// ───── 테스트 케이스 ─────
function assertClose(actual, expected, label, tol = 1e-6) {
  if (Math.abs(actual - expected) < tol) {
    console.log(`  ✓ ${label}: ${actual.toFixed(6)} (expected ${expected})`);
  } else {
    console.log(`  ✗ ${label}: ${actual.toFixed(6)} (expected ${expected})  ← FAIL`);
    process.exitCode = 1;
  }
}

console.log("Test 1: Voltage divider V1=12, R1=3, R2=6");
{
  const net = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a", R: 3 },
      { id: "R2", a: "a", b: "GND", R: 6 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: 12 }],
    isources: [],
  };
  const { Vth, Rth } = solveThevenin({ net, terminalA: "a", terminalB: "GND" });
  assertClose(Vth, 8, "V_th = 12·6/(3+6) = 8");
  assertClose(Rth, 2, "R_th = 3·6/(3+6) = 2");
}

console.log("Test 2: V1=10, R1=5, R2=5 (대칭)");
{
  const net = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a", R: 5 },
      { id: "R2", a: "a", b: "GND", R: 5 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: 10 }],
    isources: [],
  };
  const { Vth, Rth } = solveThevenin({ net, terminalA: "a", terminalB: "GND" });
  assertClose(Vth, 5, "V_th = 10·5/10 = 5");
  assertClose(Rth, 2.5, "R_th = 5||5 = 2.5");
}

console.log("Test 3: V+I dual source. V1=10V, I1=2A inject at 'a', R1=R3=4Ω(병렬), R2=4Ω");
{
  // V1=GND→top=10V → V(top)=10
  // R1, R3 from top to a, parallel = 2Ω
  // R2 a→GND = 4
  // I1: GND→a inject 2A
  // V_th: 풀이 V(a) = ?
  //  R_thevenin_seen_from_top = (R1||R3) + R2 looking via V source... 너무 복잡.
  //  → solver 결과를 closed-form과 비교.
  //  KCL at top: (V_top-V_a)/R1 + (V_top-V_a)/R3 - I_V1 = 0 (V1 source)
  //              V_top = 10 (fixed by V1)
  //  KCL at a:   (V_a-V_top)/R1 + (V_a-V_top)/R3 + V_a/R2 - 2 = 0
  //              (V_a-10)·2·1/4 + V_a/4 - 2 = 0       // 1/R1+1/R3 = 2·(1/4)
  //              (V_a-10)/2 + V_a/4 = 2
  //              2(V_a-10) + V_a = 8
  //              3V_a - 20 = 8 → V_a = 28/3 ≈ 9.333
  const net = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a", R: 4 },
      { id: "R3", a: "top", b: "a", R: 4 },
      { id: "R2", a: "a", b: "GND", R: 4 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: 10 }],
    isources: [{ id: "I1", a: "GND", b: "a", I: 2 }],
  };
  const { Vth, Rth } = solveThevenin({ net, terminalA: "a", terminalB: "GND" });
  assertClose(Vth, 28/3, "V_th = 28/3");
  // R_th: sources off → top short to GND. R1||R3 from top(=GND) to a = 2Ω. R2 from a to GND = 4Ω. 둘 다 a에서 GND로 가는 경로 → 2Ω || 4Ω = 4/3
  assertClose(Rth, 4/3, "R_th = (R1||R3) || R2 = 2 || 4 = 4/3", 1e-6);
}

if (process.exitCode === 1) {
  console.log("\n❌ 일부 테스트 실패");
} else {
  console.log("\n✅ 모든 테스트 통과");
}
