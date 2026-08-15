// 임용 27번 Early 효과 (가)단면도·(나)특성곡선 시각 검증
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_bjtEarlyFigShot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderBjtEarlyStructureSVG, renderBjtEarlyCurveSVG } from "../lib/renderers/bjtEarlyEffectRenderer.ts";
import { RO_FORMULA_NOTE } from "../lib/generation/topologies/bjtEarlyEffectFillBlank.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const html = `<html><body style="margin:0;background:#fff;width:1360px;padding:10px;font-family:sans-serif">
<div style="display:flex;gap:14px;align-items:flex-start">
  <div style="width:600px"><b style="font-size:13px">(가) 단면도</b>${renderBjtEarlyStructureSVG({ caption: "(가)" })}</div>
  <div style="width:700px"><b style="font-size:13px">(나) 특성곡선 (r_o 표시)</b>${renderBjtEarlyCurveSVG({ roNote: RO_FORMULA_NOTE, caption: "(나)" })}
  <b style="font-size:13px">(나) r_o 마스킹</b>${renderBjtEarlyCurveSVG({ roNote: "r_o = ( ㉣ )", caption: "(나)" })}</div>
</div></body></html>`;
writeFileSync(`${OUT}/_bjtearly.html`, html);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=1360,980", `--screenshot=${OUT}/_bjtearly.png`,
  `file:///${OUT.split("\\").join("/")}/_bjtearly.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved scripts/_bjtearly.png");
