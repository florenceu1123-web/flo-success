/**
 * 점선 박스 2개(전압원망 a-b + 전류원망 c-d) 직렬 테브난 최대전력 (임용 10번 회로이론) 정적 스모크.
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcTheveninTwoBox.mjs
 *
 * 라우팅(감지기·분류기) + 형제 미탈취 + 물리 독립 재검산 + 원본 값 + 렌더 구조.
 */
import { detectAcTheveninTwoBox } from "../lib/pipeline/runAcTheveninTwoBoxPipeline.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  generateAcTheveninTwoBox,
  __originalAcTheveninTwoBoxForVerify,
  __acTheveninTwoBoxPoolSize,
} from "../lib/generation/topologies/acTheveninTwoBox.ts";
import { renderAcTheveninTwoBoxCircuit } from "../lib/renderers/acTheveninTwoBoxCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const A = (o) => ({
  topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [],
  componentInventory: [], ...o,
});

console.log("\n[1] 라우팅 — 실측 Vision 요약 + 표현 변형");
const positives = [
  ["실측 요약", A({
    topic: "RLC 회로의 테브난 등가 해석",
    interpretation: "두 개의 교류 전원이 포함된 회로에서 단자 a-b의 테브난 등가 임피던스와 단자 c-d의 테브난 등가 전압을 구하고, 부하 저항 R_L에 최대 평균 전력이 전달되는 조건을 찾는다.",
    relatedConcepts: ["테브난 등가 회로", "최대 전력 전달", "페이저 해석"],
    componentInventory: [{ type: "V" }, { type: "R" }, { type: "C" }, { type: "L" }, { type: "I" }],
  })],
  ["단자 표기 변형(a와 b / c와 d)", A({
    topic: "교류 회로 테브난 등가",
    interpretation: "단자 a와 b에서 전압원 회로망을 바라본 등가 임피던스, 단자 c와 d에서 전류원 회로망을 바라본 등가 전압을 구한 뒤 최대전력 조건의 R_L을 구한다.",
    componentInventory: [{ type: "V" }, { type: "I" }, { type: "L" }, { type: "C" }],
  })],
  ["임피던스 표기만", A({
    topic: "2전원 페이저 회로",
    interpretation: "단자 a-b에서의 등가 임피던스와 단자 c-d에서의 등가 전압을 구해 순저항 부하의 최대 평균 전력을 계산한다.",
    componentInventory: [{ type: "V" }, { type: "I" }, { type: "C" }],
  })],
];
for (const [name, an] of positives) ok(`감지 ${name}`, detectAcTheveninTwoBox(an) === true);

console.log("\n[2] 형제 미탈취 (양보)");
const negatives = [
  ["단자쌍 하나(theveninMaxPower, 임용 10번 병렬형)", A({
    topic: "2전원 최대전력",
    interpretation: "단자 a-b에서 테브난 등가 임피던스와 등가 전압을 중첩으로 구하고 R_L의 최대 평균 전력을 구한다.",
    componentInventory: [{ type: "V" }, { type: "I" }, { type: "L" }, { type: "C" }],
  })],
  ["종속전원(임용 6번 ac_thevenin_dependent)", A({
    topic: "종속전원 페이저 테브난",
    interpretation: "종속 전압원이 포함된 회로에서 단자 a-b의 테브난 등가와 최대 전력 전달을 구한다. 단자 c-d 표기도 있다.",
    componentInventory: [{ type: "I" }, { type: "V" }, { type: "C" }],
  })],
  ["AC 브리지(임용 7번)", A({
    topic: "휘트스톤 브리지 최대전력",
    interpretation: "브리지 회로의 단자 a-b에서 테브난 등가를 구하고 c-d 방향 부하의 최대전력을 구한다.",
    componentInventory: [{ type: "V" }, { type: "I" }, { type: "L" }, { type: "C" }],
  })],
  ["최대전력·테브난 없음(순수 페이저)", A({
    topic: "페이저 해석",
    interpretation: "단자 a-b와 c-d의 전압을 페이저로 구한다.",
    componentInventory: [{ type: "V" }, { type: "I" }, { type: "L" }],
  })],
  ["DC 저항망", A({
    topic: "직류 회로",
    interpretation: "단자 a-b와 단자 c-d의 테브난 등가 저항과 최대전력을 구한다.",
    componentInventory: [{ type: "V" }, { type: "I" }, { type: "R" }],
  })],
];
for (const [name, an] of negatives) ok(`양보 ${name}`, detectAcTheveninTwoBox(an) === false);

