/**
 * D-FF 2개 + 3-NAND 입력망 + 파형 → Q₁Q₀ + 점선부 최소 AND/OR (임용 12번 디지털) 정적 스모크.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDffNandMuxPair.mjs
 *
 * 배경(2026-08-04 실측, 사용자 신고): 전용 항목이 없어 `sequential_dff_generic`(GPT 구조추출)으로
 * 떨어져 원본과 다른 회로가 나왔고, **점선 영역에 정답 게이트가 그대로 그려져 [단계 3] 답이 노출**됐다.
 *
 * 구조: 각 D 입력망 = NAND 3개 (위 (1,s) · 아래 (x,y) · 최종) ⇒ **D = s + x·y**
 *   ⇒ 최소 회로가 정확히 **AND 1개 + OR 1개** — 문항의 "최소한의 AND 게이트와 OR 게이트" 요구와 일치.
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import {
  generateDffNandMuxPair,
  __dffNandMuxSpace,
  __nets,
  __isProperAndOr,
  evalNet,
  netTex,
} from "@/lib/generation/topologies/dffNandMuxPair";
import { detectDffNandMuxPair } from "@/lib/pipeline/runDffNandMuxPairPipeline";
import { renderLogicNetworkSVG } from "@/lib/renderers/logicNetworkRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
}
const A = (topic, interpretation, concepts = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: [],
});

// ── 1. 감지 ─────────────────────────────────────────────────────────────────
console.log("[1] 감지 — 원본 요약 + 표현 변형");
const REPORTED = A(
  "D 플립플롭을 이용한 회로",
  "그림 (가)는 D 플립플롭을 이용한 회로이다. 입력 신호 A와 B가 그림 (나)와 같이 입력될 때 ㉠ 지점에서 Q1Q0 값을 구하고, 점선 부분을 최소한의 AND 게이트와 OR 게이트를 이용한 논리 회로로 도시한다.",
  ["D 플립플롭", "논리 회로", "파형"],
);
// ★ 실측 회차 (2026-08-04, 사용자 신고 "다른 게 나와") — Vision이 **"점선"·"AND/OR"·"Q1Q0 값"을
//   하나도 쓰지 않고** 일반적인 상태 추적으로만 요약해 감지가 미발화, 형제 dff_state_design이 가져갔다.
//   남는 신호는 구조뿐: D 플립플롭 + Q1·Q0 2비트 + 외부 입력 A·B + 파형 추적.
const REPORTED_REAL = A(
  "D 플립플롭 회로 분석",
  "이 문제는 D 플립플롭을 이용한 회로의 동작을 분석하는 것이다. 입력 신호 A와 B에 따라 플립플롭의 출력 Q1과 Q0의 상태 변화를 시간에 따라 추적하여 해석한다. 주어진 파형을 통해 각 시점에서의 출력 상태를 구하는 것이 목표이다.",
  ["D 플립플롭", "상태 전이", "클럭 신호", "논리 게이트", "순차 논리 회로", "파형 분석", "출력 상태", "입력 신호"],
);
// ★ 실측 회차 2 (2026-08-04, 사용자 재신고) — Vision이 만든 **빈칸 학습 문장**에 "카르노맵"이 들어가
//   형제 양보 가드가 발화, 감지가 통째로 죽었다. 판정은 topic·interpretation만 봐야 한다(CLAUDE.md 1-4).
const REPORTED_BLANKTRAP = {
  topic: "D 플립플롭 회로 분석",
  interpretation: "주어진 회로는 D 플립플롭을 이용하여 입력 신호 A와 B에 따라 Q1과 Q0의 출력을 결정하는 순차 논리 회로입니다. 주어진 클록 신호에 따라 상태가 변하며, 각 단계별로 Q1과 Q0의 값을 구하는 것이 목표입니다. 해석 절차에 따라 각 시점에서의 출력 값을 계산하고, 회로의 논리식을 최소화하여 도시하는 과정을 포함합니다.",
  relatedConcepts: ["D 플립플롭", "순차 논리 회로", "상태 전이", "클록 신호", "논리식 최소화", "AND 게이트", "OR 게이트", "논리 회로 설계"],
  fillInTheBlanks: [
    { sentence: "논리 회로의 최소화를 위해 ____를 사용한다.", answer: "카르노맵" },
    { sentence: "상태 전이 과정에서 중요한 요소는 ____이다.", answer: "클록 신호" },
  ],
  componentInventory: [],
};
const VARIANTS = [
  ["원본 요약", REPORTED],
  ["★ 실측 회차 (문구 없이 구조만)", REPORTED_REAL],
  ["★ 실측 회차 2 (빈칸에 '카르노맵' 함정)", REPORTED_BLANKTRAP],
  ["Q₁Q₀ 표기", A("D 플립플롭 순서회로", "D 플립플롭 두 개의 출력 Q₁Q₀ 값을 각 지점에서 구한다.", ["순서논리"])],
  ["도시 요구만", A("D-FF 회로 분석", "점선 부분을 최소한의 AND 게이트와 OR 게이트를 이용한 논리 회로로 도시하시오. D 플립플롭은 이상적이다.", [])],
];
for (const [n, an] of VARIANTS) check(`감지 — ${n}`, detectDffNandMuxPair(an) === true);

// ── 2. 형제 양보 ─────────────────────────────────────────────────────────────
console.log("[2] 형제 양보 (미탈취)");
const YIELDS = [
  ["JK 여기표", A("JK 플립플롭 순서회로", "JK 플립플롭 2개의 여기표를 채우고 D 플립플롭과 비교해 논리식을 구한다.", ["여기표"])],
  ["T-FF 상태도", A("T 플립플롭 설계", "상태도를 보고 T 플립플롭 2개와 게이트로 구현한다. D 플립플롭이 아니다.", ["상태도"])],
  ["MUX 구현", A("D 플립플롭 + MUX", "D 플립플롭과 2×1 멀티플렉서로 순차회로를 구현한다.", ["MUX"])],
  ["카운터/DAC", A("D 플립플롭 카운터", "D 플립플롭 카운터의 출력을 DAC로 변환한다.", ["카운터"])],
  ["카르노맵 설계", A("D 플립플롭 설계", "D 플립플롭의 상태도와 카르노맵으로 D 입력을 구한다.", ["카르노맵"])],
];
for (const [n, an] of YIELDS) check(`양보 — ${n}`, detectDffNandMuxPair(an) === false);

// ── 3. 분류기 (과목 무관) ────────────────────────────────────────────────────
console.log("[3] 분류기 — 과목 무관 0-PRE");
for (const subject of ["digital_logic", "electronics", "mixed_signal", "circuit_theory"]) {
  const r = classifyCircuitType(REPORTED, subject);
  check(`분류(${subject}) → dff_nand_mux_pair`, r?.type === "dff_nand_mux_pair", r?.type);
}

// ── 4. 값 규칙 — 진짜 AND+OR인가 ─────────────────────────────────────────────
console.log("[4] 값 규칙 — 흡수·퇴화 배제");
{
  const nets = __nets();
  check("입력망 후보 충분", nets.length >= 30, String(nets.length));
  check("모든 후보가 isProperAndOr", nets.every(__isProperAndOr));
  // ★ 독립 검증 — 진리표로 "s + x·y가 단일 리터럴/상수로 붕괴하지 않는가"
  let collapsed = 0;
  for (const n of nets) {
    const rows = [];
    for (let A2 = 0; A2 < 2; A2++) for (let B2 = 0; B2 < 2; B2++)
      for (let Q1 = 0; Q1 < 2; Q1++) for (let Q0 = 0; Q0 < 2; Q0++)
        rows.push({ A: A2, B: B2, Q1, Q0, d: evalNet(n, A2, B2, Q1, Q0) });
    if (rows.every((r) => r.d === rows[0].d)) { collapsed++; continue; }   // 상수
    // 단일 리터럴과 동일하면 OR 게이트만으로 충분 → [단계 3]이 성립 안 함
    const lits = ["A", "Abar", "B", "Bbar", "Q1", "Q0"];
    const litOf = (l, r) => ({ A: r.A, Abar: r.A ^ 1, B: r.B, Bbar: r.B ^ 1, Q1: r.Q1, Q0: r.Q0 })[l];
    if (lits.some((l) => rows.every((r) => r.d === litOf(l, r)))) collapsed++;
  }
  check("★ 상수·단일 리터럴로 붕괴하는 후보 0", collapsed === 0, `${collapsed}개`);
}

// ── 5. 생성물 재검산 ─────────────────────────────────────────────────────────
console.log("[5] 생성물 독립 재검산 (유사·변형 각 24개)");
{
  let badSim = 0, badPts = 0, badDashed = 0, degenerate = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 24; s++) {
      const g = generateDffNandMuxPair({ seed: s * 613, mode });
      const v = g.values, a = g.answer;
      // ★ 독립 시뮬레이션 — 동기 갱신(직전 상태로 동시에)
      let Q1 = 0, Q0 = 0;
      const q1 = [], q0 = [];
      for (let t = 0; t < v.aSeq.length; t++) {
        const n1 = evalNet(v.net1, v.aSeq[t], v.bSeq[t], Q1, Q0);
        const n0 = evalNet(v.net0, v.aSeq[t], v.bSeq[t], Q1, Q0);
        Q1 = n1; Q0 = n0; q1.push(Q1); q0.push(Q0);
      }
      if (q1.join("") !== a.q1Seq.join("") || q0.join("") !== a.q0Seq.join("")) badSim++;
      // ㉠㉡㉢ 값이 파형과 일치
      for (const p of a.atPoints) if (p.q1 !== q1[p.idx] || p.q0 !== q0[p.idx]) badPts++;
      // 점선 대상이 모드와 일치 + 정답 논리식이 그 망과 같음
      const want = mode === "exam_variant" ? 1 : 0;
      if (v.dashedTarget !== want) badDashed++;
      if (netTex(a.dashedNet) !== netTex(want === 0 ? v.net0 : v.net1)) badDashed++;
      // 세 지점이 모두 같으면 문제가 무의미
      if (new Set(a.atPoints.map((p) => `${p.q1}${p.q0}`)).size < 2) degenerate++;
    }
  }
  check("Q 시퀀스 = 독립 동기 시뮬레이션", badSim === 0, `불일치 ${badSim}`);
  check("㉠㉡㉢ 값이 파형과 일치", badPts === 0, `불일치 ${badPts}`);
  check("점선 대상·정답 논리식 일치", badDashed === 0, `위반 ${badDashed}`);
  check("세 지점 상태가 최소 2가지", degenerate === 0, `${degenerate}건`);
  check("값 공간 충분", __dffNandMuxSpace(false).length >= 50 && __dffNandMuxSpace(true).length >= 50,
    `${__dffNandMuxSpace(false).length}/${__dffNandMuxSpace(true).length}`);
}

// ── 6. figure — ★ 답이 노출되지 않는가 ───────────────────────────────────────
console.log("[6] figure — 점선 빈칸 · 정답 분리");
{
  let leak = 0, missing = 0, overlap = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 6; s++) {
      const g = generateDffNandMuxPair({ seed: s * 104729, mode });
      // 정답 figure는 원래 NAND 3개를 점선으로 감싸 보여준다(내용 숨기지 않음)
      if (g.circuitFilled.dashedRegions?.[0]?.hideContents) leak++;
      // ★ 문제 figure = 정답 형태(AND→OR)를 **빈 네모칸 2개**로 (사용자 지정).
      const svg = renderLogicNetworkSVG(g.circuit);
      const blanks = g.circuit.blanks ?? [];
      if (blanks.length !== 2) leak++;                       // 빈칸 정확히 2개
      const bIds = blanks.flatMap((b) => b.gateIds);
      const bTypes = bIds.map((id) => g.circuit.gates.find((x) => x.id === id)?.type).sort().join(",");
      if (bTypes !== "AND,OR") leak++;                        // AND·OR 자리
      // 원래 NAND 3개는 문제 figure에 없어야 한다(답 미노출)
      const nandIds = g.values.dashedTarget === 0
        ? ["g0_t", "g0_b", "g0_f"]
        : ["g1_t", "g1_b", "g1_f"];
      if (nandIds.some((id) => g.circuit.gates.some((x) => x.id === id))) leak++;
      // 정답 figure에는 원래 NAND 3개가 그대로 있어야 한다
      if (!nandIds.every((id) => g.circuitFilled.gates.some((x) => x.id === id))) leak++;
      overlap += findLabelOverlaps(svg).length;
      // [단계 3] 정답 회로 = AND 1 + OR 1
      const kinds = g.minimalNet.gates.map((x) => x.type).sort().join(",");
      if (kinds !== "AND,OR") missing++;
      // ★ (나) 파형 — 문제용은 Q₁·Q₀가 **빈 트랙**, 정답용은 채워져 있어야 한다.
      const qTracks = g.waveform.signals.filter((s) => s.name === "Q₁" || s.name === "Q₀");
      if (qTracks.length !== 2 || !qTracks.every((s) => s.blank === true && s.samples.length === 0)) missing++;
      const qSol = g.waveformSolution.signals.filter((s) => s.name === "Q₁" || s.name === "Q₀");
      if (qSol.length !== 2 || qSol.some((s) => s.blank || s.samples.length === 0)) missing++;
      // 정답 파형의 값이 시뮬레이션과 일치
      const solQ1 = qSol.find((s) => s.name === "Q₁").samples.slice(0, g.answer.q1Seq.length).map((p) => p.v).join("");
      if (solQ1 !== g.answer.q1Seq.join("")) missing++;
    }
  }
  check("★ 문제 figure의 점선부가 비어 있음(답 미노출)", leak === 0, `위반 ${leak}`);
  check("[단계 3] 정답 회로 = AND 1개 + OR 1개", missing === 0, `위반 ${missing}`);
  check("라벨 겹침 0", overlap === 0, `${overlap}건`);
}

// ── 7. 발문·정답 텍스트 ──────────────────────────────────────────────────────
console.log("[7] 발문·정답 텍스트");
{
  const { runDffNandMuxPairPipeline } = await import("@/lib/pipeline/runDffNandMuxPairPipeline");
  let badStep = 0, badTxt = 0, badFig = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    const probs = await runDffNandMuxPairPipeline({ analysis: null, mode, count: 3 });
    for (const p of probs) {
      for (const m of ["[단계 1]", "[단계 2]", "[단계 3]"]) {
        if (!p.question.includes(m) || !p.answer.includes(m) || !p.solution.includes(m)) badStep++;
      }
      if (!/㉠/.test(p.answer) || !/㉡/.test(p.answer) || !/㉢/.test(p.answer)) badTxt++;
      if (!/AND 게이트 1개/.test(p.answer) || !/OR 게이트/.test(p.answer)) badTxt++;
      if (!/D 플립플롭/.test(p.content)) badTxt++;
      const roles = (p.figureVariants ?? []).map((f) => f.diagramType).join(",");
      if (roles !== "logic_network,waveform") badFig++;
      if ((p.solutionFigures ?? []).length !== 3) badFig++;   // 최소회로 + 원본회로 + 정답파형
    }
  }
  check("[단계 1~3] 구조", badStep === 0, `위반 ${badStep}`);
  check("정답 문구(㉠㉡㉢·AND/OR)", badTxt === 0, `위반 ${badTxt}`);
  check("figure 2개 + 정답 figure 3개", badFig === 0, `위반 ${badFig}`);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
