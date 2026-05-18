import type {
  CircuitTypeParams,
  LogicGate,
  LogicNetworkDiagram,
  TruthTableDiagram,
  WaveformDiagram,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * T-FF + JK-FF 혼합 응용회로 생성기.
 *
 * 회로 구성 (임용 9번 형식):
 *  - 외부 입력: X (1비트) + CLK
 *  - 상태 레지스터:
 *      T-FF (입력 T_A) → Q_A
 *      JK-FF (입력 J_B, K_B) → Q_B
 *  - 조합부: (Q_A, Q_B, X)에서 (T_A, J_B, K_B)를 계산
 *
 * 출력:
 *  - logicNetworkDiagram: 회로도 (T-FF + JK-FF + 조합부)
 *  - stateTable: 8행 상태표 (Q_A·Q_B·X → T_A·J_B·K_B·Q_A_next·Q_B_next), 일부 셀에 빈칸 ㄱ/ㄴ/ㄷ...
 *  - waveform: X(주어진 입력 패턴) + CLK + Q_A·Q_B 시뮬레이션 결과, t₁~t₄ 마커
 *  - blankAnswers: 빈칸 정답 매핑
 */

export type FfMixedGeneration = {
  logicNetworkDiagram: LogicNetworkDiagram;
  stateTable: TruthTableDiagram;
  waveform: WaveformDiagram;
  /** 빈칸 (ㄱ, ㄴ, ㄷ, ㄹ, ㅁ, ㅂ) → 정답값 매핑 */
  blankAnswers: Array<{ symbol: string; answer: string }>;
  /** T_A, J_B, K_B 함수 식 (사람 읽기용) */
  expressions: { TA: string; JB: string; KB: string };
};

type Signal3 = (qa: number, qb: number, x: number) => number;

const VAR_NAMES = ["Q_A", "Q_B", "X"];

/** 조합부 함수 후보 — (Q_A, Q_B, X) → bit */
const SIGNAL_FORMS: Array<{ expr: string; eval: Signal3 }> = [
  { expr: "X", eval: (_a, _b, x) => x },
  { expr: "X'", eval: (_a, _b, x) => 1 - x },
  { expr: "Q_A", eval: (a) => a },
  { expr: "Q_A'", eval: (a) => 1 - a },
  { expr: "Q_B", eval: (_a, b) => b },
  { expr: "Q_B'", eval: (_a, b) => 1 - b },
  { expr: "X ⊕ Q_A", eval: (a, _b, x) => x ^ a },
  { expr: "X ⊕ Q_B", eval: (_a, b, x) => x ^ b },
  { expr: "Q_A ⊕ Q_B", eval: (a, b) => a ^ b },
  { expr: "X · Q_A", eval: (a, _b, x) => x & a },
  { expr: "X · Q_B", eval: (_a, b, x) => x & b },
  { expr: "Q_A · Q_B", eval: (a, b) => a & b },
  { expr: "X + Q_A", eval: (a, _b, x) => x | a },
  { expr: "X + Q_B", eval: (_a, b, x) => x | b },
];

const BLANK_SYMBOLS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ"];

export function generateFfMixedApplication(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): FfMixedGeneration {
  const rand = makeRand(args.seed);

  // 조합부 form 3개 (T_A, J_B, K_B) 무작위 선택 — 서로 다른 form (학습 다양성)
  const usedExprs = new Set<string>();
  const pickUnique = (): { expr: string; eval: Signal3 } => {
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
  const JB = pickUnique();
  const KB = pickUnique();

  // 상태표 8행 생성: (Q_A, Q_B, X) → (T_A, J_B, K_B, Q_A_next, Q_B_next)
  type Row = {
    qa: number; qb: number; x: number;
    ta: number; jb: number; kb: number;
    qaNext: number; qbNext: number;
  };
  const fullRows: Row[] = [];
  for (let i = 0; i < 8; i++) {
    const qa = (i >> 2) & 1;
    const qb = (i >> 1) & 1;
    const x = i & 1;
    const ta = TA.eval(qa, qb, x);
    const jb = JB.eval(qa, qb, x);
    const kb = KB.eval(qa, qb, x);
    // T-FF: Q(t+1) = Q ⊕ T
    const qaNext = qa ^ ta;
    // JK-FF: Q(t+1) = J·Q' + K'·Q
    const qbNext = (jb & (1 - qb)) | ((1 - kb) & qb);
    fullRows.push({ qa, qb, x, ta, jb, kb, qaNext, qbNext });
  }

  // 빈칸 셀 선택 — 8행 × 5출력컬럼 중 6개 무작위 위치
  const blankPositions: Array<{ rowIdx: number; col: 0 | 1 | 2 | 3 | 4 }> = [];
  const cellKeys: Array<{ rowIdx: number; col: 0 | 1 | 2 | 3 | 4 }> = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 5; c++) cellKeys.push({ rowIdx: r, col: c as 0 | 1 | 2 | 3 | 4 });
  }
  // shuffle
  for (let i = cellKeys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cellKeys[i], cellKeys[j]] = [cellKeys[j], cellKeys[i]];
  }
  for (let i = 0; i < 6 && i < cellKeys.length; i++) blankPositions.push(cellKeys[i]);

  const blankMap = new Map<string, string>(); // key=`${rowIdx},${col}` → symbol
  const blankAnswers: Array<{ symbol: string; answer: string }> = [];
  blankPositions.forEach((bp, idx) => {
    const symbol = BLANK_SYMBOLS[idx];
    const key = `${bp.rowIdx},${bp.col}`;
    blankMap.set(key, symbol);
    const row = fullRows[bp.rowIdx];
    const colValues = [row.ta, row.jb, row.kb, row.qaNext, row.qbNext];
    blankAnswers.push({ symbol, answer: String(colValues[bp.col]) });
  });

  // 상태표 TruthTableDiagram 생성 (다중 output 컬럼 + 그룹 헤더)
  const stateTable: TruthTableDiagram = {
    variables: ["Q_A(t)", "Q_B(t)", "X"],
    outputLabels: ["T_A", "J_B", "K_B", "Q_A(t+1)", "Q_B(t+1)"],
    inputGroups: [
      { label: "현재 상태", span: 2 },
      { label: "입력", span: 1 },
    ],
    outputGroups: [
      { label: "플립플롭 입력", span: 3 },
      { label: "다음 상태", span: 2 },
    ],
    rows: fullRows.map((r, rowIdx) => {
      const cell = (col: 0 | 1 | 2 | 3 | 4, value: number): number | string => {
        const sym = blankMap.get(`${rowIdx},${col}`);
        return sym ?? value;
      };
      return {
        inputs: [r.qa, r.qb, r.x],
        outputs: [
          cell(0, r.ta),
          cell(1, r.jb),
          cell(2, r.kb),
          cell(3, r.qaNext),
          cell(4, r.qbNext),
        ],
      };
    }),
  };

  // logicNetworkDiagram 생성
  const logicNetworkDiagram = buildLogicNetwork(TA.expr, JB.expr, KB.expr);

  // waveform: X 입력 패턴 8 클럭 (또는 4 클럭) + 시뮬레이션
  const waveform = buildWaveform(TA.eval, JB.eval, KB.eval, rand);

  return {
    logicNetworkDiagram,
    stateTable,
    waveform,
    blankAnswers,
    expressions: { TA: TA.expr, JB: JB.expr, KB: KB.expr },
  };
}

