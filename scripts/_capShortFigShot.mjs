// 임용 7번 (스위치가 커패시터를 단락) 회로 그림 + generic 접지 병합 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_capShortFigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateSwitchedCapShortRl } from "../lib/generation/topologies/switchedCapShortRl.ts";
import { renderSwitchedCapShortRlCircuit } from "../lib/renderers/switchedCapShortRlCircuitRenderer.ts";
import { renderNetlistEdgeSVG } from "../lib/renderers/netlistEdgeRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const sim = generateSwitchedCapShortRl({ seed: 3, index: 0, mode: "exam_similar" });
const varn = generateSwitchedCapShortRl({ seed: 3, index: 0, mode: "exam_variant" });
console.log("유사:", JSON.stringify(sim.values), "변형:", JSON.stringify(varn.values));

const pin = (a, b) => [{ id: "p1", node: a, side: "left" }, { id: "p2", node: b, side: "right" }];
const genericSvg = renderNetlistEdgeSVG({
  nodes: ["n1", "n2", "n3", "GND"],
  ground: "GND",
  components: [
    { id: "V1", type: "V", value: "10V", pins: pin("n1", "GND") },
    { id: "R1", type: "R", value: "1Ω", pins: pin("n1", "n2") },
    { id: "R2", type: "R", value: "2Ω", pins: pin("n2", "GND") },
    { id: "R3", type: "R", value: "3Ω", pins: pin("n2", "n3") },
    { id: "R4", type: "R", value: "4Ω", pins: pin("n3", "GND") },
  ],
  edges: [],
});

const html = `<html><body style="margin:0;background:#fff;width:1500px;padding:12px;font-family:sans-serif">
<div style="display:flex;gap:16px">
  <div style="width:470px"><b>유사 (i_L)</b>${renderSwitchedCapShortRlCircuit(sim.circuitDiagram)}</div>
  <div style="width:470px"><b>변형 (v_L)</b>${renderSwitchedCapShortRlCircuit(varn.circuitDiagram)}</div>
  <div style="width:470px"><b>generic — GND 핀 3개 → 접지 1개</b>${genericSvg}</div>
</div></body></html>`;
writeFileSync(`${OUT}/_capshort.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=1500,560", `--screenshot=${OUT}/_capshort.png`,
  `file:///${OUT.split("\\").join("/")}/_capshort.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved scripts/_capshort.png");
