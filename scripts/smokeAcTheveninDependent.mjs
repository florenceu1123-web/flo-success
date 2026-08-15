// 종속전원 포함 AC 테브난(단락전류법) + 복소 켤레 최대전력 (임용 6번 회로이론) — API 없음
//
//   실측(2026-08-02): 이 원본이 **switched_rl_dep_i_pipeline**(직류 스위치 RL + 종속전원 과도)로
//   가로채여 전혀 다른 문제가 생성됐다(서버 로그 generic_dispatch_warning). 원인 =
//   detectSwitchedRlDepI가 "종속전원 + L"만 보고 교류 문맥을 확인하지 않고, bare "개방"을
//   스위치 신호로 인정한 것(테브난 설명 "전류원은 개방"에 흔히 나온다).
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcTheveninDependent.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectAcTheveninDependent } from "../lib/pipeline/runAcTheveninDependentPipeline.ts";
import { detectSwitchedRlDepI } from "../lib/pipeline/runSwitchedRlDepIPipeline.ts";
import { detectTheveninDepVoltageProblem } from "../lib/pipeline/runTheveninDepVoltagePipeline.ts";
import {
  generateAcTheveninDependent,
  __originalAcTheveninDependentForVerify,
  __acTheveninDependentPoolSizes,
} from "../lib/generation/topologies/acTheveninDependent.ts";
import {
  renderAcTheveninDepCircuit, renderAcTheveninDepEquivCircuit,
} from "../lib/renderers/acTheveninDependentCircuitRenderer.ts";

const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split("=");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [],
  componentInventory: inventory, subjectKey: "circuit_theory", topicKey: "dependent_source",
});

