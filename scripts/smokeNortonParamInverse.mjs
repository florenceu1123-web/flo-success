// 노튼 등가 + 파라미터 역산 (임용 5번) 전용 archetype — 정적 검증 (API 없음)
//
//   배경: 이 원본은 독립 전원만 있는데 Vision이 "종속 전원"으로 잘못 요약하는 일이 잦고,
//         전용 경로가 없을 때 범용이 받아 단계별 발문 없는 엉뚱한 회로를 만들었다(실측 신고).
//         전용 archetype은 토폴로지를 코드가 알고 있어 요약 흔들림에 영향받지 않는다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeNortonParamInverse.mjs
import { solveNorton, NORTON_SPACE } from "../lib/generation/topologies/nortonParamInverse.ts";
import { detectNortonParamInverse, runNortonParamInversePipeline } from "../lib/pipeline/runNortonParamInversePipeline.ts";
import {
  detectNortonOriginal, detectNortonEquivalent, renderNortonOriginal, renderNortonEquivalent,
} from "../lib/renderers/nortonParamInverseRenderer.ts";
import { solveMNA } from "../lib/solver/mna.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  OK   ${n}${e ? " — " + e : ""}`); } else { fail++; console.log(`  FAIL ${n}${e ? " — " + e : ""}`); } };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const mk = (topic, interpretation, relatedConcepts = [], componentInventory = []) =>
  ({ topic, interpretation, relatedConcepts, fillInTheBlanks: [], componentInventory });

console.log("\n[1] 원본 물리 (V_s=4, I_s=4, R_L=4, I_L=1)");
const o = solveNorton({ vs: 4, is: 4, rp: 2, rl: 4, target: 1 });
ok("a = 2Ω", o && o.aStar === 2, `a=${o?.aStar}`);
ok("I_N = 3A, R_N = 2Ω", o && close(o.iN, 3) && close(o.rN, 2), `I_N=${o?.iN} R_N=${o?.rN}`);

console.log("\n[2] 닫힌형 ↔ MNA 대조 (전 후보)");
// 위상: V_s·R_p = P–R,  I_s·R_top = P–Q,  R_bot = R–S,  R_mid(2a) = Q–S,  R_L = Q–S
const net = (a, p) => ({
  nodeIds: ["P", "Q", "R", "S"], groundId: "GND",
  resistors: [
    { id: "Rp", a: "P", b: "R", R: p.rp }, { id: "Rtop", a: "P", b: "Q", R: a },
    { id: "Rbot", a: "R", b: "S", R: a }, { id: "Rmid", a: "Q", b: "S", R: 2 * a },
    { id: "RL", a: "Q", b: "S", R: p.rl }, { id: "Rg", a: "R", b: "GND", R: 1e-9 },
  ],
  vsources: [{ id: "Vs", a: "P", b: "R", V: p.vs }],
  isources: [{ id: "Is", a: "P", b: "Q", I: p.is }],
});
let bad = 0, pts = 0;
for (const inst of [o, ...NORTON_SPACE]) {
  const r = solveMNA(net(inst.aStar, inst.params)); pts++;
  const iL = Math.abs(r.nodeVoltages.Q - r.nodeVoltages.S) / inst.params.rl;
  if (!close(iL, inst.params.target, 1e-7)) { bad++; console.log(`   X ${JSON.stringify(inst.params)} a=${inst.aStar} I_L=${iL}`); }
  if (!close(inst.rN, inst.aStar)) { bad++; }
  if (!close(inst.iN, (inst.params.vs + inst.params.is * inst.aStar) / (2 * inst.aStar))) { bad++; }
}
ok(`MNA ${pts}건 전부 목표 전류 일치`, bad === 0, `불일치 ${bad}건`);
ok("후보 공간", NORTON_SPACE.length >= 8, `${NORTON_SPACE.length}종`);
ok("원본 튜플 제외됨",
  !NORTON_SPACE.some((i) => i.params.vs === 4 && i.params.is === 4 && i.params.rl === 4 && i.params.target === 1));

console.log("\n[3] 감지");
const inv = [
  { id: "V1", type: "V", value: "4V" }, { id: "I1", type: "I", value: "4A" },
  { id: "R1", type: "R", value: "a[Ω]" }, { id: "R2", type: "R", value: "2[Ω]" },
  { id: "R3", type: "R", value: "2a[Ω]" }, { id: "R4", type: "R", value: "a[Ω]" },
];
ok("원본 요약 → 감지", detectNortonParamInverse(mk("노튼 등가 회로 변환",
  "점선 영역을 노튼 등가 회로로 변환하고 A와 B 단자에 부하 저항 R_L을 연결한다. R_L에 흐르는 전류 I_L = 1A가 되도록 하는 a 값을 구한다.",
  ["노튼 등가"], inv)) === true);
// ★ Vision이 이 원본을 "종속 전원 포함"으로 잘못 요약하는 일이 잦다(실측) — 그래도 잡혀야 한다.
ok("'종속 전원' 오요약에도 감지", detectNortonParamInverse(mk("종속 전원 포함 회로 해석",
  "종속 전원과 저항이 포함된 회로로, A와 B 단자 사이의 전류를 구하고 노튼 등가 회로로 변환하여 부하 저항에 흐르는 전류 조건을 만족하는 a 값을 찾는다.",
  ["노튼 등가", "종속 전원"], inv)) === true);
