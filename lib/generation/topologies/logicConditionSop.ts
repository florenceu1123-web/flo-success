import type { TruthTableDiagram } from "@/types";
import { makeRand } from "./_helpers";
import { minimizeSop } from "@/lib/digital/minimize";
import { sopToString, type BooleanFunction } from "@/lib/digital/booleanFunction";

/**
 * 동작 조건(말) → 최소 SOP 간소화 (임용 25번 디지털논리 형식) — 전용 archetype.
 *
 *  원본: 그림 없이 "동작 조건"만 말로 주고, 3변수(A,B,C) 조합논리 출력 F를 가장 간소화한
 *        논리식(SOP)으로 표현. (예: A=1→F=1; A=0일 때 B≠C면 1·같으면 0 → F = A + BC̄ + B̄C.)
 *  ★ generic combinational_gate 경로는 "K-map 주어짐 + 2출력 + 구현회로"로 변질 → 전용 archetype.
 *
 *  구조: 지배 변수 X + 나머지 두 변수(Y,Z)의 관계 R.
 *   exam_similar = 1-지배 (X=1→F=1, X=0→R) → F = X + R.
 *   exam_variant = 0-지배 (X=0→F=0, X=1→R) → F = X·R (곱항).
 *
 *  풀이 3단계: [1] 조건 → 진리표(minterms), [2] 카르노맵 간소화, [3] 최소 SOP F.
 *  그림 없음(원본과 동일) — 진리표는 풀이용 solutionFigure.
 */

const VARNAMES = ["A", "B", "C"];

type RelKey = "and" | "or" | "xor" | "xnor" | "nand" | "nor" | "y" | "z";
const REL_FN: Record<RelKey, (y: number, z: number) => number> = {
  and: (y, z) => y & z,
  or: (y, z) => y | z,
  xor: (y, z) => y ^ z,
  xnor: (y, z) => 1 - (y ^ z),
  nand: (y, z) => 1 - (y & z),
  nor: (y, z) => 1 - (y | z),
  y: (y) => y,
  z: (_y, z) => z,
};
const RELS: RelKey[] = ["and", "or", "xor", "xnor", "nand", "nor", "y", "z"];

type Mode = "exam_similar" | "exam_variant";
type Tuple = { d: number; rel: RelKey };

const bitOf = (i: number, k: number): number => (i >> (2 - k)) & 1;

/** X=지배 변수(index d), Y·Z=나머지 두 변수(순서 유지). mode에 따라 1-지배/0-지배. */
function computeF(d: number, rel: RelKey, mode: Mode, i: number): number {
  const others = [0, 1, 2].filter((k) => k !== d);
  const x = bitOf(i, d);
  const y = bitOf(i, others[0]);
  const z = bitOf(i, others[1]);
  const r = REL_FN[rel](y, z);
  return mode === "exam_similar" ? (x ? 1 : r) : (x ? r : 0);
}

function mintermsOf(d: number, rel: RelKey, mode: Mode): number[] {
  const m: number[] = [];
  for (let i = 0; i < 8; i++) if (computeF(d, rel, mode, i)) m.push(i);
  return m;
}

