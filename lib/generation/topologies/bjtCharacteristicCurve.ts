import type { CharacteristicCurveDiagram, CircuitTypeParams, GenerationMode } from "@/types";
import { makeRand } from "./_helpers";

/**
 * BJT/MOSFET 출력특성곡선 — 영역 식별 + 스위칭 동작(ON/OFF) 문제 generator.
 *
 *  원본 임용 형식:
 *   그림에 BJT의 I_C-V_CE 다중 곡선(I_B 별)이 도시. ㉠ ㉡ 영역에 marker.
 *   학생이 풀 것:
 *     - 각 영역의 명칭 (예: ㉠=포화영역, ㉡=차단영역)
 *     - 각 영역에서 BJT의 스위칭 동작 (ON/OFF)
 *
 *  변형(exam_variant) 가능 축:
 *   1) device: BJT(I_C-V_CE-I_B) ↔ MOSFET(I_D-V_DS-V_GS).
 *      MOSFET 변형은 region {triode, saturation, cutoff} 명칭 자동 전환.
 *   2) marker 짝 (㉠/㉡): {saturation, cutoff} | {saturation, active} | {active, cutoff} 중 무작위.
 *      exam_similar는 원본과 동일 짝({saturation, cutoff}) 고정.
 *
 *  결과:
 *   - diagram: CharacteristicCurveDiagram (renderer가 SVG 변환).
 *   - regionAnswers: 학생 정답 — marker → {name, switchState}.
 */

export type CharacteristicCurveGeneration = {
  diagram: CharacteristicCurveDiagram;
  values: {
    device: "bjt" | "mosfet";
    /** 곡선 개수 (I_B=0 포함, 보통 7개) */
    curveCount: number;
  };
  /** marker별 정답 — 영역 명칭(한글) + ON/OFF 동작 */
  regionAnswers: Array<{
    marker: string;
    region: "saturation" | "active" | "cutoff" | "triode";
    nameKr: string;        // "포화 영역" 등
    nameEn: string;        // "saturation" 등 — 풀이 텍스트용
    switchState: "ON" | "OFF" | "ON(선형)" | "ON(증폭)";
  }>;
};

const BJT_REGION_NAME: Record<"saturation" | "active" | "cutoff", { kr: string; en: string; sw: "ON" | "OFF" | "ON(선형)" | "ON(증폭)" }> = {
  saturation: { kr: "포화 영역", en: "saturation region", sw: "ON" },
  active: { kr: "활성 영역", en: "active region", sw: "ON(증폭)" },
  cutoff: { kr: "차단 영역", en: "cutoff region", sw: "OFF" },
};

const MOSFET_REGION_NAME: Record<"triode" | "saturation" | "cutoff", { kr: string; en: string; sw: "ON" | "OFF" | "ON(선형)" | "ON(증폭)" }> = {
  triode: { kr: "선형(트라이오드) 영역", en: "triode (linear) region", sw: "ON(선형)" },
  saturation: { kr: "포화 영역", en: "saturation region", sw: "ON(증폭)" },
  cutoff: { kr: "차단 영역", en: "cutoff region", sw: "OFF" },
};

/** ㉠ ㉡ ㉢ — 한국어 marker 시퀀스 */
const MARKERS = ["㉠", "㉡", "㉢"];

type RegionPair = ["saturation" | "active" | "cutoff" | "triode", "saturation" | "active" | "cutoff" | "triode"];
type Variant = { device: "bjt" | "mosfet"; pair: RegionPair };

/**
 * exam_similar / exam_variant 모드별 variant 목록 — index로 라운드로빈 선택.
 *
 *  - exam_similar(BJT만, 3 variant): 원본 짝(포화/차단)을 idx 0에 두어 count=1일 때 원본 재현.
 *  - exam_variant(BJT+MOSFET, 6 variant): BJT 3 + MOSFET 3, idx 0은 여전히 원본 짝.
 *
 *  count > variantCount(3 또는 6)이면 cycle. 보통 임용 학습용 count ≤ 5이므로 충분.
 */
