import type {
  CircuitTypeParams,
  KmapDiagram,
  LogicNetworkDiagram,
  TruthTableDiagram,
} from "@/types";
import {
  buildKmap,
  posToString,
  truthTable,
  type BooleanFunction,
  type SopTerm,
} from "@/lib/digital/booleanFunction";
import { buildLogicNetworkPos } from "@/lib/digital/buildLogicNetwork";
import { minimizePos } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * K-map POS 문제 generator.
 *  - kmap_sop과 거의 동일하지만 최소 POS 형태로 답 도출.
 *  - F=0인 cell을 그룹화 → F' SOP → De Morgan → F POS.
 *  - 회로 구현은 OR-AND 구조 (kmap_sop의 AND-OR dual).
 */

export type KmapPosArchetype = "kmap_3var_pos" | "kmap_4var_pos";

export type KmapPosGeneration = {
  func: BooleanFunction;
  pos: SopTerm[];
  posExpression: string;
  kmapDiagram: KmapDiagram;
  truthTableDiagram: TruthTableDiagram;
  logicNetworkDiagram: LogicNetworkDiagram;
  archetype: KmapPosArchetype;
  values: Record<string, number>;
};

const VAR_NAMES_3 = ["A", "B", "C"];
const VAR_NAMES_4 = ["A", "B", "C", "D"];

export function generateKmapPos(args: {
  params?: CircuitTypeParams;
  archetype?: KmapPosArchetype;
  seed?: number;
}): KmapPosGeneration {
  const rand = makeRand(args.seed);
  const archetype: KmapPosArchetype = args.archetype
    ?? pick<KmapPosArchetype>(["kmap_3var_pos", "kmap_4var_pos"], rand);

  const vars = archetype === "kmap_3var_pos" ? 3 : 4;
  const varNames = archetype === "kmap_3var_pos" ? VAR_NAMES_3 : VAR_NAMES_4;
  const N = 1 << vars;

  // POS에서는 0-cell이 그룹화 대상. 너무 적거나(F≈1) 너무 많으면(F≈0) trivial.
  // 3변수: 3~5 zero-cell, 4변수: 6~10 zero-cell 권장.
  const minZeros = vars === 3 ? 3 : 6;
  const maxZeros = vars === 3 ? 5 : 10;
  const zeroCount = minZeros + Math.floor(rand() * (maxZeros - minZeros + 1));

  // 0-cell 인덱스 선택 → 나머지가 minterm
  const available = Array.from({ length: N }, (_, i) => i);
  const zeros: number[] = [];
  for (let i = 0; i < zeroCount; i++) {
    const idx = Math.floor(rand() * available.length);
    zeros.push(available.splice(idx, 1)[0]);
  }
  const minterms = available.slice().sort((a, b) => a - b);

  const func: BooleanFunction = { vars, varNames, minterms, dontCares: [] };
  const pos = minimizePos(func);
  const posExpression = posToString(pos, varNames);

  const kmap = buildKmap(func);
  const kmapDiagram: KmapDiagram = {
    title: `F(${varNames.join(",")})`,
    variables: varNames,
    rowVars: kmap.rowVars,
    colVars: kmap.colVars,
    rowOrder: kmap.rowOrder,
    colOrder: kmap.colOrder,
    rows: kmap.cells.map((cells, ri) => ({
      label: kmap.rowOrder[ri],
      values: cells,
    })),
  };

  const truth = truthTable(func);
  const truthTableDiagram: TruthTableDiagram = {
    variables: varNames,
    rows: truth.map((r) => ({ inputs: r.inputs, output: r.output })),
  };

  const logicNetworkDiagram = buildLogicNetworkPos({
    pos, varNames, outputName: "F",
  });

  return {
    func, pos, posExpression,
    kmapDiagram, truthTableDiagram, logicNetworkDiagram,
    archetype,
    values: { vars, zeroCount: zeros.length, posTerms: pos.length },
  };
}
