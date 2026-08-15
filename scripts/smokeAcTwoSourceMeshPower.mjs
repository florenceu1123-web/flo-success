/**
 * 2전원 RLC 메시 → 페이저 전류 I₁·I₂ + 평균 전력 (임용 5번 회로이론) 정적 스모크 — API 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcTwoSourceMeshPower.mjs
 *
 * 배경(2026-08-04 실측, 사용자 신고): 전용 archetype이 없어 형제 **`ac_rl_average_power`(단일 전원)** 가
 * 가로챘고 생성물의 **정답이 빈 문자열**, 풀이는 "모든 branch 전류가 0A"라는 엉터리였다(issues=0 통과).
 *
 * 물리: 메시 2개(둘 다 시계) → R₂에는 I₁−I₂.
 *   원본(R₁1·R₂1·C₂−j2·C₁−j1·L j3, V₁=√8∠45°·V₂=2∠180°)
 *     → **I₁ = I₂ = 2∠90°[A]** → **P_R2 = 0[W]**, **P_v1 = 2[W]** (R₁ 소비 2W와 전력수지 일치)
 *
 * ★ 재검산은 생성기의 해를 쓰지 않고 **연립방정식에 대입해 잔차를 확인**하고, 전력수지도 독립 검증한다.
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import {
  generateAcTwoSourceMeshPower,
  __originalMeshForVerify,
  __meshSpace,
  elemZ,
  polarTex,
} from "@/lib/generation/topologies/acTwoSourceMeshPower";
import { detectAcTwoSourceMeshPower } from "@/lib/pipeline/runAcTwoSourceMeshPowerPipeline";
import { renderAcTwoSourceMeshCircuit } from "@/lib/renderers/acTwoSourceMeshCircuitRenderer";
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
const near = (a, b, eps = 1e-7) => Math.abs(a - b) < eps;

// ── 복소 helper (독립 구현) ──────────────────────────────────────────────────
const K = (re, im) => ({ re, im });
const add = (a, b) => K(a.re + b.re, a.im + b.im);
const sub = (a, b) => K(a.re - b.re, a.im - b.im);
const mul = (a, b) => K(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const absc = (a) => Math.hypot(a.re, a.im);

/** ★ 독립 재검산 — 생성기의 I₁·I₂를 연립식에 **대입해 잔차**를 본다. */
function residual(v, I1, I2) {
  const Rm = elemZ(v.arms.mid);
  const Z1 = add(add(elemZ(v.arms.topLeft), Rm), elemZ(v.arms.botLeft));
  const Z2 = add(add(Rm, elemZ(v.arms.topRight)), elemZ(v.arms.botRight));
  const r1 = sub(sub(mul(I1, Z1), mul(I2, Rm)), v.V1);
  const r2 = sub(sub(mul(I2, Z2), mul(I1, Rm)), v.V2);
  return Math.max(absc(r1), absc(r2));
}
/** ★ 전력수지 — 저항 소비 합 = 전원 공급 합 (리액티브는 0). */
function powerBalance(v, a) {
  const dissip = 0.5 * absc(a.I1) ** 2 * v.arms.topLeft.mag + 0.5 * absc(a.IR2) ** 2 * v.arms.mid.mag;
  return Math.abs(dissip - (a.P_v1 + a.P_v2));
}

