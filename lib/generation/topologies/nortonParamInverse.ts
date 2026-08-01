/**
 * 노튼 등가 + 파라미터 역산 (임용 5번 회로이론) 전용 archetype.
 *
 * 원본 구조 (고정, 독립 전원만 — 종속 전원 없음):
 *        ┌──────── I_s(→) ────────┐
 *        P ────── R_top(a) ────── Q ──o A
 *   V_s ─┤        (I_s 는 R_top 과 병렬)  │
 *   R_p ─┤                        R_mid(2a)
 *        R ────── R_bot(a) ────── S ──o B
 *   · V_s 와 R_p(2Ω)는 P–R 사이(좌측 세로, 서로 병렬)
 *   · A–B 에 부하 R_L 을 달았을 때 I_L 이 목표값이 되도록 하는 a 를 구한다.
 *
 * 물리 (손계산 + MNA 5점 대조 완료):
 *   [1] 전류원 개방 → I_N1 = V_s / (2a)        (P→a→Q 단락→a→R, 총 2a)
 *   [2] 전압원 단락 → I_N2 = I_s / 2           (a 와 무관)
 *       I_N = I_N1 + I_N2 = (V_s + I_s·a) / (2a)
 *   [3] R_N = (2a ∥ 2a) = a
 *       I_L = I_N · R_N/(R_N + R_L) = (V_s + I_s·a) / (2(a + R_L))
 *       → **a = (2·T·R_L − V_s) / (I_s − 2T)**   (T = 목표 전류)
 *   원본(V_s=4, I_s=4, R_L=4, T=1) → a = 2 Ω ✅
 *
 * ★ R_p(2Ω)는 이상 전압원과 병렬이라 외부 회로에 영향을 주지 않는다(원본의 distractor).
 *   값 자체는 원본을 따라 유지한다.
 */
import type { GenerationMode } from "@/types";

export type NortonParams = {
  /** 독립 전압원 [V] */
  vs: number;
  /** 독립 전류원 [A] */
  is: number;
  /** 전압원과 병렬인 저항 [Ω] — 외부에 영향 없음(distractor) */
  rp: number;
  /** 부하 저항 [Ω] */
  rl: number;
  /** 목표 부하 전류 [A] */
  target: number;
};

export type NortonInstance = {
  params: NortonParams;
  /** 조건을 만족하는 a [Ω] */
  aStar: number;
  /** 그때의 노튼 전류 [A] */
  iN: number;
  /** 그때의 노튼 저항 [Ω] (= a) */
  rN: number;
};

/** 닫힌형 해 — a = (2T·R_L − V_s)/(I_s − 2T). 해가 유효하지 않으면 null. */
export function solveNorton(p: NortonParams): NortonInstance | null {
  const denom = p.is - 2 * p.target;
  if (Math.abs(denom) < 1e-12) return null;
  const a = (2 * p.target * p.rl - p.vs) / denom;
  if (!(a > 0) || !Number.isFinite(a)) return null;
  const iN = (p.vs + p.is * a) / (2 * a);
  return { params: p, aStar: a, iN, rN: a };
}

const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;
const isClean = (v: number) => [1, 2, 4, 5].some((d) => Math.abs(v * d - Math.round(v * d)) < 1e-9);

/** 원본 튜플 — 유사·변형 모두 이 조합은 내지 않는다. */
const ORIGINAL = { vs: 4, is: 4, rl: 4, target: 1 };

/** 규칙 열거 + 필터 — a·I_N이 깔끔하고 원본과 다른 조합만. */
export const NORTON_SPACE: NortonInstance[] = (() => {
  const out: NortonInstance[] = [];
  for (const vs of [2, 4, 6, 8, 10, 12]) {
    for (const is of [3, 4, 5, 6, 8]) {
      for (const rl of [2, 3, 4, 5, 6, 8]) {
        for (const target of [1, 2]) {
          const inst = solveNorton({ vs, is, rp: 2, rl, target });
          if (!inst) continue;
          if (!isInt(inst.aStar) || inst.aStar < 1 || inst.aStar > 12) continue;
          if (!isClean(inst.iN)) continue;
          // I_N1·I_N2가 각각 깔끔해야 단계별 답도 깔끔하다.
          if (!isClean(vs / (2 * inst.aStar)) || !isClean(is / 2)) continue;
          if (vs === ORIGINAL.vs && is === ORIGINAL.is && rl === ORIGINAL.rl && target === ORIGINAL.target) continue;
          out.push(inst);
        }
      }
    }
  }
  return out;
})();

/** 소수 꼬리 없는 표기 (간단한 분수는 분수로). */
export function num(v: number): string {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return String(r);
  for (const d of [2, 4, 5]) {
    const n = Math.round(v * d);
    if (Math.abs(v - n / d) < 1e-9) return `${n}/${d}`;
  }
  return String(Number(v.toFixed(4)));
}

/** 계수 1이면 생략 — "a" vs "2a". */
export function coefA(k: number): string {
  return k === 1 ? "a" : `${num(k)}a`;
}

/** 모드별 후보 (유사·변형 풀 분리). */
export function pickNorton(mode: GenerationMode, seed: number): NortonInstance {
  const space = NORTON_SPACE;
  if (space.length === 0) return solveNorton({ vs: 6, is: 4, rp: 2, rl: 4, target: 1 })!;
  const half = Math.ceil(space.length / 2);
  const pool = mode === "exam_variant" ? space.slice(half) : space.slice(0, half);
  const use = pool.length > 0 ? pool : space;
  return use[Math.abs(seed) % use.length];
}
