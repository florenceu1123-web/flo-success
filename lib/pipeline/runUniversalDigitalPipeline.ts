/**
 * Universal digital logic pipeline — N-변수 M-함수 K-map + gate combination.
 *
 *   파이프라인:
 *     1) analysis.signals.inputs.length → 변수 개수 N (2~5, 기본 4)
 *     2) analysis.signals.outputs 또는 interpretation 패턴에서 함수 개수 M 추론
 *     3) M번 generateKmapSop 호출 (다른 seed) → M개의 독립 boolean function
 *     4) 함수들을 gate(OR by default, AND/XOR도 가능)로 결합해 최종 출력
 *     5) figureVariants: M개의 K-map + 1개의 combination circuit
 *
 *   기존 자원 재활용:
 *     - generateKmapSop: 단일 K-map 함수 + diagram 일체 생성
 *     - KmapDiagram / LogicNetworkDiagram 타입 그대로
 *
 *   exam_similar/exam_variant 모드:
 *     - similar: 같은 N·M·gate type, 함수 값만 살짝 perturb (seed 변경)
 *     - variant: gate type도 바꿈 (OR↔AND 등), 함수 개수 ±1 가능
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateKmapSop, type KmapSopArchetype } from "@/lib/generation/topologies/kmapSop";
import { generateSharedTermInputBlank } from "@/lib/generation/topologies/sharedTermInputBlank";
import { buildContextHint, generateInParallel } from "./_common";
import type { GateOp, LogicDAG, LogicDAGNode } from "@/lib/graph/digitalSemantic";
import { validateLogicDAG, intermediateSignalsOf } from "@/lib/graph/digitalSemantic";
import { dagToLogicNetwork } from "@/lib/renderers/logicDagRenderer";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runUniversalDigitalPipeline");

type DefaultGateOp = "OR" | "AND" | "XOR";

export async function runUniversalDigitalPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);
  const analysisText = collectAnalysisText(analysis);

  // ★ 공유항·입력결정 모드 (임용 7번 정보과 형식 등) — 원본이 "함수가 Σm으로 주어지고 +
  //   회로 입력 ㉠㉡㉢ 빈칸 + 중복(공유) 항 도출" 방향이면, 출력 합성(정방향)이 아니라
  //   입력 결정(역방향) 문제로 생성해야 학습 목표가 보존된다.
  const params = analysis?.circuitType?.params;
  if (params?.sharedTermInputBlank) {
    return runSharedTermInputBlankMode({ analysis, analysisText, mode, count, topicKey });
  }

  // 텍스트에서 함수 시그니처 파싱 — "F(X, Y, Z)" 패턴. signals 누락 시 N·M 앵커 안전망.
  const parsedSignatures = parseFunctionSignatures(analysisText);

  // 변수 개수 — signals.inputs.length를 우선, 없으면 함수 시그니처에서, 그래도 없으면 기본 4.
  const inputs = analysis?.signals?.inputs ?? [];
  const detectedVars = inputs.length || (parsedSignatures[0]?.vars.length ?? 0);
  // 임용 8번처럼 ABCD 4-변수가 표준. 2~5 범위로 clamp.
  const N = Math.min(5, Math.max(2, detectedVars || 4));

  // 함수 개수 — signals.outputs / 함수 시그니처 / interpretation의 f_1·f_2·... 패턴 카운트.
  const M = inferFunctionCount(analysis, N, parsedSignatures.length);

  // 결합 gate (fallback 기본값) — interpretation에서 "OR로 결합"·"합 형태" 등 키워드 검색.
  // analysis.signals.intermediateGates가 제공되면 그쪽 per-stage op 우선.
  const gateOp = inferGateOp(analysis);

  log.info("universal_digital_config", { N, M, gateOp, varInputs: inputs });

  return generateInParallel(count, async (i, seed) => {
    // M번 K-map 함수 생성 — seed variation으로 독립 boolean function들.
    const archetype: KmapSopArchetype = N === 3 ? "kmap_3var" : "kmap_4var";
    const funcs: ReturnType<typeof generateKmapSop>[] = [];
    for (let fi = 0; fi < M; fi++) {
      const fnSeed = seed + fi * 7919;  // prime spacing
      const gen = generateKmapSop({ archetype, seed: fnSeed });
      funcs.push(gen);
    }

    // K-map figureVariants — 함수 1개당 1개 figure.
    const kmapFigures: FigureVariant[] = funcs.map((f, fi) => ({
      id: `fig_kmap_${i + 1}_${fi + 1}`,
      label: `f_${fi + 1} K-map (${f.func.varNames.join(",")})`,
      role: "kmap",
      diagramType: "kmap",
      diagram: f.kmapDiagram,
    }));

    // ── LogicDAG 생성 — 파이프라인: minterms → kmap → LogicDAG → validate → render.
    //   ★ 절대 금지: f_1·f_2·f_3·f_4를 하나의 OR/AND 게이트에 직접 연결 (multi-stage 손실).
    //
    //   우선순위:
    //     (1) analysis.signals.intermediateGates가 explicit spec으로 제공되면 그것으로 직접 빌드.
    //         stage별 다른 gate op (AND·OR·XOR 혼용) 지원.
    //         예 — 임용 8번 user-specified:
    //           [{id:"X",op:"AND",inputs:["f1","f2"]},
    //            {id:"Y",op:"OR", inputs:["f3","f4"]},
    //            {id:"Z",op:"XOR",inputs:["X","Y"]}]
    //     (2) 미제공 시 intermediateSignals 라벨 + 단일 gateOp로 binary tree heuristic.
    const funcIds = funcs.map((_, fi) => `f${fi + 1}`);
    const intermediateNames = analysis?.signals?.intermediateSignals ?? [];
    const intermediateGates = analysis?.signals?.intermediateGates ?? [];
    const dag = intermediateGates.length > 0
      ? buildExplicitDag(funcIds, intermediateGates)
      : buildLogicDag(funcIds, gateOp, intermediateNames);
    const dagErrors = validateLogicDAG(dag);
    if (dagErrors.length > 0) {
      log.warn("logic_dag_validation_failed", { errors: dagErrors });
    } else {
      log.info("logic_dag_built", {
        nodes: dag.nodes.length,
        outputId: dag.outputId,
        intermediates: intermediateSignalsOf(dag),
      });
    }
    const combination = dagToLogicNetwork(dag, Object.fromEntries(
      funcs.map((_, fi) => [`f${fi + 1}`, `f_${fi + 1}`]),
    ));
    const combFigure: FigureVariant = {
      id: `fig_combination_${i + 1}`,
      label: `통합 회로 (multi-stage DAG)`,
      role: "implementation_circuit",
      diagramType: "logic_network",
      diagram: combination,
    };

    // 텍스트 — 각 함수의 최소 SOP + multi-stage DAG 식.
    const sopList = funcs.map((f, fi) => `f_${fi + 1} = ${f.sopExpression}`).join("\n");
    // DAG의 각 gate를 stage별로 식 변환 — per-gate op symbol 사용.
    const gateNodes = dag.nodes.filter(
      (n): n is Extract<LogicDAGNode, { kind: "gate" }> => n.kind === "gate",
    );
    const labelOfNode = (id: string): string => {
      const node = dag.nodes.find((n) => n.id === id);
      if (!node) return id;
      if (node.kind === "function") {
        const fi = funcs.findIndex((_, i) => `f${i + 1}` === id);
        return fi >= 0 ? `f_${fi + 1}` : (node.label ?? id);
      }
      return node.label ?? id;
    };
    const stageEqs = gateNodes
      .map((g) => `${labelOfNode(g.id)} = ${g.inputs.map(labelOfNode).join(` ${opSymbolOf(g.gate)} `)}`)
      .join("\n");
    // stage별 사용된 게이트 종류 요약 (조건 표시용).
    const usedGateOps = Array.from(new Set(gateNodes.map((g) => g.gate)));
    const intermediateSummary = intermediateSignalsOf(dag).join(", ") || "없음";
    const content = [
      `${N}-변수(${inputs.length > 0 ? inputs.join(", ") : "A,B,C,D".slice(0, 2 * N - 1)}) 입력에 대한 ${M}개의 boolean 함수 + multi-stage 결합 문제.`,
      `각 함수는 minterm 셋으로 정의되며, 중간 신호(${intermediateSummary})를 거쳐 최종 출력 ${dag.outputId}를 만든다.`,
      contextHint || topicLabel || "",
    ].filter(Boolean).join(" ");
    const question = `[단계 1] 각 함수 f_1 ... f_${M}의 최소 SOP를 구한다.\n[단계 2] multi-stage 결합으로 최종 출력 ${dag.outputId}를 구한다.`;
    const answer = `[단계 1]\n${sopList}\n[단계 2]\n${stageEqs}`;

    return {
      id: randomUUID(),
      content,
      conditions: [
        `입력 변수: ${N}개`,
        `함수 개수: ${M}`,
        `결합 게이트: ${usedGateOps.join("·") || gateOp} (${gateNodes.length} stage)`,
      ],
      question,
      answer,
      solution: sopList,
      topicKey,
      figureVariants: [...kmapFigures, combFigure],
    };
  });

  // ── helpers ──
  void mode;  // exam_similar/variant는 향후 perturb 강도 조정에 사용
}

/** 함수 개수 추론 — signals.outputs / 함수 시그니처 / interpretation의 f_숫자 패턴. */
function inferFunctionCount(
  analysis: AnalysisResult | null | undefined,
  n: number,
  parsedSignatureCount: number = 0,
): number {
  if (!analysis) return 2;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
  ].join(" ");
  // f_1 ... f_K 패턴 카운트
  const fMatches = text.match(/f[_]?[1-9]/gi);
  if (fMatches) {
    const maxIdx = Math.max(...fMatches.map((s) => {
      const m = s.match(/(\d)/);
      return m ? parseInt(m[1], 10) : 0;
    }));
    if (maxIdx >= 2 && maxIdx <= 6) return maxIdx;
  }
  // signals.outputs 활용
  const outputs = analysis.signals?.outputs ?? [];
  if (outputs.length >= 2 && outputs.length <= 6) return outputs.length;
  // 텍스트 함수 시그니처 (F(X,Y,Z)·G(X,Y,Z) 등) — signals 누락 안전망
  if (parsedSignatureCount >= 2 && parsedSignatureCount <= 6) return parsedSignatureCount;
  // 기본: 변수 개수와 비슷한 함수 수
  return Math.min(4, Math.max(2, n));
}