console.log("\n[3] 분류기 — 전용 타입 + 형제 회귀");
{
  const cls = classifyCircuitType({
    topic: "RLC 회로의 테브난 등가 해석",
    interpretation: "두 개의 교류 전원 회로망에서 단자 a-b의 테브난 등가 임피던스와 단자 c-d의 테브난 등가 전압을 구하고 부하 R_L의 최대 평균 전력을 구한다.",
    relatedConcepts: ["테브난 등가 회로", "최대 전력 전달"],
    componentInventory: [
      { type: "V", value: "1∠0°V" }, { type: "R", value: "100Ω" }, { type: "C", value: "-j100Ω" },
      { type: "L", value: "j50Ω" }, { type: "I", value: "0.01∠0°A" }, { type: "R", value: "100Ω" },
      { type: "L", value: "j100Ω" }, { type: "C", value: "-j50Ω" },
    ],
  }, "circuit_theory");
  ok("원본 → ac_thevenin_two_box", cls.type === "ac_thevenin_two_box", `got ${cls.type}`);

  const sib = classifyCircuitType({
    topic: "2전원 최대전력 전달",
    interpretation: "단자 a-b에서 테브난 등가 임피던스와 등가 전압을 구하고 R_L의 최대 평균 전력을 구한다.",
    relatedConcepts: ["테브난", "최대 전력 전달"],
    componentInventory: [
      { type: "V", value: "10∠0°V" }, { type: "I", value: "2∠0°A" },
      { type: "L", value: "j5Ω" }, { type: "C", value: "-j5Ω" }, { type: "R", value: "10Ω" },
    ],
  }, "circuit_theory");
  // ★ 단자 라벨이 흘러도 기존 0-PRE가 theveninMaxPower로 잡고, route가 그 시그니처를 이 archetype으로
  //   흡수한다(같은 임용 10번 원본 전용 시그니처).
  ok("단자 라벨 누락 회차 → theveninMaxPower 시그니처 유지(route에서 흡수)",
    sib.type === "universal_ac" && sib.params?.theveninMaxPower === true, `got ${sib.type}`);
}

console.log("\n[4] 원본 물리 검산 (생성 풀 제외 튜플)");
{
  const o = __originalAcTheveninTwoBoxForVerify();
  ok("Z₁ = 50Ω (순저항)", near(o.answer.Z1.re, 50) && near(o.answer.Z1.im, 0), JSON.stringify(o.answer.Z1));
  ok("Z₂ = 50Ω (순저항)", near(o.answer.Z2.re, 50) && near(o.answer.Z2.im, 0), JSON.stringify(o.answer.Z2));
  ok("V₁ = 0.5 − j0.5", near(o.answer.V1.re, 0.5) && near(o.answer.V1.im, -0.5));
  ok("V₂ = 0.5 + j0.5", near(o.answer.V2.re, 0.5) && near(o.answer.V2.im, 0.5));
  ok("Z_th = Z₁∥Z₂ = 25Ω", near(o.answer.Zth.re, 25) && near(o.answer.Zth.im, 0), JSON.stringify(o.answer.Zth));
  ok("V_th = 0.5∠0°V", near(o.answer.Vth.re, 0.5) && near(o.answer.Vth.im, 0), JSON.stringify(o.answer.Vth));
  ok("R_L = 25Ω", o.answer.RL === 25, String(o.answer.RL));
  ok("P_max = 2.5mW", near(o.answer.Pmax, 0.0025), String(o.answer.Pmax));
}

