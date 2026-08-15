// 임용 15번 — 교류 전압원 + 직류 전류원 RLC 정상상태 중첩 (ac_dc_source_superposition_vc)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcDcSourceSuperpositionVc.mjs
//
//  ★ 재검산은 생성기 닫힌형을 다시 부르지 않고 **복소수 연산을 직접** 해서 대조한다.
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  __spaces, generateAcDcSourceSuperpositionVc, matchesAcDcSourceSuperpositionVc, solveAcDcVc,
} from "../lib/generation/topologies/acDcSourceSuperpositionVc.ts";
import {
  detectAcDcSourceSuperpositionVc, runAcDcSourceSuperpositionVcPipeline,
} from "../lib/pipeline/runAcDcSourceSuperpositionVcPipeline.ts";
import { renderAcDcSourceSuperpositionCircuit } from "../lib/renderers/acDcSourceSuperpositionCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv, tags: [], learningObjective: {} });
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });
const FULL = inv("V:12cos8t", "I:1A", "R:4Ω", "R:2Ω", "L:3/4H", "L:1/4H", "C:1/16F");

// 1. 라우팅
const POS = [
  ["실측 요약", mk("교류 전압원과 직류 전류원이 포함된 회로",
    "그림은 교류 전압원과 직류 전류원이 포함된 회로이다. 커패시터 양단 전압 v_c(t)[V]의 정상상태 값을 구한다.",
    ["중첩", "정상상태"], FULL)],
  ["인벤토리만", mk("RLC 회로 해석", "회로의 정상상태 전압을 구한다.", [], FULL)],
  ["텍스트만", mk("교류 전압원과 직류 전류원 회로",
    "교류 전압원과 직류 전류원이 함께 있는 회로에서 커패시터 양단 전압의 정상상태 값을 구한다.", [], inv())],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesAcDcSourceSuperpositionVc(a) === true);
  ok(`안전망: ${n}`, detectAcDcSourceSuperpositionVc(a) === true);
  for (const s of ["circuit_theory", "electronics"]) {
    ok(`분류 ${s}: ${n}`, classifyCircuitType({ ...a, subjectKey: s }, s)?.type === "ac_dc_source_superposition_vc");
  }
}

// 2. 형제 양보
const NEG = [
  ["임용 12번 AC+DC RC", mk("AC+DC 중첩 RC 회로", "교류 전원과 직류 전압원이 포함된 RC 회로를 중첩의 원리로 해석해 단자 a-b 전류를 구한다.", [], inv("V:10V", "V:20V", "R:2k", "C:0.2u"))],
  ["스위치 과도", mk("스위치 RLC 과도응답", "스위치가 t=0에 닫힌 뒤 커패시터 양단 전압의 과도 응답을 구한다.", [], inv("V:10V", "I:1A", "R:4Ω", "L:1H", "C:0.5F", "SW"))],
  ["테브난 최대전력", mk("교류 테브난 최대 전력", "테브난 등가를 구하고 최대 전력을 전달하는 부하를 구한다.", [], inv("V:10V", "I:1A", "R:4Ω", "L:1H", "C:0.5F"))],
  ["공진", mk("RLC 공진", "공진 주파수와 대역폭을 구한다.", [], inv("V:10V", "R:4Ω", "L:1H", "C:0.5F"))],
  ["임용 4번 계단+정현파", mk("2개의 전압원 RL 회로", "단위계단함수 u(t)로 표현하고 테브난 등가로 변환한 뒤 중첩의 원리를 이용하여 i_A(t)를 구한다.", [], inv("V:10V", "V:10V", "R:2Ω", "R:2Ω", "R:4Ω", "L:2H"))],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesAcDcSourceSuperpositionVc(a) === false);
  ok(`양보(분류) ${n}`, classifyCircuitType({ ...a, subjectKey: "circuit_theory" }, "circuit_theory")?.type !== "ac_dc_source_superposition_vc");
}

// 3. 원본 물리
{
  const o = __spaces.ORIGINAL, s = solveAcDcVc(o);
  ok("원본 V_C(DC) = 4V", Math.abs(s.vcDc - 4) < 1e-12, String(s.vcDc));
  ok("원본 X_L = 8Ω", Math.abs(s.XL - 8) < 1e-12, String(s.XL));
  ok("원본 X_C = 2Ω", Math.abs(s.XC - 2) < 1e-12, String(s.XC));
  ok("원본 |Z| = 6√2", Math.abs(s.zK - 6) < 1e-12);
  ok("원본 |I| = √2", Math.abs(s.iK - 1) < 1e-12, String(s.iK));
  ok("원본 |V_C| = 2√2", Math.abs(s.vK - 2) < 1e-12, String(s.vK));
}

