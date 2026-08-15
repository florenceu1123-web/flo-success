/**
 * 스모크 — 주기 신호 직류값·실효값 (임용 36번, 회로·그림 없음).
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokePeriodicSignalDcRms.mjs
 *
 * A. 라우팅 — 실측 요약 회차 + 표현 변형에서 periodic_signal_dc_rms로 잡히는가
 * B. 형제 양보 — 회로 해석 유형(테브난·공진·과도·개념 명칭형)을 뺏지 않는가
 * C. 물리 재검산 — 생성물의 V_dc·V_rms를 **수치 적분으로 독립 검증**
 * D. 원본 값 재현 + 원본 튜플 미생성
 * E. 표기 — 3단계 계약·소수 0·그림 없음
 */
import {
  generatePeriodicSignalDcRms, matchesPeriodicSignalDcRms, solvePeriodicSignal,
  trigFnFromAnalysis, __periodicSignalSpaces, sqrtTex,
} from "@/lib/generation/topologies/periodicSignalDcRms";
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { isThreeStepText } from "@/lib/format/threeStep";

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`); } };

const A = (topic, interpretation, concepts = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [],
});

// ── A. 라우팅 ─────────────────────────────────────────────────────────
console.log("A. 라우팅");
const POSITIVE = [
  ["실측 회차(사용자 신고)", A("주기 신호의 직류 및 실효값",
    "주기 신호 v(t)=2cos^2(1000πt+π/2)[V]의 직류값 V_dc와 실효값 V_rms를 구하는 문제이다.",
    ["직류값", "실효값", "주기 신호"])],
  ["cos² 표기 변형", A("주기 신호 해석", "v(t)=4cos²(500πt)의 평균값과 실효값을 구한다.", [])],
  ["sin² 회차", A("신호의 실효값", "정현파 제곱 신호 v(t)=2sin²(ωt+π/4)의 직류값과 rms를 구하시오.", [])],
  ["개념 나열형 요약", A("주기 신호", "이 신호의 dc 값과 rms 값을 구한다.", ["정현파", "제곱 평균"])],
];
for (const [label, a] of POSITIVE) {
  ok(matchesPeriodicSignalDcRms(a), `감지: ${label}`);
  ok(classifyCircuitType(a, "circuit_theory").type === "periodic_signal_dc_rms", `분류(circuit_theory): ${label}`);
}
// 과목 오선택에도 잡혀야 한다(0-PRE, subject 무관)
for (const su of ["electronics", "digital_logic", "mixed_signal"]) {
  ok(classifyCircuitType(POSITIVE[0][1], su).type === "periodic_signal_dc_rms", `과목 무관 분류: ${su}`);
}
ok(trigFnFromAnalysis(POSITIVE[2][1]) === "sin", "원본이 sin²이면 표기 보존");
ok(trigFnFromAnalysis(POSITIVE[0][1]) === "cos", "원본이 cos²이면 cos 유지");

// ── B. 형제 양보 ──────────────────────────────────────────────────────
console.log("B. 형제 양보");
const NEGATIVE = [
  ["테브난 등가", A("테브난 등가회로", "단자 a-b에서 본 테브난 등가 전압과 저항을 구한다. 실효값 페이저 표기이다.")],
  ["AC 최대전력", A("최대 평균전력", "정현파 전원의 실효값이 주어질 때 부하에 전달되는 최대 평균 전력을 구한다.")],
  ["RLC 공진", A("직렬 RLC 공진", "공진 주파수와 대역폭을 구한다. 정현파 입력의 실효값은 10V이다.")],
  ["과도응답", A("RC 과도응답", "스위치를 닫은 뒤 시정수와 v_C(t)를 구한다.")],
  ["개념 명칭형", A("회로 이론의 기본 법칙", "㉠, ㉡에서 설명하는 원리 또는 법칙의 이름을 순서대로 쓰시오.")],
  ["역률 보정", A("역률", "부하의 역률을 1로 만드는 커패시터 용량을 구한다. 전원 실효값 100V.")],
];
for (const [label, a] of NEGATIVE) ok(!matchesPeriodicSignalDcRms(a), `양보: ${label}`);

// ── C. 생성물 물리 재검산 (수치 적분으로 독립 검증) ───────────────────
console.log("C. 생성물 재검산");
/** v(t)를 한 주기에 걸쳐 수치 적분해 평균·제곱평균을 구한다(생성기와 완전히 독립적인 경로). */
function numericCheck(v) {
  const w = v.wCoef * Math.PI;
  const phi = v.phaseDen === 0 ? 0 : Math.PI / v.phaseDen;
  const f = (t) => (v.form === "offset"
    ? v.B + v.A * Math.cos(w * t + phi)
    : v.A * Math.pow(v.fn === "cos" ? Math.cos(w * t + phi) : Math.sin(w * t + phi), 2));
  // 기본 주기: 변형은 2π/w, 유사는 제곱이라 π/w. 넉넉히 2π/w를 N등분해 적분(둘 다 정수 주기 포함).
  const T = (2 * Math.PI) / w;
  const N = 200000;
  let s = 0, s2 = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * (T / N);
    const y = f(t);
    s += y; s2 += y * y;
  }
  return { mean: s / N, msq: s2 / N };
}
let checked = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 12; seed++) {
    for (const idx of [0, 1]) {
      const g = generatePeriodicSignalDcRms({ seed, mode, index: idx });
      const num = numericCheck(g.values);
      const okDc = Math.abs(num.mean - g.answer.vdcNum) < 1e-6;
      const okRms = Math.abs(num.msq - g.answer.msq) < 1e-6;
      ok(okDc, `[${mode}/${seed}/${idx}] V_dc 수치적분 일치`, `${num.mean} vs ${g.answer.vdcNum}`);
      ok(okRms, `[${mode}/${seed}/${idx}] V_rms² 수치적분 일치`, `${num.msq} vs ${g.answer.msq}`);
      checked++;
    }
  }
}
ok(checked >= 48, `${checked}개 생성물 재검산`);

// ── C-2. 변형은 **두 가족**을 낸다 (사용자 지정 2026-08-12: "sin² 함수로도 만들어서 내줘") ──
console.log("C-2. 변형 가족");
{
  const forms = new Set(), fns = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    for (const idx of [0, 1, 2]) {
      const g = generatePeriodicSignalDcRms({ seed, mode: "exam_variant", index: idx, fn: "cos" });
      forms.add(g.values.form);
      if (g.values.form === "sq") fns.add(g.values.fn);
    }
  }
  ok(forms.has("sq"), "변형에 제곱형(sin²)이 나온다");
  ok(forms.has("offset"), "변형에 직류 오프셋 정현파도 나온다");
  ok(fns.size === 1 && fns.has("sin"), "원본이 cos²이면 변형 제곱형은 **sin²**으로 교환", [...fns].join(","));
  // 원본이 sin²이면 반대로 cos²으로 교환
  const swapped = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    for (const idx of [0, 1, 2]) {
      const g = generatePeriodicSignalDcRms({ seed, mode: "exam_variant", index: idx, fn: "sin" });
      if (g.values.form === "sq") swapped.add(g.values.fn);
    }
  }
  ok(swapped.size === 1 && swapped.has("cos"), "원본이 sin²이면 변형 제곱형은 cos²", [...swapped].join(","));
  // 유사는 원본 함수를 보존한다(절대규칙 0)
  const simFns = new Set();
  for (let seed = 1; seed <= 8; seed++) simFns.add(generatePeriodicSignalDcRms({ seed, mode: "exam_similar", fn: "cos" }).values.fn);
  ok(simFns.size === 1 && simFns.has("cos"), "유사는 원본 함수 보존");
  // ★ 실측 회귀: `generateInParallel`은 seed = base + i·7919로 준다. 가족 선택에 seed를 섞으면
  //   (i + seed)의 패리티가 i에 무관해져 **한 배치가 통째로 한 가족**으로 나왔다(count=3 → 3개 다 오프셋).
  //   그래서 가족은 index만으로 정한다 — 실제 파이프라인이 주는 seed 형태로 재현 검사한다.
  for (const base of [1_700_000_000_000, 1_700_000_000_001]) {
    const three = [0, 1, 2].map((i) =>
      generatePeriodicSignalDcRms({ seed: base + i * 7919, mode: "exam_variant", index: i, fn: "cos" }).values.form);
    ok(new Set(three).size === 2, `[base ${base % 10}] 3개 요청 시 두 가족 혼합`, three.join(","));
    ok(three[0] === "sq", "변형 첫 문항은 sin²(함수 교환)", three.join(","));
  }
  // 제곱형 변형의 답이 유사 풀과 겹치지 않는다(A 풀 분리)
  const simA = new Set(), varA = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    simA.add(generatePeriodicSignalDcRms({ seed, mode: "exam_similar", fn: "cos" }).values.A);
    const g = generatePeriodicSignalDcRms({ seed, mode: "exam_variant", index: 0, fn: "cos" });
    if (g.values.form === "sq") varA.add(g.values.A);
  }
  ok(!varA.has(2), "변형 제곱형은 원본 진폭(2)을 쓰지 않는다", [...varA].join(","));
}

// ── D. 원본 값 재현 + 원본 튜플 미생성 ────────────────────────────────
console.log("D. 원본");
{
  // 원본: v(t)=2cos²(1000πt+π/2) → V_dc=1, V_rms=√(3/2)  (원본 정답 ①)
  const orig = { A: 2, B: 0, wCoef: 1000, phaseDen: 2, fn: "cos", form: "sq" };
  const a = solvePeriodicSignal(orig, "exam_similar");
  ok(a.vdc === "1", "원본 V_dc = 1");
  ok(a.vrms === "\\sqrt{\\dfrac{3}{2}}", "원본 V_rms = √(3/2)", a.vrms);
  const num = numericCheck(orig);
  ok(Math.abs(num.mean - 1) < 1e-6 && Math.abs(num.msq - 1.5) < 1e-6, "원본 값이 수치적분과 일치");
  // 원본 튜플은 생성 풀에서 제외
  let origHit = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = generatePeriodicSignalDcRms({ seed, mode: "exam_similar" });
    if (g.values.A === 2 && g.values.wCoef === 1000 && g.values.phaseDen === 2) origHit++;
  }
  ok(origHit === 0, "원본 튜플 미생성", `${origHit}건`);
  const sp = __periodicSignalSpaces();
  ok(sp.similar >= 100 && sp.variantSq >= 100 && sp.variantOffset >= 100,
    `값 공간 충분(유사 ${sp.similar}·변형sq ${sp.variantSq}·변형offset ${sp.variantOffset})`);
}
ok(sqrtTex(9) === "3" && sqrtTex(12) === "2\\sqrt{3}" && sqrtTex(6) === "\\sqrt{6}", "√ 표기 인수분해");
// ★ 실측 표기 버그 회귀: π/6의 2배를 "2π/6"으로 찍었다 → 반드시 약분(π/3).
{
  const cases = [[6, "\\dfrac{\\pi}{3}"], [4, "\\dfrac{\\pi}{2}"], [2, "\\pi"], [3, "\\dfrac{2\\pi}{3}"]];
  for (const [den, want] of cases) {
    const g = solvePeriodicSignal({ A: 2, B: 0, wCoef: 500, phaseDen: den, fn: "cos", form: "sq" });
    ok(g.decomposed.includes(want), `위상 2배 약분(π/${den} → ${want})`, g.decomposed);
    ok(!/\\dfrac\{2\\pi\}\{(2|4|6)\}/.test(g.decomposed), `약분 안 된 2π/${den} 없음`);
  }
}

// ── E. 표기·계약 ──────────────────────────────────────────────────────
console.log("E. 표기·계약");
{
  const { runPeriodicSignalDcRmsPipeline } = await import("@/lib/pipeline/runPeriodicSignalDcRmsPipeline");
  for (const mode of ["exam_similar", "exam_variant"]) {
    const probs = await runPeriodicSignalDcRmsPipeline({
      analysis: POSITIVE[0][1], mode, count: 2, topicKey: "dc_resistive",
    });
    ok(probs.length === 2, `[${mode}] 2문항 생성`);
    for (const p of probs) {
      ok(isThreeStepText(p.question), `[${mode}] 발문 3단계`);
      ok(isThreeStepText(p.answer), `[${mode}] 정답 3단계`);
      ok((p.figureVariants ?? []).length === 0, `[${mode}] 그림 없음(원본과 동일)`);
      ok(!/①|②|③/.test(`${p.content}${p.question}`), `[${mode}] 보기 없음`);
      // 소수 표기 금지 — √(3/2)를 소수로 쓰면 전역 분수 변환기가 뭉갠다.
      const body = `${p.content} ${p.conditions.join(" ")} ${p.question} ${p.answer}`;
      ok(!/\d\.\d/.test(body), `[${mode}] 소수 표기 0`, (body.match(/\d\.\d+/g) || []).join(","));
      ok(/V_\{dc\}/.test(p.answer) && /V_\{rms\}/.test(p.answer), `[${mode}] 정답에 두 물음 모두 포함`);
      // ★ 실측 회귀: 변형 [단계 1] 정답의 LaTeX가 \( \) 밖에 있어 `\,[\mathrm{V}]`가 원문으로 찍혔다.
      //   델리미터 안쪽을 모두 지운 뒤 LaTeX 명령이 남아 있으면 노출된 것이다.
      for (const [field, text] of [["question", p.question], ["answer", p.answer], ["solution", p.solution]]) {
        const outside = String(text).replace(/\\\([\s\S]*?\\\)/g, " ");
        ok(!/\\[a-zA-Z]+/.test(outside), `[${mode}] ${field}에 노출된 LaTeX 없음`,
          (outside.match(/\\[a-zA-Z]+/g) || []).slice(0, 3).join(","));
      }
    }
  }
}

console.log(`\n${pass}/${pass + fail} 통과${fail ? ` — ${fail}건 실패` : ""}`);
process.exit(fail ? 1 : 0);
