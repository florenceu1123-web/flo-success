/**
 * 정사각형 폐경로 선적분 → 회전(∇×H) 항목 검증 (임용 11번 정자계).
 *  실행: npx tsx scripts/smokeCurlLineIntegral.mjs
 *
 * (A) 라우팅 — 실제 서버 로그에 남은 Vision 요약(straight_wire_B로 새던 것) 포함.
 * (B) 물리 — 유사·변형 양모드 수기 검산(∮H·dl=2kℓ²x₀, ∮/S=2kx₀, a_n=−a_y, ∇×H=−2kx a_y).
 * (C) 회귀 — 다른 정자계 항목(직선 도선·삼각기둥·면전류선전류·원형 루프)이 안 뺏기는지.
 */
import {
  classifyElectromagnetics,
  detectCurlLineIntegral,
  detectDielectricBoundary,
  detectCoaxTwoDielectric,
  detectDielectricPotentialMode,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

/** runElectromagneticsPipeline의 entryId 강제 체인과 동일한 우선순위. */
function routedEntry(a) {
  if (detectDielectricBoundary(a)) return "dielectric_boundary_field";
  if (detectCoaxTwoDielectric(a)) return "coax_two_dielectric_axial";
  if (detectDielectricPotentialMode(a)) return "dielectric_two_region_cap";
  if (detectCurlLineIntegral(a)) return "curl_from_line_integral";
  return classifyElectromagnetics(a);
}

const CASES = [
  {
    name: "임용11 원본 — 서버 로그 실측 요약 #1 (straight_wire_B로 새던 케이스)",
    expect: "curl_from_line_integral",
    a: {
      topic: "자계 합성 및 경로 적분",
      topicKey: "magnetostatics",
      interpretation:
        "자유공간상에 자계 H=20x²a_z [A/m]가 있고 한 변의 길이가 1인 정사각형 abcd의 중심 좌표가 (x₀,0,0)입니다. 정사각형 경로 a-b-c-d-a를 따라 ∮H·dl을 구하고, 그 결과를 면적 S로 나눈 값과 면의 방향 단위 벡터 a_n을 구한 뒤, x₀=2일 때 ∇×H를 구합니다.",
      relatedConcepts: ["선적분", "회전", "암페어 법칙의 미분형", "단위 벡터", "자계"],
    },
  },
  {
    name: "임용11 원본 — 서버 로그 실측 요약 #2 (topicKey 없음)",
    expect: "curl_from_line_integral",
    a: {
      topic: "자기장과 경로 적분 계산",
      interpretation:
        "자계 H가 주어진 자유 공간에서 정사각형 폐경로를 따라 선적분을 수행하고, 면적으로 나눈 극한으로 자계의 회전(curl)을 구하는 문제입니다.",
      relatedConcepts: ["경로 적분", "자계의 회전", "면적", "단위 벡터"],
    },
  },
  {
    name: "임용11 원본 — 서버 로그 실측 요약 #3 (topicKey=mixed_signal 오판)",
    expect: "curl_from_line_integral",
    a: {
      topic: "자기장과 경로적분 계산",
      topicKey: "mixed_signal",
      interpretation:
        "자유공간의 자계 H=20x²a_z에 대해 정사각형 경로를 따라 ∮H·dl을 구하고 ∇×H를 구하는 문제입니다.",
      relatedConcepts: ["폐경로", "선적분", "회전"],
    },
  },
  {
    // 감지기(detect)는 "회전" 신호가 없어 미발화 → classify의 strongKeywords가 받아야 한다.
    name: "약신호 — Vision이 '회전/∇×'를 흘린 요약 (classify 단독 라우팅)",
    expect: "curl_from_line_integral",
    a: {
      topic: "자기장과 경로적분 계산",
      topicKey: "magnetostatics",
      interpretation: "자유공간의 자계 H가 주어지고 한 변의 길이가 1인 정사각형 경로를 따라 적분을 수행하는 문제입니다.",
      relatedConcepts: ["경로적분", "자계", "정사각형"],
    },
  },
  {
    name: "약신호 — 선적분만 언급된 요약",
    expect: "curl_from_line_integral",
    a: {
      topic: "자계의 선적분",
      topicKey: "magnetostatics",
      interpretation: "자계 H=20x²a_z에 대해 폐경로를 따라 선적분한 값을 면적으로 나눈다.",
      relatedConcepts: ["선적분", "자계", "면적"],
    },
  },
  // ── 회귀: 형제 정자계 항목을 뺏지 않아야 한다 ──
  {
    name: "회귀 — 단순 직선 도선 자기장",
    expect: "straight_wire_B",
    a: {
      topic: "직선 도선에 의한 자기장",
      topicKey: "magnetostatics",
      interpretation: "무한히 긴 직선 도선에 전류 I가 흐를 때 거리 r에서의 자속밀도 B=μ₀I/2πr를 구하는 문제입니다.",
      relatedConcepts: ["앙페르 법칙", "자속밀도", "직선 도선", "전류"],
    },
  },
  {
    name: "회귀 — 자속밀도 삼각기둥 면벡터·가우스",
    expect: "magnetic_flux_prism",
    a: {
      topic: "삼각기둥을 통과하는 자속",
      topicKey: "magnetostatics",
      interpretation: "자속 밀도 B=3aₓ−7a_y−2a_z [Wb/m²]가 주어진 삼각기둥에서 삼각면 oce의 면 벡터와 이 면을 통과하는 자속, 사각면 oabc의 자속, 가우스 법칙으로 경사면 bced의 자속을 구합니다.",
      relatedConcepts: ["면 벡터", "자속", "경사면", "삼각면", "가우스 법칙"],
    },
  },
  {
    name: "회귀 — 면전류 + 선전류 합성 자계",
    expect: "sheet_line_superposition",
    a: {
      topic: "면전류와 선전류에 의한 합성 자계",
      topicKey: "magnetostatics",
      interpretation: "무한 면전류 10a_x [A/m]와 무한 선전류 20πa_x [A]가 있을 때 점 P(-3,2,h)에서 합성 자계 H₁+H₂=k a_z가 되는 h와 k를 구합니다.",
      relatedConcepts: ["면전류", "선전류", "합성 자계", "단위 벡터"],
    },
  },
  {
    name: "회귀 — 두 원형 루프 축상 자계",
    expect: "circular_loop_axis_field",
    a: {
      topic: "두 원형 전류 루프의 축상 자계",
      topicKey: "magnetostatics",
      interpretation: "원형 루프 C₁(반지름 5, 반시계 방향 100A)과 원형 도선 C₂(반지름 3, 시계 방향 I)의 축상 점 P에서 합성 자계 H₃가 주어진 값이 되는 전류 I를 구합니다.",
      relatedConcepts: ["원형 루프", "원형 도선", "합성 자계", "축상"],
    },
  },
  {
    name: "회귀 — 전계 선적분(전위차)은 가져가지 않아야",
    expect: "field_potential_flux",
    a: {
      topic: "전계에 의한 전위차와 전기력선 총수",
      topicKey: "electrostatics",
      interpretation: "전계 E=8(y−L)a_y+4z a_z가 주어질 때 점 P·Q·R 사이의 전위차를 선적분으로 구하고, 평면 S를 통과하는 전기력선 총수로 L을 구합니다.",
      relatedConcepts: ["전위차", "선적분", "전기력선", "전하"],
    },
  },
];

let pass = 0, fail = 0;
console.log("=== (A) 라우팅 ===");
for (const c of CASES) {
  const got = routedEntry(c.a);
  const ok = got === c.expect;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${c.name}\n        expect=${c.expect} got=${got}`);
}

console.log("\n=== (B) 물리 수기 검산 ===");
/** 본문에서 계수 파싱: H = k x^2 a_z, ℓ, x₀. */
function checkInstance(inst, mode) {
  const k = Number(/(\d+)x\^2\\mathbf\{a\}_z/.exec(inst.content)?.[1]);
  const L = Number(/\\ell=(\d+)/.exec(inst.content)?.[1]);
  const circCoef = Number(/\\oint \\mathbf\{H\}\\cdot d\\mathbf\{l\}=(\d+)x_0/.exec(inst.answer)?.[1]);
  const curlCoef = Number(/\}\{S\}=(\d+)x_0/.exec(inst.answer)?.[1]);
  const errs = [];
  if (!Number.isFinite(k) || !Number.isFinite(L)) errs.push("본문에서 k·ℓ 파싱 실패");
  if (circCoef !== 2 * k * L * L) errs.push(`∮H·dl 계수 ${circCoef} ≠ 2kℓ²=${2 * k * L * L}`);
  if (curlCoef !== 2 * k) errs.push(`∮/S 계수 ${curlCoef} ≠ 2k=${2 * k}`);
  if (!inst.answer.includes("\\mathbf{a}_n=-\\mathbf{a}_y")) errs.push("a_n=−a_y 누락");
  // 단계3: 유사=∇×H 값, 변형=x₀ 값. 둘 다 −2k·x₀ 일관성 확인.
  if (mode === "exam_similar") {
    const x0 = Number(/x_0=(\d+)\\,\[\\mathrm\{m\}\]/.exec(inst.question)?.[1]);
    const curlAt = Number(/\\nabla\\times\\mathbf\{H\}=-(\d+)\\,\\mathbf\{a\}_y/.exec(inst.answer)?.[1]);
    if (curlAt !== 2 * k * x0) errs.push(`∇×H ${curlAt} ≠ 2k·x₀=${2 * k * x0}`);
  } else {
    const target = Number(/\\nabla\\times\\mathbf\{H\}=-(\d+)\\,\\mathbf\{a\}_y/.exec(inst.question)?.[1]);
    const x0 = Number(/x_0=(\d+)\\,\[\\mathrm\{m\}\]/.exec(inst.answer)?.[1]);
    if (target !== 2 * k * x0) errs.push(`역산 x₀=${x0} 인데 목표 ${target} ≠ 2k·x₀=${2 * k * x0}`);
  }
  if (!inst.diagram || inst.diagram.geometry !== "square_loop_curl") errs.push("figure(square_loop_curl) 누락");
  const svg = renderEmFieldDiagram(inst.diagram);
  if (!svg.startsWith("<svg") || svg.includes("<pre>")) errs.push("SVG 렌더 실패");
  return { k, L, errs };
}

for (const mode of ["exam_similar", "exam_variant"]) {
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: "curl_from_line_integral" });
    const { k, L, errs } = checkInstance(inst, mode);
    seen.add(`${k}|${L}`);
    if (errs.length) { fail++; console.log(`FAIL  ${mode} seed=${seed}: ${errs.join(" / ")}`); }
    else pass++;
    if (seed === 1) {
      console.log(`  [${mode}] 예시 정답:\n        ${inst.answer.split("\n").join("\n        ")}`);
    }
    // 원본 튜플(k=20·ℓ=1·x₀=2)은 생성 풀에서 제외되어야 한다.
    if (k === 20 && L === 1 && /x_0=2\\,\[\\mathrm\{m\}\]/.test(inst.question + inst.answer)) {
      fail++; console.log(`FAIL  ${mode} seed=${seed}: 원본 튜플이 생성됨`);
    }
  }
  console.log(`  [${mode}] 값 다양성(k|ℓ 조합) = ${seen.size}종`);
}

console.log(`\n=== 결과: ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
