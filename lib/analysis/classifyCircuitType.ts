import type {
  AnalysisResult,
  CircuitType,
  CircuitTypeClassification,
  CircuitTypeParams,
  SubjectKey,
  TopicKey,
} from "@/types";
import { createLogger } from "@/lib/logger";

const classifierLog = createLogger("lib/analysis/classifyCircuitType");

/**
 * AnalysisResult에서 CircuitType과 generator-friendly params를 derive한다.
 *
 *  Inputs (analysis로부터):
 *    - topicKey (mesh_analysis | nodal_analysis | transient_rc | ...)
 *    - semantic flags (hasStateTransition, hasEquivalentTransformation, hasWaveformEvolution)
 *    - topologySignature.features (hasSwitch, hasSupermesh, meshCount, hasDependentSource)
 *    - componentInventory (R/V/I/C/L 카운트 추출)
 *    - interpretation 텍스트 (테브난/노턴 키워드 보조)
 *
 *  Outputs:
 *    - type: CircuitType
 *    - params: 소자 카운트 + 의미 플래그
 *    - confidence: 분류 강도
 *
 *  electronics / digital_logic은 unsupported로 fallback (현 phase 외).
 */
export function classifyCircuitType(
  analysis: AnalysisResult,
  subject: SubjectKey,
): CircuitTypeClassification {
  // mixed_signal: 전자회로 + 디지털논리회로 혼합 — 임용 8번 (2-bit JK 카운터 + DAC + 비교기) 등
  if (subject === "mixed_signal") {
    const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""}`;
    const counterDacComparatorKeywords = [
      "2비트 카운터", "2-bit 카운터", "2비트 동기식", "2-bit 동기식",
      "카운터와 d/a", "카운터 + d/a", "카운터·d/a",
      "d/a 변환기", "dac", "디지털 아날로그",
      "비교기", "comparator",
      "jk 플립플롭", "jk-ff", "jk플립플롭",
      "r-2r", "r2r",
    ];
    if (analysis.topicKey === "counter_dac_comparator" || matchesKeyword(text, counterDacComparatorKeywords)) {
      return {
        type: "counter_dac_comparator",
        params: {},
        confidence: "high",
        reasoning: "mixed_signal + 카운터/DAC/비교기 키워드",
      };
    }
    return {
      type: "unsupported",
      params: {},
      confidence: "low",
      reasoning: "mixed_signal subject지만 archetype 미지원",
    };
  }
  // electronics: opamp만 우선 처리, 나머지(BJT/MOSFET 등)는 후속
  if (subject === "electronics") {
    const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""}`;
    const family = analysis.topologySignature?.family;
    // BJT DC bias 회로 — small_signal보다 우선. DC bias 특유 키워드 또는 family="bjt_bias".
    const bjtBiasKeywords = [
      "직류 바이어스", "직류바이어스", "dc bias", "dc 바이어스",
      "v_be = 0.7", "vbe = 0.7", "v_be=0.7", "vbe=0.7",
      "이미터 전압 v_e", "이미터 전압",
      "저항률", "resistivity",
      "i_e = i_c", "ie = ic", "i_e≈i_c",
      "동작점", "operating point",
      "베이스단", "베이스 단",
    ];
    if (family === "bjt_bias" || matchesKeyword(text, bjtBiasKeywords)) {
      return {
        type: "bjt_bias",
        params: {},
        confidence: "high",
        reasoning: "electronics + BJT DC bias 키워드/family",
      };
    }
    // BJT 소신호 등가
    if (analysis.topicKey === "bjt_amplifier" || matchesKeyword(text, ["BJT", "트랜지스터", "소신호", "small-signal", "small signal", "hybrid-π", "hybrid pi", "공통 에미터", "common emitter", "common-emitter", "공통에미터", "g_m", "r_π", "r_pi", "베이스", "컬렉터", "에미터"])) {
      return {
        type: "bjt_small_signal",
        params: {},
        confidence: "high",
        reasoning: "electronics + BJT 소신호 키워드/topic",
      };
    }
    // 시간영역 OPAMP (integrator/differentiator) 키워드가 명시되면 우선
    if (matchesKeyword(text, ["적분기", "미분기", "integrator", "differentiator", "적분", "미분"])) {
      return {
        type: "opamp_time_domain",
        params: {},
        confidence: "high",
        reasoning: "electronics + 적분기/미분기 키워드",
      };
    }
    if (analysis.topicKey === "opamp" || matchesKeyword(text, ["opamp", "op-amp", "op amp", "연산증폭기", "OPAMP", "U1"])) {
      return {
        type: "opamp",
        params: {},
        confidence: "high",
        reasoning: "electronics + opamp 키워드/topic",
      };
    }
    // ★ subject=electronics이지만 회로이론 패턴(SW·supermesh·dep source + R/V/I)이면
    //   회로이론 결정론 archetype으로 redirect. 사용자 contract "GPT 회로 생성 금지"를
    //   보호. (사용자가 subject를 잘못 선택한 케이스 또는 cross-subject hybrid 회로.)
    const features = analysis.topologySignature?.features ?? {};
    const hasCircuitTheoryHybrid =
      Boolean(features.hasSwitch) || Boolean(features.hasSupermesh) ||
      Boolean(features.hasDependentSource) || Boolean(features.hasMesh);
    if (hasCircuitTheoryHybrid) {
      if (features.hasSupermesh) {
        return {
          type: "dc_supermesh",
          params: {},
          confidence: "low",
          reasoning: "electronics fallback: supermesh feature → 회로이론 dc_supermesh path",
        };
      }
      if (features.hasDependentSource) {
        return {
          type: "dc_dependent_source",
          params: {},
          confidence: "low",
          reasoning: "electronics fallback: dependent source → 회로이론 dc_dependent_source path",
        };
      }
      return {
        type: "dc_mesh",
        params: {},
        confidence: "low",
        reasoning: "electronics fallback: SW/mesh → 회로이론 dc_mesh path",
      };
    }
    return {
      type: "unsupported",
      params: {},
      confidence: "high",
      reasoning: `electronics 의 ${analysis.topicKey ?? "(unknown)"} 은 현 phase netlist generator 범위 밖`,
    };
  }
  // digital_logic: kmap_sop / kmap_pos / flipflop_counter, 나머지(FSM 등)는 후속
  if (subject === "digital_logic") {
    const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""}`;
    // FF + 파형 + (선택)비동기 RESET — 임용 8번 형식 (waveform_analysis보다 우선).
    // FF 검출은 키워드 외에도 (a) hasStateTransition flag, (b) signals.outputs에 Q 존재로도 추론.
    const ffKwText = matchesKeyword(text, ["플립플롭", "flip-flop", "flipflop", "FF", "D-FF", "T-FF", "JK-FF"]);
    const outputsHaveQ = (analysis.signals?.outputs ?? []).some((s) => /^Q\d*$|^Q_/.test(s) || s === "Q");
    const ffInferred = ffKwText || Boolean(analysis.semantic?.hasStateTransition) || outputsHaveQ;
    const waveformKw = matchesKeyword(text, ["입력 파형", "출력 파형", "타이밍도", "timing diagram", "사각파", "파형"]);
    const resetKw = matchesKeyword(text, ["RESET", "리셋", "비동기 리셋", "비동기 RESET", "asynchronous reset"]);
    const asyncKw = matchesKeyword(text, ["비동기", "asynchronous"]);
    const propDelayKw = matchesKeyword(text, ["전파 지연", "propagation delay", "버퍼 지연", "버퍼의 전파", "tp"]);
    // 입력 A·B·C + 출력 Q 또는 X·Y 패턴 — 임용 8번 시그니처
    const inputs = analysis.signals?.inputs ?? [];
    const hasInputsABC = ["A", "B", "C"].every((v) => inputs.includes(v));
    const outputs = analysis.signals?.outputs ?? [];
    const hasOutputsXY = outputs.includes("X") || outputs.includes("Y");
    // ff_with_waveform 매치 — 파형 키워드 외에도 RESET/비동기/전파지연/입력ABC 시그니처로도 매치.
    // 임용 8번 텍스트에서 "파형" 키워드가 빠진 경우에도 분류가 안정적이도록 조건 완화.
    const ffWaveformMatch =
      ffInferred && (waveformKw || resetKw || asyncKw || propDelayKw || (hasInputsABC && (outputsHaveQ || hasOutputsXY)));
    if (ffWaveformMatch) {
      const ffTypes: Array<"D" | "T" | "JK"> = [];
      if (matchesKeyword(text, ["D 플립플롭", "D-FF", "D 플립"])) ffTypes.push("D");
      if (matchesKeyword(text, ["T 플립플롭", "T-FF", "T 플립"])) ffTypes.push("T");
      if (matchesKeyword(text, ["JK 플립플롭", "JK-FF", "JK 플립"])) ffTypes.push("JK");
      // hasAsyncReset: RESET 키워드 명시 detect 시 true. 그 외엔 omit해서 archetype default(true)가 적용되도록.
      const params: CircuitTypeParams = {};
      if (ffTypes.length > 0) params.ffTypes = ffTypes;
      if (resetKw || asyncKw) params.hasAsyncReset = true;
      const reasons: string[] = ["FF"];
      if (waveformKw) reasons.push("파형");
      if (resetKw || asyncKw) reasons.push("RESET/비동기");
      if (propDelayKw) reasons.push("전파지연(tp)");
      if (hasInputsABC) reasons.push("입력 A·B·C");
      return {
        type: "ff_with_waveform",
        params,
        confidence: "high",
        reasoning: `digital_logic + ${reasons.join(" + ")}`,
      };
    }
    if (analysis.topicKey === "waveform_analysis" || matchesKeyword(text, ["입력 파형", "출력 파형", "타이밍도", "timing diagram", "사각파", "파형 분석"])) {
      return {
        type: "waveform_analysis",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + 파형 분석 키워드/topic",
      };
    }
    if (analysis.topicKey === "fsm" || matchesKeyword(text, ["FSM", "유한 상태", "유한상태", "Mealy", "Moore", "상태 기계", "상태 머신", "상태 전이도", "상태천이도"])) {
      return {
        type: "fsm",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + FSM 키워드/topic",
      };
    }
    // T·JK 또는 둘 이상 FF 타입 혼합 + 상태표/파형이 있는 응용회로는 flipflop_mixed_app로 분류 (flipflop_counter보다 우선)
    const hasTFf = matchesKeyword(text, ["T 플립플롭", "T-FF", "T 플립", "T-플립", "T flip-flop", "T flipflop"]);
    const hasJkFf = matchesKeyword(text, ["JK 플립플롭", "JK-FF", "JK 플립", "JK-플립", "JK flip-flop", "JK flipflop"]);
    const hasStateTableKw = matchesKeyword(text, ["상태표", "상태 표", "다음 상태", "현재 상태", "state table"]);
    const hasWaveformKw = matchesKeyword(text, ["파형", "타이밍도", "timing diagram", "waveform", "출력 파형"]);
    if ((hasTFf && hasJkFf) || ((hasTFf || hasJkFf) && (hasStateTableKw || hasWaveformKw))) {
      const ffTypes: Array<"D" | "T" | "JK"> = [];
      if (hasTFf) ffTypes.push("T");
      if (hasJkFf) ffTypes.push("JK");
      if (ffTypes.length === 0) ffTypes.push("T");
      return {
        type: "flipflop_mixed_app",
        params: {
          ffTypes,
          hasStateTable: hasStateTableKw,
          hasWaveform: hasWaveformKw,
        },
        confidence: "high",
        reasoning: `digital_logic + ${ffTypes.join("·")}-FF 혼합 응용회로 (상태표/파형 동반)`,
      };
    }
    // flipflop_counter — "카운터" 의미가 명시적이어야 매치. 단순히 "플립플롭" 키워드만으로는 매치 안 됨.
    //   임용 8번처럼 FF가 있지만 카운터가 아닌 응용회로가 잘못 잡히지 않도록.
    if (
      analysis.topicKey === "flipflop_counter" ||
      matchesKeyword(text, ["카운터", "counter", "모듈로", "modulo", "분주", "분주기", "계수기", "동기식 카운터", "비동기식 카운터"])
    ) {
      return {
        type: "flipflop_counter",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + 카운터/계수기 키워드/topic",
      };
    }
    // K-map + 회로 빈칸 게이트 (ⓐ/ⓑ 등)이 함께 나오면 multi-output 조합회로로 분류 — kmap_sop보다 우선.
    // 임용 표준 패턴: 같은 입력에 대한 두 출력(X·Y) K-map 2개 + 회로의 빈칸 게이트.
    if (matchesKeyword(text, KMAP_KEYWORDS) && matchesKeyword(text, BLANK_GATE_KEYWORDS)) {
      return {
        type: "combinational_gate",
        params: { kmapBlankCount: 2 },
        confidence: "high",
        reasoning: "K-map + 빈칸 게이트(ⓐ/ⓑ) → multi-output 조합회로 (kmap_sop 우선 매치)",
      };
    }
    if (analysis.topicKey === "combinational_gate" || matchesKeyword(text, COMBINATIONAL_KEYWORDS)) {
      const params: CircuitTypeParams = {};
      if (matchesKeyword(text, BLANK_GATE_KEYWORDS)) params.kmapBlankCount = 2;
      return {
        type: "combinational_gate",
        params,
        confidence: "high",
        reasoning: "digital_logic + 조합회로 키워드/topic",
      };
    }
    if (analysis.topicKey === "kmap_pos" || matchesKeyword(text, ["POS", "PI 곱", "곱의 합 dual", "최소 곱항"])) {
      return {
        type: "kmap_pos",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + POS 키워드/topic",
      };
    }
    if (analysis.topicKey === "kmap_sop" || matchesKeyword(text, ["k-map", "kmap", "카르노", "SOP", "최소화"])) {
      return {
        type: "kmap_sop",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + K-map/SOP 키워드/topic",
      };
    }
    return {
      type: "unsupported",
      params: {},
      confidence: "high",
      reasoning: `digital_logic 의 ${analysis.topicKey ?? "(unknown)"} 은 현 phase 범위 밖`,
    };
  }
  if (subject !== "circuit_theory") {
    return {
      type: "unsupported",
      params: {},
      confidence: "high",
      reasoning: `subject=${subject} 은 현 phase의 netlist generator 범위 밖`,
    };
  }

  const counts = aggregateComponentCounts(analysis);
  const features: Partial<NonNullable<AnalysisResult["topologySignature"]>["features"]> =
    analysis.topologySignature?.features ?? {};
  const semantic: Partial<NonNullable<AnalysisResult["semantic"]>> = analysis.semantic ?? {};
  const topicKey = analysis.topicKey;
  const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`;

  const params: CircuitTypeParams = {
    resistorCount: counts.R,
    vSourceCount: counts.V,
    iSourceCount: counts.I,
    capacitorCount: counts.C,
    inductorCount: counts.L,
    switchCount: counts.SW,
    dependentSourceCount: counts.dep,
    meshCount: features.meshCount,
    hasDependentSource: features.hasDependentSource,
    hasStateTransition: Boolean(semantic.hasStateTransition || features.hasSwitch),
    hasWaveform: Boolean(semantic.hasWaveformEvolution),
    hasTerminalPort: matchesKeyword(text, EQUIVALENT_KEYWORDS),
    hasLoadPlaceholder: matchesKeyword(text, LOAD_PLACEHOLDER_KEYWORDS),
  };

  // inventory의 V·I value/label에 phasor 패턴(∠, j숫자) 있는지 — GPT 텍스트 키워드가
  // 부족할 때를 위한 안전망. 임용 10번처럼 텍스트에 키워드가 빠지더라도 inventory에서 매치.
  const inv = analysis.componentInventory ?? [];
  const hasACInventory = inv.some((c) => {
    if (c.type !== "V" && c.type !== "I" && c.type !== "L" && c.type !== "C") return false;
    const v = String(c.value ?? "");
    return /∠|\bj\s*\d|페이저|phasor|cos\s*\(|sin\s*\(|ωt/i.test(v);
  });

  const decision = decideType({
    topicKey,
    features,
    semantic,
    counts,
    text,
    hasACInventory,
  });

  // decide가 추가 hint params를 줬으면 외부 base params에 merge.
  const finalParams: CircuitTypeParams = { ...params, ...(decision.params ?? {}) };
  classifierLog.info("classify_result", {
    type: decision.type,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    counts,
    hasACInventory,
    textPreview: text.slice(0, 200),
  });
  return { type: decision.type, params: finalParams, confidence: decision.confidence, reasoning: decision.reasoning };
}

// ─── 키워드 셋 ─────────────────────────────────
const EQUIVALENT_KEYWORDS = [
  "테브난", "테브닌", "thevenin",
  "노턴", "norton",
  "등가회로", "등가저항", "단자 a", "단자 b", "a-b", "ab간", "ab 단자",
];
const LOAD_PLACEHOLDER_KEYWORDS = [
  "R_L", "RL", "부하 저항", "부하저항", "load resistor", "max power", "최대 전력", "최대전력",
];
const NORTON_KEYWORDS = ["노턴", "norton"];
const MAX_POWER_KEYWORDS = ["최대 전력", "최대전력", "max power transfer", "maximum power"];
const SUPERMESH_KEYWORDS = ["슈퍼메시", "supermesh", "super mesh"];
const SUPERNODE_KEYWORDS = ["슈퍼노드", "supernode", "super node"];
// AC 중첩의 원리 — 임용 10번 형식
const SUPERPOSITION_KEYWORDS = [
  "중첩의 원리", "중첩원리", "중첩 원리", "superposition",
];
const AC_PHASOR_KEYWORDS = [
  "페이저", "phasor", "∠", "교류 전압원", "교류 전류원", "교류 전압", "교류 전류",
  "교류", "ac source", "ac 회로",
  "정현파", "ωt", "sin(", "cos(", "ω t", "ω·t",
  "v_s(t)", "i_s(t)", "v_s (t)", "i_s (t)",
  "임피던스", "impedance",
];

// 디지털 — K-map 본문 키워드 (kmap_sop/pos·combinational_gate 분기 공용)
const KMAP_KEYWORDS = ["k-map", "kmap", "카르노", "karnaugh"];
// 다중 출력 조합회로 키워드 ("조합논리회로"는 "조합회로"를 substring으로 포함하지 않으므로 별도 등록)
const COMBINATIONAL_KEYWORDS = [
  "조합 회로", "조합회로", "조합논리회로", "조합 논리회로", "조합 논리 회로", "조합논리", "조합 논리",
  "다중 출력", "다중출력", "두 출력", "2개 출력", "multi-output", "combinational",
];
// 회로 내 학생-채움 빈칸 게이트 — 임용 ⓐ ⓑ ⓒ ⓓ 또는 "들어갈 (논리)게이트" 표현
const BLANK_GATE_KEYWORDS = [
  "ⓐ", "ⓑ", "ⓒ", "ⓓ", "들어갈 논리게이트", "들어갈 논리 게이트", "들어갈 게이트", "들어갈 논리",
];

function matchesKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

// ─── component count 집계 ──────────────────────
type Counts = {
  R: number; V: number; I: number; C: number; L: number; SW: number; dep: number;
};

function aggregateComponentCounts(analysis: AnalysisResult): Counts {
  const c: Counts = { R: 0, V: 0, I: 0, C: 0, L: 0, SW: 0, dep: 0 };
  const inv = analysis.componentInventory ?? [];
  if (inv.length > 0) {
    for (const item of inv) {
      bumpCount(c, item.type);
    }
    return c;
  }
  // fallback: topologySignature.branches에서 집계
  const branches = analysis.topologySignature?.branches ?? [];
  for (const b of branches) {
    for (const comp of b.components ?? []) {
      bumpCount(c, comp.type);
    }
  }
  return c;
}

function bumpCount(c: Counts, type: string): void {
  const t = (type ?? "").toUpperCase();
  if (t === "R") c.R++;
  else if (t === "V") c.V++;
  else if (t === "I") c.I++;
  else if (t === "C") c.C++;
  else if (t === "L") c.L++;
  else if (t === "SW") c.SW++;
  else if (t === "VCVS" || t === "VCCS" || t === "CCVS" || t === "CCCS") c.dep++;
}

// ─── 분류 로직 ─────────────────────────────────
type DecideArgs = {
  topicKey: TopicKey | undefined;
  features: Partial<NonNullable<AnalysisResult["topologySignature"]>["features"]>;
  semantic: Partial<NonNullable<AnalysisResult["semantic"]>>;
  counts: Counts;
  hasACInventory?: boolean;
  text: string;
};

type DecideResult = {
  type: CircuitType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  /** decide 단계에서 결정되는 generator hint params (외부 기본 params에 merge). */
  params?: CircuitTypeParams;
};

function decideType(args: DecideArgs): DecideResult {
  const { topicKey, features, semantic, counts, text, hasACInventory } = args;

  // 0. AC 중첩의 원리 — 모든 분류보다 우선 (임용 10번 형식).
  //    트리거: (a) 명시적 "중첩" 키워드 OR
  //            (b) AC/페이저 키워드 OR
  //            (c) j임피던스/∠ 표기 매치 OR
  //            (d) inventory의 V·I·L·C value에 phasor 패턴 (안전망 — 텍스트 키워드 부족 시) OR
  //            (e) V·I 다중 + C 또는 L 존재 (임용 10번 시그니처)
  const isSuperpositionText = matchesKeyword(text, SUPERPOSITION_KEYWORDS) || matchesKeyword(text, ["중첩"]);
  const isACText = matchesKeyword(text, AC_PHASOR_KEYWORDS);
  const hasJImpedancePattern = /[+\-]?\bj\s*\d+\s*[Ωohm]/i.test(text) || /∠/.test(text);
  const hasBothSources = counts.V > 0 && counts.I > 0;
  const hasReactive = counts.C > 0 || counts.L > 0;
  const acSuperpositionMatch =
    isSuperpositionText ||
    isACText ||
    hasJImpedancePattern ||
    Boolean(hasACInventory) ||
    (hasBothSources && hasReactive);
  if (acSuperpositionMatch) {
    const reasons: string[] = [];
    if (isSuperpositionText) reasons.push("중첩 키워드");
    if (isACText) reasons.push("AC/페이저 키워드");
    if (hasJImpedancePattern) reasons.push("j임피던스 패턴");
    if (hasACInventory) reasons.push("inventory phasor");
    if (hasBothSources) reasons.push(`V·I 다중(V=${counts.V},I=${counts.I})`);
    if (hasReactive) reasons.push(`C/L 존재(C=${counts.C},L=${counts.L})`);
    return {
      type: "ac_superposition",
      confidence: "high",
      reasoning: `AC 중첩 매치 — ${reasons.join(", ")}`,
    };
  }

  // 1. 과도응답 — 가장 우선 (capacitor/inductor가 있으면 다른 분류보다 우선)
  if (topicKey === "transient_rc" || (counts.C > 0 && semantic.hasWaveformEvolution)) {
    if (counts.SW > 0) {
      return { type: "switched_rc", confidence: "high", reasoning: "C 존재 + 스위치 → switched_rc" };
    }
    return { type: "rc_step", confidence: "high", reasoning: "C 존재 + 과도 → rc_step" };
  }
  if (topicKey === "transient_rl" || (counts.L > 0 && semantic.hasWaveformEvolution)) {
    if (counts.SW > 0) {
      return { type: "switched_rl", confidence: "high", reasoning: "L 존재 + 스위치 → switched_rl" };
    }
    return { type: "rl_step", confidence: "high", reasoning: "L 존재 + 과도 → rl_step" };
  }
  if (topicKey === "rlc_response" || (counts.C > 0 && counts.L > 0)) {
    return { type: "rlc_step", confidence: "high", reasoning: "C+L 존재 → rlc_step" };
  }

  // 2. 슈퍼메시/슈퍼노드 — features 우선
  if (features.hasSupermesh || topicKey === "supermesh" || matchesKeyword(text, SUPERMESH_KEYWORDS)) {
    return { type: "dc_supermesh", confidence: "high", reasoning: "supermesh 특징 또는 키워드" };
  }
  if (topicKey === "supernode" || matchesKeyword(text, SUPERNODE_KEYWORDS)) {
    return { type: "dc_supernode", confidence: "high", reasoning: "supernode 특징 또는 키워드" };
  }

  // 3. 등가회로 — 텍스트 키워드 + topic 보조.
  // 종속 전원이 함께 있어도 등가회로(Thevenin/Norton/max_power) 우선.
  // params.hasDependentSource는 외부에서 features 기반으로 자동 전달되어 generator가 archetype 선택.
  const isEquivalent = semantic.hasEquivalentTransformation
    || matchesKeyword(text, EQUIVALENT_KEYWORDS);
  if (isEquivalent) {
    if (matchesKeyword(text, MAX_POWER_KEYWORDS)) {
      return { type: "max_power_transfer", confidence: "high", reasoning: "최대전력 키워드" };
    }
    if (matchesKeyword(text, NORTON_KEYWORDS)) {
      return { type: "norton", confidence: "high", reasoning: "노턴 키워드" };
    }
    return { type: "thevenin", confidence: "medium", reasoning: "등가회로 컨텍스트 → thevenin (norton 키워드 없으면 thevenin 기본)" };
  }

  // 4. 종속전원
  if (features.hasDependentSource || counts.dep > 0 || topicKey === "dependent_source") {
    return { type: "dc_dependent_source", confidence: "high", reasoning: "종속전원 존재" };
  }

  // 5. 스위치만 단독 (C/L 없는 dc 스위칭) — 두 DC 정상상태 비교 문제
  if ((counts.SW > 0 || topicKey === "switching_circuit") && counts.C === 0 && counts.L === 0) {
    return { type: "switched_dc", confidence: "high", reasoning: "스위치 존재, C/L 없음 → DC 스위칭" };
  }
  // 스위치 + (C 또는 L) — 보수적 fallback
  if (counts.SW > 0) {
    return { type: counts.C > 0 ? "switched_rc" : "switched_rl", confidence: "medium", reasoning: "스위치 + 에너지 저장소자" };
  }

  // 6. nodal vs mesh — topicKey 우선
  if (topicKey === "nodal_analysis") {
    return { type: "dc_nodal", confidence: "high", reasoning: "topicKey=nodal_analysis" };
  }
  if (topicKey === "mesh_analysis") {
    return { type: "dc_mesh", confidence: "high", reasoning: "topicKey=mesh_analysis" };
  }
  if (topicKey === "dc_resistive") {
    // meshCount로 분기
    const m = features.meshCount ?? 1;
    if (m >= 2) {
      return { type: "dc_mesh", confidence: "medium", reasoning: "dc_resistive + meshCount≥2 → dc_mesh" };
    }
    return { type: "dc_nodal", confidence: "low", reasoning: "dc_resistive 단순회로 → dc_nodal fallback" };
  }

  // ★ 회로이론 fallback — system.ts의 "GPT 회로 생성 금지" contract 보호.
  //   classify가 unsupported로 분류하면 GPT free generation으로 가서 회로를 GPT가 만듦.
  //   회로이론(R/V/I만 있는 케이스)이면 무조건 결정론 generator(dc_mesh)로 보내 contract 유지.
  //   R/V/I 조차 없으면 그제야 unsupported.
  if (counts.R > 0 || counts.V > 0 || counts.I > 0) {
    // 등가회로 표현이 본문에 살짝이라도 있으면 thevenin
    if (matchesKeyword(text, EQUIVALENT_KEYWORDS) || matchesKeyword(text, LOAD_PLACEHOLDER_KEYWORDS)) {
      if (matchesKeyword(text, MAX_POWER_KEYWORDS)) {
        return { type: "max_power_transfer", confidence: "low", reasoning: "fallback: 등가회로 키워드 약매치 + 최대전력" };
      }
      return { type: "thevenin", confidence: "low", reasoning: "fallback: 등가회로 키워드 약매치 → thevenin 결정론 path" };
    }
    return {
      type: "dc_mesh",
      confidence: "low",
      reasoning: "fallback: R/V/I 있는 회로이론 → dc_mesh 결정론 path (GPT 자유 회로 생성 금지)",
    };
  }

  return {
    type: "unsupported",
    confidence: "low",
    reasoning: `분류 실패: topicKey=${topicKey} (R/V/I 모두 없음)`,
  };
}
