// 동축선로 figure 시각 검증 — SVG 렌더 → 헤드리스 Chrome 스크린샷.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const inst = generateElectromagnetics({ seed: 3, mode: "exam_similar", entryId: "coax_line_magnetic_field" });
const svg = renderEmFieldDiagram(inst.diagram);
writeFileSync(`${OUT}/_coaxfig.html`, `<html><body style="margin:0;background:#fff;width:600px">${svg}</body></html>`);
console.log("SVG", svg.length, "자");
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=600,340", `--screenshot=${OUT}/_coaxfig.png`,
  `file:///${OUT.split("\\").join("/")}/_coaxfig.html`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved scripts/_coaxfig.png");
