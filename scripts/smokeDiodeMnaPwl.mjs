import { solveDiodePwlDc } from "../lib/solver/diodeMnaPwl.ts";

// Test 1: 정바이어스 (D가 켜져야 함)
//   V_S(+10V) ── D(anode=n1, cathode=n2) ── R(1kΩ) ── GND
//   ON이면 V_n2 = 0 + I·1k, V_n1 = 0 (V_a=V_c), I_D = 10/1k = 0.01A
//   정바이어스 → ON 예상
{
  const baseNet = {
    nodeIds: ["n1", "n2"],
    groundId: "GND",
    resistors: [{ id: "R", a: "n2", b: "GND", R: 1000 }],
    vsources: [{ id: "V_S", a: "n1", b: "GND", V: 10 }],
    isources: [],
  };
  const diodes = [{ id: "D1", anode: "n1", cathode: "n2" }];
  const res = solveDiodePwlDc(baseNet, diodes);
  const ok = res.diodeStates.D1 === "ON" && Math.abs(res.diodeCurrents.D1 - 0.01) < 1e-6;
  console.log(`Test 1 forward-biased D: ${ok ? "PASS" : "FAIL"}`);
  console.log(`  state=${res.diodeStates.D1}, I=${res.diodeCurrents.D1.toFixed(6)}A (expected ON, 0.01A)`);
  console.log(`  V(n1)=${res.nodeVoltages.n1.toFixed(3)}, V(n2)=${res.nodeVoltages.n2.toFixed(3)}`);
  if (!ok) process.exit(1);
}

// Test 2: 역바이어스 (D가 꺼져야 함)
//   V_S(-10V) ── D(anode=n1, cathode=n2) ── R(1kΩ) ── GND  → V(n1) negative, D 역바이어스
//   OFF면 V(n2) = 0 (R 전류 0), V(n1) = -10V
//   V_a - V_c = -10 < 0 → OFF 일관
{
  const baseNet = {
    nodeIds: ["n1", "n2"],
    groundId: "GND",
    resistors: [{ id: "R", a: "n2", b: "GND", R: 1000 }],
    vsources: [{ id: "V_S", a: "n1", b: "GND", V: -10 }],
    isources: [],
  };
  const diodes = [{ id: "D1", anode: "n1", cathode: "n2" }];
  const res = solveDiodePwlDc(baseNet, diodes);
  const ok = res.diodeStates.D1 === "OFF" && Math.abs(res.diodeCurrents.D1) < 1e-9;
  console.log(`Test 2 reverse-biased D: ${ok ? "PASS" : "FAIL"}`);
  console.log(`  state=${res.diodeStates.D1}, I=${res.diodeCurrents.D1.toFixed(9)}A (expected OFF, 0A)`);
  console.log(`  V(n1)=${res.nodeVoltages.n1.toFixed(3)}, V(n2)=${res.nodeVoltages.n2.toFixed(3)}`);
  if (!ok) process.exit(1);
}

// Test 3: 다이오드 OR (두 V source 중 큰 쪽이 출력으로)
//   V1(5V) ── D1 ──┐
//                  ├── n_out ── R(1k) ── GND
//   V2(8V) ── D2 ──┘
//   8V > 5V → D2 ON, D1 OFF, V_out ≈ 8V
{
  const baseNet = {
    nodeIds: ["a1", "a2", "n_out"],
    groundId: "GND",
    resistors: [{ id: "R", a: "n_out", b: "GND", R: 1000 }],
    vsources: [
      { id: "V1", a: "a1", b: "GND", V: 5 },
      { id: "V2", a: "a2", b: "GND", V: 8 },
    ],
    isources: [],
  };
  const diodes = [
    { id: "D1", anode: "a1", cathode: "n_out" },
    { id: "D2", anode: "a2", cathode: "n_out" },
  ];
  const res = solveDiodePwlDc(baseNet, diodes);
  const okStates = res.diodeStates.D1 === "OFF" && res.diodeStates.D2 === "ON";
  const okVout = Math.abs(res.nodeVoltages.n_out - 8) < 1e-6;
  console.log(`Test 3 diode-OR (8V wins): ${okStates && okVout ? "PASS" : "FAIL"}`);
  console.log(`  D1=${res.diodeStates.D1}, D2=${res.diodeStates.D2}, V_out=${res.nodeVoltages.n_out.toFixed(3)}V (expected OFF/ON/8V)`);
  console.log(`  I_D1=${res.diodeCurrents.D1.toFixed(6)}, I_D2=${res.diodeCurrents.D2.toFixed(6)}`);
  if (!(okStates && okVout)) process.exit(1);
}

// Test 4: 반파 정류 (peak clamp 기초 — D + R)
//   V_in(15V) ── D ── n_out ── R(1k) ── GND
//   D forward → V_out = 15V, I = 15mA
{
  const baseNet = {
    nodeIds: ["v_in", "n_out"],
    groundId: "GND",
    resistors: [{ id: "R_L", a: "n_out", b: "GND", R: 1000 }],
    vsources: [{ id: "V_in", a: "v_in", b: "GND", V: 15 }],
    isources: [],
  };
  const diodes = [{ id: "D", anode: "v_in", cathode: "n_out" }];
  const res = solveDiodePwlDc(baseNet, diodes);
  const ok = res.diodeStates.D === "ON" && Math.abs(res.nodeVoltages.n_out - 15) < 1e-6;
  console.log(`Test 4 half-wave rectifier (forward): ${ok ? "PASS" : "FAIL"}`);
  console.log(`  state=${res.diodeStates.D}, V_out=${res.nodeVoltages.n_out.toFixed(3)}V (expected ON, 15V)`);
  if (!ok) process.exit(1);
}

console.log("\n=== All 4 PWL DC solver tests PASS ===");
