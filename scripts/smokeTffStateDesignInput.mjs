// 외부 입력 X를 갖는 2-bit 상태기계 + T 플립플롭 설계 (임용 12번 디지털논리) — API 없음
//
//   ★ 원본은 D 플립플롭이지만 사용자 지정으로 **T 플립플롭**으로 출제한다(T = Q(t) ⊕ Q(t+1)).
//   ★ 형제 dff_state_design(입력 없는 자율 상태도)은 "입력 X"에서 스스로 양보하는데, 받아 줄 전용
//     분기가 없으면 generic fsm(있지도 않은 출력 Z 날조)으로 샌다 → 이 archetype이 받는다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTffStateDesignInput.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectTffStateDesignInput } from "../lib/pipeline/runTffStateDesignInputPipeline.ts";
import {
  generateTffStateDesignInput, __tffStateDesignInputPoolSize, __tffSolveForVerify,
} from "../lib/generation/topologies/tffStateDesignInput.ts";
import { renderDffStateDesignCircuit } from "../lib/renderers/dffStateDesignCircuitRenderer.ts";
import { renderConceptDiagramSVG } from "../lib/renderers/conceptDiagramRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

const mk = (topic, interpretation, concepts = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [],
  componentInventory: [], subjectKey: "digital_logic", topicKey: "fsm",
});
const dispatch = (a, subject = "digital_logic") => {
  const t = classifyCircuitType(a, subject)?.type;
  if (t === "tff_state_design_input" || detectTffStateDesignInput(a)) return "tff_state_design_input";
  return t ?? "?";
};
let pass = 0, fail = 0;
const expect = (name, a, want, subject) => {
  const got = dispatch(a, subject);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};
const expectNotStolen = (name, a, subject) => {
  const got = dispatch(a, subject);
  if (got !== "tff_state_design_input") { pass++; console.log(`  ✅ ${name} → ${got} (뺏지 않음)`); }
  else { fail++; console.log(`  ❌ ${name} → 이 archetype이 가로챘다`); }
};
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const T = "tff_state_design_input";

console.log("\n[1] 이 원본 — 표현이 흔들려도 tff_state_design_input");
expect("원본 발문형(상태도+입력 X+D 플립플롭 설계)", mk(
  "상태도를 이용한 순서논리회로 설계",
  "상태 변수 Q_A, Q_B와 입력 X를 갖는 상태도로부터 상태표와 카르노맵을 작성하여 플립플롭의 입력을 불 함수로 구하고, 2개의 AND 게이트와 1개의 OR 게이트로 논리회로를 구성하는 문제이다.",
  ["상태도", "상태표", "카르노맵", "플립플롭", "최소항의 합"],
), T);
expect("'D 플립플롭' 명시 + 입력 X", mk(
  "D 플립플롭을 이용한 상태도 설계",
  "2개의 D 플립플롭을 이용하여 입력 X를 갖는 상태도로 동작하는 논리회로를 설계한다. 상태표를 작성하고 카르노맵으로 간략화하여 D_A, D_B를 구한다.",
  ["D 플립플롭", "상태도", "카르노맵", "논리식"],
), T);
expect("'입력을 갖는 상태 전이' 표현", mk(
  "순차 논리회로 설계",
  "상태 변수 두 개와 입력을 갖는 상태 전이도를 상태표로 옮기고, 불 함수를 간략화하여 플립플롭 입력을 구한 뒤 게이트로 구현한다.",
  ["상태 전이", "플립플롭", "불함수", "간략화"],
), T);

console.log("\n[2] 형제 회귀 — 다른 디지털 유형을 뺏지 않는다");
expectNotStolen("dff_state_design (입력 없는 자율 상태도)", mk(
  "D 플립플롭 상태도 설계",
  "입력이 없는 2비트 자율 상태도(00→01→10→10, 11→01)를 상태표로 옮기고 D 플립플롭 2개와 게이트로 구현한다.",
  ["D 플립플롭", "상태도", "자율 순환", "게이트 설계"],
));
expectNotStolen("시퀀스 검출기 (Mealy 출력)", mk(
  "110 시퀀스 검출기",
  "입력 X로 들어오는 비트열에서 110이 검출되면 출력 Z가 1이 되는 시퀀스 검출기를 상태도로 설계한다.",
  ["시퀀스 검출기", "Mealy", "상태도", "출력 Z"],
));
expectNotStolen("JK 여기표 + SOP/POS", mk(
  "JK 플립플롭 여기표와 불함수",
  "JK 플립플롭 2개의 상태 여기표에서 J_A를 간략화된 최소항의 합으로 구하고 분배 법칙으로 합의 곱으로 변환한다.",
  ["JK 플립플롭", "여기표", "최소항의 합", "합의 곱"],
));
expectNotStolen("SR 플립플롭 + MUX 순차회로", mk(
  "SR 플립플롭과 2x1 MUX 순서회로",
  "입력이 없는 2비트 순환 상태를 SR 플립플롭 2개와 2×1 멀티플렉서 4개로 설계한다.",
  ["SR 플립플롭", "멀티플렉서", "상태표"],
));

