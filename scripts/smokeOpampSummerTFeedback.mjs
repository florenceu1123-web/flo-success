/**
 * 반전 가산기(미지 R₁) + T형 궤환 반전증폭기 + 부하 전류 I_L (임용 7번 전자회로) 정적 스모크.
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOpampSummerTFeedback.mjs
 *
 * 라우팅(감지기·분류기·형제 양보) + 원본 물리 + 생성물 독립 재검산 + 렌더 구조(라벨 겹침 0).
 */
import { detectOpampSummerTFeedback } from "../lib/pipeline/runOpampSummerTFeedbackPipeline.ts";
import { detectOpampTwoStageRx } from "../lib/pipeline/runOpampTwoStageRxPipeline.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  generateOpampSummerTFeedback,
  __originalOpampSummerTFeedbackForVerify,
  __opampSummerTFeedbackPoolSize,
} from "../lib/generation/topologies/opampSummerTFeedback.ts";
import { renderOpampSummerTFeedbackCircuit } from "../lib/renderers/opampSummerTFeedbackCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [], componentInventory: [], ...o });
const inv = (...items) => items.map((v, i) => ({ id: `c${i}`, type: v.split(":")[0], value: v.split(":")[1] }));

console.log("\n[1] 감지 — 실측 Vision 요약 + 표현 변형");
const positives = [
  ["실측 요약 (2026-08-02)", A({
    topic: "연산증폭기 응용 회로 해석",
    interpretation: "이 회로는 연산증폭기를 이용한 응용 회로로, 각 단계별로 연산증폭기의 입력과 출력 전압을 계산하는 문제입니다. 먼저, V_1이 -4V가 되도록 R_1 값을 구하고, 그에 따른 V_0의 출력을 계산합니다. 마지막으로 부하 저항 R_L이 5kΩ일 때 출력 부하 전류 I_L을 구하는 과정을 포함합니다.",
    relatedConcepts: ["연산증폭기", "반전 증폭기", "부하 저항", "전류 계산"],
    componentInventory: inv("V:1V", "V:2V", "R:1kΩ", "R:2kΩ", "R:R1[kΩ]", "OPAMP:", "R:4kΩ", "R:2kΩ", "R:4kΩ", "R:2kΩ", "OPAMP:", "R:R_L"),
  })],
  // ★ 실측 2회차 — Vision이 **V_1을 한 번도 쓰지 않고** "각 노드의 전압을 분석하고
  //   부하에 흐르는 전류를 구한다"로만 요약했다. 중간 출력 낱말에 의존하면 통째로 샌다.
  ["실측 요약 2회차 (V_1 언급 없음)", A({
    topic: "연산증폭기 응용 회로 해석",
    interpretation: "이 문제는 이상적인 연산증폭기를 사용한 응용 회로 해석 문제입니다. 주어진 회로에서 각 단계별로 연산증폭기의 입력과 출력 전압을 계산하고, 부하 저항에 흐르는 전류를 구하는 과정입니다.",
    relatedConcepts: ["연산증폭기", "이상적 동작", "전압 분배", "부하 전류", "단계적 해석", "피드백"],
    componentInventory: inv("V:1V", "V:2V", "R:1kΩ", "R:R1[kΩ]", "R:2kΩ", "OPAMP:", "R:4kΩ", "R:2kΩ", "R:4kΩ", "R:2kΩ", "OPAMP:", "R:R_L"),
  })],
  ["표현 변형(T형 궤환 명시)", A({
    topic: "2단 연산증폭기 회로",
    interpretation: "반전 가산기의 출력 V_1이 목표 값이 되도록 저항을 구하고, T형 궤환 반전증폭기의 출력 V_o와 부하 전류 I_L을 구한다.",
    componentInventory: inv("OPAMP:", "OPAMP:", "R:R_L"),
  })],
  ["인벤토리에만 R_L", A({
    topic: "연산증폭기 회로",
    interpretation: "V_1이 되기 위한 저항 값을 구하고 출력 전압과 부하 전류를 구한다.",
    componentInventory: inv("OPAMP:", "R:R_L", "R:2kΩ"),
  })],
];
for (const [n, a] of positives) ok(`감지 ${n}`, detectOpampSummerTFeedback(a) === true);

console.log("\n[2] 형제 미탈취 (양보)");
const negatives = [
  ["2단 OPAMP + R_X 분압 설계 (임용 2번)", A({
    topic: "연산 증폭기 회로 해석",
    interpretation: "두 개의 연산 증폭기를 사용하여 V_x가 2V가 되도록 저항 R_x를 조정하고, 그에 따른 출력 전압 V_o를 구하는 문제입니다.",
    componentInventory: inv("OPAMP:", "OPAMP:", "R:Rx[kΩ]"),
  })],
  ["함수 발생기(발진)", A({
    topic: "비정현파 발진기",
    interpretation: "비교기와 적분기로 구성된 발진 회로의 구형파·삼각파 진폭과 발진 주파수를 구한다. 부하 전류는 고려하지 않는다.",
    componentInventory: inv("OPAMP:", "OPAMP:", "C:0.01µF"),
  })],
  ["능동 저역통과 필터", A({
    topic: "1차 능동 저역통과 필터",
    interpretation: "커패시터를 바꿀 때 대역폭(차단주파수)이 어떻게 변하는지 구한다.",
    componentInventory: inv("OPAMP:", "C:8nF"),
  })],
  ["유한 개방루프 이득 + 블록도 (임용 11번)", A({
    topic: "연산증폭기 유한 이득",
    interpretation: "개방 루프 이득 A(s)가 유한할 때 블록도의 α·β를 구하고 반전 입력 단자 전압을 구한다.",
    componentInventory: inv("OPAMP:", "R:1kΩ", "R:99kΩ"),
  })],
  ["OPAMP 없는 회로", A({
    topic: "직류 회로",
    interpretation: "부하 저항 R_L에 흐르는 전류 I_L을 구한다.",
    componentInventory: inv("V:10V", "R:5kΩ"),
  })],
];
for (const [n, a] of negatives) ok(`양보 ${n}`, detectOpampSummerTFeedback(a) === false);

