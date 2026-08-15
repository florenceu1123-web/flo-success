/**
 * 업로드 창(고르기 모드)에서 **제목 검색으로 다른 앨범 사진을 고르는** 경로 검증.
 *
 * ★ 이 경로가 깨지기 쉬운 이유: 고르기 창은 전공스샷 앨범으로 열리지만 검색 결과에는
 *   다른 앨범 사진이 섞인다. 고른 사진의 이미지를 전공스샷에서 찾으면 404가 난다
 *   → 사진첩이 넘겨준 앨범 키로 조회해야 한다(ImageUploader.select의 album 인자).
 *
 *   실행: node scripts/_pickerSearchVerify.mjs [검색어]
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("scripts"), BASE = "http://localhost:3000", PORT = 9342;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const QUERY = process.argv[2] ?? "2009 A-30";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/flo-cdp-picker-search`, "--no-first-run",
  "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(300);
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = l.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null; } catch { /* 아직 */ }
}
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: BASE }); await sleep(6000);

await ev(`[...document.querySelectorAll('[role="button"]')].find(x=>x.textContent.includes('사진첩에서 고르기')).click()`);
await sleep(3500);
console.log("① 고르기 창:", await ev(`document.querySelector('[role="dialog"]')?.getAttribute('aria-label')`));

console.log(`② 검색어 입력("${QUERY}"):`, await ev(`(() => {
  const el = document.querySelector('#note-search');
  if (!el) return 'not found';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(QUERY)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`));
await sleep(2500);

console.log("③ 결과:", await ev(`(() => {
  const caps = [...document.querySelectorAll('[role="dialog"] figcaption')].map(f=>f.textContent);
  const albums = [...document.querySelectorAll('[role="dialog"] figure span')].map(s=>s.textContent).filter(t=>t.includes('·'));
  return JSON.stringify({ caps, albums });
})()`));

console.log("④ 첫 결과 고르기:", await ev(
  `(() => { const t=document.querySelector('[role="dialog"] figure [role="button"]'); if(!t) return 'no tile'; t.click(); return 'clicked'; })()`,
));
await sleep(4000);
console.log("⑤ 창 닫힘·업로드됨:", await ev(
  `JSON.stringify({ closed: !document.querySelector('[role="dialog"]'), preview: !![...document.querySelectorAll('img')].find(i=>i.src.startsWith('data:image')), error: [...document.querySelectorAll('p')].map(p=>p.textContent).find(t=>t.includes('불러오지 못')) ?? null })`,
));
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}/_picker_search_pick.png`, Buffer.from(s.data, "base64"));
console.log("saved scripts/_picker_search_pick.png");
ws.close(); chrome.kill();
