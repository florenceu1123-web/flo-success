import { makeRand, pick } from "./_helpers";
import type { AnalysisResult } from "@/types";

/**
 * 주기 신호의 **직류값 V_dc**와 **실효값 V_rms** (임용 36번 회로이론) — 전용 결정론 archetype.
 *
 * 원본: `v(t) = 2cos²(1000πt + π/2) [V]` 의 V_dc와 V_rms를 고르는 **객관식**.
 *   → 사용자 지정에 따라 3단계 단계별 주관식으로 낸다([[lib/format/threeStep]]).
 *
 * ★★ 이 유형은 **회로가 없다** — 수식 하나만 주어진다. 그래서 generic 경로가 전부 오작동했다(실측):
 *   · `topology_driven`·`universal_dc`는 없는 회로(R₁·R₂·V₁ netlist)를 지어내 원본과 무관한 문항을 만들고,
 *   · 인벤토리가 비어 있으면 `unsupported` → **개념 명칭형**(원리·법칙 이름 쓰기)으로 새어
 *     "㉠, ㉡에 해당하는 원리의 이름을 쓰시오" 같은 전혀 다른 문제가 생성됐다(사용자 신고 2026-08-12).
 *   회로 솔버로 흡수할 수 없는 **수식 도메인**이라 전용 archetype이 정당하다
 *   ([[feedback_universal_path]]의 예외 — `logic_condition_sop`(그림 없는 디지털)와 같은 선례).
 *
 * ★ 물리(닫힌형, GPT 없음)
 *   · 유사 = 원본 형태 `v(t) = A·cos²(ωt+φ)` (또는 sin²):
 *       항등식 cos²θ = (1+cos2θ)/2 → v(t) = m + m·cos(2ωt+2φ),  m = A/2
 *       **V_dc = m**,  mean(v²) = m² + ½m² = (3/2)m² → **V_rms = m·√(3/2)**
 *       원본 A=2 → V_dc = 1[V], V_rms = √(3/2)[V] (원본 정답 ①과 일치)
 *   · 변형 = **신호 형태 교환** `v(t) = B + A·cos(ωt+φ)` (직류 오프셋 + 정현파):
 *       **V_dc = B**, **V_rms = √(B² + A²/2)**  — 같은 원리(평균·제곱평균), 다른 파형.
 *   ★ 교육 포인트: 답은 **주파수 ω와 위상 φ에 무관**하다(원본이 φ=π/2를 준 이유).
 */

export type PeriodicSignalMode = "exam_similar" | "exam_variant";

/** 삼각함수 종류 — 원본 표기를 보존한다(sin²/cos² 둘 다 결과는 같지만 항등식 부호가 다르다). */
export type TrigFn = "cos" | "sin";

export type PeriodicSignalValues = {
  /** 유사: v(t)=A·fn²(ωt+φ) 의 A / 변형: 정현파 진폭 A */
  A: number;
  /** 변형에서만 쓰는 직류 오프셋 B */
  B: number;
  /** 각주파수 계수 — ω = (wCoef)·π [rad/s] */
  wCoef: number;
  /** 위상 φ = π/phaseDen (0이면 위상 없음) */
  phaseDen: number;
  fn: TrigFn;
  /**
   * 신호 형태.
   *  · `"sq"`     — `A·fn²(ωt+φ)` (원본 형태). 유사는 원본 fn 그대로, **변형은 fn을 교환**한다.
   *  · `"offset"` — `B + A·cos(ωt+φ)` (직류 오프셋 + 정현파). 변형 전용.
   * ★ 형태로 분기한다(mode로 분기하지 않는다) — 변형이 두 가족을 함께 내기 때문.
   */
  form: SignalForm;
};

/** 신호 형태 — 변형은 두 가족을 섞어 낸다(사용자 지정 2026-08-12: "sin² 함수로도 만들어서"). */
export type SignalForm = "sq" | "offset";

export type PeriodicSignalAnswer = {
  /** 직류값 [V] */
  vdc: string;
  /** 실효값 [V] */
  vrms: string;
  /** 항등식 전개 결과(유사) 또는 성분 분리(변형) */
  decomposed: string;
  /** V_rms² 값 — 검산용(스모크가 독립 재계산과 대조) */
  msq: number;
  /** 직류값 수치 — 검산용 */
  vdcNum: number;
};

