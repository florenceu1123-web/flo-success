import type {
  CircuitTypeParams,
  KmapDiagram,
  LogicNetworkDiagram,
  TruthTableDiagram,
} from "@/types";
import {
  buildKmap,
  sopToString,
  truthTable,
  type BooleanFunction,
  type SopTerm,
} from "@/lib/digital/booleanFunction";
import { buildLogicNetwork } from "@/lib/digital/buildLogicNetwork";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * K-map SOP 문제 generator.
 *  - 3변수 또는 4변수 Boolean 함수를 랜덤 minterm 셋으로 생성.
 *  - Quine-McCluskey로 최소 SOP 도출.
 *  - figureVariants: kmap + truth_table + implementation_circuit (logic_network).
 *  - 정답: 최소 SOP 식 + 게이트 카운트 (개수).
 */

export type KmapSopArchetype = "kmap_3var" | "kmap_4var";

export type KmapSopGeneration = {
  func: BooleanFunction;
  sop: SopTerm[];
  /** 최소 SOP 식 (문자열) */
  sopExpression: string;
  /** 도식들 */
  kmapDiagram: KmapDiagram;
  truthTableDiagram: TruthTableDiagram;
  logicNetworkDiagram: LogicNetworkDiagram;
  archetype: KmapSopArchetype;
  values: Record<string, number>;
};

const VAR_NAMES_3 = ["A", "B", "C"];
const VAR_NAMES_4 = ["A", "B", "C", "D"];

export function generateKmapSop(args: {
  params?: CircuitTypeParams;
  archetype?: KmapSopArchetype;
  seed?: number;
}): KmapSopGeneration {
  const rand = makeRand(args.seed);
  const archetype: KmapSopArchetype = args.archetype
    ?? pick<KmapSopArchetype>(["kmap_3var", "kmap_4var"], rand);

  const vars = archetype === "kmap_3var" ? 3 : 4;
  const varNames = archetype === "kmap_3var" ? VAR_NAMES_3 : VAR_NAMES_4;
  const N = 1 << vars;

  // minterm 셋 랜덤 선택 — 너무 적거나(0~1) 너무 많아(거의 다)도 trivial.
  // 3변수: 3~5 minterm, 4변수: 5~9 minterm 권장.
  const minMinterms = vars === 3 ? 3 : 5;
  const maxMinterms = vars === 3 ? 5 : 9;
  const count = minMinterms + Math.floor(rand() * (maxMinterms - minMinterms + 1));

  // 랜덤 minterm 인덱스 셋
  const available = Array.from({ length: N }, (_, i) => i);
  const minterms: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rand() * available.length);
    minterms.push(available.splice(idx, 1)[0]);
  }
  minterms.sort((a, b) => a - b);

  const func: BooleanFunction = {
    vars,
    varNames,
    minterms,
    dontCares: [],
  };

  const sop = minimizeSop(func);
  const sopExpression = sopToString(sop, varNames);

  // K-map diagram
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

  // Truth table diagram
  const truth = truthTable(func);
  const truthTableDiagram: TruthTableDiagram = {
    variables: varNames,
    rows: truth.map((r) => ({
      inputs: r.inputs,
      output: r.output,
    })),
  };

  // Logic network (implementation circuit)
  const logicNetworkDiagram = buildLogicNetwork({
    sop,
    varNames,
    outputName: "F",
  });

  return {
    func, sop, sopExpression,
    kmapDiagram, truthTableDiagram, logicNetworkDiagram,
    archetype,
    values: { vars, mintermCount: minterms.length, sopTerms: sop.length },
  };
}
