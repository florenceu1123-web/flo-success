// 2전원 페이저 + 중첩 → 전원 크기 역산 (임용 5번 회로이론) — 라우팅·물리·렌더 정적 검증 (API 없음)
//
//   사용자 신고: 생성물의 발문이 "단계별로 회로를 분석하고, 각 단계에서 요구하는 결과를 도출하시오"라는
//   빈 placeholder이고 전원 값도 기호(V∠0°·I∠−90°)로 남음. 로그: dispatch=universal_ac_pipeline.
//   원인: Vision 요약에 "중첩"·"전류원 개방/전압원 단락"이 빠져 detectAcSuperposition 미발화.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcSupSourceDesign.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectAcSuperpositionSourceDesign } from "../lib/pipeline/runAcSuperpositionSourceDesignPipeline.ts";
import {
  generateAcSuperpositionSourceDesign,
  __originalAcSuperpositionDesignForVerify,
} from "../lib/generation/topologies/acSuperpositionSourceDesign.ts";
import { renderAcSuperpositionSourceDesignCircuit } from "../lib/renderers/acSuperpositionSourceDesignCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const mk = (topic, interpretation, concepts = [], inv = null) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [],
  ...(inv ? { componentInventory: inv } : {}),
});
const INV = [
  { id: "V1", type: "V", value: "V_s∠0°V" }, { id: "I1", type: "I", value: "I_s∠-90°A" },
  { id: "R1", type: "R", value: "1Ω" }, { id: "R2", type: "R", value: "2Ω" }, { id: "R3", type: "R", value: "2Ω" },
  { id: "L1", type: "L", value: "j11Ω" }, { id: "C1", type: "C", value: "-j10Ω" },
];

console.log("\n[1] 라우팅 — ★ 신고 재현: 실측 Vision 요약(중첩·절차 누락)");
const REAL = mk(
  "RLC 회로의 페이저 해석",
  "이 문제는 교류 전원을 포함한 RLC 회로에서 커패시터 양단의 페이저 전압을 주어진 조건에 맞추기 위해 전압원과 전류원의 크기를 구하는 문제입니다. 단계별로 회로를 해석한다.",
  ["페이저", "RLC 회로", "커패시터 전압", "전원 크기"],
  INV,
);
for (const subject of ["circuit_theory", "electronics", "mixed_signal"]) {
  const r = classifyCircuitType(REAL, subject);
  ok(`실측 요약 → ac_superposition_source_design (subject=${subject})`, r.type === "ac_superposition_source_design", `got ${r.type}`);
}
ok("실측 요약 → detect 안전망 발화", detectAcSuperpositionSourceDesign(REAL) === true);

const VARIANTS = [
  ["중첩·절차 모두 서술", mk("중첩의 원리를 이용한 페이저 해석", "전류원을 개방하고 전압원을 단락하여 각각 커패시터 양단 전압을 구한 뒤, 중첩의 원리로 V_c = -7-j[V]가 되도록 전압원과 전류원의 크기를 구한다.", ["중첩의 원리", "페이저", "커패시터 전압"], INV)],
  ["'만족시키는 크기' 표현", mk("교류 2전원 RLC 회로", "커패시터 양단 페이저 전압이 주어진 값을 만족시키는 전압원의 크기와 전류원의 크기를 구하는 문제이다.", ["페이저", "교류 전원"], INV)],
];
for (const [name, a] of VARIANTS) {
  ok(`${name} → 전용 archetype`, classifyCircuitType(a, "circuit_theory").type === "ac_superposition_source_design",
    `got ${classifyCircuitType(a, "circuit_theory").type}`);
}

console.log("\n[2] 형제 회귀 — 다른 AC archetype을 뺏지 않는다");
const SIBLINGS = [
  ["임용10 중첩(정방향 전류·전력)", mk("AC 중첩의 원리", "교류 전압원과 전류원이 있는 회로에서 전류원을 개방하고 전압원을 단락하여 마디 a에서 b로 흐르는 전류와 R1에 전달되는 평균 전력을 구한다.", ["중첩의 원리", "평균 전력"], INV), "ac_superposition_source_design", false],
  ["테브난 최대전력", mk("테브난 등가와 최대 전력", "교류 전압원과 전류원이 있는 회로에서 단자 a-b의 테브난 등가를 구하고 최대 평균 전력이 전달되는 부하를 구한다.", ["테브난", "최대 전력"], INV), "ac_superposition_source_design", false],
  ["역률 보정", mk("역률 개선", "교류 전원과 부하 임피던스에서 역률이 1이 되도록 커패시터 리액턴스를 구하고 평균 전력을 계산한다.", ["역률", "평균 전력"], INV), "ac_superposition_source_design", false],
];
for (const [name, a, forbidden] of SIBLINGS) {
  const got = classifyCircuitType(a, "circuit_theory").type;
  ok(`${name} → 뺏기지 않음 (got ${got})`, got !== forbidden);
  ok(`${name} → detect 미발화`, detectAcSuperpositionSourceDesign(a) === false);
}

