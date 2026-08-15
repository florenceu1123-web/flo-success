/** 고르기 창의 스크롤 동작 검증 — 스크롤이 실제로 생기고 **마지막 사진까지** 닿는지. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const OUT = resolve("scripts"), BASE = "http://localhost:3000", PORT = 9338;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${OUT}/_chrome-profile-scroll`, "--no-first-run", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) { await sleep(250);
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find(t=>t.type==="page")?.webSocketDebuggerUrl ?? null; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
const send = (method, params={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: BASE }); await sleep(3500);
await ev(`[...document.querySelectorAll('[role="button"]')].find(x=>x.textContent.includes('사진첩에서 고르기')).click()`);
await sleep(2500);

const SEL = `document.querySelector('[role="dialog"] .overflow-y-auto')`;
console.log("스크롤 영역:", await ev(`(() => {
  const b = ${SEL};
  if (!b) return 'not found';
  return JSON.stringify({ clientH: b.clientHeight, scrollH: b.scrollHeight, 스크롤가능: b.scrollHeight > b.clientHeight + 4 });
})()`));

// 맨 아래로 내려 마지막 사진이 실제로 보이는지 확인
await ev(`(() => { const b = ${SEL}; b.scrollTop = b.scrollHeight; return b.scrollTop; })()`);
await sleep(2500);
console.log("맨 아래 스크롤 후:", await ev(`(() => {
  const b = ${SEL};
  const figs = [...b.querySelectorAll('figure')];
  const last = figs.at(-1);
  const r = last.getBoundingClientRect(), br = b.getBoundingClientRect();
  return JSON.stringify({
    scrollTop: Math.round(b.scrollTop), 맨아래도달: Math.abs(b.scrollTop + b.clientHeight - b.scrollHeight) < 4,
    마지막사진: last.querySelector('figcaption').textContent,
    화면안에보임: r.top >= br.top - 1 && r.bottom <= br.bottom + 1,
  });
})()`));
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}/_picker_bottom.png`, Buffer.from(s.data, "base64"));
console.log("saved scripts/_picker_bottom.png");
ws.close(); chrome.kill();
