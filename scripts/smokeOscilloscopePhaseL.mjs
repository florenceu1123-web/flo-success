/**
 * 오실로스코프 파형 → V_m·f·위상차 α → 미지 소자값 (임용 11번 회로이론) 정적 스모크 — API 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOscilloscopePhaseL.mjs
 *
 * 배경(2026-08-04 실측, 사용자 신고): 전용 archetype이 없어 **universal_ac**로 떨어졌고
 * 정답이 **"(query 없음)"**, 풀이는 "AC 정상상태 phasor 해석 — 입력 ω = 10000 rad/s" placeholder,
 * figure는 generic `analog_netlist`(스코프 화면 소실)였다. validator는 issues=0으로 통과.
 *
 * 물리(닫힌형):  v_L/v_s = Z/(R+Z),  Z = jωL_eq
 *   ∠ = 90° − arctan(X/R) = α → X = R/tanα,   |v_L|/|v_s| = cos α
 *   원본(V_m=8V·f=1000/3Hz·α=60°·R=2000π/√3·1H+1H) → X=2000π/3·L_eq=1H → **L = 2H**
 *
 * ★ 재검산은 생성기와 독립적으로 **복소 임피던스 직접 계산**으로 한다.
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import {
  generateOscilloscopePhaseL,
  __originalOscPhaseForVerify,
  __oscPhaseSpace,
  build,
} from "@/lib/generation/topologies/oscilloscopePhaseL";
import { detectOscilloscopePhaseL } from "@/lib/pipeline/runOscilloscopePhaseLPipeline";
import {
  renderOscilloscopeScreen,
  renderOscilloscopePhaseCircuit,
} from "@/lib/renderers/oscilloscopePhaseCircuitRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
}
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const A = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ── 복소 helper (독립 구현) ──────────────────────────────────────────────────
const K = (re, im) => ({ re, im });
const add = (a, b) => K(a.re + b.re, a.im + b.im);
const mul = (a, b) => K(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return K((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const par = (a, b) => div(mul(a, b), add(a, b));
const absc = (a) => Math.hypot(a.re, a.im);
const argDeg = (a) => (Math.atan2(a.im, a.re) * 180) / Math.PI;

/**
 * ★ 독립 재검산 — 생성기의 닫힌형을 쓰지 않고, 소자값에서 **복소 임피던스로 직접**
 *   v_L/v_s 의 크기·위상을 계산한다.
 */
function ratioFromComponents(v, unknown) {
  const w = 2 * Math.PI * (1e6 / (v.periodDiv * v.usPerDiv));
  const R = v.capacitive ? (v.rCoef * Math.sqrt(3)) / Math.PI : (v.rCoef * Math.PI) / Math.sqrt(3);
  const zOf = (val) => (v.capacitive ? K(0, -1 / (w * val * 1e-6)) : K(0, w * val));
  const branch = add(zOf(v.serVal), zOf(v.shuntVal));   // 직렬 가지
  const Z = par(zOf(unknown), branch);                  // 미지 소자와 병렬
  const ratio = div(Z, add(K(R, 0), Z));
  return { mag: absc(ratio), phase: argDeg(ratio), w, R };
}