// 4. 생성물 독립 재검산 (복소수 직접 연산)
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cabs = (a) => Math.hypot(a.re, a.im);
let bad = 0, checked = 0, dup = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 20; seed++) {
    const g = generateAcDcSourceSuperpositionVc({ seed: seed * 7919, index: seed % 3, mode });
    checked++;
    const v = g.values, s = g.sol;
    if (JSON.stringify(v) === JSON.stringify(__spaces.ORIGINAL)) dup++;
    const XL = v.w * (v.L1 + v.L2), XC = 1 / (v.w * v.C);
    const Z = { re: v.R1 + v.R2, im: XL - XC };
    const I = cdiv({ re: v.Vm, im: 0 }, Z);
    const Vc = cmul(I, { re: 0, im: -XC });
    if (Math.abs(cabs(I) - s.iK * Math.SQRT2) > 1e-9) bad++;
    if (Math.abs(cabs(Vc) - s.vK * Math.SQRT2) > 1e-9) bad++;
    // 위상이 정확히 −45°/−135° 인가 (X_L − X_C = R_tot 강제의 결과)
    if (Math.abs(Math.atan2(I.im, I.re) + Math.PI / 4) > 1e-9) bad++;
    if (Math.abs(s.vcDc - v.Idc * v.R1) > 1e-12) bad++;
  }
}
ok("생성물 = 복소수 직접 연산", bad === 0, `${bad}/${checked}`);
ok("원본 튜플 미생성", dup === 0);
ok("값 공간 충분", __spaces.SPACE.length > 200, `${__spaces.SPACE.length}`);
ok("유사·변형 풀 비중첩", __spaces.SIMILAR_SPACE.every((x) => !__spaces.VARIANT_SPACE.includes(x)));

// 5. 발문·정답
const CHOICE = /[①②③④⑤]|고르시오|고른\s*것은|보기\s*중/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runAcDcSourceSuperpositionVcPipeline({ analysis: null, mode, count: 1, topicKey: "rlc_response" });
  ok(`3단계 발문 (${mode})`, [1, 2, 3].every((k) => p.question.includes(`[단계 ${k}]`)));
  ok(`3단계 정답 (${mode})`, [1, 2, 3].every((k) => p.answer.includes(`[단계 ${k}]`)));
  ok(`보기 없음 (${mode})`, !CHOICE.test(p.question) && !CHOICE.test(p.answer));
  ok(`figure 1개 전용 (${mode})`, p.figureVariants.length === 1 && p.figureVariants[0].diagramType === "ac_dc_source_superposition_circuit");
  ok(`직류/교류 단계 (${mode})`, p.question.includes("직류 전류원만") && p.question.includes("교류 전압원만"));
  ok(`구하는 양 (${mode})`, mode === "exam_similar" ? p.question.includes("v_c(t)") : p.question.includes("i(t)"));
  ok(`커패시터 직류 차단 설명 (${mode})`, p.solution.includes("직류를 차단"));
  ok(`소수 표기 없음 (${mode})`, !/\d+\.\d/.test(`${p.answer}\n${p.conditions.join(" ")}`), p.answer.slice(0, 60));
}

// 6. 렌더
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateAcDcSourceSuperpositionVc({ seed: 2, index: 0, mode });
  const svg = renderAcDcSourceSuperpositionCircuit(g.circuitDiagram);
  ok(`렌더 교류원 (${mode})`, svg.includes("cos"));
  ok(`렌더 저항 2개·인덕터 2개·C (${mode})`, (svg.match(/A(6\.5|8),(6\.5|8) 0 0 1/g) ?? []).length === 8);
  ok(`렌더 측정 (${mode})`, mode === "exam_similar" ? svg.includes("v_c(t)") : svg.includes("i(t)"));
  const ov = findLabelOverlaps(svg);
  ok(`렌더 겹침 0 (${mode})`, ov.length === 0, JSON.stringify(ov.slice(0, 2)));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ac_dc_source_superposition_vc smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;

// 7. 신고 재현 (2026-08-12) — "페이저" 낱말이 들어간 요약도 반드시 잡혀야 한다
{
  const phasorish = mk("교류 전압원과 직류 전류원이 포함된 회로의 페이저 해석",
    "정상상태에서 페이저 해석을 이용하여 커패시터 양단 전압 v_c(t)를 구한다. 교류 전압원과 직류 전류원이 함께 인가되어 있다.",
    ["페이저", "정상상태", "중첩"], FULL);
  ok("신고 재현: '페이저' 요약도 감지", matchesAcDcSourceSuperpositionVc(phasorish) === true);
  ok("신고 재현: 분류 교정", classifyCircuitType({ ...phasorish, subjectKey: "circuit_theory" }, "circuit_theory")?.type === "ac_dc_source_superposition_vc");

  // 형제(임용 5번)는 여전히 안 뺏는다 — 전류원이 교류 페이저다
  const five = mk("AC 다중 가지 phasor (임용 5번)",
    "교류 전원과 교류 전류원이 있는 다중 병렬 가지 회로에서 페이저 V_C, I_L2, I_S, I_R1을 정상상태로 구한다.",
    ["phasor"], inv("V:10∠0°V", "I:20∠-90°A", "R:20Ω", "L:1H", "L:0.1H", "C:0.1F"));
  ok("형제 보호: 교류 전류원이면 미발화", matchesAcDcSourceSuperpositionVc(five) === false);

  const design = mk("2전원 페이저 중첩 → 전원 크기",
    "교류 전압원과 전류원의 크기를 구한다. 목표 전압이 주어진다. 정상상태 페이저 해석.",
    [], inv("V:V_s∠0°", "I:I_s∠-90°", "R:1Ω", "L:1H", "C:1F"));
  ok("형제 보호: 전원 크기 역산이면 미발화", matchesAcDcSourceSuperpositionVc(design) === false);
}
console.log(`\n${fail === 0 ? "✅" : "❌"} (누적) ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
