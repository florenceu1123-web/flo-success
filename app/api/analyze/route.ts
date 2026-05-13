import { NextRequest, NextResponse } from "next/server";
import { analyzeImage, AnalyzeError } from "@/lib/analysis/analyzeImage";
import { extractComponentInventory } from "@/lib/analysis/extractComponentInventory";
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
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

    // analyzeImage(전체) + extractComponentInventory(독립 vision 호출) 병렬 수행.
    // inventory가 잡은 type별 개수가 floor로 generate에 강제됨 — analyze branches가 일부 component 놓쳐도 보강.
    const [analysis, inventory] = await Promise.all([
      analyzeImage({ image, subject: subject as SubjectKey }),
      extractComponentInventory({ image }).catch((e) => {
        log.warn("inventory_extraction_failed", { message: (e as Error).message });
        return [] as Awaited<ReturnType<typeof extractComponentInventory>>;
      }),
    ]);

    const compact = compactAnalysis(analysis);
    const withInventory = inventory.length > 0
      ? { ...compact, componentInventory: inventory }
      : compact;

    // circuit_type 분류 — 추가 GPT 호출 없이 derive
    const circuitType = classifyCircuitType(withInventory, subject as SubjectKey);
    log.info("circuit_type_classified", { type: circuitType.type, confidence: circuitType.confidence });

    return NextResponse.json({ ...withInventory, circuitType });
  } catch (e) {
    if (e instanceof AnalyzeError) {
      log.error("AnalyzeError", { message: e.message });
      return NextResponse.json({ error: `분석 실패: ${e.message}` }, { status: 502 });
    }
    log.error("처리 중 오류", { error: (e as Error).message });
    return NextResponse.json({ error: "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
