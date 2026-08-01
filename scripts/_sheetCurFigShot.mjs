// 두 무한 면전류 + 자위 + 자속 (임용 10번) — 본문·정답·그림 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_sheetCurFigShot.mjs [mode]
//   ※ 이 스크립트는 반드시 Write 도구로 만든다 — PowerShell `Get-Content -Raw | Out-File`로
//     복사하면 UTF-8 한글이 깨진다(실측 2회).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const mode = process.argv[2] ?? "exam_similar";
const inst = generateElectromagnetics({ entryId: "sheet_currents_vector_potential", mode, seed: 4 });

console.log("entryId:", inst.entryId, "| mode:", mode);
console.log("\n[정답]\n" + inst.answer);

// ★ 수식 안의 부등호(-5<y<5)를 그대로 HTML에 넣으면 `<y`가 태그로 먹혀 본문이 잘린다.
//   (앱은 React 텍스트 노드라 무사하지만, 이 검증 페이지는 innerHTML이라 escape가 필요하다.)
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const html = `<html><head>
<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]]}};</script>
<script id="MathJax-script" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head><body style="margin:0;background:#fff;width:820px;font:14px/1.8 sans-serif;padding:16px">
<h3>본문 (${mode})</h3><div>${esc(inst.content)}</div>
<h3>주어진 조건</h3><ul>${inst.givens.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
<h3>해석 절차</h3>${inst.question.split("\n").map((q) => `<p>${esc(q)}</p>`).join("")}
<h3>그림</h3><div style="width:560px">${renderEmFieldDiagram(inst.diagram)}</div>
<h3>정답</h3>${inst.answer.split("\n").map((q) => `<p>${esc(q)}</p>`).join("")}
<h3>풀이</h3>${inst.steps.map((q) => `<p>${esc(q)}</p>`).join("")}
</body></html>`;
writeFileSync(`${OUT}/_sheetcurfig.html`, html);

mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--virtual-time-budget=6000", "--window-size=850,1450",
  `--screenshot=${OUT}/_sheetcurfig.png`, `file:///${OUT.split("\\").join("/")}/_sheetcurfig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("\nsaved scripts/_sheetcurfig.png");
