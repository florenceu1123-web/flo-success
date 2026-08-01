// OPAMP 루프이득 L(s)=V_r/V_t + 좌반평면 안정도 (임용 12번 전자회로) — 전용 archetype 스모크 (API 없음)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOpampLoopGainStability.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectOpampLoopGainStability } from "../lib/pipeline/runOpampLoopGainStabilityPipeline.ts";
import { detectOpampFiniteGainOffset } from "../lib/pipeline/runOpampFiniteGainOffsetPipeline.ts";
import { generateOpampLoopGainStability } from "../lib/generation/topologies/opampLoopGainStability.ts";
import { renderOpampLoopGainStabilityCircuit } from "../lib/renderers/opampLoopGainStabilityCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✅ ${l}`); } else { fail++; console.log(`  ❌ ${l}`); } };

const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const INV = inv("OPAMP", "R", "R", "R", "R:R_S", "V:V_s");

// ── (1) 라우팅 ────────────────────────────────────────────────────────
console.log("\n[1] 라우팅 (분류기)");
const ROUTES = [
  ["실측형 요약 (루프이득+좌반평면)", mk("연산 증폭기 응용 회로의 안정도 해석",
    "복소주파수 s의 함수인 루프이득 L(s)=V_r/V_t를 구하기 위해 입력 V_s를 제거한 후 귀환 루프를 끊고 V_t를 인가하여 V_r을 얻는 회로에서, 특성방정식 0=1-L(s)의 근이 좌반평면에 위치하는 조건으로 저항 R_S와 R의 관계를 부등식으로 구한다.",
    ["루프이득", "특성방정식", "좌반평면", "안정적인 선형증폭기"], INV), "electronics", "opamp_loop_gain_stability"],
  ["표현 변형 — '루프 이득' 띄어쓰기 + 안정성", mk("OPAMP 회로의 안정성",
    "연산 증폭기 회로에서 루프 이득을 구하고 특성 방정식의 근의 위치로 안정성을 판별하여 저항 조건을 구한다.",
    ["루프 이득", "특성 방정식", "안정성"], INV), "electronics", "opamp_loop_gain_stability"],
  ["표현 변형 — 영문 loop gain / left half", mk("Op-amp stability analysis",
    "The loop gain L(s) = V_r/V_t is found by removing V_s and breaking the feedback loop. The root of the characteristic equation must lie in the left half s-plane.",
    ["loop gain", "characteristic equation", "stability"], INV), "electronics", "opamp_loop_gain_stability"],
  ["과목 오선택(회로이론)에도 잡힘", mk("연산 증폭기 응용 회로의 안정도 해석",
    "루프이득 L(s)=V_r/V_t와 특성방정식의 근이 좌반평면에 있을 조건으로 R_S와 R의 관계를 구한다.",
    ["루프이득", "좌반평면"], INV), "circuit_theory", "opamp_loop_gain_stability"],
  // ── 형제 회귀 ──
  ["형제 회귀 — Wien 발진기(발진 조건)", mk("OPAMP 발진기 회로 분석",
    "OPAMP를 이용한 발진기 회로에서 발진 조건을 구한다. RC 회로망과 OPAMP를 사용하며 β(s)와 1-Kβ(s)=0 특성방정식 조건을 활용한다.",
    ["발진기", "RC 회로망", "특성방정식"], inv("R", "R", "R", "OPAMP", "R", "R")), "electronics", "opamp"],
  ["형제 회귀 — 유한 이득 + 블록도 (임용 11번)", mk("OPAMP 유한 개방루프 이득과 블록도",
    "개방 루프 이득이 A(s)=A_0ω_0/(s+ω_0)인 반전증폭기 회로와 블록도가 주어질 때 중첩의 원리로 α와 β를 구하고 반전 입력 단자 V^-를 mV로 구한다.",
    ["개방 루프 이득", "블록도", "중첩의 원리"], inv("OPAMP", "R:1kΩ", "R:99kΩ", "V:0.1V")), "electronics", "opamp_finite_gain_block"],
  ["형제 회귀 — 정귀환 + SW step (임용 6번)", mk("정귀환 연산증폭기 회로",
    "정귀환(positive feedback)이 가해진 연산증폭기에서 개방 루프 이득 A(s)와 스위치 step 입력으로 β·B·D를 구하고 상수 K를 도출한다.",
    ["정귀환", "개방 루프 이득", "A(s)", "스위치"], inv("OPAMP", "R:1kΩ", "R:9kΩ", "V:1V", "SW")), "electronics", "opamp_positive_feedback"],
  ["형제 회귀 — 출력 오프셋 V_B (임용 9번)", mk("OPAMP 회로 해석",
    "개루프 이득 A_0인 연산증폭기에서 출력단에 직렬로 연결된 전압원 V_B를 고려하여 V_out = V_D - V_B로 출력전압을 구한다.",
    ["개루프 이득", "출력 전압원"], inv("OPAMP", "R:99kΩ", "R:1kΩ", "V:10sin(2000πt)V", "V:1V")), "electronics", "opamp_finite_gain_offset"],
];
for (const [name, a, subject, want] of ROUTES) {
  const got = classifyCircuitType(a, subject).type;
  ok(got === want, `${name} → ${got}${got === want ? "" : ` (기대: ${want})`}`);
}
ok(detectOpampLoopGainStability(ROUTES[0][1]) === true, "detect: 실측형 요약 발화");
ok(detectOpampLoopGainStability(ROUTES[4][1]) === false, "detect: Wien 발진기엔 양보");
ok(detectOpampLoopGainStability(ROUTES[7][1]) === false, "detect: 오프셋 V_B 유형엔 미발화");
ok(detectOpampFiniteGainOffset(ROUTES[0][1]) === false, "형제 detect(오프셋)가 루프이득을 뺏지 않음");
// ★ substring 함정 회귀: "개루프 이득" ⊃ "루프 이득" — 이것만으로는 절대 발화하면 안 된다.
{
  for (const phrase of ["개루프 이득", "개방 루프 이득", "open-loop gain"]) {
    const trap = mk("OPAMP 회로 해석",
      `${phrase} A_0를 갖는 연산증폭기 회로가 안정적으로 동작하도록 되먹임 저항을 정한다.`,
      [phrase, "안정"], INV);
    ok(detectOpampLoopGainStability(trap) === false, `'${phrase}'만으로는 미발화 (substring 함정)`);
    ok(classifyCircuitType(trap, "electronics").type !== "opamp_loop_gain_stability",
      `'${phrase}'만인 원본을 분류기가 가로채지 않음`);
  }
}

