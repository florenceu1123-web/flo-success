import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  NOTE_ALBUM_KEYS,
  NOTE_MIME_EXT,
  NOTE_SEARCH_LIMIT,
  isNoteAlbumKey,
  matchesNoteSearch,
  normalizeRotation,
  noteTitleKey,
  notePhotoTitle,
  type NoteAlbumKey,
  type NotePhoto,
  type NoteRotation,
  type NoteSearchHit,
} from "@/types/notes";

const log = createLogger("noteStore");

/**
 * 요점정리 사진첩 저장소 — **앨범 단위**(과목 8종 + 전공스샷 같은 별도 앨범).
 *
 * ★ 이미지 바이너리를 JSON에 base64로 넣지 않는다 — solutionStore가 그렇게 해서
 *   data/original-solutions.json이 사진 몇 장만에 15MB를 넘겼다(실측). 사진첩은
 *   장수가 계속 늘어나므로 같은 방식이면 매 조회마다 수십 MB를 파싱하게 된다.
 *   → 이미지는 data/notes/<subject>/<id>.<ext> 파일로, JSON에는 메타데이터만.
 */

/** subjectKey → 사진 메타 배열 (업로드 순서 유지). */
type NoteIndex = Partial<Record<NoteAlbumKey, NotePhoto[]>>;

const DATA_DIR = path.join(process.cwd(), "data");
const INDEX_PATH = path.join(DATA_DIR, "subject-notes.json");
const NOTES_DIR = path.join(DATA_DIR, "notes");

// 동시 쓰기로 인한 인덱스 손상 방지 — solutionStore와 동일한 프로세스 내 직렬화 큐.
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

/**
 * 외부 입력이 실제 **앨범 키**인지 검사 (경로 조립 전 필수 — 통과 못 하면 `../` 경로 탈출이 가능하다).
 * 과목 8종 + 별도 앨범(전공스샷)을 모두 인정한다 — 판정 규칙은 `types/notes.ts`가 단일 진실 공급원.
 */
export function isNoteAlbum(v: unknown): v is NoteAlbumKey {
  return isNoteAlbumKey(v);
}

/**
 * id가 서버가 만든 UUID 형태인지 검사.
 * id는 파일 경로에 그대로 들어가므로 여기서 막지 않으면 `../` 경로 탈출이 가능하다.
 */
export function isNoteId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
}

async function readIndex(): Promise<NoteIndex> {
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return normalizeIndex(parsed as NoteIndex);
    return {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    log.warn("인덱스 읽기 실패 — 빈 인덱스로 처리", { error: String(e) });
    return {};
  }
}

/**
 * 회전 기능이 생기기 전에 저장된 레코드에는 rotation이 없다.
 * 읽는 시점에 0으로 채워 넣어 이후 코드가 값 존재를 신경 쓰지 않게 한다.
 */
function normalizeIndex(index: NoteIndex): NoteIndex {
  for (const key of Object.keys(index) as NoteAlbumKey[]) {
    const list = index[key];
    if (!Array.isArray(list)) continue;
    for (const photo of list) photo.rotation = normalizeRotation(photo.rotation);
  }
  return index;
}

/** 인덱스를 원자적으로 기록 (tmp 파일 → rename). */
async function writeIndex(index: NoteIndex): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${INDEX_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(index, null, 2), "utf-8");
  await fs.rename(tmp, INDEX_PATH);
}

/** data/notes/<subject>/<id>.<ext> — subject·id는 호출 전에 반드시 검증된 값이어야 한다. */
function imagePath(subject: NoteAlbumKey, id: string, ext: string): string {
  return path.join(NOTES_DIR, subject, `${id}.${ext}`);
}

/** 메타의 mime으로부터 저장 확장자를 되돌린다 (화이트리스트에 없으면 png). */
function extOf(photo: NotePhoto): string {
  return NOTE_MIME_EXT[photo.mime] ?? "png";
}

/** 특정 과목의 사진 목록 (업로드 순서). */
export async function listNotes(subject: NoteAlbumKey): Promise<NotePhoto[]> {
  const index = await readIndex();
  return index[subject] ?? [];
}

/** 전 앨범 사진 장수 — 앨범 버튼에 배지로 표시하기 위한 집계. */
export async function countNotesBySubject(): Promise<Record<string, number>> {
  const index = await readIndex();
  const counts: Record<string, number> = {};
  for (const key of NOTE_ALBUM_KEYS) counts[key] = index[key]?.length ?? 0;
  return counts;
}

