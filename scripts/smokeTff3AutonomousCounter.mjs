// T-FF 3개 자율 카운터 (상태도 → T_B 최소 SOP → 2입력 게이트 2개, 임용 11번) 전용 archetype 정적 검증 (API 없음)
//
//   사용자 신고: "유사문제 생성이 안돼" → 실측 로그는 `dispatch=tff_state_table_blank_pipeline`,
//   `totalIssues=0`(조용한 오매치). 그쪽은 T-FF **2개 + 외부 입력 C**라 구조가 다르다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTff3AutonomousCounter.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectTff3AutonomousCounter } from "../lib/pipeline/runTff3AutonomousCounterPipeline.ts";
import { generateTff3AutonomousCounter } from "../lib/generation/topologies/tff3AutonomousCounter.ts";
import { renderTff3CounterCircuit } from "../lib/renderers/tff3CounterCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});

// ─────────────────────────────────────────────────────────────────────
console.log("\n[1] 라우팅 — 원본(임용 11번) 요약");
// ★★ 원본 지문을 그대로 옮긴 케이스 (2026-08-01 사용자가 원본 이미지 제공).
//   Vision 요약이 지문 표현을 거의 그대로 옮기는 회차를 대표한다.
const REAL_PAPER = mk(
  "상태도를 이용한 T 플립플롭 논리 회로 설계",
  "상위부터 하위 순(C B A)으로 상태가 표시된 상태도가 주어지고, 표와 그림은 T 플립플롭을 이용하여 이 상태도대로 동작하는 논리 회로를 설계하는 과정이다. 상태도를 이용하여 표의 ㉠, ㉡을 순서대로 작성하고, T 플립플롭의 입력 T_B에 대한 불 함수를 간략화된 최소항의 합으로 구한 뒤, ㉢에 해당하는 논리 회로를 2입력 NAND 게이트 2개만으로 구성하여 그린다.",
  ["상태도", "T 플립플롭", "불 함수", "최소항의 합", "NAND 게이트", "순서 논리 회로"],
);
for (const subject of ["digital_logic", "electronics", "circuit_theory"]) {
  const r = classifyCircuitType(REAL_PAPER, subject);
  ok(`★ 원본 지문 그대로 → tff3_autonomous_counter (subject=${subject})`, r.type === "tff3_autonomous_counter", `got ${r.type}`);
}
ok("★ 원본 지문 그대로 → detect 발화", detectTff3AutonomousCounter(REAL_PAPER) === true);

const REAL = mk(
  "T 플립플롭 3개를 이용한 동기식 카운터",
  "T 플립플롭 3개로 구성된 카운터의 상태도가 주어질 때 상태표의 빈칸 ㉠과 ㉡을 구하고, T_B를 최소화된 곱의 합으로 간략화한 뒤 이를 2입력 NAND 게이트 2개로 구현하여 회로의 ㉢을 도시하는 문제이다. 상태는 C, B, A의 순서로 표기하며 순환하지 않는 상태도 존재한다.",
  ["T 플립플롭", "동기식 카운터", "상태도", "여기표", "곱의 합", "NAND 게이트"],
);
for (const subject of ["digital_logic", "electronics", "circuit_theory"]) {
  const r = classifyCircuitType(REAL, subject);
  ok(`원본 요약 → tff3_autonomous_counter (subject=${subject})`, r.type === "tff3_autonomous_counter", `got ${r.type}`);
}
ok("원본 요약 → detect 발화", detectTff3AutonomousCounter(REAL) === true);

