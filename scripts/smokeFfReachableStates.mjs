// 임용 24번 — 동기식 순서논리회로 Q_A·Q_B **파형 도시** (ff_reachable_states) ★결정론 archetype★
//   사용자 지정: D f/f 하나를 T f/f으로 · 게이트 종류 변경 · 초기상태와 X 입력열을 문제마다 다르게.
//   ★ 재검산은 생성기 결과를 다시 쓰지 않고 **독립 시뮬레이터**로 대조한다.
import {
  __spaces, generateFfReachableStates, matchesFfReachableStates, gateEval, stepOf, reachableFrom,
} from "../lib/generation/topologies/ffReachableStates.ts";
import {
  detectFfReachableStates, runFfReachableStatesPipeline,
} from "../lib/pipeline/runFfReachableStatesPipeline.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: [], tags: [], learningObjective: {} });

console.log("\n[1] 원본 재현 — D+D · AND · X̄ · 초기(0,0)");
{
  // 원본 구조를 독립 계산으로: D_A=X, D_B = X̄·Q_A
  const next = (x, qa) => [x, (1 - x) & qa];
  const seen = new Set(["00"]); const q = [[0, 0]];
  while (q.length) { const [a, b] = q.shift();
    for (const x of [0, 1]) { const [na, nb] = next(x, a, b); const k = `${na}${nb}`;
      if (!seen.has(k)) { seen.add(k); q.push([na, nb]); } } }
  const r = [...seen].sort();
  ok("도달 가능 = (0,0)(0,1)(1,0)", r.join(",") === "00,01,10", r.join(","));
  ok("★ (1,1)은 도달 불가 → 정답 ②(ㄱ,ㄴ,ㄷ)", !r.includes("11"));
}

console.log("\n[2] 게이트 진리값");
for (const [g, exp] of [["AND", [0, 0, 0, 1]], ["OR", [0, 1, 1, 1]], ["NAND", [1, 1, 1, 0]],
  ["NOR", [1, 0, 0, 0]], ["XOR", [0, 1, 1, 0]], ["XNOR", [1, 0, 0, 1]]]) {
  const got = [gateEval(g, 0, 0), gateEval(g, 0, 1), gateEval(g, 1, 0), gateEval(g, 1, 1)];
  ok(`${g} 진리값`, got.join() === exp.join(), got.join());
}

console.log("\n[3] 라우팅");
const POS = [
  ["실측형", mk("두 개의 D플립플롭으로 구성된 동기식 순서논리회로",
    "입력 X가 계속해서 임의로 변할 때 발생할 수 있는 Q_A, Q_B 상태를 보기에서 모두 고르는 문제이다.", ["플립플롭", "순서논리"])],
  ["짧은 요약", mk("동기식 순서논리회로", "플립플롭 2개로 구성된 회로에서 발생 가능한 상태를 모두 고른다.", [])],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesFfReachableStates(a) === true);
  ok(`안전망: ${n}`, detectFfReachableStates(a) === true);
}
const NEG = [
  ["상태도 설계형", mk("D 플립플롭 상태도 설계", "상태도와 상태표로부터 D 입력의 불 함수를 구하고 게이트로 구현한다.", [])],
  ["여기표(JK)", mk("JK 플립플롭 여기표", "상태 여기표의 빈칸을 채우고 카르노맵으로 최소항의 합을 구한다.", [])],
  ["카운터", mk("동기식 카운터", "JK 플립플롭 3개로 구성된 카운터의 상태를 구한다.", [])],
  ["시퀀스 검출기", mk("시퀀스 검출기", "입력 시퀀스를 검출하는 순서논리회로의 상태를 설계한다.", [])],
  ["MUX 구현", mk("SR 플립플롭과 MUX", "멀티플렉서로 플립플롭 입력을 구현한다.", [])],
  ["비동기 PR/CLR", mk("비동기 프리셋 D 플립플롭", "PR·CLR로 구간별 출력 Q 파형을 도시한다.", [])],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesFfReachableStates(a) === false);
  ok(`안전망 미발화: ${n}`, detectFfReachableStates(a) === false);
}

console.log("\n[4] 값 공간 — 사용자 지정 3가지가 실제로 반영됐는가");
const { SPACE, SIMILAR_SPACE, VARIANT_SPACE, GATES } = __spaces;
ok("풀이 충분", SPACE.length >= 50, String(SPACE.length));
ok("★ 항상 한쪽이 T 플립플롭", SPACE.every((v) => v.tffAt === "A" || v.tffAt === "B"));
ok("★ 게이트 종류가 여러 가지", new Set(SPACE.map((v) => v.gate)).size >= 4,
  [...new Set(SPACE.map((v) => v.gate))].join(","));
ok("★ 초기 상태가 여러 가지", new Set(SPACE.map((v) => v.init.join(""))).size >= 2,
  [...new Set(SPACE.map((v) => v.init.join("")))].join(","));
ok("★ X 입력열이 여러 가지", new Set(SPACE.map((v) => v.xSeq.join(""))).size >= 8);
ok("유사·변형 비중첩", (() => {
  const key = (v) => `${v.tffAt}/${v.gate}/${v.invertX}/${v.init.join("")}/${v.xSeq.join("")}`;
  const s = new Set(SIMILAR_SPACE.map(key));
  return VARIANT_SPACE.every((v) => !s.has(key(v)));
})());
ok("게이트 목록 6종", GATES.length === 6);

