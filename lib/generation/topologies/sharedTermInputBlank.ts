import type { KmapDiagram, KmapValue, LogicGate, LogicNetworkDiagram } from "@/types";
import {
  buildKmap,
  sopToString,
  sopTermToString,
  type BooleanFunction,
  type SopTerm,
} from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * 공유항·입력결정 문제 generator (universal_digital의 sharedTermInputBlank 모드).
 *
 *  원본 형식 (임용 7번 정보과 등):
 *   - (가) M개의 불 함수가 Σm(...)으로 주어짐 (예: F(X,Y,Z)=Σm(2,4,5), G(X,Y,Z)=Σm(2,6,7))
 *   - (나) 빈 K-map (학생이 채움)
 *   - (다) 조합논리회로 — 입력이 ㉠㉡㉢ 빈칸 (학생이 어느 입력변수인지 결정)
 *   - 풀이: [단계 1] 각 함수 K-map → [단계 2] 중복(공유)되는 논리식 항 → [단계 3] ㉠㉡㉢ 입력변수 결정
 *
 *  생성 원리 (예시 복사 금지 — 규칙 적용, multi-output minimization):
 *   1) 공유 subcube(중복 항) 1개 + 함수별 개별 subcube를 랜덤 샘플
 *   2) 각 함수 minterm 셋 = 공유 ∪ 개별 (함수 간 교집합 = 정확히 공유 셀)
 *   3) 구현 SOP = 공유항 + own cover (개별 셀을 cover하되 공유 셀은 don't-care로 최소화)
 *      — 원본 임용 7번도 G=Σm(2,6,7)의 단독 최소화는 YZ'+XY지만, 회로는 공유항 X'YZ' 재사용
 *   4) 검증:
 *      - 공유 subcube가 단일 항으로 최소화되는지
 *      - 구현 SOP 항 수 ≤ 단독 최소화 항 수 (공유 구현이 비효율적이면 reject)
 *      - 입력변수 할당의 유일성 (비항등 순열 불변이면 reject)
 *   5) 회로: 공유항 AND는 1개만 생성해 모든 함수 OR에 연결 (shared 마킹),
 *      입력 신호는 ㉠㉡㉢ 마커로 rename (정답 = 마커↔변수 매핑)
 */

export type SharedTermInputBlankGeneration = {
  /** 함수 정의 (정답 변수명 기준) */
  funcs: BooleanFunction[];
  /** 함수 이름 (F, G, ...) */
  funcNames: string[];
  /** 입력 변수 이름 (X, Y, Z, ...) */
  varNames: string[];
  /** 각 함수 구현 SOP (공유항 + own cover) — 회로와 일치 */
  sops: SopTerm[][];
  /** 각 함수 구현 SOP 식 문자열 */
  sopExpressions: string[];
  /** 각 함수 단독 최소화 SOP 식 (참고 — 공유항 구현과 다를 수 있음) */
  soloExpressions: string[];
  /** 각 함수 Σm 표기 (예: "Σm(2, 4, 5)") */
  mintermExpressions: string[];
  /** 공유(중복) 항 패턴들 */
  sharedPatterns: string[];
  /** 공유 항 식 문자열 (예: "X'YZ'") */
  sharedExpression: string;
  /** 마커 ↔ 변수 정답 매핑 (회로 입력 순서대로) */
  markerAssignment: Array<{ marker: string; variable: string }>;
  /** (나) 빈 K-map (학생이 채움) */
  blankKmapDiagram: KmapDiagram;
  /** 풀이용 — 함수별 채워진 K-map */
  solutionKmaps: KmapDiagram[];
  /** (다) 공유항 회로 — 입력 ㉠㉡㉢ 빈칸 */
  logicNetworkDiagram: LogicNetworkDiagram;
  /** 입력 할당이 유일하게 결정되는지 (false면 로깅용 경고) */
  uniqueAssignment: boolean;
};

const DEFAULT_VAR_NAMES = ["X", "Y", "Z"];
const DEFAULT_FUNC_NAMES = ["F", "G"];
const INPUT_MARKERS = ["㉠", "㉡", "㉢", "㉣", "㉤"];

const MAX_STRICT_ATTEMPTS = 300;
const MAX_RELAXED_ATTEMPTS = 100;

