import type {
  AnalysisResult,
  GenerationMode,
  SwitchedRlDualShortCircuitDiagram,
} from "@/types";

/**
 * 임용 17번 — 스위치 **2개가 t=0에 동시에 닫히며 소자를 단락**시키는 전류원 구동 RL 과도응답.
 *
 * ## 원본 고정 토폴로지 (확대해 확정 — [[feedback_verify_wiring_by_zoom]])
 *   · 하단 rail = 접지. 전류원 I_s(↑) → 마디 A.
 *   · R_a : A ↓ 접지 (세로)
 *   · A ─ [SW₁ ∥ R_b] ─ B      ← **SW₁은 가로 저항 R_b와 병렬** (닫히면 R_b를 단락)
 *   · B ─ [SW₂ ∥ L₁] ─ C       ← **SW₂는 인덕터 L₁과 병렬** (닫히면 L₁을 단락)
 *   · R_c : C ↓ 접지
 *   · L₂ : B ↓ 접지  ← 측정 대상 i(t)
 *
 * ## 닫힌형 해 (GPT 없음)
 *   [t<0] 두 스위치 개방·직류 정상상태 → 인덕터는 단락.
 *     L₂가 B를 접지에 단락하므로 **V_B = 0**, 따라서 L₁·R_c 가지에는 전류가 흐르지 않는다.
 *     전류원은 R_a와 R_b로 나뉘고 → **i(0⁻) = I_s·R_a/(R_a + R_b)**.
 *   [t>0] SW₁이 R_b를, SW₂가 L₁을 단락 → A = B = C.
 *     남는 것은 **I_s ∥ R_a ∥ R_c ∥ L₂** →
 *     **R_eq = R_a∥R_c**, **τ = L₂/R_eq**, **i(∞) = I_s**.
 *   [해] i(t) = i(∞) + [i(0⁻) − i(∞)]·e^(−t/τ)
 *
 *   ★★ **L₁은 답에 전혀 관여하지 않는다** — t<0엔 전류가 0이고 t>0엔 SW₂에 단락된다.
 *     원본이 일부러 넣은 distractor이고, 이 문항의 채점 포인트다
 *     (원본 보기 ②가 L₁·R_c를 잘못 끼워 넣었을 때 나오는 함정이다).
 *   원본 검산: I_s=2·R_a=R_b=R_c=4·L₁=1·L₂=2 → i(0⁻)=1 · R_eq=2 · τ=1 · **i(t)=2−e^(−t)**.
 *
 * ## 왜 전용 archetype인가
 *   generic `switched_rl`은 **단일 전압원 직렬 RL**만 만든다(실측 라우팅: `switched_rl`, medium) —
 *   전류원·스위치 2개·병렬 구조를 통째로 잃는다. 형제도 재현 못 한다:
 *   `switched_rl_source_switch`는 2전압원 SPDT, `switched_rl_dependent`는 종속전원,
 *   `switched_rlc_*`는 커패시터가 있다. **스위치가 소자를 단락시키는** 형식은 이 유형뿐이다.
 */

export type SwitchedRlDualShortValues = {
  Is: number;   // 전류원 [A]
  Ra: number;   // 세로 저항 [Ω]
  Rb: number;   // 가로 저항 (SW₁과 병렬) [Ω]
  Rc: number;   // 하단 저항 [Ω]
  L1: number;   // SW₂와 병렬인 인덕터 [H] — 답에 무관(distractor)
  L2: number;   // 측정 대상 인덕터 [H]
};

export type SwitchedRlDualShortSolution = {
  i0: number;     // i(0⁻)
  iInf: number;   // i(∞)
  Req: number;    // t>0 등가저항
  tau: number;    // 시정수
  /** v_L(0⁺) = L₂·di/dt|₀₊ = R_eq·(i(∞) − i(0⁻)) — 변형 모드에서 쓴다. */
  v0: number;
};

/** 닫힌형 해 — 값만 받아 그대로 계산한다(특정 예시 하드코딩 없음). */
export function solveSwitchedRlDualShort(v: SwitchedRlDualShortValues): SwitchedRlDualShortSolution {
  const i0 = (v.Is * v.Ra) / (v.Ra + v.Rb);
  const iInf = v.Is;
  const Req = (v.Ra * v.Rc) / (v.Ra + v.Rc);
  const tau = v.L2 / Req;
  return { i0, iInf, Req, tau, v0: Req * (iInf - i0) };
}

