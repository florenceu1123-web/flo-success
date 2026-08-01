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

/**
 * ★ 하위 구조 (2026-07-30 추가) — 같은 출력특성곡선 figure를 쓰지만 **묻는 것이 완전히 다르다**.
 *
 *  - "region_naming"      (기존): ㉠·㉡ 두 영역의 명칭 + 스위칭 동작(ON/OFF) 단일 문항.
 *  - "pinch_off_procedure"(임용 6번, 신규): **〈해석 절차〉 3단계** — [1] 채널 타입과 이유,
 *      [2] 포화 시작점을 잇는 점선의 의미 → **V_DS = V_GS − V_T** 관계식, [3] ㉠에 해당하는
 *      채널 상태 용어(**핀치오프**). figure는 **V_GS 수치 라벨 + 점선 궤적 + ㉠ 단일 marker**.
 *
 *  ★ 새 archetype이 아니라 **기존 archetype의 하위 구조**로 흡수했다([[feedback_universal_path]]).
 *    figure 종류(characteristic_curve)·device 판별·렌더러가 전부 같고, 발문 구조만 다르기 때문.
 *    (선례: dielectric_two_region_cap의 series/parallel/potential_distribution 3하위구조.)
 */
export type CurveStructure = "region_naming" | "pinch_off_procedure";

/** [단계 1] 답이 되는 채널 타입 — 증가형/공핍형이 exam_similar/exam_variant를 가른다. */
export type ChannelKind = "n_enhancement" | "n_depletion";

