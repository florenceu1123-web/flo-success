import type {
  CircuitTypeParams,
  KmapDiagram,
  LogicBlank,
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
 * 다중 출력 조합 회로 generator — 3-입력 2-출력 (A, B, C → F, G).
 *
 *  Archetype: "three_in_two_out" — 가장 흔한 임용 패턴.
 *
 *  접근:
 *   1) F, G 각각 랜덤 minterm 셋
 *   2) 각각 minimizeSop → SOP
 *   3) 두 SOP를 buildLogicNetworkMulti로 통합 회로 (NOT 게이트 공유)
 *   4) 각 출력 K-map per output
 *
 *  kmap_sop와의 차이:
 *   - 출력 2개 (multi-output)
 *   - 시각자료: 2개 K-map + 1개 통합 회로
 *   - "조합 회로 설계" 문맥 (vs "K-map 최소화" 단일 출력)
 */

export type CombinationalArchetype = "three_in_two_out";

export type CombinationalGateGeneration = {
  func: BooleanFunction;       // F의 함수 정의 (참조)
  gFunc: BooleanFunction;      // G의 함수 정의 (참조)
  fSop: SopTerm[];
  gSop: SopTerm[];
  fExpression: string;
  gExpression: string;
  fKmap: KmapDiagram;
  gKmap: KmapDiagram;
  logicNetworkDiagram: LogicNetworkDiagram;
  archetype: CombinationalArchetype;
  values: Record<string, number>;
  /** 회로 내 학생-채움 빈칸 게이트의 정답 (symbol → gate type). 빈칸이 없으면 빈 배열. */
  blankAnswers: Array<{ symbol: string; answer: string }>;
};

const VAR_NAMES = ["A", "B", "C"];

export function generateCombinationalGate(args: {
  params?: CircuitTypeParams;
  archetype?: CombinationalArchetype;
  seed?: number;
}): CombinationalGateGeneration {
  const rand = makeRand(args.seed);
  const archetype: CombinationalArchetype = args.archetype ?? "three_in_two_out";
  const blankCount = args.params?.kmapBlankCount ?? 0;
  return buildThreeInTwoOut(rand, blankCount);
  void archetype;
}

function buildThreeInTwoOut(rand: () => number, blankCount: number): CombinationalGateGeneration {
  const N = 8;   // 3변수
  // F minterm: 3~5개, G minterm: 3~5개 (서로 무관)
  const fCount = 3 + Math.floor(rand() * 3);
  const gCount = 3 + Math.floor(rand() * 3);

  const pickMinterms = (count: number): number[] => {
    const pool = Array.from({ length: N }, (_, i) => i);
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rand() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result.sort((a, b) => a - b);
  };

  const fMinterms = pickMinterms(fCount);
  const gMinterms = pickMinterms(gCount);

  const fFunc: BooleanFunction = { vars: 3, varNames: VAR_NAMES, minterms: fMinterms, dontCares: [] };
  const gFunc: BooleanFunction = { vars: 3, varNames: VAR_NAMES, minterms: gMinterms, dontCares: [] };

  const fSop = minimizeSop(fFunc);
  const gSop = minimizeSop(gFunc);

  const fExpression = sopToString(fSop, VAR_NAMES);
  const gExpression = sopToString(gSop, VAR_NAMES);

  const fKmap = buildKmapDiagram(fFunc);
  const gKmap = buildKmapDiagram(gFunc);

  const logicNetworkDiagram = buildLogicNetworkMulti({
    sops: [
      { sop: fSop, outputName: "F" },
      { sop: gSop, outputName: "G" },
    ],
    varNames: VAR_NAMES,
  });

  const { blanks, blankAnswers } = blankCount > 0
    ? assignBlankGates(logicNetworkDiagram, blankCount)
    : { blanks: [] as LogicBlank[], blankAnswers: [] as Array<{ symbol: string; answer: string }> };
  if (blanks.length > 0) logicNetworkDiagram.blanks = blanks;

  return {
    func: fFunc, gFunc,
    fSop, gSop, fExpression, gExpression,
    fKmap, gKmap, logicNetworkDiagram,
    archetype: "three_in_two_out",
    values: { fTerms: fSop.length, gTerms: gSop.length, fMintermCount: fMinterms.length, gMintermCount: gMinterms.length },
    blankAnswers,
  };
}

/**
 * 회로의 첫 product-term 게이트를 출력별로 하나씩 빈칸 마킹 (ⓐ는 F쪽, ⓑ는 G쪽).
 * 답은 해당 게이트의 실제 type (대개 AND, 단일 literal product면 buffer로 인해 OR).
 *
 *  blankCount=1: F 첫 게이트만 ⓐ
 *  blankCount=2: F·G 각각 ⓐ·ⓑ (임용 표준)
 *  blankCount>2: 추가는 다음 product term으로 ⓒ ⓓ ...
 */
const BLANK_SYMBOLS = ["ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ", "ⓕ"];

function assignBlankGates(
  diagram: LogicNetworkDiagram,
  count: number,
): { blanks: LogicBlank[]; blankAnswers: Array<{ symbol: string; answer: string }> } {
  // 출력별 product-term 게이트 (NOT/buffer 제외) — F쪽 → G쪽 순서로 정렬.
  const productCandidates = diagram.gates.filter(
    (g) => g.id.startsWith("G_and_") || g.id.startsWith("G_or_") || g.id.startsWith("G_buf_"),
  );
  // F → G 순서 보장: id에 "_F_"가 있으면 F쪽, "_G_"가 있으면 G쪽.
  const fGates = productCandidates.filter((g) => g.id.includes("_F_") || g.id.endsWith("_F"));
  const gGates = productCandidates.filter((g) => g.id.includes("_G_") || g.id.endsWith("_G"));
  // F의 첫 product term, G의 첫 product term ... 순서로 pick.
  const ordered: typeof productCandidates = [];
  const fronts = [fGates, gGates];
  for (let i = 0; ordered.length < count && (fronts[0].length > 0 || fronts[1].length > 0); i++) {
    const target = fronts[i % 2];
    if (target.length > 0) {
      const next = target.shift()!;
      ordered.push(next);
    }
  }

  const blanks: LogicBlank[] = [];
  const blankAnswers: Array<{ symbol: string; answer: string }> = [];
  for (let i = 0; i < ordered.length && i < count; i++) {
    const gate = ordered[i];
    const symbol = BLANK_SYMBOLS[i] ?? `(${i + 1})`;
    blanks.push({ symbol, gateIds: [gate.id], answer: gate.type });
    blankAnswers.push({ symbol, answer: gate.type });
  }
  return { blanks, blankAnswers };
}

function buildKmapDiagram(f: BooleanFunction): KmapDiagram {
  const km = buildKmap(f);
  return {
    title: `K-map (${f.varNames.join(",")})`,
    variables: f.varNames,
    rowVars: km.rowVars,
    colVars: km.colVars,
    rowOrder: km.rowOrder,
    colOrder: km.colOrder,
    rows: km.cells.map((cells, ri) => ({ label: km.rowOrder[ri], values: cells })),
  };
}
