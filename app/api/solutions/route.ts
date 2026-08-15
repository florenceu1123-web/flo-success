import { NextRequest, NextResponse } from "next/server";
import { getSolution, putSolution, deleteSolution, type SavedGeneratedShot } from "@/lib/solutionStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/solutions");

/** 보관함 상한 — data URL을 JSON 파일에 담으므로 무한정 쌓이면 파일이 비대해진다. */
const MAX_GENERATED = 20;

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
      /** 이 본문으로 생성했던 문제 스샷 보관함(보내면 통째로 교체, 안 보내면 기존 유지). */
      generated?: SavedGeneratedShot[];
    };
    const { key } = body;
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "key가 필요합니다." }, { status: 400 });
    }
    const imageData = typeof body.imageData === "string" ? body.imageData : "";
    const memo = typeof body.memo === "string" ? body.memo : "";
    const generated = Array.isArray(body.generated)
      ? body.generated
          .filter((g) => g && typeof g.imageData === "string" && g.imageData.startsWith("data:image/"))
          .slice(0, MAX_GENERATED)
      : undefined;
    // 셋 중 하나라도 있으면 저장 대상 — 보관함만 채운 경우도 허용한다.
    if (!imageData && !memo.trim() && !generated?.length) {
      return NextResponse.json({ error: "저장할 사진·메모·생성 문제가 필요합니다." }, { status: 400 });
    }
    const imageName = typeof body.imageName === "string" ? body.imageName : "solution.png";
    const record = await putSolution(key, { imageData, imageName, memo, generated });
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
