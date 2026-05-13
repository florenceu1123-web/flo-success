// Difference amp 솔버 검증.
// V1=2V, V2=5V, R_in=R_g=1kΩ, R_f=R_p=4kΩ
// V_out = (R_f/R_in)·(V_2 - V_1) = 4·(5-2) = 12V

function solveMNA(net) {
  const { nodeIds, groundId, resistors, vsources, isources } = net;
  const vccs = net.vccs ?? [];
  const vcvs = net.vcvs ?? [];
  const opamps = net.opamps ?? [];
  const n = nodeIds.length;
  const m_v = vsources.length + vcvs.length + opamps.length;
  const size = n + m_v;
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
  for (const dep of vccs) {
    const ia=idx.get(dep.a),ib=idx.get(dep.b),vca=idx.get(dep.vca),vcb=idx.get(dep.vcb);
    if (ia !== undefined && vca !== undefined) M[ia][vca] += dep.g;
    if (ia !== undefined && vcb !== undefined) M[ia][vcb] -= dep.g;
    if (ib !== undefined && vca !== undefined) M[ib][vca] -= dep.g;
    if (ib !== undefined && vcb !== undefined) M[ib][vcb] += dep.g;
  }
  vsources.forEach((s, k) => {
    const row = n + k;
    const ia = idx.get(s.a), ib = idx.get(s.b);
    if (ia !== undefined) { M[ia][row] -= 1; M[row][ia] += 1; }
    if (ib !== undefined) { M[ib][row] += 1; M[row][ib] -= 1; }
    M[row][size] = s.V;
  });
  vcvs.forEach((dep, kk) => {
    const row = n + vsources.length + kk;
    const ia=idx.get(dep.a),ib=idx.get(dep.b),vca=idx.get(dep.vca),vcb=idx.get(dep.vcb);
    if (ia !== undefined) { M[ia][row] -= 1; M[row][ia] += 1; }
    if (ib !== undefined) { M[ib][row] += 1; M[row][ib] -= 1; }
    if (vca !== undefined) M[row][vca] -= dep.k;
    if (vcb !== undefined) M[row][vcb] += dep.k;
    M[row][size] = 0;
  });
  opamps.forEach((op, kk) => {
    const row = n + vsources.length + vcvs.length + kk;
    const vo = idx.get(op.vo), vp = idx.get(op.vp), vn = idx.get(op.vn);
    if (vo !== undefined) M[vo][row] -= 1;
    if (vp !== undefined) M[row][vp] += 1;
    if (vn !== undefined) M[row][vn] -= 1;
    M[row][size] = 0;
  });
  for (let i = 0; i < size; i++) {
    let pivotRow = i, pivotVal = Math.abs(M[i][i]);
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
  return { nodeVoltages };
}

function assertClose(actual, expected, label, tol = 1e-3) {
  if (Math.abs(actual - expected) < tol) {
    console.log(`  ✓ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})`);
  } else {
    console.log(`  ✗ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})  ← FAIL`);
    process.exitCode = 1;
  }
}

console.log("Difference amp: V1=2V, V2=5V, Rin=Rg=1k, Rf=Rp=4k");
{
  const net = {
    nodeIds: ["V1n", "V2n", "Vplus", "Vminus", "Vout"],
    groundId: "GND",
    resistors: [
      { id: "Rin", a: "V1n", b: "Vminus", R: 1000 },
      { id: "Rg",  a: "V2n", b: "Vplus",  R: 1000 },
      { id: "Rp",  a: "Vplus", b: "GND",  R: 4000 },
      { id: "Rf",  a: "Vminus", b: "Vout", R: 4000 },
    ],
    vsources: [
      { id: "Vs1", a: "V1n", b: "GND", V: 2 },
      { id: "Vs2", a: "V2n", b: "GND", V: 5 },
    ],
    isources: [],
    opamps: [{ id: "U1", vp: "Vplus", vn: "Vminus", vo: "Vout" }],
  };
  const sol = solveMNA(net);
  console.log("  V(V1n) =", sol.nodeVoltages.V1n.toFixed(2));
  console.log("  V(V2n) =", sol.nodeVoltages.V2n.toFixed(2));
  console.log("  V(Vplus) =", sol.nodeVoltages.Vplus.toFixed(4));
  console.log("  V(Vminus) =", sol.nodeVoltages.Vminus.toFixed(4));
  console.log("  V(Vout) =", sol.nodeVoltages.Vout.toFixed(4));
  // Expected: V_out = (4/1)·(5-2) = 12
  assertClose(sol.nodeVoltages.Vout, 12, "V_out = 12");
  // V+ = V_2·Rp/(Rg+Rp) = 5·4/5 = 4
  assertClose(sol.nodeVoltages.Vplus, 4, "V+ = 4");
  // V- = V+ = 4 (가상단락)
  assertClose(sol.nodeVoltages.Vminus, 4, "V- = V+ = 4");
}

console.log("\nVoltage follower: V_in = 7V");
{
  const net = {
    nodeIds: ["Vin", "Vout"],
    groundId: "GND",
    resistors: [{ id: "RL", a: "Vout", b: "GND", R: 1e6 }],
    vsources: [{ id: "Vs", a: "Vin", b: "GND", V: 7 }],
    isources: [],
    opamps: [{ id: "U1", vp: "Vin", vn: "Vout", vo: "Vout" }],
  };
  const sol = solveMNA(net);
  assertClose(sol.nodeVoltages.Vin, 7, "V_in = 7");
  assertClose(sol.nodeVoltages.Vout, 7, "V_out = V_in = 7");
}

if (process.exitCode === 1) console.log("\n❌ 실패");
else console.log("\n✅ 모두 통과");
