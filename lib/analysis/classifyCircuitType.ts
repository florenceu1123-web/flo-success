import { isPrincipleNamingAnalysis } from "@/lib/analysis/deviceIdentity";
import type {
  AnalysisResult,
  CircuitType,
  CircuitTypeClassification,
  CircuitTypeParams,
  SubjectKey,
  TopicKey,
} from "@/types";
import { createLogger } from "@/lib/logger";
import { isDependentComponent, isDependentSourceValue } from "./dependentSource";

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
  // ── ★ 0-PRE (subject 무관) — 개념 명칭형(원리·법칙·소자 이름 쓰기)은 회로 archetype 금지 ─────────
  //   실측 신고: "㉠·㉡에서 설명하는 원리 또는 법칙의 이름을 순서대로 쓰시오"(㉠=KVL, ㉡=중첩의 원리)는
  //   **수치 계산이 전혀 없는 개념형**인데, "중첩"·"전원" 낱말 때문에 ac_superposition(AC 다중 전원
  //   회로 계산)으로 가서 전혀 다른 문제가 생성됐다.
  //   → circuitType을 주지 않고(unsupported) GPT 텍스트 경로로 보낸다. figure role도 roleTriggers·
  //     resolveRules에서 면제되므로 그림 없는 개념 문항으로 생성된다.
  {
    // ★ 판정은 analysis 전체(구조 신호: 수치 given 유무 + 인벤토리)로 — 문구만 보면 Vision 실행마다 샌다.
    const conceptText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ");
    void conceptText;
    if (isPrincipleNamingAnalysis(analysis)) {
      classifierLog.info("pre_subject_principle_naming", {});
      return {
        type: "unsupported",
        params: {},
        confidence: "high",
        reasoning: "원리·법칙의 명칭을 쓰는 개념형(수치 계산 없음) → 회로 archetype 미사용, 텍스트 경로",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — 아날로그 시스템 설계 2-OPAMP 가산기 ─────────
  //   원본: 입력 파형(삼각파·구형파) + 출력 파형 + "연산증폭기 2개·모든 저항 동일·이상적"으로 회로 설계.
  //   ★ 과목을 digital_logic·mixed_signal로 잘못 선택해도(파형→디지털 오분류·복합형 오분류) 이 시그니처가
  //     최우선으로 가로챈다. Vision은 어떤 과목으로 분석해도 "삼각파·구형파·연산증폭기·저항 동일"을 서술함.
  {
    const t0 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
    ].join(" ").toLowerCase();
    const waveKw = /삼각파|구형파|톱니파|사각파/.test(t0);
    const analogOpampKw = /연산\s*증폭기|op[\s.\-]?amp|아날로그/.test(t0);
    const designKw = /설계|저항.*동일|동일한 저항|저항값은 동일|모든 저항|op[\s.\-]?amp\s*2|연산\s*증폭기\s*2|두 개의 연산|2개의 연산|증폭기.*2개|2개.*증폭기|출력하도록/.test(t0);
    const guardOut = /저역|고역|대역폭|차단\s*주파수|차단주파수|필터|적분기|미분기|integrator|differentiator|발진/.test(t0);
    if (waveKw && analogOpampKw && designKw && !guardOut) {
      classifierLog.info("classify_result", { type: "opamp_analog_summer", route: "0pre_analog_summer", subject });
      return {
        type: "opamp_analog_summer",
        params: {},
        confidence: "high",
        reasoning: "[0-PRE] 삼각/구형 파형 + 연산증폭기/아날로그 + 설계(저항 동일·op-amp 2개) → opamp_analog_summer (subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — SW + 상보형 2단 BJT 바이어스 (임용 10번) ─────────
  //   원본: SW + BJT 2개(NPN Q1 → PNP Q2, Q2 base=Q1 이미터 노드) 다단 바이어스 해석.
  //   ★ 회귀 방지: BJT 2개 + 스위치는 단일 bjt_bias·특성곡선·switched_dc 어느 것도 재현 못 함 →
  //     전용 archetype. subject를 electronics/circuit_theory 무엇으로 잡아도 최우선 매치.
  {
    const inv = analysis.componentInventory ?? [];
    const up = (t: unknown) => String(t ?? "").toUpperCase();
    const bjtN = inv.filter((c) => ["BJT", "NPN", "PNP", "TRANSISTOR", "트랜지스터"].includes(up(c.type))).length;
    const swN = inv.filter((c) => up(c.type) === "SW").length;
    const t2 = [
      analysis.topic ?? "", analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
    ].join(" ").toLowerCase();
    const hasBjtText = /트랜지스터|bjt|쌍극성/.test(t2);
    const hasSwText = /스위치|switch|\bsw\b/.test(t2);
    // 진짜 출력특성곡선(단일 소자 그래프)이면 양보.
    const strongCurve = /출력특성곡선|특성\s*곡선|여러\s*개?의?\s*i_b|i_c-v_ce/.test(t2);
    if (bjtN >= 2 && (swN >= 1 || hasSwText) && (hasBjtText || bjtN >= 2) && !strongCurve) {
      classifierLog.info("classify_result", { type: "bjt_two_stage_switched", route: "0pre_bjt_two_stage", subject, bjtN, swN });
      return {
        type: "bjt_two_stage_switched",
        params: {},
        confidence: "high",
        reasoning: `[0-PRE] BJT ${bjtN}개 + 스위치 → SW+상보형 2단 BJT 바이어스 (bjt_two_stage_switched, 단일 bjt_bias·특성곡선·switched_dc 오탈취 차단, subject 무관)`,
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — 스위치 2전원 RC + 테브난 등가(점선박스) (임용 9번 정보과) ─────────
  //   원본: 단자1/단자2 스위치 + 직류 2전원 + C + 점선 부분의 테브난 등가.
  //   [1] 단자1 정상상태 v_C, [2] V_Th·R_Th, [3] t=0 단자1→단자2 후 v_o(t).
  //   ★ 실측 신고("유사문제 생성이 안돼"): Vision이 topicKey를 **waveform_analysis(디지털)** 로 주는
  //     바람에 topicKey 기반 분기가 먼저 잡고 → route가 analog 코어션 → `universal_ac`로 샜다.
  //     시그니처(스위치 단자 + RC + 테브난/점선)는 과목·topicKey와 무관하게 이 유형 고유다.
  {
    const t6 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const inv6 = analysis.componentInventory ?? [];
    const c6 = (ty: string) => inv6.filter((c) => String(c.type ?? "").toUpperCase() === ty).length;
    const swKw6 = c6("SW") > 0 || /스위치|단자\s*1|단자\s*2|t\s*=\s*0/.test(t6);
    const rcKw6 = c6("C") > 0 || /커패시터|콘덴서|축전기|rc\s*회로|v_c/.test(t6);
    const noInductor6 = c6("L") === 0 && !/인덕터|코일/.test(t6);
    const thevKw6 = /테브난|thevenin|등가\s*회로|등가회로|점선|v_?th|r_?th/.test(t6);
    const dcKw6 = !/교류|정현파|페이저|∠|주파수\s*응답|공진/.test(t6);
    if (swKw6 && rcKw6 && noInductor6 && thevKw6 && dcKw6) {
      classifierLog.info("classify_result", { type: "thevenin_switched_rc", route: "0pre_thevenin_switched_rc", subject });
      return {
        type: "thevenin_switched_rc",
        params: {},
        confidence: "high",
        reasoning:
          "[0-PRE] 스위치(단자1·단자2) + RC + 테브난 등가(점선박스) + DC → thevenin_switched_rc " +
          "(임용 9번 정보과, topicKey 오판(waveform_analysis)·universal_ac 추락 차단, subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — 조합논리회로 ↔ 4×1 MUX 등가 구현 (임용 5번) ─────────
  //   원본: (가) 3입력 조합논리회로 + (나) 4×1 MUX. [1] POS [2] SOP [3] 등가가 되도록 I_0·I_1(㉠·㉡).
  //   ★ 실측 신고("생성했던 문제인데 유사문제가 생성 안돼"): 전용 archetype `mux_implementation`이
  //     이미 있는데도 **넓은 `universal_digital` 분기(N변수/M함수)가 위에 있어** 가로챘다
  //     (로그: reclassified=universal_digital → figures=truth_table,logic_network). CLAUDE.md 1-5 위반 사례.
  //   시그니처: MUX/멀티플렉서 + 조합논리·불함수 문맥. ★ 플립플롭·순차(dff_mux_sequential·sr_ff_mux)는 양보.
  {
    const t5 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    // ★ "디멀티플렉서"는 "멀티플렉서"를 **부분 포함**한다 — 먼저 지우고 검사한다(2026-07-30 실측 오탈취).
    //   같은 함정 선례: CLAUDE.md "비정현파 ⊃ 정현파".
    //   ★ 낱말만 지우면 "선택선"이 남아 여전히 매치된다(실측) → **디먹스 문맥이면 통째로 양보**한다.
    const isDemux5 = /디멀티플렉서|demux|디코더|decoder/.test(t5);
    const t5nd = t5.replace(/디멀티플렉서|demux|디코더|decoder/g, " ");
    const muxKw5 = !isDemux5 &&
      /멀티플렉서|multiplexer|\bmux\b|4\s*[×x:]\s*1|4-to-1|선택선|select\s*line/.test(t5nd);
    const combKw5 = /조합\s*논리|조합논리|불\s*함수|부울\s*함수|논리\s*회로|최소항|최대항|등가/.test(t5);
    // 순차·플립플롭 문맥이면 형제 archetype 소관 (D-FF/T-FF + MUX, SR-FF + MUX).
    const seqKw5 = /플립플롭|flip[\s-]?flop|상태도|상태\s*표|상태\s*전이|여기표|카운터|클럭|clk/.test(t5);
    if (muxKw5 && combKw5 && !seqKw5) {
      classifierLog.info("classify_result", { type: "mux_implementation", route: "0pre_mux_equiv", subject });
      return {
        type: "mux_implementation",
        params: {},
        confidence: "high",
        reasoning:
          "[0-PRE] 조합논리회로 + MUX(멀티플렉서) 등가 구현 → mux_implementation " +
          "(임용 5번, universal_digital·combinational_gate 오탈취 차단, subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — JK-FF 2개 상태 여기표 + 조합논리 J_A (SOP→POS) (2025 전기 A-8) ─────────
  //   원본: (가) 상태 여기표(빈칸 ㉠~㉣) + (나) JK-FF 2개 + 조합 논리 블록 ㉲(HIGH·CLK).
  //   〈설계 절차〉 [1] 빈칸 [2] J_A 간략화 최소항의 합 [3] 분배 법칙 → 합의 곱.
  //   ★ 실측 신고: 이 원본이 **D 플립플롭 + 2×1 MUX 구현 회로**(dff_mux_sequential)로 생성됐다.
  //     형제 archetype 어느 것도 이 형식을 재현하지 못한다 — fsm(JK 상태표)은 상태도+출력 y 형식,
  //     dff_mux_sequential은 D-FF+MUX, jk_sync_counter는 카운터다. 넓은 분기 위에 둔다(1-5 규칙).
  {
    const t4 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    // ★ Vision은 이 원본의 FF 종류를 **D로 오독**하는 일이 잦다(실측 3회 중 2회 "D 플립플롭").
    //   그래서 "JK" 문자열을 필수로 걸면 대부분의 실행에서 샌다 → **여기(표) 신호**를 주 판별자로 쓴다.
    //   D 플립플롭은 D=다음 상태라 여기표가 필요 없다 — "상태 여기"는 JK/T 계열 고유의 절차다.
    const jk4 = /j-?k\s*플립|jk\s*플립|j-?k\s*flip|jk-ff/.test(t4);
    const ffAny4 = jk4 || /플립플롭|flip[\s-]?flop/.test(t4);
    const task4 = /플립플롭\s*입력|입력을\s*(구|결정)|논리\s*회로.{0,10}완성|불\s*함수|논리식|최소항|간략화|조합\s*논리/.test(t4);
    // ★ "여기(표)"는 이 유형 고유의 구조 신호다 — 전이에서 J·K를 역산한다는 뜻(무관 항 발생).
    //   실측 Vision 요약("상태 여기를 통해 플립플롭 입력을 구하고")은 불함수·SOP를 언급하지 않으므로
    //   불함수 조건을 필수로 걸면 통째로 샌다 → 여기 신호 단독으로도 인정한다.
    const excStrong4 = /여기표|상태\s*여기|여기\s*표|여기\s*도|상태\s*여표|excitation/.test(t4);
    const stateTable4 = /상태\s*표|상태\s*전이표|상태\s*천이표/.test(t4);
    const bool4 = /불\s*함수|부울\s*함수|논리식|최소항|최대항|간략화|간소화|합의\s*곱|곱의\s*합|분배\s*법칙|\bsop\b|\bpos\b/.test(t4);
    const mux4 = /mux|멀티플렉서|다중화기|2×1|2x1/.test(t4);
    const otherFf4 = /d\s*플립플롭|d-ff|t\s*플립플롭|t-ff/.test(t4);
    const counter4 = /카운터|counter|계수기/.test(t4);
    // ★ 양보: 출력 함수 y·z가 있는 Mealy/Moore 상태도 형식은 fsm(임용 9번 전자) 소관.
    const outputFn4 = /출력\s*[yz]\b|출력\s*함수|출력\s*논리식/.test(t4);
    // 여기(표) 신호가 있으면 FF 종류 오독과 무관하게 이 유형(D-FF 오독 방어).
    //   여기 신호가 없을 때만 기존처럼 JK 명시 + 상태표 + 불함수를 요구한다.
    const fires4 = (excStrong4 && ffAny4 && task4) || (jk4 && stateTable4 && bool4);
    if (fires4 && !mux4 && !counter4 && !outputFn4 && (excStrong4 || !otherFf4)) {
      classifierLog.info("classify_result", { type: "jk_excitation_sop_pos", route: "0pre_jk_excitation", subject });
      return {
        type: "jk_excitation_sop_pos",
        params: {},
        confidence: "high",
        reasoning:
          "[0-PRE] JK 플립플롭 + 상태 여기표 + 불 함수 도출(SOP/POS) → jk_excitation_sop_pos " +
          "(2025 전기 A-8, dff_mux_sequential·fsm·jk_sync_counter 오탈취 차단, subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — 1→4 디멀티플렉서 + 출력 파형 도시 (임용 8번) ─────────
  //   ★ 실측: waveform_analysis(F=SOP+K-map)로 갔다. 이 유형은 **선택선으로 출력이 하나씩 활성화**되는
  //     디먹스 동작 파형이 답이다. 넓은 waveform_analysis 분기보다 위에 둔다(1-5 규칙).
  {
    const t9 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const seq9 = /플립플롭|카운터|상태도|상태표|여기표/.test(t9);
    const demux9 = /디멀티플렉서|demux|디코더|decoder/.test(t9);
    const sel9 = /선택s*선|선택s*신호|s1|s_1|s₁/.test(t9);
    const outs9 = /f0|f_0|f₀|4개의?s*출력|출력s*파형/.test(t9);
    const wave9 = /파형|타이밍|도시/.test(t9);
    if (!seq9 && wave9 && outs9 && (demux9 || sel9)) {
      classifierLog.info("classify_result", { type: "demux_waveform", route: "0pre_demux_waveform", subject });
      return {
        type: "demux_waveform",
        params: {},
        confidence: "high",
        reasoning: "[0-PRE] 디멀티플렉서/선택선 + 다중 출력 F₀~F₃ + 파형 도시 → demux_waveform (임용 8번, waveform_analysis 오탈취 차단)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — n비트 2진수 음수 표현 방식 판별 (임용 4번) ─────────
  //   원본: (가)·(나) 원형 다이어그램의 음수 표현 방식(2의 보수·1의 보수·부호-크기)을 쓰는 문항.
  //   ★ 실측: universal_digital(K-map·논리식)로 갔다 — 이건 회로가 아니라 **수 표현 체계** 문항이다.
  {
    const t8 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const binary8 = /2진수|이진수|binary|비트/.test(t8);
    const negRep8 = /음수s*표현|보수|complement|부호s*비트|부호[-s]?크기/.test(t8);
    const circuit8 = /플립플롭|카운터|카르노|k-?map|게이트|논리식|상태도|상태표|mux|여기표/.test(t8);
    if (binary8 && negRep8 && !circuit8) {
      classifierLog.info("classify_result", { type: "number_representation", route: "0pre_number_rep", subject });
      return {
        type: "number_representation",
        params: {},
        confidence: "high",
        reasoning: "[0-PRE] 2진수 + 음수 표현/보수 + 회로 문맥 아님 → number_representation (임용 4번, universal_digital 오탈취 차단)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — T·D 혼합 동기식 mod-N 카운터 + 미사용 상태 + 리셋 (임용 9번) ─────────
  //   원본: (가) mod-N 상태도(빈칸 ㉠·㉡) + (나) T·D FF 카운터 회로(CLR + 검출 게이트 ⓒ).
  //   ★ 실측 신고: `flipflop_mixed_app`(T+JK 상태표·파형)로 갔다 — 둘 다 "T 플립플롭"을 쓰지만
  //     이 유형의 정의적 특징은 **mod-N 계수 + 사용되지 않는 상태 + 리셋**이다.
  //     flipflop_mixed_app(T&JK) 0-PRE **앞**에 둔다(1-5 규칙).
  {
    const t7 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const counter7 = /카운터|counter|계수기/.test(t7);
    const modN7 = /mod[\s-]?\d|모듈러|mod-n/.test(t7);
    const reset7 = /사용되지\s*않는\s*상태|미사용\s*상태|리셋|reset|\bclr\b|클리어/.test(t7);
    const mux7 = /mux|멀티플렉서|여기표|상태\s*여기/.test(t7);
    if (counter7 && (modN7 || reset7) && !mux7) {
      classifierLog.info("classify_result", { type: "mod_n_counter_reset", route: "0pre_mod_n_counter", subject });
      return {
        type: "mod_n_counter_reset",
        params: {},
        confidence: "high",
        reasoning:
          "[0-PRE] mod-N 동기식 카운터 + 미사용 상태/리셋 → mod_n_counter_reset " +
          "(임용 9번, flipflop_mixed_app·dff_state_design 오탈취 차단, subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — T 플립플롭 + JK 플립플롭 혼합 응용회로 (임용 9번) ─────────
  //   ★ 왜 최우선인가(실측 신고): 전용 분기(flipflop_mixed_app)가 digital 섹션 **한참 아래**에 있어,
  //     그 위의 넓은 조건 분기들이 차례로 이 원본을 가로챘다 — ff_with_waveform(FF+파형) →
  //     jk_sync_counter(JK만) → sequential_dff_generic(D-FF 다중비트) → waveform_analysis.
  //     하나씩 양보 가드를 붙이는 건 두더지잡기라, **전용 시그니처를 최우선으로** 올린다
  //     (CLAUDE.md "archetype 검출 시 universal path 앞에 dispatch").
  //   시그니처: T-FF와 JK-FF가 **둘 다** 언급 + MUX 아님. 두 종류 공존은 이 유형 고유다
  //   (단일 종류 형식 — 임용 8번 ff_with_waveform·JK 카운터·D-FF 설계 — 은 걸리지 않는다).
  {
    const preFfText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => b?.sentence ?? "").join(" "),
    ].join(" ").toLowerCase();
    const preHasT = /t\s*플립플롭|t-ff|t\s*플립|t-플립|t\s*flip/.test(preFfText);
    const preHasJk = /jk\s*플립플롭|j-k\s*플립플롭|jk-ff|j-k\s*플립|jk\s*플립|jk\s*flip/.test(preFfText);
    const preHasMux = /mux|멀티플렉서|다중화기|2×1|2x1/.test(preFfText);
    if (preHasT && preHasJk && !preHasMux) {
      classifierLog.info("classify_result", { type: "flipflop_mixed_app", route: "pre_tff_jkff_mixed", subject });
      return {
        type: "flipflop_mixed_app",
        params: { ffTypes: ["T", "JK"] },
        confidence: "high",
        reasoning:
          "[0-PRE] T-FF + JK-FF 혼합 응용회로 (임용 9번, FF 2개 + 상태표 + 파형) → flipflop_mixed_app (ff_with_waveform·jk_sync_counter·sequential_dff_generic·waveform_analysis 오탈취 차단, subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — 2전원 페이저 + 중첩 → 전원 크기 역산 (임용 5번 회로이론) ─────────
  //   원본: 교류 전압원 V_s∠0° + 전류원 I_s∠−90° + RLC. 커패시터 양단 V_c가 목표값이 되도록
  //   〈해석 절차〉(전류원 개방 → 전압원 단락 → 합)에 따라 **전원의 크기**를 구한다.
  //   ★ 실측 신고: Vision이 "중첩"도 "개방/단락 절차"도 요약에서 빠뜨리면 detectAcSuperposition이
  //     미발화 → **universal_ac**로 떨어져 발문이 "단계별로 회로를 분석하고 각 단계에서 요구하는
  //     결과를 도출하시오"라는 빈 placeholder가 되고 전원 값도 기호로 남았다(사용자 화면).
  //   시그니처: AC + 전압원 + 전류원 + 리액티브 + **목표 페이저 전압 given + 전원 "크기"를 구함**.
  {
    const t3 = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const inv3 = analysis.componentInventory ?? [];
    const c3 = (ty: string) => inv3.filter((c) => String(c.type ?? "").toUpperCase() === ty).length;
    const hasBothSrc = (c3("V") > 0 || /전압원/.test(t3)) && (c3("I") > 0 || /전류원/.test(t3));
    const reactive3 = c3("L") + c3("C") > 0 || /[+-]?j\s*\d|인덕터|커패시터|코일|리액턴스/.test(t3);
    const ac3 = /교류|페이저|phasor|∠|정현파/.test(t3);
    const designAsk3 =
      /(전압원|전류원)[^.]{0,30}크기/.test(t3) || /크기[^.]{0,20}(구|산출|결정)/.test(t3) ||
      /되도록|맞추기 위해|만족하도록|만족시키는/.test(t3);
    const targetPhasor3 = /양단[^.]{0,20}(전압|페이저)|v_?c\b|커패시터 전압|인덕터 전압|목표 전압/.test(t3);
    const sw3 = c3("SW") > 0 || /스위치|t\s*=\s*0|과도/.test(t3);
    // 형제 archetype 양보 — 테브난·최대전력·공진·역률·어드미턴스·대역폭.
    const sibling3 = /테브난|thevenin|노턴|최대\s*전력|최대전력|공진|역률|어드미턴스|대역폭/.test(t3);
    if (hasBothSrc && reactive3 && ac3 && designAsk3 && targetPhasor3 && !sw3 && !sibling3) {
      classifierLog.info("classify_result", { type: "ac_superposition_source_design", route: "0pre_ac_sup_design", subject });
      return {
        type: "ac_superposition_source_design",
        params: {},
        confidence: "high",
        reasoning:
          "[0-PRE] 교류 2전원(V+I) + 리액티브 + 목표 페이저 전압 given + 전원 크기 역산 → ac_superposition_source_design " +
          "(임용 5번, universal_ac placeholder 발문 차단, subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — DC 휘트스톤 브리지 평형 (임용 3번 회로이론) ─────────
  //   원본: 독립 전압원 + 4-arm 브리지(미지 R_x가 보조 저항과 병렬) + 브리지 암 + 개방 출력 V_o.
  //   ★ 왜 최우선인가(실측 로그): 이 원본은 topicKey=dc_resistive로 분석돼 한참 아래의 **dc_nodal
  //     fallback(confidence low)** 에 떨어지고, route에서 inventoryCount≥7 게이트에 걸려
  //     topology_driven으로 dispatch됐다 → 브리지 다이아몬드·R_x·V_o가 모두 사라진 임의 저항망이
  //     totalIssues=0으로 조용히 생성됨. 넓은 분기(dc_resistive/dc_mesh/dc_nodal) 위에 전용 시그니처를
  //     올리지 않으면 반드시 샌다(CLAUDE.md 1-5).
  //   시그니처: 브리지/휘트스톤 + 평형 + 순수 DC 저항망. ★ 양보: 리액티브·교류·테브난·최대전력이면
  //     형제 archetype(ac_bridge_max_power)이 담당한다.
  {
    const wbText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const inv = analysis.componentInventory ?? [];
    const cnt = (ty: string) => inv.filter((c) => String(c.type ?? "").toUpperCase() === ty).length;
    const bridgeKw = /휘트스톤|휘스톤|wheatstone|브리지|bridge/.test(wbText);
    const balanceKw = /평형|balance|balanced|전류가?\s*흐르지\s*않/.test(wbText);
    const reactive =
      cnt("C") > 0 || cnt("L") > 0 ||
      /커패시터|콘덴서|축전기|인덕터|코일|리액턴스|임피던스|어드미턴스/.test(wbText);
    const acCtx = /교류|정현파|페이저|∠|위상각|공진|실효값/.test(wbText);
    const siblingCtx = /테브난|thevenin|노턴|최대\s*전력|최대전력/.test(wbText);
    const dcNet = cnt("SW") === 0 && cnt("I") === 0 &&
      !["CCVS", "CCCS", "VCVS", "VCCS"].some((k) => cnt(k) > 0);
    const enoughR = inv.length === 0 || cnt("R") >= 4;
    if (bridgeKw && balanceKw && !reactive && !acCtx && !siblingCtx && dcNet && enoughR) {
      classifierLog.info("classify_result", { type: "dc_wheatstone_balance", route: "0pre_dc_wheatstone", subject, R: cnt("R"), V: cnt("V") });
      return {
        type: "dc_wheatstone_balance",
        params: {},
        confidence: "high",
        reasoning:
          `[0-PRE] 휘트스톤 브리지 + 평형 조건 + 순수 DC 저항망(R=${cnt("R")}, V=${cnt("V")}) → dc_wheatstone_balance ` +
          `(dc_nodal fallback·topology_driven 오탈취 차단, subject 무관)`,
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — OPAMP 루프이득 L(s)=V_r/V_t + 좌반평면 안정도 (임용 12번 전자회로) ─────────
  //   원본: (가) 원 회로 + (나) V_s 제거·귀환 루프 절단 후 V_t 인가 → V_r. 루프이득 L(s)와
  //   특성방정식 0=1−L(s)의 근이 **좌반평면**에 있을 조건으로 R_S와 R의 관계를 **부등식**으로 구한다.
  //   ★ 형제(임용 11번 블록도·임용 6번 정귀환 SW step·임용 9번 오프셋)가 모두 "개방루프 이득 A(s)"를
  //     공유하므로, 이 유형 **고유 신호(루프이득·루프 절단·특성방정식·좌반평면)** 로만 잡고 위에 둔다(1-5 규칙).
  {
    const lgText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const opampCtx = /연산\s*증폭기|op[\s.\-]?amp|opamp/.test(lgText);
    //   ★ substring 함정: **"개루프 이득"·"개방 루프 이득" ⊃ "루프 이득"** — 형제(임용 9·11·6번)가 모두
    //     개루프 이득을 언급하므로, "비정현파 ⊃ 정현파" 선례처럼 형제 어구를 **먼저 지우고** 검사한다(실측).
    const lgNoOpen = lgText.replace(/개방\s*루프\s*이득|개루프\s*이득|open[\s-]?loop\s*gain|폐루프/g, " ");
    const loopGain =
      /루프\s*이득|loop\s*gain|v_?r\s*\/\s*v_?t|귀환\s*루프를?\s*끊|루프를?\s*절단|break.{0,10}loop/.test(lgNoOpen);
    const stability =
      /좌반평면|left\s*half|특성\s*방정식|characteristic\s*equation|안정(적|성|도)|stab(le|ility)|1\s*[-−]\s*l\(s\)/.test(lgText);
    // ★ 발진기(Wien·위상천이·함수발생기)는 "발진 조건"(등식)이지 안정도 부등식이 아니다 — 양보.
    const oscillator = /발진기|oscillat|wien|위상\s*천이|barkhausen/.test(lgText);
    if (opampCtx && loopGain && stability && !oscillator) {
      classifierLog.info("classify_result", { type: "opamp_loop_gain_stability", route: "0pre_opamp_loop_gain", subject });
      return {
        type: "opamp_loop_gain_stability",
        params: {},
        confidence: "high",
        reasoning:
          "[0-PRE] 연산증폭기 + 루프이득 L(s)=V_r/V_t(귀환 루프 절단) + 특성방정식·좌반평면 안정도 → opamp_loop_gain_stability " +
          "(임용 12번, opamp_finite_gain_block·opamp_positive_feedback·generic opamp 오탈취 차단, subject 무관)",
      };
    }
  }

  // ── ★ 0-PRE (subject 무관) — 유한 이득 OPAMP + 출력단 오프셋 전압원 V_B (임용 9번 전자회로) ─────────
  //   원본: 개루프 이득 A₀(유한) + 되먹임 R₁·R₂ + ★출력단에 직렬로 놓인 전압원 V_B★.
  //   〈해석 절차〉 [1] β·V_D [2] V_out = V_D − V_B [3] 수치 대입.
  //   ★ 실측: 형제 `opamp_finite_gain_block`(임용 11번 — 블록도 + A(s)=A₀ω₀/(s+ω₀))로 dispatch됐다.
  //     두 유형 모두 "개방루프 이득 A₀"를 쓰므로 그 분기(electronics opamp 섹션)보다 **위**에 둔다(1-5 규칙).
  //     판별자는 **출력단 직렬 전압원 V_B / V_out = V_D − V_B** — 블록도·주파수 응답이면 형제에 양보.
  {
    const ofText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const opampCtx = /연산\s*증폭기|op[\s.\-]?amp|opamp/.test(ofText);
    const finiteGain = /개방\s*루프|개루프|open[\s-]?loop|a_?0\b|a₀/.test(ofText);
    const offsetSrc =
      /v_?b\b|v₂?_b|출력.{0,12}(직류\s*)?전압원|직류\s*전압원.{0,10}직렬|v_?out\s*=\s*v_?d\s*[-−]|v_?d\s*[-−]\s*v_?b/.test(ofText);
    const blockCtx = /블록도|block\s*diagram|ω_?0|ω₀|차단\s*주파수|주파수\s*응답|a\(s\)/.test(ofText);
    // ★ Vision이 V_B를 말로 안 쓰는 실행 대비 — 인벤토리 구조로도 잡는다(실측 inventory: R2·OPAMP1·V2).
    //   형제 opamp_finite_gain_block(임용 11번)은 전원이 V_in 하나뿐 → V≥2가 이 유형의 구조 신호.
    const ofInv = analysis.componentInventory ?? [];
    const ofCnt = (ty: string) => ofInv.filter((c) => String(c.type ?? "").toUpperCase() === ty).length;
    const twoSourceSig =
      ofCnt("OPAMP") >= 1 && ofCnt("V") >= 2 && ofCnt("R") >= 2 && ofCnt("C") === 0 && ofCnt("L") === 0;
    if (opampCtx && finiteGain && (offsetSrc || twoSourceSig) && !blockCtx) {
      classifierLog.info("classify_result", { type: "opamp_finite_gain_offset", route: "0pre_opamp_finite_offset", subject });
      return {
        type: "opamp_finite_gain_offset",
        params: {},
        confidence: "high",
        reasoning:
          "[0-PRE] 연산증폭기 + 유한 개방루프 이득 A₀ + 출력단 직렬 오프셋 전압원 V_B(V_out=V_D−V_B) → opamp_finite_gain_offset " +
          "(임용 9번, opamp_finite_gain_block·generic opamp 오탈취 차단, subject 무관)",
      };
    }
  }

  // ── ★ PRE-SUBJECT — 디지털 순서논리(FF + 상태도/상태표) 교정 ─────────
  //   subject가 회로이론/전자로 잘못 선택·분석돼도 "플립플롭 + 상태도/상태표"는 명백한
  //   디지털 순서논리 문제다. (실제 사례: J-K 플립플롭 상태도 문제가 topicKey=switching_circuit
  //   으로 분석돼 switched_dc로 오분류 → digital dispatch 미매치 → GPT free generation으로
  //   추락해 D-FF·빈 상태도 문제가 생성됨.)
  //   아날로그 소자(R/V/I/C/L)가 실제 inventory에 있으면 교정하지 않음 (mixed_signal 가능성).
  if (subject !== "digital_logic" && subject !== "mixed_signal") {
    const preText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? [])
        .map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`)
        .join(" "),
    ].join(" ");
    const ffKw = matchesKeyword(preText, [
      "플립플롭", "플립 플롭", "flip-flop", "flipflop",
      "J-K 플립", "JK 플립", "JK-FF", "D-FF", "T-FF",
    ]);
    // ★ Vision이 "플립플롭"을 텍스트에 안 써도 inventory에 FF(D/JK/T)나 MUX가 있으면 순서논리로 인정.
    //   (임용 8번: D-FF + 2×1 MUX + 상태도 — 텍스트는 "순서논리·MUX"만이라 ffKw 텍스트만으론 놓침.)
    const ffOrMuxInInventory = (analysis.componentInventory ?? []).some((c) => {
      const t = String(c.type ?? "").toUpperCase();
      const v = String(c.value ?? "").toLowerCase();
      return t === "D" || t === "JK" || t === "T" ||
        /flip.?flop|플립\s*플롭|flip flop|mux|멀티플렉서/.test(v);
    });
    const muxKw = matchesKeyword(preText, ["멀티플렉서", "multiplexer", "2×1 mux", "2x1 mux", "2:1 mux", " mux "]);
    const ffOrDigital = ffKw || ffOrMuxInInventory || muxKw;
    const stateKw = matchesKeyword(preText, [
      "상태도", "상태 전이도", "상태천이도", "상태표", "상태 표",
      "state diagram", "state table", "순서논리", "순차 논리", "순차논리",
    ]);
    // 임용 12번류: FF + 클록/타이밍/입력파형 + 상태(Q) — 상태도/표 없이도 명백한 순서논리.
    const seqTimingKw = matchesKeyword(preText, ["클록", "클럭", "clock", "타이밍", "timing", "입력 파형", "출력 파형", "파형"])
      && (matchesKeyword(preText, ["q값", "q_1", "q1q0", "q_1q_0", "상태"]) || /^Q/i.test((analysis.signals?.outputs ?? [])[0] ?? ""));
    const preCounts = aggregateComponentCounts(analysis);
    const hasAnalogInventory =
      preCounts.R + preCounts.V + preCounts.I + preCounts.C + preCounts.L > 0;
    if (ffOrDigital && (stateKw || seqTimingKw) && !hasAnalogInventory) {
      classifierLog.info("pre_subject_digital_correction", {
        from: subject, to: "digital_logic",
        reason: `FF/MUX(text=${ffKw}·inv=${ffOrMuxInInventory}·mux=${muxKw}) + 상태도/순차 (아날로그 inventory 없음)`,
      });
      subject = "digital_logic";
    }
  }

  // ── ★ PRE-SUBJECT — NMOS 다중 소자(캐스코드 전류미러) 바이어스 (임용 10번) ─────────
  //   ★ 이 분기는 원래 `subject === "electronics"` 안에만 있었다. 실측 신고에서는
  //   회로이론 분기의 "종속전원 존재"(MOSFET이 종속원으로 추출됨)가 먼저 잡아
  //   **dc_dependent_source(high)** 로 확정돼 전혀 다른 문제가 생성됐다.
  //   시그니처(NMOS + M₁·M₂·M₃ 다중 소자 + 수치 도출)가 구체적이라 과목 무관하게 잡아도 안전하다.
  {
    const fetText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ");
    const isFet = /nmos|pmos|mosfet|모스펫|전계효과/i.test(fetText);
    // 다중 소자 근거 — 소자 표기(M₁·M₂·M₃) 또는 **복수 표현**.
    //   ★ 원본의 "모든 NMOS는 동일한 특성을 가지며"는 소자가 여러 개라는 뜻이다(실측 신고:
    //   Vision 요약에 M₁·M₂ 표기가 빠져 단일 mosfet_bias로 갔다).
    const multiDevice =
      (/m\s*1|m₁|m_1/i.test(fetText) && /m\s*2|m₂|m_2|m\s*3|m₃|m_3/i.test(fetText)) ||
      /모든\s*(nmos|pmos|mosfet)|nmos들|mosfet들|동일한\s*특성|같은\s*특성|여러\s*개의\s*(nmos|mosfet)/i.test(fetText);
    const mirrorKw = /캐스코드|cascode|전류\s*미러|current\s*mirror|미러/i.test(fetText);
    const computeKw = /구한다|구하시오|계산/.test(fetText);
    const curveKw = /특성\s*곡선|특성곡선|출력\s*특성|곡선|그래프/.test(fetText);
    // ★ 조건 완화 (2026-07-27): Vision 요약이 M₁·M₂·M₃ 표기나 "캐스코드/미러"를 흘리는 실행이 잦다.
    //   MOSFET 문제인 것만 확실하면 **최소한 MOSFET 계열 archetype**으로 보낸다 —
    //   회로이론의 "종속전원 존재"(MOSFET이 VCCS로 추출)에 뺏겨 dc_dependent_source가 되는 것보다
    //   훨씬 낫다(실측 신고). 다중 소자·미러 신호가 있으면 캐스코드, 없으면 단일 바이어스.
    if (isFet && computeKw && !curveKw) {
      const type = (multiDevice || mirrorKw) ? "mosfet_cascode_mirror" : "mosfet_bias";
      classifierLog.info("pre_subject_mosfet", { type, multiDevice, mirrorKw });
      return {
        type,
        params: {},
        confidence: "high",
        reasoning: `NMOS/MOSFET + 수치 도출${multiDevice || mirrorKw ? " + 다중 소자/미러" : " (단일 소자)"} → ${type} (subject 무관)`,
      };
    }
  }

  // ── ★ PRE-SUBJECT — 2비트 카운터 + D/A 변환 + 비교기 (임용 8번 복합형) ─────────
  //   ★ 이 분기는 원래 `subject === "mixed_signal"` 안에만 있었다. 사용자가 과목을 복합형이 아닌
  //   것으로 고르면 통째로 건너뛰어 **dc_mesh(confidence low)** 로 떨어지고 전혀 다른 문제가
  //   생성됐다(실측 신고). 시그니처가 매우 구체적이라 과목과 무관하게 잡아도 안전하다.
  //   조건: (카운터·플립플롭) + (D/A 변환·DAC·R-2R). 비교기는 보조 신호.
  {
    const cdcText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ").toLowerCase();
    const counterKw = /카운터|counter|계수기|플립플롭|flip-?flop|\bjk\b/.test(cdcText);
    const dacKw = /d\/a|da 변환|디지털[\s-]*아날로그|dac|r-?2r/.test(cdcText);
    const cmpKw = /비교기|comparator/.test(cdcText);
    // 플래시 ADC(카운터·DAC 없음)와 구분 — 그쪽은 자체 분기 소관.
    if (counterKw && dacKw) {
      classifierLog.info("pre_subject_counter_dac_comparator", { cmp: cmpKw });
      return {
        type: "counter_dac_comparator",
        params: {},
        confidence: "high",
        reasoning: `카운터/FF + D-A 변환${cmpKw ? " + 비교기" : ""} → counter_dac_comparator (임용 8번, subject 무관)`,
      };
    }
  }

  // ── ★ PRE-SUBJECT — i(t) 램프 파형 → 기울기로 L 도출 (임용 2번 회로이론) ─────────
  //   원본: V_s + SW(t=0) + R + L 직렬 + **i(t) 그래프가 주어짐** → v_L = L·di/dt 로 L 도출,
  //   포화 구간에서는 v_L = 0. generic switched_rl(지수응답 τ)이나 2전원 SPDT archetype이
  //   가로채면 전혀 다른 회로가 생성된다(실측 신고).
  //   ★ subject 무관 — 과목을 전자회로로 잘못 골라도 "unsupported"로 죽지 않게 최상단에서 잡는다.
  {
    const rampText = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    ].join(" ");
    const cnt = aggregateComponentCounts(analysis);
    const reactive = cnt.L + cnt.C > 0 || /인덕터|코일|커패시터|축전기/.test(rampText);
    const swKw = cnt.SW > 0 || /스위치|switch|t\s*=\s*0/.test(rampText);
    // ★ Vision 요약이 얇아도 잡히도록 표현을 넓게 인정한다(실측: 신고 케이스가 generic rl_step으로 샘).
    const waveGiven = /그림\s*\(나\)|파형|그래프|와 같다|와 같이 주어|주어진 전류|주어진 전압/.test(rampText);
    const asksElem =
      /인덕턴스|정전용량|커패시턴스/.test(rampText) ||
      /\bL\s*\[?\s*H\s*\]?/.test(rampText) ||        // "L[H]을 구하시오"
      /\bC\s*\[?\s*F\s*\]?/.test(rampText) ||        // 쌍대(커패시터)
      /(인덕터|커패시터)의?\s*[LC]\b/.test(rampText);
    const expo = /시정수|시상수|지수|e\^|τ/.test(rampText);
    const dualSw = /단자\s*a\s*↔?\s*b|spdt/i.test(rampText) || cnt.V >= 2;
    if (reactive && swKw && waveGiven && asksElem && !expo && !dualSw) {
      classifierLog.info("pre_subject_inductor_ramp_slope", { L: cnt.L, C: cnt.C });
      return {
        type: "inductor_ramp_slope",
        params: {},
        confidence: "high",
        reasoning: "스위치 + 인덕터/커패시터 + i(t) 파형 주어짐 + 소자값 도출 → 램프 기울기 (임용 2번)",
      };
    }
  }

  // ── ★ PRE-SUBJECT — 이상 인덕터/커패시터 v-i 적분 (임용 3번류) ─────────
  //   이상 인덕터에 전압 파형 v(t) 주어짐 → i(t)=(1/L)∫v dt (또는 커패시터 쌍대). 저항 없음.
  //   generic transient_rl/rc(저항+지수응답)와 구분: 이상 소자 + 파형 입력 + 적분, 지수/시정수 없음.
  if (subject !== "digital_logic" && subject !== "mixed_signal") {
    const text = [
      analysis.topic ?? "", analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
    ].join(" ");
    const lcKw = matchesKeyword(text, ["인덕터", "inductor", "커패시터", "capacitor", "축전기", "콘덴서"]);
    const idealKw = matchesKeyword(text, ["이상 인덕터", "이상적인 인덕터", "이상 커패시터", "이상적인 커패시터", "이상 소자"]);
    const integKw = matchesKeyword(text, ["적분", "∫", "di/dt", "dv/dt", "(1/l)", "(1/c)", "1/l", "1/c", "면적", "v=l", "i=c"]);
    const waveKw = matchesKeyword(text, ["파형", "그림 (나)", "v(t)", "i(t)", "사다리꼴", "삼각파", "전압 파형", "전류 파형"]);
    const transientKw = matchesKeyword(text, ["지수", "시정수", "시상수", "e^", "충전", "방전", "스위치"]);
    const counts = aggregateComponentCounts(analysis);
    if (lcKw && waveKw && (integKw || idealKw) && (idealKw || counts.R === 0) && !transientKw) {
      classifierLog.info("pre_subject_inductor_vi_integral", { ideal: idealKw, R: counts.R });
      return {
        type: "inductor_vi_integral",
        params: {},
        confidence: "high",
        reasoning: "이상 인덕터/커패시터 + 파형 입력 + 적분 (저항 없음) → v-i 적분",
      };
    }
  }

  // ── ★ PRE-SUBJECT — Universal AC PWL (다이오드+SW+AC) ─────────
  //   임용 6번 형식: 다이오드+SW+AC clamp/정류 회로. subject(circuit_theory·electronics)와
  //   무관하게 component 시그니처로 라우팅. counts.D ≥ 1 + SW(inferred) + AC source signal.
  if (subject !== "digital_logic" && subject !== "mixed_signal") {
    const counts = aggregateComponentCounts(analysis);
    const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`.toLowerCase();
    const inv = analysis.componentInventory ?? [];
    const hasACInventory = inv.some((c) => {
      const v = String(c.value ?? "").toLowerCase();
      return /sin|cos|sinusoidal|v_i\(t\)|vi\(t\)|sin\(/.test(v);
    });
    const switchedExplicitKw = matchesKeyword(text, [
      "스위치", "switch", "sw가", "sw는", "sw_", " sw ", "(sw)",
      "단자 a에서", "a에서 단자 b", "a → b", "a->b", "t=0에", "t = 0에", "t=0이",
      "단자1", "단자2", "단자 1", "단자 2",
    ]);
    const hasSwitchInferred = counts.SW > 0 || Boolean(analysis.topologySignature?.features?.hasSwitch) || switchedExplicitKw;
    const isAcSourceText = matchesKeyword(text, [
      "교류", "ac source", "ac 회로", "정현파", "sinusoidal",
      "v_i(t)", "vi(t)", "vs(t)", "v_s(t)", "v_in(t)",
      "주기", "period", "한 주기", "주기 t",
    ]);
    const hasAcSourceSignal = hasACInventory || isAcSourceText;

    // ★ 0-PRE (subject 무관). Switched RLC 5-leg (임용 9번 원본) — SPDT 단자 A↔B 스위치 + RLC + 2전원.
    //   ★ Vision이 subject를 electronics/mixed_signal로 오판하거나(→'미분방정식'을 미분기 opamp로 오인),
    //     커패시터를 inventory에서 누락(C=0→switched_rl)해도, "단자 A→B 이동 스위치 + v_C + 2전원(V·I) + L≥2"
    //     강한 텍스트 시그니처로 ★최우선★ 라우팅 (실측 generic 변질 차단).
    {
      const abSwitchKw = /단자\s*a.{0,10}단자\s*b|a에서\s*단자\s*b|a에서\s*b로/i.test(text);
      const capText = matchesKeyword(text, [
        "커패시터", "capacitor", "콘덴서", "v_c", "양단 전압", "정전용량", "[f]", " f]", "1/5",
      ]);
      if (
        hasSwitchInferred && abSwitchKw &&
        counts.L >= 2 && counts.R >= 3 &&
        counts.V > 0 && counts.I > 0 &&
        (counts.C > 0 || capText)
      ) {
        return {
          type: "switched_rlc_5leg",
          params: {},
          confidence: "high",
          reasoning: `[0-PRE] SPDT 단자 A↔B 스위치 + RLC(L=${counts.L},C=${counts.C > 0 ? counts.C : "text"}) + 2전원(V·I) + R=${counts.R} → switched_rlc_5leg (임용 9번, subject 오판·C 누락 무관)`,
        };
      }
    }

    // ★ 0-PRE (subject 무관). AC 역률보정 + 전력 (임용 9번 회로이론) — "역률"(power factor)은 매우 독특한 키워드.
    //   직렬 R+L + 부하 R∥C, 역률 1 되는 X_C·P_avg·Q·P_s. ★ generic topology-driven은 직렬-병렬(부하 R∥C)
    //   구조를 잃어 R·L·C 단일 직렬로 변질(실측) → 전용 archetype. Vision이 subject를 mixed_signal/dc_mesh로
    //   오판해도 "역률 + AC 리액티브"로 최우선 라우팅.
    {
      const isPowerFactorKw = matchesKeyword(text, ["역률", "power factor", "역률이 1", "역률 1", "역률을 1"]);
      // ★ Vision이 "역률"을 자주 누락(실측: "부하 임피던스 X_C…피상 전력"만). → "피상 전력"(apparent power,
      //   매우 드문 키워드) + "무효 전력"(reactive)으로도 매치. 둘 다 + AC RLC = 이 archetype 고유 시그니처.
      const hasApparentP = matchesKeyword(text, ["피상 전력", "피상전력", "apparent power", "[va]", "p_s"]);
      const hasReactiveP = matchesKeyword(text, ["무효 전력", "무효전력", "reactive power", "[var]"]);
      const powerFactorSig = isPowerFactorKw || (hasApparentP && hasReactiveP);
      if (powerFactorSig && counts.L > 0 && counts.C > 0 && counts.V >= 1 && counts.I === 0) {
        return {
          type: "ac_power_factor",
          params: {},
          confidence: "high",
          reasoning: `[0-PRE] ${isPowerFactorKw ? "역률" : "피상+무효 전력"} + AC RLC(L=${counts.L},C=${counts.C}) → ac_power_factor (임용 9번, 역률 키워드 누락에도 견고)`,
        };
      }
    }

    // ★ 0-PRE (subject 무관). 어드미턴스 공진 (임용 7번 회로이론) — "어드미턴스/Y_eq"는 매우 독특한 키워드.
    //   전압원 → 병렬[C∥(R+L)], 점선 블록 등가 어드미턴스 Y_eq=a+jb → 공진 ω₀(b=0) → 전류 최댓값 I_M.
    //   ★ generic universal_ac/rlc_resonance는 이 고정 토폴로지·Y_eq 쿼리를 표현 못 해 "필요한 C 구하기"로
    //     변질(실측, 소자 라벨까지 깨짐) → 전용 결정론 archetype. "어드미턴스/Y_eq" 키워드로 최우선 라우팅.
    {
      const isAdmittanceKw = matchesKeyword(text, ["어드미턴스", "admittance", "y_eq", "y_{eq}", "등가 어드미턴스", "등가어드미턴스"]);
      if (isAdmittanceKw && counts.L > 0 && counts.C > 0 && counts.V >= 1 && counts.I === 0) {
        return {
          type: "ac_admittance_resonance",
          params: {},
          confidence: "high",
          reasoning: `[0-PRE] 어드미턴스/Y_eq + AC RLC(L=${counts.L},C=${counts.C}) + 단일 전압원 → ac_admittance_resonance (임용 7번 회로이론)`,
        };
      }
    }

    // ★ 0-PRE (subject 무관). 종속전류원(g·V_c) 2단 구동 페이저 회로 (임용 3번 회로이론).
    //   좌측망(V_s+R+shunt 리액턴스)이 제어전압 V_c를 만들고, 종속전류원 g·V_c가 우측망(R∥리액턴스)을
    //   구동 → I_R → i_R(t). ★ 종속전원은 generic universal_ac·topology-driven이 떨어뜨려 회로가 깨지고,
    //   Vision이 다이아몬드를 일반 V로 읽으면 "AC+DC 중첩 RC"로까지 오분류된다(실측) → 전용 archetype.
    //   시그니처: 종속전원(type 또는 value "2V_c") + AC 페이저 + 리액티브 + 독립 전압원.
    {
      const hasDepSrc =
        counts.dep > 0 ||
        inv.some(isDependentComponent) ||
        Boolean(analysis.topologySignature?.features?.hasDependentSource);
      const isPhasorKw = matchesKeyword(text, [
        "페이저", "phasor", "∠", "정상상태 전류", "정상 상태 전류", "주파수 영역", "frequency domain",
      ]);
      // 양보 가드: 테브난·등가·최대전력·공진·역률은 각자 전용 archetype이 있다 (종속전원이 껴 있어도 양보).
      const otherAcArchetypeKw =
        matchesKeyword(text, EQUIVALENT_KEYWORDS) ||
        matchesKeyword(text, MAX_POWER_KEYWORDS) ||
        matchesKeyword(text, ["테브난", "thevenin", "노턴", "norton", "공진", "resonance", "역률", "어드미턴스", "대역폭"]);
      if (
        hasDepSrc &&
        (counts.L > 0 || counts.C > 0) &&
        counts.V >= 1 &&
        (isPhasorKw || hasAcSourceSignal) &&
        !hasSwitchInferred &&
        !otherAcArchetypeKw
      ) {
        return {
          type: "ac_vccs_phasor",
          params: {},
          confidence: "high",
          reasoning:
            `[0-PRE] 종속전원(dep=${counts.dep}) + AC 페이저 + 리액티브(L=${counts.L},C=${counts.C}) + 전압원 ` +
            `→ ac_vccs_phasor (임용 3번; Vision이 다이아몬드를 V로 읽어도 값 패턴으로 검출)`,
        };
      }
    }

    if (counts.D >= 1 && hasSwitchInferred && hasAcSourceSignal) {
      const result: CircuitTypeClassification = {
        type: "universal_ac_pwl",
        params: {
          hasDiode: true,
          diodeCount: counts.D,
          hasSwitch: true,
          hasACSource: true,
          capacitorCount: counts.C,
          resistorCount: counts.R,
        },
        confidence: "high",
        reasoning: `[PRE-SUBJECT] 다이오드 ${counts.D}개 + SW(inferred) + AC source → universal_ac_pwl (subject=${subject})`,
      };
      classifierLog.info("classify_result", { ...result, route: "pre_subject_pwl", subject });
      return result;
    }
  }

  // ── ★ PRE-SUBJECT — 2-OPAMP cascade (임용 10번 전자회로) ─────────
  //   subject가 circuit_theory로 잘못 선택되어도 OPAMP cascade 시그니처 강하면
  //   electronics path (opamp_cascade_voltage_divider)로 라우팅.
  //   트리거: OPAMP inventory ≥ 2 + R inventory ≥ 4 + cascade·전달함수·OPAMP 응용회로 키워드
  if (subject !== "digital_logic" && subject !== "mixed_signal") {
    const invPS = analysis.componentInventory ?? [];
    const opampPS = invPS.filter((c) => String(c.type ?? "").toUpperCase() === "OPAMP").length;
    const rPS = invPS.filter((c) => String(c.type ?? "").toUpperCase() === "R").length;
    const textPS = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`.toLowerCase();

    // ── ★ OPAMP(오차증폭기) 직렬형 정전압 안정화 회로 (임용 30번) ─────────
    //   원본: OPAMP + 제너(기준전압) + 트랜지스터(직렬 패스) + 피드백 분압 → V_o=V_z(1+R_a/R_b).
    //   ★ 위 zener_bjt_regulator(임용 8번, OPAMP 없는 션트형)와 토폴로지·물리가 완전히 다름.
    //     OPAMP가 discriminator — 있으면 이 archetype, 없으면 zener_bjt_regulator(션트).
    //   opamp cascade/generic·two_stage 등 순수 OPAMP 증폭 분기보다 먼저 매치(제너+트랜지스터 동반).
    {
      const opampCtxReg = opampPS >= 1 || analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(textPS);
      const hasZenerReg = /제너|zener|정전압|전압\s*안정|전압안정/.test(textPS) ||
        invPS.some((c) => {
          const t = String(c.type ?? "").toUpperCase();
          return t === "ZD" || t === "DZ" || t === "ZENER" || (t === "D" && /\d/.test(String(c.value ?? "")));
        });
      const hasBjtReg = /트랜지스터|transistor|bjt|npn|pnp|컬렉터|이미터|베이스|이미터 팔로|emitter follow/.test(textPS) ||
        invPS.some((c) => ["BJT", "NPN", "PNP", "Q", "TR"].includes(String(c.type ?? "").toUpperCase()));
      const regulatorReg = /정전압|전압\s*안정|전압안정|안정화|레귤레이터|regulator|기준\s*전압|기준전압|reference/.test(textPS);
      if (opampCtxReg && hasZenerReg && hasBjtReg && regulatorReg) {
        classifierLog.info("classify_result", { type: "opamp_series_regulator", route: "pre_subject_opamp_series_regulator", opampCount: opampPS, subject });
        return {
          type: "opamp_series_regulator",
          params: {},
          confidence: "high",
          reasoning:
            "[PRE-SUBJECT] OPAMP + 제너(기준전압) + 트랜지스터(직렬 패스) + 정전압 안정화 → opamp_series_regulator (임용 30번, zener_bjt_regulator 션트형과 구분)",
        };
      }
    }

    // ── ★ 1차 능동 저역통과 필터 — 대역폭 분석 (임용 31번) ─────────
    //   원본: OPAMP + 입력 R + C(접지) → 1차 저역필터. C(또는 R) 변경 시 대역폭 f_c=1/(2πRC) 변화.
    //   ★ generic opamp는 커패시터·필터를 잃고 단순 반전증폭기로 변질 → 필터+대역폭 신호로 먼저 매치.
    //   판별: OPAMP 맥락 + C 존재 + 필터/대역폭/차단주파수 키워드. (적분기/미분기 opamp_time_domain과 구분.)
    {
      const opampCtxLpf = opampPS >= 1 || analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(textPS);
      const hasCapLpf = invPS.some((c) => String(c.type ?? "").toUpperCase() === "C") ||
        /커패시터|capacitor|콘덴서|축전기|정전용량/.test(textPS);
      const filterKw = /저역\s*필터|저역통과|저역\s*통과|저주파\s*통과|low[\s-]?pass|고역\s*필터|고역통과|high[\s-]?pass|대역폭|bandwidth|차단\s*주파수|차단주파수|cutoff|1차\s*필터|능동\s*필터|active\s*filter/.test(textPS);
      const integDiffKw = /적분기|미분기|integrator|differentiator/.test(textPS);
      if (opampCtxLpf && hasCapLpf && filterKw && !integDiffKw) {
        classifierLog.info("classify_result", { type: "active_lowpass_filter", route: "pre_subject_active_lowpass_filter", opampCount: opampPS, subject });
        return {
          type: "active_lowpass_filter",
          params: {},
          confidence: "high",
          reasoning:
            "[PRE-SUBJECT] OPAMP + C + 저역필터/대역폭/차단주파수 → active_lowpass_filter (임용 31번, generic opamp 반전증폭기와 구분)",
        };
      }
    }

    // ── ★ 아날로그 시스템 설계 — 2-OPAMP 가산기 (v₀=v₁+v₂) ─────────
    //   원본: 입력 파형(v₁ 삼각파·v₂ 구형파)+출력 파형(v₀) 주어지고 OPAMP 2개·모든 R 동일로 설계.
    //   ★ generic opamp는 파형·설계 성격을 잃고 임의 수치 netlist로 변질 → 파형+설계 신호로 먼저 매치.
    {
      const opampCtxSum = opampPS >= 1 || analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(textPS);
      const waveIO = /삼각파|구형파|톱니파|사각파|입력 파형|출력 파형|파형/.test(textPS);
      const designKw = /아날로그 시스템|설계|출력하도록|저항값은 동일|저항이 모두 같|모든 저항.*동일|동일한 저항/.test(textPS);
      const twoOpampKw = /op[\s.\-]?amp\s*2|연산\s*증폭기\s*2|2개의 연산|연산 증폭기는 2|두 개의 연산|opamp가 2|증폭기 2개/.test(textPS) || opampPS >= 2;
      const filterKwSum = /저역|고역|대역폭|차단|저주파 통과|필터/.test(textPS);
      const integDiffKwSum = /적분기|미분기|integrator|differentiator/.test(textPS);
      if (opampCtxSum && waveIO && designKw && (twoOpampKw || designKw) && !filterKwSum && !integDiffKwSum) {
        classifierLog.info("classify_result", { type: "opamp_analog_summer", route: "pre_subject_opamp_analog_summer", opampCount: opampPS, subject });
        return {
          type: "opamp_analog_summer",
          params: {},
          confidence: "high",
          reasoning:
            "[PRE-SUBJECT] OPAMP + 입력/출력 파형(삼각·구형) + 아날로그 시스템 설계(저항 동일) → opamp_analog_summer (generic opamp와 구분)",
        };
      }
    }
    const cascadePS = /cascade|캐스케이드|2단|두 단|두단|두 개의 연산|두개의 연산|2개의 연산|두 번째 연산|첫 번째 연산|v_o\/v_i|v_s\/v_o|v_s\/v_i|전달함수|opamp 응용|연산증폭기 응용|연산\s*증폭기를 이용|증폭 회로|각 단계별로|각 증폭기의/.test(textPS);
    // OPAMP가 1개로 잘못 카운트돼도(또는 0개로 누락돼도) cascade 텍스트 + 충분한 R + 연산증폭기 맥락이면 매치.
    //   ★ Vision이 라벨 없는 삼각형 OPAMP를 자주 흘려 inventory OPAMP=0이 되는 케이스 안전망.
    const multiOpampTextPS = /두 번째|첫 번째|두번째|첫번째|2단|두 단|두개|두 개|2개|cascade|캐스케이드|u[_ ]?1.*u[_ ]?2|두 개의 연산|2개의 연산|두개의 연산/i.test(textPS);
    const opampStrongCtxPS = analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(textPS);
    const opampQualifies =
      opampPS >= 2 ||
      (opampPS >= 1 && multiOpampTextPS && rPS >= 5) ||
      (multiOpampTextPS && rPS >= 5 && opampStrongCtxPS); // OPAMP 0개여도 강한 cascade 시그니처
    // ★ 범용 OPAMP (임용 8번류: 가산기+차동, 미지 저항 R 역산) — cascade 전달함수와 구분.
    //   시그니처: OPAMP≥2 + (독립 DC전원 ≥3 OR 저항값 역산 키워드) + 전달함수(V_o/V_i) 키워드 없음.
    //   → 고정 archetype 대신 GPT 구조추출 netlist + MNA generic 경로 (opamp_generic).
    const vCountPS = invPS.filter((c) => String(c.type ?? "").toUpperCase() === "V").length;
    const cCountPS = invPS.filter((c) => String(c.type ?? "").toUpperCase() === "C").length;
    const transferFnKw = /v_o\s*\/\s*v_i|v_s\s*\/\s*v_o|v_s\s*\/\s*v_i|전달함수|transfer function|이득을 구|gain/.test(textPS);
    const oscillatorKw = /발진|oscillat|wien|윈|반게|barkhausen/.test(textPS);
    const solveResistorKw = /저항.*구하|미지.*저항|저항값.*구|r\s*\[?\s*k?\s*Ω?\s*\]?\s*을?를?\s*구|r을 구|r를 구/.test(textPS);
    // opamp 맥락 — Vision이 OPAMP 개수를 놓쳐도(0~1개) topicKey·키워드로 인식.
    const opampContext = opampPS >= 1 || analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(textPS);
    // ★ DC 전원 ≥3 = 가산(summing) 시그니처. Wien 발진기·유한이득은 DC전원 0~1·C 존재이므로 구분됨.
    //   OPAMP 개수를 Vision이 놓쳐도(0개로 오인) 다중 DC전원+가산이면 generic으로 안정 라우팅.
    const summingSig = vCountPS >= 3 && cCountPS === 0 && !oscillatorKw;
    // ★ 2입력 2-OPAMP 캐스케이드(가) + 차동증폭기(나) R 설계 (임용 5번) — ★opamp_generic·cascade보다 먼저★.
    //   판별: opamp 맥락 + 두 입력(V₁·V₂) + "(나)를 (가)와 동일한 V_o 출력하도록 R₁·R₂ 설계/구한다" + 전달함수(V_o/V_i) 아님.
    //   (opamp_cascade는 단일입력 전달함수형이라 이 2입력·설계 구조를 못 재현 → 전용 archetype.)
    {
      const hasV1V2PS = /v_?1\b|v₁/i.test(textPS) && /v_?2\b|v₂/i.test(textPS);
      // (a) 정확한 설계 시그니처 (Vision이 (나) 설계를 잡은 경우)
      const designMatchPS =
        /(동일한?|같은|같게|동일하게)[\s\S]{0,14}(출력|v_?o)/i.test(textPS) &&
        /(r_?1|r_?2|저항)[\s\S]{0,12}(구하|각각|설계|결정)/i.test(textPS);
      // (b) Vision이 (나) 설계를 놓쳐도: 2-OPAMP 캐스케이드 + 두 입력(v₁·v₂) + V_o 관계식 도출.
      //   ★ 핵심 판별자 = 두 입력(v₁ AND v₂). opamp_cascade(전달함수)는 단일입력(V_i)이라 v₂ 없음.
      const cascade2inRelation =
        hasV1V2PS &&
        (cascadePS || multiOpampTextPS || /직렬.{0,4}연결|직렬로/.test(textPS)) &&
        /(관계식|관계\s*식|출력\s*전압을?\s*(구|만들|도출)|v_?o.{0,6}(구|도출|만들))/i.test(textPS) &&
        opampPS >= 2;
      const twoCircuitsPS = /\(나\)|나의\s*증폭기|가와[\s\S]{0,6}(동일|같)|두 회로/.test(textPS);
      if (opampStrongCtxPS && hasV1V2PS && (designMatchPS || cascade2inRelation) && (twoCircuitsPS || opampPS >= 2 || multiOpampTextPS) && !transferFnKw) {
        classifierLog.info("classify_result", { type: "opamp_two_input_diff_design", route: "pre_subject_opamp_2input_design", opampCount: opampPS, subject });
        return {
          type: "opamp_two_input_diff_design",
          params: {},
          confidence: "high",
          reasoning: "[PRE-SUBJECT] opamp + 두 입력(V₁·V₂) + (나)를 (가)와 동일 V_o 되도록 R₁·R₂ 설계 → opamp_two_input_diff_design (임용 5번, cascade·generic 앞)",
        };
      }
    }
    // ★ 3-OPAMP 반전증폭(V_x)+버퍼+반전가산(R_f 도출) (임용 2번 전자) — ★opamp_generic·two_stage·cascade보다 먼저★.
    //   판별: opamp 맥락 + "출력 전압=목표가 되기/얻기 위한 저항(R_f)을 구/조정"(designRf) + 전달함수 아님 + 차동가산(V≥3) 아님.
    //   ★ Vision terse("출력 전압을 얻기 위한 저항 값을 구하는")에도 designRf로 잡힘 (V_x·R_f 리터럴 의존 금지).
    //   임용8 generic(가산/차동, 미지 R 역산)은 ★V≥3(summingSig)★로 구분해 양보. 단일/2전원·중간출력 V_x = 이쪽.
    {
      const designRf =
        /(저항.{0,8}(구하|조정|결정)|r_?f|되기\s*위한\s*저항|특정\s*저항)/i.test(textPS) &&
        /(출력\s*전압|v_?o\b)/i.test(textPS) &&
        /(되기\s*위한|되도록|만족|조건|구하|조정|얻기\s*위)/.test(textPS);
      const hasVxOrSum = /v_?x\b|가산|합산|summing|중간\s*출력/i.test(textPS);
      if (opampStrongCtxPS && designRf && !transferFnKw && !summingSig && (opampPS >= 2 || multiOpampTextPS || rPS >= 4 || hasVxOrSum)) {
        classifierLog.info("classify_result", { type: "opamp_three_stage_sum", route: "pre_subject_opamp_3stage", opampCount: opampPS, vCount: vCountPS, subject });
        return {
          type: "opamp_three_stage_sum",
          params: {},
          confidence: "high",
          reasoning: `[PRE-SUBJECT] opamp + 출력전압 목표 R_f 설계(designRf) + 차동가산(V≥3)·전달함수 아님 → opamp_three_stage_sum (임용 2번 전자, generic·two_stage·cascade 앞)`,
        };
      }
    }
    // ★ 범용 OPAMP (임용 8번류: 가산+차동, 미지 저항 R 역산) — cascade 전달함수와 구분.
    //   ★ 회귀 방지: 2-OPAMP 캐스케이드(임용 5번, opampQualifies+cascade+R다수)면 opamp_cascade에 양보.
    //     (opamp_generic이 opampPS≥2 && solveResistorKw로 캐스케이드를 먼저 가로채 지저분한 generic 렌더로 변질.)
    const wouldBeCascade = opampQualifies && rPS >= 4 && cascadePS;
    if (opampContext && (summingSig || (opampPS >= 2 && solveResistorKw && !wouldBeCascade)) && !transferFnKw) {
      classifierLog.info("classify_result", {
        type: "opamp_generic", route: "pre_subject_opamp_generic",
        opampCount: opampPS, vCount: vCountPS, cCount: cCountPS, summingSig, solveResistorKw, subject,
      });
      return {
        type: "opamp_generic",
        params: {},
        confidence: "high",
        reasoning: `[PRE-SUBJECT] opamp 맥락 + DC전원 ${vCountPS}개(C ${cCountPS})${solveResistorKw ? " + 저항역산" : ""} + 전달함수·발진 아님 → 범용 netlist 경로 (opamp_generic)`,
      };
    }
    // ★ 2단 OPAMP "V_P(중간노드) 주어지고 V_i·V_o 도출" (임용 2번) — cascade(전달함수)보다 먼저.
    //   판별: opamp 맥락 + 중간노드 전압(V_P) given + V_i·V_o 모두 구함 + 전달함수(V_o/V_i) 아님.
    //   임용 10번 cascade는 전달함수(transferFnKw)라 제외됨 → 충돌 없음.
    {
      const givenMidV = /v_?p\b|중간\s*전압|마디\s*전압|node voltage|전압\s*v_?p/i.test(textPS);
      // V_i·V_o 기호 또는 "입력 전압…출력 전압" 표현 양쪽 인정 (Vision 표현 흔들림 대응).
      const findViVo =
        ((/v_?i\b/i.test(textPS) && /v_?o\b/i.test(textPS)) ||
          /입력\s*전압[\s\S]*출력\s*전압|출력\s*전압[\s\S]*입력\s*전압/.test(textPS)) &&
        /(구하|계산|순서대로|쓰시오)/.test(textPS);
      if (opampStrongCtxPS && givenMidV && findViVo && !transferFnKw && (opampPS >= 2 || multiOpampTextPS || rPS >= 4)) {
        return {
          type: "opamp_two_stage",
          params: {},
          confidence: "high",
          reasoning: `[PRE-SUBJECT] 2단 OPAMP + V_P(중간노드) given + V_i·V_o 도출 + 전달함수 아님 → opamp_two_stage (임용 2번, cascade 앞)`,
        };
      }
    }
    if (opampQualifies && rPS >= 4 && cascadePS) {
      classifierLog.info("classify_result", {
        type: "opamp_cascade_voltage_divider",
        route: "pre_subject_opamp_cascade",
        opampCount: opampPS,
        rCount: rPS,
        multiOpampTextPS,
        subject,
      });
      return {
        type: "opamp_cascade_voltage_divider",
        params: {},
        confidence: "high",
        reasoning: `[PRE-SUBJECT] OPAMP ${opampPS}개(inv) + multi-text=${multiOpampTextPS} + R ${rPS}개 + cascade 키워드 → opamp_cascade (subject=${subject})`,
      };
    }
  }

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
    // ★ 2비트 플래시 ADC (임용 6번) — counter_dac_comparator보다 먼저 매치.
    //   저항 사다리 + 비교기 3개 + 인코더 → 2비트 디지털. 카운터·FF·DAC 없음.
    //   트리거: (ADC/플래시/디지털 변환/2비트 디지털 출력 키워드) + 비교기 + (카운터·DAC·FF 키워드 없음).
    const flashAdcKw = matchesKeyword(text, [
      "플래시", "flash adc", "flash a/d",
      "a/d 변환", "ad 변환", "a-d 변환", "아날로그-디지털", "아날로그 디지털",
      "2비트 디지털", "2-bit 디지털", "디지털 신호로 출력", "디지털로 변환", "디지털 신호로 변환",
      "온도계 코드", "thermometer",
    ]);
    const comparatorKw = matchesKeyword(text, ["비교기", "comparator", "opamp", "op-amp", "연산증폭기"]);
    const counterDacFfKw = matchesKeyword(text, [
      "카운터", "counter", "계수기", "플립플롭", "flip-flop", "jk", "d/a", "dac", "r-2r", "r2r",
    ]);
    if (flashAdcKw && comparatorKw && !counterDacFfKw) {
      return {
        type: "flash_adc_2bit",
        params: {},
        confidence: "high",
        reasoning: "mixed_signal + 플래시 ADC(2비트 디지털 출력 + 비교기, 카운터/DAC 없음) → flash_adc_2bit",
      };
    }

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
    // ★ 텍스트 풀에 relatedConcepts·fillInTheBlanks 포함 — GPT의 topic/interpretation 표현이
    //   stochastic해서 ㉠ 같은 마커나 "동작 특성" 같은 핵심 키워드가 topic에 안 들어가는 케이스 대비.
    const blanksText = (analysis.fillInTheBlanks ?? [])
      .map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`)
      .join(" ");
    const text = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
      blanksText,
    ].join(" ");
    const family = analysis.topologySignature?.family;

    // ── ★ SCR(실리콘 제어정류기/사이리스터) 턴온 회로 — electronics 최상단 ──
    //   SCR은 전용 archetype이 없어 generic GPT 폴백으로 답이 틀림(래칭 놓침). 매우 고유한
    //   키워드(SCR·실리콘 제어·사이리스터·유지전류)로 최우선 매치 → 결정론 계산.
    {
      const scrKw = matchesKeyword(text, [
        "scr", "실리콘 제어정류기", "실리콘 제어 정류기", "실리콘제어정류기",
        "사이리스터", "thyristor", "유지전류", "유지 전류", "v_ak", "vak",
      ]);
      const turnOnKw = matchesKeyword(text, ["턴온", "turn on", "turn-on", "게이트", "gate"]);
      if (scrKw && (turnOnKw || matchesKeyword(text, ["i_a", "i_h", "애노드", "캐소드"]))) {
        return {
          type: "scr_turn_on",
          params: {},
          confidence: "high",
          reasoning: "electronics + SCR/사이리스터 + 턴온/게이트 → SCR 턴온 회로 (래칭 결정론)",
        };
      }
    }

    // ── ★ 연산증폭기 유한 개방루프 이득 + 블록도 (임용 11번) — electronics 최상단(특성곡선·zener 앞) ──
    //   원본 〈해석 절차〉의 "반전 입력 단자의 전압"이 detectOpampArchetype에서 score.inverting을
    //   띄워 INVERTING_AMP(이상적 반전증폭)로 변질됨. 또 Vision이 BJT 출력특성곡선으로 부분 환각하면
    //   특성곡선 분기가 먼저 잡아채 BJT 문제로 변질(실측). 유한이득 A(s)·블록도·중첩 α·β 시그니처는
    //   매우 구체적이라 BJT/zener/MOSFET 오발화 위험 없음 → ★모든 electronics 분기보다 먼저★ 매치.
    {
      const opampCtxFg =
        analysis.topicKey === "opamp" ||
        matchesKeyword(text, ["opamp", "op-amp", "op amp", "연산증폭기", "연산 증폭기"]);
      // ── ★ 비정현파 발진기(함수발생기): 비교기(구형파) + 적분기(삼각파) (임용 29번) ──
      //   generic opamp cascade로 변질(독립전원 2개 반전증폭기)되므로 모든 opamp 분기 앞에 매치.
      //   Wien/위상천이(정현파 발진기)는 정현파/sine/wien 키워드로 제외.
      const oscKw = matchesKeyword(text, ["발진", "oscillat"]);
      const funcGenSig = matchesKeyword(text, [
        "비정현파", "구형파", "삼각파", "square wave", "triangular", "triangle wave",
        "함수 발생기", "함수발생기", "function generator", "슈미트", "schmitt", "완화 발진", "relaxation",
      ]);
      const compIntegKw = matchesKeyword(text, ["비교기", "적분기", "comparator", "integrator"]);
      // ★ "비정현파"가 "정현파"를 부분 포함하므로 제거 후 검사(오탐 방지).
      const textNoNonsine = text.replace(/비정현파/g, "");
      const sinusoidalKw = matchesKeyword(textNoNonsine, [
        "정현파", "sinusoid", "sine wave", "wien", "윈 브리지", "윈브리지",
        "위상 천이", "위상천이", "phase shift", "phase-shift", "colpitts", "hartley",
      ]);
      // funcGenSig(비정현파·구형파·삼각파·슈미트)는 함수발생기의 결정적 신호 → 그것만으로 확정.
      //   compIntegKw(비교기+적분기)만 있을 땐 정현파 발진기 오탈취 방지 위해 !sinusoidalKw 요구.
      if (opampCtxFg && oscKw && (funcGenSig || (compIntegKw && !sinusoidalKw))) {
        return {
          type: "function_generator",
          params: {},
          confidence: "high",
          reasoning:
            "electronics + opamp + 발진 + (비정현파/구형파/삼각파 OR 비교기+적분기) → function_generator (임용 29번, 모든 opamp 분기 앞)",
        };
      }
      const finiteGainKw = matchesKeyword(text, [
        "개방 루프 이득", "개방루프 이득", "개방 루프", "개방루프",
        "open loop gain", "open-loop gain", "a(s)", "a₀ω₀", "a₀", "ω₀",
        "차단 주파수", "직류 이득",
      ]);
      // ── ★ 정귀환(positive feedback) OPAMP + SW step (임용 6번) — finite_gain_block보다 먼저 ──
      //   원본의 "비반전 입력 단자의 전압"이 detectOpampArchetype의 inverting/nonInverting score를
      //   띄워 단순 반전 가산증폭기로 변질됨. 정귀환(V_out→V+ 피드백)·A(s)·SW step·B·D·K 구조를 잃음.
      //   "정귀환"은 매우 구체적 키워드 → opamp + 정귀환 + 개방루프이득이면 전용 경로(runOpampPipeline의
      //   positive_feedback archetype). 부귀환(임용 11번 finite_gain_block)과 "정귀환" 유무로 구분.
      const positiveFbKw =
        matchesKeyword(text, [
          "정귀환", "정궤환", "정 귀환", "정 궤환", "positive feedback",
          "양의 귀환", "양 귀환", "양의 궤환", "양의 피드백", "양의 되먹임",
        ]) ||
        matchesKeyword(text, ["비반전 입력 단자의 전압", "v+ = β", "v+=β", "β·v_out", "b·ω_0/(s", "b와 d"]);
      if (opampCtxFg && positiveFbKw && finiteGainKw) {
        return {
          type: "opamp_positive_feedback",
          params: {},
          confidence: "high",
          reasoning:
            "electronics + opamp + 정귀환(positive feedback) + 유한 개방루프 이득 A(s) → opamp_positive_feedback (임용 6번, 모든 electronics 분기 앞)",
        };
      }
      const blockDiagramKw = matchesKeyword(text, ["블록도", "블록 다이어그램", "block diagram", "signal flow", "합산점", "summing junction"]);
      const superposKw =
        matchesKeyword(text, ["중첩의 원리", "중첩 원리", "alpha", "beta", "알파", "베타"]) ||
        (text.includes("α") && text.includes("β"));
      // ★ 완화 (2026-07-27): 블록도·α·β는 **필수 조건이 아니다**.
      //   실측: Vision 요약이 "연산 증폭기 개방 루프 이득 해석"까지만 쓰고 블록도·중첩을 흘리면
      //   이 분기가 미발화 → GPT 넷리스트 경로로 빠져 떠 있는 전원(V1 floating)·피드백 없는 OPAMP가
      //   생성됐다. "OPAMP + 유한 개방루프 이득(A(s)·A₀·ω₀)" 자체가 이 유형의 고유 신호다.
      //   ※ 단, "차단 주파수"는 능동 저역통과 필터(임용 31번)와 겹치므로 **단독 근거로 쓰지 않는다**.
      const strongFiniteGain = matchesKeyword(text, [
        "개방 루프 이득", "개방루프 이득", "개방 루프", "개방루프",
        "open loop gain", "open-loop gain", "a(s)", "a₀ω₀", "a₀", "ω₀",
      ]);
      const lowpassCtx = matchesKeyword(text, ["저역", "대역폭", "필터", "lowpass", "low-pass"]);
      // ★ 정귀환(임용 6번)은 위 분기에서 이미 반환되지만, 그 분기가 못 잡은 경우에도
      //   완화된 조건이 가로채지 않도록 여기서도 양보한다(부귀환 유형만 대상).
      if (opampCtxFg && !positiveFbKw && (blockDiagramKw || superposKw ? finiteGainKw : strongFiniteGain && !lowpassCtx)) {
        return {
          type: "opamp_finite_gain_block",
          params: {},
          confidence: "high",
          reasoning: blockDiagramKw || superposKw
            ? "electronics + opamp + 유한 개방루프 이득 A(s) + (블록도 OR 중첩 α·β) → opamp_finite_gain_block (임용 11번)"
            : "electronics + opamp + 유한 개방루프 이득(A(s)·A₀·ω₀) → opamp_finite_gain_block (블록도 표현 누락 대비 완화)",
        };
      }
    }

    // ★ 제너다이오드 + BJT 전압 레귤레이터 (임용 8번) — 특성곡선보다 먼저 매치.
    //   "포화영역에서 동작" 표현이 특성곡선 분기를 잘못 트리거하는데, 제너 + 회로해석 단계
    //   (V_o·전류·저항 도출)가 있으면 특성곡선(영역 식별)이 아니라 레귤레이터 해석 문제다.
    //   트리거: (제너 키워드 OR 제너 inventory) + (BJT 키워드 OR BJT inventory) + 회로해석 단계 신호.
    const inv = analysis.componentInventory ?? [];
    const hasZenerKw = matchesKeyword(text, ["제너", "zener", "제너다이오드", "정전압", "전압 안정", "전압안정", "안정화"]);
    const hasZenerInv = inv.some((c) => {
      const t = String(c.type ?? "").toUpperCase();
      // 다이오드(D/ZD/DZ) + 전압값(V_z) 보유 → 제너로 간주.
      return (t === "ZD" || t === "DZ" || t === "ZENER" || (t === "D" && /\d/.test(String(c.value ?? "")))) ;
    });
    const hasBjtKw = matchesKeyword(text, ["트랜지스터", "bjt", "transistor", "npn", "pnp", "컬렉터", "이미터", "베이스", "v_be", "v_ce", "v_be", "포화영역", "포화 영역"]);
    const hasBjtInv = inv.some((c) => ["BJT", "NPN", "PNP", "Q", "TR"].includes(String(c.type ?? "").toUpperCase()));
    // 회로해석 단계 신호 — 출력전압/전류/저항을 "구한다" (특성곡선의 "영역 명칭"과 구분).
    const hasAnalysisSteps = matchesKeyword(text, [
      "출력전압", "출력 전압", "v_o", "안정화", "레귤레이터", "regulator",
      "전류 i", "저항 r", "구하시오", "구한다", "[단계", "단계 1", "단계1",
    ]);
    if ((hasZenerKw || hasZenerInv) && (hasBjtKw || hasBjtInv) && hasAnalysisSteps) {
      return {
        type: "zener_bjt_regulator",
        params: {},
        confidence: "high",
        reasoning: "electronics + 제너다이오드 + BJT + 회로해석 단계(V_o·전류·저항 도출) → 제너-BJT 전압 레귤레이터 (특성곡선 아님)",
      };
    }

    // ★ BJT/MOSFET 출력특성곡선 (영역 식별 + ON/OFF) — 개념·도식 해석형.
    //   bjt_bias·bjt_small_signal·mosfet_*보다 먼저 매치.
    //   트리거: 특성곡선/출력특성/동작영역 키워드 + 영역 marker(㉠/㉡/㉢) 또는 영역명 키워드.
    // ★ 강한 곡선 시그니처 — 그래프(출력특성곡선)를 직접 지시. 단독으로 특성곡선 확정.
    const strongCurveKeywords = [
      "출력특성곡선", "출력 특성 곡선", "특성곡선", "특성 곡선",
      "드레인 특성", "드레인 특성 곡선", "drain characteristic",
      "i_c-v_ce", "i_c vs v_ce", "ic-vce", "ic vs vce",
      "i_d-v_ds", "i_d vs v_ds", "id-vds", "id vs vds",
      "여러 개의 i_b", "여러개의 i_b", "여러 i_b", "다중 i_b",
      "여러 개의 v_gs", "여러개의 v_gs",
      // V_GS 파라미터 family — V_GS = +2/+4/+6/+8 [V] 같은 패턴 (다중 곡선 파라미터)
      "v_gs = +", "v_gs= +", "v_gs=+", "v_gs=2", "v_gs=4", "v_gs=6", "v_gs=8",
      "characteristic curve", "output characteristics",
    ];
    // ★ 약한 영역/동작 용어 — 바이어스 해석 문제에도 흔히 나오는 일반어. 단독으론 특성곡선 확정 금지
    //   (회귀: 2-BJT 바이어스 회로가 "활성/포화/동작 영역" 서술에 특성곡선으로 오탈취되던 것 차단).
    const weakRegionKeywords = [
      "동작 특성", "동작특성", "동작 특성 분석", "동작 특성 곡선",
      "동작 영역", "동작영역", "영역의 명칭", "스위칭 동작", "스위칭동작",
      "채널 형성", "채널형성", "채널 타입", "채널타입", "채널 길이 변조", "channel length modulation",
      "문턱전압", "v_t는 문턱", "v_th", "v_t = ",
      "i_c 변화", "ic 변화", "i_d 변화", "id 변화",
      "포화 영역", "포화영역", "활성 영역", "활성영역", "차단 영역", "차단영역",
      "트라이오드", "triode",
      "㉠", "㉡", "㉢",
    ];
    // ★ BJT 바이어스 계산 시그니처 (특성곡선=그래프 판독엔 없는 것): V_BE/V_EB=0.7 가정, I_C=I_E 근사.
    //   이게 있으면 weak 영역 용어가 있어도 특성곡선 아님 → bjt_bias로 양보.
    const bjtBiasComputeSignal = matchesKeyword(text, [
      "v_be=0.7", "v_be = 0.7", "vbe=0.7", "vbe = 0.7", "v_be는 0.7", "v_be 는 0.7",
      "v_eb=0.7", "v_eb = 0.7", "veb=0.7", "veb = 0.7", "v_eb는 0.7",
      "i_c=i_e", "i_c = i_e", "ic=ie", "ic = ie", "i_e=i_c", "i_e = i_c", "ie=ic", "ie = ic",
      "i_c1=i_e1", "i_c1 = i_e1", "i_c2=i_e2", "i_c2 = i_e2",
      "베이스-이미터 전압", "베이스 이미터 전압", "이미터-베이스 전압", "이미터 베이스 전압",
    ]);
    // ★ MOSFET 다중 소자 바이어스 계산형에 양보 (2026-07-27).
    //   "포화 영역"은 weakRegionKeywords라 특성곡선 분기를 띄우는데, 임용 10번(NMOS 캐스코드
    //   전류미러)은 **곡선이 없고 V_GS·R·V_D를 계산**하는 문제다. 곡선 언급 없이 M₁·M₂·M₃ 같은
    //   다중 소자 표기 + 수치 도출 요구면 특성곡선이 아니다(실측: 이 때문에 오분류됨).
    const mosfetBiasComputeSignal =
      /m\s*1|m₁|m_1|m\s*2|m₂|m_2|m\s*3|m₃|m_3/i.test(text) &&
      /구한다|구하시오|계산/.test(text) &&
      !matchesKeyword(text, ["특성 곡선", "특성곡선", "곡선", "그래프"]);
    const fireCharacteristic =
      !mosfetBiasComputeSignal &&
      (matchesKeyword(text, strongCurveKeywords) ||
        (matchesKeyword(text, weakRegionKeywords) && !bjtBiasComputeSignal));
    if (fireCharacteristic) {
      // device 추론 — MOSFET 시각 단서(키워드/인벤토리)가 있으면 mosfet, 아니면 bjt.
      //   text 키워드(MOSFET, V_GS, V_DS, I_D, 드레인, 채널) 또는 inventory 의 MOSFET 존재로 판별.
      const mosfetKw = matchesKeyword(text, [
        "mosfet", "metal-oxide", "metal oxide",
        "v_gs", "vgs", "v_ds", "vds", "i_d", "id",
        "드레인", "게이트", "소스",  // BJT의 컬렉터/베이스/이미터와 구분
        "채널", "문턱전압", "v_t", "v_th",
        "n채널", "p채널", "nmos", "pmos",
      ]);
      const mosfetInInventory = (analysis.componentInventory ?? []).some((c) =>
        ["MOSFET", "NMOS", "PMOS"].includes(String(c.type ?? "").toUpperCase())
      );
      const device: "bjt" | "mosfet" = (mosfetKw || mosfetInInventory) ? "mosfet" : "bjt";
      return {
        type: "bjt_characteristic_curve",
        params: { device },
        confidence: "high",
        reasoning: `electronics + 출력특성곡선/동작영역/㉠㉡ 키워드 → 개념·도식 해석형 (device=${device})`,
      };
    }
    // Multi-device cascode/current mirror/차동증폭기 — 단일-소자 bias archetype보다 우선.
    //   기존 MOSFET cascode_mirror 패턴을 일반화: BJT 인벤토리도 같은 규칙으로 인식.
    const cascodeKeywords = [
      "cascode", "캐스코드", "케스코드",
      "current mirror", "전류 거울", "전류거울", "거울 회로", "전류 미러", "전류미러",
      "차동증폭기", "차동 증폭기", "차동쌍", "차동 쌍",
      "differential amplifier", "differential pair", "diff amp", "diff-amp", "diff pair", "diff-pair",
      "m1", "m2", "m3",  // multi-device 식별
    ];
    const bjtInventory = (analysis.componentInventory ?? []).filter((c) =>
      ["BJT", "NPN", "PNP", "TRANSISTOR", "트랜지스터"].includes(String(c.type ?? "").toUpperCase()),
    );
    const mosfetInventory = (analysis.componentInventory ?? []).filter((c) =>
      ["MOSFET", "NMOS", "PMOS"].includes(String(c.type ?? "").toUpperCase()),
    );
    const isCascodeText = matchesKeyword(text, cascodeKeywords);
    // BJT 다중 트랜지스터 + 전류미러/차동 키워드 — bjt_bias·bjt_small_signal보다 우선.
    //   universal path 원칙: 새 archetype 추가 대신 기존 bjt_bias 파이프라인에 params 전달.
    if (bjtInventory.length >= 2 && isCascodeText) {
      return {
        type: "bjt_bias",
        params: { multiBjtMirror: true, bjtCount: bjtInventory.length },
        confidence: "high",
        reasoning: `electronics + BJT ${bjtInventory.length}개 + 전류미러/차동 키워드 (multi-BJT bias)`,
      };
    }
    // BJT DC bias 회로 (단일) — small_signal보다 우선. DC bias 특유 키워드 또는 family="bjt_bias".
    const bjtBiasKeywords = [
      "직류 바이어스", "직류바이어스", "dc bias", "dc 바이어스",
      "v_be = 0.7", "vbe = 0.7", "v_be=0.7", "vbe=0.7",
      "v_eb = 0.7", "veb = 0.7", "v_eb=0.7", "veb=0.7",
      "베이스-이미터 전압", "베이스 이미터 전압", "이미터-베이스 전압", "이미터 베이스 전압",
      "이미터 전압 v_e", "이미터 전압",
      "저항률", "resistivity",
      "i_e = i_c", "ie = ic", "i_e≈i_c", "i_c = i_e", "ic = ie", "i_c=i_e", "i_c1 = i_e1", "i_c2 = i_e2",
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
    // ★ inventory가 비었을 때의 텍스트 fallback (2026-07-27).
    //   실측: `extractComponentInventory schema_fail`로 인벤토리가 통째로 비면 mosfetInventory=0이라
    //   이 분기가 미발화 → dc_dependent_source 등으로 새어 전혀 다른 문제가 생성된다(임용 10번 신고).
    //   본문이 "NMOS/MOSFET" + (다중 소자 표기 M₁·M₂·M₃ OR cascode/전류미러)면 이 유형이 맞다.
    const inventoryEmptyFet = (analysis.componentInventory ?? []).length === 0;
    const nmosText = /nmos|pmos|mosfet|모스펫|전계효과/i.test(text);
    const multiDeviceText = /m\s*1|m₁|m_1|m\s*2|m₂|m_2|m\s*3|m₃|m_3/i.test(text);
    const fetTextual = inventoryEmptyFet && nmosText && (multiDeviceText || isCascodeText);
    if (mosfetInventory.length >= 2 || (mosfetInventory.length >= 1 && isCascodeText) || fetTextual) {
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
    // 시간영역 OPAMP (integrator/differentiator) 키워드가 명시되면 우선.
    //   ★ bare "미분"/"적분" 제거 — "미분방정식"(RLC 과도해석)을 미분기 opamp로 오인하던 버그(실측).
    //     소자명(적분기/미분기/integrator/differentiator)만 + 미분방정식 가드.
    if (
      matchesKeyword(text, ["적분기", "미분기", "integrator", "differentiator", "op-amp 적분", "op-amp 미분", "연산 증폭기 적분", "연산 증폭기 미분"]) &&
      !matchesKeyword(text, ["미분방정식", "미분 방정식", "적분방정식", "2차 미분"])
    ) {
      return {
        type: "opamp_time_domain",
        params: {},
        confidence: "high",
        reasoning: "electronics + 적분기/미분기 키워드 (미분방정식 제외)",
      };
    }
    // ── 2-OPAMP cascade + 5R + V_o/V_i 전달함수 (임용 10번) — 단일 OPAMP보다 우선 ──
    //   트리거: OPAMP ≥ 2 (inventory or 키워드) + R ≥ 4 + 전달함수/V_o/V_i 키워드
    const opampInventoryCount = (analysis.componentInventory ?? []).filter((c) =>
      String(c.type ?? "").toUpperCase() === "OPAMP",
    ).length;
    const cascadeKw = matchesKeyword(text, [
      "cascade", "캐스케이드", "다단", "2단", "2단 OPAMP", "두 단", "두단",
      "v_o/v_i", "v_s/v_o", "전달함수", "transfer function",
      "응용 회로", "응용회로",
    ]);
    const rCount = (analysis.componentInventory ?? []).filter((c) =>
      String(c.type ?? "").toUpperCase() === "R",
    ).length;
    if (opampInventoryCount >= 2 && rCount >= 4 && cascadeKw) {
      return {
        type: "opamp_cascade_voltage_divider",
        params: {},
        confidence: "high",
        reasoning: `electronics + OPAMP ${opampInventoryCount}개 + R≥4 + cascade/전달함수 키워드 (임용 10번)`,
      };
    }
    if (analysis.topicKey === "opamp" || matchesKeyword(text, ["opamp", "op-amp", "op amp", "연산증폭기", "OPAMP", "U1"])) {
      // 단일 OPAMP path (cascade rule miss 시 fallback)
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

    // ★ 동작 조건(말) → 최소 SOP 간소화 (임용 25번) — 디지털 분기 최상단.
    //   원본: 그림 없이 "동작 조건"만 말로 주고 3변수 조합논리 출력 F를 최소 논리식으로 간소화.
    //   ★ generic combinational_gate(K-map 주어짐+2출력 F,G+구현회로)로 변질 → 전용 archetype으로 먼저 매치.
    //   판별: 조합논리 + 간소화/논리식 + 동작조건(무관하게·같으면·다르면·조건 만족) + FF/순차/MUX/파형/다중출력 아님.
    {
      const combKw = matchesKeyword(text, ["조합논리회로", "조합 논리회로", "조합논리", "조합 논리", "combinational"]);
      const simplifyKw = matchesKeyword(text, ["간소화", "가장 간단", "간단한 논리식", "최소화", "최소 sop", "최소 표현", "논리식으로 표현", "논리식으로 나타", "간략화"]);
      const conditionKw = matchesKeyword(text, ["동작 조건", "동작조건", "조건을 만족", "조건을 모두 만족", "무관하게", "같으면", "다르면", "이면 출력 f", "일 때 출력 f"]);
      // FF·순차·MUX·파형·다중출력은 각자 분기/유형으로 양보 (그림 주어지는 형식).
      const seqOrOtherKw = matchesKeyword(text, [
        "플립플롭", "flip-flop", "flipflop", "카운터", "counter", "순차", "sequential",
        "멀티플렉서", "multiplexer", "2×1 mux", "2x1 mux", "파형", "타이밍", "waveform", "timing",
        "출력 g", "출력 f, g", "출력 f와 g", "두 출력",
      ]);
      if (combKw && simplifyKw && conditionKw && !seqOrOtherKw) {
        return {
          type: "logic_condition_sop",
          params: {},
          confidence: "high",
          reasoning: "digital_logic + 조합논리 + 간소화 + 동작조건(말) + 단일출력 → 동작 조건→최소 SOP (임용 25번, combinational_gate와 구분)",
        };
      }
    }

    // ★ JK 플립플롭 동기식 카운터 타이밍 분석 (임용 6번류) — 디지털 분기 최상단.
    //   원본: JK-FF 3개(Q₂Q₁Q₀) 공통 CP 동기식 카운터 (가)회로 given → (나)타이밍 도표에 Q 도시
    //         + 특정 시점 상태값 도출.
    //   ★ generic sequential_dff_generic·ff_with_waveform은 D/T-FF 전용(JK 미지원)이라 이 회로를
    //     D-FF 상태설계로 변질시킴(실측). flipflop_counter는 2비트 K-map "설계" 방향(타이밍 "분석" 아님).
    //     → JK-FF + 카운터 시그니처는 이 분기가 최우선으로 가로챈다(전용 archetype).
    //   트리거: JK(J-K) 플립플롭 + 카운터/계수 문맥. (SR·D·T FF 아님 — 각자 위/아래 분기.)
    {
      const hasJkFfCnt = matchesKeyword(text, [
        "jk 플립플롭", "j-k 플립플롭", "jk-ff", "j-k 플립", "jk 플립", "jk플립플롭",
        "jk flip-flop", "jk flipflop", "j-k flip",
      ]);
      const hasCounterKw = matchesKeyword(text, [
        "카운터", "counter", "계수기", "동기식 카운터", "동기 카운터", "계수 회로", "계수회로",
        "동기식 계수", "리플 카운터",
      ]);
      // SR-FF·MUX 설계형은 아래 전용 분기로 양보 (JK 카운터와 무관하지만 방어).
      const hasMuxLocalJk = matchesKeyword(text, ["멀티플렉서", "multiplexer", "2×1 mux", "2x1 mux"]);
      if (hasJkFfCnt && hasCounterKw && !hasMuxLocalJk) {
        return {
          type: "jk_sync_counter",
          params: {},
          confidence: "high",
          reasoning: "digital_logic + JK 플립플롭 + 카운터 → JK 동기식 카운터 타이밍 분석 (sequential_dff_generic·flipflop_counter 오분류 차단)",
        };
      }
    }

    // ★ SR 플립플롭 + MUX 기반 상태순환 순차회로 설계 (임용 10번 정보과) — 디지털 분기 최상단.
    //   원본: 입력 없는 2-bit 순환 순서회로(11→00→10→01)를 SR-FF 2개 + 2×1 MUX 4개로 설계.
    //   여기표 → S/R SOP(무관항=1) → 선택선 분해로 MUX 입력(㉠~㉣) 도출.
    //   ★ generic fsm/sequential_dff 경로는 SR-FF·MUX4 구조를 D-FF+MUX2 Mealy FSM으로 변질시킴
    //     → 전용 archetype 필수. SR-FF + MUX 시그니처는 sequential_dff_generic·universal_digital보다 먼저 매치.
    //   트리거: SR(RS) 플립플롭 + MUX/멀티플렉서 + 순차/순서/상태 문맥. T-FF는 별도 분기로 양보.
    {
      const hasSrFf = matchesKeyword(text, [
        "sr 플립플롭", "sr-ff", "sr 플립", "s-r 플립플롭", "s-r ff", "sr flip-flop", "sr flipflop",
        "s-r flip-flop", "rs 플립플롭", "rs-ff", "rs 플립",
      ]);
      const hasMuxKw = matchesKeyword(text, [
        "멀티플렉서", "multiplexer", "mux", "2×1", "2x1", "2:1", "2 × 1", "선택선", "선택 신호", "select line",
      ]);
      const hasSeqCtx = matchesKeyword(text, [
        "순서회로", "순차회로", "순서 논리", "순차 논리", "순서논리", "순차논리", "상태", "순환", "sequential",
      ]);
      const hasTFfLocal = matchesKeyword(text, ["t 플립플롭", "t-ff", "t 플립", "t-플립"]);
      if (hasSrFf && hasMuxKw && hasSeqCtx && !hasTFfLocal) {
        return {
          type: "sr_ff_mux_sequential",
          params: {},
          confidence: "high",
          reasoning: "digital_logic + SR 플립플롭 + MUX + 순차회로 → SR-FF·MUX 상태순환 순차회로 설계 (임용 10번 정보과)",
        };
      }
    }

    // ★ D 플립플롭 2개 상태도 순차회로 설계 (임용 9번 정보과) — 전용 archetype.
    //   원본: 입력 없는 2-bit 자율 순환 상태도(가) → 상태표(나, ㉠~㉣·D입력 빈칸) →
    //         D-FF 2개 + 게이트(㉮·㉯) 구현(다). D-FF는 D=다음상태 → D_A·D_B를 Q의 함수로 최소화→게이트.
    //   ★ generic fsm(Mealy 입력 X·출력 Z)·sequential_dff_generic(입력파형)은 이 "상태도→D입력→게이트"
    //     형식을 잃음 → 전용 archetype. SR-FF·MUX 아님(위에서 양보), J-K 아님(아래 fsm으로 양보).
    //   트리거: D 플립플롭 + 상태도/상태표 + 게이트 구현 문맥 + 자율 순환(입력 X·출력 Z 없음).
    {
      const hasDFfLocal = matchesKeyword(text, [
        "d 플립플롭", "d-ff", "d 플립", "d-플립", "d flip-flop", "d flipflop", "d_a", "d_b",
      ]);
      const hasJkFfLocal = matchesKeyword(text, [
        "j-k", "jk 플립플롭", "jk-ff", "j-k 플립플롭", "j-k flip", "jk flip",
      ]);
      const hasStateGraph = matchesKeyword(text, [
        "상태도", "상태 천이도", "상태천이도", "state diagram", "상태표", "상태 표", "state table",
      ]);
      const hasGateImpl = matchesKeyword(text, [
        "게이트", "gate", "논리 게이트", "논리게이트", "구현", "설계", "순서 논리 회로", "순서논리회로",
      ]);
      const hasMuxLocalD = matchesKeyword(text, ["멀티플렉서", "multiplexer", "mux", "선택선"]);
      // Mealy 입출력(입력 X·출력 Z/y) 신호가 명시되면 일반 FSM → 양보. 자율 순환만 이 archetype.
      //   ★ bare "mealy"/"moore"는 양보 근거로 쓰지 않는다 — Vision이 자율 순환 문제에도
      //     relatedConcepts에 "Mealy 머신"을 개념 태그로 붙이는 일이 잦다(실측: 임용 9번 원본이
      //     이 태그 하나 때문에 generic fsm으로 새서 있지도 않은 입력 X 문제로 변질).
      //     실제 외부 입출력(입력 X·출력 Z/y·외부 입력) 근거가 있을 때만 Mealy로 인정한다.
      const hasExternalIo = matchesKeyword(text, ["입력 x", "출력 z", "출력 y", "외부 입력"]);
      // ★ "시퀀스 검출기"는 입력 비트열을 받아 출력 1을 내는 유형 고유어 — 자율 순환 설계엔 없다
      //   (2026-07-29 실측 신고: '110' 검출기 원본이 여기로 새서 자율 D-FF 설계 문제로 변질됐다.
      //    그 원본의 Vision 요약은 "출력이 1이 되는"처럼 적어 리터럴 "출력 z" 가드에 안 걸렸다).
      const hasSeqDetector = matchesKeyword(text, [
        "시퀀스 검출기", "시퀀스검출기", "순서 검출기", "순차 검출기", "sequence detector", "검출기",
      ]);
      const hasMealyIo = hasExternalIo || hasSeqDetector;
      if (hasDFfLocal && !hasJkFfLocal && hasStateGraph && hasGateImpl && !hasMuxLocalD && !hasMealyIo) {
        return {
          type: "dff_state_design",
          params: {},
          confidence: "high",
          reasoning: "digital_logic + D 플립플롭 + 상태도/상태표 + 게이트 구현(자율 순환) → D-FF 상태도 설계 (임용 9번 정보과)",
        };
      }

      // ★ 안전망 (Vision terse 대응): analyzeImage가 "D 플립플롭" 단어를 빠뜨려 generic fsm으로
      //   오분류되는 실측 사례(로그) 차단. 자율(입력 X·출력 Z 없음) 상태도+상태표 순서설계 +
      //   플립플롭/게이트 설계 문맥이면 dff_state_design. 이웃 archetype은 각자 가드로 양보:
      //   J-K(hasJkFfLocal)·T-FF(hasTFf)·SR+MUX(hasSr/hasMuxLocalD)·비동기 리플카운터(hasAsync).
      const hasFlipFlopKw = matchesKeyword(text, [
        "플립플롭", "플립 플롭", "flip-flop", "flipflop", "d_a", "d_b", "q_a", "q_b", "q(t+1)", "다음 상태", "다음상태",
      ]);
      const hasDesignKw = matchesKeyword(text, [
        "설계", "구현", "게이트", "gate", "순서 논리", "순서논리", "순차 논리", "순차논리",
        "순서회로", "순차회로", "㉮", "㉯",
      ]);
      const hasTFf = matchesKeyword(text, ["t 플립플롭", "t-ff", "t 플립", "t-플립", "t flip"]);
      const hasSr = matchesKeyword(text, ["sr 플립플롭", "sr-ff", "rs 플립플롭", "s-r 플립플롭"]);
      const hasAsync = matchesKeyword(text, [
        "비동기", "리플", "카운터", "counter", "자동 재적재", "재적재", "preset", "프리셋",
      ]);
      if (
        hasStateGraph && hasFlipFlopKw && hasDesignKw &&
        !hasMealyIo && !hasJkFfLocal && !hasMuxLocalD && !hasTFf && !hasSr && !hasAsync
      ) {
        return {
          type: "dff_state_design",
          params: {},
          confidence: "high",
          reasoning: "digital_logic + 자율(입력/출력 없음) 상태도/상태표 순서설계 + 플립플롭·게이트 문맥 → D-FF 상태도 설계 안전망 (Vision이 'D 플립플롭' 키워드 누락)",
        };
      }
    }

    // ★ Universal digital — N-변수 M-함수 K-map 결합 (임용 8번 형식 등).
    //   기존 combinational_gate(3-var 2-out)에 안 맞는 N-var/M-func 케이스 흡수.
    //   트리거 (OR — 어느 하나라도 매치하면 universal_digital):
    //     · 4+ 입력 변수 (signals.inputs.length ≥ 4)
    //     · 명시적 f_숫자 패턴 2개 이상
    //     · Σm(...) 표기
    //     · "여러 함수"·"각 함수"·"함수들"·"다수 함수" 같은 multi-function 키워드 + K-map
    //     · 출력 시그널 1개(Z 등 단일 통합 출력) + K-map + "결합"·"합" 키워드
    const inputsAll = analysis.signals?.inputs ?? [];
    const outputsAll = analysis.signals?.outputs ?? [];
    const has4PlusVars = inputsAll.length >= 4;
    const fSubscriptMatches = text.match(/f[_]?[1-9]/gi) ?? [];
    const distinctFCount = new Set(fSubscriptMatches.map((s) => (s.match(/(\d)/) ?? ["", ""])[1])).size;
    const hasMultiFunctions = distinctFCount >= 2;
    const sigmaMintermKw = /Σ\s*m\s*\(|sum\s+of\s+minterms|최소항의\s*합/i.test(text);
    const kmapKw = matchesKeyword(text, ["k-map", "kmap", "카르노", "karnaugh"]);
    const multiFuncKw = matchesKeyword(text, [
      "여러 함수", "여러개의 함수", "여러개 함수", "각 함수", "함수들", "다수 함수", "다수의 함수",
      "여러 boolean", "각 boolean", "복수 함수", "복수 boolean",
      "4개의 boolean", "여러 개의 부울", "여러 부울 함수", "각 부울 함수",
      "4개의 함수", "4개 함수", "f_1", "f_2", "f1", "f2",
      "두 출력", "두 개의 출력", "각 출력", "두 출력에 대한",
      "F와 G", "X와 Y", "F·G", "X·Y",
      "Σm", "minterm",
    ]);
    const combineKw = matchesKeyword(text, [
      "결합", "결합하여", "통합", "OR로", "or로", "합 형태", "합의 형태",
      "통합 회로", "통합회로", "최종 출력",
    ]);
    const singleZOutput = outputsAll.length === 1 && /^Z$|^z$|^F$|^Y$/i.test(outputsAll[0] ?? "");

    // 추가 트리거: 2개 이상의 output (F, G) + K-map → universal_digital
    const multiOutput = outputsAll.length >= 2;
    // ★ 순서논리(FF + 상태도/상태표) 가드 — 플립플롭 기반 순서논리 문제는 universal_digital
    //   (조합논리 N-var/M-func K-map)이 아니라 아래 FF 계열 분기(fsm·tff_state_table_blank·
    //   flipflop_mixed_app 등)로 가야 한다. 순서논리 문제도 "K-map 최소화" 개념 + 다중 출력
    //   (Q_A·Q_B·y)을 가지므로 (multiOutput && kmapKw) 트리거에 잘못 걸리는 것을 방지.
    const sequentialLogicSignature =
      matchesKeyword(text, ["플립플롭", "플립 플롭", "flip-flop", "flipflop"]) &&
      matchesKeyword(text, [
        "상태도", "상태 전이도", "상태천이도", "상태표", "상태 표",
        "state diagram", "state table", "순서논리", "순차 논리", "순차논리",
      ]);
    // ★ 비동기 SET/RESET D-FF 응용회로 (자동 재적재 리플 다운카운터) — sequential_dff_generic 앞.
    //   F=NOR(Q,CLK) all-zero 검출로 I 패턴을 비동기 적재 + 평상시 리플 T-FF 다운카운트.
    //   ㉠=적재값(I), ㉡=카운트 파형. generic 순서논리 경로로 흡수되면 비동기 SET·RESET 망과
    //   NOR 자동재적재 구조를 잃어 임의 D-FF 상태표로 변질 → 전용 archetype 필수.
    //   ★ 판별 키 = 이 archetype 고유 구조 시그니처 (Vision 표현 흔들림에 견고하게):
    //     · I₀I₁I₂ **병렬 적재 입력** (ff_with_waveform=A·B·C, sequential_dff=클록·X와 구분되는 결정적 단서)
    //     · 다중 Q 출력 (Q₀Q₁Q₂) — 단일 Q인 임용8 ff_with_waveform과 구분
    //   "비동기 SET" 키워드는 보조(있으면 강한 신호). Vision이 SET 표현을 흘려도 I-입력+다중Q면 매치.
    {
      const apcSignals = analysis.signals ?? { inputs: [], outputs: [] };
      const apcInputs = apcSignals.inputs ?? [];
      const apcOutputs = apcSignals.outputs ?? [];
      const hasFfApc =
        matchesKeyword(text, ["플립플롭", "flip-flop", "flipflop", "d-ff", "d 플립", "dff", "f/f", "ff"]) ||
        Boolean(analysis.semantic?.hasStateTransition) ||
        apcOutputs.some((s) => /^Q/i.test(s));
      // I₀I₁I₂ 병렬입력 — text(라벨/본문) 또는 signals.inputs 양쪽에서 검출.
      const iInTextApc =
        /i₀\s*i₁\s*i₂/i.test(text) ||
        (/i_?0\b/i.test(text) && /i_?1\b/i.test(text) && /i_?2\b/i.test(text));
      const iInSignalsApc =
        ["I0", "I1", "I2"].filter((v) => apcInputs.some((s) => s.replace(/[_₀₁₂]/g, (m) => ({ "₀": "0", "₁": "1", "₂": "2", _: "" }[m] ?? "")) === v)).length >= 2;
      const hasIInputs = iInTextApc || iInSignalsApc;
      // 다중 Q 출력 (Q₀Q₁Q₂ 등)
      const qOutsApc = apcOutputs.filter((s) => /^Q/i.test(s)).length;
      const multiQApc =
        qOutsApc >= 2 ||
        /q_?0\s*q_?1\s*q_?2|q₀\s*q₁\s*q₂/i.test(text) ||
        (/q_?0\b/i.test(text) && /q_?1\b/i.test(text) && /q_?2\b/i.test(text));
      const hasRegionApc = matchesKeyword(text, BLANK_CIRCLE_MARKERS);
      // ★ 정의적 시그니처: **D 플립플롭 + 비동기 + SET + RESET**.
      //   원본은 항상 "비동기식 SET과 RESET을 갖는 D 플립플롭"으로 기술 → Vision이 표현을 바꿔도
      //   이 4요소(D-FF·비동기·SET·RESET)는 안정적으로 잡힌다(실측 4/4). 임용8 ff_with_waveform은
      //   **RESET만**이라 SET 키워드가 없고, SR-FF 문제는 "비동기 SET/RESET D-FF"가 아니므로 구분됨.
      const hasDFf = matchesKeyword(text, ["d 플립플롭", "d-ff", "d 플립", "dff", "d형 플립", "d ff", "d 플립 플롭"]);
      const hasAsyncKw = matchesKeyword(text, ["비동기", "asynchronous", "async"]);
      // ★ "set"은 "reset"의 부분문자열이므로 단어경계(\bset\b)로 분리 — RESET만 있는 경우 오발화 방지.
      //   한글 "셋"도 "리셋"에 포함되므로 (?<!리)로 제외.
      const hasSetKw = /\bset\b|preset|프리셋|(?<!리)셋/i.test(text);
      const hasResetKw = /reset|리셋|클리어|clear/i.test(text);
      // D-FF가 명시 안 돼도 일반 FF+다중Q/I-입력이면 보강 인정.
      const asyncSetReset =
        (hasDFf || hasFfApc) && hasAsyncKw && hasSetKw && hasResetKw;
      // structural: 비동기 표현이 흘려도 I₀I₁I₂ 병렬입력(고유 구조)이면 매치.
      const structural = hasFfApc && hasIInputs && (multiQApc || hasResetKw || hasRegionApc);
      if (asyncSetReset || structural) {
        return {
          type: "async_preset_ripple_counter",
          params: {},
          confidence: "high",
          reasoning:
            `비동기 SET/RESET D-FF 응용회로 (D-FF·비동기·SET·RESET=${asyncSetReset}, I₀I₁I₂=${hasIInputs}, 다중Q=${multiQApc}, 구간=${hasRegionApc}) → 비동기 적재 리플 다운카운터 (ff_with_waveform·sequential_dff_generic 오분류 차단)`,
        };
      }
    }

    // ★ 순서논리 generic (임용 12번류): D-FF 다중비트 상태(Q1Q0) + 클록/입력파형 + 상태분석(㉠㉡㉢).
    //   [단계3]의 "최소 AND/OR" 문구가 kmap_sop으로 오분류시키는 것을 차단하고 generic 순서논리로.
    //   단일 Q·X/Y(임용 8 ffWithWaveform)·조합(FF 없음)과 구분.
    {
      const ffKwSeq = matchesKeyword(text, ["플립플롭", "플립 플롭", "flip-flop", "flipflop", "d-ff", "d 플립플롭", "dff"]);
      const qOuts = (analysis.signals?.outputs ?? []).filter((s) => /^Q/i.test(s)).length;
      // multiQ: 다중비트 상태(Q1Q0) 검출 — signals 미추출·표기 변동에도 견고하게.
      //   Vision은 "Q1Q0"를 항상 인접 표기하지 않는다 (예: "Q1과 Q0", "Q_1·Q_0", "Q1, Q0").
      //   인접 표기 + Q1·Q0 각각 언급 + D1·D0 다중 D-FF 라벨 모두 인정.
      const multiQ =
        qOuts >= 2 ||
        /q_?1\s*q_?0|q_?0\s*q_?1|q1q0|q0q1/i.test(text) ||
        (/q_?1\b/i.test(text) && /q_?0\b/i.test(text)) ||
        (/d_?1\b/i.test(text) && /d_?0\b/i.test(text));
      const wf = matchesKeyword(text, ["입력 파형", "출력 파형", "타이밍", "timing", "파형", "클록", "clock", "클럭", "상승 에지", "상승에지", "하강 에지", "에지에서"]);
      const statePt = matchesKeyword(text, ["㉠", "㉡", "㉢", "q값", "q_1q_0", "q1q0", "지점에서", "상태"]);
      // 임용 12번 단계3 고유 시그니처: 점선 부분을 "최소한의 AND/OR 게이트"로 재구성/도시.
      //   임용 8번(ff_with_waveform: 단일 Q + 비동기 RESET)엔 없는 문구 → 두 형식 판별에 사용.
      const minGateReconstruct = matchesKeyword(text, [
        "최소한의 논리 게이트", "최소한의 게이트", "최소 게이트", "최소한의 and", "최소의 and",
        "and 게이트와 or", "and게이트와 or", "최소화하여 도시", "최소한의 논리", "논리 게이트로 재구성",
        "게이트로 재구성", "최소 논리",
      ]);
      // ★ T-FF + JK-FF 혼합(임용 9번)은 이 블록(D-FF 다중비트 / JK 전용 카운터) 어느 쪽도 아니다.
      //   아래 flipflop_mixed_app 전용 분기로 흘려보낸다 — 안 그러면 sequential_dff_generic으로
      //   변질돼 FF가 1개인 회로가 생성된다(실측 신고).
      const tJkMixed =
        matchesKeyword(text, ["t 플립플롭", "t-ff", "t 플립", "t-플립", "t flip"]) &&
        matchesKeyword(text, ["jk 플립플롭", "j-k 플립플롭", "jk-ff", "j-k 플립", "jk 플립", "jk flip"]);
      if (!tJkMixed && ffKwSeq && (multiQ || minGateReconstruct) && (wf || statePt)) {
        // ★ JK 가드 (defense-in-depth) — 이 branch는 D-FF 전용(reasoning "D-FF 다중비트").
        //   위 jk_sync_counter 매치가 "카운터" 키워드 누락으로 못 잡은 JK-FF 다중비트 타이밍
        //   문제가 여기로 흘러 D-FF 상태설계로 변질되는 것을 차단. JK만 있고 D 없으면 JK 카운터로.
        //   ★ T-FF도 제외 — "T 플립플롭 + JK 플립플롭 응용회로"(임용 9번)는 JK 전용 카운터가 아니라
        //     flipflop_mixed_app이다. 이 배제가 없어 T+JK 원본이 JK 카운터로 변질됐다(실측 신고).
        const jkOnly =
          matchesKeyword(text, ["jk 플립플롭", "j-k 플립플롭", "jk-ff", "j-k 플립", "jk 플립", "jk flip"]) &&
          !matchesKeyword(text, ["d 플립플롭", "d-ff", "d 플립", "d-플립", "d flip"]) &&
          !matchesKeyword(text, ["t 플립플롭", "t-ff", "t 플립", "t-플립", "t flip"]);
        if (jkOnly) {
          return {
            type: "jk_sync_counter",
            params: {},
            confidence: "high",
            reasoning: "JK 플립플롭 다중비트 타이밍/상태분석 (카운터 키워드 누락 fallback) → JK 동기식 카운터",
          };
        }
        return {
          type: "sequential_dff_generic",
          params: {},
          confidence: "high",
          reasoning: `D-FF 다중비트 상태(Q=${qOuts}, multiQ=${multiQ}, minGate=${minGateReconstruct}) + 타이밍/상태분석 → 순서논리 generic (kmap·counter·ff_waveform 오분류 차단)`,
        };
      }
    }
    if (
      !sequentialLogicSignature &&
      (has4PlusVars ||
        hasMultiFunctions ||
        sigmaMintermKw ||
        (multiFuncKw && kmapKw) ||
        (multiOutput && kmapKw) ||
        (singleZOutput && kmapKw && combineKw))
    ) {
      const triggered: string[] = [];
      if (has4PlusVars) triggered.push(`N=${inputsAll.length}≥4`);
      if (hasMultiFunctions) triggered.push(`M=${distinctFCount}≥2`);
      if (sigmaMintermKw) triggered.push("Σm");
      if (multiFuncKw && kmapKw) triggered.push("multi-func kw + kmap");
      if (singleZOutput && kmapKw && combineKw) triggered.push("single Z + kmap + 결합");

      // ★ 공유항·입력결정 형식 감지 (임용 7번 정보과 등) — 생성 "방향" 파라미터.
      //   원본이 "M개 함수가 Σm/식으로 주어지고 + 빈 K-map + 회로 입력 ㉠/ⓐ 빈칸 + 중복(공유) 항 도출"
      //   형식이면 출력 합성(정방향)이 아니라 입력 결정(역방향) 문제다.
      //   universal_digital pipeline이 이 param으로 sharedTermInputBlank 모드로 분기한다.
      //   (combinational_gate의 "빈칸 게이트(ⓐⓑ) 종류 결정" 형식과 구분 — 그쪽은 K-map이 채워져
      //   주어지고 게이트를 구하므로 공유항/Σm/입력변수 시그니처가 없다.)
      const funcSignatureCount = new Set(
        Array.from(text.matchAll(/([A-Z])\s*\(\s*[A-Z](?:\s*,\s*[A-Z])+\s*\)/g)).map((m) => m[1]),
      ).size;
      const multiFunc = multiOutput || hasMultiFunctions || funcSignatureCount >= 2;
      const blankMarkerKw = matchesKeyword(text, [...BLANK_CIRCLE_MARKERS, "ⓐ", "ⓑ", "ⓒ"]);
      const sharedTermKw = matchesKeyword(text, [
        "중복되는", "중복 항", "중복된", "중복항",
        "공유 항", "공유되는", "공유항",
        "공통 항", "공통되는", "공통 곱항", "공통항",
        "shared term",
      ]);
      const inputVarBlankKw = matchesKeyword(text, [
        "들어갈 입력변수", "들어갈 입력 변수",
        "입력변수를 결정", "입력 변수를 결정",
        "입력변수를 순서대로", "입력 변수를 순서대로",
      ]);
      const sharedTermInputBlank =
        kmapKw && multiFunc && blankMarkerKw && (sharedTermKw || inputVarBlankKw || sigmaMintermKw);
      if (sharedTermInputBlank) {
        triggered.push("공유항·입력결정 (sharedTermInputBlank)");
      }

      return {
        type: "universal_digital",
        params: sharedTermInputBlank ? { sharedTermInputBlank: true } : {},
        confidence: "high",
        reasoning: `digital N-var/M-func — ${triggered.join(", ")} → universal_digital path`,
      };
    }
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
    // ★ 양보 가드 — ff_with_waveform은 **단일 Q(FF 1개)** 형식(임용 8번)이다.
    //   실측 신고: "T 플립플롭 + JK 플립플롭 응용회로"(임용 9번, FF 2개 + 상태표 ㉠~㉣ + 파형)가
    //   "FF + 파형"이라는 넓은 조건에 걸려 여기서 잡혀버렸고, **플립플롭이 1개인 회로**가 생성됐다.
    //   flipflop_mixed_app 분기는 훨씬 아래(hasTFf && hasJkFf)라 도달조차 못 했다.
    //   → 구조 시그니처(FF 종류 2개 또는 Q 출력 2개)면 전용 분기에 양보한다.
    const ffTypeNames = [
      matchesKeyword(text, ["D 플립플롭", "D-FF", "D 플립"]),
      matchesKeyword(text, ["T 플립플롭", "T-FF", "T 플립"]),
      matchesKeyword(text, ["JK 플립플롭", "JK-FF", "JK 플립", "J-K 플립플롭"]),
    ].filter(Boolean).length;
    const multiQOutputs =
      /Q_?A|Q_?B|Q₀|Q₁|Q_?0\b|Q_?1\b|Q_?2\b/.test(text) &&
      (outputs.filter((s) => /^Q/.test(s)).length >= 2 || /Q_?A[\s\S]{0,40}Q_?B|Q_?1[\s\S]{0,40}Q_?2/.test(text));
    const yieldToMultiFf = ffTypeNames >= 2 || multiQOutputs;
    const ffWaveformMatch =
      ffInferred &&
      !yieldToMultiFf &&
      (waveformKw || resetKw || asyncKw || propDelayKw || (hasInputsABC && (outputsHaveQ || hasOutputsXY)));
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
    // ★ 임용 8번 형식 — 타이밍 도표만 given → 학생이 카르노맵·회로·NAND 도출 (임용 5번 역방향).
    //   discriminator: 타이밍 도표 + "카르노맵 작성"(도출) + (NAND OR 회로 "도시"). 임용 5번은 회로가
    //   given(㉠ 게이트 식별)이라 "회로를 도시"·NAND가 없음. combinational_gate 오분류 차단.
    {
      const inputsABC = ["A", "B", "C"].every((v) => (analysis.signals?.inputs ?? []).includes(v));
      const outF = (analysis.signals?.outputs ?? []).some((s) => /^F$/i.test(s));
      const timingGiven =
        matchesKeyword(text, ["타이밍 도", "타이밍도", "timing diagram", "타이밍 다이어그램", "타이밍 도표", "타이밍도표"]) ||
        Boolean(analysis.semantic?.hasWaveformEvolution) ||
        (inputsABC && outF);
      const deriveKmap = matchesKeyword(text, ["카르노 도", "카르노맵", "카르노도", "karnaugh", "카르노"]);
      const deriveCircuitOrNand = matchesKeyword(text, [
        "nand", "논리회로를 도시", "논리 회로를 도시", "회로를 도시", "논리회로로 도시", "회로로 도시", "도시한다", "도시하시오",
      ]);
      if (timingGiven && deriveKmap && deriveCircuitOrNand) {
        return {
          type: "waveform_analysis",
          params: { timingGivenDeriveCircuit: true },
          confidence: "high",
          reasoning: "digital_logic + 타이밍 도표 given + 카르노맵 작성 + 회로/NAND 도시 (임용 8번 역방향)",
        };
      }
    }
    if (analysis.topicKey === "waveform_analysis" || matchesKeyword(text, ["입력 파형", "출력 파형", "타이밍도", "timing diagram", "사각파", "파형 분석"])) {
      return {
        type: "waveform_analysis",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + 파형 분석 키워드/topic",
      };
    }
    // ── sequence_detector: 시퀀스 검출기 + D-FF + 상태도/표 빈칸 (임용 8번 정보과) ──
    //   fsm보다 먼저 매치 (더 구체적인 형식).
    //   트리거: 시퀀스/검출/패턴 + D-FF + (상태도/상태표/빈칸 마커)
    //   분석기가 "시퀀스 검출기"를 정확히 못 잡는 경우(typo·일반 FSM 표현)도 catch하도록 broaden.
    const seqDetectorKw = matchesKeyword(text, [
      "시퀀스 검출", "시퀀스 검사", "시퀀스 인식", "시퀀스 점프",  // 검출기 typo 보호
      "sequence detector", "sequence detection",
      "검출기의 블록도", "검출기 블록도",
      "'110'", "'101'", "'011'", "'1010'",
      "110의 순서", "101의 순서", "011의 순서", "1010의 순서",
      "110이 입력", "101이 입력", "011이 입력",
      "순서대로 입력", "비트열 검출",
    ]);
    const dffKw = matchesKeyword(text, ["d 플립플롭", "d-플립플롭", "d 플립", "d-ff", "dff", "d flip-flop", "d flipflop"]);
    const stateBlankKw = matchesKeyword(text, [
      "㉠", "㉡", "㉢", "㉣", "ⓐ", "ⓑ", "ⓒ", "ⓓ",
      "상태도", "상태 전이도", "상태천이도", "state diagram",
      "상태표", "상태 표", "state table",
      "다음 상태", "다음상태", "현재 상태", "현재상태",
    ]);
    // 빈칸 마커는 sequence_detector의 강한 지표 (상태도/상태표에 학생 채울 자리)
    const hasBlankMarkers = /[㉠-㉣]|[ⓐ-ⓓ]/.test(text);
    // D-FF 2개 inventory도 강한 지표 (sequence_detector 핵심 hardware)
    const dffInventoryCount = (analysis.componentInventory ?? []).filter((c) => {
      const t = String(c.type ?? "").toUpperCase();
      return t === "DFF" || t === "D-FF" || t === "D_FF";
    }).length;
    // 라우팅 조건 — 다음 중 하나라도 만족하면 sequence_detector:
    //   (A) 시퀀스 키워드 + D-FF 키워드 + 상태도/표/빈칸 키워드 (강한 신호)
    //   (B) 빈칸 마커 ㉠~㉣/ⓐ~ⓓ + (D-FF 키워드 OR D-FF inventory ≥ 2) — 매우 specific
    //   (C) topicKey === "sequence_detector" 명시
    //   (D) text에 quoted pattern '110'/'101' + D-FF
    const hasQuotedPattern = /['"](1[01]+|0[01]+)['"]/.test(text);
    const trigA = seqDetectorKw && (dffKw || dffInventoryCount >= 2) && stateBlankKw;
    const trigB = hasBlankMarkers && (dffKw || dffInventoryCount >= 2);
    const trigC = analysis.topicKey === "sequence_detector";
    const trigD = hasQuotedPattern && (dffKw || dffInventoryCount >= 2);
    // ★ J-K 플립플롭 가드 — JK-FF 기반 상태도/상태표 문제(임용 9번 전자)는 sequence_detector가 아님.
    //   진짜 시퀀스 검출기 문제(임용 8번 정보과)는 D 플립플롭만 사용 — J-K 언급 자체가 없다.
    //   (GPT가 오해석하면 D-FF 키워드도 함께 넣으므로 "&& !dffKw" 조건은 가드를 무력화함 — 제거.)
    const jkFfGuard = matchesKeyword(text, [
      "JK 플립플롭", "J-K 플립플롭", "JK-FF", "J-K 플립", "JK 플립",
    ]);
    // ★ 검출 증거 게이트 — 진짜 시퀀스 검출기 문제는 검출 패턴('110' 등 quoted 비트열) 또는
    //   블록도(입력 → 검출기 박스 → 출력) 언급이 본문에 반드시 있다. GPT가 J-K 상태도 문제를
    //   topic·topicKey까지 "시퀀스 검출기"로 오해석해도 이 게이트가 차단 (실제 신고 사례).
    const blockDiagramKw = matchesKeyword(text, ["블록도", "블록 다이어그램", "block diagram"]);
    const seqEvidenceGate = hasQuotedPattern || blockDiagramKw;
    if ((trigA || trigB || trigC || trigD) && !jkFfGuard && seqEvidenceGate) {
      // 시퀀스 패턴 추출 — text에 '110'/'101'/'011' 등이 quoted로 있으면 그것 사용, 없으면 기본 '110'
      const seqMatch = text.match(/['"](1[01]+|0[01]+)['"]/);
      const pattern = seqMatch ? seqMatch[1] : "110";
      const triggers = [trigA && "seq+D-FF+state", trigB && "blanks+D-FF", trigC && "topicKey", trigD && "pattern+D-FF"].filter(Boolean).join(",");
      return {
        type: "sequence_detector",
        params: { sequencePattern: pattern },
        confidence: "high",
        reasoning: `digital_logic + sequence_detector → 패턴 '${pattern}' (트리거: ${triggers})`,
      };
    }
    // FF 종류·상태표 키워드 — fsm 분기와 flipflop_mixed_app 분기가 공유.
    const hasTFf = matchesKeyword(text, ["T 플립플롭", "T-FF", "T 플립", "T-플립", "T flip-flop", "T flipflop"]);
    const hasJkFf = matchesKeyword(text, [
      "JK 플립플롭", "JK-FF", "JK 플립", "JK-플립", "JK flip-flop", "JK flipflop",
      "J-K 플립플롭", "J-K 플립", "J-K flip-flop", "J-K FF",
    ]);
    const hasStateTableKw = matchesKeyword(text, ["상태표", "상태 표", "다음 상태", "현재 상태", "차기 상태", "state table"]);
    const hasWaveformKw = matchesKeyword(text, ["파형", "타이밍도", "timing diagram", "waveform", "출력 파형"]);
    const hasStateDiagramKw = matchesKeyword(text, ["상태도", "상태 전이도", "상태천이도", "state diagram"]);

    // ★ JK 상태표 형식 (임용 9번 전자) — JK-FF + 상태도 + 상태표.
    //   fsm으로 분류하되 params로 JK 상태표 모드를 신호 → runFsmPipeline이
    //   D-FF+MUX 형식 대신 원본 방향(상태표 빈칸 → y 논리식 → J_A·J_B 식)으로 생성.
    const isJkStateTableFormat = hasJkFf && hasStateDiagramKw && !hasTFf;
    // ★ D-FF + 2×1 MUX + 상태도 FSM (임용 8번 정보과) — runFsmPipeline이 synthesizeMuxFsm으로
    //   D_A·D_B를 각각 2×1 MUX로 합성(선택신호 ㉠~㉣ 도출). "상태도"가 fsm 키워드에 없어 mux_implementation(조합)으로
    //   새던 것 차단. 트리거: (상태도/순서논리) + MUX + (D-FF inventory 또는 순차문맥).
    const hasMuxLocalFsm = matchesKeyword(text, ["멀티플렉서", "multiplexer", "2×1 mux", "2x1 mux", "2:1 mux", " mux "]);
    // ★ 띄어쓰기 변형까지 (Vision 요약은 "순서 회로"/"순차 회로"처럼 띄어 쓰는 경우가 잦다 — 실측).
    const hasSeqLocalFsm = matchesKeyword(text, [
      "상태도", "상태 전이도", "상태천이도", "상태표", "상태 표",
      "순서논리", "순차논리", "순서 논리", "순차 논리",
      "순서회로", "순차회로", "순서 회로", "순차 회로",
    ]);
    const hasDFfInv = (analysis.componentInventory ?? []).some((c) => {
      const t = String(c.type ?? "").toUpperCase(); const v = String(c.value ?? "").toLowerCase();
      return t === "D" || /d\s*flip|d-?ff|d\s*플립/.test(v);
    });
    const isMuxFsm = hasMuxLocalFsm && hasSeqLocalFsm && (hasDFfInv || matchesKeyword(text, ["d 플립플롭", "d-ff", "d flip", "순서논리", "순차논리"]));
    // ★ D-FF/T-FF + 2×1 MUX 자율 순환 (임용 8번) → 전용 archetype(세로 스택 렌더러). fsm(generic) 앞.
    if (isMuxFsm && !hasJkFf) {
      classifierLog.info("classify_result", { type: "dff_mux_sequential", route: "digital_dff_mux", subject });
      return {
        type: "dff_mux_sequential",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + D-FF/T-FF + 2×1 MUX + 상태도/순차 → D-FF+MUX 자율 순차회로 (임용 8번, 전용 세로 스택 렌더러)",
      };
    }
    // ★ T 플립플롭 + JK 플립플롭 혼합 응용회로 (임용 9번) → flipflop_mixed_app.
    //   두 종류(T·JK)가 모두 있으면 명확한 시그니처 → generic fsm(단일 FF 합성·상태표 없음)이
    //   가로채기 전에 최우선 매치. (MUX 없음 → dff_mux_sequential 아님.)
    if (hasTFf && hasJkFf && !hasMuxLocalFsm) {
      classifierLog.info("classify_result", { type: "flipflop_mixed_app", route: "digital_tff_jkff_mixed", subject });
      return {
        type: "flipflop_mixed_app",
        params: { ffTypes: ["T", "JK"], hasStateTable: hasStateTableKw, hasWaveform: hasWaveformKw },
        confidence: "high",
        reasoning: "digital_logic + T-FF + JK-FF 혼합 응용회로 (상태표/파형) → flipflop_mixed_app (임용 9번, 2개 FF)",
      };
    }
    // ★ T-FF가 있으면 generic fsm(합성)에 양보하지 않음 — tff_state_table_blank·flipflop_mixed_app 전용 경로로.
    //   (fsm block이 topicKey=fsm/FSM 키워드로 T-FF 형식을 가로채 단일 FF·상태표 없음으로 변질하던 것 차단.)
    if (
      !hasTFf &&
      (analysis.topicKey === "fsm" ||
        matchesKeyword(text, ["FSM", "유한 상태", "유한상태", "Mealy", "Moore", "상태 기계", "상태 머신", "상태 전이도", "상태천이도"]) ||
        isJkStateTableFormat)
    ) {
      // JK + 상태표 시그니처면 JK 상태표 모드 params 전달 (topicKey=fsm으로 와도 동일 적용)
      const jkStateTable = hasJkFf && (hasStateTableKw || hasStateDiagramKw) && !hasTFf;
      return {
        type: "fsm",
        params: jkStateTable ? { ffTypes: ["JK"], hasStateTable: true } : {},
        confidence: "high",
        reasoning: jkStateTable
          ? "digital_logic + J-K 플립플롭 + 상태도/상태표 → fsm (JK 상태표 모드)"
          : "digital_logic + FSM 키워드/topic",
      };
    }

    // ★ 임용 7번 정보과 형식 (tff_state_table_blank) — flipflop_mixed_app 보다 위 매치.
    //   원본: (가) T-FF 2개(T_A·T_B) + 조합부 + 입력 C — (나) 상태표 + 빈칸 ㉠~㉧ —
    //         풀이: [단계 1] T_A·T_B 입력식 → [단계 2] 상태표 빈칸 → [단계 3] Q_A(t+1)·Q_B(t+1) K-map.
    //   트리거: T-FF + 상태표 + JK 없음 + (T-FF 2개 시그니처 OR 빈칸 마커 OR K-map 도출 키워드).
    const tffInventoryCount = (analysis.componentInventory ?? []).filter((c) =>
      ["TFF", "T-FF", "T_FF"].includes(String(c.type ?? "").toUpperCase())
    ).length;
    const hasTffPairSig = tffInventoryCount >= 2 || matchesKeyword(text, [
      "T 플립플롭 2", "T-FF 2", "T 플립플롭 A, B", "T 플립플롭 A B",
      "T 플립플롭 A·B", "T_A", "T_B", "두 개의 T 플립플롭", "T 플립플롭 두 개",
      "Q_A(t+1)", "Q_B(t+1)", "Q_A·Q_B",
    ]);
    const hasBlankMarkers7 = /[㉠-㉧]/.test(text);
    const hasKmapDerivationKw = matchesKeyword(text, [
      "카르노도", "카르노맵", "최소화된 불 함수", "최소 SOP", "최소 곱의 합",
      "k-map", "kmap", "카르노",
    ]);
    if (
      hasTFf && hasStateTableKw && !hasJkFf &&
      (hasTffPairSig || hasBlankMarkers7 || hasKmapDerivationKw)
    ) {
      const triggers: string[] = ["T-FF", "상태표"];
      if (hasTffPairSig) triggers.push("T-FF 2개 시그니처");
      if (hasBlankMarkers7) triggers.push("㉠~㉧ 빈칸");
      if (hasKmapDerivationKw) triggers.push("K-map 도출");
      return {
        type: "tff_state_table_blank",
        params: {},
        confidence: "high",
        reasoning: `T-FF 2개 + 상태표 + (${triggers.slice(2).join("·")}) → 임용 7번 정보과 형식`,
      };
    }

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
    // ★ 순차(플립플롭·상태표·클럭) 문맥이면 양보한다 (2026-07-29) — MUX 낱말만으로 잡으면
    //   D-FF/T-FF + 2×1 MUX(dff_mux_sequential)·SR-FF + MUX(sr_ff_mux_sequential) 원본을
    //   조합논리 MUX 등가 문제로 변질시킨다(실측). mux_implementation은 **조합논리** 전용이다.
    const seqCtxForMux = matchesKeyword(text, [
      "플립플롭", "flip-flop", "flipflop", "d-ff", "t-ff", "sr-ff", "jk-ff",
      "상태표", "상태 표", "상태도", "상태 전이", "상태 천이", "여기표", "카운터", "클럭", "clk",
    ]);
    // ★ 디멀티플렉서/디코더는 별도 archetype(demux_waveform) — "멀티플렉서" 부분 포함 함정 차단.
    const isDemuxCtx = matchesKeyword(text, ["디멀티플렉서", "demux", "디코더", "decoder"]);
    if (matchesKeyword(text, muxKeywords) && !seqCtxForMux && !isDemuxCtx) {
      return {
        type: "mux_implementation",
        params: {},
        confidence: "high",
        reasoning: "digital_logic + MUX/멀티플렉서/선택선 키워드 (순차 문맥 없음 = 조합논리 MUX 등가)",
      };
    }
    // ★ 임용 5번 정보과 형식 (truth_table → blank gate identification) — combinational_gate 우선보다 위.
    //   원본: (가) 진리표(4변수 W,X,Y,Z + don't care ×) + (나) 간략화된 조합논리회로(인버터·AND·㉠ 빈칸).
    //   풀이: [단계 1] K-map 도출 → [단계 2] 최소 SOP + ㉠ 게이트 식별 → [단계 3] 점선 부분 게이트 식별.
    //   트리거: 진리표 키워드 + ㉠~㉣ 빈칸 마커 + 단일 출력 (multi-output 키워드 없음).
    if (
      matchesKeyword(text, TRUTH_TABLE_KEYWORDS) &&
      matchesKeyword(text, BLANK_CIRCLE_MARKERS) &&
      !matchesKeyword(text, MULTI_OUTPUT_KEYWORDS)
    ) {
      return {
        type: "kmap_sop",
        params: { truthTableBlank: true },
        confidence: "high",
        reasoning: "진리표(가) + ㉠ 빈칸 회로(나) → 임용 5번 형식 (kmap_sop with truthTableBlank)",
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
  // ★ sin/cos 시간함수는 괄호 유무 무관하게 AC ("10√2 sin4000t V", "20cos(ωt-90°)" 모두).
  //   임용 기출은 괄호 없는 "sin4000t" 표기가 흔함 — 괄호 필수 정규식은 AC 감지를 놓침.
  const inv = analysis.componentInventory ?? [];
  const hasACInventory = inv.some((c) => {
    if (c.type !== "V" && c.type !== "I" && c.type !== "L" && c.type !== "C") return false;
    const v = String(c.value ?? "");
    return /∠|\bj\s*\d|페이저|phasor|cos|sin|ωt|√2/i.test(v);
  });
  // DC 전압원 존재 — 값에 AC 패턴(cos/sin/∠/√2/phasor)이 없는 V 소스. AC+DC 중첩 판별용.
  //   ★ 종속전원("2V_c" 등)은 DC 독립원이 아니다 — 제외하지 않으면 "AC+DC 중첩"으로 오분류된다(실측).
  const hasDcVSource = inv.some(
    (c) =>
      c.type === "V" &&
      !isDependentSourceValue(c.value) &&
      !/∠|\bj\s*\d|페이저|phasor|cos|sin|ωt|√2/i.test(String(c.value ?? "")),
  );

  // 종속전원이 type=V/I로 잡히고 값만 제어식("2i_x"·"2V_c")인 경우(Vision) 검출.
  const hasDependentByValue = (analysis.componentInventory ?? []).some(isDependentComponent);
  const decision = decideType({
    topicKey,
    features,
    semantic,
    counts,
    text,
    hasACInventory,
    hasDcVSource,
    nodeAnnotations: analysis.nodeAnnotations,
    topicInterpText: `${analysis.topic ?? ""} ${analysis.interpretation ?? ""}`,
    hasDependentByValue,
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
// 초메쉬 음역 변형 모두 포함 — Vision이 "수퍼메시/초메쉬/초메시/수퍼매시" 등으로 흔들림.
const SUPERMESH_KEYWORDS = ["슈퍼메시", "수퍼메시", "수퍼매시", "슈퍼매시", "초메쉬", "초메시", "supermesh", "super mesh", "super-mesh"];
const SUPERNODE_KEYWORDS = ["슈퍼노드", "수퍼노드", "초마디", "초노드", "supernode", "super node", "super-node"];
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
// 임용 5번 정보과 — 진리표 + ㉠ 빈칸 회로 형식 트리거 키워드
const TRUTH_TABLE_KEYWORDS = ["진리표", "truth table", "truth_table"];
// ㉠ ㉡ ㉢ ㉣ — 빈칸 게이트/단계 마커 (sequence_detector에서도 사용하나 별도 매칭)
const BLANK_CIRCLE_MARKERS = ["㉠", "㉡", "㉢", "㉣"];
// multi-output(F·G·X·Y 두 함수) 키워드 — 단일 출력 분기에서 배제
const MULTI_OUTPUT_KEYWORDS = [
  "두 출력", "두개 출력", "두 개 출력", "다중 출력", "다중출력",
  "multi-output", "multiple output",
  "두 함수", "두개 함수", "두 개 함수",
];

function matchesKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

// ─── component count 집계 ──────────────────────
type Counts = {
  R: number; V: number; I: number; C: number; L: number; SW: number; dep: number;
  D: number;  // 다이오드 — universal_ac_pwl 트리거용
};

function aggregateComponentCounts(analysis: AnalysisResult): Counts {
  const c: Counts = { R: 0, V: 0, I: 0, C: 0, L: 0, SW: 0, dep: 0, D: 0 };
  const inv = analysis.componentInventory ?? [];
  const branches = analysis.topologySignature?.branches ?? [];

  // inventory에서 1차 카운트.
  for (const item of inv) {
    bumpCount(c, item.type, item.value);
  }

  // branches에서 fallback 카운트 — inventory가 누락한 타입을 보충.
  //   임용 8번에서 inventory extraction이 인덕터(L)를 못 잡아 ac_superposition으로 잘못 라우팅된 케이스.
  //   inventory와 branches 둘 다 신뢰원으로 사용해 max를 취한다.
  const invByType: Record<string, number> = {};
  for (const item of inv) {
    const t = (item.type ?? "").toUpperCase();
    invByType[t] = (invByType[t] ?? 0) + 1;
  }
  const brByType: Record<string, number> = {};
  for (const b of branches) {
    for (const comp of b.components ?? []) {
      const t = (comp.type ?? "").toUpperCase();
      brByType[t] = (brByType[t] ?? 0) + 1;
    }
  }
  for (const t in brByType) {
    const missing = brByType[t] - (invByType[t] ?? 0);
    if (missing > 0) {
      for (let i = 0; i < missing; i++) bumpCount(c, t);
    }
  }
  return c;
}

/**
 * 소자 1개를 카운트에 반영.
 *  ★ 종속전원 정규화: Vision이 다이아몬드 종속전원을 일반 V/I 타입으로 추출하고 제어식만
 *    value에 남기는 일이 잦다("2V_c"·"0.2V₃"). 그대로 두면 "독립 전원 2개"로 세어져 엉뚱한
 *    archetype에 잡히므로(실측: ac_dc_superposition_rc 오분류), 값이 제어량을 참조하면 dep로 센다.
 */
function bumpCount(c: Counts, type: string, value?: string | null): void {
  const t = (type ?? "").toUpperCase();
  if ((t === "V" || t === "I") && isDependentSourceValue(value)) {
    c.dep++;
    return;
  }
  if (t === "R") c.R++;
  else if (t === "V") c.V++;
  else if (t === "I") c.I++;
  else if (t === "C") c.C++;
  else if (t === "L") c.L++;
  else if (t === "SW") c.SW++;
  else if (t === "D") c.D++;
  else if (t === "VCVS" || t === "VCCS" || t === "CCVS" || t === "CCCS") c.dep++;
}

// ─── 분류 로직 ─────────────────────────────────
type DecideArgs = {
  topicKey: TopicKey | undefined;
  features: Partial<NonNullable<AnalysisResult["topologySignature"]>["features"]>;
  semantic: Partial<NonNullable<AnalysisResult["semantic"]>>;
  counts: Counts;
  hasACInventory?: boolean;
  /** DC 전압원 존재 (값에 AC 패턴 없는 V 소스) — AC+DC 중첩 판별용. */
  hasDcVSource?: boolean;
  text: string;
  /** topic + interpretation만 (relatedConcepts 제외) — 진짜 주제 키워드 판별용 */
  topicInterpText?: string;
  /** universal_dc 트리거용 — V_n 라벨 등 노드 어노테이션 */
  nodeAnnotations?: AnalysisResult["nodeAnnotations"];
  /** 종속전원이 inventory에 값 패턴(예 "2i_x")으로만 있고 type은 V로 잡힌 경우 검출 (counts.dep=0 보완). */
  hasDependentByValue?: boolean;
};

type DecideResult = {
  type: CircuitType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  /** decide 단계에서 결정되는 generator hint params (외부 기본 params에 merge). */
  params?: CircuitTypeParams;
};

function decideType(args: DecideArgs): DecideResult {
  const { topicKey, features, semantic, counts, text, hasACInventory, hasDcVSource, nodeAnnotations, topicInterpText } = args;

  // SW 존재 판정 — counts.SW에만 의존하지 말 것. GPT가 inventory 추출 시 SW를 가끔 누락함.
  //   features.hasSwitch OR text의 SW/스위치 키워드도 인정해서 robust하게.
  const switchedExplicitKw = matchesKeyword(text, [
    "스위치", "switch", "sw가", "sw는", "sw_", " sw ", "(sw)",
    "단자 a에서", "a에서 단자 b", "a → b", "a->b", "t=0에", "t = 0에", "t=0이",
  ]);
  const hasSwitchInferred = counts.SW > 0 || Boolean(features.hasSwitch) || switchedExplicitKw;

  // 0-PRE-AC-PWL. Universal AC + 다이오드 + SW (piecewise-linear) — 임용 6번 형식.
  //   트리거: D ≥ 1 + SW(inferred) + AC source (hasACInventory OR 교류/정현파/v_i(t) 키워드)
  //   목적: 새 다이오드+SW+AC 형식이 들어와도 archetype 추가 없이 rule path로 흡수.
  //   classifier만 우선 구현 (Phase 1). solver/생성기는 Phase 2~ — 현재는 pipeline에서 명시 에러 반환.
  const isAcSourceText = matchesKeyword(text, [
    "교류", "ac source", "ac 회로", "정현파", "sinusoidal",
    "v_i(t)", "vi(t)", "vs(t)", "v_s(t)", "v_in(t)",
    "주기", "period", "한 주기", "주기 t",
  ]);
  const hasAcSourceSignal = Boolean(hasACInventory) || isAcSourceText;
  if (counts.D >= 1 && hasSwitchInferred && hasAcSourceSignal) {
    return {
      type: "universal_ac_pwl",
      confidence: "high",
      reasoning: `다이오드 ${counts.D}개 + SW(inferred) + AC source (text·inventory) → piecewise-linear path`,
      params: {
        hasDiode: true,
        diodeCount: counts.D,
        hasSwitch: true,
        hasACSource: true,
        capacitorCount: counts.C,
        resistorCount: counts.R,
      },
    };
  }

  // 0-PRE-AC-DC-SUPER. 직류+교류 다중 전압원 + 정상상태 중첩 (임용 2022 B-6 형식) — universal_ac 흡수.
  //   트리거: 전압원 ≥ 2 (직류·교류 혼합) + L/C 존재 + AC 신호(inventory sin·cos/텍스트 교류 키워드)
  //          + 정상상태(steady state) 키워드 + 강한 과도(transient) 키워드 없음.
  //   ★ 스위치가 있어도 이 분기 우선 — 이 형식의 스위치는 전원 선택용(단자 연결)이지
  //     t=0 과도 스위칭이 아님. switched_rl(과도응답) 오분류를 여기서 차단.
  //   → universal_ac + params.acDcSuperposition (방향: 단계별 정상상태 해석 + 중첩 보존).
  const steadyStateKw = matchesKeyword(text, [
    "정상 상태", "정상상태", "steady state", "steady-state",
  ]);
  const strongTransientKw = matchesKeyword(text, [
    "과도 응답", "과도응답", "과도 해석", "transient",
    "시정수", "time constant", "시상수",
    "t=0에서", "t = 0에서", "t<0", "t > 0에서",
  ]);
  //   ★ 트리거 안정화 (2026-06-04): steadyStateKw 단독 의존은 Vision 문구 변동에 flaky해
  //     같은 회로가 ac_superposition으로 새는 문제 발생. 이 패턴의 정의적 시그니처로 교체:
  //     전압원 ≥ 2 + 전류원 0(= ac_superposition과 구분) + 리액티브 + AC 신호 + 스위치(전원 선택)
  //     + 강한 과도 키워드 없음. (정상상태 키워드는 보조 — 있으면 신뢰 ↑, 없어도 트리거.)
  // 0-PRE-AC-DC-SUPER-RC. 스위치 없는 AC+DC 중첩 RC 회로 (임용 12번 회로이론 형식) — switch 분기보다 먼저.
  //   ★ 구조 시그니처 기반 (Vision이 "중첩" 키워드를 자주 누락 — topic "교류 전원과 RC 회로 해석" 등):
  //     교류 전원(1+) + 직류 전압원(1+) + C(RC) + 스위치 없음 + 강한 과도 키워드 없음 = AC+DC 중첩 RC.
  //   ★ generic universal_ac 추출은 두 전원 병합·DC 소실·floating source → 전용 고정 토폴로지 archetype.
  //   ★ 기존 acDcSuperposition(스위치+RL)과 구조 다름 → !hasSwitchInferred로 분리.
  //   중첩 키워드는 보조 — hasDcVSource(inventory DC)로 "AC 2개"가 아닌 "AC+DC"임을 확정.
  //   ★★ Vision이 AC 전원을 inventory에서 통째로 누락하는 경우가 잦음(counts.V=1, DC만 추출)
  //      → V 개수에 의존 금지. DC는 inventory(hasDcVSource), AC는 텍스트/inventory(hasAcSourceSignal)로
  //      각각 감지해 "AC+DC"를 확정한다 (둘 다 있으면 V=1이어도 트리거).
  // ★ 양보 가드: 테브난 + 최대전력 + 복소 켤레 부하(단일 AC원 사다리 최대전력) 문제는 RC 중첩이 아니다.
  //   hasDcVSource 오판 시에도 가로채지 않고 generic universal_ac(topology-driven)로 흘려보낸다.
  const looksLikeTheveninLadder =
    (matchesKeyword(text, EQUIVALENT_KEYWORDS) ||
      matchesKeyword(text, ["테브난", "thevenin", "등가 임피던스", "등가 전압", "등가 회로"])) &&
    matchesKeyword(text, MAX_POWER_KEYWORDS) &&
    matchesKeyword(text, ["켤레", "공액", "conjugate", "복소 임피던스", "복소임피던스", "복소 부하", "복소 켤레"]);
  if (
    counts.I === 0 &&
    counts.C > 0 &&
    hasAcSourceSignal &&
    Boolean(hasDcVSource) &&
    !hasSwitchInferred &&
    !strongTransientKw &&
    !looksLikeTheveninLadder
  ) {
    return {
      type: "universal_ac",
      confidence: "high",
      reasoning:
        `AC 전원(텍스트/inventory) + DC 전압원(inventory, V=${counts.V}) + C(RC, C=${counts.C}) + I=0 + 스위치 없음 ` +
        `→ AC+DC 중첩 RC 모드 (임용 12번; Vision AC 소스 누락에도 견고)`,
      params: {
        acDcSuperpositionRc: true,
        hasACSource: true,
        resistorCount: counts.R,
        capacitorCount: counts.C,
      },
    };
  }

  if (
    counts.V >= 2 &&
    counts.I === 0 &&
    (counts.L > 0 || counts.C > 0) &&
    hasAcSourceSignal &&
    hasSwitchInferred &&
    !strongTransientKw
  ) {
    return {
      type: "universal_ac",
      confidence: "high",
      reasoning:
        `DC+AC 다중 전압원(V=${counts.V}, I=0) + L/C(L=${counts.L},C=${counts.C}) + 스위치(전원 선택)` +
        `${steadyStateKw ? " + 정상상태 키워드" : ""} → 중첩 모드 (과도응답 아님)`,
      params: {
        acDcSuperposition: true,
        hasACSource: true,
        hasSwitch: hasSwitchInferred,
        resistorCount: counts.R,
        inductorCount: counts.L,
        capacitorCount: counts.C,
        switchCount: counts.SW,
      },
    };
  }

  // 0-PRE-AC-THEVENIN-MAXPOWER. 2전원(전압원+전류원) 테브난 최대전력 (임용 10번 형식).
  //   고정 토폴로지 archetype — generic topology 추출이 두 전원망의 공통 부하 단자 연결을 잃어
  //   figure·물리 모두 깨지는 문제를 회피. V≥1 + I≥1 + 리액티브 + (테브난 OR 최대전력) 키워드.
  const isMaxPowerKwT = matchesKeyword(text, MAX_POWER_KEYWORDS);
  const isTheveninKwT =
    matchesKeyword(text, EQUIVALENT_KEYWORDS) ||
    matchesKeyword(text, ["테브난", "thevenin", "등가 임피던스", "등가임피던스", "등가 전압"]);
  if (
    counts.V >= 1 && counts.I >= 1 &&
    (counts.L > 0 || counts.C > 0) &&
    (isMaxPowerKwT || isTheveninKwT)
  ) {
    return {
      type: "universal_ac",
      confidence: "high",
      reasoning: `2전원(V=${counts.V},I=${counts.I}) + 리액티브 + 테브난/최대전력 → 고정 archetype (theveninMaxPower)`,
      params: {
        theveninMaxPower: true,
        hasACSource: true,
        resistorCount: counts.R,
        inductorCount: counts.L,
        capacitorCount: counts.C,
      },
    };
  }

  // 0-PRE-AC-THEVENIN-LADDER. 단일 AC원 L-C-R 사다리 + 테브난 + ★복소 켤레★ 최대평균전력 (임용 7번 회로이론).
  //   원본: V_RMS — 직렬 L — 마디 — 션트 C — 직렬 R — 단자 a·b 부하 Z_L. Z_TH·V_TH·Z_L=R+jX·P_max 도출.
  //   ★ generic universal_ac(topology-driven)는 perturb/rebuild에서 사다리를 "병렬 leg 회로"로 변질
  //     (실측: L∥C 병렬·없던 R leg 추가·R 션트화) → 전용 결정론 archetype 필수.
  //   ★ 2전원 theveninMaxPower(I≥1)·ac_bridge(브리지·둘 다 순저항 R_L=|Z_th|)와 구분:
  //     ★ 복소 켤레 부하 Z_L = R + jX (conjugate match) ★ 가 결정적 판별자(=looksLikeTheveninLadder). 단일 전원(I=0).
  //   bridge 검사보다 먼저 — 복소 켤레면 사다리(브리지의 V_A·V_B/단자 단서보다 우선).
  if (
    counts.I === 0 && counts.V >= 1 && (counts.L > 0 || counts.C > 0) &&
    looksLikeTheveninLadder
  ) {
    return {
      type: "ac_thevenin_ladder",
      params: {},
      confidence: "high",
      reasoning: `단일 AC원(I=0) + 리액티브 + 테브난 + 복소 켤레 부하(Z_L=R+jX) 최대전력 → ac_thevenin_ladder (임용 7번 회로이론, universal_ac 사다리 상실 차단)`,
    };
  }

  // 0-PRE-AC-BRIDGE-MAXPOWER. AC 휘트스톤 브리지 + 테브난 + 최대평균전력 (임용 7번).
  //   단일 교류원 + 4-arm 브리지(L·C·R) + 단자 A·B 부하 R_L. ★ generic universal_ac는 브리지
  //   (다이아몬드 4-arm + A·B 가교) 구조를 잃고 임의 병렬회로로 변질 → 전용 archetype 필수.
  //   2전원 theveninMaxPower(위)와 구분: 전류원 없음(I=0). 시그니처: 테브난+최대전력+(단자A·B/V_A·V_B/브리지).
  {
    const bridgeSig = /v_?a\b|v_?b\b|단자\s*a|단자\s*b|브리지|bridge|휘트스톤|wheatstone|v_?th|z_?th/i.test(text);
    const isMaxPB = matchesKeyword(text, MAX_POWER_KEYWORDS);
    const isThevB = matchesKeyword(text, ["테브난", "thevenin", "등가 임피던스", "등가임피던스", "등가 회로"]);
    // ★ 단일 AC원 사다리(복소 켤레 부하)는 브리지가 아니다 — 양보해 generic universal_ac로 보냄.
    //   브리지는 순저항 R_L(다이아몬드 4-arm), 사다리는 복소 켤레 Z_L=R+jX. looksLikeTheveninLadder로 구분.
    //   (사다리도 "단자 a·b"·"z_th"를 가져 bridgeSig에 걸리므로, 복소 켤레면 브리지에서 제외 필수.)
    if (counts.I === 0 && counts.V >= 1 && counts.L > 0 && counts.C > 0 && isMaxPB && isThevB && bridgeSig && !looksLikeTheveninLadder) {
      return {
        type: "ac_bridge_max_power",
        params: {},
        confidence: "high",
        reasoning: `단일 AC원 + L·C·R 브리지 + 테브난 + 최대전력 + 단자A·B → ac_bridge_max_power (임용 7번, universal_ac 브리지 상실 차단)`,
      };
    }
  }

  // 0-PRE-AC-RLC-BANDWIDTH. 직렬 RLC 공진 + 대역폭 (임용 11번) — universal_ac보다 먼저.
  //   원본: ω₀·C 주어지고 L 도출·V_ab 페이저·**대역폭 β=R/L**·R변경 시 β₁/β₂.
  //   ★ generic universal_ac 쿼리추론은 "공진주파수·C 찾기"라는 엉뚱한 generic 문제를 만들어
  //     대역폭·L도출·V_ab 구조를 잃음 → 전용 결정론 archetype.
  //   판별 키: 공진 + **대역폭/β**(bandwidth) — 일반 공진문제와 구분하는 결정적 단서.
  {
    const hasReactive = counts.L > 0 || counts.C > 0;
    const isResonance = matchesKeyword(text, ["공진", "resonance", "공진주파수", "공진 주파수", "ω₀", "ω_0", "omega_0", "omega0"]);
    const hasBandwidth = matchesKeyword(text, [
      "대역폭", "대역 폭", "bandwidth", "band width",
      "β₁", "β1", "β₂", "β2", "β [rad", "β[rad", "beta_1", "beta1", "beta_2", "beta2",
      "rad/sec", "rad/s 대역", "half-power", "반전력", "−3db", "-3db", "3db 대역",
    ]);
    if (hasReactive && isResonance && hasBandwidth) {
      return {
        type: "rlc_resonance_bandwidth",
        params: {},
        confidence: "high",
        reasoning: "직렬 RLC + 공진 + 대역폭(β=R/L) → rlc_resonance_bandwidth (universal_ac generic 공진문제 오분류 차단)",
      };
    }
  }

  // 0-PRE-AC-PB. AC 다중 가지 phasor (임용 5번) — ★ universal_ac보다 먼저 ★.
  //   V_s + R_top + I_s + (L1 ∥ L2 ∥ R ∥ C) 5-가지 구조. 전용 generator + 고정슬롯 렌더러 보유.
  //   ★ universal_ac generic이 먼저 잡으면 topology-driven으로 변질(L_leg2 등 노드 겹침) → 그 앞에 매치.
  //   시그니처: R + L≥2(핵심) + C + AC + 단자 a·b 없음 (L≥2가 generic AC와 구분).
  {
    const hasABpb = matchesKeyword(text, ["단자 a", "단자 b", "a-b", "ab간", "a, b"]);
    const acKwPb = matchesKeyword(text, AC_PHASOR_KEYWORDS) || Boolean(hasACInventory) || matchesKeyword(text, ["교류", "ac 회로", "페이저", "가지 전류"]);
    if (!hasABpb && counts.R > 0 && counts.L >= 2 && counts.C > 0 && acKwPb) {
      return {
        type: "ac_parallel_branches",
        confidence: "high",
        reasoning: `AC + multi-L(${counts.L}) + C + R + 단자 a·b 없음 → ac_parallel_branches (임용 5번, universal_ac 앞)`,
      };
    }
  }

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
  // ★ 중첩은 **단어가 아니라 절차**로도 판정한다 — Vision이 "중첩"을 안 쓰고
  //   "전류원을 개방하고 / 전압원을 단락시켜 각각 구한다"로만 서술하는 실행이 잦다(실측 신고:
  //   임용 10번 원본이 이 때문에 universal_ac로 새서 회로가 통째로 깨졌다).
  //   전원을 하나씩 죽여 각각 구하는 서술 = 중첩의 원리 그 자체.
  const superpositionProcedure =
    (/전류원[^.]{0,15}(개방|open)/.test(text) && /전압원[^.]{0,15}(단락|short)/.test(text)) ||
    /(개방|단락)[^.]{0,25}(각각|합|더하|모두 더)/.test(text);
  const isAcSuperpositionStrict =
    (matchesKeyword(text, ["중첩의 원리", "중첩원리", "superposition", "중첩"]) || superpositionProcedure)
    && counts.V > 0 && counts.I > 0;
  const isClassicMaxPower = matchesKeyword(text, MAX_POWER_KEYWORDS) && counts.R >= 4;
  // ★ 임용 9번(RLC 주파수응답 곡선 → 정전용량 C 도출)에 양보 (2026-07-27).
  //   generic universal_ac는 "필요한 C 구하기" 같은 다른 문제를 만들어 (나) 곡선 구조를 잃는다.
  //   고유 신호 = **주파수응답 곡선(그래프·진폭)** + **정전용량 도출**. 둘 다 있을 때만 양보하므로
  //   일반 공진 문제(universal_ac 흡수 대상)는 그대로 둔다.
  const isRlcCurveCapacitance =
    matchesKeyword(text, ["주파수 응답", "주파수응답", "공진"]) &&
    matchesKeyword(text, ["그래프", "곡선", "진폭"]) &&
    matchesKeyword(text, ["정전용량", "커패시턴스", "capacitance"]);
  if (
    hasReactiveUniversal &&
    isAcKw &&
    !isClassicSwitchedRlc &&
    !isAcSuperpositionStrict &&
    !isClassicMaxPower &&
    !isRlcCurveCapacitance
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
  //    ★ C는 inventory(C>0) OR 텍스트(커패시터·v_C) — Vision이 커패시터를 자주 누락(C=0)해도 견고.
  const has5legCapText = matchesKeyword(text, ["커패시터", "capacitor", "콘덴서", "v_c", "양단 전압", "정전용량"]);
  if (
    hasSwitchInferred && counts.R >= 4 && counts.L >= 2 && (counts.C > 0 || has5legCapText) &&
    counts.V > 0 && counts.I > 0
  ) {
    return {
      type: "switched_rlc_5leg",
      confidence: "high",
      reasoning: `RLC 5-leg + SW(inferred: ${counts.SW > 0 ? "inv" : features.hasSwitch ? "feat" : "text"}) + dual-source + multi-R(${counts.R}) + multi-L(${counts.L})`,
    };
  }

  // 0-pre-pre-rc. Thevenin + Switched RC (임용 9번 정보과) — switched_rlc/switched_rc보다 우선.
  //   원본: V_s + R + SW + C×2 + 점선박스(R×3 + I_s). t<0/t≥0 단계 + Thevenin V_Th/R_Th 도출.
  //   트리거: SW(inferred) + RC (C≥1, L=0) + dual-source(V+I) + Thevenin/점선박스/등가 키워드
  //          + AC 키워드 없음 (DC 회로)
  const isThevenSwitchedRcKw = matchesKeyword(text, [
    "테브난 등가", "테브난 등가회로", "테브닌 등가", "thevenin equivalent",
    "v_th", "r_th", "vth", "rth",
    "점선", "점선박스", "점선 박스", "등가회로", "등가 회로",
    "검은 상자", "박스로 표시",
  ]);
  const hasStageKw = matchesKeyword(text, ["[단계", "단계 1", "단계 2", "단계 3", "단계1", "단계2", "단계3"]);
  const isPureRc = counts.C >= 1 && counts.L === 0;
  // AC signal 검사 — local 변수 선언 (isACText/hasJImpedancePattern는 나중에 선언되므로 inline)
  const isACTextLocal = matchesKeyword(text, AC_PHASOR_KEYWORDS);
  const hasJImpedanceLocal = /[+\-]?\bj\s*\d+\s*[Ωohm]/i.test(text) || /∠/.test(text);
  const hasNoAcSignal = !isACTextLocal && !hasACInventory && !hasJImpedanceLocal;
  // 0-pre-pre-rc2. t=0 스위치 개방 RC + 전류원 + DC정상상태 v_c(0⁻) + 방전 v_o(t) (임용 2번).
  //   ★ generic switched_rc는 "τ·V_C(t)" generic 문제(지저분)를 만들어 원본 구조 상실 → 전용 archetype.
  //   thevenin_switched_rc(테브난/점선박스)와 구분: 테브난·점선 키워드 없이 v_c(0⁻)·v_o(t)·정상상태.
  const isDcSsRcKw = matchesKeyword(text, ["정상상태", "정상 상태", "직류 정상", "v_c(0", "v_o(t)", "초깃값", "방전"]);
  if (hasSwitchInferred && isPureRc && counts.I >= 1 && hasNoAcSignal && isDcSsRcKw && !isThevenSwitchedRcKw) {
    return {
      type: "switched_rc_dc_transient",
      params: {},
      confidence: "high",
      reasoning: `SW 개방 + 순수 RC + 전류원(I=${counts.I}) + DC정상상태 v_c(0⁻)·v_o(t) → switched_rc_dc_transient (임용 2번, generic switched_rc 차단)`,
    };
  }

  if (
    hasSwitchInferred && isPureRc && counts.V > 0 && counts.I > 0 && hasNoAcSignal &&
    (isThevenSwitchedRcKw || hasStageKw)
  ) {
    const reasons: string[] = [
      `RC(C=${counts.C}, L=0)`,
      `SW(inferred)`,
      `dual-source(V·I)`,
      `DC(AC키워드/inventory 없음)`,
    ];
    if (isThevenSwitchedRcKw) reasons.push("테브난/등가/점선박스 키워드");
    if (hasStageKw) reasons.push("[단계 N] 키워드");
    return {
      type: "thevenin_switched_rc",
      confidence: "high",
      reasoning: `Thevenin + Switched RC (imyong 9 정보과) — ${reasons.join(", ")}`,
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
  // ★ inventory가 비었을 때의 텍스트 fallback (2026-07-27).
  //   실측: `extractComponentInventory schema_fail`로 인벤토리가 통째로 비면 counts.R/L/C=0이 되어
  //   hasRlcSet이 깨지고 **unsupported**로 떨어져 생성 자체가 실패했다(임용 9번 주파수응답).
  //   소자 개수를 못 읽어도 본문이 "RLC + 공진/주파수응답"이면 이 유형이 맞다.
  const inventoryEmpty = counts.R + counts.L + counts.C + counts.V + counts.I === 0;
  const hasRlcTextual =
    /\brlc\b/i.test(text) ||
    (/인덕터|코일/.test(text) && /커패시터|축전기|콘덴서|정전용량/.test(text));
  const rlcPresent = hasRlcSet || (inventoryEmpty && hasRlcTextual);
  if (
    (topicKey === "rlc_response" && isResonanceText && rlcPresent && isSingleSourceAc && !hasSuperpositionKw) ||
    (rlcPresent && isSingleSourceAc && isResonanceText && !hasSuperpositionKw)
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
  //            (e) V·I 다중 + C 또는 L 존재 + SW 없음 (임용 10번 시그니처)
  //
  //    ⚠️ SW 있으면 (e) 차단 — SW + C는 switched_rc 과도응답(임용 9번 정보과)이지
  //    ac_superposition이 아니다. DC 다중 전원 + C/L도 switched 회로일 수 있어 SW 가드 필요.
  const isSuperpositionText = matchesKeyword(text, SUPERPOSITION_KEYWORDS) || matchesKeyword(text, ["중첩"]);
  const isACText = matchesKeyword(text, AC_PHASOR_KEYWORDS);
  const hasJImpedancePattern = /[+\-]?\bj\s*\d+\s*[Ωohm]/i.test(text) || /∠/.test(text);
  const hasBothSources = counts.V > 0 && counts.I > 0;
  const hasReactive = counts.C > 0 || counts.L > 0;
  // hasSwitchInferred는 위에서 이미 선언됨 (line ~740). SW 가드로 재사용.
  const acSuperpositionMatch =
    isSuperpositionText ||
    isACText ||
    hasJImpedancePattern ||
    Boolean(hasACInventory) ||
    (hasBothSources && hasReactive && !hasSwitchInferred);
  // ★ 임용 9번(RLC 주파수응답 곡선 → 정전용량)에 양보 — 아래 rlc_resonance 분기 소관.
  //   ac_superposition은 isACText만으로도 매치되어 이 유형을 가로챈다(실측).
  if (acSuperpositionMatch && !isRlcCurveCapacitance) {
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

  // ★ AC phasor 안전망 (2026-06-09) — 위 AC 분기(universal_ac·ac_superposition·ac_parallel_branches
  //   ·rlc_resonance)를 Vision 요약문구·inventory 표기 변동으로 모두 놓쳤더라도, 리액티브 회로에
  //   AC 시그니처가 있거나 L·C가 함께 있고(=RLC: DC 정상상태로는 해석 불가) 과도 컨텍스트가 없으면
  //   아래 transient(rc/rl/rlc_step) 분기로 떨어지지 않게 universal_ac로 흡수한다.
  //   ─ 이유: transient type은 waveform figure를 강제(validateProblem)해 phasor 정상상태 문제에서
  //     missing_waveform·missing_figure_variant 오류를 내고, 생성도 RC/RL/RLC 과도로 잘못 만든다.
  //     Vision은 RLC·평균전력 문제에 hasWaveformEvolution=true를 자주 오마킹 → 이 fallthrough가
  //     키워드 변동에 flaky하게 터짐(실측: 같은 임용 5번이 run별로 universal_ac↔rc_step 진동).
  //   ─ 판별: 과도 컨텍스트(스위치·t=0·t<0·과도·초기조건·step/계단 응답·v_c(t)·미분방정식 등)가
  //     있으면 진짜 과도이므로 개입하지 않는다. RLC 전용 archetype/공진은 이미 위에서 return됨.
  const hasTransientContext =
    hasSwitchInferred ||
    matchesKeyword(text, [
      "과도", "transient", "t=0", "t = 0", "t<0", "t < 0", "t≥0", "t ≥ 0",
      "초기 조건", "초기조건", "초기 전압", "초기전압",
      "step response", "스텝 응답", "계단 응답", "스텝응답", "계단응답",
      "v_c(t)", "vc(t)", "i_l(t)", "il(t)", "미분방정식",
      "자연 응답", "자연응답", "강제 응답", "강제응답",
    ]);
  const hasAcSignalAny =
    isACTextLocal || Boolean(hasACInventory) || hasJImpedanceLocal || isAcKw ||
    (counts.L > 0 && counts.C > 0); // RLC: DC 정상상태로 해석 불가 → AC phasor 정상상태
  if (hasReactiveUniversal && hasAcSignalAny && !hasTransientContext) {
    return {
      type: "universal_ac",
      confidence: "high",
      reasoning:
        `AC phasor 안전망 — 리액티브(L=${counts.L},C=${counts.C}) + ` +
        `${counts.L > 0 && counts.C > 0 ? "RLC(정상상태 AC)" : "AC 시그니처"} + 과도 컨텍스트 없음`,
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

  // 2.5 ★ 종속전원 + 테브난/최대전력 (DC) → generic netlist 경로 (임용 9번류).
  //   하드코딩 max_power_transfer(vi_two_source)는 업로드 구조·종속원을 버리므로, 종속원이 있으면
  //   GPT 구조추출 + V_oc/I_sc 테브난 경로로. (counts.dep + 값패턴 hasDependentByValue 둘 다 인정)
  {
    const depPresent = (args.hasDependentByValue ?? false) || counts.dep > 0 || Boolean(features.hasDependentSource);
    const thevMaxKw = matchesKeyword(text, MAX_POWER_KEYWORDS)
      || matchesKeyword(text, EQUIVALENT_KEYWORDS) || Boolean(semantic.hasEquivalentTransformation);
    const isDcResistive = counts.L === 0 && counts.C === 0;
    if (depPresent && thevMaxKw && isDcResistive) {
      return {
        type: "thevenin_dependent_generic",
        confidence: "high",
        reasoning: `종속전원(dep=${counts.dep}, byValue=${args.hasDependentByValue}) + 테브난/최대전력(DC) → generic netlist 경로`,
      };
    }
  }

  // 3. 등가회로 — 텍스트 키워드 + topic 보조.
  // 종속 전원이 함께 있어도 등가회로(Thevenin/Norton/max_power) 우선.
  // params.hasDependentSource는 외부에서 features 기반으로 자동 전달되어 generator가 archetype 선택.
  const isEquivalent = semantic.hasEquivalentTransformation
    || matchesKeyword(text, EQUIVALENT_KEYWORDS);
  if (isEquivalent) {
    if (matchesKeyword(text, MAX_POWER_KEYWORDS)) {
      // ★ params(vSourceCount·iSourceCount) 전달 필수 — runMaxPowerTransferPipeline의 2V+2I 전용
      //   viTheveninMaxPower 브랜치가 이 카운트로 분기(안 넘기면 generic max_power로 변질).
      return {
        type: "max_power_transfer",
        params: { vSourceCount: counts.V, iSourceCount: counts.I },
        confidence: "high",
        reasoning: "최대전력 키워드",
      };
    }
    if (matchesKeyword(text, NORTON_KEYWORDS)) {
      return { type: "norton", confidence: "high", reasoning: "노턴 키워드" };
    }
    // ★ 2전압원 병렬가지 → 테브난 등가 (임용 3번) — generic thevenin(단일전원 분압 하드코딩) 앞.
    //   2 V원 + (I·종속원·L·C 없음 = 순수 DC 저항망) → Millman R_T=R1∥R2·V_T 전용 archetype.
    //   ★ generic thevenin 파이프라인은 archetype="voltage_divider"(단일 전원) 하드코딩이라 2번째 V원 상실.
    if (counts.V >= 2 && counts.I === 0 && counts.C === 0 && counts.L === 0 && counts.dep === 0) {
      return {
        type: "dc_thevenin_2src",
        params: {},
        confidence: "high",
        reasoning: `2전압원(V=${counts.V}) 병렬가지 + 순수 DC 저항망 + 등가 → dc_thevenin_2src (임용 3번, generic thevenin 단일전원 하드코딩 차단)`,
      };
    }
    return { type: "thevenin", confidence: "medium", reasoning: "등가회로 컨텍스트 → thevenin (norton 키워드 없으면 thevenin 기본)" };
  }

  // 4. 종속전원
  if (features.hasDependentSource || counts.dep > 0 || topicKey === "dependent_source") {
    return { type: "dc_dependent_source", confidence: "high", reasoning: "종속전원 존재" };
  }

  // 5. 스위치만 단독 (C/L 없는 dc 스위칭) — 두 DC 정상상태 비교 문제
  if ((counts.SW > 0 || topicKey === "switching_circuit") && counts.C === 0 && counts.L === 0) {
    // ★ 회귀 방지: SW가 있어도 BJT(트랜지스터)가 있으면 순수 DC 스위칭이 아니라 BJT 바이어스 회로다.
    //   (2-BJT 응용회로가 subject=circuit_theory로 분석되면 SW만 보고 switched_dc로 오탈취되던 것 차단.
    //    → bjt_bias 반환, route에서 subject를 electronics로 보정. decideType은 inventory가 없어 text로 판별.)
    const hasBjtText = matchesKeyword(text, [
      "트랜지스터", "bjt", "쌍극성 접합", "쌍극성접합", "npn", "pnp",
      "베이스", "이미터", "컬렉터", "v_be", "v_eb", "v_ce", "v_ec",
    ]);
    if (hasBjtText) {
      return {
        type: "bjt_bias",
        params: {},
        confidence: "high",
        reasoning: "스위치 + BJT(트랜지스터) 텍스트 → 순수 DC 스위칭 아님, BJT 바이어스 회로 (switched_dc 오탈취 차단, route에서 electronics 보정)",
      };
    }
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