console.log("\n[5] 생성물 — 독립 시뮬레이션으로 재검산");
let n5 = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let s = 0; s < 12; s++) {
    for (let i = 0; i < 2; i++) {
      const g = generateFfReachableStates({ seed: s * 7919, index: i, mode });
      const v = g.values; n5++;
      // 독립 시뮬레이터 (생성기 steps를 쓰지 않는다)
      let qa = v.init[0], qb = v.init[1];
      const qaTrack = [qa], qbTrack = [qb];
      for (const x of v.xSeq) {
        const inA = x;
        const inB = gateEval(v.gate, v.invertX ? 1 - x : x, qa);
        const nqa = v.tffAt === "A" ? (qa ^ inA) : inA;
        const nqb = v.tffAt === "B" ? (qb ^ inB) : inB;
        qa = nqa; qb = nqb; qaTrack.push(qa); qbTrack.push(qb);
      }
      ok(`Q_A 추적 일치 (${mode}/${s}/${i})`, g.steps.map((t) => t.qa).join("") === qaTrack.join(""),
        `${g.steps.map((t) => t.qa).join("")} vs ${qaTrack.join("")}`);
      ok(`Q_B 추적 일치 (${mode}/${s}/${i})`, g.steps.map((t) => t.qb).join("") === qbTrack.join(""));
      ok(`도달 집합 일치 (${mode}/${s}/${i})`, reachableFrom(v).join(",") === g.reachable.join(","));
      ok(`도달 2~3가지 (${mode}/${s}/${i})`, g.reachable.length >= 2 && g.reachable.length <= 3);
      ok(`★ Q_A가 최소 1회 변한다 (${mode}/${s}/${i})`, new Set(qaTrack).size > 1);
      ok(`★ Q_B가 최소 1회 변한다 (${mode}/${s}/${i})`, new Set(qbTrack).size > 1);
      ok(`stepOf와 일관 (${mode}/${s}/${i})`, (() => {
        const r = stepOf(v, v.init[0], v.init[1], v.xSeq[0]);
        return r.nqa === qaTrack[1] && r.nqb === qbTrack[1];
      })());
      // 회로 figure에 T-FF가 실제로 들어갔는가
      const kinds = g.diagram.gates.filter((x) => x.type === "DFF" || x.type === "TFF").map((x) => x.type);
      ok(`figure에 D-FF·T-FF 하나씩 (${mode}/${s}/${i})`,
        kinds.length === 2 && kinds.includes("DFF") && kinds.includes("TFF"), kinds.join(","));
      ok(`figure 게이트 종류 일치 (${mode}/${s}/${i})`,
        g.diagram.gates.some((x) => x.type === v.gate));
    }
  }
}
ok(`생성물 ${n5}개 검사`, n5 === 48);

console.log("\n[6] 파이프라인 산출물 — 3단계 + 파형 빈 트랙");
const probs = [
  ...(await runFfReachableStatesPipeline({ analysis: null, mode: "exam_similar", count: 3 })),
  ...(await runFfReachableStatesPipeline({ analysis: null, mode: "exam_variant", count: 3 })),
];
ok("6문항 생성", probs.length === 6);
for (const p of probs) {
  ok("발문 3단계", new Set(p.question.match(/\[단계 [123]\]/g) ?? []).size === 3);
  ok("★ [단계 3]은 파형 도시", /파형을 도시/.test(p.question));
  ok("객관식 보기 없음", !/①|②|③|④|⑤/.test(`${p.content}\n${p.question}`));
  ok("figure 2개(회로+파형)",
    (p.figureVariants ?? []).map((f) => f.diagramType).join(",") === "logic_network,waveform");
  const wave = p.figureVariants[1].diagram;
  const qTracks = wave.signals.filter((s) => s.name === "Q_A" || s.name === "Q_B");
  ok("★ 문제 파형의 Q 트랙은 비어 있다", qTracks.length === 2 && qTracks.every((s) => s.blank === true));
  ok("CLK·X는 값이 주어진다",
    wave.signals.filter((s) => s.name === "CLK" || s.name === "X").every((s) => s.samples.length > 0));
  // 정답 파형은 solutionFigures로
  const sol = (p.solutionFigures ?? [])[0];
  ok("정답 파형 분리", Boolean(sol) && sol.diagramType === "waveform");
  const solQ = sol.diagram.signals.filter((s) => s.name === "Q_A" || s.name === "Q_B");
  ok("정답 파형의 Q 트랙은 채워져 있다", solQ.every((s) => !s.blank && s.samples.length > 0));
  // ★ 시간축 단조 증가 (waveform_time_not_monotonic 방지)
  for (const s of [...wave.signals, ...sol.diagram.signals]) {
    ok(`t 단조 증가 (${s.name})`, s.samples.every((x, k) => k === 0 || x.t > s.samples[k - 1].t));
  }
}
ok("유사 3문항이 서로 다름", new Set(probs.slice(0, 3).map((p) => p.answer)).size === 3);
ok("변형 3문항이 서로 다름", new Set(probs.slice(3).map((p) => p.answer)).size === 3);
ok("★ 문항마다 X 입력열이 다르다",
  new Set(probs.map((p) => (p.answer.match(/X = ([\d, ]+)/) ?? [])[1])).size >= 5);

console.log(`\n=== FF REACHABLE STATES ARCHETYPE: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
