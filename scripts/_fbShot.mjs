import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateFfFeedbackZ } from "../lib/generation/topologies/ffFeedbackZWaveform.ts";
import { renderLogicNetworkSVG } from "../lib/renderers/logicNetworkRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const blocks = [];
for (const [n, seed, mode] of [["A", 3, "exam_similar"], ["B", 11, "exam_variant"]]) {
  const g = generateFfFeedbackZ({ seed, index: 0, mode });
  blocks.push(`<h4 style="font:600 12px sans-serif;margin:8px 0 2px">${n}: ${g.values.gTop}/${g.values.gBot}/${g.values.gJoin} · T@${g.values.tffAt}</h4>
<div style="width:1000px">${renderLogicNetworkSVG(g.diagram)}</div>`);
}
writeFileSync(`${OUT}/_fb.html`, `<html><body style="margin:0;background:#fff;padding:8px">${blocks.join("")}</body></html>`);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=1040,860", `--screenshot=${OUT}/_fb.png`, `file:///${OUT.split("\\").join("/")}/_fb.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
