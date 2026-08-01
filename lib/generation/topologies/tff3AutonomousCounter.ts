import type {
  GenerationMode,
  JkStateDiagram,
  KmapDiagram,
  Tff3CounterCircuitDiagram,
  TruthTableDiagram,
} from "@/types";
import { buildKmap, sopToString, type BooleanFunction } from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand } from "./_helpers";

/**
 * T 플립플롭 **3개**로 구성된 **자율(외부 입력 없는) 동기식 카운터** — 임용 11번 형식 전용 archetype.
 *
 *  (가) 상태도  : 상태를 C·B·A 순으로 표기. 사이클(순환) + 사이클로 진입만 하는 비순환 상태.
 *  (나) 상태표  : 현재 C_nB_nA_n → 다음 C_{n+1}B_{n+1}A_{n+1} → T_C T_B T_A.
 *                 빈칸 **㉠ = B_{n+1} 열의 한 칸**, **㉡ = T_B 열의 한 칸**.
 *  (다) 회로도  : T-FF 3개 + 공통 CLK. T_B 조합 블록이 **㉢**(학생이 2입력 게이트 2개로 도시).
 *
 *  〈해석 절차〉
 *   [단계 1] 상태도로부터 상태표의 ㉠·㉡을 구한다.
 *   [단계 2] T_B를 최소 SOP(곱의 합)로 간략화한다.
 *   [단계 3] ㉢을 2입력 게이트 2개로 구현한다.
 *
 * ★ 기존 `tff_state_table_blank`(임용 7번 정보과)와 **구조가 다르다**:
 *     그쪽은 T-FF 2개 + 외부 입력 C가 있고 도출 대상이 K-map 2개다.
 *     이쪽은 T-FF 3개 + 외부 입력 없음(자율) + 상태도 given + T_B 최소 SOP → 게이트 2개다.
 *   실측 신고(2026-08-01)에서 이 원본이 `tff_state_table_blank`로 조용히 오매치됐다.
 *
 * ★ 물리(결정론): T 여기식은 `T = Q_n ⊕ Q_{n+1}` 이고, 역으로 `Q_{n+1} = Q_n ⊕ T`.
 *   따라서 (T_C, T_B, T_A) 세 함수를 정하면 8개 상태의 다음 상태 = 상태도가 **결정론으로** 나온다.
 *   → **역방향 설계**: 먼저 T_B를 "2입력 게이트 2개로 실현 가능한 형"에서 고르고,
 *     T_C·T_A를 단순식 풀에서 고른 뒤, 만들어진 상태 그래프가 문제로 쓸 만한지 검사한다.
 *     (정방향으로 사이클을 먼저 정하면 T_B가 2게이트로 안 떨어지는 경우가 대부분이다.)
 *
 * ★ 2입력 게이트 **2개**로 실현 가능한 형 (T-FF는 Q̅ 출력을 주므로 보수 리터럴은 공짜):
 *     NAND(유사, 원본과 같은 모양): G₁ = (Y·Y)′ = Y′,  G₂ = (X·Y′)′ = **X′ + Y**
 *       → 앞 NAND를 **인버터로** 쓰는 원본 형태. 최소 SOP 2항(X′ + Y).
 *     NOR (변형): G₁ = (X+Y)′,  G₂ = (G₁+Z)′ = **(X+Y)·Z′**  → 최소 SOP 2항 (X·Z′ + Y·Z′)
 *   각 리터럴을 서로 다른 변수로 잡으면 최소 SOP가 항상 정확히 2항이다(스모크로 확인).
 */

export type Tff3CounterMode = "NAND" | "NOR";

