// 파라미터 최대 전력 라우팅·파이프라인 검증 (API 없음)
//   신고(임용 6번): dc_supernode가 가로채 종속원·파라미터 a·최대화가 전부 소실.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeParamMaxPowerRouting.mjs
import { detectParamMaxPower, runParamMaxPowerPipeline, inventoryToNetlist, pickTargetResistor }
  from "../lib/pipeline/runParamMaxPowerPipeline.ts";
import { detectNetlistParam } from "../lib/solver/netlistToSolver.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  OK   ${n}${e?" — "+e:""}`); } else { fail++; console.log(`  FAIL ${n}${e?" — "+e:""}`); } };

// Vision이 낼 법한 analysis (임용 6번 원본)
const analysis = {
  topic: "슈퍼노드 해석 문제",
  interpretation: "독립 전원과 종속 전원이 포함된 회로에서 저항 RB = 2a[Ω]에서 소비되는 전력이 최대가 되도록 하는 a값과 이때의 전력 P_M을 구한다. A와 B는 슈퍼노드이다.",
  relatedConcepts: ["슈퍼노드", "종속 전원", "최대 전력"],
  componentInventory: [
    { id: "Rx", type: "R", value: "2Ω",    pins: ["A", "GND"] },
    { id: "R1", type: "R", value: "a[Ω]",  pins: ["A", "M"] },
    { id: "R2", type: "R", value: "a[Ω]",  pins: ["B", "M"] },
    { id: "RB", type: "R", value: "2a[Ω]", pins: ["B", "GND"] },
    { id: "Vs", type: "V", value: "a[V]",  pins: ["M", "GND"] },
    { id: "E1", type: "CCVS", value: "2i_x", control: "Rx", pins: ["B", "A"] },
  ],
};

console.log("\n[1] 감지");
ok("detectParamMaxPower = true", detectParamMaxPower(analysis) === true);
const nl = inventoryToNetlist(analysis);
ok("inventory → netlist", !!nl && nl.components.length === 6);
ok('파라미터 = "a"', detectNetlistParam(nl) === "a", String(detectNetlistParam(nl)));
ok("대상 저항 = RB", pickTargetResistor(nl, "a", analysis.interpretation) === "RB",
   String(pickTargetResistor(nl, "a", analysis.interpretation)));

console.log("\n[2] 음성 — 파라미터 없는 회로는 발화 금지");
const plain = { topic: "슈퍼노드", interpretation: "최대 전력을 구한다",
  componentInventory: [
    { id: "R1", type: "R", value: "20Ω", pins: ["n1","GND"] },
    { id: "R2", type: "R", value: "8Ω",  pins: ["n2","GND"] },
    { id: "Vs", type: "V", value: "18V", pins: ["n1","n2"] },
    { id: "I1", type: "I", value: "0.5A", pins: ["GND","n1"] },
  ] };
ok("수치 회로 → false", detectParamMaxPower(plain) === false);
ok("최대 전력 문맥 아니면 false",
   detectParamMaxPower({ ...analysis, topic: "노드 해석", interpretation: "V(n1)을 구한다", relatedConcepts: [] }) === false);
ok("inventory 없으면 false", detectParamMaxPower({ topic: "최대 전력", interpretation: "최대 전력" }) === false);

console.log("\n[3] 생성 — 유사");
const sim = await runParamMaxPowerPipeline({ analysis, mode: "exam_similar", count: 2 });
ok("2문항 생성", sim.length === 2, `${sim.length}개`);
if (sim[0]) {
  console.log("   답:", sim[0].answer);
  ok("3단계 발문", sim[0].question.split("\n").length === 3);
  ok("figure = analog_netlist(원본 회로)", sim[0].figureVariants?.[0]?.diagramType === "analog_netlist");
  ok("figure에 종속원 보존", JSON.stringify(sim[0].figureVariants?.[0]?.diagram).includes("CCVS"));
  ok("답에 a값·P_M 포함", /a = /.test(sim[0].answer) && /P_M = /.test(sim[0].answer));
  ok("답이 기호식 포함(dfrac)", /dfrac/.test(sim[0].answer));
  ok("두 문항이 서로 다름", sim[0].answer !== sim[1].answer, `${sim[0].answer.slice(0,40)} / ${sim[1].answer.slice(0,40)}`);
}

