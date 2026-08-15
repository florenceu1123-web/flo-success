/**
 * 원본 이미지의 일부를 확대해 PNG로 저장 (헤드리스 Chrome).
 *   node scripts/_zoomImg.mjs <img> <scale> <left> <top> <winW> <winH> <out.png>
 *   left/top은 **확대 후** 좌표(px). 즉 원본좌표 × scale.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [img, scale, left, top, winW, winH, out] = process.argv.slice(2);
const url = `file:///${resolve(img).split("\\").join("/")}`;
const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#fff}
.vp{position:relative;overflow:hidden;width:${winW}px;height:${winH}px}
img{position:absolute;left:${-left}px;top:${-top}px;width:${scale}px;image-rendering:auto}
</style><div class="vp"><img src="${url}"></div>`;
const htmlPath = resolve("scripts/_zoom.html");
writeFileSync(htmlPath, html);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const c = spawn(CHROME, ["--headless=new", `--user-data-dir=${resolve("scripts")}/_chrome-profile`,
  "--no-first-run", `--window-size=${winW},${winH}`, `--screenshot=${resolve(out)}`,
  `file:///${htmlPath.split("\\").join("/")}`], { stdio: "ignore" });
await new Promise((r) => c.on("exit", r));
console.log("saved", out);
