// 전압원+전류원 DC 사다리 → I₁·I₂ (임용 3번 회로이론) — API 없음
//
//   universal_dc는 **회로 자체는 정확히 재현**했지만(연결 관계 대조 확인), generic 렌더러가
//   "hub + 직렬 pendant leg"를 세로 체인으로 접어 그려 원본 사다리와 딴판이 됐다(신고 2회).
//   → 그림을 원본 배치로 고정하기 위한 전용 archetype.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDcTwoSourceLadder.mjs
import { detectDcTwoSourceLadder } from "../lib/pipeline/runDcTwoSourceLadderPipeline.ts";
import {
  generateDcTwoSourceLadder, __originalDcTwoSourceLadderForVerify, __dcTwoSourceLadderPoolSize,
} from "../lib/generation/topologies/dcTwoSourceLadder.ts";
import { renderDcTwoSourceLadderCircuit } from "../lib/renderers/dcTwoSourceLadderCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

const inv = (...s) => s.map((x, i) => { const [type, value] = x.split("="); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${extra}`); } };
const expect = (name, a, want) => ok(`${name} → ${detectDcTwoSourceLadder(a) ? "발화" : "양보"}`, detectDcTwoSourceLadder(a) === want);

const INV = inv("V=24V", "R=4kΩ", "R=1kΩ", "I=12mA", "R=2kΩ", "R=6kΩ", "R=3kΩ");

console.log("\n[1] 이 원본 — 표현이 흔들려도 감지");
expect("실측 요약(I1·I2)", mk(
  "저항 회로의 전류 계산",
  "이 회로는 전압원과 전류원이 포함된 저항 회로로, 저항 4kΩ에 흐르는 전류 I1과 저항 3kΩ에 흐르는 전류 I2를 구하는 문제입니다.",
  ["키르히호프의 전류 법칙", "메시 해석"], INV), true);
expect("유니코드 첨자(I₁·I₂)", mk(
  "저항 회로 해석",
  "전압원과 전류원이 있는 회로에서 저항에 흐르는 전류 I₁과 I₂를 구한다.",
  ["KCL"], INV), true);

console.log("\n[2] 형제 양보 — 다른 유형을 뺏지 않는다");
expect("가변저항 + 목표전압 (imyong_10)", mk(
  "2전원 회로", "가변 저항 R을 조정하여 V_2가 목표 전압이 되도록 하고 V_1·V_2를 구한다.", [], INV), false);
expect("전원변환 + 전압비 (source_transform)", mk(
  "전원변환", "전류원 부분을 전원 변환하여 전압비 V_1:V_2:V_3를 이용해 저항을 구한다.", [], INV), false);
expect("테브난·최대전력", mk(
  "테브난 등가", "단자 a-b에서 테브난 등가를 구하고 최대 전력을 구한다.", [], INV), false);
expect("스위치 과도응답", mk(
  "RL 과도", "t=0에 스위치가 닫힐 때 인덕터 전류를 구한다. 시정수를 구한다.", [],
  inv("V=24V", "R=4kΩ", "SW", "L=1H", "R=2kΩ", "R=6kΩ", "R=3kΩ")), false);
expect("전류원 없음(전압원만)", mk(
  "저항 회로", "저항에 흐르는 전류 I1과 I2를 구한다.", [],
  inv("V=24V", "R=4kΩ", "R=1kΩ", "R=2kΩ", "R=6kΩ")), false);

console.log("\n[3] 물리 — 원본 값 재현 + 생성물 독립 재검산");
{
  const o = __originalDcTwoSourceLadderForVerify().answer;
  ok("원본 R_p = 2kΩ", o.Rp === 2, `→ ${o.Rp}`);
  ok("원본 V_M = 36V", o.Vm === 36, `→ ${o.Vm}`);
  ok("원본 V_N = 18V", o.Vn === 18, `→ ${o.Vn}`);
  ok("원본 I₁ = −3mA (화살표 반대)", o.I1 === -3, `→ ${o.I1}`);
  ok("원본 I₂ = 6mA", o.I2 === 6, `→ ${o.I2}`);
  ok(`생성 풀 ${__dcTwoSourceLadderPoolSize()}개`, __dcTwoSourceLadderPoolSize() >= 50);
}
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0, checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = generateDcTwoSourceLadder({ seed, mode });
    const v = g.values, a = g.answer;
    const near = (x, y) => Math.abs(x - y) < 1e-6;
    // 독립 재계산 (문제를 처음부터 다시 푼다)
    const Rp = (v.Rd * v.Re) / (v.Rd + v.Re), Rser = v.Rc + Rp;
    const Vm = (v.Vs / v.Ra + v.Is) / (1 / v.Ra + 1 / Rser);
    const Vn = Vm * Rp / Rser;
    if (!near(Rp, a.Rp) || !near(Vm, a.Vm) || !near(Vn, a.Vn)) { bad++; console.log(`    ❌ ${mode}#${seed} 마디 전압 불일치`); continue; }
    if (!near((v.Vs - Vm) / v.Ra, a.I1) || !near(Vn / v.Re, a.I2)) { bad++; console.log(`    ❌ ${mode}#${seed} I₁·I₂`); continue; }
    // KCL 검산: R_c 전류 = R_d 전류 + R_e 전류
    if (!near(a.Irc, a.Ird + a.I2)) { bad++; console.log(`    ❌ ${mode}#${seed} KCL 불성립`); continue; }
    // 모드별 정답 대상
    const want1 = mode === "exam_variant" ? a.Irc : a.I1;
    const want2 = mode === "exam_variant" ? a.Ird : a.I2;
    if (!near(a.i1Value, want1) || !near(a.i2Value, want2)) { bad++; console.log(`    ❌ ${mode}#${seed} 모드별 대상`); continue; }
    checked++;
  }
  ok(`${mode} 12개 재검산 (통과 ${checked})`, bad === 0 && checked === 12);
}
{
  let leaked = 0;
  for (const mode of ["exam_similar", "exam_variant"]) for (let seed = 1; seed <= 40; seed++) {
    const v = generateDcTwoSourceLadder({ seed, mode }).values;
    if (v.Vs === 24 && v.Ra === 4 && v.Is === 12 && v.Rc === 2 && v.Rd === 6 && v.Re === 3) leaked++;
  }
  ok("원본 튜플(24V·4k·12mA·2k·6k·3k) 미생성", leaked === 0, `→ ${leaked}건`);
}

