// universal_ac smoke — 직렬 RLC 공진 시뮬레이션 (임용 9번 패턴 단순화)
//   회로: V_s(AC) → R(top) → L(top) → C(top) → GND
//   ω = 10^4, V_peak=10, R=5Ω, L=100mH → 공진 C = 1/(ω²L) = 0.1μF
//   |I| sweep으로 ω_0 도출. 직렬 RLC라 ω_0에서 singular 없음.
const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "rlc_response",
  analysis: {
    topic: "직렬 RLC 공진 (universal_ac)",
    interpretation: "ω = 10^4 rad/s에서 v(t) = 10sin(ωt) 입력. R=5Ω, L=100mH, C 학생 도출. 공진주파수 ω_0 도출.",
    relatedConcepts: ["공진주파수", "ω_0", "RLC", "phasor", "직렬 공진"],
    fillInTheBlanks: [{ sentence: "공진주파수 ω_0 = 10^4 rad/s", answer: "" }],
    subjectKey: "circuit_theory",
    circuitType: { type: "universal_ac", params: {}, confidence: "high", reasoning: "smoke" },
    topologySignature: {
      subjectKey: "circuit_theory",
      family: "rlc_response",
      features: { hasGround: true, hasMesh: true, meshCount: 1 },
      branches: [
        { role: "top_rail_resistor", components: [{ type: "R", value: "5Ω" }] },
        { role: "top_rail_resistor", components: [{ type: "L", value: "100mH" }] },
        { role: "top_rail_resistor", components: [{ type: "C", value: "0.1μF" }] },
        { role: "voltage_source_leg", components: [{ type: "V", value: "10V" }] },
      ],
    },
    nodeAnnotations: [],
    loadPlaceholders: [],
  },
};

const r = await fetch("http://localhost:3000/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(BODY),
});
const data = await r.json();
console.log(`HTTP ${r.status}  issues: ${data.summary?.totalIssues}`);
const p = data.problems?.[0];
if (!p) { console.log("no prob"); process.exit(1); }
console.log("answer:", p.answer.replace(/\n/g, " / "));
console.log("components:", p.figureVariants?.[0]?.diagram?.components?.map(c => `${c.id}${c.value ? '=' + c.value : ''}`).join(", "));