// ── 표기 헬퍼 ────────────────────────────────────────────────────────
/** 정수 계수를 곱 표기로 — 1이면 생략. */
function coef(n: number, body: string): string {
  if (n === 1) return body;
  return `${n}${body}`;
}

/** √(3/2) 꼴 — 소수로 쓰면 route의 전역 분수 변환기가 뭉갠다(CLAUDE.md 1-4-3). */
const SQRT_3_2 = "\\sqrt{\\dfrac{3}{2}}";

/** 정수 n의 제곱근을 √ 표기로 — 완전제곱이면 정수, 아니면 k√m으로 인수분해. */
export function sqrtTex(n: number): string {
  const root = Math.round(Math.sqrt(n));
  if (root * root === n) return `${root}`;
  let k = 1, m = n;
  for (let d = 2; d * d <= m; d++) {
    while (m % (d * d) === 0) { m /= d * d; k *= d; }
  }
  return k === 1 ? `\\sqrt{${m}}` : `${k}\\sqrt{${m}}`;
}

/** 위상 표기 — phaseDen=0이면 위상 항 없음, 2면 π/2. */
function phaseTex(phaseDen: number): string {
  if (phaseDen === 0) return "";
  return phaseDen === 1 ? " + \\pi" : ` + \\dfrac{\\pi}{${phaseDen}}`;
}

/**
 * 위상의 2배(항등식 전개용) — **반드시 약분한다**.
 * (실측: π/6의 2배를 `2π/6`으로 찍어 답이 약분되지 않은 채 화면까지 갔다.)
 */
function doublePhaseTex(phaseDen: number): string {
  if (phaseDen === 0) return "";
  const g = phaseDen % 2 === 0 ? 2 : 1;   // gcd(2, den)
  const num = 2 / g;
  const den = phaseDen / g;
  if (den === 1) return num === 1 ? " + \\pi" : ` + ${num}\\pi`;
  return num === 1 ? ` + \\dfrac{\\pi}{${den}}` : ` + \\dfrac{${num}\\pi}{${den}}`;
}

// ── 값 공간 (규칙 열거 + 필터, 원본 튜플 제외) ────────────────────────
const W_COEFS = [200, 400, 500, 1000, 2000, 4000];
const PHASE_DENS = [0, 2, 3, 4, 6];

/**
 * 유사 풀 — `A·fn²`: A는 **짝수**여야 V_dc = A/2가 정수로 떨어진다.
 * 원본 튜플(A=2, ω=1000π, φ=π/2)은 제외한다(참조 전용).
 */
function buildSimilarSpace(): PeriodicSignalValues[] {
  const out: PeriodicSignalValues[] = [];
  for (const A of [2, 4, 6, 8]) {
    for (const wCoef of W_COEFS) {
      for (const phaseDen of PHASE_DENS) {
        if (A === 2 && wCoef === 1000 && phaseDen === 2) continue; // ★ 원본 제외
        out.push({ A, B: 0, wCoef, phaseDen, fn: "cos", form: "sq" });
      }
    }
  }
  return out;
}

/**
 * 변형 가족 ① — **삼각함수 교환**: 원본이 cos²이면 `A·sin²(ωt+φ)`, sin²이면 cos².
 * 항등식이 `sin²θ = (1 − cos2θ)/2`로 바뀌어 [단계 1]의 부호가 달라진다(교육 포인트).
 * 답(V_dc·V_rms)은 유사와 같은 공식이므로 **값 풀을 유사와 겹치지 않게** A를 나눠 쓴다.
 */
function buildVariantSqSpace(): PeriodicSignalValues[] {
  const out: PeriodicSignalValues[] = [];
  for (const A of [4, 6, 8, 10]) {   // 유사는 {2,4,6,8} — 답이 겹치지 않도록 10을 추가하고 2를 뺀다
    for (const wCoef of W_COEFS) {
      for (const phaseDen of PHASE_DENS) {
        out.push({ A, B: 0, wCoef, phaseDen, fn: "sin", form: "sq" });
      }
    }
  }
  return out;
}

