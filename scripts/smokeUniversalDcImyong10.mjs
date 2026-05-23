// universal_dc smoke — 임용 10번 시뮬레이션 (V_s + I_s + 5R + 가변 R + 3단계 query)
const BASE = "http://localhost:3000/api/generate";

// 임용 10번 회로 simulation:
//   - top rail: R1(20Ω) → V1 → R2(20Ω) → V2 → R3(10Ω) → V3
//   - vertical legs: 20V@V1, 20Ω@V1 (variable R 자리 — load_leg), 0.5A current source@V2(in)/V3(out)?
//   - 10Ω@V3
// 단순화: V_s + I_s + 5R, 3단계 query (V_1, V_3, total P, R for V_3=3.8V)
const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "dc_resistive",
  analysis: {
    topic: "2개 직류 전원과 가변저항이 포함된 DC 회로",
    interpretation: "직류 전압원 V_s와 전류원 I_s가 포함된 회로. [단계 1] R=10Ω일 때 V_1, V_3 구하기. [단계 2] 전체 저항이 소비하는 전력 P_total. [단계 3] V_3=3.8V 되도록 R을 조정해 R 값과 V_1을 구한다.",
    relatedConcepts: ["DC회로", "가변저항", "노드해석", "메시해석", "V_1", "V_3", "소비전력", "R 조정"],
    fillInTheBlanks: [
      { sentence: "[단계 1] R = 10[Ω]일 때, 전압 V_1 [V]와 V_3 [V]를 각각 구한다", answer: "" },
      { sentence: "[단계 2] [단계 1]에서 전체 저항이 소비하는 전력의 총합 [W]를 구한다", answer: "" },
      { sentence: "[단계 3] 가변 저항 R의 값을 조정하여 V_3 = 3.8V 되도록 한다. 이때 V_1과 R [Ω]의 값을 각각 구한다", answer: "" },
    ],
    subjectKey: "circuit_theory",
    circuitType: { type: "universal_dc", params: {}, confidence: "high", reasoning: "smoke" },
    topologySignature: {
      subjectKey: "circuit_theory",
      family: "dc_resistive",
      features: { hasGround: true, hasMesh: true, meshCount: 2 },
      branches: [
        { role: "top_rail_resistor", components: [{ type: "R", value: "20Ω" }] },
        { role: "top_rail_resistor", components: [{ type: "R", value: "20Ω" }] },
        { role: "top_rail_resistor", components: [{ type: "R", value: "10Ω" }] },
        { role: "voltage_source_leg", components: [{ type: "V", value: "20V" }] },
        { role: "load_leg", components: [{ type: "R", value: "10Ω" }] },
        { role: "current_source_leg", components: [{ type: "I", value: "0.5A" }] },
        { role: "load_leg", components: [{ type: "R", value: "10Ω" }] },
      ],
    },
    nodeAnnotations: [
      { node: "n1", label: "V_1", style: "label_only" },
      { node: "n3", label: "V_3", style: "label_only" },
    ],
    loadPlaceholders: [{ betweenNodes: ["n1", "GND"], label: "R", emphasize: true }],
  },
};

const start = Date.now();
const r = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) });
console.log(`HTTP ${r.status}  (${Date.now() - start}ms)`);
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const data = await r.json();
console.log(`problems: ${data.problems?.length}  issues: ${data.summary?.totalIssues}  solutionWarnings: ${data.summary?.solutionWarnings}`);

for (const p of data.problems ?? []) {
  console.log("---");
  console.log("answer:", (p.answer ?? "").replace(/\n/g, " / "));
  console.log("question:", (p.question ?? "").slice(0, 200));
  console.log("components:", p.figureVariants?.[0]?.diagram?.components?.map(c => `${c.id}(${c.type})${c.value ? '=' + c.value : ''}`).join(", "));
}

const checks = [
  ["1 problem", data.problems?.length === 1],
  ["totalIssues = 0", data.summary?.totalIssues === 0],
  ["answer has [단계 1]", data.problems?.[0]?.answer?.includes("[단계 1]")],
  ["answer has V_1 or V_3", /V_[13]/.test(data.problems?.[0]?.answer ?? "")],
  ["figure analog_netlist", data.problems?.[0]?.figureVariants?.[0]?.diagramType === "analog_netlist"],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
