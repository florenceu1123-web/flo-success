// Quine-McCluskey 최소화 테스트.
// inline 구현 (TS 직접 임포트 안 함).

function minimize(vars, minterms, dontCares = []) {
  const all = [...minterms, ...dontCares].sort((a, b) => a - b);
  if (minterms.length === 0) return [];

  let implicants = all.map((m) => ({
    pattern: m.toString(2).padStart(vars, "0"),
    covers: new Set([m]),
    used: false,
  }));

  const primes = [];
  while (true) {
    const next = [];
    const usedMap = new Map();
    for (let i = 0; i < implicants.length; i++) {
      for (let j = i + 1; j < implicants.length; j++) {
        const a = implicants[i].pattern, b = implicants[j].pattern;
        let diff = 0, diffPos = -1, mismatch = false;
        for (let k = 0; k < a.length; k++) {
          if (a[k] !== b[k]) {
            if (a[k] === "-" || b[k] === "-") { mismatch = true; break; }
            diff++; diffPos = k;
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

  const mintermsToCover = new Set(minterms);
  const piByMinterm = new Map();
  primes.forEach((p, i) => {
    for (const m of p.covers) {
      if (!mintermsToCover.has(m)) continue;
      if (!piByMinterm.has(m)) piByMinterm.set(m, []);
      piByMinterm.get(m).push(i);
    }
  });
  const chosen = new Set();
  for (const [m, list] of piByMinterm) if (list.length === 1) chosen.add(list[0]);
  const covered = new Set();
  for (const i of chosen) for (const m of primes[i].covers) covered.add(m);

  const left = [...mintermsToCover].filter((m) => !covered.has(m));
  while (left.length > 0) {
    let best = -1, bestN = -1;
    for (let i = 0; i < primes.length; i++) {
      if (chosen.has(i)) continue;
      let n = 0;
      for (const m of left) if (primes[i].covers.has(m)) n++;
      if (n > bestN) { bestN = n; best = i; }
    }
    if (best < 0) break;
    chosen.add(best);
    for (const m of primes[best].covers) {
      const idx = left.indexOf(m);
      if (idx >= 0) left.splice(idx, 1);
    }
  }
  return [...chosen].map((i) => primes[i].pattern.replace(/-/g, "X"));
}

function termToStr(pattern, names) {
  const parts = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "X") continue;
    parts.push(pattern[i] === "1" ? names[i] : names[i] + "'");
  }
  return parts.length ? parts.join("") : "1";
}

function showSop(patterns, names) {
  if (patterns.length === 0) return "0";
  return patterns.map((p) => termToStr(p, names)).join(" + ");
}

console.log("Test 1: F(A,B,C) = Σm(0,1,2,5,6,7)");
// Expected: F = A'B' + B C' + AC (or similar minimal)
// Actually let me verify: minterms 0(000)=A'B'C', 1(001)=A'B'C, 2(010)=A'BC', 5(101)=AB'C, 6(110)=ABC', 7(111)=ABC
{
  const sop = minimize(3, [0, 1, 2, 5, 6, 7]);
  console.log("  patterns:", sop);
  console.log("  SOP:", showSop(sop, ["A", "B", "C"]));
}

console.log("\nTest 2: F(A,B,C,D) = Σm(0,1,2,5,6,7,8,9,10,14)");
{
  const sop = minimize(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);
  console.log("  patterns:", sop);
  console.log("  SOP:", showSop(sop, ["A", "B", "C", "D"]));
}

console.log("\nTest 3: F(A,B,C) = Σm(0,2,4,6) → F = C'");
{
  const sop = minimize(3, [0, 2, 4, 6]);
  console.log("  patterns:", sop);
  console.log("  SOP:", showSop(sop, ["A", "B", "C"]));
}

console.log("\nTest 4: F(A,B) = Σm(1,2)");
// F=1 when A!=B → XOR. Min SOP: A'B + AB'
{
  const sop = minimize(2, [1, 2]);
  console.log("  patterns:", sop);
  console.log("  SOP:", showSop(sop, ["A", "B"]));
}

// 검증: SOP 평가 결과가 minterm 집합과 일치하는지
function evalPattern(pattern, vars) {
  // vars: input bits [b_msb..b_lsb] length = pattern.length
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "X") continue;
    if (pattern[i] !== String(vars[i])) return 0;
  }
  return 1;
}
function evalSop(patterns, idx, varCount) {
  const bits = [];
  for (let b = varCount - 1; b >= 0; b--) bits.push((idx >> b) & 1);
  for (const p of patterns) if (evalPattern(p, bits) === 1) return 1;
  return 0;
}

function verify(vars, minterms, label) {
  const sop = minimize(vars, minterms);
  for (let i = 0; i < (1 << vars); i++) {
    const expected = minterms.includes(i) ? 1 : 0;
    const got = evalSop(sop, i, vars);
    if (expected !== got) {
      console.log(`  ✗ ${label}: mismatch at m${i} expected=${expected} got=${got}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`  ✓ ${label}: SOP covers exactly minterms`);
}

console.log("\nVerification:");
verify(3, [0, 1, 2, 5, 6, 7], "Test 1");
verify(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14], "Test 2");
verify(3, [0, 2, 4, 6], "Test 3");
verify(2, [1, 2], "Test 4");

if (process.exitCode === 1) console.log("\n❌ 실패");
else console.log("\n✅ 모든 SOP 정확");
