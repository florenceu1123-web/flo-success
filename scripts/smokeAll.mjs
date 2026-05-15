// 모든 회로 type을 차례로 API 호출해 응답 + figure 구조 확인.
// 사용: node scripts/smokeAll.mjs

const BASE = "http://localhost:3000/api/generate";

const TESTS = [
  // circuit_theory
  { type: "thevenin",            subject: "circuit_theory", topic: "테브난",         topicKey: "dc_resistive" },
  { type: "norton",              subject: "circuit_theory", topic: "노턴",           topicKey: "dc_resistive" },
  { type: "max_power_transfer",  subject: "circuit_theory", topic: "최대 전력",      topicKey: "dc_resistive" },
  { type: "dc_mesh",             subject: "circuit_theory", topic: "메시 해석",      topicKey: "mesh_analysis" },
  { type: "dc_supermesh",        subject: "circuit_theory", topic: "Supermesh",      topicKey: "supermesh" },
  { type: "dc_supernode",        subject: "circuit_theory", topic: "Supernode",      topicKey: "supernode" },
  { type: "dc_dependent_source", subject: "circuit_theory", topic: "종속전원",       topicKey: "dependent_source" },
  { type: "rc_step",             subject: "circuit_theory", topic: "RC 과도",        topicKey: "transient_rc" },
  { type: "rl_step",             subject: "circuit_theory", topic: "RL 과도",        topicKey: "transient_rl" },
  { type: "rlc_step",            subject: "circuit_theory", topic: "RLC 과도",       topicKey: "rlc_response" },
  { type: "switched_dc",         subject: "circuit_theory", topic: "스위칭",         topicKey: "switching_circuit" },
  // electronics
  { type: "opamp",               subject: "electronics",    topic: "OPAMP",          topicKey: "opamp" },
  { type: "opamp_time_domain",   subject: "electronics",    topic: "OPAMP 적분기",   topicKey: "opamp" },
  { type: "bjt_small_signal",    subject: "electronics",    topic: "BJT 소신호",     topicKey: "bjt_amplifier" },
  // digital_logic
  { type: "kmap_sop",            subject: "digital_logic",  topic: "K-map SOP",      topicKey: "kmap_sop" },
  { type: "kmap_pos",            subject: "digital_logic",  topic: "K-map POS",      topicKey: "kmap_pos" },
  { type: "combinational_gate",  subject: "digital_logic",  topic: "조합 회로",      topicKey: "combinational_gate" },
  { type: "flipflop_counter",    subject: "digital_logic",  topic: "D-FF 카운터",    topicKey: "flipflop_counter" },
  { type: "fsm",                 subject: "digital_logic",  topic: "Mealy FSM",      topicKey: "fsm" },
  { type: "waveform_analysis",   subject: "digital_logic",  topic: "파형 분석",      topicKey: "waveform_analysis" },
];

const results = [];

for (const t of TESTS) {
  const body = {
    image: "dummy",
    subject: t.subject,
    mode: "exam_variant",
    count: 1,
    topicKey: t.topicKey,
    analysis: {
      topic: t.topic,
      interpretation: t.topic + " 자동 테스트",
      relatedConcepts: [t.topic],
      fillInTheBlanks: [],
      subjectKey: t.subject,
      circuitType: { type: t.type, params: {}, confidence: "high", reasoning: "smoke" },
    },
  };

  const start = Date.now();
  let status = "?", elapsed = 0, issues = "?", figs = "?", answer = "?";
  try {
    const r = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    elapsed = Date.now() - start;
    status = r.status;
    if (r.ok) {
      const data = await r.json();
      issues = data.summary?.totalIssues ?? "?";
      figs = data.problems?.[0]?.figureVariants?.map((f) => `${f.role}/${f.diagramType}`).join(",") ?? "?";
      answer = data.problems?.[0]?.answer ?? "?";
      if (answer.length > 80) answer = answer.slice(0, 77) + "...";
    }
  } catch (e) {
    status = "ERROR: " + e.message;
  }
  results.push({ type: t.type, subject: t.subject, status, elapsed, issues, figs, answer });
  console.log(`[${status}] ${t.subject}/${t.type} - ${elapsed}ms - issues=${issues}`);
  console.log(`         figs: ${figs}`);
  console.log(`         ans:  ${answer}`);
}

console.log("\n=== Summary ===");
const passed = results.filter((r) => r.status === 200 && r.issues === 0).length;
console.log(`${passed} / ${results.length} passed (HTTP 200 + 0 validation issues)`);
const failed = results.filter((r) => r.status !== 200 || r.issues !== 0);
if (failed.length > 0) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.subject}/${f.type}: status=${f.status}, issues=${f.issues}`);
}
