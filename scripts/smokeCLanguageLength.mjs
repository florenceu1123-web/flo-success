/**
 * C언어 지문 분량 게이트 정적 스모크 (API 호출 없음).
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCLanguageLength.mjs
 *
 * 검사 대상
 *  1) countEffectiveCodeLines — 주석·빈 줄 제외 계수 (빈 줄·주석으로 분량 위장 차단)
 *  2) MIN_CODE_LINES 기준으로 원본 수준 코드가 "짧음"으로 잡히는지 (사용자 신고 재현)
 *  3) 확장된 코드가 하한을 통과하는지
 */
import {
  NON_TERMINATING,
  asText,
  findProbeMismatch,
  splitSubAnswers,
  answerMentions,
  countEffectiveCodeLines,
  hasSelfContradiction,
  normalizeStdout,
  MIN_CODE_LINES,
} from "@/lib/pipeline/runCLanguagePipeline";

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`);
  }
}

// ── 1. 계수 규칙 ────────────────────────────────────────────────────────────
console.log("[1] countEffectiveCodeLines");
check("빈 문자열 = 0", countEffectiveCodeLines("") === 0);
check("빈 줄 제외", countEffectiveCodeLines("int a;\n\n\n\nint b;") === 2);
check("한 줄 주석 제외", countEffectiveCodeLines("int a;\n// comment\nint b;") === 2);
check(
  "블록 주석 제외",
  countEffectiveCodeLines("int a;\n/* multi\n   line\n   comment */\nint b;") === 2,
);
check(
  "코드 뒤 꼬리 주석은 그 줄을 살린다",
  countEffectiveCodeLines("int a; // note\nint b;") === 2,
);
check(
  "문자열 안의 //는 주석이 아니다",
  countEffectiveCodeLines('printf("http://x");\nint b;') === 2,
);
check(
  "빈 줄·주석만 100줄이면 0줄",
  countEffectiveCodeLines(Array.from({ length: 50 }, () => "// pad\n").join("")) === 0,
);

// ── 2. 신고 재현: 원본 수준 코드는 하한 미달 ────────────────────────────────
console.log("\n[2] 사용자 신고 재현 (생성물이 원본만큼 짧음)");
const reported = `#include <stdio.h>

int calculate(int n) {
    return 3 * n + n * n * n;
}

int main() {
    for (int i = 0; i < 5; i++) {
        printf("%d\\n", calculate(i));
    }
    return 0;
}`;
const reportedLines = countEffectiveCodeLines(reported);
check(
  `신고 생성물이 하한 미달로 잡힘 (${reportedLines} < ${MIN_CODE_LINES})`,
  reportedLines < MIN_CODE_LINES,
  `실측 ${reportedLines}줄`,
);

const original = `#include <stdio.h>

int pooh(int n);

int main(void)
{
  printf("계산 결과는:\\n");
  int i, now;
  for(i=0; i<5; i++)
    {
      now = pooh(i);
      printf("%d ", now);
    }
  return 0;
}

int pooh(int n)
{
  return(2*n+n*n);
}`;
const originalLines = countEffectiveCodeLines(original);
check(
  `원본 기출도 하한 미달 (${originalLines} < ${MIN_CODE_LINES}) — 확장 대상이 맞다`,
  originalLines < MIN_CODE_LINES,
  `실측 ${originalLines}줄`,
);

// ── 3. 확장 코드는 통과 ─────────────────────────────────────────────────────
console.log("\n[3] 확장된 지문은 하한 통과");
const expanded = `#include <stdio.h>

#define SIZE 6

static int callCount = 0;

int step(int n)
{
    callCount++;
    if (n <= 0) return 1;
    if (n % 2 == 0) return n + step(n - 1);
    return n * 2 - step(n - 2);
}

void fill(int *arr, int size)
{
    int acc = 0;
    for (int i = 0; i < size; i++) {
        acc += step(i);
        arr[i] = acc;
    }
}