// =====================================================================
// 공유항·입력결정 모드 (sharedTermInputBlank) — 임용 7번 정보과 형식
// =====================================================================

/**
 * 원본 방향 보존: "M개 함수가 Σm으로 주어짐 → 빈 K-map → 중복(공유) 항 → 회로 입력 ㉠㉡㉢ 결정".
 *
 *  원본 앵커 (텍스트 rule-based 파싱, GPT 재호출 없음):
 *   - 함수 시그니처 "F(X, Y, Z)" → 함수명·변수명
 *   - "Σm(2, 4, 5)" → 원본 minterm 셋 (공유/개별 구조 크기 앵커링용 — 값 복사 아님)
 */
async function runSharedTermInputBlankMode(args: {
  analysis: AnalysisResult | null | undefined;
  analysisText: string;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, analysisText, mode, count, topicKey } = args;

  // ── 원본 앵커 파싱 ──
  const signatures = parseFunctionSignatures(analysisText);
  const mintermSets = parseMintermSets(analysisText);

  // 변수명: 함수 시그니처 → signals.inputs → 기본 X,Y,Z
  const signalInputs = (analysis?.signals?.inputs ?? []).filter((s) => /^[A-Z]$/.test(s));
  const varNames =
    signatures[0]?.vars && signatures[0].vars.length >= 3
      ? signatures[0].vars.slice(0, 4)
      : signalInputs.length >= 3
        ? signalInputs.slice(0, 4)
        : undefined;

  // 함수명: 함수 시그니처 → signals.outputs → 기본 F,G
  const signalOutputs = (analysis?.signals?.outputs ?? []).filter((s) => /^[A-Z]$/.test(s));
  const funcNames =
    signatures.length >= 2
      ? signatures.map((s) => s.name).slice(0, 3)
      : signalOutputs.length >= 2
        ? signalOutputs.slice(0, 3)
        : undefined;

  // 원본 minterm 셋 (구조 앵커) — 함수명 순서대로
  const originalMinterms =
    funcNames && funcNames.every((n) => mintermSets[n])
      ? funcNames.map((n) => mintermSets[n])
      : Object.values(mintermSets);

  log.info("shared_term_input_blank_config", {
    varNames,
    funcNames,
    originalMinterms,
    mode,
  });

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSharedTermInputBlank({
      seed,
      varNames,
      funcNames,
      originalMinterms: originalMinterms.length >= 2 ? originalMinterms : undefined,
      mode,
    });
    if (!gen.uniqueAssignment) {
      log.warn("shared_term_non_unique_assignment", { minterms: gen.mintermExpressions });
    }

    const V = gen.varNames;
    const FN = gen.funcNames;
    const markers = gen.markerAssignment.map((m) => m.marker);
    const markerList = markers.join(", ");
    const funcDefs = FN.map((n, fi) => `${n}(${V.join(", ")}) = ${gen.mintermExpressions[fi]}`);
    const funcList = FN.map((n) => `${n}(${V.join(", ")})`).join("와 ");

    // ── 문제 텍스트 (원본 해석 절차 방향 그대로) ──
    const content = [
      `식 (가)는 ${V.length}개의 입력변수(${V.join(", ")})를 공통으로 갖는 ${FN.length}개의 불 함수(Boolean function)이고,`,
      `그림 (나)는 ${V.length}입력변수 카르노 도(Karnaugh map)에 대한 표현이다.`,
      `그림 (다)는 (가)를 1개의 조합논리회로로 구성한 것이다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`,
      `(단, 모든 소자는 이상적으로 동작한다.)`,
    ].join(" ");

    const conditions = [
      `(가) ${funcDefs.join(",  ")}`,
      `입력 변수: ${V.length}개 (${V.join(", ")})`,
      `함수 개수: ${FN.length}`,
      `(다)의 입력 ${markerList}은 빈칸 — 학생이 결정`,
    ];

    const question = [
      `[단계 1] (나)를 이용하여 ${funcList}의 카르노 도를 각각 순서대로 구한다.`,
      `[단계 2] [단계 1]의 카르노 도에서 중복되는 논리식 항을 구한다.`,
      `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여 (다)의 ${markerList}에 들어갈 입력변수를 순서대로 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${FN.map((n, fi) => `${n} = ${gen.sopExpressions[fi]}`).join(",  ")}`,
      `[단계 2] 중복되는 항: ${gen.sharedExpression}`,
      `[단계 3] ${gen.markerAssignment.map((m) => `${m.marker} = ${m.variable}`).join(",  ")}`,
    ].join("\n");

    const solution = [
      `[단계 1] 각 함수의 minterm을 카르노 도에 표시하고 인접 셀을 묶어 최소화한다.`,
      ...FN.map((n, fi) => {
        const solo = gen.soloExpressions[fi];
        const impl = gen.sopExpressions[fi];
        return solo === impl
          ? `  · ${n} = ${impl}`
          : `  · ${n} = ${impl}  (단독 최소화 시 ${solo} — 공유항 ${gen.sharedExpression}을 재사용하는 구현)`;
      }),
      `[단계 2] 두 카르노 도에서 공통으로 1인 셀을 묶으면 중복되는 항은 ${gen.sharedExpression}이다.`,
      `  이 항은 (다)에서 1개의 AND 게이트로 구현되어 ${FN.join("·")} 출력 OR 게이트에 모두 연결된다.`,
      `[단계 3] (다)의 게이트 구조(NOT 위치·AND 입력 구성)와 [단계 1]·[단계 2]의 논리식을 대조하면`,
      `  ${gen.markerAssignment.map((m) => `${m.marker} = ${m.variable}`).join(", ")}이다.`,
    ].join("\n");

    // ── Figures: 문제 영역 (나)·(다) + 풀이 영역 채워진 K-map ──
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_blank_kmap_${i + 1}`,
        label: `(나) ${V.length}입력변수 카르노 도`,
        role: "kmap",
        diagramType: "kmap",
        diagram: gen.blankKmapDiagram,
      },
      {
        id: `fig_circuit_${i + 1}`,
        label: `(다) 조합논리회로 (입력 ${markerList})`,
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
      },
    ];
    const solutionFigures: FigureVariant[] = gen.solutionKmaps.map((km, fi) => ({
      id: `fig_solution_kmap_${i + 1}_${fi + 1}`,
      label: `[풀이] ${FN[fi]} 카르노 도`,
      role: "kmap",
      diagramType: "kmap",
      diagram: km,
    }));

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey,
      figureVariants,
      solutionFigures,
    };
  });
}

// ── 텍스트 rule-based 파싱 helpers ──────────────────────────────────────

/** analysis의 모든 텍스트 필드 수집 (classifier와 동일 풀). */
function collectAnalysisText(analysis: AnalysisResult | null | undefined): string {
  if (!analysis) return "";
  const blanksText = (analysis.fillInTheBlanks ?? [])
    .map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`)
    .join(" ");
  return [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    blanksText,
  ].join(" ");
}

