/**
 * 전공스샷 앨범 화면 시각 검증 — CDP(Chrome DevTools Protocol)로 탭을 실제로 눌러 스샷을 찍는다.
 * 테스트 사진을 넣고 찍은 뒤 **반드시 지운다**(사용자 데이터를 남기지 않는다).
 *
 *   실행: node scripts/_notesAlbumShot.mjs
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const OUT = resolve("scripts");
const BASE = "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;

/** 단색 PNG 1장 만들기 (외부 의존성 없이 — 테스트용 더미 이미지). */
function solidPng(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
let CRC_T = null;
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c; }
  }
  let c = -1;
  for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

// ── 1. 테스트 사진 업로드 (제목이 보이는지 확인용 이름) ──
const NAMES = ["2024 전기 A-3 종속전원 테브난.png", "임용 회로이론 중첩정리 요약.png", "OPAMP T형 궤환 필기.png"];
const COLORS = [[59, 130, 246], [16, 185, 129], [244, 114, 182]];
const ids = [];
for (let i = 0; i < NAMES.length; i++) {
  const fd = new FormData();
  fd.append("subject", "major_shot");
  fd.append("files", new Blob([solidPng(160, 160, COLORS[i])], { type: "image/png" }), NAMES[i]);
  const res = await fetch(`${BASE}/api/notes`, { method: "POST", body: fd });
  const j = await res.json();
  if (!res.ok) { console.error("업로드 실패", j); process.exit(1); }
  ids.push(j.notes.at(-1).id);
}
console.log(`테스트 사진 ${ids.length}장 업로드`);

// ── 2. CDP로 브라우저를 띄우고 요점정리 → 전공스샷을 실제로 클릭 ──
mkdirSync(`${OUT}/_chrome-profile`, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/_chrome-profile-cdp`,
  "--no-first-run", "--window-size=1280,1000", "about:blank",
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
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
await sleep(3500);
// 탭 클릭 → 앨범 버튼 클릭 (텍스트로 찾는다)
console.log("요점정리 탭:", await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='요점정리'); if(!b) return 'not found'; b.click(); return 'clicked'; })()`));
await sleep(1200);
console.log("전공스샷 앨범:", await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('전공스샷')); if(!b) return 'not found'; b.click(); return 'clicked'; })()`));
await sleep(2500);
console.log("화면의 사진 제목:", JSON.stringify(await evaluate(`[...document.querySelectorAll('figcaption')].map(f=>f.textContent)`)));

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(`${OUT}/_notes_album.png`, Buffer.from(shot.data, "base64"));
console.log("saved scripts/_notes_album.png");
ws.close();
chrome.kill();

// ── 3. 테스트 사진 정리 (사용자 앨범에 남기지 않는다) ──
for (const id of ids) await fetch(`${BASE}/api/notes?subject=major_shot&id=${id}`, { method: "DELETE" });
const left = await (await fetch(`${BASE}/api/notes?subject=major_shot`)).json();
console.log(`테스트 사진 정리 완료 — 남은 ${left.notes.length}장`);
