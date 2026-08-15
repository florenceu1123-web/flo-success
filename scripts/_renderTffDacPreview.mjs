/** T-FF 체인 + R-2R DAC 회로 렌더 시각검증 (일회성). */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { generateShiftRegisterDac } from "@/lib/generation/topologies/counterDacComparator";
import { renderMixedCircuitSVG } from "@/lib/renderers/mixedCircuitRenderer";

const g = generateShiftRegisterDac({ bits: 3, seed: 4242, mode: "exam_similar" });
console.log("gates:", g.mixedCircuit.logic.gates.map((x) => `${x.id}:${x.type}(${x.inputs})`).join(" "));
const out = resolve("scripts/_tffdac.html");
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>
body{font-family:system-ui;margin:16px;background:#fff}h3{font-size:15px}
.fig{border:1px solid #e5e7eb;border-radius:8px;padding:8px;width:1080px}</style>
<h3>(가) T 플립플롭 체인 + R-2R DAC + OPAMP</h3>
<div class="fig">${renderMixedCircuitSVG(g.mixedCircuit)}</div>`);

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${resolve("scripts")}/_chrome-profile`, "--no-first-run",
  "--window-size=1140,760", `--screenshot=${resolve("scripts")}/_tffdac.png`,
  `file:///${out.split("\\").join("/")}`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_tffdac.png");
