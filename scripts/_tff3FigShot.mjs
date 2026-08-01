// T-FF 3개 자율 카운터 (임용 11번) 세 figure 시각 검증 — 헤드리스 Chrome 스크린샷.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_tff3FigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateTff3AutonomousCounter } from "../lib/generation/topologies/tff3AutonomousCounter.ts";
import { renderTff3CounterCircuit } from "../lib/renderers/tff3CounterCircuitRenderer.ts";
import { renderJkStateDiagram } from "../lib/renderers/jkStateDiagramRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const mode = process.argv[2] ?? "exam_similar";
const g = generateTff3AutonomousCounter({ seed: 3, mode });

console.log("gateKind:", g.gateKind);
console.log("T_C =", g.expressions.TC, "| T_B =", g.expressions.TB, "| T_A =", g.expressions.TA);
console.log("사이클:", g.cycle.join(" → "), "→", g.cycle[0]);
console.log("비순환:", g.nonCyclic.map((x) => `${x.state}→${x.next}`).join(", "));
console.log("T_B 최소 SOP =", g.tbSop);
console.log("㉢:", g.tbGate.g1, "/", g.tbGate.g2);
console.log("㉠(Bₙ₊₁ 열) =", g.blanks.blank1.values.join(", "), "| ㉡(T_B 열) =", g.blanks.blank2.values.join(", "));

const table = `<table style="border-collapse:collapse;font:13px sans-serif;margin:12px">
<tr>${[...g.stateTable.variables, ...g.stateTable.outputLabels]
  .map((h) => `<th style="border:1px solid #94a3b8;padding:4px 10px;background:#eff6ff">${h}</th>`).join("")}</tr>
${g.stateTable.rows.map((r) => `<tr>${[...r.inputs, ...r.outputs]
  .map((c) => `<td style="border:1px solid #cbd5e1;padding:4px 10px;text-align:center">${c}</td>`).join("")}</tr>`).join("")}
</table>`;

const html = `<html><body style="margin:0;background:#fff;width:900px;font:14px sans-serif">
<h3 style="margin:8px 12px">(가) 상태도</h3><div style="width:560px">${renderJkStateDiagram(g.stateDiagram)}</div>
<h3 style="margin:8px 12px">(나) 상태표</h3>${table}
<h3 style="margin:8px 12px">(다) 회로도</h3><div style="width:880px">${renderTff3CounterCircuit(g.circuitDiagram)}</div>
</body></html>`;
writeFileSync(`${OUT}/_tff3fig.html`, html);

mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=920,1650", `--screenshot=${OUT}/_tff3fig.png`, `file:///${OUT.split("\\").join("/")}/_tff3fig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_tff3fig.png");
