/**
 * D 플립플롭 2개 + 2×1 MUX 2개 자율 순환 순차회로 (임용 8번 정보과). 전용 archetype. GPT 없음.
 *
 *  원본: 입력 없는 2-bit 순환 순서회로(상태도 가)를 D-FF 2개 + 각 FF를 2×1 MUX 1개로 구현(나).
 *   ★ D-FF는 D=차기상태 → 여기표 불필요. D_A=next_A, D_B=next_B.
 *   각 D를 2×1 MUX로: 공통 선택선 S=selectVar(Q_A 또는 Q_B), I0/I1 = 나머지 변수의 함수(0/1/Q/Q').
 *  단계: [1] MUX 데이터입력 ㉠㉡(MUX_A)·㉢㉣(MUX_B) / [2] D_A 최소 SOP / [3] 클록 f → Q_A 주파수.
 */
import { makeRand } from "./_helpers";
import { minimizeSop } from "@/lib/digital/minimize";
import { sopToString, type BooleanFunction } from "@/lib/digital/booleanFunction";
import type { DffMuxSequentialCircuitDiagram } from "@/types";

type Bit = 0 | 1;

const BLANK = ["㉠", "㉡", "㉢", "㉣"];

/** mode별 4-cycle 풀 (nextOf[s], s=(Q_A<<1)|Q_B). 둘 다 non-trivial MUX 되게 선별. */
const CYCLE_POOL: Record<"exam_similar" | "exam_variant", number[][]> = {
  // D-FF: 두 MUX 모두 non-degenerate 검증된 cycle
  exam_similar: [
    [2, 3, 1, 0], // 11→00→10→01 (원본 flavor)
    [3, 0, 1, 2], // 11→10→01→00
    [1, 2, 3, 0], // 11→00→01→10
    [3, 2, 0, 1], // 11→01→10→00
  ],
  // T-FF: 두 MUX 모두 non-degenerate 검증된 cycle
  exam_variant: [
    [1, 3, 0, 2], // 11→10→00→01
    [2, 0, 3, 1], // 11→01→00→10
  ],
};

const stateLabel = (s: number): string => `${(s >> 1) & 1}${s & 1}`;

/** 2×1 MUX 데이터입력 (I0,I1) — 선택선으로 분리 후 나머지 변수의 함수(0/1/var/var'). */
function muxInputs(spec: Bit[], selectVar: "Q_A" | "Q_B"): { i0: string; i1: string } {
  const dataVar = selectVar === "Q_A" ? "Q_B" : "Q_A";
  const lit = (a: Bit, b: Bit): string => {
    if (a === 0 && b === 0) return "0";
    if (a === 1 && b === 1) return "1";
    if (a === 0 && b === 1) return dataVar;
    return `${dataVar}'`;
  };
  // spec index s=(Q_A<<1)|Q_B
  if (selectVar === "Q_A") return { i0: lit(spec[0], spec[1]), i1: lit(spec[2], spec[3]) };
  return { i0: lit(spec[0], spec[2]), i1: lit(spec[1], spec[3]) };
}

function sopExpr(spec: Bit[]): string {
  const minterms: number[] = [];
  for (let s = 0; s < 4; s++) if (spec[s] === 1) minterms.push(s);
  const fn: BooleanFunction = { vars: 2, varNames: ["Q_A", "Q_B"], minterms, dontCares: [] };
  return sopToString(minimizeSop(fn), ["Q_A", "Q_B"]);
}

export type DffMuxSequentialGeneration = {
  ffType: "D" | "T";
  nextOf: number[];
  cycleSeq: number[];
  selectVar: "Q_A" | "Q_B";
  inAExpr: string; inBExpr: string;  // D_A/T_A · D_B/T_B 의 SOP
  muxA: { i0: string; i1: string };
  muxB: { i0: string; i1: string };
  clkHz: number; qAHz: number;
  circuitDiagram: DffMuxSequentialCircuitDiagram;
  stateDiagram: unknown; stateTable: unknown;
};