export type Tff3AutonomousCounterGeneration = {
  /** ㉢을 구현하는 게이트 종류 (유사=NAND / 변형=NOR). */
  gateKind: Tff3CounterMode;
  /** 세 T 입력의 원식 (설계에 쓴 형태). */
  expressions: { TC: string; TB: string; TA: string };
  /** T_B 최소 SOP 텍스트 (정답 [단계 2]). */
  tbSop: string;
  /** ㉢ 게이트 구현 (정답 [단계 3]) — 2입력 게이트 2개. */
  tbGate: { g1: string; g2: string; inputs: string[] };
  /** 상태표 8행 원본 값 (검산·풀이용). */
  rows: Array<{
    cur: string; next: string;
    c: number; b: number; a: number;
    nc: number; nb: number; na: number;
    tc: number; tb: number; ta: number;
  }>;
  cycle: string[];
  nonCyclic: Array<{ state: string; next: string }>;
  /** 빈칸 — ★ **열 전체**가 빈칸이다(원본). values는 현재 상태 000→111 순의 8개 값. */
  blanks: {
    blank1: { symbol: string; column: string; values: number[] };   // ㉠ = Bₙ₊₁ 열
    blank2: { symbol: string; column: string; values: number[] };   // ㉡ = T_B 열
  };
  stateDiagram: JkStateDiagram;
  stateTable: TruthTableDiagram;
  circuitDiagram: Tff3CounterCircuitDiagram;
  /** T_B 카르노도 — 풀이 [단계 2] 산출물 (figure로 노출하지 않고 solutionFigures로). */
  tbKmap: KmapDiagram;
};

// ─────────────────────────────────────────────────────────────────────
// 상태 표현 — 상태 index i = C·4 + B·2 + A (상태 표기는 C B A 순)
// ─────────────────────────────────────────────────────────────────────
const VARS = ["C", "B", "A"] as const;
type VarName = (typeof VARS)[number];

/** 상태 index에서 변수 비트를 뽑는다. */
function bitOf(i: number, v: VarName): number {
  return v === "C" ? (i >> 2) & 1 : v === "B" ? (i >> 1) & 1 : i & 1;
}
/** 상태 index → "CBA" 3비트 문자열. */
function bits3(i: number): string {
  return i.toString(2).padStart(3, "0");
}

type Literal = { v: VarName; neg: boolean; text: string };
const LITERALS: Literal[] = VARS.flatMap((v) =>
  [false, true].map((neg) => ({ v, neg, text: neg ? `${v}'` : v })),
);
function litEval(l: Literal, i: number): number {
  return l.neg ? 1 - bitOf(i, l.v) : bitOf(i, l.v);
}
/** 리터럴의 보수 표기 (NAND/NOR 두 번째 입력은 식에서 보수로 등장한다). */
function litComplementText(l: Literal): string {
  return l.neg ? l.v : `${l.v}'`;
}

type Expr = { text: string; eval: (i: number) => number };

/**
 * T_B 후보 — 2입력 게이트 **2개**로 실현 가능한 형만 생성한다.
 *  NAND: P·Q + R′  (P,Q,R는 서로 다른 변수의 리터럴)
 *  NOR : (X+Y)·Z′
 * 세 변수를 모두 쓰므로 자명한 식(단일 리터럴)이 나오지 않는다.
 */
type TbCandidate = Expr & { kind: Tff3CounterMode; gateInputs: Literal[] };

function buildTbCandidates(kind: Tff3CounterMode): TbCandidate[] {
  const out: TbCandidate[] = [];
  if (kind === "NAND") {
    // 원본 형태 — 앞 NAND를 인버터로 쓴다: G₁ = Y′, G₂ = (X·Y′)′ = X′ + Y.
    for (const vx of VARS) {
      for (const vy of VARS) {
        if (vx === vy) continue;
        for (const negX of [false, true]) {
          for (const negY of [false, true]) {
            const X = LITERALS.find((l) => l.v === vx && l.neg === negX)!;
            const Y = LITERALS.find((l) => l.v === vy && l.neg === negY)!;
            out.push({
              kind, gateInputs: [X, Y],
              text: `${litComplementText(X)} + ${Y.text}`,
              eval: (i) => (1 - litEval(X, i)) | litEval(Y, i),
            });
          }
        }
      }
    }
    return out;
  }
  // NOR — 두 게이트를 사슬로: G₁ = (X+Y)′, G₂ = (G₁+Z)′ = (X+Y)·Z′.
  for (const thirdVar of VARS) {
    const [v1, v2] = VARS.filter((v) => v !== thirdVar);
    for (const negThird of [false, true]) {
      for (const neg1 of [false, true]) {
        for (const neg2 of [false, true]) {
          const P = LITERALS.find((l) => l.v === v1 && l.neg === neg1)!;
          const Q = LITERALS.find((l) => l.v === v2 && l.neg === neg2)!;
          const R = LITERALS.find((l) => l.v === thirdVar && l.neg === negThird)!;
          out.push({
            kind, gateInputs: [P, Q, R],
            text: `(${P.text} + ${Q.text})·${litComplementText(R)}`,
            eval: (i) => (litEval(P, i) | litEval(Q, i)) & (1 - litEval(R, i)),
          });
        }
      }
    }
  }
  return out;
}

