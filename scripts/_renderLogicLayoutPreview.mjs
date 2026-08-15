/** logic_network 레이아웃 + 점선 빈칸 시각검증 (일회성). */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { renderLogicNetworkSVG } from "@/lib/renderers/logicNetworkRenderer";

// 임용 12번 원본 구조: D₁ = NAND(NAND(1,A), NAND(B,Ā)), D₀ = NAND(NAND(1,Q₁), NAND(Ā,Q₁))
const diagram = {
  inputs: ["A", "B", "ONE", "CLK"],
  outputs: ["Q1", "Q0"],
  gates: [
    { id: "n_a", type: "NOT", inputs: ["A"], output: "Abar" },
    { id: "g1", type: "NAND", inputs: ["ONE", "A"], output: "u1" },
    { id: "g2", type: "NAND", inputs: ["B", "Abar"], output: "u2" },
    { id: "g3", type: "NAND", inputs: ["u1", "u2"], output: "D1" },
    { id: "ff1", type: "DFF", inputs: ["D1"], output: "Q1", clockSignal: "CLK" },
    { id: "h1", type: "NAND", inputs: ["ONE", "Q1"], output: "w1" },
    { id: "h2", type: "NAND", inputs: ["Abar", "Q1"], output: "w2" },
    { id: "h3", type: "NAND", inputs: ["w1", "w2"], output: "D0" },
    { id: "ff0", type: "DFF", inputs: ["D0"], output: "Q0", clockSignal: "CLK" },
  ],
  signalLabels: { D1: "D₁", D0: "D₀", Q1: "Q₁", Q0: "Q₀", Abar: "Ā", ONE: "1" },
  dashedRegions: [{ gateIds: ["h1", "h2", "h3"], label: "㉢", hideContents: true }],
};
const filled = { ...diagram, dashedRegions: [{ gateIds: ["h1", "h2", "h3"], label: "㉢" }] };

const out = resolve("scripts/_logic_layout.html");
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>
body{font-family:system-ui;margin:16px;background:#fff}h3{font-size:15px;margin:18px 0 6px}
.fig{border:1px solid #e5e7eb;border-radius:8px;padding:8px;overflow:auto}</style>
<h3>문제 figure — 점선(㉢) 안이 비어 있어야 함</h3><div class="fig">${renderLogicNetworkSVG(diagram)}</div>
<h3>정답 figure — 점선 안 채워짐 (solutionFigures)</h3><div class="fig">${renderLogicNetworkSVG(filled)}</div>`);

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${resolve("scripts")}/_chrome-profile`, "--no-first-run",
  "--window-size=1500,1500", `--screenshot=${resolve("scripts")}/_logic_layout.png`,
  `file:///${out.split("\\").join("/")}`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_logic_layout.png");
