// JFET 전압 바이어스 (임용 2번) — 본문·정답·회로 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_jfetFigShot.mjs [mode]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runJfetVoltageBiasPipeline } from "../lib/pipeline/runJfetVoltageBiasPipeline.ts";
import { renderJfetBiasCircuit } from "../lib/renderers/jfetBiasCircuitRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const mode = process.argv[2] ?? "exam_similar";
const p = (await runJfetVoltageBiasPipeline({ mode, count: 1 }))[0];

console.log("[본문]\n" + p.content);
console.log("\n[정답]\n" + p.answer);

const html = `<html><head>
<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]]}};</script>
<script id="MathJax-script" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head><body style="margin:0;background:#fff;width:780px;font:14px/1.7 sans-serif;padding:16px">
<h3>본문</h3><div>${p.content}</div>
<h3>주어진 조건</h3><ul>${p.conditions.map((c) => `<li>${c}</li>`).join("")}</ul>
<h3>해석 절차</h3>${p.question.split("\n").map((q) => `<p>${q}</p>`).join("")}
<h3>회로</h3><div style="width:560px">${renderJfetBiasCircuit(p.figureVariants[0].diagram)}</div>
<h3>정답</h3>${p.answer.split("\n").map((q) => `<p>${q}</p>`).join("")}
</body></html>`;
writeFileSync(`${OUT}/_jfetfig.html`, html);

mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--virtual-time-budget=6000", "--window-size=810,1300",
  `--screenshot=${OUT}/_jfetfig.png`, `file:///${OUT.split("\\").join("/")}/_jfetfig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("\nsaved scripts/_jfetfig.png");