// ── 1. 감지 ─────────────────────────────────────────────────────────────────
console.log("[1] 감지 — 실측 오분류 회차 + 표현 변형");
const REPORTED = A(
  "교류 RLC 회로 해석",
  "이 문제는 두 개의 교류 전원을 포함한 RLC 회로에서 페이저 전류와 전력을 구하는 문제입니다. 주어진 해석 절차에 따라 저항과 인덕터에 흐르는 전류를 구하고, 저항에서 소비되는 평균 전력과 전원이 공급하는 평균 전력을 계산합니다. 페이저 해석을 통해 각 전류와 전력을 단계별로 구하는 것이 핵심입니다.",
  ["페이저", "평균 전력", "RLC 회로"],
  inv("R:1Ω", "R:1Ω", "C:-j1Ω", "C:-j2Ω", "L:j3Ω", "V:√8∠45°V", "V:2∠180°V"),
);
// ★ 실측 회차 2 (2026-08-04, 브라우저 신고) — Vision이 **"두 개의 교류 전원"도 "평균 전력"도 안 쓰고**
//   전류원이 없는데 *"전압원과 전류원의 페이저"* 라고 잘못 요약해 텍스트 조건이 통째로 미발화,
//   `universal_ac`로 샜다(로그 dispatch_warning). 남은 신호는 **인벤토리 구조**(V 2·I 0)뿐이다.
const REPORTED2 = A(
  "RLC 회로의 페이저 해석",
  "주어진 RLC 회로에서 페이저 전압과 전류를 계산하는 문제입니다. 각 전압원과 전류원의 페이저를 구하고, 이를 통해 회로의 전력 소모를 단계별로 계산합니다. 주어진 해석 절차에 따라 각 소자에서의 전력과 전체 전력을 구하는 것이 목표입니다.",
  ["페이저 해석", "교류 회로", "RLC 회로", "전력 계산", "페이저 전압"],
  inv("R:1Ω", "C:-jΩ", "R:1Ω", "C:-jΩ", "L:j3Ω", "V:√8∠45°V", "V:2∠180°V"),
);
const VARIANTS = [
  ["실측 회차", REPORTED],
  ["실측 회차 2 (‘전류원’ 오요약·인벤토리로만 판정)", REPORTED2],
  ["메시 표현", A("2전원 교류 회로", "두 전원이 있는 RLC 회로를 메시 해석으로 풀어 I_1과 I_2를 구하고 저항에서 소비되는 평균 전력을 구한다.", ["메시 해석"], [])],
  ["V₁·V₂ 표기", A("교류 회로 전력", "V₁과 V₂ 두 페이저 전원이 인가된 회로에서 전류 I₁을 구하고 공급하는 평균 전력을 구한다.", [], [])],
];
for (const [name, an] of VARIANTS) check(`감지 — ${name}`, detectAcTwoSourceMeshPower(an) === true);

// ── 2. 형제 양보 ─────────────────────────────────────────────────────────────
console.log("[2] 형제 양보 (미탈취)");
const YIELDS = [
  ["단일 전원 평균전력(임용 8번)", A("AC 평균전력", "교류 전원과 인덕터, 병렬 저항 2개로 구성된 회로에서 소비되는 평균 전력을 구한다.", ["평균 전력"], [])],
  ["중첩의 원리", A("2전원 중첩", "두 개의 교류 전원이 있는 회로를 중첩의 원리로 해석해 평균 전력을 구한다.", ["중첩의 원리"], [])],
  ["테브난·최대전력", A("2전원 테브난", "두 개의 교류 전원이 포함된 회로의 테브난 등가로 최대 평균 전력을 구한다.", ["최대 전력"], [])],
  ["전원 크기 역산(임용 5번 형제)", A("2전원 페이저", "두 개의 교류 전원이 있는 RLC 회로에서 커패시터 전압이 주어질 때 전원의 크기를 구하고 평균 전력을 구한다.", ["중첩"], [])],
  ["역률", A("교류 전력", "두 개의 교류 전원 회로에서 역률을 개선해 평균 전력을 구한다.", ["역률"], [])],
  ["오실로스코프", A("파형 측정", "두 개의 교류 전원 파형을 오실로스코프로 측정해 평균 전력을 구한다. V/div", [], [])],
];
for (const [name, an] of YIELDS) check(`양보 — ${name}`, detectAcTwoSourceMeshPower(an) === false);

// ── 3. 분류기 (과목 무관) ────────────────────────────────────────────────────
console.log("[3] 분류기 — 과목 무관 0-PRE");
for (const subject of ["circuit_theory", "electronics", "mixed_signal", "digital_logic"]) {
  const r = classifyCircuitType(REPORTED, subject);
  check(`분류(${subject}) → ac_two_source_mesh_power`, r?.type === "ac_two_source_mesh_power", r?.type);
}
check("형제(단일 전원)는 그대로 ac_rl_average_power",
  classifyCircuitType(YIELDS[0][1], "circuit_theory")?.type === "ac_rl_average_power",
  classifyCircuitType(YIELDS[0][1], "circuit_theory")?.type);

