import { NextRequest, NextResponse } from "next/server";
import {
  listNotes,
  addNotes,
  updateNote,
  deleteNote,
  reorderNotes,
  countNotesBySubject,
  isSubjectKey,
  isNoteId,
  type IncomingNote,
} from "@/lib/noteStore";
import {
  NOTE_MIME_EXT,
  NOTE_MAX_BYTES,
  NOTE_MAX_FILES_PER_UPLOAD,
  NOTE_ROTATIONS,
  type NoteRotation,
} from "@/types/notes";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/notes");

// 파일 시스템 접근 — 항상 동적 실행 (캐시 금지).
export const dynamic = "force-dynamic";

/** GET /api/notes?subject=... — 해당 과목 사진 목록 + 전 과목 장수 집계. */
export async function GET(req: NextRequest) {
  const subject = req.nextUrl.searchParams.get("subject");
  if (!isSubjectKey(subject)) {
    return NextResponse.json({ error: "유효한 subject가 필요합니다." }, { status: 400 });
  }
  try {
    const [notes, counts] = await Promise.all([listNotes(subject), countNotesBySubject()]);
    return NextResponse.json({ notes, counts });
  } catch (e) {
    log.error("목록 조회 실패", { error: String(e) });
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * POST /api/notes — multipart/form-data 로 사진 여러 장 업로드.
 * 필드: subject(과목 키), files(이미지 파일 N개).
 *
 * base64 JSON이 아니라 multipart를 쓰는 이유 — 사진첩은 한 번에 수십 장이 올라올 수
 * 있는데 base64는 용량이 33% 늘고 문자열 파싱 비용도 크다.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const subject = form.get("subject");
    if (!isSubjectKey(subject)) {
      return NextResponse.json({ error: "유효한 subject가 필요합니다." }, { status: 400 });
    }

    const entries = form.getAll("files").filter((f): f is File => f instanceof File);
    if (entries.length === 0) {
      return NextResponse.json({ error: "업로드할 사진이 없습니다." }, { status: 400 });
    }
    if (entries.length > NOTE_MAX_FILES_PER_UPLOAD) {
      return NextResponse.json(
        { error: `한 번에 최대 ${NOTE_MAX_FILES_PER_UPLOAD}장까지 올릴 수 있습니다.` },
        { status: 400 },
      );
    }

    // 형식·용량 위반은 그 파일만 걸러내고 나머지는 저장 — 여러 장 중 하나 때문에
    // 전체 업로드가 실패하면 어느 것이 문제인지 알기 어렵다.
    const accepted: IncomingNote[] = [];
    const rejected: string[] = [];
    for (const file of entries) {
      if (!NOTE_MIME_EXT[file.type]) {
        rejected.push(`${file.name}: 지원하지 않는 형식(${file.type || "알 수 없음"})`);
        continue;
      }
      if (file.size > NOTE_MAX_BYTES) {
        rejected.push(`${file.name}: 용량 초과(${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }
      accepted.push({
        fileName: file.name,
        mime: file.type,
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }

    if (accepted.length === 0) {
      return NextResponse.json(
        { error: `업로드할 수 있는 사진이 없습니다. ${rejected.join(" / ")}` },
        { status: 400 },
      );
    }

    const notes = await addNotes(subject, accepted);
    return NextResponse.json({ notes, added: accepted.length, rejected });
  } catch (e) {
    log.error("업로드 실패", { error: String(e) });
    return NextResponse.json({ error: "업로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * PATCH /api/notes — { subject, id, memo?, rotation? } 사진 설명·회전 수정.
 * 보낸 필드만 바뀐다 (회전만 보내면 설명은 유지).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      subject?: string;
      id?: string;
      memo?: string;
      rotation?: unknown;
    };
    const { subject, id } = body;
    if (!isSubjectKey(subject)) {
      return NextResponse.json({ error: "유효한 subject가 필요합니다." }, { status: 400 });
    }
    if (!isNoteId(id)) {
      return NextResponse.json({ error: "유효한 id가 필요합니다." }, { status: 400 });
    }
    if (body.rotation !== undefined && !NOTE_ROTATIONS.includes(body.rotation as NoteRotation)) {
      return NextResponse.json(
        { error: `rotation은 ${NOTE_ROTATIONS.join("·")} 중 하나여야 합니다.` },
        { status: 400 },
      );
    }
    if (body.memo === undefined && body.rotation === undefined) {
      return NextResponse.json({ error: "수정할 항목이 없습니다." }, { status: 400 });
    }

    const note = await updateNote(subject, id, {
      memo: typeof body.memo === "string" ? body.memo : undefined,
      rotation: body.rotation as NoteRotation | undefined,
    });
    if (!note) {
      return NextResponse.json({ error: "해당 사진을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ note });
  } catch (e) {
    log.error("메모 수정 실패", { error: String(e) });
    return NextResponse.json({ error: "수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * PUT /api/notes — { subject, order: string[] } 앨범 순서 재배치.
 * order는 그 앨범의 전체 id를 새 순서대로 담아야 한다(부분 갱신 아님).
 */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { subject?: string; order?: unknown };
    const { subject } = body;
    if (!isSubjectKey(subject)) {
      return NextResponse.json({ error: "유효한 subject가 필요합니다." }, { status: 400 });
    }
    const order = body.order;
    if (!Array.isArray(order) || !order.every(isNoteId)) {
      return NextResponse.json({ error: "order는 id 배열이어야 합니다." }, { status: 400 });
    }

    const notes = await reorderNotes(subject, order);
    if (!notes) {
      // 목록이 그새 바뀐 경우 — 최신 목록을 함께 돌려줘 클라이언트가 다시 그리게 한다.
      const current = await listNotes(subject);
      return NextResponse.json(
        { error: "목록이 변경되어 순서를 적용하지 못했습니다.", notes: current },
        { status: 409 },
      );
    }
    return NextResponse.json({ notes });
  } catch (e) {
    log.error("순서 변경 실패", { error: String(e) });
    return NextResponse.json({ error: "순서 변경 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** DELETE /api/notes?subject=...&id=... — 사진 1장 삭제. */
export async function DELETE(req: NextRequest) {
  const subject = req.nextUrl.searchParams.get("subject");
  const id = req.nextUrl.searchParams.get("id");
  if (!isSubjectKey(subject)) {
    return NextResponse.json({ error: "유효한 subject가 필요합니다." }, { status: 400 });
  }
  if (!isNoteId(id)) {
    return NextResponse.json({ error: "유효한 id가 필요합니다." }, { status: 400 });
  }
  try {
    const notes = await deleteNote(subject, id);
    return NextResponse.json({ notes });
  } catch (e) {
    log.error("삭제 실패", { error: String(e) });
    return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
