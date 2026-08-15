// =====================================================================
// 요점정리 사진첩 (과목별 앨범 + 과목과 무관한 별도 앨범) — 클라이언트·서버 공용 타입
//
// ⚠️ 이 파일은 클라이언트 번들에 들어간다. node:fs 등 서버 전용 모듈을
//    import 하지 말 것 (저장 로직은 lib/noteStore.ts).
// =====================================================================

import { SUBJECT_KEYS, SUBJECT_LABEL, type SubjectKey } from "@/types";

/**
 * 과목에 속하지 않는 별도 앨범.
 *
 * ★ 앨범 키는 **저장 디렉터리 이름**(`data/notes/<album>/`)이 되므로 영문 소문자·밑줄만 쓴다.
 *   과목 앨범과 같은 저장소·API를 그대로 쓰고, 목록에 한 칸이 더 붙을 뿐이다
 *   (새 저장소·새 라우트를 만들면 업로드·회전·순서변경·삭제를 전부 두 번 구현하게 된다).
 */
export const NOTE_EXTRA_ALBUM_KEYS = ["major_shot", "generated_qa", "flo_mock_exam"] as const;
export type NoteExtraAlbumKey = (typeof NOTE_EXTRA_ALBUM_KEYS)[number];

/** 사진첩 하나를 가리키는 키 — 과목 8종 + 별도 앨범. */
export type NoteAlbumKey = SubjectKey | NoteExtraAlbumKey;

/** 화면에 보이는 앨범 순서 (과목 8종 다음에 별도 앨범). */
export const NOTE_ALBUM_KEYS: NoteAlbumKey[] = [...SUBJECT_KEYS, ...NOTE_EXTRA_ALBUM_KEYS];

export const NOTE_EXTRA_ALBUM_LABEL: Record<NoteExtraAlbumKey, string> = {
  major_shot: "전공스샷",
  generated_qa: "전공생성문제&답안",
  flo_mock_exam: "flo모의고사",
};

/**
 * **문제 생성 화면의 업로드 창이 사진을 고르는 앨범.**
 * 여기 모아둔 기출 스샷을 바로 골라 분석할 수 있게 연결돼 있다(ImageUploader).
 * 앨범을 바꾸려면 이 상수만 바꾸면 된다 — 화면 문구는 `noteAlbumLabel`로 따라간다.
 */
export const NOTE_SOURCE_ALBUM_KEY: NoteAlbumKey = "major_shot";

/** 앨범 표시 이름 (과목이면 과목명, 아니면 별도 앨범 이름). */
export function noteAlbumLabel(key: NoteAlbumKey): string {
  return isNoteExtraAlbumKey(key) ? NOTE_EXTRA_ALBUM_LABEL[key] : SUBJECT_LABEL[key];
}

/** 과목 앨범이 아닌 별도 앨범인가. */
export function isNoteExtraAlbumKey(v: unknown): v is NoteExtraAlbumKey {
  return typeof v === "string" && (NOTE_EXTRA_ALBUM_KEYS as readonly string[]).includes(v);
}

/** 외부 입력이 실제 앨범 키인지 검사 — 경로 조립 전 반드시 통과시킬 것. */
export function isNoteAlbumKey(v: unknown): v is NoteAlbumKey {
  return (
    typeof v === "string" &&
    ((SUBJECT_KEYS as readonly string[]).includes(v) || isNoteExtraAlbumKey(v))
  );
}

/**
 * 사진 표시 회전각(도). 원본 파일은 건드리지 않고 이 값만 저장해 화면에서 돌린다
 * (재인코딩이 없어 화질 손실·처리 시간이 없고, 되돌리기도 자유롭다).
 */
export type NoteRotation = 0 | 90 | 180 | 270;

export const NOTE_ROTATIONS: NoteRotation[] = [0, 90, 180, 270];

/** 임의의 값을 유효한 회전각으로 정규화 (90도 단위로 맞추고 0~270 범위로 감는다). */
export function normalizeRotation(v: unknown): NoteRotation {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  const snapped = ((Math.round(n / 90) * 90) % 360 + 360) % 360;
  return (NOTE_ROTATIONS.includes(snapped as NoteRotation) ? snapped : 0) as NoteRotation;
}

/** 요점정리 사진 1장의 메타데이터. 이미지 바이너리는 별도 파일로 보관하고 여기엔 담지 않는다. */
export type NotePhoto = {
  /** 서버 생성 UUID. 파일명·조회 키로 그대로 쓰이므로 [0-9a-f-]만 허용. */
  id: string;
  /** 업로드한 원본 파일명 (표시용). */
  fileName: string;
  /**
   * 업로드할 때 사용자가 직접 적은 제목. 없으면 파일명에서 확장자를 뗀 값이 제목이 된다
   * (`notePhotoTitle`). 휴대폰 사진(IMG_1234)처럼 파일명이 의미 없을 때를 위한 칸이다.
   */
  title?: string;
  /** image/png · image/jpeg 등. 조회 시 Content-Type으로 그대로 사용. */
  mime: string;
  /** 이미지 파일 크기(byte). 용량 표시용. */
  bytes: number;
  /** 사진에 붙이는 한 줄 설명 (없으면 빈 문자열). */
  memo: string;
  /** 화면 표시 회전각. 원본 파일은 그대로 두고 이 값으로만 돌린다. */
  rotation: NoteRotation;
  savedAt: number;
};

/**
 * 화면에 보여줄 사진 제목.
 *  1) 업로드할 때 직접 적은 제목이 있으면 그걸 쓴다(휴대폰 사진은 `IMG_1234`라 파일명이 쓸모없다).
 *  2) 없으면 파일명에서 **확장자만 떼어낸다**.
 */
