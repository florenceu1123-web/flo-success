// 반전 OPAMP + T형 RC망 → 전달특성 + 사인파 발진기 (임용 9번 전자) 전용 archetype 검증 (API 없음)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOpampRcTOscillator.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectOpampRcTOscillator } from "../lib/pipeline/runOpampRcTOscillatorPipeline.ts";
import { generateOpampRcTOscillator } from "../lib/generation/topologies/opampRcTOscillator.ts";
import { renderOpampRcTOscillator } from "../lib/renderers/opampRcTOscillatorRenderer.ts";
import { routePipeline } from "../lib/analysis/routePipeline.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});

console.log("\n[1] 라우팅 — 원본(임용 9번)");
const REAL = mk(
  "연산증폭기 응용 회로와 사인파 발진기",
  "그림 (가)는 연산증폭기 응용 회로이며, 그림 (나)는 (가)의 회로에서 출력단자와 입력단자를 연결하여 구성한 사인파 발진기이다. (가)의 전달특성 V_out(s)/V_in(s)와 (나)에서 V_out의 주파수를 구한다. 전류 I_1(s)와 I_2(s)를 각각 구하고 특성방정식의 근에서 주파수를 구한다.",
  ["연산증폭기", "사인파 발진기", "전달특성", "특성방정식", "복소주파수"],
  inv("OPAMP", "R", "R", "C", "C", "C:2C", "R:R/2"),
);
for (const subject of ["electronics", "circuit_theory", "digital_logic"]) {
  const got = classifyCircuitType(REAL, subject).type;
  ok(`원본 → opamp_rc_t_oscillator (subject=${subject})`, got === "opamp_rc_t_oscillator", `got ${got}`);
}
ok("원본 → detect 발화", detectOpampRcTOscillator(REAL) === true);

// ★★ 실측 재신고(2026-08-01) 회귀 — Wien Bridge가 가져갔다.
//   Wien의 텍스트 시그니처가 `발진 + RC 회로망 + 특성방정식`이라 "특성방정식"만으로도 물어간다.
//   아래 회차들은 "전달특성"·"출력단자와 입력단자" 문구를 흘린 요약이다 — 그래도 잡혀야 한다.
const WOBBLE = [
  ["'전달특성'·'출력단자' 문구 없이 I₁·I₂만", mk(
    "연산증폭기 발진 회로 해석",
    "연산증폭기를 이용한 사인파 발진 회로에서 전류 I_1(s)와 I_2(s)를 구하고, 특성방정식의 근으로부터 출력 전압의 주파수를 구한다.",
    ["연산증폭기", "발진", "특성방정식"],
    inv("OPAMP", "R", "R", "C", "C"),
  )],
  ["소자에 2C·½R만 남은 회차", mk(
    "연산증폭기 RC 회로망 발진기",
    "연산증폭기와 RC 회로망으로 구성된 정현파 발진기의 주파수를 구한다.",
    ["연산증폭기", "발진기", "RC 회로망"],
    inv("OPAMP", "R", "R:R/2", "C", "C:2C"),
  )],
  ["'출력과 입력을 연결' 표현", mk(
    "연산증폭기 응용 회로와 발진",
    "연산증폭기 응용 회로의 출력과 입력을 연결하여 구성한 사인파 발진기의 발진 주파수를 구한다.",
    ["연산증폭기", "사인파 발진기"],
    inv("OPAMP", "R", "R", "C", "C"),
  )],
  ["'전달 함수' 표현", mk(
    "연산증폭기 회로의 전달 함수와 발진",
    "연산증폭기 회로의 전달 함수를 구하고 이를 이용해 사인파 발진 조건과 주파수를 구한다.",
    ["연산증폭기", "전달 함수", "발진"],
    inv("OPAMP", "R", "R", "C", "C"),
  )],
];
for (const [name, a] of WOBBLE) {
  const got = classifyCircuitType(a, "electronics").type;
  ok(`${name} → opamp_rc_t_oscillator`, got === "opamp_rc_t_oscillator", `got ${got}`);
  ok(`${name} → detect 발화`, detectOpampRcTOscillator(a) === true);
}

