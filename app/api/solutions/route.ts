import { NextRequest, NextResponse } from "next/server";
import { getSolution, putSolution, deleteSolution } from "@/lib/solutionStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/solutions");

// 파일 시스템 접근 — 항상 동적 실행 (캐시 금지).
export const dynamic = "force-dynamic";

/** GET /api/solutions?key=... — 저장된 원본 풀이 조회. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key가 필요합니다." }, { status: 400 });
  }
  try {
    const record = await getSolution(key);
    return NextResponse.json({ solution: record });
  } catch (e) {
    log.error("조회 실패", { error: String(e) });
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** POST /api/solutions — { key, imageData, imageName, memo } 저장 (풀이·정답 사진 + 오답 메모). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      key?: string;
      imageData?: string;
      imageName?: string;
      memo?: string;
    };
    const { key } = body;
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "key가 필요합니다." }, { status: 400 });
    }
    const imageData = typeof body.imageData === "string" ? body.imageData : "";
    const memo = typeof body.memo === "string" ? body.memo : "";
    if (!imageData && !memo.trim()) {
      return NextResponse.json({ error: "저장할 사진이나 메모가 필요합니다." }, { status: 400 });
    }
    const imageName = typeof body.imageName === "string" ? body.imageName : "solution.png";
    const record = await putSolution(key, { imageData, imageName, memo });
    return NextResponse.json({ solution: record });
  } catch (e) {
    log.error("저장 실패", { error: String(e) });
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** DELETE /api/solutions?key=... — 저장된 원본 풀이 삭제. */
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key가 필요합니다." }, { status: 400 });
  }
  try {
    await deleteSolution(key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("삭제 실패", { error: String(e) });
    return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
