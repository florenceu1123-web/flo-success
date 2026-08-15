// 임용 24번 FF 회로 시각 검증 — 크기 배율·직선 배선 확인
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateFfReachableStates } from "../lib/generation/topologies/ffReachableStates.ts";
import { renderLogicNetworkSVG } from "../lib/renderers/logicNetworkRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const blocks = [];
for (const [n, seed] of [["A", 3], ["B", 11]]) {
  const g = generateFfReachableStates({ seed, index: 0, mode: "exam_similar" });
  blocks.push(`<h4 style="font:600 13px sans-serif;margin:10px 0 2px">${n}: T@${g.values.tffAt} · ${g.values.gate} · init(${g.values.init})</h4>
<div style="width:900px">${renderLogicNetworkSVG(g.diagram)}</div>`);
}
writeFileSync(`${OUT}/_ff.html`, `<html><body style="margin:0;background:#fff;padding:10px">${blocks.join("")}</body></html>`);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=960,900", `--screenshot=${OUT}/_ff.png`, `file:///${OUT.split("\\").join("/")}/_ff.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved scripts/_ff.png");