// ── (2) 원본 물리 (R_a=R_f=R_p=R → R_S < R) ───────────────────────────
console.log("\n[2] 원본 물리 — 모든 저항 R이면 R_S < R");
{
  // k = R_S/(R_S+R_p) − R_a/(R_a+R_f) < 0  ⇔  R_S < R_p·R_a/R_f
  const cond = (a, f, p) => (a * p) / f;   // R_S < cond·R
  ok(cond(1, 1, 1) === 1, "R_a=R_f=R_p=R → R_S < R (원본 정답)");
  ok(cond(2, 1, 1) === 2, "R_a=2R → R_S < 2R");
  ok(cond(1, 2, 1) === 0.5, "R_f=2R → R_S < R/2");
  ok(cond(1, 1, 3) === 3, "R_p=3R → R_S < 3R");
  // 수치 검증: R=1, a=2,f=1,p=1 → 경계 R_S=2에서 k=0
  {
    const R = 1, Ra = 2 * R, Rf = 1 * R, Rp = 1 * R, Rs = 2;
    const k = Rs / (Rs + Rp) - Ra / (Ra + Rf);
    ok(Math.abs(k) < 1e-12, "경계 R_S=2R에서 특성근 s=0 (k=0)");
    const kIn = 1.9 / (1.9 + Rp) - Ra / (Ra + Rf);
    ok(kIn < 0, "R_S=1.9R(조건 만족)에서 k<0 → 좌반평면");
    const kOut = 2.1 / (2.1 + Rp) - Ra / (Ra + Rf);
    ok(kOut > 0, "R_S=2.1R(조건 위반)에서 k>0 → 우반평면");
  }
}

