// JK-FF 2개 상태 여기표 + 조합논리 J_A (SOP→POS) — 2025 전기 A-8 전용 archetype 정적 검증 (API 없음)
//
//   사용자 신고: "이게 원본인데 다른 문제가 생성돼" → 실측 화면은 **D 플립플롭 + 2×1 MUX 구현 회로**.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeJkExcitationSopPos.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectJkExcitationSopPos } from "../lib/pipeline/runJkExcitationSopPosPipeline.ts";
import { generateJkExcitationSopPos } from "../lib/generation/topologies/jkExcitationSopPos.ts";
import { renderJkExcitationCircuit } from "../lib/renderers/jkExcitationCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [] });

console.log("\n[1] 라우팅 — ★ 실측 Vision 요약 (불함수·SOP 언급 없음)");
const REAL = mk(
  "순서 논리 회로 분석",
  "주어진 순서 논리 회로의 상태 여기를 통해 플립플롭 입력을 구하고, 이를 바탕으로 다음 상태를 결정하는 문제입니다. 상태 여기를 통해 각 플립플롭의 입력을 구한 후, 이를 이용해 다음 상태를 계산합니다. 또한, 회로의 동작을 이해하기 위해 상태 전이표를 작성합니다.",
  ["순서 논리 회로", "플립플롭", "상태 전이표", "J-K 플립플롭", "상태 천이", "논리 회로 설계", "상태 다이어그램"],
);
for (const subject of ["digital_logic", "electronics", "circuit_theory"]) {
  const r = classifyCircuitType(REAL, subject);
  ok(`실측 요약 → jk_excitation_sop_pos (subject=${subject})`, r.type === "jk_excitation_sop_pos", `got ${r.type}`);
}
ok("실측 요약 → detect 안전망 발화", detectJkExcitationSopPos(REAL) === true);

const VARIANTS = [
  ["여기표·불함수 모두 서술", mk("JK 플립플롭 순서 논리 회로 설계", "상태 여기표에서 J-K 플립플롭의 입력을 구하고, 조합 논리 회로의 불 함수 J_A를 간략화된 최소항의 합으로 구한 뒤 분배 법칙으로 합의 곱으로 변환한다.", ["여기표", "불 함수", "최소항의 합", "분배 법칙"])],
  ["'여기표' 단독 + 회로 완성", mk("순서 논리 회로의 여기표", "J-K 플립플롭 2개로 구성된 순서 논리 회로의 여기표를 이용해 조합 논리 회로를 완성하는 문제이다.", ["여기표", "J-K 플립플롭", "조합 논리 회로"])],
];
for (const [name, a] of VARIANTS) {
  ok(`${name} → 전용 archetype`, classifyCircuitType(a, "digital_logic").type === "jk_excitation_sop_pos",
    `got ${classifyCircuitType(a, "digital_logic").type}`);
}

console.log("\n[2] 형제 회귀 — 다른 디지털 archetype을 뺏지 않는다");
const SIBLINGS = [
  ["임용9 전자 JK 상태도(출력 y)", mk("J-K 플립플롭 상태도와 상태표", "J-K 플립플롭 2개의 상태도와 상태표에서 빈칸을 채우고 출력 y의 논리식과 J_A·J_B의 최소 논리식을 구한다.", ["상태도", "출력 y", "J-K 플립플롭"])],
  ["D-FF + 2×1 MUX 순차회로", mk("D 플립플롭과 2×1 MUX 순서 회로", "D 플립플롭 2개와 2×1 MUX로 구성된 자율 순환 순서 회로의 상태표와 MUX 입력을 구한다.", ["D 플립플롭", "MUX", "상태표"])],
  ["JK 동기식 카운터", mk("JK 플립플롭 동기식 카운터", "J-K 플립플롭 3개로 구성된 동기식 카운터의 타이밍 도표와 상태 변화를 구한다.", ["카운터", "J-K 플립플롭", "타이밍"])],
];
for (const [name, a] of SIBLINGS) {
  const got = classifyCircuitType(a, "digital_logic").type;
  ok(`${name} → 뺏기지 않음 (got ${got})`, got !== "jk_excitation_sop_pos");
  ok(`${name} → detect 미발화`, detectJkExcitationSopPos(a) === false);
}

