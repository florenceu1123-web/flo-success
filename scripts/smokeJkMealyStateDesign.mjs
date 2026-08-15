/**
 * JK-FF 2개 Mealy 상태도 → 상태표 빈칸 → y·J/K 최소식 (임용 9번 디지털) 정적 스모크.
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeJkMealyStateDesign.mjs
 */
import { detectJkMealyStateDesign } from "../lib/pipeline/runJkMealyStateDesignPipeline.ts";
import { detectJkExcitationSopPos } from "../lib/pipeline/runJkExcitationSopPosPipeline.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  generateJkMealyStateDesign,
  __originalJkMealyForVerify,
  __jkMealyPoolSize,
} from "../lib/generation/topologies/jkMealyStateDesign.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [], componentInventory: [], ...o });

console.log("\n[1] 감지 — 원본 표현 + 변형");
const positives = [
  ["원본 발문", A({
    topic: "J-K 플립플롭 순서논리회로의 상태도",
    interpretation: "출력 A를 갖는 J-K 플립플롭과 출력 B를 갖는 J-K 플립플롭으로 구성된 순서논리회로의 상태도와 상태표에서 빈칸을 구하고, 입력 x에 대한 출력 y의 논리식과 J_A, J_B의 최소화된 논리식을 구한다.",
    relatedConcepts: ["J-K 플립플롭", "상태도", "상태표", "카르노맵"],
  })],
  ["FF 종류를 흘린 회차", A({
    topic: "순서논리회로 상태도 해석",
    interpretation: "상태표의 빈칸을 채우고 출력 y의 논리식을 구한 뒤 J_A와 J_B의 최소화된 식을 구한다.",
  })],
  ["Mealy 표기", A({
    topic: "순서논리회로",
    interpretation: "상태도의 간선은 x/y로 표기된 Mealy 형이다. 상태표를 완성하고 K_A, K_B를 구한다.",
  })],
];
for (const [n, a] of positives) ok(`감지 ${n}`, detectJkMealyStateDesign(a) === true);

console.log("\n[2] 형제 미탈취 (양보)");
const negatives = [
  ["JK 여기표 + SOP→POS (2025 전기 A-8)", A({
    topic: "JK 플립플롭 여기표와 불함수",
    interpretation: "상태 여기표에서 J_A, K_A를 구하고 간략화된 최소항의 합을 분배 법칙으로 합의 곱으로 바꾼다.",
  })],
  ["T-FF 입력 X 상태기계 (임용 12번)", A({
    topic: "상태도와 순서 논리 회로 설계",
    interpretation: "상태 변수 Q_A, Q_B와 입력 X를 갖는 상태도에서 상태표와 카르노맵으로 T 플립플롭 입력 T_A, T_B를 구한다. 출력 y도 표기된다.",
  })],
  ["시퀀스 검출기", A({
    topic: "시퀀스 검출기 설계",
    interpretation: "입력 x에 대한 출력 y를 갖는 시퀀스 검출기의 상태도를 그리고 상태표를 작성한다. J-K 플립플롭을 사용한다.",
  })],
  ["JK 동기식 카운터 + 파형", A({
    topic: "JK 카운터",
    interpretation: "J-K 플립플롭 3개로 구성된 카운터의 타이밍 도표와 상태도에서 순환하지 않는 상태를 구한다.",
  })],
  ["D-FF 자율 상태도 (임용 9번 정보)", A({
    topic: "상태도와 상태표 분석",
    interpretation: "입력 없는 자율 상태도에서 D 플립플롭 입력 D_A, D_B를 구하고 게이트로 구현한다.",
  })],
];
for (const [n, a] of negatives) ok(`양보 ${n}`, detectJkMealyStateDesign(a) === false);

console.log("\n[3] 분류기 — 전용 타입 + 형제 회귀");
for (const subj of ["digital_logic", "electronics"]) {
  const cls = classifyCircuitType(positives[0][1], subj);
  ok(`[${subj}] → jk_mealy_state_design`, cls.type === "jk_mealy_state_design", `got ${cls.type}`);
}
ok("형제(JK 여기표) 감지기는 그대로 발화", detectJkExcitationSopPos(negatives[0][1]) === true);
ok("형제 감지기가 내 원본을 안 가져감", detectJkExcitationSopPos(positives[0][1]) === false);

