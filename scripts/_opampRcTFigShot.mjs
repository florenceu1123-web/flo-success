// OPAMP T형 RC망 + 사인파 발진기 (임용 9번) — 본문·정답·(가)(나) 회로 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_opampRcTFigShot.mjs [mode]
//   ※ 반드시 Write 도구로 만들 것 (PowerShell 복사 시 한글 인코딩 깨짐).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runOpampRcTOscillatorPipeline } from "../lib/pipeline/runOpampRcTOscillatorPipeline.ts";
import { renderOpampRcTOscillator } from "../lib/renderers/opampRcTOscillatorRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const mode = process.argv[2] ?? "exam_similar";
const p = (await runOpampRcTOscillatorPipeline({ mode, count: 1 }))[0];

console.log("[정답]\n" + p.answer);

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const html = `<html><head>
<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]]}};</script>
<script id="MathJax-script" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head><body style="margin:0;background:#fff;width:760px;font:14px/1.8 sans-serif;padding:16px">
<h3>본문 (${mode})</h3><div>${esc(p.content)}</div>
<h3>주어진 조건</h3><ul>${p.conditions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
<h3>해석 절차</h3>${p.question.split("\n").map((q) => `<p>${esc(q)}</p>`).join("")}
<h3>회로</h3>
<div style="width:640px">${renderOpampRcTOscillator(p.figureVariants[0].diagram)}</div>
<div style="width:640px">${renderOpampRcTOscillator(p.figureVariants[1].diagram)}</div>
<h3>정답</h3>${p.answer.split("\n").map((q) => `<p>${esc(q)}</p>`).join("")}
<h3>풀이</h3>${p.solution.split("\n").map((q) => `<p>${esc(q)}</p>`).join("")}
</body></html>`;
writeFileSync(`${OUT}/_opamprct_${mode}.html`, html);

mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--virtual-time-budget=6000", "--window-size=790,1750",
  `--screenshot=${OUT}/_opamprct_${mode}.png`, `file:///${OUT.split("\\").join("/")}/_opamprct_${mode}.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_opamprct_" + mode + ".png");