// ── 1. 감지 ─────────────────────────────────────────────────────────────────
console.log("[1] 감지 — 실측 오분류 회차 + 표현 변형");
const REPORTED = A(
  "RL 회로의 과도응답 분석",
  "이 문제는 오실로스코프로 측정한 파형에서 v_s(t)와 v_L(t)의 위상차를 구하고, 이를 통해 인덕턴스 L의 값을 도출하는 과정이다. Ch1은 2.00 V/div, Ch2는 1.00 V/div이고 수평 스케일은 500µs/div이다. 주어진 파형에서 V_m과 주파수 f를 구한다.",
  ["오실로스코프", "위상차", "인덕턴스", "파형 측정"],
  inv("V:v_s(t)", "R:2000π/√3Ω", "L:1H", "L:1H", "L:L"),
);
const VARIANTS = [
  ["실측 회차(과도응답으로 오요약)", REPORTED],
  ["표준 요약", A("오실로스코프 파형 해석", "오실로스코프로 측정한 두 채널 파형에서 최댓값 V_m과 주파수 f, 위상차 α를 구하고 인덕턴스 L의 값을 구한다.", ["교류 회로"], [])],
  ["영문 혼용", A("Oscilloscope waveform", "From the oscilloscope screen (V/div, µs/div) read the amplitude and frequency, then find the phase difference and the inductance L.", [], [])],
  ["채널 표기만", A("교류 회로 측정", "Ch1과 Ch2로 측정한 파형의 위상차로부터 정전 용량을 구한다. 수직 스케일과 수평 스케일이 주어진다.", ["측정"], [])],
];
for (const [name, an] of VARIANTS) check(`감지 — ${name}`, detectOscilloscopePhaseL(an) === true);

// ── 2. 형제 양보 ─────────────────────────────────────────────────────────────
console.log("[2] 형제 양보 (미탈취)");
const YIELDS = [
  ["스위치 과도응답", A("RL 과도응답", "t=0에서 스위치를 닫을 때 오실로스코프로 관측한 파형에서 시정수를 구하고 인덕턴스를 구한다.", ["과도응답"], [])],
  ["디지털 타이밍", A("순서논리 파형", "오실로스코프로 측정한 클럭과 출력 파형에서 플립플롭의 동작을 분석한다.", ["디지털"], [])],
  ["다이오드 정류", A("정류 회로", "오실로스코프로 측정한 다이오드 정류 파형에서 출력 전압을 구한다.", [], [])],
  ["스코프 없음(일반 페이저)", A("교류 회로", "페이저 해석으로 각 가지 전류를 구하고 인덕턴스를 구한다.", ["페이저"], [])],
  ["OPAMP 파형", A("연산 증폭기 출력", "오실로스코프로 측정한 연산 증폭기 출력 파형의 진폭과 주파수를 구한다.", [], [])],
];
for (const [name, an] of YIELDS) check(`양보 — ${name}`, detectOscilloscopePhaseL(an) === false);

// ── 3. 분류기 (과목 무관) ────────────────────────────────────────────────────
console.log("[3] 분류기 — 과목 무관 0-PRE");
for (const subject of ["circuit_theory", "electronics", "mixed_signal", "digital_logic"]) {
  const r = classifyCircuitType(REPORTED, subject);
  check(`분류(${subject}) → oscilloscope_phase_l`, r?.type === "oscilloscope_phase_l", r?.type);
}

// ── 4. 원본 물리 ─────────────────────────────────────────────────────────────
console.log("[4] 원본 물리 (Ch1 2V/div·Ch2 1V/div·500µs/div·4div·R=2000π/√3·1H+1H)");
{
  const g = __originalOscPhaseForVerify();
  const a = g.answer;
  check("V_m = 8V", near(a.Vm, 8), String(a.Vm));
  check("T = 3000µs · f = 1000/3 Hz", near(a.periodUs, 3000) && near(a.f, 1000 / 3), `${a.periodUs}/${a.f}`);
  check("α = 60°", near(a.alphaDeg, 60));
  check("|v_L| = 4V · 진폭비 = cos60° = 1/2", near(a.vLamp, 4) && near(a.ratio, 0.5));
  check("ω = 2000π/3", near(a.omega, (2000 * Math.PI) / 3, 1e-6), String(a.omega));
  check("R = 2000π/√3 ≈ 3627.6Ω", near(a.R, (2000 * Math.PI) / Math.sqrt(3), 1e-6));
  check("X = R/√3 = 2000π/3", near(a.X, (2000 * Math.PI) / 3, 1e-6));
  check("L_eq = 1H", near(a.eq, 1, 1e-9), String(a.eq));
  check("★ L = 2H", near(a.unknown, 2, 1e-9), String(a.unknown));
  const chk = ratioFromComponents(g.values, a.unknown);
  check("★ 복소 임피던스 독립 재검산 — 위상 60°", near(chk.phase, 60, 1e-6), String(chk.phase));
  check("★ 복소 임피던스 독립 재검산 — 크기 1/2", near(chk.mag, 0.5, 1e-9), String(chk.mag));
}

