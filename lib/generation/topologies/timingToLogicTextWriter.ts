/**
 * 임용 8번 형식 — 타이밍 도표만 주어지고 학생이 카르노맵·회로·NAND를 도출하는 문제 텍스트.
 *   결정론(GPT 없음). 함수·시퀀스는 generator가 결정, 텍스트·정답은 그 값으로 강제.
 */

import type { WaveformAnalysisGeneration } from "./waveformAnalysis";

export type TimingToLogicTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/** SOP term 패턴("10X" 등, MSB=C..LSB=A는 buildKmap 규약과 무관히 varNames 순서로)을 리터럴 곱으로. */
function termToLiterals(pattern: string, varNames: string[]): string {
  const lits: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "1") lits.push(varNames[i]);
    else if (ch === "0") lits.push(`${varNames[i]}'`);
  }
  return lits.length > 0 ? lits.join("·") : "1";
}

export function writeTimingToLogicText(args: {
  generation: WaveformAnalysisGeneration;
}): TimingToLogicTextOutput {
  const { func, sop, fExpression, outputSequence } = args.generation;
  const varNames = func.varNames;
  const seqDotted = outputSequence.map((v, t) => `t${t}:${v}`).join(", ");

  // 진리표 (타이밍 도표로부터 도출되는 것 — 풀이용)
  const truthRows: string[] = [];
  for (let t = 0; t < 8; t++) {
    const a = t & 1, b = (t >> 1) & 1, c = (t >> 2) & 1;
    truthRows.push(`  (A,B,C)=(${a},${b},${c}) → F=${outputSequence[t]}`);
  }

  // 곱항 리스트
  const termStrs = sop.map((tm) => termToLiterals(tm.pattern, varNames));
  // NAND-NAND 2단 형태 — 각 곱항 NAND + 출력 NAND. F = ((T1)'·(T2)'·…)'
  const nandForm = `F = ( ${termStrs.map((t) => `(${t})'`).join(" · ")} )'`;

  const content =
    `그림은 입력 변수 ${varNames.join(", ")}와 불 함수(Boolean function) 출력 F(${varNames.join(",")})를 갖는 ` +
    `논리회로에 대한 t₀~t₈ 시간에서의 타이밍 도표(timing diagram)를 나타낸 것이다. ` +
    `제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`;

  const conditions = [
    "입력 A·B·C와 출력 F의 파형은 그림(타이밍 도표)에 주어진다.",
    "8개 시간 구간(t₀~t₈)에서 (A,B,C)는 000~111의 모든 조합을 한 번씩 갖는다.",
    "모든 소자는 이상적으로 동작한다.",
  ];

  const question = [
    "<해석 절차>",
    "[단계 1] 타이밍 도표를 이용하여 출력 F에 대한 카르노 도(Karnaugh map)를 작성하여 제시한다.",
    "[단계 2] [단계 1]에서 얻은 카르노 도를 이용하여 최소화된 불 함수 F를 구하고, F의 논리회로를 도시한다.",
    "[단계 3] [단계 2]에서 구한 논리회로를 2입력 NAND 게이트만을 이용하여 도시한다.",
  ].join("\n");

  const answer = [
    `[단계 1] 타이밍 도표 → 각 (A,B,C) 조합의 F 값 (F=1 minterm: {${func.minterms.join(", ")}})으로 카르노 도 작성.`,
    `[단계 2] 최소화된 불 함수 F = ${fExpression}`,
    `[단계 3] 2입력 NAND 형태: ${nandForm}`,
  ].join("\n");

  const solution = [
    "[단계 1] 타이밍 도표의 각 시간 구간에서 (A,B,C) 값과 그때의 F 값을 읽어 진리표를 만든다:",
    ...truthRows,
    `  → F=1인 minterm: {${func.minterms.join(", ")}}. 이를 카르노 도의 해당 칸에 1로 채운다.`,
    `  (출력 F 시퀀스: ${seqDotted})`,
    "",
    `[단계 2] 카르노 도에서 인접한 1들을 최대 묶음으로 묶어 최소화 → F = ${fExpression}.`,
    `  각 곱항(${termStrs.join(", ")})을 AND 게이트로, 이들을 OR 게이트로 결합해 F의 논리회로를 도시한다.`,
    "",
    "[단계 3] AND-OR 회로를 NAND 전용으로 변환한다 (이중부정 F = ((F)')'):",
    `  각 곱항을 2입력 NAND들로 만들고(AND = NAND 후 인버터, 인버터도 NAND로 구현), 출력단을 NAND로 결합한다.`,
    `  결과(NAND-NAND 2단): ${nandForm}.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}
