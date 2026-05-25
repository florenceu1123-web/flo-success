import { simulateTimeStepPwl } from "../lib/solver/diodeTimeStepPwl.ts";

// ─────────────────────────────────────────────────────────────────────
// Test A: Peak detector / 반파정류기 + C 평활
//
//   V_i(t) = 10·sin(2πt/T) ── D ── n_out ── (R_L ∥ C) ── GND
//   T = 1ms, R_L = 10kΩ, C = 10μF → τ = R·C = 100ms ≫ T (slow discharge)
//   기대: 양의 반주기에 D ON으로 V_out이 V_i 추종(상승), V_out > V_i 되면 D OFF로 C가
//        R_L로 천천히 방전. 정상상태에서 V_out ≈ 피크값(10V) 근처 ripple 작게.
// ─────────────────────────────────────────────────────────────────────
const T = 1e-3;     // 1ms period
const omega = 2 * Math.PI / T;
const R_L = 10e3;   // 10kΩ
const C = 10e-6;    // 10μF — τ = 100ms (T의 100배)

const baseNet = {
  nodeIds: ["v_in", "n_out"],
  groundId: "GND",
  resistors: [{ id: "R_L", a: "n_out", b: "GND", R: R_L }],
  vsources: [],   // V_i는 시변, 별도 필드
  isources: [],
};

const samples = simulateTimeStepPwl({
  baseNet,
  vSourcesTimeVarying: [
    { id: "V_i", a: "v_in", b: "GND", vFunc: (t) => 10 * Math.sin(omega * t) },
  ],
  capacitors: [{ id: "C", a: "n_out", b: "GND", C, V0: 0 }],
  diodes: [{ id: "D", anode: "v_in", cathode: "n_out" }],
  options: {
    tStart: 0,
    tEnd: 5 * T,     // 5 주기
    dt: T / 200,     // 200 step/주기 (5ms 시뮬레이션 = 1000 steps)
    sampleEvery: 5,  // 매 5 step (=40 sample/주기)
  },
});

// Check 1: 시뮬 안정성 — sample 개수, NaN 없음
const allFinite = samples.every((s) =>
  Number.isFinite(s.nodeVoltages.n_out) && Number.isFinite(s.capacitorVoltages.C),
);
console.log(`Test A.1 stability (no NaN): ${allFinite ? "PASS" : "FAIL"}`);
console.log(`  total samples: ${samples.length}`);
if (!allFinite) process.exit(1);

// Check 2: V_out 시간 추이 — 시작 ~0, 점차 상승, 정상상태 피크 근처
const v_out_at_T = samples.find((s) => Math.abs(s.t - T) < T / 100)?.nodeVoltages.n_out ?? 0;
const v_out_at_5T = samples[samples.length - 1].nodeVoltages.n_out;
console.log(`Test A.2 V_out 추이:`);
console.log(`  V_out @ t=0: ${samples[0].nodeVoltages.n_out.toFixed(3)}V`);
console.log(`  V_out @ t=T (=1ms): ${v_out_at_T.toFixed(3)}V`);
console.log(`  V_out @ t=5T (정상): ${v_out_at_5T.toFixed(3)}V`);

// 정상상태(t≈5T)에서 V_out > 8V 정도 도달 (충분한 충전)
const okSteady = v_out_at_5T > 8;
console.log(`Test A.2 정상상태 V_out > 8V: ${okSteady ? "PASS" : "FAIL"}`);
if (!okSteady) process.exit(1);

// Check 3: 다이오드 mode 변화 — 양의 반주기에 ON, 음의 반주기에 OFF
const onCount = samples.filter((s) => s.diodeStates.D === "ON").length;
const offCount = samples.filter((s) => s.diodeStates.D === "OFF").length;
console.log(`Test A.3 diode mode 분포: ON=${onCount}, OFF=${offCount} (total ${samples.length})`);
const bothExist = onCount > 0 && offCount > 0;
console.log(`Test A.3 ON·OFF 모두 발생: ${bothExist ? "PASS" : "FAIL"}`);
if (!bothExist) process.exit(1);

// Check 4: ripple — 정상상태에서 V_out 변화량이 피크의 일부 미만
const lastPeriodSamples = samples.filter((s) => s.t >= 4 * T && s.t < 5 * T);
const v_out_max = Math.max(...lastPeriodSamples.map((s) => s.nodeVoltages.n_out));
const v_out_min = Math.min(...lastPeriodSamples.map((s) => s.nodeVoltages.n_out));
const ripple = v_out_max - v_out_min;
console.log(`Test A.4 ripple in last period: ${ripple.toFixed(3)}V (max=${v_out_max.toFixed(3)}, min=${v_out_min.toFixed(3)})`);
// τ=100ms, T=1ms → discharge factor exp(-T/τ) ≈ 0.99 → ripple ≈ V_peak·T/τ ≈ 10·0.01 = 0.1V 정도
const okRipple = ripple < 1.0;  // 1V 이내
console.log(`Test A.4 ripple < 1V: ${okRipple ? "PASS" : "FAIL"}`);
if (!okRipple) process.exit(1);

console.log("\n=== Peak detector smoke PASS ===");
console.log("V_out 시간 추이 (every 100ms):");
const stride = Math.floor(samples.length / 20);
for (let i = 0; i < samples.length; i += stride) {
  const s = samples[i];
  console.log(`  t=${(s.t * 1000).toFixed(2)}ms: V_i=${(10 * Math.sin(omega * s.t)).toFixed(2)}V, V_out=${s.nodeVoltages.n_out.toFixed(3)}V, D=${s.diodeStates.D}`);
}
