/**
 * 문제 **조건**에서 자연상수 e의 수치를 주는 문구를 제거한다.
 *
 * ★ 사용자 지정(2026-08-04, 전 과목): "모든 문제에 e의 값을 넣는 것을 빼줘 — 답에 있는 건 상관없고
 *   **문제 조건으로 주어지는 것만**."
 *   GPT가 과도응답 문항을 만들 때 `(단, e = 2.718로 계산한다)`·`e^{-1} = 0.368`처럼 근삿값을
 *   조건에 얹는 경우가 있다. 그러면 학생이 기호식 대신 소수로 답하게 되어 출제 의도가 흐려진다.
 *   ⇒ **content·conditions에만** 적용한다. answer·solution의 e는 그대로 둔다.
 *
 * 코드로 박아 넣는 곳은 없고 전부 GPT 생성 문구라, 프롬프트 규칙(lib/prompts/system.ts)과
 * 이 후처리를 **둘 다** 둔다(프롬프트는 지켜지지 않는 회차가 있다 — 이 저장소의 반복 경험).
 */

/** e의 수치를 주는 문구 패턴. */
const EULER_VALUE_PATTERNS: RegExp[] = [
  // "e = 2.718", "e ≈ 2.72", "e의 값은 2.718이다", "e는 2.718로 계산한다"
  // ※ `\w`는 한글을 매치하지 않는다 — 어미(…한다)는 [가-힣]로 받아야 "(단, 한다.)" 잔해가 안 남는다.
  /(?:자연\s*상수\s*)?\be\s*(?:의\s*값(?:은|을|이)?\s*)?(?:는|은|이)?\s*[=≈]?\s*2\.7\d*\s*(?:[로으]?\s*(?:계산|가정|근사|사용|둔다|한다|본다)[가-힣]*)?/gi,
  // "e^{-1} = 0.368", "e^(-2) ≈ 0.135", "e⁻¹ = 0.37"
  /\be\s*(?:\^|\*\*)?\s*[({[]?\s*[-−]\s*\d+(?:\.\d+)?\s*[)}\]]?\s*[=≈]\s*0?\.\d+\s*(?:[로으]?\s*(?:계산|가정|근사|사용|둔다|한다|본다)[가-힣]*)?/gi,
  // "e의 거듭제곱 값은 표와 같다" 류 — 수치 제시 의도
  /\be\s*의\s*(?:근삿값|근사값|어림값)\s*(?:은|는)?\s*[^,.)]*/gi,
];

/** 문구 제거 후 남는 빈 단서 껍데기 정리. */
function tidyOnce(text: string): string {
  return text
    // "(단, )" · "(단,.)" · "(단, , ...)" 처럼 비거나 구분자만 남은 조각 정리
    .replace(/\(\s*단\s*[,\s]*[.。]?\s*\)/g, "")
    .replace(/,\s*,+/g, ",")
    .replace(/\(\s*[,.]\s*/g, "(")
    .replace(/\s*,\s*\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,)])/g, "$1")
    .trim();
}
/** 구두점 정리 후 새로 드러나는 빈 껍데기가 있어 두 번 돌린다. */
function tidy(text: string): string {
  return tidyOnce(tidyOnce(text));
}

/** 한 문자열에서 e 수치 제시 문구를 제거한다. */
export function stripEulerGiven(text: string): string {
  if (!text) return text;
  let out = text;
  for (const re of EULER_VALUE_PATTERNS) out = out.replace(re, "");
  return tidy(out);
}

/** 조건 배열용 — 제거 후 내용이 사라진 항목은 통째로 버린다. */
export function stripEulerGivenList(list: string[] | undefined): string[] | undefined {
  if (!list) return list;
  return list
    .map(stripEulerGiven)
    .filter((s) => s && !/^[\s,.()·-]*$/.test(s));
}
