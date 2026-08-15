import type {
  ConceptDiagram,
  DffStateDesignCircuitDiagram,
  GenerationMode,
  KmapDiagram,
  TruthTableDiagram,
} from "@/types";
import { sopToString, type BooleanFunction } from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand } from "./_helpers";

/**
 * 외부 입력 X를 갖는 2-bit 상태기계 → **T 플립플롭** 2개 + 게이트 설계 (임용 12번 디지털논리) 전용 archetype.
 * GPT 없음(결정론).
 *
 *  (가) 상태도 — 상태 Q_A Q_B(4개) + **입력 X**로 분기(간선마다 X 값 라벨)
 *  (나) 상태표 — 현재상태 Q_A Q_B | 입력 X | 다음상태 Q_A⁺ Q_B⁺ | **플립플롭 입력 T_A T_B** (㉠ = T_A 열 빈칸)
 *  (다) 카르노맵 2개 — T_A·T_B를 (Q_AQ_B 행) × (X 열)로
 *  (라) 구현 회로 — T-FF 2개 + 게이트 블록 ㉡ (2개의 AND + 1개의 OR)
 *  〈설계 절차〉 [1] (가)→(나) ㉠  [2] T_A·T_B를 간략화된 최소항의 합으로  [3] ㉡을 2 AND + 1 OR로 도시
 *
 * ★ 원본은 **D 플립플롭**이지만 사용자 지정(2026-08-02)으로 **T 플립플롭**으로 바꿔 출제한다.
 *   D-FF: D = 다음 상태.  T-FF: **T = Q(t) ⊕ Q(t+1)** (여기표) — 절차가 한 단계 더 깊어진다.
 *
 * ★ 형제 `dff_state_design`(임용 9번)과 다르다: 저쪽은 **입력이 없는 자율 상태도**(2변수 카르노맵),
 *   이쪽은 **외부 입력 X가 있어 3변수(Q_A,Q_B,X)** 다 → 상태표 8행·카르노맵 4×2. 재현 불가라 전용 archetype.
 *
 * ★ 값(상태기계)은 예시 hardcode가 아니라 ★규칙 열거★:
 *   T_A·T_B를 3변수 불함수 공간에서 열거하고 **최소 SOP 항 수·리터럴 수로 필터**한 뒤
 *   next = Q ⊕ T 로 상태도를 역산한다. 이러면 [단계 3]의 "2 AND + 1 OR"가 항상 성립한다.
 */

type Bit = 0 | 1;
const VARS = ["Q_A", "Q_B", "X"];
/** minterm index = Q_A*4 + Q_B*2 + X */
const IDX = (qa: Bit, qb: Bit, x: Bit) => qa * 4 + qb * 2 + x;
const STATE_ORDER: Array<[Bit, Bit]> = [[0, 0], [0, 1], [1, 1], [1, 0]]; // 카르노맵 행 순서(그레이)

export type TffStateDesignInputGeneration = {
  /** T_A·T_B의 진리값 (index 0..7) */
  tA: Bit[]; tB: Bit[];
  /** 다음 상태 next[qa][qb][x] = [qa⁺, qb⁺] */
  nextOf: Array<Array<[Bit, Bit]>>;
  tAExpr: string; tBExpr: string;       // 최소 SOP
  tATermCount: number;                  // ㉡ 게이트 수 검증용
  transitions: string[];                // "00 --X=0--> 01" 목록
  tableAnswers: Array<{ row: string; tA: Bit; tB: Bit }>;  // ㉠(T_A 열) 정답
  stateDiagram: ConceptDiagram;         // (가)
  stateTable: TruthTableDiagram;        // (나)
  kmapA: KmapDiagram; kmapB: KmapDiagram; // (다)
  circuitDiagram: DffStateDesignCircuitDiagram; // (라)
};

