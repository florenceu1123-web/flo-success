import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { listNotes } from "@/lib/noteStore";
import { noteAlbumLabel, notePhotoTitle, type NoteAlbumKey } from "@/types/notes";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/api/shots");

/**
 * 「랜덤문제 풀기」용 문항 아카이브 API.
 *
 *  GET /api/shots            → 인덱스(JSON): 연도·트랙·번호로 분류된 목록
 *  GET /api/shots?f=<파일명>&d=q|a → 이미지 원본(바이트)  ※ 바탕화면 스샷 전용
 *
 * ★ 출처가 **두 곳**이다.
 *   1. `shot` — 바탕화면 `전공 스샷` 폴더(기출 원본). 이미지는 이 라우트가 직접 서빙한다.
 *   2. `note` — 사진첩의 **생성문제 보관함**(`data/notes/<album>/`). 이미지는 이미 있는
 *      `/api/notes/image`가 서빙하므로 여기서는 URL만 만들어 준다.
 *   화면은 출처를 `src`로 구분해 필터링하고, 이미지는 항상 `qPages`·`aPages`의 URL을 쓴다.
 *
 * ★ 스샷 폴더는 프로젝트 밖(바탕화면)에 있다. 경로는 .env로 바꿀 수 있게 두되
 *   **화이트리스트된 두 폴더 밖은 절대 읽지 않는다**(경로 탈출 차단).
 */
const SHOTS_DIR = process.env.SHOTS_DIR ?? "C:/Users/USER/Desktop/전공 스샷";
const ANSWERS_DIR = process.env.SHOTS_ANSWER_DIR ?? "C:/Users/USER/Desktop/전공스샷답안";

/**
 * 랜덤문제 풀에 함께 넣을 **사진첩 앨범**.
 * ★ 앨범을 추가·제외하려면 이 배열만 고치면 된다 — 파싱·짝짓기·화면은 앨범 수와 무관하게 동작한다.
 *   (`flo_mock_exam`은 모의고사 묶음이라 기본에서 뺐다. 넣고 싶으면 여기에 한 줄 추가.)
 */
const NOTE_ALBUMS: NoteAlbumKey[] = ["generated_qa"];

// 파일 시스템 접근 — 항상 동적 실행 (캐시 금지).
export const dynamic = "force-dynamic";

const IMG = /\.(png|jpe?g|gif|webp)$/i;
const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp",
};

const listing = (dir: string): string[] => {
  try {
    return readdirSync(dir).filter((f) => IMG.test(f));
  } catch {
    return [];
  }
};

const stemOf = (f: string) => basename(f, extname(f)).trim();
/** 답안 매칭용 정규화 — 공백 표기가 흔들려도("전기 A" vs "전기A") 붙도록 공백을 지운다. */
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 이미지 한 장(문제·답안이 여러 장으로 나뉘는 경우가 있어 항상 배열로 다룬다). */
export type ShotPage = {
  url: string;
  /** 사진첩의 표시 회전각(도). 스샷은 항상 0. */
  rotation: number;
};

export type ShotItem = {
  /** 목록·풀이기록의 고유 키. 스샷은 파일명, 사진첩은 `note:<앨범>:<id>`. */
  file: string;
  label: string;
  group: string;
  year: number | null;
  /** 전기와 전자는 **다른 시험 트랙**이라 반드시 구분한다. */
  track: "전기" | "전자" | null;
  section: "A" | "B" | null;
  sort: number;
  /** 답안 식별자(있으면 "답안 있음"). 실제 표시는 `aPages`를 쓴다. */
  ans: string | null;
  /** 출처 — `shot`=바탕화면 기출 스샷, `note`=사진첩 생성문제 보관함. */
  src: "shot" | "note";
  /** 출처를 화면에 적어 줄 이름(사진첩이면 앨범 이름). */
  srcLabel: string;
  qPages: ShotPage[];
  aPages: ShotPage[];
};

