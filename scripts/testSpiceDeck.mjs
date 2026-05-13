// SPICE deck 생성 검증 (ngspice 없이 텍스트 검사).

const GROUND = "0";
function spiceNode(node, groundId) {
  return node === groundId ? GROUND : node.replace(/[^a-zA-Z0-9_]/g, "_");
}
function formatValue(x) {
  if (x === 0) return "0";
  if (Number.isInteger(x) && Math.abs(x) < 1e9) return String(x);
  return x.toExponential(6);
}
function buildDeck(net, opts = {}) {
  const lines = [];
  const groundId = net.groundId;
  lines.push(`* ${opts.title ?? "test"}`);
  lines.push("");
  for (const r of net.resistors) {
    lines.push(`R${r.id} ${spiceNode(r.a, groundId)} ${spiceNode(r.b, groundId)} ${formatValue(r.R)}`);
  }
  for (const v of net.vsources) {
    lines.push(`V${v.id} ${spiceNode(v.a, groundId)} ${spiceNode(v.b, groundId)} DC ${formatValue(v.V)}`);
  }
  for (const i of net.isources) {
    lines.push(`I${i.id} ${spiceNode(i.b, groundId)} ${spiceNode(i.a, groundId)} DC ${formatValue(i.I)}`);
  }
  for (const dep of (net.vccs ?? [])) {
    lines.push(`G${dep.id} ${spiceNode(dep.b, groundId)} ${spiceNode(dep.a, groundId)} ${spiceNode(dep.vca, groundId)} ${spiceNode(dep.vcb, groundId)} ${formatValue(dep.g)}`);
  }
  for (const dep of (net.vcvs ?? [])) {
    lines.push(`E${dep.id} ${spiceNode(dep.a, groundId)} ${spiceNode(dep.b, groundId)} ${spiceNode(dep.vca, groundId)} ${spiceNode(dep.vcb, groundId)} ${formatValue(dep.k)}`);
  }
  if ((net.opamps ?? []).length > 0) {
    lines.push("");
    lines.push(".subckt OPAMP_IDEAL pos neg out");
    lines.push("E1 out 0 pos neg 1e6");
    lines.push(".ends");
    lines.push("");
    for (const op of net.opamps) {
      lines.push(`X${op.id} ${spiceNode(op.vp, groundId)} ${spiceNode(op.vn, groundId)} ${spiceNode(op.vo, groundId)} OPAMP_IDEAL`);
    }
  }
  lines.push("");
  lines.push(".op");
  const printItems = [];
  for (const n of (opts.printNodes ?? [])) printItems.push(`v(${spiceNode(n, groundId)})`);
  for (const v of (opts.printVsourceCurrents ?? [])) printItems.push(`i(V${v})`);
  if (printItems.length > 0) lines.push(`.print dc ${printItems.join(" ")}`);
  lines.push(".end");
  return lines.join("\n");
}

// Test 1: Voltage divider Thevenin (V_th=8V, R_th=2Ω 예상)
console.log("=== Test 1: Voltage divider ===");
console.log(buildDeck({
  nodeIds: ["top", "a"],
  groundId: "GND",
  resistors: [
    { id: "1", a: "top", b: "a", R: 3 },
    { id: "2", a: "a", b: "GND", R: 6 },
  ],
  vsources: [{ id: "1", a: "top", b: "GND", V: 12 }],
  isources: [],
}, { title: "Thevenin verify", printNodes: ["a", "top"], printVsourceCurrents: ["1"] }));

// Test 2: OPAMP inverting
console.log("\n=== Test 2: OPAMP inverting ===");
console.log(buildDeck({
  nodeIds: ["Vin", "Vminus", "Vout"],
  groundId: "GND",
  resistors: [
    { id: "in", a: "Vin", b: "Vminus", R: 1000 },
    { id: "f",  a: "Vminus", b: "Vout", R: 10000 },
  ],
  vsources: [{ id: "s", a: "Vin", b: "GND", V: 2 }],
  isources: [],
  opamps: [{ id: "1", vp: "GND", vn: "Vminus", vo: "Vout" }],
}, { printNodes: ["Vout", "Vminus"] }));

// Test 3: VCCS
console.log("\n=== Test 3: VCCS chain ===");
console.log(buildDeck({
  nodeIds: ["top", "a", "b"],
  groundId: "GND",
  resistors: [
    { id: "1", a: "top", b: "a", R: 4 },
    { id: "2", a: "a", b: "b", R: 2 },
    { id: "x", a: "a", b: "GND", R: 8 },
    { id: "3", a: "b", b: "GND", R: 10 },
  ],
  vsources: [{ id: "1", a: "top", b: "GND", V: 12 }],
  isources: [],
  vccs: [{ id: "x", a: "GND", b: "b", vca: "a", vcb: "GND", g: 0.1 }],
}, { printNodes: ["a", "b"] }));

console.log("\n✅ Deck generation OK (manually verify with ngspice -b)");
