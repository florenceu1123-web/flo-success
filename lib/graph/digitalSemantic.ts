/**
 * Universal digital logic — semantic graph model.
 *
 *   임용 디지털논리회로 문제의 일반화된 표현. 특정 archetype(2-output 3-var 등)에
 *   묶이지 않고 N 변수·M 함수·임의 combination을 모두 다룬다.
 *
 *   구조:
 *     Variables   : 입력 변수 ordered list (A, B, C, ...)  — 길이 2~5
 *     Functions   : 각 함수 = 변수들에 대한 boolean (minterm set 또는 K-map cells)
 *     Combination : 함수들을 결합해 최종 출력을 만드는 gate DAG
 *     Outputs     : 최종 출력 변수 (Z, F, G, ...) — 1+ 개
 *
 *   universal_dc/_ac와 같은 원칙:
 *     - semantic graph는 immutable
 *     - pattern detector → layout template → render
 *     - role/구조 기준 (이름·라벨 X)
 *
 *   ★ 단일 K-map 단일 출력 (kmap_sop archetype)도 이 모델로 표현 가능 (M=1, gate trivial).
 *     2-output combinational_gate도 (M=2, OR/AND tree).
 *     임용 8번 4-함수 OR-결합도 (M=4, OR tree to Z).
 */

/** 입력 변수 — 이름 + ordinal index. */
export type DigitalVariable = {
  readonly name: string;     // 원본 표기 (A, B, C, D, X, Y, ...)
  readonly index: number;    // 0-base ordinal — minterm bit 위치
};

/**
 * Boolean function representation.
 *   minterms: f=1인 minterm 인덱스 집합 (0 ~ 2^N - 1)
 *   dontCares: don't-care 인덱스 (선택)
 *
 *   ★ K-map cells에서 minterm으로 추출: cell(row, col) → bit index = (row << colBits) | col
 *     단, 행/열 순서는 Gray code 사용 (00, 01, 11, 10).
 */
export type DigitalFunction = {
  readonly name: string;       // f_1, f_2, X, Y, ...
  readonly variables: readonly DigitalVariable[];
  readonly minterms: readonly number[];
  readonly dontCares?: readonly number[];
};

/**
 * Gate operation — 함수들을 결합하는 DAG node.
 *   inputs: 다른 GateNode id 또는 DigitalFunction name.
 */
export type GateOp = "AND" | "OR" | "XOR" | "NOT" | "NAND" | "NOR" | "XNOR";

export type GateNode = {
  readonly id: string;
  readonly op: GateOp;
  readonly inputs: readonly string[];  // DigitalFunction name 또는 다른 GateNode id
};

// ─── LogicDAG — multi-stage 게이트 결합 표현 ────────────────────────────

/**
 * LogicDAG node — function leaf 또는 gate.
 *   leaf (kind="function"): K-map으로 정의된 boolean 함수의 출력 wire.
 *   gate (kind="gate"): inputs (다른 node id)을 받아 새 신호 emit.
 *
 *   label은 시각화·텍스트 표시용 (id와 다를 수 있음 — 예: id="X", label="X").
 */
export type LogicDAGNode =
  | { readonly id: string; readonly kind: "function"; readonly label?: string }
  | { readonly id: string; readonly kind: "gate"; readonly gate: GateOp; readonly inputs: readonly string[]; readonly label?: string };

/**
 * LogicDAG — function leaf들과 multi-stage gate들의 directed acyclic graph.
 *   outputId: 최종 출력 node id (보통 최상단 gate).
 *   nodes: 모든 leaf + gate. topological sort 가능해야 함 (cycle 금지).
 *
 *   예 — 임용 8번 풀이 모델 (사용자 제시):
 *     {
 *       outputId: "Z",
 *       nodes: [
 *         { id:"f1", kind:"function", label:"f_1" },
 *         { id:"f2", kind:"function", label:"f_2" },
 *         { id:"f3", kind:"function", label:"f_3" },
 *         { id:"f4", kind:"function", label:"f_4" },
 *         { id:"X",  kind:"gate", gate:"AND", inputs:["f1","f2"], label:"X" },
 *         { id:"Y",  kind:"gate", gate:"OR",  inputs:["f3","f4"], label:"Y" },
 *         { id:"Z",  kind:"gate", gate:"XOR", inputs:["X","Y"],  label:"Z" }
 *       ]
 *     }
 *
 *   intermediateSignals = DAG에서 leaf도 outputId도 아닌 gate들의 label/id.
 *   universal_digital pipeline·renderer가 이 구조로 multi-stage 회로 layout.
 */
export type LogicDAG = {
  readonly outputId: string;
  readonly nodes: readonly LogicDAGNode[];
};

/**
 * LogicDAG에서 intermediate signal 추출 — function leaf도 outputId도 아닌 gate들.
 */
export function intermediateSignalsOf(dag: LogicDAG): string[] {
  return dag.nodes
    .filter((n): n is Extract<LogicDAGNode, { kind: "gate" }> => n.kind === "gate")
    .filter((n) => n.id !== dag.outputId)
    .map((n) => n.label ?? n.id);
}

/**
 * LogicDAG 검증 — cycle / unknown reference / missing outputId.
 */
