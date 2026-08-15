/**
 * 제너 n개 직렬 션트 정전압 → 부하 저항 범위 (임용 2번 전자회로) 정적 스모크 — API 호출 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeZenerShuntRegulator.mjs
 *
 * 배경(2026-08-03 실측): 전용 항목이 없어 `dc_mesh`(electronics fallback)로 dispatch됐고,
 * **원본을 거의 그대로 베낀 문항에 정답만 틀리게**(a=5, 실제 3) 나왔다(사용자 신고).
 *
 * 물리(닫힌형): V_L = n·V_Z,  I_S = (V_i − V_L)/a [mA]
 *   R_L 최소 ⟺ I_Z=0 → a = (V_i − V_L)·R_Lmin/V_L
 *   R_L 최대 ⟺ I_Z=I_ZM → R_Lmax = V_L/(I_S − I_ZM)
 *   원본(40V·제너2개 5V·8mA·R_Lmin 1kΩ) → V_L=10V·I_S=10mA → **a=3kΩ, R_Lmax=5kΩ**
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { generateZenerShuntRegulator } from "@/lib/generation/topologies/zenerShuntRegulator";
import { detectZenerShuntRegulator } from "@/lib/pipeline/runZenerShuntRegulatorPipeline";
import { renderZenerShuntRegulatorCircuit } from "@/lib/renderers/zenerShuntRegulatorCircuitRenderer";
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
  "제너 다이오드 정전압 회로 분석",
  "2개의 동일한 제너 다이오드를 이용한 정전압 회로에서 정전압 V_RL이 유지되도록 부하 저항 R_L을 변화시킬 때, 부하 저항의 최솟값 R_Lmin이 1kΩ이 되는 a의 값을 구하고 그 값을 이용하여 부하 저항의 최댓값 R_Lmax를 구한다. 제너 다이오드는 이상적으로 동작하고 V_Z는 제너 전압, I_ZM은 제너 최대 전류이다.",
  ["제너 다이오드", "정전압 회로", "부하 저항"],
  inv("V:40V", "R:a[kΩ]", "D:V_z=5V", "D:V_z=5V"),
);
for (const subj of ["electronics", "circuit_theory"]) {
  const c = classifyCircuitType(reported, subj);
  check(`${subj} 과목에서도 전용 archetype (실측: ${c.type})`, c.type === "zener_shunt_regulator", c.reasoning);
}
check("route 안전망도 발화", detectZenerShuntRegulator(reported) === true);

// ── 2. 형제 양보 ────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
check(
  "제너 + BJT 션트 레귤레이터는 양보",
  detectZenerShuntRegulator(
    A("제너-트랜지스터 정전압 회로", "제너 다이오드와 트랜지스터를 이용한 전압 안정화 회로에서 출력 전압과 전류를 구하고 부하 저항의 최솟값을 구한다.", [], inv("V", "R", "D", "Q")),
  ) === false,
);
check(
  "OPAMP 직렬형 레귤레이터는 양보",
  detectZenerShuntRegulator(
    A("연산 증폭기 정전압 회로", "연산 증폭기(오차 증폭기)와 제너 기준 전압, 직렬 패스 트랜지스터로 구성된 정전압 회로에서 부하 저항의 최댓값을 구한다.", [], inv("V", "R", "D", "OPAMP")),
  ) === false,
);
check(
  "범위를 안 묻는 제너 문제는 미발화",
  detectZenerShuntRegulator(
    A("제너 다이오드 정전압", "제너 다이오드로 안정화된 출력 전압과 제너 전류를 구한다.", [], inv("V", "R", "D")),
  ) === false,
);

// ── 3. 물리 재검산 ──────────────────────────────────────────────────────────
console.log("\n[3] 생성물 물리 재검산 (경계 조건 독립 확인)");
let ok = 0, bad = 0;
const seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 14; seed++) {
    const { values: v } = generateZenerShuntRegulator({ seed, mode });
    seen.add(`${v.Vi}|${v.Vz}|${v.n}|${v.Izm}|${v.RLmin}`);
    const VL = v.n * v.Vz;
    const a = ((v.Vi - VL) * v.RLmin) / VL;
    const Is = (v.Vi - VL) / a;
    const RLmax = VL / (Is - v.Izm);
    // 두 극단에서 0 ≤ I_Z ≤ I_ZM 이 성립해야 한다
    const izAtMin = Is - VL / v.RLmin;                 // = 0
    const izAtMax = Is - VL / RLmax;                   // = I_ZM
    const consistent =
      Math.abs(v.VL - VL) < 1e-9 && Math.abs(v.a - a) < 1e-9 &&
      Math.abs(v.Is - Is) < 1e-9 && Math.abs(v.RLmax - RLmax) < 1e-9 &&
      Math.abs(izAtMin) < 1e-9 && Math.abs(izAtMax - v.Izm) < 1e-9 &&
      RLmax > v.RLmin && v.Vi > VL;
    if (consistent) ok++;
    else { bad++; console.log(`    ✗ seed=${seed} ${mode} Vi=${v.Vi} Vz=${v.Vz} n=${v.n} Izm=${v.Izm}`); }
  }
}
check(`생성물 28개 재검산 — a·R_Lmax·경계 I_Z (${ok} ok / ${bad} bad)`, bad === 0);
check("여러 값 조합이 나온다", seen.size >= 8, `distinct=${seen.size}`);

// 원본 값
{
  const Vi = 40, Vz = 5, n = 2, Izm = 8, RLmin = 1;
  const VL = n * Vz, a = ((Vi - VL) * RLmin) / VL, Is = (Vi - VL) / a, RLmax = VL / (Is - Izm);
  check("원본(40V·제너2개 5V·8mA·1kΩ) → V_L=10V, a=3kΩ, R_Lmax=5kΩ", VL === 10 && a === 3 && RLmax === 5);
}
let orig = false;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 60; seed++) {
    const { values: v } = generateZenerShuntRegulator({ seed, mode });
    if (v.Vi === 40 && v.Vz === 5 && v.n === 2 && v.Izm === 8 && v.RLmin === 1) orig = true;
  }
}
check("원본 튜플은 생성되지 않는다", orig === false);
{
  const sim = new Set(), varn = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const a = generateZenerShuntRegulator({ seed, mode: "exam_similar" }).values;
    const b = generateZenerShuntRegulator({ seed, mode: "exam_variant" }).values;
    sim.add(`${a.Vi}|${a.Vz}|${a.n}|${a.Izm}|${a.RLmin}`);
    varn.add(`${b.Vi}|${b.Vz}|${b.n}|${b.Izm}|${b.RLmin}`);
  }
  check("유사·변형 값 풀이 겹치지 않는다", [...sim].filter((x) => varn.has(x)).length === 0);
}

// ── 4. 렌더 ─────────────────────────────────────────────────────────────────
console.log("\n[4] figure 구조");
const { values: g, labels: L } = generateZenerShuntRegulator({ seed: 6, mode: "exam_similar" });
const svg = renderZenerShuntRegulatorCircuit({ ...L, zenerCount: g.n });
check("SVG 렌더 성공", svg.startsWith("<svg"));
check("입력 전원·직렬 저항·부하 라벨", [L.viLabel, L.aLabel, L.rlLabel].every((x) => svg.includes(x)));
check("제너 사양 V_Z·I_ZM 표시", svg.includes(L.vzLabel) && svg.includes(L.izmLabel));
check("V_RL 극성 +/− 표시", svg.includes(">+<") && svg.includes(">−<"));
check(
  `제너 ${g.n}개가 그려진다`,
  (svg.match(/M[\d.]+,[\d.]+ L[\d.]+,[\d.]+ L[\d.]+,[\d.]+ Z/g) ?? []).length === g.n,
);
check("라벨 겹침 0건", findLabelOverlaps(svg).length === 0, JSON.stringify(findLabelOverlaps(svg)));
const outside = [
  ...[...svg.matchAll(/(?:cx|x1|x2|x)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 640 })),
  ...[...svg.matchAll(/(?:cy|y1|y2|y)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 300 })),
].filter((c) => c.v < 0 || c.v > c.lim);
check("캔버스(640×300) 이탈 0건", outside.length === 0, JSON.stringify(outside.slice(0, 4)));

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
