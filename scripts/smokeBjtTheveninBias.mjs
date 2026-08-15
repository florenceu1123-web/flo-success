/**
 * BJT 바이어스 + 베이스망 테브난 등가 → I_B·V_B → R_C (임용 10번 전자회로) 정적 스모크.
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeBjtTheveninBias.mjs
 *
 * 라우팅(감지기·분류기·형제 양보) + 원본 물리 + 생성물 독립 재검산 + 렌더 구조(2 figure).
 */
import { detectBjtTheveninBias } from "../lib/pipeline/runBjtTheveninBiasPipeline.ts";
import { detectBjtSwitchLogicGate } from "../lib/pipeline/runBjtSwitchLogicGatePipeline.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  generateBjtTheveninBias,
  __originalBjtTheveninBiasForVerify,
  __bjtTheveninBiasPoolSize,
} from "../lib/generation/topologies/bjtTheveninBias.ts";
import { renderBjtTheveninBiasCircuit } from "../lib/renderers/bjtTheveninBiasCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [], componentInventory: [], ...o });
const inv = (...items) => items.map((v, i) => ({ id: `c${i}`, type: v.split(":")[0], value: v.split(":")[1] }));

console.log("\n[1] 감지 — 실측 Vision 요약 + 표현 변형");
const positives = [
  ["원본 발문", A({
    topic: "BJT 바이어스 회로 해석",
    interpretation: "BJT 증폭기의 직류 바이어스 회로에서 점선 부분을 테브난 등가 회로로 변경하고, 등가 저항 R_T와 베이스 전류 I_B, 전압 V_B를 구한 뒤 V_CE가 주어진 값이 되도록 하는 저항 R_C를 구한다.",
    relatedConcepts: ["BJT 바이어스", "테브난 등가", "베이스 전류", "직류 해석"],
    componentInventory: inv("BJT:", "R:820Ω", "V:8V", "R:2kΩ", "V:8V", "R:2kΩ", "V:10V", "R:1kΩ", "R:0.1kΩ", "I:100mA"),
  })],
  // ★ 실측 요약 (2026-08-02) — Vision이 **"테브난"·"점선"을 통째로 누락**했다(2/2). 낱말에 의존하면
  //   generic bjt_bias(임용 7번 저항률 유형)가 가져간다 → 구조(전류원·전원 3개)로 잡아야 한다.
  ["실측 요약 (테브난·점선 낱말 누락)", A({
    topic: "BJT 바이어스 회로 해석",
    interpretation: "이 문제는 BJT의 직류 바이어스 회로를 분석하여 각 단계를 통해 저항 값을 구하는 문제입니다. 주어진 조건에서 BJT의 베이스 전압과 전류를 계산하고, 특정 전압 조건을 만족시키기 위한 저항 값을 찾는 과정입니다.",
    relatedConcepts: ["BJT 바이어스", "직류 해석", "베이스 전류", "베이스-이미터 전압", "전압 분배기", "전류 이득"],
    componentInventory: inv("BJT:", "R:820Ω", "V:8V", "R:2kΩ", "V:8V", "R:2kΩ", "V:10V", "R:1kΩ", "R:0.1kΩ", "I:100mA"),
  })],
  ["테브난 낱말만", A({
    topic: "트랜지스터 직류 바이어스",
    interpretation: "베이스 쪽 두 전원 가지를 테브난 등가로 합쳐 베이스 전류를 구한다. V_BE = 0.7V, 전류이득 100.",
    componentInventory: inv("BJT:", "R:2kΩ"),
  })],
  ["점선 부분 표현", A({
    topic: "BJT 응용 회로",
    interpretation: "점선 부분을 등가 회로로 바꾼 뒤 베이스 전류 I_B와 전압 V_B를 구하고 컬렉터 저항을 구한다. 바이어스 해석 문제이다.",
    componentInventory: inv("BJT:"),
  })],
];
for (const [n, a] of positives) ok(`감지 ${n}`, detectBjtTheveninBias(a) === true);

