import type {
  AcTheveninDepCircuitDiagram,
  AcTheveninDepEquivCircuitDiagram,
  GenerationMode,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 독립 전류원 + ★종속전원★ 포함 페이저 회로 → 테브난 등가(단락전류법) + 복소 켤레 최대평균전력
 * (임용 6번 회로이론) — 전용 archetype. GPT 없음(닫힌형).
 *
 *  (가) 고정 토폴로지 — 마디 1·2, 하단 rail = 단자 B:
 *      독립 전류원 I_s∠0°(↑) ∥ 션트 Z₁  ─── [상단 직렬 ★종속 전압원 k·I₂★] ─── 마디 2 ∥ 션트 Z₂(전류 I₂↓) ── 단자 A
 *      (원본: I_s=√2∠0°[A rms], Z₁=j1Ω(L), k=½Ω, Z₂=−j½Ω(C).)
 *  (나) 테브난 등가: V_AB 직렬 Z_AB → 단자 A·B → 부하 Z_L = R + jX.
 *
 * ★ 물리(닫힌형):
 *    I₂ = V₂/Z₂,  V₁ = V₂ + k·I₂  (종속 전압원, + 극성이 마디 1 쪽)
 *    마디 1 KCL(A 개방 → 상단 가지 전류 = I₂): I_s = V₁/Z₁ + I₂
 *      ⇒ I₂ = I_s·Z₁/(Z₁+Z₂+k),  **V_AB = V₂ = I_s·Z₁Z₂/(Z₁+Z₂+k)**
 *    ★ A–B 단락: V₂=0 ⇒ I₂=0 ⇒ 종속원=0 ⇒ V₁=0 ⇒ Z₁ 전류 0 ⇒ **I_AB = I_s** (독립 전원값 그대로!)
 *      ⇒ **Z_AB = V_AB/I_AB = Z₁Z₂/(Z₁+Z₂+k)**  (종속전원이 있어 전원 무효화법을 못 쓰고 단락전류법을 쓴다)
 *    켤레 정합: Z_L = Z_AB* = R + jX,  P_L(max) = |V_AB|²/(4·R_AB)  (실효값 페이저)
 *  원본 검산: Z₁Z₂ = (j1)(−j½) = ½, Z₁+Z₂+k = ½+j½ → **Z_AB = ½ − j½**, **V_AB = 1∠−45°V**,
 *            **Z_L = ½ + j½**, **P_L = 1²/(4·½) = 0.5W**.
 *
 * ★ 왜 전용 archetype인가:
 *   · 종속전원은 generic universal_ac·topology-driven이 떨어뜨려 회로가 깨진다.
 *   · 형제 `ac_thevenin_ladder`(단일 전압원 사다리, 전원 무효화로 Z_TH)·`ac_bridge_max_power`(브리지, 순저항 R_L)·
 *     2전원 `theveninMaxPower`(순저항 R_L)는 **단락전류법**도 **종속전원**도 재현하지 못한다.
 *   · 실측: 이 원본이 `switched_rl_dep_i_pipeline`(직류 스위치 RL 과도)으로 가로채여 전혀 다른 문제가 생성됐다.
 *
 * ★ 값은 예시 hardcode가 아니라 ★규칙 열거+깔끔 필터★ — 원본 튜플 제외.
 */

// ── 복소수 ──
type Cx = { re: number; im: number };
const cx = {
  add: (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im }),
  mul: (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a: Cx, b: Cx): Cx => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  conj: (a: Cx): Cx => ({ re: a.re, im: -a.im }),
  abs: (a: Cx): number => Math.hypot(a.re, a.im),
};