export type CharacteristicCurveGeneration = {
  diagram: CharacteristicCurveDiagram;
  structure: CurveStructure;
  values: {
    device: "bjt" | "mosfet";
    /** 곡선 개수 (I_B=0 포함, 보통 7개) */
    curveCount: number;
    /** pinch_off_procedure 전용 — 곡선에 표기된 V_GS 수치 [V] (위에서 아래) */
    vgsValues?: number[];
    /** pinch_off_procedure 전용 — 채널 타입 */
    channelKind?: ChannelKind;
  };
  /** pinch_off_procedure 전용 — 3단계 정답 */
  procedureAnswers?: {
    marker: string;         // "㉠"
    channelKr: string;      // "n채널 증가형(enhancement) MOSFET"
    channelReason: string;  // 단계 1 이유
    relation: string;       // "V_DS = V_GS − V_T"
    termKr: string;         // "핀치오프(pinch-off)"
    termReason: string;     // 단계 3 이유
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

/**
 * ★ pinch_off_procedure 값 공간 — 규칙 열거 + 필터 (예시 hardcode 금지).
 *   V_GS 수치는 등간격 양수열(증가형) 또는 0을 포함한 등간격열(공핍형).
 *   **원본 튜플(증가형 · +2/+4/+6/+8)은 제외**한다.
 */
function buildProcedureSpace(kind: ChannelKind): number[][] {
  const out: number[][] = [];
  for (const step of [1, 2, 3]) {
    for (const count of [4, 5]) {
      if (kind === "n_enhancement") {
        // 모두 양수, V_T보다 큰 값들 (0 < V_T < V_GS)
        const vals = Array.from({ length: count }, (_, i) => step * (i + 1));
        if (vals[vals.length - 1] > 15) continue;
        if (step === 2 && count === 4) continue;   // ★ 원본(+2·+4·+6·+8) 제외
        out.push(vals);
      } else {
        // 공핍형 — V_T < 0이라 V_GS = 0에서도 채널이 있고, 음수 V_GS까지 전류가 흐른다.
        const vals = Array.from({ length: count }, (_, i) => step * (i + 1) - step * 2);
        if (vals[vals.length - 1] > 12) continue;
        out.push(vals);
      }
    }
  }
  return out;
}

export function generateBjtCharacteristicCurve(args: {
  params?: CircuitTypeParams;
  mode?: GenerationMode;
  seed?: number;
  /** 라운드로빈 인덱스 — 같은 batch 안에서 distinct variant 보장. pipeline의 generateInParallel `i`. */
  index?: number;
  /** ★ 하위 구조 — 미지정 시 기존 동작(region_naming) */
  structure?: CurveStructure;
}): CharacteristicCurveGeneration {
  const rand = makeRand(args.seed);
  const mode = args.mode ?? "exam_variant";

  // ── ★ 하위 구조: 임용 6번 〈해석 절차〉형 (MOSFET 채널 타입 → V_DS=V_GS−V_T → 핀치오프) ──
  if (args.structure === "pinch_off_procedure") {
    return buildPinchOffProcedure({ mode, rand, index: args.index });
  }

  // ── variant 선택 (라운드로빈) ─────────────────────
  //   index가 주어지면 그대로 사용, 아니면 seed 기반 무작위.
  //   params.device 가 주어지면 (classifier가 원본 device를 식별한 경우) mode와 무관하게 그 device의 pool에서 pick.
  const requestedDevice = args.params?.device;
  let pool: Variant[];
  if (requestedDevice) {
    const allVariants = [...SIMILAR_VARIANTS, ...VARIANT_VARIANTS];
    const filtered = allVariants.filter((v) => v.device === requestedDevice);
    pool = filtered.length > 0
      ? filtered
      : (mode === "exam_similar" ? SIMILAR_VARIANTS : VARIANT_VARIANTS);
  } else {
    pool = mode === "exam_similar" ? SIMILAR_VARIANTS : VARIANT_VARIANTS;
  }
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
    structure: "region_naming",
    values: { device, curveCount },
    regionAnswers,
  };
}

/**
 * 임용 6번 — MOSFET 출력특성곡선 〈해석 절차〉 3단계 (결정론, GPT 없음).
 *
 *  exam_similar = **n채널 증가형(enhancement)** — 원본. V_GS가 모두 양수(0 < V_T < V_GS).
 *  exam_variant = **n채널 공핍형(depletion)** — V_T < 0이라 V_GS = 0·음수에서도 채널이 존재한다.
 *    (소자 종류 1개 변형 · 절차·figure 구조는 동일 → [단계 1]의 답과 이유가 달라진다.)
 */
function buildPinchOffProcedure(args: {
  mode: GenerationMode;
  rand: () => number;
  index?: number;
}): CharacteristicCurveGeneration {
  const kind: ChannelKind = args.mode === "exam_variant" ? "n_depletion" : "n_enhancement";
  const space = buildProcedureSpace(kind);
  const idx = typeof args.index === "number"
    ? ((args.index % space.length) + space.length) % space.length
    : Math.floor(args.rand() * space.length);
  const vgsValues = space[idx];              // 오름차순 (작은 → 큰)

  // ★ V_T는 **가장 작은 V_GS보다 반드시 작아야** 한다 — 같으면 그 곡선의 과전압이 0이 되어
  //   plateau=0인 곡선이 차단 trace와 겹친다(라벨까지 포개짐, 시각검증에서 발견).
  const step = vgsValues.length >= 2 ? vgsValues[1] - vgsValues[0] : 1;
  const vt = vgsValues[0] - step / 2;                  // 증가형: 0<V_T<V_GS / 공핍형: V_T<0
  const desc = [...vgsValues].sort((a, b) => b - a);   // 위에서 아래 (큰 V_GS → 작은)
  const ovs = desc.map((v) => Math.max(v - vt, 0));
  const rawSq = ovs.map((o) => (o / Math.max(...ovs)) ** 2);
  const rMin = Math.min(...rawSq), rMax = Math.max(...rawSq);
  const curves: CharacteristicCurveDiagram["curves"] = desc.map((v, i) => {
    const ratio = ovs[i] / Math.max(...ovs);
    // plateau ∝ (V_GS−V_T)² (제곱 법칙 — 위로 갈수록 간격이 넓어지는 실제 특성) 을
    // [0.14, 0.94]로 아핀 매핑 → 최하단 곡선도 차단 trace와 확실히 분리된다.
    const plateau = 0.14 + 0.80 * ((rawSq[i] - rMin) / Math.max(rMax - rMin, 1e-9));
    return {
      label: `V_GS = ${v > 0 ? "+" : ""}${v} [V]`,
      plateau: Number(plateau.toFixed(3)),
      // 포화 시작점 V_DS = V_GS − V_T 이므로 knee가 과전압에 비례 → 점선 궤적이 우상향한다.
      knee: Number((0.045 + 0.115 * ratio).toFixed(3)),
    };
  });
  // 차단 trace (V_GS < V_T)
  curves.push({ label: "V_GS < V_T", plateau: 0, knee: 0.05 });

  const diagram: CharacteristicCurveDiagram = {
    device: "mosfet",
    curves,
    regions: [],                     // ★ 영역 음영 없음 — 원본은 점선 궤적 + ㉠ 하나뿐
    xLabel: "V_DS",
    yLabel: "I_D",
    pinchOffLocus: { marker: MARKERS[0], markerAt: 0.85 },
  };

  const enhancement = kind === "n_enhancement";
  return {
    diagram,
    structure: "pinch_off_procedure",
    values: { device: "mosfet", curveCount: curves.length, vgsValues: desc, channelKind: kind },
    regionAnswers: [],
    procedureAnswers: {
      marker: MARKERS[0],
      channelKr: enhancement
        ? "n채널 증가형(enhancement형) MOSFET"
        : "n채널 공핍형(depletion형) MOSFET",
      channelReason: enhancement
        ? `게이트-소스 전압 V_GS가 **양(+)일 때만** 드레인 전류 I_D가 흐르고, V_GS가 커질수록 I_D가 증가한다. ` +
          `즉 문턱전압 V_T(> 0)를 넘겨야 반전층(채널)이 새로 형성되므로 **n채널 증가형**이다. ` +
          `(전자가 다수 캐리어라 I_D·V_DS가 모두 양의 방향이다.)`
        : `게이트-소스 전압 V_GS = 0에서도 드레인 전류 I_D가 흐르고, **음(−)의 V_GS**에서도 전류가 유지된다. ` +
          `즉 채널이 이미 만들어져 있고 V_T < 0이므로 **n채널 공핍형**이다. ` +
          `(V_GS를 음으로 키우면 채널이 좁아져 I_D가 줄어든다.)`,
      relation: "V_{DS} = V_{GS} - V_T",
      termKr: "핀치오프(pinch-off)",
      termReason:
        `점선의 오른쪽에서는 V_DS가 커져도 I_D가 거의 일정하다. 이 경계에서 드레인 쪽 채널 전압이 ` +
        `V_GD = V_GS − V_DS = V_T가 되어 **드레인 단에서 채널이 소멸(좁아져 끊김)** 한다. ` +
        `이 상태를 핀치오프라 하며, 그 이후를 포화 영역이라 한다.`,
    },
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
