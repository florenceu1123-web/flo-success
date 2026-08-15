import type { AcTwoSourceMeshCircuitDiagram, GenerationMode } from "@/types";
import { effectiveComponentType } from "@/lib/analysis/reactiveValue";
import { makeRand, pick } from "./_helpers";

/**
 * 두 개의 교류 전원이 포함된 RLC 회로 → **메시 해석으로 페이저 전류 I₁·I₂** → 평균 전력
 * (임용 5번 회로이론) — 전용 결정론 archetype. GPT 없음.
 *
 * ── 고정 토폴로지 (원본 그대로) ──────────────────────────────────
 *   직사각 2-메시.  좌측 세로 = 전원 v₁,  우측 세로 = 전원 v₂ (둘 다 + 위).
 *     상단 좌: e_a (원본 R₁ 1Ω, 전류 I₁ →)      상단 우: e_c (원본 C₂ −j2Ω, 전류 I₂ →)
 *     가운데 세로: R₂ (원본 1Ω)
 *     하단 좌: e_b (원본 C₁ −j1Ω)               하단 우: e_d (원본 L j3Ω)
 *   I₁ = 좌 메시 전류(시계), I₂ = 우 메시 전류(시계) → R₂에는 **I₁ − I₂** 가 흐른다.
 *
 * ── 물리 (닫힌형, 복소 2×2) ──────────────────────────────────────
 *   Z₁ = e_a + R₂ + e_b,  Z₂ = R₂ + e_c + e_d,  결합항 = −R₂
 *     [ Z₁  −R₂ ] [I₁]   [V₁]
 *     [ −R₂  Z₂ ] [I₂] = [V₂]
 *   **P_R2 = ½|I₁ − I₂|²·R₂**,  **P_v1 = ½·Re(V₁·I₁*)**  (진폭 페이저 기준)
 *   원본(1Ω·1Ω·−j1·−j2·j3, V₁=√8∠45°·V₂=2∠180°) →
 *     **I₁ = I₂ = 2∠90°[A]** → R₂ 전류 0 → **P_R2 = 0[W]**, **P_v1 = 2[W]**
 *     (검산: R₁ 소비 ½·2²·1 = 2W = 전원 공급 합 ✓ — v₂는 0W를 공급한다.)
 *   ★ 원본이 I₁ = I₂가 되도록 설계돼 [단계 2]의 "R₂ 소비 전력 = 0"이 교육 포인트다.
 *     다만 **생성 문제까지 항상 0이면 답이 노출**되므로, 값 규칙은 0인 경우와 아닌 경우를 모두 낸다.
 *
 * ── ★ 값은 역설계로 열거한다 (예시 hardcode 금지) ────────────────
 *   전원을 먼저 고르면 전류가 지저분해진다. 반대로 **깨끗한 전류 I₁·I₂를 먼저 고르고
 *   위 식으로 V₁·V₂를 역산**한 뒤, 전원이 "가우스 정수 + 깨끗한 극형식"(√8∠45°·2∠180° 같은)
 *   인 조합만 채택한다. 그러면 전류·전력이 자동으로 깔끔하다.
 *
 * ── 모드 ─────────────────────────────────────────────────────────
 *   exam_similar : 원본 배치(상단우 C · 하단좌 C · 하단우 L)
 *   exam_variant : **리액티브 소자 종류 교환**(상단우 L · 하단좌 L · 하단우 C) — 구조·절차 동일
 */

export type Cx = { re: number; im: number };
const cx = (re: number, im = 0): Cx => ({ re, im });
const add = (a: Cx, b: Cx): Cx => cx(a.re + b.re, a.im + b.im);
const sub = (a: Cx, b: Cx): Cx => cx(a.re - b.re, a.im - b.im);
const mul = (a: Cx, b: Cx): Cx => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const conj = (a: Cx): Cx => cx(a.re, -a.im);
const absCx = (a: Cx): number => Math.hypot(a.re, a.im);
const argDeg = (a: Cx): number => (Math.atan2(a.im, a.re) * 180) / Math.PI;

