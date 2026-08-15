/**
 * smokeAcSuperpositionNullSource — 2전원 페이저 + 중첩 → **V_L = 0이 되는 전류원 역산**
 * (임용 3번 회로이론, `ac_superposition_null_source`) 스모크.
 *
 * ★ 실측(2026-08-05, 사용자 신고): 전용 항목이 없어 generic **universal_ac**로 떨어져
 *   정답이 **"(query 없음)"**, 풀이는 "AC 정상상태 phasor 해석 — 입력 ω = 10000 rad/s" placeholder였다.
 *   서버 로그의 실제 Vision 요약을 그대로 라우팅 케이스로 넣는다(있지도 않은 "종속 전원" 서술 포함).
 *
 * 원본 검산: V_L1 = j2 = 2∠90°[V] · Z_p = 2Ω · **I_s = −j = 1∠−90°[A]**.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcSuperpositionNullSource.mjs
 */
import {
  __nullSourceSpace, __originalNullSource, generateAcSuperpositionNullSource, polarTex, zSumTex,
} from "../lib/generation/topologies/acSuperpositionNullSource.ts";
import { detectAcSuperpositionNullSource } from "../lib/pipeline/runAcSuperpositionNullSourcePipeline.ts";
import { detectAcTwoSourceMeshPower } from "../lib/pipeline/runAcTwoSourceMeshPowerPipeline.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { renderAcTwoSourceMeshCircuit } from "../lib/renderers/acTwoSourceMeshCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ok   ${m}`); };
const bad = (m) => { fail++; console.log(`  FAIL ${m}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const mk = (o = {}) => ({
  topic: o.topic ?? "RLC 회로의 페이저 해석",
  interpretation: o.interpretation ?? "",
  relatedConcepts: o.concepts ?? [],
  fillInTheBlanks: [],
  componentInventory: o.inv ?? [
    { id: "V1", type: "V", value: "√2∠45°" }, { id: "R1", type: "R", value: "1" },
    { id: "R2", type: "R", value: "1" }, { id: "L1", type: "L", value: "j2" },
    { id: "C1", type: "C", value: "-j1" }, { id: "C2", type: "C", value: "-j1" },
    { id: "I1", type: "I", value: "i_s" },
  ],
});

// ─────────────────────────────────────────────────────────────
console.log("=== 1. 감지 — 실측 회차 + 표현 변형 ===");
const POSITIVE = [
  ["실측 로그 회차(‘종속 전원’ 환각 포함)",
    "이 문제는 주어진 RLC 회로에서 페이저 전압과 전류를 구하는 문제입니다. 주어진 전압원과 인덕터 양단의 전압이 0이 될 때의 전류를 구하는 과정입니다. 페이저 해석을 통해 복소수 형태의 전압과 전류를 계산하며, 종속 전원이 포함되어 있어 이를 고려한 해석이 필요합니다.",
    ["페이저 해석", "복소수 전압", "복소수 전류", "종속 전원", "인덕턴스"]],
  ["원본 발문 그대로",
    "2개의 교류 전원이 포함된 RLC 회로를 주파수 영역에서 표현한 것이다. 페이저 전압원 V_s = √2∠45° [V]일 때, 인덕터 양단의 페이저 전압 V_L = 0[V]가 되도록 페이저 전류원 I_s [A]를 구한다.",
    ["중첩의 원리", "페이저"]],
  ["중첩 절차만 서술",
    "전류원이 개방된 경우와 전압원이 단락된 경우의 인덕터 양단 전압을 각각 구한 뒤, 중첩의 원리로 V_L = 0이 되는 조건을 찾는다.",
    ["중첩의 원리", "교류 회로"]],
  ["커패시터 버전(변형)",
    "교류 회로에서 커패시터 양단의 페이저 전압이 0[V]가 되도록 페이저 전류원의 값을 중첩의 원리로 구한다.",
    ["페이저", "중첩"]],
];
for (const [name, interp, concepts] of POSITIVE) {
  detectAcSuperpositionNullSource(mk({ interpretation: interp, concepts }))
    ? ok(`감지: ${name}`) : bad(`미감지: ${name}`);
}

