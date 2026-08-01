// universal 확장 검증 — ① CCVS/CCCS 등가 변환 ② 파라미터 최대화 ③ a의 유리함수 복원
//
//   사용자 신고(2026-07-31, 임용 6번): "이게 원본인데 유사문제가 이상하게 생성돼".
//   실측 로그: dispatch=dc_supernode_pipeline(generic) — 종속원·파라미터 a·최대화가 전부 소실.
//   원인: MNA가 CCVS 미지원("CCCS/CCVS 미지원" 주석) + 파라미터 최적화 query 부재.
//
//   ★ 전용 archetype을 만들지 않고 universal 경로에 일반 기능으로 흡수한다(사용자 지침).
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeParamSweepDependent.mjs
import { solveMNA, normalizeControlledSources } from "../lib/solver/mna.ts";
import {
  maximizeOverParam, fitRationalInParam, rationalizeFit,
  resistorPowerMetric, nodeVoltageMetric, evaluateAt,
} from "../lib/solver/paramSweep.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ─────────────────────────────────────────────────────────────────────────
// 임용 6번 원본 회로 (파라미터 a)
//   A —a[Ω]— M —a[Ω]— B,  A—2[Ω]—GND(전류 I_x),  M—a[V]—GND,  B—2a[Ω]—GND
//   슈퍼노드: CCVS  V(B)-V(A) = 2·I_x,  I_x = A→GND 2Ω 전류
// ─────────────────────────────────────────────────────────────────────────
const build = (a) => ({
  nodeIds: ["A", "B", "M"],
  groundId: "GND",
  resistors: [
    { id: "Rx", a: "A", b: "GND", R: 2 },   // I_x 가 흐르는 저항
    { id: "R1", a: "A", b: "M", R: a },
    { id: "R2", a: "B", b: "M", R: a },
    { id: "RB", a: "B", b: "GND", R: 2 * a },
  ],
  vsources: [{ id: "Vs", a: "M", b: "GND", V: a }],
  isources: [],
  ccvs: [{ id: "E1", a: "B", b: "A", ctrlR: "Rx", r: 2 }], // V(B)-V(A) = 2·I_x
});

// ─── [1] CCVS 등가 변환 ──────────────────────────────────────────────────
console.log("\n[1] CCVS → VCVS 등가 변환");
const norm = normalizeControlledSources(build(8));
ok("ccvs가 vcvs로 치환됨", (norm.ccvs ?? []).length === 0 && (norm.vcvs ?? []).length === 1);
ok("이득 k = r/R = 2/2 = 1", close(norm.vcvs[0].k, 1), `k=${norm.vcvs[0].k}`);
ok("제어 노드가 Rx의 양끝", norm.vcvs[0].vca === "A" && norm.vcvs[0].vcb === "GND");

let threw = false;
try {
  normalizeControlledSources({ ...build(8), ccvs: [{ id: "E9", a: "B", b: "A", ctrlR: "없는저항", r: 2 }] });
} catch { threw = true; }
ok("제어 경로가 저항이 아니면 오류(조용히 틀리지 않음)", threw);

// ─── [2] 회로 해 — 손계산과 대조 ────────────────────────────────────────
console.log("\n[2] 해 검증 (손계산: V_A=4a/(a+8), V_B=8a/(a+8), P_B=32a/(a+8)²)");
for (const a of [1, 2, 4, 8, 12, 20]) {
  const res = solveMNA(build(a));
  const wVA = (4 * a) / (a + 8), wVB = (8 * a) / (a + 8);
  const wPB = (32 * a) / Math.pow(a + 8, 2);
  const pb = evaluateAt(build, resistorPowerMetric("RB"), a);
  ok(`a=${String(a).padStart(2)} : V_A·V_B·P_B 일치`,
    close(res.nodeVoltages.A, wVA) && close(res.nodeVoltages.B, wVB) && close(pb, wPB),
    `V_A=${res.nodeVoltages.A.toFixed(4)}(${wVA.toFixed(4)}) V_B=${res.nodeVoltages.B.toFixed(4)}(${wVB.toFixed(4)}) P_B=${pb.toFixed(4)}(${wPB.toFixed(4)})`);
}

// ─── [3] 파라미터 최대화 ────────────────────────────────────────────────
console.log("\n[3] P_B가 최대가 되는 a");
const mx = maximizeOverParam(build, resistorPowerMetric("RB"), { min: 0.05, max: 60 });
ok("a* = 8", close(mx.aStar, 8, 1e-4), `a*=${mx.aStar.toFixed(6)}`);
ok("P_M = 1 W", close(mx.valueStar, 1, 1e-6), `P=${mx.valueStar.toFixed(6)}`);
ok("경계에 붙지 않음(진짜 극대)", mx.atBoundary === false);