console.log("\n[4] 생성 — 변형");
const varr = await runParamMaxPowerPipeline({ analysis, mode: "exam_variant", count: 1 });
ok("변형 생성", varr.length === 1);
if (varr[0] && sim[0]) {
  console.log("   답:", varr[0].answer);
  ok("변형 ≠ 유사", varr[0].answer !== sim[0].answer);
}

console.log("\n[5] 원본 그대로면 원본 정답이 나오는가 (perturb 없는 count=0 대신 직접 확인)");
// 원본 netlist를 그대로 풀었을 때 a=8, P=1 인지 (앞선 스모크와 동일 결과)
const { netlistToSolverNetwork } = await import("../lib/solver/netlistToSolver.ts");
const { maximizeOverParam, resistorPowerMetric } = await import("../lib/solver/paramSweep.ts");
const mx = maximizeOverParam((a) => netlistToSolverNetwork(nl, { name: "a", value: a }).net,
  resistorPowerMetric("RB"), { min: 0.05, max: 60 });
ok("원본 a*=8, P_M=1W", Math.abs(mx.aStar - 8) < 1e-4 && Math.abs(mx.valueStar - 1) < 1e-6,
   `a*=${mx.aStar.toFixed(5)} P=${mx.valueStar.toFixed(6)}`);

// ─── [6] 회로가 설명과 모순되면 생성 금지 (실측 신고: ◇를 독립 전류원으로 오독) ───
console.log("\n[6] 모순 회로 거부");
const misread = {
  topic: "슈퍼노드 해석",
  interpretation: "독립 전원과 종속 전원이 포함된 회로에서 저항 R4 = 2a[Ω]에서 소비되는 전력이 최대가 되는 a와 P_M을 구한다.",
  relatedConcepts: ["종속 전원", "최대 전력"],
  componentInventory: [
    { id: "R1", type: "R", value: "a[Ω]",  pins: ["A", "M"] },
    { id: "R2", type: "R", value: "2Ω",    pins: ["A", "GND"] },
    { id: "R3", type: "R", value: "a[Ω]",  pins: ["B", "M"] },
    { id: "R4", type: "R", value: "2a[Ω]", pins: ["B", "GND"] },
    { id: "V1", type: "V", value: "a[V]",  pins: ["M", "GND"] },
    { id: "I1", type: "I", value: "2A",    pins: ["A", "B"] },   // ← ◇ 종속원을 독립 전류원으로 오독
  ],
};
ok("모순 시 detectParamMaxPower = false", detectParamMaxPower(misread) === false);
const bad = await runParamMaxPowerPipeline({ analysis: misread, mode: "exam_similar", count: 1 });
ok("모순 시 생성 0건 (틀린 회로로 문제 만들지 않음)", bad.length === 0, `${bad.length}건`);
ok("종속원이 정상 추출되면 그대로 통과", detectParamMaxPower(analysis) === true);

// ─── [7] 분기 없는 직렬 사슬 거부 (실측: A—R1—V1—I1—R2—R3—B 한 줄) ───
console.log("\n[7] 직렬 사슬 거부");
const chain = {
  topic: "슈퍼노드 해석", 
  interpretation: "독립 전원과 종속 전원이 포함된 회로에서 R3=3a[Ω]의 소비 전력이 최대가 되는 a와 P_M을 구한다.",
  relatedConcepts: ["종속 전원", "최대 전력"],
  componentInventory: [
    { id: "R1", type: "R",    value: "2Ω",    pins: ["A", "n1"] },
    { id: "V1", type: "V",    value: "a[V]",  pins: ["n1", "n2"] },
    { id: "E1", type: "CCVS", value: "2i_x", control: "R1", pins: ["n2", "n3"] },
    { id: "R2", type: "R",    value: "a[Ω]",  pins: ["n3", "n4"] },
    { id: "R3", type: "R",    value: "3a[Ω]", pins: ["n4", "GND"] },
  ],
};
ok("직렬 사슬 → detectParamMaxPower false", detectParamMaxPower(chain) === false);
const c0 = await runParamMaxPowerPipeline({ analysis: chain, mode: "exam_similar", count: 1 });
ok("직렬 사슬 → 생성 0건", c0.length === 0, `${c0.length}건`);
ok("정상 회로(분기 있음)는 여전히 통과", detectParamMaxPower(analysis) === true);

