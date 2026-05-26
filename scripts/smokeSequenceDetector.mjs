/**
 * Sequence detector smoke — generator + 3 renderer (no OpenAI).
 *
 *   - 3 패턴 ('110', '101', '011') 각각 generator + 3 figure
 *   - HTML 출력: 패턴별로 (가)(나)(다) figure + answer/SOP 표시
 */
import { writeFileSync } from "node:fs";
import { generateSequenceDetector } from "../lib/generation/topologies/sequenceDetector.ts";
import {
  renderSequenceBlock,
  renderSequenceStateDiagram,
  renderSequenceStateTable,
} from "../lib/renderers/sequenceDetectorRenderer.ts";

const blocks = [];
const ALL_STATES = ["00", "01", "10", "11"];

for (const pattern of ["110", "101", "011"]) {
  const gen = generateSequenceDetector({ params: { sequencePattern: pattern }, seed: 1 });
  console.log(`\n=== pattern '${pattern}' ===`);
  console.log(`  blanks: ㉠=${gen.blanks.a}, ㉡=${gen.blanks.b}, ㉢=${gen.blanks.c}, ㉣=${gen.blanks.d}`);
  console.log(`  SOP z = ${gen.sop.z}`);
  console.log(`  SOP D_A = ${gen.sop.D_A}`);
  console.log(`  SOP D_B = ${gen.sop.D_B}`);

  const blockSvg = renderSequenceBlock({
    inputLabel: "y",
    outputLabel: "z",
    boxLabel: "시퀀스 검출기",
  });
  const stateSvg = renderSequenceStateDiagram({
    states: ALL_STATES.map((code) => ({ code, isUsed: gen.usedStates.has(code) })),
    transitions: gen.transitions,
    blankSourceState: gen.blanks.sourceState,
  });
  const tableSvg = renderSequenceStateTable({
    transitions: gen.transitions,
    hideAnswers: true,
  });

  // Verify SVG non-empty + has key markers
  const checks = [
    { name: "blockSvg has 시퀀스 검출기", ok: blockSvg.includes("시퀀스 검출기") },
    { name: "stateSvg has ㉠", ok: stateSvg.includes("㉠") },
    { name: "stateSvg has ㉡", ok: stateSvg.includes("㉡") },
    { name: "stateSvg has ㉢", ok: stateSvg.includes("㉢") },
    { name: "stateSvg has ㉣", ok: stateSvg.includes("㉣") },
    { name: "stateSvg has 4 states", ok: ALL_STATES.every((s) => stateSvg.includes(`>${s}<`)) },
    { name: "tableSvg has don't care 'x'", ok: tableSvg.includes(">x<") },
    { name: "tableSvg has all 4 states", ok: ALL_STATES.every((s) => tableSvg.includes(`>${s[0]}<`)) },
  ];
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
    if (!c.ok) {
      console.log("FAIL");
      process.exit(1);
    }
  }

  blocks.push(`
<h2>Pattern '${pattern}'</h2>
<pre>blanks: ㉠=${gen.blanks.a}, ㉡=${gen.blanks.b}, ㉢=${gen.blanks.c}, ㉣=${gen.blanks.d}
SOP:
  z   = ${gen.sop.z}
  D_A = ${gen.sop.D_A}
  D_B = ${gen.sop.D_B}
Used states: ${[...gen.usedStates].sort().join(", ")} | Don't care: ${ALL_STATES.filter((s) => !gen.usedStates.has(s)).join(", ") || "(none)"}</pre>
<h3>(가) 블록도</h3>
<div style="border:1px solid #ccc;display:inline-block">${blockSvg}</div>
<h3>(나) 상태 전이도 (㉠㉡㉢㉣ 빈칸)</h3>
<div style="border:1px solid #ccc;display:inline-block">${stateSvg}</div>
<h3>(다) 상태표 (학생 채우기, x = don't care)</h3>
<div style="border:1px solid #ccc;display:inline-block">${tableSvg}</div>
<hr/>`);
}

const html = `<!doctype html><meta charset="utf-8"><title>SequenceDetector smoke</title>
<style>body{margin:20px;font:14px sans-serif}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>시퀀스 검출기 archetype smoke (3 패턴)</h1>
${blocks.join("\n")}`;
writeFileSync("scripts/smokeSequenceDetector.html", html);
console.log("\nHTML saved -> scripts/smokeSequenceDetector.html");
console.log("\n=== All 3 patterns PASS ===");
