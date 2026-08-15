// 임용 3번 2전원 중첩(V_L=0) 회로 시각 검증 — 원본 배치 대조용
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_nullSrcFigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { __originalNullSource } from "../lib/generation/topologies/acSuperpositionNullSource.ts";
import { renderAcTwoSourceMeshCircuit } from "../lib/renderers/acTwoSourceMeshCircuitRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const g = __originalNullSource();   // 원본 값으로 렌더해 그림을 원본과 직접 대조
console.log("answer:", JSON.stringify(g.answer));
const html = `<html><body style="margin:0;background:#fff;width:760px;padding:12px">
<div style="width:720px">${renderAcTwoSourceMeshCircuit(g.circuitDiagram)}</div></body></html>`;
writeFileSync(`${OUT}/_nullsrc.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=760,500", `--screenshot=${OUT}/_nullsrc.png`,
  `file:///${OUT.split("\\").join("/")}/_nullsrc.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved scripts/_nullsrc.png");