/** T_C·T_A 후보 — 회로에 한 블록으로 그릴 수 있는 단순식만. */
function buildSimpleExprs(): Expr[] {
  const out: Expr[] = [{ text: "1", eval: () => 1 }];
  for (const l of LITERALS) out.push({ text: l.text, eval: (i) => litEval(l, i) });
  for (let x = 0; x < LITERALS.length; x++) {
    for (let y = 0; y < LITERALS.length; y++) {
      const L = LITERALS[x], M = LITERALS[y];
      if (L.v === M.v) continue;
      if (VARS.indexOf(L.v) > VARS.indexOf(M.v)) continue;   // 순서 중복 제거
      out.push({ text: `${L.text}${M.text}`, eval: (i) => litEval(L, i) & litEval(M, i) });
      out.push({ text: `${L.text} + ${M.text}`, eval: (i) => litEval(L, i) | litEval(M, i) });
      if (!L.neg && !M.neg) out.push({ text: `${L.v} ⊕ ${M.v}`, eval: (i) => litEval(L, i) ^ litEval(M, i) });
    }
  }
  return out;
}

/** 함수를 8비트 진리값 문자열로 (동일 함수 판별용). */
function signature(e: Expr): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += e.eval(i);
  return s;
}

/** 상태 그래프 분석 — 사이클(들)과 다음 상태 배열. */
function analyzeGraph(tc: Expr, tb: Expr, ta: Expr): { next: number[]; cycles: number[][] } {
  const next: number[] = [];
  for (let i = 0; i < 8; i++) {
    // Q_{n+1} = Q_n ⊕ T
    const nc = bitOf(i, "C") ^ tc.eval(i);
    const nb = bitOf(i, "B") ^ tb.eval(i);
    const na = bitOf(i, "A") ^ ta.eval(i);
    next.push(nc * 4 + nb * 2 + na);
  }
  const cycles: number[][] = [];
  const color = new Array(8).fill(0);   // 0=미방문 1=탐색중 2=완료
  for (let s = 0; s < 8; s++) {
    if (color[s] !== 0) continue;
    const path: number[] = [];
    let x = s;
    while (color[x] === 0) { color[x] = 1; path.push(x); x = next[x]; }
    if (color[x] === 1) cycles.push(path.slice(path.indexOf(x)));
    for (const p of path) color[p] = 2;
  }
  return { next, cycles };
}

/** 원본 구조 = 6상태 사이클 + 비순환 2개. 이 길이를 고정해 유사·변형 모두 원본 형식을 유지한다. */
const CYCLE_LEN = 6;

type Design = {
  tb: TbCandidate; tc: Expr; ta: Expr;
  next: number[]; cycle: number[];
  nonCyclic: Array<{ state: number; next: number }>;
};

/**
 * 조건을 만족하는 설계를 모두 열거한다.
 *  - 사이클이 정확히 1개, 길이 CYCLE_LEN
 *  - 비순환 상태는 **한 클럭 만에 사이클로 진입** (상태도 렌더러가 진입 화살표로 그린다)
 *  - T_C·T_B·T_A 중 항상 0인 것 없음(죽은 FF 금지), 셋이 서로 다른 함수
 *  - T_B 최소 SOP가 정확히 2항 (2게이트 구현이 실제로 최소형)
 */