/** 함수 시그니처 파싱 — "F(X, Y, Z)" → { name: "F", vars: ["X","Y","Z"] }. 중복 함수명 제거. */
function parseFunctionSignatures(text: string): Array<{ name: string; vars: string[] }> {
  const out: Array<{ name: string; vars: string[] }> = [];
  const seen = new Set<string>();
  const re = /([A-Z])\s*\(\s*([A-Z](?:\s*,\s*[A-Z])+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ name: m[1], vars: m[2].split(",").map((v) => v.trim()) });
  }
  return out;
}

/** Σm minterm 셋 파싱 — "F(X,Y,Z) = Σm(2, 4, 5)" → { F: [2,4,5] }. */
function parseMintermSets(text: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const re = /([A-Z])\s*(?:\([^)]*\))?\s*=\s*[Σ∑]\s*m\s*\(([\d,\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const nums = m[2]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (nums.length > 0) out[m[1]] = nums;
  }
  return out;
}

/** 결합 gate 추론 — interpretation 키워드 기반. */
function inferGateOp(analysis: AnalysisResult | null | undefined): GateOp {
  if (!analysis) return "OR";
  const text = [analysis.topic ?? "", analysis.interpretation ?? "", (analysis.relatedConcepts ?? []).join(" ")].join(" ");
  if (/XOR|배타.?논리합|exclusive/i.test(text)) return "XOR";
  if (/AND.?(결합|조합|연결)|곱[\s]*형태|product/i.test(text)) return "AND";
  return "OR";
}

/**
 * LogicDAG 구성 — 함수 ids(f1..fM)을 multi-stage gate로 묶어 최종 출력 Z.
 *
 *   ★ 절대 단일 OR로 직접 묶지 말 것 ★ — intermediate stage(X, Y)를 반드시 보존.
 *
 *   intermediateNames가 제공되면 그 이름들을 stage 출력 라벨로 사용 (분석에서 명시 추출).
 *   미제공 시 2-stage 기본 트리:
 *     M=2: Z = gate(f1, f2)
 *     M=3: X = gate(f1, f2); Z = gate(X, f3)
 *     M=4: X = gate(f1, f2); Y = gate(f3, f4); Z = gate(X, Y)
 *     M≥5: 함수 쌍별 묶고 다시 묶기 (binary tree)
 *
 *   stage gate type은 기본 gateOp. 향후 stage별 다른 gate(AND·XOR 등) 지원 가능.
 */
function buildLogicDag(
  funcIds: readonly string[],
  gateOp: GateOp,
  intermediateNames: readonly string[],
): LogicDAG {
  const M = funcIds.length;
  const nodes: LogicDAGNode[] = funcIds.map((id, i) => ({
    id,
    kind: "function",
    label: `f_${i + 1}`,
  }));

  if (M === 0) {
    return { outputId: "Z", nodes: [{ id: "Z", kind: "gate", gate: "OR", inputs: [], label: "Z" }] };
  }
  if (M === 1) {
    nodes.push({ id: "Z", kind: "gate", gate: gateOp, inputs: [funcIds[0]], label: "Z" });
    return { outputId: "Z", nodes };
  }

  // M ≥ 2: binary tree로 묶는다. intermediateNames가 충분하면 그 이름 사용.
  const intermName = (idx: number, fallback: string) =>
    intermediateNames[idx] ?? fallback;

  // stage별 게이트 다양화 — 모든 stage 같은 op으로 collapse 금지 (typed logic synthesis).
  //   fallback gateOp를 first-stage 기본값으로 쓰되, 다음 stage는 cycle로 변경.
  //   순환열: [AND, OR, XOR] — gateOp 시작점 다음으로 진행.
  const cycle: GateOp[] = ["AND", "OR", "XOR"];
  const startIdx = Math.max(0, cycle.indexOf(gateOp));
  const stageOp = (k: number): GateOp => cycle[(startIdx + k) % cycle.length];

  if (M === 2) {
    nodes.push({ id: "Z", kind: "gate", gate: stageOp(0), inputs: [funcIds[0], funcIds[1]], label: "Z" });
    return { outputId: "Z", nodes };
  }
  if (M === 3) {
    const xId = intermName(0, "X");
    nodes.push({ id: xId, kind: "gate", gate: stageOp(0), inputs: [funcIds[0], funcIds[1]], label: xId });
    nodes.push({ id: "Z", kind: "gate", gate: stageOp(1), inputs: [xId, funcIds[2]], label: "Z" });
    return { outputId: "Z", nodes };
  }
  if (M === 4) {
    const xId = intermName(0, "X");
    const yId = intermName(1, "Y");
    nodes.push({ id: xId, kind: "gate", gate: stageOp(0), inputs: [funcIds[0], funcIds[1]], label: xId });
    nodes.push({ id: yId, kind: "gate", gate: stageOp(1), inputs: [funcIds[2], funcIds[3]], label: yId });
    nodes.push({ id: "Z", kind: "gate", gate: stageOp(2), inputs: [xId, yId], label: "Z" });
    return { outputId: "Z", nodes };
  }

  // M ≥ 5: 일반 binary tree
  let layer: string[] = [...funcIds];
  let stageIdx = 0;
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 >= layer.length) {
        next.push(layer[i]);
        continue;
      }
      const id = layer.length === 2 && next.length === 0
        ? "Z"
        : intermName(stageIdx, `G${stageIdx + 1}`);
      nodes.push({
        id,
        kind: "gate",
        gate: stageOp(stageIdx),
        inputs: [layer[i], layer[i + 1]],
        label: id,
      });
      stageIdx++;
      next.push(id);
    }
    layer = next;
  }
  const outputId = layer[0];
  // 마지막 node가 Z가 아니면 outputId를 Z로 rename
  if (outputId !== "Z") {
    const lastNode = nodes[nodes.length - 1];
    if (lastNode.kind === "gate") {
      nodes[nodes.length - 1] = { ...lastNode, id: "Z", label: "Z" };
      // 다른 노드들에서 outputId 참조 update 불필요 (마지막 node는 누구도 참조 안 함)
    }
  }
  return { outputId: "Z", nodes };
}

