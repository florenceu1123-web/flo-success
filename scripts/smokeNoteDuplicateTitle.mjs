/**
 * 사진첩 **제목 중복 업로드 차단** 스모크 테스트.
 *
 * 규칙(= lib/noteStore.ts `addNotes`):
 *  · 같은 앨범에 **이미 있는 제목**이면 저장하지 않는다.
 *  · 판정은 화면에 보이는 제목(직접 적은 제목, 없으면 확장자 뗀 파일명)을
 *    `noteTitleKey`로 정규화해 비교 — 대소문자·띄어쓰기·자모 조합 차이는 무시.
 *  · **한 번에 올린 묶음 안에서** 겹치는 것도 첫 장만 남는다.
 *  · 앨범이 다르면 같은 제목이어도 막지 않는다.
 *  · 중복은 오류가 아니라 "제외"로 알린다(HTTP 200 + rejected).
 *
 * 실행: dev 서버 기동 상태에서  node scripts/smokeNoteDuplicateTitle.mjs
 *       (포트가 3000이 아니면  BASE_URL=http://localhost:3001 node scripts/...)
 *
 * ※ data/subject-notes.json 에 실제로 썼다가 자기가 만든 것만 지운다(파일명 마커).
 */
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SUBJ = "electronics";
const OTHER = "circuit_theory";
const MARK = "__dupsmoke__";

let fail = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fail += 1;
}

const png = readFileSync("test-images/imyong6.png");

const list = async (subject) => (await fetch(`${BASE}/api/notes?subject=${subject}`)).json();

/** 이 스크립트가 만든 사진만 파일명 마커로 식별해 정리 (사용자 사진 보존). */
async function cleanup(subject) {
  const { notes = [] } = await list(subject);
  for (const p of notes.filter((n) => n.fileName.includes(MARK))) {
    await fetch(`${BASE}/api/notes?subject=${subject}&id=${p.id}`, { method: "DELETE" });
  }
}

/** 사진 N장 업로드 — names[]는 파일명, title은 묶음 전체 제목(선택). */
async function upload(subject, names, title) {
  const form = new FormData();
  form.append("subject", subject);
  if (title) form.append("title", title);
  for (const name of names) form.append("files", new Blob([png], { type: "image/png" }), name);
  const res = await fetch(`${BASE}/api/notes`, { method: "POST", body: form });
  return { status: res.status, body: await res.json() };
}

const mineCount = async (subject) =>
  (await list(subject)).notes.filter((n) => n.fileName.includes(MARK)).length;

console.log(`BASE = ${BASE}\n`);
await cleanup(SUBJ);
await cleanup(OTHER);

// ─── 1. 직접 적은 제목이 겹치면 안 올라간다 ────────────────────────────
console.log("[1] 같은 제목 재업로드");
const TITLE = "중복테스트 테브난 등가";
const first = await upload(SUBJ, [`${MARK}1.png`], TITLE);
check("첫 업로드 200 · 1장 추가", first.status === 200 && first.body.added === 1,
  `HTTP ${first.status} added=${first.body.added}`);

const again = await upload(SUBJ, [`${MARK}2.png`], TITLE);
check("같은 제목 재업로드도 HTTP 200 (오류 아님)", again.status === 200, `HTTP ${again.status}`);
check("추가된 장수 0", again.body.added === 0, `added=${again.body.added}`);
check("제외 사유가 제목 중복임을 알린다",
  (again.body.rejected ?? []).some((r) => r.includes("같은 제목")),
  JSON.stringify(again.body.rejected));
check("앨범 장수 그대로", (await mineCount(SUBJ)) === 1, `${await mineCount(SUBJ)}장`);

// ─── 2. 대소문자·띄어쓰기만 다른 제목도 같은 제목 ──────────────────────
console.log("\n[2] 표기 차이 흡수 (띄어쓰기·대소문자)");
const spaced = await upload(SUBJ, [`${MARK}3.png`], "중복테스트테브난등가");
check("띄어쓰기만 뗀 제목 → 중복", spaced.body.added === 0, `added=${spaced.body.added}`);