function enumerateDesigns(kind: Tff3CounterMode): Design[] {
  const tbs = buildTbCandidates(kind);
  const pool = buildSimpleExprs();
  const found: Design[] = [];
  for (const tb of tbs) {
    const tbSig = signature(tb);
    if (!tbSig.includes("1")) continue;
    if (minimizeSop(toBooleanFunction(tb)).length !== 2) continue;
    for (const tc of pool) {
      const tcSig = signature(tc);
      if (!tcSig.includes("1") || tcSig === tbSig) continue;
      for (const ta of pool) {
        const taSig = signature(ta);
        if (!taSig.includes("1") || taSig === tbSig || taSig === tcSig) continue;
        const { next, cycles } = analyzeGraph(tc, tb, ta);
        if (cycles.length !== 1) continue;
        const cycle = cycles[0];
        if (cycle.length !== CYCLE_LEN) continue;
        const inCycle = new Set(cycle);
        const nonCyclic: Array<{ state: number; next: number }> = [];
        let ok = true;
        for (let i = 0; i < 8; i++) {
          if (inCycle.has(i)) continue;
          if (!inCycle.has(next[i])) { ok = false; break; }
          nonCyclic.push({ state: i, next: next[i] });
        }
        if (!ok) continue;
        found.push({ tb, tc, ta, next, cycle, nonCyclic });
      }
    }
  }
  return found;
}

/** Expr → BooleanFunction (변수 순서 C·B·A, index = C·4+B·2+A와 동일). */
function toBooleanFunction(e: Expr): BooleanFunction {
  const minterms: number[] = [];
  for (let i = 0; i < 8; i++) if (e.eval(i)) minterms.push(i);
  return { vars: 3, varNames: [...VARS], minterms, dontCares: [] };
}