/** 수치 표기 — 음수의 하이픈을 **유니코드 마이너스(−)** 로 통일한다(문항 내 표기 일관성). */
export const numFmt = (x: number): string =>
  (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(4)))).replace("-", "−");

/**
 * 크기 표기 — 완전제곱이면 정수, 아니면 √n (원본의 `√8` 형식).
 * ★ |z|²가 정수가 아니면 √n 표기가 **틀린 값**이 된다(실측 2026-08-05: |I_s|=1.5인데 `√2`로 찍혔다).
 *   그럴 땐 반올림하지 말고 소수 그대로 돌려준다 — 값 공간이 정수 격자면 이 분기는 타지 않는다.
 */
export function magTex(z: Cx): string {
  const sq = z.re * z.re + z.im * z.im;
  const n = Math.round(sq);
  if (Math.abs(sq - n) > 1e-9) return numFmt(Math.round(Math.sqrt(sq) * 1e4) / 1e4);
  const s = Math.sqrt(n);
  return Number.isInteger(s) ? String(s) : `√${n}`;
}
/**
 * 극형식 표기 (크기∠각도°). ★ 음수 각도도 **유니코드 마이너스**로 통일한다(문항 내 표기 일관성).
 * ★ −180°는 관례대로 **+180°** 로 적는다(−0 허수부 때문에 atan2가 −π를 주는 경우가 있다).
 */
export function polarTex(z: Cx): string {
  if (z.re === 0 && z.im === 0) return "0";
  const deg = Math.round(argDeg(z));
  return `${magTex(z)}∠${numFmt(deg === -180 ? 180 : deg)}°`;
}
/** 직교 표기 (a±jb). */
export function rectTex(z: Cx): string {
  const re = Math.round(z.re * 1e6) / 1e6, im = Math.round(z.im * 1e6) / 1e6;
  const jm = (x: number) => (Math.abs(x) === 1 ? "j" : `j${numFmt(Math.abs(x))}`);
  if (im === 0) return numFmt(re);
  if (re === 0) return `${im < 0 ? "−" : ""}${jm(im)}`;
  return `${numFmt(re)} ${im < 0 ? "−" : "+"} ${jm(im)}`;
}
/** 소자 임피던스 표기 — 저항 "1Ω" / 리액턴스 "−j2Ω"·"j3Ω". */
export function elemTex(e: Elem): string {
  if (e.kind === "R") return `${numFmt(e.mag)}Ω`;
  return `${e.kind === "L" ? "j" : "−j"}${numFmt(e.mag)}Ω`;
}
export type Elem = { kind: "R" | "L" | "C"; mag: number };
export const elemZ = (e: Elem): Cx =>
  e.kind === "R" ? cx(e.mag, 0) : cx(0, e.kind === "L" ? e.mag : -e.mag);

export type MeshArms = {
  topLeft: Elem;    // 원본 R₁ (I₁이 흐르는 저항)
  mid: Elem;        // 원본 R₂ (평균전력을 묻는 저항)
  topRight: Elem;   // 원본 C₂
  botLeft: Elem;    // 원본 C₁
  botRight: Elem;   // 원본 L (I₂가 흐르는 인덕터)
};

export type AcTwoSourceMeshValues = {
  capacitiveVariant: boolean;   // false=유사(원본 배치) / true=변형(소자 종류 교환)
  arms: MeshArms;
  V1: Cx;
  V2: Cx;
};
export type AcTwoSourceMeshAnswer = {
  I1: Cx; I2: Cx; IR2: Cx;
  P_R2: number;      // ½|I₁−I₂|²R₂
  P_v1: number;      // ½Re(V₁ I₁*)
  P_v2: number;      // ½Re(V₂ I₂*) — 검산용
  P_ra: number;      // 상단 좌 저항 소비 (검산용)
  Z1: Cx; Z2: Cx;
};

