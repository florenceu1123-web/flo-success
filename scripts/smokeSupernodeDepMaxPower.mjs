// 독립+종속 전원 슈퍼노드 파라미터 최대 전력 (임용 6번) 전용 archetype — 정적 검증 (API 없음)
//
//   배경: universal 경로는 Vision이 **연결**까지 정확히 읽어야 성립하는데 회차마다 흔들려
//         (3회 중 1회만 원본 일치) 안정적으로 생성되지 않았다. 전용 archetype은 토폴로지를
//         코드가 알고 있어 그림 인식 정확도에 의존하지 않는다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSupernodeDepMaxPower.mjs
import { solveSupernodeDepMaxPower, SUPERNODE_DEP_SPACE, pickInstance }
  from "../lib/generation/topologies/supernodeDepMaxPower.ts";
import { detectSupernodeDepMaxPower, runSupernodeDepMaxPowerPipeline }
  from "../lib/pipeline/runSupernodeDepMaxPowerPipeline.ts";
import { detectSupernodeDepMaxPower as detectFig, renderSupernodeDepMaxPower }
  from "../lib/renderers/supernodeDepMaxPowerRenderer.ts";
import { solveMNA } from "../lib/solver/mna.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  OK   ${n}${e ? " — " + e : ""}`); } else { fail++; console.log(`  FAIL ${n}${e ? " — " + e : ""}`); } };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ─── [1] 원본 물리 ───────────────────────────────────────────────────────
console.log("\n[1] 원본 물리 (rx=2, m=2, k=2)");
const o = solveSupernodeDepMaxPower({ rx: 2, m: 2, k: 2 });
ok("V_B = 8a/(a+8)", o.vbNum === 8 && o.aStar === 8, `${o.vbNum}a/(a+${o.aStar})`);
ok("P_B = 32a/(a+8)^2", o.pbNum === 32, `${o.pbNum}a/(a+${o.aStar})^2`);
ok("a* = 8, P_M = 1W", o.aStar === 8 && o.pMax === 1, `a*=${o.aStar} P=${o.pMax}`);

// ─── [2] MNA 독립 대조 ───────────────────────────────────────────────────
console.log("\n[2] 닫힌형 ↔ MNA 대조 (전 후보)");
const build = (a, p) => ({
  nodeIds: ["A", "B", "M"], groundId: "GND",
  resistors: [
    { id: "Rx", a: "A", b: "GND", R: p.rx },
    { id: "R1", a: "A", b: "M", R: a },
    { id: "R2", a: "B", b: "M", R: a },
    { id: "RB", a: "B", b: "GND", R: p.k * a },
  ],
  vsources: [{ id: "Vs", a: "M", b: "GND", V: a }], isources: [],
  ccvs: [{ id: "E1", a: "B", b: "A", ctrlR: "Rx", r: p.m }],
});
let pts = 0, bad = 0;
for (const inst of [o, ...SUPERNODE_DEP_SPACE]) {
  for (const a of [1, 2, 5, inst.aStar, inst.aStar * 2, inst.aStar / 2]) {
    const r = solveMNA(build(a, inst.params)); pts++;
    const wVB = (inst.vbNum * a) / (a + inst.aStar);
    const pb = (r.nodeVoltages.B ** 2) / (inst.params.k * a);
    const wPB = (inst.pbNum * a) / Math.pow(a + inst.aStar, 2);
    if (!close(r.nodeVoltages.B, wVB) || !close(pb, wPB)) { bad++; }
  }
  // 최대점 검증 — 좌우보다 커야 한다
  const P = (a) => (inst.pbNum * a) / Math.pow(a + inst.aStar, 2);
  if (!(P(inst.aStar) > P(inst.aStar * 0.9) && P(inst.aStar) > P(inst.aStar * 1.1))) bad++;
  if (!close(P(inst.aStar), inst.pMax)) bad++;
}
ok(`MNA ${pts}점 전부 일치`, bad === 0, `불일치 ${bad}건`);
ok("후보 공간 비어있지 않음", SUPERNODE_DEP_SPACE.length >= 8, `${SUPERNODE_DEP_SPACE.length}종`);
ok("원본 튜플(2,2,2) 제외됨",
  !SUPERNODE_DEP_SPACE.some((i) => i.params.rx === 2 && i.params.m === 2 && i.params.k === 2));
ok("모든 후보의 a*·P_M이 깔끔",
  SUPERNODE_DEP_SPACE.every((i) => Number.isInteger(i.aStar) && [1, 2, 4, 5].some((d) => Number.isInteger(i.pMax * d))));

// ─── [3] 감지 ────────────────────────────────────────────────────────────
console.log("\n[3] 라우팅 감지");
const mk = (topic, interp, cc = []) => ({ topic, interpretation: interp, relatedConcepts: cc, fillInTheBlanks: [] });
const orig = mk("슈퍼노드 해석을 통한 전력 계산",
  "이 회로는 독립 전원과 종속 전원이 포함된 회로로, 저항 R_B = 2a[Ω]에서 소비되는 전력이 최대가 되도록 하는 a값과 이때의 전력 P_M을 구하는 문제입니다. A와 B는 슈퍼 노드입니다.",
  ["슈퍼노드", "종속 전원", "최대 전력"]);