// ── 4. 원본 물리 ─────────────────────────────────────────────────────────────
console.log("[4] 원본 물리 (R₁1·R₂1·C₂−j2·C₁−j1·L j3, V₁=√8∠45°·V₂=2∠180°)");
{
  const g = __originalMeshForVerify();
  const a = g.answer, v = g.values;
  check("I₁ = 2∠90° (=j2)", near(a.I1.re, 0) && near(a.I1.im, 2), JSON.stringify(a.I1));
  check("I₂ = 2∠90° (=j2)", near(a.I2.re, 0) && near(a.I2.im, 2), JSON.stringify(a.I2));
  check("★ I₁ = I₂ → R₂ 전류 0", near(absc(a.IR2), 0), String(absc(a.IR2)));
  check("★ P_R2 = 0 W", near(a.P_R2, 0), String(a.P_R2));
  check("★ P_v1 = 2 W", near(a.P_v1, 2), String(a.P_v1));
  check("P_v2 = 0 W (v₂는 공급하지 않는다)", near(a.P_v2, 0), String(a.P_v2));
  check("R₁ 소비 = 2 W", near(a.P_ra, 2), String(a.P_ra));
  check("★ 연립식 잔차 0 (독립 대입 검증)", residual(v, a.I1, a.I2) < 1e-9, String(residual(v, a.I1, a.I2)));
  check("★ 전력수지 일치", powerBalance(v, a) < 1e-9, String(powerBalance(v, a)));
  check("극형식 표기 √8∠45°·2∠180°", polarTex(v.V1) === "√8∠45°" && polarTex(v.V2) === "2∠180°",
    `${polarTex(v.V1)} / ${polarTex(v.V2)}`);
}

// ── 5. 생성물 재검산 ─────────────────────────────────────────────────────────
console.log("[5] 생성물 독립 재검산 (유사·변형 각 24개)");
{
  let badRes = 0, badBal = 0, badClean = 0, origin = 0, zeroCnt = 0, nonZeroCnt = 0;
  const seen = { exam_similar: new Set(), exam_variant: new Set() };
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 24; s++) {
      const g = generateAcTwoSourceMeshPower({ seed: s * 7919, mode });
      const v = g.values, a = g.answer;
      seen[mode].add(JSON.stringify([v.arms.topLeft.mag, v.arms.mid.mag, v.arms.topRight.mag,
        v.arms.botLeft.mag, v.arms.botRight.mag, v.V1.re, v.V1.im, v.V2.re, v.V2.im]));
      if (residual(v, a.I1, a.I2) > 1e-9) badRes++;
      if (powerBalance(v, a) > 1e-9) badBal++;
      // 값 품질 — 전원이 가우스 정수 + 전력이 0.5 배수
      for (const z of [v.V1, v.V2]) {
        if (!Number.isInteger(Math.round(z.re * 1e9) / 1e9) || !Number.isInteger(Math.round(z.im * 1e9) / 1e9)) badClean++;
      }
      if (Math.abs(a.P_R2 * 2 - Math.round(a.P_R2 * 2)) > 1e-9) badClean++;
      if (Math.abs(a.P_v1 * 2 - Math.round(a.P_v1 * 2)) > 1e-9 || a.P_v1 <= 0) badClean++;
      // 소자 종류 — 유사=상단우/하단좌 C·하단우 L, 변형=교환
      const wantUp = mode === "exam_variant" ? "L" : "C";
      const wantDown = mode === "exam_variant" ? "C" : "L";
      if (v.arms.topRight.kind !== wantUp || v.arms.botLeft.kind !== wantUp ||
          v.arms.botRight.kind !== wantDown || v.arms.topLeft.kind !== "R" || v.arms.mid.kind !== "R") badClean++;
      // 원본 튜플 미생성
      if (mode === "exam_similar" && v.arms.topLeft.mag === 1 && v.arms.mid.mag === 1 &&
          v.arms.topRight.mag === 2 && v.arms.botLeft.mag === 1 && v.arms.botRight.mag === 3 &&
          v.V1.re === 2 && v.V1.im === 2 && v.V2.re === -2 && v.V2.im === 0) origin++;
      if (near(a.P_R2, 0)) zeroCnt++; else nonZeroCnt++;
    }
  }
  check("연립식 잔차 0 (48/48)", badRes === 0, `위반 ${badRes}`);
  check("전력수지 일치 (48/48)", badBal === 0, `위반 ${badBal}`);
  check("값 품질(전원 가우스 정수·전력 0.5배수·소자 종류)", badClean === 0, `위반 ${badClean}`);
  check("원본 튜플 미생성", origin === 0, `${origin}회`);
  check("★ P_R2가 0인 경우와 아닌 경우가 모두 나온다", zeroCnt > 0 && nonZeroCnt > 0, `0:${zeroCnt} / non0:${nonZeroCnt}`);
  const overlap = [...seen.exam_similar].filter((k) => seen.exam_variant.has(k));
  check("유사·변형 값 비중첩", overlap.length === 0, `${overlap.length}건`);
  check("값 공간 충분", __meshSpace(false).length >= 100 && __meshSpace(true).length >= 100,
    `${__meshSpace(false).length}/${__meshSpace(true).length}`);
}