const cased = await upload(SUBJ, [`${MARK}4.png`], "  RLC Note  ");
check("새 제목은 정상 추가", cased.body.added === 1, `added=${cased.body.added}`);
const casedDup = await upload(SUBJ, [`${MARK}5.png`], "rlc note");
check("대소문자만 다른 제목 → 중복", casedDup.body.added === 0, `added=${casedDup.body.added}`);

// ─── 3. 제목을 안 적으면 파일명이 제목 ─────────────────────────────────
console.log("\n[3] 제목 미입력 — 파일명이 제목");
const byName = await upload(SUBJ, [`${MARK}sameName.png`]);
check("파일명 제목으로 1장 추가", byName.body.added === 1, `added=${byName.body.added}`);
const byNameAgain = await upload(SUBJ, [`${MARK}sameName.png`]);
check("같은 파일명 재업로드 → 중복", byNameAgain.body.added === 0, `added=${byNameAgain.body.added}`);
// 확장자만 다르면 제목(확장자 뗀 값)이 같다 — 같은 스샷을 jpg로 다시 올리는 경우.
const byNameJpg = await upload(SUBJ, [`${MARK}sameName.jpg`]);
check("확장자만 다른 같은 파일명 → 중복", byNameJpg.body.added === 0, `added=${byNameJpg.body.added}`);

// ─── 4. 한 묶음 안의 중복도 첫 장만 ────────────────────────────────────
console.log("\n[4] 한 번에 올린 묶음 안의 중복");
const beforeBatch = await mineCount(SUBJ);
const batch = await upload(SUBJ, [`${MARK}batch.png`, `${MARK}batch.png`, `${MARK}batch2.png`]);
check("같은 파일명 2장 중 1장만 저장", batch.body.added === 2, `added=${batch.body.added}`);
check("앨범에 2장만 늘었다", (await mineCount(SUBJ)) === beforeBatch + 2,
  `${beforeBatch} → ${await mineCount(SUBJ)}`);

// 제목을 적고 여러 장 올리면 "제목 (1)·(2)"로 번호가 붙어 서로 다른 제목이 된다.
const numbered = await upload(SUBJ, [`${MARK}n1.png`, `${MARK}n2.png`], "번호붙는제목");
check("제목+여러장은 번호가 붙어 모두 저장", numbered.body.added === 2, `added=${numbered.body.added}`);
const numberedAgain = await upload(SUBJ, [`${MARK}n3.png`, `${MARK}n4.png`], "번호붙는제목");
check("같은 묶음을 다시 올리면 전부 중복", numberedAgain.body.added === 0,
  `added=${numberedAgain.body.added}`);

// ─── 5. 앨범이 다르면 같은 제목 허용 ───────────────────────────────────
console.log("\n[5] 앨범 분리");
const otherAlbum = await upload(OTHER, [`${MARK}o1.png`], TITLE);
check("다른 앨범에는 같은 제목도 올라간다", otherAlbum.body.added === 1,
  `added=${otherAlbum.body.added}`);

// ─── 6. 지운 뒤에는 다시 올릴 수 있다 (영구 차단 아님) ─────────────────
console.log("\n[6] 삭제 후 재업로드");
const { notes = [] } = await list(SUBJ);
const target = notes.find((n) => n.title === TITLE);
await fetch(`${BASE}/api/notes?subject=${SUBJ}&id=${target.id}`, { method: "DELETE" });
const readd = await upload(SUBJ, [`${MARK}re.png`], TITLE);
check("삭제한 제목은 다시 올릴 수 있다", readd.body.added === 1, `added=${readd.body.added}`);

// ─── 정리 ──────────────────────────────────────────────────────────────
await cleanup(SUBJ);
await cleanup(OTHER);
check("테스트 사진 정리 완료", (await mineCount(SUBJ)) === 0 && (await mineCount(OTHER)) === 0);

console.log(fail === 0 ? "\n=== DUPLICATE-TITLE SMOKE PASS ===" : `\n=== ${fail} FAILURE(S) ===`);
process.exit(fail === 0 ? 0 : 1);