export function validateLogicDAG(dag: LogicDAG): string[] {
  const errors: string[] = [];
  const ids = new Set(dag.nodes.map((n) => n.id));
  if (!ids.has(dag.outputId)) {
    errors.push(`LogicDAG: outputId "${dag.outputId}" not in nodes`);
  }
  for (const n of dag.nodes) {
    if (n.kind !== "gate") continue;
    for (const inp of n.inputs) {
      if (!ids.has(inp)) errors.push(`LogicDAG node ${n.id}: unknown input "${inp}"`);
    }
  }
  // cycle 검사 — topological sort
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const byId = new Map(dag.nodes.map((n) => [n.id, n] as const));
  const dfs = (id: string): boolean => {
    if (onStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    onStack.add(id);
    const node = byId.get(id);
    if (node?.kind === "gate") {
      for (const inp of node.inputs) {
        if (dfs(inp)) return true;
      }
    }
    onStack.delete(id);
    return false;
  };
  if (dfs(dag.outputId)) errors.push("LogicDAG: cycle detected");
  return errors;
}

/**
 * Output specification — 최종 출력은 GateNode id 또는 DigitalFunction name을 직접 가리킴.
 */
export type DigitalOutput = {
  readonly name: string;       // Z, F, G, ...
  readonly source: string;     // GateNode id 또는 DigitalFunction name
};

/**
 * Universal digital semantic graph.
 *   immutable. pattern detector는 이 구조를 읽어 dispatch를 결정.
 *
 *   예 — 임용 8번 (4 변수, 4 함수, OR로 결합해 Z 출력):
 *     {
 *       variables: [{name:"A",index:0},{name:"B",index:1},{name:"C",index:2},{name:"D",index:3}],
 *       functions: [
 *         { name:"f1", variables: <vars>, minterms: [1,2,3,7,9] },
 *         { name:"f2", variables: <vars>, minterms: [3,7,8,9,11] },
 *         { name:"f3", variables: <vars>, minterms: [9,11,13] },
 *         { name:"f4", variables: <vars>, minterms: [9,13,15] }
 *       ],
 *       gates: [{ id:"or_all", op:"OR", inputs:["f1","f2","f3","f4"] }],
 *       outputs: [{ name:"Z", source:"or_all" }]
 *     }
 *
 *   예 — combinational_gate (3 변수, 2 함수 직접 출력, gate 없음):
 *     {
 *       variables: [A,B,C],
 *       functions: [{name:"X", ...}, {name:"Y", ...}],
 *       gates: [],
 *       outputs: [{name:"X",source:"X"}, {name:"Y",source:"Y"}]
 *     }
 */
export type DigitalSemanticGraph = {
  readonly variables: readonly DigitalVariable[];
  readonly functions: readonly DigitalFunction[];
  readonly gates: readonly GateNode[];
  readonly outputs: readonly DigitalOutput[];
};

// ─── 검증·해석 helpers ──────────────────────────────────

/** 변수 개수 (2~5 일반적). */
export function variableCount(g: DigitalSemanticGraph): number {
  return g.variables.length;
}

/** 함수 개수. */
export function functionCount(g: DigitalSemanticGraph): number {
  return g.functions.length;
}

/** Minterm 인덱스의 유효 범위 — [0, 2^N). */
export function isValidMinterm(g: DigitalSemanticGraph, m: number): boolean {
  return Number.isInteger(m) && m >= 0 && m < (1 << g.variables.length);
}

/** 모든 function의 minterm이 변수 개수에 맞는지 검증. */
export function validateMinterms(g: DigitalSemanticGraph): string[] {
  const errors: string[] = [];
  const max = 1 << g.variables.length;
  for (const f of g.functions) {
    for (const m of f.minterms) {
      if (!Number.isInteger(m) || m < 0 || m >= max) {
        errors.push(`${f.name}: minterm ${m} out of range [0, ${max - 1}]`);
      }
    }
  }
  return errors;
}

/** gate DAG에서 source id가 valid한지(함수명 또는 gate id) 검증. */
export function validateGateInputs(g: DigitalSemanticGraph): string[] {
  const errors: string[] = [];
  const funcNames = new Set(g.functions.map((f) => f.name));
  const gateIds = new Set(g.gates.map((gn) => gn.id));
  for (const gn of g.gates) {
    for (const input of gn.inputs) {
      if (!funcNames.has(input) && !gateIds.has(input)) {
        errors.push(`gate ${gn.id}: invalid input "${input}"`);
      }
    }
  }
  for (const out of g.outputs) {
    if (!funcNames.has(out.source) && !gateIds.has(out.source)) {
      errors.push(`output ${out.name}: invalid source "${out.source}"`);
    }
  }
  return errors;
}

// ─── Pattern detection ──────────────────────────────────

/**
 * detectUniversalDigital — 디지털논리 문제가 universal_digital path로 처리 가능한 형식인지.
 *   조건:
 *     - variables.length 2~5
 *     - functions.length ≥ 1
 *     - 모든 function의 variables 일치
 *     - minterms 유효
 *     - gate DAG 입력 일관성
 *
 *   조건 충족 시 SemanticGraph 반환. 아니면 null.
 */
export function detectUniversalDigital(g: DigitalSemanticGraph | null): DigitalSemanticGraph | null {
  if (!g) return null;
  if (g.variables.length < 2 || g.variables.length > 5) return null;
  if (g.functions.length < 1) return null;
  // 모든 function이 같은 변수 셋을 공유해야 함.
  for (const f of g.functions) {
    if (f.variables.length !== g.variables.length) return null;
    for (let i = 0; i < f.variables.length; i++) {
      if (f.variables[i].name !== g.variables[i].name) return null;
    }
  }
  if (validateMinterms(g).length > 0) return null;
  if (validateGateInputs(g).length > 0) return null;
  return g;
}
