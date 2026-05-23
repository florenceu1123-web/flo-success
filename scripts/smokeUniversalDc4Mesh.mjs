// universal_dc 4-mesh smoke — 임용 10번 정확 토폴로지 (betweenNodes 사용)
//   top rail: 20Ω(n_left→n_v1) - 20Ω || 0.5A(n_v1↔n_v3) - 10Ω(n_v3→n_right)
//   vertical: V_s(20V)@n_left, R(가변)@n_v1, 10Ω@n_v3
//   기대 mesh count = 4
const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "dc_resistive",
  analysis: {
    topic: "직류 + 가변 R + multi-step (4-mesh)",
    interpretation: "[단계 1] R=10일 때 V_1·V_3 [단계 2] P_total [단계 3] V_3=3.8 되는 R",
    relatedConcepts: ["DC", "가변저항", "V_1", "V_3", "4-mesh", "평행 가지"],
    fillInTheBlanks: [{ sentence: "[단계 3] V_3=3.8V 되는 R", answer: "" }],
    subjectKey: "circuit_theory",
    circuitType: { type: "universal_dc", params: {}, confidence: "high", reasoning: "smoke" },
    topologySignature: {
      subjectKey: "circuit_theory",
      family: "dc_resistive",
      features: { hasGround: true, hasMesh: true, meshCount: 4 },
      branches: [
        { role: "top_rail_resistor", components: [{ type: "R", value: "20Ω" }], betweenNodes: ["n_left", "n_v1"] },
        { role: "top_rail_resistor", components: [{ type: "R", value: "20Ω" }], betweenNodes: ["n_v1", "n_v3"] },
        { role: "mesh_only_branch", components: [{ type: "I", value: "0.5A" }], betweenNodes: ["n_v1", "n_v3"] },
        { role: "voltage_source_leg", components: [{ type: "V", value: "20V" }], betweenNodes: ["n_left", "GND"] },
        { role: "load_leg", components: [{ type: "R", value: "10Ω" }], betweenNodes: ["n_v1", "GND"] },
        { role: "load_leg", components: [{ type: "R", value: "10Ω" }], betweenNodes: ["n_v3", "GND"] },
      ],
    },
    nodeAnnotations: [
      { node: "n_v1", label: "V_1", style: "label_only" },
      { node: "n_v3", label: "V_3", style: "label_only" },
    ],
    loadPlaceholders: [{ betweenNodes: ["n_v1", "GND"], label: "R", emphasize: true }],
  },
};

const r = await fetch("http://localhost:3000/api/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY),
});
const data = await r.json();
console.log(`HTTP ${r.status}  issues: ${data.summary?.totalIssues}`);
const p = data.problems?.[0];
if (!p) { console.log("no prob"); console.log(JSON.stringify(data, null, 2).slice(0, 800)); process.exit(1); }
console.log("answer:", p.answer.replace(/\n/g, " / "));
const c = p.figureVariants?.[0]?.diagram?.components;
console.log("components:", c.map((x) => `${x.id}[${x.pins?.map((p) => p.node).join("-")}]=${x.value ?? "?"}`).join(", "));
