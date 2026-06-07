/**
 * Stage 3 분류 검증 — 임용 8번류가 opamp_generic으로, 임용 10번류가 opamp_cascade로 가는지 (GPT 불필요).
 *  실행: npx tsx scripts/smokeOpampGenericClassify.ts
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType";
import type { AnalysisResult } from "../types";

// 임용 8번류: 2 OPAMP + 다중 DC전원(3V/2V/1V/3V) + "R을 구한다"
const imyong8: AnalysisResult = {
  topic: "연산증폭기 응용 회로 — 가산기+차동, 미지 저항 R",
  interpretation: "두 연산증폭기. 첫 단 반전 가산기(3V·2V·1V 입력), 둘째 단 차동. 출력 V_o가 1.5V일 때 R[kΩ]을 구한다.",
  relatedConcepts: ["연산증폭기", "반전 가산기", "차동증폭", "각 단계별로"],
  fillInTheBlanks: [], subjectKey: "electronics",
  componentInventory: [
    { id: "U1", type: "OPAMP" }, { id: "U2", type: "OPAMP" },
    { id: "R1", type: "R" }, { id: "R2", type: "R" }, { id: "R3", type: "R" }, { id: "R4", type: "R" }, { id: "R5", type: "R" },
    { id: "Va", type: "V" }, { id: "Vb", type: "V" }, { id: "Vc", type: "V" }, { id: "V2", type: "V" },
  ],
};

// 임용 10번류: 2 OPAMP + 단일 입력 v_i + 전달함수 V_o/V_i
const imyong10: AnalysisResult = {
  topic: "2-OPAMP cascade 응용 회로",
  interpretation: "입력 v_i, 두 연산증폭기로 출력 V_s. V_o/V_i와 V_s/V_i 전달함수를 각 단계별로 구한다.",
  relatedConcepts: ["연산증폭기", "cascade", "전달함수", "v_o/v_i"],
  fillInTheBlanks: [], subjectKey: "electronics",
  componentInventory: [
    { id: "U1", type: "OPAMP" }, { id: "U2", type: "OPAMP" },
    { id: "R1", type: "R" }, { id: "R2", type: "R" }, { id: "R3", type: "R" }, { id: "R4", type: "R" }, { id: "R5", type: "R" }, { id: "R6", type: "R" },
    { id: "Vi", type: "V" },
  ],
};

const r8 = classifyCircuitType(imyong8, "electronics");
const r10 = classifyCircuitType(imyong10, "electronics");
console.log(`임용 8번류 → ${r8.type}  ${r8.type === "opamp_generic" ? "✓" : "✗ (opamp_generic 기대)"}`);
console.log(`  reason: ${r8.reasoning}`);
console.log(`임용 10번류 → ${r10.type}  ${r10.type === "opamp_cascade_voltage_divider" ? "✓" : "✗ (cascade 기대)"}`);
console.log(`  reason: ${r10.reasoning}`);
process.exit(r8.type === "opamp_generic" && r10.type === "opamp_cascade_voltage_divider" ? 0 : 1);
