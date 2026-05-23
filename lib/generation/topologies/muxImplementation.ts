import type {
  CircuitTypeParams,
  GenerationMode,
  LogicGate,
  LogicNetworkDiagram,
  MuxDiagram,
  MuxGarCircuitDiagram,
} from "@/types";

/**
 * 4×1 MUX 등가구현 문제 generator (임용 5번 형식).
 *
 *   (가) 조합논리회로: 3 NOT + 3 OR(각 2-입력) + 1 AND → F(A,B,C) = ∏ (L_i + L_j)
 *   (나) 4×1 MUX: 선택선 S_1=A, S_0=B, 데이터 입력 I_0~I_3 (그중 2개는 학생이 채울 ㉠/㉡).
 *
 *   학생 단계:
 *     [단계 1] (가)의 출력 F(A,B,C)를 최대항의 곱(POS)으로 표현.
 *     [단계 2] [단계 1] 결과를 최소항의 합(SOP)으로 변환.
 *     [단계 3] [단계 2]를 이용해 (가)=(나)가 되도록 MUX 입력 ㉠·㉡(I_0·I_1) 결정.
 *
 *   변형 정책:
 *     - exam_similar / exam_variant 모두 4개 variant pool에서 라운드로빈 (index 기반).
 *     - 모든 variant는 (a) 3개 negation 모두 사용 (3 NOTs in 가), (b) 2-literal POS factors 3개.
 *     - 선택선 S_1=A, S_0=B 고정. 학생 빈칸 위치 I_0/I_1 고정.
 */

type LitVar = "A" | "B" | "C";
type Lit = { v: LitVar; neg: boolean };
type Factor = [Lit, Lit];

type MuxValue = "0" | "1" | "C" | "C̄";

type Variant = {
  /** (가) POS factor 3개 */
  factors: [Factor, Factor, Factor];
};

/**
 * Variant pool — 모두 (a) 3개 negation (A̅·B̅·C̅) 사용, (b) 2-literal factor 3개.
 * idx 0이 "원본스러운 demo"가 되도록 정렬.
 */
const VARIANT_POOL: Variant[] = [
  // V0: (A̅+B)(B̅+C̄)(A+C) — blanks ㉠=C, ㉡=0
  {
    factors: [
      [{ v: "A", neg: true }, { v: "B", neg: false }],
      [{ v: "B", neg: true }, { v: "C", neg: true }],
      [{ v: "A", neg: false }, { v: "C", neg: false }],
    ],
  },
  // V1: (A̅+C)(B̅+C̄)(A+B) — blanks ㉠=0, ㉡=C̄
  {
    factors: [
      [{ v: "A", neg: true }, { v: "C", neg: false }],
      [{ v: "B", neg: true }, { v: "C", neg: true }],
      [{ v: "A", neg: false }, { v: "B", neg: false }],
    ],
  },
  // V2: (A̅+B̅)(B+C̄)(A+C) — blanks ㉠=0, ㉡=C
  {
    factors: [
      [{ v: "A", neg: true }, { v: "B", neg: true }],
      [{ v: "B", neg: false }, { v: "C", neg: true }],
      [{ v: "A", neg: false }, { v: "C", neg: false }],
    ],
  },
  // V3: (A+B̅)(A̅+C)(B+C̄) — blanks ㉠=C̄, ㉡=0
  {
    factors: [
      [{ v: "A", neg: false }, { v: "B", neg: true }],
      [{ v: "A", neg: true }, { v: "C", neg: false }],
      [{ v: "B", neg: false }, { v: "C", neg: true }],
    ],
  },
];

export type MuxImplementationGeneration = {
  /** (가) 전용 mux_gar_circuit diagram (3 NOTs + 3 ORs 병렬 + 1 AND, 결정론 layout) */
  garDiagram: MuxGarCircuitDiagram;
  /** (가) logic_network — validator/legacy 호환용 fallback (현 pipeline은 미사용) */
  garLogicNetwork: LogicNetworkDiagram;
  /** (나) MUX diagram */
  naDiagram: MuxDiagram;
  values: {
    /** POS 표현 문자열 (예: "(\\overline{A}+B)(\\overline{B}+\\overline{C})(A+C)") — solution용 */
    posExpr: string;
    /** SOP 표현 문자열 — solution 단계 2 */
    sopExpr: string;
    /** F의 truth table 8 entry */
    truthTable: number[];
  };
  /** ㉠·㉡ 정답 (key는 ASCII로 — parser 호환) */
  answer: {
    blank1: MuxValue; // ㉠ (I_0)
    blank2: MuxValue; // ㉡ (I_1)
  };
};