export function notePhotoTitle(photo: Pick<NotePhoto, "fileName"> & { title?: string }): string {
  const typed = String(photo.title ?? "").trim();
  if (typed) return typed;
  const base = String(photo.fileName ?? "").replace(/\.[^.\\/]+$/, "").trim();
  return base || String(photo.fileName ?? "");
}

/**
 * **중복 판정용 제목 키** — 같은 앨범에 같은 제목을 두 번 올리지 않기 위한 비교값.
 *
 * 검색과 같은 정규화(NFC·소문자·연속 공백 정리)를 쓰고 **띄어쓰기는 무시**한다
 * ("테브난 등가"와 "테브난등가"는 같은 제목으로 본다 — `matchesNoteSearch`와 같은 규칙).
 * 판정 규칙을 여기 한 곳에 둬야 "검색엔 같은 걸로 잡히는데 중복은 아니라고 한다"가 생기지 않는다.
 */
export function noteTitleKey(photo: Pick<NotePhoto, "fileName"> & { title?: string }): string {
  return normalizeNoteSearchText(notePhotoTitle(photo)).replace(/ /g, "");
}

/** 제목 입력 최대 길이 — 너무 길면 썸네일 캡션이 무의미해진다. */
export const NOTE_TITLE_MAX = 60;

// ─── 제목 검색 ─────────────────────────────────────────────────────────
// 검색 판정은 **여기 한 곳**에만 둔다 — 클라이언트(즉시 반응)와 서버(모든 앨범 훑기)가
// 같은 규칙을 써야 "화면엔 나오는데 검색엔 안 잡힌다"가 생기지 않는다.

/** 검색어 입력 상한 — 제목보다 길게 칠 이유가 없다. */
export const NOTE_SEARCH_MAX = NOTE_TITLE_MAX;

/** 한 번에 돌려주는 검색 결과 상한 (넘으면 잘렸다고 화면에 알린다). */
export const NOTE_SEARCH_LIMIT = 500;

/**
 * 제목 검색 결과 1건 — 어느 앨범의 몇 번째 사진인지까지 함께 담는다.
 * ★ 서버(noteStore)와 화면(SubjectNotes)이 같이 쓰므로 **여기**에 둔다
 *   (noteStore에 두면 클라이언트가 node:fs 모듈에서 타입을 가져오게 된다).
 */
export type NoteSearchHit = {
  album: NoteAlbumKey;
  /** 그 앨범 안에서의 위치(0부터) — 결과 타일에 "3번째"로 보여주기 위한 값. */
  position: number;
  photo: NotePhoto;
};

/**
 * 검색용 정규화 — 대소문자·자모 조합(NFC)·연속 공백 차이를 흡수한다.
 * 한글은 같은 글자가 조합형/완성형 두 가지로 들어올 수 있어 NFC로 맞춘다
 * (맥에서 복사한 파일명이 조합형인 경우가 흔하다).
 */
export function normalizeNoteSearchText(v: unknown): string {
  return String(v ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 검색어를 공백으로 끊어 토큰 배열로. 빈 배열이면 "검색 안 함"을 뜻한다. */
export function noteSearchTokens(query: unknown): string[] {
  const norm = normalizeNoteSearchText(String(query ?? "").slice(0, NOTE_SEARCH_MAX));
  return norm ? norm.split(" ").filter(Boolean) : [];
}

/**
 * 사진 **제목**이 검색어와 맞는가 — 토큰을 **모두** 포함해야 한다(AND).
 *  · 대상은 화면에 보이는 제목(`notePhotoTitle`) — 직접 적은 제목, 없으면 파일명(확장자 뗀 것).
 *  · 띄어쓰기는 무시한다 — "테브난등가"로 쳐도 "테브난 등가"가 잡힌다(반대도 마찬가지).
 * 토큰이 없으면(=검색어 없음) 항상 true.
 */
export function matchesNoteSearch(
  photo: Pick<NotePhoto, "fileName"> & { title?: string },
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const hay = normalizeNoteSearchText(notePhotoTitle(photo));
  const tight = hay.replace(/ /g, "");
  return tokens.every((t) => {
    // ★ 연도(4자리)는 **독립된 수**로만 맞춘다 — 그냥 부분일치로 두면 "2026"이
    //   `KakaoTalk_20260731_...` 같은 날짜 문자열에 걸려 해당 연도 기출이 묻힌다(실측 157건).
    const year = yearTokenPattern(t);
    if (year) return year.test(hay) || year.test(tight);
    return hay.includes(t) || tight.includes(t.replace(/ /g, ""));
  });
}

/**
 * 검색어가 **연도**로 보이면(1900~2099의 4자리) 앞뒤에 숫자가 붙지 않은 경우만 맞추는 정규식.
 * 연도가 아니면 null — 기존 부분일치를 그대로 쓴다.
 */
function yearTokenPattern(token: string): RegExp | null {
  if (!/^(19|20)\d{2}$/.test(token)) return null;
  return new RegExp(`(?<!\\d)${token}(?!\\d)`);
}

/** 업로드 허용 이미지 MIME → 저장 확장자. 화이트리스트 외 타입은 거부한다. */
export const NOTE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** 사진 1장 최대 용량 (byte). 초과분은 업로드에서 거부된다. */
export const NOTE_MAX_BYTES = 12 * 1024 * 1024;

/** 한 번에 올릴 수 있는 사진 장수 상한. */
export const NOTE_MAX_FILES_PER_UPLOAD = 30;
