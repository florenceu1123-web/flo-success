import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateJkTwoPhaseClockXor as G } from "../lib/generation/topologies/jkTwoPhaseClockXor.ts";
import { renderJkTwoPhaseClockCircuit as R } from "../lib/renderers/jkTwoPhaseClockCircuitRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const s = G({ seed: 0, index: 0, mode: "exam_similar" });
const v = G({ seed: 0, index: 0, mode: "exam_variant" });
console.log("유사 J₁=" + s.values.j1.join("") + " K₁=" + s.values.k1.join("") + " Y₁=" + s.sim.y1.join(""));
console.log("변형 J₁=" + v.values.j1.join("") + " K₁=" + v.values.k1.join("") + " Y₁=" + v.sim.y1.join(""));
const html = `<html><body style="margin:0;background:#fff;width:1000px;padding:10px;font-family:sans-serif">
<b>유사 — EX-OR</b>${R(s.circuitDiagram)}<b>변형 — EX-NOR</b>${R(v.circuitDiagram)}</body></html>`;
writeFileSync(`${OUT}/_jk2p.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run", "--disable-gpu",
  "--window-size=1000,1030", `--screenshot=${OUT}/_jk2p.png`, `file:///${OUT.split("\\").join("/")}/_jk2p.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
