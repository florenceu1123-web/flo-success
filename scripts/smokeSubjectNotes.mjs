/**
 * 요점정리 사진첩(과목별 앨범) API 스모크 테스트.
 *
 * 검증 항목:
 *  1. 빈 앨범 조회 / 과목별 장수 집계
 *  2. 사진 여러 장 동시 업로드 (multipart)
 *  3. 이미지 바이너리 조회 (Content-Type)
 *  4. 설명(메모) 수정 · 삭제
 *  4-2. 회전 — 저장·유지 + 부분 수정(설명/회전 서로 안 지움) + 잘못된 각도 거부
 *  5. 순서 변경 — 저장·복원 + 집합 불일치 요청 거부
 *  6. 과목 분리 (A 과목 업로드가 B 과목에 안 섞임)
 *  7. 입력 검증 — 잘못된 subject·id, 경로 탈출(../), 비이미지 파일 거부
 *  8. 제목 검색(?q=) — 모든 앨범 훑기, AND·띄어쓰기 무시, 파일명 제목, 설명은 대상 아님
 *
 * 실행: dev 서버 기동 상태에서  node scripts/smokeSubjectNotes.mjs
 *       (포트가 3000이 아니면  BASE_URL=http://localhost:3001 node scripts/...)
 *
 * ※ 이 테스트는 data/subject-notes.json 에 실제로 썼다가 자기가 만든 것만 지운다.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SUBJ = "electronics";
const OTHER = "circuit_theory";

let fail = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fail += 1;
}

const png = readFileSync("test-images/imyong6.png");
const png2 = readFileSync("test-images/imyong11_rlc_maxpower.png");

const list = async (subject) => (await fetch(`${BASE}/api/notes?subject=${subject}`)).json();

/** 이 스크립트가 만든 사진만 파일명으로 식별해 정리 (사용자 사진 보존). */
const MARK = "__smoke__";
async function cleanup(subject) {
  const { notes = [] } = await list(subject);
  for (const p of notes.filter((n) => n.fileName.includes(MARK))) {
    await fetch(`${BASE}/api/notes?subject=${subject}&id=${p.id}`, { method: "DELETE" });
  }
}

console.log(`BASE = ${BASE}\n`);
await cleanup(SUBJ);
await cleanup(OTHER);

// ─── 1. 조회 ────────────────────────────────────────────────────────────
console.log("[1] 목록 조회 + 장수 집계");
const before = await list(SUBJ);
check("GET 200 · notes 배열", Array.isArray(before.notes), `${before.notes?.length}장`);
// 앨범은 과목 8종 + 별도 앨범(전공스샷 등)이라 개수를 못 박지 않는다 — 별도 앨범이 늘 때마다
// 이 단언이 거짓으로 깨졌다(실측). 두 종류가 모두 집계에 들어오는지만 본다.
const countKeys = Object.keys(before.counts ?? {});
check("counts에 과목·별도 앨범이 모두 포함",
  countKeys.length >= 8 && countKeys.includes(SUBJ) && countKeys.includes("major_shot"),
  `${countKeys.length}개`);
const baseCount = before.notes.length;

// ─── 2. 여러 장 업로드 ──────────────────────────────────────────────────
console.log("\n[2] 사진 3장 동시 업로드 (multipart)");
const form = new FormData();
form.append("subject", SUBJ);
form.append("files", new Blob([png], { type: "image/png" }), `${MARK}a.png`);
form.append("files", new Blob([png2], { type: "image/png" }), `${MARK}b.png`);
form.append("files", new Blob([png], { type: "image/jpeg" }), `${MARK}c.jpg`);
const upRes = await fetch(`${BASE}/api/notes`, { method: "POST", body: form });
const up = await upRes.json();
check("POST 200", upRes.status === 200, `HTTP ${upRes.status}`);
check("3장 추가됨", up.added === 3, `added=${up.added}`);
check("목록에 반영", up.notes?.length === baseCount + 3, `${up.notes?.length}장`);
const mine = (up.notes ?? []).filter((n) => n.fileName.includes(MARK));
check("메타데이터 정상 (id·bytes·mime)",
  mine.every((n) => n.id && n.bytes > 0 && n.mime.startsWith("image/")));
check("업로드 순서 유지", mine[0]?.fileName.endsWith("a.png") && mine[2]?.fileName.endsWith("c.jpg"));

