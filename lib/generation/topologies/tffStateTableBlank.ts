import type {
  CircuitTypeParams,
  KmapDiagram,
  LogicGate,
  LogicNetworkDiagram,
  TruthTableDiagram,
} from "@/types";
import { buildKmap, type BooleanFunction } from "@/lib/digital/booleanFunction";
import { makeRand, pick } from "./_helpers";

/**
 * 임용 7번 정보과 형식 generator — T-FF 2개 (T_A·T_B) + 입력 C + 상태표 빈칸 + K-map 도출.
 *
 * 회로 구성:
 *  - 외부 입력: C (1비트) + CLK
 *  - 상태 레지스터: T-FF (T_A → Q_A), T-FF (T_B → Q_B)
 *  - 조합부: (Q_A, Q_B, C) → (T_A, T_B)
 *
 * 출력:
 *  - logicNetworkDiagram: 회로도 (조합부 + T-FF 2개)
 *  - stateTable: 8행 상태표 (Q_A·Q_B·C → T_A·T_B·Q_A_next·Q_B_next), 일부 셀 빈칸 ㉠~㉧
 *  - qaNextKmap, qbNextKmap: 다음 상태 K-map (풀이 [단계 3] 산출물 — figure로 노출하지 않음)
 *  - blankAnswers: 빈칸 정답 매핑
 */
export type TffStateTableBlankGeneration = {
  logicNetworkDiagram: LogicNetworkDiagram;
  stateTable: TruthTableDiagram;
  qaNextKmap: KmapDiagram;
  qbNextKmap: KmapDiagram;
  qaNextSop: string;
  qbNextSop: string;
  blankAnswers: Array<{ symbol: string; answer: string }>;
  expressions: { TA: string; TB: string };
};

type Signal3 = (qa: number, qb: number, c: number) => number;

// 모든 form이 2-input 게이트(XOR/AND/OR) — 단일 변수 form 제거.
//   임용 7번 원본 회로는 게이트 ≥ 3개. 단일 변수면 회로에 buffer 없이 wire만 그려져 게이트 부족해 보임.
//   또한 보수 신호 ('가 붙은 변수)도 한쪽에 박아서 NOT 게이트 필수 도출 → 회로 복잡도 ↑.
const SIGNAL_FORMS: Array<{ expr: string; eval: Signal3 }> = [
  { expr: "C ⊕ Q_A", eval: (a, _b, c) => c ^ a },
  { expr: "C ⊕ Q_B", eval: (_a, b, c) => c ^ b },
  { expr: "Q_A ⊕ Q_B", eval: (a, b) => a ^ b },
  { expr: "C · Q_A", eval: (a, _b, c) => c & a },
  { expr: "C · Q_B", eval: (_a, b, c) => c & b },
  { expr: "Q_A · Q_B", eval: (a, b) => a & b },
  { expr: "C + Q_A", eval: (a, _b, c) => c | a },
  { expr: "C + Q_B", eval: (_a, b, c) => c | b },
  { expr: "Q_A + Q_B", eval: (a, b) => a | b },
  { expr: "C' · Q_A", eval: (a, _b, c) => (1 - c) & a },
  { expr: "C' · Q_B", eval: (_a, b, c) => (1 - c) & b },
  { expr: "C · Q_A'", eval: (a, _b, c) => c & (1 - a) },
  { expr: "C · Q_B'", eval: (_a, b, c) => c & (1 - b) },
  { expr: "Q_A' · Q_B", eval: (a, b) => (1 - a) & b },
  { expr: "Q_A · Q_B'", eval: (a, b) => a & (1 - b) },
  { expr: "C + Q_A'", eval: (a, _b, c) => c | (1 - a) },
  { expr: "C' + Q_B", eval: (_a, b, c) => (1 - c) | b },
];

const BLANK_SYMBOLS = ["㉠", "㉡", "㉢", "㉣", "㉤", "㉥", "㉦", "㉧"];