// route의 실제 dispatch 순서와 동일: ac_thevenin_dependent → thevenin_dep_voltage → switched_rl_dep_i
const dispatch = (a) => {
  const t = classifyCircuitType(a, "circuit_theory")?.type;
  if (t === "ac_thevenin_dependent" || detectAcTheveninDependent(a)) return "ac_thevenin_dependent";
  if (detectTheveninDepVoltageProblem(a)) return "thevenin_dep_voltage";
  if (detectSwitchedRlDepI(a)) return "switched_rl_dep_i";
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

const T = "ac_thevenin_dependent";

console.log("\n[1] 이 원본 — 표현이 흔들려도 ac_thevenin_dependent");
// ★ 실측 analyze 요약 그대로 (신고 재현: 이 텍스트가 switched_rl_dep_i로 갔다)
expect("실측 analyze 요약", mk(
  "테브난 등가 회로 해석",
  "이 문제는 테브난 등가 회로를 이용하여 단자 A-B 사이의 등가 임피던스와 전압을 구하고, 이를 통해 부하에 최대 전력을 전달하는 조건을 찾는 문제입니다. 주어진 회로에서 테브난 등가를 구한 후, 부하 임피던스를 조정하여 최대 전력을 전달할 수 있는 조건을 계산합니다.",
  ["테브난 정리", "최대 전력 전달 정리", "등가 임피던스", "단자 전압", "부하 임피던스"],
  inv("I=√2∠0°A", "CCCS=1/2 I_c", "C=-j/2 Ω", "L=jX Ω", "R=R"),
), T);

expect("종속 전압원·단락 전류 명시", mk(
  "종속 전원이 포함된 회로의 테브난 등가와 최대 전력",
  "독립 전류원과 종속 전압원이 포함된 페이저 회로에서 단자 A-B의 테브난 등가 전압 V_AB를 구하고, A와 B를 단락시켰을 때의 전류 I_AB로 테브난 등가 임피던스 Z_AB를 구한 뒤, 부하 Z_L = R + jX에 전달되는 최대 평균 전력을 구한다.",
  ["종속 전원", "테브난 등가", "단락 전류", "복소 켤레 정합", "최대 평균 전력"],
  inv("I=2∠0°A", "CCVS=0.5 I_2", "L=j2Ω", "C=-j1Ω"),
), T);

expect("Vision이 종속원을 놓쳐도 텍스트로", mk(
  "교류 회로의 최대 전력 전달",
  "종속 전원이 포함된 교류 회로에서 테브난 등가 임피던스와 등가 전압을 구하고, 복소 임피던스 부하에 최대 평균 전력이 전달되는 조건을 구한다.",
  ["테브난 정리", "최대 전력", "임피던스"],
  inv("I=√2∠0°A", "L=j1Ω", "C=-j0.5Ω"),
), T);

expect("영문 혼용", mk(
  "Thevenin equivalent with dependent source",
  "독립 전류원과 dependent source가 있는 phasor 회로에서 등가 임피던스 Z_AB와 등가 전압을 구하고 maximum power를 계산한다.",
  ["thevenin", "maximum power", "dependent source"],
  inv("I=1∠0°A", "CCCS=0.5I_2", "L=j2Ω", "C=-j1Ω"),
), T);

console.log("\n[2] 형제 회귀 — 다른 유형을 뺏지 않는다");
expect("직류 스위치 RL + 종속 전류원 과도 (임용 2024 B-5)", mk(
  "스위치 RL 회로의 과도응답",
  "직류 전압원과 종속 전류원 5iₙ이 포함된 RL 회로에서 t=0에 스위치가 개방될 때 저항에 흐르는 전류 i_R(t)와 시정수를 구한다.",
  ["과도응답", "시정수", "종속 전류원", "인덕터"],
  inv("V=16V", "CCCS=5i_n", "L=4H", "R=4Ω", "SW"),
), "switched_rl_dep_i");

expect("DC 종속 전압원 테브난 (스위치·L·C 없음)", mk(
  "종속 전압원이 있는 저항 회로의 테브난 등가",
  "종속 전압원 2v_x가 포함된 직류 저항 회로에서 단자 a-b의 테브난 등가 회로(R_TH·V_TH)를 구하고 부하 R_L 양단 전압을 구한다.",
  ["테브난 등가", "종속 전압원", "시험 전원"],
  inv("V=10V", "VCVS=2v_x", "R=4Ω", "R=6Ω"),
), "thevenin_dep_voltage");

expect("단일 AC원 사다리 테브난 (종속원 없음)", mk(
  "교류 사다리 회로의 테브난 등가와 최대 전력",
  "단일 교류 전압원과 직렬 L, 션트 C, 직렬 R로 이루어진 사다리 회로에서 단자 a-b의 테브난 등가를 구하고 복소 켤레 부하 Z_L = R + jX에 전달되는 최대 평균 전력을 구한다.",
  ["테브난 등가", "켤레 복소수", "최대 평균 전력"],
  inv("V=4∠0°V", "L=j2Ω", "C=-j1Ω", "R=2Ω"),
), "ac_thevenin_ladder");

expect("종속전원 페이저 (테브난·최대전력 없음) → ac_vccs_phasor", mk(
  "종속 전류원이 있는 페이저 회로 해석",
  "교류 전압원과 종속 전류원 2V_c가 있는 페이저 회로에서 제어 전압 V_c와 저항에 흐르는 전류 I_R, 시간영역 i_R(t)를 구한다.",
  ["페이저", "종속 전류원", "전류 분배"],
  inv("V=10∠45°V", "VCCS=2V_c", "R=1Ω", "C=-j2Ω", "L=j2Ω"),
), "ac_vccs_phasor");

console.log("\n[3] 물리 — 원본 값 재현 + 생성물 독립 재검산");
{
  const o = __originalAcTheveninDependentForVerify().answer;
  ok("원본 V_AB = 1∠−45° V", o.VthLabel === "1∠-45° V", `→ ${o.VthLabel}`);
  ok("원본 Z_AB = 0.5 − j0.5 Ω", o.Rth === 0.5 && o.Xth === -0.5, `→ ${o.ZthLabel}`);
  ok("원본 Z_L = 0.5 + j0.5 Ω", o.RL === 0.5 && o.XL === 0.5, `→ ${o.ZLLabel}`);
  ok("원본 P_L(max) = 0.5 W", Math.abs(o.Pmax - 0.5) < 1e-9, `→ ${o.Pmax}`);
  ok("원본 I_AB = 독립 전원값", o.IscLabel === "√2∠0°A", `→ ${o.IscLabel}`);
}
{
  const sizes = __acTheveninDependentPoolSizes();
  ok(`생성 풀 (유사 ${sizes.similar} · 변형 ${sizes.variant})`, sizes.similar >= 10 && sizes.variant >= 10);
}
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0, checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateAcTheveninDependent({ seed, mode });
    const v = g.values, a = g.answer;
    // 독립 재계산: Z_AB = Z₁Z₂/(Z₁+Z₂+k), V_AB = I_s·Z_AB, P = |V|²/(4R)
    const z1 = v.z1Type === "L" ? { re: 0, im: v.z1Mag } : { re: 0, im: -v.z1Mag };
    const z2 = v.z2Type === "L" ? { re: 0, im: v.z2Mag } : { re: 0, im: -v.z2Mag };
    const numRe = z1.re * z2.re - z1.im * z2.im, numIm = z1.re * z2.im + z1.im * z2.re;
    const denRe = z1.re + z2.re + v.k, denIm = z1.im + z2.im;
    const d2 = denRe * denRe + denIm * denIm;
    const zR = (numRe * denRe + numIm * denIm) / d2, zI = (numIm * denRe - numRe * denIm) / d2;
    const Is = v.s * Math.SQRT2;
    const vR = Is * zR, vI = Is * zI;
    const vMag = Math.hypot(vR, vI);
    const P = (vMag * vMag) / (4 * zR);
    const near = (x, y) => Math.abs(x - y) < 1e-3;
    if (!near(zR, a.Rth) || !near(zI, a.Xth)) { bad++; console.log(`    ❌ ${mode} seed${seed} Z_AB ${a.ZthLabel} ≠ ${zR}+j${zI}`); continue; }
    if (!near(vMag, a.VthMag)) { bad++; console.log(`    ❌ ${mode} seed${seed} |V_AB| ${a.VthMag} ≠ ${vMag}`); continue; }
    if (!near(P, a.Pmax)) { bad++; console.log(`    ❌ ${mode} seed${seed} P ${a.Pmax} ≠ ${P}`); continue; }
    // 켤레 정합 · 단락전류 = 독립 전원 · 소자 종류(모드별 교환)
    if (!near(a.RL, a.Rth) || !near(a.XL, -a.Xth)) { bad++; console.log(`    ❌ ${mode} seed${seed} 켤레 정합 아님`); continue; }
    if (!near(a.Isc, Is)) { bad++; console.log(`    ❌ ${mode} seed${seed} I_AB ≠ I_s`); continue; }
    const wantZ1 = mode === "exam_variant" ? "C" : "L";
    if (v.z1Type !== wantZ1) { bad++; console.log(`    ❌ ${mode} seed${seed} 소자 배치 ${v.z1Type}`); continue; }
    if (mode === "exam_similar" ? !(a.Xth < 0) : !(a.Xth > 0)) { bad++; console.log(`    ❌ ${mode} seed${seed} Z_AB 부호`); continue; }
    checked++;
  }
  ok(`${mode} 12개 재검산 (통과 ${checked})`, bad === 0 && checked === 12);
}
{
  // 원본 튜플은 생성 풀에서 제외 (참조 전용)
  let leaked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const v = generateAcTheveninDependent({ seed, mode: "exam_similar" }).values;
    if (v.s === 1 && v.z1Type === "L" && v.z1Mag === 1 && v.z2Mag === 0.5 && v.k === 0.5) leaked++;
  }
  ok("원본 튜플(√2·j1·k½·−j½) 미생성", leaked === 0, `→ ${leaked}건`);
}

console.log("\n[4] 렌더 구조 — (가) 종속원 다이아몬드·전류원·단자 A/B, (나) Z_AB·R+jX 부하");
{
  const g = generateAcTheveninDependent({ seed: 5, mode: "exam_similar" });
  const a = renderAcTheveninDepCircuit(g.circuitDiagram);
  const b = renderAcTheveninDepEquivCircuit(g.equivDiagram);
  ok("(가) SVG 생성", a.startsWith("<svg") && !a.includes("<pre>"));
  ok("(가) 종속전원 다이아몬드(polygon)", a.includes("<polygon"));
  ok("(가) 단자 A·B", a.includes(">A<") && a.includes(">B<"));
  ok("(가) 제어 전류 라벨", a.includes("I₂"));
  ok("(가) 점선 영역(테브난 변환 대상)", a.includes("stroke-dasharray=\"6 4\""));
  ok("(나) SVG 생성", b.startsWith("<svg") && !b.includes("<pre>"));
  ok("(나) Z_AB 박스 + R·jX 부하", b.includes("Z_AB") && b.includes(">R<") && b.includes("jX"));
}

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail === 0 ? 0 : 1);