// ─── [4] a의 유리함수 복원 ──────────────────────────────────────────────
console.log("\n[4] 응답을 a의 식으로 복원");
const fitVB = rationalizeFit(fitRationalInParam(build, nodeVoltageMetric("B")));
ok("V_B = 8a/(a+8) 복원",
  fitVB && close(fitVB.num[0], 0, 1e-6) && close(fitVB.num[1], 8) &&
  close(fitVB.den[0], 8) && close(fitVB.den[1], 1),
  fitVB ? `num=[${fitVB.num.map((v)=>v.toFixed(4))}] den=[${fitVB.den.map((v)=>v.toFixed(4))}] err=${fitVB.maxRelErr.toExponential(1)}` : "복원 실패");

const fitVA = rationalizeFit(fitRationalInParam(build, nodeVoltageMetric("A")));
ok("V_A = 4a/(a+8) 복원",
  fitVA && close(fitVA.num[1], 4) && close(fitVA.den[0], 8),
  fitVA ? `num=[${fitVA.num.map((v)=>v.toFixed(4))}] den=[${fitVA.den.map((v)=>v.toFixed(4))}]` : "복원 실패");

const fitPB = rationalizeFit(fitRationalInParam(build, resistorPowerMetric("RB")));
ok("P_B = 32a/(a+8)² 복원 (분모 2차)",
  fitPB && close(fitPB.num[1], 32) && close(fitPB.den[0], 64) && close(fitPB.den[1], 16) && close(fitPB.den[2], 1),
  fitPB ? `num=[${fitPB.num.map((v)=>v.toFixed(3))}] den=[${fitPB.den.map((v)=>v.toFixed(3))}]` : "복원 실패");

// ─── [5] 다른 회로에서도 되는지 (일반성) ────────────────────────────────
console.log("\n[5] 일반성 — 다른 파라미터 회로");
// 단순 분압: Vs=12, R1=6, R2=a → V_out = 12a/(a+6), P_2 = 144a/(a+6)²  → a*=6, P=6
const divider = (a) => ({
  nodeIds: ["T", "O"], groundId: "GND",
  resistors: [{ id: "R1", a: "T", b: "O", R: 6 }, { id: "R2", a: "O", b: "GND", R: a }],
  vsources: [{ id: "V1", a: "T", b: "GND", V: 12 }],
  isources: [],
});
const dm = maximizeOverParam(divider, resistorPowerMetric("R2"), { min: 0.05, max: 60 });
ok("분압 회로 a* = 6, P = 6 W", close(dm.aStar, 6, 1e-4) && close(dm.valueStar, 6, 1e-6),
  `a*=${dm.aStar.toFixed(5)} P=${dm.valueStar.toFixed(5)}`);
const df = rationalizeFit(fitRationalInParam(divider, nodeVoltageMetric("O")));
ok("분압 V_o = 12a/(a+6) 복원", df && close(df.num[1], 12) && close(df.den[0], 6),
  df ? `num=[${df.num.map((v)=>v.toFixed(3))}] den=[${df.den.map((v)=>v.toFixed(3))}]` : "복원 실패");

// CCCS도 같은 규칙으로 변환되는지
const withCccs = {
  nodeIds: ["N1", "N2"], groundId: "GND",
  resistors: [{ id: "Rc", a: "N1", b: "GND", R: 4 }, { id: "RL", a: "N2", b: "GND", R: 10 }],
  vsources: [{ id: "V1", a: "N1", b: "GND", V: 8 }],
  isources: [],
  cccs: [{ id: "F1", a: "GND", b: "N2", ctrlR: "Rc", beta: 3 }],
};
const nc = normalizeControlledSources(withCccs);
ok("CCCS → VCCS, g = β/R = 3/4", (nc.vccs ?? []).length === 1 && close(nc.vccs[0].g, 0.75), `g=${nc.vccs?.[0]?.g}`);
// I_ctrl = 8/4 = 2 A → 종속 전류 6 A가 GND→N2 로 흐름 → V_N2 = 6·10 = 60 V
ok("CCCS 회로 해 = 60 V", close(solveMNA(withCccs).nodeVoltages.N2, 60),
  `V=${solveMNA(withCccs).nodeVoltages.N2.toFixed(4)}`);

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
