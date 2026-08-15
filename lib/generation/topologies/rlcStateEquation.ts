/**
 * 직류 전압원·전류원 포함 RLC 회로의 **상태 방정식** (임용 6번 회로이론) — 결정론 생성기.
 *
 * 고정 토폴로지 (원본 그대로):
 *   `V₁ ─ R₁ ─ L(전류 i, →) ─ 마디 A`,  마디 A ─ C(전압 v, 위가 +) ─ GND,
 *   마디 A ─ R₂ ─ GND,  마디 A ─ I₁(↑, 마디로 유입) ─ GND.
 *
 * ★ 물리(닫힌형):
 *   · KVL(좌측 루프): `V₁ = R₁·i + L·di/dt + v`  →  **di/dt = (−R₁ i − v + V₁)/L**
 *   · KCL(마디 A):    `i + I₁ = C·dv/dt + v/R₂`  →  **dv/dt = (i − v/R₂ + I₁)/C**
 *   따라서 상태벡터 x=[i, v]ᵀ, 입력 u=[V₁, I₁]ᵀ 에 대해
 *     **A = [[−R₁/L, −1/L], [1/C, −1/(R₂C)]]**,  **B = [[1/L, 0], [0, 1/C]]**
 *   원본(R₁=1, L=1/5, C=1/2, R₂=2) → **A=[[−5,−5],[2,−1]], B=[[5,0],[0,2]]**
 *   (RK4로 회로 직접 적분과 상태방정식 적분이 8자리까지 일치함을 확인.)
 *
 * ★ 값은 규칙 열거 — L=1/k, C=1/m 로 두면 A·B 성분이 전부 정수로 떨어진다.
 *   추가로 `m/R₂`가 정수여야 A₂₂도 정수. 원본 튜플 제외.
 *   exam_similar=소자 값 → A·B (원본) / exam_variant=**구하는 양 교환**(A·B → 소자 값 역산).
 */

export type RlcStateValues = {
  /** 직렬 저항 R₁[Ω] */
  R1: number;
  /** 인덕턴스 L = 1/k [H] */
  k: number;
  /** 커패시턴스 C = 1/m [F] */
  m: number;
  /** 병렬 저항 R₂[Ω] */
  R2: number;
  r1Label: string;
  lLabel: string;
  cLabel: string;
  r2Label: string;
};

export type RlcStateAnswer = {
  /** A 행렬 (2×2, 정수) */
  A: [[number, number], [number, number]];
  /** B 행렬 (2×2, 정수) */
  B: [[number, number], [number, number]];
  /** di/dt 식 문자열 */
  diText: string;
  /** dv/dt 식 문자열 */
  dvText: string;
};

/** 분수 표기 — 1/k 는 "1/k", 정수는 그대로. */
function fracLabel(n: number, d: number, unit: string): string {
  return d === 1 ? `${n}[${unit}]` : `${n}/${d}[${unit}]`;
}

function buildSpace(): RlcStateValues[] {
  const out: RlcStateValues[] = [];
  for (const k of [2, 3, 4, 5, 6, 8, 10]) {          // L = 1/k
    for (const m of [2, 3, 4, 5, 6, 8]) {            // C = 1/m
      for (const R1 of [1, 2, 3, 4]) {
        for (const R2 of [1, 2, 3, 4, 5]) {
          if (m % R2 !== 0) continue;                // A₂₂ = −m/R₂ 정수
          const a11 = R1 * k, a12 = k, a21 = m, a22 = m / R2;
          if (a11 > 24 || a12 > 24 || a21 > 24 || a22 > 24) continue;
          if (R1 === 1 && k === 5 && m === 2 && R2 === 2) continue; // 원본 튜플 제외
          out.push({
            R1, k, m, R2,
            r1Label: `${R1}[Ω]`,
            lLabel: fracLabel(1, k, "H"),
            cLabel: fracLabel(1, m, "F"),
            r2Label: `${R2}[Ω]`,
          });
        }
      }
    }
  }
  return out;
}

const SPACE = buildSpace();

/** 결정론 seed 셔플 — 같은 seed면 같은 결과. */
function pick(seed: number, mode: string): RlcStateValues {
  // 유사·변형이 서로 다른 값을 쓰도록 풀을 절반씩 나눈다.
  const half = Math.floor(SPACE.length / 2);
  const pool = mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  const idx = Math.abs(Math.floor(seed * 2654435761)) % pool.length;
  return pool[idx];
}

/**
 * 상태 방정식 문제 1개 생성.
 *
 * @param args.seed 결정론 시드 · args.mode 생성 모드
 */
export function generateRlcStateEquation(args: { seed: number; mode: string }): {
  values: RlcStateValues;
  answer: RlcStateAnswer;
} {
  const values = pick(args.seed, args.mode);
  const { R1, k, m, R2 } = values;

  // A = [[−R₁/L, −1/L], [1/C, −1/(R₂C)]],  B = [[1/L, 0], [0, 1/C]]   (L=1/k, C=1/m)
  const A: [[number, number], [number, number]] = [
    [-R1 * k, -k],
    [m, -m / R2],
  ];
  const B: [[number, number], [number, number]] = [
    [k, 0],
    [0, m],
  ];

  const sgn = (n: number) => (n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`);
  const diText = `di/dt = ${A[0][0]}i ${sgn(A[0][1])}v ${sgn(B[0][0])}V₁`;
  const dvText = `dv/dt = ${A[1][0]}i ${sgn(A[1][1])}v ${sgn(B[1][1])}I₁`;

  return { values, answer: { A, B, diText, dvText } };
}
