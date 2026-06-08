/**
 * 순서논리 시뮬레이터 검증 (GPT 불필요).
 *  실행: npx tsx scripts/smokeSequentialSim.ts
 */
import { simulateSequential } from "../lib/digital/sequentialSim";

let fail = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`  ${ok ? "✓" : "✗"} ${msg}${ok ? "" : ` — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`}`);
  if (!ok) fail++;
};

// 1) 2비트 업카운터: D0=~Q0, D1=Q1^Q0 (Q1=MSB)
{
  const r = simulateSequential({
    spec: { inputs: [], ffs: [{ q: "Q1", d: "Q1 ^ Q0" }, { q: "Q0", d: "~Q0" }] },
    inputWaves: {}, cycles: 5,
  });
  eq(r.stateSeq, ["00", "01", "10", "11", "00"], "2비트 카운터 상태열");
}

// 2) 외부 입력 + 보수/암묵 AND/NAND 식: D1 = A'B' (=~A & ~B), D0 = ~(B & Q1) (NAND)
{
  const r = simulateSequential({
    spec: { inputs: ["A", "B"], ffs: [{ q: "Q1", d: "A' B'" }, { q: "Q0", d: "~(B & Q1)" }] },
    inputWaves: { A: [0, 1, 0, 0], B: [0, 0, 1, 0] }, cycles: 4,
  });
  // 손계산: 시작 Q1Q0=00
  //  t0 A0 B0: D1=1·1=1, D0=~(0&0)=1 → next 11 ; 상태기록 00
  //  t1 A1 B0: D1=0·1=0, D0=~(0&1)=1 → next 01 ; 상태기록 11
  //  t2 A0 B1: D1=1·0=0, D0=~(1&0)=1 → next 01 ; 상태기록 01
  //  t3 A0 B0: D1=1·1=1, D0=~(0&0)=1 → next 11 ; 상태기록 01
  eq(r.stateSeq, ["00", "11", "01", "01"], "외부입력+보수+NAND 상태열");
  eq(r.trace.A, [0, 1, 0, 0], "입력 A 트레이스");
}

// 3) 중간신호(게이트) 참조: X = A ^ B, D0 = X
{
  const r = simulateSequential({
    spec: { inputs: ["A", "B"], ffs: [{ q: "Q0", d: "X" }], signals: [{ name: "X", expr: "A ^ B" }] },
    inputWaves: { A: [1, 0, 1], B: [0, 0, 1] }, cycles: 3,
  });
  // X: t0=1,t1=0,t2=0 → Q0 다음=X → 상태기록 0, 1, 0
  eq(r.stateSeq, ["0", "1", "0"], "중간신호 X=A^B 경유");
}

console.log(fail === 0 ? "\n✓ 시뮬레이터 전체 통과" : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
