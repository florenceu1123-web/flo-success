/**
 * 요점정리 사진첩 **제목 검색** 시각 검증 — CDP로 실제 화면에 검색어를 쳐 넣고 결과를 확인한다.
 * 사용자 사진을 그대로 쓰므로 **아무것도 만들지 않고 지우지도 않는다**(읽기 전용).
 *
 *   실행: node scripts/_notesSearchShot.mjs [검색어]
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("scripts");
const BASE = "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
const QUERY = process.argv[2] ?? "2009 A";

// ★ 크롬 프로필은 프로젝트 밖(TEMP)에 둔다 — 안에 두면 Tailwind가 프로필 파일까지 스캔한다.
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}/flo-cdp-notes-search`,
  "--no-first-run", "--window-size=1400,1100", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
  } catch { /* 아직 안 떴다 */ }
}
if (!wsUrl) { console.error("CDP 연결 실패"); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((r) => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
await sleep(3500);
console.log("요점정리 탭:", await evaluate(
  `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='요점정리'); if(!b) return 'not found'; b.click(); return 'clicked'; })()`,
));
await sleep(1500);

// React가 제어하는 input이라 value를 직접 넣고 네이티브 setter로 change를 알린다.
console.log(`검색어 입력("${QUERY}"):`, await evaluate(`(() => {
  const el = document.querySelector('#note-search');
  if (!el) return 'not found';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(QUERY)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`));
await sleep(2500);

const summary = await evaluate(`(() => {
  const heading = [...document.querySelectorAll('h2')].map(h=>h.textContent).find(t=>t.includes('검색 결과')) ?? '(없음)';
  const badges = [...document.querySelectorAll('span')].map(s=>s.textContent).filter(t=>/·\\s*\\d+$/.test(t)).slice(0, 6);
  const captions = [...document.querySelectorAll('figcaption')].map(f=>f.textContent).slice(0, 6);
  const tiles = document.querySelectorAll('figure').length;
  return JSON.stringify({ heading, tiles, badges, captions }, null, 1);
})()`);
console.log("검색 결과 화면:\n" + summary);

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(`${OUT}/_notes_search.png`, Buffer.from(shot.data, "base64"));
console.log("saved scripts/_notes_search.png");

// 결과 한 장을 눌러 확대 보기가 **그 사진의 앨범**으로 열리는지 확인.
console.log("첫 결과 클릭:", await evaluate(
  `(() => { const t=document.querySelector('figure [role="button"]'); if(!t) return 'no tile'; t.click(); return 'clicked'; })()`,
));
await sleep(1800);
console.log("확대 보기 머리말:", await evaluate(
  `(() => { const p=[...document.querySelectorAll('p')].find(x=>/\\d+\\s*\\/\\s*\\d+/.test(x.textContent)); return p ? p.textContent : '(뷰어 안 열림)'; })()`,
));
const shot2 = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}/_notes_search_viewer.png`, Buffer.from(shot2.data, "base64"));
console.log("saved scripts/_notes_search_viewer.png");

ws.close();
chrome.kill();
