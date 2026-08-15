import type { AcTwoSourceMeshCircuitDiagram, GenerationMode } from "@/types";
import { add, div, mul, neg, cplx, type Complex } from "@/lib/solver/complex";
import { effectiveComponentType } from "@/lib/analysis/reactiveValue";
import { isDependentComponent } from "@/lib/analysis/dependentSource";
import { elemTex, elemZ, numFmt, polarTex, rectTex, type Elem } from "./acTwoSourceMeshPower";

/**
 * 2전원(교류 전압원 + 교류 전류원) RLC 2-메시 → **중첩의 원리로 V_L = 0이 되는 전류원 역산**
 * (임용 3번 회로이론) — 전용 결정론 archetype. GPT 없음.
 *
 * ── 고정 토폴로지 (원본 그대로) ──────────────────────────────────
 *   직사각 2-메시.  좌측 세로 = **전압원 V_s**(+ 위),  우측 세로 = **전류원 I_s**(↑, 위로 유입).
 *     상단 좌: Z_a (원본 1Ω)          상단 우: Z_b (원본 1Ω)
 *     가운데 세로: Z_m (원본 j2Ω) — 여기 양단 전압이 **V_L**(+ 위)
 *     하단 좌: Z_c (원본 −j1Ω)        하단 우: Z_d (원본 −j1Ω)
 *
 * ── 물리 (닫힌형, 중첩) ──────────────────────────────────────────
 *   [단계 1] 전류원 **개방** → 좌측 단일 직렬 루프(Z_a + Z_m + Z_c)
 *            **V_L1 = V_s·Z_m/(Z_a + Z_m + Z_c)**
 *   [단계 2] 전압원 **단락** → I_s가 Z_b로 유입해 마디에서 Z_m 과 (Z_a + Z_c)로 나뉜다
 *            **Z_p = Z_m ∥ (Z_a + Z_c)**,  **V_L2 = I_s·Z_p**
 *   [단계 3] 중첩 + 조건 V_L = V_L1 + V_L2 = 0 → **I_s = −V_L1/Z_p**
 *   ★★ **Z_b·Z_d는 답에 전혀 관여하지 않는다** — 이상 전류원과 직렬이라 전류가 이미 정해져 있다.
 *      원본이 그대로 갖고 있는 distractor이고, 이 유형의 교육 포인트다(형제 `ac_superposition_source_design`의
 *      R₂와 같은 역할). 값 규칙도 이 둘을 자유 변수로 둔다.
 *   원본 검산(1Ω·j2·−j1·V_s=√2∠45°=1+j):
 *     V_L1 = (1+j)·j2/(1+j) = **j2 = 2∠90°[V]**,  Z_p = j2∥(1−j) = **2Ω**,
 *     → **I_s = −j2/2 = −j = 1∠−90°[A]**.
 *
 * ── ★ 값은 규칙 열거 + 필터 (예시 hardcode 금지) ─────────────────
 *   (Z_a·Z_m·Z_c·V_s) 를 열거하고 **V_L1·Z_p·I_s가 모두 가우스 정수(또는 반정수)이고
 *   I_s의 위상이 45° 배수**인 조합만 채택한다. 그러면 세 단계의 답이 전부 깔끔하다.
 *   **원본 튜플은 제외**하고 유사·변형 풀을 절반씩 나눈다.
 *
 * ── 모드 ─────────────────────────────────────────────────────────
 *   exam_similar : 원본 배치(가운데 **인덕터** · 하단 커패시터) → "V_L = 0"
 *   exam_variant : **리액티브 소자 종류 교환**(가운데 **커패시터** · 하단 인덕터) → "V_C = 0"
 *                  구조·중첩 절차는 동일하고 답이 켤레 거울이 된다.
 */

