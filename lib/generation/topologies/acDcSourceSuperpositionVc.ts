import type {
  AnalysisResult, AcDcSourceSuperpositionCircuitDiagram, GenerationMode,
} from "@/types";

/**
 * 임용 15번 — **교류 전압원 + 직류 전류원**이 함께 있는 RLC 회로의 정상상태 v_C(t) (중첩).
 *
 * ## 원본 고정 토폴로지 (확대 확정 — [[feedback_verify_wiring_by_zoom]])
 *   좌: 교류 전압원 v(t) = V_m cos(ωt)  (하단 rail ↔ 상단 rail)
 *   상단: v(t) ─ R₁ ─ L₁ ─ **마디 M**
 *   중간 가지: M ─ R₂ ─ L₂ ─ C ─ **마디 N**(하단 rail),  v_C는 **C 양단**(+ 위)
 *   우: 직류 전류원 I_dc (↑, 하단 rail → 상단 rail)
 *
 * ## 닫힌형 해 (GPT 없음)
 *   [직류] C가 직류를 차단 → **중간 가지 전류 0** → R₂·L₂에 강하가 없다.
 *          I_dc는 상단 rail → L₁(단락) → R₁ → 전압원(단락) 경로로 흐르므로
 *          **V_C(DC) = V_M − V_N = I_dc · R₁**
 *   [교류] 전류원 개방 → **단일 직렬 루프**.  X_L = ω(L₁+L₂), X_C = 1/(ωC)
 *          **Z = (R₁+R₂) + j(X_L − X_C)**,  I = V_m∠0° / Z,  **V_C = I · (−jX_C)**
 *   [중첩] v_C(t) = V_C(DC) + |V_C| cos(ωt + ∠V_C)
 *
 *   ★★ 값 공간에서 **X_L − X_C = R₁ + R₂** 를 강제한다(원본이 그렇다: 8−2 = 6 = 4+2).
 *     그러면 Z = R_tot(1+j) = R_tot√2∠45° 라 위상이 정확히 **−135°**(= −45° − 90°)이고
 *     진폭이 k√2 (k = V_m·X_C/(2R_tot)) 로 떨어진다.
 *   원본 검산: R_tot=6 · X_L=8 · X_C=2 · V_m=12 → V_C(DC)=4 · |I|=√2 · |V_C|=2√2
 *     → **v_C(t) = 4 + 2√2 cos(8t − 135°)** (원본 보기 ⑤). ✓
 *
 * ## 변형 — **구하는 양 교환**: 중간 가지 전류 i(t)
 *   [직류] 커패시터가 직류를 차단하므로 **i(DC) = 0** (그 자체가 교육 포인트)
 *   [교류] i(t) = |I| cos(ωt − 45°)
 *   구조·3단계 절차는 그대로 두고 측정 대상만 바꾼다(절대규칙 0).
 */

export type AcDcVcValues = {
  R1: number; R2: number;
  L1: number; L2: number;   // [H]
  C: number;                // [F]
  Vm: number;               // 교류 진폭 [V]
  Idc: number;              // 직류 전류원 [A]
  w: number;                // 각주파수 [rad/s]
};

export type AcDcVcSolution = {
  Rtot: number;
  XL: number;      // ω(L₁+L₂)
  XC: number;      // 1/(ωC)
  /** |Z| = R_tot√2 이므로 그 √2 계수. */
  zK: number;
  /** |I| = iK√2 */
  iK: number;
  /** 교류 성분 진폭 |V_C| = vK√2 (변형이면 |I| 사용) */
  vK: number;
  vcDc: number;    // V_C(DC) = I_dc·R₁
};

export function solveAcDcVc(v: AcDcVcValues): AcDcVcSolution {
  const Rtot = v.R1 + v.R2;
  const XL = v.w * (v.L1 + v.L2);
  const XC = 1 / (v.w * v.C);
  // X_L − X_C = R_tot 강제 → Z = R_tot(1+j)
  const zK = Rtot;                  // |Z| = zK·√2
  const iK = v.Vm / (2 * Rtot);     // |I| = Vm/(Rtot√2) = iK·√2
  const vK = (v.Vm * XC) / (2 * Rtot); // |V_C| = |I|·X_C = vK·√2
  return { Rtot, XL, XC, zK, iK, vK, vcDc: v.Idc * v.R1 };
}

// ── 값 공간 ──────────────────────────────────
const R_CH = [1, 2, 3, 4, 5, 6, 8];
const W_CH = [2, 4, 5, 8, 10];
const VM_CH = [6, 8, 10, 12, 16, 20, 24];
const IDC_CH = [1, 2, 3];
const XC_CH = [1, 2, 3, 4, 5, 6];

const ORIGINAL: AcDcVcValues = { R1: 4, R2: 2, L1: 0.75, L2: 0.25, C: 1 / 16, Vm: 12, Idc: 1, w: 8 };

