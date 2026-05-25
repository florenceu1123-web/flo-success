/** electronics·circuit_theory 두 subject에서 PRE-SUBJECT PWL rule 발동 확인. */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

const sample = {
  topic: "스위치와 다이오드가 포함된 응용 회로",
  interpretation: "교류 전원 v_i(t) = 10sin(ωt)인 한 주기 파형. 이상적 다이오드 D_1·D_2.",
  componentInventory: [
    { id: "V_i", type: "V", value: "v_i(t)" },
    { id: "V_CC", type: "V", value: "15V" },
    { id: "SW", type: "SW" },
    { id: "C", type: "C" },
    { id: "D1", type: "D" },
    { id: "D2", type: "D" },
    { id: "R_L", type: "R" },
  ],
  topologySignature: { family: "switched", features: { hasSwitch: true }, branches: [] },
};

for (const subject of ["circuit_theory", "electronics", "digital_logic", "mixed_signal"]) {
  const r = classifyCircuitType(sample, subject);
  const flag = r.type === "universal_ac_pwl" ? "✓ PWL" : "✗ " + r.type;
  console.log(`${subject.padEnd(15)} → ${flag} (${r.reasoning?.slice(0, 60)}...)`);
}
