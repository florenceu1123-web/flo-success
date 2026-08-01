/**
 * 독립 전원 + 종속 전원 슈퍼노드에서 **파라미터 a에 대한 소비 전력 최대화** (임용 6번 회로이론)
 * 전용 archetype.
 *
 * 원본 구조 (고정):
 *      A ──R_a── M ──R_a── B          위: 두 저항이 모두 a[Ω]
 *      A ─────── E(◇) ──── B          종속 전압원 CCVS: V_B − V_A = m·I_x
 *      A ──R_x── GND                  I_x가 흐르는 저항 (수치, 예 2Ω)
 *      M ──V_s── GND                  독립 전압원 a[V]
 *      B ──R_B── GND                  부하 R_B = k·a[Ω]  ← 이 저항의 전력을 최대화
 *
 * ★ 왜 전용 archetype인가:
 *   universal 경로(기호 파라미터 + 종속원)로 처리하려면 Vision이 **연결까지** 정확히 읽어야
 *   하는데, 실측에서 회차마다 연결이 흔들려(3회 중 1회만 원본 일치) 안정적으로 생성되지 않았다.
 *   전용 archetype은 토폴로지를 코드가 알고 있으므로 그림 인식 정확도에 의존하지 않는다.
 *   (universal 확장 자체는 남겨 둔다 — 다른 파라미터 회로에 계속 쓰인다.)
 *
 * 물리 (수기·수치해 양쪽 검증):
 *   I_x = V_A / R_x,  슈퍼노드 조건 V_B − V_A = m·I_x  →  V_B = β·V_A,  β = 1 + m/R_x
 *   슈퍼노드 KCL:  V_A/R_x + (V_A−a)/a + (V_B−a)/a + V_B/(k a) = 0
 *     →  V_A = 2a·R_x / (a + C·R_x),   C = 1 + β + β/k
 *     →  V_B = β·V_A,   P_B = V_B²/(k a) = 4a·β²R_x² / [k (a + C R_x)²]
 *   dP_B/da = 0  →  **a* = C·R_x**,  **P_M = β²R_x / (k C)**
 *   원본(R_x=2, m=2, k=2): β=2, C=4 → V_B = 8a/(a+8), P_B = 32a/(a+8)², a*=8Ω, P_M=1W ✅
 */
import type { GenerationMode } from "@/types";

export type SupernodeDepMaxPowerParams = {
  /** I_x가 흐르는 저항 [Ω] */
  rx: number;
  /** 종속 전압원 계수 — V_B − V_A = m·I_x */
  m: number;
  /** 부하 계수 — R_B = k·a [Ω] */
  k: number;
};

export type SupernodeDepMaxPowerInstance = {
  params: SupernodeDepMaxPowerParams;
  /** V_B = (vbNum·a)/(a + aStar) 형태의 분자 계수 */
  vbNum: number;
  /** P_B = (pbNum·a)/(a + aStar)² 형태의 분자 계수 */
  pbNum: number;
  /** 전력이 최대가 되는 a [Ω] */
  aStar: number;
  /** 그때의 최대 전력 [W] */
  pMax: number;
};

/** 계수로부터 닫힌형 해를 계산한다. */
export function solveSupernodeDepMaxPower(p: SupernodeDepMaxPowerParams): SupernodeDepMaxPowerInstance {
  const beta = 1 + p.m / p.rx;
  const C = 1 + beta + beta / p.k;
  const aStar = C * p.rx;
  const pMax = (beta * beta * p.rx) / (p.k * C);
  return {
    params: p,
    vbNum: 2 * beta * p.rx,            // V_B = 2βR_x·a / (a + C R_x)
    pbNum: (4 * beta * beta * p.rx * p.rx) / p.k, // P_B = 4β²R_x²/k · a / (a + C R_x)²
    aStar,
    pMax,
  };
}

const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;
/** 답으로 쓰기 깔끔한 값인가 — 정수이거나 분모가 작은 유리수. */
const isClean = (v: number) => [1, 2, 4, 5].some((d) => Math.abs(v * d - Math.round(v * d)) < 1e-9);

/** 원본 튜플 — 유사·변형 모두 이 조합은 내지 않는다. */
const ORIGINAL: SupernodeDepMaxPowerParams = { rx: 2, m: 2, k: 2 };

/**
 * 규칙 열거 + 필터로 후보를 만든다 (저장소 관례).
 * 계수·해가 모두 깔끔하고 원본과 다른 조합만 남긴다.
 */
export const SUPERNODE_DEP_SPACE: SupernodeDepMaxPowerInstance[] = (() => {
  const out: SupernodeDepMaxPowerInstance[] = [];
  for (const rx of [1, 2, 3, 4, 5, 6]) {
    for (const m of [1, 2, 3, 4, 5, 6, 8]) {
      for (const k of [1, 2, 3, 4]) {
        const inst = solveSupernodeDepMaxPower({ rx, m, k });
        const beta = 1 + m / rx;
        if (!isInt(beta)) continue;              // β가 정수여야 식이 깔끔하다
        if (!isInt(inst.aStar)) continue;        // 최대점 a*는 정수
        if (inst.aStar < 2 || inst.aStar > 40) continue;
        if (!isClean(inst.pMax) || inst.pMax <= 0) continue;
        if (!isInt(inst.vbNum) || !isClean(inst.pbNum)) continue;
        if (rx === ORIGINAL.rx && m === ORIGINAL.m && k === ORIGINAL.k) continue; // 원본 제외
        out.push(inst);
      }
    }
  }
  return out;
})();

/** 소수 꼬리를 없앤 표기. */
export function num(v: number): string {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return String(r);
  // 1/2·1/4 같은 간단한 분수는 분수로 (답 표기 관례)
  for (const d of [2, 4, 5]) {
    const n = Math.round(v * d);
    if (Math.abs(v - n / d) < 1e-9) return `${n}/${d}`;
  }
  return String(Number(v.toFixed(4)));
}

/** 저항 표기 — 계수 1이면 "a", 아니면 "2a". */
export function coefA(k: number): string {
  return k === 1 ? "a" : `${num(k)}a`;
}

/** 모드별 후보를 고른다 (유사·변형 풀 분리 — 같은 문제가 나오지 않게). */
export function pickInstance(mode: GenerationMode, seed: number): SupernodeDepMaxPowerInstance {
  const space = SUPERNODE_DEP_SPACE;
  if (space.length === 0) return solveSupernodeDepMaxPower({ rx: 3, m: 3, k: 2 });
  const half = Math.ceil(space.length / 2);
  const pool = mode === "exam_variant" ? space.slice(half) : space.slice(0, half);
  const use = pool.length > 0 ? pool : space;
  return use[Math.abs(seed) % use.length];
}
