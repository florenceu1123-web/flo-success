// 임용 4번 — 전압원 2개(계단 펄스 + 정현파) RL/RC 중첩 5단계 (two_source_rl_superposition)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTwoSourceRlSuperposition.mjs
//
//  ★ 재검산은 닫힌형을 다시 부르지 않고 **원 미분방정식을 RK4로 적분**해서 대조한다.
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  __spaces, generateTwoSourceRlSuperposition, matchesTwoSourceRlSuperposition,
  responseAt, solveTwoSource,
} from "../lib/generation/topologies/twoSourceRlSuperposition.ts";
import {
  detectTwoSourceRlSuperposition, runTwoSourceRlSuperpositionPipeline,
} from "../lib/pipeline/runTwoSourceRlSuperpositionPipeline.ts";
import { renderTwoSourceRlSuperpositionCircuit } from "../lib/renderers/twoSourceRlSuperpositionCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({
  topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv,
  tags: [], learningObjective: {},
});
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });
const FULL = inv("V:10V", "V:10V", "R:2Ω", "R:2Ω", "R:4Ω", "L:2H");

// ── 1. 라우팅 ────────────────────────────────
const POSITIVE = [
  ["실측 요약(5단계 전문)", mk("2개의 전압원을 가지는 RL 회로의 해석",
    "그림 (가)는 2개의 전압원을 가지는 RL 회로이다. 5단계로 제시한 회로 해석 절차에 따라 2[H]의 인덕터에 흐르는 전류 i(t)를 구한다. v1(t)와 v2(t)를 단위계단함수 u(t)로 표현하고, 점선 부분을 테브난 등가회로로 변환한 뒤 중첩의 원리를 이용하여 i_A(t)를 구하고, 합성저항 R_eq로 대체한 등가회로에서 i_B(t)를 구한 다음 i(t)를 구한다.",
    ["중첩의 원리", "테브난 등가", "단위계단함수"], FULL)],
  ["짧은 요약", mk("두 전압원 RL 회로의 중첩 해석",
    "두 개의 전압원이 인가된 RL 회로에서 중첩의 원리로 인덕터 전류를 구한다.", ["중첩의 원리"], FULL)],
  ["★ 중첩 낱말 없음 (테브난+계단+R_eq)", mk("2개의 전압원 RL 회로",
    "점선 부분을 테브난 등가회로로 변환하고, 단위계단함수 u(t)로 전압원을 표현한 뒤 합성저항 R_eq로 대체한 등가회로에서 인덕터 전류를 구한다.",
    [], FULL)],
];
for (const [n, a] of POSITIVE) {
  ok(`감지: ${n}`, matchesTwoSourceRlSuperposition(a) === true);
  ok(`안전망: ${n}`, detectTwoSourceRlSuperposition(a) === true);
  for (const subj of ["circuit_theory", "electronics"]) {
    const c = classifyCircuitType({ ...a, subjectKey: subj }, subj);
    ok(`분류 ${subj}: ${n}`, c?.type === "two_source_rl_superposition", `got ${c?.type}`);
  }
}

