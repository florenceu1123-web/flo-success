import type {
  AcTheveninLadderCircuitDiagram,
  AcTheveninEquivCircuitDiagram,
  GenerationMode,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 단일 AC 전원 L-C-R 사다리 + 테브난 등가 + 복소 켤레 최대평균전력 (임용 7번 회로이론) — 전용 archetype.
 *
 *  (가) 사다리: V_RMS(∠0°) — 직렬 Z1 — 마디 M — [션트 Z2 ↓ 하단] — 직렬 Z3 — 단자 a. b = 하단 rail.
 *    원본: Z1=jX1(L, j2), Z2=−jXc(C, −j1), Z3=R(2), V=4∠0° (RMS).
 *  (나) 테브난 등가: V_TH 직렬 Z_TH → 단자 a·b → 부하 Z_L.
 *  3단계:
 *    [1] Z_TH = Z3 + (Z1∥Z2)  (전원 단락),  V_TH = V·Z2/(Z1+Z2)  (a–b 개방 → Z3 무전류).
 *    [2] 복소 켤레 정합: Z_L = conj(Z_TH) = R_t + jX_L.
 *    [3] P_max = |V_TH|² / (4·R_TH)  (RMS 페이저).
 *
 *  ★ generic universal_ac(topology-driven)는 사다리(직렬-션트-직렬 + a·b 부하)를 perturb/rebuild 단계에서
 *    "병렬 leg 회로"로 변질(실측: L∥C 병렬·없던 R leg 추가·R 션트화) → 고정 토폴로지 전용 archetype 필수.
 *  ★ 2전원 theveninMaxPower·ac_bridge(둘 다 순저항 R_L=|Z_th|)와 구분: ★ 복소 켤레 부하 Z_L=R+jX ★.
 *
 *  값은 손으로 고른 예시가 아니라 ★규칙 열거+정수/깔끔 필터★로 도출, 원본 튜플 제외.
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

type Elem = "R" | "L" | "C";
/** 소자 종류+크기 → 임피던스. L: +jX, C: −jX, R: +X. */
function imp(kind: Elem, mag: number): Cx {
  if (kind === "L") return { re: 0, im: mag };
  if (kind === "C") return { re: 0, im: -mag };
  return { re: mag, im: 0 };
}
/** 소자 라벨. L/C는 jX/−jX, R은 XΩ. */
function impLabel(kind: Elem, mag: number): string {
  if (kind === "L") return `j${r1(mag)}Ω`;
  if (kind === "C") return `−j${r1(mag)}Ω`;
  return `${r1(mag)}Ω`;
}

function r1(x: number): number { return Math.round(x * 10) / 10; }
function r3(x: number): number { return Math.round(x * 1000) / 1000; }

/** 복소 임피던스 라벨 "R − jX Ω" / "R + jX Ω" / "R Ω" / "−jX Ω". */
function zLabel(z: Cx): string {
  const re = r1(z.re), im = r1(z.im);
  if (Math.abs(im) < 1e-6) return `${re} Ω`;
  if (Math.abs(re) < 1e-6) return `${im < 0 ? "−" : ""}j${Math.abs(im)} Ω`;
  return `${re} ${im < 0 ? "−" : "+"} j${Math.abs(im)} Ω`;
}
/** 실수 페이저 라벨 "M∠0° V" 또는 "M∠180° V". */
function phasorLabel(z: Cx, unit: string): string {
  const mag = r1(cx.abs(z));
  if (Math.abs(z.im) < 1e-6) return `${mag}∠${z.re < 0 ? 180 : 0}° ${unit}`;
  const deg = r1((Math.atan2(z.im, z.re) * 180) / Math.PI);
  return `${mag}∠${deg}° ${unit}`;
}

export type AcTheveninLadderGeneration = {
  values: {
    vLabel: string; Vs: number;
    ser1Type: Elem; ser1Mag: number;
    shType: Elem; shMag: number;
    ser2Type: Elem; ser2Mag: number;
  };
  answer: {
    Zth: Cx; ZthLabel: string; Rth: number; Xth: number; absZth: number;
    Vth: Cx; VthLabel: string; VthMag: number;
    ZL: Cx; ZLLabel: string; RL: number; XL: number;
    Pmax: number; PmaxLabel: string;
  };
  ladderDiagram: AcTheveninLadderCircuitDiagram;  // (가)
  equivDiagram: AcTheveninEquivCircuitDiagram;     // (나)
};

/** family: 직렬1·션트·직렬2 소자 종류 + 크기 + 전원. */
type Family = {
  ser1: Elem; X1: number;   // 직렬 1 (리액티브)
  sh: Elem; X2: number;     // 션트 (리액티브)
  ser2: Elem; R: number;    // 직렬 2 (저항)
  Vs: number;
};

// 원본 튜플 (참조·검증 전용, 생성 풀 제외): 직렬 L j2 · 션트 C −j1 · 직렬 R 2 · V 4∠0°.
const ORIGINAL: Family = { ser1: "L", X1: 2, sh: "C", X2: 1, ser2: "R", R: 2, Vs: 4 };

function solve(f: Family): AcTheveninLadderGeneration {
  const Z1 = imp(f.ser1, f.X1);
  const Z2 = imp(f.sh, f.X2);
  const Z3 = imp(f.ser2, f.R);
  const Vs: Cx = { re: f.Vs, im: 0 };

  const par = cx.div(cx.mul(Z1, Z2), cx.add(Z1, Z2));   // Z1 ∥ Z2
  const Zth = cx.add(Z3, par);
  const Vth = cx.mul(Vs, cx.div(Z2, cx.add(Z1, Z2)));    // V·Z2/(Z1+Z2)
  const ZL = cx.conj(Zth);
  const Rth = Zth.re;
  const VthMag = cx.abs(Vth);
  const Pmax = (VthMag * VthMag) / (4 * Rth);            // RMS 페이저 최대평균전력

  const ladderDiagram: AcTheveninLadderCircuitDiagram = {
    vLabel: `V_RMS=${f.Vs}∠0°V`,
    ser1Type: f.ser1, ser1Label: impLabel(f.ser1, f.X1),
    shType: f.sh, shLabel: impLabel(f.sh, f.X2),
    ser2Type: f.ser2, ser2Label: impLabel(f.ser2, f.R),
    loadLabel: "Z_L",
  };
  const equivDiagram: AcTheveninEquivCircuitDiagram = {
    vthLabel: "V_TH", zthLabel: "Z_TH", loadLabel: "Z_L",
  };

  return {
    values: {
      vLabel: ladderDiagram.vLabel, Vs: f.Vs,
      ser1Type: f.ser1, ser1Mag: f.X1, shType: f.sh, shMag: f.X2, ser2Type: f.ser2, ser2Mag: f.R,
    },
    answer: {
      Zth: { re: r3(Zth.re), im: r3(Zth.im) }, ZthLabel: zLabel(Zth),
      Rth: r3(Rth), Xth: r3(Zth.im), absZth: r3(cx.abs(Zth)),
      Vth: { re: r3(Vth.re), im: r3(Vth.im) }, VthLabel: phasorLabel(Vth, "V"), VthMag: r3(VthMag),
      ZL: { re: r3(ZL.re), im: r3(ZL.im) }, ZLLabel: zLabel(ZL), RL: r3(ZL.re), XL: r3(ZL.im),
      Pmax: r3(Pmax), PmaxLabel: `${r3(Pmax)} W`,
    },
    ladderDiagram, equivDiagram,
  };
}

/**
 * 값을 손으로 고르지 않고 ★규칙 기반 열거+깔끔 필터★로 생성 풀을 만든다 (특정 예시 hardcode 금지).
 *   exam_similar: 직렬 L + 션트 C + 직렬 R (원본 토폴로지, Z_TH 용량성).
 *   exam_variant: 직렬 C + 션트 L + 직렬 R (리액티브 소자 종류 교환 — 변형, Z_TH 유도성).
 *   필터: Z_TH 실·허부 정수, |V_TH| 정수, P_max는 0.25 배수(깔끔), 범위 제한. 원본 튜플 제외.
 *   solve()가 모든 답을 복소 연산으로 도출 — 값만 enumerate, 풀이는 범용.
 */
function buildSpace(mode: GenerationMode): Family[] {
  const k1: Elem = mode === "exam_variant" ? "C" : "L"; // 직렬 리액티브
  const k2: Elem = mode === "exam_variant" ? "L" : "C"; // 션트 리액티브
  const out: Family[] = [];
  for (let Xa = 2; Xa <= 10; Xa++)          // 직렬 리액턴스 크기 (Xa>Xb로 분모>0)
    for (let Xb = 1; Xb < Xa; Xb++)         // 션트 리액턴스 크기
      for (let R = 2; R <= 5; R++)
        for (let Vs = 2; Vs <= 12; Vs++) {
          const f: Family = { ser1: k1, X1: Xa, sh: k2, X2: Xb, ser2: "R", R, Vs };
          const a = solve(f).answer;
          if (!Number.isInteger(a.Zth.re) || !Number.isInteger(a.Zth.im)) continue; // Z_TH 정수
          if (Math.abs(a.Zth.im) < 1) continue;                                     // 리액턴스 있는 Z_TH
          if (!Number.isInteger(a.VthMag) || a.VthMag < 2 || a.VthMag > 12) continue; // |V_TH| 정수
          const p4 = a.Pmax * 4;
          if (Math.abs(p4 - Math.round(p4)) > 1e-6) continue;                       // P_max = 0.25 배수
          if (a.Pmax < 0.5 || a.Pmax > 12) continue;
          if (k1 === ORIGINAL.ser1 && Xa === ORIGINAL.X1 && Xb === ORIGINAL.X2 && R === ORIGINAL.R && Vs === ORIGINAL.Vs) continue; // 원본 제외
          out.push(f);
        }
  return out;
}
const SIMILAR_SPACE = buildSpace("exam_similar");
const VARIANT_SPACE = buildSpace("exam_variant");

export function generateAcTheveninLadder(args: { seed?: number; mode: GenerationMode }): AcTheveninLadderGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  return solve(pick(space.length ? space : SIMILAR_SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플: L j2 · C −j1 · R 2 · 4∠0°). */
export function __originalLadderForVerify(): AcTheveninLadderGeneration {
  return solve(ORIGINAL);
}
