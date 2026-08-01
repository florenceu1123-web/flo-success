// OPAMP 결선 검증이 figure 검증 단계에서 잡히는지 확인
//   신고: 화면에 "OPAMP1: OPAMP feedback branch 누락 (output → − or + input)"이
//   회로 대신 raw <pre>로 노출됨. 렌더러만 검사하고 검증 단계는 통과시켰기 때문.
//   → validateFigures가 opamp_wiring_invalid로 잡아 재생성 트리거가 되어야 한다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOpampFeedbackValidation.mjs
import { validateFigures } from "../lib/validators/validateFigures.ts";

const fig = (components, nodeAnnotations = []) => ([{
  id: "fig1", label: "회로", role: "original_circuit", diagramType: "analog_netlist",
  diagram: { nodes: [], components, edges: [], ground: "GND", nodeAnnotations },
}]);

const R = (id, a, b) => ({ id, type: "R", value: "10kΩ", pins: [{ node: a }, { node: b }] });
const V = (id, a, b) => ({ id, type: "V", value: "5V", pins: [{ node: a, role: "positive" }, { node: b }] });
const OP = (id, p, m, o) => ({ id, type: "OPAMP", pins: [{ node: p }, { node: m }, { node: o }] });

const CASES = [
  {
    name: "피드백 없는 폐루프 OPAMP (신고 케이스) → 잡혀야 함",
    //   vo에 R2가 물려 비교기(면제)가 아니고, vo에서 v−/v+로 가는 경로가 전혀 없다.
    //   ※ vo→GND 부하로 만들면 chain BFS가 GND를 지나 전원→v+로 도달해 피드백으로 인정하므로,
    //     출력단을 접지에 묶지 않은 형태로 구성한다(실제 신고 회로도 이 부류).
    figs: fig(
      [
        V("V1", "vin", "GND"), R("R1", "vin", "vm"),
        R("Rb", "vp", "GND"), OP("OPAMP1", "vp", "vm", "vo"), R("R2", "vo", "vout_t"),
      ],
      [{ node: "vout_t", label: "V_o", style: "label_only" }],
    ),
    expectIssue: true,
  },
  {
    name: "정상 반전증폭기 (R_f: vo→v−) → 통과",
    figs: fig([V("V1", "vin", "GND"), R("R1", "vin", "vm"), R("Rf", "vm", "vo"), OP("OPAMP1", "GND", "vm", "vo")]),
    expectIssue: false,
  },
  {
    name: "open-loop 비교기 (vo가 외부 단자) → 규칙 #8로 면제",
    figs: fig(
      [V("V1", "vp", "GND"), V("V2", "vm", "GND"), OP("OPAMP1", "vp", "vm", "vo")],
      [{ node: "vo", label: "V_o", style: "label_only" }],
    ),
    expectIssue: false,
  },
];

let pass = 0;
for (const c of CASES) {
  const res = validateFigures(c.figs);
  const got = (res.issues ?? []).filter((i) => i.rule === "opamp_wiring_invalid");
  const ok = c.expectIssue ? got.length > 0 : got.length === 0;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}\n    opamp_wiring_invalid=${got.length}${got[0] ? ` (${got[0].message})` : ""}`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
