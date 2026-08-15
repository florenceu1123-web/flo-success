/** 변형모드 렌더 확인 (일회성) — 좌상·가교·좌하가 C·L·C로 바뀌었는지 시각 확인. */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { generateAcDeltaWyeBridge } from "@/lib/generation/topologies/acDeltaWyeBridge";
import { renderAcDeltaWyeBridgeCircuit, renderAcDeltaWyeEquivCircuit } from "@/lib/renderers/acDeltaWyeBridgeCircuitRenderer";

// 변형문제 2와 같은 값(−j6·6·j6·−j8·8, V=28)이 나오는 조합을 찾아 렌더
let g = null;
for (let s = 1; s < 4000 && !g; s++) {
  const c = generateAcDeltaWyeBridge({ seed: s, mode: "exam_variant" });
  if (c.values.X === 6 && c.values.t === 8 && c.values.V === 28) g = c;
}
g = g ?? generateAcDeltaWyeBridge({ seed: 3, mode: "exam_variant" });
const html = `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui;margin:16px;background:#fff}
.fig{border:1px solid #e5e7eb;border-radius:8px;padding:8px;width:720px;margin-bottom:12px}
.cap{font-size:12px;color:#6b7280}</style>
<h3>변형문제 — 소자 종류 교환 (좌상 C · 가교 L · 좌하 C)</h3>
<div class="fig"><div class="cap">(가)</div>${renderAcDeltaWyeBridgeCircuit(g.bridgeDiagram)}</div>
<div class="fig"><div class="cap">(나)</div>${renderAcDeltaWyeEquivCircuit(g.equivDiagram)}</div>`;
const out = resolve("scripts/_dwye_variant.html");
fs.writeFileSync(out, html);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${resolve("scripts")}/_chrome-profile`, "--no-first-run",
  "--window-size=790,1120", `--screenshot=${resolve("scripts")}/_dwye_variant.png`,
  `file:///${out.split("\\").join("/")}`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("values:", JSON.stringify(g.values.arms), "Z=", g.answer.Zab.re, g.answer.Zab.im);
console.log("saved scripts/_dwye_variant.png");
