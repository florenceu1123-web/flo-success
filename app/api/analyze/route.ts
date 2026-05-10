import { NextRequest, NextResponse } from "next/server";
import { analyzeImage, AnalyzeError } from "@/lib/analysis/analyzeImage";
import { compactAnalysis } from "@/lib/analysis/compactAnalysis";
import { createLogger } from "@/lib/logger";
import { SUBJECT_KEYS, type SubjectKey } from "@/types";

const log = createLogger("api/analyze");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { image?: string; subject?: string };
    const { image, subject } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "image(base64)가 필요합니다." }, { status: 400 });
    }
    if (!subject || !SUBJECT_KEYS.includes(subject as SubjectKey)) {
      return NextResponse.json({ error: `subject는 ${SUBJECT_KEYS.join("/")} 중 하나여야 합니다.` }, { status: 400 });
    }

    const analysis = await analyzeImage({ image, subject: subject as SubjectKey });
    const compact = compactAnalysis(analysis);
    return NextResponse.json(compact);
  } catch (e) {
    if (e instanceof AnalyzeError) {
      log.error("AnalyzeError", { message: e.message });
      return NextResponse.json({ error: `분석 실패: ${e.message}` }, { status: 502 });
    }
    log.error("처리 중 오류", { error: (e as Error).message });
    return NextResponse.json({ error: "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
