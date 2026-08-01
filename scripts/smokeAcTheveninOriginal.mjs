// 2전원 테브난 최대전력 — 유사=원본 토폴로지 / 변형=두 전원망 병렬 (사용자 지정, 2026-08-01)
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcTheveninOriginal.mjs
import { generateAcTheveninMaxPower } from "../lib/generation/topologies/acTheveninMaxPower.ts";
import { writeAcTheveninMaxPowerText } from "../lib/generation/topologies/acTheveninMaxPowerTextWriter.ts";
import { renderAcTheveninOriginalCircuit, detectAcTheveninOriginal } from "../lib/renderers/acTheveninOriginalCircuitRenderer.ts";
import { detectAcTheveninMaxPower } from "../lib/renderers/acTheveninMaxPowerCircuitRenderer.ts";
import { solveComplexMna } from "../lib/solver/complexMna.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};

// ─────────────────────────────────────────────────────────────────────
console.log("\n[1] 원본 값 재현 — 독립 MNA로 손계산 대조");
// 원본: I=18∠90°A ∥ [V=9∠90°V + 0.25Ω], 상단 j3Ω + 2Ω → a, a-b에 −j3Ω, 부하 R_L
{
  const net = (opts) => {
    const nodeIds = ["n_a", "n_1", "n_v", "n_m2", "GND"];
    const resistors = [
      { id: "R_s", a: "n_v", b: "GND", R: 0.25 },
      { id: "R_top", a: "n_m2", b: "n_a", R: 2 },
    ];
    const inductors = [{ id: "L_top", a: "n_1", b: "n_m2", L: 3 }];
    const capacitors = [{ id: "C_a", a: "n_a", b: "GND", C: 1 / 3 }];
    const vsources = [{ id: "V1", a: "n_1", b: "n_v", V: opts.off ? { re: 0, im: 0 } : { re: 0, im: 9 } }];
    const isources = [];
    if (!opts.off) isources.push({ id: "I1", a: "GND", b: "n_1", I: { re: 0, im: 18 } });
    if (opts.test) isources.push({ id: "It", a: "GND", b: "n_a", I: { re: 1, im: 0 } });
    return { nodeIds, groundId: "GND", omega: 1, resistors, inductors, capacitors, vsources, isources };
  };
  const Zth = solveComplexMna(net({ off: true, test: true })).nodeVoltages["n_a"];
  const Vth = solveComplexMna(net({ off: false })).nodeVoltages["n_a"];
  // ※ 허용오차 1e-3 — solver의 ε 정규화(3.5절)가 X_L=X_C 같은 준-공진 구성에서
  //   상대오차 ~1e-5를 남긴다. 생성기는 소수 3자리로 반올림하므로 문제되지 않는다.
  const EPS = 1e-3;
  ok("Z_th = 4 − j3 Ω", Math.abs(Zth.re - 4) < EPS && Math.abs(Zth.im + 3) < EPS, `${Zth.re}+j${Zth.im}`);
  const ZthMag = Math.hypot(Zth.re, Zth.im);
  ok("|Z_th| = 5 → R_L = 5Ω", Math.abs(ZthMag - 5) < EPS, String(ZthMag));
  const VthMag = Math.hypot(Vth.re, Vth.im);
  ok("|V_th| = 18 V", Math.abs(VthMag - 18) < EPS, `${Vth.re}+j${Vth.im}`);
  const den = { re: Zth.re + ZthMag, im: Zth.im };
  const Pmax = (VthMag * VthMag) / (den.re * den.re + den.im * den.im) * ZthMag / 2;
  ok("P_max = 9 W", Math.abs(Pmax - 9) < EPS, String(Pmax));
}

// ─────────────────────────────────────────────────────────────────────
console.log("\n[2] 모드 배치 — 유사=원본형 / 변형=두 전원망 병렬");
for (let seed = 1; seed <= 8; seed++) {
  const sim = generateAcTheveninMaxPower({ seed, mode: "exam_similar" });
  const varn = generateAcTheveninMaxPower({ seed, mode: "exam_variant" });
  if (seed === 1) {
    ok("유사 → topology=original", sim.topology === "original", sim.topology);
    ok("변형 → topology=two_branch", varn.topology === "two_branch", varn.topology);
    ok("유사 netlist는 원본형 렌더러가 잡는다", detectAcTheveninOriginal(sim.netlist) === true);
    ok("유사 netlist를 변형 렌더러가 가로채지 않는다", detectAcTheveninMaxPower(sim.netlist) === false);
    ok("변형 netlist는 기존 렌더러가 잡는다", detectAcTheveninMaxPower(varn.netlist) === true);
    ok("변형 netlist를 원본형 렌더러가 가로채지 않는다", detectAcTheveninOriginal(varn.netlist) === false);
  }
  if (sim.topology !== "original" || varn.topology !== "two_branch") {
    ok(`seed${seed} 모드 배치`, false, `${sim.topology}/${varn.topology}`);
  }
}
ok("모든 seed에서 모드 배치 유지", true);

