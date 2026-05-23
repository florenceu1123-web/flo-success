/**
 * K-map / Boolean function 최소화 — N 변수 minterm 셋 → 최소 SOP.
 *
 *   Quine-McCluskey 알고리즘 단순화 구현:
 *     1) minterm을 binary로 → group by 1-bit count
 *     2) 인접 그룹 pair-merge (1 bit differ → "-" 도입)
 *     3) more pass 반복 → prime implicants 추출
 *     4) essential prime implicant 식별 + greedy 추가 커버
 *
 *   N ≤ 5 까지 합리적 시간 (최대 32 minterm).
 *
 *   사용:
 *     const result = minimizeSop({ variables, minterms, dontCares });
 *     result.terms       : SOP 항 [["A", "B'", "C"], ["A'", "C", "D"], ...]
 *     result.expression  : 문자열 표현 "AB'C + A'CD + ..."
 */

export type MinimizeInput = {
  variables: readonly string[];       // 변수 이름 (A, B, ...)
  minterms: readonly number[];        // f=1인 minterm 인덱스
  dontCares?: readonly number[];      // don't care minterm 인덱스
};

/** SOP term — 각 변수가 (포함·보수·don't matter) 셋 중 하나. */
export type SopLiteral = { variable: string; negated: boolean };
export type SopTerm = readonly SopLiteral[];

export type MinimizeResult = {
  terms: readonly SopTerm[];     // 최소 SOP 항들
  expression: string;            // "AB'C + A'CD" 식
  primeImplicants: readonly string[]; // 디버그용 prime implicant 문자열 ("11-0" 등)
};

/**
 * 최소 SOP 도출.
 */
export function minimizeSop(input: MinimizeInput): MinimizeResult {
  const n = input.variables.length;
  if (n < 1 || n > 5) {
    throw new Error(`minimizeSop: 변수 개수 ${n} 범위 밖 (1~5만 지원)`);
  }
  const minterms = [...new Set(input.minterms)].sort((a, b) => a - b);
  const dontCares = [...new Set(input.dontCares ?? [])].sort((a, b) => a - b);
  const all = [...new Set([...minterms, ...dontCares])].sort((a, b) => a - b);

  if (all.length === 0) {
    return { terms: [], expression: "0", primeImplicants: [] };
  }
  if (all.length === 1 << n) {
    return {
      terms: [[]],
      expression: "1",
      primeImplicants: ["-".repeat(n)],
    };
  }

  // 1) prime implicants 추출
  const primes = findPrimeImplicants(all, n);

  // 2) essential prime implicants + greedy cover
  const cover = greedyCover(primes, minterms, n);

  const terms = cover.map((p) => implicantToTerm(p, input.variables));
  return {
    terms,
    expression: termsToExpression(terms),
    primeImplicants: primes,
  };
}

// ─── 알고리즘 helpers ──────────────────────────────────────

/** minterm을 n-bit binary string으로 (MSB 우선). */
function toBin(m: number, n: number): string {
  return m.toString(2).padStart(n, "0");
}

/** binary string에서 1-bit count. "1010" → 2, "-101" → 2 (dash 무시). */
function ones(s: string): number {
  let c = 0;
  for (const ch of s) if (ch === "1") c++;
  return c;
}

/** 두 implicant string이 정확히 한 bit만 다르면 merged 결과 반환 (dash). 아니면 null. */
function tryMerge(a: string, b: string): string | null {
  if (a.length !== b.length) return null;
  let diff = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === "-" || b[i] === "-") return null;
    if (diff !== -1) return null;
    diff = i;
  }
  if (diff === -1) return null;
  return a.slice(0, diff) + "-" + a.slice(diff + 1);
}

/**
 * Prime implicants 추출 — Quine-McCluskey table method.
 *   각 단계: 1-bit difference만큼 merge. merge된 건 mark, merge 안 된 것 + 마지막 단계는 prime.
 */
function findPrimeImplicants(all: readonly number[], n: number): string[] {
  let groups: string[] = all.map((m) => toBin(m, n));
  const primes = new Set<string>();
  while (true) {
    // group by ones count
    const byOnes = new Map<number, string[]>();
    for (const s of groups) {
      const k = ones(s);
      if (!byOnes.has(k)) byOnes.set(k, []);
      byOnes.get(k)!.push(s);
    }
    const merged = new Set<string>();
    const usedInMerge = new Set<string>();
    const sortedKeys = [...byOnes.keys()].sort((a, b) => a - b);
    for (let i = 0; i < sortedKeys.length - 1; i++) {
      const a = byOnes.get(sortedKeys[i])!;
      const b = byOnes.get(sortedKeys[i + 1])!;
      for (const sa of a) {
        for (const sb of b) {
          const m = tryMerge(sa, sb);
          if (m) {
            merged.add(m);
            usedInMerge.add(sa);
            usedInMerge.add(sb);
          }
        }
      }
    }
    for (const s of groups) {
      if (!usedInMerge.has(s)) primes.add(s);
    }
    if (merged.size === 0) break;
    groups = [...merged];
  }
  return [...primes];
}