console.log("\n[4] 원본 동작 (x=0: 00→11→10→01 순환, x=1: 유지, y=1 ⇔ x=1 ∧ A=B)");
{
  const o = __originalJkMealyForVerify();
  ok("㉠~㉥ = 0 1 1 0 0 0", o.answer.blanks.join(" ") === "0 1 1 0 0 0", o.answer.blanks.join(" "));
  ok("y = A'B'x + ABx", o.answer.yExpr === "A'B'x + ABx", o.answer.yExpr);
  ok("J_A = B'x'", o.answer.jaExpr === "B'x'", o.answer.jaExpr);
  ok("J_B = x'", o.answer.jbExpr === "x'", o.answer.jbExpr);
  ok("상태도 간선 8개(전이 4 + 자기루프 4)", o.stateDiagram.edges.length === 8);
  ok("상태표 4행·출력 6열", o.stateTable.rows.length === 4 && o.stateTable.outputLabels.length === 6);
  ok("빈칸 행이 ㉠~㉥", o.stateTable.rows.some((r) => r.outputs.join("") === "㉠㉡㉢㉣㉤㉥"));
}

console.log("\n[5] 생성물 독립 재검산 (24개)");
{
  let bad = 0, origHit = 0;
  const seen = new Set();
  const AB = (s) => [(s >> 1) & 1, s & 1];
  for (let i = 0; i < 24; i++) {
    const mode = i % 2 ? "exam_variant" : "exam_similar";
    const g = generateJkMealyStateDesign({ seed: 500 + i * 31, mode });
    const v = g.values, a = g.answer;
    // 전이·출력 재구성
    const next = (s, x) => (x === 1 ? s : v.cycle[(v.cycle.indexOf(s) + 1) % 4]);
    const out = (s, x) => (x === 1 && v.outStates.includes(s) ? 1 : 0);
    // 빈칸 값 재검산
    const br = v.blankRow;
    const want = [...AB(next(br, 0)), ...AB(next(br, 1)), out(br, 0), out(br, 1)].map(String);
    if (want.join(" ") !== a.blanks.join(" ")) bad++;
    // 논리식 재검산 — 식을 진리표로 평가해 원래 함수와 일치하는지 본다.
    const evalSop = (expr, A_, B_, x_) => {
      if (expr === "0") return 0;
      if (expr === "1") return 1;
      return expr.split("+").some((term) => {
        const t = term.trim();
        const lits = t.match(/[ABx]'?/g) ?? [];
        return lits.every((l) => {
          const val = l[0] === "A" ? A_ : l[0] === "B" ? B_ : x_;
          return l.endsWith("'") ? val === 0 : val === 1;
        });
      }) ? 1 : 0;
    };
    for (const s of [0, 1, 2, 3]) {
      const [A_, B_] = AB(s);
      for (const x of [0, 1]) {
        if (evalSop(a.yExpr, A_, B_, x) !== out(s, x)) bad++;
        const [nA, nB] = AB(next(s, x));
        // J/K 여기 — 정의된 행에서만 검사(무관항은 자유)
        if (A_ === 0 && evalSop(a.jaExpr, A_, B_, x) !== nA) bad++;
        if (A_ === 1 && evalSop(a.kaExpr, A_, B_, x) !== 1 - nA) bad++;
        if (B_ === 0 && evalSop(a.jbExpr, A_, B_, x) !== nB) bad++;
        if (B_ === 1 && evalSop(a.kbExpr, A_, B_, x) !== 1 - nB) bad++;
      }
    }
    if (v.cycle.join() === "0,3,2,1" && v.outStates.join() === "0,3" && v.blankRow === 2) origHit++;
    seen.add(`${v.cycle.join("")}-${v.outStates.join("")}-${v.blankRow}`);
  }
  ok("24개 모두 빈칸·y·J/K 재검산 일치", bad === 0, `bad=${bad}`);
  ok("원본 튜플 미생성", origHit === 0);
  ok("서로 다른 상태기계가 생성됨", seen.size >= 8, `distinct=${seen.size}`);
  ok("생성 풀이 충분", __jkMealyPoolSize() >= 20, `pool=${__jkMealyPoolSize()}`);
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