// ─────────────────────────────────────────────────────────────
// 값 공간 — 규칙 열거 + 필터 (예시 hardcode 금지)
// ─────────────────────────────────────────────────────────────

const IS_CHOICES = [1, 2, 3, 4, 5, 6];
const R_CHOICES = [2, 3, 4, 5, 6, 8, 10, 12];
const L1_CHOICES = [1, 2, 3];        // distractor — 값은 자유
const L2_CHOICES = [1, 2, 3, 4, 5, 6];

/** 원본 튜플 — 생성 풀에서 제외한다. */
const ORIGINAL: SwitchedRlDualShortValues = { Is: 2, Ra: 4, Rb: 4, Rc: 4, L1: 1, L2: 2 };

const isHalfMultiple = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const isInteger = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;

function buildSpace(): SwitchedRlDualShortValues[] {
  const out: SwitchedRlDualShortValues[] = [];
  for (const Is of IS_CHOICES) {
    for (const Ra of R_CHOICES) {
      for (const Rb of R_CHOICES) {
        const i0 = (Is * Ra) / (Ra + Rb);
        // 초깃값은 눈으로 읽히는 값이어야 한다.
        if (!isHalfMultiple(i0)) continue;
        if (Math.abs(i0 - Is) < 1e-9) continue;   // 과도가 없으면 문제가 성립하지 않는다
        for (const Rc of R_CHOICES) {
          const Req = (Ra * Rc) / (Ra + Rc);
          if (!isHalfMultiple(Req)) continue;
          for (const L2 of L2_CHOICES) {
            const tau = L2 / Req;
            // 시정수는 정수 또는 0.5 배수 — 지수의 계수가 지저분하면 전역 분수 변환기가 뭉갠다(1-4-3).
            if (!isHalfMultiple(tau)) continue;
            if (tau < 0.25 || tau > 4) continue;
            // v_L(0⁺)도 깔끔해야 변형 모드가 성립한다.
            const v0 = Req * (Is - i0);
            if (!isHalfMultiple(v0)) continue;
            for (const L1 of L1_CHOICES) {
              if (L1 === L2) continue;  // 두 인덕터가 같은 값이면 어느 쪽이 대상인지 헷갈린다
              const v: SwitchedRlDualShortValues = { Is, Ra, Rb, Rc, L1, L2 };
              if (sameValues(v, ORIGINAL)) continue;   // ★ 원본 튜플 제외
              out.push(v);
            }
          }
        }
      }
    }
  }
  return out;
}

const sameValues = (a: SwitchedRlDualShortValues, b: SwitchedRlDualShortValues) =>
  a.Is === b.Is && a.Ra === b.Ra && a.Rb === b.Rb && a.Rc === b.Rc && a.L1 === b.L1 && a.L2 === b.L2;

/** 결정론 해시 — 열거 순서대로 두면 앞쪽이 전부 비슷해 다양성이 없다. */
function shuffleDeterministic<T>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

const SPACE = shuffleDeterministic(buildSpace());
/** 유사·변형이 같은 수치를 쓰지 않도록 풀을 절반씩 나눈다. */
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);

/** 스모크 전용. */
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL };

// ─────────────────────────────────────────────────────────────
// 생성
// ─────────────────────────────────────────────────────────────

export type SwitchedRlDualShortGeneration = {
  values: SwitchedRlDualShortValues;
  sol: SwitchedRlDualShortSolution;
  /** exam_similar = 인덕터 전류 i(t) / exam_variant = 인덕터 양단 전압 v(t) (구하는 양 교환). */
  target: "current" | "voltage";
  circuitDiagram: SwitchedRlDualShortCircuitDiagram;
};

const ohm = (x: number) => `${fmt(x)}[Ω]`;
const henry = (x: number) => `${fmt(x)}[H]`;

/** 숫자 표기 — 정수는 그대로, 반정수는 분수로(전역 분수 변환기와 충돌하지 않게). */
export function fmt(x: number): string {
  if (isInteger(x)) return String(Math.round(x));
  if (isHalfMultiple(x)) return `${Math.round(x * 2)}/2`;
  return String(Math.round(x * 1000) / 1000);
}

