import type {
  CircuitTypeParams,
  ConceptDiagram,
  LogicNetworkDiagram,
} from "@/types";
import {
  sopToString,
  type BooleanFunction,
  type SopTerm,
} from "@/lib/digital/booleanFunction";
import { buildLogicNetworkMulti } from "@/lib/digital/buildLogicNetwork";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * 4-state Mealy FSM generator.
 *
 *  States: S0, S1, S2, S3 (이진 인코딩 Q1Q0 = 00, 01, 10, 11)
 *  Input:  X (1비트)
 *  Output: Z (1비트, Mealy = state·input의 함수)
 *
 *  random transition table (8 entries: (Q1,Q0,X) → next_Q1, next_Q0)
 *  random output table (8 entries: (Q1,Q0,X) → Z)
 *
 *  최소화:
 *   - D1 = next_Q1 = f(Q1, Q0, X)  (3변수 SOP)
 *   - D0 = next_Q0 = f(Q1, Q0, X)
 *   - Z  = f(Q1, Q0, X)
 *
 *  Figures:
 *   - state_diagram (concept_diagram, 4 nodes + 8 edges with "X/Z" labels)
 *   - implementation_circuit (logic_network 통합)
 */

export type FsmArchetype = "mealy_4state";

export type FsmGeneration = {
  /** 다음 상태 함수: nextState[state*2 + input] = next state (0..3) */
  nextState: number[];     // 길이 8
  /** Mealy output: output[state*2 + input] = 0/1 */
  output: number[];        // 길이 8
  d1Sop: SopTerm[];
  d0Sop: SopTerm[];
  zSop: SopTerm[];
  d1Expression: string;
  d0Expression: string;
  zExpression: string;
  stateDiagram: ConceptDiagram;
  logicNetworkDiagram: LogicNetworkDiagram;
  archetype: FsmArchetype;
  values: Record<string, number>;
};

const STATE_LABELS = ["S0", "S1", "S2", "S3"];
const VAR_NAMES = ["Q1", "Q0", "X"];

export function generateFsm(args: {
  params?: CircuitTypeParams;
  archetype?: FsmArchetype;
  seed?: number;
}): FsmGeneration {
  const rand = makeRand(args.seed);
  const archetype: FsmArchetype = args.archetype ?? "mealy_4state";
  return buildMealy4State(rand);
  void archetype;
}

function buildMealy4State(rand: () => number): FsmGeneration {
  // 8 transitions — 각 (state, input) → next state (0..3)
  const nextState: number[] = [];
  // 8 outputs — 각 (state, input) → 0/1
  const output: number[] = [];
  for (let i = 0; i < 8; i++) {
    nextState.push(Math.floor(rand() * 4));
    output.push(Math.floor(rand() * 2));
  }

  // 인덱스 매핑: index = (Q1 << 2) | (Q0 << 1) | X
  // D1 minterm: 인덱스 중 next_Q1 bit가 1인 것 (nextState[i] & 2 > 0)
  // D0 minterm: 인덱스 중 next_Q0 bit가 1인 것 (nextState[i] & 1 > 0)
  // Z  minterm: 인덱스 중 output[i] === 1
  const d1Minterms: number[] = [];
  const d0Minterms: number[] = [];
  const zMinterms: number[] = [];
  for (let i = 0; i < 8; i++) {
    if ((nextState[i] >> 1) & 1) d1Minterms.push(i);
    if (nextState[i] & 1) d0Minterms.push(i);
    if (output[i] === 1) zMinterms.push(i);
  }

  const mkFn = (minterms: number[]): BooleanFunction => ({
    vars: 3, varNames: VAR_NAMES, minterms: minterms.slice().sort((a, b) => a - b), dontCares: [],
  });

  const d1Sop = minimizeSop(mkFn(d1Minterms));
  const d0Sop = minimizeSop(mkFn(d0Minterms));
  const zSop  = minimizeSop(mkFn(zMinterms));

  const d1Expression = sopToString(d1Sop, VAR_NAMES);
  const d0Expression = sopToString(d0Sop, VAR_NAMES);
  const zExpression  = sopToString(zSop, VAR_NAMES);

  // 상태 전이도 (concept_diagram)
  // nodes: S0..S3
  // edges: 각 (state, input) → next 에 대해 label "X/Z"
  const stateDiagram: ConceptDiagram = {
    nodes: STATE_LABELS.map((label, i) => ({ id: `s${i}`, label })),
    edges: [],
  };
  for (let s = 0; s < 4; s++) {
    for (let x = 0; x < 2; x++) {
      const idx = (s << 1) | x;
      const ns = nextState[idx];
      const z = output[idx];
      stateDiagram.edges.push({
        from: `s${s}`,
        to: `s${ns}`,
        label: `${x}/${z}`,
      });
    }
  }

  const logicNetworkDiagram = buildLogicNetworkMulti({
    sops: [
      { sop: d1Sop, outputName: "D1" },
      { sop: d0Sop, outputName: "D0" },
      { sop: zSop,  outputName: "Z" },
    ],
    varNames: VAR_NAMES,
  });

  return {
    nextState, output,
    d1Sop, d0Sop, zSop,
    d1Expression, d0Expression, zExpression,
    stateDiagram, logicNetworkDiagram,
    archetype: "mealy_4state",
    values: { d1Terms: d1Sop.length, d0Terms: d0Sop.length, zTerms: zSop.length },
  };
}
