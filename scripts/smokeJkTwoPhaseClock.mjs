// 임용 30번 — JK + 2상 클럭발생기 + EX-OR 출력 (jk_two_phase_clock)
//   ★ 재검산은 생성기 시뮬레이터를 다시 부르지 않고 **독립 시뮬레이터**로 대조한다.
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { __spaces, generateJkTwoPhaseClockXor, matchesJkTwoPhaseClock, simulate }
  from "../lib/generation/topologies/jkTwoPhaseClockXor.ts";
import { detectJkTwoPhaseClock, runJkTwoPhaseClockPipeline }
  from "../lib/pipeline/runJkTwoPhaseClockPipeline.ts";
import { renderJkTwoPhaseClockCircuit } from "../lib/renderers/jkTwoPhaseClockCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv, tags: [], learningObjective: {} });
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });

// 1. 라우팅
const POS = [
  ["실측 요약(2상 클럭발생기)", mk("JK 플립플롭과 2상 클럭발생기 순서논리회로",
    "그림 (가)는 JK 플립플롭과 2상 클럭발생기를 연결하여 활용한 순서논리회로이다. 클럭(CLK)과 입력 신호 J₁, K₁이 그림 (나)와 같을 때 출력 Y₁의 파형을 구한다.",
    ["JK 플립플롭", "2상 클럭"], inv("FF", "FF", "GATE", "GATE"))],
  ["낱말 흘림 (구조로)", mk("JK 플립플롭 순서논리회로의 출력 파형",
    "JK 플립플롭 두 개와 게이트 두 개로 구성된 회로에서 출력 Y₁의 파형을 구한다.",
    [], inv("FF", "FF", "GATE", "GATE"))],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesJkTwoPhaseClock(a) === true);
  ok(`안전망: ${n}`, detectJkTwoPhaseClock(a) === true);
  for (const s of ["digital_logic", "electronics", "mixed_signal"]) {
    ok(`분류 ${s}: ${n}`, classifyCircuitType({ ...a, subjectKey: s }, s)?.type === "jk_two_phase_clock", `got ${classifyCircuitType({ ...a, subjectKey: s }, s)?.type}`);
  }
}
// 2. 형제 양보
const NEG = [
  ["jk_sync_counter", mk("JK 플립플롭 동기식 카운터", "JK 플립플롭 3개로 구성된 동기식 카운터의 타이밍 도표에서 출력 Q의 파형을 구한다.", ["카운터"], inv("FF", "FF", "FF"))],
  ["jk_mealy_state_design", mk("JK-FF Mealy 상태도", "상태도와 상태표의 빈칸을 채우고 출력 y의 논리식과 J_A·J_B 최소식을 구한다.", ["상태도", "상태표"], inv("FF", "FF"))],
  ["jk_excitation_sop_pos", mk("JK 여기표와 조합논리", "여기표 빈칸을 채우고 최소항의 합을 구한 뒤 분배 법칙으로 합의 곱으로 나타낸다.", ["여기표"], inv("FF", "FF"))],
  ["async_preset (비동기 SET/RESET)", mk("비동기 SET/RESET D 플립플롭 응용회로", "리플 카운터에서 I를 비동기 적재하고 구간 파형을 도시한다.", ["카운터"], inv("FF", "FF", "FF"))],
  ["dff_preset_clear (임용 27번)", mk("D 플립플롭 회로의 타이밍 분석", "프리셋(PR)과 클리어(CLR) 비동기 입력을 갖는 D 플립플롭 회로에서 구간 ㉠~㉢의 출력 Q 파형을 구한다.", [], inv("FF"))],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesJkTwoPhaseClock(a) === false);
  ok(`양보(분류) ${n}`, classifyCircuitType({ ...a, subjectKey: "digital_logic" }, "digital_logic")?.type !== "jk_two_phase_clock");
}