export function generateMuxImplementation(args: {
  params?: CircuitTypeParams;
  mode?: GenerationMode;
  seed?: number;
  index?: number;
}): MuxImplementationGeneration {
  const pool = VARIANT_POOL;
  const idx = typeof args.index === "number"
    ? ((args.index % pool.length) + pool.length) % pool.length
    : Math.floor(((args.seed ?? 0) * 9301 + 49297) % pool.length);
  const variant = pool[idx];

  // ── (가) 회로 + truth table ─────────────────────
  const truthTable = computeTruthTable(variant.factors);
  // 전용 결정론 layout (3 ORs 병렬 stack + F 직선)
  const garDiagram: MuxGarCircuitDiagram = {
    factors: variant.factors.map(([l1, l2]) => [
      { variable: l1.v, negated: l1.neg },
      { variable: l2.v, negated: l2.neg },
    ]) as MuxGarCircuitDiagram["factors"],
  };
  const garLogicNetwork = buildGarLogicNetwork(variant.factors);

  // ── (나) MUX ─────────────────────────────────────
  // S_1=A, S_0=B 고정. 데이터 입력은 TT로부터 자동 산출. 빈칸은 I_0(㉠), I_1(㉡).
  const muxInputValues = muxInputsFromTT(truthTable);
  const naDiagram: MuxDiagram = {
    size: 4,
    selectors: {
      high: { pinLabel: "S_1", signal: "A" },
      low: { pinLabel: "S_0", signal: "B" },
    },
    inputs: [
      { slot: 0, pinLabel: "I_0", value: muxInputValues[0], blank: true, blankMarker: "㉠" },
      { slot: 1, pinLabel: "I_1", value: muxInputValues[1], blank: true, blankMarker: "㉡" },
      { slot: 2, pinLabel: "I_2", value: muxInputValues[2] },
      { slot: 3, pinLabel: "I_3", value: muxInputValues[3] },
    ],
    outputLabel: "F",
    caption: "4×1 MUX",
  };

  // ── 표현 문자열 ─────────────────────────────────
  const posExpr = variant.factors
    .map((f) => `(${litStr(f[0])}+${litStr(f[1])})`)
    .join("");
  const sopExpr = sopFromTT(truthTable);

  return {
    garDiagram,
    garLogicNetwork,
    naDiagram,
    values: { posExpr, sopExpr, truthTable },
    answer: { blank1: muxInputValues[0], blank2: muxInputValues[1] },
  };
}

// ─── helpers ──────────────────────────────────────

function evalLit(l: Lit, A: number, B: number, C: number): number {
  const v = l.v === "A" ? A : l.v === "B" ? B : C;
  return l.neg ? 1 - v : v;
}

function computeTruthTable(factors: [Factor, Factor, Factor]): number[] {
  const tt: number[] = [];
  for (let i = 0; i < 8; i++) {
    const A = (i >> 2) & 1;
    const B = (i >> 1) & 1;
    const C = i & 1;
    let f = 1;
    for (const [l1, l2] of factors) {
      const orVal = evalLit(l1, A, B, C) | evalLit(l2, A, B, C);
      f = f & orVal;
    }
    tt.push(f);
  }
  return tt;
}

function muxInputsFromTT(tt: number[]): [MuxValue, MuxValue, MuxValue, MuxValue] {
  // slot k ∈ {0..3} maps to (A=k>>1, B=k&1), with C ∈ {0,1} indexing tt[2k], tt[2k+1].
  const result: MuxValue[] = [];
  for (let k = 0; k < 4; k++) {
    const f0 = tt[2 * k];
    const f1 = tt[2 * k + 1];
    if (f0 === 0 && f1 === 0) result.push("0");
    else if (f0 === 1 && f1 === 1) result.push("1");
    else if (f0 === 0 && f1 === 1) result.push("C");
    else result.push("C̄");
  }
  return result as [MuxValue, MuxValue, MuxValue, MuxValue];
}

/**
 * (가) 조합논리회로를 logic_network로 빌드.
 *   - 사용된 negation literal에 대해서만 NOT gate 생성
 *   - 각 factor에 OR gate
 *   - 모든 OR 출력을 받는 단일 AND gate → F
 *
 * 시스템 프롬프트 규칙: 보수 신호명 "X_n" 사용 ("X'" 금지).
 */
function buildGarLogicNetwork(factors: [Factor, Factor, Factor]): LogicNetworkDiagram {
  const negations = new Set<LitVar>();
  for (const [l1, l2] of factors) {
    if (l1.neg) negations.add(l1.v);
    if (l2.neg) negations.add(l2.v);
  }

  const gates: LogicGate[] = [];

  // NOT gates (정렬: A < B < C)
  const sortedNegs = (["A", "B", "C"] as LitVar[]).filter((v) => negations.has(v));
  for (const v of sortedNegs) {
    gates.push({ id: `G_n${v}`, type: "NOT", inputs: [v], output: `${v}_n` });
  }

  // OR gates — 한 factor당 하나
  const orOutputs: string[] = [];
  factors.forEach((factor, i) => {
    const [l1, l2] = factor;
    const in1 = l1.neg ? `${l1.v}_n` : l1.v;
    const in2 = l2.neg ? `${l2.v}_n` : l2.v;
    const outId = `n_or${i + 1}`;
    gates.push({ id: `G_OR${i + 1}`, type: "OR", inputs: [in1, in2], output: outId });
    orOutputs.push(outId);
  });

  // Final AND gate
  gates.push({ id: "G_AND", type: "AND", inputs: orOutputs, output: "F" });

  return {
    inputs: ["A", "B", "C"],
    outputs: ["F"],
    gates,
  };
}

/** literal → 표시 문자열 ("\\overline{A}" 또는 "A") — KaTeX·MathText 호환. */
function litStr(l: Lit): string {
  return l.neg ? `\\overline{${l.v}}` : l.v;
}

/** truth table → SOP 표현 ("\\overline{A}BC + AB\\overline{C} + ..."). */
function sopFromTT(tt: number[]): string {
  const terms: string[] = [];
  for (let i = 0; i < 8; i++) {
    if (tt[i] === 1) {
      const A = (i >> 2) & 1;
      const B = (i >> 1) & 1;
      const C = i & 1;
      const term =
        (A ? "A" : "\\overline{A}") +
        (B ? "B" : "\\overline{B}") +
        (C ? "C" : "\\overline{C}");
      terms.push(term);
    }
  }
  return terms.length === 0 ? "0" : terms.join("+");
}
