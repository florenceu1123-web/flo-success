// 비교기 2개 + 다이오드 결합 (임용 3번 전자회로) — 라우팅·물리·렌더 회귀 (API 없음)
//   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeComparatorDiodeOr.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectComparatorDiodeOr } from "../lib/pipeline/runComparatorDiodeOrPipeline.ts";
import {
  generateComparatorDiodeOr,
  __originalComparatorDiodeOrForVerify,
  __comparatorDiodeOrPoolSizes,
} from "../lib/generation/topologies/comparatorDiodeOr.ts";
import { renderComparatorDiodeOrCircuit } from "../lib/renderers/comparatorDiodeOrCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? "  — " + extra : ""}`); }
};

const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const INV = inv("V:+5V", "V:+2V", "OPAMP", "OPAMP", "D", "D", "R:10kΩ");

// ── 1. 감지 ───────────────────────────────────────────────────────────────
console.log("\n[1] 감지");
const positives = [
  // ★ 실측 Vision 요약 (2026-08-03 실제 analyze 출력 그대로) — 이 회차가 bjt_characteristic_curve로 샜다.
  ["실측 요약", mk(
    "연산 증폭기 응용 회로 분석",
    "주어진 연산 증폭기 회로에서 입력 전압이 시간에 따라 변화할 때, 다이오드 D1과 D2의 상태를 분석하여 출력 전압을 구하는 문제입니다. 입력 전압이 주어진 구간에서 어떻게 변화하는지에 따라 다이오드의 ON/OFF 상태가 결정되고, 이에 따라 출력 전압을 계산합니다.",
    [], INV)],
  ["비교기 표현", mk(
    "비교기와 다이오드를 이용한 출력 전압 판별",
    "두 비교기의 출력이 다이오드 D_1, D_2를 거쳐 공통 마디에 묶여 있다. 구간 ㉠에서의 출력 전압과 구간 ㉡에서의 다이오드 상태를 구한다.",
    ["비교기", "다이오드"], INV)],
  ["인벤토리만 (다이오드 개수 흘림)", mk(
    "연산 증폭기 회로의 구간별 출력 전압",
    "입력 파형이 인가될 때 각 구간의 출력 전압을 구하는 문제이다.",
    [], INV)],
  ["영문 혼용", mk(
    "op-amp comparator with diodes",
    "Two comparators drive diodes D_1 and D_2 into a common node. Determine V_out and the ON/OFF state of each diode. 출력 전압을 구하시오.",
    [], INV)],
];
for (const [n, a] of positives) ok(`감지 ${n}`, detectComparatorDiodeOr(a) === true);

// ── 2. 형제 양보 ──────────────────────────────────────────────────────────
console.log("\n[2] 형제 양보");
const negatives = [
  ["다이오드 클램퍼", mk("다이오드 클램퍼 회로", "직렬 커패시터와 다이오드·바이어스 전지로 출력 파형의 상한과 하한 a, b를 구한다. 다이오드는 이상적이다. 출력 전압 파형을 그린다.", [], inv("C", "D", "V", "R"))],
  ["플래시 ADC", mk("2비트 플래시 ADC", "저항 사다리와 비교기 3개, 인코더로 구성된 A/D 변환 회로의 디지털 출력을 구한다. 출력 전압 기준.", [], inv("OPAMP", "OPAMP", "OPAMP", "R", "R", "R"))],
  ["함수 발생기", mk("비정현파 발진기", "슈미트 비교기와 적분기로 구성된 발진 회로에서 구형파·삼각파의 진폭과 발진 주파수를 구한다.", [], inv("OPAMP", "OPAMP", "C", "R", "R"))],
  ["제너 레귤레이터", mk("제너다이오드 정전압 회로", "제너다이오드와 트랜지스터로 출력 전압을 안정화하는 회로에서 V_o와 전류를 구한다.", [], inv("D", "D", "Q", "R", "R"))],
  ["OPAMP 가산기 이득", mk("반전 가산기 이득 설계", "반전 가산기의 전달 함수와 이득을 구하고 출력 전압을 계산한다.", [], inv("OPAMP", "R", "R", "R"))],
  ["BJT 특성곡선", mk("BJT 출력 특성 곡선", "베이스 전류에 따른 I_C-V_CE 특성 곡선에서 ㉠과 ㉡ 영역의 명칭과 스위칭 동작 ON/OFF를 설명한다.", [], inv("Q", "R", "V"))],
];
for (const [n, a] of negatives) ok(`양보 ${n}`, detectComparatorDiodeOr(a) === false);

// ── 3. 분류기 (과목 무관) ─────────────────────────────────────────────────
console.log("\n[3] 분류기 — 과목 무관 0-PRE");
for (const subj of ["electronics", "mixed_signal", "digital_logic", "circuit_theory"]) {
  const cls = classifyCircuitType({ ...positives[0][1], subjectKey: subj }, subj);
  ok(`[${subj}] → comparator_diode_or`, cls.type === "comparator_diode_or", `got ${cls.type}`);
}
// 형제가 내 원본을 안 가져가는지 (역방향)
{
  const bjt = classifyCircuitType({ ...negatives[5][1], subjectKey: "electronics" }, "electronics");
  ok("BJT 특성곡선 원본은 그대로", bjt.type !== "comparator_diode_or", `got ${bjt.type}`);
}

