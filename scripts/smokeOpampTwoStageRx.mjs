// 2단 OPAMP + 저항 R_X 설계 (임용 2번 전자회로) — API 없음
//
//   실측(2026-08-02): 이 원본이 generic `analog_netlist`(opamp_generic)로 떨어져 **없던 전원(V₃·V_ref)과
//   가변저항이 생기고 두 OPAMP 배선이 무너진** 회로가 생성됐다.
//   ★ 사용자 지정: 1단 비반전(+) 입력을 **3입력**으로 확장한다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOpampTwoStageRx.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectOpampTwoStageRx } from "../lib/pipeline/runOpampTwoStageRxPipeline.ts";
import {
  generateOpampTwoStageRx, __opampTwoStageRxPoolSize, __opampTwoStageRxReferenceSolve,
} from "../lib/generation/topologies/opampTwoStageRxDesign.ts";
import { renderOpampTwoStageRxCircuit } from "../lib/renderers/opampTwoStageRxCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split("=");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [],
  componentInventory: inventory, subjectKey: "electronics", topicKey: "opamp",
});
const dispatch = (a, subject = "electronics") => {
  const t = classifyCircuitType(a, subject)?.type;
  if (t === "opamp_two_stage_rx" || detectOpampTwoStageRx(a)) return "opamp_two_stage_rx";
  return t ?? "?";
};

let pass = 0, fail = 0;
const expect = (name, a, want, subject) => {
  const got = dispatch(a, subject);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};
const expectNotStolen = (name, a, subject) => {
  const got = dispatch(a, subject);
  if (got !== "opamp_two_stage_rx") { pass++; console.log(`  ✅ ${name} → ${got} (뺏지 않음)`); }
  else { fail++; console.log(`  ❌ ${name} → 이 archetype이 가로챘다`); }
};
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const T = "opamp_two_stage_rx";

console.log("\n[1] 이 원본 — 표현이 흔들려도 opamp_two_stage_rx");
expect("원본 발문형", mk(
  "연산 증폭기 응용 회로",
  "연산 증폭기를 응용한 2단 회로에서 전압 V_X = 2[V]가 되기 위한 저항 R_X[kΩ]과 출력 전압 V_o[V]를 순서대로 구하는 문제이다. 연산 증폭기는 이상적으로 동작한다.",
  ["연산 증폭기", "가상 단락", "전압 분배", "비반전 증폭기"],
  inv("OPAMP", "OPAMP", "V=4V", "V=6V", "R=2kΩ", "R=2kΩ", "R=4kΩ", "R=2kΩ", "R=2kΩ", "R=4kΩ", "R=10kΩ"),
), T);

expect("'저항 값을 구하여' 표현", mk(
  "이상적인 연산 증폭기 회로 해석",
  "두 개의 연산 증폭기로 구성된 회로에서 중간 전압 V_X가 주어진 값이 되도록 하는 저항의 값을 구하고, 이때의 출력 전압 V_o를 구한다.",
  ["연산 증폭기", "가상 단락", "저항 설계"],
  inv("OPAMP", "OPAMP", "V=2V", "V=6V", "R=1kΩ", "R=2kΩ", "R=4kΩ", "R=2kΩ", "R=2kΩ", "R=4kΩ"),
), T);

expect("과목이 회로이론으로 잘못 선택돼도", mk(
  "연산 증폭기 2단 회로",
  "연산 증폭기 2단 회로에서 V_X = 3[V]가 되기 위한 저항 R_X를 구하고 출력 전압 V_o를 구한다.",
  ["연산 증폭기", "저항", "출력 전압"],
  inv("OPAMP", "OPAMP", "V=4V", "V=8V", "R=2kΩ", "R=2kΩ", "R=4kΩ", "R=2kΩ", "R=2kΩ", "R=4kΩ"),
), T, "circuit_theory");

console.log("\n[2] 형제 회귀 — 다른 OPAMP 유형을 뺏지 않는다");
expectNotStolen("opamp_two_stage (V_P given → V_i·V_o)", mk(
  "2단 연산 증폭기 회로",
  "비반전 증폭기와 반전 증폭기가 연결된 2단 회로에서 중간 전압 V_P가 주어질 때 입력 전압 V_i와 출력 전압 V_o를 순서대로 구한다.",
  ["연산 증폭기", "비반전 증폭기", "반전 증폭기"],
  inv("OPAMP", "OPAMP", "V=1V", "R=1kΩ", "R=1kΩ", "R=10kΩ", "R=7kΩ"),
));
expectNotStolen("능동 저역통과 필터(대역폭)", mk(
  "1차 능동 저역통과 필터",
  "연산 증폭기와 커패시터로 구성된 1차 저역통과 필터에서 커패시터를 바꿀 때 대역폭(차단 주파수)의 변화를 구한다.",
  ["저역통과 필터", "대역폭", "차단 주파수"],
  inv("OPAMP", "R=50kΩ", "C=8nF"),
));
expectNotStolen("함수발생기(비정현파 발진기)", mk(
  "비정현파 발진기",
  "슈미트 트리거 비교기와 적분기로 구성된 비정현파 발진기에서 구형파와 삼각파의 진폭과 발진 주파수를 구한다.",
  ["발진기", "비교기", "적분기"],
  inv("OPAMP", "OPAMP", "R=10kΩ", "R=20kΩ", "C=0.01µF"),
));
expectNotStolen("OPAMP 직렬형 정전압(제너)", mk(
  "제너 다이오드와 연산 증폭기 정전압 회로",
  "제너 다이오드 기준 전압과 오차 증폭기(연산 증폭기), 직렬 패스 트랜지스터로 구성된 정전압 안정화 회로에서 출력 전압과 전류를 구한다.",
  ["정전압", "제너 다이오드", "오차 증폭기"],
  inv("OPAMP", "D=10V", "R=20kΩ", "R=20kΩ"),
));

