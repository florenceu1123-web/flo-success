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
      "3비트 카운터", "3-bit 카운터", "3비트 동기식", "3-bit 동기식",
      "카운터와 d/a", "카운터 + d/a", "카운터·d/a",
      "d/a 변환기", "dac", "디지털 아날로그",
      "비교기", "comparator",
      "jk 플립플롭", "jk-ff", "jk플립플롭",
      "r-2r", "r2r",
      "동기식 카운터",  // 일반 동기식 카운터 키워드
    ];
    // inventory 기반 robust 매치 — OPAMP가 있으면 비교기 가능성 높음.
    //   GPT 키워드 추출이 부족해도 mixed_signal subject + OPAMP면 counter_dac_comparator로.
    const inv = analysis.componentInventory ?? [];
    const hasOpAmp = inv.some((c) => String(c.type ?? "").toUpperCase() === "OPAMP");
    const hasJKorFF = inv.some((c) => {
      const t = String(c.type ?? "").toUpperCase();
      return t === "JKFF" || t === "JK" || t === "FF" || t === "DFF" || t === "TFF";
    });
    if (
      analysis.topicKey === "counter_dac_comparator" ||
      matchesKeyword(text, counterDacComparatorKeywords) ||
      hasOpAmp ||  // OPAMP 있으면 비교기 가능성 강함
      hasJKorFF    // JK/D/T FF 있으면 카운터 가능성
    ) {
      return {
        type: "counter_dac_comparator",
        params: {},
        confidence: "high",
        reasoning: `mixed_signal + ${hasOpAmp ? "OPAMP inventory + " : ""}${hasJKorFF ? "FF inventory + " : ""}카운터/DAC/비교기 키워드`,
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
    // ★ BJT/MOSFET 출력특성곡선 (영역 식별 + ON/OFF) — 개념·도식 해석형.
    //   bjt_bias·bjt_small_signal·mosfet_*보다 먼저 매치.
    //   트리거: 특성곡선/출력특성/동작영역 키워드 + 영역 marker(㉠/㉡/㉢) 또는 영역명 키워드.
    const characteristicCurveKeywords = [
      "출력특성곡선", "출력 특성 곡선", "특성곡선", "특성 곡선",
      "동작 영역", "동작영역", "영역의 명칭",
      "스위칭 동작", "스위칭동작",
      "i_c 변화", "ic 변화", "i_d 변화", "id 변화",
      "i_c-v_ce", "i_c vs v_ce", "ic-vce", "ic vs vce",
      "i_d-v_ds", "i_d vs v_ds", "id-vds", "id vs vds",
      "포화 영역", "포화영역", "활성 영역", "활성영역", "차단 영역", "차단영역",
      "트라이오드", "triode",
      "여러 개의 i_b", "여러개의 i_b", "여러 i_b", "다중 i_b",
      "여러 개의 v_gs", "여러개의 v_gs",
      "㉠", "㉡", "㉢",
      "characteristic curve", "output characteristics",
    ];
    if (matchesKeyword(text, characteristicCurveKeywords)) {
      // device 추론 — MOSFET 키워드 있으면 MOSFET 변형, 아니면 BJT default.
      // classifier는 기본 device 분기만, 실제 device 선택은 generator(mode)가 결정.
      return {
        type: "bjt_characteristic_curve",
        params: {},
        confidence: "high",
        reasoning: "electronics + 출력특성곡선/동작영역/㉠㉡ 키워드 → 개념·도식 해석형",
      };
    }
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
    // NMOS multi-FET cascode current mirror (임용 10번 정확 재현) — mosfet_bias보다 우선.
    //   트리거: MOSFET 2개 이상 OR cascode/mirror 키워드 OR M1·M2·M3 같은 multi-device id 인벤토리.
    const cascodeKeywords = [
      "cascode", "캐스코드", "케스코드",
      "current mirror", "전류 거울", "전류거울", "거울 회로",
      "m1", "m2", "m3",  // multi-device 식별
    ];
    const mosfetInventory = (analysis.componentInventory ?? []).filter((c) =>
      ["MOSFET", "NMOS", "PMOS"].includes(String(c.type ?? "").toUpperCase()),
    );
    const isCascodeText = matchesKeyword(text, cascodeKeywords);
    if (mosfetInventory.length >= 2 || (mosfetInventory.length >= 1 && isCascodeText)) {
      return {
        type: "mosfet_cascode_mirror",
        params: {},
        confidence: "high",
        reasoning: `electronics + MOSFET ${mosfetInventory.length}개${isCascodeText ? " + cascode/mirror 키워드" : ""}`,
      };
    }
    // 단일 NMOS DC bias — bjt_small_signal보다 우선. 키워드 또는 family.
    const mosfetBiasKeywords = [
      "nmos", "pmos", "mosfet", "엔모스", "피모스",
      "포화 영역", "포화영역", "saturation", "saturation region",
      "v_gs", "vgs", "v_ds", "vds", "v_th", "vth", "v_tn",
      "i_d", "드레인 전류", "드레인전류", "게이트-소스",
      "k(v_gs", "k·(v_gs", "k·(vgs", "(v_gs - v_th)", "(vgs-vth)",
    ];
    if (family === "mosfet_bias" || family === "mosfet_amplifier" ||
        analysis.topicKey === "mosfet_bias" || analysis.topicKey === "mosfet_amplifier" ||
        mosfetInventory.length >= 1 || matchesKeyword(text, mosfetBiasKeywords)) {
      return {
        type: "mosfet_bias",
        params: {},
        confidence: "high",
        reasoning: "electronics + 단일 MOSFET 키워드/family/inventory",
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
    // ★ 텍스트 풀에 relatedConcepts·fillInTheBlanks 포함 — GPT의 topic/interpretation 표현이
    //   매번 달라 키워드가 빠지는 케이스 대비. concepts에는 보통 "MUX"·"멀티플렉서" 같은 단어가 들어감.
    const blanksText = (analysis.fillInTheBlanks ?? [])
      .map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`)
      .join(" ");
    const text = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      blanksText,
    ].join(" ");
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
    // ★ 4×1 MUX 등가구현 (임용 5번) — 조합논리회로 + MUX 두 figure + ㉠·㉡ 학생 도출.
    //   combinational_gate·kmap_*·flipflop_* 모든 archetype보다 먼저 매치.
    //   트리거: MUX/멀티플렉서/4×1/선택선/S_0·S_1/I_0~I_3 키워드.
    const muxKeywords = [
      "멀티플렉서", "multiplexer", "multiplex",
      "mux",
      "4×1", "4x1", "4 × 1", "4 x 1", "4:1", "4-to-1", "4 to 1",
      "8×1", "8x1",
      "선택선", "select line", "selector",
      "s_0", "s_1", "s0", "s1",
      "i_0", "i_1", "i_2", "i_3",
      "i₀", "i₁", "i₂", "i₃",
    ];
    if (matchesKeyword(text, muxKeywords)) {
      return {
        type: "mux_implementation",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + MUX/멀티플렉서/선택선 키워드",
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
    nodeAnnotations: analysis.nodeAnnotations,
    topicInterpText: `${analysis.topic ?? ""} ${analysis.interpretation ?? ""}`,
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
// RLC 공진 / 주파수응답 — 임용 9번 형식 (단일 AC 전원 + R+L+C, f 변화에 따른 I 곡선)
const RESONANCE_KEYWORDS = [
  "공진", "resonance", "공진주파수", "공진 주파수",
  "주파수 응답", "주파수응답", "frequency response",
  "f_0", "f0", "f_{0}", "fo[hz]", "f₀",
  "imax", "i_max", "최대 전류", "최대전류",
  "i[a]", "i [a]", "진폭",
  "주파수에 따른", "주파수가",
  "1/(2π√", "1/(2pi√", "1/(2\\pi", "1/\\sqrt{lc}", "1/√(lc",
  "q-factor", "q factor", "선택도", "선택성",
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
  /** topic + interpretation만 (relatedConcepts 제외) — 진짜 주제 키워드 판별용 */
  topicInterpText?: string;
  /** universal_dc 트리거용 — V_n 라벨 등 노드 어노테이션 */
  nodeAnnotations?: AnalysisResult["nodeAnnotations"];
};

type DecideResult = {
  type: CircuitType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  /** decide 단계에서 결정되는 generator hint params (외부 기본 params에 merge). */
  params?: CircuitTypeParams;
};

function decideType(args: DecideArgs): DecideResult {
  const { topicKey, features, semantic, counts, text, hasACInventory, nodeAnnotations, topicInterpText } = args;

  // SW 존재 판정 — counts.SW에만 의존하지 말 것. GPT가 inventory 추출 시 SW를 가끔 누락함.
  //   features.hasSwitch OR text의 SW/스위치 키워드도 인정해서 robust하게.
  const switchedExplicitKw = matchesKeyword(text, [
    "스위치", "switch", "sw가", "sw는", "sw_", " sw ", "(sw)",
    "단자 a에서", "a에서 단자 b", "a → b", "a->b", "t=0에", "t = 0에", "t=0이",
  ]);
  const hasSwitchInferred = counts.SW > 0 || Boolean(features.hasSwitch) || switchedExplicitKw;

  // 0-PRE-AC. Universal AC (archetype-free) — 모든 AC archetype보다 우선.
  //   조건: (L OR C 존재) + AC 키워드(공진·페이저·최대전력) + 기존 archetype 강한 시그니처 없음.
  //   기존 archetype(rlc_resonance·ac_superposition 등) 명시 키워드는 그쪽 유지.
  const hasReactiveUniversal = counts.L > 0 || counts.C > 0;
  const isAcKw = matchesKeyword(text, [
    "공진", "resonance", "공진주파수", "공진 주파수",
    "페이저", "phasor",
    "ω", "omega", "ω_0", "ω₀",
    "최대 평균전력", "최대평균전력", "최대 전력", "최대전력",
    "교류", "ac source", "ac 회로", "정현파",
    "주파수응답", "주파수 응답",
  ]);
  // 기존 archetype 강한 시그니처 (그쪽 유지)
  const isClassicSwitchedRlc = matchesKeyword(text, ["스위치", "switch", "t=0"]) && (counts.L > 0 || counts.C > 0);
  const isAcSuperpositionStrict = matchesKeyword(text, ["중첩의 원리", "중첩원리", "superposition"]) && counts.V > 0 && counts.I > 0;
  const isClassicMaxPower = matchesKeyword(text, MAX_POWER_KEYWORDS) && counts.R >= 4;
  if (
    hasReactiveUniversal &&
    isAcKw &&
    !isClassicSwitchedRlc &&
    !isAcSuperpositionStrict &&
    !isClassicMaxPower
  ) {
    return {
      type: "universal_ac",
      confidence: "high",
      reasoning: `AC + L/C 존재 + 공진/페이저/최대전력 키워드 (classic archetype 시그니처 없음)`,
    };
  }

  // 0-PRE-DC. Universal DC (archetype-free) — 모든 DC archetype보다 우선.
  //   조건: L/C 없음(DC만) + 트리거 (가변 R OR 다단계 step OR V_n 노드 라벨 다수 OR V·I 혼합)
  //   목적: 새 임용 DC 형식이 나와도 archetype 추가 없이 흡수 (규칙 기반).
  const isVariableRkw = matchesKeyword(text, [
    "가변", "variable", "조정하여", "조정하면", "조절하여",
    "r의 값을 구", "r 값을 구",
  ]);
  const isMultiStepDc = /\[단계\s*[123]\]/.test(text) && counts.C === 0 && counts.L === 0;
  const isDcOnly = counts.C === 0 && counts.L === 0 && (counts.V > 0 || counts.I > 0);
  // V_n 노드 라벨 다수 추출 시그니처 — universal DC 형식의 강한 지표.
  //   nodeAnnotations.label이 "V_숫자"·"V_o"·"V_x" 형식인 entry 개수 카운트.
  const nodeLabelCount = (nodeAnnotations ?? []).filter((a) =>
    typeof a.label === "string" && /^V[_]?(\d+|o|x|out|a|b)$/i.test(a.label),
  ).length;
  const hasMultipleNodeLabels = nodeLabelCount >= 2;
  // V·I 혼합 — 임용 multi-source DC 시그니처
  const hasMixedSources = counts.V > 0 && counts.I > 0;
  // 기존 DC archetype의 강한 키워드 — topic·interpretation에 직접 나타날 때만 (relatedConcepts 보조 키워드는 약함).
  //   "테브난의 정리"가 relatedConcepts에만 있는 케이스(GPT가 기본 회로해석 키워드 자동 추가)는
  //   universal_dc 우선 사용. 진짜 thevenin 문제면 topic·interpretation에 명시됨.
  const tipText = topicInterpText ?? text;
  const isClassicTheveninCtx = matchesKeyword(tipText, EQUIVALENT_KEYWORDS) || matchesKeyword(tipText, MAX_POWER_KEYWORDS);
  if (
    isDcOnly &&
    !isClassicTheveninCtx &&
    (isVariableRkw || isMultiStepDc || hasMultipleNodeLabels || (hasMixedSources && counts.R >= 3))
  ) {
    const reasons: string[] = [];
    if (isVariableRkw) reasons.push("가변 R");
    if (isMultiStepDc) reasons.push("[단계 N] 다단계");
    if (hasMultipleNodeLabels) reasons.push(`V_n 라벨 ${nodeLabelCount}개`);
    if (hasMixedSources) reasons.push(`V·I 혼합 + R≥${counts.R}`);
    return {
      type: "universal_dc",
      confidence: "high",
      reasoning: `DC-only (V·I·R, no L/C) + ${reasons.join(", ")}`,
    };
  }

  // 0-PRE. RLC 공진 + R_L 최대전력 (임용 7번) — rlc_resonance·max_power_transfer보다 우선.
  //   트리거: "공진" + ("최대 전력"|"최대 평균전력"|"R_L") + ("점선"|"등가저항") OR R≥4 + L + C + V_ac.
  const isResonanceKw = matchesKeyword(text, ["공진", "resonance", "공진주파수", "공진 주파수", "ω_0", "ω₀", "omega_0", "omega0"]);
  const isMaxPowerKw = matchesKeyword(text, ["최대 평균전력", "최대평균전력", "최대 전력", "최대전력", "max power", "maximum power"]);
  const isLoadKw = matchesKeyword(text, ["r_l", "부하저항", "부하 저항", "load resistance"]);
  const isDashedBoxKw = matchesKeyword(text, ["점선", "점선 박스", "점선박스", "점선 부분", "dashed", "등가저항", "등가 저항"]);
  const has5Rmesh = counts.R >= 4 && counts.L >= 1 && counts.C >= 1;
  if (
    isResonanceKw && isMaxPowerKw &&
    (isLoadKw || isDashedBoxKw || has5Rmesh)
  ) {
    return {
      type: "rlc_resonance_max_power",
      confidence: "high",
      reasoning: `RLC 공진 + 최대평균전력 + ${isLoadKw ? "R_L" : ""}${isDashedBoxKw ? " 점선/등가저항" : ""}${has5Rmesh ? ` R≥4·L·C` : ""}`,
    };
  }

  // 0-pre-pre-pre. Switched RLC 5-leg (임용 9번 원본 정확) — switched_rlc_step v1보다 우선.
  //    트리거: SW(inferred) + RLC + dual-source + 다중 R(R≥4) + 다중 L(L≥2).
  if (
    hasSwitchInferred && counts.R >= 4 && counts.L >= 2 && counts.C > 0 &&
    counts.V > 0 && counts.I > 0
  ) {
    return {
      type: "switched_rlc_5leg",
      confidence: "high",
      reasoning: `RLC 5-leg + SW(inferred: ${counts.SW > 0 ? "inv" : features.hasSwitch ? "feat" : "text"}) + dual-source + multi-R(${counts.R}) + multi-L(${counts.L})`,
    };
  }

  // 0-pre-pre. Switched RLC step response v1 (3-leg 단순화) — SW(inferred) + RLC + dual-source + 키워드.
  const hasRlcSet = counts.R > 0 && counts.L > 0 && counts.C > 0;
  const switchedRlcKeywords = [
    "정상 상태", "정상상태", "steady state", "직류 정상",
    "초기 조건", "초기조건", "초기 전압", "v_c(0", "vc(0", "i_l(0", "il(0",
    "2차 미분방정식", "2차 미분", "second order ode", "second-order",
    "dv_c/dt", "dv_c(0", "dvc(0", "키르히호프", "kvl", "kcl",
    "자연 응답", "자연응답", "강제 응답", "강제응답",
    "natural response", "forced response",
    "v_c(t)", "vc(t)",
    "t < 0", "t≥0", "t ≥ 0", "t=0",
    "과도 응답", "과도응답", "transient",
  ];
  const isSwitchedRlcText = matchesKeyword(text, switchedRlcKeywords);
  if (hasSwitchInferred && hasRlcSet && (isSwitchedRlcText || (counts.V > 0 && counts.I > 0))) {
    return {
      type: "switched_rlc_step",
      confidence: "high",
      reasoning: `RLC + SW(inferred) + ${counts.V > 0 && counts.I > 0 ? "dual-source(V·I)" : ""}${isSwitchedRlcText ? " + transient 키워드" : ""}`,
    };
  }

  // 0-pre. RLC 공진 / 주파수응답 — ac_superposition보다 먼저 매치 (임용 9번 형식).
  //    트리거: R + L + C 모두 존재 AND 단일 전압원(V≤1·I=0)
  //            AND (주파수응답 키워드 OR f-axis 키워드)
  //    "중첩" 키워드가 있으면 양보 (multi-source phasor 우선).
  //    hasRlcSet은 이미 위에서 정의됨 (switched_rlc 분기와 공유).
  const isSingleSourceAc = counts.V <= 1 && counts.I === 0;
  const hasSuperpositionKw = matchesKeyword(text, SUPERPOSITION_KEYWORDS) || matchesKeyword(text, ["중첩"]);
  const isResonanceText = matchesKeyword(text, RESONANCE_KEYWORDS);
  if (
    (topicKey === "rlc_response" && isResonanceText && hasRlcSet && isSingleSourceAc && !hasSuperpositionKw) ||
    (hasRlcSet && isSingleSourceAc && isResonanceText && !hasSuperpositionKw)
  ) {
    const topo: "series" | "parallel" = matchesKeyword(text, ["병렬", "parallel"]) ? "parallel" : "series";
    return {
      type: "rlc_resonance",
      confidence: "high",
      reasoning: `RLC ${topo} + 단일 AC 전원 + 공진/주파수응답 키워드`,
      params: { rlcTopology: topo },
    };
  }

  // 0-ac-pb. AC parallel branches (임용 5번 형식) — ac_superposition보다 우선.
  //    트리거: R + L≥2 + C + (AC keywords/inventory/가지전류) + (단자 a·b 키워드 없음).
  //    V_s·I_s 둘 다 요구하지 않음 — GPT inventory가 V_s를 가끔 누락하는 케이스 robust.
  //    L≥2가 핵심 시그니처 (ac_superposition은 L=1).
  const acText2 = matchesKeyword(text, AC_PHASOR_KEYWORDS);
  const hasACInv2 = Boolean(hasACInventory);
  const hasABTerminal = matchesKeyword(text, ["단자 a", "단자 b", "a-b", "ab간", "a, b"]);
  const acBranchCurrentKw = matchesKeyword(text, [
    "i_r1", "i_l1", "i_l2", "i_s", "v_c[v]", "v_c [v]",
    "가지 전류", "branch current", "각 가지", "병렬 가지", "병렬가지",
    "페이저 전압 v_c", "페이저 전류 i_",
  ]);
  if (
    !hasABTerminal &&
    counts.R > 0 && counts.L >= 2 && counts.C > 0 &&
    (acText2 || hasACInv2 || acBranchCurrentKw)
  ) {
    return {
      type: "ac_parallel_branches",
      confidence: "high",
      reasoning: `AC + multi-L(${counts.L}) + C + R + 가지전류 키워드 + 단자 a·b 없음 (V_s·I_s 조건 면제)`,
    };
  }

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