// ★★★ 실측 근본 원인(2026-08-01, 신고 3회): 분류기는 맞았는데 **routePipeline이 덮어썼다**.
//   tags.opamp + (oscillator|transfer_function) 이면 무조건 generic "opamp"로 override →
//   Wien Bridge 회로가 반복 생성. 전용 archetype은 덮지 않아야 한다.
console.log("\n[1-b] routePipeline override — 전용 archetype을 덮지 않는다");
{
  const R = (circuitType, tags) => routePipeline({ circuitType, tags, objective: {}, subjectKey: "electronics", hasTopologySignature: false }).circuitType;
  ok("★ opamp_rc_t_oscillator는 override되지 않는다 (oscillator)",
    R("opamp_rc_t_oscillator", ["opamp", "oscillator"]) === "opamp_rc_t_oscillator",
    String(R("opamp_rc_t_oscillator", ["opamp", "oscillator"])));
  ok("★ opamp_rc_t_oscillator는 override되지 않는다 (transfer_function)",
    R("opamp_rc_t_oscillator", ["opamp", "transfer_function"]) === "opamp_rc_t_oscillator");
  ok("다른 전용 OPAMP archetype도 보존 (loop_gain_stability)",
    R("opamp_loop_gain_stability", ["opamp", "oscillator"]) === "opamp_loop_gain_stability");
  ok("function_generator 보존 (기존 예외)",
    R("function_generator", ["opamp", "oscillator"]) === "function_generator");
  // 원래 의도한 구제 동작은 그대로 살아 있어야 한다
  ok("generic universal_ac는 여전히 opamp로 구제된다",
    R("universal_ac", ["opamp", "oscillator"]) === "opamp");
  ok("미확정(undefined)도 여전히 opamp로 구제된다",
    R(undefined, ["opamp", "transfer_function"]) === "opamp");
  ok("opamp 태그가 없으면 override 안 함",
    R("universal_ac", ["oscillator"]) === "universal_ac");
}

console.log("\n[2] 형제 회귀 — 발진/특성방정식을 말하는 다른 OPAMP 유형을 뺏지 않는다");
const SIBLINGS = [
  ["Wien Bridge 발진기 (임용 11번)", mk(
    "OPAMP 발진기 회로 분석",
    "OPAMP를 이용한 발진기 회로에서 발진 조건을 구한다. RC 회로망과 OPAMP를 사용하며 β(s)와 1-Kβ(s)=0 조건을 활용한다.",
    ["발진기", "RC 회로망", "특성방정식"],
    inv("R", "R", "R", "OPAMP", "R", "R"),
  )],
  ["OPAMP 루프이득 안정도 (임용 12번)", mk(
    "연산 증폭기 응용 회로의 안정도 해석",
    "복소주파수 s의 함수인 루프이득 L(s)=V_r/V_t를 구하기 위해 입력 V_s를 제거한 후 귀환 루프를 끊고 V_t를 인가하여 V_r을 얻는 회로에서, 특성방정식 0=1-L(s)의 근이 좌반평면에 위치하는 조건으로 저항 R_S와 R의 관계를 부등식으로 구한다.",
    ["루프이득", "특성방정식", "좌반평면", "안정적인 선형증폭기"],
    inv("OPAMP", "R", "R", "R", "R:R_S", "V:V_s"),
  )],
  ["비정현파 발진기(함수발생기, 임용 29번)", mk(
    "비정현파 발진 회로",
    "슈미트 트리거 비교기와 적분기가 되먹임 루프를 이루는 비정현파 발진기에서 구형파의 진폭과 삼각파의 진폭·주파수를 구한다.",
    ["비정현파", "슈미트 트리거", "적분기", "구형파", "삼각파"],
    inv("OPAMP", "OPAMP", "R", "R", "C"),
  )],
];
for (const [name, a] of SIBLINGS) {
  const got = classifyCircuitType(a, "electronics").type;
  ok(`${name} → 뺏기지 않음 (got ${got})`, got !== "opamp_rc_t_oscillator");
  ok(`${name} → detect 미발화`, detectOpampRcTOscillator(a) === false);
}

console.log("\n[3] 물리 자체 검산 (양 모드 × 20 seed)");
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0; const notes = [];
  for (let seed = 1; seed <= 20; seed++) {
    const g = generateOpampRcTOscillator({ seed, mode });
    const v = g.values, a = g.answer, why = [];

    // f₀ = 1/(2πRC). R[kΩ]·C[nF] → RC = R·C×10⁻⁶ s → f₀ = 10⁶/(2π·R·C)
    const coef = 500000 / (v.Rk * v.Cn);
    if (!Number.isInteger(coef)) why.push(`계수 ${coef} 정수 아님`);
    if (coef !== v.fCoef) why.push(`fCoef ${v.fCoef} ≠ ${coef}`);
    const f0 = coef / Math.PI;
    const f0Direct = 1 / (2 * Math.PI * (v.Rk * 1e3) * (v.Cn * 1e-9));
    if (Math.abs(f0 - f0Direct) > 1e-6 * f0Direct) why.push("f₀ 재계산 불일치");
    if (f0 < 10 || f0 > 20000) why.push(`f₀=${f0.toFixed(1)}Hz 범위 밖`);

    // 모드별 전달특성 — 유사 = −1/(sRC)², 변형 = −(sRC)²
    if (mode === "exam_similar") {
      if (g.swapped) why.push("유사인데 swapped");
      if (!a.transfer.includes("-\\dfrac{1}{(sRC)^{2}}")) why.push(`유사 전달특성: ${a.transfer}`);
      if (!a.i1.includes("\\dfrac{V_{in}(s)}{2R(1+sRC)}")) why.push("유사 I₁");
      if (!a.i2.includes("s^{2}RC^{2}")) why.push("유사 I₂");
    } else {
      if (!g.swapped) why.push("변형인데 swapped 아님");
      if (!a.transfer.includes("-(sRC)^{2}")) why.push(`변형 전달특성: ${a.transfer}`);
    }
    // 도면 payload — (가)는 되먹임 없음, (나)는 되먹임 있음, 두 도면의 T 배치는 같아야 한다
    if (g.diagramGiven.feedbackToInput !== false) why.push("(가)에 되먹임");
    if (g.diagramOsc.feedbackToInput !== true) why.push("(나)에 되먹임 없음");
    if (g.diagramGiven.swapped !== g.diagramOsc.swapped) why.push("두 도면 배치 불일치");

    if (why.length) { bad++; notes.push(`seed${seed}: ${[...new Set(why)].join(", ")}`); }
  }
  ok(`${mode} — 20 seed 전부 검산 통과`, bad === 0, notes.slice(0, 3).join(" / "));
}