// ── 4. 원본 물리 ──────────────────────────────────────────────────────────
console.log("\n[4] 원본 물리 (수기검산 대조)");
{
  const g = __originalComparatorDiodeOrForVerify();
  ok("원본 ㉠ V_out = 12V", g.answer.voutA === 12, `got ${g.answer.voutA}`);
  ok("원본 ㉡ D_1 = OFF", g.answer.diodesB[0] === "OFF", `got ${g.answer.diodesB[0]}`);
  ok("원본 ㉡ D_2 = ON", g.answer.diodesB[1] === "ON", `got ${g.answer.diodesB[1]}`);
  ok("원본 ㉠ 비교기 출력 (+12, −12)", g.answer.stateA.outs.join() === "12,-12", g.answer.stateA.outs.join());
  ok("원본 ㉠ D_1 ON", g.answer.stateA.diodes[0] === "ON");
  ok("원본 ㉡ V_out = 12V", g.answer.stateB.vout === 12, `got ${g.answer.stateB.vout}`);
  // 창 안(2 < V_in < 5)이면 두 다이오드 모두 OFF, V_out = 0 — 이 회로의 교육 포인트
  ok("창 안 V_in=3.5 → 두 다이오드 OFF·V_out=0", (() => {
    const v = g.values;
    const o1 = 3.5 > v.vHigh ? v.vsat : -v.vsat, o2 = 3.5 < v.vLow ? v.vsat : -v.vsat;
    return Math.max(o1, o2, 0) === 0;
  })());
}

// ── 5. 생성물 독립 재검산 ─────────────────────────────────────────────────
console.log("\n[5] 생성물 독립 재검산 (24개)");
{
  let bad = 0, origHit = 0, badWave = 0, badFig = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let i = 0; i < 12; i++) {
      const g = generateComparatorDiodeOr({ seed: 400 + i * 37, mode });
      const v = g.values;
      // ★ 파이프라인과 무관한 독립 구현으로 다시 계산한다.
      const refFor = (k) => v.config === "or_pulldown"
        ? (k === 0 ? v.vHigh : v.vLow)
        : (k === 0 ? v.vLow : v.vHigh);
      const high = (k, vin) => (k === 0 ? vin > refFor(0) : vin < refFor(1));
      const calc = (vin) => {
        const outs = [0, 1].map((k) => (high(k, vin) ? v.vsat : -v.vsat));
        const rail = v.config === "or_pulldown" ? 0 : v.vsat;
        const vout = v.config === "or_pulldown" ? Math.max(...outs, rail) : Math.min(...outs, rail);
        const diodes = outs.map((o) => (o === vout && vout !== rail ? "ON" : "OFF"));
        return { outs, vout, diodes };
      };
      const A = calc(v.vA), B = calc(v.vB);
      if (A.vout !== g.answer.voutA) bad++;
      if (B.diodes.join() !== g.answer.diodesB.join()) bad++;
      if (A.diodes.join() === B.diodes.join()) bad++;                       // 두 구간이 달라야 한다
      if (v.config !== (mode === "exam_variant" ? "and_pullup" : "or_pulldown")) bad++;
      if (v.vHigh - v.vLow < 2) bad++;
      if ([v.vA, v.vB].some((x) => x === v.vHigh || x === v.vLow)) bad++;   // 경계값 금지
      // 원본 튜플이 생성되면 안 된다
      if (v.config === "or_pulldown" && v.vsat === 12 && v.vHigh === 5 && v.vLow === 2 &&
          v.rPull === 10 && v.vA === 6 && v.vB === 1) origHit++;
      // 파형 — t가 단조증가여야 한다(waveform_time_not_monotonic 회귀)
      const ts = g.waveform.signals[0].samples.map((p) => p.t);
      if (!ts.every((t, k) => k === 0 || t > ts[k - 1])) badWave++;
      if (g.waveform.markers?.length !== 2) badWave++;
      // circuitDiagram 구조
      if (g.circuitDiagram.comparators.length !== 2) badFig++;
      if (g.circuitDiagram.comparators[0].inPin === g.circuitDiagram.comparators[1].inPin) badFig++;
      if (v.config === "and_pullup" && !g.circuitDiagram.pullSupplyLabel) badFig++;
      if (v.config === "or_pulldown" && g.circuitDiagram.pullSupplyLabel) badFig++;
    }
  }
  ok("24개 물리·필터 재검산 일치", bad === 0, `${bad}건 불일치`);
  ok("원본 튜플 미생성", origHit === 0, `${origHit}건`);
  ok("파형 t 단조증가 + 마커 2개", badWave === 0, `${badWave}건`);
  ok("회로 payload 구조", badFig === 0, `${badFig}건`);
  const sizes = __comparatorDiodeOrPoolSizes();
  ok("생성 풀 충분 (유사·변형 각 50+)", sizes.similar >= 50 && sizes.variant >= 50, JSON.stringify(sizes));
}

// ── 6. 렌더 ───────────────────────────────────────────────────────────────
console.log("\n[6] 렌더 구조");
{
  let overlap = 0, missing = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let i = 0; i < 4; i++) {
      const g = generateComparatorDiodeOr({ seed: 900 + i * 53, mode });
      const svg = renderComparatorDiodeOrCircuit(g.circuitDiagram);
      const tri = (svg.match(/<path d="M\d+,\d+ L\d+,\d+ L\d+,\d+ Z" fill="white"/g) ?? []).length;
      if (tri !== 2) missing++;                                    // 비교기 삼각형 2개
      if (!svg.includes("D_1") || !svg.includes("D_2")) missing++; // 다이오드 라벨
      if (!svg.includes("V_out") || !svg.includes("V_in")) missing++;
      if (g.values.config === "or_pulldown" && !svg.includes("translate(452,")) missing++; // 레일 접지
      overlap += findLabelOverlaps(svg).length;
    }
  }
  ok("필수 요소 누락 0", missing === 0, `${missing}건`);
  ok("라벨 겹침 0", overlap === 0, `${overlap}건`);
}

console.log(`\n=== ${pass}/${pass + fail} pass`);
process.exit(fail ? 1 : 0);
