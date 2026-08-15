// AC+DC 중첩 RC (임용 12번 (가)) 회로 시각 검증 — R₁ 추가 후 원본과 대조용
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_acDcRcFigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateAcDcSuperpositionRc } from "../lib/generation/topologies/acDcSuperpositionRc.ts";
import { renderAcDcSuperpositionRcCircuit } from "../lib/renderers/acDcSuperpositionRcCircuitRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const g = generateAcDcSuperpositionRc({ seed: 1, mode: "exam_similar" });
console.log("values:", JSON.stringify(g.values));
console.log("derived:", JSON.stringify(g.derived));
const html = `<html><body style="margin:0;background:#fff;width:740px;padding:12px">
<div style="width:700px">${renderAcDcSuperpositionRcCircuit(g.circuitDiagram)}</div></body></html>`;
writeFileSync(`${OUT}/_acdcrc.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=740,560", `--screenshot=${OUT}/_acdcrc.png`,
  `file:///${OUT.split("\\").join("/")}/_acdcrc.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_acdcrc.png");