console.log("\n[3] 물리(논리) — T 여기표·상태도·카르노맵 일관성 재검산");
{
  ok(`생성 풀 ${__tffStateDesignInputPoolSize()}개`, __tffStateDesignInputPoolSize() >= 100);
  // 수기 검증: T_A = Q_A'X + Q_A Q_B' 이면 (00,X=1) → T_A=1 → 다음 Q_A=1
  const tA = [0, 1, 0, 1, 1, 1, 0, 0], tB = [0, 0, 1, 1, 0, 0, 1, 0];
  const g = __tffSolveForVerify(tA, tB);
  ok("T_A 최소 SOP = Q_A'X + Q_AQ_B'", g.tAExpr.replace(/\s/g, "").includes("Q_A'X"), `→ ${g.tAExpr}`);
  ok("전이 00,X=1 → 10 (T_A=1·T_B=0)", g.transitions.includes("00 --X=1--> 10"), `→ ${g.transitions[1]}`);
  ok("전이 00,X=0 → 00 (T=0 유지)", g.transitions.includes("00 --X=0--> 00"));
}
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0, checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateTffStateDesignInput({ seed, mode });
    const rows = g.stateTable.rows;
    if (rows.length !== 8) { bad++; console.log(`    ❌ ${mode} seed${seed} 상태표 ${rows.length}행`); continue; }
    let rowBad = false;
    rows.forEach((r) => {
      const [qa, qb, x] = r.inputs.map(Number);
      const [na, nb, ta, tb] = (r.outputs ?? []).map(Number);
      // ★ T 여기표: T = Q(t) ⊕ Q(t+1)
      if ((qa ^ na) !== ta || (qb ^ nb) !== tb) rowBad = true;
      // 카르노맵 값이 상태표와 일치해야 한다
      const rowIdx = ["00", "01", "11", "10"].indexOf(`${qa}${qb}`);
      if (g.kmapA.rows[rowIdx].values[x] !== ta) rowBad = true;
      if (g.kmapB.rows[rowIdx].values[x] !== tb) rowBad = true;
    });
    if (rowBad) { bad++; console.log(`    ❌ ${mode} seed${seed} 여기표/카르노맵 불일치`); continue; }
    // 단계 3 전제: T_A의 최소 SOP가 정확히 2항
    if (g.tATermCount !== 2) { bad++; console.log(`    ❌ ${mode} seed${seed} T_A 항수 ${g.tATermCount} (2 AND + 1 OR 불가)`); continue; }
    // 상태도: 4개 노드 + 8개 전이(합쳐진 간선 포함)
    if (g.stateDiagram.nodes.length !== 4) { bad++; console.log(`    ❌ ${mode} seed${seed} 상태 노드 ${g.stateDiagram.nodes.length}`); continue; }
    if (g.transitions.length !== 8) { bad++; console.log(`    ❌ ${mode} seed${seed} 전이 ${g.transitions.length}`); continue; }
    // T 플립플롭이어야 한다(사용자 지정)
    if (g.circuitDiagram.ffAType !== "T" || g.circuitDiagram.ffBType !== "T") { bad++; console.log(`    ❌ ${mode} seed${seed} FF 종류`); continue; }
    if (g.circuitDiagram.externalInput !== "X") { bad++; console.log(`    ❌ ${mode} seed${seed} 외부 입력 누락`); continue; }
    checked++;
  }
  ok(`${mode} 12개 재검산 (통과 ${checked})`, bad === 0 && checked === 12);
}
{
  const a = generateTffStateDesignInput({ seed: 3, mode: "exam_similar" });
  const b = generateTffStateDesignInput({ seed: 3, mode: "exam_variant" });
  ok("유사·변형이 서로 다른 상태기계", a.tAExpr !== b.tAExpr || a.tBExpr !== b.tBExpr);
}

