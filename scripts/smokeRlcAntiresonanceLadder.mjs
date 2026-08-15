// 임용 16번 — 병렬 LC 반공진 RLC 사다리 (rlc_antiresonance_ladder)
//   ★ 재검산은 닫힌형이 아니라 **복소수 사다리 해석**을 직접 해서 대조한다.
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { __spaces, generateRlcAntiresonanceLadder, matchesRlcAntiresonanceLadder, solveRlcAnti }
  from "../lib/generation/topologies/rlcAntiresonanceLadder.ts";
import { detectRlcAntiresonanceLadder, runRlcAntiresonanceLadderPipeline }
  from "../lib/pipeline/runRlcAntiresonanceLadderPipeline.ts";
import { renderRlcAntiresonanceLadderCircuit } from "../lib/renderers/rlcAntiresonanceLadderCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv, tags: [], learningObjective: {} });
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });
const FULL = inv("V:50√2cos1000t", "R:9Ω", "R:1Ω", "L:10mH", "L:2mH", "C:500µF", "C:500µF", "C:500µF");

const POS = [
  ["실측 요약", mk("RLC 회로의 정상상태 전류",
    "그림은 RLC 회로이다. 정상상태 전류 i(t)[A]의 값을 구한다.", ["정상상태", "페이저"], FULL)],
  ["반공진 언급", mk("병렬 공진을 포함한 RLC 회로",
    "오른쪽 인덕터와 커패시터가 병렬 공진(반공진)을 이루는 교류 회로에서 정상상태 전류를 구한다.", [], inv("V:x"))],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesRlcAntiresonanceLadder(a) === true);
  ok(`안전망: ${n}`, detectRlcAntiresonanceLadder(a) === true);
  for (const s of ["circuit_theory", "electronics"]) ok(`분류 ${s}: ${n}`, classifyCircuitType({ ...a, subjectKey: s }, s)?.type === "rlc_antiresonance_ladder");
}
const NEG = [
  ["임용 15번 (직류 전류원)", mk("교류 전압원과 직류 전류원 회로", "커패시터 양단 전압의 정상상태 값을 구한다.", [], inv("V:12cos8t", "I:1A", "R:4Ω", "R:2Ω", "L:3/4H", "L:1/4H", "C:1/16F"))],
  ["공진·대역폭", mk("직렬 RLC 공진과 대역폭", "공진 주파수와 대역폭 β를 구한다.", [], inv("V:10V", "R:5Ω", "L:2mH", "C:5µF"))],
  ["스위치 과도", mk("스위치 RLC 과도", "스위치가 t=0에 닫힌 뒤 과도 응답을 구한다.", [], inv("V:10V", "R:4Ω", "L:1H", "C:0.5F", "SW"))],
  ["테브난 최대전력", mk("교류 테브난 최대 전력 전달", "테브난 등가와 최대 전력 전달 부하를 구한다.", [], inv("V:10V", "R:4Ω", "L:1H", "C:0.5F"))],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesRlcAntiresonanceLadder(a) === false);
  ok(`양보(분류) ${n}`, classifyCircuitType({ ...a, subjectKey: "circuit_theory" }, "circuit_theory")?.type !== "rlc_antiresonance_ladder");
}

// 원본 물리
{
  const o = __spaces.ORIGINAL, s = solveRlcAnti(o);
  ok("원본 R_tot=10", Math.abs(s.Rtot - 10) < 1e-12);
  ok("원본 ωL₁=10", Math.abs(s.XL1 - 10) < 1e-9);
  ok("원본 ωL₂=2 (=1/ωC₃)", Math.abs(s.XL2 - 2) < 1e-9 && Math.abs(1 / (o.w * o.C3) - 2) < 1e-9);
  ok("원본 |I|=5", Math.abs(s.Imag - 5) < 1e-9, String(s.Imag));
  ok("원본 P=125W", Math.abs(s.P - 125) < 1e-9);
}

// 생성물 독립 재검산 — 사다리를 복소수로 직접 푼다
const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
const cabs = (a) => Math.hypot(a.re, a.im);
let bad = 0, dup = 0, checked = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 20; seed++) {
    const g = generateRlcAntiresonanceLadder({ seed: seed * 7919, index: seed % 3, mode });
    const v = g.values, s = g.sol; checked++;
    if (JSON.stringify(v) === JSON.stringify(__spaces.ORIGINAL)) dup++;
    // 반공진 확인: ωL₂ 와 1/(ωC₃)가 같아야 한다
    if (Math.abs(v.w * v.L2 - 1 / (v.w * v.C3)) > 1e-9) bad++;
    // 우측이 개방이므로 Z = R_tot + jωL₁
    const Z = cadd({ re: v.R1 + v.R2, im: 0 }, { re: 0, im: v.w * v.L1 });
    const I = cdiv({ re: v.Vm, im: 0 }, Z);
    if (Math.abs(cabs(I) - s.Imag) > 1e-9) bad++;
    if (Math.abs(Math.atan2(I.im, I.re) + Math.PI / 4) > 1e-9) bad++;   // 정확히 −45°
    if (Math.abs(0.5 * s.Imag * s.Imag * s.Rtot - s.P) > 1e-9) bad++;
  }
}
ok("생성물 = 복소수 직접 해석", bad === 0, `${bad}/${checked}`);
ok("원본 튜플 미생성", dup === 0);
ok("값 공간 충분", __spaces.SPACE.length > 200, `${__spaces.SPACE.length}`);

const CHOICE = /[①②③④⑤]|고르시오|고른\s*것은|보기\s*중/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runRlcAntiresonanceLadderPipeline({ analysis: null, mode, count: 1, topicKey: "rlc_response" });
  ok(`3단계 (${mode})`, [1, 2, 3].every((k) => p.question.includes(`[단계 ${k}]`) && p.answer.includes(`[단계 ${k}]`)));
  ok(`보기 없음 (${mode})`, !CHOICE.test(p.question) && !CHOICE.test(p.answer));
  ok(`반공진 설명 (${mode})`, p.answer.includes("반공진") && p.solution.includes("개방"));
  ok(`figure 전용 (${mode})`, p.figureVariants[0].diagramType === "rlc_antiresonance_ladder_circuit");
  ok(`구하는 양 (${mode})`, mode === "exam_similar" ? /i\(t\) = /.test(p.answer) : /P = /.test(p.answer));
  const svg = renderRlcAntiresonanceLadderCircuit(p.figureVariants[0].diagram);
  ok(`렌더 겹침 0 (${mode})`, findLabelOverlaps(svg).length === 0);
  ok(`렌더 i(t) (${mode})`, svg.includes("i(t)"));
}
console.log(`\n${fail === 0 ? "✅" : "❌"} rlc_antiresonance_ladder smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
