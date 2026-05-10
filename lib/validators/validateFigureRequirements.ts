import type { AnalysisResult, FigureVariant } from "@/types";
import { expandFigureRequirements } from "@/lib/analysis/figureRequirements";

/**
 * analysis.figureRequirements (expanded)을 candidate가 모두 충족하는지 검사.
 * 각 expanded requirement에 대해 일치하는 figure가 있는지 확인:
 *  - diagramType 일치
 *  - role 일치
 *  - target(있으면) 매칭 (label에 포함되거나 fig.target/output/diagram.output 비교)
 */
export function validateFigureRequirements(
  analysis: AnalysisResult,
  candidate: { figureVariants?: FigureVariant[] | null },
): { ok: boolean; errors: string[]; severity: "critical" | "ok" } {
  const errors: string[] = [];
  const figures: FigureVariant[] = candidate.figureVariants ?? [];
  const expanded = expandFigureRequirements(analysis);

  for (const req of expanded) {
    if (!req.required) continue;

    const found = figures.some((fig) => {
      const typeOk = fig.diagramType === req.diagramType;
      const roleOk = fig.role === req.role;

      const reqHasTarget = "target" in req && req.target !== undefined;
      const targetVal = reqHasTarget && typeof req.target === "string" ? req.target : undefined;
      const targetOk =
        !reqHasTarget ||
        (targetVal !== undefined &&
          ((fig as unknown as Record<string, unknown>).target === targetVal ||
            (fig as unknown as Record<string, unknown>).output === targetVal ||
            (fig.diagram as Record<string, unknown> | null | undefined)?.output === targetVal ||
            String(fig.label ?? "").includes(targetVal)));

      return typeOk && roleOk && targetOk;
    });

    if (!found) {
      const targetLabel = "target" in req
        ? Array.isArray(req.target) ? req.target.join("+") : (req.target ?? "single")
        : "single";
      errors.push(
        `필수 figure 누락: role=${req.role}, type=${req.diagramType}, target=${targetLabel}`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    severity: errors.length ? "critical" : "ok",
  };
}