// ── 5. 생성물 재검산 ─────────────────────────────────────────────────────────
console.log("[5] 생성물 독립 재검산 (유사·변형 각 24개)");
{
  let badPhase = 0, badMag = 0, badAmp = 0, badVal = 0, origin = 0;
  const seen = { exam_similar: new Set(), exam_variant: new Set() };
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 24; s++) {
      const g = generateOscilloscopePhaseL({ seed: s * 7919, mode });
      const v = g.values, a = g.answer;
      seen[mode].add(`${v.usPerDiv}|${v.ch1VPerDiv}|${v.ch2VPerDiv}|${v.ch1AmpDiv}|${v.rCoef}|${v.serVal}|${v.shuntVal}`);
      if (!v.capacitive && v.usPerDiv === 500 && v.ch1VPerDiv === 2 && v.ch2VPerDiv === 1 &&
          v.ch1AmpDiv === 4 && v.rCoef === 2000 && v.serVal === 1 && v.shuntVal === 1) origin++;
      // (a) 소자값 → 복소 임피던스로 위상·크기 재계산
      const chk = ratioFromComponents(v, a.unknown);
      const wantPhase = v.capacitive ? -a.alphaDeg : a.alphaDeg;
      if (!near(chk.phase, wantPhase, 1e-6)) badPhase++;
      if (!near(chk.mag, Math.cos((a.alphaDeg * Math.PI) / 180), 1e-9)) badMag++;
      // (b) 스코프 판독 = 물리값
      if (!near(a.Vm, v.ch1AmpDiv * v.ch1VPerDiv) || !near(a.vLamp, v.ch2AmpDiv * v.ch2VPerDiv)) badAmp++;
      if (!near(a.ratio, Math.cos((a.alphaDeg * Math.PI) / 180), 1e-9)) badAmp++;
      // (c) 값 품질 — 미지값 0.5 배수 양수, 화면 진폭 1~4 div
      if (!(a.unknown > 0) || !Number.isInteger(Math.round(a.unknown * 1e9) / 1e9)) badVal++;
      if (v.ch1AmpDiv > 4 || v.ch2AmpDiv > 4 || v.ch2AmpDiv < 1) badVal++;
      if (a.alphaDeg !== 60) badVal++;
    }
  }
  check("복소 재검산 — 위상 (48/48)", badPhase === 0, `불일치 ${badPhase}`);
  check("복소 재검산 — 크기 = cos α", badMag === 0, `불일치 ${badMag}`);
  check("스코프 판독 ↔ 물리값 일치", badAmp === 0, `불일치 ${badAmp}`);
  check("값 품질(미지값·화면 진폭·α)", badVal === 0, `위반 ${badVal}`);
  check("원본 튜플 미생성", origin === 0, `${origin}회`);
  const overlap = [...seen.exam_similar].filter((k) => seen.exam_variant.has(k));
  check("유사·변형 값 비중첩", overlap.length === 0, overlap.join(","));
  check("값 공간 유사 ≥ 20", __oscPhaseSpace(false).length >= 20, String(__oscPhaseSpace(false).length));
  check("값 공간 변형 ≥ 10", __oscPhaseSpace(true).length >= 10, String(__oscPhaseSpace(true).length));
}

