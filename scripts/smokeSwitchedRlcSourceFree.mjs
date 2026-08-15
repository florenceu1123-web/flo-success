/**
 * t=0 스위치 개방 → 무전원 직렬 RLC 자연응답 (임용 5번 회로이론) 정적 스모크 — API 호출 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSwitchedRlcSourceFree.mjs
 *
 * 배경(2026-08-03 실측): 이 원본이 `switched_rlc_step`(v1: SPDT + **전류원** + R_c+L 병렬가지)로
 * dispatch돼 **원본에 없는 전류원과 SPDT 스위치**가 있는 회로로 변질됐다(사용자 신고).
 *
 * 물리(닫힌형, RK4 교차검증):
 *   t<0: C 개방·L 단락 → i(0)=0, v(0) = V_s·R_p/(R_s+R_p)
 *   t>0: 전원 분리 → R=R_p+R_3 인 **무전원 직렬 RLC** → i'' + (R/L)i' + (1/LC)i = 0
 *        임계제동(α=R/2L=ω₀) → i(t) = −(v₀/L)·t·e^(−αt),  v(t) = v₀(1+αt)e^(−αt)
 *   원본(25V·10Ω·40Ω·60Ω·5H·2e-3F): v(0)=20V, α=10 → i(t) = −4t·e^(−10t)
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { generateSwitchedRlcSourceFree } from "@/lib/generation/topologies/switchedRlcSourceFree";
import { detectSwitchedRlcSourceFree } from "@/lib/pipeline/runSwitchedRlcSourceFreePipeline";
import { detectSwitchedRlcDualSwitch } from "@/lib/pipeline/runSwitchedRlcDualSwitchPipeline";
import { renderSwitchedRlcSourceFreeCircuit } from "@/lib/renderers/switchedRlcSourceFreeCircuitRenderer";
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
  "RLC 회로의 과도 응답 분석",
  "그림은 t=0에서 스위치가 개방되는 RLC 회로이다. t>0에서 전류 i(t)를 해석 절차에 따라 구한다. t<0에서 회로는 직류 정상 상태를 가정한다. 커패시터 전압의 초깃값과 인덕터 전류의 초깃값을 구하고, 기본회로소자의 전압 방정식을 이용하여 i(t)에 대한 2차 미분방정식을 구한 뒤 i(t)를 구한다.",
  ["과도 응답", "2차 미분방정식", "초깃값"],
  inv("V:25V", "R:10Ω", "SW", "R:40Ω", "R:60Ω", "C:2e-3F", "L:5H"),
);
const cls = classifyCircuitType(reported, "circuit_theory");
check(`분류가 전용 archetype으로 (실측: ${cls.type})`, cls.type === "switched_rlc_source_free", cls.reasoning);
check("route 안전망도 발화", detectSwitchedRlcSourceFree(reported) === true);
check(
  "'스위치가 열린다' 표현 변형",
  detectSwitchedRlcSourceFree(
    A("스위치 개방 RLC 과도응답", "t=0에서 스위치가 열리면 전원이 분리되고 무전원 RLC 회로의 자연 응답이 나타난다. 정상 상태 초깃값으로부터 미분방정식을 푼다.",
      [], inv("V", "R", "SW", "R", "R", "C", "L")),
  ) === true,
);

// ── 2. 형제 양보 ────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
const withIsrc = A(
  "스위치 RLC 과도응답 (전류원 포함)",
  "t=0에서 스위치가 개방되는 회로로 전압원과 전류원이 함께 있다. 과도 응답을 미분방정식으로 구한다.",
  [], inv("V", "I", "R", "SW", "C", "L"),
);
check("전류원이 있으면 양보 (switched_rlc_step 소관)", detectSwitchedRlcSourceFree(withIsrc) === false);

const dual = A(
  "두 스위치 RLC 과도응답",
  "t=0에서 스위치 SW1이 닫히고 SW2가 접점 b에서 c로 이동한다. 초기 조건을 구하고 v_c에 대한 2차 미분방정식을 세운다.",
  [], inv("V", "V", "SW", "SW", "R", "R", "L", "C"),
);
check("전압원 2개(dual_switch)는 양보", detectSwitchedRlcSourceFree(dual) === false);
check("  ↳ 그 유형의 감지기는 정상 발화", detectSwitchedRlcDualSwitch(dual) === true);
check(
  "스위치가 '닫히는' 회로는 양보",
  detectSwitchedRlcSourceFree(
    A("RLC 과도", "t=0에서 스위치가 닫히면 전원이 인가되어 과도 응답이 나타난다. 미분방정식을 푼다.", [], inv("V", "R", "SW", "C", "L")),
  ) === false,
);
check(
  "교류·페이저는 양보",
  detectSwitchedRlcSourceFree(
    A("교류 RLC", "t=0에서 스위치가 개방되는 교류 회로의 페이저 해석으로 과도 응답을 구한다.", [], inv("V", "R", "SW", "C", "L")),
  ) === false,
);

// ── 3. 물리 재검산 ──────────────────────────────────────────────────────────
console.log("\n[3] 생성물 물리 재검산 (RK4 교차검증)");
function rk4(R, L, C, v0, T) {
  const f = (i, v) => [(-v - R * i) / L, i / C];
  let i = 0, v = v0;
  const h = Math.min(1e-5, T / 20000);
  for (let t = 0; t < T - 1e-12; t += h) {
    const k1 = f(i, v);
    const k2 = f(i + (h / 2) * k1[0], v + (h / 2) * k1[1]);
    const k3 = f(i + (h / 2) * k2[0], v + (h / 2) * k2[1]);
    const k4 = f(i + h * k3[0], v + h * k3[1]);
    i += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    v += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }
  return [i, v];
}
let ok = 0, bad = 0;
const seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 12; seed++) {
    const { values: g, answer: a } = generateSwitchedRlcSourceFree({ seed, mode });
    seen.add(`${g.Vs}|${g.Rs}|${g.Rp}|${g.R3}|${g.alpha}`);
    const R = g.Rp + g.R3;
    const v0 = (g.Vs * g.Rp) / (g.Rs + g.Rp);
    const critical = Math.abs(R / (2 * g.L) - 1 / Math.sqrt(g.L * g.C)) < 1e-9 && Math.abs(g.alpha - R / (2 * g.L)) < 1e-9;
    const ip0 = -v0 / g.L;
    const T = 1 / g.alpha; // 특성 시간
    const [iNum, vNum] = rk4(R, g.L, g.C, v0, T);
    const iClosed = ip0 * T * Math.exp(-g.alpha * T);
    const vClosed = v0 * (1 + g.alpha * T) * Math.exp(-g.alpha * T);
    const match = Math.abs(iNum - iClosed) < 1e-7 && Math.abs(vNum - vClosed) < 1e-6;
    const fieldsOk = a.v0 === v0 && a.i0 === 0 && a.R === R && Math.abs(a.ip0 - ip0) < 1e-9;
    if (critical && match && fieldsOk) ok++;
    else { bad++; console.log(`    ✗ seed=${seed} ${mode} crit=${critical} match=${match} fields=${fieldsOk}`); }
  }
}
check(`생성물 24개 재검산 — 임계제동·닫힌형·RK4 (${ok} ok / ${bad} bad)`, bad === 0);
// ★ 표기 회귀: 가수가 세 자리인 커패시턴스(`125×10⁻⁵[F]`)가 문항에 그대로 나갔다(실측).
{
  const dirty = [];
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let seed = 1; seed <= 40; seed++) {
      const { values: g } = generateSwitchedRlcSourceFree({ seed, mode });
      const m = /^(\d+)×10/.exec(g.cLabel);
      if (!m || Number(m[1]) > 99) dirty.push(g.cLabel);
    }
  }
  check("커패시턴스 가수는 두 자리 이하", dirty.length === 0, JSON.stringify([...new Set(dirty)].slice(0, 4)));
}
check("여러 값 조합이 나온다", seen.size >= 6, `distinct=${seen.size}`);

// 원본 값
{
  const R = 100, L = 5, C = 2e-3, v0 = 20;
  const alpha = R / (2 * L), w0 = 1 / Math.sqrt(L * C);
  const [iNum] = rk4(R, L, C, v0, 0.2);
  check(
    "원본(25V·10Ω·40Ω·60Ω·5H·2e-3F): v(0)=20V, 임계제동 α=ω₀=10, i(t)=−4t·e^(−10t)",
    alpha === 10 && w0 === 10 && Math.abs(iNum - (-4 * 0.2 * Math.exp(-2))) < 1e-8,
  );
}
let orig = false;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 60; seed++) {
    const { values: g } = generateSwitchedRlcSourceFree({ seed, mode });
    if (g.Vs === 25 && g.Rs === 10 && g.Rp === 40 && g.R3 === 60 && g.alpha === 10) orig = true;
  }
}
check("원본 튜플은 생성되지 않는다", orig === false);

// ── 4. 렌더 ─────────────────────────────────────────────────────────────────
console.log("\n[4] figure 구조");
const { values: g } = generateSwitchedRlcSourceFree({ seed: 4, mode: "exam_similar" });
const svg = renderSwitchedRlcSourceFreeCircuit({
  vsLabel: g.vsLabel, rsLabel: g.rsLabel, rpLabel: g.rpLabel,
  r3Label: g.r3Label, cLabel: g.cLabel, lLabel: g.lLabel,
});
check("SVG 렌더 성공", svg.startsWith("<svg"));
check("소자 라벨 6종 표시", [g.vsLabel, g.rsLabel, g.rpLabel, g.r3Label, g.cLabel, g.lLabel].every((x) => svg.includes(x)));
check("t=0 스위치 표기", svg.includes("t=0"));
check("측정량 v(t)·i(t) 표기", svg.includes("v(t)") && svg.includes("i(t)"));
check("라벨 겹침 0건", findLabelOverlaps(svg).length === 0, JSON.stringify(findLabelOverlaps(svg)));
const outside = [
  ...[...svg.matchAll(/(?:cx|x1|x2|x)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 660 })),
  ...[...svg.matchAll(/(?:cy|y1|y2|y)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 320 })),
].filter((c) => c.v < 0 || c.v > c.lim);
check("캔버스(660×320) 이탈 0건", outside.length === 0, JSON.stringify(outside.slice(0, 4)));

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