console.log("\n[2] 형제 미탈취 (양보)");
const negatives = [
  ["bjt_bias 저항률 유형 (임용 7번)", A({
    topic: "BJT 바이어스와 저항률",
    interpretation: "저항률 ρ와 단면적·길이로 저항을 구하고, 그 저항으로 교체한 뒤 컬렉터 전류와 출력 전압을 구한다. 테브난 등가를 이용한다.",
    componentInventory: inv("BJT:", "R:8kΩ"),
  })],
  ["BJT 스위치 → 논리게이트 (임용 2번)", A({
    topic: "BJT 스위칭 회로",
    interpretation: "트랜지스터를 이상적 스위치로 보고 진리표의 출력을 구한 뒤 동일 동작 논리게이트를 그린다.",
    componentInventory: inv("BJT:"),
  })],
  ["제너+BJT 레귤레이터", A({
    topic: "정전압 회로",
    interpretation: "제너다이오드와 트랜지스터로 구성된 레귤레이터에서 출력 전압과 전류를 구한다. 바이어스 해석 포함.",
    componentInventory: inv("BJT:", "D:"),
  })],
  ["테브난이지만 BJT 없음", A({
    topic: "직류 테브난 등가",
    interpretation: "두 전압원 병렬 가지를 테브난 등가로 바꿔 R_T와 V_T를 구한다.",
    componentInventory: inv("V:12V", "R:2kΩ"),
  })],
  ["BJT 특성곡선", A({
    topic: "BJT 출력 특성곡선",
    interpretation: "출력 특성 곡선에서 동작점과 바이어스 영역을 식별한다. 테브난 등가 회로 개념도 언급된다.",
    componentInventory: inv("BJT:"),
  })],
];
for (const [n, a] of negatives) ok(`양보 ${n}`, detectBjtTheveninBias(a) === false);

console.log("\n[3] 분류기 — 전용 타입 + 형제 회귀");
{
  const cls = classifyCircuitType(positives[0][1], "electronics");
  ok("원본 → bjt_thevenin_bias", cls.type === "bjt_thevenin_bias", `got ${cls.type}`);
  const sib = classifyCircuitType(negatives[1][1], "electronics");
  ok("BJT 스위치 원본 → bjt_switch_logic_gate 유지", sib.type === "bjt_switch_logic_gate", `got ${sib.type}`);
  ok("형제 감지기가 내 원본을 안 가져감", detectBjtSwitchLogicGate(positives[0][1]) === false);
}

console.log("\n[4] 원본 물리 (V_EE=8V·R_E=820Ω / 2kΩ+(−8V) ∥ 2kΩ+(+10V) / 1kΩ·0.1kΩ·100mA·V_CE=3.8V)");
{
  const o = __originalBjtTheveninBiasForVerify();
  ok("R_T = 1 kΩ", o.answer.Rt === 1, String(o.answer.Rt));
  ok("V_T = 1 V", o.answer.Vt === 1, String(o.answer.Vt));
  ok("I_B = 100 µA", o.answer.IbUa === 100, String(o.answer.IbUa));
  ok("V_B = 0.9 V", o.answer.Vb === 0.9, String(o.answer.Vb));
  ok("V_E = 0.2 V", o.answer.Ve === 0.2, String(o.answer.Ve));
  ok("I_C = 10 mA", o.answer.Ic === 10, String(o.answer.Ic));
  ok("V_M = 9 V", o.answer.Vm === 9, String(o.answer.Vm));
  ok("R_C = 1 kΩ", o.answer.Rc === 1, String(o.answer.Rc));
}

