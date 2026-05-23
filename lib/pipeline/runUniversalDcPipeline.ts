import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildFromTopology } from "@/lib/generation/topologyDriven/buildFromTopology";
import { perturbTopology, listSourceIndices } from "@/lib/generation/topologyDriven/perturbTopology";
import { inferDcQueries, resolveQueryNodes, findVariableResistor } from "@/lib/generation/topologyDriven/inferDcQueries";
import { solveDcQueries, type DcQuery, type DcQueryResult } from "@/lib/solver/universalDc";
import { validateDcResult } from "@/lib/solver/validateDcResult";
import { writeUniversalDcText } from "@/lib/generation/topologies/universalDcTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import { verifyWithSpice } from "@/lib/verification/verifyWithSpice";
import { buildCircuitGraph } from "@/lib/graph/buildCircuitGraph";
import { validateCircuitGraph } from "@/lib/graph/validateCircuitGraph";
import { detectCrossPattern } from "@/lib/renderers/crossLayoutCircuitRenderer";
import { detectFourNodeImyong } from "@/lib/renderers/fourNodeImyongRenderer";
import { validateFigures } from "@/lib/validators/validateFigures";
import { repairLeftParallelFeed } from "@/lib/graph/repairPatterns";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runUniversalDcPipeline");

/**
 * Universal DC pipeline — archetype 없이 임의 DC 회로(V/I/R) + 다단계 query를 처리.
 *
 *   path:
 *     1) analysis.topologySignature를 mode 정책으로 perturb (exam_similar/variant)
 *     2) buildFromTopology로 netlist + MNA 솔버 결과
 *     3) inferDcQueries로 analysis에서 query 추출 → resolveQueryNodes로 노드 매핑
 *     4) solveDcQueries로 query 값 산출 (inverseR은 R sweep)
 *     5) writeUniversalDcText로 3단계 텍스트 작성
 *
 *   archetype을 추가하지 않고 새 임용 형식을 흡수하는 게 목표.
 */
