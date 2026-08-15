import type { ComparatorDiodeOrCircuitDiagram, GenerationMode, WaveformDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 비교기 2개 + 다이오드 결합 + 풀다운/풀업 → 구간별 V_out·다이오드 ON/OFF (임용 3번 전자회로)
 * 전용 archetype. GPT 없음 — 이상적 비교기·이상적 다이오드 규칙으로 닫힌형 도출.
 *
 * ★★ 원본 판독(이미지 5배 확대, [[feedback_verify_wiring_by_zoom]]):
 *    · 위 OPAMP — **(−)에 +5[V], (+)에 V_in**  → V_in > 5일 때 +V_sat
 *    · 아래 OPAMP — **(−)에 V_in, (+)에 +2[V]** → V_in < 2일 때 +V_sat
 *    · 두 다이오드 모두 **애노드가 OPAMP 출력 쪽**, 캐소드가 공통 마디 V_out
 *    · V_out에 10[kΩ] **풀다운** 저항 → 접지
 *    (V_in을 어느 단자에 물리는지가 답을 가른다 — (+)/(−)를 바꿔 읽으면 정반대 답이 나온다.)
 *
 * ★ 동작(규칙): 이상적 다이오드는 순방향이면 단락·역방향이면 개방이므로 결선이 곧 최대/최소 선택이다.
 *    · `or_pulldown`(**원본**) : V_out = max(o₁, o₂, 0)      ⇒ 창(window) **밖** 검출
 *      - V_in > V_H  또는 V_in < V_L → V_out = +V_sat (해당 다이오드 ON)
 *      - V_L < V_in < V_H           → 두 출력 모두 −V_sat → **두 다이오드 OFF**, 풀다운으로 V_out = 0
 *    · `and_pullup`  : 다이오드 방향 반전 + 풀업(+V_CC) → V_out = min(o₁, o₂, V_CC) ⇒ 창 **안** 검출
 *
 * ★ 교육 포인트는 "창 안에서 두 다이오드가 모두 OFF가 되어 저항이 출력을 확정한다"는 것 —
 *   저항값 자체는 이상적 소자 가정에서 답에 들어가지 않는다(원본에서도 10kΩ는 답에 안 쓰인다).
 */

export type ComparatorDiodeConfig = "or_pulldown" | "and_pullup";

/** 한 구간(입력 전압 하나)에서의 회로 상태. */
export type IntervalState = {
  vin: number;
  /** 각 비교기의 포화 출력 [V] */
  outs: number[];
  /** 각 다이오드 ON/OFF */
  diodes: Array<"ON" | "OFF">;
  vout: number;
};

export type ComparatorDiodeOrGeneration = {
  values: {
    config: ComparatorDiodeConfig;
    vsat: number;      // 포화 출력 크기 (±vsat)
    vHigh: number;     // 위쪽 기준 전압
    vLow: number;      // 아래쪽 기준 전압
    rPull: number;     // 풀다운/풀업 저항 [kΩ]
    vA: number;        // 구간 ㉠ 입력
    vB: number;        // 구간 ㉡ 입력
  };
  answer: {
    /** 구간 ㉠ — 출력 전압 */
    voutA: number;
    /** 구간 ㉡ — 다이오드 상태 */
    diodesB: Array<"ON" | "OFF">;
    stateA: IntervalState;
    stateB: IntervalState;
    /** 비교기 동작 서술(구성에 따라 달라진다) */
    compDesc: string[];
    nodeRule: string;
  };
  circuitDiagram: ComparatorDiodeOrCircuitDiagram;
  waveform: WaveformDiagram;
};

type Family = {
  config: ComparatorDiodeConfig;
  vsat: number; vHigh: number; vLow: number; rPull: number; vA: number; vB: number;
};

/** 원본 튜플 (참조·검증 전용 — 생성 풀에서 제외). */
const ORIGINAL: Family = {
  config: "or_pulldown", vsat: 12, vHigh: 5, vLow: 2, rPull: 10, vA: 6, vB: 1,
};

/**
 * 구성별 비교기 정의 — "V_in이 어느 단자에 물리고 기준 전압이 무엇인가"를 규칙으로 준다.
 *  highWhen(v) = 그 비교기의 출력이 +V_sat가 되는 조건.
 */
function comparatorsOf(f: Family): Array<{
  ref: number; inPin: "plus" | "minus"; highWhen: (v: number) => boolean; desc: string;
}> {
  if (f.config === "or_pulldown") {
    return [
      {
        ref: f.vHigh, inPin: "plus",
        highWhen: (v) => v > f.vHigh,
        desc: `위 비교기는 (+)에 V_in, (−)에 ${f.vHigh}[V]가 인가되므로 V_in > ${f.vHigh}[V]일 때 출력이 +${f.vsat}[V]로 포화한다.`,
      },
      {
        ref: f.vLow, inPin: "minus",
        highWhen: (v) => v < f.vLow,
        desc: `아래 비교기는 (−)에 V_in, (+)에 ${f.vLow}[V]가 인가되므로 V_in < ${f.vLow}[V]일 때 출력이 +${f.vsat}[V]로 포화한다.`,
      },
    ];
  }
  return [
    {
      ref: f.vLow, inPin: "plus",
      highWhen: (v) => v > f.vLow,
      desc: `위 비교기는 (+)에 V_in, (−)에 ${f.vLow}[V]가 인가되므로 V_in > ${f.vLow}[V]일 때 출력이 +${f.vsat}[V]로 포화한다.`,
    },
    {
      ref: f.vHigh, inPin: "minus",
      highWhen: (v) => v < f.vHigh,
      desc: `아래 비교기는 (−)에 V_in, (+)에 ${f.vHigh}[V]가 인가되므로 V_in < ${f.vHigh}[V]일 때 출력이 +${f.vsat}[V]로 포화한다.`,
    },
  ];
}

/**
 * 한 구간의 상태 — 이상적 다이오드 규칙으로 마디 전압과 각 다이오드 도통 여부를 도출한다.
 *   or_pulldown : 애노드가 비교기 쪽 → 마디는 **최대**를 따르고, 풀다운이 0[V]로 잡아 준다.
 *   and_pullup  : 캐소드가 비교기 쪽 → 마디는 **최소**를 따르고, 풀업이 +V_CC로 잡아 준다.
 */
function stateAt(f: Family, vin: number): IntervalState {
  const comps = comparatorsOf(f);
  const outs = comps.map((c) => (c.highWhen(vin) ? f.vsat : -f.vsat));
  const rail = f.config === "or_pulldown" ? 0 : f.vsat;     // 저항이 끌어당기는 전위
  const vout = f.config === "or_pulldown"
    ? Math.max(...outs, rail)
    : Math.min(...outs, rail);
  // 다이오드는 자기 비교기 출력이 마디 전위를 결정할 때만 도통한다(그때만 저항으로 전류가 흐른다).
  const diodes = outs.map((o) => (o === vout && vout !== rail ? "ON" : "OFF") as "ON" | "OFF");
  return { vin, outs, diodes, vout };
}

function solve(f: Family): ComparatorDiodeOrGeneration {
  const comps = comparatorsOf(f);
  const stateA = stateAt(f, f.vA);
  const stateB = stateAt(f, f.vB);

  const circuitDiagram: ComparatorDiodeOrCircuitDiagram = {
    config: f.config,
    comparators: comps.map((c, i) => ({
      refLabel: `+${c.ref}[V]`,
      inPin: c.inPin,
      diodeLabel: `D_${i + 1}`,
    })),
    vinLabel: "V_in",
    outLabel: "V_out",
    rLabel: `${fmt(f.rPull)}[kΩ]`,
    ...(f.config === "and_pullup" ? { pullSupplyLabel: `+${f.vsat}[V]` } : {}),
  };

  // (나) 입력 파형 — 구간 ㉠(0~1) → 구간 ㉡(1~2). 점프는 ε 오프셋 두 샘플로 표현한다
  // (같은 t를 두 번 쓰면 waveform_time_not_monotonic이 난다 — 기존 archetype과 동일 처리).
  const eps = 0.02;
  const waveform: WaveformDiagram = {
    signals: [{
      name: "V_in",
      shape: "linear",
      samples: [
        { t: 0, v: f.vA }, { t: 1, v: f.vA },
        { t: 1 + eps, v: f.vB }, { t: 2, v: f.vB },
      ],
    }],
    unit: { time: "s", value: "V" },
    xAxis: { symbol: "t", unit: "s" },
    markers: [{ t: 0.5, label: "㉠" }, { t: 1.5, label: "㉡" }],
  };

  const nodeRule = f.config === "or_pulldown"
    ? `두 다이오드는 애노드가 비교기 출력 쪽이므로 출력 마디는 **더 높은 쪽**을 따라간다. ` +
      `두 비교기 출력이 모두 −${f.vsat}[V]이면 두 다이오드가 모두 역방향이 되어 차단되고, ` +
      `이때 마디는 풀다운 저항 ${fmt(f.rPull)}[kΩ]를 통해 0[V]가 된다.`
    : `두 다이오드는 캐소드가 비교기 출력 쪽이므로 출력 마디는 **더 낮은 쪽**을 따라간다. ` +
      `두 비교기 출력이 모두 +${f.vsat}[V]이면 두 다이오드가 모두 역방향이 되어 차단되고, ` +
      `이때 마디는 풀업 저항 ${fmt(f.rPull)}[kΩ]를 통해 +${f.vsat}[V]가 된다.`;

  return {
    values: { ...f },
    answer: {
      voutA: stateA.vout,
      diodesB: stateB.diodes,
      stateA, stateB,
      compDesc: comps.map((c) => c.desc),
      nodeRule,
    },
    circuitDiagram, waveform,
  };
}

function fmt(x: number): string {
  return Number.isInteger(x) ? String(x) : String(x);
}

/**
 * 값 공간 — **규칙 열거 + 필터** (특정 예시 하드코딩 금지, [[feedback_generic_code]]).
 *   · exam_similar : 원본 구성(or_pulldown) 유지 — 기준 전압·포화 전압·저항·구간 입력만 변경.
 *   · exam_variant : **소자 배치 교환**(다이오드 방향 반전 + 풀업) → 창 안 검출. 구조·해석 절차는 동일.
 * 필터
 *   - V_L + 2 ≤ V_H (창이 너무 좁으면 구간을 잡을 수 없다)
 *   - 두 구간의 **다이오드 상태 패턴이 서로 달라야** 한다(같으면 물어볼 것이 없다)
 *   - 입력이 기준 전압과 같은 경계값이면 제외(이상적 비교기에서 정의되지 않는다)
 *   - 원본 튜플 제외
 */
function buildSpace(mode: GenerationMode): Family[] {
  const out: Family[] = [];
  const config: ComparatorDiodeConfig = mode === "exam_variant" ? "and_pullup" : "or_pulldown";
  for (const vsat of [10, 12, 15])
    for (const vLow of [1, 2, 3, 4])
      for (const vHigh of [4, 5, 6, 7, 8]) {
        if (vHigh - vLow < 2) continue;
        for (const rPull of [1, 4.7, 10, 20])
          for (const vA of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
            for (const vB of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
              if (vA === vB) continue;
              if (vA === vHigh || vA === vLow || vB === vHigh || vB === vLow) continue;  // 경계값 배제
              if (vA > vsat || vB > vsat) continue;
              const f: Family = { config, vsat, vHigh, vLow, rPull, vA, vB };
              const sa = stateAt(f, vA), sb = stateAt(f, vB);
              if (sa.diodes.join() === sb.diodes.join()) continue;   // 두 구간이 같은 상태면 무의미
              if (isOriginal(f)) continue;                            // 원본 튜플 제외
              out.push(f);
            }
      }
  return out;
}
function isOriginal(f: Family): boolean {
  return f.config === ORIGINAL.config && f.vsat === ORIGINAL.vsat && f.vHigh === ORIGINAL.vHigh &&
    f.vLow === ORIGINAL.vLow && f.rPull === ORIGINAL.rPull && f.vA === ORIGINAL.vA && f.vB === ORIGINAL.vB;
}

const SIMILAR_SPACE = buildSpace("exam_similar");
const VARIANT_SPACE = buildSpace("exam_variant");

export function generateComparatorDiodeOr(args: { seed?: number; mode: GenerationMode }): ComparatorDiodeOrGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const pool = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  return solve(pick(pool.length ? pool : SIMILAR_SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalComparatorDiodeOrForVerify(): ComparatorDiodeOrGeneration {
  return solve(ORIGINAL);
}
/** 스모크용 — 생성 풀 크기. */
export function __comparatorDiodeOrPoolSizes(): { similar: number; variant: number } {
  return { similar: SIMILAR_SPACE.length, variant: VARIANT_SPACE.length };
}
/** 스모크용 — 임의 튜플의 상태를 독립 재검산하기 위한 노출. */
export function __stateAtForVerify(f: Family, vin: number): IntervalState {
  return stateAt(f, vin);
}
