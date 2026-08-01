// 제너 클리퍼 + 적분기(삼각파) — 임용 2번 전용 archetype 정적 검증 (API 없음)
//
//   신고 "유사문제가 생성이 안되네". 로그: runOpampPipeline archetype="cascade"(범용) →
//   제너 클리퍼·적분기 다 잃고 단순 종속증폭기(Vout=10)로 변질, generic_dispatch_warning 발화.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeZenerClipperIntegrator.mjs
import {
  solveZenerClipper, ZENER_CLIPPER_SPACE, V_DIODE,
} from "../lib/generation/topologies/zenerClipperIntegrator.ts";
import {
  detectZenerClipperIntegrator, runZenerClipperIntegratorPipeline,
} from "../lib/pipeline/runZenerClipperIntegratorPipeline.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  OK   ${n}${e ? " — " + e : ""}`); } else { fail++; console.log(`  FAIL ${n}${e ? " — " + e : ""}`); } };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const mk = (topic, interpretation, relatedConcepts = [], componentInventory = []) =>
  ({ topic, interpretation, relatedConcepts, fillInTheBlanks: [], componentInventory });

/** 시간영역 수치 시뮬레이션 — 닫힌형과 독립적으로 물리를 확인한다. */
function simulate(p, N = 400000) {
  const vClip = p.vz + V_DIODE;
  const T = p.period, RC = p.rint * p.cap * 1000; // μs 단위 통일
  const dt = T / N;
  let vo = 0, mn = 0, mx = 0, half = null;
  for (let i = 0; i < N; i++) {
    const t = i * dt;
    const vs = Math.sin((2 * Math.PI * t) / T);
    const v1 = vs > 0 ? -vClip : (vs < 0 ? vClip : 0);
    vo += -(1 / RC) * v1 * dt;
    if (vo < mn) mn = vo; if (vo > mx) mx = vo;
    if (half === null && t >= T / 2) half = vo;
  }
  return { voPp: mx - mn, voHalf: half, v1Pp: 2 * vClip };
}

console.log("\n[1] 원본 물리 (V_Z=5, R=10k, C=0.01μ, T=200μs)");
const o = solveZenerClipper({ vz: 5, rin: 10, rint: 10, cap: 0.01, period: 200, amp: 1 });
ok("V_clip = 5.7V", close(o.vClip, 5.7), String(o.vClip));
ok("RC = 100μs (= 반주기)", close(o.rcUs, 100) && close(o.halfUs, 100), `RC=${o.rcUs} half=${o.halfUs}`);
ok("v_o 반주기 변화량 ΔV = 5.7V", close(o.voPeak, 5.7), String(o.voPeak));
// ★ 원본이 묻는 V_PP 는 v_1 의 peak-to-peak = 2·V_clip
ok("v_1 의 V_PP = 11.4V", close(2 * o.vClip, 11.4), String(2 * o.vClip));

console.log("\n[2] 닫힌형 ↔ 시간영역 시뮬레이션 대조 (전 후보)");
let bad = 0;
for (const inst of [o, ...ZENER_CLIPPER_SPACE]) {
  const s = simulate(inst.params);
  if (!close(s.voPp, inst.voPeak, 1e-4)) { bad++; console.log(`   X voPp ${s.voPp} vs ${inst.voPeak} ${JSON.stringify(inst.params)}`); }
  if (!close(s.voHalf, inst.voPeak, 1e-4)) { bad++; console.log(`   X voHalf ${s.voHalf} vs ${inst.voPeak}`); }
  if (!close(s.v1Pp, 2 * inst.vClip)) { bad++; }
}
ok(`시뮬레이션 ${ZENER_CLIPPER_SPACE.length + 1}건 전부 일치`, bad === 0, `불일치 ${bad}건`);
ok("후보 공간", ZENER_CLIPPER_SPACE.length >= 8, `${ZENER_CLIPPER_SPACE.length}종`);
ok("후보끼리 답(ΔV)이 모두 다름",
  new Set(ZENER_CLIPPER_SPACE.map((i) => i.voPeak)).size === ZENER_CLIPPER_SPACE.length);
ok("원본 튜플 제외됨", !ZENER_CLIPPER_SPACE.some((i) =>
  i.params.vz === 5 && i.params.rint === 10 && i.params.cap === 0.01 && i.params.period === 200));

console.log("\n[3] 감지");
const inv = [
  { id: "R1", type: "R", value: "10kΩ" }, { id: "R2", type: "R", value: "10kΩ" },
  { id: "D1", type: "D", value: "5V" }, { id: "D2", type: "D", value: "5V" },
  { id: "C1", type: "C", value: "0.01μF" },
  { id: "U1", type: "OPAMP" }, { id: "U2", type: "OPAMP" },
];
ok("원본 요약 → 감지", detectZenerClipperIntegrator(mk("연산증폭기 응용 회로",
  "제너다이오드를 이용한 클리퍼와 적분기로 구성된 회로에서 v_1의 최대 변동값(peak-to-peak)과 t=100μs일 때 v_o를 구한다.",
  ["제너다이오드", "적분기"], inv)) === true);
