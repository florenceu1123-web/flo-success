/**
 * 무한 면전하 + 무한 직선 선전하 → 합성 전계 벡터로 C₁·C₂ 역산 (임용 12번) 정적 스모크 — API 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSheetLineEfieldVector.mjs
 *
 * 배경(2026-08-03 실측): 이 원본이 `sheet_ring_efield_ratio`(면전하 + **원형 링**)로 dispatch돼
 * 전혀 다른 문제가 생성됐다. Vision이 topic을 "무한 면전하와 **원형 루프** 선전하"로 오요약한 회차.
 *
 * 물리(ε₀ = (1/36π)×10⁻⁹, [nC] 단위):
 *   E₁ = 18π·C₁ (평면에서 멀어지는 방향; P가 −x쪽이면 −a_x)
 *   E₂ = (18·C₂/ρ²)(d_x a_x + d_z a_z),  (d_x,0,d_z) = 선→P 수직벡터, ρ² = d_x²+d_z²
 *   원본(x=4 평면·(0,y,1) 선·P(1,2,−1)·E=−162π a_x−36π a_z) → **C₁=10, C₂=5π**
 */
import {
  detectSheetLineEfieldVector,
  detectSheetRingEfield,
  detectSheetLineEfieldSuperposition,
} from "@/lib/analysis/classifyElectromagnetics";
import { generateElectromagnetics } from "@/lib/generation/topologies/electromagnetics";
import { renderEmFieldDiagram } from "@/lib/renderers/emFieldRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
}
const A = (topic, interpretation, concepts = []) => ({
  subject: "전자기학", topic, interpretation, relatedConcepts: concepts,
  topicKey: "gauss_law", componentInventory: [],
});

// ── 1. 감지 ─────────────────────────────────────────────────────────────────
console.log("[1] detectSheetLineEfieldVector");
const reported = A(
  "무한 면전하와 원형 루프 선전하의 합성 전계",
  "x=4[m] 위치의 무한 평면에 면전하 밀도 C1[nC/m^2]가, x=0[m] z=1[m] 위치의 무한선에 선전하 밀도 C2[nC/m]가 균일하게 분포한다. 점 P(1,2,-1)에서 각각의 전하 분포에 의한 합성 전계 E = -162pi a_x - 36pi a_z [V/m]가 되는 면전하 밀도 C1과 선전하 밀도 C2의 값을 각각 구한다.",
  ["면전하", "선전하", "합성 전계"],
);
check("★ 실측 오분류 회차(‘원형 루프’ 오요약)를 잡는다", detectSheetLineEfieldVector(reported) === true);
check(
  "‘면전하 밀도와 선전하 밀도’ 표현",
  detectSheetLineEfieldVector(
    A("면전하·선전하 합성 전계", "무한 평면의 면전하와 무한선의 선전하가 만드는 합성 전계가 주어질 때 면전하 밀도와 선전하 밀도를 각각 구한다."),
  ) === true,
);

// ── 2. 형제 양보 ────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀");
const ring = A(
  "무한 면전하와 원형 링 선전하의 합성 전계",
  "면전하 밀도 ρ_s인 무한 평면과 반지름 R인 원형 링에 분포한 선전하 λ가 있을 때, 축 위 점 P에서 두 전계의 크기 비가 2:3이 되도록 하는 λ와 합성 전계를 구한다.",
  ["원형 루프", "합성 전계"],
);
check("진짜 원형 링(반지름 given)은 양보", detectSheetLineEfieldVector(ring) === false);
check("  ↳ 그 유형의 감지기는 정상 발화", detectSheetRingEfield(ring) === true);

const eZero = A(
  "면전하와 선전하의 합성 전계",
  "무한 면전하와 무한 선전하가 있을 때 점 P에서 합성 전계가 0이 되는 선전하 밀도 ρ_l을 구하고 점 Q에서의 합성 전계를 구한다.",
);
check("E=0 조건(미지수 1개)은 양보", detectSheetLineEfieldVector(eZero) === false);
check("  ↳ 그 유형의 감지기는 정상 발화", detectSheetLineEfieldSuperposition(eZero) === true);
check(
  "자계·면전류 문맥은 양보",
  detectSheetLineEfieldVector(
    A("면전류와 선전류의 합성 자계", "무한 면전류와 무한 선전류에 의한 합성 자계를 구하고 두 전류 밀도를 각각 구한다."),
  ) === false,
);

