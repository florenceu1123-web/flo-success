import type {
  ConceptDiagram,
  GenerationMode,
  SrFfMuxSequentialCircuitDiagram,
  TruthTableDiagram,
} from "@/types";
import {
  sopToString,
  type BooleanFunction,
} from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * SR 플립플롭 + 2×1 MUX 기반 상태순환 순차회로 (임용 10번 정보과 형식).
 *
 *  원본: 입력 없는 2-bit 순환 순서회로(11→00→10→01→11)를 SR 플립플롭 2개 +
 *        2×1 MUX 4개로 설계. 각 FF 입력(S·R)을 하나의 MUX가 구동한다.
 *
 *  ★ 핵심 설계 규칙 (모든 단일 4-cycle에서 성립 — 검증됨):
 *    - 단일 4-cycle은 차기상태 비트 nA·nB 중 정확히 **하나만 두 비트(Q_A·Q_B) 모두에 의존**하고
 *      나머지는 단일 비트 의존이다.
 *    - "두 비트 의존" FF = 빈칸(㉠~㉣) FF. 선택선 = 나머지 비트로 두면 데이터입력 I0·I1이
 *      그 나머지 비트의 함수(Q_x / Q_x' / 0 / 1)가 된다 → 학생이 도출.
 *    - 단일 비트 의존 FF = 주어진 FF. 그 단일 비트를 선택선으로 두면 I0·I1이 상수(0/1)가 된다.
 *    - 두 FF가 같은 선택선을 공유하려면 선택선이 "주어진 FF가 의존하는 비트"여야 한다.
 *      (교차 의존 cycle은 공유 선택선이 불가능 → 본 archetype 대상 아님.)
 *
 *  값(state cycle)만 다른 결정론 생성. GPT 호출 없음.
 */

export type SrFfMuxSequentialGeneration = {
  /** 차기상태 맵 nextOf[s] (s = (Q_A<<1)|Q_B, Q_A=MSB). 단일 4-cycle. */
  nextOf: number[];
  /** 11에서 시작한 cycle 순서 (상태도·상태표 행 순서). */
  cycleSeq: number[];
  /** 선택선 변수 ("Q_A" | "Q_B"). */
  selectVar: "Q_A" | "Q_B";
  /** 데이터입력이 의존하는 변수 (선택선의 반대). */
  dataVar: "Q_A" | "Q_B";
  /** 빈칸(㉠~㉣) FF id ("FF_A" | "FF_B"). */
  blankFf: "FF_A" | "FF_B";
  /** 빈칸 FF의 S·R 최소 SOP 식 (무관항 = 1로 처리). */
  blankSExpr: string;
  blankRExpr: string;
  /** 빈칸 정답 ㉠~㉣ → 값(문자열). */
  blankAnswers: Array<{ symbol: string; answer: string }>;
  stateDiagram: ConceptDiagram;     // (가)
  stateTable: TruthTableDiagram;    // (나)
  circuitDiagram: SrFfMuxSequentialCircuitDiagram; // (다)
};

type Bit = 0 | 1;
type SR = 0 | 1 | "x";

const BLANK_SYMBOLS = ["㉠", "㉡", "㉢", "㉣"];

/** mode별 유효 cycle 풀 (선택선·빈칸 FF flavor가 고정되도록 선별). */
const CYCLE_POOL: Record<GenerationMode, number[][]> = {
  // C, C' — select=Q_A, 빈칸 FF B (원본과 동일 flavor)
  exam_similar: [
    [2, 3, 1, 0], // 11→00→10→01→11 (원본)
    [3, 2, 0, 1], // 00→11→01→10→00
  ],
  // A, A' — select=Q_B, 빈칸 FF A (거울 구조)
  exam_variant: [
    [1, 2, 3, 0], // 00→01→10→11→00
    [3, 0, 1, 2], // 00→11→10→01→00 (역방향)
  ],
};

const stateLabel = (s: number): string => `${(s >> 1) & 1}${s & 1}`;

/** SR 플립플롭 여기표: Q(t)=q → Q(t+1)=qn 에 필요한 S·R (×=무관). */
function srExcite(q: Bit, qn: Bit): { s: SR; r: SR } {
  if (q === 0 && qn === 0) return { s: 0, r: "x" };
  if (q === 0 && qn === 1) return { s: 1, r: 0 };
  if (q === 1 && qn === 0) return { s: 0, r: 1 };
  return { s: "x", r: 0 }; // 1→1
}

/** SR 배열(상태 s별, ×포함)을 무관항=1로 채운 fully-specified 비트 배열. */
function specify(arr: SR[]): Bit[] {
  return arr.map((v) => (v === "x" ? 1 : v)) as Bit[];
}

/** 최소 SOP 식 (무관항=1 적용 후) — 2변수 (Q_A, Q_B). */
function sopExpr(spec: Bit[]): string {
  const minterms: number[] = [];
  for (let s = 0; s < 4; s++) if (spec[s] === 1) minterms.push(s);
  const fn: BooleanFunction = {
    vars: 2,
    varNames: ["Q_A", "Q_B"],
    minterms,
    dontCares: [],
  };
  return sopToString(minimizeSop(fn), ["Q_A", "Q_B"]);
}

/**
 * 2×1 MUX 데이터입력 (I0, I1) — 선택선으로 분리한 뒤 데이터 변수의 함수로 표현.
 *  selectVar=Q_A: I0 = f(Q_A=0) over Q_B, I1 = f(Q_A=1) over Q_B
 *  selectVar=Q_B: I0 = f(Q_B=0) over Q_A, I1 = f(Q_B=1) over Q_A
 */
function muxInputs(
  spec: Bit[],
  selectVar: "Q_A" | "Q_B",
): { i0: string; i1: string } {
  const dataVar = selectVar === "Q_A" ? "Q_B" : "Q_A";
  // spec index s = (Q_A<<1)|Q_B
  const lit = (a: Bit, b: Bit): string => {
    if (a === 0 && b === 0) return "0";
    if (a === 1 && b === 1) return "1";
    if (a === 0 && b === 1) return dataVar;
    return `${dataVar}'`;
  };
  if (selectVar === "Q_A") {
    return { i0: lit(spec[0], spec[1]), i1: lit(spec[2], spec[3]) };
  }
  // selectVar = Q_B → data var Q_A: I0 = (Q_B=0): s0(Q_A=0), s2(Q_A=1); I1 = (Q_B=1): s1, s3
  return { i0: lit(spec[0], spec[2]), i1: lit(spec[1], spec[3]) };
}

/** 식이 데이터 변수에 의존하는가 (상수 0/1이 아닌가). */
const isDataDependent = (s: string): boolean => s !== "0" && s !== "1";

/**
 * cycle에서 (선택선, 빈칸 FF) 구성을 결정.
 *  - 빈칸 FF: 데이터입력이 데이터 변수에 의존(둘 중 하나라도)하고 선택선이 유효(i0≠i1)한 FF.
 *  - 주어진 FF: 데이터입력이 모두 상수.
 *  유효 구성이 없으면 null (교차 의존 cycle).
 */
function solveConfig(nextOf: number[]): {
  selectVar: "Q_A" | "Q_B";
  blankFf: "FF_A" | "FF_B";
} | null {
  // FF별 spec 계산
  const specSA: SR[] = [];
  const specRA: SR[] = [];
  const specSB: SR[] = [];
  const specRB: SR[] = [];
  for (let s = 0; s < 4; s++) {
    const qA = ((s >> 1) & 1) as Bit;
    const qB = (s & 1) as Bit;
    const n = nextOf[s];
    const nA = ((n >> 1) & 1) as Bit;
    const nB = (n & 1) as Bit;
    const exA = srExcite(qA, nA);
    const exB = srExcite(qB, nB);
    specSA.push(exA.s);
    specRA.push(exA.r);
    specSB.push(exB.s);
    specRB.push(exB.r);
  }
  const sA = specify(specSA);
  const rA = specify(specRA);
  const sB = specify(specSB);
  const rB = specify(specRB);

  for (const selectVar of ["Q_A", "Q_B"] as const) {
    const mSA = muxInputs(sA, selectVar);
    const mRA = muxInputs(rA, selectVar);
    const mSB = muxInputs(sB, selectVar);
    const mRB = muxInputs(rB, selectVar);

    const ffADataDep = isDataDependent(mSA.i0) || isDataDependent(mSA.i1) ||
      isDataDependent(mRA.i0) || isDataDependent(mRA.i1);
    const ffBDataDep = isDataDependent(mSB.i0) || isDataDependent(mSB.i1) ||
      isDataDependent(mRB.i0) || isDataDependent(mRB.i1);
    const ffAConst = !ffADataDep;
    const ffBConst = !ffBDataDep;
    // 선택선이 유효(둘 다 같은 값이 아님)한지 — degenerate MUX 방지
    const ffASelMatters = mSA.i0 !== mSA.i1 || mRA.i0 !== mRA.i1;
    const ffBSelMatters = mSB.i0 !== mSB.i1 || mRB.i0 !== mRB.i1;

    // 빈칸 = 데이터 의존 + 선택 유효, 주어진 = 상수
    if (ffBDataDep && ffBSelMatters && ffAConst) {
      return { selectVar, blankFf: "FF_B" };
    }
    if (ffADataDep && ffASelMatters && ffBConst) {
      return { selectVar, blankFf: "FF_A" };
    }
  }
  return null;
}

export function generateSrFfMuxSequential(args: {
  seed?: number;
  mode: GenerationMode;
}): SrFfMuxSequentialGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 6; i++) rand(); // warm-up

  const pool = CYCLE_POOL[args.mode] ?? CYCLE_POOL.exam_similar;
  const nextOf = pick(pool, rand);

  const config = solveConfig(nextOf);
  if (!config) {
    // 풀은 사전 검증되어 도달 불가 — 방어적으로 첫 풀 cycle로 폴백.
    return generateSrFfMuxSequential({ seed: (args.seed ?? 0) + 1, mode: "exam_similar" });
  }
  const { selectVar, blankFf } = config;
  const dataVar = selectVar === "Q_A" ? "Q_B" : "Q_A";

  // ── 여기표 + spec 계산 ──
  const exc: Array<{ s: number; sA: SR; rA: SR; sB: SR; rB: SR; n: number }> = [];
  for (let s = 0; s < 4; s++) {
    const qA = ((s >> 1) & 1) as Bit;
    const qB = (s & 1) as Bit;
    const n = nextOf[s];
    const nA = ((n >> 1) & 1) as Bit;
    const nB = (n & 1) as Bit;
    const exA = srExcite(qA, nA);
    const exB = srExcite(qB, nB);
    exc.push({ s, sA: exA.s, rA: exA.r, sB: exB.s, rB: exB.r, n });
  }
  const specSA = specify(exc.map((e) => e.sA));
  const specRA = specify(exc.map((e) => e.rA));
  const specSB = specify(exc.map((e) => e.sB));
  const specRB = specify(exc.map((e) => e.rB));

  const mSA = muxInputs(specSA, selectVar);
  const mRA = muxInputs(specRA, selectVar);
  const mSB = muxInputs(specSB, selectVar);
  const mRB = muxInputs(specRB, selectVar);

  // ── cycle 순서 (11에서 시작) ──
  const cycleSeq: number[] = [3];
  let cur = nextOf[3];
  while (cur !== 3 && cycleSeq.length < 4) {
    cycleSeq.push(cur);
    cur = nextOf[cur];
  }

  // ── (가) 상태도 — 입력 없는 ring ──
  const stateDiagram: ConceptDiagram = {
    nodes: cycleSeq.map((s) => ({ id: `s${s}`, label: stateLabel(s) })),
    edges: cycleSeq.map((s) => ({ from: `s${s}`, to: `s${nextOf[s]}` })),
  };

  // ── (나) 상태표 — 현재상태 | 다음상태 | SR 입력 (cycle 순서) ──
  const fmt = (v: SR): string => (v === "x" ? "×" : String(v));
  const stateTable: TruthTableDiagram = {
    variables: ["Q_A", "Q_B"],
    inputGroups: [{ label: "현재 상태", span: 2 }],
    outputLabels: ["Q_A(t+1)", "Q_B(t+1)", "S_A", "R_A", "S_B", "R_B"],
    outputGroups: [
      { label: "다음 상태", span: 2 },
      { label: "SR 플립플롭 입력", span: 4 },
    ],
    rows: cycleSeq.map((s) => {
      const e = exc.find((x) => x.s === s)!;
      return {
        inputs: [(s >> 1) & 1, s & 1],
        outputs: [
          (e.n >> 1) & 1,
          e.n & 1,
          fmt(e.sA),
          fmt(e.rA),
          fmt(e.sB),
          fmt(e.rB),
        ],
      };
    }),
  };

  // ── (다) 구현 회로 + 빈칸 ──
  // MUX1→S_A, MUX2→R_A (FF A) / MUX3→S_B, MUX4→R_B (FF B)
  const blankIsB = blankFf === "FF_B";
  const blankInputs = blankIsB
    ? [mSB, mRB]   // MUX3, MUX4
    : [mSA, mRA];  // MUX1, MUX2

  // 빈칸 심볼 배정 — 빈칸 FF의 두 MUX(I0,I1) 순서로 ㉠㉡㉢㉣
  const blankAnswers: Array<{ symbol: string; answer: string }> = [
    { symbol: BLANK_SYMBOLS[0], answer: blankInputs[0].i0 },
    { symbol: BLANK_SYMBOLS[1], answer: blankInputs[0].i1 },
    { symbol: BLANK_SYMBOLS[2], answer: blankInputs[1].i0 },
    { symbol: BLANK_SYMBOLS[3], answer: blankInputs[1].i1 },
  ];

  const muxFor = (
    id: string,
    target: string,
    inputs: { i0: string; i1: string },
    isBlank: boolean,
    blankIdx: number,
  ): SrFfMuxSequentialCircuitDiagram["muxes"][number] => ({
    id,
    label: id,
    target,
    blank: isBlank,
    i0: isBlank ? BLANK_SYMBOLS[blankIdx] : inputs.i0,
    i1: isBlank ? BLANK_SYMBOLS[blankIdx + 1] : inputs.i1,
  });

  const circuitDiagram: SrFfMuxSequentialCircuitDiagram = {
    selectVar,
    muxes: [
      muxFor("MUX1", "S_A", mSA, !blankIsB, 0),
      muxFor("MUX2", "R_A", mRA, !blankIsB, 2),
      muxFor("MUX3", "S_B", mSB, blankIsB, 0),
      muxFor("MUX4", "R_B", mRB, blankIsB, 2),
    ],
    flipflops: [
      { id: "FF_A", label: "SR FF A", sFrom: "MUX1", rFrom: "MUX2", qLabel: "Q_A", qbarLabel: "Q_A'" },
      { id: "FF_B", label: "SR FF B", sFrom: "MUX3", rFrom: "MUX4", qLabel: "Q_B", qbarLabel: "Q_B'" },
    ],
  };

  const blankSExpr = sopExpr(blankIsB ? specSB : specSA);
  const blankRExpr = sopExpr(blankIsB ? specRB : specRA);

  return {
    nextOf,
    cycleSeq,
    selectVar,
    dataVar,
    blankFf,
    blankSExpr,
    blankRExpr,
    blankAnswers,
    stateDiagram,
    stateTable,
    circuitDiagram,
  };
}
