import type {
  AnalysisResult,
  FigureVariant,
  GenerationMode,
  LogicStructureSignature,
  StructureSignature,
} from "@/types";

type CandidateProblem = { figureVariants?: FigureVariant[] | null };

/**
 * candidate 회로 구조의 시그니처를 추출.
 *  - logic_network들의 gate 종류별 카운트
 *  - analog_netlist들의 component 종류별 카운트
 *  - figure 개수, input/output 개수
 */
export function extractCandidateSignature(candidate: CandidateProblem) {
  const figs = candidate.figureVariants ?? [];
  const sig: StructureSignature = {
    inputCount: 0,
    outputCount: 0,
    figureCount: figs.length,
    componentCounts: {},
    gateCounts: {},
    totalComponentCount: 0,
    totalGateCount: 0,
    blankCount: 0,
  };

  for (const f of figs) {
    if (f.diagramType === "logic_network") {
      const d = f.diagram as {
        inputs?: string[];
        outputs?: string[];
        gates?: Array<{ type?: string }>;
        blanks?: Array<{ symbol?: string }>;
      } | null | undefined;
      sig.inputCount = Math.max(sig.inputCount, (d?.inputs ?? []).length);
      sig.outputCount = Math.max(sig.outputCount, (d?.outputs ?? []).length);
      for (const g of d?.gates ?? []) {
        const t = (g.type ?? "").toUpperCase();
        sig.gateCounts![t] = (sig.gateCounts![t] ?? 0) + 1;
        sig.totalGateCount = (sig.totalGateCount ?? 0) + 1;
      }
      // distinct blank symbol 카운트 (shared group은 1로)
      const symbols = new Set<string>();
      for (const b of d?.blanks ?? []) if (b.symbol) symbols.add(b.symbol);
      sig.blankCount = (sig.blankCount ?? 0) + symbols.size;
    } else if (f.diagramType === "analog_netlist") {
      const d = f.diagram as { components?: Array<{ type?: string; pins?: unknown[] }> } | null | undefined;
      for (const c of d?.components ?? []) {
        const t = (c.type ?? "").toUpperCase();
        sig.componentCounts![t] = (sig.componentCounts![t] ?? 0) + 1;
        sig.totalComponentCount = (sig.totalComponentCount ?? 0) + 1;
      }
    }
  }
  return sig;
}

/**
 * structureSignature 비교 — 모드별 엄격도 다름.
 *  - exam_similar(strict): 모든 카운트 정확히 일치
 *  - exam_variant(loose): inputCount·outputCount·figureCount 일치 + total counts ±1 허용
 */
export function validateStructureSignature(
  analysis: AnalysisResult,
  candidate: CandidateProblem,
  mode: GenerationMode,
): { ok: boolean; errors: string[]; severity: "critical" | "ok" } {
  const errors: string[] = [];
  const expected = analysis.structureSignature;
  if (!expected) return { ok: true, errors: [], severity: "ok" };

  const got = extractCandidateSignature(candidate);
  const isStrict = mode === "exam_similar";
  const tolerance = isStrict ? 0 : 1;

  // 1) 단자 수 — 둘 다 strict 일치 필수
  if (expected.inputCount !== undefined && got.inputCount !== expected.inputCount) {
    errors.push(`inputCount mismatch: got ${got.inputCount}, expected ${expected.inputCount}`);
  }
  if (expected.outputCount !== undefined && got.outputCount !== expected.outputCount) {
    errors.push(`outputCount mismatch: got ${got.outputCount}, expected ${expected.outputCount}`);
  }

  // 2) figure 개수 — 둘 다 strict
  if (expected.figureCount !== undefined && got.figureCount !== expected.figureCount) {
    errors.push(`figureCount mismatch: got ${got.figureCount}, expected ${expected.figureCount}`);
  }

  // 3) gate counts (logic_network)
  if (expected.gateCounts) {
    for (const [type, expCount] of Object.entries(expected.gateCounts)) {
      const gotCount = got.gateCounts?.[type] ?? 0;
      if (Math.abs(gotCount - (expCount ?? 0)) > tolerance) {
        errors.push(`gate ${type} count: got ${gotCount}, expected ${expCount} (tol ${tolerance})`);
      }
    }
  }
  // 4) total gate count
  if (expected.totalGateCount !== undefined) {
    const gotTotal = got.totalGateCount ?? 0;
    if (Math.abs(gotTotal - expected.totalGateCount) > tolerance) {
      errors.push(`totalGateCount: got ${gotTotal}, expected ${expected.totalGateCount} (tol ${tolerance})`);
    }
  }

  // 5) component counts (analog_netlist)
  if (expected.componentCounts) {
    for (const [type, expCount] of Object.entries(expected.componentCounts)) {
      const gotCount = got.componentCounts?.[type] ?? 0;
      if (Math.abs(gotCount - (expCount ?? 0)) > tolerance) {
        errors.push(`component ${type} count: got ${gotCount}, expected ${expCount} (tol ${tolerance})`);
      }
    }
  }
  if (expected.totalComponentCount !== undefined) {
    const gotTotal = got.totalComponentCount ?? 0;
    if (Math.abs(gotTotal - expected.totalComponentCount) > tolerance) {
      errors.push(`totalComponentCount: got ${gotTotal}, expected ${expected.totalComponentCount} (tol ${tolerance})`);
    }
  }

  // 6a) blankCount — 원본에 빈칸이 있었으면 candidate도 같은 수만큼 (둘 다 strict)
  if (expected.blankCount !== undefined && expected.blankCount > 0) {
    const gotBlanks = got.blankCount ?? 0;
    if (gotBlanks < expected.blankCount) {
      errors.push(`blankCount 부족: got ${gotBlanks}, expected ${expected.blankCount}. logic_network.blanks에 distinct symbol을 ${expected.blankCount}개 만들 것 (예: ⓐ, ⓑ).`);
    }
  }

  // 6b) Logic-specific (productTerm/outputCombiner/sharedTerm) — strict 모드만 검사
  if (isStrict) {
    const log = expected as Partial<LogicStructureSignature>;
    if (log.productTermGateCount !== undefined) {
      // candidate에서 SOP product term은 AND 게이트 수로 근사 (대략)
      const ands = got.gateCounts?.AND ?? 0;
      if (ands < log.productTermGateCount) {
        errors.push(`productTerm 부족: AND ${ands} < expected ${log.productTermGateCount}`);
      }
    }
    if (log.outputCombinerGateCount !== undefined) {
      const ors = got.gateCounts?.OR ?? 0;
      if (ors < log.outputCombinerGateCount) {
        errors.push(`outputCombiner 부족: OR ${ors} < expected ${log.outputCombinerGateCount}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    severity: errors.length ? "critical" : "ok",
  };
}
