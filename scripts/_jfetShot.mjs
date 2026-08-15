import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderJfetDepletionPanels } from "../lib/renderers/jfetDepletionPanelsRenderer.ts";
const OUT = resolve("scripts");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const svg = renderJfetDepletionPanels({ vdsList: [1, 3, 5, 10], pinchOff: 5, vgs: 0 });
writeFileSync(`${OUT}/_jfet.html`, `<html><body style="margin:0;background:#fff;padding:8px"><div style="width:540px">${svg}</div></body></html>`);
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const p = spawn(CHROME, ["--headless=new", `--user-data-dir=${OUT}/_chrome-profile`, "--no-first-run",
  "--window-size=600,660", `--screenshot=${OUT}/_jfet.png`, `file:///${OUT.split("\\").join("/")}/_jfet.html`], { stdio: "ignore" });
await new Promise((r) => p.on("exit", r));
console.log("saved");
