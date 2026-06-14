/**
 * 동기식 순서논리(D 플립플롭) 상태 시뮬레이터 — 임용 12번류 generic 경로의 linchpin.
 *
 *  회로를 "D-FF 집합 + 각 D 입력의 불 함수(외부 입력·현재 Q들에 대한)"로 표현하고,
 *  클록 에지마다 모든 FF의 Q_next = D(현재 입력, 현재 Q)를 동시에 갱신해 상태 시퀀스를 만든다.
 *  (조합/선형 솔버와 무관 — 디지털 상태 머신 시뮬레이션.)
 *
 *  D 입력 식 문법: 식별자(A,B,Q0,Q1,...) + ~(NOT,단항) & (AND) ^ (XOR) | (OR) + 괄호.
 *    우선순위: ~ > & > ^ > | . 별칭: !,¬→~  ·,*→&  +→|  (편의).
 */

export type SeqSpec = {
  inputs: string[];                              // 외부 입력 (예 ["A","B"])
  /** 각 FF: q=출력신호명, d=다음상태 불 함수식, negEdge=반전클럭(하강에지 트리거) 여부. */
  ffs: Array<{ q: string; d: string; negEdge?: boolean }>;
  /** 중간 신호(게이트 출력) 정의 — d 식에서 참조 가능. 평가 순서 무관(의존 해소). */
  signals?: Array<{ name: string; expr: string }>;
};

/** LogicNetworkDiagram(게이트 + D-FF)에서 시뮬레이션 SeqSpec 도출 — 렌더 구조와 일관. */
export function seqSpecFromLogicNetwork(diagram: {
  inputs: string[];
  gates: Array<{ id: string; type: string; inputs: string[]; output: string; clockSignal?: string }>;
}): SeqSpec {
  const FF = new Set(["DFF", "TFF", "JKFF"]);
  const ffOutputs = new Set(diagram.gates.filter((g) => FF.has(g.type)).map((g) => g.output));
  const inputs = diagram.inputs.filter((n) => !/^clk$/i.test(n) && !ffOutputs.has(n));
  // 반전 클럭 신호 — NOT(CLK)의 출력. 이 신호를 clockSignal로 쓰는 FF는 하강 에지(negEdge) 트리거.
  const invertedClockSignals = new Set(
    diagram.gates
      .filter((g) => g.type === "NOT" && /^clk$/i.test(g.inputs[0] ?? ""))
      .map((g) => g.output),
  );
  const isNegEdge = (clockSignal?: string): boolean =>
    Boolean(clockSignal) && invertedClockSignals.has(clockSignal as string);
  const combine = (type: string, ins: string[]): string => {
    const a = ins.map((x) => `(${x})`);
    switch (type) {
      case "NOT": return `~(${ins[0] ?? "0"})`;
      case "AND": return a.join(" & ");
      case "OR": return a.join(" | ");
      case "NAND": return `~(${a.join(" & ")})`;
      case "NOR": return `~(${a.join(" | ")})`;
      case "XOR": return a.join(" ^ ");
      case "XNOR": return `~(${a.join(" ^ ")})`;
      default: return a.join(" & ");
    }
  };
  const signals = diagram.gates
    .filter((g) => !FF.has(g.type))
    .map((g) => ({ name: g.output, expr: combine(g.type, g.inputs) }));
  const ffs = diagram.gates
    .filter((g) => g.type === "DFF")
    .map((g) => ({ q: g.output, d: g.inputs[0] ?? "0", negEdge: isNegEdge(g.clockSignal) }));
  // TFF: Q_next = Q ^ T (T=inputs[0]) — derive expr
  for (const g of diagram.gates.filter((x) => x.type === "TFF")) {
    ffs.push({ q: g.output, d: `(${g.output}) ^ (${g.inputs[0] ?? "0"})`, negEdge: isNegEdge(g.clockSignal) });
  }
  return { inputs, ffs, signals };
}

