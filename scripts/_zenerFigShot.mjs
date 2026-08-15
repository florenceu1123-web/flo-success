// 제너다이오드 심볼 방향 시각 검증 (임용 8번 zener_bjt_regulator)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_zenerFigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderZenerBjtRegulatorCircuit } from "../lib/renderers/zenerBjtRegulatorCircuitRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const svg = renderZenerBjtRegulatorCircuit({
  vinLabel: "20V", vzLabel: "V_z = 7.3V", r1Label: "R₁ 120Ω", r2Label: "R₂ 500Ω",
  r3Label: "R₃ 150Ω", r4Label: "R₄", voLabel: "V_o", ilLabel: "I_L", i1Label: "I₁", izLabel: "I_z",
});
const html = `<html><body style="margin:0;background:#fff;width:760px;padding:16px">
<div style="width:700px">${svg}</div></body></html>`;
writeFileSync(`${OUT}/_zener.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=760,520", `--screenshot=${OUT}/_zener.png`,
  `file:///${OUT.split("\\").join("/")}/_zener.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_zener.png");