export function generateSwitchedRlDualShort(args: {
  seed?: number;
  index?: number;
  mode: GenerationMode;
}): SwitchedRlDualShortGeneration {
  const target = args.mode === "exam_variant" ? "voltage" : "current";
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 101) % space.length;
  const values = space[idx];
  const sol = solveSwitchedRlDualShort(values);

  const circuitDiagram: SwitchedRlDualShortCircuitDiagram = {
    sourceLabel: `${fmt(values.Is)}[A]`,
    raLabel: ohm(values.Ra),
    rbLabel: ohm(values.Rb),
    rcLabel: ohm(values.Rc),
    l1Label: henry(values.L1),
    l2Label: henry(values.L2),
    sw1Label: "SW₁",
    sw2Label: "SW₂",
    switchTimeLabel: "t=0",
    measure: target,
    measureLabel: target === "current" ? "i(t)" : "v(t)",
  };

  return { values, sol, target, circuitDiagram };
}

// ─────────────────────────────────────────────────────────────
// 공용 매처 — 분류기와 감지기가 **같은 함수**를 쓴다 (복제하면 조용히 드리프트한다)
// ─────────────────────────────────────────────────────────────

export function switchedRlDualShortText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}

function countType(a: Partial<AnalysisResult> | null | undefined, re: RegExp): number {
  return (a?.componentInventory ?? []).filter((c) => re.test(String(c?.type ?? ""))).length;
}

/** 형제 양보 — 커패시터·종속전원·교류·SPDT 2전압원 형식은 각자의 archetype이 있다. */
const YIELD_RE =
  /커패시터|capacitor|축전기|정전용량|공진|페이저|phasor|∠|교류|역률|임피던스|어드미턴스|종속\s*전(원|압원|류원)|단자\s*A|단자\s*B|SPDT|상태\s*방정식|테브난|최대\s*전력/i;

/** 스위치가 **소자를 단락**시키는 형식인가 (열리는 형식·전원 절체와 구분). */
const SHORT_CLOSE_RE =
  /동시에\s*닫|모두\s*닫|둘\s*다\s*닫|닫히는|닫힌\s*후|닫는다|close[sd]?\b|단락(시키|한다|된다)/i;

const TWO_SWITCH_RE = /스위치\s*(2|두|둘)\s*개|두\s*개의\s*스위치|SW\s*₁|SW\s*1|SW₁|SW_1/i;
const INDUCTOR_ASK_RE = /인덕터[^.\n]{0,20}(전류|전압)|코일[^.\n]{0,20}(전류|전압)|\bi\(t\)|\bv_?L\(t\)|\[H\]/i;

/**
 * 구조 시그니처 — 낱말 하나가 아니라 **구조**로 잡는다(CLAUDE.md 규칙 2).
 *
 *  구조 신호 (인벤토리): **전류원 ≥1 + 인덕터 ≥2 + 스위치 ≥2 + 커패시터 0 + 종속전원 0**
 *    → 형제 어느 것도 이 조합을 갖지 않는다(전압원 SPDT·종속전원·RLC는 각각 다른 조합).
 *  텍스트 신호: 스위치 2개가 **닫힌다** + 인덕터 전류/전압을 구한다.
 *  Vision이 인벤토리를 흘리는 회차 대비로 **둘 중 하나만 맞아도** 인정하되,
 *  형제 낱말(커패시터·종속전원·교류…)이 보이면 양보한다.
 */
export function matchesSwitchedRlDualShort(a?: Partial<AnalysisResult> | null): boolean {
  const t = switchedRlDualShortText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;

  const nI = countType(a, /^I$/i);
  const nL = countType(a, /^L$/i);
  const nSW = countType(a, /^SW$/i);
  const nC = countType(a, /^C$/i);
  const nDep = countType(a, /^(VCVS|VCCS|CCVS|CCCS|DEP)$/i);
  if (nC > 0 || nDep > 0) return false;

  const structural = nI >= 1 && nL >= 2 && nSW >= 2;
  const textual = TWO_SWITCH_RE.test(t) && SHORT_CLOSE_RE.test(t) && INDUCTOR_ASK_RE.test(t);
  if (!structural && !textual) return false;

  // 과도응답 문맥이어야 한다(정상상태 해석 문제와 구분).
  return /과도|t\s*=\s*0|t\s*>\s*0|시정수|초기\s*(전류|조건)|정상\s*상태|오랜?\s*시간/i.test(t);
}