// ── 복소 helper (lib/solver/complex 재사용) ────────────────────────
const Z = (e: Elem): Complex => {
  const z = elemZ(e);
  return cplx(z.re, z.im);
};
/** 병렬 합성 Z₁∥Z₂. */
const par = (a: Complex, b: Complex): Complex => div(mul(a, b), add(a, b));
const isNear = (x: number, y: number, eps = 1e-9): boolean => Math.abs(x - y) < eps;
/**
 * **정수 격자** 위의 값인가.
 * ★ 반정수까지 허용했더니 |I_s| = 3/2 인 조합이 뽑혔고, 극형식 표기가 `√2∠−90°`(= 1.414)로
 *   **틀린 크기**를 냈다(실측 2026-08-05). 정수 격자면 |z|²가 항상 정수라 `√n` 표기가 정확하다.
 */
const intCx = (z: Complex): boolean =>
  isNear(z.re, Math.round(z.re)) && isNear(z.im, Math.round(z.im));
/** 위상이 45° 배수인가 (re=0 · im=0 · |re|=|im|). */
const on45 = (z: Complex): boolean =>
  isNear(z.re, 0) || isNear(z.im, 0) || isNear(Math.abs(z.re), Math.abs(z.im));
const absC = (z: Complex): number => Math.hypot(z.re, z.im);

export type NullSourceArms = {
  topLeft: Elem;   // Z_a — 전압원 쪽 상단
  mid: Elem;       // Z_m — 전압을 0으로 만드는 가지 (V_L 측정)
  topRight: Elem;  // Z_b — 전류원 쪽 상단 (distractor)
  botLeft: Elem;   // Z_c
  botRight: Elem;  // Z_d (distractor)
};

export type AcNullSourceValues = {
  /** false = 유사(가운데 L·하단 C, 원본) / true = 변형(가운데 C·하단 L). */
  swapped: boolean;
  arms: NullSourceArms;
  Vs: Complex;
};

export type AcNullSourceAnswer = {
  VL1: Complex;     // [단계 1] 전류원 개방 시 V_L
  Zp: Complex;      // [단계 2] Z_m ∥ (Z_a + Z_c)
  Is: Complex;      // [단계 3] V_L = 0 이 되는 전류원
  Zloop: Complex;   // Z_a + Z_m + Z_c (단계 1 직렬 합)
  Zleft: Complex;   // Z_a + Z_c (단계 2 좌측 경로)
  VL2: Complex;     // I_s·Z_p (= −V_L1)
};

/**
 * 중첩 3단계를 푼다 (범용 — 특정 값 가정 없음).
 * 부호 규약: V_L은 **가운데 가지 위쪽이 +**. 전압원은 + 위, 전류원은 화살표가 **위**(상단 마디로 유입).
 */
export function solveNullSource(v: AcNullSourceValues): AcNullSourceAnswer {
  const a = v.arms;
  const Za = Z(a.topLeft), Zm = Z(a.mid), Zc = Z(a.botLeft);
  const Zloop = add(add(Za, Zm), Zc);
  const VL1 = div(mul(v.Vs, Zm), Zloop);          // 전류원 개방 → 단일 직렬 루프의 전압 분배
  const Zleft = add(Za, Zc);                       // 전압원 단락 → 좌측 경로
  const Zp = par(Zm, Zleft);
  const Is = neg(div(VL1, Zp));                    // V_L1 + I_s·Z_p = 0
  const VL2 = mul(Is, Zp);
  return { VL1, Zp, Is, Zloop, Zleft, VL2 };
}

// ── 값 공간 (규칙 열거 + 필터) ────────────────────────────────────
const R_MAGS = [1, 2, 3];
const X_MAGS = [1, 2, 3, 4];
/** V_s는 가우스 정수(깨끗한 극형식) — 0 제외, 크기 제한. */
function vsCandidates(): Complex[] {
  const out: Complex[] = [];
  for (let re = -3; re <= 3; re++) for (let im = -3; im <= 3; im++) {
    if (re === 0 && im === 0) continue;
    const z = cplx(re, im);
    if (!on45(z)) continue;            // 원본처럼 45° 배수 위상만
    if (absC(z) > 4.3) continue;
    out.push(z);
  }
  return out;
}