// Vision 요약이 흔들리는 회차들 — 구조 신호(3비트·T_C·상태도)만으로도 잡혀야 한다.
const WOBBLE = [
  ["'3비트' 표현 + NAND 미언급", mk(
    "동기식 카운터의 상태 해석",
    "T 플립플롭으로 구성된 3비트 동기식 카운터의 상태도로부터 상태표를 완성하고 플립플롭 입력 T_B의 최소 논리식을 구한다.",
    ["T 플립플롭", "상태도", "논리식"],
  )],
  ["요약이 짧고 인벤토리로만 3개", mk(
    "T 플립플롭 카운터",
    "주어진 상태도를 보고 상태표의 ㉠, ㉡을 채우고 ㉢에 해당하는 논리 회로를 도시한다.",
    ["T 플립플롭", "상태도"],
    [{ id: "c0", type: "TFF" }, { id: "c1", type: "TFF" }, { id: "c2", type: "TFF" }],
  )],
  // ★★ 실측 재신고(2026-08-01) 회귀 — 아래 두 회차는 "3개 신호 AND 상태도"를 둘 다 요구하던
  //    초판 조건에서 **발화하지 않아** 임용 7번 경로로 샜다. 하나만 있어도 잡혀야 한다.
  ["상태도를 안 쓰고 '상태표'만 말하는 회차", mk(
    "T 플립플롭을 이용한 카운터의 상태 해석",
    "T 플립플롭 3개로 구성된 카운터의 상태표에서 ㉠과 ㉡을 구하고, T_B의 최소화된 불 함수를 구한 뒤 2입력 NAND 게이트 2개로 ㉢을 구현한다.",
    ["T 플립플롭", "상태표", "불 함수", "NAND"],
  )],
  ["FF 개수를 안 쓰는 회차 (상태도만)", mk(
    "T 플립플롭 동기식 카운터",
    "T 플립플롭으로 구성된 카운터의 상태도가 주어질 때 상태표의 빈칸 ㉠, ㉡을 구하고 ㉢에 들어갈 논리 회로를 최소화하여 도시한다.",
    ["T 플립플롭", "상태도", "카운터"],
  )],
  ["상태를 C·B·A 순으로 표기한다는 서술만", mk(
    "T 플립플롭 카운터의 상태 해석",
    "T 플립플롭으로 구성된 카운터에서 상태를 C, B, A 순으로 표기할 때 상태표를 완성하고 T_B를 곱의 합으로 간략화한다.",
    ["T 플립플롭", "상태표"],
  )],
];
for (const [name, a] of WOBBLE) {
  const got = classifyCircuitType(a, "digital_logic").type;
  ok(`${name} → tff3_autonomous_counter`, got === "tff3_autonomous_counter", `got ${got}`);
  ok(`${name} → detect 발화`, detectTff3AutonomousCounter(a) === true);
}