// ── 6. 렌더 ──────────────────────────────────────────────────────────────────
console.log("[6] 렌더 구조·라벨 겹침");
{
  let overlapTotal = 0, missing = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 6; s++) {
      const g = generateOscilloscopePhaseL({ seed: s * 104729, mode });
      const s1 = renderOscilloscopeScreen(g.screen);
      const s2 = renderOscilloscopePhaseCircuit(g.circuit);
      overlapTotal += findLabelOverlaps(s1).length + findLabelOverlaps(s2).length;
      if (!s1.includes("㉠") || !s1.includes("㉡") || !s1.includes("α")) missing++;
      if (!s1.includes(g.screen.ch1Label) || !s1.includes(g.screen.ch2Label) || !s1.includes(g.screen.timeLabel)) missing++;
      if (!s2.includes(g.circuit.rLabel) || !s2.includes(g.circuit.serLabel)) missing++;
      // 파형 polyline 2개(㉠·㉡)
      if ((s1.match(/<polyline/g) ?? []).length !== 2) missing++;
      // ★ 스코프 파형이 화면(격자) 밖으로 나가지 않는지 — 진폭 ≤ 4 div
      if (g.screen.ch1AmpDiv > g.screen.heightDiv / 2 || g.screen.ch2AmpDiv > g.screen.heightDiv / 2) missing++;
    }
  }
  check("(가)·(나) 라벨 겹침 0", overlapTotal === 0, `${overlapTotal}건`);
  check("마커·스케일·소자 라벨 누락 0", missing === 0, `${missing}건`);
  const g0 = __originalOscPhaseForVerify();
  const scr = renderOscilloscopeScreen(g0.screen);
  check("원본 화면 스케일 표기", scr.includes("2.00 V/div") && scr.includes("1.00 V/div") && scr.includes("500µs/div"));
  check("격자 점선 + 테두리", scr.includes("stroke-dasharray") && scr.includes("<rect"));
  const ckt = renderOscilloscopePhaseCircuit(g0.circuit);
  check("(나) R·소자·측정전압 표기", ckt.includes("2000π/√3") && ckt.includes("1H") && ckt.includes("v_L"));
}

// ── 7. 발문·정답 텍스트 ──────────────────────────────────────────────────────
console.log("[7] 발문·정답 텍스트");
{
  const { runOscilloscopePhaseLPipeline } = await import("@/lib/pipeline/runOscilloscopePhaseLPipeline");
  let badSteps = 0, badFig = 0, badTxt = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    const probs = await runOscilloscopePhaseLPipeline({ analysis: null, mode, count: 3 });
    for (const p of probs) {
      for (const m of ["[단계 1]", "[단계 2]", "[단계 3]"]) {
        if (!p.question.includes(m) || !p.answer.includes(m) || !p.solution.includes(m)) badSteps++;
      }
      if (!/오실로스코프/.test(p.content) || !/㉠|㉡/.test(p.content)) badTxt++;
      // ★ 소수 금지 — 전역 분수 변환기가 "0.50 V/div"를 "1/2 V/div"로, 리액턴스를 1047.198로 뭉갠다(실측).
      if (/\d\.\d/.test(`${p.answer}\n${p.solution}\n${(p.conditions ?? []).join(" ")}`)) badTxt++;
      if (!/V_m/.test(p.question) || !/α/.test(p.question)) badTxt++;
      // 위상 부호: 유사(유도성)=+, 변형(용량성)=−
      if (mode === "exam_similar" && !/\+ 60°/.test(p.answer)) badTxt++;
      if (mode === "exam_variant" && !/− 60°/.test(p.answer)) badTxt++;
      const roles = (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(",");
      if (roles !== "waveform:oscilloscope_screen,original_circuit:oscilloscope_phase_circuit") badFig++;
    }
  }
  check("[단계 1~3] 구조", badSteps === 0, `위반 ${badSteps}`);
  check("발문 문구·위상 부호", badTxt === 0, `위반 ${badTxt}`);
  check("figure = (가) 스코프 + (나) 회로", badFig === 0, `위반 ${badFig}`);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
void build;
process.exit(fail === 0 ? 0 : 1);
