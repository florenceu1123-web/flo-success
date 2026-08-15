/**
 * 교류 브리지 + Δ-Y(델타-와이) 변환 → 등가 임피던스 Z_AB → 전류 크기 a
 * (임용 2번 회로이론) 정적 스모크 — API 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcDeltaWyeBridge.mjs
 *
 * 배경(2026-08-04 실측, 사용자 신고): 전용 archetype이 없어 **`ac_parallel_branches`(임용 5번)** 가
 * 가로챘다(서버 로그: reclassified=ac_parallel_branches, figures=analog_netlist). 그 형제는
 * 브리지·Δ-Y·등가 임피던스 요구 어느 것도 재현하지 못한다.
 *
 * 물리(닫힌형):
 *   Δ→Y: Z_A = Z_AL·Z_AR/S, Z_1 = Z_AL·Z_LR/S, Z_2 = Z_AR·Z_LR/S,  S = Z_AL+Z_AR+Z_LR
 *   Z_AB = Z_A + (Z_1 + Z_LB) ∥ (Z_2 + Z_RB),  I = V/Z_AB
 *   원본(j2·2·−j2·j2·2, V=20∠0°) → Z_A=j2, Z_1=2, Z_2=−j2 → (2+j2)∥(2−j2)=2
 *                                → **Z_AB = 2+j2 = 2√2∠45°**, **a = 20/(2√2) = 5√2 ≈ 7.071**
 *
 * ★ 재검산은 Δ-Y를 **전혀 쓰지 않는 노드해석**으로 한다(생성기와 독립된 경로).
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import {
  generateAcDeltaWyeBridge,
  __originalDeltaWyeForVerify,
  __deltaWyeSpace,
  armZ,
} from "@/lib/generation/topologies/acDeltaWyeBridge";
import { detectAcDeltaWyeBridge } from "@/lib/pipeline/runAcDeltaWyeBridgePipeline";
import {
  renderAcDeltaWyeBridgeCircuit,
  renderAcDeltaWyeEquivCircuit,
} from "@/lib/renderers/acDeltaWyeBridgeCircuitRenderer";
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

// ── 복소 helper (독립 구현) ──────────────────────────────────────────────────
const K = (re, im) => ({ re, im });
const add = (a, b) => K(a.re + b.re, a.im + b.im);
const sub = (a, b) => K(a.re - b.re, a.im - b.im);
const mul = (a, b) => K(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return K((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const invc = (a) => div(K(1, 0), a);
const absc = (a) => Math.hypot(a.re, a.im);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/**
 * ★ 독립 재검산 — Δ-Y를 쓰지 않고 노드해석으로 Z_AB를 직접 푼다.
 *   노드 L·R 미지, A=1V, B=0. Z_AB = V_A / I_in.
 */
function zabByNodal(arms) {
  const Yal = invc(armZ(arms.topLeft)), Yar = invc(armZ(arms.topRight));
  const Ylr = invc(armZ(arms.bridge)), Ylb = invc(armZ(arms.botLeft)), Yrb = invc(armZ(arms.botRight));
  const VA = K(1, 0);
  const a11 = add(add(Yal, Ylr), Ylb), a12 = K(-Ylr.re, -Ylr.im);
  const a21 = a12, a22 = add(add(Yar, Ylr), Yrb);
  const b1 = mul(Yal, VA), b2 = mul(Yar, VA);
  const det = sub(mul(a11, a22), mul(a12, a21));
  const VL = div(sub(mul(b1, a22), mul(a12, b2)), det);
  const VR = div(sub(mul(a11, b2), mul(b1, a21)), det);
  const Iin = add(mul(sub(VA, VL), Yal), mul(sub(VA, VR), Yar));
  return div(VA, Iin);
}

