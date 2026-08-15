/**
 * BJT 이상적 스위치 → 진리표 + 동일 동작 논리게이트 (임용 2번) 정적 스모크.
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeBjtSwitchLogicGate.mjs
 *
 * 라우팅(감지기·분류기·형제 양보) + 원본 물리(PNP 하이사이드=인버터) + 생성물 논리 재검산 + 렌더 구조.
 */
import { detectBjtSwitchLogicGate } from "../lib/pipeline/runBjtSwitchLogicGatePipeline.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  generateBjtSwitchLogicGate,
  __originalBjtSwitchForVerify,
  __bjtSwitchPoolSizes,
} from "../lib/generation/topologies/bjtSwitchLogicGate.ts";
import { renderBjtSwitchLogicCircuit } from "../lib/renderers/bjtSwitchLogicCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [], componentInventory: [], ...o });

console.log("\n[1] 감지 — 원본 표현 + 변형");
const positives = [
  ["원본 발문", A({
    topic: "BJT 응용 회로와 논리게이트",
    interpretation: "쌍극성 접합 트랜지스터(BJT) 응용 회로에서 입력 X에 신호가 인가될 때 출력 ㉠, ㉡을 구하고, 이와 동일한 동작을 하는 논리게이트를 그리는 문제이다. 트랜지스터는 이상적인 스위칭 동작을 한다고 가정한다.",
    relatedConcepts: ["BJT", "스위칭 동작", "논리게이트", "진리표"],
  })],
  ["게이트 낱말 없이 진리표+스위칭만", A({
    topic: "트랜지스터 스위치 회로",
    interpretation: "트랜지스터를 이상적인 스위치로 보고 입력 H/L에 대한 출력 진리표를 완성한다.",
  })],
  ["영문 혼용", A({
    topic: "BJT switching circuit",
    interpretation: "BJT 회로의 출력을 구하고 동일한 동작을 하는 logic gate를 밝힌다.",
  })],
];
for (const [n, a] of positives) ok(`감지 ${n}`, detectBjtSwitchLogicGate(a) === true);

console.log("\n[2] 형제 미탈취 (양보)");
const negatives = [
  ["BJT DC 바이어스 (임용 7번)", A({
    topic: "BJT 바이어스 회로",
    interpretation: "V_BE = 0.7V로 가정하고 분압 바이어스 회로의 동작점과 컬렉터 전류를 구한다.",
  })],
  ["BJT 출력 특성곡선", A({
    topic: "BJT 특성곡선",
    interpretation: "출력 특성 곡선에서 활성·포화 영역을 식별하고 동작점을 표시한다.",
  })],
  ["제너+BJT 레귤레이터 (임용 8번)", A({
    topic: "정전압 회로",
    interpretation: "제너다이오드와 트랜지스터로 구성된 정전압 레귤레이터의 출력 전압과 전류를 구한다.",
  })],
  ["트랜지스터 없는 논리게이트 문제", A({
    topic: "조합논리 회로",
    interpretation: "진리표로부터 최소 SOP를 구하고 논리게이트로 구현한다.",
  })],
  ["소신호 증폭기", A({
    topic: "BJT 소신호 증폭",
    interpretation: "하이브리드 π 등가회로로 전압 이득을 구한다.",
  })],
];
for (const [n, a] of negatives) ok(`양보 ${n}`, detectBjtSwitchLogicGate(a) === false);

console.log("\n[3] 분류기 — 과목 무관 (전자/디지털/복합 모두 같은 유형)");
for (const subj of ["electronics", "digital_logic", "mixed_signal"]) {
  const cls = classifyCircuitType(positives[0][1], subj);
  ok(`[${subj}] → bjt_switch_logic_gate`, cls.type === "bjt_switch_logic_gate", `got ${cls.type}`);
}