// ─────────────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
const SIBLINGS = [
  ["임용7 T-FF 2개 + 외부 입력 C (tff_state_table_blank)", mk(
    "T 플립플롭 순서논리회로의 상태표",
    "T 플립플롭 2개(T_A, T_B)와 외부 입력 C로 구성된 순서논리회로에서 상태표의 빈칸 ㉠~㉧을 채우고 Q_A(t+1)·Q_B(t+1)의 카르노도를 작성하여 최소 SOP를 구한다.",
    ["T 플립플롭", "상태표", "카르노도"],
  ), "tff_state_table_blank"],
  ["임용9 mod-N 카운터 + 리셋", mk(
    "mod-7 동기식 카운터 설계",
    "T 플립플롭과 D 플립플롭을 사용하여 mod-7 동기식 카운터를 설계한다. 상태도에 따라 사용되지 않는 상태를 구하고, 초기 상태로 리셋하기 위한 논리 회로를 완성한다.",
    ["T 플립플롭", "D 플립플롭", "동기식 카운터", "상태도", "리셋 회로", "모듈러 카운터"],
  ), "mod_n_counter_reset"],
  ["JK 동기식 카운터 타이밍", mk(
    "JK 플립플롭 동기식 카운터",
    "J-K 플립플롭 3개로 구성된 동기식 카운터의 타이밍 도표와 상태 변화를 구한다.",
    ["카운터", "J-K 플립플롭", "타이밍"],
  ), null],
  // ★ 조건을 느슨하게 푼 뒤 임용 7번을 뺏지 않는지 — 요약 표현을 흔들어 여러 형태로 확인한다.
  ["임용7 — 요약이 '상태표' 없이 '순서논리회로'만", mk(
    "T 플립플롭 순서논리회로 해석",
    "T 플립플롭 A와 B 2개, 그리고 입력 C로 구성된 순서논리회로에서 T_A와 T_B의 입력식을 구하고, 표의 빈칸 ㉠~㉧을 채운 뒤 Q_A(t+1)·Q_B(t+1)의 카르노도로 최소화된 불 함수를 구한다.",
    ["T 플립플롭", "순서논리회로", "카르노도", "불 함수"],
  ), null],
  ["임용7 — FF 인벤토리 2개만 잡힌 회차", mk(
    "T 플립플롭 상태표 해석",
    "T 플립플롭 2개와 외부 입력 C로 구성된 회로의 상태표에서 ㉠~㉧을 구하고 최소화된 불 함수를 구한다.",
    ["T 플립플롭", "상태표"],
    [{ id: "c0", type: "TFF" }, { id: "c1", type: "TFF" }],
  ), null],
  ["시퀀스 검출기 '110'", mk(
    "시퀀스 검출기 설계",
    "입력 신호가 '110' 순서로 입력될 때 출력이 1이 되는 시퀀스 검출기를 설계한다. 상태 전이도와 상태표를 통해 상태 변화를 분석하고 D 플립플롭을 사용한다.",
    ["시퀀스 검출기", "D 플립플롭", "상태 전이도", "상태표"],
  ), "sequence_detector"],
];
for (const [name, a, want] of SIBLINGS) {
  const got = classifyCircuitType(a, "digital_logic").type;
  ok(`${name} → 뺏기지 않음 (got ${got})`, got !== "tff3_autonomous_counter");
  if (want) ok(`${name} → 기대 유형 ${want} 유지`, got === want, `got ${got}`);
  ok(`${name} → detect 미발화`, detectTff3AutonomousCounter(a) === false);
}

// ─────────────────────────────────────────────────────────────────────
console.log("\n[3] 물리·논리 자체 검산 (양 모드 × 12 seed)");