// =====================================================================
// 회로 (logic_network) 구성 — 조합부 + T-FF + JK-FF
// =====================================================================
function buildLogicNetwork(taExpr: string, jbExpr: string, kbExpr: string): LogicNetworkDiagram {
  const gates: LogicGate[] = [];
  // 필요한 NOT 게이트 (Q_A', Q_B', X') 자동 추가
  const needsNot = new Set<string>();
  const considerExprNot = (expr: string) => {
    if (expr.includes("Q_A'")) needsNot.add("Q_A");
    if (expr.includes("Q_B'")) needsNot.add("Q_B");
    if (expr.includes("X'")) needsNot.add("X");
  };
  considerExprNot(taExpr);
  considerExprNot(jbExpr);
  considerExprNot(kbExpr);
  for (const v of needsNot) {
    gates.push({ id: `G_not_${v}`, type: "NOT", inputs: [v], output: `${v}_n` });
  }

  // 각 expression을 단일 gate로 매핑. expr이 단일 변수면 게이트 안 만들고
  // 그 변수를 직접 FF input으로 사용 (alias) — buffer OR(1-input) 같은 어색한 게이트 회피.
  const exprToInput = (expr: string, outputName: string, idx: number): string => {
    const ops = parseExpr(expr);
    if (ops.op === "buffer") {
      return ops.args[0]; // 원본 신호 그대로 FF input으로
    }
    gates.push({
      id: `G_${ops.op.toLowerCase()}_${outputName}_${idx}`,
      type: ops.op as LogicGate["type"],
      inputs: ops.args,
      output: outputName,
    });
    return outputName;
  };

  const taSig = exprToInput(taExpr, "T_A", 1);
  const jbSig = exprToInput(jbExpr, "J_B", 2);
  const kbSig = exprToInput(kbExpr, "K_B", 3);

  // T-FF (Q_A) + JK-FF (Q_B)
  gates.push({ id: "G_tff_QA", type: "TFF", inputs: [taSig], output: "Q_A" });
  gates.push({ id: "G_jkff_QB", type: "JKFF", inputs: [jbSig, kbSig], output: "Q_B" });

  return {
    inputs: ["X"],
    outputs: ["Q_A", "Q_B"],
    gates,
  };
}

