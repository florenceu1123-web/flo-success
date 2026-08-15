import { spawn } from "node:child_process";
import { resolve } from "node:path";
const OUT = resolve("scripts"), BASE = "http://localhost:3000", PORT = 9339;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${OUT}/_chrome-profile-css`, "--no-first-run", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) { await sleep(250);
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find(t=>t.type==="page")?.webSocketDebuggerUrl ?? null; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
const send = (m, p={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: BASE }); await sleep(3500);
await ev(`[...document.querySelectorAll('[role="button"]')].find(x=>x.textContent.includes('사진첩에서 고르기')).click()`);
await sleep(2500);
console.log(await ev(`(() => {
  const body = document.querySelector('[role="dialog"] .overflow-y-auto');
  const grid = body.querySelector('div.grid');
  const cs = getComputedStyle(body), gs = getComputedStyle(grid);
  // 스타일시트에 해당 유틸리티가 실제로 들어 있는지 확인
  const has = (sel) => [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => (r.cssText||'').includes(sel)); } catch { return false; } });
  return JSON.stringify({
    bodyClass: body.className,
    overflowY: cs.overflowY, minHeight: cs.minHeight, height: Math.round(body.getBoundingClientRect().height),
    gridCols: gs.gridTemplateColumns.split(' ').length,
    css_overflow_y_auto: has('.overflow-y-auto'),
    css_lg_grid_cols_5: has('grid-cols-5'),
    viewport: innerWidth,
  }, null, 1);
})()`));
ws.close(); chrome.kill();
