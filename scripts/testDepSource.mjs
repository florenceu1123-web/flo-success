// MNA VCCS/VCVS dependent source sanity test.
// inline MNA solver (TS 소스를 따로 컴파일 안 하고 직접 검증).

function solveMNA(net) {
  const { nodeIds, groundId, resistors, vsources, isources } = net;
  const vccs = net.vccs ?? [];
  const vcvs = net.vcvs ?? [];
  const n = nodeIds.length;
  const m_v = vsources.length + vcvs.length;
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
    const ia = idx.get(dep.a), ib = idx.get(dep.b);
    const vca = idx.get(dep.vca), vcb = idx.get(dep.vcb);
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
    const ia = idx.get(dep.a), ib = idx.get(dep.b);
    const vca = idx.get(dep.vca), vcb = idx.get(dep.vcb);
    if (ia !== undefined) { M[ia][row] -= 1; M[row][ia] += 1; }
    if (ib !== undefined) { M[ib][row] += 1; M[row][ib] -= 1; }
    if (vca !== undefined) M[row][vca] -= dep.k;
    if (vcb !== undefined) M[row][vcb] += dep.k;
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
  const vsourceCurrents = {};
  vsources.forEach((s, k) => { vsourceCurrents[s.id] = x[n + k]; });
  vcvs.forEach((dep, kk) => { vsourceCurrents[dep.id] = x[n + vsources.length + kk]; });
  return { nodeVoltages, vsourceCurrents };
}

function assertClose(actual, expected, label, tol = 1e-3) {
  if (Math.abs(actual - expected) < tol) {
    console.log(`  ✓ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})`);
  } else {
    console.log(`  ✗ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})  ← FAIL`);
    process.exitCode = 1;
  }
}

console.log("Test 1: VCCS basic — V1=12V, R1=4Ω(top↔a), R2=6Ω(a↔GND), R3=12Ω(b↔GND), VCCS g=0.1 inject (g·V_a) into b, R2'=6Ω(a↔b)");
// 회로:
//   V1=12 at top, top─R1─a─R2'─b
//                       │      │
//                       R2    R3
//                       │      │
//                      GND    GND
//   VCCS: g·V(a) 가 b로 inject (GND→b 방향)
{
  const net = {
    nodeIds: ["top", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1",  a: "top", b: "a", R: 4 },
      { id: "R2",  a: "a",   b: "GND", R: 6 },
      { id: "R2p", a: "a",   b: "b", R: 6 },
      { id: "R3",  a: "b",   b: "GND", R: 12 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: 12 }],
    isources: [],
    vccs: [{ id: "Gx", a: "GND", b: "b", vca: "a", vcb: "GND", g: 0.1 }],
  };
  const sol = solveMNA(net);
  console.log("  V(top)=", sol.nodeVoltages.top.toFixed(4));
  console.log("  V(a)=", sol.nodeVoltages.a.toFixed(4));
  console.log("  V(b)=", sol.nodeVoltages.b.toFixed(4));
  console.log("  I_V1=", sol.vsourceCurrents.V1.toFixed(4));
  // Sanity: V(top) = 12 (constrained by V1)
  assertClose(sol.nodeVoltages.top, 12, "V(top) = 12");
  // 일반 정합성: KCL at each node = 0
  // KCL at top: I_V1 = (V(top) - V(a))/R1
  assertClose(sol.vsourceCurrents.V1, (12 - sol.nodeVoltages.a) / 4, "I_V1 = (V_top - V_a)/R1");
}

console.log("\nTest 2: VCVS basic — V1=10V, R1=2Ω, R2=8Ω, VCVS k=3 (V(a) = 3·V_x where V_x = V(top)-V(a))");
// V1=10 at top, R1=2 (top↔mid), R2=8 (mid↔GND)
// VCVS: V(out_p) - V(out_n) = 3·(V(top)-V(mid))
// 출력 단자: out_p = out, out_n = GND. control: vca=top, vcb=mid
// out는 또 다른 R3=4를 통해 GND로 연결
{
  const net = {
    nodeIds: ["top", "mid", "out"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "mid", R: 2 },
      { id: "R2", a: "mid", b: "GND", R: 8 },
      { id: "R3", a: "out", b: "GND", R: 4 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: 10 }],
    isources: [],
    vcvs: [{ id: "Ex", a: "out", b: "GND", vca: "top", vcb: "mid", k: 3 }],
  };
  const sol = solveMNA(net);
  console.log("  V(top)=", sol.nodeVoltages.top.toFixed(4));
  console.log("  V(mid)=", sol.nodeVoltages.mid.toFixed(4));
  console.log("  V(out)=", sol.nodeVoltages.out.toFixed(4));
  // V(top) = 10. KCL at mid: (V_top-V_mid)/R1 = V_mid/R2 (no current to out)
  //   (10-V_mid)/2 = V_mid/8 → 4(10-V_mid)=V_mid → V_mid=40/5=8
  assertClose(sol.nodeVoltages.mid, 8, "V(mid) = 8");
  // V_x = V_top - V_mid = 10 - 8 = 2. VCVS = 3·2 = 6 → V(out) = 6
  assertClose(sol.nodeVoltages.out, 6, "V(out) = 3·V_x = 6");
}

if (process.exitCode === 1) console.log("\n❌ 실패");
else console.log("\n✅ 모두 통과");