// ── (3) 생성물 독립 재검산 ────────────────────────────────────────────
console.log("\n[3] 생성물 재검산 (양 모드 × 12개)");
{
  let bad = 0, origHit = 0;
  const seen = { exam_similar: new Set(), exam_variant: new Set() };
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 0; s < 12; s++) {
      const g = generateOpampLoopGainStability({ seed: s * 5 + 2, mode });
      const { a, f, p, invertingSource } = g.values;
      const ratio = (a * p) / f;
      // 부등호 방향: 유사=정귀환이 비반전 → R_S < ratio·R / 변형=교환 → R_S > ratio·R
      const wantSign = invertingSource ? ">" : "<";
      if (!g.answer.ineqText.includes(`R_S ${wantSign}`)) bad++;
      // 비 표기 검증 (정수 / 반정수)
      const expect = Number.isInteger(ratio) ? (ratio === 1 ? "R" : `${ratio}R`) : null;
      if (expect && g.answer.ratioText !== expect) bad++;
      if (ratio < 0.5 || ratio > 4) bad++;
      if (invertingSource !== (mode === "exam_variant")) bad++;
      if (a === f && p === 1) origHit++;   // 원본과 도출량이 같은 조합
      seen[mode].add(`${a}/${f}/${p}`);
    }
  }
  ok(bad === 0, `24개 생성물 부등식·비 표기 일치 (불일치 ${bad})`);
  ok(origHit === 0, "원본과 동일 도출(a=f, p=1 → R_S<R) 미생성");
  const overlap = [...seen.exam_similar].filter((k) => seen.exam_variant.has(k)).length;
  ok(overlap === 0, `유사·변형 값 풀 분리 (겹침 ${overlap})`);
  ok(seen.exam_similar.size >= 3 && seen.exam_variant.size >= 3,
    `모드별 다양성 (유사 ${seen.exam_similar.size}종 / 변형 ${seen.exam_variant.size}종)`);
}

// ── (4) 렌더 구조 ─────────────────────────────────────────────────────
console.log("\n[4] 렌더 구조");
{
  const g = generateOpampLoopGainStability({ seed: 4, mode: "exam_similar" });
  const svgA = renderOpampLoopGainStabilityCircuit(g.circuitA);
  const svgB = renderOpampLoopGainStabilityCircuit(g.circuitB);
  ok(svgA.startsWith("<svg") && svgB.startsWith("<svg"), "(가)·(나) SVG 생성");
  ok(svgA.includes("V_out") && !svgA.includes("V_t"), "(가): V_out 단자, V_t 없음");
  ok(svgB.includes("V_r") && svgB.includes("V_t"), "(나): V_r·V_t 단자 둘 다");
  ok(svgB.includes("루프 절단"), "(나): 루프 절단 표시");
  ok(svgB.includes("V_s 제거") && !svgB.includes("V_s\"") , "(나): V_s 제거(전원 심볼 없음)");
  for (const tok of ["V⁻", "V⁺", "A(s)", "R_S"]) ok(svgA.includes(tok), `(가) 라벨: ${tok}`);
  // 변형: 전원 가지가 반전 단자 쪽 → +/− 위치 교환
  const gv = generateOpampLoopGainStability({ seed: 4, mode: "exam_variant" });
  ok(gv.circuitA.invertingSource === true, "변형: invertingSource=true (전원 가지 반전 단자)");
  ok(renderOpampLoopGainStabilityCircuit(gv.circuitA).startsWith("<svg"), "변형 (가) 렌더");
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
