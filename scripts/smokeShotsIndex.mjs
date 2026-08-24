/**
 * 「랜덤문제 풀기」 문항 인덱스 스모크 — `/api/shots`
 *
 * 기출 스샷(바탕화면)과 **생성문제 보관함**(사진첩 앨범)이 한 풀로 합쳐지는지,
 * 문제↔답안 짝짓기와 중복 제거가 실측 데이터에서 제대로 도는지 검사한다.
 * GPT·Vision 호출이 없어 비용이 들지 않는다(CLAUDE.md 「비용 — E2E 남발 금지」).
 *
 *   npm run dev            # 먼저 dev 서버를 띄운다
 *   node scripts/smokeShotsIndex.mjs
 *   BASE=http://localhost:3001 node scripts/smokeShotsIndex.mjs
 *
 * ★ 라우트가 `next/server`를 import 하므로 in-process(_aliasHook) 실행이 안 된다 → HTTP로 친다.
 */

import { readdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS_DIR = process.env.SHOTS_DIR ?? "C:/Users/USER/Desktop/전공 스샷";
const IMG = /\.(png|jpe?g|gif|webp)$/i;
const norm = (s) => s.replace(/\s+/g, "").toLowerCase();

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass += 1; console.log(`  OK   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}   ${extra}`); }
};

/** dev 서버가 뜰 때까지 기다린다(첫 요청은 컴파일 때문에 느리다). */
async function waitForServer() {
  for (let i = 0; i < 90; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/shots`);
      if (r.ok) return;
    } catch { /* 아직 안 떴다 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev 서버에 연결하지 못했습니다: ${BASE}`);
}

await waitForServer();
const idx = await (await fetch(`${BASE}/api/shots`)).json();
if (idx.error) { console.error("인덱스 오류:", idx.error); process.exit(1); }

const shots = idx.items.filter((i) => i.src === "shot");
const notes = idx.items.filter((i) => i.src === "note");
// 바탕화면 폴더를 직접 읽어 "몇 장이어야 하는가"를 코드 밖에서 독립적으로 센다.
const diskFiles = readdirSync(SHOTS_DIR).filter((f) => IMG.test(f));
const diskStems = new Set(diskFiles.map((f) => norm(f.replace(IMG, ""))));

console.log(`\n총 ${idx.items.length}문항 (기출 ${idx.counts.shot} · 생성 ${idx.counts.note} · 사본제외 ${idx.counts.noteSkipped}) · 그룹 ${idx.groups.length}`);

console.log("\n[구조]");
ok("기출 수 = 바탕화면 이미지 수", shots.length === diskFiles.length, `-> ${shots.length} vs ${diskFiles.length}`);
ok("생성문제가 풀에 합류했다", notes.length > 100, `-> ${notes.length}`);
ok("file 키가 전부 고유하다", new Set(idx.items.map((i) => i.file)).size === idx.items.length);
ok("생성문항 라벨이 서로 고유하다", new Set(notes.map((i) => i.label)).size === notes.length,
  `-> 중복 ${notes.length - new Set(notes.map((i) => i.label)).size}건`);
ok("모든 문항에 문제 이미지가 있다", idx.items.every((i) => i.qPages.length > 0));
ok("ans 플래그와 aPages가 일관된다", idx.items.every((i) => Boolean(i.ans) === (i.aPages.length > 0)));
ok("생성문항 이미지는 /api/notes/image", notes.every((i) => i.qPages.every((p) => p.url.startsWith("/api/notes/image?"))));
ok("기출 이미지는 /api/shots", shots.every((i) => i.qPages[0].url.startsWith("/api/shots?")));

console.log("\n[문제↔답안 짝짓기 — 실측 사례]");
const noteLabels = new Set(notes.map((i) => i.label));
ok("한 원본의 생성문항 여러 개가 갈라진다 (2011 A-29 Q1·Q2)",
  notes.filter((i) => i.label.startsWith("2011 전자 A-29")).length === 2,
  `-> ${notes.filter((i) => i.label.startsWith("2011 전자 A-29")).map((i) => `${i.label}[답${i.aPages.length}]`).join(", ")}`);
// "2009 A-31"은 A형 31번이지 답안 마커가 아니다 — 기출에도 없으므로 생성문항으로 남아야 한다.
ok('"2009 A-31"을 답안으로 오인하지 않는다', noteLabels.has("2009 전자 A-31") && !diskStems.has(norm("2009 A-31")));
ok("여러 쪽 문제가 한 문항으로 묶인다", notes.filter((i) => i.qPages.length > 1).length > 0,
  `-> ${notes.filter((i) => i.qPages.length > 1).length}건`);
ok("여러 쪽 답안이 한 문항에 붙는다", notes.filter((i) => i.aPages.length > 1).length > 0,
  `-> ${notes.filter((i) => i.aPages.length > 1).length}건`);

