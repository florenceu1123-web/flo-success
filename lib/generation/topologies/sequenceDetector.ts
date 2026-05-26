/**
 * Sequence detector FSM generator (임용 8번 정보과 형식).
 *
 *  - 시퀀스 검출기: 입력 y 비트열에서 특정 패턴(e.g. '110') 검출 시 출력 z=1
 *  - 2-bit state encoding (Q_A=MSB, Q_B=LSB) → 4 상태 (00·01·10·11)
 *    · 검출 진행 상태 매핑 (s_0=초기, s_1='1' 봄, s_2='11' 봄, …)
 *    · 사용 안 하는 상태는 don't care
 *  - Mealy 모델 (출력 = f(state, input))
 *  - D 플립플롭 입력 D_A·D_B SOP 최소화
 *  - 출력 z SOP 최소화
 *  - 상태 전이도에 빈칸 ㉠㉡㉢㉣ (검출 상태에서의 두 전이 input/output)
 *
 *  Variant 패턴 (seed 기반 변형):
 *    '110' (3-bit, 기본), '101', '011', '100', '010'
 *
 *  Phase 1 MVP. 4-state 한정 (3-bit 패턴까지). 4-bit 패턴은 후속.
 */

import type { CircuitTypeParams } from "@/types";
import { makeRand, pick } from "./_helpers";

export type Bit = 0 | 1;
/** 2-bit 상태 코드 (Q_A, Q_B) — Q_A=MSB, Q_B=LSB. */
export type StateCode = "00" | "01" | "10" | "11";
/** 검출 패턴 진행 인덱스 (0=초기, 1='패턴[0]' 봄, 2='패턴[0..1]' 봄, ...). */
export type ProgressIdx = 0 | 1 | 2 | 3;

/** 한 전이: (현재 state, 입력 y) → (다음 state, 출력 z). */
export type Transition = {
  fromState: StateCode;
  input: Bit;
  toState: StateCode;
  output: Bit;
  /** don't care 상태(사용 안 하는 state)에서의 전이. */
  isDontCare: boolean;
};

export type SequenceDetectorGeneration = {
  /** 검출 패턴 — '110' 등. */
  pattern: string;
  /** 진행 인덱스 → 상태 코드 매핑 (예: 0→"00", 1→"01", 2→"10"). */
  progressToState: Record<ProgressIdx, StateCode>;
  /** 사용 중인 state 코드 set. 그 외는 don't care. */
  usedStates: Set<StateCode>;
  /** 8 row 전이 (현재 4 state × 입력 0/1, don't care row 포함). */
  transitions: Transition[];
  /** 블록도용 예시 비트열 (입력 y + 대응 출력 z). 패턴 검출 시점에서 z=1. */
  exampleBits: {
    /** 입력 y 비트열 (문자열, 예: "01110101011"). */
    y: string;
    /** 출력 z 비트열 (문자열, 동일 길이). */
    z: string;
  };

  /** 상태 전이도 빈칸 ㉠㉡㉢㉣ — 검출 진입 직전 state(progress = pattern.length - 1)의 두 전이. */
  blanks: {
    /** 검출 상태 — 보통 progress = pattern.length - 1 (e.g. '110' → '11' 봄 state = progress 2 = "10"). */
    sourceState: StateCode;
    /** ㉠ — 입력 0일 때 다음 state ("00" or other StateCode 문자열). */
    a: StateCode;
    /** ㉡ — 입력 0일 때 출력 (0 또는 1). 패턴이 ...0으로 끝나면 1, 아니면 0. */
    b: Bit;
    /** ㉢ — 입력 1일 때 다음 state. */
    c: StateCode;
    /** ㉣ — 입력 1일 때 출력. 패턴이 ...1로 끝나면 1, 아니면 0. */
    d: Bit;
  };

  /** SOP 최소화 결과 (don't care 활용). */
  sop: {
    /** D_A = (e.g. "y(Q_A + Q_B)" or "Q_A·y + Q_B·y"). */
    D_A: string;
    /** D_B (e.g. "Q_A'·Q_B'·y"). */
    D_B: string;
    /** z 출력. */
    z: string;
  };
};

