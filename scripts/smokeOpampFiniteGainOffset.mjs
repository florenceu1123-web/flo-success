// 유한 이득 OPAMP + 출력단 오프셋 전압원 V_B (임용 9번 전자회로) — 전용 archetype 스모크 (API 없음)
//
//  검증: (1) 라우팅(실측 요약 + 표현 변형 + 형제 회귀), (2) 원본 물리, (3) 생성물 독립 재검산, (4) 렌더 구조.
//  실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOpampFiniteGainOffset.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectOpampFiniteGainOffset } from "../lib/pipeline/runOpampFiniteGainOffsetPipeline.ts";
import { generateOpampFiniteGainOffset } from "../lib/generation/topologies/opampFiniteGainOffset.ts";
import { renderOpampFiniteGainOffsetCircuit } from "../lib/renderers/opampFiniteGainOffsetCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  ✅ ${label}`); } else { fail++; console.log(`  ❌ ${label}`); } };

const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const INV_ORIG = inv("OPAMP", "R:99kΩ", "R:1kΩ", "V:10sin(2000πt)V", "V:1V");

// ── (1) 라우팅 ────────────────────────────────────────────────────────
console.log("\n[1] 라우팅 (분류기 + 안전망)");
const ROUTES = [
  ["실측 요약 (V_B 명시)", mk("OPAMP 회로 해석",
    "개루프 이득이 A_0인 연산증폭기 회로에서 되먹임 저항으로 결정되는 β를 구하고, 출력단에 직렬로 연결된 전압원 V_B를 고려하여 V_out = V_D - V_B 로부터 출력전압을 구한다.",
    ["개루프 이득", "되먹임", "출력 전압원"], INV_ORIG), "electronics", "opamp_finite_gain_offset"],
  ["표현 변형 — 영문 open-loop", mk("Op-amp circuit analysis",
    "The op-amp has a finite open-loop gain A_0. A DC source V_B is connected in series at the output so that V_out = V_D - V_B.",
    ["open-loop gain", "feedback"], INV_ORIG), "electronics", "opamp_finite_gain_offset"],
  ["표현 변형 — V_B 미언급(인벤토리 구조로)", mk("OPAMP 회로 해석",
    "개방 루프 이득 A_0를 갖는 연산증폭기 회로에서 반전 단자의 전압과 출력전압의 관계를 단계별로 구한다.",
    ["연산증폭기", "개루프 이득"], INV_ORIG), "electronics", "opamp_finite_gain_offset"],
  ["과목 오선택(회로이론)에도 잡힘", mk("OPAMP 회로 해석",
    "개루프 이득 A_0와 출력단 직류 전압원 V_B가 있는 연산증폭기 회로에서 V_out = V_D - V_B로 출력전압을 구한다.",
    ["개루프 이득"], INV_ORIG), "circuit_theory", "opamp_finite_gain_offset"],
  // ── 형제 회귀 ──
  ["형제 회귀 — 유한 이득 + 블록도 (임용 11번)", mk("OPAMP 유한 개방루프 이득과 블록도",
    "개방 루프 이득이 A(s)=A_0ω_0/(s+ω_0)인 반전증폭기 회로와 블록도가 주어질 때 중첩의 원리로 α·β를 구하고 반전 입력 단자 V^-를 mV로 구한다.",
    ["개방 루프 이득", "블록도", "중첩의 원리"], inv("OPAMP", "R:1kΩ", "R:99kΩ", "V:0.1V")), "electronics", "opamp_finite_gain_block"],
  ["형제 회귀 — 정귀환 + SW step (임용 6번)", mk("정귀환 연산증폭기 회로",
    "정귀환(positive feedback)이 가해진 연산증폭기에서 개방 루프 이득 A(s)와 스위치 step 입력으로 β·B·D를 구하고 상수 K를 도출한다.",
    ["정귀환", "개방 루프 이득", "A(s)", "스위치"], inv("OPAMP", "R:1kΩ", "R:9kΩ", "V:1V", "SW")), "electronics", "opamp_positive_feedback"],
];
for (const [name, a, subject, want] of ROUTES) {
  const got = classifyCircuitType(a, subject).type;
  ok(got === want, `${name} → ${got}${got === want ? "" : ` (기대: ${want})`}`);
}
// 안전망 (stale 방어)
ok(detectOpampFiniteGainOffset(ROUTES[0][1]) === true, "detect: 실측 요약 발화");
ok(detectOpampFiniteGainOffset(ROUTES[2][1]) === true, "detect: V_B 미언급도 인벤토리로 발화");
ok(detectOpampFiniteGainOffset(ROUTES[4][1]) === false, "detect: 블록도(임용 11번)엔 양보");
ok(detectOpampFiniteGainOffset(ROUTES[5][1]) === false, "detect: 정귀환(임용 6번)엔 양보");

