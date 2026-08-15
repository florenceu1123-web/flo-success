import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  elemTex,
  generateOscilloscopePhaseL,
  matchesOscPhaseAsk,
  matchesOscPhaseSignature,
  numFmt as n2,
  rTex,
  xTex,
  yieldsOscPhaseToSibling,
} from "@/lib/generation/topologies/oscilloscopePhaseL";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOscilloscopePhaseLPipeline");

/** 1/x 형태를 분수로 — f = 10⁶/(6·s)는 항상 유리수라 소수로 적지 않는다(전역 분수 변환기 회피). */
function freqTex(periodUs: number): string {
  // f = 1e6/periodUs [Hz]. 기약분수로.
  let num = 1e6, den = periodUs;
  const g = gcd(Math.round(num), Math.round(den));
  num = Math.round(num) / g; den = Math.round(den) / g;
  return den === 1 ? `${num}` : `${num}/${den}`;
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
/** 기약분수 표기 (정수 입력 전제 — 값 규칙이 정수를 보장한다). */
function fracTex(num: number, den: number): string {
  const g = gcd(Math.round(num), Math.round(den)) || 1;
  const n = Math.round(num) / g, d = Math.round(den) / g;
  return d === 1 ? `${n}` : `${n}/${d}`;
}

/**
 * 오실로스코프 파형 → V_m·f·위상차 α → **미지 소자값 도출** (임용 11번 회로이론)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  [단계 1] (가)에서 v_s(t)=V_m cos(2πft)일 때 V_m[V]·f[Hz]
 *  [단계 2] (가)에서 위상차 α[°] → v_L(t) 식
 *  [단계 3] [1]·[2]로 (나)의 미지 소자값
 */
export async function runOscilloscopePhaseLPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateOscilloscopePhaseL({ seed, mode });
    const v = gen.values, a = gen.answer;
    const isC = v.capacitive;
    const sym = isC ? "C" : "L";
    const vMeas = isC ? "v_C(t)" : "v_L(t)";
    const unit = isC ? "µF" : "H";
    const leadTxt = isC ? "뒤진다" : "앞선다";
    const signTxt = isC ? "−" : "+";
    const fTex = freqTex(a.periodUs);

    log.info("oscilloscope_phase_generated", {
      mode, Vm: a.Vm, f: fTex, alpha: a.alphaDeg, R: rTex(v),
      eq: a.eq, unknown: a.unknown, unit,
    });

    const content = [
      `그림 (가)는 그림 (나)의 회로를 오실로스코프로 측정한 파형을 나타낸 것이다.`,
      `㉠은 Ch1에서 측정한 v_s(t)이고, ㉡은 Ch2에서 측정한 ${vMeas}이다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`,
      `(단, 저항값은 이상적이고, V/div는 수직 스케일, µs/div는 수평 스케일이며,`,
      `Ch1과 Ch2는 오실로스코프의 각 입력 채널이고 수평 스케일 단위는 동일하다.)`,
    ].join(" ");

    const conditions = [
      `(가) 오실로스코프: Ch1 ${n2(v.ch1VPerDiv)} V/div, Ch2 ${n2(v.ch2VPerDiv)} V/div, ${n2(v.usPerDiv)}µs/div (가로 10 div × 세로 8 div 격자).`,
      `(나) 회로: v_s(t) ─ ${rTex(v)}[Ω] ─ 마디 A. 마디 A와 접지 사이에 미지 소자 ${sym}(양단 전압 ${vMeas}).`,
      `마디 A ─ ${elemTex(v, v.serVal)} ─ 마디 B, 마디 B ─ ${elemTex(v, v.shuntVal)} ─ 접지 가지가 ${sym}과 병렬로 연결된다.`,
    ];

    const question = [
      `[단계 1] 그림 (가)에서 v_s(t) = V_m cos(2πft)[V]라 할 때, V_m[V]과 f[Hz]를 각각 구한다.`,
      `[단계 2] 그림 (가)에서 v_s(t)와 ${vMeas}의 위상차인 α의 값[°]을 구하여 ${vMeas}의 식을 구한다.`,
      `[단계 3] [단계 1]과 [단계 2]를 이용하여 그림 (나)의 ${sym}[${unit}] 값을 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_m = ${n2(a.Vm)}[V],  f = ${fTex}[Hz]`,
      `[단계 2] α = ${n2(a.alphaDeg)}°,  ${vMeas} = ${n2(a.vLamp)}cos(2πft ${signTxt} ${n2(a.alphaDeg)}°)[V]`,
      `[단계 3] ${sym} = ${n2(a.unknown)}[${unit}]`,
    ].join("\n");

    const eqName = isC ? "C_eq" : "L_eq";
    const pairDesc = isC
      ? `두 커패시터의 **직렬** 합성 = (${n2(v.serVal)}×${n2(v.shuntVal)})/(${n2(v.serVal)}+${n2(v.shuntVal)}) = ${n2(a.pairEq)}[µF]`
      : `두 인덕터의 **직렬** 합 = ${n2(v.serVal)} + ${n2(v.shuntVal)} = ${n2(a.pairEq)}[H]`;
    const combineDesc = isC
      ? `${eqName} = C + (직렬 합성) → **C = ${eqName} − ${n2(a.pairEq)} = ${n2(a.eq)} − ${n2(a.pairEq)} = ${n2(a.unknown)}[µF]**`
      : `${eqName} = L ∥ ${n2(a.pairEq)} → **L = ${eqName}·${n2(a.pairEq)}/(${n2(a.pairEq)} − ${eqName}) = ${n2(a.eq)}×${n2(a.pairEq)}/(${n2(a.pairEq)}−${n2(a.eq)}) = ${n2(a.unknown)}[H]**`;

    const solution = [
      `[단계 1] **수직 스케일**로 진폭을, **수평 스케일**로 주기를 읽는다.`,
      `  · ㉠(Ch1)의 진폭은 ${n2(v.ch1AmpDiv)} div이고 Ch1은 ${n2(v.ch1VPerDiv)} V/div이므로 **V_m = ${n2(v.ch1AmpDiv)}×${n2(v.ch1VPerDiv)} = ${n2(a.Vm)}[V]**.`,
      `  · 한 주기가 ${n2(v.periodDiv)} div이고 ${n2(v.usPerDiv)}µs/div이므로 T = ${n2(v.periodDiv)}×${n2(v.usPerDiv)} = ${n2(a.periodUs)}[µs].`,
      `    ∴ **f = 1/T = ${fTex}[Hz]** (ω = 2πf).`,
      `[단계 2] 두 파형의 같은 위상(상승 영교차) 사이의 가로 간격이 ${n2(v.phaseDiv)} div이므로`,
      `  **α = (${n2(v.phaseDiv)}/${n2(v.periodDiv)})×360° = ${n2(a.alphaDeg)}°**.`,
      `  · ㉡(Ch2)의 진폭은 ${n2(v.ch2AmpDiv)} div, Ch2는 ${n2(v.ch2VPerDiv)} V/div이므로 |${isC ? "v_C" : "v_L"}| = ${n2(a.vLamp)}[V].`,
      `  · ㉡은 ㉠보다 ${leadTxt}(${isC ? "용량성" : "유도성"} 회로) → **${vMeas} = ${n2(a.vLamp)}cos(2πft ${signTxt} ${n2(a.alphaDeg)}°)[V]**.`,
      // ★ 비는 **기약분수**로 적는다 — 소수(0.5)로 두면 전역 분수 변환기가 손대고 표기가 흔들린다.
      `  ★ 검산: |${isC ? "v_C" : "v_L"}|/V_m = ${n2(a.vLamp)}/${n2(a.Vm)} = ${fracTex(a.vLamp, a.Vm)} = cos${n2(a.alphaDeg)}° — 진폭비와 위상차가 서로 일치한다.`,
      `[단계 3] 마디 A에서 본 부하 임피던스를 Z라 하면 ${isC ? "v_C" : "v_L"}/v_s = Z/(R + Z) 이다.`,
      isC
        ? `  Z = −jX(용량성)이므로 위상 −α = −arctan(R/X) → **X = R/tan${n2(a.alphaDeg)}° = (${rTex(v)})/√3 = ${xTex(v)}[Ω]**.`
        : `  Z = jX(유도성)이므로 위상 α = 90° − arctan(X/R) → **X = R/tan${n2(a.alphaDeg)}° = (${rTex(v)})/√3 = ${xTex(v)}[Ω]**.`,
      isC
        ? `  X = 1/(ω${eqName}) → ${eqName} = 1/(ωX) = ${n2(a.eq)}[µF].`
        : `  X = ω${eqName} → ${eqName} = X/ω = ${n2(a.eq)}[H].`,
      `  (나)에서 ${pairDesc}, 이것이 ${sym}과 **병렬**이므로`,
      `  ${combineDesc}`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_scope_${idx + 1}`,
        label: "(가) 오실로스코프로 측정한 파형",
        role: "waveform",
        diagramType: "oscilloscope_screen",
        diagram: gen.screen,
      },
      {
        id: `fig_scope_ckt_${idx + 1}`,
        label: "(나) 측정 대상 회로",
        role: "original_circuit",
        diagramType: "oscilloscope_phase_circuit",
        diagram: gen.circuit,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 오실로스코프 위상차 → 미지 소자값 도출 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-04, 사용자 신고): 전용 archetype이 없어 **`universal_ac`** 로 떨어졌고
 *   정답이 **"(query 없음)"** 인 빈 문제 + generic `analog_netlist` figure가 나왔다
 *   (오실로스코프 화면 자체가 사라짐). validator는 issues=0으로 통과 —
 *   generic 경로 실패의 전형(CLAUDE.md `ac_superposition_source_design` 교훈과 동일).
 *
 * 판별선 = **오실로스코프 화면 판독**(V/div·µs/div·Ch1/Ch2) + 위상차/파형 + 소자값·주파수 요구.
 *   형제 양보: 스위치·과도응답(시정수), 디지털 파형, 다이오드/OPAMP/트랜지스터.
 */
export function detectOscilloscopePhaseL(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;
  if (!matchesOscPhaseSignature(text)) return false;
  if (!matchesOscPhaseAsk(text)) return false;
  if (yieldsOscPhaseToSibling(text)) return false;
  return true;
}
