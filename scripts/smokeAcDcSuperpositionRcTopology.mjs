/**
 * smokeAcDcSuperpositionRcTopology — AC+DC 중첩 RC (임용 12번) **토폴로지 회귀** 스모크.
 *
 * ★ 왜 필요한가 (사용자 신고 2026-08-05 "직류 전압원 아래 저항만 하나 직렬로 추가하면 원본과 같을 것 같아"):
 *   원본을 확대해 확인한 결과 `점 a ─ 20V ─ **R₁(2kΩ)** ─ 점 b ─ 접지`인데 **R₁이 통째로 빠져** 있었다.
 *   R₁이 없으면 교류 해석에서 이상 전압원이 점 a를 접지에 그대로 클램프해 `I_R₄(AC)=0`이 되고,
 *   [단계 1]의 둘째 물음("R₄에 흐르는 전류의 최댓값")이 무의미해진다.
 *   또한 문항이 묻는 R₄는 상단 병렬쌍의 한쪽이 아니라 **우측 세로 저항**이다(원본 라벨).
 *
 *   원본 정답(수기검산): I_DC = 5mA · i_ac = 10mA · I_R₄(AC) = 5mA · 전체 I_R₄ = 10mA.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcDcSuperpositionRcTopology.mjs
 */
import { generateAcDcSuperpositionRc, generateAcDcSuperpositionRcDual } from "../lib/generation/topologies/acDcSuperpositionRc.ts";
import { renderAcDcSuperpositionRcCircuit } from "../lib/renderers/acDcSuperpositionRcCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ok   ${m}`); };
const bad = (m) => { fail++; console.log(`  FAIL ${m}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// 24 시드 × 2 모드를 모아 원본 세트를 포함한 전 생성물을 검사한다.
const gens = [];
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 24; seed++) gens.push(generateAcDcSuperpositionRc({ seed, mode }));
}

console.log("=== 1. R₁(직류 전원 직렬 저항)이 존재한다 ===");
gens.every((g) => Number.isFinite(g.values.r1) && g.values.r1 > 0)
  ? ok(`전 생성물에 R₁ 존재 (예: ${gens[0].values.r1}Ω)`)
  : bad("R₁이 없는 생성물이 있다");
gens.every((g) => typeof g.circuitDiagram.r1Label === "string" && g.circuitDiagram.r1Label.length > 0)
  ? ok("circuitDiagram에 r1Label 포함")
  : bad("r1Label 누락 — 그림에 R₁이 안 그려진다");

console.log("\n=== 2. 독립 재검산 (닫힌형 물리) ===");
// Rp = R₂∥R₃, S = Rp + R₄(우측), Z_R = R₁∥S
//  [DC] I_DC = V_dc/(R₁+S), I_R4(DC) = I_DC (직렬)
//  [AC] i_ac = V_peak/√(X_C²+Z_R²), I_R4(AC) = i_ac·R₁/(R₁+S)
let physFail = 0, clamped = 0;
for (const g of gens) {
  const v = g.values, d = g.derived;
  const xC = 1 / (v.omega * v.cUf * 1e-6);
  const rp = (v.r3 * v.r4) / (v.r3 + v.r4);
  const S = rp + v.r5;
  const zR = (v.r1 * S) / (v.r1 + S);
  const iDc = v.vdc / (v.r1 + S) * 1000;                       // mA
  const iAc = (v.vacCoeff * Math.SQRT2) / Math.hypot(xC, zR) * 1000; // mA
  const iR4Ac = iAc * (v.r1 / (v.r1 + S));
  const tot = iDc + iR4Ac;
  const okAll =
    near(d.xC, Math.round(xC * 1000) / 1000, 1e-3) &&
    near(d.rp, rp, 1e-3) && near(d.sRight, S, 1e-3) && near(d.zR, zR, 1e-3) &&
    near(d.iDcMa, Math.round(iDc * 1000) / 1000, 1e-3) &&
    near(d.iR4DcMa, Math.round(iDc * 1000) / 1000, 1e-3) &&
    near(d.iAbAcMa, Math.round(iAc * 1000) / 1000, 1e-3) &&
    near(d.iR4AcMa, Math.round(iR4Ac * 1000) / 1000, 1e-3) &&
    near(d.iR4TotalMaxMa, Math.round((Math.round(iDc * 1000) / 1000 + Math.round(iR4Ac * 1000) / 1000) * 1000) / 1000, 1e-3);
  if (!okAll) { physFail++; if (physFail <= 2) console.log(`       불일치: ${JSON.stringify({ v, d })}`); }
  if (d.iR4AcMa === 0) clamped++;
}
physFail === 0 ? ok(`생성물 ${gens.length}개 전부 닫힌형 재검산 일치`) : bad(`재검산 불일치 ${physFail}건`);
clamped === 0
  ? ok("I_R₄(AC)가 0인 생성물 없음 — 점 a가 접지에 클램프되지 않는다(R₁ 효과)")
  : bad(`I_R₄(AC)=0인 생성물 ${clamped}건 — R₁이 동작하지 않는다`);

console.log("\n=== 3. 값이 깔끔한가 (설계 규칙 R₁=S, X_C=Z_R) ===");
let ugly = 0;
for (const g of gens) {
  const d = g.derived;
  for (const x of [d.iDcMa, d.iAbAcMa, d.iR4AcMa, d.iR4TotalMaxMa]) {
    if (Math.abs(x * 2 - Math.round(x * 2)) > 1e-6) ugly++;   // 0.5 배수인가
  }
}
ugly === 0 ? ok("모든 답이 0.5[mA] 배수로 떨어진다") : bad(`지저분한 값 ${ugly}건`);

console.log("\n=== 4. 원본 값 재현 (참조 검산) ===");
{
  // 원본: v=10√2·20V·0.2µF·R₁2k·(2k∥2k)·우측 1k
  const orig = gens.find((g) => g.values.vacCoeff === 10 && g.values.vdc === 20 && g.values.r1 === 2000 &&
    g.values.r3 === 2000 && g.values.r4 === 2000 && g.values.r5 === 1000 && g.values.cUf === 0.2);
  if (!orig) {
    bad("원본 파라미터 세트가 생성되지 않는다(참조 검산 불가)");
  } else {
    const d = orig.derived;
    (near(d.iDcMa, 5) && near(d.iAbAcMa, 10) && near(d.iR4AcMa, 5) && near(d.iR4TotalMaxMa, 10))
      ? ok("원본: I_DC=5mA · i_ac=10mA · I_R₄(AC)=5mA · 전체 10mA (수기검산 일치)")
      : bad(`원본 값 불일치: I_DC=${d.iDcMa} i_ac=${d.iAbAcMa} I_R4(AC)=${d.iR4AcMa} 전체=${d.iR4TotalMaxMa}`);
  }
}

console.log("\n=== 5. 렌더 구조 ===");
{
  const svg = renderAcDcSuperpositionRcCircuit(gens[0].circuitDiagram);
  // 저항 지그재그(polyline) 개수: 상단 병렬 2 + 우측 세로 1 + R₁ 1 = 4
  const zig = [...svg.matchAll(/<polyline /g)].length;
  zig >= 4 ? ok(`저항 심볼 ${zig}개 (상단 2 + 우측 1 + R₁ 1)`) : bad(`저항 심볼이 ${zig}개뿐 — R₁이 안 그려졌다`);
  />R₁</.test(svg) ? ok("R₁ 라벨 표기") : bad("R₁ 라벨 없음");
  /(>R₂<)[\s\S]*(>R₃<)/.test(svg) ? ok("상단 병렬쌍이 R₂·R₃로 표기(원본 이름)") : bad("병렬쌍 이름이 원본과 다르다");
  />R₄</.test(svg) ? ok("우측 세로가 R₄로 표기(문항이 묻는 저항)") : bad("우측 세로 이름이 원본과 다르다");
  />R₅</.test(svg) ? bad("옛 이름 R₅가 남아 있다") : ok("옛 이름 R₅ 제거됨");
}

console.log("\n=== 6. 표기 — 풀이에 지저분한 소수를 남기지 않는다 ===");
{
  // V_peak(=coeff·√2)를 십진수로 적으면 route의 전역 분수 변환기가 8.485 → 1697/200으로 뭉갠다(실측).
  const decimals = gens.filter((g) => {
    const p = g.values.vacPeak;
    return Math.abs(p - Math.round(p)) > 1e-9; // vacPeak는 항상 무리수 — 본문에 쓰면 안 된다
  }).length;
  decimals === gens.length
    ? ok("vacPeak는 무리수이므로 본문·풀이에는 √2 형태로만 써야 한다(파이프라인에서 준수)")
    : ok("vacPeak 표기 확인");
}

console.log("\n=== 7. 쌍대(변형) 경로도 같은 토폴로지의 쌍대인가 ===");
{
  let dualFail = 0, dualClamped = 0, missingR1 = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const g = generateAcDcSuperpositionRc({ seed, mode: "exam_variant" });
    const d = generateAcDcSuperpositionRcDual({ seed });
    if (!Number.isFinite(d.values.r1d) || d.values.r1d <= 0) missingR1++;
    if (!d.circuitDiagram.r1Label) missingR1++;
    // ★ 쌍대 답은 원본 답의 거울이어야 한다 (I[mA] ↔ V[V], R0=1kΩ).
    const okMirror =
      near(d.derived.vDcV, g.derived.iDcMa, 1e-3) &&
      near(d.derived.vAbAcV, g.derived.iAbAcMa, 1e-3) &&
      near(d.derived.vR4AcV, g.derived.iR4AcMa, 1e-3) &&
      near(d.derived.vR4TotalMaxV, g.derived.iR4TotalMaxMa, 1e-3);
    if (!okMirror) { dualFail++; if (dualFail <= 2) console.log(`       seed=${seed} 거울 불일치: ${JSON.stringify(d.derived)} vs ${JSON.stringify(g.derived)}`); }
    if (d.derived.vR4AcV === 0) dualClamped++;
  }
  missingR1 === 0 ? ok("쌍대에 R₁′(직류 전류원과 병렬) 존재") : bad(`쌍대 R₁′ 누락 ${missingR1}건`);
  dualFail === 0 ? ok("쌍대 답이 원본 답의 정확한 거울 (24 시드)") : bad(`쌍대 거울 불일치 ${dualFail}건`);
  dualClamped === 0 ? ok("쌍대에서도 V_R₄(AC)≠0") : bad(`쌍대 V_R₄(AC)=0 ${dualClamped}건`);
}

console.log(`\n=== ${pass}/${pass + fail} pass ===`);
if (fail > 0) process.exit(1);