// ─── [8] 복원 실패 시 "다른 문제"를 내지 않고 실패를 알리는가 ───
console.log("\n[8] 복원 실패 = 명시적 실패 (다른 문제 생성 금지)");
const { isParamMaxPowerForm, paramMaxPowerFailureReason } = await import("../lib/pipeline/runParamMaxPowerPipeline.ts");
ok("직렬 사슬: 형식은 맞다고 판정(의도)", isParamMaxPowerForm(chain) === true);
ok("직렬 사슬: 복원 불가로 판정", detectParamMaxPower(chain) === false);
ok("실패 사유가 사람이 읽을 수 있는 문장", /직렬 사슬|차수/.test(paramMaxPowerFailureReason(chain) ?? ""),
   String(paramMaxPowerFailureReason(chain)));
ok("종속원 오독본도 형식은 맞다고 판정", isParamMaxPowerForm(misread) === true);
ok("종속원 오독본 사유", /종속/.test(paramMaxPowerFailureReason(misread) ?? ""), String(paramMaxPowerFailureReason(misread)));
ok("정상 회로는 실패 사유 없음", paramMaxPowerFailureReason(analysis) === null);
ok("파라미터 없는 평범한 회로는 형식 자체가 아님", isParamMaxPowerForm(plain) === false);

// ─── [9] 기호 파라미터 유형인데 전용 경로가 없으면 생성 금지 ───
console.log("\n[9] 기호 파라미터 + 전용 경로 없음 → 명시적 실패");
const { isSymbolicParamCircuitForm } = await import("../lib/pipeline/runParamMaxPowerPipeline.ts");
const mk = (topic, interpretation, relatedConcepts = []) => ({ topic, interpretation, relatedConcepts, fillInTheBlanks: [] });
// 임용 5번(노튼 등가 + 파라미터 a) — 실측 Vision 요약 형태
const norton = mk("노튼 등가 회로 변환",
  "전압원과 전류원이 포함된 회로에서 점선 영역을 노튼 등가 회로로 변환하고 A와 B 단자에 부하 저항 R_L을 연결한 회로이다. R_L에 흐르는 전류 I_L = 1[A]이 되도록 하는 a 값을 구한다. 저항은 a[Ω], 2a[Ω], 2[Ω]이다.",
  ["노튼 등가", "중첩의 원리"]);
norton.componentInventory = [
  { id: "V1", type: "V", value: "4V", pins: ["T","GND"] },
  { id: "I1", type: "I", value: "4A", pins: ["T","N1"] },
  { id: "R1", type: "R", value: "a[Ω]", pins: ["T","N1"] },
  { id: "R2", type: "R", value: "2[Ω]", pins: ["T","GND"] },
  { id: "R3", type: "R", value: "2a[Ω]", pins: ["N1","GND"] },
  { id: "R4", type: "R", value: "a[Ω]", pins: ["N1","GND"] },
];
ok("노튼+파라미터 형식 감지", isSymbolicParamCircuitForm(norton) === true);
ok("임용 6번(최대전력)도 형식 감지", isSymbolicParamCircuitForm(analysis) === true);
// 음성 — 수치만 있는 평범한 회로
ok("수치 회로는 미발화", isSymbolicParamCircuitForm(mk("노드 해석", "20Ω과 8Ω 저항, 18V 전원이 있는 회로에서 V(n1)을 구한다", [])) === false);
ok("기호는 있지만 구하라는 요구 없으면 미발화",
   isSymbolicParamCircuitForm(mk("회로 해석", "저항 a[Ω]이 포함된 회로에서 전류 I를 구한다", [])) === false);
ok("빈 분석은 미발화", isSymbolicParamCircuitForm(null) === false);

console.log(`\n=== 최종 ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
