// universal_dc — known-solvable topology (rejection sampling accept 확인)
//
// 회로:
//   10V 전압원 ──[4Ω top R]── n0 ──[가변 R]── GND
//
//   query: V_1 (= V(n0)), R for V_1 = 5V
//   해: V_1 = 10·R/(R+4). R=4Ω일 때 V_1 = 5V.
//
//   N attempts 중 일부는 perturb 후 valid, 일부는 invalid → 첫 valid 채택 확인.
const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "dc_resistive",
  analysis: {
    topic: "단순 DC 회로 + 가변 R",
    interpretation: "10V 전압원에 직렬 R + 가변 R(GND로). [단계 1] V_1 구하기. [단계 2] 전체 P. [단계 3] V_1=5V 되는 R.",
    relatedConcepts: ["DC", "가변저항", "V_1", "분압"],
    fillInTheBlanks: [
      { sentence: "[단계 1] V_1 [V] 구하기", answer: "" },
      { sentence: "[단계 3] 가변 저항 R을 조정하여 V_1 = 5V 되도록 R 값 구하기", answer: "" },
    ],
    subjectKey: "circuit_theory",
    circuitType: { type: "universal_dc", params: {}, confidence: "high", reasoning: "smoke" },
    topologySignature: {
      subjectKey: "circuit_theory",
      family: "dc_resistive",
      features: { hasGround: true, hasMesh: true, meshCount: 1 },
      branches: [
        { role: "top_rail_resistor", components: [{ type: "R", value: "4Ω" }] },
        { role: "voltage_source_leg", components: [{ type: "V", value: "10V" }] },
        { role: "load_leg", components: [{ type: "R", value: "4Ω" }] },
      ],
    },
    nodeAnnotations: [
      { node: "n1", label: "V_1", style: "label_only" },
    ],
    loadPlaceholders: [{ betweenNodes: ["n1", "GND"], label: "R", emphasize: true }],
  },
};

const r = await fetch("http://localhost:3000/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) });
const data = await r.json();
console.log(`HTTP ${r.status}  issues: ${data.summary?.totalIssues}`);
const p = data.problems?.[0];
if (!p) { console.log("no prob"); process.exit(1); }
console.log("answer:", p.answer.replace(/\n/g, " / "));
console.log("components:", p.figureVariants?.[0]?.diagram?.components?.map(c => `${c.id}${c.value ? '=' + c.value : ''}`).join(", "));