console.log("\n=== 2. 형제 양보 ===");
const NEGATIVE = [
  ["임용 5번 2전원 메시 평균전력", "두 개의 교류 전원이 포함된 RLC 회로에서 메시 전류 I₁·I₂를 구하고 저항 R₂에서 소비되는 평균 전력을 구한다.", ["평균 전력"]],
  ["ac_superposition_source_design", "교류 전압원과 전류원이 있는 회로에서 커패시터 양단 전압이 −7−j[V]가 되도록 두 전원의 크기를 중첩의 원리로 구한다.", ["중첩의 원리"]],
  ["테브난 최대전력", "단자 a-b에서 본 테브난 등가 임피던스를 구하고 최대 평균전력을 전달하는 부하를 구한다.", ["테브난"]],
  ["공진/대역폭", "직렬 RLC 회로의 공진 주파수와 대역폭을 구한다.", ["공진"]],
  ["스위치 과도응답", "t = 0에서 스위치가 열릴 때 v_c(t)를 구한다. 시정수를 이용한 과도응답 해석.", ["과도응답"]],
  ["오실로스코프", "오실로스코프 화면에서 2.00 V/div, 500 µs/div로 위상차를 읽어 인덕턴스를 구한다.", ["오실로스코프"]],
];
for (const [name, interp, concepts] of NEGATIVE) {
  !detectAcSuperpositionNullSource(mk({ interpretation: interp, concepts }))
    ? ok(`양보: ${name}`) : bad(`잘못 가져감: ${name}`);
}
// 반대 방향 — 이 원본을 형제(2전원 메시 평균전력)가 가져가지 않아야 한다.
!detectAcTwoSourceMeshPower(mk({ interpretation: POSITIVE[0][1], concepts: POSITIVE[0][2] }))
  ? ok("형제 detectAcTwoSourceMeshPower는 이 원본을 안 가져감") : bad("형제가 이 원본을 가져감");

console.log("\n=== 3. 분류기 (과목 무관) ===");
for (const subject of ["circuit_theory", "electronics", "mixed_signal"]) {
  const r = classifyCircuitType(mk({ interpretation: POSITIVE[0][1], concepts: POSITIVE[0][2] }), subject);
  r.type === "ac_superposition_null_source"
    ? ok(`${subject} → ac_superposition_null_source`) : bad(`${subject} → ${r.type}`);
}

console.log("\n=== 4. 원본 물리 (수기검산 일치) ===");
{
  const g = __originalNullSource();
  const a = g.answer;
  near(a.VL1.re, 0) && near(a.VL1.im, 2) ? ok("V_L1 = j2") : bad(`V_L1 = ${a.VL1.re}+j${a.VL1.im}`);
  near(a.Zp.re, 2) && near(a.Zp.im, 0) ? ok("Z_p = 2Ω (순저항)") : bad(`Z_p = ${a.Zp.re}+j${a.Zp.im}`);
  near(a.Is.re, 0) && near(a.Is.im, -1) ? ok("I_s = −j = 1∠−90°") : bad(`I_s = ${a.Is.re}+j${a.Is.im}`);
  near(a.VL1.re + a.VL2.re, 0) && near(a.VL1.im + a.VL2.im, 0) ? ok("V_L1 + V_L2 = 0") : bad("중첩 합이 0이 아님");
}