/** 선택선 선택: 두 MUX 모두 non-degenerate(i0≠i1)인 selectVar 우선. */
function pickSelect(specDA: Bit[], specDB: Bit[]): "Q_A" | "Q_B" | null {
  for (const sv of ["Q_A", "Q_B"] as const) {
    const a = muxInputs(specDA, sv), b = muxInputs(specDB, sv);
    if (a.i0 !== a.i1 && b.i0 !== b.i1) return sv;   // 둘 다 유효
  }
  return null;  // 없으면 이 cycle 부적합
}

export function generateDffMuxSequential(args: { seed?: number; mode: "exam_similar" | "exam_variant" }): DffMuxSequentialGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  // ★ 유사=D-FF, 변형(응용)=T-FF.
  const ffType: "D" | "T" = args.mode === "exam_variant" ? "T" : "D";
  const pool = CYCLE_POOL[args.mode] ?? CYCLE_POOL.exam_similar;
  const nextOf = pool[Math.floor(rand() * pool.length) % pool.length];

  // FF 입력 spec: D-FF → D=차기상태 / T-FF → T=현재 XOR 차기.
  const specDA: Bit[] = [], specDB: Bit[] = [];
  for (let s = 0; s < 4; s++) {
    const n = nextOf[s];
    const qA = ((s >> 1) & 1) as Bit, qB = (s & 1) as Bit;
    const nA = ((n >> 1) & 1) as Bit, nB = (n & 1) as Bit;
    specDA.push((ffType === "T" ? (qA ^ nA) : nA) as Bit);
    specDB.push((ffType === "T" ? (qB ^ nB) : nB) as Bit);
  }
  const selectVar = pickSelect(specDA, specDB)!;
  const muxA = muxInputs(specDA, selectVar);
  const muxB = muxInputs(specDB, selectVar);
  const inAExpr = sopExpr(specDA);
  const inBExpr = sopExpr(specDB);

  // cycle 순서 (11=3 에서 시작)
  const cycleSeq: number[] = [3];
  let cur = nextOf[3];
  while (cur !== 3 && cycleSeq.length < 8) { cycleSeq.push(cur); cur = nextOf[cur]; }

  // 주파수: Q_A 순차 값의 상승에지 수 → f_QA = clk × risingEdges / cycleLen
  const L = cycleSeq.length;
  const qaSeq = cycleSeq.map((s) => (s >> 1) & 1);
  let rising = 0;
  for (let k = 0; k < L; k++) { const a = qaSeq[k], b = qaSeq[(k + 1) % L]; if (a === 0 && b === 1) rising++; }
  const clkHz = 60;
  const qAHz = Math.round((clkHz * rising / L) * 1000) / 1000;

  const inLabel = ffType === "T" ? "T" : "D";
  const circuitDiagram: DffMuxSequentialCircuitDiagram = {
    ffType,
    selectVar,
    muxes: [
      { id: "MUX_A", target: `${inLabel}_A`, i0: BLANK[0], i1: BLANK[1] },
      { id: "MUX_B", target: `${inLabel}_B`, i0: BLANK[2], i1: BLANK[3] },
    ],
    blankSymbols: [...BLANK],
  };

  // (가) 상태도 (concept_diagram: 링) — cycleSeq 노드 + 화살표
  const stateDiagram = {
    nodes: cycleSeq.map((s) => ({ id: stateLabel(s), label: stateLabel(s) })),
    edges: cycleSeq.map((s, k) => ({ from: stateLabel(s), to: stateLabel(cycleSeq[(k + 1) % L]) })),
    title: "상태 전이도 (Q_AQ_B)",
  };
  // (나 보조) 상태표
  const stateTable = {
    variables: ["Q_A", "Q_B"],
    outputLabels: ["Q_A(t+1)", "Q_B(t+1)", `${inLabel}_A`, `${inLabel}_B`],
    rows: [0, 1, 2, 3].map((s) => ({
      inputs: [(s >> 1) & 1, s & 1],
      outputs: [(nextOf[s] >> 1) & 1, nextOf[s] & 1, specDA[s], specDB[s]],
    })),
  };

  return { ffType, nextOf, cycleSeq, selectVar, inAExpr, inBExpr, muxA, muxB, clkHz, qAHz, circuitDiagram, stateDiagram, stateTable };
}