// ─── 3. 이미지 바이너리 ─────────────────────────────────────────────────
console.log("\n[3] 이미지 조회");
const imgRes = await fetch(`${BASE}/api/notes/image?subject=${SUBJ}&id=${mine[0].id}`);
const imgBuf = Buffer.from(await imgRes.arrayBuffer());
check("GET 200", imgRes.status === 200, `HTTP ${imgRes.status}`);
check("Content-Type = image/png", imgRes.headers.get("content-type") === "image/png");
check("바이트 원본과 동일", imgBuf.length === png.length && imgBuf.equals(png),
  `${imgBuf.length} vs ${png.length}`);

// ─── 4. 메모 수정 · 삭제 ────────────────────────────────────────────────
console.log("\n[4] 설명 수정 · 삭제");
const patchRes = await fetch(`${BASE}/api/notes`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subject: SUBJ, id: mine[0].id, memo: "테브난 등가 요약" }),
});
const patched = await patchRes.json();
check("PATCH 200 · 메모 저장", patchRes.status === 200 && patched.note?.memo === "테브난 등가 요약",
  patched.note?.memo);
const afterPatch = await list(SUBJ);
check("메모가 목록에도 반영",
  afterPatch.notes.find((n) => n.id === mine[0].id)?.memo === "테브난 등가 요약");

const delRes = await fetch(`${BASE}/api/notes?subject=${SUBJ}&id=${mine[2].id}`, { method: "DELETE" });
const del = await delRes.json();
check("DELETE 200 · 1장 감소", delRes.status === 200 && del.notes.length === baseCount + 2,
  `${del.notes.length}장`);
const goneRes = await fetch(`${BASE}/api/notes/image?subject=${SUBJ}&id=${mine[2].id}`);
check("삭제된 사진 이미지 404", goneRes.status === 404, `HTTP ${goneRes.status}`);