ok("원본 요약 → 감지", detectSupernodeDepMaxPower(orig) === true);
ok("종속원 없으면 미발화", detectSupernodeDepMaxPower(mk("슈퍼노드", "슈퍼 노드로 전력이 최대가 되는 a를 구한다. 저항 2a[Ω]", [])) === false);
ok("슈퍼노드 없으면 미발화", detectSupernodeDepMaxPower(mk("종속전원 회로", "종속 전원이 있는 회로에서 전력이 최대가 되는 a[Ω]를 구한다", [])) === false);
ok("최대전력 아니면 미발화", detectSupernodeDepMaxPower(mk("슈퍼노드", "종속 전원과 슈퍼 노드가 있는 회로에서 a[Ω]에 걸리는 전압 V를 구한다", [])) === false);
ok("기호 파라미터 없으면 미발화", detectSupernodeDepMaxPower(mk("슈퍼노드", "종속 전원과 슈퍼 노드가 있는 회로에서 20Ω 저항의 소비 전력 최대값을 구한다", [])) === false);

// ─── [4] 생성 ────────────────────────────────────────────────────────────
console.log("\n[4] 문제 생성");
const sim = await runSupernodeDepMaxPowerPipeline({ mode: "exam_similar", count: 3 });
const vari = await runSupernodeDepMaxPowerPipeline({ mode: "exam_variant", count: 3 });
ok("유사 3문항", sim.length === 3);
ok("변형 3문항", vari.length === 3);
console.log("   유사[0] 답:", sim[0]?.answer);
console.log("   변형[0] 답:", vari[0]?.answer);
ok("유사 3단계 발문", sim[0].question.split("\n").length === 3);
ok("유사 답에 V_B·P_B·a·P_M 모두", /V_B =/.test(sim[0].answer) && /P_B =/.test(sim[0].answer) && /a = /.test(sim[0].answer) && /P_M =/.test(sim[0].answer));
ok("변형은 계수 α를 역산", /\\alpha = /.test(vari[0].answer));
ok("유사 ≠ 변형", sim[0].content !== vari[0].content);
ok("유사끼리 서로 다름", new Set(sim.map((p) => p.answer)).size === 3);
ok("원본과 같은 답이 안 나옴", sim.every((p) => !/a = 8\\,\[\\Omega\]/.test(p.answer) || !/P_M = 1\\,/.test(p.answer)));

// 생성된 답을 MNA로 재검산
console.log("\n[5] 생성물 재검산 (답 문자열 → MNA)");
let vbad = 0;
for (const p of [...sim, ...vari]) {
  // ★ "\alpha = 6"의 끝 a를 잡지 않도록 앞에 글자·백슬래시가 없을 때만 매치.
  const aStar = Number(
    p.answer.match(/(?<![A-Za-z\\])a = (\d+)/)?.[1] ??
    p.content.match(/(?<![A-Za-z\\])a = (\d+)\\,\[\\Omega\]/)?.[1],
  );
  const rx = Number(p.conditions.join(" ").match(/R_x = (\d+)/)?.[1]);
  // 계수 1은 표기에서 생략된다("= I_x") — 그 경우 m=1로 읽는다.
  const cond = p.conditions.join(" ");
  const mTxt = cond.match(/=\s*(\d*)I_x/)?.[1];
  const m = mTxt !== undefined
    ? (mTxt === "" ? 1 : Number(mTxt))
    : Number(p.answer.match(/\\alpha = (\d+)/)?.[1]);
  const kTxt = p.content.match(/R_B = (\d*)a/)?.[1];
  const k = kTxt === "" ? 1 : Number(kTxt);
  if (!Number.isFinite(aStar) || !Number.isFinite(rx) || !Number.isFinite(m) || !Number.isFinite(k)) { vbad++; continue; }
  const inst = solveSupernodeDepMaxPower({ rx, m, k });
  if (inst.aStar !== aStar) { vbad++; console.log(`   X a* 불일치 rx=${rx} m=${m} k=${k}: ${inst.aStar} vs ${aStar}`); continue; }
  // 실제 MNA에서 그 a가 최대인지
  const P = (a) => { const r = solveMNA(build(a, { rx, m, k })); return (r.nodeVoltages.B ** 2) / (k * a); };
  if (!(P(aStar) > P(aStar * 0.9) && P(aStar) > P(aStar * 1.1))) { vbad++; console.log(`   X 최대점 아님 rx=${rx} m=${m} k=${k}`); }
}
ok("생성물 6건 전부 MNA와 일치", vbad === 0, `불일치 ${vbad}건`);

// ─── [6] figure ─────────────────────────────────────────────────────────
console.log("\n[6] figure 렌더링");
const fig = sim[0].figureVariants?.[0];
ok("figure = analog_netlist", fig?.diagramType === "analog_netlist");
ok("전용 렌더러가 인식", detectFig(fig?.diagram) === true);
const svg = renderSupernodeDepMaxPower(fig.diagram);
ok("SVG 생성", svg.startsWith("<svg") && svg.length > 1500, `${svg.length}자`);
ok("종속원이 다이아몬드로", svg.includes("I_x") && /path d="M \d+ \d+ L \d+ \d+ L \d+ \d+ L \d+ \d+ Z"/.test(svg));
ok("노드 A·B·슈퍼노드 표기", svg.includes(">A<") && svg.includes(">B<") && svg.includes("super node"));
ok("R_B·V_B 표기", svg.includes("R_B") && svg.includes("V_B"));

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
