import type { AcVccsPhasorCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 종속전류원(g·V_c) 2단 구동 페이저 회로 (임용 3번 회로이론) — 전용 archetype.
 *
 *  토폴로지 (좌·우 두 망이 접지만 공유, 종속전류원이 2단을 구동):
 *    좌측망: V_s(∠θ) ─ R₁ ─ 마디 A ─ [ X ∥ X ] ─ GND      → 제어전압 V_c (마디 A 전압)
 *    우측망: 종속전류원 g·V_c(↑, GND→마디 B) ─ 마디 B ─ [ R₂ ∥ X_ld ] ─ GND  → I_R (R₂ 전류)
 *
 *  해석 (3단계, 원본 〈해석 절차〉):
 *    [1] 분압:      V_c = V_s · Z_sh/(R₁ + Z_sh),  Z_sh = 두 shunt 소자의 병렬
 *    [2] 전류분배:  I_R = g·V_c · Z_ld/(R₂ + Z_ld)
 *    [3] 시간영역:  i_R(t) = |I_R|·cos(ωt + ∠I_R)
 *
 *  모드:
 *    exam_similar  = 원본 구조 (shunt=커패시터 −jX 2개, 부하=인덕터 +jX)
 *    exam_variant  = 소자 종류 교환 (shunt=인덕터 +jX 2개, 부하=커패시터 −jX) — 구조·원리 동일
 *
 *  ★ 종속전원은 generic universal_ac/topology-driven이 떨어뜨려 회로가 깨진다. 게다가 Vision이
 *    다이아몬드 "2V_c"를 일반 전압원으로 읽으면 "AC+DC 중첩 RC"로까지 오분류(실측) → 전용 결정론 archetype.
 *  ★ 값은 규칙 열거 + 필터(∠V_c·∠I_R이 15° 배수, 크기가 정수 또는 k√2). 원본 튜플은 생성 풀에서 제외.
 */

export type AcVccsPhasor = {
  mode: GenerationMode;
  vals: {
    omega: number;      // 각주파수 [rad/s]
    vsMag: number;      // 전원 최댓값 [V] (cosine 기준)
    vsAng: number;      // 전원 위상 [deg]
    r1: number;         // 직렬 저항 [Ω]
    xSh: number;        // shunt 소자 1개의 리액턴스 크기 [Ω] (2개 병렬)
    g: number;          // 상호 컨덕턴스 [A/V]
    r2: number;         // 부하 저항 [Ω]
    xLd: number;        // 부하 리액턴스 크기 [Ω]
  };
  shuntKind: "C" | "L";
  loadKind: "L" | "C";
  vc: { mag: number; ang: number; text: string };     // 페이저 V_c
  ir: { mag: number; ang: number; text: string };     // 페이저 I_R
  zShText: string;    // 병렬 shunt 임피던스 (예 "−j1 Ω")
  zLdText: string;    // 부하 리액턴스 (예 "j2 Ω")
  irTimeText: string; // i_R(t) 시간영역 식
  rLoadLabel: string; // "2[Ω]" — 발문에서 "N[Ω]의 저항" 표기용
  diagram: AcVccsPhasorCircuitDiagram;
};

// ─── 복소수 헬퍼 ───
type Cx = { re: number; im: number };
const cx = (re: number, im: number): Cx => ({ re, im });
const cAdd = (a: Cx, b: Cx): Cx => cx(a.re + b.re, a.im + b.im);
const cMul = (a: Cx, b: Cx): Cx => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cDiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cAbs = (a: Cx): number => Math.hypot(a.re, a.im);
const cAngDeg = (a: Cx): number => (Math.atan2(a.im, a.re) * 180) / Math.PI;
const polar = (mag: number, angDeg: number): Cx =>
  cx(mag * Math.cos((angDeg * Math.PI) / 180), mag * Math.sin((angDeg * Math.PI) / 180));

const TOL = 1e-6;
const SQRT2 = Math.SQRT2;

/** 위상이 15° 배수인가 (시험 문제로 쓸 만한 각도). */
function isNiceAngle(deg: number): boolean {
  const n = deg / 15;
  return Math.abs(n - Math.round(n)) < 1e-6;
}

/** 크기를 시험 표기로 — 정수 "10", k√2 "5√2", 반정수 "2.5". 표기 불가면 null. */
function niceMag(x: number): string | null {
  if (!Number.isFinite(x) || x <= 0 || x > 200) return null;
  if (Math.abs(x - Math.round(x)) < TOL) return String(Math.round(x));
  const k = x / SQRT2;
  if (Math.abs(k - Math.round(k)) < TOL && Math.round(k) >= 1) return `${Math.round(k)}√2`;
  if (Math.abs(x * 2 - Math.round(x * 2)) < TOL) return String(Math.round(x * 2) / 2);
  return null;
}

/** 각도를 "∠45°" 표기로 (−180<θ≤180 정규화). */
function fmtAng(deg: number): string {
  let d = Math.round(deg);
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return `${d}`;
}

/** 리액턴스 표기 — kind C면 "−jX", L이면 "jX". */
function reactText(kind: "C" | "L", x: number): string {
  return kind === "C" ? `−j${trim(x)}` : `j${trim(x)}`;
}
function trim(x: number): string {
  return Math.abs(x - Math.round(x)) < TOL ? String(Math.round(x)) : String(Math.round(x * 100) / 100);
}

// ─── 값 공간 (규칙 열거 + 필터) ───
type Tuple = AcVccsPhasor["vals"];

const OMEGA_POOL = [100, 200, 500, 1000];
const VS_MAG_POOL = [8, 10, 12, 16, 20, 24];
const VS_ANG_POOL = [0, 30, 45, 60, 90, -30, -45, -60];
const R1_POOL = [1, 2, 4];
const XSH_POOL = [2, 4, 8];
const G_POOL = [2, 3, 4, 5];
const R2_POOL = [2, 4];
const XLD_POOL = [2, 4];

/** 원본 튜플 (참조·검증 전용, 생성 풀에서 제외): 10∠45°·1Ω·−j2∥−j2·2V_c·2Ω∥j2 → V_c=5√2∠0°·I_R=10∠45°. */
const ORIGINAL: Tuple = { omega: 100, vsMag: 10, vsAng: 45, r1: 1, xSh: 2, g: 2, r2: 2, xLd: 2 };

function sameTuple(a: Tuple, b: Tuple): boolean {
  return (
    a.omega === b.omega && a.vsMag === b.vsMag && a.vsAng === b.vsAng && a.r1 === b.r1 &&
    a.xSh === b.xSh && a.g === b.g && a.r2 === b.r2 && a.xLd === b.xLd
  );
}

/**
 * 페이저 해석 — shunt/부하 소자 종류(C/L)에 무관한 범용 솔버.
 *  Z_sh = 두 shunt 소자 병렬 = ±j·xSh/2  (C면 −, L이면 +)
 *  V_c  = V_s · Z_sh/(R₁+Z_sh)
 *  Z_ld = ±j·xLd  (L이면 +, C면 −)
 *  I_R  = g·V_c · Z_ld/(R₂+Z_ld)   (전류분배)
 */
function solve(t: Tuple, shuntKind: "C" | "L", loadKind: "L" | "C") {
  const vs = polar(t.vsMag, t.vsAng);
  const zSh = cx(0, (shuntKind === "C" ? -1 : 1) * (t.xSh / 2));
  const vc = cMul(vs, cDiv(zSh, cAdd(cx(t.r1, 0), zSh)));
  const zLd = cx(0, (loadKind === "L" ? 1 : -1) * t.xLd);
  const id = cMul(cx(t.g, 0), vc);                        // 종속전류원 전류 g·V_c
  const ir = cMul(id, cDiv(zLd, cAdd(cx(t.r2, 0), zLd))); // 전류분배로 R₂ 전류
  return { vc, ir, zSh, zLd };
}

/** 시험 표기가 깔끔한 튜플만 통과 — 위상 15° 배수 + 크기 정수/k√2/반정수. */
function buildSpace(shuntKind: "C" | "L", loadKind: "L" | "C"): Tuple[] {
  const out: Tuple[] = [];
  for (const omega of OMEGA_POOL)
    for (const vsMag of VS_MAG_POOL)
      for (const vsAng of VS_ANG_POOL)
        for (const r1 of R1_POOL)
          for (const xSh of XSH_POOL)
            for (const g of G_POOL)
              for (const r2 of R2_POOL)
                for (const xLd of XLD_POOL) {
                  const t: Tuple = { omega, vsMag, vsAng, r1, xSh, g, r2, xLd };
                  if (sameTuple(t, ORIGINAL)) continue;
                  const { vc, ir } = solve(t, shuntKind, loadKind);
                  if (!isNiceAngle(cAngDeg(vc)) || !isNiceAngle(cAngDeg(ir))) continue;
                  if (!niceMag(cAbs(vc)) || !niceMag(cAbs(ir))) continue;
                  out.push(t);
                }
  return out;
}

const SIMILAR_SPACE = buildSpace("C", "L");
const VARIANT_SPACE = buildSpace("L", "C");

export function generateAcVccsPhasor(args: { seed?: number; mode: GenerationMode }): AcVccsPhasor {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const isVariant = args.mode === "exam_variant";
  const shuntKind: "C" | "L" = isVariant ? "L" : "C";
  const loadKind: "L" | "C" = isVariant ? "C" : "L";
  const space = isVariant ? VARIANT_SPACE : SIMILAR_SPACE;
  const t = pick(space.length ? space : SIMILAR_SPACE, rand);
  return build(t, args.mode, shuntKind, loadKind);
}

function build(t: Tuple, mode: GenerationMode, shuntKind: "C" | "L", loadKind: "L" | "C"): AcVccsPhasor {
  const { vc, ir } = solve(t, shuntKind, loadKind);
  const vcMag = cAbs(vc), vcAng = cAngDeg(vc);
  const irMag = cAbs(ir), irAng = cAngDeg(ir);
  const vcMagText = niceMag(vcMag) ?? String(Math.round(vcMag * 100) / 100);
  const irMagText = niceMag(irMag) ?? String(Math.round(irMag * 100) / 100);

  const shuntText = reactText(shuntKind, t.xSh);            // 각 shunt 소자 (예 "−j2")
  const zShText = `${reactText(shuntKind, t.xSh / 2)}[Ω]`;  // 두 개 병렬 (예 "−j1[Ω]")
  const zLdText = `${reactText(loadKind, t.xLd)}[Ω]`;

  const srcLabel = `${t.vsMag}∠${fmtAng(t.vsAng)}° V`;
  const depLabel = `${t.g}V_c`;

  const diagram: AcVccsPhasorCircuitDiagram = {
    srcLabel,
    r1Label: `${trim(t.r1)} Ω`,
    shuntKind,
    shunt1Label: `${shuntText} Ω`,
    shunt2Label: `${shuntText} Ω`,
    vcLabel: "V_c",
    depLabel,
    loadRLabel: `${trim(t.r2)} Ω`,
    loadKind,
    loadXLabel: `${reactText(loadKind, t.xLd)} Ω`,
    irLabel: "I_R",
  };

  return {
    mode,
    vals: t,
    shuntKind,
    loadKind,
    vc: { mag: vcMag, ang: vcAng, text: `${vcMagText}∠${fmtAng(vcAng)}° V` },
    ir: { mag: irMag, ang: irAng, text: `${irMagText}∠${fmtAng(irAng)}° A` },
    zShText,
    zLdText,
    irTimeText: `${irMagText}cos(${t.omega}t ${irAng >= 0 ? "+" : "−"} ${Math.abs(Math.round(irAng))}°)`,
    rLoadLabel: `${trim(t.r2)}[Ω]`,
    diagram,
  };
}