/** 불 식 평가기 (재귀하강). 변수값은 env(0/1)로 제공. */
function evalBool(expr: string, env: Record<string, number>): number {
  const s = expr.replace(/[!¬]/g, "~").replace(/[·*]/g, "&").replace(/\bAND\b/gi, "&")
    .replace(/\bOR\b/gi, "|").replace(/\bXOR\b/gi, "^").replace(/\bNOT\b/gi, "~").replace(/\+/g, "|");
  let i = 0;
  const peek = () => { while (i < s.length && s[i] === " ") i++; return s[i]; };
  function parseOr(): number { let v = parseXor(); while (peek() === "|") { i++; v = (parseXor() | v) ? 1 : 0; } return v; }
  function parseXor(): number { let v = parseAnd(); while (peek() === "^") { i++; v = (parseAnd() ^ v) ? 1 : 0; } return v; }
  function parseAnd(): number {
    let v = parseUnary();
    // 암묵적 AND(인접) 또는 명시 & 모두 인정
    while (true) { const c = peek(); if (c === "&") { i++; v = (parseUnary() & v) ? 1 : 0; } else if (c && /[A-Za-z(~]/.test(c)) { v = (parseUnary() & v) ? 1 : 0; } else break; }
    return v;
  }
  function parseUnary(): number { if (peek() === "~") { i++; return parseUnary() ? 0 : 1; } return parseAtom(); }
  function parseAtom(): number {
    const c = peek();
    if (c === "(") { i++; const v = parseOr(); if (peek() === ")") i++; return v; }
    // 식별자: 글자+숫자+밑줄+프라임(') — 프라임은 보수
    let j = i; let prime = false;
    while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
    let name = s.slice(i, j); i = j;
    if (peek() === "'") { prime = true; i++; }
    if (name === "") return 0;
    if (name === "1") return 1; if (name === "0") return 0;
    const val = env[name] ?? env[name.toUpperCase()] ?? 0;
    return prime ? (val ? 0 : 1) : (val ? 1 : 0);
  }
  return parseOr() ? 1 : 0;
}

/** 중간 신호까지 포함해 현재 env에서 D식 평가용 env 확장 (의존성 반복 해소). */
function resolveSignals(spec: SeqSpec, env: Record<string, number>): Record<string, number> {
  const out = { ...env };
  const sigs = spec.signals ?? [];
  for (let pass = 0; pass < sigs.length + 1; pass++) {
    let changed = false;
    for (const sg of sigs) {
      const v = evalBool(sg.expr, out);
      if (out[sg.name] !== v) { out[sg.name] = v; changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

export type SeqSimResult = {
  /** 신호별 시퀀스 — 입력은 주어진 그대로, Q는 각 클록 직후 값. */
  trace: Record<string, number[]>;
  /** 각 사이클의 Q 상태 문자열 (FF 순서대로, 예 "Q1Q0" → "10") */
  stateSeq: string[];
};

/**
 * 동기 시뮬레이션. inputWaves[input] = 길이 N 배열(각 클록 사이클의 입력값).
 * Q 초기값 기본 0. 사이클 t: 출력 Q(t)는 그 사이클 시작 시점 상태, 클록 에지에 Q(t+1)=D(입력(t),Q(t)).
 */
export function simulateSequential(args: {
  spec: SeqSpec;
  inputWaves: Record<string, number[]>;
  cycles: number;
  initial?: Record<string, number>;
}): SeqSimResult {
  const { spec, inputWaves, cycles } = args;
  const q: Record<string, number> = {};
  for (const ff of spec.ffs) q[ff.q] = args.initial?.[ff.q] ?? 0;

  const trace: Record<string, number[]> = {};
  for (const inp of spec.inputs) trace[inp] = [];
  for (const ff of spec.ffs) trace[ff.q] = [];
  const stateSeq: string[] = [];

  for (let t = 0; t < cycles; t++) {
    const env: Record<string, number> = {};
    for (const inp of spec.inputs) { const v = inputWaves[inp]?.[t] ?? 0; env[inp] = v; trace[inp].push(v); }
    for (const ff of spec.ffs) env[ff.q] = q[ff.q];
    // 현재 상태 기록
    for (const ff of spec.ffs) trace[ff.q].push(q[ff.q]);
    stateSeq.push(spec.ffs.map((ff) => q[ff.q]).join(""));
    // 한 클록 주기 = 상승 에지(양 클럭 FF) → 하강 에지(반전 클럭 FF) 2-phase.
    //   negEdge FF가 없으면 phase 2는 비어 기존 동작(전 FF 동시 갱신)과 동일.
    //   phase 1: CLK 상승에지 — 양 클럭(negEdge=false) FF 갱신 (현재 Q 기준 D 평가).
    const posEnv = resolveSignals(spec, env);
    const posNext: Record<string, number> = {};
    for (const ff of spec.ffs) if (!ff.negEdge) posNext[ff.q] = evalBool(ff.d, posEnv);
    for (const ff of spec.ffs) if (!ff.negEdge) q[ff.q] = posNext[ff.q];
    //   phase 2: CLK 하강에지 — 반전 클럭(negEdge=true) FF 갱신 (phase1 갱신된 Q 반영).
    const hasNeg = spec.ffs.some((ff) => ff.negEdge);
    if (hasNeg) {
      const negBaseEnv: Record<string, number> = { ...env };
      for (const ff of spec.ffs) negBaseEnv[ff.q] = q[ff.q];
      const negEnv = resolveSignals(spec, negBaseEnv);
      const negNext: Record<string, number> = {};
      for (const ff of spec.ffs) if (ff.negEdge) negNext[ff.q] = evalBool(ff.d, negEnv);
      for (const ff of spec.ffs) if (ff.negEdge) q[ff.q] = negNext[ff.q];
    }
  }
  return { trace, stateSeq };
}