/** 원본 튜플 — 생성 풀에서 제외한다(참조·물리검증 전용). */
const ORIGINAL: AcNullSourceValues = {
  swapped: false,
  arms: {
    topLeft: { kind: "R", mag: 1 }, mid: { kind: "L", mag: 2 }, topRight: { kind: "R", mag: 1 },
    botLeft: { kind: "C", mag: 1 }, botRight: { kind: "C", mag: 1 },
  },
  Vs: cplx(1, 1),   // √2∠45°
};
const keyOf = (v: AcNullSourceValues): string =>
  [v.swapped, v.arms.topLeft.mag, v.arms.mid.mag, v.arms.topRight.mag, v.arms.botLeft.mag, v.arms.botRight.mag,
    v.Vs.re, v.Vs.im].join("|");

let SPACE_CACHE: { similar: AcNullSourceValues[]; variant: AcNullSourceValues[] } | null = null;

/**
 * 값 공간 — 세 단계의 답(V_L1·Z_p·I_s)이 모두 깨끗한 조합만 남긴다.
 *  · V_L1·Z_p·I_s 가 **정수 격자** 위 + I_s 위상 45° 배수 + I_s ≠ 0
 *    (정수 격자여야 극형식 `√n∠θ°` 표기가 정확하다 — 반정수를 허용하면 크기가 틀리게 찍힌다)
 *  · 원본 튜플 제외. 결정론 해시로 섞은 뒤 유사/변형 풀을 절반씩 나눈다.
 */
function buildSpace(): { similar: AcNullSourceValues[]; variant: AcNullSourceValues[] } {
  if (SPACE_CACHE) return SPACE_CACHE;
  const originalKey = keyOf(ORIGINAL);
  const pool: AcNullSourceValues[] = [];
  const vsList = vsCandidates();
  for (const swapped of [false, true]) {
    for (const ra of R_MAGS) for (const xm of X_MAGS) for (const xc of X_MAGS) {
      for (const rb of R_MAGS) for (const xd of X_MAGS) {
        const arms: NullSourceArms = {
          topLeft: { kind: "R", mag: ra },
          mid: { kind: swapped ? "C" : "L", mag: xm },
          topRight: { kind: "R", mag: rb },
          botLeft: { kind: swapped ? "L" : "C", mag: xc },
          botRight: { kind: swapped ? "L" : "C", mag: xd },
        };
        for (const Vs of vsList) {
          const v: AcNullSourceValues = { swapped, arms, Vs };
          const s = solveNullSource(v);
          if (!Number.isFinite(s.Is.re) || !Number.isFinite(s.Is.im)) continue;
          if (absC(s.Is) < 1e-9) continue;
          if (!intCx(s.VL1) || !intCx(s.Zp) || !intCx(s.Is)) continue;
          if (!on45(s.Is) || !on45(s.VL1)) continue;
          if (absC(s.Is) > 6 || absC(s.VL1) > 12) continue;
          if (keyOf(v) === originalKey) continue;                 // ★ 원본 미생성
          pool.push(v);
        }
      }
    }
  }
  // 결정론 해시로 섞어 앞쪽이 같은 소자값으로 몰리지 않게 한다.
  const hash = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  pool.sort((x, y) => hash(keyOf(x)) - hash(keyOf(y)));
  const similar = pool.filter((v) => !v.swapped);
  const variant = pool.filter((v) => v.swapped);
  SPACE_CACHE = { similar, variant };
  return SPACE_CACHE;
}

export type AcNullSourceGeneration = {
  values: AcNullSourceValues;
  answer: AcNullSourceAnswer;
  circuitDiagram: AcTwoSourceMeshCircuitDiagram;
  /** 가운데 가지 소자 이름 — "인덕터"/"커패시터" (발문 문구용). */
  midKo: string;
  /** 측정 전압 기호 — "V_L"/"V_C". */
  vSym: string;
};