// ── (2) 원본 물리 (참조값, 생성 풀에서는 제외돼야 함) ────────────────
console.log("\n[2] 원본 물리 검산 (A₀=100·R₁=99k·R₂=1k·V_B=1V·v_in=10sin(2000πt))");
{
  const beta = 99 / 100, denom = 1 + 100 * beta, gain = 100 / denom, off = 1 / denom;
  ok(Math.abs(beta - 0.99) < 1e-12, `β = ${beta}`);
  ok(denom === 100, `1 + A₀β = ${denom}`);
  ok(gain === 1, `이득 A₀/(1+A₀β) = ${gain}`);
  ok(Math.abs(off - 0.01) < 1e-12, `오프셋 V_B/(1+A₀β) = ${off}`);
}

// ── (3) 생성물 독립 재검산 ────────────────────────────────────────────
console.log("\n[3] 생성물 재검산 (양 모드 × 12개)");
{
  let bad = 0, origHit = 0;
  const seen = { exam_similar: new Set(), exam_variant: new Set() };
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 0; s < 12; s++) {
      const g = generateOpampFiniteGainOffset({ seed: s * 7 + 1, mode });
      const v = g.values, a = g.answer;
      const beta = v.r1k / (v.r1k + v.r2k);
      const denom = 1 + v.a0 * beta;
      const gain = v.a0 / denom, off = v.vb / denom;
      if (!Number.isInteger(denom) || !Number.isInteger(gain)) bad++;
      if (Math.abs(a.denom - denom) > 1e-9 || Math.abs(a.gain - gain) > 1e-9 || Math.abs(a.offset - off) > 1e-9) bad++;
      if (!a.voutText.includes(String(gain * v.vinAmp)) || !a.voutText.includes(String(off))) bad++;
      if (v.a0 === 100 && v.r1k === 99 && v.r2k === 1 && v.vb === 1 && v.vinAmp === 10 && v.freqHz === 1000) origHit++;
      seen[mode].add([v.a0, v.r1k, v.r2k, v.vb, v.vinAmp, v.freqHz].join("/"));
    }
  }
  ok(bad === 0, `24개 생성물 물리·표기 일치 (불일치 ${bad})`);
  ok(origHit === 0, "원본 튜플(100·99k·1k·1V·10V·1kHz) 미생성");
  const overlap = [...seen.exam_similar].filter((k) => seen.exam_variant.has(k)).length;
  ok(overlap === 0, `유사·변형 값 풀 분리 (겹침 ${overlap})`);
  ok(seen.exam_similar.size >= 3 && seen.exam_variant.size >= 3,
    `모드별 다양성 (유사 ${seen.exam_similar.size}종 / 변형 ${seen.exam_variant.size}종)`);
}

// ── (4) 렌더 구조 ─────────────────────────────────────────────────────
console.log("\n[4] 렌더 구조");
{
  const g = generateOpampFiniteGainOffset({ seed: 3, mode: "exam_similar" });
  const svg = renderOpampFiniteGainOffsetCircuit(g.circuitDiagram);
  ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), "SVG 생성");
  for (const token of ["V⁻", "V⁺", "V_D", "V_out", "R_1", "R_2", "V_B", "A_0"])
    ok(svg.includes(token), `라벨 포함: ${token}`);
  ok((svg.match(/<path /g) ?? []).length >= 3, "OPAMP 삼각형 + 저항 지그재그 존재");
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