console.log("\n[4] 렌더 — T-FF 2개 + 외부 입력 X + 게이트 빈칸, 라벨 겹침 0");
{
  const g = generateTffStateDesignInput({ seed: 2, mode: "exam_similar" });
  const svg = renderDffStateDesignCircuit(g.circuitDiagram);
  ok("SVG 생성", svg.startsWith("<svg") && !svg.includes("<pre>"));
  ok("T-FF 표기 (D-FF 아님)", svg.includes("T-FF") && !svg.includes("D-FF"));
  ok("외부 입력 X 트렁크", svg.includes(">X<"));
  ok("게이트 빈칸 ㉡·㉢", svg.includes("㉡") && svg.includes("㉢"));
  ok("입력 라벨 Q_A·Q_B·X", svg.includes("Q_A") && svg.includes("Q_B"));
  const hits = findLabelOverlaps(svg);
  ok("라벨 겹침 0건", hits.length === 0, `→ ${JSON.stringify(hits.slice(0, 2))}`);
}
{
  // 형제(자율 D-FF) 렌더는 그대로여야 한다 — 기본값 회귀
  const svg = renderDffStateDesignCircuit({ gateASym: "㉮", gateBSym: "㉯" });
  ok("형제 기본 렌더 무회귀 (D-FF·X 없음)", svg.includes("D-FF") && !svg.includes(">X<"));
}
{
  // ★ 상태도(가) 라벨 회귀 (사용자 신고 2026-08-02 "상태도에서 X끼리 겹쳐서 보이지 않는다"):
  //   양방향 간선이 같은 중점에 라벨을 찍어 포개졌고, 최상단 노드의 self-loop 라벨은 캔버스 밖으로 잘렸다.
  //   → 곡선 분리 + 충돌 회피 + 캔버스 경계 검사. 전 조합에서 겹침·누락·이탈 0을 단언한다.
  const W = 720, H = 380;
  let ov = 0, miss = 0, clip = 0;
  for (const mode of ["exam_similar", "exam_variant"]) for (let seed = 1; seed <= 10; seed++) {
    const g = generateTffStateDesignInput({ seed, mode });
    const svg = renderConceptDiagramSVG(g.stateDiagram);
    const texts = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="\w+" font-size="([\d.]+)"[^>]*>([^<]*)</g)];
    if (texts.filter((m) => m[3] === "11").length < g.stateDiagram.edges.length) miss++;
    if (texts.some((m) => Number(m[2]) < 12 || Number(m[2]) > H - 2 || Number(m[1]) < 4 || Number(m[1]) > W - 4)) clip++;
    if (findLabelOverlaps(svg).length) ov++;
  }
  ok("(가) 상태도 20 케이스 — 간선 라벨 겹침 0", ov === 0, `→ ${ov}건`);
  ok("(가) 상태도 20 케이스 — 라벨 누락 0", miss === 0, `→ ${miss}건`);
  ok("(가) 상태도 20 케이스 — 캔버스 이탈 0", clip === 0, `→ ${clip}건`);
}
{
  // ★ (라) 회로 배선 회귀 (사용자 신고 2026-08-02 "node가 더 연장되서 삐져나간 부분이 있어"):
  //   입력 트렁크(세로선) 길이가 2입력 시절 상수로 박혀 있어 3입력에서는 위아래로 삐져나오고
  //   세 번째 탭에는 닿지 않았다 → 탭 좌표에서 역산. **세로선의 양 끝이 가로선 위에 있어야** 한다.
  const parseLines = (svg) => [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)]
    .map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }));
  const danglingEnds = (svg) => {
    const L = parseLines(svg);
    const horiz = L.filter((l) => l.y1 === l.y2);
    let n = 0;
    for (const v of L.filter((l) => l.x1 === l.x2)) {
      for (const ey of [Math.min(v.y1, v.y2), Math.max(v.y1, v.y2)]) {
        const met = horiz.some((h) => Math.abs(h.y1 - ey) < 0.6 &&
          Math.min(h.x1, h.x2) - 0.6 <= v.x1 && v.x1 <= Math.max(h.x1, h.x2) + 0.6);
        if (!met) n++;
      }
    }
    return n;
  };
  let dang = 0;
  for (const mode of ["exam_similar", "exam_variant"]) for (let seed = 1; seed <= 6; seed++) {
    dang += danglingEnds(renderDffStateDesignCircuit(generateTffStateDesignInput({ seed, mode }).circuitDiagram));
  }
  ok("(라) 회로 12 케이스 — 떠 있는(삐져나온) 배선 끝 0", dang === 0, `→ ${dang}건`);
  ok("형제 기본 회로도 떠 있는 끝 0", danglingEnds(renderDffStateDesignCircuit({ gateASym: "㉮", gateBSym: "㉯" })) === 0);
}

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail === 0 ? 0 : 1);