// ── 1. 라우팅 (감지기) ───────────────────────────────────────────────────────
console.log("[1] 감지 — 실측 오분류 회차 + 표현 변형");
const REPORTED = A(
  "RLC 회로의 Δ-Y 변환",
  "이 문제는 교류 전원이 포함된 RLC 회로에서 Δ-Y 변환을 통해 등가 임피던스를 구하고, 주어진 전압과 전류 조건에서 미지수 a의 값을 계산하는 문제입니다. Δ-Y 변환을 통해 회로를 단순화한 후, 주어진 전압과 전류의 페이저 관계를 이용하여 a의 값을 도출합니다.",
  ["Δ-Y 변환", "임피던스", "페이저", "교류 회로 해석", "RLC 회로", "복소수"],
  inv("V:20∠0°V", "L:j2Ω", "R:2Ω", "C:-j2Ω", "L:j2Ω", "R:2Ω"),
);
const REPORTED2 = A(
  "교류 RLC 회로 해석",
  "이 문제는 교류 전원이 포함된 RLC 회로에서 Δ-Y 변환을 사용하여 임피던스를 구하고, 주어진 전압과 전류 조건에서 특정 지점의 전압을 계산하는 문제입니다. Δ-Y 변환을 통해 회로를 단순화한 후, 페이저 해석을 통해 등가 임피던스를 구하는 과정이 필요합니다.",
  ["Δ-Y 변환", "페이저 해석", "임피던스", "교류 회로"],
  inv("V:20∠0°V", "L:j2Ω", "R:2Ω", "C:-j2Ω", "L:j2Ω", "R:2Ω"),
);
// ★ 실측 E2E 회차 3 — Vision이 "등가 임피던스"가 아니라 **"특정 임피던스"** 라고 요약한 회차.
//   `등가\s*임피던스`를 요구했더니 통째로 미발화해 ac_parallel_branches로 샜다(회귀 고정).
const REPORTED3 = A(
  "교류 RLC 회로 해석",
  "이 문제는 교류 전원이 포함된 RLC 회로에서 Δ-Y 변환을 통해 회로를 분석하는 문제입니다. Δ-Y 변환 후, 주어진 전압과 전류 조건을 이용하여 특정 임피던스를 구하고, 이를 통해 회로의 특정 전압 값을 계산하는 과정입니다. 커패시터와 인덕터의 초기값은 0으로 가정하여 해석합니다.",
  ["Δ-Y 변환", "임피던스", "페이저"],
  inv("V:20∠0°V", "L:j2Ω", "L:j2Ω", "L:j2Ω", "C:-j2Ω", "R:2Ω", "R:2Ω"),
);
const VARIANTS = [
  ["실측 회차 1", REPORTED],
  ["실측 회차 2", REPORTED2],
  ["실측 회차 3 (‘특정 임피던스’ 요약)", REPORTED3],
  ["델타-와이 한글 표기", A("교류 브리지 회로", "델타-와이 변환을 이용하여 단자 A-B 사이의 등가 임피던스를 구한다.", ["교류"], inv("V:20∠0°V", "L:j2Ω"))],
  ["영문 delta-wye", A("AC bridge", "Using delta-to-wye transformation, find the equivalent impedance between terminals A and B.", [], [])],
  ["△-Y 기호", A("교류 회로", "△-Y 변환으로 회로를 단순화한 뒤 합성 임피던스 Z를 구한다.", ["페이저"], [])],
  ["삼각-성형 표기", A("교류 회로 해석", "삼각 결선을 성형으로 바꾸어 등가 임피던스를 계산한다.", ["임피던스"], [])],
];
for (const [name, an] of VARIANTS) check(`감지 — ${name}`, detectAcDeltaWyeBridge(an) === true);

