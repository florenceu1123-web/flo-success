// 임용 5번 (가)·(나) 렌더러 시각 검증.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runNortonParamInversePipeline } from "../lib/pipeline/runNortonParamInversePipeline.ts";
import { renderNortonOriginal, renderNortonEquivalent } from "../lib/renderers/nortonParamInverseRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const p = (await runNortonParamInversePipeline({ mode: "exam_similar", count: 1 }))[0];
const a = renderNortonOriginal(p.figureVariants[0].diagram);
const b = renderNortonEquivalent(p.figureVariants[1].diagram);
writeFileSync(`${OUT}/_nortonfig.html`, `<html><body style="margin:0;background:#fff;width:620px">${a}${b}</body></html>`);
console.log("답:", p.answer);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=620,540", `--screenshot=${OUT}/_nortonfig.png`,
  `file:///${OUT.split("\\").join("/")}/_nortonfig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_nortonfig.png");