// ─────────────────────────────────────────────────────────────────────
console.log("\n[3] 유사유형 물리 자체 검산 (12 seed) — 답을 처음부터 다시 계산");
{
  let bad = 0; const notes = [];
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateAcTheveninMaxPower({ seed, mode: "exam_similar" });
    const why = [];
    const comp = (id) => g.netlist.components.find((c) => c.id === id);
    const num = (id) => parseFloat(String(comp(id)?.value ?? "").replace(/[^0-9.]/g, ""));
    const Rs = num("R_s"), Rtop = num("R_top"), XL = num("L_top"), XC = num("C_a");

    // Z_th = (Rs + Rtop + jXL) ∥ (−jXC) — 손 공식으로 독립 재계산
    const a = { re: Rs + Rtop, im: XL }, b = { re: 0, im: -XC };
    const numr = { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
    const den = { re: a.re + b.re, im: a.im + b.im };
    const d2 = den.re * den.re + den.im * den.im;
    const Z = { re: (numr.re * den.re + numr.im * den.im) / d2, im: (numr.im * den.re - numr.re * den.im) / d2 };
    if (Math.abs(Z.re - g.solution.Zth.re) > 0.01) why.push(`Z_th.re ${g.solution.Zth.re}≠${Z.re.toFixed(3)}`);
    if (Math.abs(Z.im - g.solution.Zth.im) > 0.01) why.push(`Z_th.im ${g.solution.Zth.im}≠${Z.im.toFixed(3)}`);

    const Zmag = Math.hypot(Z.re, Z.im);
    if (Math.abs(Zmag - g.solution.RL) > 0.01) why.push("R_L ≠ |Z_th|");
    if (Math.abs(Zmag - Math.round(Zmag)) > 0.02) why.push(`|Z_th|=${Zmag} 정수 아님`);

    const dd = { re: Z.re + Zmag, im: Z.im };
    const P = (g.solution.VthMag ** 2) / (dd.re * dd.re + dd.im * dd.im) * Zmag / 2;
    if (Math.abs(P - g.solution.Pmax) > 0.02) why.push(`P_max ${g.solution.Pmax}≠${P.toFixed(3)}`);
    if (Math.abs(P * 2 - Math.round(P * 2)) > 0.03) why.push(`P_max=${P} 지저분`);

    // 구조·표기
    for (const id of ["I1", "V1", "R_s", "L_top", "R_top", "C_a", "R_L"]) if (!comp(id)) why.push(`소자 ${id} 없음`);
    if (!String(comp("V1")?.value).includes("∠90°")) why.push("V 위상 90° 아님");
    if (!String(comp("I1")?.value).includes("∠90°")) why.push("I 위상 90° 아님");
    if (String(comp("R_L")?.value) !== "R_L") why.push("R_L 값이 노출됨");
    // 원본 튜플 재생성 금지
    if (Rs === 0.25 && Rtop === 2 && XL === 3 && XC === 3 && g.values.Vs === 9 && g.values.Is === 18)
      why.push("원본 튜플 재생성");

    if (why.length) { bad++; notes.push(`seed${seed}: ${[...new Set(why)].join(", ")}`); }
  }
  ok("유사유형 12 seed 전부 검산 통과", bad === 0, notes.slice(0, 3).join(" / "));
}

// ─────────────────────────────────────────────────────────────────────
console.log("\n[4] 텍스트 · 렌더러");
{
  const g = generateAcTheveninMaxPower({ seed: 5, mode: "exam_similar" });
  const t = writeAcTheveninMaxPowerText({ generation: g });
  ok("유사 본문이 원본 문구('순저항 부하')를 따른다", t.content.includes("순저항 부하"));
  ok("유사 본문에 v(t)·i(t) 페이저 단서", t.content.includes("cos(ωt + 90°)"));
  ok("발문 3단계", (t.question.match(/\[단계 \d\]/g) ?? []).length === 3);
  ok("정답에 Z_th·V_th·R_L·P_max", ["Z_th", "V_th", "R_L", "P_max"].every((k) => t.answer.includes(k)));

  const svg = renderAcTheveninOriginalCircuit(g.netlist);
  ok("원본형 SVG 생성", Boolean(svg) && svg.startsWith("<svg"));
  ok("에러 <pre> 없음", !String(svg).includes("<pre"));
  for (const l of ["a", "b", "R_L", "I", "V"]) ok(`라벨 "${l}" 포함`, String(svg).includes(l));

  const gv = generateAcTheveninMaxPower({ seed: 5, mode: "exam_variant" });
  const tv = writeAcTheveninMaxPowerText({ generation: gv });
  ok("변형 본문은 기존 문구 유지", tv.content.includes("2개의 교류 전원(전압원"));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