/** 리터럴 문자열("C" | "C'")을 상태 index에서 평가. index = C·4 + B·2 + A */
const litVal = (tok, i) => {
  const neg = tok.endsWith("'");
  const v = neg ? tok.slice(0, -1) : tok;
  const bit = v === "C" ? (i >> 2) & 1 : v === "B" ? (i >> 1) & 1 : i & 1;
  return neg ? 1 - bit : bit;
};
/** sopToString 출력("CA + B'")을 평가 — 항은 " + "로, 리터럴은 구분자 없이 붙어 있다. */
const evalSop = (sop, i) =>
  sop.split(" + ").some((term) => {
    const toks = term.match(/[CBA]'?/g) ?? [];
    return toks.length > 0 && toks.every((t) => litVal(t, i) === 1);
  }) ? 1 : 0;

const MODES = ["exam_similar", "exam_variant"];
const seenSignatures = new Set();
for (const mode of MODES) {
  let modeFail = 0;
  const note = [];
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateTff3AutonomousCounter({ seed, mode });
    const why = [];

    // (a) 게이트 종류가 모드 규약과 맞는가
    if (g.gateKind !== (mode === "exam_variant" ? "NOR" : "NAND")) why.push(`gateKind=${g.gateKind}`);

    // (b) 상태표 8행이 T = Q_n ⊕ Q_{n+1} 을 만족하는가 + 행이 index 순인가
    g.rows.forEach((r, i) => {
      const cur = (r.c << 2) | (r.b << 1) | r.a;
      if (cur !== i) why.push(`row${i} 순서`);
      if (r.tc !== (r.c ^ r.nc) || r.tb !== (r.b ^ r.nb) || r.ta !== (r.a ^ r.na)) why.push(`row${i} 여기식`);
      if (r.cur !== `${r.c}${r.b}${r.a}` || r.next !== `${r.nc}${r.nb}${r.na}`) why.push(`row${i} 표기`);
    });

    // (c) 상태도가 상태표와 일치하는가 — 사이클 연쇄 + 비순환 진입
    const nextOf = (s) => {
      const i = parseInt(s, 2);
      return g.rows[i].next;
    };
    g.cycle.forEach((s, k) => {
      if (nextOf(s) !== g.cycle[(k + 1) % g.cycle.length]) why.push(`사이클 ${s}`);
    });
    for (const nc of g.nonCyclic) {
      if (nextOf(nc.state) !== nc.next) why.push(`비순환 ${nc.state} 다음상태`);
      if (!g.cycle.includes(nc.next)) why.push(`비순환 ${nc.state} 진입대상`);
      if (g.cycle.includes(nc.state)) why.push(`비순환 ${nc.state}이 사이클에도 있음`);
    }
    if (g.cycle.length + g.nonCyclic.length !== 8) why.push("상태 8개 아님");
    if (new Set([...g.cycle, ...g.nonCyclic.map((x) => x.state)]).size !== 8) why.push("상태 중복");

    // (d) [단계 2] 최소 SOP가 T_B 열과 완전히 같은가 + 2항인가
    for (let i = 0; i < 8; i++) {
      if (evalSop(g.tbSop, i) !== g.rows[i].tb) why.push(`SOP 불일치 @${i}`);
    }
    if (g.tbSop.split(" + ").length !== 2) why.push(`SOP 항 수 ${g.tbSop.split(" + ").length}`);

    // (e) [단계 3] 2입력 게이트 **2개** 구현이 T_B 열과 같은가 (독립 검산)
    //     NAND: G₁=NAND(Y,Y)=Y′, G₂=NAND(X,G₁)=X′+Y   (앞 게이트를 인버터로 — 원본 형태)
    //     NOR : G₁=NOR(P,Q),     G₂=NOR(G₁,R)=(P+Q)·R′
    const ins = g.tbGate.inputs;
    if (g.gateKind === "NAND" && ins.length !== 2) why.push(`NAND 입력 개수 ${ins.length}`);
    if (g.gateKind === "NOR" && ins.length !== 3) why.push(`NOR 입력 개수 ${ins.length}`);
    for (let i = 0; i < 8; i++) {
      let g2;
      if (g.gateKind === "NAND") {
        const [X, Y] = ins;
        const g1 = 1 - (litVal(Y, i) & litVal(Y, i));          // 인버터로 쓴 NAND
        g2 = 1 - (litVal(X, i) & g1);
      } else {
        const [P, Q, R] = ins;
        const g1 = 1 - (litVal(P, i) | litVal(Q, i));
        g2 = 1 - (g1 | litVal(R, i));
      }
      if (g2 !== g.rows[i].tb) why.push(`게이트 불일치 @${i}`);
    }
    if (new Set(ins.map((t) => t.replace("'", ""))).size !== ins.length) why.push("게이트 입력 변수 중복");

    // (f) 빈칸 — ★ 원본은 **열 전체**가 빈칸이다. 두 열의 셀이 모두 비어 있고,
    //     정답 배열이 실제 열 값과 순서까지 같아야 한다.
    const b1 = g.blanks.blank1, b2 = g.blanks.blank2;
    g.stateTable.rows.forEach((r, k) => {
      if (r.outputs[1] !== "") why.push(`Bₙ₊₁ 열 ${k}행이 안 비었음`);
      if (r.outputs[4] !== "") why.push(`T_B 열 ${k}행이 안 비었음`);
      // 나머지 4개 열은 주어져야 한다(전부 비면 문제가 성립하지 않는다)
      for (const c of [0, 2, 3, 5]) if (r.outputs[c] === "") why.push(`열 ${c} ${k}행이 비었음`);
    });
    if (!g.stateTable.outputLabels[1].includes("㉠")) why.push("㉠ 헤더 표기");
    if (!g.stateTable.outputLabels[4].includes("㉡")) why.push("㉡ 헤더 표기");
    if (b1.values.join("") !== g.rows.map((r) => r.nb).join("")) why.push("㉠ 정답 열");
    if (b2.values.join("") !== g.rows.map((r) => r.tb).join("")) why.push("㉡ 정답 열");
    if (b1.values.length !== 8 || b2.values.length !== 8) why.push("빈칸 열 길이");

    // (g) 세 T가 서로 다르고 죽은 FF가 없다 (T가 항상 0이면 그 비트는 영원히 안 바뀐다)
    const col = (k) => g.rows.map((r) => r[k]).join("");
    if (!col("tc").includes("1") || !col("tb").includes("1") || !col("ta").includes("1")) why.push("죽은 FF");
    if (col("tc") === col("tb") || col("ta") === col("tb") || col("tc") === col("ta")) why.push("T 열 중복");

    if (why.length) { modeFail++; note.push(`seed${seed}: ${[...new Set(why)].join(", ")}`); }
    seenSignatures.add(`${mode}|${g.expressions.TC}|${g.expressions.TB}|${g.expressions.TA}`);
  }
  ok(`${mode} — 12 seed 전부 검산 통과`, modeFail === 0, note.join(" / "));
}
// 같은 문제만 반복 생성되지 않는지 (유사·변형 각각 여러 형태가 나와야 한다)
ok(`설계 다양성 — 서로 다른 (T_C,T_B,T_A) 조합 ${seenSignatures.size}종 (≥6 기대)`, seenSignatures.size >= 6, `${seenSignatures.size}종`);

