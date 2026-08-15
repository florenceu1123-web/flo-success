// 임용 30번 — Wien bridge **수치 설계형** (wien_bridge_design) ★결정론 archetype★
//   기존 기호형 WIEN_BRIDGE_OSCILLATOR(β(s)·특성방정식)와 갈리는 지점은 "수치를 주고 값을 구하는가"다.
import {
  __spaces, generateWienBridgeDesign, matchesWienBridgeDesign, computeF0, PI_APPROX,
} from "../lib/generation/topologies/wienBridgeDesign.ts";
import {
  detectWienBridgeDesign, runWienBridgeDesignPipeline,
} from "../lib/pipeline/runWienBridgeDesignPipeline.ts";
import { validateWienNetwork } from "../lib/validators/validateWienNetwork.ts";
import { generateWienBridgeOscillator } from "../lib/generation/analog/wienBridgeOscillator.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: [], tags: [], learningObjective: {} });

console.log("\n[1] 원본 물리 재현 (독립 계산)");
{
  const f0 = computeF0(50, 16);
  ok("RC = 8e-4 s", Math.abs(50e3 * 16e-9 - 8e-4) < 1e-12);
  ok("f0 ≈ 199.04 Hz", Math.abs(f0 - 199.04) < 0.05, f0.toFixed(3));
  ok("반올림하면 200 Hz", __spaces.roundNice(f0) === 200, String(__spaces.roundNice(f0)));
  ok("이득 조건: 22/10 → A_v = 3.2 > 3", Math.abs((1 + 22 / 10) - 3.2) < 1e-9);
  ok("① 10/11 → A_v = 2.1 < 3 (발진 안 함)", 1 + 11 / 10 < 3);
  ok("④ 22/10 → A_v = 1.45 < 3 (발진 안 함)", 1 + 10 / 22 < 3);
  ok("π는 3.14로 계산", PI_APPROX === 3.14);
}

console.log("\n[2] 라우팅 — 수치 설계형만 잡는다");
const POS = [
  ["실측형 요약", mk("빈브리지(Wien bridge) 발진회로",
    "발진기가 안정적이고 지속적으로 동작하기 위한 저항 R_1, R_2와 공진주파수 f_0로 가장 적절한 것을 고르는 문제이다. RC망은 50kΩ과 16nF이다.", ["발진", "빈브리지"])],
  ["짧은 요약", mk("Wien bridge 발진회로", "저항 값과 공진 주파수를 구한다.", [])],
  ["단위 표기만 남은 회차", mk("빈브릿지 발진기", "50kΩ, 16nF의 RC 회로망을 쓰는 발진회로의 R_1, R_2를 정한다.", [])],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesWienBridgeDesign(a) === true);
  ok(`안전망: ${n}`, detectWienBridgeDesign(a) === true);
}
const NEG = [
  ["기호형 Wien (형제)", mk("Wien bridge 발진회로",
    "전달특성 β(s)의 표준형을 구하고 특성방정식 1-Kβ(s)=0에서 R_3/R_1을 구한다. 블록도가 함께 주어진다.", [])],
  ["위상천이 발진기", mk("위상천이 발진기", "3단 RC 위상천이망의 발진 조건과 주파수를 구한다.", [])],
  ["함수발생기", mk("비정현파 발진기", "슈미트 비교기와 적분기로 구형파·삼각파를 만든다.", [])],
  ["루프이득 안정도", mk("연산증폭기 루프이득", "루프이득 L(s)와 특성방정식의 근이 좌반평면에 있을 조건을 구한다.", [])],
  ["T형 RC 발진기", mk("T형 RC망 발진기", "전달특성을 구하고 출력단자를 입력단자에 연결한다.", [])],
  ["Wien 아님", mk("능동 저역통과 필터", "차단주파수와 대역폭을 구한다. 50kΩ, 16nF.", [])],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesWienBridgeDesign(a) === false);
  ok(`안전망 미발화: ${n}`, detectWienBridgeDesign(a) === false);
}

console.log("\n[3] 값 공간");
const { SPACE, SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL, GAIN_PAIRS } = __spaces;
ok("풀이 충분", SPACE.length >= 40, String(SPACE.length));
ok("유사·변형 비중첩", (() => {
  const key = (v) => `${v.R_kohm}/${v.C_nF}/${v.R1_kohm}/${v.R2_kohm}`;
  const s = new Set(SIMILAR_SPACE.map(key));
  return VARIANT_SPACE.every((v) => !s.has(key(v)));
})());
ok("★ 원본 튜플 미생성", SPACE.every(
  (v) => !(v.R_kohm === ORIGINAL.R_kohm && v.C_nF === ORIGINAL.C_nF
    && v.R1_kohm === ORIGINAL.R1_kohm && v.R2_kohm === ORIGINAL.R2_kohm)));
ok("모든 쌍의 이득이 3보다 크다", GAIN_PAIRS.every(([r1, r2]) => 1 + r2 / r1 > 3));
ok("모든 쌍의 이득이 과하지 않다(≤ 3.5)", GAIN_PAIRS.every(([r1, r2]) => 1 + r2 / r1 <= 3.5));

