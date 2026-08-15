import { NextRequest, NextResponse } from "next/server";
import { readNoteImage, isNoteAlbum, isNoteId } from "@/lib/noteStore";

// 파일 시스템 접근 — 항상 동적 실행 (캐시 금지).
export const dynamic = "force-dynamic";

/**
 * GET /api/notes/image?subject=...&id=... — 요점정리 사진 원본 바이너리.
 *
 * <img src>가 직접 물고 가는 경로다. subject·id는 파일 경로가 되므로
 * noteStore의 화이트리스트 검사를 반드시 통과시킨 뒤 사용한다.
 */
export async function GET(req: NextRequest) {
  const subject = req.nextUrl.searchParams.get("subject");
  const id = req.nextUrl.searchParams.get("id");
  if (!isNoteAlbum(subject) || !isNoteId(id)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const image = await readNoteImage(subject, id);
  if (!image) {
    return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      // 사진은 내용이 바뀌지 않고 id가 곧 버전이므로 브라우저 캐시를 길게 잡는다.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