console.log("\n[4] 렌더 — 원본 배치(좌 전원·상단 R 2개·우 전류원·아래 병렬 뱅크)");
{
  const g = generateDcTwoSourceLadder({ seed: 2, mode: "exam_similar" });
  const svg = renderDcTwoSourceLadderCircuit(g.circuitDiagram);
  ok("SVG 생성", svg.startsWith("<svg") && !svg.includes("<pre>"));
  ok("저항 5개(지그재그 path)", (svg.match(/stroke-linejoin="round"/g) ?? []).length === 5);
  ok("전원 2개(원)", (svg.match(/<circle[^>]*r="22"/g) ?? []).length === 2);
  ok("소자 값 라벨 7종 모두", [g.circuitDiagram.vsLabel, g.circuitDiagram.raLabel, g.circuitDiagram.rbLabel,
    g.circuitDiagram.isLabel, g.circuitDiagram.rcLabel, g.circuitDiagram.rdLabel, g.circuitDiagram.reLabel]
    .every((l) => svg.includes(l)));
  ok("I₁·I₂ 화살표 라벨", svg.includes("I₁") && svg.includes("I₂"));
  ok("내부 id 노출 없음", !svg.includes("R_leg") && !svg.includes("R_top") && !svg.includes("_1"));
  ok("라벨 겹침 0", findLabelOverlaps(svg).length === 0, JSON.stringify(findLabelOverlaps(svg).slice(0, 2)));
}

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail === 0 ? 0 : 1);