const armOf = (e: Elem, name: string) => ({ kind: e.kind, name, label: elemTex(e) });

export function buildNullSourceGeneration(v: AcNullSourceValues): AcNullSourceGeneration {
  const answer = solveNullSource(v);
  const a = v.arms;
  const midKo = a.mid.kind === "L" ? "인덕터" : "커패시터";
  const vSym = a.mid.kind === "L" ? "V_L" : "V_C";
  const circuitDiagram: AcTwoSourceMeshCircuitDiagram = {
    v1Label: `V_s = ${polarTex(v.Vs)} V`,
    v2Label: "I_s",
    topLeft: armOf(a.topLeft, ""),
    mid: armOf(a.mid, ""),
    topRight: armOf(a.topRight, ""),
    botLeft: armOf(a.botLeft, ""),
    botRight: armOf(a.botRight, ""),
    rightSource: "current",
    showMeshArrows: false,
    midMeasureLabel: vSym === "V_L" ? "V_L" : "V_C",
    caption: `2개의 교류 전원이 포함된 RLC 회로 — 가운데 ${midKo} 양단 전압 ${vSym}가 0이 되도록 전류원 I_s를 정한다`,
  };
  return { values: v, answer, circuitDiagram, midKo, vSym };
}

/** 결정론 생성 — index/seed로 값 풀에서 고른다. */
export function generateAcSuperpositionNullSource(args: {
  seed?: number; index?: number; mode?: GenerationMode;
}): AcNullSourceGeneration {
  const space = buildSpace();
  const pool = args.mode === "exam_variant" ? space.variant : space.similar;
  const i = args.index ?? ((args.seed ?? 1) - 1);
  return buildNullSourceGeneration(pool[Math.abs(i) % pool.length]);
}

/** 원본 값 — 물리 검증·스모크 전용(생성 풀에는 없다). */
export function __originalNullSource(): AcNullSourceGeneration {
  return buildNullSourceGeneration(ORIGINAL);
}
export function __nullSourceSpace(variant: boolean): AcNullSourceValues[] {
  const s = buildSpace();
  return variant ? s.variant : s.similar;
}

// ── 표기 helper (파이프라인·스모크 공용) ──────────────────────────
export { polarTex, rectTex, elemTex, numFmt };

/**
 * 소자 임피던스의 **합** 표기 — `2Ω + j4Ω − j2Ω`.
 * `elemTex`를 그냥 " + "로 이으면 `+ −j2Ω`가 되어 지저분하다(실측 E2E에서 발견).
 */
export function zSumTex(elems: Elem[]): string {
  return elems
    .map((e, i) => {
      const t = elemTex(e);
      if (i === 0) return t;
      return t.startsWith("−") ? ` − ${t.slice(1)}` : ` + ${t}`;
    })
    .join("");
}

// ── 라우팅 매처 (분류기·감지기가 **공유**한다 — 복제 금지) ────────
export type NullSourceSignals = {
  v: number;
  i: number;
  r: number;
  reactive: number;
  /** 크기가 **미지 기호**인 독립 전류원 수 (`I_s`·`Is[A]` — 학생이 구할 값). */
  unknownI: number;
  /** 크기가 **수치**로 주어진 독립 전압원 수 (`√2∠45°V`). */
  knownV: number;
};

/**
 * 전원 **크기**가 미지(기호)인가 — 각도는 보지 않고 ∠ 앞의 크기만 본다.
 *
 * ★ 각도까지 함께 보면 형제와 구별이 안 된다: `V_s∠0°V`는 각도에 숫자가 있지만 **크기는 미지**다
 *   (임용 5번 `ac_superposition_source_design`은 전압원·전류원 **둘 다** 이 꼴이다).
 *   반대로 `√2∠45°V`·`0.01∠0°A`는 크기가 수치다.
 * ※ 아래첨자 숫자(I₁·V₂)는 이름의 일부이므로 수치로 세지 않는다.
 */