int main(void)
{
    int table[SIZE];
    fill(table, SIZE);
    for (int i = 0; i < SIZE; i++) {
        if (table[i] % 3 == 0) {
            printf("[%d] %d\\n", i, table[i]);
        }
    }
    printf("calls=%d\\n", callCount);
    return 0;
}`;
const expandedLines = countEffectiveCodeLines(expanded);
check(
  `확장 지문 통과 (${expandedLines} >= ${MIN_CODE_LINES})`,
  expandedLines >= MIN_CODE_LINES,
  `실측 ${expandedLines}줄`,
);
check("확장 지문에 사용자 정의 함수 2개 이상", /int step\(/.test(expanded) && /void fill\(/.test(expanded));

// ── 4. 표준출력 정규화 (검증 비교의 기준) ──────────────────────────────────
console.log("\n[4] normalizeStdout");
check("CRLF·LF 동일 취급", normalizeStdout("a\r\nb") === normalizeStdout("a\nb"));
check("줄 끝 공백 무시", normalizeStdout("a   \nb\t") === "a\nb");
check("마지막 빈 줄 무시", normalizeStdout("a\nb\n\n") === "a\nb");
check("줄 안의 공백은 유지 (값 차이를 놓치면 안 됨)", normalizeStdout("res: 44") !== normalizeStdout("res:44"));
check("값이 다르면 다르다", normalizeStdout("res: 44") !== normalizeStdout("res: 5"));

// ── 5. 자기모순 풀이 탐지 (실측 실패 재현) ─────────────────────────────────
console.log("\n[5] hasSelfContradiction — 실측 오답 풀이 재현");
const badSolution = `- 초기 result 합계 = 0 + 12 + 2 + 25 + 5 = 44
   - 실제 최종 잘못 계산, 즉 초기 result = 5로 간주한 것이 규칙상 잘못됨.
   - Initial result: 5 (문제상의 착오, 올바른 54값을 무시하고 5로 단순 계산)`;
check("실측 자기모순 풀이를 잡는다", hasSelfContradiction(badSolution) === true);
check(
  "정상 추적 풀이는 오탐하지 않는다",
  hasSelfContradiction(
    "i=0: compute(1)=0 → result=0\ni=1: compute(5)=12 → result=12\n최종 출력: Initial result: 44",
  ) === false,
);
check(
  "'잘못'이 없는 일반 해설도 통과",
  hasSelfContradiction("함수 호출 순서를 따라 배열을 갱신하면 최종 합은 102가 된다.") === false,
);

// ── 6. 소문항 정답 교차 확인 (probe) ───────────────────────────────────────
console.log("\n[6] answerMentions — 소문항 값 대조");
const goodAnswer = "[1] 24\n[2] 0\n3\n8\n15\n24\n35";
const badAnswer = "1. 30\n2. 0\n3\n8\n15\n24\n35";
check("정답에 값이 있으면 통과", answerMentions(goodAnswer, "24") === true);
check("값이 아예 없으면 불일치로 잡는다", answerMentions("[1] 30\n[2] 0\n3\n8", "24") === false);
check("부분 일치 오탐 방지 (24 ≠ 240)", answerMentions("[1] 240", "24") === false);
check("부분 일치 오탐 방지 (24 ≠ 124)", answerMentions("[1] 124", "24") === false);
check("음수 값 대조", answerMentions("[1] -16", "-16") === true);
check("빈 probe는 무조건 통과", answerMentions("아무 답", "") === true);
check("문자열 probe는 포함 검사", answerMentions("[1] abc 출력", "abc") === true);

console.log("\n[7] findProbeMismatch — 소문항 칸별 대조 (실측 오답 재현)");
check("정상 문항은 통과", findProbeMismatch(goodAnswer, ["24"]) === undefined);
check(
  "실측 오답 재현: [1]=30인데 실제 24 → 잡아낸다 (값이 [2] 출력줄에 있어도)",
  findProbeMismatch(badAnswer, ["24"]) === "24",
);
check("probe 없으면 항상 통과", findProbeMismatch(badAnswer, []) === undefined);
check(
  "소문항 2개 probe 모두 대조",
  findProbeMismatch("[1] 7\n[2] 12", ["7", "12"]) === undefined &&
    findProbeMismatch("[1] 7\n[2] 12", ["7", "13"]) === "13",
);
check(
  "번호 없는 정답은 전체를 한 칸으로 본다",
  splitSubAnswers("그냥 답 24").length === 1 && findProbeMismatch("그냥 답 24", ["24"]) === undefined,
);
check(
  "'1.' 형식도 소문항 경계로 인식",
  splitSubAnswers(badAnswer).length === 2,
  `실측 ${splitSubAnswers(badAnswer).length}칸`,
);

// ── 8. 비문자열 응답 강제 변환 (복구 호출 실패 재현) ───────────────────────
console.log("\n[8] asText — 모델이 answer를 객체로 돌려준 회차 재현");
check("문자열은 그대로", asText("[1] 24") === "[1] 24");
check("숫자도 텍스트로", asText(24) === "24");
check("배열은 줄바꿈 결합", asText(["[1] 7", "[2] 12"]) === "[1] 7\n[2] 12");
check(
  "숫자 키 객체는 소문항 번호로 복원",
  asText({ 1: "24", 2: "0\n3\n8" }) === "[1] 24\n[2] 0\n3\n8",
  JSON.stringify(asText({ 1: "24", 2: "0\n3\n8" })),
);
check("null·undefined는 빈 문자열", asText(null) === "" && asText(undefined) === "");

// ── 9. 결함 코드 판정 (무한 재귀 문항 폐기 조건) ───────────────────────────
console.log("\n[9] NON_TERMINATING — 지문 코드 결함 vs 번역 버그 구분");
check("무한 재귀(스택 초과)는 코드 결함", NON_TERMINATING.test("RangeError: Maximum call stack size exceeded"));
check("무한 루프(타임아웃)는 코드 결함", NON_TERMINATING.test("Script execution timed out after 1000ms"));
check("폭주 출력은 코드 결함", NON_TERMINATING.test("output_overflow"));
check(
  "번역 버그(ReferenceError)는 코드 결함이 아니다 — 손 추적으로 fallback",
  NON_TERMINATING.test("ReferenceError: increment is not defined") === false,
);
check("문법 오류도 코드 결함 아님", NON_TERMINATING.test("SyntaxError: Unexpected token") === false);

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