export function generateSharedTermInputBlank(args: {
  seed?: number;
  /** 원본 입력 변수명 앵커 (기본 X, Y, Z) — 3 또는 4변수 */
  varNames?: string[];
  /** 원본 함수명 앵커 (기본 F, G) — 2~3개 */
  funcNames?: string[];
  /** 원본 함수 minterm 셋 — 공유/개별 구조(크기) 앵커링에 사용. 값 자체는 복사하지 않음 */
  originalMinterms?: number[][];
  mode?: "exam_similar" | "exam_variant";
}): SharedTermInputBlankGeneration {
  const rand = makeRand(args.seed);
  const varNames =
    args.varNames && args.varNames.length >= 3 && args.varNames.length <= 4
      ? args.varNames
      : DEFAULT_VAR_NAMES;
  const vars = varNames.length;
  const funcNames =
    args.funcNames && args.funcNames.length >= 2
      ? args.funcNames.slice(0, 3)
      : DEFAULT_FUNC_NAMES;
  const M = funcNames.length;
  const variant = args.mode === "exam_variant";

  // 원본 구조 앵커 — 공유 셀 수·개별 셀 수. 파싱 실패 시 임용 표준 구조(공유 1셀 + 개별 2셀).
  const structure =
    deriveStructureFromOriginal(args.originalMinterms ?? [], vars, M) ??
    { sharedSize: 1, ownSizes: Array.from({ length: M }, () => 2) };

  // exam_variant — 구조(소자 종류 1~2개)도 변형 가능: 공유항 크기 또는 개별항 크기를 바꿈.
  const targetStructure = variant ? perturbStructure(structure, rand, vars) : structure;

  // 1차: 모든 검증 (공유항 + 유일성) 통과 샘플
  for (let attempt = 0; attempt < MAX_STRICT_ATTEMPTS; attempt++) {
    const result = sampleAndVerify(rand, vars, varNames, funcNames, targetStructure, true);
    if (result) return finalize(result, rand, varNames, funcNames, true);
  }
  // 2차 (완화): 유일성 검사 제외 — 공유항 구조는 유지 (극히 드문 케이스 안전망)
  for (let attempt = 0; attempt < MAX_RELAXED_ATTEMPTS; attempt++) {
    const result = sampleAndVerify(rand, vars, varNames, funcNames, targetStructure, false);
    if (result) return finalize(result, rand, varNames, funcNames, false);
  }
  // 3차: 구조를 임용 표준(공유 1셀 + 개별 2셀)으로 강제 후 재시도
  const fallbackStructure = { sharedSize: 1, ownSizes: Array.from({ length: M }, () => 2) };
  for (let attempt = 0; attempt < MAX_STRICT_ATTEMPTS; attempt++) {
    const result = sampleAndVerify(rand, vars, varNames, funcNames, fallbackStructure, true);
    if (result) return finalize(result, rand, varNames, funcNames, true);
  }
  throw new Error("sharedTermInputBlank: 공유항 함수 샘플링 실패 (모든 시도 소진)");
}

// ── 구조 앵커 ──────────────────────────────────────────────────────────

type SharedStructure = { sharedSize: number; ownSizes: number[] };

/**
 * 원본 minterm 셋에서 공유/개별 구조(셀 수)를 도출.
 * 예: F=Σm(2,4,5), G=Σm(2,6,7) → 공유 {2} (1셀), 개별 {4,5}·{6,7} (각 2셀).
 */
function deriveStructureFromOriginal(
  originalMinterms: number[][],
  vars: number,
  M: number,
): SharedStructure | null {
  if (originalMinterms.length < 2) return null;
  const N = 1 << vars;
  const sets = originalMinterms.slice(0, M).map((ms) => new Set(ms.filter((m) => m >= 0 && m < N)));
  if (sets.some((s) => s.size === 0)) return null;
  const shared = [...sets[0]].filter((m) => sets.every((s) => s.has(m)));
  if (shared.length === 0) return null;
  const ownSizes = sets.map((s) => s.size - shared.length);
  if (ownSizes.some((o) => o <= 0)) return null;
  // K-map 그룹 크기(1·2·4)로 clamp
  const clamp = (n: number): number => (n >= 4 ? 4 : n >= 2 ? 2 : 1);
  return { sharedSize: clamp(shared.length), ownSizes: ownSizes.map(clamp) };
}