// ─── 4-2. 회전 ──────────────────────────────────────────────────────────
console.log("\n[4-2] 회전 (저장되는 값)");
const patchJson = (body) =>
  fetch(`${BASE}/api/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

check("업로드 직후 rotation=0", mine.every((n) => n.rotation === 0),
  mine.map((n) => n.rotation).join(","));

const rotRes = await patchJson({ subject: SUBJ, id: mine[0].id, rotation: 90 });
const rot = await rotRes.json();
check("PATCH rotation=90 → 200", rotRes.status === 200 && rot.note?.rotation === 90,
  `rotation=${rot.note?.rotation}`);
const afterRot = await list(SUBJ);
const rotated = afterRot.notes.find((n) => n.id === mine[0].id);
check("다시 조회해도 90 유지", rotated?.rotation === 90, `${rotated?.rotation}`);
check("회전만 보내도 설명이 지워지지 않음", rotated?.memo === "테브난 등가 요약",
  `memo="${rotated?.memo}"`);

const rot270 = await (await patchJson({ subject: SUBJ, id: mine[0].id, rotation: 270 })).json();
check("270도로 변경", rot270.note?.rotation === 270, `${rot270.note?.rotation}`);

const memoOnly = await (await patchJson({ subject: SUBJ, id: mine[0].id, memo: "설명만 변경" })).json();
check("설명만 보내도 회전이 유지됨", memoOnly.note?.rotation === 270 && memoOnly.note?.memo === "설명만 변경",
  `rotation=${memoOnly.note?.rotation}, memo="${memoOnly.note?.memo}"`);

const badRot = await patchJson({ subject: SUBJ, id: mine[0].id, rotation: 45 });
check("90도 단위가 아니면 400", badRot.status === 400, `HTTP ${badRot.status}`);
const emptyPatch = await patchJson({ subject: SUBJ, id: mine[0].id });
check("바꿀 항목이 없으면 400", emptyPatch.status === 400, `HTTP ${emptyPatch.status}`);
const stillRot = (await list(SUBJ)).notes.find((n) => n.id === mine[0].id);
check("거부된 요청이 회전을 건드리지 않음", stillRot?.rotation === 270, `${stillRot?.rotation}`);

await patchJson({ subject: SUBJ, id: mine[0].id, rotation: 0 });

// ─── 5. 순서 변경 ───────────────────────────────────────────────────────
console.log("\n[5] 순서 변경");
const put = (body) =>
  fetch(`${BASE}/api/notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const cur = (await list(SUBJ)).notes;
const originalOrder = cur.map((n) => n.id);
check("순서 변경 전 2장 이상", cur.length >= 2, `${cur.length}장`);

// 전체를 뒤집어 보낸다 — 사용자 사진이 이미 있어도 안전하게 마지막에 원복한다.
const reversed = [...originalOrder].reverse();
const reRes = await put({ subject: SUBJ, order: reversed });
const re = await reRes.json();
check("PUT 200", reRes.status === 200, `HTTP ${reRes.status}`);
check("응답 순서가 요청대로", JSON.stringify(re.notes?.map((n) => n.id)) === JSON.stringify(reversed));
const afterGet = await list(SUBJ);
check("다시 조회해도 순서 유지 (파일에 저장됨)",
  JSON.stringify(afterGet.notes.map((n) => n.id)) === JSON.stringify(reversed));
check("장수·메타는 그대로", afterGet.notes.length === cur.length);

// 집합이 안 맞는 요청은 반영되면 안 된다 (다른 탭에서 삭제·추가된 상황).
const shortRes = await put({ subject: SUBJ, order: reversed.slice(1) });
check("일부만 보내면 409", shortRes.status === 409, `HTTP ${shortRes.status}`);
const dupRes = await put({ subject: SUBJ, order: reversed.map(() => reversed[0]) });
check("같은 id 중복이면 409", dupRes.status === 409, `HTTP ${dupRes.status}`);
const badIdRes = await put({ subject: SUBJ, order: ["not-a-uuid"] });
check("id 형식이 틀리면 400", badIdRes.status === 400, `HTTP ${badIdRes.status}`);
const stillReversed = await list(SUBJ);
check("거부된 요청이 순서를 건드리지 않음",
  JSON.stringify(stillReversed.notes.map((n) => n.id)) === JSON.stringify(reversed));

const restoreRes = await put({ subject: SUBJ, order: originalOrder });
check("원래 순서로 복원", restoreRes.status === 200);

// ─── 6. 과목 분리 ───────────────────────────────────────────────────────
console.log("\n[6] 과목별 앨범 분리");
const otherForm = new FormData();
otherForm.append("subject", OTHER);
otherForm.append("files", new Blob([png2], { type: "image/png" }), `${MARK}other.png`);
const otherUp = await (await fetch(`${BASE}/api/notes`, { method: "POST", body: otherForm })).json();
check(`${OTHER} 앨범에 1장`, otherUp.notes.filter((n) => n.fileName.includes(MARK)).length === 1);
const subjNow = await list(SUBJ);
check(`${SUBJ} 앨범은 그대로 (섞이지 않음)`, subjNow.notes.length === baseCount + 2,
  `${subjNow.notes.length}장`);
check("counts가 두 과목 각각 집계",
  subjNow.counts[SUBJ] === baseCount + 2 && subjNow.counts[OTHER] >= 1,
  `${SUBJ}=${subjNow.counts[SUBJ]}, ${OTHER}=${subjNow.counts[OTHER]}`);

// ─── 7. 입력 검증 ───────────────────────────────────────────────────────
console.log("\n[7] 입력 검증 (거부되어야 정상)");
const badSubj = await fetch(`${BASE}/api/notes?subject=not_a_subject`);
check("존재하지 않는 subject → 400", badSubj.status === 400, `HTTP ${badSubj.status}`);

const traversal = await fetch(
  `${BASE}/api/notes/image?subject=${encodeURIComponent("../../data")}&id=${encodeURIComponent("../../../package")}`,
);
check("경로 탈출(../) → 400", traversal.status === 400, `HTTP ${traversal.status}`);

const badId = await fetch(`${BASE}/api/notes/image?subject=${SUBJ}&id=not-a-uuid`);
check("UUID 아닌 id → 400", badId.status === 400, `HTTP ${badId.status}`);

const txtForm = new FormData();
txtForm.append("subject", SUBJ);
txtForm.append("files", new Blob(["hello"], { type: "text/plain" }), `${MARK}x.txt`);
const txtRes = await fetch(`${BASE}/api/notes`, { method: "POST", body: txtForm });
check("이미지 아닌 파일 → 400", txtRes.status === 400, `HTTP ${txtRes.status}`);

const noFile = new FormData();
noFile.append("subject", SUBJ);
const noFileRes = await fetch(`${BASE}/api/notes`, { method: "POST", body: noFile });
check("파일 없음 → 400", noFileRes.status === 400, `HTTP ${noFileRes.status}`);

// ─── 8. 제목 검색 (모든 앨범) ───────────────────────────────────────────
console.log("\n[8] 제목 검색");
// 사용자 사진과 겹치지 않을 낱말로 두 앨범에 한 장씩 올린다.
const TOKEN = "지그재그검색토큰";
const titled = new FormData();
titled.append("subject", SUBJ);
titled.append("title", `${TOKEN} 테브난 등가`);
titled.append("files", new Blob([png], { type: "image/png" }), `${MARK}search1.png`);
await fetch(`${BASE}/api/notes`, { method: "POST", body: titled });

const titledOther = new FormData();
titledOther.append("subject", OTHER);
titledOther.append("title", `${TOKEN} 공진 회로`);
titledOther.append("files", new Blob([png2], { type: "image/png" }), `${MARK}search2.png`);
await fetch(`${BASE}/api/notes`, { method: "POST", body: titledOther });

// 제목 없이 올린 사진은 파일명이 제목 — 파일명으로도 찾을 수 있어야 한다.
const byFile = new FormData();
byFile.append("subject", SUBJ);
byFile.append("files", new Blob([png], { type: "image/png" }), `${MARK}${TOKEN}파일명.png`);
await fetch(`${BASE}/api/notes`, { method: "POST", body: byFile });

const search = async (q) =>
  (await fetch(`${BASE}/api/notes?subject=${SUBJ}&q=${encodeURIComponent(q)}`)).json();

const all = await search(TOKEN);
check("검색어를 주면 hits가 온다", Array.isArray(all.hits), `${all.hits?.length}건`);
check("두 앨범 것이 모두 잡힘", all.hits?.length === 3, `${all.hits?.length}건`);
check(
  "hits에 앨범 키가 담긴다",
  new Set((all.hits ?? []).map((h) => h.album)).size === 2,
  [...new Set((all.hits ?? []).map((h) => h.album))].join(","),
);
check(
  "hits에 앨범 내 위치가 담긴다",
  (all.hits ?? []).every((h) => Number.isInteger(h.position) && h.position >= 0),
);
check(
  "사진 메타(id·mime)가 그대로 온다",
  (all.hits ?? []).every((h) => h.photo?.id && h.photo?.mime?.startsWith("image/")),
);
check("파일명이 제목인 사진도 잡힌다",
  (all.hits ?? []).some((h) => h.photo.fileName.includes("파일명")));

const both = await search(`${TOKEN} 공진`);
check("두 낱말은 AND로 좁혀진다", both.hits?.length === 1, `${both.hits?.length}건`);
check("좁혀진 결과가 다른 앨범 것", both.hits?.[0]?.album === OTHER, both.hits?.[0]?.album);

const tight = await search(`${TOKEN}공진`);
check("띄어쓰기를 무시하고도 잡힌다", tight.hits?.length === 1, `${tight.hits?.length}건`);

const none = await search(`${TOKEN} 없는낱말`);
check("맞는 제목이 없으면 빈 배열", Array.isArray(none.hits) && none.hits.length === 0);

// 설명(memo)은 검색 대상이 아니다 — 제목에는 없는 낱말을 설명에만 넣고 확인한다.
const memoOnlyWord = `${TOKEN}메모에만있는낱말`;
const memoTarget = (all.hits ?? [])[0]?.photo?.id;
await fetch(`${BASE}/api/notes`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subject: (all.hits ?? [])[0]?.album, id: memoTarget, memo: memoOnlyWord }),
});
const memoSearch = await search(memoOnlyWord);
check("설명(memo)으로는 안 잡힌다", (memoSearch.hits ?? []).length === 0,
  `${memoSearch.hits?.length}건`);

const blank = await search("   ");
check("공백만 보내면 평소 목록 응답(hits 없음)",
  blank.hits === undefined && Array.isArray(blank.notes));
check("검색 응답에도 목록·집계가 함께 온다",
  Array.isArray(all.notes) && typeof all.counts === "object");

const badSearchSubj = await fetch(`${BASE}/api/notes?subject=nope&q=${encodeURIComponent(TOKEN)}`);
check("검색이어도 잘못된 앨범은 400", badSearchSubj.status === 400, `HTTP ${badSearchSubj.status}`);

// ─── 정리 ───────────────────────────────────────────────────────────────
await cleanup(SUBJ);
await cleanup(OTHER);
const restored = await list(SUBJ);
check("\n정리 후 원래 장수로 복귀", restored.notes.length === baseCount,
  `${restored.notes.length} vs ${baseCount}`);

console.log(fail === 0 ? "\n=== SUBJECT NOTES SMOKE PASS ===" : `\n=== ${fail} FAILURE(S) ===`);
process.exit(fail === 0 ? 0 : 1);
