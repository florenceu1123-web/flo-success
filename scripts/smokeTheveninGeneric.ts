/**
 * 회로이론 테브난+최대전력+종속원 generic 파이프라인 라이브 smoke (임용 9번).
 *  실행: npx tsx --env-file=.env.local scripts/smokeTheveninGeneric.ts
 */
import { writeFileSync } from "node:fs";
import { runTheveninMaxPowerGenericPipeline } from "../lib/pipeline/runTheveninMaxPowerGenericPipeline";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer";
import type { AnalysisResult, CircuitNetlist } from "../types";

const analysis: AnalysisResult = {
  topic: "테브난 등가 회로 + 최대전력 (종속전원 2i_x)",
  interpretation:
    "전압원 9V + 종속전압원 2i_x(i_x는 가변저항 R을 흐르는 전류) + 저항 5Ω·1Ω·2Ω·R로 구성. 단자 a-b 좌측을 " +
    "테브난 등가로 변환, 그림 (나) V_RL-I_RL 직선으로 R을 구하고 I_sc, 부하 R_L 최대전력 P_L을 구하는 문제.",
  relatedConcepts: ["테브난", "최대 전력", "종속전원", "i_x"],
  fillInTheBlanks: [], subjectKey: "circuit_theory",
  componentInventory: [
    { id: "V1", type: "V", value: "9V", pins: ["n1", "GND"] },
    { id: "R1", type: "R", value: "5Ω", pins: ["n1", "n2"] },
    { id: "E1", type: "V", value: "2i_x", pins: ["n2", "n3"] },
    { id: "R2", type: "R", value: "1Ω", pins: ["n3", "n4"] },
    { id: "Rv", type: "R", value: "R", pins: ["n4", "GND"] },
    { id: "R3", type: "R", value: "2Ω", pins: ["n4", "a"] },
  ],
} as AnalysisResult;

async function main() {
  const problems = await runTheveninMaxPowerGenericPipeline({ analysis, mode: "exam_similar", count: 1 });
  const p = problems[0];
  const circuit = p.figureVariants?.find((f) => f.diagramType === "analog_netlist")?.diagram as CircuitNetlist;
  const graph = p.figureVariants?.find((f) => f.diagramType === "waveform");
  console.log("[answer]", p.answer);
  console.log("[종속원]", circuit.components.filter((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(c.type)).map((c) => `${c.id}(${c.type},${c.value},ctrl=${c.control})`).join(", ") || "없음 ✗");
  console.log("[소자]", circuit.components.map((c) => `${c.id}(${c.type})`).join(" "));
  console.log("[(나) 그래프]", graph ? `있음 — ${JSON.stringify((graph.diagram as any).signals?.[0]?.samples)}` : "없음 ✗");
  const svg = renderAnalogMeshSVG(circuit);
  writeFileSync("thevenin_generic.svg", svg);
  console.log("[SVG]", svg.length, "bytes,", svg.includes("<pre>") ? "⚠<pre>" : "✓ 렌더 정상", "/ 다이아몬드(종속원):", svg.includes("M ") && /diamond|◇/.test(svg) ? "?" : (circuit.components.some(c=>["CCVS","VCVS"].includes(c.type)) ? "종속원 컴포넌트 존재" : "-"));
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
