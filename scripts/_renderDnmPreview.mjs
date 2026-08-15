/** 임용 12번 archetype 렌더 시각검증 (일회성). */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { generateDffNandMuxPair, netTex } from "@/lib/generation/topologies/dffNandMuxPair";
import { renderLogicNetworkSVG } from "@/lib/renderers/logicNetworkRenderer";

const g = generateDffNandMuxPair({ seed: 7, mode: "exam_similar" });
const waveSvg = "";
console.log("D1 =", netTex(g.values.net1), "| D0 =", netTex(g.values.net0),
  "| 정답:", g.answer.atPoints.map((p) => `${p.sym}=${p.q1}${p.q0}`).join(" "));

const out = resolve("scripts/_dnm.html");
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>
body{font-family:system-ui;margin:16px;background:#fff}h3{font-size:14px;margin:16px 0 6px}
.fig{border:1px solid #e5e7eb;border-radius:8px;padding:8px;overflow:auto}</style>
<h3>(가) 문제 figure — 점선 부분이 비어 있어야 함</h3><div class="fig">${renderLogicNetworkSVG(g.circuit)}</div>
<h3>[단계 3] 정답 — 최소 AND/OR 회로 (D₀ = ${netTex(g.answer.dashedNet)})</h3><div class="fig">${renderLogicNetworkSVG(g.minimalNet)}</div>
<h3>(가) 정답 figure — 점선 부분 채워짐</h3><div class="fig">${renderLogicNetworkSVG(g.circuitFilled)}</div>
${waveSvg}`);

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${resolve("scripts")}/_chrome-profile`, "--no-first-run",
  "--window-size=1400,2000", `--screenshot=${resolve("scripts")}/_dnm.png`,
  `file:///${out.split("\\").join("/")}`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_dnm.png");
