import type { AnalysisResult } from "@/types";

/**
 * T-FF **3개** 자율 동기식 카운터 (임용 11번) 판별 — 분류기 0-PRE와 route 감지기가 **공유**한다.
 *
 * ★ 두 곳에 같은 정규식을 복사해 두면 한쪽만 고쳐져 어긋난다(이 프로젝트에서 반복된 사고).
 *   그래서 게이트 평가를 여기 한 곳에 두고 양쪽이 import한다.
 *
 * ── 임용 7번(`tff_state_table_blank`)과의 구조 차이 ──────────────────────────
 *   임용 7번  : T-FF **2개**(T_A·T_B) + **외부 입력 C** + 상태도 없음 + K-map 2개 도출
 *   임용 11번 : T-FF **3개**(T_C·T_B·T_A) + **외부 입력 없음(자율)** + 상태도 given + T_B 최소 SOP
 *
 * ★★ 판별선은 **외부 입력의 유무**다 (2026-08-01 실측 재신고 후 재설계).
 *   처음엔 "FF 3개 신호 **AND** 상태도 신호"를 둘 다 요구했는데, Vision 요약은 회차마다
 *   둘 중 하나를 흘린다(요약이 "상태표"만 말하거나 FF 개수를 안 쓴다) → 발화하지 않고
 *   임용 7번 경로로 새는 **조용한 오매치**가 재현됐다.
 *   → 외부 입력이 **없다**는 것을 필수 조건으로 올리고(임용 7번은 입력 C가 정의적 특징),
 *     "FF 3개"·"상태도"는 **둘 중 하나만** 있어도 인정한다.
 *   ※ 임용 7번은 FF가 2개·상태도가 없으므로 두 신호 어느 쪽도 만들지 못한다 — 뺏기지 않는다.
 */

export type Tff3Signals = {
  /** 최종 판정 */
  fired: boolean;
  /** 게이트별 결과 — 미발화 시 원인 진단용(로그로 남긴다) */
  gates: {
    tff: boolean;
    jk: boolean;
    mux: boolean;
    modN: boolean;
    externalInput: boolean;
    threeFf: boolean;
    stateDiagram: boolean;
    autonomous: boolean;
    derive: boolean;
    tffInventoryCount: number;
  };
};

/** 판정에 쓰는 텍스트 — topic·interpretation·relatedConcepts·fillInTheBlanks 합본(소문자). */
function textOf(analysis: AnalysisResult): string {
  return [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
}

export function evaluateTff3Signals(analysis?: AnalysisResult | null): Tff3Signals {
  const empty: Tff3Signals["gates"] = {
    tff: false, jk: false, mux: false, modN: false, externalInput: false,
    threeFf: false, stateDiagram: false, autonomous: false, derive: false, tffInventoryCount: 0,
  };
  if (!analysis) return { fired: false, gates: empty };
  const t = textOf(analysis);
  if (!t.trim()) return { fired: false, gates: empty };

  const tffInventoryCount = (analysis.componentInventory ?? []).filter((c) =>
    ["TFF", "T-FF", "T_FF"].includes(String(c?.type ?? "").toUpperCase()),
  ).length;

  // ── 형제 archetype 양보 신호 ──────────────────────────────────────
  const jk = /j-?k\s*플립|jk\s*플립|j-?k\s*flip|jk-ff/.test(t);
  const mux = /mux|멀티플렉서|다중화기/.test(t);
  const modN = /mod[\s-]?\d|모듈러|미사용\s*상태|사용되지\s*않는\s*상태|리셋|reset|\bclr\b|클리어/.test(t);

  // ── ★ 판별선: 외부 입력이 있는가 (임용 7번·시퀀스 검출기의 정의적 특징) ──
  //   "입력 c"·"입력 x"·"입력 신호 c" 같은 **단일 비트 외부 입력** 표기와 "외부 입력" 낱말.
  //   ※ "플립플롭 입력 T_A"·"입력식"은 외부 입력이 아니다 — T/J/K/D 뒤따르는 형태는 제외한다.
  const externalInput =
    /외부\s*입력|시퀀스\s*검출/.test(t) ||
    /입력\s*(신호\s*)?[a-z](?![_a-z0-9])/.test(t.replace(/입력\s*(식|을|은|는|이|의|에|으로)/g, " ")) &&
      !/입력\s*(신호\s*)?[tjkd](?![_a-z0-9])/.test(t);

  // ── FF가 3개(=3비트 상태)라는 신호 ────────────────────────────────
  const threeFf =
    tffInventoryCount >= 3 ||
    /플립플롭\s*3\s*개|3\s*개의?\s*(t\s*)?플립플롭|세\s*개의?\s*(t\s*)?플립플롭|ff\s*3\s*개|플립플롭\s*세\s*개/.test(t) ||
    /3\s*비트|3-?bit|3\s*단/.test(t) ||
    /t_?c\b|q_?c\b|t\s*_\s*c\b/.test(t) ||          // T_C·Q_C 표기 = 세 번째 FF
    /c\s*b\s*a\s*순|cba\s*순|c·b·a|c,\s*b,\s*a/.test(t);   // 상태를 CBA 3비트로 표기

  // ── 상태도 given 신호 ─────────────────────────────────────────────
  const stateDiagram = /상태도|상태\s*전이도|상태천이도|상태\s*다이어그램|순환하지\s*않는\s*상태|비순환\s*상태|사이클/.test(t);

  // ── 자율(외부 입력 없음) 명시 신호 — 있으면 가산점 ─────────────────
  const autonomous = /자율|외부\s*입력(이)?\s*(없|무)|클럭만/.test(t);

  // ── 도출 요구 ─────────────────────────────────────────────────────
  const derive =
    /nand|낸드|nor|노어/.test(t) ||
    /최소\s*sop|곱의\s*합|간략화|간소화|최소화|불\s*함수|부울\s*함수|논리식/.test(t) ||
    /[㉠-㉻]/.test(t) ||
    /t_?b\b/.test(t);

  const tff = /t\s*플립플롭|t-?ff|t\s*플립|티\s*플립플롭/.test(t);

  const fired =
    tff && derive &&
    !jk && !mux && !modN &&
    (!externalInput || autonomous) &&      // 자율이라고 명시되면 오탐지된 외부입력 신호는 무시
    (threeFf || stateDiagram);

  return {
    fired,
    gates: { tff, jk, mux, modN, externalInput, threeFf, stateDiagram, autonomous, derive, tffInventoryCount },
  };
}

/** boolean 단축형 (route 감지기용). */
export function detectTff3AutonomousCounter(analysis?: AnalysisResult | null): boolean {
  return evaluateTff3Signals(analysis).fired;
}
