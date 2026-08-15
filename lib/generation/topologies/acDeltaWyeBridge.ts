import type {
  AcDeltaWyeArm,
  AcDeltaWyeBridgeCircuitDiagram,
  AcDeltaWyeEquivCircuitDiagram,
  GenerationMode,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 교류 브리지 + **Δ-Y(델타-와이) 변환** → 단자 A-B 등가 임피던스 Z → 전류 크기 a
 * (임용 2번 회로이론) — 전용 결정론 archetype. GPT 없음.
 *
 * ── 고정 토폴로지 (원본 그대로) ──────────────────────────────────
 *   단자 A(상) · B(하) 사이에 브리지(다이아몬드) 5-arm:
 *     A—L : 좌상 arm (원본 j2)          A—R : 우상 arm (원본 2Ω)
 *     L—R : 가운데 가교 arm (원본 −j2)
 *     L—B : 좌하 arm (원본 j2)          R—B : 우하 arm (원본 2Ω)
 *   교류 전원 V∠0°가 A–B에 인가되고 전류 I가 흐른다.
 *   (나)는 **상단 델타 (A, L, R)** 를 Y로 변환한 등가 회로 — 좌하·우하 arm은 그대로 남는다.
 *
 * ── 물리 (닫힌형) ────────────────────────────────────────────────
 *   Δ→Y:  Z_A = Z_AL·Z_AR/S,  Z_L = Z_AL·Z_LR/S,  Z_R = Z_AR·Z_LR/S,  S = Z_AL+Z_AR+Z_LR
 *   Z_AB = Z_A + (Z_L + Z_LB) ∥ (Z_R + Z_RB),   I = V/Z_AB
 *
 * ── ★ 값 규칙 (예시 hardcode 금지 — 규칙 열거) ───────────────────
 *   ★ **상단 델타 3소자의 크기를 같게**(jX, X, −jX) 두면 S = X (실수)가 되어
 *     Y 세 팔이 전부 깔끔해진다:  Z_A = jX,  Z_L = X,  Z_R = −jX.
 *   ★ **하단 두 arm의 크기도 같게**(jt, t) 두면 두 가지가 **켤레쌍**이 된다:
 *     (X + jt) 와 (t − jX) →  병렬 = (X+t)/2 + j(t−X)/2
 *   ⇒ **Z_AB = jX + 병렬 = ((X+t)/2)·(1+j) = k√2∠45°**  (k = (X+t)/2)
 *     즉 **위상이 항상 정확히 45°** 라 원본의 `I = a∠−45°` 형식이 그대로 유지된다.
 *     a = |V|/(k√2) = m√2  (m = V/(2k)) — 원본(X=t=2, V=20): k=2 → **a = 5√2**.
 *   ※ 이 규칙은 Δ-Y와 무관한 **노드해석으로 독립 재검산**해 220/220 일치를 확인했다(스모크).
 *
 * ── 모드 ─────────────────────────────────────────────────────────
 *   exam_similar : 원본 배치(좌상 L · 가교 C · 좌하 L) → Z 유도성 → **I = a∠−45°**
 *   exam_variant : **소자 종류 교환**(좌상 C · 가교 L · 좌하 C) → Z 용량성 → **I = a∠+45°**
 *                  (구조·Δ-Y 절차는 완전히 동일, 답이 켤레로 거울)
 */

/**
 * ★ Δ-Y 시그니처 매처 — **분류기(classifyCircuitType)와 감지기(detectAcDeltaWyeBridge)가 공유**한다.
 *   두 곳에 정규식을 복제하면 한쪽만 고쳐져 조용히 드리프트한다(프로젝트에서 반복된 사고).
 *   입력은 **소문자화된** 분석 텍스트.
 *
 *   인정 표기: `Δ-Y` `△-Y` `Y-Δ` / `델타-와이` `와이-델타` / `삼각 결선을 성형으로` /
 *             `delta-to-wye` `wye to delta` `delta-star`
 */
export function matchesDeltaWyeSignature(text: string): boolean {
  return (
    /[δδ△▵]\s*[-–—→]?\s*y|y\s*[-–—→]?\s*[δδ△▵]/i.test(text) ||
    /델타\s*[-–—→]?\s*와이|와이\s*[-–—→]?\s*델타/.test(text) ||
    /(삼각|델타)\s*(결선)?\s*[을를]?\s*[-–—→]?\s*(성형|와이|y\s*결선)/.test(text) ||
    /(성형|와이)\s*(결선)?\s*[을를]?\s*[-–—→]?\s*(삼각|델타)/.test(text) ||
    /delta\s*[-–—\s]*(to[-–—\s]*)?(wye|star|y)\b/i.test(text) ||
    /(wye|star)\s*[-–—\s]*(to[-–—\s]*)?delta\b/i.test(text)
  );
}

/**
 * 교류 문맥 + **임피던스/등가회로 요구**. 분류기·감지기 공용.
 *
 * ★★ 실측(2026-08-04 E2E): 처음엔 `등가\s*임피던스`를 요구했더니, Vision이 같은 원본을
 *   *"특정 임피던스를 구하고"* 로 요약한 회차에서 통째로 미발화해 `ac_parallel_branches`로 샜다.
 *   ⇒ **낱말("등가")이 아니라 "임피던스를 다루는 문제인가"** 로 넓힌다(CLAUDE.md 규칙 2).
 *   Δ-Y 시그니처 자체가 이미 강한 판별자이므로 이 조건은 보조 게이트 역할만 한다.
 */
export function matchesDeltaWyeAsk(text: string): boolean {
  const acCtx = /교류|ac\b|페이저|phasor|∠|임피던스|impedance|rlc/.test(text);
  const impedanceAsk = /임피던스|impedance|등가\s*회로|합성\s*저항/.test(text);
  return acCtx && impedanceAsk;
}

/** 형제 archetype 양보 조건 (최대전력·3상·종속전원). 분류기·감지기 공용. */
export function yieldsDeltaWyeToSibling(text: string): boolean {
  return (
    /최대\s*(평균\s*)?전력|maximum\s*power/.test(text) ||
    /3\s*상|삼상|선간\s*전압|상전압|three[-\s]?phase/.test(text) ||
    /종속\s*전원|종속\s*전압원|종속\s*전류원/.test(text)
  );
}

export type Complex = { re: number; im: number };

const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cPar = (a: Complex, b: Complex): Complex => cDiv(cMul(a, b), cAdd(a, b));
const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);

