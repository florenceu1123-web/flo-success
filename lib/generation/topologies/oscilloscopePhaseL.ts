import type {
  GenerationMode,
  OscilloscopePhaseCircuitDiagram,
  OscilloscopeScreenDiagram,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 오실로스코프 파형 → V_m·f·위상차 α → **미지 인덕턴스 L 도출** (임용 11번 회로이론)
 * — 전용 결정론 archetype. GPT 없음.
 *
 * ── 고정 토폴로지 (원본 그대로) ──────────────────────────────────
 *   `v_s(t) ─ R ─ 마디 A`,  마디 A에 **미지 소자(세로, v_L 측정)**,
 *   그리고 `마디 A ─ 직렬소자 ─ 마디 B ─ 세로소자 ─ 접지` 가지가 병렬.
 *   ⇒ 부하 = 미지 ∥ (직렬 + 세로).  원본: L ∥ (1H + 1H).
 *
 * ── 스코프 (가) ──────────────────────────────────────────────────
 *   10 div × 8 div 격자. ㉠(실선)=Ch1의 v_s, ㉡(점쇄선)=Ch2의 v_L.
 *   V_m = (㉠ 진폭 div)×(Ch1 V/div),  T = (주기 div)×(µs/div) → f = 1/T,
 *   α = (α div / 주기 div)×360°.
 *
 * ── 물리 (닫힌형) ────────────────────────────────────────────────
 *   v_L/v_s = Z_load/(R + Z_load).  유도성 Z_load = jX 이면
 *     **∠ = 90° − arctan(X/R) = α**  → X = R·tan(90°−α) = R/tanα
 *     **|v_L|/|v_s| = cos α**  ← 두 채널 진폭이 이 관계를 만족해야 한다(자체 검산).
 *   X = ωL_eq → L_eq = X/ω,  그리고 L_eq = L ∥ S (S = 직렬+세로 합)
 *     → **L = L_eq·S/(S − L_eq)**.
 *   원본(V_m=8V·f=1000/3Hz·α=60°·R=2000π/√3·S=2H) → X=R/√3=2000π/3,
 *     ω=2000π/3 → L_eq=1H → **L = 1·2/(2−1) = 2[H]**.
 *
 * ── ★★ α는 60°로 사실상 강제된다 (설계 근거) ────────────────────
 *   학생이 **격자에서 읽을 수 있어야** 하므로 두 조건을 동시에 만족해야 한다:
 *     (1) α = (α div / T div)×360° 가 격자 눈금으로 떨어질 것
 *     (2) **cos α = 두 채널 진폭비** 도 격자 눈금으로 떨어질 것
 *   α=45°는 cos45=√2/2, α=30°는 √3/2 라 (2)가 깨진다. **α=60°(cos=1/2)** 만 둘 다 만족하고,
 *   그때 T=6 div·α=1 div 로 원본 화면이 그대로 재현된다. ⇒ α는 고정하고 **V_m·f·R·소자값**을 변형한다.
 *
 * ── 모드 ─────────────────────────────────────────────────────────
 *   exam_similar : 원본(인덕터 3개) — v_L이 v_s보다 **60° 앞섬**, L 도출
 *   exam_variant : **소자 종류 교환**(커패시터 3개) — v_C가 **60° 뒤짐**, C 도출.
 *                  구조·해석 절차·진폭비(cos60°=1/2)는 완전히 동일하고 위상 부호만 거울.
 */

export const numFmt = (x: number): string =>
  Number.isInteger(x) ? String(x) : String(Number(x.toFixed(4)));

/** 격자: 가로 10 div × 세로 8 div, 실선의 골(trough)이 중앙에서 0.5 div 오른쪽 — 원본 화면 재현. */
export const SCOPE_W_DIV = 10;
export const SCOPE_H_DIV = 8;
export const TROUGH_OFFSET_DIV = 0.5;

export type OscPhaseValues = {
  capacitive: boolean;   // false=유사(인덕터) / true=변형(커패시터)
  // ── 스코프 ──
  periodDiv: number;     // 주기 [div] (6 고정 — α=60° 조건)
  phaseDiv: number;      // α [div] (1 고정)
  usPerDiv: number;      // 수평 스케일 [µs/div]
  ch1VPerDiv: number;    // ㉠ 수직 스케일 [V/div]
  ch2VPerDiv: number;    // ㉡ 수직 스케일 [V/div]
  ch1AmpDiv: number;     // ㉠ 진폭 [div]
  ch2AmpDiv: number;     // ㉡ 진폭 [div]
  // ── 회로 ──
  rCoef: number;         // 유도성 R = rCoef·π/√3 [Ω] / 용량성 R = rCoef·√3/π [Ω]
  serVal: number;        // 직렬 가지 소자 (H 또는 µF)
  shuntVal: number;      // 그 가지의 세로 소자 (H 또는 µF)
  unknown: number;       // 미지 소자 값 (H 또는 µF) — 정답
};

export type OscPhaseAnswer = {
  Vm: number;            // [V]
  f: number;             // [Hz]
  periodUs: number;      // [µs]
  alphaDeg: number;      // 60
  vLamp: number;         // [V]
  omega: number;         // [rad/s]
  R: number;             // [Ω] 수치
  X: number;             // [Ω] 리액턴스 크기
  eq: number;            // L_eq [H] 또는 C_eq [µF]
  pairEq: number;        // 직렬 가지의 합성값 (L: 직렬합 / C: 직렬합성)
  unknown: number;       // 정답 소자값
  ratio: number;         // |v_L|/|v_s| (= cos α)
};

/** ㉡이 ㉠보다 앞서는가 (유도성이면 앞섬). */
export const leadsFor = (capacitive: boolean): boolean => !capacitive;

/**
 * 스코프 판독 + 회로 물리를 한 번에 푼다 (범용 — 값 가정 없음).
 * ★ 스코프에서 읽은 값만으로 V_m·f·α·|v_L|을 구하고, 거기서 X·L_eq·미지값을 도출한다.
 */
export function solveOscPhase(v: OscPhaseValues): OscPhaseAnswer {
  const Vm = v.ch1AmpDiv * v.ch1VPerDiv;
  const vLamp = v.ch2AmpDiv * v.ch2VPerDiv;
  const periodUs = v.periodDiv * v.usPerDiv;
  const f = 1e6 / periodUs;                       // [Hz]
  const omega = 2 * Math.PI * f;
  const alphaDeg = (v.phaseDiv / v.periodDiv) * 360;
  const alphaRad = (alphaDeg * Math.PI) / 180;

  const R = v.capacitive
    ? (v.rCoef * Math.sqrt(3)) / Math.PI
    : (v.rCoef * Math.PI) / Math.sqrt(3);
  // |v_L|/|v_s| = cos α 이고, 리액턴스는 X = R/tanα (유도성) · X = R·tanα... 는 아래에서 통일:
  //   유도성: ∠ = 90° − arctan(X/R) = α  → X = R/tanα
  //   용량성: ∠ = −arctan(R/X) = −α      → X = R/tanα   (동일 형태)
  const X = R / Math.tan(alphaRad);

  // 직렬 가지의 합성 (L은 직렬합, C는 직렬합성)
  const pairEq = v.capacitive
    ? (v.serVal * v.shuntVal) / (v.serVal + v.shuntVal)
    : v.serVal + v.shuntVal;
  // 부하 등가값
  const eq = v.capacitive
    ? 1 / (omega * X) * 1e6          // C_eq [µF]
    : X / omega;                     // L_eq [H]
  // 미지 소자: 유도성은 병렬(L∥S), 용량성은 병렬(합)
  const unknown = v.capacitive
    ? eq - pairEq                                  // C = C_eq − C_ser
    : (eq * pairEq) / (pairEq - eq);               // L = L_eq·S/(S − L_eq)

  // ★ 부동소수 잡음 제거 — 2.0000000000000018 같은 값이 도표·로그로 새어 나간다.
  const clean = (x: number) => Math.round(x * 1e9) / 1e9;
  return {
    Vm, f, periodUs, alphaDeg, vLamp, omega, R, X,
    eq: clean(eq), pairEq: clean(pairEq), unknown: clean(unknown),
    ratio: vLamp / Vm,
  };
}

/** R 표기 — 원본 스타일(π·√3 기호 유지). */
export function rTex(v: OscPhaseValues): string {
  return v.capacitive
    ? `${numFmt(v.rCoef)}√3/π`
    : `${numFmt(v.rCoef)}π/√3`;
}
/**
 * 리액턴스 X = R/tan60° = R/√3 의 **기호 표기**.
 * ★ 소수로 적으면 지저분하고(1047.198) 전역 분수 변환기의 먹잇감이 된다 → 기호로만 적는다.
 *   유도성: R = kπ/√3 → X = kπ/3   ·   용량성: R = k√3/π → X = k/π
 */
export function xTex(v: OscPhaseValues): string {
  return v.capacitive ? `${numFmt(v.rCoef)}/π` : `${numFmt(v.rCoef)}π/3`;
}
/** 소자 표기. */
export function elemTex(v: OscPhaseValues, value: number | null): string {
  const unit = v.capacitive ? "µF" : "H";
  return value === null ? (v.capacitive ? "C" : "L") : `${numFmt(value)}${unit}`;
}

// ── 값 공간 (규칙 열거 + 필터) ─────────────────────────────────────
// ★ α=60° 고정(위 설계 근거) → periodDiv=6, phaseDiv=1.
const US_PER_DIV = [50, 100, 200, 250, 500];
// ★ V/div는 **정수만** — 0.5를 허용했더니 route의 전역 분수 변환기(CLAUDE.md 1-4-3)가
//   풀이의 "0.50 V/div"를 **"1/2 V/div"** 로 뭉갰다(실측 E2E). 원본도 1.00·2.00 V/div다.
const V_PER_DIV = [1, 2, 5];
const AMP_DIV = [2, 3, 4];
// ★★ 소자값·화면 div·정답이 **전부 정수**가 되도록 후보와 필터를 잡는다.
//   소수가 하나라도 남으면 전역 분수 변환기가 "0.5H → 1/2H"처럼 제각각 바꿔
//   문항과 그림의 표기가 어긋난다(실측 E2E).
const L_PAIR: Array<[number, number]> = [[1, 1], [2, 2], [1, 3], [2, 4], [3, 3], [4, 4], [2, 8], [3, 9]];
const L_EQ = [1, 2, 3, 4, 6];
const C_PAIR: Array<[number, number]> = [[2, 2], [4, 4], [3, 6], [6, 6], [8, 8], [4, 12]];
const C_EQ = [2, 3, 4, 5, 6];

const nearInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;

function buildSpace(capacitive: boolean): OscPhaseValues[] {
  const out: OscPhaseValues[] = [];
  const periodDiv = 6, phaseDiv = 1;   // → α = 60°
  for (const usPerDiv of US_PER_DIV)
    for (const ch1VPerDiv of V_PER_DIV)
      for (const ch2VPerDiv of V_PER_DIV)
        for (const ch1AmpDiv of AMP_DIV) {
          // |v_L|/|v_s| = cos60° = 1/2  → ㉡ 진폭 div가 격자에서 읽히는 값이어야 한다.
          const ch2AmpDiv = (ch1AmpDiv * ch1VPerDiv * 0.5) / ch2VPerDiv;
          if (!nearInt(ch2AmpDiv) || ch2AmpDiv < 1 || ch2AmpDiv > 4) continue;
          const f = 1e6 / (periodDiv * usPerDiv);
          const omega = 2 * Math.PI * f;
          for (const [serVal, shuntVal] of capacitive ? C_PAIR : L_PAIR)
            for (const eqTarget of capacitive ? C_EQ : L_EQ) {
              // R을 역산해 기호 계수가 정수가 되는 조합만 채택
              const X = capacitive ? 1 / (omega * eqTarget * 1e-6) : omega * eqTarget;
              const R = X * Math.tan(Math.PI / 3);       // R = X·tan60° = X√3
              const rCoef = capacitive ? (R * Math.PI) / Math.sqrt(3) : (R * Math.sqrt(3)) / Math.PI;
              if (!nearInt(rCoef) || rCoef < 100 || rCoef > 50000) continue;
              const v: OscPhaseValues = {
                capacitive, periodDiv, phaseDiv, usPerDiv, ch1VPerDiv, ch2VPerDiv,
                ch1AmpDiv, ch2AmpDiv, rCoef: Math.round(rCoef), serVal, shuntVal, unknown: 0,
              };
              const a = solveOscPhase(v);
              // 정답(미지 소자값)도 정수여야 한다 — 위 주석 참조.
              if (!(a.unknown > 0) || !nearInt(a.unknown) || a.unknown > 24) continue;
              if (!nearInt(a.pairEq) || !nearInt(a.eq)) continue;
              // ★ 원본 튜플 제외 (500µs/div·2V/div·1V/div·4div·2000π/√3·1H+1H → L=2H)
              if (!capacitive && usPerDiv === 500 && ch1VPerDiv === 2 && ch2VPerDiv === 1 &&
                  ch1AmpDiv === 4 && v.rCoef === 2000 && serVal === 1 && shuntVal === 1) continue;
              out.push({ ...v, unknown: a.unknown });
            }
        }
  return out;
}
const SPACE_L = buildSpace(false);
const SPACE_C = buildSpace(true);

export function generateOscilloscopePhaseL(args: {
  seed?: number;
  mode: GenerationMode;
}): { values: OscPhaseValues; answer: OscPhaseAnswer; screen: OscilloscopeScreenDiagram; circuit: OscilloscopePhaseCircuitDiagram } {
  const capacitive = args.mode === "exam_variant";
  const space = capacitive ? SPACE_C : SPACE_L;
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const v = pick(space, rand);
  return build(v);
}

export function build(v: OscPhaseValues): {
  values: OscPhaseValues; answer: OscPhaseAnswer;
  screen: OscilloscopeScreenDiagram; circuit: OscilloscopePhaseCircuitDiagram;
} {
  const a = solveOscPhase(v);
  const vdiv = (x: number) => `${x.toFixed(2)} V/div`;
  const screen: OscilloscopeScreenDiagram = {
    widthDiv: SCOPE_W_DIV,
    heightDiv: SCOPE_H_DIV,
    periodDiv: v.periodDiv,
    phaseDiv: v.phaseDiv,
    troughOffsetDiv: TROUGH_OFFSET_DIV,
    ch1AmpDiv: v.ch1AmpDiv,
    ch2AmpDiv: v.ch2AmpDiv,
    ch2Leads: leadsFor(v.capacitive),
    ch1Label: `Ch1  ${vdiv(v.ch1VPerDiv)}`,
    ch2Label: `Ch2  ${vdiv(v.ch2VPerDiv)}`,
    timeLabel: `${numFmt(v.usPerDiv)}µs/div`,
    markerCh1: "㉠",
    markerCh2: "㉡",
    alphaLabel: "α",
  };
  const circuit: OscilloscopePhaseCircuitDiagram = {
    vsLabel: "v_s(t)",
    rLabel: `${rTex(v)} Ω`,
    kind: v.capacitive ? "C" : "L",
    unknownLabel: v.capacitive ? "C" : "L",
    measureLabel: v.capacitive ? "v_C" : "v_L",
    serLabel: elemTex(v, v.serVal),
    shuntLabel: elemTex(v, v.shuntVal),
  };
  return { values: v, answer: a, screen, circuit };
}

/** 원본(생성 풀 제외 튜플) — 물리 검증 전용. */
export function __originalOscPhaseForVerify() {
  return build({
    capacitive: false, periodDiv: 6, phaseDiv: 1, usPerDiv: 500,
    ch1VPerDiv: 2, ch2VPerDiv: 1, ch1AmpDiv: 4, ch2AmpDiv: 4,
    rCoef: 2000, serVal: 1, shuntVal: 1, unknown: 2,
  });
}
/** 스모크 전용 — 값 공간 노출. */
export function __oscPhaseSpace(capacitive: boolean): OscPhaseValues[] {
  return (capacitive ? SPACE_C : SPACE_L).slice();
}

/**
 * ★ 오실로스코프 위상차 → L 도출 시그니처 매처 — **분류기와 감지기가 공유**한다.
 *   입력은 소문자화된 분석 텍스트.
 */
export function matchesOscPhaseSignature(text: string): boolean {
  const scope = /오실로스코프|oscilloscope|v\s*\/\s*div|v\/div|㎶s?\/div|µs\s*\/\s*div|us\/div|ms\/div|ch1|ch2|채널/.test(text);
  const phase = /위상\s*차|위상차|phase\s*difference|α|알파/.test(text);
  const measured = /파형|waveform|측정|측정한/.test(text);
  return scope && (phase || measured);
}
/** 요구: 미지 인덕턴스/커패시턴스·진폭·주파수를 구한다 + 교류 문맥. 분류기·감지기 공용. */
export function matchesOscPhaseAsk(text: string): boolean {
  const acCtx = /교류|ac\b|정현파|사인파|sinusoid|페이저|phasor|v_?s\(t\)|주파수|frequency/.test(text);
  const ask =
    /인덕턴스|inductance|커패시턴스|capacitance|정전\s*용량|리액턴스|reactance/.test(text) ||
    /진폭|amplitude|최댓값|v_?m\b|주파수|frequency/.test(text) ||
    /l\s*\[\s*h\s*\]|l의?\s*값|c의?\s*값/.test(text);
  return acCtx && ask;
}
/**
 * 형제 양보 — 스위치 과도응답·디지털 파형·정류/증폭 회로.
 *
 * ★★ **bare "과도응답"은 양보 근거로 쓰지 않는다** (실측 2026-08-04):
 *   Vision이 이 원본(페이저 **정상상태**)을 *"RL 회로의 **과도응답** 분석"* 으로 요약한 회차가 있어,
 *   그 낱말에 양보를 걸었더니 진짜 원본이 통째로 빠져나갔다(스모크가 즉시 잡음).
 *   ⇒ 진짜 과도응답은 **스위치·t=0·시정수** 같은 **구조 신호**를 동반한다 — 그것만 인정한다.
 *   (CLAUDE.md 규칙 2 · "Mealy 태그" 사고와 같은 교훈.)
 */
export function yieldsOscPhaseToSibling(text: string): boolean {
  return (
    /스위치|switch|t\s*=\s*0|시정수|시상수|계단\s*입력|step\s*input/.test(text) ||
    /플립플롭|카운터|논리\s*회로|디지털|진리표|클럭/.test(text) ||
    /클램퍼|정류|다이오드|연산\s*증폭기|op-?amp|트랜지스터/.test(text)
  );
}