console.log("\n[중복 제거]");
// 사진첩에 넣어 둔 '기출 원본 사본'(마커 없는 사진)은 풀에 두 번 뜨면 안 된다.
// ★ 몇 장이 걸러져야 하는지를 **앨범 인덱스에서 직접 다시 세어** 라우트가 준 숫자와 맞춘다
//   (라우트가 준 값만 보고 ">= 4" 같은 느슨한 단언을 하면 사실상 아무것도 검사하지 않는다).
const albumIndex = JSON.parse(readFileSync(new URL("../data/subject-notes.json", import.meta.url), "utf-8"));
const cleanTitle = (raw) => {
  let s = String(raw ?? "").trim();
  for (let i = 0; i < 3 && IMG.test(s); i += 1) s = s.replace(IMG, "").trim();
  return s.replace(/[!'"`~]+$/, "").trim();
};
const MARK = /\s([QA])\s*-?\s*(\d*)(?:-(\d+))?$/i;
const albumStems = (albumIndex.generated_qa ?? []).map((p) => cleanTitle(p.title?.trim() || p.fileName));
const qKeys = new Set(albumStems.map((s) => MARK.exec(s)).filter((m) => m && m[1].toUpperCase() === "Q")
  .map((m) => `${norm(m.input.slice(0, m.index))}#${m[2] || "1"}`));
// 라우트와 같은 규칙으로, 문제로 남을 후보 중 '기출과 제목이 같은 것'을 센다.
let expectSkip = 0;
for (const s of albumStems) {
  const m = MARK.exec(s);
  if (m) {
    const kind = m[1].toUpperCase();
    if (kind === "Q") continue;
    const base = s.slice(0, m.index).trim();
    if (qKeys.has(`${norm(base)}#${m[2] || "1"}`)) continue;   // 답안으로 인정됨
    if (diskStems.has(norm(base))) continue;                   // 기출의 답안으로 붙음
  }
  if (diskStems.has(norm(s))) expectSkip += 1;                 // 기출 원본 사본
}
ok("제외된 사본 수가 독립 계산과 일치", idx.counts.noteSkipped === expectSkip,
  `-> 라우트 ${idx.counts.noteSkipped} vs 독립계산 ${expectSkip}`);
ok("제외된 사본이 실제로 있었다", expectSkip > 0, `-> ${expectSkip}건`);
// 사본이 걸러졌어도 그 문항 자체는 기출로 남아 있어야 한다(문제가 사라지면 안 된다).
const copied = albumStems.filter((s) => diskStems.has(norm(s)));
ok("사본의 원본이 기출 풀에 살아 있다",
  copied.every((s) => shots.some((i) => norm(i.file.replace(IMG, "")) === norm(s))),
  `-> ${copied.slice(0, 6).join(", ")}`);

console.log("\n[기출에 붙은 사진첩 답안]");
const withNoteAns = shots.filter((i) => i.aPages.some((p) => p.url.startsWith("/api/notes/image?")));
ok("사진첩에만 있던 답안이 기출 문항에 붙었다", withNoteAns.length >= 3,
  `-> ${withNoteAns.length}건: ${withNoteAns.map((i) => i.label).join(", ")}`);

console.log("\n[그룹·정렬 — 기존 연도 칩과 트랙 필터가 그대로 먹는가]");
ok("생성문항 대부분이 연도 그룹으로 흡수", notes.filter((i) => /^\d{4}$/.test(i.group)).length >= notes.length * 0.9,
  `-> ${notes.filter((i) => /^\d{4}$/.test(i.group)).length}/${notes.length}`);
ok("생성문항도 트랙(전자/전기)이 잡힌다", notes.filter((i) => i.track).length >= notes.length * 0.9,
  `-> ${notes.filter((i) => i.track).length}/${notes.length}`);
ok("그룹 순서대로 정렬", idx.items.every((it, k, a) => k === 0 || idx.groups.indexOf(a[k - 1].group) <= idx.groups.indexOf(it.group)));
ok("그룹 안에서 sort 오름차순", idx.items.every((it, k, a) => k === 0 || a[k - 1].group !== it.group || a[k - 1].sort <= it.sort));
// 같은 번호의 기출 바로 뒤에 생성문항이 오도록 sort에 +0.5를 준다.
const pairShot = shots.find((i) => notes.some((n) => n.group === i.group && Math.floor(n.sort) === Math.floor(i.sort)));
ok("생성문항이 같은 번호의 기출 바로 뒤에 온다", Boolean(pairShot),
  pairShot ? `-> ${pairShot.label} 다음` : "-> 짝을 못 찾음");

console.log("\n[출처 표시]");
ok("생성문항 srcLabel", notes.every((i) => i.srcLabel === "전공생성문제&답안"));
ok("기출 srcLabel", shots.every((i) => i.srcLabel === "기출 스샷"));

console.log("\n[이미지가 실제로 열리는가]");
const sample = [
  ...notes.slice(0, 2),
  ...notes.filter((i) => i.aPages.length > 1).slice(0, 1),
  ...shots.slice(0, 1),
  ...withNoteAns.slice(0, 1),
];
for (const it of sample) {
  for (const p of [...it.qPages.slice(0, 2), ...it.aPages.slice(0, 2)]) {
    const r = await fetch(BASE + p.url);
    ok(`${it.label} · ${p.url.startsWith("/api/notes") ? "사진첩" : "스샷"} 200`,
      r.ok && String(r.headers.get("content-type")).startsWith("image/"), `-> ${r.status}`);
  }
}

console.log(`\n생성문항 답안 보유 ${notes.filter((i) => i.aPages.length).length}/${notes.length}`);
console.log(`샘플: ${notes.slice(0, 8).map((i) => `${i.label}${i.aPages.length ? "·답" : ""}`).join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