export const numFmt = (x: number): string =>
  Number.isInteger(x) ? String(x) : String(Number(x.toFixed(3)));

/** 소자 값 라벨: 저항은 "2[Ω]", 리액턴스는 부호에 따라 "j2[Ω]" / "−j2[Ω]". */
export function armLabel(arm: AcDeltaWyeArm): string {
  if (arm.kind === "R") return `${numFmt(arm.mag)}[Ω]`;
  return `${arm.kind === "L" ? "j" : "−j"}${numFmt(arm.mag)}[Ω]`;
}
/** 소자의 복소 임피던스. */
export function armZ(arm: AcDeltaWyeArm): Complex {
  if (arm.kind === "R") return { re: arm.mag, im: 0 };
  return { re: 0, im: arm.kind === "L" ? arm.mag : -arm.mag };
}

export type AcDeltaWyeArms = {
  topLeft: AcDeltaWyeArm;
  topRight: AcDeltaWyeArm;
  bridge: AcDeltaWyeArm;
  botLeft: AcDeltaWyeArm;
  botRight: AcDeltaWyeArm;
};

export type AcDeltaWyeBridgeGeneration = {
  values: {
    X: number;          // 상단 델타 3소자의 공통 크기
    t: number;          // 하단 2 arm의 공통 크기
    V: number;          // 전원 크기 (∠0°)
    inductive: boolean; // true=유사(유도성, I 위상 −45°) / false=변형(용량성, +45°)
    arms: AcDeltaWyeArms;
  };
  answer: {
    Za: Complex; Zl: Complex; Zr: Complex;   // Y 세 팔
    b1: Complex; b2: Complex;                // 두 직렬 가지
    Zpar: Complex;                           // 두 가지의 병렬
    Zab: Complex;                            // 등가 임피던스
    k: number;                               // |Re(Zab)| = |Im(Zab)|
    absZ: number;                            // |Z_AB| = k√2
    m: number;                               // a = m√2
    a: number;                               // 전류 크기 (수치)
    iPhase: number;                          // 전류 위상 (−45 / +45)
  };
  bridgeDiagram: AcDeltaWyeBridgeCircuitDiagram;  // (가)
  equivDiagram: AcDeltaWyeEquivCircuitDiagram;    // (나)
};

/**
 * 임의의 5-arm 브리지에 대해 Δ-Y 변환으로 Z_AB를 푼다 (범용 — 값 가정 없음).
 * 상단 델타 = (A, L, R) = {topLeft, topRight, bridge}.
 */
export function solveDeltaWye(arms: AcDeltaWyeArms, V: number) {
  const Zal = armZ(arms.topLeft);
  const Zar = armZ(arms.topRight);
  const Zlr = armZ(arms.bridge);
  const S = cAdd(cAdd(Zal, Zar), Zlr);
  const Za = cDiv(cMul(Zal, Zar), S);
  const Zl = cDiv(cMul(Zal, Zlr), S);
  const Zr = cDiv(cMul(Zar, Zlr), S);
  const b1 = cAdd(Zl, armZ(arms.botLeft));
  const b2 = cAdd(Zr, armZ(arms.botRight));
  const Zpar = cPar(b1, b2);
  const Zab = cAdd(Za, Zpar);
  const absZ = cAbs(Zab);
  const a = V / absZ;
  const iPhase = -(Math.atan2(Zab.im, Zab.re) * 180) / Math.PI;
  return { S, Za, Zl, Zr, b1, b2, Zpar, Zab, absZ, a, iPhase };
}

