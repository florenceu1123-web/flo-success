// 임용 17번 — 전원 크기만 다른 두 회로의 최대전력 부하 + η₁·η₂ (max_power_two_source_ratio)
//   ★ 재검산은 닫힌형이 아니라 **복소수 연산**을 직접 해서 대조한다.
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { __spaces, generateMaxPowerTwoSourceRatio, matchesMaxPowerTwoSourceRatio, solveMaxPowerTwoSource }
  from "../lib/generation/topologies/maxPowerTwoSourceRatio.ts";
import { detectMaxPowerTwoSourceRatio, runMaxPowerTwoSourceRatioPipeline }
  from "../lib/pipeline/runMaxPowerTwoSourceRatioPipeline.ts";
import { renderMaxPowerTwoSourceCircuit } from "../lib/renderers/maxPowerTwoSourceCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv, tags: [], learningObjective: {} });
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });

const POS = [
  ["실측 요약", mk("두 회로의 최대전력 부하 설계",
    "그림 (가)와 (나)의 각 회로에서 부하에 최대전력을 공급하기 위해 필요한 부하 저항과 인덕턴스를 구한다. 각 부하에 공급되는 최대전력을 P_max1, P_max2라 할 때 두 비를 구한다.",
    ["최대전력", "켤레 정합"], inv("V", "V", "R", "L", "C"))],
  ["η 기호 표기", mk("최대전력 전달과 부하 설계",
    "두 회로에서 최대전력을 공급하기 위한 부하 임피던스를 구하고 η₁과 η₂의 값을 구한다.", [], inv())],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesMaxPowerTwoSourceRatio(a) === true);
  ok(`안전망: ${n}`, detectMaxPowerTwoSourceRatio(a) === true);
  for (const s of ["circuit_theory", "electronics"]) ok(`분류 ${s}: ${n}`, classifyCircuitType({ ...a, subjectKey: s }, s)?.type === "max_power_two_source_ratio");
}
const NEG = [
  ["단일 회로 테브난 최대전력", mk("테브난 등가와 최대 전력", "단자 a-b에서 테브난 등가 회로로 변환하고 최대 전력을 전달하는 부하 저항을 구한다.", [], inv("V", "R", "L"))],
  ["AC 브리지 최대전력", mk("교류 브리지 최대평균전력", "브리지 회로의 테브난 등가를 구하고 최대평균전력을 구한다.", [], inv("V", "R", "L", "C"))],
  ["Δ-Y 등가 임피던스", mk("교류 브리지 Δ-Y 변환", "델타를 Y로 변환하여 등가 임피던스를 구한다.", [], inv("V", "R", "L", "C"))],
  ["공진 대역폭", mk("직렬 RLC 공진과 대역폭", "공진 주파수와 대역폭을 구한다.", [], inv("V", "R", "L", "C"))],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesMaxPowerTwoSourceRatio(a) === false);
  ok(`양보(분류) ${n}`, classifyCircuitType({ ...a, subjectKey: "circuit_theory" }, "circuit_theory")?.type !== "max_power_two_source_ratio");
}

// 원본 물리
{
  const o = __spaces.ORIGINAL, s = solveMaxPowerTwoSource(o);
  ok("원본 병렬 = 3+j3", Math.abs(s.parRe - 3) < 1e-9 && Math.abs(s.parIm - 3) < 1e-9);
  ok("원본 Z_th = 3−j5", Math.abs(s.thRe - 3) < 1e-9 && Math.abs(s.thIm + 5) < 1e-9);
  ok("원본 R = 3Ω", Math.abs(s.RL - 3) < 1e-9);
  ok("원본 L = 5mH", Math.abs(s.loadElem - 0.005) < 1e-12, String(s.loadElem));
  ok("원본 P₁ = 24W", Math.abs(s.P1 - 24) < 1e-9, String(s.P1));
  ok("원본 P₂ = 96W", Math.abs(s.P2 - 96) < 1e-9, String(s.P2));
  ok("원본 η₁ = 4, η₂ = 2", s.eta1 === 4 && s.eta2 === 2);
}

