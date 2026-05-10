/**
 * answer / solution 텍스트 품질 검사.
 *
 * GPT가 자주 저지르는 패턴:
 *  - answer를 "..." 같은 placeholder로 둠
 *  - solution을 추상적 단계만 나열하고 실제 수치 풀이 생략
 *
 * 이 검사가 fail이면 critical → retry 트리거.
 */
export type AnswerSolutionIssue = { rule: string; message: string };

export function validateAnswerSolution(args: {
  answer: string;
  solution: string;
  problemIndex?: number;
}): AnswerSolutionIssue[] {
  const issues: AnswerSolutionIssue[] = [];
  const tag = args.problemIndex !== undefined ? `problem${args.problemIndex}: ` : "";

  // answer 검사
  const ans = (args.answer ?? "").trim();
  if (ans.length < 3) {
    issues.push({ rule: "answer_empty", message: `${tag}answer가 비어있거나 너무 짧음` });
  } else {
    if (/\.{3}/.test(ans)) {
      issues.push({ rule: "answer_placeholder", message: `${tag}answer에 "..." placeholder 포함 — 실제 계산 수치로 채울 것` });
    }
    // 숫자가 하나도 없으면 의심 (회로 문제는 보통 수치 답)
    if (!/[0-9]/.test(ans)) {
      issues.push({ rule: "answer_no_digit", message: `${tag}answer에 숫자가 없음 — 실제 수치 답이어야 함` });
    }
    // "값" "결과" 같은 추상 단어만으로 끝나면 의심
    if (/^[가-힣\s]+$/.test(ans) && ans.length < 20) {
      issues.push({ rule: "answer_too_abstract", message: `${tag}answer가 추상적 한국어 텍스트만 — 수치 포함 필요` });
    }
  }

  // solution 검사
  const sol = (args.solution ?? "").trim();
  if (sol.length < 20) {
    issues.push({ rule: "solution_too_short", message: `${tag}solution이 너무 짧음 (${sol.length}자) — 실제 풀이 단계 필요` });
  } else {
    if (/\.{3}/.test(sol)) {
      issues.push({ rule: "solution_placeholder", message: `${tag}solution에 "..." placeholder 포함` });
    }
    if (!/[0-9]/.test(sol)) {
      issues.push({ rule: "solution_no_digit", message: `${tag}solution에 숫자가 없음 — 방정식·수치 풀이 단계 필요` });
    }
  }

  return issues;
}
