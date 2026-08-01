// 뜬 노드(dangling) 자동 보정 검증 (API 호출 없음)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAutoCloseDangling.mjs
import { autoCloseAnalogDangling } from "../lib/generation/autoCloseAnalogDangling.ts";
import { validateFigures } from "../lib/validators/validateFigures.ts";

// ★ 실측 신고 넷리스트 — V2의 한쪽 단자 B가 어디에도 안 붙어 floating source가 됐다.
//   (로그: componentPins V2 pins ["B","M1"] → node B degree 1)
const reported = () => ({
  ground: "GND",
  components: [
    { id: "U1", type: "OPAMP", pins: [{ id: "p1", node: "GND" }, { id: "p2", node: "M1" }, { id: "p3", node: "O1" }] },
    { id: "R1", type: "R", pins: [{ id: "p1", node: "A" }, { id: "p2", node: "M1" }] },
    { id: "Rf", type: "R", pins: [{ id: "p1", node: "M1" }, { id: "p2", node: "O1" }] },
    { id: "V1", type: "V", pins: [{ id: "p1", node: "A" }, { id: "p2", node: "GND" }] },
    { id: "V2", type: "V", pins: [{ id: "p1", node: "B" }, { id: "p2", node: "M1" }] },
  ],
});
// 회귀 — 외부 단자(label_only)는 degree 1이 정상. GND로 단락시키면 안 된다.
const withTerminal = () => ({
  ground: "GND",
  nodeAnnotations: [
    { node: "a", style: "label_only", label: "a" },
    { node: "b", style: "label_only", label: "b" },
  ],
  components: [
    { id: "V1", type: "V", pins: [{ id: "p1", node: "n1" }, { id: "p2", node: "b" }] },
    { id: "R1", type: "R", pins: [{ id: "p1", node: "n1" }, { id: "p2", node: "a" }] },
  ],
});

const figOf = (d) => [{ id: "fig_main_1", label: "회로", role: "main_circuit", diagramType: "analog_netlist", diagram: d }];

const before = validateFigures(figOf(reported()));
const fixedNet = reported();
autoCloseAnalogDangling([{ figureVariants: figOf(fixedNet) }]);
const after = validateFigures(figOf(fixedNet));

const termNet = withTerminal();
autoCloseAnalogDangling([{ figureVariants: figOf(termNet) }]);
const termAfter = validateFigures(figOf(termNet));
const shorted = termNet.components.some((c) => c.type === "WIRE" && c.pins.some((p) => p.node === "a" || p.node === "b"));

const cases = [
  ["[신고 재현] 보정 전에는 검증 실패", before.issues.length > 0, true],
  ["보정 후 dangling 해소", after.issues.filter((i) => i.rule === "netlist_dangling_node").length, 0],
  ["보정 후 floating source 해소", after.issues.filter((i) => i.rule === "analog_circuit_open").length, 0],
  ["보정 후 검증 이슈 0", after.issues.length, 0],
  ["[회귀] 외부 단자 a·b를 GND로 단락하지 않음", shorted, false],
  // ★ 자동 보정이 **단자 회로에 dangling 이슈를 새로 만들지 않는지**가 이 테스트의 관심사다.
  //   (전원의 폐루프가 회로 밖 부하로 닫히는 등가회로 표기는 validateAnalogClosure의 별개 사안 —
  //    자동 보정과 무관하므로 여기서 단언하지 않는다.)
  ["[회귀] 단자 회로에 dangling 이슈 없음", termAfter.issues.filter((i) => i.rule === "netlist_dangling_node").length, 0],
];
let pass = 0;
for (const [name, got, want] of cases) {
  const ok = got === want; if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${name} (실제=${got})`);
}
if (before.issues.length) console.log("보정 전 이슈:", before.issues.map((i) => i.rule).join(", "));
console.log("단자 케이스 잔여 이슈:", termAfter.issues.map(i=>i.rule+": "+i.message).join(" | "));
console.log(`${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
process.exit(pass === cases.length ? 0 : 1);
