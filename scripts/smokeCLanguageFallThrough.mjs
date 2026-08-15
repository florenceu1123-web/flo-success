// C언어 — switch **fall-through 구조 보존** 게이트 (사용자 신고 2026-08-13, 임용 33번)
//   원본은 case 2에 break가 없어 default로 이어지는데, 생성물이 모든 case에 break를 넣어
//   채점 포인트가 사라졌다. 실행 검증은 "정답↔코드" 일치만 보므로 조용히 통과했다.
//
// ★ 판정은 낱말이 아니라 **구조**여야 한다 — 여기서 그걸 단언한다.
import {
  hasSwitchFallThrough, detectFallThroughIntent, stripCNoise,
  fallThroughIsConsequential, findPartialArrays, zeroTailIsDecorative, stripGiveawayComments,
  detectConcepts, detectSelfRecursion, countEffectiveCodeLines,
} from "../lib/pipeline/runCLanguagePipeline.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };

console.log("\n[1] 원본(임용 33번) — case 2에 break 없음 → fall-through");
const ORIGINAL = `#include <stdio.h>
int main(void)
{
  int score[10] = {1, 2, 3, 4, 5};
  int i, op=2, sum=0;
  switch(op)
  {
    case 1 :
      for(i=0; i<10; i++)
        sum += score[i];
      printf("%d \\n", sum);
      break;

    case 2 :
      for(i=3; i<10; i++)
        sum += score[i];
      printf("%d \\n", sum);

    default :
      for(i=5; i<10; i++)
        sum += score[i];
      printf("%d \\n", sum);
      break;
  }
  return 0;
}`;
ok("원본에서 fall-through 감지", hasSwitchFallThrough(ORIGINAL) === true);

console.log("\n[2] 신고된 생성물 형태 — 모든 case에 break → 구조 소실");
const ALL_BREAK = ORIGINAL.replace(
  `      printf("%d \\n", sum);\n\n    default :`,
  `      printf("%d \\n", sum);\n      break;\n\n    default :`,
);
ok("모든 case에 break면 미감지", hasSwitchFallThrough(ALL_BREAK) === false);

console.log("\n[3] 경계 — 오탐/누락 방지");
// 빈 연속 라벨(묶음 표기)은 fall-through로 세지 않는다.
ok("빈 연속 라벨은 제외", hasSwitchFallThrough(`
  switch(x){
    case 1:
    case 2:
      y = 1;
      break;
    default:
      y = 0;
  }`) === false);
// 마지막 라벨은 흘러갈 곳이 없다.
ok("마지막 라벨의 break 없음은 무관", hasSwitchFallThrough(`
  switch(x){
    case 1:
      y = 1;
      break;
    default:
      y = 0;
  }`) === false);
// return·continue·goto도 switch를 빠져나간다.
for (const [kw, code] of [
  ["return", `switch(x){ case 1: y=1; return 0; case 2: y=2; break; default: y=3; }`],
  ["goto",   `switch(x){ case 1: y=1; goto end; case 2: y=2; break; default: y=3; }`],
]) ok(`${kw}도 종료로 인정`, hasSwitchFallThrough(code) === false);
// 실제 fall-through (중간 라벨에 아무 종료문 없음)
ok("중간 라벨 무종료 → 감지", hasSwitchFallThrough(
  `switch(x){ case 1: y+=1; case 2: y+=2; break; default: y+=3; }`) === true);
// ★ 보수 판정: 중첩 반복문 안의 break도 "종료 있음"으로 센다(놓칠지언정 오탐하지 않는다).
ok("중첩 루프 break는 보수적으로 종료 취급", hasSwitchFallThrough(
  `switch(x){ case 1: for(i=0;i<3;i++){ if(i) break; } case 2: y=2; break; default: y=3; }`) === false);
// 문자열·주석 안의 case/break에 속지 않는다.
ok("문자열 속 break 무시", hasSwitchFallThrough(
  `switch(x){ case 1: printf("break; case 9:"); case 2: y=2; break; default: y=3; }`) === true);
ok("주석 속 break 무시", hasSwitchFallThrough(
  `switch(x){ case 1: y=1; /* break; */ case 2: y=2; break; default: y=3; }`) === true);
ok("switch 없으면 false", hasSwitchFallThrough(`int f(int a){ if(a) return 1; return 0; }`) === false);
ok("stripCNoise가 길이를 보존", stripCNoise(`a="xy"; /*c*/`).length === `a="xy"; /*c*/`.length);

console.log("\n[4] 원본 의도 감지 — 구조 우선, 낱말 보조");
// (a) Vision이 코드를 그대로 보존한 회차 → 구조로 잡는다
ok("코드 보존 회차: 구조로 감지", detectFallThroughIntent(
  `주제: C언어 switch문 실행 결과\n해석: 다음 프로그램의 출력을 묻는다.\n${ORIGINAL}`) === true);
