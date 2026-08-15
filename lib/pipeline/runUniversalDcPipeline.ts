import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildFromTopology } from "@/lib/generation/topologyDriven/buildFromTopology";
import { perturbTopology, listSourceIndices } from "@/lib/generation/topologyDriven/perturbTopology";
import {
  inferDcQueries,
  resolveQueryNodes,
  inferDcConceptLead,
  resolveResistorPowerTarget,
} from "@/lib/generation/topologyDriven/inferDcQueries";
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

  // ── resistorPower 대상 저항 id 사전 해석 —
  //   __rvalue:N / __rlabel:R_k / __rdefault__ placeholder를 실제 저항 id로 확정.
  //   원본(비perturb) 토폴로지를 한 번 빌드 → valueRand가 원본 값을 그대로 쓰므로 "N Ω"
  //   저항을 값으로 매칭 가능. id는 위치 기반이라 이후 perturbed 빌드에서도 동일 → 안정.
  //   ★ resistorCurrent도 같은 __rvalue: 규약을 쓴다 (임용 3번류 "4[kΩ]에 흐르는 전류 I₁").
  const hasResistorPlaceholder = rawQueries.some(
    (q) => (q.kind === "resistorPower" || q.kind === "resistorCurrent") && q.resistorId.startsWith("__r"),
  );
  if (hasResistorPlaceholder) {
    const baseGen = buildFromTopology({ topology: baseTopology, mode, seed: 1 });
    for (const q of rawQueries) {
      if ((q.kind === "resistorPower" || q.kind === "resistorCurrent") && q.resistorId.startsWith("__r")) {
        const resolved = resolveResistorPowerTarget(q.resistorId, baseGen.netlistOpen);
        if (resolved) {
          log.info("resistor_power_target_resolved", { placeholder: q.resistorId, resistorId: resolved });
          q.resistorId = resolved;
        } else {
          log.warn("resistor_power_target_unresolved", { placeholder: q.resistorId });
        }
      }
    }

    // ★ resistorCurrent 대상 **중복 제거** (2026-08-02 실측):
    //   복구된 topology의 branch에 소자 값이 없으면 base 빌드가 임의값을 뽑아
    //   "4kΩ"·"3kΩ" 값 매칭이 모두 실패 → 두 쿼리가 **같은 저항**으로 폴백해
    //   "I = 3/34A, I = 3/34A"처럼 같은 답이 두 번 나왔다.
    //   원본이 서로 다른 저항 2개를 물었으면 생성물도 서로 다른 저항이어야 한다 →
    //   겹치면 netlist 순서상 아직 안 쓴 저항으로 분산한다(결정론).
    const rcs = rawQueries.filter((q) => q.kind === "resistorCurrent");
    if (rcs.length > 1) {
      const allR = baseGen.netlistOpen.components.filter((c) => c.type === "R").map((c) => c.id);
      const used = new Set<string>();
      for (const q of rcs) {
        if (q.kind !== "resistorCurrent") continue;
        if (!q.resistorId.startsWith("__r") && !used.has(q.resistorId)) { used.add(q.resistorId); continue; }
        const next = allR.find((id) => !used.has(id));
        if (next) {
          log.warn("resistor_current_target_deduped", { from: q.resistorId, to: next });
          q.resistorId = next;
          used.add(next);
        }
      }
    }
  }

  // ── 개념형 "원리의 명칭 쓰기" lead 감지 (예: 중첩의 원리) — 순수 수치 query로 표현
  //   못 하는 서술형 소문항을 보존. 감지되면 텍스트 라이터가 answer/question에 반영.
  const conceptLead = inferDcConceptLead(analysis);

  log.info("queries_inferred", {
    count: rawQueries.length,
    kinds: rawQueries.map((q) => q.kind).join(", "),
    labels: rawQueries.map((q) => q.label).join(" | "),
    conceptLead: conceptLead?.principleName ?? "(none)",
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
    //    ★ 채택 기준(2026-07-25): "첫 valid"가 아니라 **답이 깔끔한 것**을 고른다.
    //      임용 문제의 정답은 정수가 원칙인데, 예전엔 valid하기만 하면 즉시 채택해
    //      P = 129.551W 같은 답이 그대로 나갔다. 우선순위:
    //        allInteger(정수) > clean(0.5 단위) > tenth(소수 첫째) > valid > invalid fallback.
    //      attempt는 순수 계산(perturb·MNA·solve, GPT 호출 없음)이라 넉넉히 돌려도 저렴하고,
    //      정수 답을 찾는 즉시 조기 종료한다. 정수 조합의 비율은 회로마다 수 % 수준이라
    //      수백 회는 돌려야 잡힌다(예전 8회/variation으론 사실상 못 잡음).
    //    ★ inverseR query는 attempt마다 R sweep(200 sample + 이분법)을 돌아 수백 배 비싸다
    //      → 값싼 query(노드전압·전류·전력)를 먼저 풀어 지저분하면 sweep을 건너뛴다.
    //      (첫 attempt만은 전부 풀어 fallback 후보를 확보한다.)
    //    ★ 탐색 폭 단계 상승(SPREAD_LADDER): exam_similar의 기본 섭동은 ±5% + nice 값 스냅이라
    //      값이 원본으로 되돌아가 붙는다 — 즉 탐색 공간이 사실상 한 점이어서, 몇 번을 돌리든
    //      같은 (지저분한) 답만 나왔다. 그래서 "가능한 한 원본에 가깝게, 필요한 만큼만 넓게":
    //      spread=1로 먼저 찾고, 깔끔한 답이 없을 때만 단계적으로 폭을 넓힌다.
    const SPREAD_LADDER = [1, 3, 6, 10];
    const ATTEMPT_BUDGET = 1600;
    const ATTEMPTS_PER_VARIATION = Math.max(
      1,
      Math.ceil(ATTEMPT_BUDGET / (polarityVariations.length * SPREAD_LADDER.length)),
    );
    type Attempt = {
      gen: ReturnType<typeof buildFromTopology>;
      queryResults: DcQueryResult[];
      niceness: number;
      reasons: string[];
    };
    let chosen: Attempt | null = null;          // 정수 답 (최우선)
    let bestClean: Attempt | null = null;       // 0.5 단위까지 허용
    let bestTenth: Attempt | null = null;       // 소수 첫째 자리까지
    let bestValid: Attempt | null = null;       // valid하지만 지저분한 답
    let bestFallback: Attempt | null = null;    // invalid — 최후 수단
    let totalAttempts = 0;

    outer: for (const spread of SPREAD_LADDER) {
      for (let v = 0; v < polarityVariations.length; v++) {
      const polarityFlipIndices = polarityVariations[v];
      for (let attempt = 0; attempt < ATTEMPTS_PER_VARIATION; attempt++) {
        const localSeed = seed + totalAttempts * 104729;
        totalAttempts++;
        const perturbedTopology = perturbTopology(baseTopology, mode, localSeed, { polarityFlipIndices, spread });
        const gen = buildFromTopology({ topology: perturbedTopology, mode, seed: localSeed });
        const resolvedQueries: DcQuery[] = resolveQueryNodes(
          rawQueries,
          gen.netlistOpen,
          analysis,
        );
        // ── 값싼 query 먼저 → 비싼 inverseR sweep은 전망 있을 때만.
        const cheapQueries = resolvedQueries.filter((q) => q.kind !== "inverseR");
        const costlyQueries = resolvedQueries.filter((q) => q.kind === "inverseR");
        let queryResults = solveDcQueries(gen.solverNetOpen, cheapQueries);
        if (costlyQueries.length > 0) {
          const cheapVerdict = cheapQueries.length > 0 ? validateDcResult(queryResults) : null;
          // 첫 attempt는 무조건 완전 평가(최소 1개의 fallback 후보 확보).
          const worthSweep =
            totalAttempts === 1 || !cheapVerdict || (cheapVerdict.valid && cheapVerdict.clean);
          if (!worthSweep) continue;
          queryResults = [...queryResults, ...solveDcQueries(gen.solverNetOpen, costlyQueries)];
        }
        const verdict = validateDcResult(queryResults);
        // ★ resistorCurrent 대상 저항의 **값이 서로 같으면 발문이 모호해진다**
        //   ("250Ω 저항에 흐르는 I₁"과 "250Ω 저항에 흐르는 I₂" — 학생이 어느 저항인지 못 고른다).
        //   perturbation이 우연히 같은 값을 뽑은 표본은 버린다(실측 신고 2026-08-02).
        const rcTargets = resolvedQueries
          .filter((q): q is Extract<DcQuery, { kind: "resistorCurrent" }> => q.kind === "resistorCurrent")
          .map((q) => gen.netlistOpen.components.find((c) => c.id === q.resistorId)?.value ?? "");
        const rcAmbiguous = rcTargets.length > 1 && new Set(rcTargets).size < rcTargets.length;
        const att: Attempt = {
          gen, queryResults,
          niceness: rcAmbiguous ? verdict.niceness - 100 : verdict.niceness,
          reasons: rcAmbiguous ? [...verdict.reasons, "resistorCurrent 대상 저항 값 중복"] : verdict.reasons,
        };
        if (rcAmbiguous) {
          if (!bestFallback || att.niceness > bestFallback.niceness) bestFallback = att;
          continue;   // 이 표본은 채택하지 않는다
        }

        if (verdict.valid) {
          if (verdict.allInteger) {
            chosen = att;
            log.info("attempt_accepted", {
              attempt: totalAttempts - 1,
              grade: "integer",
              spread,
              niceness: verdict.niceness,
              seed: localSeed,
              polarityFlipped: [...polarityFlipIndices],
            });
            break outer;
          }
          if (verdict.clean) {
            if (!bestClean || att.niceness > bestClean.niceness) bestClean = att;
          } else if (verdict.tenth) {
            if (!bestTenth || att.niceness > bestTenth.niceness) bestTenth = att;
          } else if (!bestValid || att.niceness > bestValid.niceness) {
            bestValid = att;
          }
          continue;
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
      // 이 spread 단계에서 0.5 단위 이상으로 깔끔한 답을 이미 찾았으면 더 넓히지 않는다
      // (원본에 최대한 가까운 값을 유지하기 위함).
      if (bestClean) break;
    }
    const MAX_ATTEMPTS = totalAttempts;

    // 정수 답 없으면 0.5 단위 → 소수 첫째 → 지저분해도 valid → invalid 순으로 양보.
    const final = chosen ?? bestClean ?? bestTenth ?? bestValid ?? bestFallback!;
    if (!chosen) {
      const grade = bestClean ? "half" : bestTenth ? "tenth" : bestValid ? "messy" : "invalid";
      log.warn("clean_answer_not_found", {
        attempts: MAX_ATTEMPTS,
        acceptedGrade: grade,
        results: final.queryResults.map((r) => `${r.query.label}=${r.value}${r.unit}`).join(", "),
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
    // ★ inverseR query가 있을 때만 변수 R을 "R"로 숨긴다. (2026-06-14 회귀 수정)
    //   이전엔 query가 없어도 findVariableResistor fallback이 임의 R을 골라 "R"로 숨겨,
    //   "풀 대상이 아닌데 값이 사라져" 정답을 못 구하는 문제(임용 7번 전원변환 류)가 났다.
    //   inverseR이 없으면 모든 R은 수치 그대로 둬야 노드전압·전류 query가 계산 가능하다.
    const inverseRq = queryResults.find((r) => r.query.kind === "inverseR");
    if (inverseRq && inverseRq.query.kind === "inverseR") {
      const variableRid = inverseRq.query.resistorId;
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
      conceptLead,
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