// ── 2. 형제 양보 ─────────────────────────────────────────────────────────────
console.log("[2] 형제 양보 (미탈취)");
const YIELDS = [
  ["최대평균전력 브리지(ac_bridge_max_power)", A("AC 휘트스톤 브리지", "Δ-Y 변환도 언급되지만 테브난 등가 임피던스와 최대 평균 전력을 전달하는 부하 R_L을 구한다.", ["최대 전력"], [])],
  ["3상 결선", A("3상 회로", "Δ-Y 변환으로 삼상 평형 회로의 선간 전압과 상전압, 등가 임피던스를 구한다.", ["3상"], [])],
  ["종속전원 테브난", A("종속전원 페이저 회로", "Δ-Y 변환을 포함하며 종속 전압원이 있는 회로의 등가 임피던스를 구한다.", ["종속 전원"], [])],
  ["임용 5번 형제(ac_parallel_branches)", A("AC 다중 가지 페이저", "교류 전원과 전류원이 있는 회로에서 각 가지 전류의 페이저를 구하고 시간영역 전류를 도출한다.", ["페이저"], inv("V:20∠0°V", "L:j2Ω", "L:j1Ω", "C:-j1Ω", "R:1Ω"))],
  ["Δ-Y 없는 일반 임피던스", A("교류 회로", "직렬 RLC 회로의 합성 임피던스를 구한다.", ["임피던스"], [])],
  ["Δ-Y는 있으나 임피던스 요구 없음", A("교류 회로", "Δ-Y 변환 후 각 가지에 흐르는 전류의 순시값을 구한다.", [], [])],
];
for (const [name, an] of YIELDS) check(`양보 — ${name}`, detectAcDeltaWyeBridge(an) === false);

// ── 3. 분류기 (과목 무관) ────────────────────────────────────────────────────
console.log("[3] 분류기 — 과목 무관 0-PRE");
for (const subject of ["circuit_theory", "electronics", "mixed_signal", "digital_logic"]) {
  const r = classifyCircuitType(REPORTED, subject);
  check(`분류(${subject}) → ac_delta_wye_bridge`, r?.type === "ac_delta_wye_bridge", r?.type);
}
check("분류 — 실측 회차 3(‘특정 임피던스’)도 전용 유형",
  classifyCircuitType(REPORTED3, "circuit_theory")?.type === "ac_delta_wye_bridge",
  classifyCircuitType(REPORTED3, "circuit_theory")?.type);
check("형제(임용 5번) 분류는 그대로 ac_parallel_branches",
  classifyCircuitType(YIELDS[3][1], "circuit_theory")?.type === "ac_parallel_branches",
  classifyCircuitType(YIELDS[3][1], "circuit_theory")?.type);

// ── 4. 원본 물리 ─────────────────────────────────────────────────────────────
console.log("[4] 원본 물리 (j2·2·−j2·j2·2, V=20∠0°)");
{
  const o = __originalDeltaWyeForVerify();
  const a = o.answer;
  check("Z_A = j2", near(a.Za.re, 0) && near(a.Za.im, 2), JSON.stringify(a.Za));
  check("Z_1 = 2", near(a.Zl.re, 2) && near(a.Zl.im, 0), JSON.stringify(a.Zl));
  check("Z_2 = −j2", near(a.Zr.re, 0) && near(a.Zr.im, -2), JSON.stringify(a.Zr));
  check("두 가지 = 2+j2 / 2−j2 (켤레쌍)",
    near(a.b1.re, 2) && near(a.b1.im, 2) && near(a.b2.re, 2) && near(a.b2.im, -2));
  check("병렬 = 2 (순저항)", near(a.Zpar.re, 2) && near(a.Zpar.im, 0), JSON.stringify(a.Zpar));
  check("Z_AB = 2+j2", near(a.Zab.re, 2) && near(a.Zab.im, 2), JSON.stringify(a.Zab));
  check("|Z_AB| = 2√2", near(a.absZ, 2 * Math.SQRT2));
  check("a = 5√2 ≈ 7.071", near(a.a, 5 * Math.SQRT2) && a.m === 5);
  check("I 위상 = −45°", a.iPhase === -45, String(a.iPhase));
  const nodal = zabByNodal(o.values.arms);
  check("★ 노드해석 독립 재검산 일치", near(nodal.re, a.Zab.re, 1e-9) && near(nodal.im, a.Zab.im, 1e-9),
    JSON.stringify(nodal));
}

