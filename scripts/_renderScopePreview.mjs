/** 오실로스코프 archetype 렌더 시각검증 (일회성). */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { generateOscilloscopePhaseL, __originalOscPhaseForVerify } from "@/lib/generation/topologies/oscilloscopePhaseL";
import { renderOscilloscopeScreen, renderOscilloscopePhaseCircuit } from "@/lib/renderers/oscilloscopePhaseCircuitRenderer";

const cases = [
  ["원본 재현 (Ch1 2.00V/div · Ch2 1.00V/div · 500µs/div · R=2000π/√3 · 1H+1H → L=2H)", __originalOscPhaseForVerify()],
  ["유사문제", generateOscilloscopePhaseL({ seed: 4242, mode: "exam_similar" })],
  ["변형문제 (커패시터 — v_C가 60° 뒤짐)", generateOscilloscopePhaseL({ seed: 77, mode: "exam_variant" })],
];
const body = cases.map(([title, g]) => `
  <h3>${title}</h3>
  <div class="row">
    <div class="fig"><div class="cap">(가) 오실로스코프</div>${renderOscilloscopeScreen(g.screen)}</div>
    <div class="fig"><div class="cap">(나) 회로</div>${renderOscilloscopePhaseCircuit(g.circuit)}</div>
  </div>
  <p class="ans">V_m=${g.answer.Vm}V · f=${Math.round(g.answer.f * 100) / 100}Hz · α=${g.answer.alphaDeg}° · 정답 ${g.values.capacitive ? "C" : "L"}=${g.answer.unknown}${g.values.capacitive ? "µF" : "H"}</p>`).join("\n");

const out = resolve("scripts/_scope_preview.html");
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;margin:20px;background:#fff;max-width:1500px}
h3{font-size:15px;margin:22px 0 6px}.row{display:flex;gap:16px;flex-wrap:wrap}
.fig{border:1px solid #e5e7eb;border-radius:8px;padding:6px;width:710px}
.cap{font-size:12px;color:#6b7280}.ans{font-size:13px;color:#1d4ed8;font-weight:600}</style>${body}`);

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${resolve("scripts")}/_chrome-profile`, "--no-first-run",
  "--window-size=1500,2400", `--screenshot=${resolve("scripts")}/_scope_preview.png`,
  `file:///${out.split("\\").join("/")}`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_scope_preview.png");
