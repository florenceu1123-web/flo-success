// =====================================================================
// 요점정리 사진첩 (과목별 앨범) — 클라이언트·서버 공용 타입
//
// ⚠️ 이 파일은 클라이언트 번들에 들어간다. node:fs 등 서버 전용 모듈을
//    import 하지 말 것 (저장 로직은 lib/noteStore.ts).
// =====================================================================

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