// ── 5. 생성물 재검산 ─────────────────────────────────────────────────────────
console.log("[5] 생성물 독립 재검산 (유사·변형 각 24개)");
{
  let bad = 0, badNodal = 0, badPhase = 0, badRoot2 = 0, origin = 0;
  const seen = { exam_similar: new Set(), exam_variant: new Set() };
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 24; s++) {
      const g = generateAcDeltaWyeBridge({ seed: s * 7919, mode });
      const v = g.values, a = g.answer;
      seen[mode].add(`${v.X}|${v.t}|${v.V}`);
      if (v.X === 2 && v.t === 2 && v.V === 20) origin++;   // 원본 튜플 미생성
      // (a) Δ-Y 결과를 노드해석으로 교차검증
      const nod = zabByNodal(v.arms);
      if (!near(nod.re, a.Zab.re, 1e-9) || !near(nod.im, a.Zab.im, 1e-9)) badNodal++;
      // (b) Z = k(1±j), |Z| = k√2, a = m√2 = V/|Z|
      const sgn = v.inductive ? 1 : -1;
      if (!near(a.Zab.re, a.k) || !near(a.Zab.im, sgn * a.k)) bad++;
      if (!near(a.absZ, a.k * Math.SQRT2) || !near(a.a, a.m * Math.SQRT2)) badRoot2++;
      if (!near(a.a, v.V / absc(a.Zab))) badRoot2++;
      // (c) 전류 위상 = 유사 −45° / 변형 +45°
      if (a.iPhase !== (v.inductive ? -45 : 45)) badPhase++;
      // (d) 소자 종류 — 유사=좌상 L·가교 C, 변형=좌상 C·가교 L, 우측 2개는 항상 R
      const okKind = v.inductive
        ? v.arms.topLeft.kind === "L" && v.arms.bridge.kind === "C" && v.arms.botLeft.kind === "L"
        : v.arms.topLeft.kind === "C" && v.arms.bridge.kind === "L" && v.arms.botLeft.kind === "C";
      if (!okKind || v.arms.topRight.kind !== "R" || v.arms.botRight.kind !== "R") bad++;
    }
  }
  check("Δ-Y 결과 = 노드해석 (48/48)", badNodal === 0, `불일치 ${badNodal}`);
  check("Z = k(1±j) · 소자 배치 규칙", bad === 0, `위반 ${bad}`);
  check("|Z|=k√2 · a=m√2=V/|Z|", badRoot2 === 0, `위반 ${badRoot2}`);
  check("전류 위상 유사 −45° / 변형 +45°", badPhase === 0, `위반 ${badPhase}`);
  check("원본 튜플(2,2,20) 미생성", origin === 0, `${origin}회`);
  const overlap = [...seen.exam_similar].filter((k) => seen.exam_variant.has(k));
  check("유사·변형 값 풀 비중첩", overlap.length === 0, overlap.join(","));
  check("값 공간 충분(≥100)", __deltaWyeSpace().length >= 100, String(__deltaWyeSpace().length));
  check("값 공간에 원본 튜플 없음",
    !__deltaWyeSpace().some((p) => p.X === 2 && p.t === 2 && p.V === 20));
}