/**
 * **모든 앨범**에서 제목이 검색어와 맞는 사진을 찾는다 (앨범 표시 순서 → 앨범 내 순서).
 *
 * 앨범을 옮겨 다니며 찾을 필요가 없도록 서버가 한 번에 훑는다 — 앨범이 11개라
 * 클라이언트가 앨범마다 조회하면 요청이 11번 나가고 화면도 앨범 단위로 갈라진다.
 * 상한(`NOTE_SEARCH_LIMIT`)을 넘으면 잘라내고 `truncated`로 알린다(조용히 감추지 않는다).
 */
export async function searchNotes(
  tokens: string[],
  limit = NOTE_SEARCH_LIMIT,
): Promise<{ hits: NoteSearchHit[]; truncated: boolean }> {
  if (tokens.length === 0) return { hits: [], truncated: false };
  const index = await readIndex();
  const hits: NoteSearchHit[] = [];
  let truncated = false;
  for (const album of NOTE_ALBUM_KEYS) {
    const list = index[album] ?? [];
    for (let i = 0; i < list.length; i += 1) {
      if (!matchesNoteSearch(list[i], tokens)) continue;
      if (hits.length >= limit) {
        truncated = true;
        return { hits, truncated };
      }
      hits.push({ album, position: i, photo: list[i] });
    }
  }
  return { hits, truncated };
}

/** 업로드 1건 (라우트에서 File → 바이트로 변환해 넘긴다). */
export type IncomingNote = {
  fileName: string;
  mime: string;
  data: Uint8Array;
  /** 업로드 화면에서 직접 적은 제목 (선택). 없으면 파일명이 제목이 된다. */
  title?: string;
};

/** 업로드 결과 — 실제로 추가된 사진과, 제목이 겹쳐 건너뛴 사진을 함께 알린다. */
export type AddNotesResult = {
  /** 갱신된 앨범 전체 목록. */
  notes: NotePhoto[];
  /** 이번에 실제로 저장된 사진들. */
  added: NotePhoto[];
  /** 같은 제목이 이미 있어 저장하지 않은 사진들 (표시용). */
  duplicates: { fileName: string; title: string }[];
};

/**
 * 사진 여러 장을 한 과목 앨범 끝에 추가한다.
 *
 * ★ **같은 앨범에 이미 있는 제목은 저장하지 않는다** — 같은 기출 스샷을 두 번 올리면
 *   썸네일 캡션이 똑같은 사진이 늘어나 검색·선택이 무의미해진다. 판정은 화면에 보이는
 *   제목(`notePhotoTitle`: 직접 적은 제목, 없으면 확장자 뗀 파일명)을 `noteTitleKey`로
 *   정규화해 비교하고, **이번 묶음 안에서 겹치는 것도** 첫 장만 남긴다.
 *   앨범이 다르면 같은 제목이어도 막지 않는다(과목별로 같은 이름의 정리가 있을 수 있다).
 *
 * ★ 검사·파일 쓰기·인덱스 갱신을 **한 쓰기 큐 안에서** 처리한다 — 목록을 밖에서 읽어
 *   비교하면 동시에 올라온 같은 제목이 둘 다 통과한다. 또 중복은 파일을 아예 쓰지 않아
 *   고아 파일도 남지 않는다.
 */
export async function addNotes(
  subject: NoteAlbumKey,
  incoming: IncomingNote[],
): Promise<AddNotesResult> {
  return enqueueWrite(async () => {
    const index = await readIndex();
    const existing = index[subject] ?? [];
    // 이미 있는 제목 + 이번 묶음에서 이미 채택한 제목을 함께 담는다.
    const seen = new Set(existing.map((p) => noteTitleKey(p)));

    const dir = path.join(NOTES_DIR, subject);
    await fs.mkdir(dir, { recursive: true });

    const added: NotePhoto[] = [];
    const duplicates: { fileName: string; title: string }[] = [];
    for (const item of incoming) {
      const ext = NOTE_MIME_EXT[item.mime];
      if (!ext) {
        log.warn("지원하지 않는 이미지 형식 — 건너뜀", { mime: item.mime, fileName: item.fileName });
        continue;
      }
      const meta = { fileName: item.fileName, ...(item.title?.trim() ? { title: item.title.trim() } : {}) };
      const key = noteTitleKey(meta);
      if (key && seen.has(key)) {
        duplicates.push({ fileName: item.fileName, title: notePhotoTitle(meta) });
        continue;
      }
      seen.add(key);

      const id = randomUUID();
      await fs.writeFile(path.join(dir, `${id}.${ext}`), item.data);
      added.push({
        id,
        ...meta,
        mime: item.mime,
        bytes: item.data.byteLength,
        memo: "",
        rotation: 0,
        savedAt: Date.now(),
      });
    }

    if (added.length > 0) {
      index[subject] = [...existing, ...added];
      await writeIndex(index);
    }
    log.info("요점정리 사진 추가", {
      subject,
      added: added.length,
      duplicates: duplicates.length,
      total: index[subject]?.length ?? 0,
      bytes: added.reduce((s, p) => s + p.bytes, 0),
    });
    return { notes: index[subject] ?? [], added, duplicates };
  });
}

