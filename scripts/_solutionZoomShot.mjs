/**
 * 원본 풀이·정답 사진 **확대 보기** 시각 검증 — CDP로 실제 화면에서 [확대]를 눌러 뷰어를 확인한다.
 * 저장된 사용자 사진을 읽기만 하고 아무것도 만들지 않는다(읽기 전용).
 *
 *   실행: node scripts/_solutionZoomShot.mjs
 *   전제: dev 서버(3000) 실행 중 + 임시 페이지 /test/zoom 존재
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("scripts");
const BASE = "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9336;

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}/flo-cdp-solution-zoom`,
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

const shot = async (name, beyond = false) => {
  const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: beyond });
  writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, "base64"));
  console.log(`saved scripts/${name}`);
};

/** 뷰어의 도구 막대에서 현재 배율(%)을 읽는다. */
const zoomPct = `(() => {
  const el = [...document.querySelectorAll('span')].find(s => /^\\d+%$/.test(s.textContent.trim()));
  return el ? el.textContent.trim() : '(없음)';
})()`;

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: `${BASE}/test/zoom` });
await sleep(4000);

console.log("풀이 사진 로드:", await evaluate(
  `(() => { const i=[...document.querySelectorAll('img')].find(x=>x.src.startsWith('data:')); return i ? i.naturalWidth+'x'+i.naturalHeight : '(사진 없음)'; })()`,
));
await shot("_solution_zoom_panel.png", true);

console.log("[확대] 버튼 클릭:", await evaluate(
  `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='확대'); if(!b) return 'not found'; b.click(); return 'clicked'; })()`,
));
await sleep(1200);

console.log("뷰어 열림:", await evaluate(
  `(() => { const v=document.querySelector('div[class*="z-[100]"]'); if(!v) return '(안 열림)';
     const ps=[...v.querySelectorAll('p')].slice(0,2).map(p=>p.textContent); return '열림 · ' + ps.join(' / '); })()`,
));
console.log("배율(화면 맞춤):", await evaluate(zoomPct));
await shot("_solution_zoom_fit.png");

// 확대(+) 2번 → 배율이 올라가야 한다.
console.log("확대 x2:", await evaluate(
  `(() => { const b=[...document.querySelectorAll('button')].filter(x=>x.getAttribute('aria-label')==='확대'); if(!b.length) return 'not found'; b[0].click(); b[0].click(); return 'clicked'; })()`,
));
await sleep(700);
console.log("배율(확대 후):", await evaluate(zoomPct));
await shot("_solution_zoom_in.png");

// 회전 → 각도 표시가 90°가 되어야 한다.
console.log("오른쪽 회전:", await evaluate(
  `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='오른쪽으로 90° 회전'); if(!b) return 'not found'; b.click(); return 'clicked'; })()`,
));
await sleep(700);
console.log("각도:", await evaluate(
  `(() => { const el=[...document.querySelectorAll('span')].find(s=>/^\\d+°$/.test(s.textContent.trim())); return el ? el.textContent.trim() : '(없음)'; })()`,
));
console.log("배율(회전 후 = 화면 맞춤 재계산):", await evaluate(zoomPct));
await shot("_solution_zoom_rotated.png");

const isOpen = `(() => document.querySelector('div[class*="z-[100]"]') ? '열려 있음' : '닫힘')()`;

// ESC로 닫기 (창 keydown 핸들러)
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await sleep(600);
console.log("ESC 후:", await evaluate(isOpen));

// 다시 열어 바깥(어두운 배경) 클릭으로도 닫히는지 확인
await evaluate(`[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='확대')?.click()`);
await sleep(800);
console.log("재오픈:", await evaluate(isOpen));
await evaluate(`document.querySelector('div[class*="z-[100]"]')?.click()`);
await sleep(600);
console.log("배경 클릭 후:", await evaluate(isOpen));

console.log("파일 선택창 안 열림(확대 버튼이 label 기본동작을 막았는가):", await evaluate(
  `(() => document.activeElement?.tagName !== 'INPUT' ? 'OK' : 'input에 포커스 감')()`,
));

ws.close();
chrome.kill();