function sourceMagnitudeIsUnknown(value?: string | null): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return true; // 값이 아예 없으면 미지로 본다
  const magnitude = raw.split(/∠|<|\bangle\b/i)[0];
  return !/\d/.test(magnitude.replace(/[₀-₉]/g, ""));
}

/** 인벤토리에서 구조 신호를 센다(리액티브는 값 기준 정규화 — `-j1`을 R로 읽는 회차 대비). */
export function nullSourceSignalsFromInventory(
  inv?: ReadonlyArray<{ type?: string; value?: string }> | null,
): NullSourceSignals | undefined {
  if (!inv || inv.length === 0) return undefined;
  const s: NullSourceSignals = { v: 0, i: 0, r: 0, reactive: 0, unknownI: 0, knownV: 0 };
  for (const c of inv) {
    const t = effectiveComponentType({ type: String(c?.type ?? ""), value: c?.value });
    // 종속전원(2V_c 등)은 전원 개수에서 빼지 않되, **미지 전원**으로는 절대 세지 않는다
    // — 제어식은 학생이 구할 미지수가 아니다(형제 ac_vccs_phasor를 뺏지 않기 위한 선).
    const dependent = isDependentComponent({ type: String(c?.type ?? ""), value: c?.value });
    if (t === "V") {
      s.v++;
      if (!dependent && !sourceMagnitudeIsUnknown(c?.value)) s.knownV++;
    } else if (t === "I") {
      s.i++;
      if (!dependent && sourceMagnitudeIsUnknown(c?.value)) s.unknownI++;
    } else if (t === "R") s.r++;
    else if (t === "L" || t === "C") s.reactive++;
  }
  return s;
}

/**
 * 시그니처 — **교류 페이저 + 전압원과 전류원이 함께 + 리액티브**.
 *  ★ 낱말("두 개의 교류 전원")과 **인벤토리 구조**(V≥1 ∧ I≥1 ∧ 리액티브≥1) 중 하나만 맞아도 통과시킨다.
 *    Vision이 전원 개수를 흘리는 회차가 잦다(실측 2026-08-05: 있지도 않은 "종속 전원"을 지어내기도 했다).
 */
export function matchesNullSourceSignature(text: string, s?: NullSourceSignals): boolean {
  const ac = /교류|정현파|ac\b|페이저|phasor|∠|주파수\s*영역/.test(text);
  const twoSrcText =
    /2\s*개의?\s*(교류\s*)?전원|두\s*개의?\s*(교류\s*)?전원|전원\s*2\s*개|전압원.*전류원|전류원.*전압원/.test(text);
  const twoSrcStruct = !!s && s.v >= 1 && s.i >= 1 && s.reactive >= 1;
  return ac && (twoSrcText || twoSrcStruct);
}

/**
 * 요구 — **어떤 소자 양단 전압이 0이 되는 조건**으로 **전원(전류원/전압원) 값을 역산**한다.
 *  이 "영(null) 조건"이 형제와 갈리는 지점이다(형제는 0이 아닌 목표 페이저 값을 준다).
 */
