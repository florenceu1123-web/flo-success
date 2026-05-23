// universal_dc smoke — 사용자가 canonical netlist로 정리한 imyong 10번 회로.
//   노드 4개: GND, VS_PLUS(V 소스 +단자), V1, V2
//   - Vsrc(20V): VS_PLUS-GND
//   - R_left_top(20Ω), R_left_mid(20Ω): VS_PLUS-V1 평행 2개
//   - R_top_right(10Ω): V1-V2
//   - I_mid(0.5A): V2-V1 (mesh_only_branch, R_top_right와 평행)
//   - R_right(10Ω): V2-GND
//   - R_var(가변): V1-GND
//   해석: 4-mesh (외곽 2 + V-V1 평행 + V1-V2 평행)
//   목적: VS_PLUS ≠ V1 — V 전압원 +단자와 측정 노드 V_1 사이에 R이 있어 단락 없음.

const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "dc_resistive",
  analysis: {
    topic: "VS_PLUS-V1 평행 + V1-V2 평행 가지 포함 DC 회로 (가변 R 포함)",
    interpretation:
      "전압원 V_s(20V) +단자 VS_PLUS는 V1과 평행 20Ω 두 가지로 연결. " +
      "V1-V2 사이는 R_top_right(10Ω)와 I 소스(0.5A) 평행. V2-GND는 10Ω, " +
      "V1-GND는 가변저항 R. [단계 1] R=10Ω일 때 V_1, V_2 계산. [단계 2] " +
      "총 소비전력 P_total. [단계 3] V_2=3.8V 되도록 R 조정.",
    relatedConcepts: ["DC회로", "노드해석", "메시해석", "가변저항", "V_1", "V_2", "평행 가지", "전류 분배"],
    fillInTheBlanks: [
      { sentence: "[단계 1] R = 10[Ω]일 때 V_1과 V_2를 각각 구한다", answer: "" },
      { sentence: "[단계 2] [단계 1]에서 전체 저항이 소비하는 총 전력 P_total[W]을 구한다", answer: "" },
      { sentence: "[단계 3] 가변저항 R을 조정하여 V_2 = 3.8V 되도록 한다. 이때 R의 값[Ω]을 구한다", answer: "" },
    ],
    subjectKey: "circuit_theory",
    circuitType: { type: "universal_dc", params: {}, confidence: "high", reasoning: "smoke" },
    topologySignature: {
      subjectKey: "circuit_theory",
      family: "dc_resistive",
      features: { hasGround: true, hasMesh: true, meshCount: 4 },
      branches: [
        // V 소스 — VS_PLUS↔GND (사용자가 명명한 plus-only 노드)
        { role: "voltage_source_leg", components: [{ type: "V", value: "20V" }], betweenNodes: ["VS_PLUS", "GND"] },
        // VS_PLUS - V1 평행 20Ω 두 가지 (mesh_only_branch — top rail이 아닌 평행 가지)
        { role: "mesh_only_branch", components: [{ type: "R", value: "20Ω" }], betweenNodes: ["VS_PLUS", "V1"] },
        { role: "mesh_only_branch", components: [{ type: "R", value: "20Ω" }], betweenNodes: ["VS_PLUS", "V1"] },
        // V1 - V2 평행: R + I 소스
        { role: "top_rail_resistor", components: [{ type: "R", value: "10Ω" }], betweenNodes: ["V1", "V2"] },
        { role: "mesh_only_branch", components: [{ type: "I", value: "0.5A" }], betweenNodes: ["V2", "V1"] },
        // V2 - GND
        { role: "load_leg", components: [{ type: "R", value: "10Ω" }], betweenNodes: ["V2", "GND"] },
        // V1 - GND (가변)
        { role: "load_leg", components: [{ type: "R", value: "R" }], betweenNodes: ["V1", "GND"] },
      ],
    },
    nodeAnnotations: [
      { node: "V1", label: "V_1", style: "label_only" },
      { node: "V2", label: "V_2", style: "label_only" },
    ],
    loadPlaceholders: [
      { betweenNodes: ["V1", "GND"], label: "R", emphasize: true },
    ],
  },
};

const start = Date.now();
const r = await fetch(BASE, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(BODY),
});
console.log(`HTTP ${r.status}  (${Date.now() - start}ms)`);

if (!r.ok) {
  const body = await r.text();
  console.log("ERROR BODY:", body.slice(0, 500));
  process.exit(1);
}

const data = await r.json();
console.log(`problems: ${data.problems?.length}  issues: ${data.summary?.totalIssues}  solWarn: ${data.summary?.solutionWarnings}`);

for (const p of data.problems ?? []) {
  console.log("---");
  console.log("answer:", (p.answer ?? "").replace(/\n/g, " / "));
  console.log("question:", (p.question ?? "").slice(0, 200).replace(/\n/g, " / "));
  console.log("components:", p.figureVariants?.[0]?.diagram?.components?.map(c => `${c.id}(${c.type})${c.value ? '=' + c.value : ''}`).join(", "));
}

const checks = [
  ["1 problem returned", data.problems?.length === 1],
  ["totalIssues === 0", data.summary?.totalIssues === 0],
  ["answer has [단계 1]", data.problems?.[0]?.answer?.includes("[단계 1]")],
  ["answer has V_1 or V_2", /V_[12]/.test(data.problems?.[0]?.answer ?? "")],
  ["figure analog_netlist", data.problems?.[0]?.figureVariants?.[0]?.diagramType === "analog_netlist"],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