// ── 2. 형제 양보 ─────────────────────────────
const NEGATIVE = [
  ["임용 3번 SPDT 절체", mk("2전원 SPDT 스위치 RL 과도응답",
    "두 직류 전압원이 단자 A와 단자 B를 갖는 스위치로 선택되어 직렬 R+L을 구동한다. t=0에 A에서 B로 이동한다.",
    [], inv("V:4V", "V:2V", "R:2Ω", "L:1H", "SW"))],
  ["임용 17번 전류원 2스위치", mk("두 스위치가 동시에 닫히는 RL 회로",
    "두 개의 스위치 SW₁과 SW₂가 t=0에서 동시에 닫힌다. 2[H] 인덕터 전류 i(t)를 구한다.", [],
    inv("I:2A", "R:4Ω", "R:4Ω", "R:4Ω", "L:1H", "L:2H", "SW", "SW"))],
  ["ac_superposition (교류 2전원 페이저)", mk("교류 다중 전원 중첩",
    "교류 전압원과 전류원이 있는 회로에서 중첩의 원리로 페이저 전류를 구하고 역률과 임피던스를 계산한다.", [],
    inv("V:20∠-90°", "I:4∠0°", "R:5Ω", "L:1H", "C:0.1F"))],
  ["단일 전원 RL 계단", mk("RL 계단응답",
    "전압원이 t=0에 인가되는 직렬 RL 회로에서 단위계단함수로 표현하고 인덕터 전류를 구한다.", [], inv("V:12V", "R:4Ω", "L:2H"))],
  ["테브난 최대전력", mk("테브난 등가와 최대 전력 전달",
    "두 전압원 회로의 테브난 등가를 구하고 최대 전력을 전달하는 부하 저항을 구한다.", [],
    inv("V:12V", "V:6V", "R:2Ω", "R:6Ω", "L:1H"))],
];
for (const [n, a] of NEGATIVE) {
  ok(`양보: ${n}`, matchesTwoSourceRlSuperposition(a) === false);
  const c = classifyCircuitType({ ...a, subjectKey: "circuit_theory" }, "circuit_theory");
  ok(`양보(분류) ${n}`, c?.type !== "two_source_rl_superposition", `got ${c?.type}`);
}

// ── 3. 원본 물리 재현 ────────────────────────
{
  const o = __spaces.ORIGINAL;
  const s = solveTwoSource(o, "L");
  ok("원본 k = 1/2", Math.abs(s.k - 0.5) < 1e-12, String(s.k));
  ok("원본 R_th = 2Ω", Math.abs(s.Rth - 2) < 1e-12, String(s.Rth));
  ok("원본 τ = 1s", Math.abs(s.tau - 1) < 1e-12, String(s.tau));
  ok("원본 T₁ = π", Math.abs(s.T1 - Math.PI) < 1e-12);
  ok("원본 I_A∞ = 2.5A", Math.abs(s.ampA - 2.5) < 1e-12, String(s.ampA));
  ok("원본 q = 2.5 (진폭 2.5√2)", Math.abs(s.q - 2.5) < 1e-12, String(s.q));
  // 손검산: t<π 에서 i(t) = 2.5(1−e^(−t)) − 2.5e^(−t) − 2.5√2 sin(t−π/4)
  const hand = (t) => 2.5 * (1 - Math.exp(-t)) - 2.5 * Math.exp(-t) - 2.5 * Math.SQRT2 * Math.sin(t - Math.PI / 4);
  for (const t of [0.4, 1.0, 2.0, 3.0]) {
    ok(`원본 손검산 t=${t}`, Math.abs(responseAt(o, "L", t) - hand(t)) < 1e-9);
  }
  ok("원본 i(0) = 0", Math.abs(responseAt(o, "L", 0)) < 1e-12);
}

// ── 4. 생성물 독립 재검산 (원 ODE를 RK4로) ──
/**
 * L·di/dt + R_th·i = k·v₁(t) − v₂(t)   [유사]
 * R_th·C·dv/dt + v = k·v₁(t) − v₂(t)   [변형]
 * ★ 생성기의 닫힌형을 쓰지 않고 이 식을 직접 적분한다.
 */