// ★ 판별 축이 inventory이므로, 의미 있는 음성은 **구조가 다른 경우**다.
//   (같은 inventory + 부하 전류 문맥이면 사실상 이 원본이므로 감지되는 것이 맞다.)
ok("전류원이 없으면 미발화(구조 불일치)", detectNortonParamInverse(mk("노튼 등가 회로",
  "노튼 등가로 변환해 부하 전류가 되도록 하는 a 값을 구한다", ["노튼 등가"],
  inv.filter((c) => c.type !== "I"))) === false);
ok("기호 저항이 1개뿐이면 미발화", detectNortonParamInverse(mk("노튼 등가 회로",
  "노튼 등가로 변환해 부하 전류가 되도록 하는 a 값을 구한다", ["노튼 등가"],
  [{ id: "V1", type: "V", value: "4V" }, { id: "I1", type: "I", value: "4A" },
   { id: "R1", type: "R", value: "a[Ω]" }, { id: "R2", type: "R", value: "2[Ω]" }])) === false);
ok("등가·부하 문맥이 전혀 없으면 미발화", detectNortonParamInverse(mk("노드 해석",
  "각 노드의 전압을 구한다", [], inv)) === false);
ok("기호 파라미터 없으면 미발화", detectNortonParamInverse(mk("노튼 등가",
  "노튼 등가 회로로 변환해 부하 저항의 전류를 구한다", [],
  [{ id: "R1", type: "R", value: "20Ω" }, { id: "R2", type: "R", value: "8Ω" }])) === false);

console.log("\n[4] 생성");
const sim = await runNortonParamInversePipeline({ mode: "exam_similar", count: 3 });
const vari = await runNortonParamInversePipeline({ mode: "exam_variant", count: 2 });
ok("유사 3 / 변형 2", sim.length === 3 && vari.length === 2);
console.log("   유사[0]:", sim[0]?.answer);
console.log("   변형[0]:", vari[0]?.answer);
ok("유사 3단계 발문", sim[0].question.split("\n").length === 3);
ok("단계 문구가 원본과 같은 구성",
  /전류원을 개방/.test(sim[0].question) && /전압원을 단락/.test(sim[0].question) && /노튼 등가 저항/.test(sim[0].question));
ok("figure 2개 (가)·(나)", sim[0].figureVariants?.length === 2);
ok("변형은 R_L을 역산", /R_L = /.test(vari[0].answer) && /부하 저항/.test(vari[0].question));
ok("유사끼리 서로 다름", new Set(sim.map((p) => p.answer)).size === 3);

console.log("\n[5] 생성물 재검산 (답의 a → MNA)");
let vbad = 0;
for (const p of [...sim, ...vari]) {
  const cond = p.conditions.join(" ");
  const body = `${p.content} ${p.question} ${p.solution}`;
  const a = Number(p.answer.match(/(?<![A-Za-z\\])a = (\d+)/)?.[1] ?? p.content.match(/(?<![A-Za-z\\])a = (\d+)/)?.[1]);
  const rl = Number(p.answer.match(/R_L = (\d+)/)?.[1] ?? body.match(/R_L = (\d+)/)?.[1]);
  const T = Number(body.match(/I_L = (\d+)/)?.[1]);
  // 유사는 기호식(\dfrac{V_s}{2a}), 변형은 수치식이라 표기가 다르다 → I_N1 값에서 V_s를 되짚는다.
  const frac = (s) => {
    if (!s) return NaN;
    const m = String(s).match(/^(-?\d+)\/(\d+)$/);
    return m ? Number(m[1]) / Number(m[2]) : Number(s);
  };
  const iN1 = frac(p.answer.match(/I_\{N1\} = ([\d/]+)\\,/)?.[1]);
  const vs = Number.isFinite(iN1)
    ? Math.round(iN1 * 2 * a)                                   // I_N1 = V_s/(2a)
    : Number(body.match(/전류원을 개방하면[\s\S]*?dfrac\{(\d+)\}\{2a\}/)?.[1]);
  const iN2 = frac(p.answer.match(/I_\{N2\} = ([\d/]+)\\,/)?.[1]);
  const is = Number.isFinite(iN2) ? Math.round(iN2 * 2) : NaN;   // I_N2 = I_s/2
  if (![a, rl, T, vs, is].every(Number.isFinite)) { vbad++; console.log(`   X 파싱 실패 a=${a} rl=${rl} T=${T} vs=${vs} is=${is}`); continue; }
  const r = solveMNA(net(a, { vs, is, rp: 2, rl, target: T }));
  const iL = Math.abs(r.nodeVoltages.Q - r.nodeVoltages.S) / rl;
  if (!close(iL, T, 1e-7)) { vbad++; console.log(`   X I_L=${iL} (기대 ${T}) a=${a} vs=${vs} is=${is} rl=${rl}`); }
}
ok("생성물 5건 전부 목표 전류 달성", vbad === 0, `불일치 ${vbad}건`);

console.log("\n[6] figure 렌더링");
ok("(가) 전용 렌더러 인식", detectNortonOriginal(sim[0].figureVariants[0].diagram) === true);
ok("(나) 전용 렌더러 인식", detectNortonEquivalent(sim[0].figureVariants[1].diagram) === true);
const svgA = renderNortonOriginal(sim[0].figureVariants[0].diagram);
const svgB = renderNortonEquivalent(sim[0].figureVariants[1].diagram);
ok("(가) SVG — 2a·단자 A·(가) 라벨", svgA.startsWith("<svg") && svgA.length > 1500 && svgA.includes("2a[Ω]") && svgA.includes(">A<") && svgA.includes("(가)"));
ok("(나) SVG — I_N·R_N·(나) 라벨", svgB.startsWith("<svg") && svgB.includes("R_N") && svgB.includes("I_N") && svgB.includes("(나)"));

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