/** exam_variant — 공유항 또는 개별항 크기를 1~2개 변형 (구조·원리는 유지). */
function perturbStructure(s: SharedStructure, rand: () => number, vars: number): SharedStructure {
  const sizes = vars === 3 ? [1, 2] : [1, 2, 4];
  const next = { sharedSize: s.sharedSize, ownSizes: [...s.ownSizes] };
  if (rand() < 0.5) {
    next.sharedSize = pick(sizes.filter((z) => z !== s.sharedSize), rand) ?? s.sharedSize;
  } else {
    const idx = Math.floor(rand() * next.ownSizes.length);
    next.ownSizes[idx] = pick(sizes.filter((z) => z !== next.ownSizes[idx]), rand) ?? next.ownSizes[idx];
  }
  return next;
}

// ── 샘플링 + 검증 ──────────────────────────────────────────────────────

type SampleResult = {
  funcs: BooleanFunction[];
  /** 구현 SOP — [공유항, ...own cover] 순서 */
  implSops: SopTerm[][];
  /** 단독 최소화 SOP (참고용) */
  soloSops: SopTerm[][];
  /** 공유(중복) 항 — 단일 subcube */
  sharedTerm: SopTerm;
};

/**
 * K-map subcube(그룹) 열거 — cellCount = 1(단일 셀), 2(인접쌍), 4(쿼드).
 * subcube = 자유 비트 k개 + 고정 비트, 셀 수 = 2^k.
 */
function enumerateSubcubes(vars: number, cellCount: number): number[][] {
  const freeBitCount = Math.log2(cellCount);
  if (!Number.isInteger(freeBitCount)) return [];
  const bitPositions = Array.from({ length: vars }, (_, i) => i);
  const groups: number[][] = [];
  for (const freeBits of combinations(bitPositions, freeBitCount)) {
    const fixedBits = bitPositions.filter((i) => !freeBits.includes(i));
    for (let fv = 0; fv < 1 << fixedBits.length; fv++) {
      const cells: number[] = [];
      for (let fr = 0; fr < 1 << freeBitCount; fr++) {
        let m = 0;
        fixedBits.forEach((bitPos, k) => {
          m |= ((fv >> k) & 1) << bitPos;
        });
        freeBits.forEach((bitPos, k) => {
          m |= ((fr >> k) & 1) << bitPos;
        });
        cells.push(m);
      }
      groups.push(cells.sort((a, b) => a - b));
    }
  }
  return groups;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...rest] = arr;
  const withHead = combinations(rest, k - 1).map((c) => [head, ...c]);
  const withoutHead = combinations(rest, k);
  return [...withHead, ...withoutHead];
}

/** 공유 subcube + 함수별 개별 subcube 샘플 → minimizeSop 검증. */
function sampleAndVerify(
  rand: () => number,
  vars: number,
  varNames: string[],
  funcNames: string[],
  structure: SharedStructure,
  requireUnique: boolean,
): SampleResult | null {
  const M = funcNames.length;

  // 공유 subcube
  const sharedCandidates = enumerateSubcubes(vars, structure.sharedSize);
  if (sharedCandidates.length === 0) return null;
  const sharedCells = pick(sharedCandidates, rand);
  const used = new Set(sharedCells);

  // 함수별 개별 subcube — 공유·다른 함수와 셀 비중첩
  const owns: number[][] = [];
  for (let f = 0; f < M; f++) {
    const candidates = enumerateSubcubes(vars, structure.ownSizes[f]).filter((g) =>
      g.every((c) => !used.has(c)),
    );
    if (candidates.length === 0) return null;
    const own = pick(candidates, rand);
    own.forEach((c) => used.add(c));
    owns.push(own);
  }

  // 함수 구성
  const funcs: BooleanFunction[] = owns.map((own) => ({
    vars,
    varNames,
    minterms: [...sharedCells, ...own].sort((a, b) => a - b),
    dontCares: [],
  }));

  // 공유항 — 공유 subcube가 단일 항으로 최소화되어야 함
  const sharedSop = minimizeSop({ vars, varNames, minterms: [...sharedCells], dontCares: [] });
  if (sharedSop.length !== 1) return null;
  const sharedTerm = sharedSop[0];

  // 구현 SOP — multi-output minimization: own 셀 cover (공유 셀은 don't-care로 재사용 가능)
  const implSops: SopTerm[][] = [];
  const soloSops: SopTerm[][] = [];
  for (let f = 0; f < M; f++) {
    const ownCover = minimizeSop({
      vars,
      varNames,
      minterms: [...owns[f]],
      dontCares: [...sharedCells],
    });
    // 개별 cover가 없거나 공유항과 동일 항이 나오면 구조가 무너짐
    if (ownCover.length < 1) return null;
    if (ownCover.some((t) => t.pattern === sharedTerm.pattern)) return null;
    const impl = [sharedTerm, ...ownCover];

    // 품질 검증: 공유항 구현이 단독 최소화보다 항이 많으면 (비효율적 구현 강제) reject
    const solo = minimizeSop(funcs[f]);
    if (impl.length > solo.length) return null;

    implSops.push(impl);
    soloSops.push(solo);
  }

  // 입력변수 할당 유일성 — 비항등 순열에 모든 함수가 불변이면 정답이 다의적
  if (requireUnique && !hasUniqueVariableAssignment(funcs, vars)) return null;

  return { funcs, implSops, soloSops, sharedTerm };
}