/**
 * Explicit LogicDAG 빌드 — analysis.signals.intermediateGates의 stage spec을 그대로 사용.
 *
 *   funcIds: 함수 leaf ids (f1, f2, ...) — function kind 노드로 자동 추가.
 *   gates: [{ id, op, inputs }] — 각 항목이 gate 노드. 배열의 마지막 항목 id를 outputId로 채택.
 *
 *   ★ intermediate signal X·Y 보존 절대 규칙 적용 path. flatten 금지.
 */
function buildExplicitDag(
  funcIds: readonly string[],
  gates: ReadonlyArray<{ id: string; op: GateOp; inputs: readonly string[] }>,
): LogicDAG {
  const nodes: LogicDAGNode[] = funcIds.map((id, i) => ({
    id,
    kind: "function",
    label: `f_${i + 1}`,
  }));
  for (const g of gates) {
    nodes.push({
      id: g.id,
      kind: "gate",
      gate: g.op,
      inputs: [...g.inputs],
      label: g.id,
    });
  }
  const outputId = gates.length > 0 ? gates[gates.length - 1].id : "Z";
  return { outputId, nodes };
}

/** Gate op → 식 표시용 기호. AND="·", OR="+", XOR="⊕", NAND="↑", NOR="↓", XNOR="⊙", NOT="¬". */
function opSymbolOf(op: GateOp): string {
  switch (op) {
    case "AND":  return "·";
    case "OR":   return "+";
    case "XOR":  return "⊕";
    case "NAND": return "↑";
    case "NOR":  return "↓";
    case "XNOR": return "⊙";
    case "NOT":  return "¬";
    default:     return op;
  }
}