type StemMeta = {
  group: string;
  year: number | null;
  track: ShotItem["track"];
  section: ShotItem["section"];
  label: string;
  /** 같은 그룹 안에서의 정렬값. */
  sort: number;
};

/**
 * 파일명(확장자 뗀 것) → 메타데이터.
 *   "2009 A-24"      → 2009 · 전자 · A · 24
 *   "2007-15"        → 2007 · 전자 · (구분 없음) · 15
 *   "2021 전기 A-12" → 2021 · 전기 · A · 12   ← 띄어쓰기가 들쭉날쭉("2023 전기A-2")
 *   그 외: D-*, P-*(교재) / 교육학* / 통신*
 *
 * ★ 스샷과 사진첩이 **같은 규칙**을 쓴다 — 두 출처의 문항이 같은 연도 칩·트랙 필터에 잡혀야 한다.
 */
function parseStemMeta(stem: string): StemMeta {
  let group: string;
  let year: number | null = null;
  let track: ShotItem["track"] = null;
  let section: ShotItem["section"] = null;
  let num: string | null = null;
  let label = stem;

  const m = /^(\d{4})\s*(전기|전자)?\s*([AB])?\s*-\s*(.+)$/.exec(stem);
  if (m) {
    year = Number(m[1]);
    track = (m[2] as "전기" | "전자" | undefined) ?? "전자"; // 표기 없으면 전자(기본 트랙)
    section = (m[3] as "A" | "B" | undefined) ?? null;
    num = m[4];
    group = String(year);
    label = `${year} ${track}${section ? ` ${section}` : ""}-${num}`;
  } else if (/^교육학/.test(stem)) {
    group = "교육학";
    const y = /(\d{4})/.exec(stem);
    if (y) year = Number(y[1]);
  } else if (/^통신/.test(stem)) {
    group = "통신";
  } else if (/^[DP]-/i.test(stem)) {
    group = stem[0].toUpperCase() === "D" ? "D 교재" : "P 교재";
  } else {
    group = "기타";
  }

  const base = (num ?? stem).match(/[\d.]+/);
  const n = base ? parseFloat(base[0]) : 1e9;

  return {
    group, year, track, section, label,
    sort: (track === "전기" ? 1e4 : 0) + (section === "B" ? 1e3 : 0) + n, // 전자→전기, A→B
  };
}

// ─── 사진첩(생성문제 보관함) ──────────────────────────────────────────────

/**
 * 사진 제목에서 확장자와 끝의 장식 문자를 떼어 낸다.
 * ★ 확장자가 **두 번** 붙은 파일이 실제로 있다("2011 A-29 A1-2.png.jpg" — 실측) → 반복해서 벗긴다.
 */
