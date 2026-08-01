/**
 * 유전체 3형제 감지기 판별 테스트 (임용 24 전위분포 / 임용 20 경계면 굴절 / 임용 22 실린더).
 *  실행: npx tsx scripts/smokeDielectricDetectors.mjs
 *
 * 24번이 "경계면에 전하 없음"이라는 상투적 가정문 때문에 경계 굴절(figure 없는 항목)로
 * 오탈취되던 회귀를 고정한다.
 */
import {
  detectDielectricPotentialMode,
  detectDielectricBoundary,
  detectCoaxTwoDielectric,
} from "../lib/analysis/classifyElectromagnetics.ts";

/** 파이프라인(runElectromagneticsPipeline)의 entryId 강제 체인과 동일한 우선순위. */
function forcedEntry(a) {
  if (detectDielectricBoundary(a)) return "dielectric_boundary_field";
  if (detectCoaxTwoDielectric(a)) return "coax_two_dielectric_axial";
  if (detectDielectricPotentialMode(a)) return "dielectric_two_region_cap";
  return "(classify로 위임)";
}

const CASES = [
  {
    name: "임용24 전위분포 — 가정문에 '경계면' 포함(회귀 케이스)",
    expect: "dielectric_two_region_cap",
    a: {
      topic: "평행판 커패시터의 전위 분포",
      interpretation:
        "두 유전체로 채워진 평행판 커패시터에서 각 유전체 영역의 전위 V(z)를 구하는 문제입니다. 각 유전체의 전계가 E_1=E_0a_z와 E_2=2E_0a_z로 주어지고, z=0과 z=3mm에서의 전위가 각각 0mV와 100mV입니다. 도체의 내부 및 경계면에서 전하는 존재하지 않는다고 가정합니다.",
      relatedConcepts: ["전위 분포", "전계의 적분", "유전체", "경계면", "전위차"],
      topicKey: "capacitance",
    },
  },
  {
    name: "임용24 전위분포 — '경계면' 없는 요약",
    expect: "dielectric_two_region_cap",
    a: {
      topic: "평행판 커패시터 전위 분포",
      interpretation:
        "두 유전체로 채워진 평행판 커패시터에서 각 유전체 영역의 전위 V(z)를 전계의 적분으로 구합니다. 경계 전위가 주어집니다.",
      relatedConcepts: ["전위 분포", "유전체", "전계의 적분"],
      topicKey: "capacitance",
    },
  },
  {
    name: "임용20 경계면 굴절 + 정전 에너지 (회귀 — 계속 잡혀야 함)",
    expect: "dielectric_boundary_field",
    a: {
      topic: "유전체 경계면에서의 전계와 정전 에너지",
      interpretation:
        "z=0 경계면으로 나뉜 두 유전체(z<0: 비유전율 3, z>0: 비유전율 2)에서 E_1이 주어질 때 z>0 영역의 전계 E_2와 단위체적당 정전 에너지 w를 구합니다. 접선 성분 연속과 법선 성분 D 연속의 경계조건을 적용합니다.",
      relatedConcepts: ["경계조건", "접선 성분", "법선 성분", "정전 에너지 밀도", "비유전율"],
      topicKey: "capacitance",
    },
  },
  {
    name: "임용22 실린더 두 유전체 축방향 (회귀)",
    expect: "coax_two_dielectric_axial",
    a: {
      topic: "실린더형 커패시터의 정전용량",
      interpretation:
        "내부 반지름 a, 외부 반지름 b인 동축 실린더형 커패시터에 두 유전체가 축방향으로 나란히 채워져 있을 때 전체 정전용량을 구합니다.",
      relatedConcepts: ["동축", "두 유전체", "정전용량", "병렬"],
      topicKey: "capacitance",
    },
  },
];

let pass = 0;
for (const c of CASES) {
  const got = forcedEntry(c.a);
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}\n    expect=${c.expect}\n    got   =${got}`);
}
console.log(`\n${pass}/${CASES.length} 통과`);
process.exit(pass === CASES.length ? 0 : 1);
