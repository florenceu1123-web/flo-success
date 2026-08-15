import type { ConceptDiagram, GenerationMode, TruthTableDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";
import { minimizeSop } from "@/lib/digital/minimize";
import { sopToString } from "@/lib/digital/booleanFunction";

/**
 * JK 플립플롭 2개(출력 A·B)로 구성된 **Mealy 순서논리회로** — 상태도 → 상태표 빈칸 → 출력 y 논리식
 * → J_A·J_B 최소화 (임용 9번 디지털) 전용 archetype. GPT 없음(전이표에서 규칙으로 도출).
 *
 *  (가) 상태도: 상태 4개(00·01·11·10), 간선 라벨은 **x/y**(Mealy).
 *      · x=0 — 네 상태를 도는 **4-사이클**, 출력 y=0
 *      · x=1 — **자기 루프**(상태 유지), 출력 y는 상태에 따라 1/0
 *  (나) 상태표: 현재상태 A·B | 차기상태(x=0, x=1) | 출력 y(x=0, x=1), **한 행이 ㉠~㉥ 빈칸**
 *
 * ★ 물리(규칙 도출):
 *   · JK 여기표 — Q=0→Q⁺=0: J=0,K=X / 0→1: J=1,K=X / 1→0: J=X,K=1 / 1→1: J=X,K=0
 *     즉 **J는 Q=0인 행에서만, K는 Q=1인 행에서만** 정의되고 나머지는 **무관항(don't care)** 이다.
 *   · 그 무관항을 살려 3변수(A,B,x) 카르노맵으로 최소화한다 → 답이 짧아진다.
 *  원본 검산(x=0: 00→11→10→01→00, x=1: 유지, y=1 ⇔ x=1 ∧ A=B):
 *   ㉠㉡ = 0 1, ㉢㉣ = 1 0, ㉤ = 0, ㉥ = 0 /  **y = x(A'B' + AB)** /
 *   **J_A = B'x'**, **J_B = x'**  (무관항을 쓰지 않으면 J_B가 B'x'로 남아 최소가 아니다.)
 *
 * ★ 형제와 다르다: `jk_excitation_sop_pos`(여기표+SOP→POS, 상태도 없음)·`dff_state_design`(D-FF 자율)·
 *   `tff_state_design_input`(T-FF)·`jk_sync_counter`(3-FF 카운터+파형) 어느 것도 **Mealy 출력 y + 상태도**를
 *   갖지 않는다.
 *
 * ★ 값(상태기계)은 예시 하드코딩이 아니라 **규칙 열거**: x=0의 4-사이클 순열 × 출력 집합 S(|S|=2) ×
 *   빈칸 행을 전수 열거하고, J·K 최소식이 짧게 떨어지는 것만 남긴다. 원본 튜플 제외.
 */

/** 상태 인덱스: 0=00, 1=01, 2=10, 3=11 (비트: A=hi, B=lo). */
const STATES = [0, 1, 2, 3] as const;
const AB = (s: number): [number, number] => [(s >> 1) & 1, s & 1];
const BLANKS = ["㉠", "㉡", "㉢", "㉣", "㉤", "㉥"];

export type JkMealyGeneration = {
  values: {
    cycle: number[];        // x=0에서의 순환 순서 (길이 4, cycle[i] → cycle[i+1])
    outStates: number[];    // x=1일 때 y=1이 되는 상태 2개
    blankRow: number;       // ㉠~㉥이 있는 행(현재 상태 인덱스)
  };
  answer: {
    blanks: string[];       // ㉠~㉥ 값 (0/1)
    yExpr: string;          // 출력 y 논리식
    jaExpr: string; jbExpr: string;   // J_A·J_B 최소식 (유사)
    kaExpr: string; kbExpr: string;   // K_A·K_B 최소식 (변형)
    rows: Array<{ a: number; b: number; n0: [number, number]; n1: [number, number]; y0: number; y1: number }>;
  };
  stateDiagram: ConceptDiagram;
  stateTable: TruthTableDiagram;
};

type Family = { cycle: number[]; outStates: number[]; blankRow: number };

// 원본 튜플 (참조·검증 전용, 생성 풀 제외): x=0 사이클 00→11→10→01, y=1 ⇔ x=1 ∧ 상태 ∈ {00,11}, 빈칸 행 = 10.
const ORIGINAL: Family = { cycle: [0, 3, 2, 1], outStates: [0, 3], blankRow: 2 };

/** 상태 s에서 x일 때의 차기 상태. */
function nextOf(f: Family, s: number, x: number): number {
  if (x === 1) return s;                       // x=1은 자기 루프(유지)
  const i = f.cycle.indexOf(s);
  return f.cycle[(i + 1) % 4];
}
/** Mealy 출력 y. */
function outOf(f: Family, s: number, x: number): number {
  return x === 1 && f.outStates.includes(s) ? 1 : 0;
}
/** (A,B,x) → minterm 인덱스. */
const idxOf = (a: number, b: number, x: number) => a * 4 + b * 2 + x;

/** J/K 여기 신호를 무관항과 함께 3변수 함수로 만들어 최소화한다. */
function excitationExpr(f: Family, bit: "A" | "B", which: "J" | "K"): string {
  const minterms: number[] = [], dontCares: number[] = [];
  for (const s of STATES) {
    const [a, b] = AB(s);
    const q = bit === "A" ? a : b;
    for (const x of [0, 1]) {
      const idx = idxOf(a, b, x);
      const ns = nextOf(f, s, x);
      const [na, nb] = AB(ns);
      const qn = bit === "A" ? na : nb;
      // J는 Q=0인 행에서만, K는 Q=1인 행에서만 정의된다.
      if (which === "J") {
        if (q === 0) { if (qn === 1) minterms.push(idx); } else dontCares.push(idx);
      } else {
        if (q === 1) { if (qn === 0) minterms.push(idx); } else dontCares.push(idx);
      }
    }
  }
  if (minterms.length === 0) return "0";
  const sop = minimizeSop({ vars: 3, varNames: ["A", "B", "x"], minterms, dontCares });
  return sopToString(sop, ["A", "B", "x"]);
}

/** 출력 y의 최소식 (무관항 없음). */
function outputExpr(f: Family): string {
  const minterms: number[] = [];
  for (const s of STATES) {
    const [a, b] = AB(s);
    for (const x of [0, 1]) if (outOf(f, s, x) === 1) minterms.push(idxOf(a, b, x));
  }
  if (minterms.length === 0) return "0";
  const sop = minimizeSop({ vars: 3, varNames: ["A", "B", "x"], minterms, dontCares: [] });
  return sopToString(sop, ["A", "B", "x"]);
}

function solve(f: Family): JkMealyGeneration {
  // 표 행 순서는 원본과 같이 00 → 01 → 10 → 11
  const rowOrder = [0, 1, 2, 3];
  const rows = rowOrder.map((s) => {
    const [a, b] = AB(s);
    const n0 = AB(nextOf(f, s, 0)), n1 = AB(nextOf(f, s, 1));
    return { a, b, n0, n1, y0: outOf(f, s, 0), y1: outOf(f, s, 1) };
  });

  const br = rows.find((r) => r.a * 2 + r.b === f.blankRow)!;
  const blanks = [String(br.n0[0]), String(br.n0[1]), String(br.n1[0]), String(br.n1[1]), String(br.y0), String(br.y1)];

  // (나) 상태표 — 빈칸 행은 ㉠~㉥으로 가린다.
  const stateTable: TruthTableDiagram = {
    variables: ["A", "B"],
    rows: rows.map((r) => {
      const isBlank = r.a * 2 + r.b === f.blankRow;
      const outs = isBlank
        ? BLANKS
        : [String(r.n0[0]), String(r.n0[1]), String(r.n1[0]), String(r.n1[1]), String(r.y0), String(r.y1)];
      return { inputs: [r.a, r.b], outputs: outs };
    }),
    outputLabels: ["A(x=0)", "B(x=0)", "A(x=1)", "B(x=1)", "y(x=0)", "y(x=1)"],
  };

  // (가) 상태도 — 노드 4개 + x=0 전이 4개 + x=1 자기 루프 4개. 라벨은 "x/y".
  const label = (s: number) => `${AB(s)[0]}${AB(s)[1]}`;
  const stateDiagram: ConceptDiagram = {
    // ★ 노드를 **순환 순서**로 내보낸다 — 렌더러가 배열 순서대로 원 위에 놓으므로
    //   x=0 전이가 모두 이웃 간 호가 되어 원본처럼 깔끔해진다(중앙을 가로지르는 간선·라벨 뭉침 제거).
    nodes: f.cycle.map((s) => ({ id: `s${s}`, label: label(s) })),
    edges: [
      ...STATES.map((s) => ({ from: `s${s}`, to: `s${nextOf(f, s, 0)}`, label: `0/${outOf(f, s, 0)}` })),
      ...STATES.map((s) => ({ from: `s${s}`, to: `s${s}`, label: `1/${outOf(f, s, 1)}` })),
    ],
  };

  return {
    values: { cycle: [...f.cycle], outStates: [...f.outStates], blankRow: f.blankRow },
    answer: {
      blanks,
      yExpr: outputExpr(f),
      jaExpr: excitationExpr(f, "A", "J"),
      jbExpr: excitationExpr(f, "B", "J"),
      kaExpr: excitationExpr(f, "A", "K"),
      kbExpr: excitationExpr(f, "B", "K"),
      rows,
    },
    stateDiagram, stateTable,
  };
}

/** 항 수·리터럴 수 — 답이 지저분한 조합을 거른다. */
function cost(expr: string): { terms: number; maxLits: number } {
  if (expr === "0" || expr === "1") return { terms: 1, maxLits: 0 };
  const terms = expr.split("+").map((t) => t.trim());
  return { terms: terms.length, maxLits: Math.max(...terms.map((t) => (t.match(/[ABx]/g) ?? []).length)) };
}

/**
 * 규칙 열거 + 필터 (특정 예시 하드코딩 금지).
 *   · x=0의 4-사이클: 00에서 시작하는 순열 3! = 6가지
 *   · y=1이 되는 상태 집합 S: 4개 중 2개 = 6가지 (y = x·f(A,B)가 한 항 또는 두 항으로 떨어진다)
 *   · 빈칸 행: 4가지
 *   필터: J_A·J_B·K_A·K_B가 모두 **2항 이하·리터럴 2개 이하**, J_A ≠ J_B(두 답이 같으면 싱겁다),
 *        y가 상수가 아님. 원본 튜플 제외.
 */
function buildSpace(): Family[] {
  const out: Family[] = [];
  const perms = permutations([1, 2, 3]);
  const pairs: number[][] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([i, j]);
  for (const p of perms) {
    const cycle = [0, ...p];
    for (const outStates of pairs)
      for (const blankRow of STATES) {
        const f: Family = { cycle, outStates, blankRow };
        const g = solve(f);
        const a = g.answer;
        const costs = [a.jaExpr, a.jbExpr, a.kaExpr, a.kbExpr].map(cost);
        if (costs.some((c) => c.terms > 2 || c.maxLits > 2)) continue;
        if (a.jaExpr === a.jbExpr) continue;
        if (a.yExpr === "0" || a.yExpr === "1") continue;
        if (
          cycle.join() === ORIGINAL.cycle.join() &&
          outStates.join() === ORIGINAL.outStates.join() &&
          blankRow === ORIGINAL.blankRow
        ) continue;                                   // 원본 튜플 제외
        out.push(f);
      }
  }
  return out;
}
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const res: T[][] = [];
  arr.forEach((v, i) => {
    for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) res.push([v, ...rest]);
  });
  return res;
}
const SPACE = buildSpace();

/**
 * exam_similar = 원본 구조 — [3]에서 **J_A·J_B**를 구한다.
 * exam_variant = **구하는 양 교환** — [3]에서 **K_A·K_B**를 구한다(같은 여기표, 반대쪽 입력).
 * 값 풀은 절반씩 나눠 두 모드가 서로 다른 상태기계를 쓴다.
 */
export function generateJkMealyStateDesign(args: { seed?: number; mode: GenerationMode }): JkMealyGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const half = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8 ? SPACE : args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(pool.length ? pool : SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalJkMealyForVerify(): JkMealyGeneration {
  return solve(ORIGINAL);
}
/** 스모크용 — 생성 풀 크기. */
export function __jkMealyPoolSize(): number { return SPACE.length; }
