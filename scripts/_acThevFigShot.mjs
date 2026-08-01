// 2전원 테브난 최대전력 — 유사(원본형)/변형(두 전원망) 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_acThevFigShot.mjs [mode]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateAcTheveninMaxPower } from "../lib/generation/topologies/acTheveninMaxPower.ts";
import { writeAcTheveninMaxPowerText } from "../lib/generation/topologies/acTheveninMaxPowerTextWriter.ts";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const mode = process.argv[2] ?? "exam_similar";
const g = generateAcTheveninMaxPower({ seed: 7, mode });
const t = writeAcTheveninMaxPowerText({ generation: g });

console.log("topology:", g.topology);
console.log("[본문]", t.content);
console.log("[정답]", t.answer);

const html = `<html><body style="margin:0;background:#fff;width:760px;font:14px/1.7 sans-serif;padding:16px">
<h3>본문 (${mode})</h3><div>${t.content}</div>
<h3>조건</h3><ul>${t.conditions.map((c) => `<li>${c}</li>`).join("")}</ul>
<h3>해석 절차</h3>${t.question.split("\n").map((q) => `<p>${q}</p>`).join("")}
<h3>회로</h3><div style="width:700px">${renderAnalogMeshSVG(g.netlist)}</div>
<h3>정답</h3><p>${t.answer}</p>
<h3>풀이</h3>${t.solution.split("\n").map((q) => `<p>${q}</p>`).join("")}
</body></html>`;
writeFileSync(`${OUT}/_acthev_${mode}.html`, html);

mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=790,1150", `--screenshot=${OUT}/_acthev_${mode}.png`,
  `file:///${OUT.split("\\").join("/")}/_acthev_${mode}.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_acthev_" + mode + ".png");
