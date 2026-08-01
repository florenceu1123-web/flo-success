/**
 * 기호 파라미터 최대 전력 파이프라인 — universal 경로.
 *
 * "소자값이 기호 a의 상수배로 주어지고, 어떤 저항의 소비 전력이 최대가 되는 a와 P_M을 구하라"
 * (임용 6번 등) 형식을 **유형별 하드코드 없이** 처리한다.
 *
 * 원본 netlist(Vision의 componentInventory)를 그대로 쓰므로 종속원·토폴로지가 보존된다.
 * 답은 전부 MNA 반복 풀이에서 나오므로 회로가 달라져도 자동으로 맞는다.
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { netlistToSolverNetwork, detectNetlistParam, parseParamCoefficient } from "@/lib/solver/netlistToSolver";
import { buildParamMaxPowerProblem } from "@/lib/generation/paramMaxPowerWriter";
import { maximizeOverParam, resistorPowerMetric } from "@/lib/solver/paramSweep";
import type { AnalysisResult, CircuitNetlist, CircuitComponent, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runParamMaxPowerPipeline");

/** componentInventory(핀 포함)를 CircuitNetlist로. 핀이 없으면 회로를 세울 수 없으므로 null. */
export function inventoryToNetlist(analysis: AnalysisResult | null | undefined): CircuitNetlist | null {
  // inventory 항목은 타입상 {id,type,value,pins}지만 Vision이 control·gain을 함께 실어 보낼 수
  // 있다. ★ 종속원의 control(제어 저항 id)을 흘리면 종속원이 통째로 사라져 회로가 달라진다(실측).
  const inv = (analysis?.componentInventory ?? []) as Array<
    { id: string; type: string; value?: string; pins?: string[] } & { control?: string; gain?: string }
  >;
  if (inv.length < 3) return null;
  // ★ 노드 이름 정규화 — Vision이 같은 노드를 "n1"·"N1"처럼 대소문자만 다르게 적으면
  //   하나의 노드가 둘로 갈라져 회로가 통째로 달라진다(실측). 접지 표기도 GND로 모은다.
  const canonNode = (n: string) => {
    const t = n.trim();
    return /^(gnd|ground|0)$/i.test(t) ? "GND" : t.toUpperCase();
  };
  const components: CircuitComponent[] = [];
  for (const c of inv) {
    const pins = (c.pins ?? []).filter(Boolean);
    if (pins.length < 2 && c.type !== "GND") return null; // 핀 정보가 없으면 포기
    components.push({
      ...c,
      pins: pins.map((n) => ({ node: canonNode(n) })),
    } as unknown as CircuitComponent);
  }
  const hasGround = components.some((c) => (c.pins ?? []).some((p) => /^(GND|gnd|0|ground)$/i.test(p.node)));
  if (!hasGround) return null;
  coerceSupernodeSourceToVoltage(analysis, components);
  return { components } as CircuitNetlist;
}

/**
 * ★ 슈퍼노드 물리 규칙 기반 결정론 교정 (범용).
 *
 * "두 비접지 노드가 **슈퍼노드**를 이룬다"는 서술은 그 사이 소자가 **전압원**이라는 뜻이다
 * (슈퍼노드의 정의 자체). 전류원 사이에는 슈퍼노드가 생기지 않는다.
 * 그런데 Vision은 ◇ 종속원의 **모양**(전압원 ○+−인지 전류원 ↑인지)을 자주 뒤집어 읽는다
 * (실측 3/3에서 CCVS를 CCCS로). 값 표기("2i_x")만으로는 둘을 가를 수 없다.
 * → 본문이 슈퍼노드를 말하고, 두 비접지 노드 사이에 전류형 종속원이 있으면 전압형으로 교정한다.
 */