/** 비항등 변수 순열 τ에 대해 모든 함수가 불변이면 false (할당 다의적). */
function hasUniqueVariableAssignment(funcs: BooleanFunction[], vars: number): boolean {
  const positions = Array.from({ length: vars }, (_, i) => i);
  for (const perm of permutations(positions)) {
    if (perm.every((v, i) => v === i)) continue;
    const allInvariant = funcs.every((f) => {
      const permuted = new Set(f.minterms.map((m) => permuteMintermBits(m, perm, vars)));
      return permuted.size === f.minterms.length && f.minterms.every((m) => permuted.has(m));
    });
    if (allInvariant) return false;
  }
  return true;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

/** minterm 인덱스의 변수 비트를 순열 perm으로 재배치 (변수 i는 MSB-first → 비트 vars-1-i). */
function permuteMintermBits(m: number, perm: number[], vars: number): number {
  let out = 0;
  for (let i = 0; i < vars; i++) {
    const bit = (m >> (vars - 1 - perm[i])) & 1;
    out |= bit << (vars - 1 - i);
  }
  return out;
}

// ── 회로·K-map 빌드 ────────────────────────────────────────────────────

function finalize(
  sample: SampleResult,
  rand: () => number,
  varNames: string[],
  funcNames: string[],
  uniqueAssignment: boolean,
): SharedTermInputBlankGeneration {
  const vars = varNames.length;
  const markers = INPUT_MARKERS.slice(0, vars);

  // 마커 ↔ 변수 매핑 — 변수 순서를 셔플해 마커에 할당 (학생이 회로 구조로 도출)
  const varPerm = shuffle(
    Array.from({ length: vars }, (_, i) => i),
    rand,
  );
  const markerAssignment = markers.map((marker, mIdx) => ({
    marker,
    variable: varNames[varPerm[mIdx]],
  }));

  const logicNetworkDiagram = buildSharedTermNetwork({
    sops: sample.implSops,
    funcNames,
    sharedPatterns: [sample.sharedTerm.pattern],
    markers,
    varPerm,
  });

  const sopExpressions = sample.implSops.map((sop) => sopToString(sop, varNames));
  const soloExpressions = sample.soloSops.map((sop) => sopToString(sop, varNames));
  const sharedExpression = sopTermToString(sample.sharedTerm, varNames);
  const mintermExpressions = sample.funcs.map((f) => `Σm(${f.minterms.join(", ")})`);

  return {
    funcs: sample.funcs,
    funcNames,
    varNames,
    sops: sample.implSops,
    sopExpressions,
    soloExpressions,
    mintermExpressions,
    sharedPatterns: [sample.sharedTerm.pattern],
    sharedExpression,
    markerAssignment,
    blankKmapDiagram: buildBlankKmapDiagram(varNames),
    solutionKmaps: sample.funcs.map((f, i) =>
      buildFilledKmapDiagram(f, `${funcNames[i]}(${varNames.join(",")})`),
    ),
    logicNetworkDiagram,
    uniqueAssignment,
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 공유항 회로 빌드 — 공유항 AND 게이트는 1개만 생성해 모든 함수의 OR에 연결.
 * 입력 신호는 마커(㉠㉡㉢)로 표기 — 정답 매핑은 markerAssignment가 보유.
 */
function buildSharedTermNetwork(args: {
  sops: SopTerm[][];
  funcNames: string[];
  sharedPatterns: string[];
  markers: string[];
  /** varPerm[mIdx] = 마커 mIdx에 할당된 변수 인덱스 */
  varPerm: number[];
}): LogicNetworkDiagram {
  const { sops, funcNames, sharedPatterns, markers, varPerm } = args;
  const gates: LogicGate[] = [];

  // 변수 인덱스 → 마커 신호명
  const markerOfVar = new Map<number, string>();
  varPerm.forEach((vIdx, mIdx) => markerOfVar.set(vIdx, markers[mIdx]));

  // NOT 게이트 — 어느 항이든 pattern "0"인 변수
  const needsNot = new Set<number>();
  for (const sop of sops) {
    for (const t of sop) {
      for (let i = 0; i < t.pattern.length; i++) {
        if (t.pattern[i] === "0") needsNot.add(i);
      }
    }
  }
  const notSignal = new Map<number, string>();
  for (const vIdx of [...needsNot].sort((a, b) => a - b)) {
    const marker = markerOfVar.get(vIdx)!;
    const out = `${marker}_n`;
    gates.push({ id: `G_not_${vIdx}`, type: "NOT", inputs: [marker], output: out });
    notSignal.set(vIdx, out);
  }

  // SOP 항 → literal 신호 목록 (마커 기준)
  const literalSignals = (t: SopTerm): string[] => {
    const sigs: string[] = [];
    for (let i = 0; i < t.pattern.length; i++) {
      if (t.pattern[i] === "X") continue;
      sigs.push(t.pattern[i] === "1" ? markerOfVar.get(i)! : notSignal.get(i)!);
    }
    return sigs;
  };

  // 공유항 AND — 한 번만 생성, shared 마킹
  const sharedOutByPattern = new Map<string, string>();
  let sharedIdx = 1;
  for (const pattern of sharedPatterns) {
    const term = sops[0].find((t) => t.pattern === pattern);
    if (!term) continue;
    const sigs = literalSignals(term);
    if (sigs.length === 1) {
      sharedOutByPattern.set(pattern, sigs[0]);
    } else {
      const out = `and_shared_${sharedIdx}`;
      gates.push({
        id: `G_and_shared_${sharedIdx}`,
        type: "AND",
        inputs: sigs,
        output: out,
        shared: true,
      });
      sharedOutByPattern.set(pattern, out);
      sharedIdx += 1;
    }
  }

  // 함수별 개별항 AND + 출력 OR — 공유항 출력을 첫 입력으로 (원본 layout 관례)
  for (let f = 0; f < sops.length; f++) {
    const fname = funcNames[f];
    const orInputs: string[] = [];
    let andIdx = 1;
    for (const term of sops[f]) {
      const sharedOut = sharedOutByPattern.get(term.pattern);
      if (sharedOut !== undefined) {
        if (!orInputs.includes(sharedOut)) orInputs.unshift(sharedOut);
        continue;
      }
      const sigs = literalSignals(term);
      if (sigs.length === 1) {
        orInputs.push(sigs[0]);
      } else {
        const out = `and_${fname}_${andIdx}`;
        gates.push({ id: `G_and_${fname}_${andIdx}`, type: "AND", inputs: sigs, output: out });
        orInputs.push(out);
        andIdx += 1;
      }
    }
    gates.push({
      id: orInputs.length === 1 ? `G_buf_${fname}` : `G_or_${fname}`,
      type: "OR",
      inputs: orInputs,
      output: fname,
    });
  }

  return {
    inputs: [...markers],
    outputs: [...funcNames],
    gates,
  };
}

/** (나) 빈 K-map — 모든 셀 빈칸 (학생이 채움). */
function buildBlankKmapDiagram(varNames: string[]): KmapDiagram {
  const dummy: BooleanFunction = {
    vars: varNames.length,
    varNames,
    minterms: [],
    dontCares: [],
  };
  const km = buildKmap(dummy);
  return {
    title: "",
    variables: varNames,
    rowVars: km.rowVars,
    colVars: km.colVars,
    rowOrder: km.rowOrder,
    colOrder: km.colOrder,
    rows: km.cells.map((cells, ri) => ({
      label: km.rowOrder[ri],
      values: cells.map(() => "" as KmapValue),
    })),
  };
}

/** 풀이용 채워진 K-map. */
function buildFilledKmapDiagram(f: BooleanFunction, title: string): KmapDiagram {
  const km = buildKmap(f);
  return {
    title,
    variables: f.varNames,
    rowVars: km.rowVars,
    colVars: km.colVars,
    rowOrder: km.rowOrder,
    colOrder: km.colOrder,
    rows: km.cells.map((cells, ri) => ({ label: km.rowOrder[ri], values: cells })),
  };
}