function build(X: number, t: number, V: number, inductive: boolean): AcDeltaWyeBridgeGeneration {
  // 유사 = 좌상 L · 가교 C · 좌하 L / 변형 = 그 반대(소자 종류 교환). 저항 2개는 그대로.
  const upKind: AcDeltaWyeArm["kind"] = inductive ? "L" : "C";
  const brKind: AcDeltaWyeArm["kind"] = inductive ? "C" : "L";
  const arms: AcDeltaWyeArms = {
    topLeft: { kind: upKind, mag: X },
    topRight: { kind: "R", mag: X },
    bridge: { kind: brKind, mag: X },
    botLeft: { kind: upKind, mag: t },
    botRight: { kind: "R", mag: t },
  };
  const r = solveDeltaWye(arms, V);
  const k = (X + t) / 2;
  const m = V / (2 * k);

  const bridgeDiagram: AcDeltaWyeBridgeCircuitDiagram = {
    vLabel: `V=${numFmt(V)}∠0°[V]`,
    iLabel: "I[A]",
    arms: {
      topLeft: { ...arms.topLeft, label: armLabel(arms.topLeft) },
      topRight: { ...arms.topRight, label: armLabel(arms.topRight) },
      bridge: { ...arms.bridge, label: armLabel(arms.bridge) },
      botLeft: { ...arms.botLeft, label: armLabel(arms.botLeft) },
      botRight: { ...arms.botRight, label: armLabel(arms.botRight) },
    },
    boxLabel: "Z[Ω]",
  };
  const equivDiagram: AcDeltaWyeEquivCircuitDiagram = {
    vLabel: `V=${numFmt(V)}∠0°[V]`,
    iLabel: `I=a∠${r.iPhase > 0 ? "" : "−"}45°[A]`,
    boxLabel: "Δ-Y 변환",
    botLeft: { ...arms.botLeft, label: armLabel(arms.botLeft) },
    botRight: { ...arms.botRight, label: armLabel(arms.botRight) },
  };

  return {
    values: { X, t, V, inductive, arms },
    answer: {
      Za: r.Za, Zl: r.Zl, Zr: r.Zr, b1: r.b1, b2: r.b2, Zpar: r.Zpar, Zab: r.Zab,
      k, absZ: r.absZ, m, a: r.a, iPhase: Math.round(r.iPhase),
    },
    bridgeDiagram,
    equivDiagram,
  };
}

// ── 값 공간 (규칙 열거 + 필터) ─────────────────────────────────────
// ★★ 소자 값·k·m을 **전부 정수**로 강제한다 (실측 E2E 사고):
//   k=(X+t)/2가 반정수(2.5)면 route의 **전역 분수 변환기**(CLAUDE.md 1-4-3)가 풀이 안의 소수를
//   제각각 바꿔 `Z = 5/2 + j2.5`, `|Z|² = 5/2² + 5/2²`, 모호한 `5/2√2` 같은 지저분한 표기가 나왔다.
//   ⇒ **X·t 정수 + X+t 짝수**로 두면 문항 전체에 소수가 한 개도 없어 변환기가 개입할 여지가 사라진다.
const X_CHOICES = [1, 2, 3, 4, 5, 6];
const T_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10];
const V_CHOICES = [10, 12, 15, 16, 18, 20, 24, 25, 28, 30, 36, 40, 45, 50, 60];

type Tuple = { X: number; t: number; V: number };

function buildSpace(): Tuple[] {
  const out: Tuple[] = [];
  for (const X of X_CHOICES)
    for (const t of T_CHOICES) {
      if ((X + t) % 2 !== 0) continue;      // k 정수 → 답·풀이에 소수가 없다
      const k = (X + t) / 2;
      for (const V of V_CHOICES) {
        const m = V / (2 * k);
        if (!Number.isInteger(m) || m < 2 || m > 12) continue;  // a = m√2, m 정수
        if (X === 2 && t === 2 && V === 20) continue;           // ★ 원본 튜플 제외
        out.push({ X, t, V });
      }
    }
  return out;
}
const SPACE = buildSpace();

/** 유사·변형이 서로 다른 수치를 쓰도록 풀을 절반씩 나눈다. */
function sliceFor(mode: GenerationMode): Tuple[] {
  const half = Math.floor(SPACE.length / 2);
  const s = mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return s.length > 0 ? s : SPACE;
}

export function generateAcDeltaWyeBridge(args: {
  seed?: number;
  mode: GenerationMode;
}): AcDeltaWyeBridgeGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const c = pick(sliceFor(args.mode), rand);
  return build(c.X, c.t, c.V, args.mode !== "exam_variant");
}

/** 원본(생성 풀 제외 튜플) — 물리 검증 전용. */
export function __originalDeltaWyeForVerify(): AcDeltaWyeBridgeGeneration {
  return build(2, 2, 20, true);
}
/** 스모크 전용 — 값 공간 노출. */
export function __deltaWyeSpace(): Tuple[] {
  return SPACE.slice();
}
