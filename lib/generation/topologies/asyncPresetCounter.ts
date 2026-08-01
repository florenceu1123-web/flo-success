import type {
  AsyncPresetCounterCircuitDiagram,
  GenerationMode,
  WaveformDiagram,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 비동기 SET/RESET D 플립플롭 응용회로 — 자동 재적재 리플 다운카운터.
 *
 *  원본 (정보·전자 임용): 비동기 SET·RESET을 갖는 D-FF 3개 응용회로.
 *   · 우측 게이트 F = NOR(Q₀, Q₁, Q₂, CLK) — Q·CLK가 모두 0일 때만 1.
 *   · 셀별 비동기 입력: Set_k = F·I_k, Reset_k = F·I_k′ (인버터 + AND 2개).
 *     → F=1(모든 출력·CLK가 0)이면 I 패턴을 비동기로 적재. I_k=1→Set, I_k=0→Reset.
 *   · 평상시(F=0): D_k = Q_k′ (T 플립플롭) + 리플 클럭(CLK→FF0, Q₀→FF1 clk, Q₁→FF2 clk).
 *     Q₀는 CLK 상승마다, Q₁은 Q₀ 상승마다, Q₂는 Q₁ 상승마다 반전 → 리플 다운카운터.
 *   · 출력이 모두 0이 되면 F=1로 I를 자동 재적재 → 0 상태를 건너뛴다.
 *
 *  ★ 동작 = I값(N)에서 1까지 내려가는 mod-N 다운카운터(0 건너뜀, N=I의 2진값, Q₀=LSB).
 *    예) I₀I₁I₂=101 → 적재 101 → 001 → 110 → 010 → 100 → (000→재적재) 101 ...
 *
 *  ★ generic sequential_dff_generic 경로는 비동기 SET·RESET 망과 NOR(F) 자동재적재 구조를
 *    잃어 임의 상태표 D-FF로 변질 → 전용 archetype 필수.
 *
 *  문제 2단계: [단계1] ㉠ 구간(초기 000+CLK0 → F=1 적재) Q₀Q₁Q₂ = I. [단계2] ㉡ 구간 출력 파형 도시.
 *
 *  값(I 패턴·표시 클럭 수)만 다른 결정론 생성. GPT 호출 없음.
 */

export type AsyncPresetCounterGeneration = {
  /** FF 개수 (고정 3). */
  bitCount: number;
  /** 비동기 적재 입력 I₀I₁I₂ (Q₀=LSB 순서, 0/1). */
  iBits: number[];
  /** I 패턴 문자열 (I₀I₁I₂ 순서, 예: "101"). */
  iStr: string;
  /** I의 2진값 (= mod-N 카운터의 N). */
  nValue: number;
  /** [단계1] ㉠ 구간 정답 = 적재값 (Q₀Q₁Q₂ 문자열). */
  initialStr: string;
  /** [단계2] ㉡ 구간 상태 시퀀스 (클럭 상승마다, 각 [q0,q1,q2]). */
  sequence: number[][];
  /** ㉡ 시퀀스 문자열 (Q₀Q₁Q₂ 순서). */
  sequenceStr: string[];
  /** ㉡에서 표시하는 클럭 펄스 수. */
  clockCount: number;
  /** ㉡ 구간에 출력이 모두 0이 되어 재적재가 일어나는가 (변형유형 교육 포인트). */
  hasReload: boolean;
  circuitDiagram: AsyncPresetCounterCircuitDiagram;   // (가)
  /** (나) 문제 파형 — 클럭(step) + Q 빈 트랙(학생 도시) + ㉠·㉡ 마커. */
  waveformDiagram: WaveformDiagram;
  /** (나) 정답 파형 — Q 트랙 채움 (풀이/검증용). */
  answerWaveformDiagram: WaveformDiagram;
};

/** mode별 I 패턴 풀 (Q₀=LSB, value≥4라 ㉡에 의미있는 카운트 단계가 생김). */
const PATTERN_POOL: Record<"exam_similar" | "exam_variant", number[][]> = {
  // 기출유사: 원본(101)과 다른 패턴 — value 4·6·7
  exam_similar: [
    [0, 0, 1], // 001 = 4
    [0, 1, 1], // 011 = 6
    [1, 1, 1], // 111 = 7
  ],
  // 기출변형: 클럭을 더 길게 보여 000→재적재(F)를 드러냄 — value 5·6·7
  exam_variant: [
    [1, 0, 1], // 101 = 5 (원본 값)
    [0, 1, 1], // 011 = 6
    [1, 1, 1], // 111 = 7
  ],
};

const I_LABELS = ["I₀", "I₁", "I₂"];
const Q_LABELS = ["Q₀", "Q₁", "Q₂"];

/** Q₀=LSB 2진값. */
function bitsToValue(bits: number[]): number {
  return bits.reduce((acc, b, k) => acc + (b ? 1 << k : 0), 0);
}

/** Q₀Q₁Q₂ 순서 문자열. */
function bitsToStr(bits: number[]): string {
  return bits.join("");
}

