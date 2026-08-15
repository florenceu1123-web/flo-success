import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateMaxPowerTwoSourceRatio as G } from "../lib/generation/topologies/maxPowerTwoSourceRatio.ts";
import { renderMaxPowerTwoSourceCircuit as R } from "../lib/renderers/maxPowerTwoSourceCircuitRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const s = G({ seed: 0, index: 0, mode: "exam_similar" });
const v = G({ seed: 0, index: 0, mode: "exam_variant" });
console.log("유사 R=" + s.sol.RL + " L=" + (s.sol.loadElem * 1000) + "mH η₁=" + s.sol.eta1);
console.log("변형 R=" + v.sol.RL + " C=" + (v.sol.loadElem * 1e6) + "µF η₁=" + v.sol.eta1);
const html = `<html><body style="margin:0;background:#fff;width:740px;padding:8px;font-family:sans-serif">
<b>유사 (가)</b>${R(s.figA)}<b>유사 (나)</b>${R(s.figB)}<b>변형 (가) — 부하가 R+C</b>${R(v.figA)}</body></html>`;
writeFileSync(`${OUT}/_maxp2.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run", "--disable-gpu",
  "--window-size=740,1300", `--screenshot=${OUT}/_maxp2.png`, `file:///${OUT.split("\\").join("/")}/_maxp2.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