/** implicant string ("1-0")가 minterm m을 커버하는가? */
function covers(implicant: string, m: number, n: number): boolean {
  const bin = toBin(m, n);
  for (let i = 0; i < implicant.length; i++) {
    if (implicant[i] === "-") continue;
    if (implicant[i] !== bin[i]) return false;
  }
  return true;
}

/**
 * Essential prime implicants 식별 + 나머지 greedy cover.
 *   각 minterm을 cover하는 prime implicant가 정확히 1개면 그건 essential.
 *   essential 모두 선택 후 남은 minterm들은 가장 많이 커버하는 implicant부터 greedy.
 */
function greedyCover(primes: readonly string[], minterms: readonly number[], n: number): string[] {
  if (minterms.length === 0) return [];
  const uncovered = new Set(minterms);
  const selected = new Set<string>();

  // essential pass
  while (true) {
    let foundEssential = false;
    for (const m of uncovered) {
      const covering = primes.filter((p) => covers(p, m, n));
      if (covering.length === 1) {
        selected.add(covering[0]);
        for (const mm of [...uncovered]) {
          if (covers(covering[0], mm, n)) uncovered.delete(mm);
        }
        foundEssential = true;
        break;
      }
    }
    if (!foundEssential) break;
  }

  // greedy pass
  while (uncovered.size > 0) {
    let best: string | null = null;
    let bestCount = 0;
    for (const p of primes) {
      if (selected.has(p)) continue;
      let c = 0;
      for (const m of uncovered) if (covers(p, m, n)) c++;
      if (c > bestCount) {
        bestCount = c;
        best = p;
      }
    }
    if (!best) break;
    selected.add(best);
    for (const mm of [...uncovered]) {
      if (covers(best, mm, n)) uncovered.delete(mm);
    }
  }

  return [...selected];
}

/** implicant string → SopTerm. "10-1" → [A, B', D] for vars [A,B,C,D]. */
function implicantToTerm(implicant: string, variables: readonly string[]): SopTerm {
  const term: SopLiteral[] = [];
  for (let i = 0; i < implicant.length; i++) {
    const ch = implicant[i];
    if (ch === "-") continue;
    term.push({ variable: variables[i], negated: ch === "0" });
  }
  return term;
}

/** SopTerm[] → 문자열 표현 "AB'C + A'CD". */
function termsToExpression(terms: readonly SopTerm[]): string {
  if (terms.length === 0) return "0";
  return terms
    .map((t) => {
      if (t.length === 0) return "1";
      return t.map((l) => `${l.variable}${l.negated ? "'" : ""}`).join("");
    })
    .join(" + ");
}

/**
 * Minterm perturbation — exam_similar/variant 모드용.
 *   주어진 minterm 셋에서 일부 cell 추가·제거 (변형 강도 조절).
 *   원본의 함수 구조(SOP 항 수·variable 의존성)는 거의 유지되도록 perturb 크기 제한.
 */
export function perturbMinterms(
  minterms: readonly number[],
  totalCells: number,    // 2^N
  mode: "exam_similar" | "exam_variant",
  rand: () => number,
): number[] {
  const orig = new Set(minterms);
  const result = new Set(orig);
  const perturbCount = mode === "exam_similar"
    ? Math.max(1, Math.floor(totalCells * 0.05))   // ~5% cells
    : Math.max(2, Math.floor(totalCells * 0.15));  // ~15%
  const flips = Math.min(perturbCount, Math.floor(totalCells / 2));
  for (let i = 0; i < flips; i++) {
    const cell = Math.floor(rand() * totalCells);
    if (result.has(cell)) result.delete(cell);
    else result.add(cell);
  }
  // ★ 안전장치 — 빈 함수(0) 또는 항상 참(1)이 되면 원본 절반 정도 복원
  if (result.size === 0 || result.size === totalCells) {
    for (const m of orig) result.add(m);
  }
  return [...result].sort((a, b) => a - b);
}