type Elem = "L" | "C";
/** 소자 종류+리액턴스 크기 → 임피던스. L: +jX, C: −jX. */
function imp(kind: Elem, mag: number): Cx {
  return kind === "L" ? { re: 0, im: mag } : { re: 0, im: -mag };
}
function r1(x: number): number { return Math.round(x * 10) / 10; }
function r3(x: number): number { return Math.round(x * 1000) / 1000; }
/** 0.5 → "½", 1 → "1", 1.5 → "1.5" (분수 표기는 ½만 특별 취급 — 원본 표기와 동일). */
function magText(x: number): string {
  return x === 0.5 ? "½" : String(r1(x));
}
/** 소자 라벨 — L: "jXΩ", C: "−jXΩ". 크기 1이면 "j"만. */
function impLabel(kind: Elem, mag: number): string {
  const body = mag === 1 ? "" : magText(mag);
  return `${kind === "C" ? "−" : ""}j${body}Ω`;
}
/** 복소 임피던스 라벨 "R − jX Ω". */
function zLabel(z: Cx): string {
  const re = r1(z.re), im = r1(z.im);
  if (Math.abs(im) < 1e-9) return `${re} Ω`;
  if (Math.abs(re) < 1e-9) return `${im < 0 ? "−" : ""}j${Math.abs(im)} Ω`;
  return `${re} ${im < 0 ? "−" : "+"} j${Math.abs(im)} Ω`;
}
/** 페이저 라벨 "M∠θ° 단위". */
function phasorLabel(z: Cx, unit: string): string {
  const mag = r3(cx.abs(z));
  const deg = r1((Math.atan2(z.im, z.re) * 180) / Math.PI);
  return `${mag}∠${deg}° ${unit}`;
}
/** 독립 전류원 라벨 — s√2 형태(원본 표기 √2∠0°)를 유지. */
function isrcLabel(s: number): string {
  return `${s === 1 ? "" : s}√2∠0°A`;
}

export type AcTheveninDependentGeneration = {
  values: {
    s: number;          // 독립 전류원 크기 = s√2 [A rms]
    Is: number;         // = s·√2 (수치)
    isrcLabel: string;
    z1Type: Elem; z1Mag: number; z1Label: string;
    z2Type: Elem; z2Mag: number; z2Label: string;
    k: number; kLabel: string;   // 종속 전압원 계수 [Ω]
    ctrlLabel: string;           // 제어 전류 기호
  };
  answer: {
    Vth: Cx; VthLabel: string; VthMag: number;
    Zth: Cx; ZthLabel: string; Rth: number; Xth: number;
    Isc: number; IscLabel: string;
    ZL: Cx; ZLLabel: string; RL: number; XL: number;
    Pmax: number; PmaxLabel: string;
  };
  circuitDiagram: AcTheveninDepCircuitDiagram;   // (가)
  equivDiagram: AcTheveninDepEquivCircuitDiagram; // (나)
};

/** family: 전원 크기 s(√2 배수) + 션트 1·2 소자와 리액턴스 + 종속전원 계수 k[Ω]. */
type Family = { s: number; z1: Elem; X1: number; z2: Elem; X2: number; k: number };

// 원본 튜플 (참조·검증 전용, 생성 풀 제외): I=√2∠0°, Z₁=j1(L), k=½, Z₂=−j½(C).
const ORIGINAL: Family = { s: 1, z1: "L", X1: 1, z2: "C", X2: 0.5, k: 0.5 };

const CTRL = "I₂";

function solve(f: Family): AcTheveninDependentGeneration {
  const Z1 = imp(f.z1, f.X1);
  const Z2 = imp(f.z2, f.X2);
  const K: Cx = { re: f.k, im: 0 };
  const Is = f.s * Math.SQRT2;

  // Z_AB = Z₁Z₂/(Z₁+Z₂+k),  I_AB(단락) = I_s,  V_AB = I_s·Z_AB
  const Zth = cx.div(cx.mul(Z1, Z2), cx.add(cx.add(Z1, Z2), K));
  const Vth = cx.mul({ re: Is, im: 0 }, Zth);
  const ZL = cx.conj(Zth);
  const VthMag = cx.abs(Vth);
  const Pmax = (VthMag * VthMag) / (4 * Zth.re);

  const circuitDiagram: AcTheveninDepCircuitDiagram = {
    isrcLabel: `I_rms=${isrcLabel(f.s)}`,
    z1Type: f.z1, z1Label: impLabel(f.z1, f.X1),
    depLabel: `${magText(f.k)} ${CTRL}`,
    z2Type: f.z2, z2Label: impLabel(f.z2, f.X2),
    currentLabel: CTRL,
  };
  const equivDiagram: AcTheveninDepEquivCircuitDiagram = {
    vthLabel: "V_AB", zthLabel: "Z_AB", loadLabel: "Z_L[Ω]", rLabel: "R", xLabel: "jX",
  };

  return {
    values: {
      s: f.s, Is: r3(Is), isrcLabel: circuitDiagram.isrcLabel,
      z1Type: f.z1, z1Mag: f.X1, z1Label: circuitDiagram.z1Label,
      z2Type: f.z2, z2Mag: f.X2, z2Label: circuitDiagram.z2Label,
      k: f.k, kLabel: `${magText(f.k)}Ω`, ctrlLabel: CTRL,
    },
    answer: {
      Vth: { re: r3(Vth.re), im: r3(Vth.im) }, VthLabel: phasorLabel(Vth, "V"), VthMag: r3(VthMag),
      Zth: { re: r3(Zth.re), im: r3(Zth.im) }, ZthLabel: zLabel(Zth), Rth: r3(Zth.re), Xth: r3(Zth.im),
      Isc: r3(Is), IscLabel: `${isrcLabel(f.s)}`,
      ZL: { re: r3(ZL.re), im: r3(ZL.im) }, ZLLabel: zLabel(ZL), RL: r3(ZL.re), XL: r3(ZL.im),
      Pmax: r3(Pmax), PmaxLabel: `${r3(Pmax)} W`,
    },
    circuitDiagram, equivDiagram,
  };
}