// (b) 코드를 줄여 적고 말로만 서술한 회차 → 낱말로 잡는다
for (const [n, t] of [
  ["break가 없어 … 이어져", "해석: switch(op)에서 case 2는 break가 없어 default로 이어져 두 번 출력한다. switch문 분석"],
  ["fall-through 표기", "해석: switch문에서 fall-through가 일어나 default까지 실행된다."],
  ["break 생략", "해석: case 2에서 break를 생략했기 때문에 아래 default가 이어서 실행된다. switch"],
]) ok(`낱말 감지: ${n}`, detectFallThroughIntent(t) === true);
// (c) 오탐 방지 — switch를 쓰지만 fall-through가 아닌 원본
ok("정상 switch 원본은 미발화", detectFallThroughIntent(
  `주제: C언어 switch문\n해석: 각 case에서 break로 빠져나오는 메뉴 선택 프로그램의 출력을 묻는다.\n${ALL_BREAK}`) === false);
ok("switch 없는 원본은 미발화", detectFallThroughIntent(
  "주제: 포인터와 배열\n해석: 포인터로 배열 합계를 구하고 sizeof로 크기를 계산한다.") === false);

console.log("\n[5] ★ 2차 신고 — 형식만 있고 결과에 관여하지 않는 '장식'을 잡는다");
// 실측 생성물 그대로: 부분 초기화는 했지만 getSum(score, 4)로 앞 4개만 쓰고,
// default는 printf만 해서 fall-through가 결과를 안 바꾼다.
const DECOR = `#include <stdio.h>
int getSum(int score[], int size);
void calculate(int op, int score[], int size);
int main() {
    int score[10] = {3, 5, 7, 2};
    calculate(1, score, 10);
    return 0;
}
void calculate(int op, int score[], int size) {
    int result = 0;
    switch(op) {
        case 0:
            result = getSum(score, size);
            printf("Sum is: %d\\n", result);
            break;
        case 1:
            result = getSum(score, 4);
            printf("Partial sum is: %d\\n", result);
            // No break, fall through
        default:
            printf("Default operation.\\n");
            break;
    }
}
int getSum(int score[], int size) {
    int sum = 0;
    for(int i = 0; i < size; i++) { sum += score[i]; }
    return sum;
}`;
ok("장식 사례: fall-through는 '존재'한다", hasSwitchFallThrough(DECOR) === true);
ok("장식 사례: 그러나 결과에 관여하지 않음 → 불합격", fallThroughIsConsequential(DECOR) === false);
const decorArrs = findPartialArrays(DECOR);
ok("장식 사례: 부분 초기화 배열 인식 (10개 중 4개)",
  decorArrs.length === 1 && decorArrs[0].size === 10 && decorArrs[0].initCount === 4,
  JSON.stringify(decorArrs));
ok("장식 사례: 0 구간을 지나가지 않음 → 불합격", zeroTailIsDecorative(DECOR, decorArrs[0]) === true);
ok("장식 사례: 답 노출 주석 제거", !stripGiveawayComments(DECOR).includes("No break, fall through"));

// 원본은 두 조건을 모두 만족해야 한다.
ok("원본: fall-through가 결과에 관여", fallThroughIsConsequential(ORIGINAL) === true);
const origArrs = findPartialArrays(ORIGINAL);
ok("원본: 부분 초기화 인식 (10개 중 5개)",
  origArrs.length === 1 && origArrs[0].size === 10 && origArrs[0].initCount === 5, JSON.stringify(origArrs));
ok("원본: 0 구간을 실제로 지나감", zeroTailIsDecorative(ORIGINAL, origArrs[0]) === false);

// 경계 — 완전 초기화 배열은 '부분 초기화'가 아니다.
ok("완전 초기화는 부분 초기화 아님", findPartialArrays(`int a[3] = {1,2,3};`).length === 0);
ok("크기 미지정 배열은 대상 아님", findPartialArrays(`int a[] = {1,2,3};`).length === 0);
// 상태를 바꾸는 라벨로 흘러가면 합격.
ok("누적하는 라벨로 흘러가면 합격", fallThroughIsConsequential(
  `int a[6]={1,2}; switch(x){ case 1: s+=a[0]; case 2: s+=a[5]; break; default: s=0; }`) === true);
// 주석 제거가 일반 주석은 건드리지 않는다.
ok("일반 주석은 보존", stripGiveawayComments(`int x=1; // 초기값\n`).includes("// 초기값"));

console.log("\n[6] 형제 게이트 무회귀 (같은 파일의 기존 판정기)");
ok("개념 감지 — 원본은 배열·분기·반복", (() => {
  const c = detectConcepts(ORIGINAL);
  return c.has("array") && c.has("branch") && c.has("loop");
})());
ok("원본에 재귀 없음", detectSelfRecursion(ORIGINAL).length === 0);
ok("유효 줄 수 계산", countEffectiveCodeLines(ORIGINAL) >= 18);

console.log(`\n=== C FALL-THROUGH GATE: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