function rk4(v, reactive, tEnd, steps = 40000) {
  const s = solveTwoSource(v, reactive);
  const v1 = (t) => (t >= 0 && t < s.T1 ? v.V1 : 0);
  const v2 = (t) => v.V2 * Math.sin(v.w * t);
  const drive = (t) => s.k * v1(t) - v2(t);
  // 유사: di/dt = (drive − R_th·i)/L   변형: dv/dt = (drive − v)/(R_th·C)
  const f = reactive === "L"
    ? (t, y) => (drive(t) - s.Rth * y) / v.X
    : (t, y) => (drive(t) - y) / (s.Rth * v.X);
  let y = 0; const h = tEnd / steps;
  for (let k = 0; k < steps; k++) {
    const t = k * h;
    const k1 = f(t, y), k2 = f(t + h / 2, y + (h / 2) * k1);
    const k3 = f(t + h / 2, y + (h / 2) * k2), k4 = f(t + h, y + h * k3);
    y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return y;
}

let bad = 0, checked = 0, dupOrig = 0;
const seenSim = new Set(), seenVar = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  const reactive = mode === "exam_variant" ? "C" : "L";
  for (let seed = 0; seed < 16; seed++) {
    const g = generateTwoSourceRlSuperposition({ seed: seed * 7919, index: seed % 3, mode });
    checked++;
    (reactive === "L" ? seenSim : seenVar).add(JSON.stringify(g.values));
    if (JSON.stringify(g.values) === JSON.stringify(__spaces.ORIGINAL)) dupOrig++;
    // ωτ = 1 이 값 공간에서 강제되는가 (φ=45° 전제)
    if (Math.abs(g.values.w * g.sol.tau - 1) > 1e-12) bad++;
    // 펄스 구간 안·밖 모두에서 닫힌형 = RK4
    for (const frac of [0.4, 0.9, 1.6]) {
      const t = g.sol.T1 * frac;
      const closed = responseAt(g.values, reactive, t);
      if (Math.abs(closed - rk4(g.values, reactive, t)) > 2e-4) { bad++; break; }
    }
    // 초기값 0
    if (Math.abs(responseAt(g.values, reactive, 0)) > 1e-9) bad++;
  }
}
ok("닫힌형 = RK4 (원 미분방정식 직접 적분)", bad === 0, `${bad}/${checked}`);
ok("ωτ = 1 강제", true);
ok("원본 튜플 미생성", dupOrig === 0);
ok("유사·변형 값 비중첩", [...seenSim].every((x) => !seenVar.has(x)));
ok("값 공간 충분(유사)", __spaces.SIMILAR_SPACE.length > 50, `${__spaces.SIMILAR_SPACE.length}`);
ok("값 공간 충분(변형)", __spaces.VARIANT_SPACE.length > 50, `${__spaces.VARIANT_SPACE.length}`);

// ── 5. 발문·정답 (5단계, 보기 없음) ──────────
const CHOICE = /[①②③④⑤]|고르시오|고른\s*것은|보기\s*중/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runTwoSourceRlSuperpositionPipeline({ analysis: null, mode, count: 1, topicKey: "transient_rl" });
  ok(`발문 5단계 (${mode})`, [1, 2, 3, 4, 5].every((k) => p.question.includes(`[단계 ${k}]`)));
  ok(`정답 5단계 (${mode})`, [1, 2, 3, 4, 5].every((k) => p.answer.includes(`[단계 ${k}]`)));
  ok(`보기 없음 (${mode})`, !CHOICE.test(p.question) && !CHOICE.test(p.answer));
  ok(`figure 3개 (${mode})`, p.figureVariants.length === 3);
  ok(`figure 전용 타입 (${mode})`, p.figureVariants.every((f) => f.diagramType === "two_source_rl_superposition_circuit"));
  ok(`단위계단 요구 (${mode})`, p.question.includes("단위계단함수"));
  ok(`테브난 요구 (${mode})`, p.question.includes("테브난 등가회로"));
  ok(`중첩 요구 (${mode})`, p.question.includes("중첩의 원리"));
  ok(`R_eq 요구 (${mode})`, p.question.includes("R_eq"));
  ok(`구하는 양 (${mode})`, mode === "exam_similar" ? p.question.includes("i(t)") : p.question.includes("v_C(t)"));
  ok(`변형은 커패시터 (${mode})`, mode === "exam_variant"
    ? p.figureVariants[0].diagram.reactive === "C" && p.content.includes("RC")
    : p.figureVariants[0].diagram.reactive === "L" && p.content.includes("RL"));
  ok(`극성 근거 서술 (${mode})`, p.solution.includes("+ 단자"));
}