// ── 6. 렌더 ──────────────────────────────────────────────────────────────────
console.log("[6] 렌더 구조·라벨 겹침");
{
  let overlapTotal = 0, missing = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 6; s++) {
      const g = generateAcTwoSourceMeshPower({ seed: s * 104729, mode });
      const svg = renderAcTwoSourceMeshCircuit(g.circuit);
      overlapTotal += findLabelOverlaps(svg).length;
      for (const k of ["topLeft", "mid", "topRight", "botLeft", "botRight"]) {
        if (!svg.includes(g.circuit[k].label) || !svg.includes(g.circuit[k].name)) missing++;
      }
      if (!svg.includes(g.circuit.v1Label) || !svg.includes(g.circuit.v2Label)) missing++;
      if (!svg.includes("I₁") || !svg.includes("I₂")) missing++;
    }
  }
  check("라벨 겹침 0", overlapTotal === 0, `${overlapTotal}건`);
  check("소자·전원·전류 라벨 누락 0", missing === 0, `${missing}건`);
}

// ── 7. 발문·정답 텍스트 ──────────────────────────────────────────────────────
console.log("[7] 발문·정답 텍스트");
{
  const { runAcTwoSourceMeshPowerPipeline } = await import("@/lib/pipeline/runAcTwoSourceMeshPowerPipeline");
  let badStep = 0, badTxt = 0, badFig = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    const probs = await runAcTwoSourceMeshPowerPipeline({ analysis: null, mode, count: 3 });
    for (const p of probs) {
      for (const m of ["[단계 1]", "[단계 2]", "[단계 3]"]) {
        if (!p.question.includes(m) || !p.answer.includes(m) || !p.solution.includes(m)) badStep++;
      }
      if (!/두 개의 교류 전원/.test(p.content) || !/페이저 전압/.test(p.content)) badTxt++;
      if (!/I₁/.test(p.answer) || !/I₂/.test(p.answer) || !/\[W\]/.test(p.answer)) badTxt++;
      // ★ 소수 표기 금지 (전역 분수 변환기 개입 차단) — 각도·전력은 정수/0.5 배수를 기호로 쓴다
      if (/\d\.\d{2,}/.test(`${p.answer}\n${p.solution}`)) badTxt++;
      // ★ 음수는 유니코드 마이너스(−)로 통일 — ASCII 하이픈이 섞이면 표기가 어긋난다.
      if (/[=(]\s*-\d/.test(`${p.answer}\n${p.solution}`)) badTxt++;
      const roles = (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(",");
      if (roles !== "original_circuit:ac_two_source_mesh_circuit") badFig++;
    }
  }
  check("[단계 1~3] 구조", badStep === 0, `위반 ${badStep}`);
  check("발문 문구·정답 형식", badTxt === 0, `위반 ${badTxt}`);
  check("figure = 2-메시 회로 1개", badFig === 0, `위반 ${badFig}`);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
