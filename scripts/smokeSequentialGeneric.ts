/**
 * 디지털 순서논리 generic 파이프라인 라이브 smoke (임용 12번).
 *  실행: npx tsx --env-file=.env.local scripts/smokeSequentialGeneric.ts
 */
import { writeFileSync } from "node:fs";
import { runSequentialGenericPipeline } from "../lib/pipeline/runSequentialGenericPipeline";
import { renderFigure } from "../lib/renderers";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalysisResult } from "../types";

const analysis: AnalysisResult = {
  topic: "D 플립플롭 회로 분석",
  interpretation:
    "D 플립플롭 2개(Q1, Q0)와 NAND·NOT 게이트로 구성된 순서논리 회로. 외부 입력 A, B와 클록 CLK가 " +
    "입력될 때 각 D 입력은 A·B·Q1·Q0의 조합논리로 결정된다. ㉠㉡㉢ 지점에서 Q1Q0 상태를 구하고 " +
    "점선 부분을 최소 AND·OR 게이트로 설계하는 문제. (나)는 클록·A·B 입력 파형.",
  relatedConcepts: ["D 플립플롭", "클록", "상태", "Q_1Q_0", "타이밍", "최소화"],
  fillInTheBlanks: [], subjectKey: "digital_logic", topicKey: "flipflop_counter" as never,
  signals: { inputs: ["A", "B"], outputs: ["Q1", "Q0"] },
  componentInventory: [
    { id: "FF1", type: "DFF" }, { id: "FF0", type: "DFF" },
    { id: "g1", type: "NAND" }, { id: "g2", type: "NAND" }, { id: "g3", type: "NOT" },
  ],
} as AnalysisResult;

async function main() {
  const problems = await runSequentialGenericPipeline({ analysis, mode: "exam_similar", count: 1 });
  const p = problems[0];
  const circuit = p.figureVariants?.find((f) => f.diagramType === "logic_network");
  const wave = p.figureVariants?.find((f) => f.diagramType === "waveform");
  const d = circuit?.diagram as { gates: Array<{ id: string; type: string; output: string; inputs: string[] }>; inputs: string[]; outputs: string[] };
  console.log("[answer]", p.answer);
  console.log("[inputs/outputs]", JSON.stringify(d.inputs), JSON.stringify(d.outputs));
  console.log("[FF]", d.gates.filter((g) => g.type === "DFF").map((g) => `${g.id}:D=${g.inputs[0]}→${g.output}`).join(", "));
  console.log("[gates]", d.gates.map((g) => `${g.type}(${g.inputs.join(",")})→${g.output}`).join(" | "));
  // 렌더
  try {
    const svgCircuit = renderToStaticMarkup(renderFigure(circuit as never) as never);
    const svgWave = renderToStaticMarkup(renderFigure(wave as never) as never);
    writeFileSync("seq_circuit.svg", svgCircuit.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? svgCircuit);
    writeFileSync("seq_wave.svg", svgWave.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? svgWave);
    console.log("[render] 회로", svgCircuit.length, "b /", svgCircuit.includes("unsupported") ? "✗" : "✓", "| 파형", svgWave.length, "b", svgWave.includes("unsupported") ? "✗" : "✓");
  } catch (e) { console.log("[render] 실패:", String(e)); }
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
