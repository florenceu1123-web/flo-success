// 개념 명칭형 가드의 **양보 조건** 회귀 테스트 (API 없음)
//
//   실측 신고 2건 — 계산·설계 문항이 "법칙/원리" 낱말 때문에 개념 명칭형으로 잡혀
//   회로/EM 경로를 통째로 우회했다:
//     · 2025 전기 A-8 (JK 여기표 + 불함수): "분배 **법칙**" + ㉠ 마커 → unsupported → universal_digital
//     · 임용 11번 EM (면전하+선전하 합성 전계): "가우스 **법칙**"+"중첩 **원리**" → 그림 없는 개념 문제
//   → 도출·설계 구조 신호가 있으면 개념형에서 제외한다. 진짜 명칭형은 그대로 잡혀야 한다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeConceptGuardYield.mjs
import { isPrincipleNamingAnalysis } from "../lib/analysis/deviceIdentity.ts";

let pass = 0, fail = 0;
const expect = (name, a, want) => {
  const got = isPrincipleNamingAnalysis(a);
  if (got === want) { pass++; console.log(`  ✅ ${name} (개념형=${got})`); }
  else { fail++; console.log(`  ❌ ${name} — 개념형=${got}, 기대=${want}`); }
};
const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: [] });

console.log("\n[1] 도출·설계 문항은 개념형이 아니어야 (신고 재현)");
expect("JK 여기표 + 불함수(분배 법칙)", mk(
  "순서 논리 회로 분석",
  "상태 여기를 통해 플립플롭 입력을 구하고 조합 논리 회로의 불 함수를 최소항의 합으로 구한 뒤 분배 법칙으로 합의 곱으로 변환하는 문제이다.",
  ["여기표", "불 함수", "분배 법칙", "플립플롭"],
), false);

expect("EM 면전하+선전하 합성 전계(가우스 법칙·중첩 원리)", mk(
  "무한 면전하와 선전하의 합성 전계",
  "자유 공간에서 무한 면전하와 무한 선전하가 주어졌을 때 특정 점에서 합성 전계가 0이 되는 선전하 밀도를 구하고 다른 점에서의 합성 전계를 계산하는 문제이다.",
  ["무한 면전하", "무한 선전하", "합성 전계", "전계의 중첩 원리", "가우스 법칙"],
), false);

expect("EM 전자기 유도(패러데이 법칙·렌츠 법칙)", mk(
  "시변 자속에 의한 유도 전류",
  "시간에 따라 변하는 자속밀도가 루프를 관통할 때 쇄교 자속과 유도 전류를 구하는 문제이다.",
  ["패러데이 법칙", "렌츠 법칙", "자속 밀도", "유도 기전력"],
), false);

expect("회로 계산(테브난 정리 + 최대 전력 전달)", mk(
  "테브난 등가와 최대 전력",
  "테브난 등가 저항과 등가 전압을 구하고 부하에 최대 전력이 전달되는 조건을 계산하는 문제이다. 5V 전원과 3kΩ 저항이 주어진다.",
  ["테브난 정리", "최대 전력 전달 정리"],
), false);

console.log("\n[2] 진짜 개념 명칭형은 그대로 잡혀야");
expect("원리·법칙의 이름 쓰기", mk(
  "선형 회로 해석의 원리",
  "㉠과 ㉡에서 설명하는 원리 또는 법칙의 이름을 순서대로 쓰는 문제이다.",
  ["키르히호프 전압 법칙", "중첩의 원리"],
), true);

expect("법칙 2개 나열·설명(수치·도출 없음)", mk(
  "회로 해석의 기본 법칙",
  "선형 회로 해석에 필요한 원리 또는 법칙을 설명한 것이다. ㉠은 폐회로의 전압 합에 관한 것이고 ㉡은 여러 전원의 기여를 합하는 것이다.",
  ["키르히호프 법칙", "중첩의 원리"],
), true);

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
