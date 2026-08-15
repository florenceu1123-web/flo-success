import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateTwoSourceRlSuperposition } from "../lib/generation/topologies/twoSourceRlSuperposition.ts";
import { renderTwoSourceRlSuperpositionCircuit as R } from "../lib/renderers/twoSourceRlSuperpositionCircuitRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const s = generateTwoSourceRlSuperposition({ seed: 0, index: 0, mode: "exam_similar" });
const v = generateTwoSourceRlSuperposition({ seed: 0, index: 0, mode: "exam_variant" });
console.log("유사:", JSON.stringify(s.values), "변형:", JSON.stringify(v.values));
const html = `<html><body style="margin:0;background:#fff;width:1040px;padding:10px;font-family:sans-serif">
<b>유사 (가)</b>${R(s.figures.full)}<b>유사 (나)</b>${R(s.figures.v1Only)}<b>유사 (다)</b>${R(s.figures.v2Only)}
<b>변형 (가) — 커패시터·v_C(t)</b>${R(v.figures.full)}</body></html>`;
writeFileSync(`${OUT}/_twosrc.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run", "--disable-gpu",
  "--window-size=1040,1620", `--screenshot=${OUT}/_twosrc.png`, `file:///${OUT.split("\\").join("/")}/_twosrc.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
