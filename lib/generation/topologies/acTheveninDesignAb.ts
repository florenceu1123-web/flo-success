/**
 * 교류 테브난 등가 → **최대 평균전력이 되도록 소자 값 a·b를 설계** (임용 7번 회로이론) — 결정론 생성기.
 *
 * 고정 토폴로지 (원본 그대로):
 *   `V∠θ ─ [R_d + (−jX_d) 직렬 션트] ─ 상단: a[Ω] ─ jb[Ω] ─ 마디 A`,
 *   `마디 A ─ (−jb[Ω]) ─ GND(=B)`,  단자 A–B에 **고정 부하 Z_L = R_L + jX_L**
 *
 * ★ 물리(닫힌형):
 *   · 좌측 션트(R_d − jX_d)는 **이상 전압원과 병렬**이라 A–B에서 본 회로에 영향이 없다(원본의 distractor).
 *   · 직렬 (a+jb)와 션트 (−jb)의 합이 **a** 로 약분되는 것이 이 회로의 핵심이다:
 *     **Z_TH = (a+jb)∥(−jb) = b²/a − j·b**,  **V_TH = V·(−jb)/a**  (|V_TH| = |V|·b/a)
 *   · 최대 평균전력 조건은 **Z_L = Z_TH\*** → `X_L = b`, `R_L = b²/a`
 *     ⇒ **b = X_L**, **a = X_L²/R_L**
 *   · **P_max = |V_TH|²/(4R_TH) = |V|²/(4a)** (실효값 기준 — b가 완전히 약분된다)
 *   원본(V=8∠90°, Z_L=2+j2): **b=2, a=2**, Z_TH=2−j2, V_TH=8∠0°, **P_max = 64/8 = 8[W]**
 *   (복소 연산으로 교차검증 완료.)
 *
 * ★ 형제 `ac_thevenin_ladder`(소자 값 given → Z_L·P_max)와 **방향이 반대**다 — 이쪽은 Z_L이 고정이고
 *   회로의 소자 값을 **역산**한다. `ac_bridge_max_power`(브리지 4-arm·순저항 R_L)와도 회로가 다르다.
 */

export type AcThevDesignValues = {
  a: number;      // 직렬 저항 [Ω]
  b: number;      // 직렬 리액턴스 jb, 션트 −jb [Ω]
  Vm: number;     // 전원 크기 (실효값) [V]
  theta: number;  // 전원 위상 [°]
  Rd: number;     // 좌측 션트 저항 (distractor)
  Xd: number;     // 좌측 션트 용량성 리액턴스 (distractor)
  RL: number;     // 부하 저항 = b²/a
  XL: number;     // 부하 리액턴스 = b
  Pmax: number;   // |V|²/(4a)
  vthMag: number; // |V_TH| = |V|·b/a
  vthPhase: number; // θ − 90
};

const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
export const numFmt = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(3))));

function buildSpace(): AcThevDesignValues[] {
  const out: AcThevDesignValues[] = [];
  for (const a of [1, 2, 3, 4, 5, 6, 8]) {
    for (const b of [1, 2, 3, 4, 5, 6, 8]) {
      const RL = (b * b) / a;
      if (!isHalf(RL) || RL < 0.5 || RL > 20) continue;
      for (const Vm of [4, 6, 8, 10, 12, 16, 20, 24]) {
        const Pmax = (Vm * Vm) / (4 * a);
        if (!isHalf(Pmax) || Pmax < 1 || Pmax > 120) continue;
        const vthMag = (Vm * b) / a;
        if (!isHalf(vthMag)) continue;
        for (const theta of [90, 180, 0, -90]) {
          for (const [Rd, Xd] of [[2, 3], [3, 4], [4, 2], [5, 5]] as const) {
            // 원본 튜플 제외
            if (a === 2 && b === 2 && Vm === 8 && theta === 90 && Rd === 2 && Xd === 3) continue;
            out.push({
              a, b, Vm, theta, Rd, Xd,
              RL, XL: b, Pmax, vthMag, vthPhase: theta - 90,
            });
          }
        }
      }
    }
  }
  return out;
}

const SPACE = buildSpace();

function pick(seed: number, mode: string): AcThevDesignValues {
  const half = Math.floor(SPACE.length / 2);
  const pool = mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return pool[Math.abs(Math.floor(seed * 2654435761)) % pool.length];
}

/**
 * 문제 1개 생성.
 *
 * @param args.seed 결정론 시드 · args.mode 유사=a·b 설계 / 변형=a·b given → Z_L·P_max
 */
export function generateAcTheveninDesignAb(args: { seed: number; mode: string }): {
  values: AcThevDesignValues;
} {
  return { values: pick(args.seed, args.mode) };
}
