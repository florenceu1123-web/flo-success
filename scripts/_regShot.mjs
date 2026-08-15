import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderOpampSeriesRegulatorCircuit } from "../lib/renderers/opampSeriesRegulatorCircuitRenderer.ts";
const OUT = resolve("scripts");
const svg = renderOpampSeriesRegulatorCircuit({
  vddLabel: "30V", vzLabel: "10V", rsLabel: "1kΩ", raLabel: "20kΩ", rbLabel: "20kΩ",
  voLabel: "V_o", rlLabel: "5kΩ", noLoad: true,
});
writeFileSync(`${OUT}/_reg.html`, `<html><body style="margin:0;background:#fff;padding:8px"><div style="width:900px">${svg}</div></body></html>`);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run", "--hide-scrollbars",
   "--window-size=940,600", `--screenshot=${OUT}/_reg.png`, `file:///${OUT.split("\\").join("/")}/_reg.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
