import type {
  GenerationMode,
  WaveformDiagram,
} from "@/types";
import { makeRand } from "./_helpers";

/**
 * JK 플립플롭 동기식 카운터 — 타이밍 분석 형식 (임용 정보/전자 6번류).
 *
 * 원본: 3개 JK-FF(Q2·Q1·Q0)가 공통 클럭(CP)으로 구동되는 동기식 카운터. J·K 입력이
 * 하위 비트의 곱(AND)으로 배선되어 2진 계수 동작. (가) 회로가 주어지고, (나) 타이밍 도표의
 * Q 트랙을 학생이 채운 뒤 특정 클럭 시점의 상태값을 구한다.
 *
 * ★ 기존 archetype으로 흡수 불가:
 *   - sequential_dff_generic·ff_with_waveform은 D/T-FF 전용(JK 미지원).
 *   - flipflop_counter는 2비트 K-map "설계" 방향(타이밍 "분석"이 아님).
 *   → JK 동기식 카운터 타이밍 분석 전용 archetype. (디지털 순차는 universal path 없음 — 전용 예외.)
 *
 * 결정론 생성(GPT 없음). 회로는 logic_network diagram(JKFF·AND·NOT·외부 CLK 버스)으로
 * 선언적 구성 → 기존 logicNetworkRenderer 재사용(전용 렌더러 불필요).
 *
 * 모드:
 *  - exam_similar: 2진 **상향** 카운터(J_k=K_k=Q_{k-1}···Q_0, 원본과 동일 동작).
 *  - exam_variant: 2진 **하향** 카운터(J_k=K_k=Q'_{k-1}···Q'_0, "구하는 동작" 변경).
 *  초기 상태를 시드로 바꿔 count개 문제가 서로 다른 상태 시퀀스를 갖게 한다.
 */

const BITS = 3; // Q2 Q1 Q0
const NUM_CLOCKS = 8; // 표시할 클럭 펄스 수 (3비트 전체 순환)

export type JkSyncCounterGeneration = {
  direction: "up" | "down";
  /** 초기 상태값 (0..7), Q2Q1Q0. */
  initialState: number;
  /** 클럭 사이클별 상태값 (길이 NUM_CLOCKS). states[0]=초기, states[k]=k번째 클럭 구간 상태. */
  states: number[];
  /** (나) 문제 템플릿 — CP 채움, Q2·Q1·Q0 빈칸. */
  waveformTemplate: WaveformDiagram;
  /** (나) 정답 — Q 트랙 채움. */
  waveformSolution: WaveformDiagram;
  /** 학생이 답할 마커 시점 — { label: "t₃", cycle, state }. */
  markerStates: Array<{ label: string; cycle: number; state: number }>;
};

/** 상태값 → "Q2Q1Q0" 2진 문자열. */
export function stateBits(s: number): string {
  return [(s >> 2) & 1, (s >> 1) & 1, s & 1].join("");
}

/** 한 클럭 rising edge에서 JK 동기 카운터 상태 전이 (up/down). */
function advance(state: number, direction: "up" | "down"): number {
  const q0 = state & 1;
  const q1 = (state >> 1) & 1;
  const q2 = (state >> 2) & 1;
  // J_k=K_k=toggle_k → toggle=1이면 반전, 0이면 유지.
  const t0 = 1;
  const t1 = direction === "up" ? q0 : 1 - q0;
  const t2 = direction === "up" ? q0 & q1 : (1 - q0) & (1 - q1);
  const n0 = q0 ^ t0;
  const n1 = q1 ^ t1;
  const n2 = q2 ^ t2;
  return (n2 << 2) | (n1 << 1) | n0;
}

/** 2× 해상도 step 샘플 — 각 클럭 사이클을 [2k, 2k+2) 구간으로. */
function clockSamples(): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k < NUM_CLOCKS; k++) {
    out.push({ t: 2 * k, v: 1 }); // high [2k, 2k+1)
    out.push({ t: 2 * k + 1, v: 0 }); // low [2k+1, 2k+2)
  }
  out.push({ t: 2 * NUM_CLOCKS, v: 0 });
  return out;
}

/** 상태 시퀀스의 한 비트를 2× 해상도 step 샘플로. */
function bitSamples(states: number[], bit: number): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k < NUM_CLOCKS; k++) {
    const v = (states[k] >> bit) & 1;
    out.push({ t: 2 * k, v });
    out.push({ t: 2 * k + 1, v });
  }
  const last = (states[NUM_CLOCKS - 1] >> bit) & 1;
  out.push({ t: 2 * NUM_CLOCKS, v: last });
  return out;
}

export function generateJkSyncCounter(args: {
  seed?: number;
  mode?: GenerationMode;
  /** 방향 직접 지정(모드보다 우선). 변형유형에서 상향·하향 둘 다 내기 위함. */
  direction?: "up" | "down";
}): JkSyncCounterGeneration {
  const rand = makeRand(args.seed);
  const direction: "up" | "down" = args.direction ?? (args.mode === "exam_variant" ? "down" : "up");

  // 초기 상태를 시드로 다양화 (count개 distinct 문제). 0(=000)은 원본 flavor이나
  // 다른 시작점도 허용해 상태 시퀀스가 서로 다르게.
  const initialState = Math.floor(rand() * (1 << BITS));

  const states: number[] = [initialState];
  for (let k = 1; k < NUM_CLOCKS; k++) {
    states.push(advance(states[k - 1], direction));
  }

  // 마커 — 3개 클럭 시점의 상태값을 학생이 답 (원본 "상태값 2~3개" 형식).
  const markerCycles = [2, 4, 6];
  const markers = markerCycles.map((c, i) => ({ t: 2 * c, label: `t_${i + 1}` }));
  const markerStates = markerCycles.map((c, i) => ({
    label: `t_${i + 1}`,
    cycle: c,
    state: states[c],
  }));

  const cpTemplate = clockSamples();
  const mkSignals = (blankQ: boolean) => [
    { name: "CP", samples: cpTemplate, shape: "step" as const },
    {
      name: "Q2",
      samples: blankQ ? [] : bitSamples(states, 2),
      shape: "step" as const,
      ...(blankQ ? { blank: true, vRange: { min: 0, max: 1 } } : {}),
    },
    {
      name: "Q1",
      samples: blankQ ? [] : bitSamples(states, 1),
      shape: "step" as const,
      ...(blankQ ? { blank: true, vRange: { min: 0, max: 1 } } : {}),
    },
    {
      name: "Q0",
      samples: blankQ ? [] : bitSamples(states, 0),
      shape: "step" as const,
      ...(blankQ ? { blank: true, vRange: { min: 0, max: 1 } } : {}),
    },
  ];

  const waveformTemplate: WaveformDiagram = {
    signals: mkSignals(true),
    unit: { time: "T" },
    markers,
  };
  const waveformSolution: WaveformDiagram = {
    signals: mkSignals(false),
    unit: { time: "T" },
    markers,
  };

  return {
    direction,
    initialState,
    states,
    waveformTemplate,
    waveformSolution,
    markerStates,
  };
}
