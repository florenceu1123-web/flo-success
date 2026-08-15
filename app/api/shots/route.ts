import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/api/shots");

/**
 * 「랜덤문제 풀기」용 기출 스샷 아카이브 API.
 *
 *  GET /api/shots            → 인덱스(JSON): 연도·트랙·번호로 분류된 목록
 *  GET /api/shots?f=<파일명>&d=q|a → 이미지 원본(바이트)
 *
 * ★ 스샷 폴더는 프로젝트 밖(바탕화면)에 있다. 경로는 .env로 바꿀 수 있게 두되
 *   **화이트리스트된 두 폴더 밖은 절대 읽지 않는다**(경로 탈출 차단).
 */
const SHOTS_DIR = process.env.SHOTS_DIR ?? "C:/Users/USER/Desktop/전공 스샷";
const ANSWERS_DIR = process.env.SHOTS_ANSWER_DIR ?? "C:/Users/USER/Desktop/전공스샷답안";

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

export type ShotItem = {
  file: string;
  label: string;
  group: string;
  year: number | null;
  /** 전기와 전자는 **다른 시험 트랙**이라 반드시 구분한다. */
  track: "전기" | "전자" | null;
  section: "A" | "B" | null;
  sort: number;
  ans: string | null;
};

/**
 * 파일명 → 메타데이터.
 *   "2009 A-24.png"      → 2009 · 전자 · A · 24
 *   "2007-15.png"        → 2007 · 전자 · (구분 없음) · 15
 *   "2021 전기 A-12.png" → 2021 · 전기 · A · 12   ← 띄어쓰기가 들쭉날쭉("2023 전기A-2")
 *   그 외: D-*, P-*(교재) / 교육학* / 통신*
 */
function buildIndex(): { groups: string[]; items: ShotItem[]; orphanAnswers: string[] } {
  const answerFiles = listing(ANSWERS_DIR);
  const answers = new Map(answerFiles.map((f) => [norm(stemOf(f)), f]));

  const items: ShotItem[] = [];
  for (const file of listing(SHOTS_DIR)) {
    const stem = stemOf(file);
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

    items.push({
      file, label, group, year, track, section,
      sort: (track === "전기" ? 1e4 : 0) + (section === "B" ? 1e3 : 0) + n, // 전자→전기, A→B
      ans: answers.get(norm(stem)) ?? null,
    });
  }

  const rank = (g: string) =>
    /^\d{4}$/.test(g) ? 0 : g === "교육학" ? 1 : g === "통신" ? 2 : g.endsWith("교재") ? 3 : 4;
  const groups = [...new Set(items.map((i) => i.group))].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    return /^\d{4}$/.test(a) ? Number(b) - Number(a) : a.localeCompare(b, "ko");
  });
  items.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.sort - b.sort);

  const qStems = new Set(items.map((i) => norm(stemOf(i.file))));
  const orphanAnswers = answerFiles.filter((f) => !qStems.has(norm(stemOf(f))));

  return { groups, items, orphanAnswers };
}

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("f");

  // ── 이미지 원본 ──
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
  const idx = buildIndex();
  log.info("shots_index", {
    items: idx.items.length,
    groups: idx.groups.length,
    withAnswer: idx.items.filter((i) => i.ans).length,
    dir: SHOTS_DIR,
  });
  if (!idx.items.length) {
    return NextResponse.json(
      { ...idx, warning: `스샷 폴더가 비어 있거나 찾을 수 없습니다: ${SHOTS_DIR}` },
      { status: 200 },
    );
  }
  return NextResponse.json(idx);
}
