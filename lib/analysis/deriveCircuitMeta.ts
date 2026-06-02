import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import {
  extractLearningObjective,
  listObjectives,
  type LearningObjective,
} from "@/lib/analysis/learningObjective";
import { buildCanonicalGraph, type CanonicalGraph } from "@/lib/graph/canonical";
import { detectMotifs, type Motif } from "@/lib/graph/motifDetector";
import { validateCanonicalGraph, type GraphValidation } from "@/lib/graph/graphValidator";
import { createLogger } from "@/lib/logger";
import type { AnalysisResult, SubjectKey } from "@/types";
import type { CircuitTypeClassification } from "@/types/circuitType";

const log = createLogger("lib/analysis/deriveCircuitMeta");

/**
 * analysis(+componentInventory)에서 결정론으로 derive되는 회로 메타데이터 묶음.
 * /api/analyze(Vision 직후)와 /api/recover-topology(검수·편집 게이트의 재계산)가 공유.
 */
export type CircuitMeta = {
  circuitType: CircuitTypeClassification;
  learningObjective: LearningObjective;
  /** listObjectives() 출력 — 진단 로그용 semantic flag 문자열 */
  semanticFlags: string[];
  tags: string[];
  motifs: Motif[];
  canonicalGraph: CanonicalGraph;
  graphValidation: GraphValidation;
};

/**
 * analysis + inventory → circuitType·objective·tags·canonical graph·motifs·validation 일괄 derive.
 *
 * GPT 호출 없음 (모두 결정론) — inventory가 바뀌면(검수·편집 게이트) 이 함수만 다시 호출하면
 * 분류·검증이 일관되게 재계산된다.
 *
 * @param analysis componentInventory·topologySignature가 채워진 분석 결과
 * @param subject  과목 키 (classify 분기에 사용)
 * @returns 결정론 derive된 회로 메타데이터
 */
export function deriveCircuitMeta(analysis: AnalysisResult, subject: SubjectKey): CircuitMeta {
  // 1. circuit_type 분류 — 추가 GPT 호출 없이 derive
  const circuitType = classifyCircuitType(analysis, subject);

  // 2. learning objective — 텍스트 힌트에서 rule-based 추출
  const textHint = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    ...(analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`),
  ].join(" ");
  const learningObjective = extractLearningObjective(textHint);
  const semanticFlags = listObjectives(learningObjective);

  // 3. tags 배열 — component·objective 기반 minimal 셋
  const tags: string[] = [];
  const inventory = analysis.componentInventory ?? [];
  if (inventory.some((c) => c.type.toUpperCase() === "OPAMP")) tags.push("opamp");
  if (inventory.some((c) => c.type.toUpperCase() === "R")) tags.push("resistive");
  if (inventory.some((c) => c.type.toUpperCase() === "C")) tags.push("capacitive");
  if (inventory.some((c) => c.type.toUpperCase() === "L")) tags.push("inductive");
  if (inventory.some((c) => c.type.toUpperCase() === "BJT")) tags.push("bjt");
  if (inventory.some((c) => c.type.toUpperCase() === "MOSFET")) tags.push("mosfet");
  if (learningObjective.asks_transfer_function) tags.push("transfer_function");
  if (learningObjective.asks_oscillation_frequency) tags.push("oscillator");
  if (learningObjective.asks_average_power) tags.push("average_power");
  if (learningObjective.asks_max_power_transfer) tags.push("max_power_transfer");
  if (learningObjective.asks_transient_response) tags.push("transient");
  if (learningObjective.asks_frequency_response) tags.push("frequency_response");
  if (learningObjective.asks_equivalent_circuit) tags.push("equivalent_circuit");
  if (learningObjective.asks_region_identification) tags.push("region_identification");
  if (learningObjective.asks_logic_minimization) tags.push("logic_minimization");
  if (learningObjective.asks_state_analysis) tags.push("state_analysis");

  // 4. Canonical Graph — components+pins → graph + features
  const canonicalGraph = buildCanonicalGraph(inventory);

  // 5. Motif Detector — sub-pattern → motif·tags 병합
  const motifResult = detectMotifs(canonicalGraph);
  for (const t of motifResult.tags) if (!tags.includes(t)) tags.push(t);

  // 6. Graph Validator — 자체-일관성 검증 + confidence
  const graphValidation = validateCanonicalGraph(canonicalGraph);

  log.info("=== Semantic ===", { flags: semanticFlags });
  log.info("=== Tags ===", { tags, motifs: motifResult.motifs.map((m) => m.kind) });
  log.info("=== Canonical Graph ===", {
    nodeCount: canonicalGraph.features.nodeCount,
    edgeCount: canonicalGraph.features.edgeCount,
    cycleCount: canonicalGraph.features.cycleCount,
    cc: canonicalGraph.features.connectedComponentCount,
    nodes: canonicalGraph.nodes,
    skipped: canonicalGraph.skippedComponents.length,
  });
  log.info("=== Selected Pipeline ===", {
    circuitType: circuitType.type,
    note: "router_pending — circuitType single-string fallback",
  });
  log.info("circuit_type_classified", { type: circuitType.type, confidence: circuitType.confidence });

  return {
    circuitType,
    learningObjective,
    semanticFlags,
    tags,
    motifs: motifResult.motifs,
    canonicalGraph,
    graphValidation,
  };
}