/**
 * ★★ **미지 전원이 기호로 남는다** — 영(0) 조건까지 흘린 회차의 마지막 판별선 (2026-08-10 실측).
 *
 * 사용자 신고 회차의 요약은 `V_L = 0`을 한 글자도 쓰지 않고
 * *"인덕터 양단의 전압 V_L이 **주어졌을 때** 페이저 전류 I_S를 구한다"* 로만 서술했다
 * (로그: `generic_dispatch_warning` → universal_ac → analog_netlist·내부 id 노출).
 * 그 회차에도 **인벤토리**에는 구조가 그대로 남아 있었다:
 *   전압원 `√2∠45°V`(수치) + 전류원 `Is[A]`(**미지 기호**) + 리액티브 3개.
 * ⇒ CLAUDE.md 1-4-5와 같은 교훈 — 미지 소자를 기호로 들고 있는 유형은 인벤토리가 최후의 신호다.
 *
 * 형제와 갈리는 지점: **미지 전원이 전류원 하나뿐**이라는 것.
 *  · `ac_superposition_source_design`(임용 5번)은 `V_s∠0°`·`I_s∠−90°`로 **둘 다 미지** → knownV=0이라 안 걸린다.
 *  · `ac_thevenin_two_box`·`theveninMaxPower`는 두 전원이 **모두 수치** → unknownI=0.
 *  · `ac_vccs_phasor`의 종속전류원은 제어식(`2V_c`)이라 미지 전원으로 세지 않는다.
 */
export function matchesNullSourceUnknownSource(text: string, s?: NullSourceSignals): boolean {
  if (!s || s.unknownI < 1 || s.knownV < 1 || s.reactive < 1) return false;
  // 리액티브 소자 **양단 전압**이 조건으로 등장하고(=V_L), 그 조건으로 전류(원)를 구한다.
  const elementVoltage = /양단[^.\n]{0,20}전압|v_?l\b|v_?c\b|인덕터[^.\n]{0,10}전압|커패시터[^.\n]{0,10}전압/.test(text);
  const asksCurrent = /(전류원|전류|i_?s)[^.\n]{0,20}(구하|구한|산출|결정|제시|찾)/.test(text);
  return elementVoltage && asksCurrent;
}

export function matchesNullSourceAsk(text: string): boolean {
  const nullCond =
    /(전압|voltage|v_?[lc]|v_l|v_c|v₁|v_ab)[^.\n]{0,40}(0\s*\[?v?\]?|영|zero)\s*(가|이)?\s*(되도록|되는|될\s*때|되게)/.test(text) ||
    /(0\s*\[?v\]?|영전압)\s*(이|가)\s*되도록/.test(text) ||
    /양단[^.\n]{0,20}전압[^.\n]{0,20}0/.test(text) ||
    /v_?l\s*=\s*0|v_?c\s*=\s*0/.test(text);
  // ★ 요구 표현은 넓게 잡는다 — 판별력은 위의 **영(0) 조건**이 이미 갖고 있다.
  //   실측(2026-08-05) 회차는 "…전압이 0이 될 때의 **전류를 구하는** 과정입니다"로만 서술해
  //   "전류원"·"중첩"을 한 번도 쓰지 않았다(전용 항목이 없어 universal_ac로 샜다).
  const askSource =
    /(전류원|전압원|전원|전류|전압)[^.\n]{0,20}(구하|구한|산출|결정|제시|찾)/.test(text) ||
    /i_?s\s*\[?a\]?\s*를?\s*구/.test(text);
  const superposition = /중첩(의)?\s*원리|중첩\s*정리|superposition|개방.*단락|단락.*개방/.test(text);
  return nullCond && (askSource || superposition);
}

/** 형제 양보 — 평균전력·테브난/최대전력·공진·역률·스위치 과도·오실로스코프·Δ-Y. */
export function yieldsNullSourceToSibling(text: string): boolean {
  return (
    /평균\s*전력|평균전력|소비\s*전력|공급하는\s*전력|average\s*power/.test(text) ||
    /테브난|thevenin|노턴|norton|최대\s*전력|등가\s*임피던스/.test(text) ||
    /공진|resonan|대역폭|역률|power\s*factor|어드미턴스/.test(text) ||
    /스위치|switch|t\s*=\s*0|과도\s*응답|시정수/.test(text) ||
    /오실로스코프|oscilloscope|v\/div|µs\/div|us\/div/.test(text) ||
    /델타|delta[\s-]*y|y[\s-]*델타|Δ\s*-\s*y/.test(text)
  );
}