console.log("\n[5] 생성물 독립 재검산 (24개)");
{
  let bad = 0, origHit = 0;
  for (let i = 0; i < 24; i++) {
    const mode = i % 2 ? "exam_variant" : "exam_similar";
    const g = generateAcTheveninTwoBox({ seed: 5000 + i * 37, mode });
    const v = g.values, a = g.answer;
    // 독립 재계산 (generator와 다른 식으로)
    const z1 = addC({ re: 0, im: v.Xl1 }, parC({ re: v.R1, im: 0 }, { re: 0, im: -v.Xc1 }));
    const z2 = addC({ re: 0, im: -v.Xc2 }, parC({ re: v.R2, im: 0 }, { re: 0, im: v.Xl2 }));
    const v1 = mulC({ re: v.Vs, im: 0 }, divC({ re: 0, im: -v.Xc1 }, { re: v.R1, im: -v.Xc1 }));
    const v2 = mulC({ re: v.Is, im: 0 }, parC({ re: v.R2, im: 0 }, { re: 0, im: v.Xl2 }));
    const zth = parC(z1, z2), vth = mulC(addC(divC(v1, z1), divC(v2, z2)), zth);
    const rl = Math.hypot(zth.re, zth.im);
    const p = (Math.hypot(vth.re, vth.im) ** 2 * rl) / ((zth.re + rl) ** 2 + zth.im ** 2);
    if (!near(a.Zth.re, zth.re) || !near(a.Zth.im, zth.im)) bad++;
    else if (!near(a.Vth.re, vth.re) || !near(a.Vth.im, vth.im)) bad++;
    else if (!near(a.RL, rl) || !near(a.Pmax, p, 1e-6)) bad++;
    // 설계 규칙: V_th는 실수(=V_s), Z_th는 순저항
    else if (Math.abs(vth.im) > 1e-9 || Math.abs(zth.im) > 1e-9) bad++;

    if (v.Vs === 1 && v.R1 === 100 && v.R2 === 100) origHit++;
  }
  ok("24개 모두 Z_th·V_th·R_L·P_max 재검산 일치", bad === 0, `bad=${bad}`);
  ok("원본 튜플 미생성", origHit === 0);
  ok("생성 풀이 충분", __acTheveninTwoBoxPoolSize() >= 8, `pool=${__acTheveninTwoBoxPoolSize()}`);
}

console.log("\n[6] 렌더 구조");
{
  const g = generateAcTheveninTwoBox({ seed: 7, mode: "exam_similar" });
  const svg = renderAcTheveninTwoBoxCircuit(g.circuitDiagram);
  ok("SVG 생성", svg.startsWith("<svg") && svg.includes("</svg>"));
  for (const label of ["a", "b", "c", "d"]) {
    ok(`단자 ${label} 표기`, new RegExp(`>${label}</text>`).test(svg));
  }
  ok("점선 박스 2개", (svg.match(/stroke-dasharray="6 5"/g) ?? []).length === 2);
  ok("R_L 표기", svg.includes(">R_L</text>"));
  for (const k of ["vsLabel", "isLabel", "r1Label", "xc1Label", "xl1Label", "r2Label", "xl2Label", "xc2Label"]) {
    ok(`소자 라벨 ${k}`, svg.includes(esc(g.circuitDiagram[k])), g.circuitDiagram[k]);
  }
  // 떠 있는 배선 끝이 없는지 — 모든 선분 좌표가 캔버스 안
  const nums = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)];
  ok("모든 배선이 캔버스 안", nums.every((m) => m.slice(1).every((n) => +n >= 0 && +n <= 660)));
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// ── 복소 헬퍼 (generator와 독립 구현) ──
function addC(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function mulC(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function divC(a, b) { const d = b.re ** 2 + b.im ** 2; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; }
function parC(a, b) { return divC(mulC(a, b), addC(a, b)); }
function near(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }
function esc(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