/**
 * 리플 다운카운터 한 클럭 진행 (faithful edge sim).
 *   Q₀는 매 클럭 반전, Q_k는 Q_{k-1} 상승에지마다 반전. 결과가 all-zero면 I 재적재(F=1).
 */
function nextState(state: number[], iBits: number[]): number[] {
  const out = state.slice();
  const old0 = out[0];
  out[0] = old0 ^ 1;
  let rising = old0 === 0 && out[0] === 1; // Q₀ 상승?
  for (let k = 1; k < out.length; k++) {
    if (!rising) break;
    const oldk = out[k];
    out[k] = oldk ^ 1;
    rising = oldk === 0 && out[k] === 1; // Q_k 상승 → 다음 비트 반전
  }
  if (out.every((b) => b === 0)) return iBits.slice(); // F: 모두 0 → 재적재
  return out;
}

/** (나) 클럭 step 파형 — 초기 ㉠ 구간은 low, 이후 clockCount개 펄스. */
function buildClockSamples(clockCount: number): Array<{ t: number; v: number }> {
  const s: Array<{ t: number; v: number }> = [{ t: 0, v: 0 }];
  for (let k = 1; k <= clockCount; k++) {
    s.push({ t: k, v: 1 });       // 상승에지 @ t=k
    s.push({ t: k + 0.5, v: 0 });  // 하강
  }
  s.push({ t: clockCount + 1, v: 0 });
  return s;
}

function solve(iBits: number[], mode: GenerationMode): AsyncPresetCounterGeneration {
  const bitCount = iBits.length;
  const nValue = bitsToValue(iBits);
  const iStr = bitsToStr(iBits);

  // ㉡ 클럭 수: 유사=4 고정, 변형=N+1 (1까지 내려간 뒤 재적재 1스텝 노출).
  const clockCount = mode === "exam_variant" ? nValue + 1 : 4;

  // 상태 시뮬레이션: 적재값에서 clockCount 클럭만큼.
  const sequence: number[][] = [];
  let cur = iBits.slice();
  for (let i = 0; i < clockCount; i++) {
    cur = nextState(cur, iBits);
    sequence.push(cur.slice());
  }
  const sequenceStr = sequence.map(bitsToStr);
  const hasReload = sequence.some((st) => st.every((b, k) => b === iBits[k]));

  const circuitDiagram: AsyncPresetCounterCircuitDiagram = {
    bitCount,
    iLabels: I_LABELS.slice(0, bitCount),
    qLabels: Q_LABELS.slice(0, bitCount),
    norLabel: "F",
  };

  // ── (나) 파형 ─────────────────────────────────────
  // 시간축: 슬롯 0 = ㉠(적재 I), 슬롯 i(1..clockCount) = i번째 상승에지 직후 상태.
  const clockSamples = buildClockSamples(clockCount);
  const xMax = clockCount + 1;

  // 정답 Q 트랙: 슬롯 0에 적재값, 슬롯 i에 sequence[i-1].
  const stateAt = (slot: number): number[] => (slot === 0 ? iBits : sequence[slot - 1]);
  const answerQSignals = Q_LABELS.slice(0, bitCount).map((name, k) => {
    const samples: Array<{ t: number; v: number }> = [];
    for (let slot = 0; slot <= clockCount; slot++) samples.push({ t: slot, v: stateAt(slot)[k] });
    samples.push({ t: xMax, v: stateAt(clockCount)[k] });
    return { name, samples, shape: "step" as const };
  });

  const markers = [
    { t: 0.5, label: "㉠" },
    { t: 1 + clockCount / 2, label: "㉡" },
  ];

  const waveformDiagram: WaveformDiagram = {
    signals: [
      { name: "클럭", samples: clockSamples, shape: "step" },
      // Q 트랙은 빈칸 — 학생이 ㉠ 값·㉡ 파형을 도시.
      ...Q_LABELS.slice(0, bitCount).map((name) => ({
        name,
        samples: [] as Array<{ t: number; v: number }>,
        shape: "step" as const,
        blank: true,
        vRange: { min: 0, max: 1 },
      })),
    ],
    unit: { time: "", value: "" },
    markers,
  };

  const answerWaveformDiagram: WaveformDiagram = {
    signals: [{ name: "클럭", samples: clockSamples, shape: "step" }, ...answerQSignals],
    unit: { time: "", value: "" },
    markers,
  };

  return {
    bitCount,
    iBits,
    iStr,
    nValue,
    initialStr: iStr,
    sequence,
    sequenceStr,
    clockCount,
    hasReload,
    circuitDiagram,
    waveformDiagram,
    answerWaveformDiagram,
  };
}

/** seed·mode로 I 패턴을 골라 결정론 생성. */
export function generateAsyncPresetCounter(args: {
  seed?: number;
  mode: GenerationMode;
}): AsyncPresetCounterGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const pool = PATTERN_POOL[args.mode as "exam_similar" | "exam_variant"] ?? PATTERN_POOL.exam_similar;
  const iBits = pick(pool, rand);
  return solve(iBits, args.mode);
}
