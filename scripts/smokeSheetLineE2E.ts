/**
 * 면전류 + 선전류 합성 자계 — E2E (pipeline → validator) 스모크.
 *   route.ts electromagnetics 분기를 모사: runElectromagneticsPipeline 후
 *   expectedTopicKey = problems[0].topicKey 재조정 → validateProblem/validateFigures.
 *   양 모드 totalIssues=0 확인.
 *
 *   실행: npx tsx scripts/smokeSheetLineE2E.ts
 */
import { runElectromagneticsPipeline } from "../lib/pipeline/runElectromagneticsPipeline";
import { validateProblem, validateFigures } from "../lib/validators";
import { resolveRules } from "../lib/rules";
import type { AnalysisResult, GenerationMode } from "../types";

const analysis: AnalysisResult = {
  topic: "무한 면전류와 무한 선전류에 의한 합성 자계",
  interpretation:
    "10a_x [A/m]의 면전류가 (0,0,6)을 지나 xy평면과 평행한 무한 평면에 흐르고, 20π a_x [A]의 선전류가 (0,3,0)을 지나 x축과 나란한 무한 도선에 흐른다. 점 P(-3,2,h)에서 면전류에 의한 자계 H₁과 선전류에 의한 자계 H₂의 합성 자계 H₁+H₂ = k a_z가 되기 위한 h와 k를 구한다.",
  relatedConcepts: ["면전류", "선전류", "합성 자계", "정자계", "단위 벡터"],
  topicKey: "magnetostatics",
} as unknown as AnalysisResult;

let pass = 0, fail = 0;
async function run(mode: GenerationMode) {
  const problems = await runElectromagneticsPipeline({ analysis, mode, count: 3 });
  let expectedTopicKey = problems[0]?.topicKey;
  const ruleSet = resolveRules({
    subject: "electromagnetics",
    topicKey: expectedTopicKey,
    semantic: { hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: false, requiresMultiFigure: false },
    text: `${analysis.topic}\n${analysis.interpretation}`,
  });
  problems.forEach((p, i) => {
    const vP = validateProblem({ problem: p, expected: { subject: "electromagnetics", topicKey: expectedTopicKey, ruleSet } });
    const vF = validateFigures(p.figureVariants ?? []);
    const total = vP.issues.length + vF.issues.length;
    const ok = total === 0;
    console.log(`  ${ok ? "✓" : "✗"} [${mode} #${i + 1}] totalIssues=${total} topicKey=${p.topicKey}` +
      (ok ? "" : ` :: ${[...vP.issues, ...vF.issues].map((x) => x.rule).join(", ")}`));
    ok ? pass++ : fail++;
  });
}

(async () => {
  await run("exam_similar");
  await run("exam_variant");
  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
