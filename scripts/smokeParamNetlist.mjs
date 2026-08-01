// 기호 파라미터 netlist → 파라미터 회로 → 최대화·식 복원 (임용 6번 경로) — 정적 검증 (API 없음)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeParamNetlist.mjs
// 임용 6번 원본을 "Vision이 낼 법한 netlist" 형태로 두고 기호 파라미터 경로를 검증한다.
import { netlistToSolverNetwork, detectNetlistParam, parseParamCoefficient } from "../lib/solver/netlistToSolver.ts";
import { maximizeOverParam, fitRationalInParam, rationalizeFit,
         resistorPowerMetric, nodeVoltageMetric } from "../lib/solver/paramSweep.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  OK  ${n}${e?" — "+e:""}`); } else { fail++; console.log(`  FAIL ${n}${e?" — "+e:""}`); } };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

console.log("\n[1] 기호값 파서");
for (const [raw, want] of [["a",1],["2a",2],["2a[Ω]",2],["a[V]",1],["0.5a",0.5],["-a",-1],["3*a",3],["$a$",1],["20",null],["10kΩ",null],["b",null]])
  ok(`parseParamCoefficient(${JSON.stringify(raw)}) = ${want}`, parseParamCoefficient(raw,"a") === want, `got ${parseParamCoefficient(raw,"a")}`);

// 원본 netlist (A—a—M—a—B, A—2Ω—GND(Ix), M—a[V]—GND, B—2a—GND, CCVS 2i_x between B,A)
const netlist = {
  ground: "GND",
  components: [
    { id: "Rx", type: "R", value: "2Ω",   pins: [{ node: "A" }, { node: "GND" }] },
    { id: "R1", type: "R", value: "a[Ω]", pins: [{ node: "A" }, { node: "M" }] },
    { id: "R2", type: "R", value: "a[Ω]", pins: [{ node: "B" }, { node: "M" }] },
    { id: "RB", type: "R", value: "2a[Ω]",pins: [{ node: "B" }, { node: "GND" }] },
    { id: "Vs", type: "V", value: "a[V]", pins: [{ node: "M" }, { node: "GND" }] },
    { id: "E1", type: "CCVS", value: "2i_x", control: "Rx", pins: [{ node: "B" }, { node: "A" }] },
  ],
};

console.log("\n[2] 파라미터 자동 감지");
ok('detectNetlistParam = "a"', detectNetlistParam(netlist) === "a", `got ${detectNetlistParam(netlist)}`);

console.log("\n[3] netlist → 파라미터 회로 → 해 (손계산 대조)");
const build = (a) => netlistToSolverNetwork(netlist, { name: "a", value: a }).net;
const w = netlistToSolverNetwork(netlist, { name: "a", value: 8 }).warnings.filter(x=>/파싱 실패/.test(x));
ok("기호값 파싱 실패 경고 없음", w.length === 0, w.join(" | "));
for (const a of [1, 2, 4, 8, 12, 20]) {
  const { solveMNA } = await import("../lib/solver/mna.ts");
  const r = solveMNA(build(a));
  ok(`a=${String(a).padStart(2)} V_B=8a/(a+8)`, close(r.nodeVoltages.B, 8*a/(a+8)),
     `${r.nodeVoltages.B.toFixed(5)} vs ${(8*a/(a+8)).toFixed(5)}`);
}

console.log("\n[4] 최대화 + 식 복원 (netlist 경로)");
const mx = maximizeOverParam(build, resistorPowerMetric("RB"), { min: 0.05, max: 60 });
ok("a* = 8, P_M = 1W", close(mx.aStar, 8, 1e-4) && close(mx.valueStar, 1, 1e-6), `a*=${mx.aStar.toFixed(5)} P=${mx.valueStar.toFixed(6)}`);
const fB = rationalizeFit(fitRationalInParam(build, nodeVoltageMetric("B")));
ok("V_B = 8a/(a+8)", fB && close(fB.num[1],8) && close(fB.den[0],8) && close(fB.den[1],1),
   fB ? `num=[${fB.num.map(v=>v.toFixed(3))}] den=[${fB.den.map(v=>v.toFixed(3))}]` : "실패");
const fP = rationalizeFit(fitRationalInParam(build, resistorPowerMetric("RB")));
ok("P_B = 32a/(a+8)^2", fP && close(fP.num[1],32) && close(fP.den[0],64) && close(fP.den[1],16),
   fP ? `num=[${fP.num.map(v=>v.toFixed(2))}] den=[${fP.den.map(v=>v.toFixed(2))}]` : "실패");

// ─── [5] 발문·정답 생성 (원본 3단계 재현) ───────────────────────────────
const { buildParamMaxPowerProblem, polyToLatex } = await import("../lib/generation/paramMaxPowerWriter.ts");
console.log("\n[5] 3단계 발문·정답 생성");
ok('polyToLatex([8,1],"a") = "a + 8"', polyToLatex([8,1],"a") === "a + 8", polyToLatex([8,1],"a"));
ok('polyToLatex([0,32],"a") = "32a"', polyToLatex([0,32],"a") === "32a", polyToLatex([0,32],"a"));

const prob = buildParamMaxPowerProblem({
  build, param: "a", targetResistorId: "RB", targetNodeId: "B",
  labels: { resistor: "R_B", voltage: "V_B", power: "P_B" },
});
ok("문제 생성됨", !!prob);
if (prob) {
  console.log("   V식:", prob.facts.vExpr);
  console.log("   P식:", prob.facts.pExpr);
  console.log("   답 :", prob.answer);
  ok("V_B = 8a/(a+8)", prob.facts.vExpr === String.raw`\dfrac{8a}{a + 8}`, prob.facts.vExpr);
  ok("P_B = 32a/(a+8)^2", prob.facts.pExpr === String.raw`\dfrac{32a}{(a + 8)^{2}}`, prob.facts.pExpr);
  ok("a* = 8", Math.abs(prob.facts.aStar - 8) < 1e-4, String(prob.facts.aStar));
  ok("P_M = 1", Math.abs(prob.facts.pMax - 1) < 1e-5, String(prob.facts.pMax));
  ok("3단계 발문", prob.question.split("\n").length === 3);
  ok("단계 문구가 원본과 같은 구성", /가 포함된 식/.test(prob.question) && /최대가 되기 위한/.test(prob.question));
}

// 극대가 없는 회로는 문제를 만들지 않아야 한다 (경계 붙음 → null)
const monotone = (a) => ({
  nodeIds: ["O"], groundId: "GND",
  resistors: [{ id: "R1", a: "O", b: "GND", R: a }],
  vsources: [{ id: "V1", a: "O", b: "GND", V: 10 }], isources: [],
});
ok("극대 없는 회로는 null 반환", buildParamMaxPowerProblem({ build: monotone, param: "a", targetResistorId: "R1" }) === null);

console.log(`\n=== 최종 ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