ok("요약이 '적분' 없이 peak-to-peak만 남아도 감지", detectZenerClipperIntegrator(mk("연산 증폭기 회로",
  "제너 항복 전압이 주어진 회로에서 출력의 peak-to-peak value를 구한다.", [], inv)) === true);
ok("OPAMP 1개면 미발화(구조 불일치)", detectZenerClipperIntegrator(mk("제너 클리퍼",
  "제너다이오드 적분기 회로", [], inv.filter((c) => c.id !== "U2"))) === false);
ok("다이오드 없으면 미발화", detectZenerClipperIntegrator(mk("적분기",
  "적분기 회로에서 출력을 구한다", [], inv.filter((c) => c.type !== "D"))) === false);
// ★ 역직렬 제너 2개는 이 유형 고유 구조라 다이오드 2개면 텍스트 없이 확정한다.
ok("다이오드 2개면 텍스트 없이도 감지(구조 확정)", detectZenerClipperIntegrator(mk("2단 증폭기",
  "두 연산 증폭기의 이득을 구한다", [], inv)) === true);
// 다이오드가 1개뿐이면 텍스트(제너) 보조가 필요하다.
const inv1d = inv.filter((c) => c.id !== "D2");
ok("다이오드 1개 + 제너 문맥 없으면 미발화", detectZenerClipperIntegrator(mk("2단 증폭기",
  "두 연산 증폭기의 이득을 구한다", [], inv1d)) === false);
ok("다이오드 1개라도 제너 문맥 있으면 감지", detectZenerClipperIntegrator(mk("제너 클리퍼",
  "제너다이오드 항복 전압이 주어진 2단 회로", [], inv1d)) === true);

console.log("\n[4] 생성");
const sim = await runZenerClipperIntegratorPipeline({ mode: "exam_similar", count: 3 });
const vari = await runZenerClipperIntegratorPipeline({ mode: "exam_variant", count: 2 });
ok("유사 3 / 변형 2", sim.length === 3 && vari.length === 2);
console.log("   유사[0]:", sim[0]?.answer);
console.log("   변형[0]:", vari[0]?.answer);
ok("유사 3단계 발문", sim[0].question.split("\n").length === 3);
ok("유사 발문이 원본 구성", /최대 변동값/.test(sim[0].content) && /peak-to-peak/.test(sim[0].content));
ok("figure 2개 (가)회로·(나)파형", sim[0].figureVariants?.length === 2 &&
  sim[0].figureVariants[0].diagramType === "analog_netlist" &&
  sim[0].figureVariants[1].diagramType === "waveform");
ok("유사끼리 서로 다름", new Set(sim.map((p) => p.answer)).size === 3);
ok("변형은 v_o 의 V_PP + 램프 도중 값", /V_\{PP\}/.test(vari[0].answer) && /v_o\(/.test(vari[0].answer));

console.log("\n[5] 생성물 재검산 (답 → 시뮬레이션)");
let vbad = 0;
for (const p of [...sim, ...vari]) {
  const body = `${p.content} ${p.conditions.join(" ")} ${p.solution}`;
  const vz = Number(body.match(/항복\(\\\( (\d+(?:\.\d+)?)\\,\\mathrm\{V\}/)?.[1]);
  const rint = Number(body.match(/(\d+(?:\.\d+)?)\\,\\mathrm\{k\\Omega\}/)?.[1]);
  const cap = Number(body.match(/(\d+(?:\.\d+)?)\\,\\mu\\mathrm\{F\}/)?.[1]);
  const period = Number(body.match(/주기 \\\( (\d+(?:\.\d+)?)\\,\[\\mu\\mathrm\{s\}\]/)?.[1]);
  if (![vz, rint, cap, period].every(Number.isFinite)) { vbad++; console.log(`   X 파싱 실패 vz=${vz} r=${rint} c=${cap} T=${period}`); continue; }
  const s = simulate({ vz, rint, cap, period });
  const inst = solveZenerClipper({ vz, rin: 10, rint, cap, period, amp: 1 });
  if (!close(s.voPp, inst.voPeak, 1e-4)) { vbad++; console.log(`   X sim ${s.voPp} vs ${inst.voPeak}`); continue; }
  // 답 문자열의 수치가 시뮬레이션과 맞는지
  const inAns = (v) => p.answer.includes(String(Number(v.toFixed(4))));
  if (!inAns(inst.voPeak) && !inAns(2 * inst.vClip)) { vbad++; console.log(`   X 답에 수치 없음: ${p.answer}`); }
}
ok("생성물 5건 전부 시뮬레이션과 일치", vbad === 0, `불일치 ${vbad}건`);

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
