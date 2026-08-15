// JK 동기식 카운터 (임용 6번 (가)) 시각 검증 — 하강 에지 버블 + J·K 입력 버블 제거 확인
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_jkEdgeFigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateJkStateMachine } from "../lib/generation/topologies/jkStateMachine.ts";
import { renderJkStateMachineCircuit } from "../lib/renderers/jkStateMachineCircuitRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const g = generateJkStateMachine({ index: 0 }); // index 0 = 원본 재현, clockEdge 기본 falling
const c = g.config;
console.log("config:", JSON.stringify(c), "clockEdge:", g.clockEdge);
const svg = renderJkStateMachineCircuit({ j0: c.J0, k0: c.K0, j1: c.J1, k1: c.K1, j2: c.J2, k2: c.K2, clockEdge: g.clockEdge });
const html = `<html><body style="margin:0;background:#fff;width:940px;padding:12px">
<div style="width:900px">${svg}</div></body></html>`;
writeFileSync(`${OUT}/_jkedge.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=940,400", `--screenshot=${OUT}/_jkedge.png`,
  `file:///${OUT.split("\\").join("/")}/_jkedge.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved scripts/_jkedge.png");