const int = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
const half = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
/** 소자 값이 "3/4 H"처럼 작은 분모의 분수로 읽히는가. */
const denomOf = (x: number): number => {
  for (let d = 1; d <= 128; d++) if (int(x * d)) return d;
  return Infinity;
};
const niceElem = (x: number) => {
  for (const d of [1, 2, 3, 4, 5, 6, 8, 10, 16, 20, 25, 32, 40, 50, 64, 80, 100]) {
    if (int(x * d)) return true;
  }
  return false;
};

function buildSpace(): AcDcVcValues[] {
  const out: AcDcVcValues[] = [];
  for (const R1 of R_CH) for (const R2 of R_CH) {
    const Rtot = R1 + R2;
    for (const w of W_CH) for (const XC of XC_CH) {
      const C = 1 / (w * XC);
      if (!niceElem(C)) continue;
      const XL = Rtot + XC;              // ★ X_L − X_C = R_tot 강제
      const Lsum = XL / w;
      if (!niceElem(Lsum)) continue;
      // ★ 인덕터 값이 "39/8 H"처럼 커지면 읽히지 않는다 — 원본(3/4·1/4) 수준으로 제한한다.
      if (Lsum > 2) continue;
      // L₁ : L₂ = 3 : 1 (원본 비율) — 두 인덕터가 모두 읽히는 값이어야 한다.
      const L1 = (Lsum * 3) / 4, L2 = Lsum / 4;
      // ★ 분모가 크면(21/20·27/40) 교과서 표기가 아니다 — 원본(3/4·1/4) 수준으로 분모 ≤ 8.
      if (denomOf(L1) > 8 || denomOf(L2) > 8) continue;
      for (const Vm of VM_CH) {
        const iK = Vm / (2 * Rtot);
        if (!half(iK) || iK < 0.5) continue;
        const vK = iK * XC;
        if (!half(vK) || vK < 0.5) continue;
        for (const Idc of IDC_CH) {
          const vcDc = Idc * R1;
          if (!int(vcDc) || vcDc > 30) continue;
          const v: AcDcVcValues = { R1, R2, L1, L2, C, Vm, Idc, w };
          if (same(v, ORIGINAL)) continue;   // ★ 원본 튜플 제외
          out.push(v);
        }
      }
    }
  }
  return out;
}

const same = (a: AcDcVcValues, b: AcDcVcValues) =>
  a.R1 === b.R1 && a.R2 === b.R2 && Math.abs(a.L1 - b.L1) < 1e-12 && Math.abs(a.L2 - b.L2) < 1e-12 &&
  Math.abs(a.C - b.C) < 1e-15 && a.Vm === b.Vm && a.Idc === b.Idc && a.w === b.w;

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 })).sort((p, q) => p.k - q.k).map((p) => p.x);
}

const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL };

// ── 표기 ─────────────────────────────────────
/** 소자 값을 "3/4"처럼 기약분수로. */
export function fracTex(x: number): string {
  if (int(x)) return String(Math.round(x));
  for (let d = 2; d <= 128; d++) {
    if (int(x * d)) {
      const n = Math.round(x * d);
      const g = gcd(Math.abs(n), d);
      return `${n / g}/${d / g}`;
    }
  }
  return String(Math.round(x * 1e6) / 1e6);
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

/** k√2 표기 — 계수 1은 생략. */
export function rootTex(k: number): string {
  if (Math.abs(k - 1) < 1e-9) return "√2";
  return `${fracTex(k)}√2`;
}

// ── 생성 ─────────────────────────────────────
export type AcDcVcGeneration = {
  values: AcDcVcValues;
  sol: AcDcVcSolution;
  /** 유사=커패시터 전압 v_C(t) / 변형=중간 가지 전류 i(t). */
  target: "vc" | "current";
  circuitDiagram: AcDcSourceSuperpositionCircuitDiagram;
};

export function generateAcDcSourceSuperpositionVc(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): AcDcVcGeneration {
  const target: "vc" | "current" = args.mode === "exam_variant" ? "current" : "vc";
  const space = target === "current" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 101) % space.length;
  const values = space[idx];
  const sol = solveAcDcVc(values);

  const circuitDiagram: AcDcSourceSuperpositionCircuitDiagram = {
    sourceLabel: `v(t) = ${values.Vm}cos${values.w}t V`,
    r1Label: `${fracTex(values.R1)}Ω`,
    r2Label: `${fracTex(values.R2)}Ω`,
    l1Label: `${fracTex(values.L1)}H`,
    l2Label: `${fracTex(values.L2)}H`,
    cLabel: `${fracTex(values.C)}F`,
    idcLabel: `${fracTex(values.Idc)}A`,
    measure: target,
    measureLabel: target === "vc" ? "v_c(t)" : "i(t)",
  };

  return { values, sol, target, circuitDiagram };
}

// ── 공용 매처 ────────────────────────────────
export function acDcVcText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

