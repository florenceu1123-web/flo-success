import type {
  CircuitTypeParams,
  KmapDiagram,
  LogicNetworkDiagram,
} from "@/types";
import {
  buildKmap,
  sopToString,
  type BooleanFunction,
  type SopTerm,
} from "@/lib/digital/booleanFunction";
import { buildLogicNetworkMulti } from "@/lib/digital/buildLogicNetwork";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * 2비트 D 플립플롭 카운터 generator.
 *
 *  4개 상태(00, 01, 10, 11) 사이의 임의 순열을 next-state로 가지는 카운터를 생성하고,
 *  각 D 입력(D1, D0)을 K-map으로 최소화하여 구현 회로 도출.
 *
 *  Archetype:
 *   - "two_bit_d_ff_cyclic": 4-state 순열 (full cycle) — 가장 전형적인 임용 패턴
 *
 *  접근:
 *   1) 랜덤 순열 perm[0..3] = nextState 매핑.
 *   2) 각 출력 bit i에 대해 minterm 집합 = {s : (perm[s] >> i) & 1 == 1}.
 *   3) minimizeSop(Q1, Q0 변수) → D_i SOP.
 *   4) K-map (2 변수) per D_i.
 *   5) buildLogicNetworkMulti로 통합 구현 회로 (입력 Q1, Q0 → 출력 D1, D0).
 */

export type FlipflopArchetype = "two_bit_d_ff_cyclic";

export type FlipflopCounterGeneration = {
  /** 4-state next-state 매핑: nextState[currentState] = nextState */
  nextState: number[];
  /** 각 D 입력 SOP */
  d1Sop: SopTerm[];
  d0Sop: SopTerm[];
  /** 표현 문자열 */
  d1Expression: string;
  d0Expression: string;
  /** K-map per output */
  d1Kmap: KmapDiagram;
  d0Kmap: KmapDiagram;
  /** 통합 구현 회로 */
  logicNetworkDiagram: LogicNetworkDiagram;
  /** 4-state 순서 표현 (예: "00 → 01 → 11 → 10 → 00") */
  sequenceText: string;
  archetype: FlipflopArchetype;
  values: Record<string, number>;
};

const VAR_NAMES = ["Q1", "Q0"];

function bitsLabel(s: number): string {
  return s.toString(2).padStart(2, "0");
}

/** Fisher-Yates 셔플 4 states */
function pickPermutation(rand: () => number): number[] {
  const a = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** full-cycle 순열인지 (모든 원소가 한 사이클 안에 들어가는지) 검사 */
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
  const archetype: FlipflopArchetype = args.archetype ?? "two_bit_d_ff_cyclic";

  // full-cycle 순열 뽑힐 때까지 재시도 (random이라 보통 빨리 나옴)
  let perm: number[] = [];
  for (let tries = 0; tries < 30; tries++) {
    perm = pickPermutation(rand);
    // 임의 순열을 next-state로 쓰되, identity 회피 (i→i 매핑 너무 많으면 trivial)
    if (perm[0] !== 0 || perm[1] !== 1 || perm[2] !== 2 || perm[3] !== 3) {
      if (isFullCycle(perm)) break;
      // full-cycle 아니면 다시 시도 (단 마지막 try면 그냥 사용)
      if (tries === 29) break;
    }
  }

  // 각 출력 bit i에 대한 minterm 집합 추출
  const d1Minterms: number[] = [];
  const d0Minterms: number[] = [];
  for (let s = 0; s < 4; s++) {
    if ((perm[s] >> 1) & 1) d1Minterms.push(s);
    if (perm[s] & 1) d0Minterms.push(s);
  }

  const baseFn = (minterms: number[]): BooleanFunction => ({
    vars: 2, varNames: VAR_NAMES, minterms: minterms.slice().sort((a, b) => a - b), dontCares: [],
  });

  const d1Sop = minimizeSop(baseFn(d1Minterms));
  const d0Sop = minimizeSop(baseFn(d0Minterms));

  const d1Expression = sopToString(d1Sop, VAR_NAMES);
  const d0Expression = sopToString(d0Sop, VAR_NAMES);

  // K-map per output — 2변수
  const buildKmap2var = (minterms: number[]): KmapDiagram => {
    const fn = baseFn(minterms);
    const km = buildKmap2(fn);   // 2변수는 buildKmap에 없으므로 직접 빌드
    return {
      title: km.title,
      variables: VAR_NAMES,
      rowVars: km.rowVars,
      colVars: km.colVars,
      rowOrder: km.rowOrder,
      colOrder: km.colOrder,
      rows: km.rows,
    };
  };

  const d1Kmap = buildKmap2var(d1Minterms);
  const d0Kmap = buildKmap2var(d0Minterms);

  const logicNetworkDiagram = buildLogicNetworkMulti({
    sops: [
      { sop: d1Sop, outputName: "D1" },
      { sop: d0Sop, outputName: "D0" },
    ],
    varNames: VAR_NAMES,
  });

  const sequenceText = `${bitsLabel(0)} → ${bitsLabel(perm[0])} → ${bitsLabel(perm[perm[0]])} → ${bitsLabel(perm[perm[perm[0]]])} → ${bitsLabel(perm[perm[perm[perm[0]]]])}`;

  return {
    nextState: perm,
    d1Sop, d0Sop,
    d1Expression, d0Expression,
    d1Kmap, d0Kmap,
    logicNetworkDiagram,
    sequenceText,
    archetype,
    values: { d1Terms: d1Sop.length, d0Terms: d0Sop.length },
  };
}

/** 2변수 K-map 직접 빌드 (vars=2일 때 buildKmap 미지원) */
function buildKmap2(f: BooleanFunction): {
  title: string;
  rowVars: string[];
  colVars: string[];
  rowOrder: string[];
  colOrder: string[];
  rows: Array<{ label: string; values: Array<0 | 1 | "X"> }>;
} {
  // 2변수 K-map: 2x2.
  //   rows: Q1 = 0, 1
  //   cols: Q0 = 0, 1
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
    title: `K-map (${f.varNames.join(",")})`,
    rowVars: [f.varNames[0]],
    colVars: [f.varNames[1]],
    rowOrder: ["0", "1"],
    colOrder: ["0", "1"],
    rows,
  };
}
