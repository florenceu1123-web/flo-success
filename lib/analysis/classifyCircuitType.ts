import type {
  AnalysisResult,
  CircuitType,
  CircuitTypeClassification,
  CircuitTypeParams,
  SubjectKey,
  TopicKey,
} from "@/types";

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
  // electronics: opamp만 우선 처리, 나머지(BJT/MOSFET 등)는 후속
  if (subject === "electronics") {
    const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""}`;
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
    if (analysis.topicKey === "flipflop_counter" || matchesKeyword(text, ["플립플롭", "flip-flop", "flipflop", "카운터", "counter", "순차", "동기식"])) {
      return {
        type: "flipflop_counter",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + 플립플롭/카운터 키워드/topic",
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

  const { type, confidence, reasoning } = decideType({
    topicKey,
    features,
    semantic,
    counts,
    text,
  });

  return { type, params, confidence, reasoning };
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
  text: string;
};

type DecideResult = { type: CircuitType; confidence: "high" | "medium" | "low"; reasoning: string };

function decideType(args: DecideArgs): DecideResult {
  const { topicKey, features, semantic, counts, text } = args;

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

  // 3. 등가회로 — 텍스트 키워드 + topic 보조
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
