import type { DemuxCircuitDiagram, GenerationMode, WaveformDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 1→4 디멀티플렉서(디코더형) 조합논리회로 + 출력 파형 도시 (임용 8번 형식) 전용 archetype.
 *
 *  (가) 회로: 입력신호 + 선택선 S₁·S₀ (인버터로 보수 생성) → 게이트 4개 → 출력 F₀~F₃.
 *    · active-low(원본): 게이트는 **NAND** → 선택된 출력만 입력신호의 **반전**, 나머지는 1.
 *    · active-high(변형): 게이트는 **AND** → 선택된 출력만 입력신호 그대로, 나머지는 0.
 *  (나) 파형: 입력신호·S₁·S₀는 주어지고, F₀~F₃ 트랙은 **빈칸**(학생이 도시).
 *
 *  ★ 기존 `waveform_analysis`(F=SOP + 중간신호 Y + K-map)와 다른 형식이다 —
 *    이쪽은 선택선으로 출력이 하나씩 활성화되는 **디먹스 동작 파형**이 답이다.
 *    실측 로그에서 이 원본이 waveform_analysis로 갔다.
 */

export type DemuxWaveformGeneration = {
  values: {
    activeLow: boolean;          // true = NAND(원본), false = AND
    /** 구간별 (입력신호, S₁, S₀) */
    segments: Array<{ x: number; s1: number; s0: number }>;
  };
  answer: {
    /** 구간별 F₀~F₃ */
    outputs: Array<[number, number, number, number]>;
    /** 각 구간 설명 (선택된 출력) */
    perSegment: string[];
  };
  circuitDiagram: DemuxCircuitDiagram;
  waveformDiagram: WaveformDiagram;
};

/** 한 구간의 출력 4개 계산 */
function outputsOf(x: number, s1: number, s0: number, activeLow: boolean): [number, number, number, number] {
  const sel = (s1 << 1) | s0;                     // 선택된 출력 번호
  return [0, 1, 2, 3].map((k) => {
    const selected = k === sel;
    if (!selected) return activeLow ? 1 : 0;       // 비선택: NAND→1, AND→0
    return activeLow ? (x ? 0 : 1) : x;            // 선택: NAND→x의 반전, AND→x
  }) as [number, number, number, number];
}

export function generateDemuxWaveform(args: { seed?: number; mode: GenerationMode }): DemuxWaveformGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const activeLow = args.mode !== "exam_variant";   // 유사=NAND(원본) / 변형=AND(active-high)

  // 구간 6개 — 선택선 조합이 최소 3종 이상 나오고, 입력신호도 0/1이 섞이게 (규칙 열거 + 필터)
  let segments: Array<{ x: number; s1: number; s0: number }> = [];
  for (let tries = 0; tries < 200; tries++) {
    segments = Array.from({ length: 6 }, () => ({
      x: rand() < 0.55 ? 1 : 0,
      s1: rand() < 0.5 ? 1 : 0,
      s0: rand() < 0.5 ? 1 : 0,
    }));
    const sels = new Set(segments.map((g) => (g.s1 << 1) | g.s0));
    const xs = new Set(segments.map((g) => g.x));
    // 인접 구간이 완전히 같으면 파형이 밋밋 → 최소 4번은 바뀌게
    let changes = 0;
    for (let i = 1; i < segments.length; i++) {
      const a = segments[i - 1], b = segments[i];
      if (a.x !== b.x || a.s1 !== b.s1 || a.s0 !== b.s0) changes++;
    }
    if (sels.size >= 3 && xs.size === 2 && changes >= 4) break;
  }

  const outputs = segments.map((g) => outputsOf(g.x, g.s1, g.s0, activeLow));
  const gateName = activeLow ? "NAND" : "AND";
  const perSegment = segments.map((g, i) => {
    const sel = (g.s1 << 1) | g.s0;
    return `구간 ${i + 1}: S₁S₀=${g.s1}${g.s0} → F${sel} 선택, 입력신호=${g.x} ⇒ ` +
      `F${sel}=${outputs[i][sel]}${activeLow ? "(입력의 반전)" : ""}, 나머지 출력=${activeLow ? 1 : 0}`;
  });

  // ── 파형: 각 구간을 [i, i+1] 로. step 표시를 위해 구간 경계에서 두 샘플.
  const track = (name: string, valueAt: (i: number) => number, blank = false) => ({
    name,
    shape: "step" as const,
    ...(blank
      ? { blank: true, vRange: { min: 0, max: 1 }, samples: [] as Array<{ t: number; v: number }> }
      : {
          samples: segments.flatMap((_, i) => [
            { t: i, v: valueAt(i) },
            { t: i + 1 - 1e-6, v: valueAt(i) },
          ]),
        }),
  });

  const waveformDiagram: WaveformDiagram = {
    signals: [
      track("입력신호", (i) => segments[i].x),
      track("S₁", (i) => segments[i].s1),
      track("S₀", (i) => segments[i].s0),
      track("F₀", () => 0, true),
      track("F₁", () => 0, true),
      track("F₂", () => 0, true),
      track("F₃", () => 0, true),
    ],
    unit: { time: "구간" },
    xAxis: { symbol: "t" },
  };

  return {
    values: { activeLow, segments },
    answer: { outputs, perSegment },
    circuitDiagram: { gateKind: gateName as "NAND" | "AND", outputs: 4, selectLabels: ["S₁", "S₀"], inputLabel: "입력신호" },
    waveformDiagram,
  };
}