console.log("\n[4] 생성물 재검산 (독립 계산으로 대조)");
let n4 = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let s = 0; s < 12; s++) {
    for (let i = 0; i < 2; i++) {
      const g = generateWienBridgeDesign({ seed: s * 7919, index: i, mode });
      const v = g.values; n4++;
      ok(`f0 일치 (${mode}/${s}/${i})`, Math.abs(g.f0 - computeF0(v.R_kohm, v.C_nF)) < 1e-9);
      ok(`이득 = 1+R2/R1 (${mode}/${s}/${i})`, Math.abs(g.gain - (1 + v.R2_kohm / v.R1_kohm)) < 1e-12);
      ok(`★ 이득 > 3 (지속 발진) (${mode}/${s}/${i})`, g.gain > 3, String(g.gain));
      ok(`★ R2 ≥ 2·R1 (${mode}/${s}/${i})`, v.R2_kohm >= 2 * v.R1_kohm);
      ok(`반올림 오차 ≤ 1.5% (${mode}/${s}/${i})`,
        Math.abs(g.f0 - g.f0Round) / g.f0Round <= 0.015, `${g.f0.toFixed(1)} vs ${g.f0Round}`);
      // 회로 figure가 실제로 Wien 망인지 (기존 검증기 재사용)
      const netlist = (await runWienBridgeDesignPipeline({ analysis: null, mode, count: 1 }))[0]
        .figureVariants[0].diagram;
      ok(`Wien 망 검증 통과 (${mode}/${s}/${i})`, validateWienNetwork(netlist).ok === true);
    }
  }
}
ok(`생성물 ${n4}개 검사`, n4 === 48);

console.log("\n[5] 파이프라인 산출물 — 3단계 서술형");
const probs = [
  ...(await runWienBridgeDesignPipeline({ analysis: null, mode: "exam_similar", count: 3 })),
  ...(await runWienBridgeDesignPipeline({ analysis: null, mode: "exam_variant", count: 3 })),
];
ok("6문항 생성", probs.length === 6);
for (const p of probs) {
  ok("발문 3단계", new Set(p.question.match(/\[단계 [123]\]/g) ?? []).size === 3);
  ok("객관식 보기 없음", !/①|②|③|④|⑤/.test(`${p.content}\n${p.question}`));
  ok("figure = analog_netlist 1개",
    (p.figureVariants ?? []).length === 1 && p.figureVariants[0].diagramType === "analog_netlist");
  ok("조건에 π=3.14 명시", p.conditions.some((c) => c.includes("3.14")));
  ok("정답에 β=1/3", /1\/3/.test(p.answer));
  ok("정답에 f_0 값", /\[Hz\]/.test(p.answer));
  ok("풀이에 '3보다' 근거", /3보다/.test(p.solution));
}
ok("유사 3문항이 서로 다름", new Set(probs.slice(0, 3).map((p) => p.answer)).size === 3);
ok("변형 3문항이 서로 다름", new Set(probs.slice(3).map((p) => p.answer)).size === 3);

console.log("\n[6] ★ 전역 분수 변환기가 값을 뭉개지 않는가 (CLAUDE.md 1-4-3)");
// route가 answer·solution에 fractionizeText를 적용한다. 실측에서 f_0 796.2 → 3981/5,
// A_v 3.2 → 16/5로 뭉개졌다. 평문 [Hz] 단위와 분수식 표기로 막았는지 여기서 단언한다.
{
  const { fractionizeText } = await import("../lib/format/fraction.ts");
  for (const p of probs) {
    ok("정답이 변환기에 불변", fractionizeText(p.answer) === p.answer,
      JSON.stringify(fractionizeText(p.answer)).slice(0, 160));
    ok("풀이가 변환기에 불변", fractionizeText(p.solution) === p.solution,
      JSON.stringify(fractionizeText(p.solution)).slice(0, 160));
  }
  // 단위 없는 소수가 아예 없어야 한다(있으면 언젠가 뭉개진다).
  for (const p of probs) {
    const bare = (`${p.answer}\n${p.solution}`).match(/\d+\.\d+(?!\s*\[)/g) ?? [];
    ok("단위 없는 소수 0개", bare.length === 0, bare.join(","));
  }
}

console.log("\n[7] 형제 무회귀 — 기호형 Wien archetype이 그대로 동작하는가");
for (let i = 0; i < 5; i++) {
  const g = generateWienBridgeOscillator({});
  const fig = (g.figureVariants ?? []).find((f) => f.diagramType === "analog_netlist");
  ok(`기호형 ${i + 1}: netlist 존재`, Boolean(fig));
  ok(`기호형 ${i + 1}: Wien 망 검증`, fig ? validateWienNetwork(fig.diagram).ok === true : false);
  ok(`기호형 ${i + 1}: R_3 라벨 유지`, JSON.stringify(fig?.diagram ?? {}).includes('"R_3"'));
}

console.log(`\n=== WIEN BRIDGE DESIGN ARCHETYPE: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
