// SW₁ 닫힘 + SW₂(b→c) 2전압원 RLC → 초기조건·2차 미분방정식·v_c(t) (2022 전기 B-5) — API 없음
//
//   실측(2026-08-02): 이 원본이 **switched_rlc_step**(v1 3-leg = 전류원 + R_c+L 병렬가지)로 가서
//   전류원이 없는 회로가 전류원 회로로 변질됐다(지수 계수도 지저분). 전용 archetype으로 잡는다.
//   ★ 원본은 라플라스 행렬식으로 물었지만 사용자 지정에 따라 **회로는 그대로, 발문만 미분방정식**.
//     두 방식의 답이 같음을 원본 값으로 확인한다(v_c(t) = 1/3 + 3e^(−2t) − (4/3)e^(−3t)).
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSwitchedRlcDualSwitch.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectSwitchedRlcDualSwitch } from "../lib/pipeline/runSwitchedRlcDualSwitchPipeline.ts";
import {
  generateSwitchedRlcDualSwitch,
  __originalSwitchedRlcDualSwitchForVerify,
  __switchedRlcDualSwitchPoolSize,
} from "../lib/generation/topologies/switchedRlcDualSwitch.ts";
import { renderSwitchedRlcDualSwitchCircuit } from "../lib/renderers/switchedRlcDualSwitchCircuitRenderer.ts";

const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split("=");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [],
  componentInventory: inventory, subjectKey: "circuit_theory", topicKey: "rlc_response",
});
// route 순서: 전용 분기(분류기 or 감지기) → 그 외는 분류기 결과
const dispatch = (a) => {
  const t = classifyCircuitType(a, "circuit_theory")?.type;
  if (t === "switched_rlc_dual_switch" || detectSwitchedRlcDualSwitch(a)) return "switched_rlc_dual_switch";
  return t ?? "?";
};