/** 메시 방정식을 풀어 I₁·I₂와 전력을 구한다 (범용 — 값 가정 없음). */
export function solveMesh(v: AcTwoSourceMeshValues): AcTwoSourceMeshAnswer {
  const a = v.arms;
  const Rm = elemZ(a.mid);
  const Z1 = add(add(elemZ(a.topLeft), Rm), elemZ(a.botLeft));
  const Z2 = add(add(Rm, elemZ(a.topRight)), elemZ(a.botRight));
  const off = cx(-Rm.re, -Rm.im);
  const det = sub(mul(Z1, Z2), mul(off, off));
  const I1 = div(sub(mul(v.V1, Z2), mul(off, v.V2)), det);
  const I2 = div(sub(mul(Z1, v.V2), mul(v.V1, off)), det);
  const IR2 = sub(I1, I2);
  const P_R2 = 0.5 * absCx(IR2) ** 2 * a.mid.mag;
  const P_v1 = 0.5 * mul(v.V1, conj(I1)).re;
  const P_v2 = 0.5 * mul(v.V2, conj(I2)).re;
  const P_ra = a.topLeft.kind === "R" ? 0.5 * absCx(I1) ** 2 * a.topLeft.mag : 0;
  return { I1, I2, IR2, P_R2, P_v1, P_v2, P_ra, Z1, Z2 };
}

/** ★ 역설계 — 전류를 정하고 전원을 구한다. */
function sourcesFor(arms: MeshArms, I1: Cx, I2: Cx): { V1: Cx; V2: Cx } {
  const Rm = elemZ(arms.mid);
  const Z1 = add(add(elemZ(arms.topLeft), Rm), elemZ(arms.botLeft));
  const Z2 = add(add(Rm, elemZ(arms.topRight)), elemZ(arms.botRight));
  return {
    V1: sub(mul(I1, Z1), mul(I2, Rm)),
    V2: sub(mul(I2, Z2), mul(I1, Rm)),
  };
}

// ── 값 공간 (규칙 열거 + 필터) ─────────────────────────────────────
const R_CHOICES = [1, 2, 3];
const X_CHOICES = [1, 2, 3, 4];
/** 깨끗한 페이저 전류 후보 — 가우스 정수 + 극형식이 45° 배수. */
const I_CHOICES: Cx[] = [
  cx(0, 2), cx(0, -2), cx(2, 0), cx(-2, 0), cx(0, 1), cx(1, 0),
  cx(1, 1), cx(-1, 1), cx(1, -1), cx(2, 2), cx(2, -2), cx(-2, 2),
];
const isInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
/** 가우스 정수이고 극형식이 깨끗(순실수·순허수·|re|=|im|)한가 — 원본 √8∠45°·2∠180° 형식. */
function cleanPhasor(z: Cx): boolean {
  if (!isInt(z.re) || !isInt(z.im)) return false;
  const re = Math.round(z.re), im = Math.round(z.im);
  if (re === 0 && im === 0) return false;
  if (Math.hypot(re, im) > 12) return false;
  return re === 0 || im === 0 || Math.abs(re) === Math.abs(im);
}
const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;

function buildArms(ra: number, rm: number, xTop: number, xBotL: number, xBotR: number, variant: boolean): MeshArms {
  // 유사: 상단우 C · 하단좌 C · 하단우 L / 변형: 종류 교환(L · L · C)
  const up: Elem["kind"] = variant ? "L" : "C";
  const down: Elem["kind"] = variant ? "C" : "L";
  return {
    topLeft: { kind: "R", mag: ra },
    mid: { kind: "R", mag: rm },
    topRight: { kind: up, mag: xTop },
    botLeft: { kind: up, mag: xBotL },
    botRight: { kind: down, mag: xBotR },
  };
}

