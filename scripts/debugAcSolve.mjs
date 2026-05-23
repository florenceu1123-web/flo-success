// Direct AC solver test — 직렬 RLC 공진
// 회로: V_s(12V) → R(5Ω) → L(100mH) → C(0.1μF) → GND
// 예상: ω_0 = 1/√(LC) = 1/√(0.1·1e-7) = 1e4 rad/s

import { solveComplexMna } from "../lib/solver/complexMna.ts";

const omegas = [10, 100, 1000, 5000, 9000, 10000, 11000, 1e5, 1e6];
console.log("ω         |     I.re      |     I.im      |     |I|");
console.log("─".repeat(70));
for (const omega of omegas) {
  const net = {
    nodeIds: ["n0", "n1", "n2"],
    groundId: "GND",
    omega,
    resistors: [{ id: "R1", a: "n0", b: "n1", R: 5 }],
    inductors: [{ id: "L1", a: "n1", b: "n2", L: 0.1 }],
    capacitors: [{ id: "C1", a: "n2", b: "GND", C: 1e-7 }],
    vsources: [{ id: "V1", a: "n0", b: "GND", V: { re: 12, im: 0 } }],
    isources: [],
  };
  try {
    const s = solveComplexMna(net);
    const i = s.vsourceCurrents["V1"];
    const mag = Math.sqrt(i.re * i.re + i.im * i.im);
    console.log(`${String(omega).padEnd(10)} | ${i.re.toExponential(3).padEnd(13)} | ${i.im.toExponential(3).padEnd(13)} | ${mag.toExponential(3)}`);
  } catch (e) {
    console.log(`${String(omega).padEnd(10)} | ERROR ${e.message}`);
  }
}
