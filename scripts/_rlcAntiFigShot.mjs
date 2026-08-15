import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateRlcAntiresonanceLadder as G } from "../lib/generation/topologies/rlcAntiresonanceLadder.ts";
import { renderRlcAntiresonanceLadderCircuit as R } from "../lib/renderers/rlcAntiresonanceLadderCircuitRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const s = G({ seed: 0, index: 0, mode: "exam_similar" });
console.log("유사:", JSON.stringify(s.values), "|I|=", s.sol.Imag);
const html = `<html><body style="margin:0;background:#fff;width:920px;padding:10px;font-family:sans-serif">
<b>유사 — i(t)</b>${R(s.circuitDiagram)}</body></html>`;
writeFileSync(`${OUT}/_rlcanti.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run", "--disable-gpu",
  "--window-size=920,460", `--screenshot=${OUT}/_rlcanti.png`, `file:///${OUT.split("\\").join("/")}/_rlcanti.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
