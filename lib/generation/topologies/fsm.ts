import type {
  CircuitTypeParams,
  ConceptDiagram,
  LogicGate,
  LogicNetworkDiagram,
} from "@/types";
import {
  sopToString,
  type BooleanFunction,
  type SopTerm,
} from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import {
  synthesizeMuxFsmCombinational,
  evalMuxSignal,
  MUX_SELECT_CANDIDATES,
  MUX_INPUT_CANDIDATES,
  type MuxFsmSynthesis,
} from "@/lib/digital/synthesizeMuxFsm";
import { makeRand, pick } from "./_helpers";

/**
 * 두 D 입력이 항상 2×1 MUX로 표현되도록 (form 먼저 → nextState 역산) transition 생성.
 *  - D1 = MUX(S=d1S, I0=d1I0, I1=d1I1), D0 = MUX(S=d0S, I0=d0I0, I1=d0I1)
 *  - nextState[i] = (D1[i]<<1) | D0[i]
 *  - I0 ≠ I1 (S에 의존하는 비자명 form만)
 *  - ensureAllStatesReachable 만족하는 transition만 채택 (rewire 안 함 — form이 깨지므로)
 *  - 최대 attempts회 시도 후 못 찾으면 일반 무작위 fallback.
 */
function buildMuxDrivenTransitions(rand: () => number, attempts = 200): {
  nextState: number[];
  d1Form: { S: string; I0: string; I1: string };
  d0Form: { S: string; I0: string; I1: string };
} | null {
  const allStatesReachable = (ns: number[]): boolean => {
    for (let t = 0; t < 4; t++) {
      const has = ns.some((dst, i) => dst === t && Math.floor(i / 2) !== t);
      if (!has) return false;
    }
    return true;
  };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const d1S = pick<string>([...MUX_SELECT_CANDIDATES], rand);
    let d1I0 = pick<string>([...MUX_INPUT_CANDIDATES], rand);
    let d1I1 = pick<string>([...MUX_INPUT_CANDIDATES], rand);
    if (d1I0 === d1I1) d1I1 = MUX_INPUT_CANDIDATES[(MUX_INPUT_CANDIDATES.indexOf(d1I1 as (typeof MUX_INPUT_CANDIDATES)[number]) + 1) % MUX_INPUT_CANDIDATES.length];
    const d0S = pick<string>([...MUX_SELECT_CANDIDATES], rand);
    let d0I0 = pick<string>([...MUX_INPUT_CANDIDATES], rand);
    let d0I1 = pick<string>([...MUX_INPUT_CANDIDATES], rand);
    if (d0I0 === d0I1) d0I1 = MUX_INPUT_CANDIDATES[(MUX_INPUT_CANDIDATES.indexOf(d0I1 as (typeof MUX_INPUT_CANDIDATES)[number]) + 1) % MUX_INPUT_CANDIDATES.length];

    const nextState: number[] = [];
    for (let i = 0; i < 8; i++) {
      const d1Sel = evalMuxSignal(d1S, i);
      const d1 = d1Sel === 0 ? evalMuxSignal(d1I0, i) : evalMuxSignal(d1I1, i);
      const d0Sel = evalMuxSignal(d0S, i);
      const d0 = d0Sel === 0 ? evalMuxSignal(d0I0, i) : evalMuxSignal(d0I1, i);
      nextState.push((d1 << 1) | d0);
    }
    if (!allStatesReachable(nextState)) continue;

    return {
      nextState,
      d1Form: { S: d1S, I0: d1I0, I1: d1I1 },
      d0Form: { S: d0S, I0: d0I0, I1: d0I1 },
    };
  }
  return null;
}

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
  /** MUX 기반 합성 결과 — D1/D0 각 MUX의 (S, I0, I1). ㄱ/ㄴ/ㄷ/ㄹ 답 추적용. */
  muxForms: MuxFsmSynthesis["muxForms"];
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
  // MUX-friendly transitions를 먼저 시도. 못 찾으면 일반 무작위로 fallback.
  const muxDriven = buildMuxDrivenTransitions(rand);
  let nextState: number[];
  if (muxDriven) {
    nextState = muxDriven.nextState;
  } else {
    nextState = [];
    for (let i = 0; i < 8; i++) nextState.push(Math.floor(rand() * 4));
    ensureAllStatesReachable(nextState, rand);
  }

  const output: number[] = [];
  for (let i = 0; i < 8; i++) output.push(Math.floor(rand() * 2));
  biasMealyZTowardXor(output, rand);

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
  // MUX-friendly transitions를 먼저 시도. 못 찾으면 일반 무작위로 fallback.
  const muxDriven = buildMuxDrivenTransitions(rand);
  let nextState: number[];
  if (muxDriven) {
    nextState = muxDriven.nextState;
  } else {
    nextState = [];
    for (let i = 0; i < 8; i++) nextState.push(Math.floor(rand() * 4));
    ensureAllStatesReachable(nextState, rand);
  }
  const output: number[] = [];
  for (let s = 0; s < 4; s++) output.push(Math.floor(rand() * 2));
  biasMooreZTowardXor(output, rand);

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

  // 조합부: D1, D0는 2×1 MUX로 합성 (원본 임용 출제 형식). 실패 시 SOP fallback.
  const muxSynth = synthesizeMuxFsmCombinational({
    d1Minterms: args.d1Minterms,
    d0Minterms: args.d0Minterms,
    d1Sop, d0Sop, zSop,
  });

  // 순차부: D1→Q1, D0→Q0를 D flip-flop으로 closure.
  //  · Q1, Q0는 더 이상 외부 입력이 아니고 DFF 출력 (state register).
  //  · 외부 입력은 X만, 출력은 Z + Q1·Q0 (state visibility). D1/D0는 내부 wire.
  const logicNetworkDiagram = wrapFsmWithFlipFlops(muxSynth.diagram);

  return {
    nextState: args.nextState,
    output: args.output,
    d1Sop, d0Sop, zSop,
    d1Expression, d0Expression, zExpression,
    stateDiagram, logicNetworkDiagram,
    muxForms: muxSynth.muxForms,
    archetype: args.archetype,
    machineType: args.machineType,
    values: { d1Terms: d1Sop.length, d0Terms: d0Sop.length, zTerms: zSop.length },
  };
}

