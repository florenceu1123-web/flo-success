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

    // ★ answer의 핵심 수치가 solution에도 등장하는지 (일관성 검사)
    if (ans.length >= 3) {
      const answerNumbers = extractSignificantNumbers(ans);
      const solutionNumbers = new Set(extractSignificantNumbers(sol));
      if (answerNumbers.length > 0) {
        const missing = answerNumbers.filter((n) => !solutionNumbers.has(n));
        if (missing.length === answerNumbers.length) {
          // 모든 answer 수치가 solution에 없음 — 명백한 불일치
          issues.push({
            rule: "solution_inconsistent_with_answer",
            message: `${tag}solution에 answer 수치 [${answerNumbers.join(", ")}]가 전혀 등장하지 않음`,
          });
        }
      }
    }

    // ★ GPT가 자기 풀이를 번복하는 표현 감지
    const selfCorrectionPatterns: Array<{ re: RegExp; label: string }> = [
      { re: /더\s*정확(한|히)/, label: "더 정확한" },
      { re: /다시\s*계산/, label: "다시 계산" },
      { re: /수정(하면|해보면|한다면)/, label: "수정하면" },
      { re: /오류가?\s*있/, label: "오류가 있" },
      { re: /\b(should\s+be|actually|correction)\b/i, label: "should be / actually" },
    ];
    for (const p of selfCorrectionPatterns) {
      if (p.re.test(sol)) {
        issues.push({
          rule: "solution_self_correction",
          message: `${tag}solution에 자기 번복 표현 "${p.label}" 발견 — 풀이 일관성 검토 필요`,
        });
        break;
      }
    }
  }

  return issues;
}

/**
 * 의미 있는 수치 토큰 추출. 단계 번호 (1), 2), 등) 제외.
 */
function extractSignificantNumbers(text: string): string[] {
  // 단계 마커 "1)", "2)" 등 제거
  const cleaned = text.replace(/\b\d+\s*\)/g, " ");
  const matches = cleaned.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    const n = parseFloat(m);
    if (!Number.isFinite(n)) continue;
    // 너무 작은 단일 정수 (단계 번호 등)는 제외 — 보수적 임계 10 미만
    if (Number.isInteger(n) && Math.abs(n) < 10) continue;
    out.push(String(n));
  }
  return out;
}
