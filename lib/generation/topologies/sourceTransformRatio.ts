/**
 * 전원 변환(source transformation) + 전압비 제약 → 미지 저항 도출 (임용 7번 형식).
 *
 *  원본 구조:
 *    (가) 전류원 I_s ∥ R_p  ──(직렬 R_m)──  R_a ∥ R_x(미지)   ← 전류원 폼
 *    (나) 전원변환 후: V_s ─ R_1 ─ R_2 ─ (R_a ∥ R_x)          ← 전압원 폼
 *         V_s = I_s·R_p,  R_1 = R_p,  R_2 = R_m
 *
 *  학생 단계:
 *    [단계1] (가)의 전류원 부분(I_s ∥ R_p)을 전원변환해 V_s 도출.
 *    [단계2] 전압비 V_1:V_2:V_3 = a:b:c 제약으로 R_x(=R_3) 도출.
 *    [단계3] 전체 전류 I와 R_x에 흐르는 전류 I_3 도출.
 *
 *  ★ generic perturbation 파이프라인은 전압비 전제(R_1:R_2 = a:b)를 랜덤화로 깨뜨려
 *    이 유형을 못 만든다. 전압비를 만족하도록 값을 결정론적으로 생성하는 전용 generator.
 *
 *  핵심 관계 (Ω·mA·V):
 *    R_p = a·s,  R_m = b·s,  P = R_a∥R_x = R_m·c/b = s·c   (s = 스케일)
 *    R_x = R_a·P/(R_a − P)            (R_a > P 필요)
 *    V_s = I_s·R_p / 1000
 *    I   = I_s·a/(a+b+c)              (전체 전류, V_s/(R_p+R_m+P) 와 동일)
 *    V_1 = I·R_p/1000, V_2 = I·R_m/1000, V_3 = I·P/1000   (V_1:V_2:V_3 = a:b:c)
 *    I_x = I·P/R_x,  I_a = I·P/R_a    (I_x + I_a = I)
 */

import type { CircuitComponent, CircuitNetlist, GenerationMode } from "@/types";
import { makeRand } from "./_helpers";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/generation/topologies/sourceTransformRatio");

export type SourceTransformRatioValues = {
  ratio: [number, number, number];
  I_s: number; // mA (전류원)
  R_p: number; // Ω (가의 병렬 R = 나의 R_1)
  R_m: number; // Ω (직렬 R = 나의 R_2)
  R_a: number; // Ω (고정 병렬 부하)
  R_x: number; // Ω (미지 — 학생 도출, =R_3)
  V_s: number; // V (전원변환 결과)
  I: number; // mA (전체)
  I_a: number; // mA (R_a 전류)
  I_x: number; // mA (R_x 전류 = I_3)
  V1: number;
  V2: number;
  V3: number; // V
  P: number; // Ω (R_a∥R_x)
};

export type SourceTransformRatioGeneration = {
  values: SourceTransformRatioValues;
  /** (가) 전류원 폼 — original_circuit */
  originalNetlist: CircuitNetlist;
  /** (나) 전압원 폼 — equivalent_circuit */
  equivalentNetlist: CircuitNetlist;
};

/** 최대공약수 — 전압비 정규화용 */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** [6,4,2] → [3,2,1] 정규화 */
function reduceRatio(r: [number, number, number]): [number, number, number] {
  const g = gcd(gcd(r[0], r[1]), r[2]);
  return [r[0] / g, r[1] / g, r[2] / g];
}

const SCALES = [160, 80, 40, 120, 200, 100, 60, 240, 50];
const I_S_CANDIDATES = [10, 12, 20, 8, 6, 15, 4, 16, 24, 5];
const R_A_CANDIDATES = [200, 240, 300, 400, 120, 150, 250, 320, 480, 360, 180, 500, 600];

type Candidate = SourceTransformRatioValues;

/** "예쁜" 수치인지 — 최대 소수 1째 자리, 양수, 합리적 범위 */
function isNice(x: number): boolean {
  if (!Number.isFinite(x) || x <= 0) return false;
  return Math.abs(x * 10 - Math.round(x * 10)) < 1e-6;
}

/**
 * 전압비를 만족하는 nice 값 조합을 모두 열거.
 *   - R_x 정수, R_a > P, 모든 전압·전류가 소수 1째 자리 이하.
 *   - canonical(원본 480/320/200/10mA) 조합을 우선순위 앞쪽에 둠.
 */
