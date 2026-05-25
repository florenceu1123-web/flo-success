import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

// 임용 6번 형식 — 교류 V_i(t) + SW + C + D1·D2 + R_L
const sample = {
  topic: "스위치와 다이오드가 포함된 응용 회로",
  interpretation: "그림 (가)는 스위치와 다이오드가 포함된 응용 회로이고, 그림 (나)는 교류 전원 v_i(t)의 시간에 대한 한 주기(T) 파형이다. 이상적으로 동작하는 다이오드 D_1과 D_2의 순방향 전압 강하는 영(0)으로 가정한다.",
  topicKey: "transient_rc",
  semantic: { hasStateTransition: true, hasWaveformEvolution: true },
  componentInventory: [
    { id: "V_i", type: "V", value: "v_i(t)" },
    { id: "V_CC", type: "V", value: "15V" },
    { id: "SW", type: "SW" },
    { id: "C", type: "C", value: "C" },
    { id: "D1", type: "D" },
    { id: "D2", type: "D" },
    { id: "R_L", type: "R" },
  ],
  topologySignature: {
    family: "switched_rectifier",
    features: { hasSwitch: true },
    branches: [],
  },
  nodeAnnotations: [],
  relatedConcepts: ["다이오드", "스위치", "교류", "rectifier"],
};

const result = classifyCircuitType(sample, "circuit_theory");
console.log("classifier result:");
console.log("  type:", result.type);
console.log("  confidence:", result.confidence);
console.log("  reasoning:", result.reasoning);
console.log("  params:", JSON.stringify(result.params ?? {}));

const expected = "universal_ac_pwl";
if (result.type === expected) {
  console.log(`\nPASS — 임용 6번 형식이 ${expected}로 분류됨`);
} else {
  console.log(`\nFAIL — expected ${expected}, got ${result.type}`);
  process.exit(1);
}

// Negative case 1: D 없음 (단순 SW + RC)
const noDiode = { ...sample, componentInventory: sample.componentInventory.filter((c) => c.type !== "D") };
const r2 = classifyCircuitType(noDiode, "circuit_theory");
console.log(`\nNo-diode (SW+RC만):`, r2.type, "—", r2.reasoning);
if (r2.type === "universal_ac_pwl") {
  console.log("FAIL — D 없을 때 PWL path 트리거되면 안됨");
  process.exit(1);
}
console.log("PASS — 다이오드 없으면 다른 path");

// Negative case 2: SW 완전 제거 (inventory + features + 모든 text 키워드)
const noSwitch = {
  ...sample,
  topic: "다이오드 클램프 회로",  // "스위치" 키워드 제거
  interpretation: "교류 정현파 입력에 대한 다이오드 클램프 응답을 분석한다.",
  componentInventory: sample.componentInventory.filter((c) => c.type !== "SW"),
  topologySignature: { ...sample.topologySignature, features: {} },
  relatedConcepts: ["다이오드", "교류", "rectifier"],  // "스위치" 제거
};
const r3 = classifyCircuitType(noSwitch, "circuit_theory");
console.log(`\nNo-SW (D+AC만):`, r3.type, "—", r3.reasoning);
if (r3.type === "universal_ac_pwl") {
  console.log("FAIL — SW 없을 때 PWL path 트리거되면 안됨");
  process.exit(1);
}
console.log("PASS — SW 없으면 다른 path");
