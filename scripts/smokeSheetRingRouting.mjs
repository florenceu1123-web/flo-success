// 면전하 + 원형 링 선전하 합성 전계(임용 12번) 라우팅 견고성 테스트
//
//   사용자 신고: 이 원본으로 "다른 유형의 문제가 생성된다".
//   EM은 텍스트만으로 라우팅되므로 Vision 요약 표현이 흔들리면 형제 항목
//   (직선 선전하 sheet_line_efield / 자기 원형 루프 circular_loop_axis_field 등)에 뺏긴다.
//   → 실행마다 나올 법한 표현 변형을 모아 전부 sheet_ring_efield_ratio로 가는지 확인.
import {
  classifyElectromagnetics,
  detectSheetRingEfield,
  detectDielectricBoundary,
  detectCoaxTwoDielectric,
  detectDielectricPotentialMode,
  detectCurlLineIntegral,
} from "../lib/analysis/classifyElectromagnetics.ts";

// runElectromagneticsPipeline과 동일한 dispatch 순서 — 감지 안전망 포함해서 검증한다.
const dispatch = (a) =>
  detectDielectricBoundary(a) ? "dielectric_boundary_field"
  : detectCoaxTwoDielectric(a) ? "coax_two_dielectric_axial"
  : detectDielectricPotentialMode(a) ? "dielectric_two_region_cap"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : classifyElectromagnetics(a);

const TARGET = "sheet_ring_efield_ratio";
const mk = (topic, interpretation, concepts = []) => ({
  topic,
  interpretation,
  relatedConcepts: concepts,
  fillInTheBlanks: [],
});

const CASES = [
  {
    name: "실측 Vision 출력 (원형 루프 + 합성 전계 둘 다)",
    a: mk(
      "무한 면전하와 원형 루프의 합성 전계",
      "무한 평면에 분포한 면전하와 원형 루프에 분포한 선전하가 주어졌을 때, 특정 점에서 두 전계의 크기 비율이 주어진 조건을 만족하도록 선전하 밀도를 구하고, 그 점에서의 합성 전계를 계산하는 문제이다.",
      ["무한 면전하", "원형 루프 전계", "합성 전계", "전계의 크기 비"],
    ),
  },
  {
    name: "'합성' 없이 '전체 전계'로 의역",
    a: mk(
      "면전하와 원형 루프 선전하에 의한 전계",
      "z=3 평면의 무한 면전하와 z=0 평면의 반지름 √2 원형 루프 선전하가 있을 때, 점 P에서 각 전계를 구하고 크기 비가 2:3이 되는 선전하 밀도 λ를 구한 뒤 점 P에서의 전체 전계를 구한다.",
      ["면전하", "선전하", "전계"],
    ),
  },
  {
    name: "'원형 루프' 대신 '링'/'원형 코일'",
    a: mk(
      "무한 면전하와 링 선전하의 합성 전계",
      "무한 면전하와 반지름 √2인 링(원형 코일)에 균일하게 분포한 선전하가 만드는 전계를 각각 구하고, 크기 비 조건으로 λ를 구한 뒤 합성 전계를 구하는 문제.",
      ["면전하", "링 선전하", "합성 전계"],
    ),
  },
  {
    name: "축상 좌표 중심 서술 (원형 도선)",
    a: mk(
      "축상 합성 전계와 선전하 밀도 결정",
      "z축 위의 점 P(0,0,√2)에서 무한 면전하에 의한 전계와 원형 도선 선전하에 의한 축상 전계를 구하고, 두 크기의 비가 주어진 값이 되도록 선전하 밀도를 결정한 후 합성 전계를 구한다.",
      ["축상 전계", "면전하", "선전하 밀도"],
    ),
  },
  {
    name: "간결 요약 (원형 루프·전계만)",
    a: mk(
      "전계 계산",
      "무한 면전하와 원형 루프 선전하가 점 P에 만드는 전계의 크기 비로부터 λ를 구하고 전계를 합성한다.",
      [],
    ),
  },
  // ── ★ 실제 오라우팅 재현 (사용자 신고): strong 키워드 두 개("원형 루프"·"합성 전계")가
  //    둘 다 빠지면 단일 무한 대전 평면(charged_sheet_field)이 일반어만으로 이겨 가로챈다.
  {
    name: "[신고 재현] '고리'로 표현 + '합성' 없이 서술",
    a: mk(
      "무한 대전 평면과 원형 고리 전하에 의한 전기장",
      "무한 평면에 면전하 밀도 2 C/m²가 균일하게 분포하고, z=0 평면에 반지름 √2인 고리에 선전하 밀도 λ가 분포한다. 점 P에서 각각의 전기장을 구하고 크기 비가 2:3이 되는 λ를 구한 뒤 점 P의 전기장을 구한다.",
      ["가우스 법칙", "면전하", "선전하 밀도"],
    ),
  },
  {
    name: "[신고 재현] 면전하 중심 요약 (원형·합성 모두 누락)",
    a: mk(
      "무한 평면 전하에 의한 전계",
      "무한 평면의 면전하가 만드는 전계와 반지름이 주어진 전하 분포에 의한 전계의 크기 비 조건으로 선전하 밀도를 구하고, 점 P에서의 전계를 구하는 문제.",
      ["면전하", "가우스", "전계"],
    ),
  },

  // ── 형제 유형 회귀 — 이쪽으로 새면 안 된다.
  {
    name: "[회귀] 단일 무한 대전 평면 (선전하·원형 없음)",
    a: mk(
      "무한 대전 평면이 만드는 전기장",
      "면전하 밀도 σ가 균일하게 분포한 무한 대전 평면이 만드는 균일 전기장 E를 가우스 법칙으로 구하는 문제.",
      ["가우스 법칙", "면전하밀도"],
    ),
    expect: "charged_sheet_field",
  },
  {
    name: "[회귀] 무한 직선 선전하 + 면전하 (원형 아님)",
    a: mk(
      "면전하와 무한 직선 선전하의 합성 전계",
      "z=0 평면의 무한 면전하와 y축에 나란한 무한 직선 선전하가 있을 때, 점 P에서 합성 전계가 0이 되는 선전하 밀도를 구한다.",
      ["무한 직선 선전하", "면전하", "합성 전계"],
    ),
    expect: "sheet_line_efield_superposition",
  },
  {
    name: "[회귀] 두 원형 전류 루프 축상 자계 (전계 아님)",
    a: mk(
      "두 원형 루프의 축상 합성 자계",
      "반지름 R₁인 원형 루프 C₁에 흐르는 전류 I₁과 원형 루프 C₂의 전류가 점 P에 만드는 합성 자계를 구하고, 목표 자계가 되도록 전류 I를 구한다.",
      ["원형 루프", "합성 자계", "전류"],
    ),
    expect: "circular_loop_axis_field",
  },
];

let pass = 0;
for (const c of CASES) {
  const expect = c.expect ?? TARGET;
  const got = dispatch(c.a);
  const ok = got === expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}\n    기대=${expect}  실제=${got}`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