const ALL_STATES: StateCode[] = ["00", "01", "10", "11"];

/**
 * 패턴 매칭 진행 시 입력 비트 받았을 때 다음 진행 인덱스.
 *
 * 예: pattern='110', 현재 progress=2 ('11' 봄), 입력 0 → 진행 3 (= 패턴 완성, 검출).
 *     검출 후 다음 cycle엔 다시 적절한 진행 인덱스로 (입력이 '1'이면 progress=1, '0'이면 0).
 *
 * Mealy 모델이므로 progress = pattern.length 도달 시 출력 1 + 다음 state는 "overlap" 고려.
 * '110'은 '11'→'0' 받으면 검출, '11'→'1' 받으면 여전히 '11' 봄(중첩 가능).
 *
 * @returns { nextProgress, output } — nextProgress는 현재 state에 대한 다음 progress, output은 검출되면 1
 */
function step(
  pattern: string,
  currentProgress: number,
  bit: Bit,
): { nextProgress: number; output: Bit } {
  // 현재까지 매칭된 prefix + 새 bit
  const matchedSoFar = pattern.slice(0, currentProgress);
  const attempted = matchedSoFar + String(bit);

  // 매칭 완성?
  if (attempted === pattern) {
    // 검출! Mealy 출력 1. 다음 cycle은 overlap 고려 — 매칭된 suffix가 패턴 prefix와 일치하는 가장 긴 길이
    let overlap = 0;
    for (let len = pattern.length - 1; len >= 1; len--) {
      if (pattern.endsWith(pattern.slice(0, len))) {
        overlap = len;
        break;
      }
    }
    return { nextProgress: overlap, output: 1 };
  }

  // 매칭 prefix 유지? (가장 긴 suffix가 패턴 prefix와 일치)
  for (let len = attempted.length; len >= 0; len--) {
    const suffix = attempted.slice(attempted.length - len);
    if (pattern.startsWith(suffix)) {
      return { nextProgress: len, output: 0 };
    }
  }
  return { nextProgress: 0, output: 0 };
}

