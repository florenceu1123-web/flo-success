import type {
  CircuitTypeParams,
  KmapDiagram,
  LogicGate,
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
 * 2비트 동기식 카운터 generator. D-FF / JK-FF / T-FF 사용.
 *
 *  Archetypes:
 *   - "two_bit_d_ff_cyclic":  D 플립플롭. D = Q+. 2 K-map (D1, D0).
 *   - "two_bit_jk_ff_cyclic": JK 플립플롭. 여기표 사용, don't care 활용. 4 K-map (J1, K1, J0, K0).
 *   - "two_bit_t_ff_cyclic":  T 플립플롭. T = Q ⊕ Q+ (XOR). 2 K-map (T1, T0).
 *
 *  4-state 순열을 next-state로 사용 (full-cycle 우선).
 */

export type FlipflopArchetype =
  | "two_bit_d_ff_cyclic"
  | "two_bit_jk_ff_cyclic"
  | "two_bit_t_ff_cyclic";

export type FfInput = {
  /** "D1", "D0", "J1", "K1", "J0", "K0" */
  name: string;
  sop: SopTerm[];
  expression: string;
  kmap: KmapDiagram;
};

export type FlipflopCounterGeneration = {
  /** 4-state next-state 매핑 */
  nextState: number[];
  /** FF 입력들 (D: 2개, JK: 4개) */
  ffInputs: FfInput[];
  logicNetworkDiagram: LogicNetworkDiagram;
  sequenceText: string;
  archetype: FlipflopArchetype;
  /** "D" / "JK" / "T" — 텍스트 라이터가 표현 선택 */
  ffType: "D" | "JK" | "T";
  values: Record<string, number>;
};

const VAR_NAMES = ["Q1", "Q0"];

function bitsLabel(s: number): string {
  return s.toString(2).padStart(2, "0");
}

function pickPermutation(rand: () => number): number[] {
  const a = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isFullCycle(perm: number[]): boolean {
  const visited = new Set<number>();
  let cur = 0;
  for (let i = 0; i < perm.length; i++) {
    if (visited.has(cur)) return false;
    visited.add(cur);
    cur = perm[cur];
  }
  return cur === 0 && visited.size === perm.length;
}

export function generateFlipflopCounter(args: {
  params?: CircuitTypeParams;
  archetype?: FlipflopArchetype;
  seed?: number;
}): FlipflopCounterGeneration {
  const rand = makeRand(args.seed);
  const archetype: FlipflopArchetype = args.archetype
    ?? pick<FlipflopArchetype>(
      ["two_bit_d_ff_cyclic", "two_bit_jk_ff_cyclic", "two_bit_t_ff_cyclic"],
      rand,
    );

  // full-cycle 순열 뽑기
  let perm: number[] = [];
  for (let tries = 0; tries < 30; tries++) {
    perm = pickPermutation(rand);
    if (perm[0] !== 0 || perm[1] !== 1 || perm[2] !== 2 || perm[3] !== 3) {
      if (isFullCycle(perm)) break;
      if (tries === 29) break;
    }
  }

  const sequenceText = `${bitsLabel(0)} → ${bitsLabel(perm[0])} → ${bitsLabel(perm[perm[0]])} → ${bitsLabel(perm[perm[perm[0]]])} → ${bitsLabel(perm[perm[perm[perm[0]]]])}`;

  if (archetype === "two_bit_d_ff_cyclic") {
    return buildDArchetype(perm, sequenceText);
  }
  if (archetype === "two_bit_t_ff_cyclic") {
    return buildTArchetype(perm, sequenceText);
  }
  return buildJkArchetype(perm, sequenceText);
}

// =====================================================================
// D-FF: D_i = Q_i+ 직접
// =====================================================================
function buildDArchetype(perm: number[], sequenceText: string): FlipflopCounterGeneration {
  // 각 출력 bit i에 대한 minterm 집합 = {s : Q_i+ = 1}
  const d1Minterms: number[] = [];
  const d0Minterms: number[] = [];
  for (let s = 0; s < 4; s++) {
    if ((perm[s] >> 1) & 1) d1Minterms.push(s);
    if (perm[s] & 1) d0Minterms.push(s);
  }

  const d1 = makeFfInput("D1", d1Minterms, []);
  const d0 = makeFfInput("D0", d0Minterms, []);

  const combinational = buildLogicNetworkMulti({
    sops: [
      { sop: d1.sop, outputName: "D1" },
      { sop: d0.sop, outputName: "D0" },
    ],
    varNames: VAR_NAMES,
  });

  const logicNetworkDiagram = wrapWithFlipFlops(combinational, [
    { id: "G_dff_Q1", type: "DFF", inputs: ["D1"], output: "Q1" },
    { id: "G_dff_Q0", type: "DFF", inputs: ["D0"], output: "Q0" },
  ]);

  return {
    nextState: perm,
    ffInputs: [d1, d0],
    logicNetworkDiagram,
    sequenceText,
    archetype: "two_bit_d_ff_cyclic",
    ffType: "D",
    values: { d1Terms: d1.sop.length, d0Terms: d0.sop.length },
  };
}

// =====================================================================
// JK-FF: 여기표 (excitation table) 사용
//   Q → Q+ : J,K
//   0 → 0  : 0,X
//   0 → 1  : 1,X
//   1 → 0  : X,1
//   1 → 1  : X,0
// =====================================================================
function jkFromTransition(q: number, qNext: number): { J: 0 | 1 | "X"; K: 0 | 1 | "X" } {
  if (q === 0 && qNext === 0) return { J: 0, K: "X" };
  if (q === 0 && qNext === 1) return { J: 1, K: "X" };
  if (q === 1 && qNext === 0) return { J: "X", K: 1 };
  return { J: "X", K: 0 };
}

function buildJkArchetype(perm: number[], sequenceText: string): FlipflopCounterGeneration {
  // 각 FF i (i=1, 0)에 대해 J_i, K_i 추출
  //  s ∈ 0..3, 현재 (Q1, Q0) = (s>>1 & 1, s & 1)
  //  next  (Q1+, Q0+) = (perm[s]>>1 & 1, perm[s] & 1)
  const j1Minterms: number[] = [];
  const j1DontCares: number[] = [];
  const k1Minterms: number[] = [];
  const k1DontCares: number[] = [];
  const j0Minterms: number[] = [];
  const j0DontCares: number[] = [];
  const k0Minterms: number[] = [];
  const k0DontCares: number[] = [];

  for (let s = 0; s < 4; s++) {
    const q1 = (s >> 1) & 1;
    const q0 = s & 1;
    const q1n = (perm[s] >> 1) & 1;
    const q0n = perm[s] & 1;

    const { J: J1, K: K1 } = jkFromTransition(q1, q1n);
    const { J: J0, K: K0 } = jkFromTransition(q0, q0n);

    if (J1 === 1) j1Minterms.push(s);
    else if (J1 === "X") j1DontCares.push(s);
    if (K1 === 1) k1Minterms.push(s);
    else if (K1 === "X") k1DontCares.push(s);
    if (J0 === 1) j0Minterms.push(s);
    else if (J0 === "X") j0DontCares.push(s);
    if (K0 === 1) k0Minterms.push(s);
    else if (K0 === "X") k0DontCares.push(s);
  }

  const j1 = makeFfInput("J1", j1Minterms, j1DontCares);
  const k1 = makeFfInput("K1", k1Minterms, k1DontCares);
  const j0 = makeFfInput("J0", j0Minterms, j0DontCares);
  const k0 = makeFfInput("K0", k0Minterms, k0DontCares);

  const combinational = buildLogicNetworkMulti({
    sops: [
      { sop: j1.sop, outputName: "J1" },
      { sop: k1.sop, outputName: "K1" },
      { sop: j0.sop, outputName: "J0" },
      { sop: k0.sop, outputName: "K0" },
    ],
    varNames: VAR_NAMES,
  });

  const logicNetworkDiagram = wrapWithFlipFlops(combinational, [
    { id: "G_jkff_Q1", type: "JKFF", inputs: ["J1", "K1"], output: "Q1" },
    { id: "G_jkff_Q0", type: "JKFF", inputs: ["J0", "K0"], output: "Q0" },
  ]);

  return {
    nextState: perm,
    ffInputs: [j1, k1, j0, k0],
    logicNetworkDiagram,
    sequenceText,
    archetype: "two_bit_jk_ff_cyclic",
    ffType: "JK",
    values: {
      j1Terms: j1.sop.length, k1Terms: k1.sop.length,
      j0Terms: j0.sop.length, k0Terms: k0.sop.length,
    },
  };
}

// =====================================================================
// T-FF: T_i = Q_i ⊕ Q_i+ (XOR). 토글하면 1, 유지하면 0.
//   여기표:
//     0 → 0 : T=0
//     0 → 1 : T=1
//     1 → 0 : T=1
//     1 → 1 : T=0
//   don't care 없음 (T가 transition을 완전 결정).
// =====================================================================
function buildTArchetype(perm: number[], sequenceText: string): FlipflopCounterGeneration {
  const t1Minterms: number[] = [];
  const t0Minterms: number[] = [];
  for (let s = 0; s < 4; s++) {
    const q1 = (s >> 1) & 1;
    const q0 = s & 1;
    const q1n = (perm[s] >> 1) & 1;
    const q0n = perm[s] & 1;
    if ((q1 ^ q1n) === 1) t1Minterms.push(s);
    if ((q0 ^ q0n) === 1) t0Minterms.push(s);
  }

  const t1 = makeFfInput("T1", t1Minterms, []);
  const t0 = makeFfInput("T0", t0Minterms, []);

  const combinational = buildLogicNetworkMulti({
    sops: [
      { sop: t1.sop, outputName: "T1" },
      { sop: t0.sop, outputName: "T0" },
    ],
    varNames: VAR_NAMES,
  });

  const logicNetworkDiagram = wrapWithFlipFlops(combinational, [
    { id: "G_tff_Q1", type: "TFF", inputs: ["T1"], output: "Q1" },
    { id: "G_tff_Q0", type: "TFF", inputs: ["T0"], output: "Q0" },
  ]);

  return {
    nextState: perm,
    ffInputs: [t1, t0],
    logicNetworkDiagram,
    sequenceText,
    archetype: "two_bit_t_ff_cyclic",
    ffType: "T",
    values: { t1Terms: t1.sop.length, t0Terms: t0.sop.length },
  };
}

// =====================================================================
// 조합부 LogicNetwork + 플립플롭 gate들 합치기.
//   · combinational.inputs는 [Q1, Q0]만 — 이걸 플립플롭 Q output으로 옮긴다.
//   · 카운터는 외부 입력 없음 (자체 state 기반) → inputs=[].
//   · outputs는 [Q1, Q0]만 — D1/D0 (또는 J/K)는 조합부→FF 사이 내부 wire,
//     terminal label로 그리면 FF body·CLK ▷와 겹쳐 오해 유발.
// =====================================================================
function wrapWithFlipFlops(
  combinational: LogicNetworkDiagram,
  ffGates: LogicGate[],
): LogicNetworkDiagram {
  const ffOutputs = new Set(ffGates.map((g) => g.output));
  const externalInputs = combinational.inputs.filter((s) => !ffOutputs.has(s));
  return {
    inputs: externalInputs,
    outputs: [...ffOutputs],
    gates: [...ffGates, ...combinational.gates],
  };
}

// =====================================================================
// FfInput 생성 — minterm + don't care → SOP + 표현 + K-map
// =====================================================================
function makeFfInput(name: string, minterms: number[], dontCares: number[]): FfInput {
  const fn: BooleanFunction = {
    vars: 2,
    varNames: VAR_NAMES,
    minterms: minterms.slice().sort((a, b) => a - b),
    dontCares: dontCares.slice().sort((a, b) => a - b),
  };
  const sop = minimizeSop(fn);
  const expression = sopToString(sop, VAR_NAMES);
  const kmap = buildKmap2var(fn, name);
  return { name, sop, expression, kmap };
}

/** 2변수 K-map 직접 빌드 (vars=2일 때 buildKmap 미지원) */
function buildKmap2var(f: BooleanFunction, title: string): KmapDiagram {
  const rows: Array<{ label: string; values: Array<0 | 1 | "X"> }> = [];
  for (let r = 0; r < 2; r++) {
    const values: Array<0 | 1 | "X"> = [];
    for (let c = 0; c < 2; c++) {
      const idx = (r << 1) | c;
      if (f.dontCares.includes(idx)) values.push("X");
      else values.push(f.minterms.includes(idx) ? 1 : 0);
    }
    rows.push({ label: String(r), values });
  }
  return {
    title: `${title} K-map (${VAR_NAMES.join(",")})`,
    variables: VAR_NAMES,
    rowVars: [VAR_NAMES[0]],
    colVars: [VAR_NAMES[1]],
    rowOrder: ["0", "1"],
    colOrder: ["0", "1"],
    rows,
  };
}