/** 3변수 함수(8비트 진리표)의 최소 SOP 문자열 + 항/리터럴 정보. */
function sopInfo(bits: Bit[]): { expr: string; terms: number; literals: number[] } {
  const fn: BooleanFunction = {
    vars: 3, varNames: VARS,
    minterms: bits.map((b, i) => (b ? i : -1)).filter((i) => i >= 0),
    dontCares: [],
  };
  const sop = minimizeSop(fn);
  return {
    expr: bits.every((b) => b === 0) ? "0" : bits.every((b) => b === 1) ? "1" : sopToString(sop, VARS),
    terms: sop.length,
    // pattern의 자리 문자: "0"/"1"은 리터럴, "X"(don't care 자리)는 제외
    literals: sop.map((t) => (t.pattern ?? "").split("").filter((c: string) => c === "0" || c === "1").length),
  };
}

type Family = { tA: Bit[]; tB: Bit[] };

function solve(f: Family): TffStateDesignInputGeneration {
  const { tA, tB } = f;
  const infoA = sopInfo(tA), infoB = sopInfo(tB);

  // 다음 상태 = 현재 ⊕ T (T 플립플롭)
  const nextOf: Array<Array<[Bit, Bit]>> = [[], []];
  for (const qa of [0, 1] as Bit[])
    for (const qb of [0, 1] as Bit[]) {
      nextOf[qa][qb] = [0, 0] as unknown as [Bit, Bit];
    }
  const nextAt = (qa: Bit, qb: Bit, x: Bit): [Bit, Bit] => {
    const i = IDX(qa, qb, x);
    return [(qa ^ tA[i]) as Bit, (qb ^ tB[i]) as Bit];
  };

  // (가) 상태도 — 간선마다 X 값 라벨. 같은 (from,to)로 X=0·1이 모두 가면 "0, 1"로 합친다.
  const nodes = STATE_ORDER.map(([a, b]) => ({ id: `${a}${b}`, label: `${a}${b}` }));
  const edgeMap = new Map<string, string[]>();
  const transitions: string[] = [];
  for (const [qa, qb] of STATE_ORDER)
    for (const x of [0, 1] as Bit[]) {
      const [na, nb] = nextAt(qa, qb, x);
      const key = `${qa}${qb}|${na}${nb}`;
      edgeMap.set(key, [...(edgeMap.get(key) ?? []), String(x)]);
      transitions.push(`${qa}${qb} --X=${x}--> ${na}${nb}`);
    }
  const stateDiagram: ConceptDiagram = {
    nodes,
    edges: [...edgeMap.entries()].map(([key, xs]) => {
      const [from, to] = key.split("|");
      return { from, to, label: xs.join(", ") };
    }),
  };

  // (나) 상태표 — 8행. 입력: Q_A Q_B X / 출력: Q_A⁺ Q_B⁺ T_A T_B
  const rows: TruthTableDiagram["rows"] = [];
  const tableAnswers: TffStateDesignInputGeneration["tableAnswers"] = [];
  for (const qa of [0, 1] as Bit[])
    for (const qb of [0, 1] as Bit[])
      for (const x of [0, 1] as Bit[]) {
        const i = IDX(qa, qb, x);
        const [na, nb] = nextAt(qa, qb, x);
        rows.push({ inputs: [qa, qb, x], outputs: [na, nb, tA[i], tB[i]] });
        tableAnswers.push({ row: `Q_A Q_B X = ${qa}${qb}${x}`, tA: tA[i], tB: tB[i] });
      }
  const stateTable: TruthTableDiagram = {
    variables: ["Q_A", "Q_B", "X"],
    inputGroups: [{ label: "현재 상태", span: 2 }, { label: "입력", span: 1 }],
    outputLabels: ["Q_A(t+1)", "Q_B(t+1)", "T_A", "T_B"],
    rows,
  };

  // (다) 카르노맵 — 행 Q_AQ_B(그레이) × 열 X
  const kmapOf = (bits: Bit[], title: string): KmapDiagram => ({
    title,
    variables: VARS,
    rowVars: ["Q_A", "Q_B"], colVars: ["X"],
    rowOrder: STATE_ORDER.map(([a, b]) => `${a}${b}`),
    colOrder: ["0", "1"],
    rows: STATE_ORDER.map(([a, b]) => ({
      label: `${a}${b}`,
      values: [bits[IDX(a, b, 0)], bits[IDX(a, b, 1)]],
    })),
  });

  // (라) 구현 회로 — T-FF 2개 + 게이트 블록(빈칸) + 외부 입력 X
  const circuitDiagram: DffStateDesignCircuitDiagram = {
    gateASym: "㉡", gateBSym: "㉢",
    gateAInputs: ["Q_A", "Q_B", "X"],
    gateBInputs: ["Q_A", "Q_B", "X"],
    ffAType: "T", ffBType: "T",
    ffAInputName: "T_A", ffBInputName: "T_B",
    externalInput: "X",
  };

  return {
    tA, tB, nextOf,
    tAExpr: infoA.expr, tBExpr: infoB.expr, tATermCount: infoA.terms,
    transitions, tableAnswers,
    stateDiagram, stateTable,
    kmapA: kmapOf(tA, "T_A"), kmapB: kmapOf(tB, "T_B"),
    circuitDiagram,
  };
}

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *   · T_A: 최소 SOP가 **정확히 2항**이고 각 항이 **2리터럴** → [단계 3]의 "2 AND + 1 OR"가 성립
 *   · T_B: 최소 SOP가 1~2항, 리터럴 1~2 (회로가 지나치게 복잡해지지 않게)
 *   · 상수함수(항상 0/1) 배제, 상태 전이가 실제로 일어나야 함(자기루프만 있는 기계 배제)
 *   · 입력 X가 **실제로 영향**을 줘야 한다(T_A 또는 T_B가 X에 의존)
 */
