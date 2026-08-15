/**
 * 직류 V·I원 RLC → 상태 방정식 A·B (임용 6번 회로이론) 정적 스모크 — API 호출 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeRlcStateEquation.mjs
 *
 * 배경(2026-08-03 실측): 이 원본이 `ac_superposition`(교류 중첩)으로 분류돼 전혀 다른 문제가
 * 생성됐다(사용자 신고). Vision 요약·인벤토리는 정확했는데 분류기가 V=1·I=1·L=1·C=1 **구성만**
 * 보고 넘긴 것 — "상태 방정식"이라는 **요구**를 안 봤다.
 *
 * 물리(닫힌형, RK4 수치적분으로 원회로와 교차검증):
 *   KVL:  V₁ = R₁ i + L di/dt + v   → di/dt = (−R₁ i − v + V₁)/L
 *   KCL:  i + I₁ = C dv/dt + v/R₂   → dv/dt = ( i − v/R₂ + I₁)/C
 *   A = [[−R₁/L, −1/L], [1/C, −1/(R₂C)]],  B = [[1/L, 0], [0, 1/C]]
 *   원본(R₁=1, L=1/5, C=1/2, R₂=2) → A=[[−5,−5],[2,−1]], B=[[5,0],[0,2]]
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { generateRlcStateEquation } from "@/lib/generation/topologies/rlcStateEquation";
import { detectRlcStateEquation } from "@/lib/pipeline/runRlcStateEquationPipeline";
import { renderRlcStateEquationCircuit } from "@/lib/renderers/rlcStateEquationCircuitRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`);
  }
}

const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const A = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});

// ── 1. 라우팅 — 실측 신고 회차 재현 ─────────────────────────────────────────
console.log("[1] 분류·감지 — 실측 오분류 회차 재현");
const reported = A(
  "RLC 회로의 상태 방정식",
  "직류 전압원과 전류원을 포함하는 RLC 회로에서 인덕터 전류 i[A]와 커패시터 양단 전압 v[V]에 대한 회로의 상태 방정식을 행렬 형태로 표현하고자 한다. 전압원 V1을 포함하는 전류 i에 대한 1차 미분방정식과 전류원 I1을 포함하는 전압 v에 대한 1차 미분방정식을 구해 행렬 A와 B를 구한다.",
  ["상태 방정식", "1차 미분방정식", "KVL", "KCL"],
  inv("V:V1[V]", "R:1[Ω]", "L:1/5[H]", "C:1/2[F]", "R:2[Ω]", "I:I1[A]"),
);
const cls = classifyCircuitType(reported, "circuit_theory");
check(`분류가 전용 archetype으로 (실측: ${cls.type})`, cls.type === "rlc_state_equation", cls.reasoning);
check("route 안전망도 발화", detectRlcStateEquation(reported) === true);

check(
  "'상태 변수' 표현만 쓴 요약",
  detectRlcStateEquation(
    A("RLC 회로 해석", "상태 변수 i와 v에 대한 1차 미분방정식을 세워 상태 공간 표현의 행렬을 구한다. 인덕터와 커패시터가 포함된 회로이다.",
      [], inv("V", "R", "L", "C", "R", "I")),
  ) === true,
);
check(
  "인벤토리가 비어도 텍스트로 잡는다",
  detectRlcStateEquation(
    A("상태 방정식", "RLC 회로의 상태 방정식을 행렬 A와 B로 표현한다."),
  ) === true,
);

// ── 2. 형제 양보 ────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
const acSup = A(
  "교류 중첩의 원리",
  "교류 전압원과 교류 전류원이 포함된 회로에서 중첩의 원리로 마디 a에서 b로 흐르는 페이저 전류를 구하고 평균 전력을 구한다.",
  ["중첩의 원리", "페이저"],
  inv("V", "I", "R", "L", "C"),
);
check("교류 페이저 중첩은 양보", detectRlcStateEquation(acSup) === false);
check(
  "스위치 과도(초기조건)는 양보",
  detectRlcStateEquation(
    A("스위치 RLC 과도응답", "t=0에서 스위치가 닫힐 때 상태 변수의 초기 조건을 구하고 미분방정식을 푼다.", [], inv("V", "SW", "L", "C", "R")),
  ) === false,
);
check(
  "테브난·최대전력은 양보",
  detectRlcStateEquation(
    A("테브난 등가와 최대 전력", "상태 변수를 정의하고 테브난 등가 임피던스를 구해 최대 평균 전력을 구한다.", [], inv("V", "R", "L", "C")),
  ) === false,
);
check(
  "상태방정식 언급이 없으면 미발화",
  detectRlcStateEquation(
    A("RLC 직렬 회로", "직류 전압원이 인가된 RLC 직렬 회로의 전류를 구한다.", [], inv("V", "R", "L", "C")),
  ) === false,
);

// ── 3. 물리 재검산 — 상태방정식 ↔ 원회로 수치적분 ───────────────────────────
console.log("\n[3] 생성물 물리 재검산 (RK4로 원회로와 교차검증)");

function integrate(g, T = 1.2, h = 2e-4) {
  let x = [0, 0];
  for (let t = 0; t < T; t += h) {
    const a = g(x);
    const b = g([x[0] + (h / 2) * a[0], x[1] + (h / 2) * a[1]]);
    const c = g([x[0] + (h / 2) * b[0], x[1] + (h / 2) * b[1]]);
    const dd = g([x[0] + h * c[0], x[1] + h * c[1]]);
    x = [
      x[0] + (h / 6) * (a[0] + 2 * b[0] + 2 * c[0] + dd[0]),
      x[1] + (h / 6) * (a[1] + 2 * b[1] + 2 * c[1] + dd[1]),
    ];
  }
  return x;
}

let ok = 0;
let bad = 0;
const seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 12; seed++) {
    const { values: v, answer: ans } = generateRlcStateEquation({ seed, mode });
    seen.add(`${v.R1}|${v.k}|${v.m}|${v.R2}`);
    const R1 = v.R1, L = 1 / v.k, C = 1 / v.m, R2 = v.R2;
    // 닫힌형 대조
    const expA = [[-R1 / L, -1 / L], [1 / C, -1 / (R2 * C)]];
    const expB = [[1 / L, 0], [0, 1 / C]];
    const matOk = [0, 1].every((r) => [0, 1].every((c) =>
      Math.abs(ans.A[r][c] - expA[r][c]) < 1e-9 && Math.abs(ans.B[r][c] - expB[r][c]) < 1e-9));
    // 수치적분 대조 (원회로 vs 상태방정식)
    const V1 = 3, I1 = 1.5;
    const circuit = ([i, vv]) => [(-R1 * i - vv + V1) / L, (i - vv / R2 + I1) / C];
    const state = ([i, vv]) => [
      ans.A[0][0] * i + ans.A[0][1] * vv + ans.B[0][0] * V1 + ans.B[0][1] * I1,
      ans.A[1][0] * i + ans.A[1][1] * vv + ans.B[1][0] * V1 + ans.B[1][1] * I1,
    ];
    const x1 = integrate(circuit), x2 = integrate(state);
    const simOk = Math.abs(x1[0] - x2[0]) < 1e-9 && Math.abs(x1[1] - x2[1]) < 1e-9;
    // 모든 성분이 정수여야 문항이 깔끔
    const intOk = [...ans.A.flat(), ...ans.B.flat()].every(Number.isInteger);
    if (matOk && simOk && intOk) ok++;
    else {
      bad++;
      console.log(`    ✗ seed=${seed} ${mode} matOk=${matOk} simOk=${simOk} intOk=${intOk}`);
    }
  }
}
check(`생성물 24개 재검산 — 닫힌형·수치적분·정수성 (${ok} ok / ${bad} bad)`, bad === 0);
check("여러 소자 조합이 나온다", seen.size >= 6, `distinct=${seen.size}`);

// 원본 값
{
  const R1 = 1, L = 1 / 5, C = 1 / 2, R2 = 2;
  const expA = [[-R1 / L, -1 / L], [1 / C, -1 / (R2 * C)]];
  const expB = [[1 / L, 0], [0, 1 / C]];
  check(
    "원본(R₁=1, L=1/5, C=1/2, R₂=2) → A=[[−5,−5],[2,−1]], B=[[5,0],[0,2]]",
    JSON.stringify(expA) === JSON.stringify([[-5, -5], [2, -1]]) &&
      JSON.stringify(expB) === JSON.stringify([[5, 0], [0, 2]]),
  );
}
// 원본 튜플 미생성
let originalEmitted = false;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 60; seed++) {
    const { values: v } = generateRlcStateEquation({ seed, mode });
    if (v.R1 === 1 && v.k === 5 && v.m === 2 && v.R2 === 2) originalEmitted = true;
  }
}
check("원본 튜플(1, 1/5, 1/2, 2)은 생성되지 않는다", originalEmitted === false);

// 유사·변형이 서로 다른 값 풀
{
  const sim = new Set(), varn = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const a = generateRlcStateEquation({ seed, mode: "exam_similar" }).values;
    const b = generateRlcStateEquation({ seed, mode: "exam_variant" }).values;
    sim.add(`${a.R1}|${a.k}|${a.m}|${a.R2}`);
    varn.add(`${b.R1}|${b.k}|${b.m}|${b.R2}`);
  }
  const overlap = [...sim].filter((x) => varn.has(x));
  check("유사·변형 값 풀이 겹치지 않는다", overlap.length === 0, JSON.stringify(overlap.slice(0, 3)));
}

// ── 4. 렌더 구조 ────────────────────────────────────────────────────────────
console.log("\n[4] figure 구조");
const { values: rv } = generateRlcStateEquation({ seed: 3, mode: "exam_similar" });
const svg = renderRlcStateEquationCircuit({
  r1Label: rv.r1Label, lLabel: rv.lLabel, cLabel: rv.cLabel, r2Label: rv.r2Label,
  vLabel: "V₁[V]", iLabel: "I₁[A]",
});
check("SVG 렌더 성공", svg.startsWith("<svg"));
check("소자 라벨 6종 모두 표시", [rv.r1Label, rv.lLabel, rv.cLabel, rv.r2Label, "V₁[V]", "I₁[A]"].every((x) => svg.includes(x)));
check("상태변수 i·v 표기", />i</.test(svg) && />v</.test(svg));
check("커패시터 극성 +/− 표기", svg.includes(">+<") && svg.includes(">−<"));
const overlaps = findLabelOverlaps(svg);
check("라벨 겹침 0건", overlaps.length === 0, JSON.stringify(overlaps));
const outside = [
  ...[...svg.matchAll(/(?:cx|x1|x2|x)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 680 })),
  ...[...svg.matchAll(/(?:cy|y1|y2|y)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 300 })),
].filter((c) => c.v < 0 || c.v > c.lim);
check("캔버스(680×300) 이탈 0건", outside.length === 0, JSON.stringify(outside.slice(0, 4)));

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