// 생성물 독립 재검산 (복소수)
const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
let bad = 0, checked = 0, dup = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 20; seed++) {
    const g = generateMaxPowerTwoSourceRatio({ seed: seed * 7919, index: seed % 3, mode });
    const v = g.values, s = g.sol; checked++;
    if (!v.dual && JSON.stringify(v) === JSON.stringify(__spaces.ORIGINAL)) dup++;
    const jx = { re: 0, im: (v.dual ? -1 : 1) * v.Xp };
    const par = cdiv(cmul({ re: v.Rp, im: 0 }, jx), cadd({ re: v.Rp, im: 0 }, jx));
    const zth = cadd(par, { re: 0, im: v.dual ? v.Xs : -v.Xs });
    if (Math.abs(zth.re - s.RL) > 1e-9 || Math.abs(Math.abs(zth.im) - s.XL) > 1e-9) bad++;
    // 켤레 정합 → 전체 임피던스가 순저항 2R
    const tot = cadd(zth, { re: s.RL, im: -zth.im });
    if (Math.abs(tot.im) > 1e-9 || Math.abs(tot.re - 2 * s.RL) > 1e-9) bad++;
    // P = |V|²/(8R)
    if (Math.abs(s.P1 - (v.V1 * v.V1) / (8 * s.RL)) > 1e-9) bad++;
    if (Math.abs(s.eta1 - v.k * v.k) > 1e-12 || s.eta2 !== 2) bad++;
    // 부하 소자 값이 리액턴스와 일치
    const x = v.dual ? 1 / (v.w * s.loadElem) : v.w * s.loadElem;
    if (Math.abs(x - s.XL) > 1e-9) bad++;
  }
}
ok("생성물 = 복소수 직접 연산", bad === 0, `${bad}/${checked}`);
ok("원본 튜플 미생성", dup === 0);
ok("값 공간 충분", __spaces.SIMILAR_SPACE.length > 30 && __spaces.VARIANT_SPACE.length > 30,
  `${__spaces.SIMILAR_SPACE.length}/${__spaces.VARIANT_SPACE.length}`);

const CHOICE = /[①②③④⑤]|고르시오|고른\s*것은|보기\s*중/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runMaxPowerTwoSourceRatioPipeline({ analysis: null, mode, count: 1, topicKey: "rlc_response" });
  ok(`3단계 (${mode})`, [1, 2, 3].every((k) => p.question.includes(`[단계 ${k}]`) && p.answer.includes(`[단계 ${k}]`)));
  ok(`보기 없음 (${mode})`, !CHOICE.test(p.question) && !CHOICE.test(p.answer));
  ok(`figure 2개 (${mode})`, p.figureVariants.length === 2 && p.figureVariants.every((f) => f.diagramType === "max_power_two_source_circuit"));
  ok(`켤레 정합 서술 (${mode})`, p.answer.includes("켤레 정합"));
  ok(`전원 무관 설명 (${mode})`, p.solution.includes("전원 크기와 전혀 무관"));
  ok(`η₁·η₂ (${mode})`, /η₁ = /.test(p.answer) && /η₂ = /.test(p.answer));
  ok(`구하는 소자 (${mode})`, mode === "exam_similar" ? p.content.includes("인덕턴스") : p.content.includes("정전용량"));
  for (const f of p.figureVariants) {
    const svg = renderMaxPowerTwoSourceCircuit(f.diagram);
    ok(`렌더 겹침 0 (${mode}/${f.id})`, findLabelOverlaps(svg).length === 0);
    ok(`렌더 부하 점선 (${mode}/${f.id})`, svg.includes("stroke-dasharray") && svg.includes("부하"));
  }
}
console.log(`\n${fail === 0 ? "✅" : "❌"} max_power_two_source_ratio smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
