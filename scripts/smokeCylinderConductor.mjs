// 무한 직선 원통 도체(도전율) → 전류 I·외부 자계 |H| (임용 12번 전자기학) — 정적 검증 (API 없음)
//
//   사용자 신고: "이 문제를 생성했는데 다른 문제가 나와".
//   실측 로그: dispatch entryId=**coax_resistance**(동축 두 도체 사이 저항) — 구조가 다른 형제 항목.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCylinderConductor.mjs
import {
  classifyElectromagnetics, detectCylinderConductorField, detectTwoPointCharges,
  detectSheetLineEfieldSuperposition, detectSheetRingEfield, detectCurlLineIntegral, detectFluxLoopInducedCurrent,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";

const dispatch = (a) =>
  detectFluxLoopInducedCurrent(a) ? "flux_loop_induced_current"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : detectSheetLineEfieldSuperposition(a) ? "sheet_line_efield_superposition"
  : detectTwoPointCharges(a) ? "two_point_charges_field_potential"
  : detectCylinderConductorField(a) ? "cylinder_conductor_current_field"
  : classifyElectromagnetics(a);

const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [] });
let pass = 0, fail = 0;
const expect = (name, a, want) => {
  const got = dispatch(a);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const T = "cylinder_conductor_current_field";
console.log("\n[1] 이 원본 — 표현이 흔들려도 전용 항목으로");
expect("원본 요약 (전위차 → 전류 → 외부 자계)", mk(
  "원통 도체의 전류와 자계",
  "반경 r, 도전율 σ인 무한히 긴 직선 원통형 도체에서 단면 A와 B 사이의 전위차와 길이가 주어질 때, 도체 내부의 전계와 전류 밀도, 전류를 구하고 도체 외부에서의 자계의 크기를 ρ의 함수로 구하는 문제이다.",
  ["도전율", "전류 밀도", "앙페르 법칙", "원통 좌표계", "자계"],
), T);
expect("'전도율'·'자계의 크기'로 서술", mk(
  "원통 도체 해석",
  "균일한 전도율을 갖는 원통 도체에 전위차가 걸릴 때 흐르는 전류와 도체 바깥에서의 자계의 크기를 구한다.",
  ["전도율", "전류", "자계의 크기"],
), T);

console.log("\n[2] 형제 회귀 — 동축(두 도체) 항목은 뺏기지 않는다");
expect("동축 원통 두 도체 사이 저항 (coax_resistance)", mk(
  "동축 원통의 저항",
  "내부 도체 반경 a와 외부 도체 내경 b 사이에 도전율 σ인 물질이 채워진 동축 원통에서 두 도체 사이의 저항 R을 전류 밀도와 전계를 거쳐 구한다.",
  ["도전율", "동축", "저항", "전류 밀도"],
), "coax_resistance");
expect("직선 도선 자계 (straight_wire_B)", mk(
  "직선 도선에 의한 자기장",
  "무한히 긴 직선 도선에 전류 I가 흐를 때 거리 r에서의 자속밀도 B를 구하는 문제이다.",
  ["앙페르 법칙", "자속밀도"],
), "straight_wire_B");

console.log("\n[3] 물리 검산 — 생성물의 I·|H|를 독립 재계산 (양 모드 × 8 seed)");
let bad = 0, seen = new Set(), origLeak = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 8; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: T });
    const blob = `${inst.content} ${inst.givens.join(" ")} ${inst.answer} ${inst.steps.join(" ")}`;
    const rM = Number(/r = ([\d.]+)\\,\[\\mathrm\{m\}\]/.exec(blob)?.[1]);
    const sExp = Number(/sigma = 10\^\{(\d+)\}/.exec(blob)?.[1]);
    const V = Number(/V_\{AB\} = ([\d.]+)/.exec(blob)?.[1]);
    const L = Number(/L = (\d+)\\,\[\\mathrm\{m\}\]/.exec(blob)?.[1]);
    // ★ 변형 풀이 1단계에 "I = 2\pi\rho·…"가 있어 첫 매치를 쓰면 안 된다 → 최종형(\pi\,[A])만.
    const iPi = Number(/(\d+)\\pi\\,\[\\mathrm\{A\}\]/.exec(blob)?.[1]);
    const hCoef = Number(/\\dfrac\{(\d+(?:\.\d+)?)\}\{\\rho\}/.exec(blob)?.[1]);
    // 독립 재계산: E=V/L, J=σE, I=JπR², |H|=I/(2πρ)
    const E = V / L, J = Math.pow(10, sExp) * E;
    const iCalc = J * rM * rM;            // I = iCalc·π
    const hCalc = iCalc / 2;              // |H| = hCalc/ρ
    const okRow =
      [rM, sExp, V, L, iPi, hCoef].every(Number.isFinite) &&
      Math.abs(iCalc - iPi) < 1e-9 && Math.abs(hCalc - hCoef) < 1e-9;
    if (!okRow) { bad++; console.log(`     ✗ ${mode} seed=${seed}`, { rM, sExp, V, L, iPi, hCoef, iCalc, hCalc }); }
    if (rM === 0.01 && sExp === 7 && V === 0.1 && L === 10) origLeak++;
    seen.add(`${rM}|${sExp}|${V}|${L}`);
  }
}
ok("16개 생성물 I·|H| 재검산 일치", bad === 0, `${bad}건`);
ok("원본 튜플(0.01m·10⁷·0.1V·10m) 미생성", origLeak === 0);
ok("값 다양성 5종 이상", seen.size >= 5, `${seen.size}종`);

console.log("\n[4] figure·발문 구조");
{
  const s = generateElectromagnetics({ seed: 3, mode: "exam_similar", entryId: T });
  const v = generateElectromagnetics({ seed: 3, mode: "exam_variant", entryId: T });
  ok("유사: geometry=cylinder_conductor", s.diagram?.geometry === "cylinder_conductor");
  ok("유사: 3단계 발문 (전계→전류밀도·전류→외부 자계)",
    ["[단계 1]", "[단계 2]", "[단계 3]"].every((m) => s.question.includes(m)));
  ok("유사: 정답에 I와 |H|", /I = \d+\\pi/.test(s.answer) && /\\rho/.test(s.answer));
  ok("변형: 구하는 양 교환(자계 given → J·V_AB)", /V_\{AB\}/.test(v.answer) && /mathbf\{J\}/.test(v.answer));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