export async function runUniversalDcPipeline(args: {
  analysis: AnalysisResult;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);
  const baseTopology = analysis.topologySignature;
  if (!baseTopology) {
    throw new Error("runUniversalDcPipeline: analysis.topologySignature 누락");
  }

  // analysis 기반 query 추출 (변형 무관 — 원본 의도 유지)
  const rawQueries = inferDcQueries(analysis);
  log.info("queries_inferred", {
    count: rawQueries.length,
    kinds: rawQueries.map((q) => q.kind).join(", "),
    labels: rawQueries.map((q) => q.label).join(" | "),
  });
  // 진단: 분석이 추출한 branches 구조 — node 압축·dangling remap 확인용.
  log.info("topology_branches", {
    branchCount: baseTopology.branches.length,
    branches: baseTopology.branches.map((b) => ({
      role: b.role,
      between: b.betweenNodes ? b.betweenNodes.join("→") : "(auto)",
      comps: b.components.map((c) => `${c.type}${c.value ? "=" + c.value : ""}`).join("+"),
    })),
    nodeAnnotations: (analysis.nodeAnnotations ?? []).map((a) => `${a.node}:${a.label ?? "(no label)"}`),
  });

  // ── Polarity variation enumeration — analysis가 GPT-Vision으로부터 V/I 소스의 극성
  //   (화살표 방향, +/- 표시)을 신뢰 있게 못 뽑은 경우 대비. 각 단일 소스 flip + no-flip를
  //   enumerate. 소스가 N개면 N+1개 variation, 너무 많을 땐 상한.
  const sourceIndices = listSourceIndices(baseTopology);
  const MAX_POLARITY_VARIATIONS = 6;  // no-flip + 최대 5개 single-flip
  const polarityVariations: ReadonlySet<number>[] = [new Set<number>()];
  for (const idx of sourceIndices.slice(0, MAX_POLARITY_VARIATIONS - 1)) {
    polarityVariations.push(new Set([idx]));
  }

  return generateInParallel(count, async (i, seed) => {
    // ── Rejection sampling — perturbed 결과가 valid·nice할 때까지 seed 변경 재시도.
    //    각 attempt: perturb → buildFromTopology → resolve → solve → validate.
    //    첫 valid 결과 채택. 모두 invalid면 가장 valid에 근접한 attempt fallback.
    //    polarity variation은 외부 루프 — base(no-flip)에서 못 풀면 single-flip 후보들 시도.
    const ATTEMPTS_PER_VARIATION = 8;
    type Attempt = {
      gen: ReturnType<typeof buildFromTopology>;
      queryResults: DcQueryResult[];
      niceness: number;
      reasons: string[];
    };
    let chosen: Attempt | null = null;
    let bestFallback: Attempt | null = null;
    let totalAttempts = 0;

    outer: for (let v = 0; v < polarityVariations.length; v++) {
      const polarityFlipIndices = polarityVariations[v];
      for (let attempt = 0; attempt < ATTEMPTS_PER_VARIATION; attempt++) {
        const localSeed = seed + totalAttempts * 104729;
        totalAttempts++;
        const perturbedTopology = perturbTopology(baseTopology, mode, localSeed, { polarityFlipIndices });
        const gen = buildFromTopology({ topology: perturbedTopology, mode, seed: localSeed });
        const resolvedQueries: DcQuery[] = resolveQueryNodes(
          rawQueries,
          gen.netlistOpen,
          analysis,
        );
        const queryResults = solveDcQueries(gen.solverNetOpen, resolvedQueries);
        const verdict = validateDcResult(queryResults);
        const att: Attempt = { gen, queryResults, niceness: verdict.niceness, reasons: verdict.reasons };

        if (verdict.valid) {
          chosen = att;
          log.info("attempt_accepted", {
            attempt: totalAttempts - 1,
            niceness: verdict.niceness,
            seed: localSeed,
            polarityFlipped: [...polarityFlipIndices],
          });
          break outer;
        }
        if (!bestFallback || att.niceness > bestFallback.niceness) {
          bestFallback = att;
        }
        log.info("attempt_rejected", {
          attempt: totalAttempts - 1,
          seed: localSeed,
          polarityFlipped: [...polarityFlipIndices],
          reasons: verdict.reasons.slice(0, 3),
        });
      }
    }
    const MAX_ATTEMPTS = totalAttempts;

    const final = chosen ?? bestFallback!;
    if (!chosen) {
      log.warn("rejection_exhausted", {
        attempts: MAX_ATTEMPTS,
        fallbackReasons: final.reasons.slice(0, 3),
        fallbackNiceness: final.niceness,
      });
    }

    const gen = final.gen;
    const queryResults = final.queryResults;
    log.info("queries_solved", {
      seed,
      converged: Boolean(chosen),
      results: queryResults.map((r) => `${r.query.label}=${r.value}${r.unit}`).join(", "),
    });

    // ── 가변 R 표기 — 임용 관습에 따라 figure는 변수명("R")만 표시, 수치 hide.
    //   solver는 perturbed numeric을 계속 사용 (gen.solverNetOpen에 보존됨).
    //   loadPlaceholders는 완전 제거 (R_L floating dashed box 방지).
    const inverseRq = queryResults.find((r) => r.query.kind === "inverseR");
    const variableRid =
      inverseRq && inverseRq.query.kind === "inverseR"
        ? inverseRq.query.resistorId
        : findVariableResistor(gen.netlistOpen, analysis);
    if (variableRid) {
      const comp = gen.netlistOpen.components.find((c) => c.id === variableRid);
      if (comp) {
        comp.value = "R";
        log.info("variable_r_value_hidden", { resistorId: variableRid });
      }
    }
    // analysis에서 받은 loadPlaceholders는 보라색 dashed box로 그려져 중복 표기 → 제거.
    gen.netlistOpen.loadPlaceholders = [];

    // ★ 원칙: semantic graph는 immutable. render graph는 temporary bend point만 추가
    //   가능. pipeline에서 노드/branch 자동 prune·merge·remap 금지.
    //   (이전 dangling 자동 prune 코드 제거 — semantic 수정이라 부적절.)
    //   semantic 오류는 validator가 reject(throw)로 차단하되 자동 수정하지 않는다.

    // ── Semantic vs Render diagnostics — 두 그래프 일치 여부 확인.
    //   현재 단계에선 render = semantic (bend point 없음). 향후 routing 시 차이 표시.
    {
      const isGndN = (n: string) => n === (gen.netlistOpen.ground ?? "GND") || ["GND","ground","Ground","gnd","Gnd","0"].includes(n);
      const semanticNodes = new Set<string>();
      for (const c of gen.netlistOpen.components) {
        for (const p of c.pins) semanticNodes.add(p.node);
      }
      const annotatedNodes = new Set((analysis.nodeAnnotations ?? []).map((a) => a.node));
      const vSrc = gen.netlistOpen.components.find((c) => c.type === "V");
      const vPlus = vSrc?.pins.find((p) => p.role === "positive")?.node;
      // semantic 정당성 — GND, V·+ terminal, 또는 nodeAnnotation 있는 노드만 정당.
      //   그 외는 phantom junction(routing artifact)일 가능성.
      const phantomJunctions = [...semanticNodes].filter((n) =>
        !isGndN(n) && n !== vPlus && !annotatedNodes.has(n),
      );
      log.info("semantic_nodes", [...semanticNodes]);
      log.info("render_nodes", [...semanticNodes].map((id) => ({ id, semantic: true })));
      if (phantomJunctions.length > 0) {
        log.warn("phantom_junctions_detected", {
          nodes: phantomJunctions,
          note: "GND·V·+·nodeAnnotation 없는 노드 — 분석이 routing junction을 semantic으로 추출했을 가능성. analyzer prompt 강화 필요.",
        });
      }
    }

    // ── nodeAnnotations 전파 — figure에 V_1·V_2 등 측정 노드 라벨 표시용.
    //   analysis.nodeAnnotations의 node id가 빌드된 netlist node id와 일치할 때만 추가.
    const builtNodeIds = new Set<string>();
    for (const c of gen.netlistOpen.components) {
      for (const p of c.pins) builtNodeIds.add(p.node);
    }
    const validAnns = (analysis.nodeAnnotations ?? []).filter((a) => builtNodeIds.has(a.node));
    if (validAnns.length > 0) {
      gen.netlistOpen.nodeAnnotations = validAnns;
    }

    // ── Pattern-specific repair: source_plus ↔ main_unknown 사이 R이 1개만 있으면
    //   stacked 평행 가지를 inferred로 복원. routeEdges가 자동으로 lane 분리 처리.
    //   (analyzer가 위아래 stacked R을 일관되게 못 보는 케이스 휴리스틱 보정.)
    const repaired = repairLeftParallelFeed(gen.netlistOpen);
    if (repaired !== gen.netlistOpen) {
      log.info("left_parallel_feed_repaired", {
        addedCount: repaired.components.length - gen.netlistOpen.components.length,
      });
      gen.netlistOpen = repaired;
    }

    // ── Layout-level validation — cross-layout이 적용될 회로는 graph 검증으로 단락 회로 reject.
    //   V 전압원 +단자가 wire-only path로 GND와 단락되는 layout은 의미 있는 문제가 안 되므로
    //   문제 생성 이전에 throw (API 500 → 사용자가 즉시 인지).
    //   ★ 4-노드 imyong 형식은 fourNodeImyongRenderer 전용 경로 사용 — 2-row cellGrid 단락 버그
    //     없으므로 검증 skip.
    const isFourNodeImyong = detectFourNodeImyong(gen.netlistOpen) !== null;
    if (!isFourNodeImyong && detectCrossPattern(gen.netlistOpen)) {
      try {
        const cg = buildCircuitGraph(gen.netlistOpen);
        validateCircuitGraph(cg);
      } catch (e) {
        log.error("layout_validation_failed", { message: (e as Error).message });
        throw new Error(`회로 layout 단락 검증 실패: ${(e as Error).message}`);
      }
    }

    // PSPICE 교차 검증 (fire-and-forget) — ngspice 미설치 시 silent skip.
    //   variable R 값은 hide("R")됐지만 solver net에는 perturbed numeric 보존됨.
    verifyAsync(gen.solverNetOpen, queryResults);

    // 텍스트
    const text = await writeUniversalDcText({
      generation: gen,
      queryResults,
      mode,
      topicLabel,
      contextHint,
    });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_main_${i + 1}`,
        label: "주어진 회로",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.netlistOpen,
      },
    ];

    // ── Figure-level critical validation — dangling node·floating pin은 그림으로 출력
    //   할 가치 없음. 문제 생성 이전에 throw하여 잘못된 회로가 사용자에게 노출되지 않도록.
    const figureVerdict = validateFigures(figureVariants);
    const criticalRules = new Set(["netlist_dangling_node", "analog_circuit_open"]);
    const criticalIssues = figureVerdict.issues.filter((iss) => criticalRules.has(iss.rule));
    if (criticalIssues.length > 0) {
      log.error("figure_critical_validation_failed", {
        count: criticalIssues.length,
        messages: criticalIssues.map((iss) => iss.message),
      });
      throw new Error(
        `figure 검증 실패: ${criticalIssues.map((iss) => `[${iss.rule}] ${iss.message}`).join(" / ")}`,
      );
    }

    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      figureVariants,
    };
  });
}

/**
 * Fire-and-forget ngspice 검증. ngspice 미설치 시 silent skip (verifyWithSpice가 graceful).
 *   universal_dc는 다단계 query — node voltage·branch current·resistor power·inverseR sweep을 모두
 *   포함. 1차 검증은 node voltages 일치 여부로 충분 (branch current·power는 V로부터 유도되므로
 *   자동 검증됨).
 */
async function verifyAsync(net: SolverNetwork, queryResults: DcQueryResult[]): Promise<void> {
  try {
    const solverResult = solveMNA(net);
    const verifyNodes = Array.from(new Set(
      queryResults
        .map((r) => (r.query.kind === "nodeVoltage" ? r.query.node : null))
        .filter((n): n is string => typeof n === "string"),
    ));
    const verify = await verifyWithSpice({ net, solverResult, verifyNodes: verifyNodes.length > 0 ? verifyNodes : undefined });
    if (verify.attempted && !verify.ok) {
      log.warn("spice_verification_failed", { discrepancies: verify.discrepancies.slice(0, 3) });
    } else if (verify.attempted && verify.ok) {
      log.info("spice_verification_passed", { verifiedNodes: verifyNodes.length });
    } else {
      log.info("spice_verification_skipped", { reason: verify.reason });
    }
  } catch (e) {
    log.warn("spice_verification_error", { message: (e as Error).message });
  }
}