export function generateTff3AutonomousCounter(args: {
  seed?: number;
  mode: GenerationMode;
}): Tff3AutonomousCounterGeneration {
  const rand = makeRand(args.seed);
  // xorshift32는 작은 seed에서 첫 출력이 작게 편향된다 — warm-up으로 분포 안정화.
  for (let i = 0; i < 8; i++) rand();

  // 유사 = 원본과 같은 2입력 NAND 2개 / 변형 = 게이트 종류를 2입력 NOR 2개로 (소자 종류 변형).
  const gateKind: Tff3CounterMode = args.mode === "exam_variant" ? "NOR" : "NAND";

  const designs = enumerateDesigns(gateKind);
  if (designs.length === 0) {
    // 설계 조건은 코드로 고정돼 있어 도달 불가 — 조건을 바꿀 때 조용히 깨지지 않도록 명시적으로 막는다.
    throw new Error(`tff3AutonomousCounter: ${gateKind} 형 설계 해가 없다 (조건이 과하게 좁아졌는지 확인)`);
  }
  const d = designs[Math.floor(rand() * designs.length)];

  // ── 상태표 8행 (현재 → 다음 → T 여기) ──────────────────────────────
  const rows = Array.from({ length: 8 }, (_, i) => {
    const c = bitOf(i, "C"), b = bitOf(i, "B"), a = bitOf(i, "A");
    const nx = d.next[i];
    const nc = (nx >> 2) & 1, nb = (nx >> 1) & 1, na = nx & 1;
    return {
      cur: bits3(i), next: bits3(nx),
      c, b, a, nc, nb, na,
      tc: c ^ nc, tb: b ^ nb, ta: a ^ na,
    };
  });

  // ── 빈칸 ── ★ 원본은 **열 전체**가 빈칸이다 (설계 절차 [단계 1]: "B_{n+1}과 T_B를
  //   각각 순차대로 작성한다"). 한 칸만 비우면 원본과 다른 문제가 된다.
  //   표 렌더러가 셀 병합을 못 하므로 **헤더에 ㉠·㉡을 달고 그 열의 셀은 비운다** —
  //   원본의 "열을 감싼 세로 상자"와 같은 뜻이 되고 화면에서도 깔끔하다.
  const stateTable: TruthTableDiagram = {
    // 표 헤더는 유니코드 아래첨자로 — "C_{n+1}"처럼 중괄호를 그대로 두면 화면에 LaTeX 문법이 노출된다.
    variables: ["Cₙ", "Bₙ", "Aₙ"],
    outputLabels: ["Cₙ₊₁", "Bₙ₊₁ (㉠)", "Aₙ₊₁", "T_C", "T_B (㉡)", "T_A"],
    inputGroups: [{ label: "현재 상태", span: 3 }],
    outputGroups: [
      { label: "다음 상태", span: 3 },
      { label: "T 플립플롭 입력", span: 3 },
    ],
    rows: rows.map((r) => ({
      inputs: [r.c, r.b, r.a],
      outputs: [r.nc, "", r.na, r.tc, "", r.ta],
    })),
  };

  // ── (가) 상태도 — 사이클 + 비순환(진입만) ───────────────────────────
  const stateDiagram: JkStateDiagram = {
    cycle: d.cycle.map(bits3),
    nonCyclic: d.nonCyclic.map((x) => ({ state: bits3(x.state), next: bits3(x.next) })),
  };

  // ── [단계 2] T_B 최소 SOP + 카르노도 ────────────────────────────────
  const tbFunc = toBooleanFunction(d.tb);
  const tbSop = sopToString(minimizeSop(tbFunc), [...VARS]);
  const km = buildKmap(tbFunc);
  const tbKmap: KmapDiagram = {
    title: "T_B",
    variables: [...VARS],
    rowVars: km.rowVars,
    colVars: km.colVars,
    rowOrder: km.rowOrder,
    colOrder: km.colOrder,
    rows: km.cells.map((cells, ri) => ({ label: km.rowOrder[ri], values: cells })),
  };

  // ── [단계 3] ㉢ 게이트 구현 ─────────────────────────────────────────
  const tbGate =
    gateKind === "NAND"
      ? (() => {
          // 앞 NAND는 두 입력을 묶어 **인버터**로 쓴다 (원본 형태).
          const [X, Y] = d.tb.gateInputs;
          return {
            g1: `G₁ = NAND(${Y.text}, ${Y.text}) = ${litComplementText(Y)}`,
            g2: `G₂ = NAND(${X.text}, G₁) = (${X.text}·${litComplementText(Y)})′ = ${litComplementText(X)} + ${Y.text}`,
            inputs: [X.text, Y.text],
          };
        })()
      : (() => {
          const [P, Q, R] = d.tb.gateInputs;
          return {
            g1: `G₁ = NOR(${P.text}, ${Q.text}) = (${P.text} + ${Q.text})′`,
            g2: `G₂ = NOR(G₁, ${R.text}) = (${P.text} + ${Q.text})·${litComplementText(R)}`,
            inputs: [P.text, Q.text, R.text],
          };
        })();

  // ── (다) 회로 ──────────────────────────────────────────────────────
  // ★ 원본은 T_C·T_A 블록의 내용도, ㉢의 입력도 주지 않는다 (상태도만으로 풀린다) — payload에 없음.
  const circuitDiagram: Tff3CounterCircuitDiagram = { blockLabel: "㉢", gateKind };

  return {
    gateKind,
    expressions: { TC: d.tc.text, TB: d.tb.text, TA: d.ta.text },
    tbSop,
    tbGate,
    rows,
    cycle: stateDiagram.cycle,
    nonCyclic: stateDiagram.nonCyclic,
    // ★ 빈칸은 **열 전체** — 위에서부터(현재 상태 000→111 순) 8개 값.
    blanks: {
      blank1: { symbol: "㉠", column: "Bₙ₊₁", values: rows.map((r) => r.nb) },
      blank2: { symbol: "㉡", column: "T_B", values: rows.map((r) => r.tb) },
    },
    stateDiagram,
    stateTable,
    circuitDiagram,
    tbKmap,
  };
}
