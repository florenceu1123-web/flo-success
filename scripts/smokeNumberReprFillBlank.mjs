// 임용 27번 — 컴퓨터 데이터 표현·산술 연산 빈칸 채우기 (number_repr_fill_blank), ★그림 없음★
//   ★ 재검산은 생성기 solve를 다시 부르지 않고 **독립 계산**으로 대조한다.
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { __spaces, generateNumberReprFillBlank, matchesNumberReprFillBlank, solveNumberRepr }
  from "../lib/generation/topologies/numberReprFillBlank.ts";
import { detectNumberReprFillBlank, runNumberReprFillBlankPipeline }
  from "../lib/pipeline/runNumberReprFillBlankPipeline.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv, tags: [], learningObjective: {} });
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });

const POS = [
  ["실측 요약", mk("컴퓨터 데이터 표현과 산술 연산",
    "2진수를 16진수로 변환하고, 1의 보수와 2의 보수 표현, n비트 2의 보수 범위, 8비트 덧셈의 초과(overflow)를 판단하는 문제이다.", ["보수", "진수 변환"], inv())],
  ["짧은 요약", mk("2의 보수 표현과 오버플로", "1의 보수와 2의 보수로 표현한 값을 비교하고 2진수를 16진수로 변환한다.", [], inv())],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesNumberReprFillBlank(a) === true);
  ok(`안전망: ${n}`, detectNumberReprFillBlank(a) === true);
  for (const s of ["digital_logic", "electronics"]) ok(`분류 ${s}: ${n}`, classifyCircuitType({ ...a, subjectKey: s }, s)?.type === "number_repr_fill_blank");
}
const NEG = [
  ["number_representation (고리 그림)", mk("n비트 수 표현 고리", "2의 보수 표현을 링 형태의 고리 그림으로 나타낸다.", [], inv())],
  ["논리회로", mk("조합논리회로 간소화", "카르노맵으로 2의 보수 변환 회로의 논리식을 간소화하고 게이트로 구현한다.", [], inv("GATE"))],
  ["플립플롭", mk("JK 플립플롭 카운터", "플립플롭 카운터의 2진 출력을 구한다.", [], inv("FF"))],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesNumberReprFillBlank(a) === false);
  ok(`양보(분류) ${n}`, classifyCircuitType({ ...a, subjectKey: "digital_logic" }, "digital_logic")?.type !== "number_repr_fill_blank");
}

// 원본 값 재현
{
  const s = solveNumberRepr({ binHex: "111110010100", nBits: 4, a: 2, rangeBits: 8, addBits: 8, x: -19, y: -5, dual: false });
  ok("원본 ㄱ: 111110010100₂ = F94₁₆", s.hex === "F94", s.hex);
  ok("원본 ㄴ: −2의 1의 보수(4비트) = 1101", s.onesComp === "1101", s.onesComp);
  ok("원본 ㄴ: 같은 비트열의 2의 보수 = −3", s.twosDec === -3);
  ok("원본 ㅁ: (−19)+(−5) = 11101000₂", s.sumBin === "11101000", s.sumBin);
  ok("원본 ㅁ: 십진 −24", s.sumDec === -24);
  ok("원본 ㅁ: 오버플로 없음", s.overflow === false);
}

// 독립 재검산
let bad = 0, checked = 0, hyphen = 0;
const toBin = (v, w) => ((v >>> 0) & ((1 << w) - 1)).toString(2).padStart(w, "0");
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 24; seed++) {
    const g = generateNumberReprFillBlank({ seed: seed * 7919, index: seed % 3, mode });
    const v = g.values, s = g.sol; checked++;
    // ㉠ 2진→16진: parseInt 전체로 검산
    if (BigInt("0b" + v.binHex).toString(16).toUpperCase() !== s.hex) bad++;
    // ㉡ 1의 보수
    if (s.onesComp !== toBin(~v.a, v.nBits)) bad++;
    if (s.twosDec !== -(v.a + 1)) bad++;
    // ㉤ 덧셈·오버플로
    const sum = toBin(v.x + v.y, v.addBits);
    if (sum !== s.sumBin) bad++;
    const sx = toBin(v.x, v.addBits)[0], sy = toBin(v.y, v.addBits)[0];
    if (s.overflow !== (sx === sy && sum[0] !== sx)) bad++;
    // ★ 표기 — ASCII 하이픈이 섞이면 안 된다
    const text = g.items.join("\n") + "\n" + g.answers.map((a) => a.value).join("\n");
    if (/-/.test(text)) hyphen++;
    // ★ "n비트"라고 써 놓고 지수는 구체값인 모순이 없어야 한다
    if (/n비트/.test(g.items.join(" "))) bad++;
  }
}
ok("생성물 = 독립 계산", bad === 0, `${bad}/${checked}`);
ok("ASCII 하이픈 0", hyphen === 0, `${hyphen}건`);
ok("값 공간 충분", __spaces.SIMILAR_SPACE.length > 100, `${__spaces.SIMILAR_SPACE.length}`);

// 발문·정답
const CHOICE = /[①②③④⑤]|고르시오|고른\s*것은|보기\s*중에서/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runNumberReprFillBlankPipeline({ analysis: null, mode, count: 1, topicKey: "combinational_gate" });
  ok(`빈칸 5개 (${mode})`, ["㉠", "㉡", "㉢", "㉣", "㉤"].every((m) => p.content.includes(m) && p.question.includes(m)));
  ok(`객관식 아님 (${mode})`, !CHOICE.test(p.question) && !CHOICE.test(p.content));
  ok(`그림 없음 (${mode})`, (p.figureVariants ?? []).length === 0);
  ok(`정답 5줄 (${mode})`, p.answer.split("\n").filter((l) => l.trim()).length === 5);
  ok(`〈보기〉 5항목 (${mode})`, ["ㄱ.", "ㄴ.", "ㄷ.", "ㄹ.", "ㅁ."].every((k) => p.content.includes(k)));
  ok(`오버플로 판정 근거 (${mode})`, p.conditions.some((c) => c.includes("부호가 달라지는")));
}

// 배치 내 문항이 서로 달라야 한다
{
  const set = new Set();
  for (let i = 0; i < 3; i++) set.add(generateNumberReprFillBlank({ seed: 999, index: i, mode: "exam_similar" }).items.join("|"));
  ok("한 배치 3문항이 모두 다름", set.size === 3, `${set.size}종`);
}
console.log(`\n${fail === 0 ? "✅" : "❌"} number_repr_fill_blank smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
