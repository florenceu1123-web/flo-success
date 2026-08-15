/** 요점정리 앨범 목록(11개) 확인 스샷. 프로필은 프로젝트 밖에 만든다(Tailwind 스캔 오염 방지). */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const OUT = resolve("scripts"), BASE = "http://localhost:3000", PORT = 9343;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/flo-cdp-albums`, "--no-first-run", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(300);
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find(t=>t.type==="page")?.webSocketDebuggerUrl ?? null; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
const send = (m, p={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: BASE }); await sleep(6000);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='요점정리').click()`);
await sleep(3000);
console.log("앨범 버튼:", JSON.stringify(await ev(`[...document.querySelectorAll('section:first-of-type button')].map(b=>b.textContent.replace(/(\d+장)/,' $1'))`)));
// 새 앨범으로 전환해 업로드 화면이 뜨는지
console.log("flo모의고사 클릭:", await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('flo모의고사')); if(!b) return 'not found'; b.click(); return 'clicked'; })()`));
await sleep(2000);
console.log("업로드 제목:", await ev(`document.querySelector('h2 + div label')?.textContent ?? [...document.querySelectorAll('h2')].map(h=>h.textContent).find(t=>t.includes('올리기'))`));
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}/_albums.png`, Buffer.from(s.data, "base64"));
console.log("saved scripts/_albums.png");
ws.close(); chrome.kill();