/**
 * 사진 1장의 설명·회전각을 부분 수정한다 (전달한 필드만 바뀐다). 대상이 없으면 null.
 * 회전만 바꾸려고 memo를 같이 보내지 않아도 기존 설명이 지워지지 않는다.
 */
export async function updateNote(
  subject: NoteAlbumKey,
  id: string,
  patch: { memo?: string; title?: string; rotation?: NoteRotation },
): Promise<NotePhoto | null> {
  return enqueueWrite(async () => {
    const index = await readIndex();
    const list = index[subject];
    const target = list?.find((p) => p.id === id);
    if (!list || !target) return null;
    if (patch.memo !== undefined) target.memo = patch.memo;
    // 제목을 비우면 파일명이 다시 제목이 되도록 필드 자체를 지운다.
    if (patch.title !== undefined) {
      if (patch.title) target.title = patch.title;
      else delete target.title;
    }
    if (patch.rotation !== undefined) target.rotation = patch.rotation;
    await writeIndex(index);
    log.info("요점정리 사진 수정", {
      subject,
      id,
      memoLen: patch.memo?.length,
      rotation: patch.rotation,
    });
    return target;
  });
}

/** 사진 1장 삭제 (인덱스 + 이미지 파일). 삭제 후 남은 목록을 반환. */
export async function deleteNote(subject: NoteAlbumKey, id: string): Promise<NotePhoto[]> {
  return enqueueWrite(async () => {
    const index = await readIndex();
    const list = index[subject] ?? [];
    const target = list.find((p) => p.id === id);
    if (!target) return list;

    index[subject] = list.filter((p) => p.id !== id);
    await writeIndex(index);
    // 인덱스에서 지운 뒤 파일 정리 — 파일 삭제가 실패해도 목록은 이미 정상이다.
    try {
      await fs.unlink(imagePath(subject, id, extOf(target)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn("이미지 파일 삭제 실패 — 인덱스는 정리됨", { subject, id, error: String(e) });
      }
    }
    log.info("요점정리 사진 삭제", { subject, id, remaining: index[subject]?.length ?? 0 });
    return index[subject] ?? [];
  });
}

/**
 * 앨범 내 사진 순서를 orderedIds 순서로 재배치한다.
 *
 * orderedIds가 현재 앨범의 id 집합과 **정확히 일치**할 때만 반영하고, 아니면 null을
 * 반환한다(라우트가 409로 응답). 다른 탭에서 사진을 지우거나 추가한 뒤 오래된 순서를
 * 보내오면 그대로 적용했을 때 사진이 사라지거나 되살아나기 때문이다.
 */
export async function reorderNotes(
  subject: NoteAlbumKey,
  orderedIds: string[],
): Promise<NotePhoto[] | null> {
  return enqueueWrite(async () => {
    const index = await readIndex();
    const list = index[subject] ?? [];
    if (orderedIds.length !== list.length) return null;

    const byId = new Map(list.map((p) => [p.id, p]));
    const reordered: NotePhoto[] = [];
    for (const id of orderedIds) {
      const photo = byId.get(id);
      // 없는 id거나 같은 id가 두 번 오면 중단 (집합 불일치).
      if (!photo || reordered.some((p) => p.id === id)) return null;
      reordered.push(photo);
    }

    index[subject] = reordered;
    await writeIndex(index);
    log.info("요점정리 순서 변경", { subject, count: reordered.length });
    return reordered;
  });
}

/** 사진 바이너리 조회 (없으면 null). 조회 라우트가 Content-Type을 붙여 그대로 내보낸다. */
export async function readNoteImage(
  subject: NoteAlbumKey,
  id: string,
): Promise<{ data: Buffer; mime: string } | null> {
  const index = await readIndex();
  const target = (index[subject] ?? []).find((p) => p.id === id);
  if (!target) return null;
  try {
    const data = await fs.readFile(imagePath(subject, id, extOf(target)));
    return { data, mime: target.mime };
  } catch (e) {
    log.warn("이미지 파일 읽기 실패", { subject, id, error: String(e) });
    return null;
  }
}