/**
 * Mealy Z 출력에 50% 확률로 XOR/XNOR 형태를 강제 — 조합부 회로에 XOR/XNOR 게이트가
 * 더 자주 등장하도록 (학습 자료로서 다양성 확보).
 *  - Q1·Q0·X (3변수) 8-minterm 함수
 *  - 후보 form: Q1⊕Q0, Q1⊕X, Q0⊕X, Q1⊕Q0⊕X (각각 반전 시 XNOR)
 *  - bias 없이도 ensureAllStatesReachable로 unreachable state는 방지됨 (output만 수정)
 */
function biasMealyZTowardXor(output: number[], rand: () => number): void {
  if (rand() >= 0.5) return;
  const forms = [
    (s: number, x: number) => ((s >> 1) & 1) ^ (s & 1),
    (s: number, x: number) => ((s >> 1) & 1) ^ x,
    (s: number, x: number) => (s & 1) ^ x,
    (s: number, x: number) => ((s >> 1) & 1) ^ (s & 1) ^ x,
  ];
  const form = forms[Math.floor(rand() * forms.length)];
  const invert = rand() < 0.5 ? 1 : 0;
  for (let i = 0; i < 8; i++) {
    const s = i >> 1;
    const x = i & 1;
    output[i] = form(s, x) ^ invert;
  }
}

/**
 * Moore Z 출력에 50% 확률로 XOR 형태 강제. Q1·Q0 (2변수) 4-minterm 함수.
 *  유의미한 form은 Q1⊕Q0 / Q1⊙Q0 (XNOR) 두 가지뿐.
 */
function biasMooreZTowardXor(output: number[], rand: () => number): void {
  if (rand() >= 0.5) return;
  const invert = rand() < 0.5 ? 1 : 0;
  for (let s = 0; s < 4; s++) {
    output[s] = (((s >> 1) & 1) ^ (s & 1)) ^ invert;
  }
}

/**
 * 모든 state가 자기 외 다른 state로부터 최소 1개의 incoming transition을 가지도록 재구성.
 * random sampling이 한 state로만 몰려서 어떤 state가 unreachable해지는 경우를 방지.
 *  - nextState[s*2 + x] = next state (s: 출발 state, x: 입력 0/1)
 *  - 4 state × 2 input = 8 transition
 *  - 각 unreachable target에 대해 다른 state의 transition 1개를 random으로 target으로 재배치.
 *  - rewire가 다른 state를 unreachable로 만들 수 있어 반복 (최대 numStates*2 회).
 */
function ensureAllStatesReachable(nextState: number[], rand: () => number, numStates = 4): void {
  for (let attempt = 0; attempt < numStates * 2; attempt++) {
    let allReachable = true;
    for (let target = 0; target < numStates; target++) {
      const hasIncoming = nextState.some(
        (dst, i) => dst === target && Math.floor(i / 2) !== target,
      );
      if (hasIncoming) continue;
      allReachable = false;
      const candidates: number[] = [];
      for (let i = 0; i < nextState.length; i++) {
        if (Math.floor(i / 2) === target) continue;
        candidates.push(i);
      }
      if (candidates.length === 0) continue;
      const idx = candidates[Math.floor(rand() * candidates.length)];
      nextState[idx] = target;
    }
    if (allReachable) return;
  }
}

// =====================================================================
// FSM 조합부 LogicNetwork에 D 플립플롭을 연결해 완전 FSM 회로로 만든다.
//  · combinational.inputs: [Q1, Q0, X] → [X] 로 축소 (Q1, Q0는 DFF 출력으로 이동)
//  · DFF gate 2개 추가: G_dff_Q1 (D=D1, Q=Q1), G_dff_Q0 (D=D0, Q=Q0)
//  · outputs: [Z, Q1, Q0] — D1, D0는 조합부→FF 사이 내부 wire라 terminal label 불필요.
//    (D1/D0를 outputs에 넣으면 OR 게이트 우측에 "D1" 라벨이 그려지면서 DFF body·CLK ▷와
//    겹쳐 D1→CLK 연결로 오해될 수 있음.)
// =====================================================================
function wrapFsmWithFlipFlops(combinational: LogicNetworkDiagram): LogicNetworkDiagram {
  const dffGates: LogicGate[] = [
    { id: "G_dff_Q1", type: "DFF", inputs: ["D1"], output: "Q1" },
    { id: "G_dff_Q0", type: "DFF", inputs: ["D0"], output: "Q0" },
  ];
  const externalInputs = combinational.inputs.filter((s) => s !== "Q1" && s !== "Q0");
  const outputs = ["Z", "Q1", "Q0"];
  return {
    inputs: externalInputs,
    outputs,
    gates: [...dffGates, ...combinational.gates],
    blanks: combinational.blanks,
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