console.log("\n[3] 분류기 — 전용 타입 + 형제 회귀");
{
  const cls = classifyCircuitType(positives[0][1], "electronics");
  ok("원본 → opamp_summer_tfeedback", cls.type === "opamp_summer_tfeedback", `got ${cls.type}`);
  const sib = classifyCircuitType(negatives[0][1], "electronics");
  ok("형제(R_X 설계) → opamp_two_stage_rx 유지", sib.type === "opamp_two_stage_rx", `got ${sib.type}`);
  ok("형제 감지기가 내 원본을 안 가져감", detectOpampTwoStageRx(positives[0][1]) === false);
}

console.log("\n[4] 원본 물리 (V_a=1V·R_a=1k / V_b=2V / R_f=2k, V₁=−4V)");
{
  const o = __originalOpampSummerTFeedbackForVerify();
  ok("R₁ = 2 kΩ", o.answer.R1 === 2, String(o.answer.R1));
  ok("T형 등가 궤환저항 = 10 kΩ", o.answer.Rfeq === 10, String(o.answer.Rfeq));
  ok("이득 |V_o/V₁| = 2.5", o.answer.gain === 2.5, String(o.answer.gain));
  ok("V_o = 10 V", o.answer.Vo === 10, String(o.answer.Vo));
  ok("I_L = 2 mA (R_L=5kΩ)", o.answer.IL === 2, String(o.answer.IL));
}

console.log("\n[5] 생성물 독립 재검산 (24개)");
{
  let bad = 0, origHit = 0;
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const mode = i % 2 ? "exam_variant" : "exam_similar";
    const g = generateOpampSummerTFeedback({ seed: 300 + i * 41, mode });
    const v = g.values, a = g.answer;
    // 1단 반전 가산: V₁ = −R_f(V_a/R_a + V_b/R₁)
    const v1 = -v.Rf * (v.Va / v.Ra + v.Vb / v.R1);
    if (Math.abs(v1 - v.V1) > 1e-9) bad++;
    // 2단 T형 궤환: V_o = −(R_ta+R_tc+R_ta·R_tc/R_tb)/R_in · V₁
    const rfeq = v.Rta + v.Rtc + (v.Rta * v.Rtc) / v.Rtb;
    const vo = (-rfeq / v.Rin) * v.V1;
    if (Math.abs(vo - a.Vo) > 1e-9) bad++;
    // 3단: I_L = V_o/R_L
    if (Math.abs(vo / v.RL - a.IL) > 1e-9) bad++;
    // 답이 깔끔한지
    if (!Number.isInteger(a.Vo)) bad++;
    if (Math.abs(a.R1 * 2 - Math.round(a.R1 * 2)) > 1e-9) bad++;
    if (v.Va === 1 && v.Ra === 1 && v.Vb === 2 && v.Rf === 2 && v.V1 === -4 &&
        v.Rin === 4 && v.Rta === 2 && v.Rtb === 2 && v.Rtc === 4 && v.RL === 5) origHit++;
    seen.add(`${mode}:${v.Va}-${v.Ra}-${v.Vb}-${v.Rf}-${v.V1}-${v.Rin}-${v.Rta}-${v.Rtb}-${v.Rtc}-${v.RL}`);
  }
  ok("24개 모두 3단계 물리 재검산 일치", bad === 0, `bad=${bad}`);
  ok("원본 튜플 미생성", origHit === 0);
  ok("서로 다른 문제가 생성됨", seen.size >= 8, `distinct=${seen.size}`);
  ok("생성 풀이 충분", __opampSummerTFeedbackPoolSize() >= 50, `pool=${__opampSummerTFeedbackPoolSize()}`);
}

console.log("\n[6] 렌더 구조");
{
  for (const mode of ["exam_similar", "exam_variant"]) {
    const g = generateOpampSummerTFeedback({ seed: 11, mode });
    const svg = renderOpampSummerTFeedbackCircuit(g.circuitDiagram);
    ok(`[${mode}] SVG 생성`, svg.startsWith("<svg") && svg.includes("</svg>"));
    ok(`[${mode}] OPAMP 삼각형 2개`, (svg.match(/M \d+ \d+ L \d+ \d+ L \d+ \d+ Z/g) ?? []).length >= 2);
    ok(`[${mode}] 단자 a·V_o·I_L 표기`, svg.includes(">a</text>") && svg.includes(">V_o</text>") && svg.includes(">I_L</text>"));
    ok(`[${mode}] T형 궤환 저항 3개 라벨`,
      svg.includes(esc(g.circuitDiagram.rtaLabel)) && svg.includes(esc(g.circuitDiagram.rtbLabel)) && svg.includes(esc(g.circuitDiagram.rtcLabel)));
    ok(`[${mode}] 미지 저항 표기`, mode === "exam_similar" ? svg.includes(">R_1</text>") : svg.includes(">R_f</text>"));
    const overlaps = findLabelOverlaps(svg);
    ok(`[${mode}] 라벨 겹침 0`, overlaps.length === 0, overlaps.slice(0, 3).map((o) => `${o.a}↔${o.b}`).join(", "));
  }
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function esc(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