function buildSpace(): Family[] {
  const all: Bit[][] = [];
  for (let m = 0; m < 256; m++) {
    all.push(Array.from({ length: 8 }, (_, i) => ((m >> i) & 1) as Bit));
  }
  const dependsOnX = (b: Bit[]) => [0, 2, 4, 6].some((i) => b[i] !== b[i + 1]);
  const aCands = all.filter((b) => {
    const s = sopInfo(b);
    return s.terms === 2 && s.literals.every((l) => l === 2);
  });
  const bCands = all.filter((b) => {
    const s = sopInfo(b);
    return s.terms >= 1 && s.terms <= 2 && s.literals.every((l) => l >= 1 && l <= 2) &&
      b.some((v) => v === 1) && b.some((v) => v === 0);
  });
  const out: Family[] = [];
  for (const tA of aCands)
    for (const tB of bCands) {
      if (!dependsOnX(tA) && !dependsOnX(tB)) continue;     // X가 무의미한 기계 배제
      // 모든 상태가 어떤 X에서 실제로 전이해야 한다(전부 자기루프인 상태가 없게)
      let stuck = false;
      for (const [qa, qb] of STATE_ORDER) {
        const moves = [0, 1].some((x) => tA[IDX(qa, qb, x as Bit)] === 1 || tB[IDX(qa, qb, x as Bit)] === 1);
        if (!moves) { stuck = true; break; }
      }
      if (stuck) continue;
      out.push({ tA, tB });
      if (out.length >= 3000) return out;
    }
  return out;
}
const SPACE = buildSpace();

/**
 * 유사·변형 모두 **같은 형식**(T-FF 2개 + 입력 X). 값 풀을 절반으로 나눠 서로 다른 상태기계를 쓴다.
 *   exam_similar = 원본 절차(㉠ 상태표 → T_A·T_B 최소 SOP → ㉡ 2 AND + 1 OR)
 *   exam_variant = 같은 절차, 다른 상태기계(풀 후반) — ★구조·원리 동일★
 */
export function generateTffStateDesignInput(args: { seed?: number; mode: GenerationMode }): TffStateDesignInputGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const half = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8 ? SPACE : args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  const idx = Math.floor(rand() * pool.length) % pool.length;
  return solve(pool[idx] ?? SPACE[0]);
}

/** 스모크용 — 생성 풀 크기. */
export function __tffStateDesignInputPoolSize(): number { return SPACE.length; }
/** 스모크용 — 임의 T_A·T_B로 직접 풀기. */
export function __tffSolveForVerify(tA: Bit[], tB: Bit[]): TffStateDesignInputGeneration {
  return solve({ tA, tB });
}