console.log("\n=== 5. 생성물 48개 — 독립 재검산 (메시 해석으로 교차검증) ===");
{
  // 독립 검증: 두 메시(좌=전압원 메시, 우=전류원 메시)로 직접 푼다.
  //   우 메시 전류는 전류원이 강제 → I₂ = I_s (시계 방향 기준 부호는 아래에서 맞춘다).
  //   좌 메시: I₁(Z_a+Z_m+Z_c) − I₂·Z_m = V_s,  V_L = (I₁ − I₂)·Z_m.
  const C = (re, im) => ({ re, im });
  const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
  const csub = (a, b) => C(a.re - b.re, a.im - b.im);
  const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const zOf = (e) => (e.kind === "R" ? C(e.mag, 0) : C(0, e.kind === "L" ? e.mag : -e.mag));

  let bad1 = 0, checked = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let i = 0; i < 24; i++) {
      const g = generateAcSuperpositionNullSource({ index: i, mode });
      const { arms, Vs } = g.values, a = g.answer;
      const Za = zOf(arms.topLeft), Zm = zOf(arms.mid), Zc = zOf(arms.botLeft);
      // 전류원이 상단 마디로 유입 → 우 메시 전류(시계) = −I_s
      const I2 = C(-a.Is.re, -a.Is.im);
      const I1 = cdiv(cadd(Vs, cmul(I2, Zm)), cadd(cadd(Za, Zm), Zc));
      const VL = cmul(csub(I1, I2), Zm);
      checked++;
      if (!near(VL.re, 0, 1e-7) || !near(VL.im, 0, 1e-7)) {
        bad1++;
        if (bad1 <= 2) console.log(`    ↳ ${mode}#${i}: V_L = ${VL.re.toFixed(4)}+j${VL.im.toFixed(4)} (0이어야 함)`);
      }
      // 단계 1 값도 독립적으로: 전류원 개방(I₂=0) → V_L1 = I₁·Z_m
      const I1open = cdiv(Vs, cadd(cadd(Za, Zm), Zc));
      const VL1 = cmul(I1open, Zm);
      if (!near(VL1.re, a.VL1.re, 1e-7) || !near(VL1.im, a.VL1.im, 1e-7)) bad1++;
    }
  }
  bad1 === 0 ? ok(`${checked}개 생성물 모두 메시 해석 교차검증 통과 (V_L = 0)`) : bad(`${bad1}건 불일치`);
}

console.log("\n=== 6. 값 품질 / 원본 미생성 / 풀 비중첩 ===");
{
  const sim = __nullSourceSpace(false), vari = __nullSourceSpace(true);
  sim.length > 20 && vari.length > 20 ? ok(`값 공간 유사 ${sim.length} · 변형 ${vari.length}`) : bad(`값 공간 부족: ${sim.length}/${vari.length}`);
  const isOriginal = (v) =>
    !v.swapped && v.arms.topLeft.mag === 1 && v.arms.mid.mag === 2 && v.arms.botLeft.mag === 1 &&
    v.arms.topRight.mag === 1 && v.arms.botRight.mag === 1 && v.Vs.re === 1 && v.Vs.im === 1;
  !sim.some(isOriginal) ? ok("원본 튜플 미생성") : bad("원본 튜플이 생성 풀에 있다");
  sim.every((v) => !v.swapped) && vari.every((v) => v.swapped)
    ? ok("유사=가운데 인덕터 / 변형=가운데 커패시터 (소자 종류 교환)") : bad("모드별 배치가 섞였다");
  // 답 표기 품질 — 값이 **정수 격자** 위여야 극형식 √n 표기가 정확하다.
  let ugly = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let i = 0; i < 12; i++) {
      const g = generateAcSuperpositionNullSource({ index: i, mode });
      for (const z of [g.answer.VL1, g.answer.Zp, g.answer.Is]) {
        if (!near(z.re, Math.round(z.re)) || !near(z.im, Math.round(z.im))) ugly++;
      }
    }
  }
  ugly === 0 ? ok("V_L1·Z_p·I_s가 모두 정수 격자") : bad(`${ugly}건이 정수 격자 밖`);
}

