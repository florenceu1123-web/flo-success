/**
 * 제너 다이오드 n개 **직렬** 션트 정전압 회로 → 부하 저항 범위 (임용 2번 전자회로) — 결정론 생성기.
 *
 * 고정 토폴로지 (원본 그대로):
 *   `V_i ─ a[kΩ] ─ 마디 P`,  마디 P ─ (제너 n개 **직렬**) ─ GND,  마디 P ─ R_L ─ GND (V_RL 측정)
 *
 * ★ 물리(닫힌형). 정전압 **V_L = n·V_Z** 가 유지되는 동안:
 *   · 직렬 저항 전류 `I_S = (V_i − V_L)/a` [mA] (V는 [V], a는 [kΩ] → 결과가 곧 mA)
 *   · KCL: `I_S = I_Z + I_L`,  `I_L = V_L/R_L`
 *   · **R_L 최소 ⟺ I_L 최대 ⟺ I_Z = 0**(이상적 제너의 하한)
 *       → `I_S = V_L/R_Lmin`  →  **a = (V_i − V_L)·R_Lmin/V_L**
 *   · **R_L 최대 ⟺ I_L 최소 ⟺ I_Z = I_ZM**(제너 최대 전류)
 *       → `I_Lmin = I_S − I_ZM`  →  **R_Lmax = V_L/I_Lmin**
 *   원본(V_i=40V, 제너 2개 V_Z=5V, I_ZM=8mA, R_Lmin=1kΩ):
 *     V_L=10V → I_S=10mA → **a = 3[kΩ]**, I_Lmin=2mA → **R_Lmax = 5[kΩ]**
 *     (두 극단에서 0 ≤ I_Z ≤ I_ZM 이 성립함을 검산으로 확인.)
 *
 * ★ 형제 `zener_bjt_regulator`(제너+BJT 션트)·`opamp_series_regulator`(OPAMP 오차증폭기+직렬 패스)와
 *   다르다 — 이쪽은 **능동소자 없이 제너만**으로, 묻는 것이 **부하 저항의 범위(최솟값·최댓값)** 다.
 */

export type ZenerShuntValues = {
  Vi: number;      // 입력 전압 [V]
  Vz: number;      // 제너 전압 [V]
  n: number;       // 직렬 제너 개수
  Izm: number;     // 제너 최대 전류 [mA]
  RLmin: number;   // 부하 저항 최솟값 [kΩ]
  a: number;       // 직렬 저항 [kΩ]
  VL: number;      // 정전압 = n·Vz [V]
  Is: number;      // 직렬 저항 전류 [mA]
  ILmin: number;   // 부하 전류 최솟값 [mA]
  RLmax: number;   // 부하 저항 최댓값 [kΩ]
};

const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(3))));

function buildSpace(): ZenerShuntValues[] {
  const out: ZenerShuntValues[] = [];
  for (const n of [2, 3]) {
    for (const Vz of [3, 4, 5, 6, 8]) {
      const VL = n * Vz;
      for (const Vi of [20, 24, 30, 36, 40, 45, 48, 50, 60]) {
        if (Vi <= VL * 1.5) continue; // 강하가 너무 작으면 a가 비현실적
        for (const RLmin of [0.5, 1, 1.5, 2, 2.5]) {
          const a = ((Vi - VL) * RLmin) / VL;
          if (Math.abs(a * 2 - Math.round(a * 2)) > 1e-9 || a < 0.5 || a > 20) continue; // 0.5 배수
          const Is = (Vi - VL) / a; // = VL/RLmin
          for (const Izm of [4, 5, 6, 8, 10, 12, 15, 20]) {
            const ILmin = Is - Izm;
            if (ILmin < 0.5) continue;                       // I_ZM이 I_S를 넘으면 성립 안 함
            const RLmax = VL / ILmin;
            if (Math.abs(RLmax * 2 - Math.round(RLmax * 2)) > 1e-9 || RLmax > 60) continue;
            if (RLmax <= RLmin * 1.5) continue;              // 범위가 너무 좁으면 문제가 시시하다
            // 원본 튜플 제외
            if (Vi === 40 && Vz === 5 && n === 2 && Izm === 8 && RLmin === 1) continue;
            out.push({ Vi, Vz, n, Izm, RLmin, a, VL, Is, ILmin, RLmax });
          }
        }
      }
    }
  }
  return out;
}

const SPACE = buildSpace();

function pick(seed: number, mode: string): ZenerShuntValues {
  const half = Math.floor(SPACE.length / 2);
  const pool = mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return pool[Math.abs(Math.floor(seed * 2654435761)) % pool.length];
}

/**
 * 문제 1개 생성 — 값 + 닫힌형 정답.
 *
 * @param args.seed 결정론 시드 · args.mode 유사=a·R_Lmax 도출 / 변형=a given → R_Lmin·R_Lmax
 */
export function generateZenerShuntRegulator(args: { seed: number; mode: string }): {
  values: ZenerShuntValues;
  labels: { viLabel: string; vzLabel: string; izmLabel: string; aLabel: string; rlLabel: string };
} {
  const v = pick(args.seed, args.mode);
  const variant = args.mode === "exam_variant";
  return {
    values: v,
    labels: {
      viLabel: `V_i=${v.Vi}[V]`,
      vzLabel: `V_Z=${v.Vz}[V]`,
      izmLabel: `I_ZM=${v.Izm}[mA]`,
      aLabel: variant ? `${num(v.a)}[kΩ]` : "a[kΩ]",
      rlLabel: "R_L[kΩ]",
    },
  };
}

export { num as formatNum };