function buildSpace(variant: boolean): AcTwoSourceMeshValues[] {
  const out: AcTwoSourceMeshValues[] = [];
  for (const ra of R_CHOICES)
    for (const rm of R_CHOICES)
      for (const xTop of X_CHOICES)
        for (const xBotL of X_CHOICES)
          for (const xBotR of X_CHOICES) {
            const arms = buildArms(ra, rm, xTop, xBotL, xBotR, variant);
            for (const I1 of I_CHOICES)
              for (const I2 of I_CHOICES) {
                const { V1, V2 } = sourcesFor(arms, I1, I2);
                if (!cleanPhasor(V1) || !cleanPhasor(V2)) continue;
                const v: AcTwoSourceMeshValues = { capacitiveVariant: variant, arms, V1, V2 };
                const a = solveMesh(v);
                // 역산 검증 — 되풀이해 풀었을 때 원래 전류가 나오는가
                if (absCx(sub(a.I1, I1)) > 1e-9 || absCx(sub(a.I2, I2)) > 1e-9) continue;
                if (!isHalf(a.P_R2) || !isHalf(a.P_v1)) continue;
                if (a.P_v1 <= 0 || a.P_v1 > 40) continue;          // v₁이 공급(양수)하는 경우만
                if (a.P_R2 > 30) continue;
                // ★ 원본 튜플 제외 (1Ω·1Ω·−j2·−j1·j3, V₁=2+j2·V₂=−2)
                if (!variant && ra === 1 && rm === 1 && xTop === 2 && xBotL === 1 && xBotR === 3 &&
                    V1.re === 2 && V1.im === 2 && V2.re === -2 && V2.im === 0) continue;
                out.push(v);
              }
          }
  return out;
}
const SPACE_S = buildSpace(false);
const SPACE_V = buildSpace(true);

export type AcTwoSourceMeshGeneration = {
  values: AcTwoSourceMeshValues;
  answer: AcTwoSourceMeshAnswer;
  circuit: AcTwoSourceMeshCircuitDiagram;
};

export function buildGeneration(v: AcTwoSourceMeshValues): AcTwoSourceMeshGeneration {
  const answer = solveMesh(v);
  const circuit: AcTwoSourceMeshCircuitDiagram = {
    v1Label: `V₁ ${polarTex(v.V1)}`,
    v2Label: `V₂ ${polarTex(v.V2)}`,
    topLeft: { kind: v.arms.topLeft.kind, label: elemTex(v.arms.topLeft), name: "R₁" },
    mid: { kind: v.arms.mid.kind, label: elemTex(v.arms.mid), name: "R₂" },
    topRight: { kind: v.arms.topRight.kind, label: elemTex(v.arms.topRight), name: v.capacitiveVariant ? "L₂" : "C₂" },
    botLeft: { kind: v.arms.botLeft.kind, label: elemTex(v.arms.botLeft), name: v.capacitiveVariant ? "L₁" : "C₁" },
    botRight: { kind: v.arms.botRight.kind, label: elemTex(v.arms.botRight), name: v.capacitiveVariant ? "C₃" : "L" },
    i1Label: "I₁",
    i2Label: "I₂",
  };
  return { values: v, answer, circuit };
}

export function generateAcTwoSourceMeshPower(args: {
  seed?: number;
  mode: GenerationMode;
}): AcTwoSourceMeshGeneration {
  const variant = args.mode === "exam_variant";
  const space = variant ? SPACE_V : SPACE_S;
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  return buildGeneration(pick(space, rand));
}

/** 원본(생성 풀 제외 튜플) — 물리 검증 전용. */
export function __originalMeshForVerify(): AcTwoSourceMeshGeneration {
  return buildGeneration({
    capacitiveVariant: false,
    arms: buildArms(1, 1, 2, 1, 3, false),
    V1: cx(2, 2),      // √8∠45°
    V2: cx(-2, 0),     // 2∠180°
  });
}
/** 스모크 전용 — 값 공간 노출. */
export function __meshSpace(variant: boolean): AcTwoSourceMeshValues[] {
  return (variant ? SPACE_V : SPACE_S).slice();
}

/** 인벤토리에서 뽑은 **구조 신호** — 텍스트가 흔들려도 남는 최후의 판별선. */
export type MeshStructSignals = { v: number; i: number; r: number; reactive: number };

