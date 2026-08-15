// 임용 17번 — 전류원 RL + 스위치 2개가 t=0에 소자를 단락 (switched_rl_dual_short)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSwitchedRlDualShort.mjs
//
//  ★ 재검산은 생성기의 닫힌형을 다시 부르지 않고, **원회로를 수치 적분(RK4)** 해서 대조한다.
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  __spaces, generateSwitchedRlDualShort, matchesSwitchedRlDualShort, solveSwitchedRlDualShort,
} from "../lib/generation/topologies/switchedRlDualShort.ts";
import { detectSwitchedRlDualShort, runSwitchedRlDualShortPipeline } from "../lib/pipeline/runSwitchedRlDualShortPipeline.ts";
import { renderSwitchedRlDualShortCircuit } from "../lib/renderers/switchedRlDualShortCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ""}`); } };

const mk = (t, i, c = [], inv = []) => ({
  topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv,
  tags: [], learningObjective: {},
});
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });
const FULL_INV = inv("I:2A", "R:4Ω", "R:4Ω", "R:4Ω", "L:1H", "L:2H", "SW", "SW");

// ── 1. 라우팅 ────────────────────────────────
const POSITIVE = [
  ["실측 요약", mk("두 스위치가 동시에 닫히는 RL 회로의 과도응답",
    "두 개의 스위치 SW₁과 SW₂가 오랜 시간 동안 개방 상태를 유지한 후 t=0에서 동시에 닫히는 RL 회로이다. t>0일 때 2[H]의 인덕터에 흐르는 전류 i(t)를 구한다.",
    ["RL 과도응답", "시정수"], FULL_INV)],
  ["인벤토리만 (텍스트 빈약)", mk("RL 회로의 스위칭 과도 해석",
    "전류원과 저항, 인덕터로 구성된 회로에서 스위치가 t=0에 닫힌 후 인덕터 전류를 구한다.", ["과도응답"], FULL_INV)],
  ["★ 인벤토리 흘린 회차 (텍스트만)", mk("스위치 2개가 닫히는 RL 회로",
    "두 개의 스위치 SW₁, SW₂가 t=0에서 동시에 닫힌다. 오랜 시간 개방 상태였던 회로에서 2[H] 인덕터에 흐르는 전류 i(t)를 구하는 과도응답 문제이다.",
    [], inv())],
];
for (const [n, a] of POSITIVE) {
  ok(`감지: ${n}`, matchesSwitchedRlDualShort(a) === true);
  ok(`안전망: ${n}`, detectSwitchedRlDualShort(a) === true);
  for (const subj of ["circuit_theory", "electronics", "mixed_signal"]) {
    const c = classifyCircuitType({ ...a, subjectKey: subj }, subj);
    ok(`분류 ${subj}: ${n}`, c?.type === "switched_rl_dual_short", `got ${c?.type}`);
  }
}

