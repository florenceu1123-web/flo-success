/**
 * t=0에 스위치가 **개방**되는 무전원 직렬 RLC 자연응답 (임용 5번 회로이론) — 결정론 생성기.
 *
 * 고정 토폴로지 (원본 그대로):
 *   `V_s ─ R_s ─ SW(t=0 개방) ─ 마디 N`,  마디 N ─ R_p ─ GND,
 *   `마디 N ─ R_3 ─ C(전압 v, + 위) ─ L(전류 i, ↓) ─ GND`  (우측 leg는 **직렬** C·L)
 *
 * ★ 물리(닫힌형):
 *   · t<0 (SW 닫힘, 직류 정상상태): C 개방 → 우측 leg 전류 0 → **i(0)=0**,
 *     R_3·L 양단 강하도 0이므로 **v(0) = V_s·R_p/(R_s+R_p)**.
 *   · t≥0 (SW 개방): 전원 가지가 분리되고 **R_p + R_3 + C + L 직렬 무전원 RLC** 만 남는다.
 *     R = R_p + R_3 에 대해 `i'' + (R/L)i' + (1/LC)i = 0`, `i(0)=0`, `i'(0) = −v(0)/L`.
 *   · 값은 **임계제동**(α = R/2L = ω₀ = 1/√(LC), 즉 R²C = 4L)이 되도록 고른다 → 중근 s = −α.
 *     **i(t) = −(v₀/L)·t·e^(−αt)**,  **v(t) = v₀(1+αt)·e^(−αt)**
 *   원본(25V·10Ω·40Ω·60Ω·5H·2×10⁻³F): v(0)=20V·i(0)=0·α=10 → **i(t) = −4t·e^(−10t) [A]**
 *   (RK4 수치적분과 9자리 일치. i가 음수인 것은 커패시터 방전 전류가 그림의 기준 방향(↓)과 반대이기 때문.)
 */

export type SwRlcFreeValues = {
  Vs: number;   // 전압원 [V]
  Rs: number;   // 직렬 저항 [Ω]
  Rp: number;   // 션트 저항 [Ω]
  R3: number;   // 우측 직렬 저항 [Ω]
  L: number;    // 인덕턴스 [H]
  C: number;    // 커패시턴스 [F]
  alpha: number; // 감쇠 계수 = R/(2L) = ω₀ (임계제동)
  vsLabel: string; rsLabel: string; rpLabel: string; r3Label: string;
  lLabel: string; cLabel: string;
};

export type SwRlcFreeAnswer = {
  v0: number;      // v(0⁻) [V]
  i0: number;      // i(0⁻) [A] (= 0)
  R: number;       // t≥0 루프 총 저항
  ip0: number;     // i'(0⁺) [A/s] = −v0/L
  odeText: string; // 2차 미분방정식
  iText: string;   // i(t)
  vText: string;   // v(t)
};

const SUP: Record<number, string> = { 2: "⁻²", 3: "⁻³", 4: "⁻⁴", 5: "⁻⁵" };

/**
 * `2×10⁻³[F]` 형태의 라벨.
 *
 * ★ 가수는 **두 자리 이하 정수**만 인정한다 — 그러지 않으면 `125×10⁻⁵[F]` 같은 지저분한 표기가
 *   그대로 문항에 나간다(실측). 조건을 만족하는 지수가 없으면 null → 값 풀에서 제외된다.
 */
function capLabel(C: number): string | null {
  for (const e of [2, 3, 4, 5]) {
    const n = C * 10 ** e;
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      const r = Math.round(n);
      if (r >= 1 && r <= 99) return `${r}×10${SUP[e]}[F]`;
      return null; // 세 자리 이상 가수는 거른다 (더 큰 지수로 가도 자릿수만 늘어난다)
    }
  }
  return null;
}
const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(4))));

function buildSpace(): SwRlcFreeValues[] {
  const out: SwRlcFreeValues[] = [];
  for (const Rp of [20, 30, 40, 50, 60, 80]) {
    for (const R3 of [20, 40, 60, 80, 100, 120]) {
      const R = Rp + R3;
      for (const alpha of [5, 10, 20, 25, 50]) {
        const L = R / (2 * alpha);
        const C = 2 / (alpha * R);
        // L·C가 표기하기 깔끔한 값이어야 한다.
        if (!(Math.abs(L * 2 - Math.round(L * 2)) < 1e-9) || L < 1 || L > 20) continue;
        const cLab = capLabel(C);
        if (cLab === null) continue; // 가수가 두 자리를 넘는 커패시턴스는 제외 (표기가 지저분)
        for (const Rs of [10, 20, 25, 40]) {
          for (const Vs of [20, 25, 30, 40, 50, 60]) {
            const v0 = (Vs * Rp) / (Rs + Rp);
            if (!Number.isInteger(v0) || v0 < 5 || v0 > 60) continue;
            const ip0 = -v0 / L;
            if (Math.abs(ip0 * 2 - Math.round(ip0 * 2)) > 1e-9) continue; // 0.5 배수
            // 원본 튜플 제외
            if (Vs === 25 && Rs === 10 && Rp === 40 && R3 === 60 && alpha === 10) continue;
            out.push({
              Vs, Rs, Rp, R3, L, C, alpha,
              vsLabel: `${Vs}[V]`, rsLabel: `${Rs}[Ω]`, rpLabel: `${Rp}[Ω]`, r3Label: `${R3}[Ω]`,
              lLabel: `${num(L)}[H]`, cLabel: cLab,
            });
          }
        }
      }
    }
  }
  return out;
}

const SPACE = buildSpace();

function pick(seed: number, mode: string): SwRlcFreeValues {
  const half = Math.floor(SPACE.length / 2);
  const pool = mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return pool[Math.abs(Math.floor(seed * 2654435761)) % pool.length];
}

/**
 * 문제 1개 생성 — 값 + 닫힌형 정답.
 *
 * @param args.seed 결정론 시드 · args.mode 생성 모드(유사=i(t), 변형=v(t))
 */
export function generateSwitchedRlcSourceFree(args: { seed: number; mode: string }): {
  values: SwRlcFreeValues;
  answer: SwRlcFreeAnswer;
} {
  const v = pick(args.seed, args.mode);
  const R = v.Rp + v.R3;
  const v0 = (v.Vs * v.Rp) / (v.Rs + v.Rp);
  const ip0 = -v0 / v.L;
  const a = v.alpha;

  const odeText = `d²i/dt² + ${num(R / v.L)}·di/dt + ${num(1 / (v.L * v.C))}·i = 0  (특성근 s = −${a} 중근 → 임계제동)`;
  const iText = `i(t) = ${num(ip0)}·t·e^(−${a}t) [A]`;
  const vText = `v(t) = ${num(v0)}(1 + ${a}t)·e^(−${a}t) [V]`;

  return { values: v, answer: { v0, i0: 0, R, ip0, odeText, iText, vText } };
}
