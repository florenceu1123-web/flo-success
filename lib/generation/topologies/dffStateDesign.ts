import type {
  ConceptDiagram,
  DffStateDesignCircuitDiagram,
  GenerationMode,
  TruthTableDiagram,
} from "@/types";
import { sopToString, type BooleanFunction } from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * D 플립플롭 2개 상태도 순차회로 설계 (임용 9번 정보과) — 전용 archetype.
 *
 *  원본: (가) 입력 없는 2-bit 상태도(자율 순환, 예 00→01→10→11→00) →
 *        (나) 상태표(현재상태 Q_A·Q_B | 다음상태 | D_A·D_B 입력, ㉠~㉣·①~④ 빈칸) →
 *        (다) D-FF 2개 + 논리 게이트(㉮·㉯) 구현.
 *  D 플립플롭은 D = 다음상태 (여기표 불필요). D_A·D_B를 Q_A·Q_B의 함수로 최소화 → 게이트.
 *
 *  ★ generic fsm(Mealy 입력/출력)·sequential_dff_generic(입력파형)은 이 "상태도→D입력→게이트"
 *    형식을 잃음 → 전용 결정론 archetype.
 *
 *  값(상태 cycle)만 다른 결정론 생성. GPT 없음. cycle은 D_A·D_B가 단일 게이트로 떨어지는 것만.
 */

type Bit = 0 | 1;
const BLANK_NEXT = ["㉠", "㉡", "㉢", "㉣"];   // (나) 다음상태 빈칸
const GATE_SYMS = ["㉮", "㉯"];                  // (다) 게이트 빈칸

export type DffStateDesignGeneration = {
  cycleSeq: number[];                 // 11(=3)부터? 아니, 00부터 순환 순서
  nextOf: number[];                   // nextOf[s]
  dAExpr: string; dBExpr: string;     // 최소 SOP
  dAGate: string; dBGate: string;     // 게이트 종류명
  nextAnswers: Array<{ symbol: string; answer: string }>; // ㉠~㉣ (다음상태)
  gateAnswers: Array<{ symbol: string; answer: string }>; // ㉮·㉯ (게이트)
  stateDiagram: ConceptDiagram;       // (가)
  stateTable: TruthTableDiagram;      // (나)
  circuitDiagram: DffStateDesignCircuitDiagram; // (다)
};

// 단일 4-cycle (00=0 시작) — nextOf 정의. D_A·D_B가 단일 게이트로 최소화되는 것만 선별.
const CYCLE_POOL: Record<GenerationMode, number[][]> = {
  // 0→1→2→3→0 (2비트 업카운터: D_A=Q_A⊕Q_B, D_B=Q_B'). 0→3→2→1→0 (다운: D_A=Q_A⊙Q_B 등)
  exam_similar: [
    [0, 1, 2, 3], // up
    [0, 3, 2, 1], // down
  ],
  exam_variant: [
    [0, 2, 3, 1],
    [0, 1, 3, 2],
  ],
};

const stateLabel = (s: number): string => `${(s >> 1) & 1}${s & 1}`;

/** 4-bit spec(f(00),f(01),f(10),f(11)) → 단일 게이트 종류명. */
function gateName(spec: Bit[]): string {
  const key = spec.join("");
  const map: Record<string, string> = {
    "0001": "AND", "0111": "OR", "0110": "XOR", "1001": "XNOR",
    "1110": "NAND", "1000": "NOR",
    "0011": "버퍼(Q_A)", "0101": "버퍼(Q_B)", "1100": "NOT(Q_A)", "1010": "NOT(Q_B)",
    "0000": "0(상수)", "1111": "1(상수)",
  };
  return map[key] ?? "복합";
}

