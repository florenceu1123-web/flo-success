import type { GenerationMode, SwitchedCapShortRlCircuitDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * **스위치가 커패시터를 단락** → 1차 RL 계단응답 (임용 7번 회로이론) — 전용 결정론 generator. GPT 없음.
 *
 * ── 고정 토폴로지 (원본 그대로) ─────────────────────────────────
 *   단일 직류 전압원 V_s ─ R ─ [C ∥ SW(t=0 닫힘)] ─ L ─ 전원으로 복귀.
 *   스위치는 **커패시터와 병렬**이라, 닫히는 순간 C를 단락시킨다.
 *
 * ── 물리 (닫힌형) ───────────────────────────────────────────────
 *   [t<0] 스위치 열림 + 직류 정상상태. **C가 직류를 차단**하므로 루프 전류가 0이다
 *         → **i_L(0⁻) = 0**, R·L 양단 강하가 없어 **v_C(0⁻) = V_s**.
 *   [t=0] 스위치가 닫혀 C가 단락 → C는 회로에서 빠지고 **V_s·R·L 직렬**만 남는다.
 *         인덕터 전류는 연속이므로 **i_L(0⁺) = i_L(0⁻) = 0**.
 *   [t>0] KVL: **V_s = R·i_L + L·di_L/dt** (1차) → τ = L/R, I_∞ = V_s/R
 *         **i_L(t) = I_∞(1 − e^(−t/τ))**,  **v_L(t) = L·di_L/dt = V_s·e^(−t/τ)**
 *   원본(12V·4Ω·1F·2H): i_L(0⁻)=0, v_C(0⁻)=12V, τ=1/2[s] → **i_L(t) = 3(1 − e^(−2t))[A]**.
 *
 * ★ 커패시턴스 C는 **답에 전혀 관여하지 않는다** — t<0에서 직류를 차단하는 역할만 하고
 *   t≥0에는 단락된다. 원본이 값을 준 것은 그 사실을 아는지 보려는 것이다(distractor).
 *
 * ── 값 규칙 (예시 hardcode 금지) ───────────────────────────────
 *   I_∞ = V_s/R 와 **감쇠율 1/τ = R/L 이 모두 정수**가 되는 조합만 채택한다.
 *   그래야 답이 `3(1 − e^(−2t))`처럼 떨어지고, route의 전역 분수 변환기(CLAUDE.md 1-4-3)가
 *   손댈 소수가 애초에 생기지 않는다.
 *   **원본 튜플은 물론, 도출량(I_∞·1/τ)이 원본과 같은 조합도 제외**한다 — 소자 값만 달라도
 *   답이 전부 같으면 사실상 원본이다(viTheveninMaxPower에서 실측으로 잡힌 함정).
 */

export type SwitchedCapShortRlGen = {
  values: { Vs: number; R: number; C: number; L: number };
  answer: {
    iL0: 0;              // i_L(0⁻) = i_L(0⁺) = 0 (C가 직류 차단 + 전류 연속)
    vC0: number;         // v_C(0⁻) = V_s
    iInf: number;        // I_∞ = V_s/R
    rate: number;        // 1/τ = R/L  (정수)
    tauTex: string;      // τ = L/R 을 분수/정수 문자열로
    iLTex: string;       // i_L(t) 최종식
    vLTex: string;       // v_L(t) 최종식
  };
  /** 변형(exam_variant)이면 구하는 양이 v_L(t)이다. 회로·미분방정식은 동일. */
  asksVoltage: boolean;
  circuitDiagram: SwitchedCapShortRlCircuitDiagram;
};

const R_VALUES = [1, 2, 3, 4, 5, 6, 8, 10];
const I_INF_VALUES = [1, 2, 3, 4, 5, 6];
const RATES = [1, 2, 3, 4, 5];      // 1/τ = R/L
const C_VALUES = [0.5, 1, 2, 4];    // [F] — 답에 무관(직류 차단 역할)

type Tuple = { Vs: number; R: number; C: number; L: number; iInf: number; rate: number };

/** τ = L/R 을 사람이 읽는 형태로 (rate = 1/τ 가 정수이므로 1 또는 1/rate). */
function tauTex(rate: number): string {
  return rate === 1 ? "1" : `1/${rate}`;
}

/** 규칙 열거 + 필터. 원본 튜플과 **원본과 같은 도출량**을 함께 제외한다. */
function buildPool(): Tuple[] {
  const out: Tuple[] = [];
  for (const R of R_VALUES) {
    for (const iInf of I_INF_VALUES) {
      const Vs = iInf * R;
      if (Vs < 4 || Vs > 40) continue;
      for (const rate of RATES) {
        const L = R / rate;
        // 인덕턴스도 깔끔해야 한다 (0.5 배수, 과하지 않은 크기).
        if (L > 12 || Math.abs(L * 2 - Math.round(L * 2)) > 1e-9) continue;
        // ★ 원본(12V·4Ω·2H → I_∞=3·1/τ=2)과 답이 같은 조합은 통째로 제외.
        if (iInf === 3 && rate === 2) continue;
        for (const C of C_VALUES) {
          out.push({ Vs, R, C, L: Math.round(L * 2) / 2, iInf, rate });
        }
      }
    }
  }
  return out;
}

const POOL = buildPool();

/** 결정론 해시 — 열거 순서를 섞어 앞쪽 값만 반복해서 나오지 않게 한다. */
function shuffled(): Tuple[] {
  return [...POOL].sort((a, b) => {
    const ka = (a.Vs * 73 + a.R * 31 + a.rate * 17 + a.C * 7) % 1009;
    const kb = (b.Vs * 73 + b.R * 31 + b.rate * 17 + b.C * 7) % 1009;
    return ka - kb || a.Vs - b.Vs || a.R - b.R;
  });
}

/** 유사/변형이 서로 다른 값을 쓰도록 풀을 절반씩 나눈다. */
function poolFor(mode: GenerationMode): Tuple[] {
  const all = shuffled();
  const half = Math.floor(all.length / 2);
  return mode === "exam_variant" ? all.slice(half) : all.slice(0, half);
}

/** `3(1 − e^{-2t})` 형태 — 계수가 1이면 괄호만, rate가 1이면 지수에 계수 생략. */
function stepTex(amp: number, rate: number): string {
  const e = rate === 1 ? "e^{-t}" : `e^{-${rate}t}`;
  return `${amp}\\left(1 - ${e}\\right)`;
}

/** `12e^{-2t}` 형태. */
function decayTex(amp: number, rate: number): string {
  const e = rate === 1 ? "e^{-t}" : `e^{-${rate}t}`;
  return `${amp}${e}`;
}

export function generateSwitchedCapShortRl(args: {
  seed?: number;
  mode: GenerationMode;
  index?: number;
}): SwitchedCapShortRlGen {
  const pool = poolFor(args.mode);
  const rand = makeRand(args.seed);
  const base = pool.indexOf(pick(pool, rand));
  const t = pool[(base + (args.index ?? 0)) % pool.length];
  const asksVoltage = args.mode === "exam_variant";

  return {
    values: { Vs: t.Vs, R: t.R, C: t.C, L: t.L },
    answer: {
      iL0: 0,
      vC0: t.Vs,
      iInf: t.iInf,
      rate: t.rate,
      tauTex: tauTex(t.rate),
      iLTex: stepTex(t.iInf, t.rate),
      vLTex: decayTex(t.Vs, t.rate),
    },
    asksVoltage,
    circuitDiagram: {
      vLabel: `${t.Vs}[V]`,
      rLabel: `${t.R}[Ω]`,
      cLabel: `${t.C}[F]`,
      lLabel: `${t.L}[H]`,
      currentLabel: "i_L(t)",
      // 변형은 인덕터 양단 전압을 묻는다 — 그림에 극성 표시를 함께 그린다.
      voltageLabel: asksVoltage ? "v_L(t)" : undefined,
    },
  };
}

// ── 라우팅 매처 (분류기·감지기가 **공유**한다 — 복제 금지) ────────
export type CapShortSignals = { v: number; i: number; c: number; l: number; dep: number };

/**
 * 시그니처 — **단일 직류 전압원 + R + C + L + 스위치가 "닫힘"**.
 *
 * ★ 형제와 갈리는 지점을 구조로 적는다:
 *   · `switched_rlc_step`(v1)·`switched_rlc_5leg` = **전류원이 있다**(V+I 2전원) → 전류원이 보이면 양보.
 *   · `switched_rlc_dual_switch`(2022 B-5) = **전압원 2개 + 스위치 2개** → V≥2면 양보.
 *   · `switched_rlc_source_free`(임용 5번) = 같은 소자 구성이지만 스위치가 **열린다**(전원 분리).
 *     ⇒ **닫힘/열림이 이 둘을 가르는 유일한 신호**다. 열림·개방이 보이면 양보한다.
 *   · `switched_rl_source_switch` = C가 없다.  `switched_rc_dc_transient` = L이 없다.
 */
export function matchesCapShortSignature(text: string, s?: CapShortSignals): boolean {
  if (!s) return false;
  if (s.dep > 0) return false;            // 종속전원 유형은 별도 archetype
  if (s.i > 0) return false;              // 전류원이 있으면 형제(step·5leg)
  if (s.v !== 1) return false;            // 전압원은 정확히 하나
  if (s.c < 1 || s.l < 1) return false;   // C·L 둘 다 있어야 이 형식
  const dc = !/교류|정현파|페이저|phasor|∠|주파수\s*영역/.test(text);
  // ★ 어미를 넓게 — 실측 요약은 "닫힐 때"였는데 `닫히|닫은|닫힌`만 보다가 통째로 놓쳤다(스모크가 잡음).
  //   "단락"은 여기에 넣지 않는다 — 풀이 서술의 "정상상태에서 인덕터는 **단락**"에 오탐한다.
  const closes = /닫(히|힐|힌|혀|은|을|는|기|으)|폐로|switch[^.\n]{0,20}clos|clos[^.\n]{0,20}switch/.test(text);
  // ★ 개방은 **스위치와 결합된 것만** 인정 — "t<0에서 커패시터는 개방"처럼 소자 상태를 말하는
  //   서술에 걸리면 이 유형이 형제(source_free)로 잘못 양보한다.
  const opens = /스위치[^.\n]{0,24}(개방|열리|열린|열릴|개로)|(개방|열린|열리)[^.\n]{0,12}스위치|switch[^.\n]{0,20}open/.test(text);
  return dc && closes && !opens;
}

/**
 * 요구 — **인덕터 전류(또는 인덕터 양단 전압)의 과도응답**을 t=0 스위칭 뒤에 구한다.
 * ★ 낱말을 좁게 잡지 않는다 — 판별력은 위 구조 시그니처가 이미 갖고 있다.
 */
export function matchesCapShortAsk(text: string): boolean {
  const transient = /과도|transient|t\s*=\s*0|초기값|정상\s*상태|미분\s*방정식|시정수/.test(text);
  const inductorQuantity =
    /인덕터[^.\n]{0,20}(전류|전압)|i_?l\s*\(?\s*t|v_?l\s*\(?\s*t|코일[^.\n]{0,20}(전류|전압)/.test(text);
  return transient && inductorQuantity;
}

/** 형제 양보 — 상태방정식·테브난/최대전력·공진·역률·단자 A↔B(SPDT)·라플라스 행렬식. */
export function yieldsCapShortToSibling(text: string): boolean {
  return (
    /상태\s*방정식|state\s*equation|행렬\s*a|행렬\s*b/.test(text) ||
    /테브난|thevenin|노턴|norton|최대\s*전력|등가\s*임피던스/.test(text) ||
    /공진|resonan|대역폭|역률|power\s*factor|어드미턴스/.test(text) ||
    (/단자\s*a/.test(text) && /단자\s*b/.test(text)) ||
    /라플라스|laplace/.test(text)
  );
}
