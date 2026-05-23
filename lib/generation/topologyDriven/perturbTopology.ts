import type { GenerationMode, TopologySignature } from "@/types";
import { parseValue } from "./parseValue";

/**
 * Topology의 component value를 mode 정책에 따라 결정론적으로 perturb한다.
 *
 *  exam_similar: 모든 numeric value를 ±20~40% 범위에서 변형 (정수 보존, "nice" rounding).
 *  exam_variant: exam_similar + 1~2개 component type swap (R↔I 같은 family-changing 변형은 금지,
 *                R 값을 더 큰 폭(±50~80%)으로만 변경 — V/I source는 ±30%로 보수적).
 *
 *  options.polarityFlipIndices: 지정한 (전역 V/I 소스 0-base index) 소스의 부호를 반전.
 *    analysis가 GPT-Vision으로부터 극성(화살표·+/-)을 신뢰 있게 못 뽑은 경우, pipeline이
 *    rejection sampling 중 enumerate한다. 토폴로지는 동일, 단지 값 부호만 바뀜.
 *
 *  seed로 결정론 perturbation. 같은 seed + 같은 polarityFlipIndices면 같은 결과.
 */
export function perturbTopology(
  topology: TopologySignature,
  mode: GenerationMode,
  seed: number,
  options?: { polarityFlipIndices?: ReadonlySet<number> },
): TopologySignature {
  const rand = makeSeededRand(seed);
  const flip = options?.polarityFlipIndices;
  let sourceCounter = 0;
  return {
    ...topology,
    branches: topology.branches.map((branch) => ({
      ...branch,
      components: branch.components.map((c) => {
        const parsed = parseValue(c.value);
        if (!parsed || !Number.isFinite(parsed.numeric)) return c;
        const t = (c.type ?? "").toUpperCase();
        const isSource = t === "V" || t === "I" || t === "VS" || t === "IS";
        let newNumeric = perturbNumeric(parsed.numeric, c.type, mode, rand);
        if (isSource) {
          const idx = sourceCounter++;
          if (flip?.has(idx)) newNumeric = -newNumeric;
        }
        return { ...c, value: formatBack(newNumeric, parsed.suffix, c.value) };
      }),
    })),
  };
}

/**
 * Topology에서 V/I 소스의 (등장 순서 기준) 0-base index 목록을 추출.
 * pipeline이 polarity 폴리아미가 일어났을 때 enumerate할 후보를 산출.
 */
export function listSourceIndices(topology: TopologySignature): number[] {
  const indices: number[] = [];
  let i = 0;
  for (const b of topology.branches) {
    for (const c of b.components) {
      const t = (c.type ?? "").toUpperCase();
      if (t === "V" || t === "I" || t === "VS" || t === "IS") {
        indices.push(i);
        i++;
      }
    }
  }
  return indices;
}

/** Nice value 풀 — exam_similar 모드에서 perturb 후 snap. */
const NICE_RESISTORS_EXT = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20, 22, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250];
const NICE_VOLTAGES_EXT = [3, 5, 6, 9, 10, 12, 15, 18, 20, 24, 30, 36, 48, 60];
const NICE_CURRENTS_EXT = [0.1, 0.2, 0.3, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5];

function nearestNice(target: number, pool: number[]): number {
  if (target <= 0 || pool.length === 0) return target;
  let best = pool[0];
  let bestDist = Math.abs(target - pool[0]);
  for (const v of pool) {
    const d = Math.abs(target - v);
    if (d < bestDist) { bestDist = d; best = v; }
  }
  return best;
}

function perturbNumeric(
  original: number,
  type: string,
  mode: GenerationMode,
  rand: () => number,
): number {
  const t = (type ?? "").toUpperCase();
  const isResistor = t === "R";
  const isSource = t === "V" || t === "I";
  const isReactive = t === "L" || t === "C";

  // ★ exam_similar — 원본 거의 그대로: 매우 좁은 perturb (±5%) + nice value snap.
  //   대부분의 값은 nice 풀에서 원본으로 그대로 snap → 원본 동일.
  //   variant와의 구분: variant는 ±15%로 noticeable 차이.
  if (mode === "exam_similar" && !isReactive) {
    const range = isResistor ? [0.95, 1.05] : isSource ? [0.97, 1.03] : [0.97, 1.03];
    const factor = range[0] + rand() * (range[1] - range[0]);
    const scaled = original * factor;
    const pool = isResistor ? NICE_RESISTORS_EXT
      : t === "V" ? NICE_VOLTAGES_EXT
      : t === "I" ? NICE_CURRENTS_EXT
      : NICE_RESISTORS_EXT;
    return nearestNice(scaled, pool);
  }

  // exam_variant 또는 L/C — 기존 동작 (넓은 perturb)
  const range = mode === "exam_variant"
    ? isResistor ? [0.5, 1.8] : isSource ? [0.7, 1.4] : isReactive ? [0.85, 1.18] : [0.8, 1.25]
    : isResistor ? [0.7, 1.5] : isSource ? [0.8, 1.25] : isReactive ? [0.9, 1.12] : [0.85, 1.18];
  const factor = range[0] + rand() * (range[1] - range[0]);
  const scaled = original * factor;
  if (!Number.isFinite(scaled) || scaled === 0) return scaled;
  const sign = Math.sign(scaled);
  const abs = Math.abs(scaled);
  const exp = Math.floor(Math.log10(abs));
  if (!isReactive && abs >= 10) return sign * Math.round(abs);
  if (!isReactive && abs >= 1) return sign * Math.round(abs * 10) / 10;
  const sigDigits = 3;
  const mult = Math.pow(10, sigDigits - 1 - exp);
  return sign * Math.round(abs * mult) / mult;
}

function formatBack(num: number, suffix: string | undefined, original: unknown): string {
  // suffix가 있으면 그대로 붙임, 없으면 원본 string에서 단위 추출
  if (suffix) return `${num}${suffix}`;
  if (typeof original === "string") {
    const match = original.match(/[a-zA-ZΩμ\s]+$/);
    if (match) return `${num}${match[0]}`;
  }
  return String(num);
}

function makeSeededRand(seed: number): () => number {
  // xorshift32
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}
