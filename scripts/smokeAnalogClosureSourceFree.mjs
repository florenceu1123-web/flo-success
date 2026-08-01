// "회로에 전원(V/I source)이 없음" 검증의 정당한 예외 확인
//   신고: 정상 문제인데 figures/analog_circuit_open "전원 없음"으로 검증 실패.
//   임용 문제엔 전원이 없는 게 정상인 회로가 있다:
//     (1) 스위치 개방 후 자연응답(초기조건 v_C(0)·i_L(0)이 구동)
//     (2) 단자 a-b 등가저항/등가임피던스(전원 제거가 정의)
//     (3) OPAMP·종속전원 등 능동소자 회로(입력은 외부 단자 표기)
//   반대로 R만 있고 단자도 없는 회로는 여전히 무의미 → 계속 잡혀야 한다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAnalogClosureSourceFree.mjs
import { validateAnalogClosure } from "../lib/validators/validateAnalogClosure.ts";

const R = (id, a, b) => ({ id, type: "R", value: "10Ω", pins: [{ node: a }, { node: b }] });
const C = (id, a, b) => ({ id, type: "C", value: "2.5F", pins: [{ node: a }, { node: b }] });
const V = (id, a, b) => ({ id, type: "V", value: "5V", pins: [{ node: a, role: "positive" }, { node: b }] });
const term = (...nodes) => nodes.map((n) => ({ node: n, label: n, style: "label_only" }));
const net = (components, nodeAnnotations = []) => ({ nodes: [], components, edges: [], ground: "GND", nodeAnnotations });

const NO_SOURCE = (errs) => errs.some((e) => e.includes("전원(V/I source)이 없음"));

const CASES = [
  {
    name: "t≥0 자연응답 — C ∥ R (전원 없음이 정상)",
    n: net([C("C1", "vc", "GND"), R("R1", "vc", "GND")]),
    expectError: false,
  },
  {
    name: "단자 a-b 등가저항 — 전원 제거 상태",
    n: net([R("R1", "a", "m"), R("R2", "m", "b"), R("R3", "m", "GND")], term("a", "b")),
    expectError: false,
  },
  {
    name: "[회귀] R만 있고 단자도 없음 — 여전히 무의미",
    n: net([R("R1", "n1", "n2"), R("R2", "n2", "GND")]),
    expectError: true,
  },
  {
    name: "[회귀] 정상 전원 회로 — 통과",
    n: net([V("V1", "n1", "GND"), R("R1", "n1", "GND")]),
    expectError: false,
  },
];

let pass = 0;
for (const c of CASES) {
  const errs = validateAnalogClosure(c.n);
  const got = NO_SOURCE(errs);
  const ok = got === c.expectError;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}\n    전원없음 오류=${got} (기대=${c.expectError})`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
