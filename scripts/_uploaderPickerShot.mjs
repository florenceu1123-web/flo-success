/**
 * 문제 생성 → 업로드 창 클릭 → 전공스샷 사진첩 고르기 흐름 시각·기능 검증 (CDP).
 *   실행: node scripts/_uploaderPickerShot.mjs
 * ※ 사진을 고르면 과목 미선택 상태라 분석(API 과금)은 일어나지 않는다 — 선택만 확인한다.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("scripts");
const BASE = "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(`${OUT}/_chrome-profile-cdp`, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/_chrome-profile-cdp2`,
  "--no-first-run", "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
  } catch { /* 기동 대기 */ }
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
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, "base64"));
  console.log("saved scripts/" + name);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
await sleep(3500);

// 1. 업로드 창 클릭 → 사진첩 고르기 창이 뜨는가
console.log("업로드 창 클릭:", await evaluate(`(() => {
  const el = [...document.querySelectorAll('[role="button"]')].find(x => x.textContent.includes('사진첩에서 고르기'));
  if (!el) return 'not found';
  el.click(); return 'clicked';
})()`));
await sleep(2500);
console.log("고르기 창 제목:", await evaluate(`document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? 'none'`));
console.log("썸네일 수:", await evaluate(`document.querySelectorAll('[role="dialog"] figure').length`));
console.log("첫 3개 제목:", JSON.stringify(await evaluate(`[...document.querySelectorAll('[role="dialog"] figcaption')].slice(0,3).map(f=>f.textContent)`)));
await shot("_picker_open.png");

// 2. 제목 검색이 되는가
await evaluate(`(() => {
  const input = document.querySelector('[role="dialog"] input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '2022 B-6');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(1200);
console.log("‘2022 B-6’ 검색 결과:", JSON.stringify(await evaluate(`[...document.querySelectorAll('[role="dialog"] figcaption')].map(f=>f.textContent)`)));
await shot("_picker_search.png");

// 3. 한 장 고르면 업로드 창에 미리보기가 붙는가
console.log("사진 클릭:", await evaluate(`(() => {
  const b = document.querySelector('[role="dialog"] figure button');
  if (!b) return 'not found';
  b.click(); return 'clicked';
})()`));
await sleep(3000);
console.log("고르기 창 닫힘:", await evaluate(`!document.querySelector('[role="dialog"]')`));
console.log("업로드된 파일명:", await evaluate(`[...document.querySelectorAll('p')].map(p=>p.textContent).find(t=>t && t.includes('.png')) ?? 'none'`));
console.log("미리보기 이미지:", await evaluate(`(() => {
  const img = [...document.querySelectorAll('img')].find(i => i.src.startsWith('data:image'));
  return img ? (img.naturalWidth + 'x' + img.naturalHeight) : 'none';
})()`));
await shot("_picker_selected.png");

ws.close();
chrome.kill();
