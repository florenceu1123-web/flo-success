// 임용 6번 전용 렌더러 시각 검증 — SVG 렌더 → 헤드리스 Chrome 스크린샷.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runSupernodeDepMaxPowerPipeline } from "../lib/pipeline/runSupernodeDepMaxPowerPipeline.ts";
import { renderSupernodeDepMaxPower } from "../lib/renderers/supernodeDepMaxPowerRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const probs = await runSupernodeDepMaxPowerPipeline({ mode: "exam_similar", count: 1 });
const svg = renderSupernodeDepMaxPower(probs[0].figureVariants[0].diagram);
writeFileSync(`${OUT}/_sndfig.html`, `<html><body style="margin:0;background:#fff;width:640px">${svg}</body></html>`);
console.log("SVG", svg.length, "자 / 접지 기호 개수:", (svg.match(/stroke-width="1.8"/g) || []).length);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=640,360", `--screenshot=${OUT}/_sndfig.png`,
  `file:///${OUT.split("\\").join("/")}/_sndfig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_sndfig.png");