function coerceSupernodeSourceToVoltage(
  analysis: AnalysisResult | null | undefined,
  components: CircuitComponent[],
): void {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  if (!/슈퍼\s*노드|supernode|super\s*node/i.test(text)) return;
  const isGnd = (n: string) => /^(GND|gnd|0|ground)$/i.test(n);
  for (const c of components) {
    if (c.type !== "CCCS" && c.type !== "VCCS") continue;
    const pins = (c.pins ?? []).map((p) => p.node);
    if (pins.length < 2 || pins.some(isGnd)) continue; // 접지에 물리면 슈퍼노드 근거가 아니다
    const to = c.type === "CCCS" ? "CCVS" : "VCVS";
    log.info("supernode_dependent_source_coerced", { id: c.id, from: c.type, to, pins });
    c.type = to;
  }
}

/**
 * 전력을 볼 저항을 고른다.
 *  1순위: 본문에서 "저항 X …전력" 형태로 지목된 id
 *  2순위: 파라미터 계수가 가장 큰 저항 (원본의 R_B = 2a 처럼 부하가 더 큰 계수를 갖는 관례)
 */
export function pickTargetResistor(
  netlist: CircuitNetlist,
  param: string,
  text: string,
): string | null {
  const resistors = (netlist.components ?? []).filter((c) => c.type === "R");
  if (resistors.length === 0) return null;

  const mentioned = resistors.find((r) => {
    const idPat = r.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${idPat}[^.]{0,40}(전력|소비)`, "i").test(text);
  });
  if (mentioned) return mentioned.id;

  let best: string | null = null, bestCoef = -Infinity;
  for (const r of resistors) {
    const k = parseParamCoefficient(r.value, param);
    if (k !== null && k > bestCoef) { bestCoef = k; best = r.id; }
  }
  return best;
}

const DEP_TYPES = ["CCVS", "CCCS", "VCVS", "VCCS"];

/**
 * ★ 추출된 회로가 문제 설명과 모순되는지 검사한다.
 *
 * 본문이 "종속 전원이 포함된 회로"라고 말하는데 inventory에 종속원이 하나도 없으면,
 * Vision이 ◇를 독립 전원으로 오독한 것이다(실측). 그 회로로 문제를 만들면 **원본과 다른
 * 회로의 그럴듯한 답**이 나오는데, 이는 조용히 틀린 결과라 가장 나쁘다.
 * → 그런 경우엔 아예 생성하지 않는다.
 */
function contradictsStatedCircuit(
  analysis: AnalysisResult | null | undefined,
  netlist: CircuitNetlist,
): string | null {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  const saysDependent =
    /종속\s*(전원|전압원|전류원)|dependent\s*source|제어\s*(전압원|전류원)/.test(text) ||
    analysis?.topologySignature?.features?.hasDependentSource === true;
  const hasDependent = (netlist.components ?? []).some((c) => DEP_TYPES.includes(String(c.type)));
  if (saysDependent && !hasDependent) {
    return "본문은 종속 전원을 말하는데 추출된 회로에 종속원이 없음 (◇를 독립 전원으로 오독)";
  }

  /**
   * ★ 분기 없는 직렬 사슬 거부 (실측 신고: 모든 소자가 A—B 한 줄로 붙어 렌더링됨).
   * Vision의 pins가 무너지면 모든 소자가 같은 두 노드에 일렬로 이어져 **분기가 하나도 없는**
   * 회로가 나온다. 슈퍼노드·최대전력 문제는 반드시 병렬 분기(차수 3 이상 노드)를 갖는다.
   * 이런 회로로 답을 내면 원본과 무관한 값이 나오므로 생성하지 않는다.
   */
  const degree = new Map<string, number>();
  for (const c of netlist.components ?? []) {
    if (String(c.type) === "WIRE") continue;
    for (const p of c.pins ?? []) degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
  }
  const maxDegree = Math.max(0, ...degree.values());
  if (maxDegree < 3) {
    return `분기가 없는 직렬 사슬 (최대 노드 차수 ${maxDegree}) — pins 추출 실패로 원본 토폴로지가 소실됨`;
  }
  return null;
}

/**
 * 이 원본이 파라미터 최대 전력 **형식인가**(의도) — 복원 가능 여부와 별개.
 *
 * ★ detectParamMaxPower(복원 가능한가)와 구분해서 쓴다. 형식은 맞는데 복원에 실패한 경우
 *   기존 체인으로 흘려보내면 **원본과 무관한 회로를 새로 지어낸다**(실측: topology_driven이
 *   생판 다른 테브난 회로를 생성). 그럴 땐 조용히 다른 문제를 내는 대신 실패를 알려야 한다.
 */
export function isParamMaxPowerForm(analysis: AnalysisResult | null | undefined): boolean {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  if (!/최대|maximum|최댓값/.test(text) || !/전력|power/.test(text)) return false;
  const netlist = inventoryToNetlist(analysis);
  if (!netlist) return false;
  return detectNetlistParam(netlist) !== null;
}

/**
 * 소자값이 **기호 파라미터**로 주어지고 그 파라미터를 구하라는 문제인가 (형식 판정).
 *
 * ★ 이 형식은 전용 경로가 없으면 범용(universal_dc·topology_driven)이 받아서
 *   **전원이 통째로 사라진 엉뚱한 회로**를 만들어낸다(실측: 임용 5번 노튼 등가 —
 *   발문은 "전류원을 개방"이라는데 생성된 회로엔 전원이 하나도 없었다).
 *   구조·원리 유사성이 절대 규칙이므로, 그럴 바엔 실패를 알리는 편이 낫다.
 */
export function isSymbolicParamCircuitForm(analysis: AnalysisResult | null | undefined): boolean {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  if (!text.trim()) return false;
  // ★ 소자값이 기호인지는 **inventory**로 판단하는 것이 가장 확실하다 — Vision 요약 문장에는
  //   "a[Ω]"이 안 적히고 "a 값"만 남는 경우가 많다(실측: 임용 5번 노튼 등가).
  //   inventory가 비어 있을 때만 본문 표기로 대신 판단한다.
  const inv = analysis?.componentInventory ?? [];
  const symbolicInInventory = inv.some(
    (c) => ["R", "V", "I", "C", "L"].includes(c.type) && parseParamCoefficient(c.value, "a") !== null,
  );
  const symbolicValue =
    symbolicInInventory ||
    (inv.length === 0 && (
      /(^|[^A-Za-z])\d*\s*a\s*\[\s*(Ω|ohm|V|A)\s*\]/i.test(text) ||
      /(^|[^A-Za-z])\d*\s*a\s*(Ω|옴)/i.test(text) ||
      /R_?[A-Za-z]?\s*=\s*\d*\s*a(?![A-Za-z])/i.test(text)
    ));
  // 그 파라미터를 구하라는 요구 (한글 조사에 `\b`가 안 통하므로 형태를 열거)
  const asksForParam =
    /(^|[^A-Za-z])a\s*(값|를|의)\s*(구|찾|결정)/.test(text) ||
    /(^|[^A-Za-z])a\s*값/.test(text) ||
    /되도록\s*하는\s*(^|[^A-Za-z])?a/.test(text) ||
    /변수\s*a|파라미터\s*a/.test(text);
  return symbolicValue && asksForParam;
}

/** 복원 실패 사유를 사람이 읽을 수 있게 (실패 안내에 쓴다). */
export function paramMaxPowerFailureReason(analysis: AnalysisResult | null | undefined): string | null {
  const netlist = inventoryToNetlist(analysis);
  if (!netlist) return "회로 소자의 연결 정보(노드)를 추출하지 못했습니다.";
  return contradictsStatedCircuit(analysis, netlist);
}

/** 이 원본이 파라미터 최대 전력 형식이고 **복원까지 가능한지** — 라우팅 판정에 쓴다. */
export function detectParamMaxPower(analysis: AnalysisResult | null | undefined): boolean {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  // 최대 전력을 묻는 문맥이어야 한다.
  if (!/최대|maximum|최댓값/.test(text) || !/전력|power/.test(text)) return false;
  const netlist = inventoryToNetlist(analysis);
  if (!netlist) return false;
  if (detectNetlistParam(netlist) === null) return false;
  // 회로가 설명과 모순되면 이 경로를 타지 않는다.
  return contradictsStatedCircuit(analysis, netlist) === null;
}

/** 답으로 내보내기 깔끔한 값인가 — 정수이거나 분모가 작은 유리수. */
function isCleanValue(v: number): boolean {
  if (!Number.isFinite(v) || v <= 0) return false;
  for (const d of [1, 2, 4, 5, 8, 10]) {
    if (Math.abs(v * d - Math.round(v * d)) < 1e-6) return true;
  }
  return false;
}

/** 후보 회로 하나를 만들어 본다 (구조는 그대로, 지정한 수치만 교체). */
function withValues(
  netlist: CircuitNetlist,
  edits: Array<{ id: string; value: string }>,
): CircuitNetlist {
  const comps = (netlist.components ?? []).map((c) => {
    const e = edits.find((x) => x.id === c.id);
    return { ...c, value: e ? e.value : c.value, pins: c.pins?.map((p) => ({ ...p })) };
  });
  return { ...netlist, components: comps } as CircuitNetlist;
}

/**
 * 유사·변형 후보를 **규칙 열거 + 필터**로 만든다 (저장소 관례).
 *  · 유사 = 기호 배치를 유지한 채 **수치 상수**(비기호 저항·종속원 이득)만 교체
 *  · 변형 = 부하 저항의 **파라미터 계수**를 교체 (2a → 3a 등)
 *  후보마다 실제로 풀어 a*·P_M이 깔끔한 것만 남기고, 원본과 같은 조합은 제외한다.
 */
function enumerateCandidates(
  base: CircuitNetlist,
  param: string,
  targetId: string,
  mode: GenerationMode,
  solveFor: (nl: CircuitNetlist) => { aStar: number; pMax: number } | null,
): CircuitNetlist[] {
  const comps = base.components ?? [];
  const out: CircuitNetlist[] = [];
  const baseFacts = solveFor(base);

  if (mode === "exam_variant") {
    const cur = parseParamCoefficient(comps.find((c) => c.id === targetId)?.value, param) ?? 2;
    for (const k of [1, 2, 3, 4, 5]) {
      if (k === cur) continue;
      const cand = withValues(base, [{ id: targetId, value: `${k === 1 ? "" : k}${param}[Ω]` }]);
      const f = solveFor(cand);
      if (f && isCleanValue(f.aStar) && isCleanValue(f.pMax)) out.push(cand);
    }
    return out;
  }

  // 유사: 비기호 저항 + 종속원 이득의 조합을 열거.
  const numericRs = comps.filter((c) => c.type === "R" && parseParamCoefficient(c.value, param) === null);
  const deps = comps.filter((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(String(c.type)));
  const rPool = [1, 2, 3, 4, 5, 6, 8, 10];
  const gPool = [1, 2, 3, 4];
  for (const rv of rPool) {
    for (const gv of gPool) {
      const edits: Array<{ id: string; value: string }> = numericRs.map((c) => ({ id: c.id, value: `${rv}Ω` }));
      for (const d of deps) {
        const m = String(d.value ?? "").match(/^\s*-?\d*\.?\d*\s*(.*)$/);
        edits.push({ id: d.id, value: `${gv}${m?.[1] ?? "i_x"}` });
      }
      const cand = withValues(base, edits);
      const f = solveFor(cand);
      if (!f || !isCleanValue(f.aStar) || !isCleanValue(f.pMax)) continue;
      // 원본과 같은 답이면 제외 (유사문제가 원본 그대로면 안 된다).
      if (baseFacts && Math.abs(f.aStar - baseFacts.aStar) < 1e-6 && Math.abs(f.pMax - baseFacts.pMax) < 1e-6) continue;
      out.push(cand);
    }
  }
  return out;
}

export async function runParamMaxPowerPipeline(args: {
  analysis: AnalysisResult | null | undefined;
  mode: GenerationMode;
  count: number;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count } = args;
  const base = inventoryToNetlist(analysis);
  if (!base) return [];
  const param = detectNetlistParam(base);
  if (!param) return [];
  const contradiction = contradictsStatedCircuit(analysis, base);
  if (contradiction) {
    // 틀린 회로로 그럴듯한 문제를 만드느니 생성하지 않는다.
    log.warn("param_max_power_circuit_contradiction", { reason: contradiction });
    return [];
  }
  const text = [analysis?.topic, analysis?.interpretation].filter(Boolean).join(" ");
  const targetId = pickTargetResistor(base, param, text);
  if (!targetId) return [];

  log.info("param_max_power_dispatch", { param, targetId, mode, count });

  /** 후보 회로를 실제로 풀어 a*·P_M을 얻는다 (깔끔한 값 필터용). */
  const solveFor = (nl: CircuitNetlist) => {
    try {
      const mx = maximizeOverParam(
        (a) => netlistToSolverNetwork(nl, { name: param, value: a }).net,
        resistorPowerMetric(targetId),
        { min: 0.05, max: 200 },
      );
      if (mx.atBoundary || !Number.isFinite(mx.valueStar)) return null;
      return { aStar: mx.aStar, pMax: mx.valueStar };
    } catch { return null; }
  };

  const candidates = enumerateCandidates(base, param, targetId, mode, solveFor);
  if (candidates.length === 0) {
    log.warn("param_max_power_no_clean_candidate", { param, targetId, mode });
    return [];
  }
  log.info("param_max_power_candidates", { count: candidates.length, mode });

  const out: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const netlist = candidates[i % candidates.length];
    const build = (a: number) => netlistToSolverNetwork(netlist, { name: param, value: a }).net;

    // 부하 저항의 비접지 노드 = 전압 단계의 대상.
    const solverNet = build(1);

    // ★ 안전장치: 원본에 종속원이 있는데 솔버 회로에서 사라졌다면 회로가 달라진 것이다.
    //   그대로 풀면 **그럴듯하지만 틀린 답**이 나오므로 생성을 포기한다(실측: control 누락 시 발생).
    const depInNetlist = (netlist.components ?? []).filter((c) =>
      ["CCVS", "CCCS", "VCVS", "VCCS"].includes(String(c.type)),
    ).length;
    const depInSolver = (solverNet.vcvs?.length ?? 0) + (solverNet.vccs?.length ?? 0);
    if (depInNetlist > depInSolver) {
      log.warn("param_max_power_dependent_source_lost", { depInNetlist, depInSolver, targetId });
      continue;
    }
    const tr = solverNet.resistors.find((r) => r.id === targetId);
    const targetNode = tr ? (tr.a === solverNet.groundId ? tr.b : tr.a) : undefined;

    const prob = buildParamMaxPowerProblem({
      build, param, targetResistorId: targetId, targetNodeId: targetNode,
      labels: { resistor: targetId, voltage: `V_{${targetId}}`, power: `P_{${targetId}}` },
    });
    if (!prob) { log.warn("param_max_power_build_failed", { i, param, targetId }); continue; }

    const figureVariants: FigureVariant[] = [{
      id: `fig_param_${i + 1}`,
      label: "주어진 회로",
      role: "original_circuit",
      diagramType: "analog_netlist",
      diagram: netlist,
    } as FigureVariant];

    const targetVal = (netlist.components ?? []).find((c) => c.id === targetId)?.value ?? `${param}[Ω]`;
    out.push({
      id: randomUUID(),
      content:
        `그림은 독립 전원과 종속 전원이 포함된 회로이다. 저항 \\( ${targetId} = ${String(targetVal).replace(/\[Ω\]/, "\\,[\\Omega]")} \\)에서 ` +
        `소비되는 전력이 최대가 되도록 하는 \\( ${param} \\)값과, 이때의 전력 \\( P_M\\,[\\mathrm{W}] \\)을 ` +
        `제시된 〈해석 절차〉에 따라 구하여 순서대로 서술하시오. (단, \\( ${param} > 0 \\)이다.)`,
      conditions: [
        `소자값에 쓰인 \\( ${param} \\)는 양의 실수이고, 계산식의 기호는 그대로 둔다.`,
      ],
      question: prob.question,
      answer: prob.answer,
      solution: prob.steps.join("\n"),
      topicKey: "supernode" as TopicKey,
      figureVariants,
    } satisfies GeneratedProblem);
  }
  return out;
}
