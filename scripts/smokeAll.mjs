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
  // 신규 archetype 5종 (전용 fixed-slot renderer)
  { type: "flash_adc_2bit",        subject: "mixed_signal",   topic: "2비트 플래시 ADC",   topicKey: "adc_sample_hold" },
  { type: "sr_ff_mux_sequential",  subject: "digital_logic",  topic: "SR-FF + MUX 순차회로", topicKey: "flipflop_counter" },
  { type: "zener_bjt_regulator",   subject: "electronics",    topic: "제너+BJT 레귤레이터",  topicKey: "bjt_bias" },
  { type: "async_preset_ripple_counter", subject: "digital_logic", topic: "비동기 SET/RESET D-FF 카운터", topicKey: "flipflop_counter" },
  { type: "rlc_resonance_bandwidth", subject: "circuit_theory", topic: "직렬 RLC 공진 대역폭", topicKey: "rlc_response" },
  { type: "opamp_two_stage", subject: "electronics", topic: "2단 OPAMP 응용회로", topicKey: "opamp" },
  { type: "opamp_series_regulator", subject: "electronics", topic: "OPAMP 직렬형 정전압 안정화 회로", topicKey: "opamp" },
  { type: "active_lowpass_filter", subject: "electronics", topic: "1차 능동 저역통과 필터 대역폭", topicKey: "opamp" },
  { type: "logic_condition_sop", subject: "digital_logic", topic: "동작 조건 조합논리 간소화", topicKey: "combinational_gate" },
  { type: "jk_excitation_sop_pos", subject: "digital_logic", topicKey: "fsm",
    topic: "J-K 플립플롭 2개의 상태 여기표에서 플립플롭 입력을 구하고 조합 논리 회로의 불 함수를 최소항의 합으로 구한 뒤 분배 법칙으로 합의 곱으로 변환" },
  { type: "opamp_analog_summer", subject: "electronics", topic: "아날로그 시스템 2-OPAMP 가산기 설계", topicKey: "opamp" },
  { type: "ac_bridge_max_power", subject: "circuit_theory", topic: "AC 브리지 테브난 최대전력", topicKey: "rlc_response" },
  { type: "switched_rc_dc_transient", subject: "circuit_theory", topic: "t=0 스위치 개방 RC", topicKey: "transient_rc" },
  { type: "dc_wheatstone_balance", subject: "circuit_theory", topic: "DC 휘트스톤 브리지 평형 R_x·출력 전압 V_o", topicKey: "dc_resistive" },
  // ※ ac_superposition_source_design(임용 5번)은 여기 넣지 않는다 — 이 하네스는 topic 문자열만 보내고
  //   componentInventory를 못 실어서 route 상단 재분류가 개념 명칭형으로 보낸다(테스트 하네스 한계).
  //   전용 검증: scripts/smokeAcSupSourceDesign.mjs (라우팅·물리·렌더 28종).
  { type: "dff_state_design", subject: "digital_logic", topic: "D-FF 2개 상태도 순서회로 설계", topicKey: "flipflop_counter" },
  { type: "dff_mux_sequential", subject: "digital_logic", topic: "D-FF/T-FF + 2×1 MUX 자율 순차회로", topicKey: "fsm" },
  { type: "flipflop_mixed_app", subject: "digital_logic", topic: "T 플립플롭과 JK 플립플롭 응용회로", topicKey: "fsm", params: { ffTypes: ["T", "JK"], hasStateTable: true, hasWaveform: true } },
  // 전자기학 — 정사각형 폐경로 선적분 → 회전 ∇×H (임용 11번). EM은 subject로 회로 dispatch를 우회하고
  // analysis 텍스트로 레지스트리 항목이 결정되므로 topic 문구가 감지 시그니처를 담는다.
  { type: "em_curl", subject: "electromagnetics", topic: "정사각형 폐경로 선적분과 자계의 회전(∇×H)", topicKey: "magnetostatics" },
  // acDcSuperpositionRc — universal_ac + params 플래그로 트리거 (임용 12번 AC+DC 중첩 RC)
  { type: "universal_ac",          subject: "circuit_theory", topic: "AC+DC 중첩 RC",      topicKey: "rlc_response", params: { acDcSuperpositionRc: true } },
  // viTheveninMaxPower — max_power_transfer + 2전압원·2전류원 params로 maxpower 파이프라인 내 분기 (임용 5번)
  { type: "max_power_transfer",    subject: "circuit_theory", topic: "2전원 테브난 최대전력", topicKey: "dc_resistive", params: { vSourceCount: 2, iSourceCount: 2 } },
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
      circuitType: { type: t.type, params: t.params ?? {}, confidence: "high", reasoning: "smoke" },
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