/** expression → 게이트 한 개로 변환. 우리가 정의한 SIGNAL_FORMS만 처리. */
function parseExpr(expr: string): { op: string; args: string[] } {
  const norm = expr.replace(/\s+/g, "");
  const sig = (s: string): string => {
    if (s.endsWith("'")) return `${s.slice(0, -1)}_n`;
    return s;
  };
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
  // 단일 변수 — buffer
  return { op: "buffer", args: [sig(norm)] };
}

// =====================================================================
// Waveform 시뮬레이션 — X 입력 패턴 + 클럭 + Q_A, Q_B 시뮬레이션
// =====================================================================
function buildWaveform(
  taFn: Signal3,
  jbFn: Signal3,
  kbFn: Signal3,
  rand: () => number,
): WaveformDiagram {
  const CYCLES = 6; // 6 클럭 주기
  // X 입력 패턴 — 무작위 0/1 시퀀스 (단조 단조 회피 위해 변화 포함)
  const xPattern: number[] = [];
  for (let i = 0; i < CYCLES; i++) xPattern.push(Math.floor(rand() * 2));
  // 변화가 너무 적으면 강제로 토글
  if (xPattern.every((v) => v === xPattern[0])) {
    xPattern[Math.floor(CYCLES / 2)] = 1 - xPattern[0];
  }

  // 시뮬레이션 — 초기 Q_A = 0, Q_B = 0
  let qa = 0, qb = 0;
  const qaSeq: number[] = [qa];
  const qbSeq: number[] = [qb];
  for (let i = 0; i < CYCLES; i++) {
    const x = xPattern[i];
    const ta = taFn(qa, qb, x);
    const jb = jbFn(qa, qb, x);
    const kb = kbFn(qa, qb, x);
    qa = qa ^ ta;
    qb = (jb & (1 - qb)) | ((1 - kb) & qb);
    qaSeq.push(qa);
    qbSeq.push(qb);
  }

  // sample 좌표 (0~CYCLES, step 1)
  const stepSamples = (arr: number[]): Array<{ t: number; v: number }> =>
    arr.map((v, i) => ({ t: i, v }));

  // 클럭 — 매 단위 시간마다 0 → 1 → 0 (square wave, 0.5 period)
  const clkSamples: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= CYCLES; i++) {
    clkSamples.push({ t: i, v: 0 });
    clkSamples.push({ t: i + 0.5, v: 1 });
  }

  // X는 입력 패턴 step
  const xSamples: Array<{ t: number; v: number }> = [];
  for (let i = 0; i < CYCLES; i++) xSamples.push({ t: i, v: xPattern[i] });
  xSamples.push({ t: CYCLES, v: xPattern[CYCLES - 1] });

  return {
    signals: [
      { name: "X", samples: xSamples, shape: "step" },
      { name: "CLK", samples: clkSamples, shape: "step" },
      { name: "Q_A", samples: stepSamples(qaSeq), shape: "step" },
      { name: "Q_B", samples: stepSamples(qbSeq), shape: "step" },
    ],
    unit: { time: "s" },
    markers: Array.from({ length: Math.min(4, CYCLES) }, (_, i) => ({
      t: i + 1,
      label: `t_${i + 1}`,
    })),
  };
}
