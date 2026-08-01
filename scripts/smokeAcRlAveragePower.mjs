// AC 전원 + 직렬 리액턴스 + 병렬 저항 2개 평균전력 (임용 8번) 전용 archetype 검증 (API 없음)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcRlAveragePower.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectAcRlAveragePower } from "../lib/pipeline/runAcRlAveragePowerPipeline.ts";
import { runAcRlAveragePowerPipeline } from "../lib/pipeline/runAcRlAveragePowerPipeline.ts";
import { generateAcRlAveragePower } from "../lib/generation/topologies/acRlAveragePower.ts";
import { renderAcRlAveragePowerCircuit } from "../lib/renderers/acRlAveragePowerCircuitRenderer.ts";

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

console.log("\n[1] 라우팅 — 원본(임용 8번)");
const REAL = mk(
  "교류 전원이 포함된 RL 응용 회로의 평균전력",
  "그림은 교류 전원이 포함된 RL 응용 회로이다. 전원이 공급하는 전력과 인덕터 및 저항에서 소비되는 전력을 각각 구하려고 한다. V는 v(t)=Vcosωt의 페이저 전압이다.",
  ["교류 전원", "평균전력", "인덕터", "페이저"],
  inv("V:8∠0°V", "L:j2/3Ω", "R:1Ω", "R:2Ω"),
);
for (const subject of ["circuit_theory", "electronics"]) {
  const got = classifyCircuitType(REAL, subject).type;
  ok(`원본 → ac_rl_average_power (subject=${subject})`, got === "ac_rl_average_power", `got ${got}`);
}
ok("원본 → detect 발화", detectAcRlAveragePower(REAL) === true);

console.log("\n[2] 형제 회귀 — 전용 archetype이 있는 AC 유형을 뺏지 않는다");
const SIBLINGS = [
  ["어드미턴스 공진 (임용 7번)", mk(
    "RLC 회로의 공진 주파수와 전류 최댓값",
    "교류 전원이 포함된 RLC 회로에서 등가 어드미턴스의 실수부와 허수부를 구하고 공진 주파수와 전류의 최댓값을 구한다.",
    ["공진", "어드미턴스"],
    inv("V:10cos(ωt)V", "C:0.05F", "R:1Ω", "L:0.1H"),
  )],
  ["AC 역률 보정 (임용 9번)", mk(
    "AC 역률 보정과 전력",
    "직렬 R+L 회로에 부하 R∥C가 연결된 회로에서 역률이 1이 되는 X_C를 구하고 평균 전력과 무효 전력, 피상 전력을 구한다.",
    ["역률", "피상 전력", "평균 전력"],
    inv("V:100V", "R:10Ω", "L:0.1H", "C:1μF"),
  )],
  ["사다리 테브난 복소 최대전력 (임용 7번)", mk(
    "RLC 회로의 최대 전력 전달",
    "교류 전원이 포함된 RLC 회로에서 테브난 등가 회로를 구하고 부하에 최대 평균 전력을 전달하기 위한 복소 임피던스를 찾는다.",
    ["테브난", "최대 전력 전달"],
    inv("V:4∠0°V", "L:j2Ω", "C:-j1Ω", "R:2Ω"),
  )],
];
for (const [name, a] of SIBLINGS) {
  ok(`${name} → 뺏기지 않음`, detectAcRlAveragePower(a) === false);
  const got = classifyCircuitType(a, "circuit_theory").type;
  ok(`${name} → 분류기도 안 뺏김 (got ${got})`, got !== "ac_rl_average_power");
}

