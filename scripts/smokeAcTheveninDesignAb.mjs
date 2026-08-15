/**
 * 교류 테브난 → 소자 값 a·b 설계 + 최대 평균전력 (임용 7번 회로이론) 정적 스모크 — API 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcTheveninDesignAb.mjs
 *
 * 배경(2026-08-03 실측): 이 원본이 `ac_bridge_max_power`(브리지 4-arm + 순저항 R_L)로 dispatch돼
 * 전혀 다른 회로가 생성됐다(사용자 신고). 형제들은 **부하**를 구하는데 이 유형만 **회로 소자 값**을 구한다.
 *
 * 물리(닫힌형, 복소 연산 교차검증):
 *   Z_TH = (a+jb) ∥ (−jb) = b²/a − jb,  V_TH = V·(−jb)/a,  |V_TH| = |V|·b/a
 *   Z_L = Z_TH* → b = X_L, a = X_L²/R_L,  **P_max = |V|²/(4a)** (b가 약분)
 *   원본(V=8∠90°, Z_L=2+j2) → a=2, b=2, Z_TH=2−j2, V_TH=8∠0°, **P_max = 8[W]**
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { generateAcTheveninDesignAb } from "@/lib/generation/topologies/acTheveninDesignAb";
import { detectAcTheveninDesignAb } from "@/lib/pipeline/runAcTheveninDesignAbPipeline";
import { renderAcTheveninDesignAbCircuit } from "@/lib/renderers/acTheveninDesignAbCircuitRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
}
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const A = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});

// ── 1. 라우팅 ───────────────────────────────────────────────────────────────
console.log("[1] 분류·감지 — 실측 오분류 회차 재현");
const reported = A(
  "RLC 회로의 테브난 등가 해석",
  "교류 전원이 포함된 RLC 회로에서 테브난의 등가 회로를 활용하여 부하 Z_L에 전달되는 평균 전력이 최대가 되기 위한 a, b의 값과 부하에 공급되는 최대 평균 전력 P_L[W]을 구한다. 단자 A-B 사이의 테브난 등가 임피던스 Z_TH와 테브난 등가 전압 V_TH를 a, b가 포함된 수식으로 나타낸다. 상단에 a[Ω]과 jb[Ω]이 직렬로 있고 −jb[Ω]이 병렬로 연결되어 있다.",
  ["테브난 등가", "최대 평균 전력", "임피던스 정합"],
  inv("V:8∠90°V", "R:2Ω", "C:-j3Ω", "R:a[Ω]", "L:jb[Ω]", "C:-jb[Ω]", "R:2Ω", "L:j2Ω"),
);
const cls = classifyCircuitType(reported, "circuit_theory");
check(`분류가 전용 archetype으로 (실측: ${cls.type})`, cls.type === "ac_thevenin_design_ab", cls.reasoning);
check("route 안전망도 발화", detectAcTheveninDesignAb(reported) === true);

// ★★ 최악 회차: Vision이 요약에서 a·b를 **통째로 흘렸다**. 남는 신호는 인벤토리의 기호 소자 값뿐.
const degraded = A(
  "RLC 회로의 테브난 등가와 최대 전력",
  "이 문제는 교류 전원이 포함된 RLC 회로에서 테브난 등가 회로를 구하고, 부하에 전달되는 최대 평균 전력을 계산하는 문제입니다. 단자 A-B 사이의 테브난 등가 임피던스를 구하고, 그에 따라 부하에 전달되는 최대 전력을 계산하는 단계로 구성됩니다.",
  ["테브난 등가 회로", "최대 전력 전달 정리", "임피던스", "페이저 해석"],
  inv("V:8∠90°V", "R:2Ω", "C:-j3[Ω]", "R:a[Ω]", "L:jb[Ω]", "C:-jb[Ω]", "R:2Ω", "L:j2[Ω]"),
);
check(
  "★ a·b를 흘린 회차도 인벤토리 기호 값으로 잡는다 (분류)",
  classifyCircuitType(degraded, "circuit_theory").type === "ac_thevenin_design_ab",
  classifyCircuitType(degraded, "circuit_theory").type,
);
check("★ 그 회차의 route 안전망도 발화", detectAcTheveninDesignAb(degraded) === true);

// ── 2. 형제 양보 ────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
check(
  "AC 브리지 최대전력은 양보",
  detectAcTheveninDesignAb(
    A("AC 브리지 테브난 최대전력", "교류원과 브리지 4-arm 회로에서 단자 A-B의 테브난 등가를 구하고 순저항 부하 R_L에 최대 평균 전력을 전달하는 R_L을 구한다.", [], inv("V", "R", "L", "C")),
  ) === false,
);
check(
  "점선 박스 2개(two_box)는 양보",
  detectAcTheveninDesignAb(
    A("두 회로망 테브난 최대전력", "점선 박스 2개가 단자 a-b와 c-d를 내놓고 병렬로 부하를 구동한다. 테브난 등가와 최대 평균 전력을 구한다."),
  ) === false,
);
check(
  "종속전원 테브난은 양보",
  detectAcTheveninDesignAb(
    A("종속전원 테브난", "종속 전원이 포함된 페이저 회로에서 단락전류법으로 테브난 임피던스를 구하고 최대 평균 전력을 구한다."),
  ) === false,
);
check(
  "소자 값 설계가 아니면 미발화 (사다리형)",
  detectAcTheveninDesignAb(
    A("AC 사다리 테브난", "단일 교류원과 L-C-R 사다리 회로에서 테브난 등가를 구하고 복소 켤레 부하 Z_L과 최대 평균 전력을 구한다."),
  ) === false,
);

// ── 3. 물리 재검산 (복소 연산 독립 계산) ────────────────────────────────────
console.log("\n[3] 생성물 물리 재검산");
const C = (re, im) => ({ re, im });
const add = (x, y) => C(x.re + y.re, x.im + y.im);
const mul = (x, y) => C(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);
const div = (x, y) => { const d = y.re * y.re + y.im * y.im; return C((x.re * y.re + x.im * y.im) / d, (x.im * y.re - x.re * y.im) / d); };
const abs = (x) => Math.hypot(x.re, x.im);

let ok = 0, bad = 0;
const seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 14; seed++) {
    const v = generateAcTheveninDesignAb({ seed, mode }).values;
    seen.add(`${v.a}|${v.b}|${v.Vm}|${v.theta}`);
    // 회로에서 직접 계산 (일반식에 의존하지 않는다)
    const Zser = C(v.a, v.b), Zsh = C(0, -v.b);
    const Zth = div(mul(Zser, Zsh), add(Zser, Zsh));
    const th = (v.theta * Math.PI) / 180;
    const V = C(v.Vm * Math.cos(th), v.Vm * Math.sin(th));
    const Vth = mul(V, div(Zsh, add(Zser, Zsh)));
    const pmax = (abs(Vth) ** 2) / (4 * Zth.re);
    const consistent =
      Math.abs(Zth.re - v.RL) < 1e-9 &&            // R_TH = R_L (켤레정합)
      Math.abs(Zth.im + v.XL) < 1e-9 &&            // X_TH = −X_L
      Math.abs(abs(Vth) - v.vthMag) < 1e-9 &&
      Math.abs(pmax - v.Pmax) < 1e-9 &&
      Math.abs(pmax - (v.Vm * v.Vm) / (4 * v.a)) < 1e-9; // 일반식 P = |V|²/(4a)
    if (consistent) ok++;
    else { bad++; console.log(`    ✗ ${mode}/${seed} a=${v.a} b=${v.b} V=${v.Vm}∠${v.theta} → Zth=${Zth.re}${Zth.im}j P=${pmax}`); }
  }
}
check(`생성물 28개 재검산 — Z_TH·V_TH·켤레정합·P_max (${ok} ok / ${bad} bad)`, bad === 0);
check("여러 값 조합이 나온다", seen.size >= 8, `distinct=${seen.size}`);

// 원본 값
{
  const Zser = C(2, 2), Zsh = C(0, -2);
  const Zth = div(mul(Zser, Zsh), add(Zser, Zsh));
  const Vth = mul(C(0, 8), div(Zsh, add(Zser, Zsh)));
  check(
    "원본(V=8∠90°, a=b=2): Z_TH=2−j2, |V_TH|=8, P_max=8W",
    Math.abs(Zth.re - 2) < 1e-9 && Math.abs(Zth.im + 2) < 1e-9 &&
      Math.abs(abs(Vth) - 8) < 1e-9 && Math.abs((abs(Vth) ** 2) / (4 * Zth.re) - 8) < 1e-9,
  );
}
let orig = false;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 60; seed++) {
    const v = generateAcTheveninDesignAb({ seed, mode }).values;
    if (v.a === 2 && v.b === 2 && v.Vm === 8 && v.theta === 90) orig = true;
  }
}
check("원본 튜플은 생성되지 않는다", orig === false);

// ── 4. 렌더 ─────────────────────────────────────────────────────────────────
console.log("\n[4] figure 구조");
const v = generateAcTheveninDesignAb({ seed: 5, mode: "exam_similar" }).values;
const svg = renderAcTheveninDesignAbCircuit({
  vLabel: `V=${v.Vm}∠${v.theta}°[V]`, rdLabel: `${v.Rd}[Ω]`, xdLabel: `−j${v.Xd}[Ω]`,
  aLabel: "a[Ω]", jbLabel: "jb[Ω]", shuntLabel: "−jb[Ω]",
  zlRLabel: `${v.RL}[Ω]`, zlXLabel: `j${v.XL}[Ω]`,
});
check("SVG 렌더 성공", svg.startsWith("<svg"));
check("미지 소자 a·jb·−jb 표기", svg.includes("a[Ω]") && svg.includes("jb[Ω]") && svg.includes("−jb[Ω]"));
check("단자 A·B와 Z_L 박스", svg.includes(">A<") && svg.includes(">B<") && svg.includes("Z_L") && svg.includes("stroke-dasharray"));
check("distractor 션트 표기", svg.includes(`${v.Rd}[Ω]`) && svg.includes(`−j${v.Xd}[Ω]`));
check("라벨 겹침 0건", findLabelOverlaps(svg).length === 0, JSON.stringify(findLabelOverlaps(svg)));
const outside = [
  ...[...svg.matchAll(/(?:cx|x1|x2|x)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 700 })),
  ...[...svg.matchAll(/(?:cy|y1|y2|y)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 320 })),
].filter((c) => c.v < 0 || c.v > c.lim);
check("캔버스(700×320) 이탈 0건", outside.length === 0, JSON.stringify(outside.slice(0, 4)));

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