export function generateTffStateTableBlank(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): TffStateTableBlankGeneration {
  const rand = makeRand(args.seed);

  // 조합부 form 2개 (T_A, T_B) — 서로 다른 form 강제.
  const usedExprs = new Set<string>();
  const pickUnique = () => {
    for (let tries = 0; tries < 30; tries++) {
      const f = pick(SIGNAL_FORMS, rand);
      if (!usedExprs.has(f.expr)) {
        usedExprs.add(f.expr);
        return f;
      }
    }
    return pick(SIGNAL_FORMS, rand);
  };
  const TA = pickUnique();
  let TB = pickUnique();
  // ★ 입력 C는 조합부 입력이어야 한다 — TA·TB 둘 다 C를 안 쓰면 C가 회로에서 dangling이 된다.
  //   둘 다 C 미사용이면 TB를 C 사용 form(서로 다른 expr)으로 교체해 C 연결을 보장.
  if (!TA.expr.includes("C") && !TB.expr.includes("C")) {
    const cForms = SIGNAL_FORMS.filter((f) => f.expr.includes("C") && f.expr !== TA.expr);
    if (cForms.length > 0) {
      const replacement = pick(cForms, rand);
      usedExprs.delete(TB.expr);
      usedExprs.add(replacement.expr);
      TB = replacement;
    }
  }

  // 상태표 8행: index 비트 순서 = Q_A · Q_B · C  (i = qa<<2 | qb<<1 | c)
  type Row = {
    qa: number; qb: number; c: number;
    ta: number; tb: number;
    qaNext: number; qbNext: number;
  };
  const fullRows: Row[] = [];
  for (let i = 0; i < 8; i++) {
    const qa = (i >> 2) & 1;
    const qb = (i >> 1) & 1;
    const c = i & 1;
    const ta = TA.eval(qa, qb, c);
    const tb = TB.eval(qa, qb, c);
    // T-FF rule: Q(t+1) = Q ⊕ T
    const qaNext = qa ^ ta;
    const qbNext = qb ^ tb;
    fullRows.push({ qa, qb, c, ta, tb, qaNext, qbNext });
  }

  // 빈칸 8개 — 임용 7번 원본은 상태표 일부 행의 Q_A(t+1)·Q_B(t+1) 컬럼에 ㉠~㉧.
  //   여기서는 8행 × 2 출력 컬럼(Q_A_next·Q_B_next) 중 8개 무작위 위치.
  type CellKey = { rowIdx: number; col: 0 | 1 };  // col 0=Q_A_next, 1=Q_B_next
  const cellKeys: CellKey[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 2; c++) cellKeys.push({ rowIdx: r, col: c as 0 | 1 });
  }
  // shuffle
  for (let i = cellKeys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cellKeys[i], cellKeys[j]] = [cellKeys[j], cellKeys[i]];
  }
  const blankPositions = cellKeys.slice(0, 8);

  const blankMap = new Map<string, string>(); // key=`${rowIdx},${col}` → symbol
  const blankAnswers: Array<{ symbol: string; answer: string }> = [];
  // 원본 가독성: blankPositions를 rowIdx·col 순으로 정렬해서 ㉠ → ㉧ 순차 부여
  blankPositions.sort((a, b) => (a.rowIdx - b.rowIdx) * 10 + (a.col - b.col));
  blankPositions.forEach((bp, idx) => {
    const symbol = BLANK_SYMBOLS[idx];
    const key = `${bp.rowIdx},${bp.col}`;
    blankMap.set(key, symbol);
    const row = fullRows[bp.rowIdx];
    const colValues = [row.qaNext, row.qbNext];
    blankAnswers.push({ symbol, answer: String(colValues[bp.col]) });
  });

  // 상태표 TruthTableDiagram (다중 output column + 그룹 헤더).
  const stateTable: TruthTableDiagram = {
    variables: ["Q_A(t)", "Q_B(t)", "C"],
    outputLabels: ["Q_A(t+1)", "Q_B(t+1)"],
    inputGroups: [
      { label: "현재 상태", span: 2 },
      { label: "입력", span: 1 },
    ],
    outputGroups: [
      { label: "다음 상태", span: 2 },
    ],
    rows: fullRows.map((r, rowIdx) => {
      const cell = (col: 0 | 1, value: number): number | string => {
        const sym = blankMap.get(`${rowIdx},${col}`);
        return sym ?? value;
      };
      return {
        inputs: [r.qa, r.qb, r.c],
        outputs: [
          cell(0, r.qaNext),
          cell(1, r.qbNext),
        ],
      };
    }),
  };

  // Q_A(t+1)·Q_B(t+1) K-map — 풀이 [단계 3] 산출물.
  //   입력: Q_A·Q_B·C 3-변수.
  const qaNextMinterms = fullRows.filter((r) => r.qaNext === 1)
    .map((r) => (r.qa << 2) | (r.qb << 1) | r.c);
  const qbNextMinterms = fullRows.filter((r) => r.qbNext === 1)
    .map((r) => (r.qa << 2) | (r.qb << 1) | r.c);

  const qaFunc: BooleanFunction = {
    vars: 3,
    varNames: ["Q_A", "Q_B", "C"],
    minterms: qaNextMinterms,
    dontCares: [],
  };
  const qbFunc: BooleanFunction = {
    vars: 3,
    varNames: ["Q_A", "Q_B", "C"],
    minterms: qbNextMinterms,
    dontCares: [],
  };
  const qaKmap = buildKmap(qaFunc);
  const qbKmap = buildKmap(qbFunc);
  const qaNextKmap: KmapDiagram = {
    title: "Q_A(t+1)",
    variables: ["Q_A", "Q_B", "C"],
    rowVars: qaKmap.rowVars,
    colVars: qaKmap.colVars,
    rowOrder: qaKmap.rowOrder,
    colOrder: qaKmap.colOrder,
    rows: qaKmap.cells.map((cells, ri) => ({ label: qaKmap.rowOrder[ri], values: cells })),
  };
  const qbNextKmap: KmapDiagram = {
    title: "Q_B(t+1)",
    variables: ["Q_A", "Q_B", "C"],
    rowVars: qbKmap.rowVars,
    colVars: qbKmap.colVars,
    rowOrder: qbKmap.rowOrder,
    colOrder: qbKmap.colOrder,
    rows: qbKmap.cells.map((cells, ri) => ({ label: qbKmap.rowOrder[ri], values: cells })),
  };

  // logicNetworkDiagram — 조합부 + T-FF 2개.
  const logicNetworkDiagram = buildTffNetwork(TA.expr, TB.expr);

  // 최소 SOP — 학생 학습용으로 expression 그대로 (T-FF rule상 Q_next = Q ⊕ T).
  //   실제 최소화는 textWriter가 GPT로 풀이 작성.
  const qaNextSop = `Q_A ⊕ (${TA.expr})`;
  const qbNextSop = `Q_B ⊕ (${TB.expr})`;

  return {
    logicNetworkDiagram,
    stateTable,
    qaNextKmap,
    qbNextKmap,
    qaNextSop,
    qbNextSop,
    blankAnswers,
    expressions: { TA: TA.expr, TB: TB.expr },
  };
}