/** 2변수(Q_A,Q_B) 최소 SOP. */
function sopExpr(spec: Bit[]): string {
  const minterms: number[] = [];
  for (let s = 0; s < 4; s++) if (spec[s] === 1) minterms.push(s);
  const fn: BooleanFunction = { vars: 2, varNames: ["Q_A", "Q_B"], minterms, dontCares: [] };
  const sop = sopToString(minimizeSop(fn), ["Q_A", "Q_B"]);
  return sop || "0";
}

function solve(cycle: number[]): DffStateDesignGeneration {
  const nextOf: number[] = [0, 0, 0, 0];
  for (let i = 0; i < cycle.length; i++) nextOf[cycle[i]] = cycle[(i + 1) % cycle.length];

  // D_A(s)=다음 Q_A, D_B(s)=다음 Q_B  (D-FF: D=다음상태)
  const dASpec: Bit[] = [0, 1, 2, 3].map((s) => ((nextOf[s] >> 1) & 1) as Bit);
  const dBSpec: Bit[] = [0, 1, 2, 3].map((s) => (nextOf[s] & 1) as Bit);

  const dAExpr = sopExpr(dASpec), dBExpr = sopExpr(dBSpec);
  const dAGate = gateName(dASpec), dBGate = gateName(dBSpec);

  // cycleSeq: 00(=0)에서 시작한 순환 순서
  const cycleSeq: number[] = [];
  let cur = 0;
  do { cycleSeq.push(cur); cur = nextOf[cur]; } while (cur !== 0 && cycleSeq.length < 4);

  // (가) 상태도 — 입력 없는 ring
  const stateDiagram: ConceptDiagram = {
    nodes: cycleSeq.map((s) => ({ id: `s${s}`, label: stateLabel(s) })),
    edges: cycleSeq.map((s) => ({ from: `s${s}`, to: `s${nextOf[s]}` })),
  };

  // (나) 상태표 — 현재상태 | 다음상태(㉠~㉣) | D입력. 다음상태 cell을 빈칸으로.
  const rowsOrder = [0, 1, 2, 3]; // 표는 00,01,10,11 순
  const nextAnswers: Array<{ symbol: string; answer: string }> = rowsOrder.map((s, i) => ({
    symbol: BLANK_NEXT[i],
    answer: stateLabel(nextOf[s]),
  }));
  const stateTable: TruthTableDiagram = {
    variables: ["Q_A", "Q_B"],
    inputGroups: [{ label: "현재 상태", span: 2 }],
    outputLabels: ["Q_A(t+1)", "Q_B(t+1)", "D_A", "D_B"],
    outputGroups: [
      { label: "다음 상태", span: 2 },
      { label: "플립플롭 입력", span: 2 },
    ],
    rows: rowsOrder.map((s) => ({
      inputs: [(s >> 1) & 1, s & 1],
      outputs: [(nextOf[s] >> 1) & 1, nextOf[s] & 1, (nextOf[s] >> 1) & 1, nextOf[s] & 1],
    })),
  };

  // (다) 구현 회로 — 게이트 ㉮(D_A)·㉯(D_B), 입력 Q_A·Q_B
  const circuitDiagram: DffStateDesignCircuitDiagram = {
    gateASym: GATE_SYMS[0],
    gateBSym: GATE_SYMS[1],
    gateAInputs: ["Q_A", "Q_B"],
    gateBInputs: ["Q_A", "Q_B"],
  };

  const gateAnswers = [
    { symbol: GATE_SYMS[0], answer: `D_A = ${dAExpr} (${dAGate})` },
    { symbol: GATE_SYMS[1], answer: `D_B = ${dBExpr} (${dBGate})` },
  ];

  return {
    cycleSeq, nextOf, dAExpr, dBExpr, dAGate, dBGate,
    nextAnswers, gateAnswers, stateDiagram, stateTable, circuitDiagram,
  };
}

export function generateDffStateDesign(args: { seed?: number; mode: GenerationMode }): DffStateDesignGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 5; i++) rand();
  const pool = CYCLE_POOL[args.mode] ?? CYCLE_POOL.exam_similar;
  return solve(pick(pool, rand));
}