const SIMILAR_VARIANTS: Variant[] = [
  { device: "bjt", pair: ["saturation", "cutoff"] }, // 원본 임용 4번
  { device: "bjt", pair: ["saturation", "active"] },
  { device: "bjt", pair: ["active", "cutoff"] },
];
const VARIANT_VARIANTS: Variant[] = [
  { device: "bjt", pair: ["saturation", "cutoff"] }, // 원본 임용 4번 — idx 0 보존
  { device: "mosfet", pair: ["triode", "saturation"] },
  { device: "bjt", pair: ["active", "cutoff"] },
  { device: "mosfet", pair: ["triode", "cutoff"] },
  { device: "bjt", pair: ["saturation", "active"] },
  { device: "mosfet", pair: ["saturation", "cutoff"] },
];

export function generateBjtCharacteristicCurve(args: {
  params?: CircuitTypeParams;
  mode?: GenerationMode;
  seed?: number;
  /** 라운드로빈 인덱스 — 같은 batch 안에서 distinct variant 보장. pipeline의 generateInParallel `i`. */
  index?: number;
}): CharacteristicCurveGeneration {
  const rand = makeRand(args.seed);
  const mode = args.mode ?? "exam_variant";

  // ── variant 선택 (라운드로빈) ─────────────────────
  //   index가 주어지면 그대로 사용, 아니면 seed 기반 무작위.
  const pool = mode === "exam_similar" ? SIMILAR_VARIANTS : VARIANT_VARIANTS;
  const idx = typeof args.index === "number"
    ? ((args.index % pool.length) + pool.length) % pool.length
    : Math.floor(rand() * pool.length);
  const variant = pool[idx];
  const device = variant.device;
  const chosen: RegionPair = variant.pair;

  // ── 곡선 개수 ─────────────────────────────────────
  //   원본은 I_B=0 + I_B1~I_B6 (7개). 결정론적으로 7개 고정 — figure JSON에 noise 추가하면
  //   같은 정답을 가진 두 문제가 dedup에서 distinct로 잡혀 라운드로빈을 무효화하므로 고정.
  const curveCount = 7;

  // 곡선들 plateau 값 — 위에서 아래로 (큰 plateau → 작은 plateau, 마지막은 I_B=0이라 0)
  const curves = buildCurves(device, curveCount);

  // regions — ㉠ ㉡ marker 부여
  const regions: CharacteristicCurveDiagram["regions"] = chosen.map((r, i) => ({
    marker: MARKERS[i] ?? `(${i + 1})`,
    region: r as "saturation" | "active" | "cutoff" | "triode",
  }));

  // 정답 매핑
  const regionAnswers = regions.map((r) => {
    if (device === "bjt") {
      const info = BJT_REGION_NAME[r.region as "saturation" | "active" | "cutoff"];
      return {
        marker: r.marker,
        region: r.region,
        nameKr: info.kr,
        nameEn: info.en,
        switchState: info.sw,
      };
    }
    const info = MOSFET_REGION_NAME[r.region as "triode" | "saturation" | "cutoff"];
    return {
      marker: r.marker,
      region: r.region,
      nameKr: info.kr,
      nameEn: info.en,
      switchState: info.sw,
    };
  });

  const diagram: CharacteristicCurveDiagram = {
    device,
    curves,
    regions,
    xLabel: device === "bjt" ? "V_CE" : "V_DS",
    yLabel: device === "bjt" ? "I_C" : "I_D",
  };

  return {
    diagram,
    values: { device, curveCount },
    regionAnswers,
  };
}

/**
 * 곡선들의 plateau 값 — 가장 위 곡선은 max, 가장 아래(I_B=0 또는 V_GS<V_TH)는 0.
 * 사이에 6개의 단조 감소 plateau (0.95 ~ 0.10). 결정론적(seed 무관).
 */
function buildCurves(
  device: "bjt" | "mosfet",
  count: number,
): CharacteristicCurveDiagram["curves"] {
  const plateauTop = 0.95;
  const plateauBottomNonZero = 0.12;
  const inner = count - 1; // 마지막은 0 (I_B=0)
  const step = (plateauTop - plateauBottomNonZero) / Math.max(inner - 1, 1);
  const knee = 0.08;

  const curves: CharacteristicCurveDiagram["curves"] = [];
  for (let i = 0; i < inner; i++) {
    const plateau = Number((plateauTop - step * i).toFixed(3));
    const label = device === "bjt" ? `I_B${inner - i}` : `V_GS${inner - i}`;
    curves.push({ label, plateau, knee });
  }
  // 가장 아래 — I_B=0 또는 V_GS<V_TH (cutoff trace)
  curves.push({
    label: device === "bjt" ? "I_B=0" : "V_GS<V_TH",
    plateau: 0,
    knee,
  });
  return curves;
}