console.log("\n[3] 물리 — 3입력 합성 공식 + 생성물 독립 재검산");
{
  // 3입력 동일값(6V/4k ×3) = 단일 6V/(4/3)k 와 등가 → V₊=3일 때 R_X = 4/3 kΩ
  const ref = __opampTwoStageRxReferenceSolve({
    V1: 4, Ra: 2, Rb: 2, ins: [{ v: 6, r: 4 }, { v: 6, r: 4 }, { v: 6, r: 4 }],
    Rd: 2, Re: 2, Rf: 2, Rg: 4, Vx: 2,
  });
  ok("V₊ = 3 (1단 가상단락)", ref.answer.Vplus === 3, `→ ${ref.answer.Vplus}`);
  ok("3입력 병렬(6V/4k×3) → R_X = 4/3 kΩ", Math.abs(ref.answer.Rx - 4 / 3) < 2e-3, `→ ${ref.answer.Rx}`);
  ok("V_o = 3 [V] (2단 비반전 ×3, V₊₂=1)", ref.answer.Vo === 3, `→ ${ref.answer.Vo}`);
  ok(`생성 풀 ${__opampTwoStageRxPoolSize()}개`, __opampTwoStageRxPoolSize() >= 100);
}
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0, checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateOpampTwoStageRx({ seed, mode });
    const v = g.values, a = g.answer;
    const near = (x, y) => Math.abs(x - y) < 1e-6;
    // 독립 재계산 ①: (+) 마디 KCL로 V₊를 다시 구한다 — Σ(V_i−V₊)/R_i = V₊/R_X
    const lhs = v.plusInputs.reduce((s, x) => s + (x.v - a.Vplus) / x.r, 0);
    if (!near(lhs, a.Vplus / a.Rx)) { bad++; console.log(`    ❌ ${mode} seed${seed} (+)마디 KCL 불일치 ${lhs} vs ${a.Vplus / a.Rx}`); continue; }
    // ②: (−) 마디 KCL → V_X
    const vx = a.Vplus * (1 + v.Rb / v.Ra) - v.V1 * (v.Rb / v.Ra);
    if (!near(vx, a.Vx)) { bad++; console.log(`    ❌ ${mode} seed${seed} V_X ${a.Vx} ≠ ${vx}`); continue; }
    // ③: 2단 비반전 증폭
    const vp2 = (a.Vx * v.Re) / (v.Rd + v.Re);
    const vo = (1 + v.Rg / v.Rf) * vp2;
    if (!near(vp2, a.Vplus2) || !near(vo, a.Vo)) { bad++; console.log(`    ❌ ${mode} seed${seed} V_o ${a.Vo} ≠ ${vo}`); continue; }
    // 형식: R_X 양의 정수, 입력 3개, V_o 정수
    if (!(Number.isInteger(a.Rx) && a.Rx >= 1)) { bad++; console.log(`    ❌ ${mode} seed${seed} R_X=${a.Rx}`); continue; }
    if (v.plusInputs.length !== 3) { bad++; console.log(`    ❌ ${mode} seed${seed} +입력 ${v.plusInputs.length}개`); continue; }
    if (!Number.isInteger(a.Vo)) { bad++; console.log(`    ❌ ${mode} seed${seed} V_o 비정수`); continue; }
    checked++;
  }
  ok(`${mode} 12개 재검산 (통과 ${checked})`, bad === 0 && checked === 12);
}

console.log("\n[4] 렌더 구조 — OPAMP 2개·3입력·R_X 점선·V_X/V_o");
{
  const g = generateOpampTwoStageRx({ seed: 2, mode: "exam_similar" });
  const svg = renderOpampTwoStageRxCircuit(g.circuitDiagram);
  ok("SVG 생성", svg.startsWith("<svg") && !svg.includes("<pre>"));
  ok("OPAMP 2개(삼각형)", (svg.match(/<polygon/g) ?? []).length === 2);
  ok("U₁·U₂ 라벨", svg.includes("U₁") && svg.includes("U₂"));
  ok("★(+) 입력 3개(V₂·V₃·V₄)", svg.includes("V_2") && svg.includes("V_3") && svg.includes("V_4"));
  ok("3입력 저항 라벨 3개 모두", g.circuitDiagram.plusInputs.every((p) => svg.includes(p.rLabel)));
  ok("R_X 점선 박스", svg.includes("stroke-dasharray=\"5 3\"") && svg.includes("R_X"));
  ok("V_X·V_o 라벨", svg.includes("V_X[V]") && svg.includes("V_o[V]"));
}
{
  // ★ 라벨 겹침 회귀 (사용자 신고 2026-08-02 "수치들이 서로 너무 겹쳐서 못알아보겠어").
  //   3입력 확장으로 좌측이 빽빽해져 전원·저항 라벨이 서로 덮었다 → 행/열 분리 후 전 조합 재검사.
  let over = 0;
  const samples = [];
  for (const mode of ["exam_similar", "exam_variant"]) for (let seed = 1; seed <= 8; seed++) {
    const g = generateOpampTwoStageRx({ seed, mode });
    const hits = findLabelOverlaps(renderOpampTwoStageRxCircuit(g.circuitDiagram));
    if (hits.length) { over++; samples.push(`${mode}#${seed}: ${JSON.stringify(hits[0])}`); }
  }
  ok(`라벨 겹침 0건 (16 케이스)`, over === 0, `→ ${over}건 ${samples[0] ?? ""}`);
}

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail === 0 ? 0 : 1);
