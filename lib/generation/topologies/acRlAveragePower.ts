import type { AcRlAveragePowerDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 교류 전원 + 직렬 리액턴스 + 병렬 저항 2개 — 평균전력 (임용 8번 형식) 전용 archetype.
 *
 *  회로:  V∠0° ─[ jX_L (유사) 또는 −jX_C (변형) ]─ A ─[ R₁ ∥ R₂ ]─ GND
 *
 * ★ 물리(닫힌형, 손계산):
 *    R_p = R₁R₂/(R₁+R₂),  Z = R_p + jX  (변형은 −jX)
 *    |I| = |V| / √(R_p² + X²)          (peak 페이저 규약)
 *    전원이 공급하는 평균전력  P_s = ½|I|²·R_p
 *    **이상 인덕터·커패시터의 평균전력은 0** (전압·전류 위상차 90°)
 *    병렬부 전압 |V_p| = |I|·R_p → P_R = ½|V_p|²/R
 *
 * ★★ 값 열거는 **X = R_p** 로 고정한다 — 그러면 √(R_p²+X²) = R_p√2 이고
 *    P_s = |V|²/(4R_p), P_R₁ = |V|²/(4R₁), P_R₂ = |V|²/(4R₂) 로 **전부 깔끔하게** 떨어진다
 *    (P_s = P_R₁ + P_R₂ 도 자동으로 성립 — 검산이 된다).
 *    원본(V=8, R₁=1, R₂=2 → R_p=2/3, X=2/3): P_s=24W, P_L=0, P_R₁=16W, P_R₂=8W. ✓
 *
 * ★ 모드 (사용자 지정, 2026-08-01)
 *    유사 : 원본 그대로 — 직렬 **인덕터**, 세 단계 모두 **평균전력**.
 *    변형 : 직렬 소자를 **커패시터**로 교체하고, 마지막에 **v(t)를 시간 함수로** 구한다.
 *           X_C = R_p 이면 I 가 +45° 앞서므로 v_p(t) = (|V|/√2)·cos(ωt + 45°) 로 깔끔하다.
 */

export type AcRlAveragePowerGeneration = {
  /** true면 직렬 소자가 커패시터(변형) */
  isCapacitor: boolean;
  values: {
    Vm: number;        // 전원 진폭 [V] (peak)
    R1: number; R2: number;   // 병렬 저항 [Ω]
    /** R_p = R₁∥R₂ — 표시는 분수 */
    RpNum: number; RpDen: number;
    omega: number;     // [rad/s]
  };
  answer: {
    ZTex: string;
    ImagTex: string;      // |I|
    IphasorTex: string;
    /** 유사 전용 */
    Ps?: number; Pr1?: number; Pr2?: number;
    /** 변형 전용 */
    VpTex?: string;
    vtTex?: string;
  };
  labels: { xTex: string; vTex: string; r1Tex: string; r2Tex: string; rpTex: string };
  circuitDiagram: AcRlAveragePowerDiagram;
};

function gcd(a: number, b: number): number { return b === 0 ? (a || 1) : gcd(b, a % b); }
/** 기약분수 LaTeX (분모 1이면 정수). */
function fracTex(n: number, d: number): string {
  const g = gcd(Math.abs(n), Math.abs(d));
  const nn = n / g, dd = d / g;
  return dd === 1 ? String(nn) : `\\dfrac{${nn}}{${dd}}`;
}

type Set8 = { Vm: number; R1: number; R2: number; RpNum: number; RpDen: number; Ps: number; Pr1: number; Pr2: number };

function buildSpace(): Set8[] {
  const out: Set8[] = [];
  const RS = [1, 2, 3, 4, 5, 6, 8];
  const VS = [4, 6, 8, 10, 12, 16, 20, 24];
  for (let i = 0; i < RS.length; i++) {
    for (let j = i + 1; j < RS.length; j++) {
      const R1 = RS[i], R2 = RS[j];
      const RpNum = R1 * R2, RpDen = R1 + R2;
      for (const Vm of VS) {
        // P_R = V²/(4R) 가 정수여야 답이 깔끔하다.
        const Pr1 = (Vm * Vm) / (4 * R1);
        const Pr2 = (Vm * Vm) / (4 * R2);
        if (!Number.isInteger(Pr1) || !Number.isInteger(Pr2)) continue;
        const Ps = Pr1 + Pr2;                 // = V²/(4R_p) (항등)
        if (Ps > 400) continue;
        // 원본 튜플 제외 (V=8, R₁=1, R₂=2)
        if (Vm === 8 && R1 === 1 && R2 === 2) continue;
        out.push({ Vm, R1, R2, RpNum, RpDen, Ps, Pr1, Pr2 });
      }
    }
  }
  return out;
}
const SPACE = buildSpace();

const OMEGAS = [100, 200, 500, 1000, 2000, 5000];

export function generateAcRlAveragePower(args: { seed?: number; mode: GenerationMode }): AcRlAveragePowerGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  if (SPACE.length === 0) throw new Error("acRlAveragePower: 값 공간이 비었다");
  const s = pick(SPACE, rand);
  const omega = pick(OMEGAS, rand);
  const isCapacitor = args.mode === "exam_variant";

  const rpTex = fracTex(s.RpNum, s.RpDen);
  const xTex = `${isCapacitor ? "-j" : "j"}${rpTex}\\,[\\Omega]`;
  // |I| = |V|/(R_p√2),  |V_p| = |I|·R_p = |V|/√2
  const ImagTex = `\\dfrac{${s.Vm}}{${rpTex === "1" ? "" : `${rpTex}\\cdot`}\\sqrt{2}}`;
  const ZTex = `Z = ${rpTex} ${isCapacitor ? "-" : "+"} j${rpTex} = ${rpTex}\\sqrt{2}\\angle ${isCapacitor ? "-45" : "45"}^\\circ\\,[\\Omega]`;
  const IphasorTex = `\\mathbf{I} = \\dfrac{${s.Vm}\\angle 0^\\circ}{${rpTex}\\sqrt{2}\\angle ${isCapacitor ? "-45" : "45"}^\\circ} = ${ImagTex}\\angle ${isCapacitor ? "+45" : "-45"}^\\circ\\,[\\mathrm{A}]`;
  // |V_p| = |V|/√2
  const VpMagTex = `\\dfrac{${s.Vm}}{\\sqrt{2}}`;

  const answer: AcRlAveragePowerGeneration["answer"] = isCapacitor
    ? {
        ZTex, ImagTex, IphasorTex,
        VpTex: `\\mathbf{V}_p = ${VpMagTex}\\angle +45^\\circ\\,[\\mathrm{V}]`,
        vtTex: `v(t) = ${VpMagTex}\\cos(${omega}t + 45^\\circ)\\,[\\mathrm{V}]`,
      }
    : { ZTex, ImagTex, IphasorTex, Ps: s.Ps, Pr1: s.Pr1, Pr2: s.Pr2 };

  return {
    isCapacitor,
    values: { Vm: s.Vm, R1: s.R1, R2: s.R2, RpNum: s.RpNum, RpDen: s.RpDen, omega },
    answer,
    labels: {
      xTex, vTex: `${s.Vm}\\angle 0^\\circ\\,[\\mathrm{V}]`,
      r1Tex: `${s.R1}\\,[\\Omega]`, r2Tex: `${s.R2}\\,[\\Omega]`, rpTex,
    },
    circuitDiagram: {
      isCapacitor,
      sourceLabel: `${s.Vm}∠0°V`,
      seriesLabel: `${isCapacitor ? "−j" : "j"}${s.RpDen === s.RpNum ? "1" : (s.RpNum % s.RpDen === 0 ? String(s.RpNum / s.RpDen) : `${s.RpNum}/${s.RpDen}`)}Ω`,
      r1Label: `${s.R1}Ω`,
      r2Label: `${s.R2}Ω`,
    },
  };
}