/** 최소 SOP → overbar 표기 문자열. sopToString의 X'를 X̄로 변환. */
function toOverbar(s: string): string {
  return s.replace(/([A-Z])'/g, (_m, v: string) => `${v}̅`);
}

function sopOf(minterms: number[]): { text: string; count: number } {
  const bf: BooleanFunction = { vars: 3, varNames: VARNAMES, minterms, dontCares: [] };
  const sop = minimizeSop(bf);
  return { text: toOverbar(sopToString(sop, VARNAMES)), count: sop.length };
}

/** 규칙 열거 + 필터로 유효 구성 수집. 원본(similar·A지배·xor) 제외. SOP 2~4항. */
function buildSpace(mode: Mode): Tuple[] {
  const out: Tuple[] = [];
  for (let d = 0; d < 3; d++)
    for (const rel of RELS) {
      const m = mintermsOf(d, rel, mode);
      if (m.length === 0 || m.length === 8) continue; // 항등 제외
      const { count } = sopOf(m);
      if (count < 2 || count > 4) continue; // 너무 단순/복잡 제외
      if (mode === "exam_similar" && d === 0 && rel === "xor") continue; // 원본 제외
      out.push({ d, rel });
    }
  return out;
}

const SIM_SPACE = buildSpace("exam_similar");
const VAR_SPACE = buildSpace("exam_variant");

/** 관계 R를 F=1/0 조건 문장으로 서술 (지배 변수 문장 뒤에 붙는 절). */
function relClause(rel: RelKey, yN: string, zN: string): string {
  switch (rel) {
    case "and": return `입력 ${yN}와 입력 ${zN}가 모두 '1'이면 출력 F는 '1'이고, 그렇지 않으면 '0'이다.`;
    case "or": return `입력 ${yN}와 입력 ${zN} 중 적어도 하나가 '1'이면 출력 F는 '1'이고, 모두 '0'이면 '0'이다.`;
    case "xor": return `입력 ${yN}와 입력 ${zN}가 서로 다르면 출력 F는 '1'이고, 서로 같으면 '0'이다.`;
    case "xnor": return `입력 ${yN}와 입력 ${zN}가 서로 같으면 출력 F는 '1'이고, 서로 다르면 '0'이다.`;
    case "nand": return `입력 ${yN}와 입력 ${zN}가 모두 '1'인 경우에만 출력 F는 '0'이고, 그 외에는 '1'이다.`;
    case "nor": return `입력 ${yN}와 입력 ${zN}가 모두 '0'이면 출력 F는 '1'이고, 그 외에는 '0'이다.`;
    case "y": return `입력 ${yN}가 '1'이면 출력 F는 '1'이고, '0'이면 '0'이다 (입력 ${zN}는 무관).`;
    case "z": return `입력 ${zN}가 '1'이면 출력 F는 '1'이고, '0'이면 '0'이다 (입력 ${yN}는 무관).`;
  }
}

export type LogicConditionSopGeneration = {
  mode: Mode;
  conditions: string[];
  minterms: number[];
  sopText: string;
  termCount: number;
  truthTable: TruthTableDiagram;
  values: { dominant: string; rel: RelKey; others: [string, string] };
};

function solve(t: Tuple, mode: Mode): LogicConditionSopGeneration {
  const others = [0, 1, 2].filter((k) => k !== t.d);
  const xN = VARNAMES[t.d], yN = VARNAMES[others[0]], zN = VARNAMES[others[1]];
  const minterms = mintermsOf(t.d, t.rel, mode);
  const { text, count } = sopOf(minterms);

  const cond1 = mode === "exam_similar"
    ? `입력 ${xN}가 '1'이면, 입력 ${yN}와 입력 ${zN}에 무관하게 출력 F는 '1'이다.`
    : `입력 ${xN}가 '0'이면, 입력 ${yN}와 입력 ${zN}에 무관하게 출력 F는 '0'이다.`;
  const cond2 = mode === "exam_similar"
    ? `입력 ${xN}가 '0'일 때, ${relClause(t.rel, yN, zN)}`
    : `입력 ${xN}가 '1'일 때, ${relClause(t.rel, yN, zN)}`;

  const rows = [];
  for (let i = 0; i < 8; i++) {
    rows.push({ inputs: [bitOf(i, 0), bitOf(i, 1), bitOf(i, 2)], output: computeF(t.d, t.rel, mode, i) });
  }
  const truthTable: TruthTableDiagram = { variables: VARNAMES, rows, outputLabel: "F" };

  return {
    mode,
    conditions: [cond1, cond2],
    minterms,
    sopText: text,
    termCount: count,
    truthTable,
    values: { dominant: xN, rel: t.rel, others: [yN, zN] },
  };
}

export function generateLogicConditionSop(args: {
  seed?: number;
  mode: Mode;
  index?: number;
}): LogicConditionSopGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const space = args.mode === "exam_variant" ? VAR_SPACE : SIM_SPACE;
  const idx = (Math.floor(rand() * space.length) + (args.index ?? 0)) % space.length;
  return solve(space[idx], args.mode);
}