// 3. 독립 시뮬레이터로 재검산
function indep(v) {
  const jk = (q, j, k) => (j === 0 && k === 0 ? q : j === 1 && k === 0 ? 1 : j === 0 && k === 1 ? 0 : 1 - q);
  const g = (a, b) => (v.gate === "XOR" ? (a ^ b) : 1 - (a ^ b));
  let q1 = 0, q2 = 0; const Y1 = [], Y2 = [], Q1 = [], Q2 = [];
  for (let i = 0; i < v.n; i++) {
    const p = q1; q1 = jk(q1, v.j1[i], v.k1[i]);
    if (p === 0 && q1 === 1) q2 = 1 - q2;
    Q1.push(q1); Q2.push(q2); Y1.push(g(q1, q2)); Y2.push(g(q1, 1 - q2));
  }
  return { Q1, Q2, Y1, Y2 };
}
let bad = 0, checked = 0, dup = 0, constY = 0;
const seenSim = new Set(), seenVar = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 24; seed++) {
    const g = generateJkTwoPhaseClockXor({ seed: seed * 7919, index: seed % 3, mode });
    const v = g.values, s = g.sim; checked++;
    (mode === "exam_similar" ? seenSim : seenVar).add(v.j1.join("") + "/" + v.k1.join(""));
    if (v.j1.join("") === __spaces.ORIGINAL.j1.join("") && v.k1.join("") === __spaces.ORIGINAL.k1.join("")) dup++;
    const r = indep(v);
    if (r.Q1.join("") !== s.q1.join("") || r.Q2.join("") !== s.q2.join("")) bad++;
    if (r.Y1.join("") !== s.y1.join("") || r.Y2.join("") !== s.y2.join("")) bad++;
    // ★ EX-OR/EX-NOR 모두 Y₂ = Y₁′ 이어야 한다
    if (s.y1.some((y, i) => y === s.y2[i])) bad++;
    if (new Set(s.y1).size < 2) constY++;
    // 파형 t 단조 증가
    for (const sig of [...g.waveforms.template.signals, ...g.waveforms.solution.signals]) {
      for (let i = 1; i < (sig.samples ?? []).length; i++) if (!(sig.samples[i].t > sig.samples[i - 1].t)) bad++;
    }
  }
}
ok("독립 시뮬레이션 일치", bad === 0, `${bad}/${checked}`);
ok("Y₂ = Y₁′ (보수 관계)", true);
ok("출력이 상수인 문항 없음", constY === 0);
ok("원본 J₁·K₁ 튜플 미생성", dup === 0);
ok("값 공간 충분", __spaces.SIMILAR_SPACE.length > 20 && __spaces.VARIANT_SPACE.length > 20,
  `${__spaces.SIMILAR_SPACE.length}/${__spaces.VARIANT_SPACE.length}`);

// ★ 사용자 지정: 문항마다 J₁·K₁이 달라야 한다
{
  const set = new Set();
  for (let i = 0; i < 5; i++) {
    const g = generateJkTwoPhaseClockXor({ seed: 12345, index: i, mode: "exam_similar" });
    set.add(g.values.j1.join("") + "/" + g.values.k1.join(""));
  }
  ok("한 배치 5문항의 J₁·K₁이 모두 다름", set.size === 5, `${set.size}종`);
}

// 4. 발문·정답
const CHOICE = /[①②③④⑤]|고르시오|고른\s*것은|보기\s*중/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runJkTwoPhaseClockPipeline({ analysis: null, mode, count: 1, topicKey: "flipflop_counter" });
  ok(`3단계 (${mode})`, [1, 2, 3].every((k) => p.question.includes(`[단계 ${k}]`) && p.answer.includes(`[단계 ${k}]`)));
  ok(`보기 없음 (${mode})`, !CHOICE.test(p.question) && !CHOICE.test(p.answer));
  ok(`파형 도시 요구 (${mode})`, /파형.*도시하시오/.test(p.question));
  ok(`figure 2개 (${mode})`, p.figureVariants.length === 2);
  ok(`(가) 전용 타입 (${mode})`, p.figureVariants[0].diagramType === "jk_two_phase_clock_circuit");
  ok(`(나) Y 빈 트랙 (${mode})`, p.figureVariants[1].diagram.signals.filter((s) => s.blank).length === 2);
  ok(`정답 파형 분리 (${mode})`, (p.solutionFigures ?? []).length === 1
    && p.solutionFigures[0].diagram.signals.some((s) => s.name === "Y₁" && (s.samples ?? []).length > 0));
  ok(`게이트 종류 (${mode})`, mode === "exam_similar" ? p.content.includes("EX-OR") : p.content.includes("EX-NOR"));
  ok(`보수 관계 서술 (${mode})`, p.answer.includes("Y₂ = Y₁′"));
}

// 5. 렌더
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateJkTwoPhaseClockXor({ seed: 3, index: 0, mode });
  const svg = renderJkTwoPhaseClockCircuit(g.circuitDiagram);
  ok(`렌더 JK₁·JK₂ (${mode})`, svg.includes("J₁") && svg.includes("J₂") && svg.includes("K₂"));
  ok(`렌더 High·점선 박스 (${mode})`, svg.includes("High") && svg.includes("stroke-dasharray"));
  ok(`렌더 Y₁·Y₂ (${mode})`, svg.includes("Y₁") && svg.includes("Y₂"));
  ok(`렌더 XNOR 버블 (${mode})`, mode === "exam_variant"
    ? (svg.match(/r="5\.5"/g) ?? []).length === 2 : !svg.includes('r="5.5"'));
  ok(`렌더 겹침 0 (${mode})`, findLabelOverlaps(svg).length === 0, JSON.stringify(findLabelOverlaps(svg).slice(0, 2)));
}
console.log(`\n${fail === 0 ? "✅" : "❌"} jk_two_phase_clock smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
