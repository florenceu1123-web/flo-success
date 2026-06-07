/**
 * 범용 OPAMP 파이프라인 라이브 smoke (임용 8번류: 가산기+차동, R 역산).
 *
 *  실행: npx tsx --env-file=.env.local scripts/smokeOpampGeneric.ts
 *  (OPENAI_API_KEY 필요 — GPT 구조 추출 + 텍스트)
 */
import { writeFileSync } from "node:fs";
import { runOpampGenericPipeline } from "../lib/pipeline/runOpampGenericPipeline";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer";
import type { AnalysisResult, CircuitNetlist } from "../types";

// 임용 8번 구조: 1단 반전 가산기(3V·2V·1V → 3kΩ씩, 피드백 2kΩ) → V_1,
//   2단 차동(V_1 → 미지 R → V−, 피드백 3kΩ, V_2=3V → V+) → 출력 V_o. V_o 주고 R 역산.
const analysis: AnalysisResult = {
  topic: "연산증폭기 응용 회로 — 2단(반전 가산기 + 차동증폭), 미지 저항 R 역산",
  interpretation:
    "첫 단 OPAMP는 반전 가산기로 입력 전원 3V·2V·1V가 각각 3kΩ 입력저항을 통해 반전입력에 가산되고 " +
    "피드백 저항 2kΩ, 비반전입력은 접지 → 출력 V_1. 둘째 단 OPAMP는 차동증폭으로 V_1이 미지 저항 R을 통해 " +
    "반전입력에, 기준전원 V_2=3V가 비반전입력에, 피드백 저항 3kΩ, 출력 V_o(=단자 a). " +
    "출력 V_o가 주어질 때 미지 저항 R[kΩ]을 구하는 문제.",
  relatedConcepts: ["연산증폭기", "반전 가산기", "차동증폭", "가상단락", "중첩", "KCL"],
  fillInTheBlanks: [],
  subjectKey: "electronics",
  // ★ 실제 Vision 추출 inventory (서버 로그) — pins(노드 연결) 포함, 노드 라벨은 다소 noisy.
  componentInventory: [
    { id: "R1", type: "R", value: "2kΩ", pins: ["GND", "n1"] },
    { id: "R2", type: "R", value: "2kΩ", pins: ["n1", "n2"] },
    { id: "R3", type: "R", value: "3kΩ", pins: ["n3", "n4"] },
    { id: "R4", type: "R", value: "3kΩ", pins: ["n5", "n4"] },
    { id: "R5", type: "R", value: "3kΩ", pins: ["n6", "n4"] },
    { id: "R6", type: "R", value: "R", pins: ["n7", "n8"] },
    { id: "R7", type: "R", value: "3kΩ", pins: ["n8", "n9"] },
    { id: "V1", type: "V", value: "3V", pins: ["n3", "GND"] },
    { id: "V2", type: "V", value: "2V", pins: ["n5", "GND"] },
    { id: "V3", type: "V", value: "1V", pins: ["n6", "GND"] },
    { id: "V4", type: "V", value: "3V", pins: ["n7", "GND"] },
    { id: "OPAMP1", type: "OPAMP" }, { id: "OPAMP2", type: "OPAMP" },
  ],
};

async function main() {
  const problems = await runOpampGenericPipeline({ analysis, mode: "exam_similar", count: 1 });
  const p = problems[0];
  const netlist = p.figureVariants?.[0]?.diagram as CircuitNetlist;

  console.log("\n===== 생성된 문제 =====");
  console.log("[content]", p.content);
  console.log("[conditions]", JSON.stringify(p.conditions, null, 2));
  console.log("[question]\n", p.question);
  console.log("[answer]", p.answer);
  console.log("[solution]\n", p.solution);

  console.log("\n===== netlist 소자 =====");
  for (const c of netlist.components) {
    console.log(`  ${c.id} (${c.type})${c.value !== undefined ? ` = ${c.value}` : ""}  pins=[${c.pins.map((pi) => pi.node).join(", ")}]`);
  }
  console.log("ground =", netlist.ground);

  const svg = renderAnalogMeshSVG(netlist);
  writeFileSync("opamp_generic.svg", svg);
  console.log("\nSVG → opamp_generic.svg (", svg.length, "bytes,", svg.includes("<pre>") ? "⚠ <pre> 에러 포함" : "✓ 렌더 정상", ")");
}

main().catch((e) => { console.error(e); process.exit(1); });
