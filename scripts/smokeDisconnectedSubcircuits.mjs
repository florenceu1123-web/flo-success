// 접지로만 이어진 독립 회로 N개 검출 (실측 신고: V+R 루프 4개짜리 "기괴한" 회로)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDisconnectedSubcircuits.mjs
import { validateFigures } from "../lib/validators/validateFigures.ts";

const V = (id, a, b) => ({ id, type: "V", value: "10V", pins: [{ node: a, role: "positive" }, { node: b }] });
const R = (id, a, b) => ({ id, type: "R", value: "10Ω", pins: [{ node: a }, { node: b }] });
const fig = (components) => [{ id: "fig1", label: "회로", role: "original_circuit", diagramType: "analog_netlist",
  diagram: { nodes: [], components, edges: [], ground: "GND", nodeAnnotations: [] } }];
const hasIssue = (comps) => (validateFigures(fig(comps)).issues ?? []).some((i) => i.rule === "circuit_disconnected_subcircuits");

const CASES = [
  {
    name: "[신고 재현] 독립 V+R 루프 4개 → 잡혀야 함",
    got: hasIssue([
      V("V1", "n1", "GND"), R("R1", "n1", "GND"),
      V("V2", "n2", "GND"), R("R2", "n2", "GND"),
      V("V3", "n3", "GND"), R("R3", "n3", "GND"),
      V("V4", "n4", "GND"), R("R4", "n4", "GND"),
    ]),
    expect: true,
  },
  {
    name: "정상 사다리 회로(모두 연결) → 통과",
    got: hasIssue([V("V1", "a", "GND"), R("R1", "a", "b"), R("R2", "b", "GND"), R("R3", "b", "c"), R("R4", "c", "GND")]),
    expect: false,
  },
  {
    name: "[회귀] 접지만 공유하는 2망 구조(ac_vccs_phasor류) → 통과",
    got: hasIssue([V("V1", "a", "GND"), R("R1", "a", "GND"), R("R2", "b", "GND"), R("R3", "b", "GND")]),
    expect: false,
  },
];
let pass = 0;
for (const c of CASES) {
  const ok = c.got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name} (실제=${c.got})`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