/**
 * 변형 풀 — `B + A·cos`: V_rms² = B² + A²/2 가 **정수**여야 하므로 A는 짝수.
 * 근호 안이 지저분하지 않도록(완전제곱이거나 30 이하) 필터한다.
 */
function buildVariantSpace(): PeriodicSignalValues[] {
  const out: PeriodicSignalValues[] = [];
  for (const B of [1, 2, 3, 4]) {
    for (const A of [2, 4, 6]) {
      const msq = B * B + (A * A) / 2;
      if (!Number.isInteger(msq)) continue;
      const root = Math.round(Math.sqrt(msq));
      const clean = root * root === msq || msq <= 30;
      if (!clean) continue;
      for (const wCoef of W_COEFS) {
        for (const phaseDen of PHASE_DENS) {
          out.push({ A, B, wCoef, phaseDen, fn: "cos", form: "offset" });
        }
      }
    }
  }
  return out;
}

const SIMILAR_SPACE = buildSimilarSpace();
const VARIANT_SQ_SPACE = buildVariantSqSpace();
const VARIANT_OFFSET_SPACE = buildVariantSpace();

/** 값 공간 크기 — 스모크가 확인. */
export function __periodicSignalSpaces(): { similar: number; variantSq: number; variantOffset: number } {
  return {
    similar: SIMILAR_SPACE.length,
    variantSq: VARIANT_SQ_SPACE.length,
    variantOffset: VARIANT_OFFSET_SPACE.length,
  };
}

// ── 해 ───────────────────────────────────────────────────────────────
export function solvePeriodicSignal(v: PeriodicSignalValues, _mode?: PeriodicSignalMode): PeriodicSignalAnswer {
  // ★ mode가 아니라 **신호 형태**로 분기한다 — 변형이 sq(삼각함수 교환)와 offset 두 가족을 함께 낸다.
  if (v.form === "offset") {
    const msq = v.B * v.B + (v.A * v.A) / 2;
    return {
      vdc: `${v.B}`,
      vrms: sqrtTex(msq),
      // ★ LaTeX 조각은 반드시 \( \) 안에 둔다 — 밖에 두면 `\,[\mathrm{V}]`가 화면에 원문으로 찍힌다(실측).
      decomposed:
        `직류 성분 \\( ${v.B}\\,[\\mathrm{V}] \\), ` +
        `교류 성분 \\( ${coef(v.A, "\\cos")}(${v.wCoef}\\pi t${phaseTex(v.phaseDen)})\\,[\\mathrm{V}] \\)`,
      msq,
      vdcNum: v.B,
    };
  }
  const m = v.A / 2;
  const sign = v.fn === "cos" ? "+" : "-";
  return {
    vdc: `${m}`,
    vrms: m === 1 ? SQRT_3_2 : `${m}${SQRT_3_2}`,
    decomposed:
      `v(t) = ${m} ${sign} ${coef(m, "\\cos")}(${2 * v.wCoef}\\pi t${doublePhaseTex(v.phaseDen)})\\,[\\mathrm{V}]`,
    msq: 1.5 * m * m,
    vdcNum: m,
  };
}

/** 본문에 쓸 신호 수식 LaTeX. */
export function signalTex(v: PeriodicSignalValues, _mode?: PeriodicSignalMode): string {
  const arg = `${v.wCoef}\\pi t${phaseTex(v.phaseDen)}`;
  if (v.form === "offset") {
    return `v(t) = ${v.B} + ${coef(v.A, "\\cos")}(${arg})\\,[\\mathrm{V}]`;
  }
  return `v(t) = ${coef(v.A, "")}\\${v.fn}^{2}(${arg})\\,[\\mathrm{V}]`;
}

export type PeriodicSignalGen = {
  values: PeriodicSignalValues;
  answer: PeriodicSignalAnswer;
  signal: string;
  mode: PeriodicSignalMode;
};

/**
 * 결정론 생성 — 같은 seed·mode·index면 같은 결과.
 *
 * ★ 변형은 **두 가족을 번갈아** 낸다(사용자 지정 2026-08-12 "sin² 함수로도 만들어서 내줘"):
 *   · 짝수 index → **삼각함수 교환**(원본 cos² → `A·sin²`, 원본 sin² → `A·cos²`)
 *   · 홀수 index → 직류 오프셋 정현파(`B + A·cos`)
 *   count=1 요청이 한 가족에만 몰리지 않도록 seed도 함께 섞는다.
 */