function enumerateCandidates(ratio: [number, number, number]): Candidate[] {
  const [a, b, c] = ratio;
  const sum = a + b + c;
  const out: Candidate[] = [];
  for (const I_s of I_S_CANDIDATES) {
    const I = (I_s * a) / sum;
    if (!isNice(I)) continue;
    for (const s of SCALES) {
      const R_p = a * s;
      const R_m = b * s;
      const P = s * c; // = R_m·c/b
      const V_s = (I_s * R_p) / 1000;
      if (!isNice(V_s)) continue;
      const V1 = (I * R_p) / 1000;
      const V2 = (I * R_m) / 1000;
      const V3 = (I * P) / 1000;
      if (![V1, V2, V3].every(isNice)) continue;
      for (const R_a of R_A_CANDIDATES) {
        if (R_a <= P) continue;
        const R_x = (R_a * P) / (R_a - P);
        if (!Number.isInteger(R_x) || R_x <= 0 || R_x > 6000) continue;
        const I_a = (I * P) / R_a;
        const I_x = (I * P) / R_x;
        if (!isNice(I_a) || !isNice(I_x)) continue;
        if (I_x <= 0) continue;
        out.push({
          ratio, I_s, R_p, R_m, R_a, R_x, V_s, I, I_a, I_x, V1, V2, V3, P,
        });
      }
    }
  }
  // canonical(원본과 유사한 큰 스케일·정수비)을 앞쪽으로: R_x가 R_a와 다르고, 스케일 큰 순.
  out.sort((x, y) => {
    const xt = x.R_x === x.R_a ? 1 : 0;
    const yt = y.R_x === y.R_a ? 1 : 0;
    if (xt !== yt) return xt - yt; // trivial(R_x=R_a) 뒤로
    return y.R_p - x.R_p; // 큰 스케일 먼저
  });
  return out;
}

/**
 * 전원변환 + 전압비 문제 생성.
 *   @param ratio  전압비 [a,b,c] (분석에서 추출, 예 [3,2,1])
 *   @param seed   결정론 시드
 *   @param mode   exam_similar/exam_variant — variant는 후보 풀에서 더 뒤쪽(다른 값) 선택
 */
export function generateSourceTransformRatio(args: {
  ratio: [number, number, number];
  seed?: number;
  mode?: GenerationMode;
}): SourceTransformRatioGeneration {
  const ratio = reduceRatio(args.ratio);
  const rand = makeRand(args.seed);
  const candidates = enumerateCandidates(ratio);
  if (candidates.length === 0) {
    // 비정상 비율(흔치 않음) — fallback로 [3,2,1] 사용.
    log.warn("no_candidates_for_ratio", { ratio });
    return generateSourceTransformRatio({ ...args, ratio: [3, 2, 1] });
  }
  // similar은 앞쪽(canonical 근처), variant는 풀 전체에서 분산 선택.
  const pickIdx =
    args.mode === "exam_variant"
      ? Math.floor(rand() * candidates.length)
      : Math.floor(rand() * Math.min(candidates.length, 6));
  const v = candidates[pickIdx];
  log.info("source_transform_ratio_generated", {
    ratio: v.ratio.join(":"),
    I_s: v.I_s, R_p: v.R_p, R_m: v.R_m, R_a: v.R_a, R_x: v.R_x,
    V_s: v.V_s, I: v.I, I_x: v.I_x,
  });

  return {
    values: v,
    originalNetlist: buildOriginalNetlist(v),
    equivalentNetlist: buildEquivalentNetlist(v),
  };
}

/** (가) 전류원 폼: I_s ∥ R_p — R_m(top) — R_a ∥ R_x(=R_3) */
function buildOriginalNetlist(v: SourceTransformRatioValues): CircuitNetlist {
  const components: CircuitComponent[] = [
    {
      id: "I_s", type: "I", value: `${v.I_s}mA`,
      pins: [
        { id: "p", node: "n_top", side: "top", role: "positive" },
        { id: "n", node: "GND", side: "bottom", role: "negative" },
      ],
    },
    {
      id: "R_p", type: "R", value: `${v.R_p}Ω`,
      pins: [
        { id: "p", node: "n_top", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "R_m", type: "R", value: `${v.R_m}Ω`,
      pins: [
        { id: "p", node: "n_top", side: "left" },
        { id: "n", node: "n_mid", side: "right" },
      ],
    },
    {
      id: "R_a", type: "R", value: `${v.R_a}Ω`,
      pins: [
        { id: "p", node: "n_mid", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "R_x", type: "R", value: "R_3",
      pins: [
        { id: "p", node: "n_mid", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
  ];
  return { components, ground: "GND", archetype: "SOURCE_TRANSFORM_CURRENT" };
}

/** (나) 전압원 폼: V_s — R_1 — R_2 — R_a ∥ R_x(=R_3). V_s·R_1·R_2는 학생이 (가)에서 도출 */
function buildEquivalentNetlist(v: SourceTransformRatioValues): CircuitNetlist {
  const components: CircuitComponent[] = [
    {
      id: "V_s", type: "V", value: "V_s",
      pins: [
        { id: "p", node: "n_s", side: "top", role: "positive" },
        { id: "n", node: "GND", side: "bottom", role: "negative" },
      ],
    },
    {
      id: "R_1", type: "R", value: "R_1",
      pins: [
        { id: "p", node: "n_s", side: "left" },
        { id: "n", node: "n_a", side: "right" },
      ],
    },
    {
      id: "R_2", type: "R", value: "R_2",
      pins: [
        { id: "p", node: "n_a", side: "left" },
        { id: "n", node: "n_mid", side: "right" },
      ],
    },
    {
      id: "R_a", type: "R", value: `${v.R_a}Ω`,
      pins: [
        { id: "p", node: "n_mid", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "R_x", type: "R", value: "R_3",
      pins: [
        { id: "p", node: "n_mid", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
  ];
  return {
    components,
    ground: "GND",
    archetype: "SOURCE_TRANSFORM_VOLTAGE",
    nodeAnnotations: [
      { node: "n_mid", label: "V_3", style: "label_only", role: "right_unknown" },
    ],
  };
}
