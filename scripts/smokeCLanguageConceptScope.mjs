/**
 * smokeCLanguageConceptScope — C언어 생성물이 **원본의 개념 범위**를 벗어나지 않는지 검사.
 *
 * ★ 왜 필요한가 (사용자 신고 2026-08-05 "생성된 문제가 재귀함수에 관한거야. 본문과 관련된 내용만"):
 *   원본(임용 4번)은 `포인터로 배열 합계 + sizeof/정수 나눗셈`인데 생성물이 **재귀 함수** 문제였다.
 *   원인은 프롬프트 자체 — 난이도 규칙이 "그중 하나는 다른 함수를 호출하거나 **재귀**여야",
 *   변형 모드 예시가 "**반복↔재귀**"였다. 원본에 없는 개념이 들어가면 같은 학습목표를 못 시험한다.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCLanguageConceptScope.mjs
 */
import { detectConcepts, detectSelfRecursion, countEffectiveCodeLines } from "../lib/pipeline/runCLanguagePipeline.ts";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ok   ${m}`); };
const bad = (m) => { fail++; console.log(`  FAIL ${m}`); };

console.log("=== 1. 원본 개념 추출 (임용 4번) ===");
{
  // 실측 Vision 요약에 준하는 원본 서술 + 원본 코드
  const ctx = `C 언어 프로그램의 실행 결과를 쓰는 문제. 배열 data[5]와 포인터 ptr를 이용해 합계를 구하고, ` +
    `sizeof(data)/sizeof(data[0])로 길이를 구한 뒤 result/length를 정수 나눗셈으로 출력한다. for 반복문 사용.`;
  const c = detectConcepts(ctx);
  c.has("pointer") && c.has("array") && c.has("loop") && c.has("sizeof")
    ? ok(`원본 개념 = ${[...c].join(", ")}`)
    : bad(`원본 개념 추출 실패: ${[...c].join(", ")}`);
  c.has("recursion") ? bad("원본에 없는 '재귀'가 개념으로 잡혔다") : ok("재귀는 원본 개념이 아니다 → 금지 대상");
}

console.log("\n=== 2. 재귀 검출은 낱말이 아니라 호출 구조로 ===");
{
  const recursive = `#include <stdio.h>
int fact(int n) {
    if (n <= 1) return 1;
    return n * fact(n - 1);
}
int main(void) { printf("%d", fact(5)); return 0; }`;
  detectSelfRecursion(recursive).includes("fact")
    ? ok("자기 호출 함수(fact) 검출")
    : bad("재귀를 놓쳤다");

  const nonRecursive = `#include <stdio.h>
int sum(int *ptr, int n) {
    int i, t = 0;
    for (i = 0; i < n; i++) t += *(ptr + i);
    return t;
}
int avg(int *ptr, int n) { return sum(ptr, n) / n; }
int main(void) {
    int data[5] = {50, 20, 40, 30, 10};
    printf("%d\\n", sum(data, 5));
    printf("%d\\n", avg(data, 5));
    return 0;
}`;
  detectSelfRecursion(nonRecursive).length === 0
    ? ok("함수가 다른 함수를 호출하는 구조는 재귀 아님(오탐 없음)")
    : bad(`오탐: ${detectSelfRecursion(nonRecursive).join(",")}`);

  // 선언(프로토타입)만 있는 경우 오탐 금지
  const proto = `#include <stdio.h>
int function(int *ptr, int n);
int main(void) { int d[2] = {1,2}; printf("%d", function(d, 2)); return 0; }
int function(int *ptr, int n) { int i, t = 0; for (i = 0; i < n; i++) t += ptr[i]; return t; }`;
  detectSelfRecursion(proto).length === 0
    ? ok("프로토타입 선언은 재귀로 오탐하지 않음")
    : bad(`프로토타입 오탐: ${detectSelfRecursion(proto).join(",")}`);

  // 간접 재귀(a→b→a)는 직접 자기호출이 아니므로 이 검출기는 못 잡는다 — 한계를 명시적으로 단언.
  const indirect = `int b(int n);
int a(int n) { if (n <= 0) return 0; return b(n - 1); }
int b(int n) { return a(n - 1); }`;
  detectSelfRecursion(indirect).length === 0
    ? ok("(한계) 간접 재귀는 미검출 — 프롬프트 규칙이 1차 방어")
    : ok("간접 재귀도 검출됨");
}

console.log("\n=== 3. 분량 계수 무회귀 ===");
{
  const code = `#include <stdio.h>\n\n// 주석\nint main(void) {\n    int x = 1;\n    return 0;\n}`;
  countEffectiveCodeLines(code) === 5
    ? ok("주석·빈 줄 제외 계수 정상(5줄)")
    : bad(`계수 오류: ${countEffectiveCodeLines(code)}`);
}

console.log("\n=== 4. 재귀 원본이면 허용된다 ===");
{
  const ctx = "재귀 함수를 이용해 팩토리얼을 계산하는 프로그램의 실행 결과를 구하는 문제이다.";
  detectConcepts(ctx).has("recursion")
    ? ok("원본이 재귀면 재귀가 개념으로 잡혀 허용된다")
    : bad("재귀 원본을 인식하지 못한다");
}

console.log(`\n=== ${pass}/${pass + fail} pass ===`);
if (fail > 0) process.exit(1);