export function generatePeriodicSignalDcRms(args: {
  seed: number;
  mode: PeriodicSignalMode;
  index?: number;
  /** 원본이 sin²이면 그대로 보존(절대규칙 0). 변형에서는 이 함수를 **교환**한다. */
  fn?: TrigFn;
}): PeriodicSignalGen {
  const idx = args.index ?? 0;
  const rand = makeRand(args.seed + idx * 7919);
  const origFn: TrigFn = args.fn ?? "cos";

  if (args.mode === "exam_variant") {
    // ★ 가족 선택은 **index만** 본다 — 0번 sin²(함수 교환), 1번 오프셋, 2번 sin² … 로 번갈아.
    //   (seed를 섞었더니 `generateInParallel`의 stride 7919 때문에 패리티가 상쇄돼
    //    한 배치가 통째로 한 가족으로만 나왔다 — 실측 count=3에서 3개 모두 오프셋형.)
    const useSq = idx % 2 === 0;
    const picked = pick(useSq ? VARIANT_SQ_SPACE : VARIANT_OFFSET_SPACE, rand);
    const values: PeriodicSignalValues = useSq
      ? { ...picked, fn: origFn === "cos" ? "sin" : "cos" }   // ★ 함수 교환
      : { ...picked, fn: "cos" };
    const answer = solvePeriodicSignal(values);
    return { values, answer, signal: signalTex(values), mode: args.mode };
  }

  const picked = pick(SIMILAR_SPACE, rand);
  const values: PeriodicSignalValues = { ...picked, fn: origFn };  // 유사는 원본 함수 보존
  const answer = solvePeriodicSignal(values);
  return { values, answer, signal: signalTex(values), mode: args.mode };
}

// ── 공용 매처 (분류기·감지기가 함께 쓴다 — 복제하면 조용히 드리프트한다) ──
function analysisText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
}

/** 주기 신호(수식)가 주어졌다는 신호 — sin²/cos²·정현파 수식·주기 신호 표현. */
const SIGNAL_RE = /주기\s*신호|주기적\s*신호|periodic\s*signal|sin\s*\^?\s*2|cos\s*\^?\s*2|sin²|cos²|정현파|사인파|코사인/;
/** 구하는 양 — 직류값(평균값)과 실효값. */
const ASK_RE = /(직류\s*값|직류값|dc\s*값|평균\s*값|평균값|v_?dc)/;
const RMS_RE = /(실효\s*값|실효값|rms|v_?rms|제곱\s*평균)/;
/** 회로 해석 유형이면 양보 — 소자·회로망 해석이 주제인 문항은 이 archetype이 아니다. */
const CIRCUIT_YIELD_RE =
  /(테브난|테브넌|노턴|등가\s*임피던스|최대\s*전력|공진|역률|메시|노드\s*해석|과도\s*응답|시정수|플립플롭|카르노|연산\s*증폭기|opamp|트랜지스터|다이오드|전달\s*함수|임피던스를\s*구|전류를\s*구하|전압\s*분배)/;

/**
 * "주기 신호 수식 → 직류값·실효값" 시그니처.
 * ★ 낱말이 아니라 **요구 조합**으로 잡는다: 신호 수식 + 직류값 + 실효값. 회로 해석 어휘가 있으면 양보한다.
 */
export function matchesPeriodicSignalDcRms(analysis?: Partial<AnalysisResult> | null): boolean {
  const text = analysisText(analysis);
  if (!text) return false;
  if (CIRCUIT_YIELD_RE.test(text)) return false;
  return SIGNAL_RE.test(text) && ASK_RE.test(text) && RMS_RE.test(text);
}

/** 원본이 sin²인지 cos²인지 — 표기를 보존하기 위해 분석 텍스트에서 읽는다(기본 cos). */
export function trigFnFromAnalysis(analysis?: Partial<AnalysisResult> | null): TrigFn {
  const text = analysisText(analysis);
  if (/sin\s*\^?\s*2|sin²/.test(text) && !/cos\s*\^?\s*2|cos²/.test(text)) return "sin";
  return "cos";
}
