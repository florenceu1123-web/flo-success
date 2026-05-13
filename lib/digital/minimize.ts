import type { BooleanFunction, SopTerm } from "./booleanFunction";

/**
 * POS 최소화 — F의 0-cell에 Q-M 적용해 F' SOP를 구하고, De Morgan으로 F의 POS 도출.
 *
 *  알고리즘:
 *   1) F의 0-cell(maxterm 인덱스) 추출
 *   2) F'를 위 0-cell들을 minterm으로 하는 함수로 정의
 *   3) minimizeSop으로 F' SOP 계산
 *   4) 각 SOP term의 pattern을 invert (0↔1) → POS term pattern
 *      이유: NOT(A B' C) = A' + B + C'. SOP pattern "101"이 F' AB'C이면,
 *      POS pattern "010"이 F의 (A'+B+C') sum term.
 *      pattern 해석은 SOP와 동일 ("1"=직접, "0"=반전, "X"=없음).
 *
 *  F가 항등(F=1): maxterm 없음 → POS = 빈 = 1.
 *  F가 항등(F=0): 모든 cell이 maxterm → POS는 minterm 만큼 항.
 */
export function minimizePos(f: BooleanFunction): SopTerm[] {
  const N = 1 << f.vars;
  const maxterms: number[] = [];
  for (let i = 0; i < N; i++) {
    if (f.dontCares.includes(i)) continue;
    if (!f.minterms.includes(i)) maxterms.push(i);
  }
  if (maxterms.length === 0) return [];   // F = 1
  const negF: BooleanFunction = {
    vars: f.vars,
    varNames: f.varNames,
    minterms: maxterms,
    dontCares: f.dontCares,
  };
  const sopOfNot = minimizeSop(negF);
  // pattern invert: "101" → "010", "X0" → "X1"
  return sopOfNot.map((t) => ({
    ...t,
    pattern: t.pattern
      .split("")
      .map((ch) => ch === "0" ? "1" : ch === "1" ? "0" : "X")
      .join(""),
  }));
}

/**
 * Quine-McCluskey SOP 최소화.
 *
 *  1) 모든 1-minterm + don't-care를 implicant로 시작.
 *  2) Hamming 거리 1인 implicant 쌍을 묶어 "-" 위치로 일반화 (반복).
 *  3) 더 묶일 수 없는 implicant = prime implicant.
 *  4) Essential prime implicant 추출 (유일하게 cover하는 minterm 있는 PI).
 *  5) 남은 minterm을 최소 PI로 cover (Petrick's method 단순 버전 — brute force).
 *
 *  return: 최소 SOP (essential + chosen PIs).
 *  varCount ≤ 4일 때 brute force 안정적.
 */

type Implicant = {
  pattern: string;        // "10-1" 등 ("-" = 무관 위치)
  covers: Set<number>;    // 이 implicant가 cover하는 minterm 인덱스
  used: boolean;          // 다른 implicant와 결합되었는지
};

export function minimizeSop(f: BooleanFunction): SopTerm[] {
  const all = [...f.minterms, ...f.dontCares].sort((a, b) => a - b);
  if (f.minterms.length === 0) return [];

  // 시작: 각 minterm을 binary 패턴으로
  let implicants: Implicant[] = all.map((m) => ({
    pattern: m.toString(2).padStart(f.vars, "0"),
    covers: new Set([m]),
    used: false,
  }));

  const primes: Implicant[] = [];

  // 반복 결합
  while (true) {
    const next: Implicant[] = [];
    const usedMap = new Map<string, boolean>();

    for (let i = 0; i < implicants.length; i++) {
      for (let j = i + 1; j < implicants.length; j++) {
        const a = implicants[i].pattern;
        const b = implicants[j].pattern;
        let diff = 0;
        let diffPos = -1;
        let mismatch = false;
        for (let k = 0; k < a.length; k++) {
          if (a[k] !== b[k]) {
            if (a[k] === "-" || b[k] === "-") { mismatch = true; break; }
            diff++;
            diffPos = k;
          }
        }
        if (!mismatch && diff === 1) {
          const combined = a.substring(0, diffPos) + "-" + a.substring(diffPos + 1);
          if (!usedMap.has(combined)) {
            usedMap.set(combined, true);
            next.push({
              pattern: combined,
              covers: new Set([...implicants[i].covers, ...implicants[j].covers]),
              used: false,
            });
          }
          implicants[i].used = true;
          implicants[j].used = true;
        }
      }
    }

    for (const imp of implicants) if (!imp.used) primes.push(imp);
    if (next.length === 0) break;
    implicants = next;
  }

  // Essential prime + 잔여 cover
  // 각 minterm을 cover하는 PI 인덱스 매핑
  const mintermsToCover = new Set(f.minterms);
  const piByMinterm = new Map<number, number[]>();   // minterm → [PI indices]
  primes.forEach((p, i) => {
    for (const m of p.covers) {
      if (!mintermsToCover.has(m)) continue;
      if (!piByMinterm.has(m)) piByMinterm.set(m, []);
      piByMinterm.get(m)!.push(i);
    }
  });

  const chosenPIs = new Set<number>();
  const coveredMinterms = new Set<number>();

  // Essential PIs: 유일 cover하는 minterm 있으면 essential
  for (const [m, piList] of piByMinterm) {
    if (piList.length === 1) {
      chosenPIs.add(piList[0]);
    }
  }
  for (const idx of chosenPIs) {
    for (const m of primes[idx].covers) coveredMinterms.add(m);
  }

  // 잔여 minterm 처리 — greedy: 가장 많이 cover하는 PI 선택
  const uncoveredMinterms = [...mintermsToCover].filter((m) => !coveredMinterms.has(m));
  while (uncoveredMinterms.length > 0) {
    // 잔여 cover 수가 가장 큰 PI 찾기
    let bestPi = -1;
    let bestCount = -1;
    for (let pi = 0; pi < primes.length; pi++) {
      if (chosenPIs.has(pi)) continue;
      let count = 0;
      for (const m of uncoveredMinterms) {
        if (primes[pi].covers.has(m)) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestPi = pi;
      }
    }
    if (bestPi < 0) break;
    chosenPIs.add(bestPi);
    for (const m of primes[bestPi].covers) {
      const idx = uncoveredMinterms.indexOf(m);
      if (idx >= 0) uncoveredMinterms.splice(idx, 1);
    }
  }

  // 결과 SOP — pattern "0/1/-" → "0/1/X"
  return Array.from(chosenPIs).map((pi) => ({
    pattern: primes[pi].pattern.replace(/-/g, "X"),
    covers: [...primes[pi].covers].filter((m) => mintermsToCover.has(m)),
  }));
}