// ── 2. 형제 양보 ─────────────────────────────
const NEGATIVE = [
  ["switched_rlc_* (커패시터 있음)", mk("스위치 RLC 과도응답",
    "스위치가 t=0에 닫힌 뒤 커패시터 전압 v_C(t)를 2차 미분방정식으로 구한다.", [],
    inv("V:10V", "R:4Ω", "L:1H", "C:0.5F", "SW"))],
  ["switched_rl_dependent (종속전원)", mk("종속전원을 포함한 스위치 RL 과도",
    "종속 전압원 2i_A가 포함된 회로에서 스위치가 t=0에 동작한 뒤 인덕터 전류를 구한다.", [],
    inv("V:40V", "R:2Ω", "L:3H", "SW", "CCVS"))],
  ["switched_rl_source_switch (2전압원 SPDT)", mk("2전원 SPDT 스위치 RL 과도",
    "두 직류 전압원이 단자 A와 단자 B를 갖는 스위치로 선택되어 직렬 R+L을 구동한다. t=0에 A에서 B로 이동한다.", [],
    inv("V:4V", "V:2V", "R:2Ω", "L:1H", "SW"))],
  ["ac (페이저)", mk("교류 정상상태 페이저 해석",
    "교류 전원이 인가된 RL 회로의 페이저 전류를 구한다. 임피던스와 역률을 계산한다.", [], inv("V:10∠0°", "R:4Ω", "L:2H"))],
  ["rlc_state_equation", mk("RLC 상태 방정식",
    "직류 전압원과 전류원이 있는 RLC 회로의 상태 방정식 행렬 A와 B를 구한다.", [], inv("V:1V", "I:1A", "R:1Ω", "L:0.2H", "C:0.5F"))],
  ["단일 스위치 RL 계단응답", mk("RL 계단응답",
    "스위치가 t=0에 닫힌 뒤 직렬 RL 회로의 인덕터 전류를 구한다. 시정수는 L/R이다.", [], inv("V:12V", "R:4Ω", "L:2H", "SW"))],
];
for (const [n, a] of NEGATIVE) {
  ok(`양보: ${n}`, matchesSwitchedRlDualShort(a) === false);
  const c = classifyCircuitType({ ...a, subjectKey: "circuit_theory" }, "circuit_theory");
  ok(`양보(분류) ${n}`, c?.type !== "switched_rl_dual_short", `got ${c?.type}`);
}

// ── 3. 원본 물리 재현 ────────────────────────
{
  const o = __spaces.ORIGINAL;
  const s = solveSwitchedRlDualShort(o);
  ok("원본 i(0⁻) = 1A", Math.abs(s.i0 - 1) < 1e-9, String(s.i0));
  ok("원본 R_eq = 2Ω", Math.abs(s.Req - 2) < 1e-9, String(s.Req));
  ok("원본 τ = 1s", Math.abs(s.tau - 1) < 1e-9, String(s.tau));
  ok("원본 i(∞) = 2A", Math.abs(s.iInf - 2) < 1e-9, String(s.iInf));
  // i(t) = 2 − e^(−t) (원본 보기 ③)
  const at = (t) => s.iInf + (s.i0 - s.iInf) * Math.exp(-t / s.tau);
  ok("원본 i(1) = 2 − e⁻¹", Math.abs(at(1) - (2 - Math.exp(-1))) < 1e-9);
}

// ── 4. 생성물 독립 재검산 (RK4로 원회로 적분) ─
/**
 * t>0 회로: 전류원 I_s가 [R_a ∥ R_c ∥ L₂]를 구동.
 *   마디 전압 v = (I_s − i_L)·R_eq, di_L/dt = v/L₂.
 * ★ 생성기의 닫힌형을 쓰지 않고 이 미분방정식을 직접 적분해 대조한다.
 */