/** 인벤토리 → 구조 신호. 값 기반 정규화(`effectiveComponentType`)를 거쳐 센다. */
export function meshSignalsFromInventory(
  inv?: ReadonlyArray<{ type?: string; value?: string }> | null,
): MeshStructSignals {
  const s: MeshStructSignals = { v: 0, i: 0, r: 0, reactive: 0 };
  for (const item of inv ?? []) {
    const t = effectiveComponentType({ type: String(item?.type ?? ""), value: item?.value });
    if (t === "V") s.v++;
    else if (t === "I") s.i++;
    else if (t === "R") s.r++;
    else if (t === "C" || t === "L") s.reactive++;
  }
  return s;
}

/**
 * ★ 2전원 메시 + 평균전력 시그니처 — **분류기와 감지기가 공유**한다(복제 금지).
 *   `text`는 소문자화된 분석 텍스트, `s`는 인벤토리 구조 신호(선택).
 *
 * ★★ **낱말만으로 걸지 마라 (실측 2026-08-04, 사용자 신고)**: Vision이 같은 원본을
 *   *"각 **전압원과 전류원의** 페이저를 구하고 … 회로의 **전력 소모**를 단계별로 계산"* 으로 요약한
 *   회차가 있었다 — "두 개의 교류 전원"도 "평균 전력"도 없고, 전류원이 없는데 **있다고 잘못 썼다**.
 *   그 회차에서 텍스트 조건이 통째로 미발화해 `universal_ac`로 샜다(로그의 `dispatch_warning`).
 *   ⇒ 전원 개수는 **인벤토리 구조 신호**(V 2개·I 0개·R 2개·리액티브 2개)로도 인정하고,
 *     전력 표현도 "전력 소모/소비/계산"까지 넓힌다(CLAUDE.md 규칙 2).
 */
export function matchesTwoSourceMeshSignature(text: string, s?: MeshStructSignals): boolean {
  const ac = /교류|정현파|ac\b|페이저|phasor|∠/.test(text);
  const twoSrcText =
    /두\s*개의?\s*(교류\s*)?전원|전원\s*2개|2개의?\s*전원|v_?1.*v_?2|v₁.*v₂|두\s*전원/.test(text);
  // ★ 구조 신호 — 전원 2개 + **전류원 0개**(형제 ac_superposition·two_box는 전류원을 갖는다) + R·리액티브 2개 이상
  const twoSrcStruct = !!s && s.v >= 2 && s.i === 0 && s.r >= 2 && s.reactive >= 2;
  const avgP =
    /평균\s*전력|평균전력|소비되는\s*전력|공급하는\s*전력|average\s*power/.test(text) ||
    /전력\s*소모|전력\s*소비|전력을?\s*계산|전력\s*계산|전력을?\s*구/.test(text);
  return ac && (twoSrcText || twoSrcStruct) && avgP;
}
/** 요구: 페이저 전류(I₁·I₂)·메시 해석, 또는 전류를 구한다는 서술. 분류기·감지기 공용. */
export function matchesTwoSourceMeshAsk(text: string): boolean {
  return /페이저\s*전류|메시|mesh|망\s*해석|i_?1|i₁|전류\s*i|전류/.test(text);
}
/** 형제 양보 — 중첩·테브난·최대전력·공진·역률·전원 크기 역산·종속전원·스위치 과도·직류 혼합. */
export function yieldsTwoSourceMeshToSibling(text: string): boolean {
  return (
    /중첩(의)?\s*원리|superposition/.test(text) ||
    /테브난|thevenin|노턴|norton|최대\s*전력|최대전력/.test(text) ||
    /공진|resonance|역률|어드미턴스|대역폭/.test(text) ||
    /전원의?\s*크기를?\s*구|전원\s*크기\s*역산/.test(text) ||
    /종속\s*전원|종속\s*전압원|종속\s*전류원/.test(text) ||
    /스위치|switch|t\s*=\s*0|과도\s*응답|시정수/.test(text) ||
    // ★ 직류가 섞이면 AC+DC 중첩 형제(acDcSuperposition·_Rc)의 영역이다 — 그쪽도 전원이 2개다.
    /직류|dc\b/.test(text) ||
    /오실로스코프|v\s*\/\s*div/.test(text)
  );
}