/** SOP boolean expression 최소화 — 단순 K-map 알고리즘 (3-var, don't care 지원). */
function minimizeSop3Var(
  minterms: number[],          // 1로 강제되는 minterm 인덱스 (0~7, Q_A·Q_B·y 순)
  dontCares: number[],          // don't care minterm 인덱스
  varNames: [string, string, string] = ["Q_A", "Q_B", "y"],
): string {
  if (minterms.length === 0) return "0";
  if (minterms.length === 8) return "1";

  // 3-var K-map: 8 cell, gray code 정렬. 단순화 위해 brute-force prime implicant.
  //   각 minterm을 0~7 binary로 표현 (bit2=Q_A, bit1=Q_B, bit0=y).
  //   2-cell, 4-cell, 8-cell 그룹을 모두 enum.
  const target = new Set([...minterms, ...dontCares]);
  const required = new Set(minterms);

  // Prime implicants 후보 (2^k group, 변수 k개 고정)
  const primes: Array<{ literals: Array<{ var: string; neg: boolean }>; covers: Set<number> }> = [];

  // Helper: bit i가 set이면 그 변수가 fixed(이 위치 값에 따라 polarity 결정)
  // 모든 가능한 부분집합 (fixed 변수 mask: 0~7)을 enum
  for (let fixedMask = 0; fixedMask < 8; fixedMask++) {
    // fixedMask의 set bit = 그 변수 fix. unset bit = 그 변수 don't care (그룹화 대상)
    // 가능한 fixedValue 조합 — fixed bit의 값
    for (let fixedValue = 0; fixedValue < 8; fixedValue++) {
      if ((fixedValue & ~fixedMask) !== 0) continue;  // unset 변수는 0이어야 함 (정규화)
      // 이 group: fixedMask로 mask된 bit가 fixedValue와 일치하는 모든 minterm
      const groupMembers = new Set<number>();
      let allCovered = true;
      for (let m = 0; m < 8; m++) {
        if ((m & fixedMask) === fixedValue) {
          if (!target.has(m)) { allCovered = false; break; }
          groupMembers.add(m);
        }
      }
      if (!allCovered) continue;
      // 이 group 안에 필수 minterm이 하나라도 있어야 의미
      const hasRequired = [...groupMembers].some((m) => required.has(m));
      if (!hasRequired) continue;
      // 이 group을 literal 표현으로
      const literals: Array<{ var: string; neg: boolean }> = [];
      for (let bit = 0; bit < 3; bit++) {
        if ((fixedMask >> bit) & 1) {
          const varIdx = 2 - bit;  // bit2=varNames[0]=Q_A, bit1=Q_B, bit0=y
          const isNeg = ((fixedValue >> bit) & 1) === 0;
          literals.push({ var: varNames[varIdx], neg: isNeg });
        }
      }
      primes.push({ literals, covers: groupMembers });
    }
  }

  // Greedy cover — 가장 많이 covering하는 prime을 반복 선택. 모든 required 덮을 때까지.
  const remaining = new Set(required);
  const chosen: typeof primes = [];
  while (remaining.size > 0) {
    let bestPrime: (typeof primes)[number] | null = null;
    let bestCount = 0;
    for (const p of primes) {
      const cnt = [...p.covers].filter((m) => remaining.has(m)).length;
      if (cnt > bestCount || (cnt === bestCount && bestPrime && p.literals.length < bestPrime.literals.length)) {
        bestPrime = p;
        bestCount = cnt;
      }
    }
    if (!bestPrime || bestCount === 0) break;
    chosen.push(bestPrime);
    for (const m of bestPrime.covers) remaining.delete(m);
  }

  // Prime 표현 → 문자열
  const termStrings = chosen.map((p) => {
    if (p.literals.length === 0) return "1";
    return p.literals.map((l) => `${l.var}${l.neg ? "'" : ""}`).join("·");
  });
  // 중복 제거
  const unique = [...new Set(termStrings)];
  if (unique.length === 0) return "0";
  return unique.join(" + ");
}

