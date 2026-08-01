// DC 휘트스톤 브리지 평형 (임용 3번 회로이론) — 라우팅 + 물리 + 렌더 정적 검증 (API 호출 없음)
//
//   사용자 신고: "원본인데 다시 생성이 안돼".
//   실측 로그: topicKey=dc_resistive → classify=dc_nodal(low) → dispatch=topology_driven
//              → 브리지 다이아몬드·미지 R_x·개방 V_o가 모두 사라진 저항망이 totalIssues=0으로 생성.
//   이 스모크는 (1) 실제 로그의 Vision 요약을 포함한 라우팅, (2) 평형 물리 재검산,
//   (3) 원본 튜플 미생성, (4) 전용 렌더러 구조를 API 없이 확인한다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDcWheatstoneBalance.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectDcWheatstoneBalance } from "../lib/pipeline/runDcWheatstoneBalancePipeline.ts";
import {
  generateDcWheatstoneBalance,
  __originalDcWheatstoneForVerify,
} from "../lib/generation/topologies/dcWheatstoneBalance.ts";
import { renderDcWheatstoneBalanceCircuit } from "../lib/renderers/dcWheatstoneBalanceCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const mk = (topic, interpretation, concepts = [], inventory = null) => ({
  topic,
  interpretation,
  relatedConcepts: concepts,
  fillInTheBlanks: [],
  ...(inventory ? { componentInventory: inventory } : {}),
});

// 실측 로그(.next/dev/logs)에 남은 이 원본의 인벤토리 — V 1개 + R 7개.
const REAL_INV = [
  { id: "V1", type: "V", value: "22V" },
  { id: "R1", type: "R", value: "4Ω" },
  { id: "R2", type: "R", value: "4Ω" },
  { id: "R3", type: "R", value: "15Ω" },
  { id: "R4", type: "R", value: "5Ω" },
  { id: "R5", type: "R", value: "12Ω" },
  { id: "R6", type: "R", value: "6Ω" },
  { id: "R7", type: "R", value: "6Ω" },
];

// ─────────────────────── 1. 라우팅 ───────────────────────
console.log("\n[1] 분류 라우팅 (subject 4종 · 표현 변형 · 형제 회귀)");

// ★ 실측 로그의 Vision 요약 원문 (textPreview에 남아 있던 것).
const REAL = mk(
  "휘트스톤 브리지 회로 해석",
  "이 문제는 휘트스톤 브리지 회로에서 평형 조건을 만족시키는 저항 R_x의 값을 구하고, 이때의 출력 전압 V_o를 계산하는 문제입니다. 휘트스톤 브리지는 두 개의 저항 분압기 회로로 구성되며, 평형 상태에서는 두 분압기의 전압이 같아야 합니다.",
  ["휘트스톤 브리지", "평형 조건", "저항 분압", "출력 전압"],
  REAL_INV,
);

for (const subject of ["circuit_theory", "electronics", "digital_logic", "mixed_signal"]) {
  const r = classifyCircuitType(REAL, subject);
  ok(`실측 Vision 요약 → dc_wheatstone_balance (subject=${subject})`, r.type === "dc_wheatstone_balance", `got ${r.type}`);
}

const VARIANTS = [
  ["'휘트스톤' 없이 '브리지 회로'만", mk("브리지 회로의 평형", "독립 전압원을 포함한 브리지 회로가 평형이 되도록 하는 저항값과 출력 전압을 구한다.", ["브리지 평형", "분압"], REAL_INV)],
  ["'평형' 대신 '전류가 흐르지 않는'", mk("휘트스톤 브리지 해석", "브리지 회로의 중앙 저항에 전류가 흐르지 않도록 하는 미지 저항 R_x와 출력 전압을 구하는 문제이다.", ["휘트스톤 브리지", "분압 회로"], REAL_INV)],
  ["인벤토리 없음(텍스트만)", mk("휘트스톤 브리지 평형", "브리지가 평형이 되기 위한 저항 R_x와 출력 전압 V_o를 순서대로 구한다.", ["휘트스톤 브리지", "평형 조건"])],
];
for (const [name, a] of VARIANTS) {
  const r = classifyCircuitType(a, "circuit_theory");
  ok(`${name} → dc_wheatstone_balance`, r.type === "dc_wheatstone_balance", `got ${r.type}`);
  ok(`${name} → detect 안전망 발화`, detectDcWheatstoneBalance(a) === true);
}

// 형제 회귀 — AC 브리지(테브난·최대전력)는 뺏기지 않아야 한다.
const AC_BRIDGE = mk(
  "교류 휘트스톤 브리지 테브난 등가",
  "교류 전원과 브리지 4개 암(−j2Ω 커패시터, 6Ω, j4Ω 인덕터, 6Ω)에서 단자 A·B의 테브난 등가 임피던스 Z_TH를 구하고 최대 평균 전력이 전달되는 부하 R_L을 구한다.",
  ["테브난 등가", "최대 평균 전력", "임피던스", "단자 A", "단자 B"],
  [
    { id: "V1", type: "V", value: "4∠0°V" },
    { id: "C1", type: "C", value: "-j2Ω" },
    { id: "L1", type: "L", value: "j4Ω" },
    { id: "R1", type: "R", value: "6Ω" },
    { id: "R2", type: "R", value: "6Ω" },
    { id: "RL", type: "R", value: "R_L" },
  ],
);
ok("회귀: AC 브리지 → dc_wheatstone_balance 아님", classifyCircuitType(AC_BRIDGE, "circuit_theory").type !== "dc_wheatstone_balance",
  `got ${classifyCircuitType(AC_BRIDGE, "circuit_theory").type}`);
