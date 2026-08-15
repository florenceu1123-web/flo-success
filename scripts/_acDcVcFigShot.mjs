import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateAcDcSourceSuperpositionVc } from "../lib/generation/topologies/acDcSourceSuperpositionVc.ts";
import { renderAcDcSourceSuperpositionCircuit as R } from "../lib/renderers/acDcSourceSuperpositionCircuitRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const s = generateAcDcSourceSuperpositionVc({ seed: 2, index: 0, mode: "exam_similar" });
const v = generateAcDcSourceSuperpositionVc({ seed: 2, index: 0, mode: "exam_variant" });
console.log("유사:", JSON.stringify(s.values), "→ V_C(DC)=", s.sol.vcDc);
const html = `<html><body style="margin:0;background:#fff;width:800px;padding:10px;font-family:sans-serif">
<b>유사 — v_c(t)</b>${R(s.circuitDiagram)}<b>변형 — 가운데 가지 i(t)</b>${R(v.circuitDiagram)}</body></html>`;
writeFileSync(`${OUT}/_acdcvc.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run", "--disable-gpu",
  "--window-size=800,1030", `--screenshot=${OUT}/_acdcvc.png`, `file:///${OUT.split("\\").join("/")}/_acdcvc.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
