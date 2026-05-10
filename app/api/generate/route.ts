import { NextRequest, NextResponse } from "next/server";
import { GenerateError } from "@/lib/generation/_core";
import { generateVariant } from "@/lib/generation";
import { generateSimilar } from "@/lib/mutation";
import { resolveRules } from "@/lib/rules";
import { validateProblem, validateFigures, type ValidationResult } from "@/lib/validators";
import { createLogger } from "@/lib/logger";
import {
  GENERATION_POLICIES,
  SUBJECT_KEYS,
  type AnalysisResult,
  type GenerationMode,
  type SemanticStructure,
  type SubjectKey,
  type TopicKey,
} from "@/types";

const log = createLogger("api/generate");

const DEFAULT_SEMANTIC: SemanticStructure = {
  hasStateTransition: false,
  hasEquivalentTransformation: false,
  hasWaveformEvolution: false,
  requiresMultiFigure: false,
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      image?: string;
      subject?: string;
      mode?: string;
      count?: number;
      analysis?: AnalysisResult | null;
      topicKey?: TopicKey;
      semantic?: SemanticStructure;
    };
    const { image, subject, mode, count, analysis } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "image(base64)가 필요합니다." }, { status: 400 });
    }
    if (!subject || !SUBJECT_KEYS.includes(subject as SubjectKey)) {
      return NextResponse.json({ error: `subject는 ${SUBJECT_KEYS.join("/")} 중 하나여야 합니다.` }, { status: 400 });
    }
    if (!mode || !(mode in GENERATION_POLICIES)) {
      return NextResponse.json({ error: "mode는 exam_similar 또는 exam_variant여야 합니다." }, { status: 400 });
    }
    const n = typeof count === "number" && count > 0 ? Math.min(Math.floor(count), 10) : 1;

    // analysis에서 topicKey/semantic을 우선 활용 (body의 명시 값이 있으면 그것 우선)
    const expectedTopicKey: TopicKey | undefined = body.topicKey ?? analysis?.topicKey;
    const expectedSemantic: SemanticStructure = body.semantic ?? analysis?.semantic ?? DEFAULT_SEMANTIC;

    const subjectKey = subject as SubjectKey;
    const ruleSet = resolveRules({ subject: subjectKey, topicKey: expectedTopicKey, semantic: expectedSemantic });

    const fn = (mode as GenerationMode) === "exam_similar" ? generateSimilar : generateVariant;
    const problems = await fn({
      image,
      subject: subjectKey,
      count: n,
      analysis: analysis ?? null,
      topicKey: expectedTopicKey,
      semantic: expectedSemantic,
    });

    // 검증 (Pipeline 6단계)
    const validations: Array<{ problemId: string; problem: ValidationResult; figures: ValidationResult }> = [];
    let totalIssues = 0;
    for (const p of problems) {
      const pv = validateProblem({
        problem: p,
        expected: { subject: subjectKey, topicKey: expectedTopicKey, ruleSet },
      });
      const fv = validateFigures(p.figureVariants ?? []);
      validations.push({ problemId: p.id, problem: pv, figures: fv });
      totalIssues += pv.issues.length + fv.issues.length;
    }
    log.info("validation", { mode, returned: problems.length, totalIssues });

    return NextResponse.json({
      problems,
      mode,
      ruleSet,
      validations,
      summary: { problems: problems.length, totalIssues },
    });
  } catch (e) {
    if (e instanceof GenerateError) {
      log.error("GenerateError", { message: e.message });
      return NextResponse.json({ error: `생성 실패: ${e.message}` }, { status: 502 });
    }
    log.error("처리 중 오류", { error: (e as Error).message });
    return NextResponse.json({ error: "문제 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}