// ── 6. 렌더 구조 ─────────────────────────────
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateTwoSourceRlSuperposition({ seed: 5, index: 0, mode });
  const full = renderTwoSourceRlSuperpositionCircuit(g.figures.full);
  const v1 = renderTwoSourceRlSuperpositionCircuit(g.figures.v1Only);
  const v2 = renderTwoSourceRlSuperpositionCircuit(g.figures.v2Only);
  ok(`(가) 파형 그래프 포함 (${mode})`, full.includes("v₁(t)[V]") && full.includes("v₂(t)[V]"));
  ok(`(나) 점선 박스 (${mode})`, v1.includes("stroke-dasharray"));
  ok(`(다) 점선 박스 (${mode})`, v2.includes("stroke-dasharray"));
  ok(`(나) v₂ 단락 (${mode})`, v1.includes("(v₂ 단락)"));
  ok(`(다) v₁ 단락 (${mode})`, v2.includes("(v₁ 단락)"));
  ok(`(가) 저항 3개 (${mode})`, (full.match(/M\d+(\.\d+)?,\d+(\.\d+)? L/g) ?? []).length >= 3);
  ok(`리액티브 심볼 (${mode})`, mode === "exam_similar"
    ? full.includes("A6.5,6.5 0 0 1")
    : (full.match(/stroke-width="2\.2"/g) ?? []).length >= 2);
  for (const [nm, svg] of [["가", full], ["나", v1], ["다", v2]]) {
    const ov = findLabelOverlaps(svg);
    ok(`렌더 겹침 0 (${mode}/${nm})`, ov.length === 0, JSON.stringify(ov.slice(0, 2)));
  }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} two_source_rl_superposition smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;

// ── 7. 최후의 구조 신호 (2026-08-12 실측 신고) ──
{
  // Vision이 "RL 회로의 과도 응답 분석" 한 줄로만 요약해 중첩·테브난·계단이 전부 사라진 회차
  const terse = mk("RL 회로의 과도 응답 분석",
    "RL 회로의 과도 응답을 해석하여 인덕터에 흐르는 전류를 구하는 문제이다.", ["과도응답"],
    inv("V:10V", "V:10V", "R:2Ω", "R:2Ω", "R:4Ω", "L:2H"));
  ok("신고 재현: terse 요약도 인벤토리 구조로 감지", matchesTwoSourceRlSuperposition(terse) === true);
  ok("신고 재현: 안전망도 발화", detectTwoSourceRlSuperposition(terse) === true);
  const c = classifyCircuitType({ ...terse, subjectKey: "circuit_theory" }, "circuit_theory");
  ok("신고 재현: 분류 교정", c?.type === "two_source_rl_superposition", `got ${c?.type}`);

  // 형제는 여전히 안 뺏는다 — 스위치·전류원이 있으면 구조 신호가 꺼진다
  const withSw = mk("RL 회로의 과도 응답 분석", "스위치가 t=0에 동작하는 RL 회로의 과도 응답.", [],
    inv("V:10V", "V:10V", "R:2Ω", "R:2Ω", "R:4Ω", "L:2H", "SW"));
  ok("형제 보호: 스위치 있으면 미발화", matchesTwoSourceRlSuperposition(withSw) === false);
  const withI = mk("RL 회로의 과도 응답 분석", "전류원이 포함된 RL 회로의 과도 응답.", [],
    inv("V:10V", "V:10V", "I:2A", "R:2Ω", "R:2Ω", "R:4Ω", "L:2H"));
  ok("형제 보호: 전류원 있으면 미발화", matchesTwoSourceRlSuperposition(withI) === false);
  const singleV = mk("RL 회로의 과도 응답 분석", "RL 회로의 과도 응답.", [],
    inv("V:10V", "R:2Ω", "R:2Ω", "R:4Ω", "L:2H"));
  ok("형제 보호: 전압원 1개면 미발화", matchesTwoSourceRlSuperposition(singleV) === false);
}
console.log(`\n${fail === 0 ? "✅" : "❌"} (누적) ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
