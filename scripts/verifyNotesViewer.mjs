/**
 * 요점정리 뷰어 시각 검증 — 설치된 Chrome을 헤드리스로 띄워 CDP로 직접 조작한다.
 * (Playwright 등 추가 설치 없이 동작)
 *
 * 검증: 사진 클릭 → 크게 열림 / 회전 / 확대 / 화면 맞춤 복귀 / JS 예외 없음.
 * 스크린샷을 scripts/_viewer-*.png 로 남기므로 눈으로도 확인할 수 있다.
 *
 * ★ 이 검증이 잡아낸 실제 버그 (2026-07-31): 사진 영역이 `flex-1`인데 카드에 확정
 *   높이가 없어 stage 높이가 0으로 무너져 이미지가 통째로 잘려 보이지 않았다.
 *   정적 테스트(tsc·API 스모크)로는 절대 잡히지 않는 종류다.
 *
 * 실행: dev 서버 기동 상태에서  node scripts/verifyNotesViewer.mjs
 *       (포트·크롬 경로가 다르면  BASE_URL=... CHROME_PATH=... 환경변수로 지정)
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SUBJ = "electronics";
const MARK = "__verify__";
const OUT = "scripts";
const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.CDP_PORT ?? 9334);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fail++;
};

const png = readFileSync("test-images/imyong6.png");
const form = new FormData();
form.append("subject", SUBJ);
form.append("files", new Blob([png], { type: "image/png" }), `${MARK}.png`);
const up = await (await fetch(`${BASE}/api/notes`, { method: "POST", body: form })).json();
const seeded = (up.notes ?? []).filter((n) => n.fileName.includes(MARK));

// Chrome은 --user-data-dir에 절대 경로를 요구한다 (상대 경로면 조용히 기동에 실패한다).
const PROFILE = resolve(OUT, "_chrome-profile");
mkdirSync(PROFILE, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1600,1000", "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(250);
  try {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: "PUT" })).json();
    wsUrl = t.webSocketDebuggerUrl;
  } catch {}
}
if (!wsUrl) {
  chrome.kill();
  for (const p of seeded) await fetch(`${BASE}/api/notes?subject=${SUBJ}&id=${p.id}`, { method: "DELETE" });
  console.error(
    `FAIL — Chrome CDP(${PORT}) 연결 실패. 크롬 경로(${CHROME})를 확인하거나 CHROME_PATH로 지정하세요.`,
  );
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
  if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params).slice(0, 200));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: JSON.stringify(r.exceptionDetails).slice(0, 300) };
  return r.result.value;
};
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/_viewer-${name}.png`, Buffer.from(s.data, "base64"));
};
/** 뷰어 이미지의 현재 상태 (영역 크기·표시 배율·회전각). */
const state = () => evaluate(`
  (() => {
    const img = document.querySelector('.fixed.inset-0 img');
    if (!img) return null;
    const st = img.parentElement.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(img).transform);
    const scale = Math.hypot(m.a, m.b);
    const rot = Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI + 360) % 360;
    const pct = document.querySelector('.fixed.inset-0')?.textContent.match(/(\\d+)%/)?.[1];
    return {
      stage: { w: Math.round(st.width), h: Math.round(st.height) },
      imgBox: { w: Math.round(ir.width), h: Math.round(ir.height) },
      scale: +scale.toFixed(3), rotation: rot, shownPct: pct && +pct,
      visible: getComputedStyle(img).visibility,
    };
  })()
`);

await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
await sleep(3500);
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='요점정리')?.click()`);
await sleep(1800);

console.log("\n[1] 사진 클릭 → 크게 열림");
await evaluate(`document.querySelector('[role="button"][draggable="true"]')?.click()`);
await sleep(1500);
const s1 = await state();
check("모달 이미지 존재", !!s1);
check("사진 영역 높이 > 0", s1.stage.h > 400, `${s1.stage.w}×${s1.stage.h}`);
check("이미지 보임", s1.visible === "visible");
check("영역에 꽉 맞게 표시", Math.abs(s1.imgBox.h - s1.stage.h) <= 2 || Math.abs(s1.imgBox.w - s1.stage.w) <= 2,
  `이미지 ${s1.imgBox.w}×${s1.imgBox.h} / 영역 ${s1.stage.w}×${s1.stage.h}`);
await shot("v1-open");

console.log("\n[2] 회전 (↻ 오른쪽 90°)");
await evaluate(`[...document.querySelectorAll('.fixed.inset-0 button')].find(b=>b.getAttribute('aria-label')==='오른쪽으로 90° 회전')?.click()`);
await sleep(1500);
const s2 = await state();
check("회전각 90°", s2.rotation === 90, `${s2.rotation}°`);
check("회전 후에도 이미지 보임", s2.visible === "visible");
check("회전 후 영역 안에 들어옴", s2.imgBox.w <= s2.stage.w + 2 && s2.imgBox.h <= s2.stage.h + 2,
  `이미지(회전전 기준) ${s2.imgBox.w}×${s2.imgBox.h} / 영역 ${s2.stage.w}×${s2.stage.h}`);
check("가로로 눕혀 맞춤 배율 재계산됨", s2.scale !== s1.scale, `${s1.scale} → ${s2.scale}`);
await shot("v2-rotated");

console.log("\n[3] 확대 (+ 버튼)");
await evaluate(`[...document.querySelectorAll('.fixed.inset-0 button')].find(b=>b.getAttribute('aria-label')==='확대')?.click()`);
await sleep(800);
const s3 = await state();
check("배율 증가", s3.scale > s2.scale, `${s2.scale} → ${s3.scale}`);
check("표시 % 증가", s3.shownPct > s2.shownPct, `${s2.shownPct}% → ${s3.shownPct}%`);
await shot("v3-zoomed");

console.log("\n[4] 화면 맞춤 복귀");
await evaluate(`[...document.querySelectorAll('.fixed.inset-0 button')].find(b=>b.textContent.trim()==='화면 맞춤')?.click()`);
await sleep(800);
const s4 = await state();
check("맞춤 배율로 복귀", Math.abs(s4.scale - s2.scale) < 0.01, `${s4.scale} vs ${s2.scale}`);

console.log("\n[5] 회전 원복 (↺ ×1)");
await evaluate(`[...document.querySelectorAll('.fixed.inset-0 button')].find(b=>b.getAttribute('aria-label')==='왼쪽으로 90° 회전')?.click()`);
await sleep(1500);
const s5 = await state();
check("0°로 복귀", s5.rotation === 0, `${s5.rotation}°`);
check("배율도 원래대로", Math.abs(s5.scale - s1.scale) < 0.01, `${s5.scale} vs ${s1.scale}`);

check("JS 예외 없음", errors.length === 0, errors[0] ?? "");

ws.close(); chrome.kill();
for (const p of seeded) await fetch(`${BASE}/api/notes?subject=${SUBJ}&id=${p.id}`, { method: "DELETE" });
console.log(fail === 0 ? "\n=== VIEWER VERIFY PASS ===" : `\n=== ${fail} FAILURE(S) ===`);
process.exit(fail ? 1 : 0);