export function generateSequenceDetector(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): SequenceDetectorGeneration {
  const rand = makeRand(args.seed);
  // 패턴 — params 우선, 없으면 seed로 변형
  const pattern = args.params?.sequencePattern ?? pick(["110", "101", "011"], rand);
  if (pattern.length > 3) {
    throw new Error(`sequence_detector MVP는 3-bit 패턴까지만 (got: '${pattern}', length ${pattern.length})`);
  }

  // 진행 인덱스 → state 코드 매핑 (정수 순서: 0→"00", 1→"01", 2→"10", 3→"11")
  const progressToState: Record<ProgressIdx, StateCode> = {
    0: "00",
    1: "01",
    2: "10",
    3: "11",
  };
  const stateToProgress = new Map<StateCode, ProgressIdx>();
  Object.entries(progressToState).forEach(([p, s]) => stateToProgress.set(s, Number(p) as ProgressIdx));

  const usedStates = new Set<StateCode>();
  for (let p = 0; p < pattern.length; p++) usedStates.add(progressToState[p as ProgressIdx]);
  // pattern '110' (3-bit) → progress 0·1·2 사용. progress 3 (state "11")은 don't care.

  // 전이 — 4 state × 2 input = 8 row
  const transitions: Transition[] = [];
  for (const stateCode of ALL_STATES) {
    const isUsed = usedStates.has(stateCode);
    for (const bit of [0, 1] as Bit[]) {
      if (!isUsed) {
        transitions.push({
          fromState: stateCode,
          input: bit,
          toState: "00",  // don't care, 그냥 placeholder
          output: 0,
          isDontCare: true,
        });
        continue;
      }
      const progress = stateToProgress.get(stateCode)!;
      const { nextProgress, output } = step(pattern, progress, bit);
      transitions.push({
        fromState: stateCode,
        input: bit,
        toState: progressToState[nextProgress as ProgressIdx],
        output,
        isDontCare: false,
      });
    }
  }

  // 빈칸 ㉠㉡㉢㉣ — 검출 진입 직전 state (progress = pattern.length - 1)의 두 전이
  const detectStateProgress = (pattern.length - 1) as ProgressIdx;
  const sourceState = progressToState[detectStateProgress];
  const tInput0 = transitions.find((t) => t.fromState === sourceState && t.input === 0)!;
  const tInput1 = transitions.find((t) => t.fromState === sourceState && t.input === 1)!;

  const blanks = {
    sourceState,
    a: tInput0.toState,
    b: tInput0.output,
    c: tInput1.toState,
    d: tInput1.output,
  };

  // SOP 최소화 — minterm index: bit2=Q_A, bit1=Q_B, bit0=y
  //   D_A: next state Q_A bit이 1인 row
  //   D_B: next state Q_B bit이 1인 row
  //   z:   output이 1인 row
  const stateCodeToBits = (s: StateCode): [Bit, Bit] => [Number(s[0]) as Bit, Number(s[1]) as Bit];

  const mintermsForDA: number[] = [];
  const mintermsForDB: number[] = [];
  const mintermsForZ: number[] = [];
  const dontCares: number[] = [];

  for (const t of transitions) {
    const [qa, qb] = stateCodeToBits(t.fromState);
    const idx = (qa << 2) | (qb << 1) | t.input;
    if (t.isDontCare) {
      dontCares.push(idx);
      continue;
    }
    const [nextQa, nextQb] = stateCodeToBits(t.toState);
    if (nextQa === 1) mintermsForDA.push(idx);
    if (nextQb === 1) mintermsForDB.push(idx);
    if (t.output === 1) mintermsForZ.push(idx);
  }

  const sop = {
    D_A: minimizeSop3Var(mintermsForDA, dontCares),
    D_B: minimizeSop3Var(mintermsForDB, dontCares),
    z: minimizeSop3Var(mintermsForZ, dontCares),
  };

  // ── 블록도용 예시 비트열 생성 ────────────────────────────
  //   - y: 임의 비트열 (16 bit, 패턴이 1-2회 등장하도록 시드 기반 생성)
  //   - z: Mealy 출력 시뮬 (현재 진행 인덱스 추적, 검출 시 z=1)
  //   초기 시퀀스에 패턴을 일부러 1번 끼워넣고, 나머지는 랜덤 비트.
  const targetLen = 16;
  const yBitsArr: Bit[] = [];
  // 처음 5 비트는 패턴이 등장하도록 prefix + pattern + suffix (간단)
  //   e.g., '110' 패턴이면 "01" + "110" = "01110" (5 bit) → 검출 1회
  const prefix = "0".repeat(Math.max(2, 5 - pattern.length));
  for (const ch of prefix + pattern) yBitsArr.push(Number(ch) as Bit);
  // 나머지 자리에 시드 기반 의사난수로 채움
  while (yBitsArr.length < targetLen) {
    yBitsArr.push(rand() < 0.5 ? 0 : 1);
  }
  // Mealy 시뮬로 z 비트열 계산
  let progress = 0;
  const zBitsArr: Bit[] = [];
  for (const bit of yBitsArr) {
    const { nextProgress, output } = step(pattern, progress, bit);
    zBitsArr.push(output);
    progress = nextProgress;
  }
  const exampleBits = {
    y: yBitsArr.join(""),
    z: zBitsArr.join(""),
  };

  return {
    pattern,
    progressToState,
    usedStates,
    transitions,
    blanks,
    sop,
    exampleBits,
  };
}
