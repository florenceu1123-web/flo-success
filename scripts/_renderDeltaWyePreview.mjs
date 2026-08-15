/**
 * Δ-Y 브리지 렌더 시각검증용 HTML 생성 (일회성 도구).
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_renderDeltaWyePreview.mjs <out.html>
 */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { generateAcDeltaWyeBridge, __originalDeltaWyeForVerify } from "@/lib/generation/topologies/acDeltaWyeBridge";
import { renderAcDeltaWyeBridgeCircuit, renderAcDeltaWyeEquivCircuit } from "@/lib/renderers/acDeltaWyeBridgeCircuitRenderer";

const out = process.argv[2] ?? "preview.html";
const cases = [
  ["원본 재현 (j2·2·−j2·j2·2, V=20∠0°)", __originalDeltaWyeForVerify()],
  ["유사문제 (exam_similar)", generateAcDeltaWyeBridge({ seed: 12345, mode: "exam_similar" })],
  ["변형문제 (exam_variant — 소자 종류 교환)", generateAcDeltaWyeBridge({ seed: 999, mode: "exam_variant" })],
];
const body = cases.map(([title, g]) => `
  <h2>${title}</h2>
  <div class="row">
    <div class="fig"><div class="cap">(가) 브리지</div>${renderAcDeltaWyeBridgeCircuit(g.bridgeDiagram)}</div>
    <div class="fig"><div class="cap">(나) Δ-Y 변환 등가</div>${renderAcDeltaWyeEquivCircuit(g.equivDiagram)}</div>
  </div>
  <p class="ans">Z = ${g.answer.Zab.re}${g.answer.Zab.im < 0 ? "−" : "+"}j${Math.abs(g.answer.Zab.im)} [Ω],
     a = ${g.answer.m}√2, I 위상 ${g.answer.iPhase}°</p>`).join("\n");

fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Δ-Y 브리지 렌더 검증</title>
<style>body{font-family:system-ui,sans-serif;background:#fff;color:#111;margin:24px;max-width:1500px}
h2{font-size:16px;margin:28px 0 8px}.row{display:flex;gap:20px;flex-wrap:wrap}
.fig{border:1px solid #e5e7eb;border-radius:8px;padding:8px;width:720px}
.cap{font-size:12px;color:#6b7280;margin-bottom:4px}.ans{font-size:13px;color:#1d4ed8;font-weight:600}</style>
${body}`);
console.log("wrote", out);

// 헤드리스 Chrome 스크린샷 (형제 도구 _acThevFigShot.mjs와 동일 방식)
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (fs.existsSync(CHROME)) {
  const png = `${OUT}/_dwye_render.png`;
  const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
    "--window-size=1540,2100", `--screenshot=${png}`,
    `file:///${resolve(out).split("\\").join("/")}`], { stdio: "ignore" });
  await new Promise((r) => c.on("exit", r));
  console.log("saved", png);
} else {
  console.log("chrome 없음 — 스크린샷 생략:", CHROME);
}