// ── 6. 렌더 ──────────────────────────────────────────────────────────────────
console.log("[6] 렌더 구조·라벨 겹침");
{
  let overlapTotal = 0, missing = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 6; s++) {
      const g = generateAcDeltaWyeBridge({ seed: s * 104729, mode });
      const svg1 = renderAcDeltaWyeBridgeCircuit(g.bridgeDiagram);
      const svg2 = renderAcDeltaWyeEquivCircuit(g.equivDiagram);
      overlapTotal += findLabelOverlaps(svg1).length + findLabelOverlaps(svg2).length;
      // 5-arm 라벨이 모두 (가)에 나타나는지
      for (const key of ["topLeft", "topRight", "bridge", "botLeft", "botRight"]) {
        if (!svg1.includes(g.bridgeDiagram.arms[key].label)) missing++;
      }
      if (!svg1.includes(">A<") || !svg1.includes(">B<")) missing++;    // 단자 A·B
      if (!svg2.includes(">A<") || !svg2.includes(">B<")) missing++;
      if (!svg2.includes("Δ-Y 변환")) missing++;                        // (나) 박스 캡션
      // ★ Y 세 팔의 값은 (나)에 노출되지 않아야 한다 (학생이 [단계 1]에서 도출)
      const zaLabel = `${g.answer.Za.im}`;
      if (svg2.includes(`j${zaLabel}[Ω]`) && !svg2.includes(g.equivDiagram.botLeft.label)) missing++;
    }
  }
  check("(가)·(나) 라벨 겹침 0", overlapTotal === 0, `${overlapTotal}건`);
  check("arm 라벨·단자·캡션 누락 0", missing === 0, `${missing}건`);
  const g0 = __originalDeltaWyeForVerify();
  const s1 = renderAcDeltaWyeBridgeCircuit(g0.bridgeDiagram);
  check("(가)에 교류 전원 + 전류 I 표기", s1.includes("V=20∠0°[V]") && s1.includes("I[A]"));
  check("(가) 브리지 점선 박스", s1.includes("stroke-dasharray"));
  const s2 = renderAcDeltaWyeEquivCircuit(g0.equivDiagram);
  check("(나)에 하단 2 arm이 원본 그대로", s2.includes("j2[Ω]") && s2.includes("2[Ω]"));
  check("(나) Y 세 팔은 빈 박스(값 미표기)", (s2.match(/<rect/g) ?? []).length >= 4);
}

// ── 7. 발문·정답 텍스트 ──────────────────────────────────────────────────────
console.log("[7] 발문·정답 텍스트 (전역 분수 변환기 함정 포함)");
{
  const { runAcDeltaWyeBridgePipeline } = await import("@/lib/pipeline/runAcDeltaWyeBridgePipeline");
  let badDecimal = 0, badSteps = 0, badPhase = 0, badFigures = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    const probs = await runAcDeltaWyeBridgePipeline({ analysis: null, mode, count: 3 });
    for (const p of probs) {
      const txt = `${p.answer}\n${p.solution}`;
      // ★★ 소수 자체를 금지한다 — route의 전역 분수 변환기가 소수를 제각각 분수로 바꿔
      //   `Z = 5/2 + j2.5`·`|Z|² = 5/2² + 5/2²` 같은 지저분한 표기를 만든다(실측 E2E).
      //   발문·조건·정답·풀이 어디에도 소수점이 없어야 한다.
      if (/≈/.test(txt) || /\d\.\d/.test(txt)) badDecimal++;
      if (/\d\.\d/.test(p.content) || /\d\.\d/.test(p.question)) badDecimal++;
      if (/\d\.\d/.test((p.conditions ?? []).join(" "))) badDecimal++;
      if (!/√2/.test(p.answer)) badDecimal++;
      // 3단계 구조
      for (const m of ["[단계 1]", "[단계 2]", "[단계 3]"]) {
        if (!p.question.includes(m) || !p.answer.includes(m) || !p.solution.includes(m)) badSteps++;
      }
      // 발문의 전류 위상 = 유사 −45° / 변형 +45°
      const wantPhase = mode === "exam_similar" ? "a∠−45°" : "a∠45°";
      if (!p.content.includes(wantPhase)) badPhase++;
      if (!/Δ-Y 변환/.test(p.content)) badPhase++;
      // figure 2개 (원본 + 등가)
      const roles = (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(",");
      if (roles !== "original_circuit:ac_delta_wye_bridge_circuit,equivalent_circuit:ac_delta_wye_equiv_circuit") badFigures++;
    }
  }
  check("소수 근삿값 없음 · 정답은 근호 형태", badDecimal === 0, `위반 ${badDecimal}`);
  check("[단계 1~3] 구조 (발문·정답·풀이)", badSteps === 0, `위반 ${badSteps}`);
  check("발문 위상 표기 · Δ-Y 언급", badPhase === 0, `위반 ${badPhase}`);
  check("figure = (가) 브리지 + (나) Δ-Y 등가", badFigures === 0, `위반 ${badFigures}`);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
