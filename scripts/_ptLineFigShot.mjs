// 점전하+선전하 (2023 전기 A-10) 항목 — 본문·정답·그림 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_ptLineFigShot.mjs [mode]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const mode = process.argv[2] ?? "exam_similar";
const inst = generateElectromagnetics({ entryId: "point_line_charge_force", mode, seed: 11 });

console.log("entryId:", inst.entryId, "| mode:", mode);
console.log("\n[본문]\n" + inst.content);
console.log("\n[정답]\n" + inst.answer);

const tex = (s) => s.replaceAll("\\(", "\\(").replaceAll("\\)", "\\)");
const html = `<html><head>
<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]]}};</script>
<script id="MathJax-script" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head><body style="margin:0;background:#fff;width:820px;font:14px/1.7 sans-serif;padding:16px">
<h3>본문</h3><div>${tex(inst.content)}</div>
<h3>주어진 조건</h3><ul>${inst.givens.map((g) => `<li>${tex(g)}</li>`).join("")}</ul>
<h3>해석 절차</h3><div>${inst.question.split("\n").map((q) => `<p>${tex(q)}</p>`).join("")}</div>
<h3>그림</h3><div style="width:560px">${renderEmFieldDiagram(inst.diagram)}</div>
<h3>정답</h3><div>${inst.answer.split("\n").map((q) => `<p>${tex(q)}</p>`).join("")}</div>
</body></html>`;
writeFileSync(`${OUT}/_ptlinefig.html`, html);

mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--virtual-time-budget=6000", "--window-size=850,1250",
  `--screenshot=${OUT}/_ptlinefig.png`, `file:///${OUT.split("\\").join("/")}/_ptlinefig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("\nsaved scripts/_ptlinefig.png");