// =====================================================================
// 회로 (logic_network) 구성 — 조합부 + T-FF 2개
// =====================================================================
function buildTffNetwork(taExpr: string, tbExpr: string): LogicNetworkDiagram {
  const gates: LogicGate[] = [];
  // NOT 게이트 (Q_A', Q_B', C')
  const needsNot = new Set<string>();
  const considerExprNot = (expr: string) => {
    if (expr.includes("Q_A'")) needsNot.add("Q_A");
    if (expr.includes("Q_B'")) needsNot.add("Q_B");
    if (expr.includes("C'")) needsNot.add("C");
  };
  considerExprNot(taExpr);
  considerExprNot(tbExpr);
  for (const v of needsNot) {
    gates.push({ id: `G_not_${v}`, type: "NOT", inputs: [v], output: `${v}_n` });
  }

  // expression → 단일 게이트. expr이 단일 변수면 그 변수를 FF input으로 직접.
  const exprToInput = (expr: string, outputName: string, idx: number): string => {
    const ops = parseExpr(expr);
    if (ops.op === "buffer") return ops.args[0];
    gates.push({
      id: `G_${ops.op.toLowerCase()}_${outputName}_${idx}`,
      type: ops.op as LogicGate["type"],
      inputs: ops.args,
      output: outputName,
    });
    return outputName;
  };

  const taSig = exprToInput(taExpr, "T_A", 1);
  const tbSig = exprToInput(tbExpr, "T_B", 2);

  // T-FF 2개 — Q_A·Q_B output.
  gates.push({ id: "G_tff_QA", type: "TFF", inputs: [taSig], output: "Q_A" });
  gates.push({ id: "G_tff_QB", type: "TFF", inputs: [tbSig], output: "Q_B" });

  return {
    inputs: ["C"],
    outputs: ["Q_A", "Q_B"],
    gates,
  };
}

/** expression → 게이트 한 개로 변환. 우리가 정의한 SIGNAL_FORMS만 처리. */
function parseExpr(expr: string): { op: string; args: string[] } {
  const norm = expr.replace(/\s+/g, "");
  const sig = (s: string): string => (s.endsWith("'") ? `${s.slice(0, -1)}_n` : s);
  if (norm.includes("⊕")) {
    const [a, b] = norm.split("⊕");
    return { op: "XOR", args: [sig(a), sig(b)] };
  }
  if (norm.includes("·")) {
    const [a, b] = norm.split("·");
    return { op: "AND", args: [sig(a), sig(b)] };
  }
  if (norm.includes("+")) {
    const [a, b] = norm.split("+");
    return { op: "OR", args: [sig(a), sig(b)] };
  }
  // 단일 변수 (C, C', Q_A, Q_A', ...) → buffer (게이트 안 만듦)
  return { op: "buffer", args: [sig(norm)] };
}
