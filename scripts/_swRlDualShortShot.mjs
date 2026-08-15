// 임용 17번 회로 그림 시각 검증 (스위치 동작 화살표 포함)
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateSwitchedRlDualShort } from "../lib/generation/topologies/switchedRlDualShort.ts";
import { renderSwitchedRlDualShortCircuit } from "../lib/renderers/switchedRlDualShortCircuitRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sim = generateSwitchedRlDualShort({ seed: 0, index: 0, mode: "exam_similar" });
const varn = generateSwitchedRlDualShort({ seed: 0, index: 0, mode: "exam_variant" });
console.log("유사:", JSON.stringify(sim.values), "→ i0=", sim.sol.i0, "τ=", sim.sol.tau);
console.log("변형:", JSON.stringify(varn.values), "→ v0=", varn.sol.v0, "τ=", varn.sol.tau);
// 원본 값 + opening(닫혔다 열림) 비교용
const orig = { ...sim.circuitDiagram, sourceLabel: "2[A]", raLabel: "4[Ω]", rbLabel: "4[Ω]", rcLabel: "4[Ω]", l1Label: "1[H]", l2Label: "2[H]" };
const html = `<html><body style="margin:0;background:#fff;width:960px;padding:12px;font-family:sans-serif">
<b>유사 — 두 스위치가 t=0에 <u>닫힘</u> (화살표가 접점 쪽)</b>${renderSwitchedRlDualShortCircuit(sim.circuitDiagram)}
<b>변형 — v(t) 측정</b>${renderSwitchedRlDualShortCircuit(varn.circuitDiagram)}
<b>비교: 같은 회로를 <u>닫혔다 열림</u>(opening)으로 그린 경우</b>${renderSwitchedRlDualShortCircuit({ ...orig, switchAction: "opening", switchTimeLabel: "t=0" })}
</body></html>`;
writeFileSync(`${OUT}/_swrl.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run", "--disable-gpu",
  "--window-size=960,1560", `--screenshot=${OUT}/_swrl.png`, `file:///${OUT.split("\\").join("/")}/_swrl.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved scripts/_swrl.png");