console.log("\n[3] 원본 물리 검산 (1Ω·2Ω·2Ω·j11·−j10, V_c = −7−j)");
const o = __originalAcSuperpositionDesignForVerify();
ok("k₁ = −1 − 3j", o.answer.k1[0] === -1 && o.answer.k1[1] === -3, JSON.stringify(o.answer.k1));
ok("k₂ = −3 + j", o.answer.k2[0] === -3 && o.answer.k2[1] === 1, JSON.stringify(o.answer.k2));
ok("목표 V_c = −7 − j", o.answer.vTarget[0] === -7 && o.answer.vTarget[1] === -1, JSON.stringify(o.answer.vTarget));
ok("V_s = 1 V", o.answer.Vs === 1);
ok("I_s = 2 A", o.answer.Is === 2);

console.log("\n[4] 생성물 독립 재검산 (양 모드 × 10 seed)");
const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
let bad = 0, origLeak = 0, seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 10; seed++) {
    const g = generateAcSuperpositionSourceDesign({ seed, mode });
    const v = g.values, a = g.answer;
    // 독립 재계산
    const den = cAdd([v.R1, 0], [v.R3, v.XL - v.XC]);
    const Ztgt = v.target === "capacitor" ? [0, -v.XC] : [0, v.XL];
    const k1 = cDiv(Ztgt, den);
    const k2 = cMul([0, -1], cMul(Ztgt, cDiv([v.R1, 0], den)));
    const vc = [k1[0] * v.Vs + k2[0] * v.Is, k1[1] * v.Vs + k2[1] * v.Is];
    const near = (x, y) => Math.abs(x - y) < 1e-6;
    const okAll =
      near(k1[0], a.k1[0]) && near(k1[1], a.k1[1]) && near(k2[0], a.k2[0]) && near(k2[1], a.k2[1]) &&
      near(vc[0], a.vTarget[0]) && near(vc[1], a.vTarget[1]) &&
      Number.isInteger(a.Vs) && Number.isInteger(a.Is) && a.Vs > 0 && a.Is > 0 &&
      v.target === (mode === "exam_variant" ? "inductor" : "capacitor");
    if (!okAll) { bad++; console.log("     ✗", mode, seed, { v, a, k1, k2, vc }); }
    if (v.R1 === 1 && v.R2 === 2 && v.R3 === 2 && v.XL === 11 && v.XC === 10 && v.Vs === 1 && v.Is === 2 && v.target === "capacitor") origLeak++;
    seen.add(`${a.vTarget}|${a.Vs}|${a.Is}`);
  }
}
ok("20개 생성물 계수·목표·해 재검산 일치", bad === 0, `${bad}건`);
ok("원본 튜플 미생성", origLeak === 0);
ok("값 다양성 5종 이상", seen.size >= 5, `${seen.size}종`);

console.log("\n[5] 발문·렌더 구조 (신고된 placeholder 재발 방지)");
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateAcSuperpositionSourceDesign({ seed: 3, mode });
  const svg = renderAcSuperpositionSourceDesignCircuit(g.circuitDiagram);
  const label = mode === "exam_similar" ? "유사" : "변형";
  ok(`${label}: SVG 생성`, svg.startsWith("<svg"));
  ok(`${label}: 전원 라벨 V_s·I_s 표기`, svg.includes("V_s∠0°") && svg.includes("I_s∠−90°"));
  ok(`${label}: 목표 전압 라벨`, svg.includes(g.circuitDiagram.targetLabel));
  ok(`${label}: 소자 5개 라벨`, [g.circuitDiagram.r1Label, g.circuitDiagram.r2Label, g.circuitDiagram.r3Label, g.circuitDiagram.lLabel, g.circuitDiagram.cLabel].every((l) => svg.includes(l)));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