console.log("\n=== 6-2. 극형식 표기가 실제 크기와 일치한다 (√n 오표기 방지) ===");
{
  // ★ 실측 2026-08-05: |I_s| = 1.5인데 `√2∠−90°`(=1.414)로 찍혔다 — magTex가 |z|²를 반올림했다.
  const parseMag = (s) => {
    const head = String(s).split("∠")[0];
    return head.startsWith("√") ? Math.sqrt(Number(head.slice(1))) : Number(head.replace("−", "-"));
  };
  let mismatch = 0, hyphen = 0, checked = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let i = 0; i < 24; i++) {
      const g = generateAcSuperpositionNullSource({ index: i, mode });
      for (const z of [g.answer.VL1, g.answer.Is]) {
        const s = polarTex(z);
        checked++;
        if (!near(parseMag(s), Math.hypot(z.re, z.im), 1e-6)) { mismatch++; if (mismatch <= 2) console.log(`    ↳ ${s} vs |z|=${Math.hypot(z.re, z.im)}`); }
        if (s.includes("-")) hyphen++;   // ASCII 하이픈 금지 (유니코드 마이너스로 통일)
      }
    }
  }
  mismatch === 0 ? ok(`극형식 크기 ${checked}건 모두 실제 값과 일치`) : bad(`${mismatch}건 크기 오표기`);
  hyphen === 0 ? ok("음수 각도가 유니코드 마이너스(−)") : bad(`${hyphen}건이 ASCII 하이픈`);
}

console.log("\n=== 6-3. 임피던스 합 표기 (‘+ −j2Ω’ 금지) ===");
{
  const s = zSumTex([{ kind: "R", mag: 2 }, { kind: "L", mag: 4 }, { kind: "C", mag: 2 }]);
  s === "2Ω + j4Ω − j2Ω" ? ok(`합 표기: ${s}`) : bad(`합 표기 이상: ${s}`);
}

console.log("\n=== 7. 렌더 — 전류원·V_L 극성 / 형제 무회귀 ===");
{
  const g = generateAcSuperpositionNullSource({ index: 0, mode: "exam_similar" });
  const svg = renderAcTwoSourceMeshCircuit(g.circuitDiagram);
  svg.includes("<svg") ? ok("SVG 생성") : bad("SVG 실패");
  /<circle[^>]*r="22"[\s\S]{0,200}<path d="M640,\d+ l-5,8/.test(svg) || svg.includes('l-5,8 l10,0 z')
    ? ok("우측이 전류원 심볼(원+↑화살표)") : bad("전류원 심볼이 없다");
  svg.includes(">V_L<") ? ok("가운데 가지에 V_L 표기") : bad("V_L 표기 없음");
  (svg.match(/>\+</g) ?? []).length >= 2 ? ok("+/− 극성 표기") : bad("극성 표기 부족");
  !svg.includes(">I₁<") && !svg.includes(">I₂<") ? ok("메시 화살표(I₁·I₂) 미표시") : bad("불필요한 메시 화살표");

  // ★ 형제(임용 5번)는 확장 필드를 안 쓰므로 **그림이 그대로**여야 한다.
  const legacy = {
    v1Label: "V₁ √8∠45°", v2Label: "V₂ 2∠180°",
    topLeft: { kind: "R", name: "R₁", label: "1Ω" }, mid: { kind: "R", name: "R₂", label: "1Ω" },
    topRight: { kind: "C", name: "C₂", label: "−j2Ω" }, botLeft: { kind: "C", name: "C₁", label: "−j1Ω" },
    botRight: { kind: "L", name: "L", label: "j3Ω" },
  };
  const svgLegacy = renderAcTwoSourceMeshCircuit(legacy);
  svgLegacy.includes(">I₁<") && svgLegacy.includes(">I₂<") && !svgLegacy.includes(">V_L<") &&
  svgLegacy.includes("메시 전류 I₁·I₂") && !svgLegacy.includes("l-5,8 l10,0 z")
    ? ok("형제(임용 5번) 렌더 무회귀 — 화살표·캡션·전압원 유지")
    : bad("형제 렌더가 바뀌었다");
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
