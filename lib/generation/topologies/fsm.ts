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
 * 4-state FSM generator — Mealy / Moore 두 archetype.
 *
 *  공통:
 *   - 상태: S0, S1, S2, S3 (Q1Q0 = 00, 01, 10, 11)
 *   - 입력: X (1비트)
 *   - 출력: Z (1비트)
 *   - 8 transition: (state, X) → next state
 *
 *  Mealy: output = f(state, X). 8 entry output[]. Z는 3변수 함수 (Q1, Q0, X).
 *  Moore: output = f(state) only. 4 entry output[]. Z는 본질 2변수 (Q1, Q0)지만,
 *    통합 logic_network에 3변수 (Q1, Q0, X)로 포함하기 위해 minterm을 X=0/1 두 인덱스 모두에 등록.
 *    결과 SOP는 X를 don't-care로 자동 인식 (pattern에 X로 남음).
 */

export type FsmArchetype = "mealy_4state" | "moore_4state";
export type FsmMachineType = "Mealy" | "Moore";

export type FsmGeneration = {
  /** 8 transition: nextState[state*2 + input] = next state */
  nextState: number[];
  /** Mealy: length 8 (per transition). Moore: length 4 (per state). */
  output: number[];
  d1Sop: SopTerm[];
  d0Sop: SopTerm[];
  zSop: SopTerm[];
  d1Expression: string;
  d0Expression: string;
  zExpression: string;
  stateDiagram: ConceptDiagram;
  logicNetworkDiagram: LogicNetworkDiagram;
  archetype: FsmArchetype;
  machineType: FsmMachineType;
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
  const archetype: FsmArchetype = args.archetype
    ?? pick<FsmArchetype>(["mealy_4state", "moore_4state"], rand);
  if (archetype === "mealy_4state") return buildMealy4State(rand);
  return buildMoore4State(rand);
}

// =====================================================================
// Mealy: output = f(state, X), length 8
// =====================================================================
function buildMealy4State(rand: () => number): FsmGeneration {
  const nextState: number[] = [];
  const output: number[] = [];
  for (let i = 0; i < 8; i++) {
    nextState.push(Math.floor(rand() * 4));
    output.push(Math.floor(rand() * 2));
  }

  const d1Minterms: number[] = [];
  const d0Minterms: number[] = [];
  const zMinterms: number[] = [];
  for (let i = 0; i < 8; i++) {
    if ((nextState[i] >> 1) & 1) d1Minterms.push(i);
    if (nextState[i] & 1) d0Minterms.push(i);
    if (output[i] === 1) zMinterms.push(i);
  }

  return assembleResult({
    nextState, output,
    d1Minterms, d0Minterms, zMinterms,
    archetype: "mealy_4state",
    machineType: "Mealy",
    buildStateDiagram: () => buildMealyDiagram(nextState, output),
  });
}

// =====================================================================
// Moore: output = f(state), length 4 (per state)
// =====================================================================
function buildMoore4State(rand: () => number): FsmGeneration {
  const nextState: number[] = [];
  for (let i = 0; i < 8; i++) nextState.push(Math.floor(rand() * 4));
  const output: number[] = [];
  for (let s = 0; s < 4; s++) output.push(Math.floor(rand() * 2));

  // D1, D0: 3변수 (Q1, Q0, X) — 동일
  // Z: 2변수 (Q1, Q0). 통합 회로에 포함하기 위해 X=0,1 모두 같은 값 → SOP 최소화 후 X는 자연스럽게 don't-care.
  const d1Minterms: number[] = [];
  const d0Minterms: number[] = [];
  const zMinterms: number[] = [];
  for (let i = 0; i < 8; i++) {
    if ((nextState[i] >> 1) & 1) d1Minterms.push(i);
    if (nextState[i] & 1) d0Minterms.push(i);
    const s = i >> 1;
    if (output[s] === 1) zMinterms.push(i);
  }

  return assembleResult({
    nextState, output,
    d1Minterms, d0Minterms, zMinterms,
    archetype: "moore_4state",
    machineType: "Moore",
    buildStateDiagram: () => buildMooreDiagram(nextState, output),
  });
}

// =====================================================================
// 공통 조립
// =====================================================================
function assembleResult(args: {
  nextState: number[];
  output: number[];
  d1Minterms: number[];
  d0Minterms: number[];
  zMinterms: number[];
  archetype: FsmArchetype;
  machineType: FsmMachineType;
  buildStateDiagram: () => ConceptDiagram;
}): FsmGeneration {
  const mkFn = (minterms: number[]): BooleanFunction => ({
    vars: 3, varNames: VAR_NAMES,
    minterms: minterms.slice().sort((a, b) => a - b),
    dontCares: [],
  });

  const d1Sop = minimizeSop(mkFn(args.d1Minterms));
  const d0Sop = minimizeSop(mkFn(args.d0Minterms));
  const zSop  = minimizeSop(mkFn(args.zMinterms));

  const d1Expression = sopToString(d1Sop, VAR_NAMES);
  const d0Expression = sopToString(d0Sop, VAR_NAMES);
  const zExpression  = sopToString(zSop, VAR_NAMES);

  const stateDiagram = args.buildStateDiagram();

  const logicNetworkDiagram = buildLogicNetworkMulti({
    sops: [
      { sop: d1Sop, outputName: "D1" },
      { sop: d0Sop, outputName: "D0" },
      { sop: zSop,  outputName: "Z" },
    ],
    varNames: VAR_NAMES,
  });

  return {
    nextState: args.nextState,
    output: args.output,
    d1Sop, d0Sop, zSop,
    d1Expression, d0Expression, zExpression,
    stateDiagram, logicNetworkDiagram,
    archetype: args.archetype,
    machineType: args.machineType,
    values: { d1Terms: d1Sop.length, d0Terms: d0Sop.length, zTerms: zSop.length },
  };
}

// =====================================================================
// 상태 전이도 — Mealy 와 Moore 다른 라벨링
// =====================================================================

// Mealy: 노드 = state, 에지 = "input/output"
function buildMealyDiagram(nextState: number[], output: number[]): ConceptDiagram {
  const diagram: ConceptDiagram = {
    nodes: STATE_LABELS.map((label, i) => ({ id: `s${i}`, label })),
    edges: [],
  };
  for (let s = 0; s < 4; s++) {
    for (let x = 0; x < 2; x++) {
      const idx = (s << 1) | x;
      diagram.edges.push({
        from: `s${s}`,
        to: `s${nextState[idx]}`,
        label: `${x}/${output[idx]}`,
      });
    }
  }
  return diagram;
}

// Moore: 노드 = "state/Z=val", 에지 = "input"
function buildMooreDiagram(nextState: number[], output: number[]): ConceptDiagram {
  const diagram: ConceptDiagram = {
    nodes: STATE_LABELS.map((label, i) => ({ id: `s${i}`, label: `${label} / Z=${output[i]}` })),
    edges: [],
  };
  for (let s = 0; s < 4; s++) {
    for (let x = 0; x < 2; x++) {
      const idx = (s << 1) | x;
      diagram.edges.push({
        from: `s${s}`,
        to: `s${nextState[idx]}`,
        label: `${x}`,
      });
    }
  }
  return diagram;
}