/**
 * 규칙 열거 + 깔끔 필터 (특정 예시 hardcode 금지).
 *   exam_similar: 션트1 = L(유도성) · 션트2 = C(용량성) — 원본 토폴로지, Z_AB 용량성(R − jX).
 *   exam_variant: ★리액티브 소자 종류 교환★ (션트1 = C · 션트2 = L) — 구조·절차 동일, Z_AB 유도성(R + jX)
 *                 → 부하 Z_L이 용량성이 되어 답이 거울 대칭.
 *   필터: |Z_AB| 실·허부가 0.5 배수이고 크기가 같음(∠∓45° — 깔끔한 각도),
 *         |V_AB| 정수, P_max 0.5 배수, 범위 제한. 원본 튜플 제외.
 */
function buildSpace(mode: GenerationMode): Family[] {
  const k1: Elem = mode === "exam_variant" ? "C" : "L"; // 마디 1 션트
  const k2: Elem = mode === "exam_variant" ? "L" : "C"; // 마디 2 션트
  const half = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  const out: Family[] = [];
  for (const X1 of half)
    for (const X2 of half) {
      if (X1 <= X2) continue;              // 원본과 같은 대소 관계(X1 > X2)
      for (const k of half)
        for (let s = 1; s <= 3; s++) {
          const f: Family = { s, z1: k1, X1, z2: k2, X2, k };
          const a = solve(f).answer;
          const R = a.Rth, X = a.Xth;
          if (R <= 0) continue;
          if (Math.abs(Math.abs(X) - R) > 1e-9) continue;         // ∠∓45° — 각도가 깔끔
          if (Math.abs(R * 2 - Math.round(R * 2)) > 1e-9) continue; // R은 0.5 배수
          if (R < 0.5 || R > 6) continue;
          if (!Number.isInteger(a.VthMag) || a.VthMag < 1 || a.VthMag > 24) continue; // |V_AB| 정수
          const p2 = a.Pmax * 2;
          if (Math.abs(p2 - Math.round(p2)) > 1e-9) continue;      // P_max 0.5 배수
          if (a.Pmax < 0.5 || a.Pmax > 40) continue;
          if (
            k1 === ORIGINAL.z1 && X1 === ORIGINAL.X1 && X2 === ORIGINAL.X2 &&
            k === ORIGINAL.k && s === ORIGINAL.s
          ) continue;                                              // 원본 튜플 제외
          out.push(f);
        }
    }
  return out;
}
const SIMILAR_SPACE = buildSpace("exam_similar");
const VARIANT_SPACE = buildSpace("exam_variant");

export function generateAcTheveninDependent(args: { seed?: number; mode: GenerationMode }): AcTheveninDependentGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  return solve(pick(space.length ? space : SIMILAR_SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플: I=√2∠0° · Z₁=j1 · k=½ · Z₂=−j½). */
export function __originalAcTheveninDependentForVerify(): AcTheveninDependentGeneration {
  return solve(ORIGINAL);
}

/** 스모크·검증용 — 생성 풀 크기. */
export function __acTheveninDependentPoolSizes(): { similar: number; variant: number } {
  return { similar: SIMILAR_SPACE.length, variant: VARIANT_SPACE.length };
}