console.log("\n[4] 원본 동작 (PNP 하이사이드 = 인버터)");
{
  const o = __originalBjtSwitchForVerify();
  ok("등가 게이트 = NOT", o.answer.gate === "NOT", o.answer.gate);
  ok("X=H → Y=L (㉠)", o.answer.rows[0].inputs[0] === "H" && o.answer.rows[0].out === "L");
  ok("X=L → Y=H (㉡)", o.answer.rows[1].inputs[0] === "L" && o.answer.rows[1].out === "H");
  ok("진리표 빈칸 ㉠㉡", o.truthTable.rows.map((r) => r.output).join("") === "㉠㉡");
  ok("정답 게이트 figure = NOT", o.gateDiagram.gates[0].type === "NOT");
}

console.log("\n[5] 생성물 논리 재검산 (24개)");
{
  let bad = 0, origHit = 0;
  const seen = new Set();
  // 구성별 기대 논리 (생성기와 독립적으로 정의)
  const expect = {
    pnp_high_side: { gate: "NOT", fn: (x) => [!x[0]] },
    npn_low_side: { gate: "NOT", fn: (x) => [!x[0]] },
    npn_series2: { gate: "NAND", fn: (x) => [!(x[0] && x[1])] },
    npn_parallel2: { gate: "NOR", fn: (x) => [!(x[0] || x[1])] },
  };
  for (let i = 0; i < 24; i++) {
    const mode = i % 2 ? "exam_variant" : "exam_similar";
    const g = generateBjtSwitchLogicGate({ seed: 700 + i * 29, mode });
    const e = expect[g.values.config];
    if (!e) { bad++; continue; }
    if (g.answer.gate !== e.gate) bad++;
    for (const r of g.answer.rows) {
      const xs = r.inputs.map((s) => s === "H");
      const want = e.fn(xs)[0] ? "H" : "L";
      if (r.out !== want) bad++;
    }
    // 유사는 원본 구성 유지 / 변형은 구성 교환
    if (mode === "exam_similar" && g.values.config !== "pnp_high_side") bad++;
    if (mode === "exam_variant" && g.values.config === "pnp_high_side") bad++;
    // 진리표 행 수 = 2^입력수
    if (g.truthTable.rows.length !== 2 ** g.answer.inputs.length) bad++;
    if (g.values.config === "pnp_high_side" && g.values.vcc === 5) origHit++;
    seen.add(`${g.values.config}-${g.values.vcc}-${g.values.rb}-${g.values.rc}`);
  }
  ok("24개 모두 게이트·진리표 재검산 일치", bad === 0, `bad=${bad}`);
  ok("원본 튜플(PNP·5V) 미생성", origHit === 0);
  ok("서로 다른 문제가 생성됨", seen.size >= 8, `distinct=${seen.size}`);
  const pools = __bjtSwitchPoolSizes();
  ok("생성 풀이 충분", pools.similar >= 8 && pools.variant >= 8, JSON.stringify(pools));
}

console.log("\n[6] 렌더 구조 (4개 구성 전부)");
{
  for (const config of ["pnp_high_side", "npn_low_side", "npn_series2", "npn_parallel2"]) {
    const two = config.endsWith("2");
    const svg = renderBjtSwitchLogicCircuit({
      config, vccLabel: "+5V", rbLabel: "R_B", rcLabel: "R_C",
      inputLabels: two ? ["X_1", "X_2"] : ["X"], outputLabel: "출력 Y",
    });
    ok(`[${config}] SVG 생성`, svg.startsWith("<svg") && svg.includes("</svg>"));
    ok(`[${config}] 트랜지스터 ${two ? 2 : 1}개`, (svg.match(/<circle[^>]*r="26"/g) ?? []).length === (two ? 2 : 1));
    ok(`[${config}] 입력·출력 단자 라벨`, svg.includes("입력") && svg.includes("출력 Y"));
    const overlaps = findLabelOverlaps(svg);
    ok(`[${config}] 라벨 겹침 0`, overlaps.length === 0, overlaps.slice(0, 2).map((o) => `${o.a}↔${o.b}`).join(", "));
  }
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