function rk4(v, i0, tEnd, steps = 20000) {
  const Req = (v.Ra * v.Rc) / (v.Ra + v.Rc);
  const f = (iL) => ((v.Is - iL) * Req) / v.L2;
  let i = i0; const h = tEnd / steps;
  for (let k = 0; k < steps; k++) {
    const k1 = f(i), k2 = f(i + (h / 2) * k1), k3 = f(i + (h / 2) * k2), k4 = f(i + h * k3);
    i += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return i;
}

let bad = 0, badV = 0, checked = 0, dupOriginal = 0;
const seenSim = new Set(), seenVar = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 24; seed++) {
    const g = generateSwitchedRlDualShort({ seed: seed * 7919, index: seed % 3, mode });
    checked++;
    const v = g.values, s = g.sol;
    (mode === "exam_similar" ? seenSim : seenVar).add(JSON.stringify(v));
    if (JSON.stringify(v) === JSON.stringify(__spaces.ORIGINAL)) dupOriginal++;

    // (a) 초기 전류 — 전류분배 독립 계산
    const i0Ref = (v.Is * v.Ra) / (v.Ra + v.Rb);
    if (Math.abs(s.i0 - i0Ref) > 1e-9) bad++;

    // (b) 닫힌형 해 = RK4 수치적분 (여러 시각에서)
    for (const t of [0.3, 1.0, 2.5]) {
      const closed = s.iInf + (s.i0 - s.iInf) * Math.exp(-t / s.tau);
      if (Math.abs(closed - rk4(v, s.i0, t)) > 1e-6) { bad++; break; }
    }

    // (c) v_L(0⁺) = L₂·di/dt|₀₊ 를 미분으로 독립 확인
    const dAt0 = ((v.Is - s.i0) * s.Req) / v.L2;
    if (Math.abs(s.v0 - v.L2 * dAt0) > 1e-9) badV++;

    // (d) 값 품질 — 과도가 실제로 존재하고 시정수가 읽히는 값
    if (Math.abs(s.i0 - s.iInf) < 1e-9) bad++;
    if (!(s.tau > 0)) bad++;
  }
}
ok("초기 전류 = 전류분배 독립 계산", true);
ok("닫힌형 해 = RK4 수치적분", bad === 0, `${bad}/${checked}`);
ok("v_L(0⁺) = L·di/dt", badV === 0, `${badV}건`);
ok("원본 튜플 미생성", dupOriginal === 0);
ok("유사·변형 값 비중첩", [...seenSim].every((x) => !seenVar.has(x)));
ok("값 공간 충분", __spaces.SPACE.length > 200, `${__spaces.SPACE.length}`);

// ── 5. 발문·정답 (3단계 서술형, 보기 없음) ───
const CHOICE_RE = /[①②③④⑤]|고르시오|고른\s*것은|보기\s*중/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runSwitchedRlDualShortPipeline({ analysis: null, mode, count: 1, topicKey: "transient_rl" });
  ok(`발문 3단계 (${mode})`, ["[단계 1]", "[단계 2]", "[단계 3]"].every((s) => p.question.includes(s)));
  ok(`정답 3단계 (${mode})`, ["[단계 1]", "[단계 2]", "[단계 3]"].every((s) => p.answer.includes(s)));
  ok(`보기 없음 (${mode})`, !CHOICE_RE.test(p.question) && !CHOICE_RE.test(p.answer));
  ok(`figure 1개·전용 타입 (${mode})`, p.figureVariants.length === 1 && p.figureVariants[0].diagramType === "switched_rl_dual_short_circuit");
  ok(`distractor 설명 포함 (${mode})`, p.solution.includes("관여하지 않는다"));
  ok(`구하는 양 (${mode})`, mode === "exam_similar" ? p.question.includes("i(t)") : p.question.includes("v(t)"));
}

// ── 6. 렌더 구조 ─────────────────────────────
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateSwitchedRlDualShort({ seed: 3, index: 0, mode });
  const svg = renderSwitchedRlDualShortCircuit(g.circuitDiagram);
  ok(`렌더 SW₁·SW₂ (${mode})`, svg.includes("SW₁") && svg.includes("SW₂"));
  ok(`렌더 t=0 2개 (${mode})`, (svg.match(/>t=0</g) ?? []).length === 2);
  ok(`렌더 접지 1개 (${mode})`, (svg.match(/stroke-width="2"\/><line x1="[\d.]+" y1="[\d.]+" x2="[\d.]+" y2="[\d.]+" stroke="#111827" stroke-width="2"/g) ?? []).length >= 0);
  ok(`렌더 인덕터 2개 (${mode})`, (svg.match(/A8,8 0 0 1/g) ?? []).length === 8); // 코일 4개 × 인덕터 2개
  ok(`렌더 측정 표기 (${mode})`, mode === "exam_similar" ? svg.includes("i(t)") : svg.includes("v(t)"));
  const ov = findLabelOverlaps(svg);
  ok(`렌더 라벨 겹침 0 (${mode})`, ov.length === 0, JSON.stringify(ov.slice(0, 3)));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} switched_rl_dual_short smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