function cleanStem(raw: string): string {
  let s = String(raw ?? "").trim();
  for (let i = 0; i < 3 && IMG.test(s); i += 1) s = s.replace(IMG, "").trim();
  return s.replace(/[!'"`~]+$/, "").trim();
}

/**
 * 제목 끝의 **문제/답안 마커**를 뜯어낸다.
 *   "2009-25 Q1"      → base "2009-25",   kind Q, no 1, page 1
 *   "2009-30 A-1"     → base "2009-30",   kind A, no 1, page 1
 *   "2011 A-29 A1-2"  → base "2011 A-29", kind A, no 1, page 2   ← 답안 2쪽
 *   "2022 B-6 A"      → base "2022 B-6",  kind A, no 1, page 1   ← 번호 생략
 *
 * ⚠️ 이 정규식만으로는 **답안 마커와 A형 문항번호를 구분할 수 없다**
 *   ("2009 A-30"도 base "2009" + A + 30으로 잡힌다). 그래서 호출부가
 *   "짝이 되는 Q(또는 기출 스샷)가 실제로 있는가"까지 확인한 뒤에만 답안으로 인정한다.
 */
const QA_MARK = /\s([QA])\s*-?\s*(\d*)(?:-(\d+))?$/i;

type Marked = { base: string; kind: "Q" | "A"; no: number; page: number } | null;

function parseMarker(stem: string): Marked {
  const m = QA_MARK.exec(stem);
  if (!m) return null;
  return {
    base: stem.slice(0, m.index).trim(),
    kind: m[1].toUpperCase() as "Q" | "A",
    no: m[2] ? Number(m[2]) : 1,
    page: m[3] ? Number(m[3]) : 1,
  };
}

const notePage = (album: NoteAlbumKey, id: string, rotation: number): ShotPage => ({
  url: `/api/notes/image?subject=${album}&id=${id}`,
  rotation,
});

type NoteEntry = {
  id: string;
  stem: string;
  mark: Marked;
  rotation: number;
};

/**
 * 사진첩 앨범 하나를 문항 목록으로 바꾼다.
 *
 * 분류 규칙 (실측 467장 기준):
 *   · `… Q<n>` → 문제. 같은 base·같은 n의 `… A<n>`이 답안이 된다(`A<n>-<p>`는 답안 <p>쪽).
 *   · `… A<n>` 인데 짝이 되는 Q가 없으면 → **기출 스샷 stem과 대조**해서 맞으면 그 기출의 답안으로 붙이고,
 *     그것도 아니면 마커가 아니라 A형 문항번호로 보고 **문제 그대로** 취급한다("2009 A-30").
 *   · 마커가 아예 없으면 → 문제.
 */
function buildNoteItems(
  album: NoteAlbumKey,
  entries: NoteEntry[],
  diskStems: Set<string>,
): { items: ShotItem[]; answersForDisk: Map<string, ShotPage[]>; skipped: number } {
  const albumLabel = noteAlbumLabel(album);
  const keyOf = (base: string, no: number) => `${norm(base)}#${no}`;

  // 1) 어떤 (base, no)에 문제(Q)가 있는지 먼저 모은다 — 답안 인정 여부의 판단 근거.
  const qKeys = new Set<string>();
  for (const e of entries) {
    if (e.mark?.kind === "Q") qKeys.add(keyOf(e.mark.base, e.mark.no));
  }

  // 2) 답안 페이지를 모은다.
  const answers = new Map<string, { page: number; shot: ShotPage }[]>();
  const answersForDisk = new Map<string, ShotPage[]>();
  const leftovers: NoteEntry[] = []; // 답안으로 인정 못 한 것 = 문제로 넘긴다
  for (const e of entries) {
    const mk = e.mark;
    if (!mk || mk.kind !== "A") {
      if (mk?.kind !== "Q") leftovers.push(e);
      continue;
    }
    const key = keyOf(mk.base, mk.no);
    if (qKeys.has(key)) {
      const list = answers.get(key) ?? [];
      list.push({ page: mk.page, shot: notePage(album, e.id, e.rotation) });
      answers.set(key, list);
      continue;
    }
    if (diskStems.has(norm(mk.base))) {
      // 기출 스샷의 답안이 사진첩에만 있는 경우 — 그 기출 문항에 붙여 준다.
      const list = answersForDisk.get(norm(mk.base)) ?? [];
      list.push(notePage(album, e.id, e.rotation));
      answersForDisk.set(norm(mk.base), list);
      continue;
    }
    leftovers.push(e); // "2009 A-30"처럼 마커가 아니라 문항번호였던 경우
  }

  // 3) 문제를 조립한다. Q 마커가 있는 것은 (base, no)로 묶어 여러 쪽을 한 문항으로 만든다.
  const problems = new Map<string, { base: string; no: number; pages: { page: number; entry: NoteEntry }[] }>();
  for (const e of entries) {
    if (e.mark?.kind !== "Q") continue;
    const key = keyOf(e.mark.base, e.mark.no);
    const p = problems.get(key) ?? { base: e.mark.base, no: e.mark.no, pages: [] };
    p.pages.push({ page: e.mark.page, entry: e });
    problems.set(key, p);
  }
  // 마커 없이 남은 것들은 제목 전체가 곧 한 문항이다.
  // ★ 단, 제목이 **기출 스샷과 같으면 그건 원본을 사진첩에 복사해 둔 것**이므로 건너뛴다
  //   (실측: "2011 B-3"·"2023 B-8"·"2025 전기 A-9" 등 — 안 거르면 같은 문제가 풀에 두 번 뜬다).
  let skipped = 0;
  for (const e of leftovers) {
    if (diskStems.has(norm(e.stem))) { skipped += 1; continue; }
    const key = `${norm(e.stem)}#solo`;
    const p = problems.get(key) ?? { base: e.stem, no: 1, pages: [] };
    p.pages.push({ page: 1, entry: e });
    problems.set(key, p);
  }

  // 같은 base에 문제가 여러 개면 라벨에 번호를 붙여 구분한다.
  const perBase = new Map<string, number>();
  for (const p of problems.values()) perBase.set(norm(p.base), (perBase.get(norm(p.base)) ?? 0) + 1);

  const items: ShotItem[] = [];
  for (const [key, p] of problems) {
    p.pages.sort((a, b) => a.page - b.page || a.entry.stem.localeCompare(b.entry.stem, "ko"));
    const meta = parseStemMeta(p.base);
    const many = (perBase.get(norm(p.base)) ?? 1) > 1;
    const aPages = (answers.get(key) ?? [])
      .sort((a, b) => a.page - b.page)
      .map((a) => a.shot);
    items.push({
      file: `note:${album}:${p.pages[0].entry.id}`,
      label: many ? `${meta.label} (${p.no})` : meta.label,
      group: meta.group,
      year: meta.year,
      track: meta.track,
      section: meta.section,
      // ★ 같은 번호의 기출 바로 뒤에 오도록 0.5를 더한다(문항이 여러 개면 0.01씩 벌린다).
      sort: meta.sort + 0.5 + (p.no - 1) * 0.01,
      ans: aPages.length ? `${album}:${key}` : null,
      src: "note",
      srcLabel: albumLabel,
      qPages: p.pages.map(({ entry }) => notePage(album, entry.id, entry.rotation)),
      aPages,
    });
  }

  // ★ 라벨 중복 제거 — 같은 base에 "Q1 문항"과 "마커 없는 문항"이 함께 있으면 라벨이 겹친다(실측).
  //   겹치는 뒤쪽에만 순번을 붙여 목록에서 서로 구분되게 한다.
  const used = new Map<string, number>();
  for (const it of items) {
    const n = (used.get(it.label) ?? 0) + 1;
    used.set(it.label, n);
    if (n > 1) it.label = `${it.label} ·${n}`;
  }

  return { items, answersForDisk, skipped };
}

// ─── 인덱스 ──────────────────────────────────────────────────────────────

async function buildIndex(): Promise<{
  groups: string[];
  items: ShotItem[];
  orphanAnswers: string[];
  counts: { shot: number; note: number; noteSkipped: number };
}> {
  const answerFiles = listing(ANSWERS_DIR);
  const answers = new Map(answerFiles.map((f) => [norm(stemOf(f)), f]));

  // ── 1. 바탕화면 기출 스샷 ──
  const shotFiles = listing(SHOTS_DIR);
  const diskStems = new Set(shotFiles.map((f) => norm(cleanStem(stemOf(f)))));

  // ── 2. 사진첩(생성문제 보관함) ──
  const noteItems: ShotItem[] = [];
  const noteAnswersForDisk = new Map<string, ShotPage[]>();
  let noteSkipped = 0;
  for (const album of NOTE_ALBUMS) {
    let photos: Awaited<ReturnType<typeof listNotes>>;
    try {
      photos = await listNotes(album);
    } catch (e) {
      log.warn("사진첩 앨범을 읽지 못했습니다 — 건너뜁니다", { album, error: String(e) });
      continue;
    }
    const entries: NoteEntry[] = photos.map((p) => {
      const stem = cleanStem(notePhotoTitle(p));
      return { id: p.id, stem, mark: parseMarker(stem), rotation: p.rotation ?? 0 };
    });
    const built = buildNoteItems(album, entries, diskStems);
    noteItems.push(...built.items);
    noteSkipped += built.skipped;
    for (const [k, v] of built.answersForDisk) {
      noteAnswersForDisk.set(k, [...(noteAnswersForDisk.get(k) ?? []), ...v]);
    }
  }

  // ── 3. 기출 스샷을 문항으로 (사진첩에만 있는 답안도 붙여 준다) ──
  const shotItems: ShotItem[] = [];
  for (const file of shotFiles) {
    const stem = stemOf(file);
    const meta = parseStemMeta(stem);
    const ans = answers.get(norm(stem)) ?? null;
    const extra = noteAnswersForDisk.get(norm(cleanStem(stem))) ?? [];
    const aPages: ShotPage[] = [
      ...(ans ? [{ url: `/api/shots?d=a&f=${encodeURIComponent(ans)}`, rotation: 0 }] : []),
      ...extra,
    ];
    shotItems.push({
      file,
      label: meta.label,
      group: meta.group,
      year: meta.year,
      track: meta.track,
      section: meta.section,
      sort: meta.sort,
      ans: ans ?? (extra.length ? `note:${norm(stem)}` : null),
      src: "shot",
      srcLabel: "기출 스샷",
      qPages: [{ url: `/api/shots?d=q&f=${encodeURIComponent(file)}`, rotation: 0 }],
      aPages,
    });
  }

  const items = [...shotItems, ...noteItems];

  const rank = (g: string) =>
    /^\d{4}$/.test(g) ? 0 : g === "교육학" ? 1 : g === "통신" ? 2 : g.endsWith("교재") ? 3 : 4;
  const groups = [...new Set(items.map((i) => i.group))].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    return /^\d{4}$/.test(a) ? Number(b) - Number(a) : a.localeCompare(b, "ko");
  });
  items.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.sort - b.sort);

  // 문제 스샷이 없는 답안 — 사진첩 문항이 가져간 것은 빼고 알린다.
  const qStems = new Set(shotItems.map((i) => norm(stemOf(i.file))));
  const orphanAnswers = answerFiles.filter((f) => !qStems.has(norm(stemOf(f))));

  return {
    groups,
    items,
    orphanAnswers,
    counts: { shot: shotItems.length, note: noteItems.length, noteSkipped },
  };
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("f");

  // ── 이미지 원본 (바탕화면 스샷 전용 — 사진첩은 /api/notes/image가 서빙한다) ──
  if (file) {
    const dir = req.nextUrl.searchParams.get("d") === "a" ? ANSWERS_DIR : SHOTS_DIR;
    // ★ 경로 탈출 차단 — 파일명만 받고, 실제 경로가 화이트리스트 폴더 안인지 다시 확인한다.
    const name = basename(file);
    if (!IMG.test(name)) return NextResponse.json({ error: "이미지 파일만 조회할 수 있습니다." }, { status: 400 });
    const full = resolve(join(dir, name));
    if (!full.startsWith(resolve(dir))) {
      return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 400 });
    }
    try {
      const buf = await readFile(full);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": MIME[extname(name).toLowerCase()] ?? "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: `파일을 찾을 수 없습니다: ${name}` }, { status: 404 });
    }
  }

  // ── 인덱스 ──
  const idx = await buildIndex();
  log.info("shots_index", {
    items: idx.items.length,
    shot: idx.counts.shot,
    note: idx.counts.note,
    noteSkippedAsDuplicate: idx.counts.noteSkipped,
    groups: idx.groups.length,
    withAnswer: idx.items.filter((i) => i.aPages.length).length,
    dir: SHOTS_DIR,
    albums: NOTE_ALBUMS,
  });
  if (!idx.items.length) {
    return NextResponse.json(
      { ...idx, warning: `문항을 찾을 수 없습니다. 스샷 폴더(${SHOTS_DIR})와 사진첩을 확인해 주세요.` },
      { status: 200 },
    );
  }
  return NextResponse.json(idx);
}