ok("회귀: AC 브리지 → detect 미발화(양보)", detectDcWheatstoneBalance(AC_BRIDGE) === false);

const PLAIN_DC = mk(
  "저항 회로의 마디 해석",
  "전압원과 여러 저항으로 구성된 회로에서 각 마디 전압과 전류를 마디 해석법으로 구하는 문제이다.",
  ["마디 해석", "옴의 법칙"],
  REAL_INV,
);
ok("회귀: 일반 DC 저항망 → detect 미발화", detectDcWheatstoneBalance(PLAIN_DC) === false);

// ─────────────────────── 2. 물리 (원본 검산) ───────────────────────
console.log("\n[2] 원본 물리 검산 (22V·4Ω / 4Ω / 12∥6 / R_x∥15 / 6Ω / 브리지 5Ω)");
const orig = __originalDcWheatstoneForVerify();
ok("R_x = 10Ω", orig.answer.Rx === 10, `got ${orig.answer.Rx}`);
ok("V_o = 6V", orig.answer.Vo === 6, `got ${orig.answer.Vo}`);
ok("V_T = 12V", orig.answer.Vt === 12, `got ${orig.answer.Vt}`);
ok("R3eq = 4Ω (12∥6)", orig.answer.R3eq === 4, `got ${orig.answer.R3eq}`);
ok("R_par = 4.8Ω", Math.abs(orig.answer.Rpar - 4.8) < 1e-9, `got ${orig.answer.Rpar}`);

// ─────────────────────── 3. 생성물 독립 재검산 ───────────────────────
console.log("\n[3] 생성물 독립 재검산 (양 모드 × 12 seed — 평형·분압을 다시 계산해 대조)");
const par = (a, b) => (a * b) / (a + b);
let physFail = 0, origLeak = 0, rxSeen = new Set(), voSeen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateDcWheatstoneBalance({ seed, mode });
    const v = g.values, a = g.answer;
    const R3eq = par(v.R3a, v.R3b);
    // (a) 평형 조건이 실제로 성립하는가: R1/R3eq === R_tr/R_rb
    const balanced = Math.abs(v.R1 / R3eq - v.Rtr / v.Rrb) < 1e-9;
    // (b) 미지 저항 R_x가 보조 저항과 병렬로 그 암의 합성값을 만드는가
    const target = v.unknownArm === "upper_right" ? v.Rtr : v.Rrb;
    const rxOk = Math.abs(par(a.Rx, v.Rp) - target) < 1e-9;
    // (c) 개방 출력 전압 재계산
    const Rpar = par(v.R1 + R3eq, v.Rtr + v.Rrb);
    const Vt = (v.Vs * Rpar) / (v.Rs + Rpar);
    const Vo = (Vt * v.Rtr) / (v.Rtr + v.Rrb);
    const voOk = Math.abs(Vo - a.Vo) < 1e-6 && Math.abs(Vt - a.Vt) < 1e-6;
    // (d) 미지 암 위치가 모드와 일치
    const armOk = v.unknownArm === (mode === "exam_variant" ? "lower_right" : "upper_right");
    // (e) 정수 답
    const intOk = Number.isInteger(a.Rx) && Number.isInteger(a.Vo);
    if (!(balanced && rxOk && voOk && armOk && intOk)) {
      physFail++;
      console.log(`     ✗ ${mode} seed=${seed}`, { v, a, balanced, rxOk, voOk, armOk, intOk });
    }
    // (f) 원본 튜플 그대로 생성 금지
    if (v.Vs === 22 && v.Rs === 4 && v.R1 === 4 && v.R3a === 12 && v.R3b === 6 && v.Rtr === 6 && v.Rrb === 6 && v.Rp === 15) origLeak++;
    rxSeen.add(a.Rx); voSeen.add(a.Vo);
  }
}
ok("24개 생성물 모두 평형·R_x·V_o 재검산 일치", physFail === 0, `${physFail}건 불일치`);
ok("원본 튜플 미생성", origLeak === 0, `${origLeak}건 누출`);
ok("값 다양성 (R_x 3종 이상)", rxSeen.size >= 3, `${rxSeen.size}종`);
ok("값 다양성 (V_o 3종 이상)", voSeen.size >= 3, `${voSeen.size}종`);

// ─────────────────────── 4. 렌더러 구조 ───────────────────────
console.log("\n[4] 전용 렌더러 구조 단언 (양 모드)");
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateDcWheatstoneBalance({ seed: 7, mode });
  const svg = renderDcWheatstoneBalanceCircuit(g.circuitDiagram);
  const label = mode === "exam_similar" ? "유사" : "변형";
  ok(`${label}: SVG 생성`, svg.startsWith("<svg") && svg.includes("</svg>"));
  ok(`${label}: 미지 저항 R_x 표기`, svg.includes("R_x"));
  ok(`${label}: 출력 단자 V_o 표기`, svg.includes("V_o"));
  ok(`${label}: 전원 라벨`, svg.includes(g.circuitDiagram.vsLabel));
  ok(`${label}: 브리지 암 라벨`, svg.includes(g.circuitDiagram.rgLabel));
  ok(`${label}: 보조 저항 R_p 라벨`, svg.includes(g.circuitDiagram.rpLabel));
  // 소자 수: 저항 지그재그 path 7개(R_s·R1·R_tr·R3a·R3b·R_rb·R_g) + R_p = 8
  const zig = (svg.match(/<path /g) ?? []).length;
  ok(`${label}: 저항 지그재그 8개 (4암+브리지암+직렬+병렬+하단좌 병렬)`, zig === 8, `got ${zig}`);
  ok(`${label}: 미지 암 강조색`, svg.includes('stroke-width="2.2"'));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