/** 교류 전압원 **과** 직류 전류원이 함께 있는 구조 — 이 유형의 뼈대. */
const AC_V_RE = /교류\s*전압원|정현파\s*전압원|cos|sin|\bAC\b/i;
const DC_I_RE = /직류\s*전류원|\bDC\b[^.\n]{0,10}전류원|전류원[^.\n]{0,10}직류|정전류원/i;
const STEADY_RE = /정상\s*상태|steady|정상상태/i;
const VC_ASK_RE = /커패시터\s*양단|v_?c\s*\(\s*t\s*\)|콘덴서\s*양단|축전기\s*양단/i;
/** 형제 양보 — 스위치 과도·테브난·공진·역률은 각자 전용 유형이 있다. */
const YIELD_RE =
  /스위치|\bSW\b|단자\s*A|과도\s*응답|테브난|최대\s*전력|공진|역률|어드미턴스|브리지|상태\s*방정식|단위\s*계단|중첩의?\s*원리\s*를?\s*이용하여\s*i_?A/i;
/**
 * ★ 이 유형의 전류원은 **직류**다 — 형제 `ac_superposition_source_design`(임용 5번)은
 *   **교류 전류원**(페이저 ∠ 표기)에 전원 **크기를 역산**하는 문제라 구조 신호(V+I+C+L)가 겹친다.
 *   페이저 표기나 "전원의 크기를 구한다"가 보이면 그쪽에 양보한다(실측: 통합 라우팅에서 잡힘).
 */
const PHASOR_YIELD_RE = /전원\s*의?\s*크기|크기\s*를?\s*구하|V_s\s*[·,]\s*I_s|목표\s*전압/i;
// ★★ `페이저|phasor|∠`를 양보 근거로 쓰면 **안 된다** — 이 유형도 정상상태 교류라 요약에 당연히
//   "페이저"가 들어간다. 실제로 그 가드 때문에 원본이 통째로 미발화해 임용 5번 회로가 계속 나왔다
//   (사용자 신고 2026-08-12, 로그: cachedType=ac_parallel_branches · 내 coercion 로그 없음).
//   형제와의 진짜 판별선은 **전류원이 직류냐 교류냐** 하나뿐이고, 그건 아래에서 따로 요구한다.

/**
 * 구조 시그니처 — 낱말이 아니라 **전원 구성**으로 잡는다(CLAUDE.md 규칙 2).
 *   교류 **전압**원 + 직류 **전류**원 + 커패시터 + 정상상태 요구.
 *   인벤토리가 흔들리는 회차 대비로 텍스트·인벤토리 어느 쪽이든 인정한다.
 */
export function matchesAcDcSourceSuperpositionVc(a?: Partial<AnalysisResult> | null): boolean {
  const t = acDcVcText(a);
  if (!t) return false;
  if (YIELD_RE.test(t) || PHASOR_YIELD_RE.test(t)) return false;

  const inv = a?.componentInventory ?? [];
  const nV = inv.filter((c) => /^V$/i.test(String(c?.type ?? ""))).length;
  const nI = inv.filter((c) => /^I$/i.test(String(c?.type ?? ""))).length;
  const nC = inv.filter((c) => /^C$/i.test(String(c?.type ?? ""))).length;
  const nL = inv.filter((c) => /^L$/i.test(String(c?.type ?? ""))).length;

  // ★★ 전류원이 **직류**라는 근거가 반드시 있어야 한다.
  //   형제 `ac_parallel_branches`(임용 5번)도 V+I+C+L 구조라 구조 신호만으로는 구별되지 않아
  //   그 유형을 통째로 뺏었다(실측 2026-08-12). 저쪽 전류원은 **교류 페이저**다.
  //   근거: (a) "직류 전류원" 문구, 또는 (b) 인벤토리의 전류원 값이 **∠·cos·sin 없는 순수 수치**.
  const dcCurrentByValue = (a?.componentInventory ?? []).some((c) =>
    /^I$/i.test(String(c?.type ?? "")) &&
    /^\s*-?\d+(\.\d+)?(\s*\/\s*\d+)?\s*(m?A)?\s*$/i.test(String(c?.value ?? "")));
  // 문구가 흔들리는 회차 대비 — "직류"와 "전류원"이 함께 나오기만 해도 인정한다.
  const dcCurrentEvidence =
    DC_I_RE.test(t) || dcCurrentByValue || (/직류|\bDC\b/i.test(t) && /전류\s*원/.test(t));
  if (!dcCurrentEvidence) return false;

  // 구조: 전압원 1 + 전류원 1 + 커패시터 + 인덕터 (스위치·종속원 없음)
  const structural = nV >= 1 && nI >= 1 && nC >= 1 && nL >= 1;
  const textual = AC_V_RE.test(t) && DC_I_RE.test(t);
  if (!structural && !textual) return false;

  // 요구: 커패시터 양단 전압(또는 정상상태 값)을 묻는다.
  return VC_ASK_RE.test(t) || STEADY_RE.test(t);
}
