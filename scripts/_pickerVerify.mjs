/** 고르기 창 = 사진첩 화면 재사용 검증: 스크롤 · 열 개수 · 제목 칸 · 고르기. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const OUT = resolve("scripts") /* 프로필은 프로젝트 밖에 둔다 — Tailwind 스캔 오염 방지 */, BASE = "http://localhost:3000", PORT = 9341;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/flo-cdp-verify`, "--no-first-run", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(300);
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find(t=>t.type==="page")?.webSocketDebuggerUrl ?? null; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
const send = (m, p={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const shot = async (n) => { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${n}`, Buffer.from(s.data, "base64")); };
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: BASE }); await sleep(6000);
await ev(`[...document.querySelectorAll('[role="button"]')].find(x=>x.textContent.includes('사진첩에서 고르기')).click()`);
await sleep(4000);
console.log("① 창 열림:", await ev(`document.querySelector('[role="dialog"]')?.getAttribute('aria-label')`));
console.log("② 제목 입력칸:", await ev(`!!document.getElementById('note-title')`));
console.log("③ 앨범(전공스샷 활성):", await ev(`[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.className.includes('amber-500'))?.textContent`));
const SC = `document.querySelector('[role="dialog"] div[style*="overflow"]')`;
console.log("④ 스크롤:", await ev(`(() => { const b=${SC}; return JSON.stringify({clientH:b.clientHeight, scrollH:b.scrollHeight, 스크롤가능: b.scrollHeight>b.clientHeight+4}); })()`));
console.log("⑤ 한 줄 열 개수:", await ev(`(() => { const g=[...document.querySelectorAll('[role="dialog"] div.grid')].pop(); return getComputedStyle(g).gridTemplateColumns.split(' ').length; })()`));
await ev(`(() => { const b=${SC}; b.scrollTop = b.scrollHeight; return 1; })()`); await sleep(2500);
console.log("⑥ 맨 아래 도달:", await ev(`(() => { const b=${SC}; return Math.abs(b.scrollTop+b.clientHeight-b.scrollHeight)<4; })()`));
await shot("_verify_bottom.png");
await ev(`(() => { const b=${SC}; b.scrollTop = 0; return 1; })()`); await sleep(1500);
await shot("_verify_top.png");
console.log("⑦ 사진 고르기:", await ev(`(() => { const t=document.querySelector('[role="dialog"] .grid figure [role="button"]') || document.querySelector('[role="dialog"] .grid > div'); if(!t) return 'no tile'; t.click(); return 'clicked'; })()`));
await sleep(3500);
console.log("⑧ 창 닫힘·업로드됨:", await ev(`JSON.stringify({ closed: !document.querySelector('[role="dialog"]'), preview: !![...document.querySelectorAll('img')].find(i=>i.src.startsWith('data:image')) })`));
await shot("_verify_selected.png");
ws.close(); chrome.kill();