console.log("\n[5] 생성물 독립 재검산 (24개)");
{
  let bad = 0, origHit = 0;
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const mode = i % 2 ? "exam_variant" : "exam_similar";
    const g = generateBjtTheveninBias({ seed: 400 + i * 37, mode });
    const v = g.values, a = g.answer;
    // 독립 재계산
    const Rt = 1 / (1 / v.R1 + 1 / v.R2);
    const Vt = (v.V1 / v.R1 + v.V2 / v.R2) * Rt;
    const Ib = (Vt + v.Vee - v.Vbe) / (Rt + v.beta * v.Re);
    const Vb = Vt - Ib * Rt;
    const Ic = v.beta * Ib;
    const Ve = -v.Vee + Ic * v.Re;
    const Vc = Ve + v.Vce;
    const Vm = v.Rm * (v.Is - Ic);
    const Rpar = (Vm - Vc) / Ic;
    const Rc = (v.Rp * Rpar) / (v.Rp - Rpar);
    // 생성기는 표시용으로 3자리 반올림(r3)하므로 그 정도 오차는 허용한다.
    const near = (x, y) => Math.abs(x - y) < 2e-3;
    if (!near(Rt, a.Rt) || !near(Vt, a.Vt)) bad++;
    else if (!near(Ib, a.Ib) || !near(Vb, a.Vb)) bad++;
    else if (!near(Ic, a.Ic) || !near(Ve, a.Ve) || !near(Vm, a.Vm)) bad++;
    else if (!near(Rc, a.Rc)) bad++;
    // 답의 깔끔함
    if (!Number.isInteger(a.IbUa)) bad++;
    if (Math.abs(a.Rc * 2 - Math.round(a.Rc * 2)) > 1e-6) bad++;
    if (a.Rc <= 0) bad++;
    // 활성영역 sanity — V_CE > 0.2V, I_C < I_S
    if (v.Vce <= 0.2 || a.Ic >= v.Is) bad++;
    if (v.Vee === 8 && v.Re === 0.82 && v.R1 === 2 && v.V1 === -8 && v.V2 === 10 &&
        v.Rp === 1 && v.Rm === 0.1 && v.Is === 100 && v.Vce === 3.8) origHit++;
    seen.add(`${v.Vee}-${v.Re}-${v.R1}-${v.V1}-${v.V2}-${v.Rp}-${v.Rm}-${v.Is}-${v.Vce}`);
  }
  ok("24개 모두 3단계 물리 재검산 일치", bad === 0, `bad=${bad}`);
  ok("원본 튜플 미생성", origHit === 0);
  ok("서로 다른 문제가 생성됨", seen.size >= 8, `distinct=${seen.size}`);
  ok("생성 풀이 충분", __bjtTheveninBiasPoolSize() >= 20, `pool=${__bjtTheveninBiasPoolSize()}`);
}

console.log("\n[6] 렌더 구조 — (가) 원본 / (나) 테브난 등가");
{
  const g = generateBjtTheveninBias({ seed: 12, mode: "exam_similar" });
  for (const [name, diag] of [["(가)", g.circuitDiagram], ["(나)", g.equivDiagram]]) {
    const svg = renderBjtTheveninBiasCircuit(diag);
    ok(`${name} SVG 생성`, svg.startsWith("<svg") && svg.includes("</svg>"));
    ok(`${name} 트랜지스터 1개`, (svg.match(/<circle[^>]*r="26"/g) ?? []).length === 1);
    ok(`${name} V_B·I_B·V_CE 표기`, svg.includes(">V_B</text>") && svg.includes(">I_B</text>") && svg.includes(">V_CE</text>"));
    ok(`${name} 점선 박스 1개`, (svg.match(/stroke-dasharray="5 4"/g) ?? []).length === 1);
    const overlaps = findLabelOverlaps(svg);
    ok(`${name} 라벨 겹침 0`, overlaps.length === 0, overlaps.slice(0, 2).map((o) => `${o.a}↔${o.b}`).join(", "));
  }
  // (가)에는 두 전원 가지, (나)에는 R_T·V_T
  const a = renderBjtTheveninBiasCircuit(g.circuitDiagram);
  const b = renderBjtTheveninBiasCircuit(g.equivDiagram);
  ok("(가)에 베이스 저항 2개", (a.match(new RegExp(esc(g.circuitDiagram.r1Label), "g")) ?? []).length >= 1);
  ok("(나)에 R_T·V_T 표기", b.includes(">R_T</text>") && b.includes(">V_T</text>"));
  ok("(나)에는 베이스 전원 가지가 하나", !b.includes(">" + esc(g.circuitDiagram.v2Label) + "</text>"));
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function esc(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