let pass = 0, fail = 0;
const expect = (name, a, want) => {
  const got = dispatch(a);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const T = "switched_rlc_dual_switch";

console.log("\n[1] 이 원본 — 표현이 흔들려도 switched_rlc_dual_switch");
// ★ 실측 analyze 요약 그대로 (신고 재현: switched_rlc_step으로 갔다)
expect("실측 analyze 요약", mk(
  "RLC 회로의 과도 응답 분석",
  "이 문제는 스위치가 닫히고 열리는 RLC 회로의 과도 응답을 분석하는 문제입니다. 스위치가 닫힐 때와 열릴 때의 회로 상태를 고려하여, 커패시터 전압과 인덕터 전류의 초기 조건을 설정하고, 라플라스 변환을 통해 과도 응답을 구합니다.",
  ["RLC 회로", "과도 응답", "라플라스 변환", "스위칭 회로", "초기 조건"],
  inv("SW", "R=4Ω", "L=1H", "C=1/2F", "SW", "V=1V", "V=2V", "R=2Ω"),
), T);

expect("SW₁·SW₂ 접점 b→c 명시", mk(
  "두 스위치가 있는 RLC 회로의 과도 해석",
  "t=0에서 스위치 SW_1이 닫히고 스위치 SW_2가 접점 b에서 접점 c로 이동하는 RLC 회로에서 인덕터 전류와 커패시터 전압의 초깃값을 구하고 커패시터 양단 전압 v_c(t)를 구한다.",
  ["과도 응답", "초기 조건", "미분 방정식"],
  inv("SW", "SW", "V=1V", "V=2V", "R=4Ω", "R=2Ω", "L=1H", "C=0.5F"),
), T);

expect("'미분방정식'만 언급(라플라스 없음)", mk(
  "RLC 스위칭 회로",
  "t=0에 두 개의 스위치가 동시에 동작하는 RLC 회로에서 초깃값을 구하고 커패시터 전압에 대한 2차 미분 방정식을 세워 v_c(t)를 구한다.",
  ["2차 미분방정식", "과도응답"],
  inv("SW", "SW", "V=2V", "V=3V", "R=5Ω", "R=1Ω", "L=1H", "C=1/2F"),
), T);

console.log("\n[2] 형제 회귀 — 다른 유형을 뺏지 않는다");
// ※ 아래 두 케이스는 "이 분기가 뺏지 않는가"만 단언한다 — 합성 요약이 어느 generic으로 가는지는
//   이 archetype의 책임이 아니고(실측 원본 라우팅은 smokeOriginalRouting이 본다), 기대값을 박으면
//   무관한 변경에 거짓 실패가 난다.
const expectNotStolen = (name, a) => {
  const got = dispatch(a);
  if (got !== T) { pass++; console.log(`  ✅ ${name} → ${got} (뺏지 않음)`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (이 archetype이 가로챘다)`); }
};
expectNotStolen("switched_rlc_step v1 (전류원 포함)", mk(
  "스위치가 있는 RLC 회로의 과도 응답",
  "t=0에서 SPDT 스위치가 단자 A에서 단자 B로 이동하는 RLC 회로에서 커패시터 전압의 초깃값과 2차 미분방정식을 구하고 v_C(t)를 구한다.",
  ["과도 응답", "초기 조건", "2차 미분방정식"],
  inv("SW", "V=10V", "I=1A", "R=1Ω", "R=4Ω", "L=1H", "C=1F"),
));

expect("switched_rlc_5leg (단자 A↔B + V·I 2전원 + L2개)", mk(
  "SPDT 스위치 RLC 5-leg 회로",
  "t=0에서 스위치가 단자 A에서 단자 B로 이동하는 회로에서 커패시터 전압 v_C의 초깃값과 2차 미분방정식을 구한다.",
  ["과도 응답", "커패시터", "초기 조건"],
  inv("SW", "V=12V", "I=2A", "R=2Ω", "R=4Ω", "R=4Ω", "R=1Ω", "L=2H", "L=5H", "C=0.2F"),
), "switched_rlc_5leg");

expectNotStolen("스위치 RL 2전원 (커패시터 없음)", mk(
  "SPDT 스위치 RL 과도응답",
  "t=0에서 스위치가 단자 A에서 단자 B로 이동할 때 직렬 RL 가지에 흐르는 전류 i(t)와 시정수를 구한다.",
  ["과도응답", "시정수", "인덕터"],
  inv("SW", "V=4V", "V=2V", "R=2Ω", "L=1H"),
));

console.log("\n[3] 물리 — 원본 값 재현(라플라스 결과와 일치) + 생성물 독립 재검산");
{
  const o = __originalSwitchedRlcDualSwitchForVerify().answer;
  ok("원본 ODE = v_c'' + 5v_c' + 6v_c = 2", o.odeText === "v_c'' + 5·v_c' + 6·v_c = 2", `→ ${o.odeText}`);
  ok("원본 특성근 −2, −3", o.roots[0] === 2 && o.roots[1] === 3, `→ ${o.roots}`);
  ok("원본 초기조건 i₁(0₊)=0 · v_c(0₊)=2", o.i1_0 === 0 && o.vc_0 === 2);
  ok("원본 v_c'(0₊) = −2 V/s", o.dvc_0.startsWith("-2"), `→ ${o.dvc_0}`);
  ok("원본 v_c(t) = 1/3 + 3e^(−2t) − 4/3·e^(−3t)",
    o.vcText.includes("1/3") && o.vcText.includes("3·e^(-2t)") && o.vcText.includes("4/3·e^(-3t)"), `→ ${o.vcText}`);
  ok("원본 i₁(t) = 1/6 − 3/2·e^(−2t) + 4/3·e^(−3t)",
    o.i1Text.includes("1/6") && o.i1Text.includes("3/2·e^(-2t)") && o.i1Text.includes("4/3·e^(-3t)"), `→ ${o.i1Text}`);
  ok(`생성 풀 ${__switchedRlcDualSwitchPoolSize()}개`, __switchedRlcDualSwitchPoolSize() >= 20);
}
// 독립 재검산 — 텍스트에서 계수를 파싱해 미분방정식·초기조건·정상상태를 직접 검증
const parseTerms = (s) => [...s.matchAll(/([+-])\s*(?:(\d+(?:\/\d+)?)·)?e\^\(-(\d+)t\)/g)]
  .map((m) => ({ sign: m[1] === "-" ? -1 : 1, mag: m[2] ? evalFrac(m[2]) : 1, k: Number(m[3]) }));
const evalFrac = (s) => s.includes("/") ? Number(s.split("/")[0]) / Number(s.split("/")[1]) : Number(s);
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0, checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateSwitchedRlcDualSwitch({ seed, mode });
    const v = g.values, a = g.answer;
    const C = v.Cn / v.Cd;
    // 정규화 ODE 계수: a₁ = R₁/L + 1/(R₂C), a₀ = (1+R₁/R₂)/(LC), rhs = V_s/(LC)
    const a1 = v.R1 / v.L + 1 / (v.R2 * C), a0 = (1 + v.R1 / v.R2) / (v.L * C), rhs = v.Vs / (v.L * C);
    const [p, r] = a.roots;
    const near = (x, y) => Math.abs(x - y) < 1e-6;
    if (!near(p + r, a1) || !near(p * r, a0)) { bad++; console.log(`    ❌ ${mode} seed${seed} 근-계수 불일치`); continue; }
    // v_c(t) 검증: v(0)=V_b, v'(0)=−V_b/(R₂C), v(∞)=V_s R₂/(R₁+R₂)
    const vInf = evalFrac(a.vInf);
    const terms = parseTerms(a.vcText);
    if (terms.length !== 2) { bad++; console.log(`    ❌ ${mode} seed${seed} 지수항 파싱 ${terms.length}`); continue; }
    const v0 = vInf + terms.reduce((s2, t2) => s2 + t2.sign * t2.mag, 0);
    const dv0 = terms.reduce((s2, t2) => s2 - t2.k * t2.sign * t2.mag, 0);
    if (!near(v0, v.Vb)) { bad++; console.log(`    ❌ ${mode} seed${seed} v_c(0)=${v0} ≠ ${v.Vb}`); continue; }
    if (!near(dv0, -v.Vb / (v.R2 * C))) { bad++; console.log(`    ❌ ${mode} seed${seed} v_c'(0)=${dv0}`); continue; }
    if (!near(vInf, (v.Vs * v.R2) / (v.R1 + v.R2))) { bad++; console.log(`    ❌ ${mode} seed${seed} v∞`); continue; }
    if (!near(rhs / a0, vInf)) { bad++; console.log(`    ❌ ${mode} seed${seed} 강제응답 불일치`); continue; }
    // i₁(t) 검증: i₁(0)=0, i₁(∞)=V_s/(R₁+R₂)
    const iTerms = parseTerms(a.i1Text);
    const iInf = evalFrac(a.i1Inf);
    const i0 = iInf + iTerms.reduce((s2, t2) => s2 + t2.sign * t2.mag, 0);
    if (!near(i0, 0)) { bad++; console.log(`    ❌ ${mode} seed${seed} i₁(0)=${i0} ≠ 0`); continue; }
    if (!near(iInf, v.Vs / (v.R1 + v.R2))) { bad++; console.log(`    ❌ ${mode} seed${seed} i₁(∞)`); continue; }
    checked++;
  }
  ok(`${mode} 12개 재검산 (통과 ${checked})`, bad === 0 && checked === 12);
}
{
  let leaked = 0;
  for (const mode of ["exam_similar", "exam_variant"]) for (let seed = 1; seed <= 40; seed++) {
    const v = generateSwitchedRlcDualSwitch({ seed, mode }).values;
    if (v.Vs === 1 && v.R1 === 4 && v.L === 1 && v.Cd === 2 && v.R2 === 2 && v.Vb === 2) leaked++;
  }
  ok("원본 튜플(1V·4Ω·1H·½F·2Ω·2V) 미생성", leaked === 0, `→ ${leaked}건`);
}
{
  const s = generateSwitchedRlcDualSwitch({ seed: 3, mode: "exam_similar" });
  const w = generateSwitchedRlcDualSwitch({ seed: 3, mode: "exam_variant" });
  ok("두 모드 회로 구조 동일(구하는 양만 교환)",
    s.circuitDiagram.currentLabel === w.circuitDiagram.currentLabel && s.circuitDiagram.vcLabel === w.circuitDiagram.vcLabel);
}

console.log("\n[4] 렌더 구조 — 두 스위치·RLC·접점 b/c·노드 a");
{
  const g = generateSwitchedRlcDualSwitch({ seed: 4, mode: "exam_similar" });
  const svg = renderSwitchedRlcDualSwitchCircuit(g.circuitDiagram);
  ok("SVG 생성", svg.startsWith("<svg") && !svg.includes("<pre>"));
  ok("SW₁·SW₂ 라벨", svg.includes("SW₁") && svg.includes("SW₂"));
  ok("접점 b·c", svg.includes(">b<") && svg.includes(">c<"));
  ok("노드 a + v_c·i₁ 라벨", svg.includes(">a<") && svg.includes("v_c(t)") && svg.includes("i₁(t)"));
  ok("소자 값 4종(V_s·R₁·L·C·V_b·R₂)",
    [g.circuitDiagram.vsLabel, g.circuitDiagram.r1Label, g.circuitDiagram.lLabel,
     g.circuitDiagram.cLabel, g.circuitDiagram.vbLabel, g.circuitDiagram.r2Label].every((l) => svg.includes(l)));
}

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail === 0 ? 0 : 1);