// ── 3. 물리 재검산 ──────────────────────────────────────────────────────────
console.log("\n[3] 생성물 물리 재검산 (독립 계산)");
let ok = 0, bad = 0;
const seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 14; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: "sheet_line_efield_vector" });
    const body = `${inst.content}\n${inst.givens.join("\n")}\n${inst.answer}\n${inst.steps.join("\n")}`;
    seen.add(body.slice(0, 200));
    const mP = /P\}\((\d+), (\d+), (-?\d+)\)/.exec(body) ?? /P\((\d+), (\d+), (-?\d+)\)/.exec(body);
    const mPlane = /x = (\d+)\\,\[\\mathrm\{m\}\]/.exec(body);
    const mLine = /z = (\d+)\\,\[\\mathrm\{m\}\]/.exec(body);
    const mC1 = /C_1 = (\d+)\\,\[\\mathrm\{nC\/m\^2\}\]/.exec(body);
    const mC2 = /C_2 = (\d*)\\pi\\,\[\\mathrm\{nC\/m\}\]/.exec(body);
    const mE = /\\mathbf\{E\} = (-?\d+)\\pi\\,\\mathbf\{a\}_x ([-+]) (\d+)\\pi\\,\\mathbf\{a\}_z/.exec(body);
    if (!mP || !mPlane || !mLine || !mC1 || !mC2 || !mE) {
      bad++; console.log(`    ✗ 파싱 실패 (${mode}/${seed})`); continue;
    }
    const px = +mP[1], pz = +mP[3], xp = +mPlane[1], zL = +mLine[1];
    const C1 = +mC1[1], C2 = (mC2[1] === "" ? 1 : +mC2[1]); // ×π
    const Ex = +mE[1], Ez = (mE[2] === "-" ? -1 : 1) * +mE[3]; // ×π
    // 독립 계산: E₁ = -18π C₁ a_x (P가 평면의 −x쪽), E₂ = 18C₂/ρ²·(dx,0,dz), C₂ = C2·π
    const dx = px - 0, dz = pz - zL, rho2 = dx * dx + dz * dz;
    const e2x = (18 * C2 * dx) / rho2, e2z = (18 * C2 * dz) / rho2; // ×π
    const okCase =
      px < xp &&
      Math.abs(-18 * C1 + e2x - Ex) < 1e-9 &&
      Math.abs(e2z - Ez) < 1e-9 &&
      Number.isInteger(e2x) && Number.isInteger(e2z);
    if (okCase) ok++;
    else { bad++; console.log(`    ✗ ${mode}/${seed} P(${px},_,${pz}) xp=${xp} zL=${zL} C1=${C1} C2=${C2}π E=(${Ex},${Ez})π → 계산 (${-18 * C1 + e2x},${e2z})π`); }
  }
}
check(`생성물 28개 재검산 — E₁+E₂ = 주어진 E (${ok} ok / ${bad} bad)`, bad === 0);
check("여러 문항이 생성된다", seen.size > 1, `distinct=${seen.size}`);

// 원본 값
{
  const dx = 1, dz = -2, rho2 = 5, C2 = 5; // ×π
  const e2x = (18 * C2 * dx) / rho2, e2z = (18 * C2 * dz) / rho2;
  check("원본(P(1,2,−1)·x=4 평면·z=1 선): C₁=10, C₂=5π → E=−162π a_x −36π a_z",
    e2x === 18 && e2z === -36 && -18 * 10 + e2x === -162);
}
let orig = false;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 50; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: "sheet_line_efield_vector" });
    const b = `${inst.content}\n${inst.answer}`;
    if (/P\(1, 2, -1\)/.test(b) && /C_1 = 10\\/.test(b)) orig = true;
  }
}
check("원본 튜플은 생성되지 않는다", orig === false);

// ── 4. 발문·figure ──────────────────────────────────────────────────────────
console.log("\n[4] 발문·figure 구조");
const sim = generateElectromagnetics({ seed: 3, mode: "exam_similar", entryId: "sheet_line_efield_vector" });
check("3단계 발문", new Set(sim.question.match(/\[단계 \d\]/g) ?? []).size === 3);
check("[단계 3]이 C₁·C₂를 각각 묻는다", /단계 3.*C_1, C_2.*각각/s.test(sim.question));
const varn = generateElectromagnetics({ seed: 3, mode: "exam_variant", entryId: "sheet_line_efield_vector" });
check("변형은 합성 전계를 구한다 (구하는 양 교환)", /단계 3.*합성 전계/s.test(varn.question));
const svg = renderEmFieldDiagram(sim.diagram);
check("figure geometry = sheet_line_vector_axes", sim.diagram?.geometry === "sheet_line_vector_axes");
check("SVG 렌더 성공", svg.startsWith("<svg") && !svg.includes("미지원"));
check("좌표축 x·y·z", [">x<", ">y<", ">z<"].every((t) => svg.includes(t)));
// ★ texToPlain이 `C_1` → `C₁`(아래첨자)로 바꿔 렌더한다 — 원문 형태로 단언하면 거짓 실패.
check("C₁·C₂·P 라벨", svg.includes("C₁") && svg.includes("C₂") && /P\(\d+, ?\d+, ?-?\d+\)/.test(svg));
check("㉠·㉡ 마커 표기", svg.includes("㉠") && svg.includes("㉡"));
check("라벨 겹침 0건", findLabelOverlaps(svg).length === 0, JSON.stringify(findLabelOverlaps(svg)));
check("LaTeX 원문이 새지 않음", !svg.includes("\\mathrm") && !svg.includes("\\pi"));

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
