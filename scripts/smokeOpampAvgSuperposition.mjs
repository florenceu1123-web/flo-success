/**
 * 임용 8번 전자회로 — (+)단자 3입력 평균 + 2단 중첩 → 미지 저항 전용 archetype 스모크. API 없음.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOpampAvgSuperposition.mjs
 *
 * ★ 신고(2026-08-04): 전용 항목이 없어 generic OPAMP 경로로 가서 **(+)단자 3입력이 반전 가산기로
 *   뒤집힌** 회로가 생성됐다("원본은 +입력에 입력이 3개 달린 건데 이건 반전증폭기잖아").
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import {
  buildOasSpace, generateOpampAvgSuperposition, qNum, qTex, solveOas, unknownFromTarget,
} from "@/lib/generation/topologies/opampAvgSuperpositionR";
import { detectOpampAvgSuperposition, runOpampAvgSuperpositionPipeline } from "@/lib/pipeline/runOpampAvgSuperpositionPipeline";
import { renderOpampAvgSuperpositionCircuit } from "@/lib/renderers/opampAvgSuperpositionCircuitRenderer";

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], componentInventory: [], ...o });
const INV = [
  { type: "OPAMP", value: "" }, { type: "OPAMP", value: "" },
  { type: "V", value: "3V" }, { type: "V", value: "2V" }, { type: "V", value: "1V" }, { type: "V", value: "3V" },
  { type: "R", value: "3kΩ" }, { type: "R", value: "3kΩ" }, { type: "R", value: "3kΩ" },
  { type: "R", value: "2kΩ" }, { type: "R", value: "2kΩ" }, { type: "R", value: "3kΩ" },
];

console.log("[1] 라우팅");
const POS = [
  ["표준 요약", A({
    topic: "연산증폭기 응용 회로 해석",
    interpretation: "두 개의 연산증폭기로 구성된 회로에서 출력 V_o가 주어질 때 저항 R의 값을 구하는 문제이다. 중첩의 원리를 이용해 a점에서 V_1에 의한 전압과 V_2에 의한 전압을 각각 R의 식으로 구한다.",
    componentInventory: INV,
  })],
  ["중첩 언급 없음 — 인벤토리 구조로", A({
    topic: "연산증폭기 응용 회로",
    interpretation: "연산증폭기 회로에서 출력 전압이 주어질 때 저항 값을 구한다.",
    componentInventory: INV,
  })],
  ["OPAMP를 하나만 인식한 회차", A({
    topic: "연산 증폭기 회로 해석",
    interpretation: "V_1을 구하고 중첩의 원리로 a점의 전압을 R의 식으로 나타낸 뒤 저항 R을 구한다.",
    componentInventory: INV.filter((c, i) => i !== 1),
  })],
];
for (const [n, a] of POS) check(`감지 — ${n}`, detectOpampAvgSuperposition(a));
for (const subj of ["electronics", "circuit_theory", "mixed_signal"]) {
  const r = classifyCircuitType(POS[0][1], subj);
  check(`분류(${subj}) → opamp_avg_superposition_r`, r.type === "opamp_avg_superposition_r", r.type);
}

console.log("[2] 형제 양보");
const NEG = [
  ["opamp_two_stage_rx (R_X 분압)", A({
    topic: "2단 연산증폭기 회로",
    interpretation: "비반전 단자에 연결된 분압 저항 R_X를 구하고 출력 V_o를 구한다.",
    componentInventory: INV,
  })],
  ["opamp_summer_tfeedback (부하 전류)", A({
    topic: "연산증폭기 가산기와 T형 궤환",
    interpretation: "반전 가산기와 T형 궤환 회로에서 R_1을 구하고 부하 저항에 흐르는 전류 I_L을 구한다.",
    componentInventory: INV,
  })],
  ["opamp_three_stage_sum (3단·버퍼)", A({
    topic: "3단 연산증폭기",
    interpretation: "반전 증폭기와 버퍼를 거쳐 반전 가산기로 출력되는 3단 회로에서 저항 값을 구한다.",
    componentInventory: INV,
  })],
  ["능동 저역통과 필터", A({
    topic: "연산증폭기 저역통과 필터",
    interpretation: "커패시터를 포함한 1차 능동 저역통과 필터의 대역폭 변화를 구한다.",
    componentInventory: INV,
  })],
  ["개방루프 이득·블록도", A({
    topic: "연산증폭기 유한 개방 루프 이득",
    interpretation: "블록도로 표현된 개방 루프 이득 A(s)로부터 전달 함수를 구한다.",
    componentInventory: INV,
  })],
];
for (const [n, a] of NEG) check(`양보 — ${n}`, !detectOpampAvgSuperposition(a));

console.log("[3] 원본 물리 — 손검산과 일치");
{
  const t = { inputs: [3, 2, 1], Rin: 3, Rg: 2, Rf1: 2, Rf2: 3, V2: 3, R: 2 };
  const o = solveOas(t);
  check("V₊ = 2[V] (세 입력의 평균)", qTex(o.Vplus) === "2", qTex(o.Vplus));
  check("V₁ = 4[V] (비반전 ×2)", qTex(o.V1) === "4", qTex(o.V1));
  check("V₁에 의한 전압 = −6[V]", qTex(o.byV1) === "-6", qTex(o.byV1));
  check("V₂에 의한 전압 = 15/2[V]", qTex(o.byV2) === "15/2", qTex(o.byV2));
  check("V_o = 3/2[V] (=1.5V, 원본 조건)", qTex(o.Vo) === "3/2", qTex(o.Vo));
  check("역산 R = 2[kΩ]", qTex(unknownFromTarget(t, "R")) === "2", qTex(unknownFromTarget(t, "R")));
}

console.log("[4] 생성물 재검산 — 독립 식으로 교차검증");
{
  // ★ generator 공식을 쓰지 않는 독립 검증 — 노드 방정식을 직접 세운다.
  //   (+) 마디: Σ(V_i − V₊)/R_in = 0
  //   1단 (−) 마디: (0 − V₋)/R_g + (V₁ − V₋)/R_f1 = 0, V₋ = V₊
  //   2단 (−) 마디: (V₁ − V₋₂)/R + (V_o − V₋₂)/R_f2 = 0, V₋₂ = V₂
  let bad = 0, note = "";
  const sSim = new Set(), sVar = new Set();
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 0; s < 24; s++) {
      const g = generateOpampAvgSuperposition({ seed: s * 91 + 7, mode });
      const v = g.values, a = g.answer;
      // ★ 생성기 공식을 쓰지 않는다 — **정답 값을 회로 방정식에 대입해 잔차가 0인지**만 본다.
      const Vp = qNum(a.Vplus), V1 = qNum(a.V1), Vo = qNum(a.Vo);
      const R = mode === "exam_similar" ? qNum(a.R) : v.R;
      const Rf2 = mode === "exam_similar" ? v.Rf2 : qNum(a.Rf2);
      // (+) 마디 KCL: Σ(V_i − V₊)/R_in = 0
      const resPlus = v.inputs.reduce((s2, x) => s2 + (x - Vp) / v.Rin, 0);
      // 1단 (−) 마디 KCL (가상 단락 V₋ = V₊): (0 − V₋)/R_g + (V₁ − V₋)/R_f1 = 0
      const res1 = (0 - Vp) / v.Rg + (V1 - Vp) / v.Rf1;
      // 2단 (−) 마디 KCL (가상 단락 V₋₂ = V₂): (V₁ − V₂)/R + (V_o − V₂)/R_f2 = 0
      const res2 = (V1 - v.V2) / R + (Vo - v.V2) / Rf2;
      const e = Math.max(Math.abs(resPlus), Math.abs(res1), Math.abs(res2));
      if (e > 1e-9) { bad++; note = `${JSON.stringify(v)} err=${e}`; }
      (mode === "exam_similar" ? sSim : sVar).add(JSON.stringify(v));
    }
  }
  check("생성물 48개 전부 노드 방정식과 일치 (KCL 잔차 포함)", bad === 0, note);
  check("유사/변형 값 풀 비중첩", [...sSim].filter((x) => sVar.has(x)).length === 0);
}

console.log("[5] 값 품질");
{
  const sp = buildOasSpace();
  check("값 공간 충분(≥ 500)", sp.length >= 500, String(sp.length));
  check("원본 튜플은 생성 풀에서 제외",
    !sp.some((t) => t.inputs.join() === "3,2,1" && t.Rin === 3 && t.Rg === 2 && t.Rf1 === 2 && t.Rf2 === 3 && t.V2 === 3 && t.R === 2));
  const s20 = sp.slice(0, 400);
  check("모든 조합에서 V₁ 정수·V₁≠V₂", s20.every((t) => solveOas(t).V1.d === 1 && qNum(solveOas(t).V1) !== t.V2));
  check("중첩 두 성분의 부호가 반대 (반전/비반전 대비)",
    s20.every((t) => { const a = solveOas(t); return qNum(a.byV1) < 0 && qNum(a.byV2) > 0; }));
}

console.log("[6] 발문·정답");
{
  const ps = await runOpampAvgSuperpositionPipeline({ analysis: null, mode: "exam_similar", count: 2 });
  const p = ps[0];
  check("문항 2개", ps.length === 2);
  check("[단계] 마커 3종", ["[단계 1]", "[단계 2]", "[단계 3]"].every((k) => p.question.includes(k)));
  check("figure 1개 (전용 회로)", p.figureVariants.length === 1 && p.figureVariants[0].diagramType === "opamp_avg_superposition_circuit");
  check("조건이 (+)단자 3입력을 명시", /비반전\(\+\) 단자에 \*\*?3개/.test(p.conditions[0]) || /비반전.*단자.*3개/.test(p.conditions[0]), p.conditions[0]);
  check("[단계 2]가 'R의 식으로'를 요구", /R의 식으로/.test(p.question));
  check("풀이에 중첩의 원리 명시", /중첩의 원리/.test(p.solution));
  check("풀이에 산술 평균 근거 명시", /산술 평균|평균/.test(p.solution));
  const vs = await runOpampAvgSuperpositionPipeline({ analysis: null, mode: "exam_variant", count: 1 });
  check("변형은 궤환 저항 R_f가 미지 (구하는 양 교환)", /R_f\[kΩ\]/.test(vs[0].question), vs[0].question.split("\n")[2]);
}

console.log("[7] 렌더 구조");
{
  const svg = renderOpampAvgSuperpositionCircuit({
    inputs: [3, 2, 1], Rin: 3, Rg: 2, Rf1: 2, Rf2: 3, V2: 3,
    unknown: "R", seriesLabel: "R", feedbackLabel: "3kΩ",
  });
  check("OPAMP 삼각형 2개", (svg.match(/M\d+,\d+ L\d+,\d+ L\d+,\d+ Z/g) ?? []).length >= 2);
  check("입력 전원 3개 + V₂ = 전원 4개", (svg.match(/<circle[^>]*r="19"/g) ?? []).length === 4);
  check("미지 저항은 값 없이 'R'", svg.includes(">R</text>"));
  check("단자 a·V_o 표기", svg.includes(">a</text>") && svg.includes(">V_o</text>"));
  check("V₁ 중간 노드 표기", svg.includes(">V₁</text>"));
  check("(+) 마디에 접지 저항이 없다 (형제 R_X와의 판별선)", !svg.includes(">R_X</text>"));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
