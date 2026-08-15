// 임용 27번 (가) 회로 + (나) 파형(구간 ㉠·㉡·㉢) 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_dffPresetClearFigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateDffPresetClearRegions } from "../lib/generation/topologies/dffPresetClearRegions.ts";
import { renderDffPresetClearCircuit } from "../lib/renderers/dffPresetClearCircuitRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const sim = generateDffPresetClearRegions({ seed: 0, index: 0, mode: "exam_similar" });
const varn = generateDffPresetClearRegions({ seed: 0, index: 0, mode: "exam_variant" });
console.log("유사 구간:", sim.regions.map((r) => `A${r.a}B${r.b}×${r.pulses}`).join(" "), "→", sim.sim.modes.join(","));
console.log("변형 구간:", varn.regions.map((r) => `A${r.a}B${r.b}×${r.pulses}`).join(" "), "→", varn.sim.modes.join(","));

// ※ (나) 파형 렌더러는 .tsx라 node가 직접 import할 수 없다(JSX). 회로 그림만 시각 검증하고,
//   파형은 구조 스모크 + 실제 앱 화면으로 확인한다.
const html = `<html><body style="margin:0;background:#fff;width:1100px;padding:14px;font-family:sans-serif">
<div style="display:flex;gap:14px;align-items:flex-start;flex-direction:column">
  <div style="width:1040px"><b>(가) 유사 — PR̄=${sim.presetExpr} / CLR̄=${sim.clearExpr}</b>${renderDffPresetClearCircuit(sim.circuitDiagram)}</div>
  <div style="width:1040px"><b>(가) 변형 — PR̄=${varn.presetExpr} / CLR̄=${varn.clearExpr} (결선이 매번 달라진다)</b>${renderDffPresetClearCircuit(varn.circuitDiagram)}</div>
</div></body></html>`;
writeFileSync(`${OUT}/_dffpc.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=1100,1060", `--screenshot=${OUT}/_dffpc.png`,
  `file:///${OUT.split("\\").join("/")}/_dffpc.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved scripts/_dffpc.png");
