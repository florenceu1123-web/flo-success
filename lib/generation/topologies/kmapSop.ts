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
/** 임용 5번 정보과 형식 — 진리표가 W,X,Y,Z 변수로 주어짐. */
const VAR_NAMES_WXYZ = ["W", "X", "Y", "Z"];

/**
 * truthTableBlank 모드(임용 5번) 함수 풀.
 *
 * 각 entry는 ㉠ 빈칸 위치(최종 결합 게이트)의 정답 type이 다양해지도록 미리 검증.
 *  - OR  : 일반 SOP 결합 (NOT/AND 다단 + OR 통합)
 *  - XOR : applyXorReductions의 k=2/3 XOR collapse 대상 패턴
 *          (k=2: 2 minterm × 2 literal, odd parity / k=3: 4 minterm × 3 literal, odd parity)
 *  - XNOR: even parity 버전
 *  - AND : partial factor 후 외곽 결합 게이트가 AND로 떨어지는 패턴
 *          (예: F = Y·(W ⊕ X) → AND(Y, XOR(W,X)) — 최종 결합 = AND)
 *
 * 솔버(minimizeSop + applyXorReductions)가 결정론적으로 결과를 만들기 때문에
 * 각 entry에 expected.gateType만 적어두면 학생 정답이 그대로 일관됨.
 */
type TruthTableBlankEntry = {
  /** F = 1 minterm 인덱스 */
  minterms: number[];
  /** don't care 인덱스 (선택) */
  dontCares?: number[];
  /** 짧은 라벨 — 로깅·디버그용 */
  label: string;
};

const TRUTH_TABLE_BLANK_POOL: TruthTableBlankEntry[] = [
  // ── XOR 군 ─────────────────────────────────────
  // F = W ⊕ X (Y, Z 무관) — 4 minterm cluster × 2, k=2 XOR collapse → ㉠ = XOR
  { minterms: [4, 5, 6, 7, 8, 9, 10, 11], dontCares: [], label: "W xor X" },
  // F = Y · (W ⊕ X) — partial XOR factor → ㉠ = AND (외곽), 내부에 XOR
  { minterms: [6, 7, 10, 11], dontCares: [], label: "Y · (W xor X)" },
  // F = W ⊕ X ⊕ Y ⊕ Z — 4-var XOR (odd parity, 8 minterm)
  { minterms: [1, 2, 4, 7, 8, 11, 13, 14], dontCares: [], label: "4-var xor" },

  // ── XNOR 군 ────────────────────────────────────
  // F = W XNOR X (Y, Z 무관) — even parity cluster → ㉠ = XNOR
  { minterms: [0, 1, 2, 3, 12, 13, 14, 15], dontCares: [], label: "W xnor X" },

  // ── OR 군 (일반 SOP) ───────────────────────────
  // F = WXY + Z' — 다양한 don't care 포함, ㉠ = OR
  { minterms: [0, 2, 4, 6, 8, 10, 12, 14, 15], dontCares: [1, 5, 9], label: "WXY + Z'" },
  // F = WX + Y'Z' — ㉠ = OR
  { minterms: [0, 4, 12, 13, 14, 15], dontCares: [1, 8], label: "WX + Y'Z'" },

  // ── AND 군 (단일 term — buffer로 그려지지만 외곽 게이트로 보면 AND) ──
  // F = W · X · Y' — single AND term, ㉠ = AND
  { minterms: [12, 13], dontCares: [4, 5], label: "WXY'" },
];

export function generateKmapSop(args: {
  params?: CircuitTypeParams;
  archetype?: KmapSopArchetype;
  seed?: number;
}): KmapSopGeneration {
  const rand = makeRand(args.seed);
  // truthTableBlank 모드 (임용 5번) — 4-변수 W,X,Y,Z 강제 + don't care 3개 포함.
  const truthTableBlank = Boolean(args.params?.truthTableBlank);
  const archetype: KmapSopArchetype = truthTableBlank
    ? "kmap_4var"
    : (args.archetype ?? pick<KmapSopArchetype>(["kmap_3var", "kmap_4var"], rand));

  const vars = archetype === "kmap_3var" ? 3 : 4;
  const varNames = truthTableBlank
    ? VAR_NAMES_WXYZ
    : (archetype === "kmap_3var" ? VAR_NAMES_3 : VAR_NAMES_4);
  const N = 1 << vars;

  let minterms: number[];
  let dontCares: number[] = [];

  if (truthTableBlank) {
    // 임용 5번 — ㉠ 정답이 OR/AND/XOR/XNOR 다양해지도록 미리 검증된 풀에서 random pick.
    const entry = pick(TRUTH_TABLE_BLANK_POOL, rand);
    minterms = [...entry.minterms].sort((a, b) => a - b);
    dontCares = [...(entry.dontCares ?? [])].sort((a, b) => a - b);
  } else {
    // 일반 kmap_sop — 너무 적거나(0~1) 너무 많아(거의 다)도 trivial.
    // 3변수: 3~5 minterm, 4변수: 5~9 minterm 권장.
    const minMinterms = vars === 3 ? 3 : 5;
    const maxMinterms = vars === 3 ? 5 : 9;
    const count = minMinterms + Math.floor(rand() * (maxMinterms - minMinterms + 1));

    // 랜덤 minterm 인덱스 셋
    const available = Array.from({ length: N }, (_, i) => i);
    minterms = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rand() * available.length);
      minterms.push(available.splice(idx, 1)[0]);
    }
    minterms.sort((a, b) => a - b);
  }

  const func: BooleanFunction = {
    vars,
    varNames,
    minterms,
    dontCares,
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

  // truthTableBlank 모드 — 마지막 결합 게이트(주로 OR)를 ㉠ 빈칸으로 마킹.
  // 임용 5번 형식: 학생이 [단계 2]에서 "㉠에 들어갈 1개의 논리게이트"를 도출.
  if (truthTableBlank && logicNetworkDiagram.gates.length > 0) {
    const gates = logicNetworkDiagram.gates;
    const lastGate = gates[gates.length - 1];
    logicNetworkDiagram.blanks = [{
      symbol: "㉠",
      gateIds: [lastGate.id],
      answer: lastGate.type,
    }];

    // [단계 3] 점선 박스 — ㉠로 들어가는 직전 게이트 중 "1개"를 점선으로 감싸 표시.
    //   textWriter [단계 3]이 "점선 부분 = 1개 논리게이트"이므로 단일 게이트를 감싼다.
    //   학생은 점선 부분 게이트 종류를 K-map 도출 결과로부터 도출.
    //   우선순위: ㉠ 직전 게이트 중 2-입력 결합 게이트(AND/OR/XOR/XNOR/NAND/NOR) → 그 외 직전 게이트.
    //   직전 게이트가 없으면(㉠가 입력 직결) 생략(이 경우 [단계 3] 없음).
    const COMBINING = new Set(["AND", "OR", "XOR", "XNOR", "NAND", "NOR"]);
    const preds = gates.filter((g) => g.id !== lastGate.id && lastGate.inputs.includes(g.output));
    const boxGate = preds.find((g) => COMBINING.has(g.type)) ?? preds[0];
    if (boxGate) {
      logicNetworkDiagram.dashedRegions = [{ gateIds: [boxGate.id] }];
    }
  }

  return {
    func, sop, sopExpression,
    kmapDiagram, truthTableDiagram, logicNetworkDiagram,
    archetype,
    values: { vars, mintermCount: minterms.length, sopTerms: sop.length },
  };
}
