import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runZenerClipperIntegratorPipeline } from "../lib/pipeline/runZenerClipperIntegratorPipeline.ts";
import { renderZenerClipperCircuit } from "../lib/renderers/zenerClipperIntegratorRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const p = (await runZenerClipperIntegratorPipeline({ mode: "exam_similar", count: 1 }))[0];
const svg = renderZenerClipperCircuit(p.figureVariants[0].diagram);
writeFileSync(`${OUT}/_zcifig.html`, `<html><body style="margin:0;background:#fff;width:680px">${svg}</body></html>`);
console.log("답:", p.answer);
console.log("파형 signals:", (p.figureVariants[1].diagram.signals||[]).length, "개, 샘플", (p.figureVariants[1].diagram.signals?.[0]?.samples||[]).length);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=680,320", `--screenshot=${OUT}/_zcifig.png`, `file:///${OUT.split("\\").join("/")}/_zcifig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_zcifig.png");