console.log("\n[3] 여기표·정답 자체 검산 (양 모드 × 10 seed)");
const excite = (q, qn) => (q === 0 ? (qn === 0 ? ["0", "×"] : ["1", "×"]) : (qn === 0 ? ["×", "1"] : ["×", "0"]));
// SOP/POS 문자열을 3변수(Q_A,Q_B,x) 진리값으로 평가 — 두 식이 같은 함수인지 확인
function evalExpr(expr, isPos, m) {
  const val = { "Q_A": (m >> 2) & 1, "Q_B": (m >> 1) & 1, "x": m & 1 };
  // ★ sopToString은 리터럴을 구분자 없이 붙여 쓴다("Q_B'x'") → 정규식으로 토큰화한다.
  const litsOf = (s) => (s.match(/Q_A'?|Q_B'?|x'?/g) ?? []).map((tok) => {
    const neg = tok.endsWith("'");
    return neg ? 1 - val[tok.slice(0, -1)] : val[tok];
  });
  if (isPos) {
    // "(Q_B + x')·(Q_B' + x)" → 각 괄호가 하나의 합, 전체는 곱
    const sums = expr.split("·").map((s) => s.replace(/[()]/g, "").trim()).filter(Boolean);
    return sums.every((sum) => sum.split("+").some((l) => litsOf(l)[0] === 1)) ? 1 : 0;
  }
  // "Q_B'x' + Q_Bx" → 각 항이 곱, 전체는 합
  const terms = expr.split("+").map((s) => s.trim()).filter(Boolean);
  return terms.some((t) => litsOf(t).every((v) => v === 1)) ? 1 : 0;
}
let bad = 0, seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 10; seed++) {
    const g = generateJkExcitationSopPos({ seed, mode });
    const { nextA } = g.values, a = g.answer, rows = g.tableDiagram.rows;
    let rowsOk = true;
    for (let i = 0; i < 8; i++) {
      const qa = (i >> 2) & 1, qb = (i >> 1) & 1;
      const [ja, ka] = excite(qa, nextA[i]);
      const nextCell = `${nextA[i]} ${qb ^ 1}`;
      const jkCell = rows[i].outputs[0], nxCell = rows[i].outputs[3];
      // 빈칸(㉠~㉣) 자리는 마커, 나머지는 계산값과 일치해야
      if (!/[㉠-㉣]/.test(String(jkCell)) && String(jkCell) !== `${ja} ${ka}`) rowsOk = false;
      if (!/[㉠-㉣]/.test(String(nxCell)) && String(nxCell) !== nextCell) rowsOk = false;
      if (String(rows[i].outputs[1]) !== "1" || String(rows[i].outputs[2]) !== "1") rowsOk = false;  // J_B=K_B=HIGH
    }
    // 빈칸 정답이 실제 계산값과 일치
    const [ja6, ka6] = excite(1, nextA[6]), [ja7, ka7] = excite(1, nextA[7]);
    const b3 = `${nextA[2]} ${((2 >> 1) & 1) ^ 1}`, b4 = `${nextA[3]} ${((3 >> 1) & 1) ^ 1}`;
    const blanksExact = a.blank1 === `${ja6} ${ka6}` && a.blank2 === `${ja7} ${ka7}` && a.blank3 === b3 && a.blank4 === b4;
    // SOP와 POS가 같은 함수인지 (무관 항 제외 비교)
    let fnOk = true;
    const tgtIdx = g.values.target === "J_A" ? 0 : 1;   // 유사=J_A / 변형=K_A
    for (let m = 0; m < 8; m++) {
      const qa = (m >> 2) & 1;
      const j = excite(qa, nextA[m])[tgtIdx];
      if (j === "×") continue;                     // 무관 항은 자유
      const want = j === "1" ? 1 : 0;
      if (evalExpr(a.sop, false, m) !== want) fnOk = false;
      if (evalExpr(a.pos, true, m) !== want) fnOk = false;
    }
    const quality = g.values.sopCount >= 2 && g.values.posCount >= 2;
    if (!(rowsOk && blanksExact && fnOk && quality)) {
      bad++; console.log(`     ✗ ${mode} seed=${seed}`, { nextA: nextA.join(""), a, rowsOk, blanksExact, fnOk, quality });
    }
    // ★ 문제 인스턴스 기준 다양성: 목표 함수 자체는 구조상 XOR/XNOR 두 형태뿐이다
    //   (J_A는 Q_A=0인 4행에서만, K_A는 Q_A=1인 4행에서만 정해져 실질 2변수 함수 → 2항 최소 SOP는 그 둘뿐).
    //   따라서 다양성은 여기표(반대편 열)·빈칸 정답 조합으로 확보된다.
    seen.add(`${a.blank1}|${a.blank2}|${a.blank3}|${a.blank4}|${a.sop}`);
  }
}
ok("20개 생성물: 여기표·빈칸 정답·SOP≡POS·품질 모두 일치", bad === 0, `${bad}건`);
ok("문제 인스턴스 다양성 5종 이상", seen.size >= 5, `${seen.size}종`);
{
  // 목표 함수는 항상 2항 XOR/XNOR 형태여야 [단계 3](분배법칙 → 합의 곱)이 의미 있다.
  const forms = new Set();
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let seed = 1; seed <= 6; seed++) forms.add(generateJkExcitationSopPos({ seed, mode }).answer.sop);
  }
  ok("목표 함수가 2항(XOR/XNOR) 형태", [...forms].every((f) => f.split("+").length === 2), [...forms].join(" / "));
}

console.log("\n[4] figure 구조 + 렌더");
{
  const g = generateJkExcitationSopPos({ seed: 5, mode: "exam_similar" });
  ok("여기표 8행", g.tableDiagram.rows.length === 8);
  ok("빈칸 마커 ㉠~㉣ 4개", ["㉠", "㉡", "㉢", "㉣"].every((mk2) => JSON.stringify(g.tableDiagram.rows).includes(mk2)));
  ok("출력 컬럼 라벨 (J_A K_A·J_B·K_B·다음 상태)", (g.tableDiagram.outputLabels ?? []).length === 4);
  const svg = renderJkExcitationCircuit(g.circuitDiagram);
  ok("회로 SVG 생성", svg.startsWith("<svg"));
  for (const label of ["㉲", "HIGH", "CLK", "J_A", "K_A", "Q_A", "Q_B", "FF_A", "FF_B"]) {
    ok(`회로에 ${label} 표기`, svg.includes(label));
  }
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
