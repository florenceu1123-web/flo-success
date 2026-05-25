import {
  simulateSwitchEvent,
  sampleNodeAt,
  findExtremesInRange,
  extractImyong6Answers,
} from "../lib/solver/diodeSwitchEvent.ts";

// ─────────────────────────────────────────────────────────────────
// Test: V_C handoff 검증 — preSwitch DC 충전 → postSwitch AC
//
//   preSwitch (t<0): V_DC=5V ─ D ─ n_out ─ (R_L ∥ C) ─ GND
//                    → C가 5V로 빠르게 충전 (τ=RC=1ms = T)
//   postSwitch (t≥0): V_i=10·sin(ωt) ─ D ─ n_out ─ (R_L ∥ C) ─ GND
//                    → V_C 초기 5V에서 AC 추종 시작 (피크 ~10V로 충전)
//
//   목적: preSwitch 종료 V_C → postSwitch 초기 V_C 정상 전달 확인.
// ─────────────────────────────────────────────────────────────────
const T = 1e-3;
const omega = 2 * Math.PI / T;
const C = 10e-6;
const R = 100;  // τ = R·C = 1ms = T (fast 충전·방전)

const preSwitchPhase = {
  baseNet: {
    nodeIds: ["v_dc", "n_out"],
    groundId: "GND",
    resistors: [{ id: "R_L", a: "n_out", b: "GND", R }],
    vsources: [{ id: "V_DC", a: "v_dc", b: "GND", V: 5 }],
    isources: [],
  },
  capacitors: [{ id: "C", a: "n_out", b: "GND", C, V0: 0 }],
  diodes: [{ id: "D_pre", anode: "v_dc", cathode: "n_out" }],
};

const postSwitchPhase = {
  baseNet: {
    nodeIds: ["v_in", "n_out"],
    groundId: "GND",
    resistors: [{ id: "R_L", a: "n_out", b: "GND", R }],
    vsources: [],
    isources: [],
  },
  vSourcesTimeVarying: [
    { id: "V_i", a: "v_in", b: "GND", vFunc: (t) => 10 * Math.sin(omega * t) },
  ],
  capacitors: [{ id: "C", a: "n_out", b: "GND", C }],  // V0는 simulateSwitchEvent에서 주입
  diodes: [{ id: "D_post", anode: "v_in", cathode: "n_out" }],
};

const result = simulateSwitchEvent({
  preSwitch: preSwitchPhase,
  postSwitch: postSwitchPhase,
  T,
  preSwitchPeriods: 20,
  postSwitchPeriods: 5,
  dt: T / 200,
  sampleEvery: 5,
});

// Assert 1: preSwitch 종료 V_C가 5V 근처에 도달 (20τ 충분히 길어 거의 완전 충전)
const preFinalVc = result.preSwitchFinalCapVoltages.C;
console.log(`Test 1 preSwitch final V_C: ${preFinalVc.toFixed(3)}V (expected ~5V)`);
const ok1 = Math.abs(preFinalVc - 5) < 0.5;
console.log(`Test 1 V_C ≈ 5V: ${ok1 ? "PASS" : "FAIL"}`);
if (!ok1) process.exit(1);

// Assert 2: postSwitch 첫 sample이 preFinalVc로 시작 (V_C 핸드오프)
const postFirstSample = result.postSwitchSamples[0];
console.log(`Test 2 postSwitch first V_C: ${postFirstSample.capacitorVoltages.C.toFixed(3)}V (expected start ≈ preFinalVc)`);
// 첫 step에서 backward Euler가 한 번 적용되므로 약간 변할 수 있음 — 5V 근처면 OK
const ok2 = Math.abs(postFirstSample.capacitorVoltages.C - preFinalVc) < 1.0;
console.log(`Test 2 V_C 핸드오프 정상: ${ok2 ? "PASS" : "FAIL"}`);
if (!ok2) process.exit(1);

// Assert 3: sample helper — V_o(T/2)·V_o(T) 보간 정상
const Vo_at_T_half = sampleNodeAt(result.postSwitchSamples, "n_out", T / 2);
const Vo_at_T = sampleNodeAt(result.postSwitchSamples, "n_out", T);
console.log(`Test 3 sampleNodeAt:`);
console.log(`  V_o(T/2=0.5ms) = ${Vo_at_T_half.toFixed(3)}V`);
console.log(`  V_o(T=1ms)     = ${Vo_at_T.toFixed(3)}V`);
const ok3 = Number.isFinite(Vo_at_T_half) && Number.isFinite(Vo_at_T);
console.log(`Test 3 sample 보간 finite: ${ok3 ? "PASS" : "FAIL"}`);
if (!ok3) process.exit(1);

// Assert 4: findExtremesInRange — 마지막 주기 min/max
const lastExt = findExtremesInRange(result.postSwitchSamples, "n_out", 4 * T, 5 * T);
console.log(`Test 4 last period [4T, 5T] extremes:`);
console.log(`  min = ${lastExt.min.toFixed(3)}V at t=${(lastExt.minAt * 1000).toFixed(3)}ms`);
console.log(`  max = ${lastExt.max.toFixed(3)}V at t=${(lastExt.maxAt * 1000).toFixed(3)}ms`);
const ok4 = lastExt.min < lastExt.max && Number.isFinite(lastExt.min) && Number.isFinite(lastExt.max);
console.log(`Test 4 min<max + finite: ${ok4 ? "PASS" : "FAIL"}`);
if (!ok4) process.exit(1);

// Assert 5: extractImyong6Answers — 3단계 답 추출
const answers = extractImyong6Answers(result.postSwitchSamples, "n_out", T, 5);
console.log(`Test 5 extractImyong6Answers:`);
console.log(`  step1 V_o(T/2) = ${answers.step1_Vo_at_halfT.toFixed(3)}V`);
console.log(`  step2 V_o(T)   = ${answers.step2_Vo_at_T.toFixed(3)}V`);
console.log(`  step3 min/max  = ${answers.step3_Vo_min.toFixed(3)} / ${answers.step3_Vo_max.toFixed(3)}V`);
console.log(`         minAt/maxAt = ${(answers.step3_Vo_minAt * 1000).toFixed(2)}ms / ${(answers.step3_Vo_maxAt * 1000).toFixed(2)}ms`);
const ok5 = (
  Number.isFinite(answers.step1_Vo_at_halfT) &&
  Number.isFinite(answers.step2_Vo_at_T) &&
  answers.step3_Vo_min < answers.step3_Vo_max
);
console.log(`Test 5 답 구조 완비: ${ok5 ? "PASS" : "FAIL"}`);
if (!ok5) process.exit(1);

console.log("\n=== Phase 3 switch event smoke PASS ===");

// Bonus: timeline 출력 (sanity check)
console.log("\nTimeline (every 5 samples):");
const stride = Math.floor(result.allSamples.length / 16);
for (let i = 0; i < result.allSamples.length; i += stride) {
  const s = result.allSamples[i];
  const phase = s.t < 0 ? "pre" : "post";
  console.log(`  ${phase} t=${(s.t * 1000).toFixed(2)}ms: V_out=${s.nodeVoltages.n_out.toFixed(3)}V, V_C=${s.capacitorVoltages.C.toFixed(3)}V`);
}
