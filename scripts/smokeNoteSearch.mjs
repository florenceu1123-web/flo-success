/**
 * 요점정리 사진첩 **제목 검색** 규칙 스모크 (API·서버 없이 순수 함수만 검증).
 *
 * 검증 항목:
 *  1. 토큰화 — 공백만 친 검색어는 "검색 안 함", 대소문자·연속 공백·길이 상한
 *  2. 제목 매칭 — 부분 일치, 여러 낱말은 AND, 띄어쓰기 무시, 순서 무관
 *  3. 제목 출처 — 직접 적은 제목 우선, 없으면 파일명(확장자 뗀 것)
 *  4. 안 걸려야 하는 것 — 설명(memo)·앨범 이름은 검색 대상이 아니다
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeNoteSearch.mjs
 */
import {
  NOTE_SEARCH_MAX,
  matchesNoteSearch,
  noteSearchTokens,
  normalizeNoteSearchText,
} from "@/types/notes";

let fail = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fail += 1;
}

/** 검색어 q로 사진 photo가 잡히는가. */
const hit = (photo, q) => matchesNoteSearch(photo, noteSearchTokens(q));

// ─── 1. 토큰화 ──────────────────────────────────────────────────────────
console.log("[1] 검색어 토큰화");
check("빈 문자열 → 검색 안 함", noteSearchTokens("").length === 0);
check("공백만 → 검색 안 함", noteSearchTokens("   ").length === 0);
check("낱말 2개 → 토큰 2개", noteSearchTokens("테브난 등가").length === 2);
check("연속 공백을 하나로", noteSearchTokens("테브난     등가").length === 2);
check("대문자는 소문자로", normalizeNoteSearchText("RLC Resonance") === "rlc resonance");
check(
  `상한 ${NOTE_SEARCH_MAX}자에서 잘림`,
  noteSearchTokens("가".repeat(NOTE_SEARCH_MAX + 20))[0].length === NOTE_SEARCH_MAX,
);
check("null·undefined도 빈 결과", noteSearchTokens(null).length === 0 && noteSearchTokens(undefined).length === 0);

// ─── 2. 제목 매칭 ───────────────────────────────────────────────────────
console.log("\n[2] 제목 매칭");
const thevenin = { fileName: "IMG_1234.png", title: "2022 전기 B-6 테브난 등가" };

check("일부만 쳐도 잡힘", hit(thevenin, "테브난"));
check("숫자·기호 섞인 조각도 잡힘", hit(thevenin, "B-6"));
check("소문자로 쳐도 잡힘", hit({ fileName: "RLC_Resonance.png" }, "rlc"));
check("두 낱말 모두 있어야 잡힘(AND)", hit(thevenin, "테브난 등가"));
check("한 낱말이 없으면 안 잡힘", !hit(thevenin, "테브난 공진"));
check("낱말 순서는 상관없음", hit(thevenin, "등가 테브난"));
check("띄어쓰기 없이 쳐도 잡힘", hit(thevenin, "테브난등가"));
check("제목에 없는 띄어쓰기로 쳐도 잡힘", hit({ fileName: "테브난등가.png" }, "테브난 등가"));
check("전혀 다른 낱말은 안 잡힘", !hit(thevenin, "카르노맵"));
check("검색어가 없으면 전부 통과", hit(thevenin, "") && hit(thevenin, "   "));

// ─── 3. 제목 출처 ───────────────────────────────────────────────────────
console.log("\n[3] 제목 출처 (직접 적은 제목 > 파일명)");
check("파일명으로도 찾을 수 있다", hit({ fileName: "카르노맵_정리.png" }, "카르노맵"));
check("확장자는 제목이 아니다", !hit({ fileName: "카르노맵_정리.png" }, "png"));
check(
  "제목을 적었으면 파일명은 안 본다",
  !hit({ fileName: "IMG_1234.png", title: "테브난 등가" }, "IMG_1234"),
);
check("빈 제목은 없는 것으로 보고 파일명 사용", hit({ fileName: "공진.png", title: "   " }, "공진"));

// ─── 4. 검색 대상이 아닌 것 ─────────────────────────────────────────────
console.log("\n[4] 제목만 본다 (설명·앨범은 대상 아님)");
const withMemo = { fileName: "IMG_9.png", title: "임용 5번", memo: "최대전력 전달 정리" };
check("설명(memo)으로는 안 잡힌다", !hit(withMemo, "최대전력"));
check("그래도 제목으로는 잡힌다", hit(withMemo, "임용 5번"));

console.log(fail === 0 ? "\n=== NOTE SEARCH SMOKE PASS ===" : `\n=== ${fail} FAILURE(S) ===`);
process.exit(fail === 0 ? 0 : 1);
