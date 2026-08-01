import type { AnalysisResult } from "@/types";

/**
 * 반전 OPAMP + T형 RC망 → 전달특성 + 출력↔입력 연결 사인파 발진기 (임용 9번 전자) 판별.
 *   분류기 0-PRE와 route 감지기가 **같은 구현을 공유**한다(복사본 두 개가 어긋나는 사고 방지).
 *
 * ── 형제 셋이 모두 "발진 + 특성방정식"을 말한다 ─────────────────────────
 *   `WIEN_BRIDGE_OSCILLATOR`     : β(s)·K·1−Kβ(s)=0 (Barkhausen). 브리지 4-arm.
 *   `opamp_loop_gain_stability`  : 루프이득 L(s)=V_r/V_t — **귀환 루프를 절단**한다.
 *   이 유형                        : (가)의 **전달특성 V_out(s)/V_in(s)** + (나) **출력을 입력에 연결**.
 *
 * ★★ 실측 신고(2026-08-01): 이 원본이 **Wien Bridge**로 생성됐다. Wien 쪽 텍스트 시그니처가
 *   `발진 + RC 회로망 + (β(s)|1−Kβ|**특성방정식**|Barkhausen)`이라 "특성방정식"만으로도 물어간다.
 *   초판은 `전달특성` 또는 `출력단자와 입력단자` 문구를 요구했는데 Vision 요약이 둘 다 흘리면 미발화했다.
 *   → **양성 신호를 넓힌다**. 특히 이 원본은 **전류 I₁(s)·I₂(s)를 구하라**고 하는데
 *     Wien·루프이득 어느 쪽도 I₁/I₂를 묻지 않는다 — 가장 확실한 고유 신호다.
 *     소자에 **2C·½R(R/2)** 이 등장하는 것도 이 유형 고유(T형 회로망의 설계 계수).
 */

export type OpampRcTSignals = {
  fired: boolean;
  gates: {
    opamp: boolean;
    osc: boolean;
    yieldSibling: boolean;
    transfer: boolean;
    tie: boolean;
    i1i2: boolean;
    tCoef: boolean;
  };
};

function textOf(analysis: AnalysisResult): string {
  return [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    (analysis.componentInventory ?? []).map((c) => `${c?.type ?? ""} ${c?.value ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
}

export function evaluateOpampRcTSignals(analysis?: AnalysisResult | null): OpampRcTSignals {
  const empty: OpampRcTSignals["gates"] = {
    opamp: false, osc: false, yieldSibling: false, transfer: false, tie: false, i1i2: false, tCoef: false,
  };
  if (!analysis) return { fired: false, gates: empty };
  const t = textOf(analysis);
  if (!t.trim()) return { fired: false, gates: empty };

  const opamp = /연산\s*증폭기|연산증폭기|op-?amp|오피\s*앰프/.test(t);
  const osc = /발진|oscillat|사인파|정현파/.test(t);

  // ── 형제 고유어면 양보 ────────────────────────────────────────────
  //   ※ "특성방정식"은 이 유형도 쓰므로 **양보 근거로 삼지 않는다**(Wien과 공유).
  const yieldSibling =
    /루프\s*이득|루프이득|loop\s*gain|v_?r\s*\/\s*v_?t|귀환\s*루프를?\s*(끊|절단)/.test(t) ||
    /barkhausen|바크하우젠|1\s*-\s*k\s*β|1−kβ|β\(s\)|베타\(s\)|위상\s*조건/.test(t) ||
    /브리지|bridge/.test(t) ||
    /슈미트|비교기|구형파|삼각파|비정현파/.test(t);   // 함수발생기(임용 29번)

  // ── 양성 신호 ─────────────────────────────────────────────────────
  const transfer =
    /전달\s*특성|전달특성|전달\s*함수|전달함수/.test(t) ||
    /v_?out\s*\(s\)\s*\/\s*v_?in|v_?out\s*\/\s*v_?in|v_?o\s*\/\s*v_?i\b/.test(t);
  // "출력단자와 입력단자를 연결" / "출력과 입력을 연결" / "출력을 입력에 연결" 모두 포괄.
  const tie = /출력\s*단자.{0,12}입력\s*단자|출력.{0,10}입력.{0,8}연결|입력.{0,10}출력.{0,8}연결/.test(t);
  // ★ 이 유형 고유 — 전류 I₁(s)·I₂(s)를 각각 구한다.
  const i1i2 = /i_?1\s*\(\s*s\s*\)|i_?2\s*\(\s*s\s*\)|i₁|i₂|전류\s*i_?1|전류\s*i_?2/.test(t);
  // ★ T형 회로망의 설계 계수 2C·½R(R/2)이 소자 목록/본문에 보이면 이 유형이다.
  const tCoef = /2c\b|½r|r\s*\/\s*2|r\/2|0\.5r/.test(t);

  const fired = opamp && osc && !yieldSibling && (transfer || tie || i1i2 || tCoef);
  return { fired, gates: { opamp, osc, yieldSibling, transfer, tie, i1i2, tCoef } };
}

/** boolean 단축형 (route 감지기용). */
export function detectOpampRcTOscillator(analysis?: AnalysisResult | null): boolean {
  return evaluateOpampRcTSignals(analysis).fired;
}