console.log("\n[4] 회로 방정식 독립 검산 (기호 s를 수치로 대입해 KCL을 직접 푼다)");
{
  // 복소수 헬퍼
  const cx = (re, im = 0) => ({ re, im });
  const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const add = (a, b) => cx(a.re + b.re, a.im + b.im);
  const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
  const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const inv1 = (a) => div(cx(1), a);

  /** 원본 배치의 H(s)를 마디 방정식으로 직접 계산 (전방 R-R+2C, 귀환 C-C+½R). */
  const H = (s, R, C) => {
    const sC = mul(s, cx(C));
    // V1 = Vin/(2 + 2sRC) ; I1 = V1/R  (Vin = 1)
    const V1 = inv1(add(cx(2), mul(cx(2 * R), sC)));
    const I1 = div(V1, cx(R));
    // I2 = −s²RC²·Vout/(2(1+sRC)) → Vout = I1·(−2(1+sRC)/(s²RC²))
    const s2 = mul(s, s);
    const denom = mul(mul(s2, cx(R * C * C)), cx(-1));       // −s²RC²
    const num = mul(cx(2), add(cx(1), mul(cx(R * C), s)));   // 2(1+sRC)
    return div(mul(I1, num), denom);                          // Vout (Vin=1)
  };

  const R = 10e3, C = 10e-9;
  for (const w of [500, 1234, 8000]) {
    const s = cx(0, w);
    const got = H(s, R, C);
    // 이론: −1/(sRC)²  = 1/(w²R²C²)  (s=jw → (jwRC)² = −w²R²C²)
    const want = cx(1 / (w * w * R * R * C * C), 0);
    ok(`ω=${w}에서 H(s) = −1/(sRC)² 와 일치`,
      Math.abs(got.re - want.re) < 1e-6 * Math.abs(want.re) && Math.abs(got.im) < 1e-6 * Math.abs(want.re),
      `${got.re}+j${got.im} vs ${want.re}`);
  }
  // 발진 조건 H=1 → ω = 1/(RC)
  const wOsc = 1 / (R * C);
  const hOsc = H(cx(0, wOsc), R, C);
  ok("ω=1/(RC)에서 H = 1 (발진 조건)", Math.abs(hOsc.re - 1) < 1e-9 && Math.abs(hOsc.im) < 1e-9, `${hOsc.re}+j${hOsc.im}`);
  ok("f₀ = 1/(2πRC) = 5000/π Hz (R=10kΩ, C=10nF)", Math.abs(wOsc / (2 * Math.PI) - 5000 / Math.PI) < 1e-6);
  void sub;
}

console.log("\n[5] 전용 렌더러");
{
  const g = generateOpampRcTOscillator({ seed: 3, mode: "exam_similar" });
  const a = renderOpampRcTOscillator(g.diagramGiven);
  const b = renderOpampRcTOscillator(g.diagramOsc);
  ok("(가) SVG 생성", a.startsWith("<svg") && a.endsWith("</svg>"));
  ok("(나) SVG 생성", b.startsWith("<svg") && b.endsWith("</svg>"));
  ok("에러 <pre> 없음", !a.includes("<pre") && !b.includes("<pre"));
  for (const l of ["V_in", "V_out", "I₁", "I₂", "①", "③", "2C", "½R"]) {
    ok(`(가) 라벨 "${l}" 포함`, a.includes(l));
  }
  ok("(나)에만 출력↔입력 연결 안내", !a.includes("출력단자를 입력단자에 연결") && b.includes("출력단자를 입력단자에 연결"));
  const gv = generateOpampRcTOscillator({ seed: 3, mode: "exam_variant" });
  const av = renderOpampRcTOscillator(gv.diagramGiven);
  ok("변형은 T가 교환됨(전방에 ½R, 귀환에 2C)", av.includes("½R") && av.includes("2C"));
  ok("LaTeX 잔재 없음", !a.includes("\\mathrm") && !a.includes("\\,"));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