// 유사·변형이 같은 문제로 겹치지 않는지
{
  const sim = generateTff3AutonomousCounter({ seed: 7, mode: "exam_similar" });
  const varn = generateTff3AutonomousCounter({ seed: 7, mode: "exam_variant" });
  ok("같은 seed에서 유사≠변형 (게이트 종류가 다르다)", sim.gateKind === "NAND" && varn.gateKind === "NOR");
  ok("같은 seed에서 유사≠변형 (T_B 식이 다르다)", sim.expressions.TB !== varn.expressions.TB);
}

// ─────────────────────────────────────────────────────────────────────
console.log("\n[4] (다) 전용 렌더러");
{
  const g = generateTff3AutonomousCounter({ seed: 3, mode: "exam_similar" });
  const svg = renderTff3CounterCircuit(g.circuitDiagram);
  ok("SVG 생성", svg.startsWith("<svg") && svg.endsWith("</svg>"));
  ok("에러 <pre> 없음", !svg.includes("<pre"));
  for (const label of ["T_C", "T_B", "T_A", "㉢", "CLK", "T 플립플롭"]) {
    ok(`라벨 "${label}" 포함`, svg.includes(label));
  }
  ok("게이트 종류 안내 포함", svg.includes("2입력 NAND"));
  // ★★ 원본은 T_C·T_A 블록의 내용도, ㉢의 입력도 주지 않는다 — 그리면 원본에 없는 정보가 생기고
  //    ㉢ 쪽은 [단계 3] 정답이 샌다. payload에 아예 없어야 한다.
  ok("T_C·T_A 식이 payload에 없다(원본에 없는 정보 금지)",
    !("tcExpr" in g.circuitDiagram) && !("taExpr" in g.circuitDiagram));
  ok("T_C·T_A 식이 그림에 그려지지 않는다", !svg.includes(esc(g.expressions.TC)) || g.expressions.TC === "1");
  ok("㉢ 입력 리터럴이 payload에 없다(정답 누설 방지)", !("tbInputs" in g.circuitDiagram));
  // 되먹임을 실선 한 줄로 그리면 C·B·A가 단락된다 → 굵은 버스로 그려야 한다.
  ok("되먹임은 굵은 버스로 표기", svg.includes('stroke-width="5"'));

  const gv = generateTff3AutonomousCounter({ seed: 3, mode: "exam_variant" });
  ok("변형 렌더러는 NOR 안내", renderTff3CounterCircuit(gv.circuitDiagram).includes("2입력 NOR"));
}
function esc(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