console.log("\n[3] 물리 자체 검산 (양 모드 × 20 seed) — 페이저를 처음부터 다시 계산");
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0; const notes = [];
  for (let seed = 1; seed <= 20; seed++) {
    const g = generateAcRlAveragePower({ seed, mode });
    const v = g.values, a = g.answer, why = [];
    const Rp = v.RpNum / v.RpDen;
    const X = Rp;                       // 값 공간이 X = R_p로 고정
    const Zmag = Math.hypot(Rp, X);
    const Imag = v.Vm / Zmag;
    const Vp = Imag * Rp;

    if (mode === "exam_similar") {
      if (g.isCapacitor) why.push("유사인데 커패시터");
      const Ps = 0.5 * Imag * Imag * Rp;
      const P1 = 0.5 * Vp * Vp / v.R1;
      const P2 = 0.5 * Vp * Vp / v.R2;
      if (Math.abs(Ps - a.Ps) > 1e-6) why.push(`P_s ${a.Ps}≠${Ps.toFixed(4)}`);
      if (Math.abs(P1 - a.Pr1) > 1e-6) why.push(`P_R1 ${a.Pr1}≠${P1.toFixed(4)}`);
      if (Math.abs(P2 - a.Pr2) > 1e-6) why.push(`P_R2 ${a.Pr2}≠${P2.toFixed(4)}`);
      // ★ 에너지 보존 — 전원 전력 = 두 저항 전력의 합 (인덕터는 0)
      if (Math.abs(a.Ps - (a.Pr1 + a.Pr2)) > 1e-9) why.push("P_s ≠ P_R1+P_R2");
      if (!Number.isInteger(a.Ps) || !Number.isInteger(a.Pr1) || !Number.isInteger(a.Pr2)) why.push("전력이 정수 아님");
    } else {
      if (!g.isCapacitor) why.push("변형인데 인덕터 (커패시터여야 함)");
      // |V_p| = |V|/√2, 위상 +45°
      if (Math.abs(Vp - v.Vm / Math.SQRT2) > 1e-9) why.push(`|V_p| ${Vp} ≠ ${v.Vm / Math.SQRT2}`);
      if (!a.vtTex || !a.vtTex.includes("\\cos")) why.push("v(t) 없음");
      if (!a.vtTex.includes(`${v.omega}t`)) why.push("v(t)에 ω 누락");
      if (!a.vtTex.includes("+ 45^\\circ")) why.push("v(t) 위상 +45° 아님");
      if (a.Ps !== undefined) why.push("변형에 평균전력 필드가 남음");
    }
    // 원본 튜플 재생성 금지
    if (v.Vm === 8 && v.R1 === 1 && v.R2 === 2) why.push("원본 튜플 재생성");
    // 회로 payload
    if (g.circuitDiagram.isCapacitor !== g.isCapacitor) why.push("도면 소자 불일치");

    if (why.length) { bad++; notes.push(`seed${seed}: ${[...new Set(why)].join(", ")}`); }
  }
  ok(`${mode} — 20 seed 전부 검산 통과`, bad === 0, notes.slice(0, 3).join(" / "));
}

console.log("\n[4] 원본 값 재현 (손계산 대조)");
{
  const Vm = 8, R1 = 1, R2 = 2, Rp = (R1 * R2) / (R1 + R2), X = Rp;
  const Imag = Vm / Math.hypot(Rp, X);
  ok("|I| = 6√2 A", Math.abs(Imag - 6 * Math.SQRT2) < 1e-9, String(Imag));
  ok("P_전원 = 24 W", Math.abs(0.5 * Imag * Imag * Rp - 24) < 1e-9);
  const Vp = Imag * Rp;
  ok("|V_p| = 4√2 V", Math.abs(Vp - 4 * Math.SQRT2) < 1e-9, String(Vp));
  ok("P_1Ω = 16 W", Math.abs(0.5 * Vp * Vp / R1 - 16) < 1e-9);
  ok("P_2Ω = 8 W", Math.abs(0.5 * Vp * Vp / R2 - 8) < 1e-9);
  ok("P_L = 0 W (이상 인덕터)", true);
}

console.log("\n[5] 본문·발문 — v(t) 단서가 반드시 들어간다");
{
  for (const mode of ["exam_similar", "exam_variant"]) {
    const p = (await runAcRlAveragePowerPipeline({ mode, count: 1 }))[0];
    ok(`${mode} 본문에 v_s(t) 단서 포함`, p.content.includes("v_s(t)") && p.content.includes("\\cos\\omega t"));
    ok(`${mode} 본문에 ω 값 명시`, /\\omega = \d+/.test(p.content));
    // ★ 내부 소자 id가 본문에 새면 안 된다 (실측 신고: "V_leg1_1"이 노출됐다)
    ok(`${mode} 내부 id 미노출`, !/_leg\d|_\d+_\d+/.test(p.content + p.conditions.join(" ") + p.answer));
    ok(`${mode} 발문 3단계`, p.question.split("\n").filter((l) => /^\[단계 \d\]/.test(l.trim())).length === 3);
    if (mode === "exam_variant") {
      ok("변형 발문이 v(t)를 요구", p.question.includes("v(t)"));
      ok("변형 정답에 v(t) 시간함수", /v\(t\) = .*\\cos/.test(p.answer));
      ok("변형 회로가 커패시터", p.figureVariants[0].diagram.isCapacitor === true);
    } else {
      ok("유사 회로가 인덕터", p.figureVariants[0].diagram.isCapacitor === false);
      ok("유사 정답에 P_L = 0", p.answer.includes("P_L = 0"));
    }
  }
}

console.log("\n[6] 전용 렌더러");
{
  const gL = generateAcRlAveragePower({ seed: 3, mode: "exam_similar" });
  const gC = generateAcRlAveragePower({ seed: 3, mode: "exam_variant" });
  const a = renderAcRlAveragePowerCircuit(gL.circuitDiagram);
  const b = renderAcRlAveragePowerCircuit(gC.circuitDiagram);
  ok("SVG 생성", a.startsWith("<svg") && b.startsWith("<svg"));
  ok("에러 <pre> 없음", !a.includes("<pre") && !b.includes("<pre"));
  ok("유사는 인덕터 안내", a.includes("인덕터의 평균전력은 0"));
  ok("변형은 커패시터 안내", b.includes("커패시터의 평균전력은 0"));
  ok("전원 라벨 포함", a.includes(gL.circuitDiagram.sourceLabel));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
