import type { AnalysisResult } from "@/types";
import { EM_FORMULA_REGISTRY } from "@/lib/generation/topologies/electromagnetics";

/**
 * 전자기학 분류기 — 분석 텍스트(주제·해석·관련개념·빈칸)에서 키워드 점수로
 * 가장 잘 맞는 공식 레지스트리 항목 id를 고른다.
 *
 * 회로처럼 inventory(소자)가 없으므로 텍스트 키워드에만 의존한다.
 * 매칭 실패 시 첫 항목(점전하 전기장)으로 폴백.
 */
export function classifyElectromagnetics(analysis: AnalysisResult | null | undefined): string {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return EM_FORMULA_REGISTRY[0].id;

  let bestId = EM_FORMULA_REGISTRY[0].id;
  let bestScore = -1;
  for (const entry of EM_FORMULA_REGISTRY) {
    let score = 0;
    // 특이적 시그니처(체적 전하 밀도·라플라시안·전위 함수 등) — 하나만 맞아도 강하게 라우팅.
    for (const kw of entry.strongKeywords ?? []) {
      if (text.includes(kw.toLowerCase())) score += 10;
    }
    for (const kw of entry.keywords) {
      if (text.includes(kw.toLowerCase())) score += kw.length >= 4 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = entry.id;
    }
  }
  return bestId;
}

/**
 * 두 유전체 평판 커패시터의 배치(직렬 적층 / 병렬 나란히)를 분석 텍스트에서 감지.
 *
 * 배치는 mode와 무관한 원본의 구조적 속성 — 유사유형이 원본 배치를 보존하려면
 * 생성 전에 이 힌트를 넘겨야 한다([[절대규칙 0]]).
 *  - series(적층/직렬): 유전체가 위아래로 쌓임. 두 영역 전계가 서로 다름(E_1·E_2 각각). 두께비.
 *  - parallel(나란히/병렬): 유전체가 좌우로 나란함. 두 영역 전계 같음. 부피비.
 * 판별 불가 시 null(생성기 기본값=병렬).
 */
export function detectDielectricArrangement(
  analysis: AnalysisResult | null | undefined,
): "series" | "parallel" | null {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return null;
  const seriesKw = ["적층", "위아래", "위 아래", "상하", "직렬", "층층", "포개", "겹쳐", "쌓", "두께비"];
  const parallelKw = ["나란히", "병렬", "좌우", "옆으로", "양옆", "부피비"];
  let s = 0, p = 0;
  for (const k of seriesKw) if (text.includes(k)) s += 1;
  for (const k of parallelKw) if (text.includes(k)) p += 1;
  // 각 영역의 전계가 서로 다름(E_1·E_2를 각각 구함) → 직렬(적층)의 결정적 신호.
  //   병렬(나란히)은 두 영역 전계가 같아 E를 하나로만 다룬다.
  const hasE1 = text.includes("e_1") || text.includes("e₁") || text.includes("|e_1|") || text.includes("mathbf{e}_1");
  const hasE2 = text.includes("e_2") || text.includes("e₂") || text.includes("|e_2|") || text.includes("mathbf{e}_2");
  if (hasE1 && hasE2) s += 1;
  if (s > p) return "series";
  if (p > s) return "parallel";
  return null;
}

/**
 * 두 유전체 커패시터가 "전위 분포" 하위구조(임용 24번)인지 감지.
 *
 * 이 구조는 각 영역 전계(E₀ 비율)와 경계 전위가 주어지고 각 유전체 영역의 전위 V(z)를
 * z의 1차식으로 도출하는 유형 — 전하·정전용량(임용 10·11번) 구조와 직교하며, mode와도
 * 독립인 원본의 구조적 속성이라 유사유형이 보존해야 한다([[절대규칙 0]]).
 *
 * 신호: "전위"(를 구함) + ("적분"|"V(z)"|"영역의 전위"|"전위 분포"). 전하·정전용량 중심이면
 * 제외("정전용량"/"표면전하밀도"가 주 대상인 경우). 판별 불가 시 false.
 */
export function detectDielectricPotentialMode(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  // 유전체 문맥 필수 — 단일 전위함수(V(x,y,z)→ρ_v) 유형 등과 확실히 구분.
  if (!text.includes("유전체")) return false;
  const hasPotential = text.includes("전위");
  const distributionSignal =
    text.includes("적분") ||
    text.includes("v(z)") ||
    text.includes("영역의 전위") ||
    text.includes("각 유전체") && text.includes("전위") ||
    text.includes("전위 분포") ||
    text.includes("전위분포");
  // 전하·정전용량이 주 대상이면 전위 분포 유형이 아니다(임용 10·11번).
  const chargeCentric = text.includes("정전용량") || text.includes("표면전하밀도") || text.includes("표면 전하밀도");
  return hasPotential && distributionSignal && !chargeCentric;
}

/**
 * 실린더형(동축) 커패시터에 두 유전체가 축방향으로 나란히(병렬) 채워진 유형인지 감지(임용 22번).
 *
 * classifyElectromagnetics는 "두 유전체" 키워드로 평판형 dielectric_two_region_cap에,
 * 또는 단일 동축 coax_capacitance에 오분류하기 쉬움 → 명확한 시그니처(실린더/원통/동축 +
 * 두 유전체)면 pipeline에서 entryId를 강제한다.
 */
export function detectCoaxTwoDielectric(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  const cylinder =
    text.includes("실린더") || text.includes("원통") || text.includes("동축") || text.includes("cylind") || text.includes("coax");
  const twoDielectric =
    text.includes("두 유전체") || text.includes("두 개의 유전체") || text.includes("2개의 유전체") ||
    text.includes("두 종류의 유전체") ||
    (text.includes("유전체") && (text.includes("ε₁") || text.includes("ε_1") || text.includes("\\varepsilon_1")) &&
      (text.includes("ε₂") || text.includes("ε_2") || text.includes("\\varepsilon_2"))) ||
    (text.includes("유전체") && (text.includes("정전용량 합산") || text.includes("각 구간") || text.includes("나란히")));
  // 커패시터/정전용량 문맥.
  const capContext = text.includes("커패시터") || text.includes("축전기") || text.includes("정전용량") || text.includes("전기용량");
  return cylinder && twoDielectric && capContext;
}

/**
 * 유전체 경계면 전계 굴절 + 정전 에너지 유형인지 감지(임용 20번).
 *
 * 두 유전율 영역(z<0·z>0)이 경계면으로 나뉘고, 한 영역의 전계 E가 주어져 다른 영역의 전계와
 * 정전 에너지를 구하는 유형 — 경계조건(접선 E 연속·법선 D 연속) 물리. classifyElectromagnetics는
 * 벡터·전계 표기 때문에 자속 면벡터(flux_prism)·평판 두 유전체 등으로 오분류하기 쉬움 → 강제.
 */
export function detectDielectricBoundary(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  // ★★ 양보 가드 — 전위 분포 유형(임용 24번)에 양보한다.
  //   24번은 "경계면에 전하가 존재하지 않는다"(모든 유전체 문제의 상투적 가정문)와
  //   E₁·E₂ 표기(E₁=E₀a_z·E₂=2E₀a_z)를 그대로 갖고 있어 경계 굴절로 오인되기 쉽다.
  //   (실측: Vision이 가정문을 요약에 옮기면 6회 중 5회 이 감지기가 24번을 가로채
  //    figure 없는 dielectric_boundary_field로 변질시켰다.)
  if (detectDielectricPotentialMode(analysis)) return false;
  // 두 유전율 영역 + 경계.
  const twoRegions =
    (text.includes("z<0") || text.includes("z < 0") || text.includes("z>0") || text.includes("z > 0")) ||
    text.includes("경계면") || text.includes("경계 조건") ||
    ((text.includes("비유전율") || text.includes("유전율")) && (text.includes("영역") || text.includes("두 유전체")));
  // ★ 전계 굴절 고유 시그니처 — bare "경계면"·"E₁·E₂ 표기"는 신호가 아니다:
  //   전자는 모든 유전체 문제에 등장하는 가정문이고, 후자는 적층 전위 분포(24번)에도 그대로 나온다.
  //   실제 판별자는 굴절·접선/법선 성분 연속·정전 에너지(밀도) — 이것들만 남긴다.
  //   (여기서 놓쳐도 classifyElectromagnetics의 strongKeywords가 정상 라우팅한다 — 강제만 포기.)
  const boundarySignal =
    text.includes("굴절") || text.includes("접선") || text.includes("법선") ||
    text.includes("정전 에너지") || text.includes("정전에너지") ||
    text.includes("에너지 밀도") || text.includes("단위체적당");
  // 자속/자계(면벡터) 유형은 제외 — 이건 전계·유전체 문제.
  const magnetic = text.includes("자속") || text.includes("자계") || text.includes("면벡터") || text.includes("면 벡터");
  const hasDielectric = text.includes("유전") || text.includes("전계") || text.includes("전기장");
  return twoRegions && boundarySignal && hasDielectric && !magnetic;
}

/**
 * 시변 자속에 의한 전자기 유도 문맥인지 (공용 판별).
 *
 * ★ 정자계 항목(curl_from_line_integral·straight_wire_B 등)과 갈라내는 핵심 축은 **시간 변화**다.
 *   패러데이 유도 문제는 (1) 자속이 시간의 함수이고, (2) 유도 기전력·유도 전류를 구하며,
 *   (3) 폐회로에 저항이 달려 있다. 정자계 문제엔 이 셋이 모두 없다.
 */
function isTimeVaryingInduction(textLower: string): boolean {
  const t = textLower;
  const inductionKw =
    t.includes("쇄교") || t.includes("유도 기전력") || t.includes("유도기전력") ||
    t.includes("유도 전류") || t.includes("유도전류") || t.includes("패러데이") ||
    t.includes("faraday") || t.includes("렌츠") || t.includes("기전력");
  const timeVarying =
    t.includes("시변") || t.includes("시간에 따라") || t.includes("시간에 대해 변") ||
    t.includes("변하는 자속") || t.includes("변화하는 자속") || t.includes("자속의 시간") ||
    t.includes("시간 변화") || t.includes("d\\phi") || t.includes("dφ/dt") || t.includes("dphi") ||
    t.includes("sin(t") || t.includes("\\sin(t") || t.includes("sin t") || t.includes("cos(t");
  // 유도 전류·기전력을 **구하는** 문제면 시간 변화 표현이 흐려도 유도 유형이다.
  const asksInduced = t.includes("유도 전류") || t.includes("유도전류") || t.includes("유도 기전력") || t.includes("유도기전력");
  return inductionKw && (timeVarying || asksInduced);
}

/**
 * 시변 자속 → 쇄교 자속 Φ(t)·유도 전류 i(t) (flux_loop_induced_current) 감지 — 강제 라우팅용.
 *
 * ★ 실측 회귀(2026-07-28 사용자 신고 "이 문제 생성했었는데 다시 하니까 안돼"): 이 항목은 이미
 *   구현돼 있었는데, 나중에 추가된 `curl_from_line_integral`의 strong 키워드(bare "폐경로"·"선적분"·
 *   "회전")가 Vision의 패러데이 서술과 겹쳐 점수로 이겨 버렸다(로그 dispatch entryId 실측).
 *   Vision 표현이 흔들려도 잡히도록 **구조 시그니처**로 강제한다.
 *
 * 시그니처: 전자기 유도 문맥(쇄교·유도 기전력/전류·패러데이) + 시간 변화 + 회로 요소(저항·루프·회로).
 *   ★ 양보: 도체 막대가 **속도 v로 이동**하는 운동 기전력 유형(moving_rod_emf)은 제외.
 *     (원본처럼 "운동 기전력은 무시"라고 적혀 있으면 이 유형이 맞다.)
 */
export function detectFluxLoopInducedCurrent(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  if (!isTimeVaryingInduction(text)) return false;
  // 폐회로 + 저항이 있는 루프 문제 (자속만 구하는 기하 문제와 구분).
  const loopCircuit =
    text.includes("저항") || text.includes("루프") || text.includes("회로") ||
    text.includes("완전 도체") || text.includes("도체 루프") || text.includes("ω") || text.includes("\\omega");
  if (!loopCircuit) return false;
  // 운동 기전력(막대가 v로 이동)이 주체면 moving_rod_emf에 양보 — 단 "무시한다"면 이 유형.
  const movingRod =
    (text.includes("막대") || text.includes("도체봉") || text.includes("도선이 이동") || text.includes("속도 v")) &&
    !(text.includes("운동 기전력은 무시") || text.includes("운동 기전력을 무시") || text.includes("운동 기전력 무시"));
  if (movingRod) return false;
  return true;
}

/**
 * 정사각형 폐경로 선적분 → 회전(∇×H) 유형인지 감지(임용 11번).
 *
 * 자계 H(x)가 주어지고 폐경로 선적분 ∮H·dl → 면적으로 나눈 극한 → ∇×H(암페어 법칙 미분형)를
 * 단계별로 구하는 유형. classifyElectromagnetics는 "자계·자기장" 일반어 때문에
 * straight_wire_B(직선 도선 B=μ₀I/2πr) 등 다른 정자계 항목으로 오분류하기 쉽다
 * (실측: 이 원본이 straight_wire_B로 dispatch돼 전혀 다른 문제가 생성됨) → 강제.
 *
 * 신호: (선적분·경로 적분·폐경로·∮) + (회전·curl·∇×·암페어 법칙 미분형) 또는
 *       (정사각형 경로 + 면적으로 나눔). 전하·전계 중심(정전계)이면 제외.
 */
export function detectCurlLineIntegral(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  // ★ 양보 가드 (2026-07-28, 사용자 신고 회귀) — 시변 자속 전자기 유도(flux_loop_induced_current)에 양보.
  //   패러데이 문제를 Vision이 "폐경로를 따라 선적분"·"∇×E=−∂B/∂t의 회전"처럼 요약하면 이 감지기·
  //   curl 항목의 strong 키워드가 그대로 발화해 정자계 ∇×H 문제로 변질된다(실측: dispatch entryId=
  //   curl_from_line_integral). curl 유형은 **시간 무관 정자계**이고 저항·유도 전류가 없다.
  if (isTimeVaryingInduction(text)) return false;
  // 자계·자기장 문맥 필수 — 전계 선적분(전위차, field_potential_flux)과 구분.
  const magnetic =
    text.includes("자계") || text.includes("자기장") || text.includes("자장") ||
    text.includes("mathbf{h}") || text.includes("h·dl") || text.includes("h \\cdot");
  if (!magnetic) return false;
  // 폐경로 선적분 신호.
  const lineIntegral =
    text.includes("선적분") || text.includes("선 적분") ||
    text.includes("경로 적분") || text.includes("경로적분") ||
    text.includes("폐경로") || text.includes("폐 경로") || text.includes("∮") ||
    text.includes("oint") || text.includes("정사각형 경로") || text.includes("적분 경로");
  // 회전(curl) 신호 — 면적으로 나눈 극한도 같은 유형의 고유 신호.
  const curlSignal =
    text.includes("회전") || text.includes("curl") || text.includes("∇×") ||
    text.includes("nabla \\times") || text.includes("암페어 법칙의 미분형") ||
    text.includes("미분형") || text.includes("면적으로 나") || text.includes("단위 면적당");
  // 전하·정전계 중심이면 제외(전위차 선적분 유형 등에 양보).
  const electrostatic =
    text.includes("전하") || text.includes("전위차") || text.includes("정전 에너지") || text.includes("유전체");
  return lineIntegral && curlSignal && !electrostatic;
}

/**
 * 무한 면전하 + 원형 링(고리) 선전하의 축상 합성 전계(임용 12번, sheet_ring_efield_ratio) 감지.
 *
 * ★ 실측 오라우팅(사용자 신고): Vision 요약이 "원형 루프"·"합성 전계"라는 strong 키워드를
 *   둘 다 흘리면(예: "고리"로 표현 + "합성" 생략), 일반어("면전하·무한 평면·가우스")만으로
 *   charged_sheet_field(단일 대전 평면)나 sheet_line_efield_superposition(무한 직선 선전하)이
 *   이겨 전혀 다른 문제가 생성된다. → 표현에 흔들리지 않는 구조 시그니처로 강제한다.
 *
 * 구조 시그니처: 면전하 + 선전하 + 원형(링·고리·루프·반지름) + 전계 문맥.
 *   · 단일 대전 평면 문제엔 선전하가 없고,
 *   · 무한 직선 선전하 문제엔 원형 구조가 없어
 *   세 조건 동시 충족은 이 유형 고유다. 자계·전류 문맥이면 자기 원형 루프에 양보.
 */
export function detectSheetRingEfield(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 전계(정전계) 문맥 — 자계·전류 문제(circular_loop_axis_field 등)엔 양보.
  const magnetic =
    text.includes("자계") || text.includes("자기장") || text.includes("자장") ||
    text.includes("면전류") || text.includes("선전류") || text.includes("전류밀도");
  if (magnetic) return false;
  const electric =
    text.includes("전계") || text.includes("전기장") || text.includes("mathbf{e}");
  if (!electric) return false;

  const sheet =
    text.includes("면전하") || text.includes("면 전하") ||
    text.includes("대전 평면") || text.includes("대전평면") || text.includes("무한 평면");
  const lineCharge =
    text.includes("선전하") || text.includes("선 전하") ||
    text.includes("\\lambda") || text.includes("λ");
  const ring =
    text.includes("원형") || text.includes("링") || text.includes("고리") ||
    text.includes("루프") || text.includes("반지름") || text.includes("반경");

  return sheet && lineCharge && ring;
}

/**
 * 무한 직선 **원통 도체**(도전율 σ) → 내부 전계·전류밀도·전류 → **외부 자계** (임용 12번) 감지 — 강제 라우팅용.
 *
 * ★ 실측 신고(2026-07-29): 이 원본이 형제 **coax_resistance**(동축 원통 두 도체 *사이* 저항 R)로
 *   dispatch돼 전혀 다른 문제가 생성됐다. 두 항목 모두 "도전율 σ·원통·전류밀도"를 쓰므로
 *   키워드 점수로는 갈리지 않는다 → **구조**로 가른다.
 *
 * 판별: 단일 원통(동축·두 도체·내외부 반경 a·b가 **아님**) + 도전율 + (외부 자계 | 전위차 V_AB | 전류 I).
 */
export function detectCylinderConductorField(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  // 동축(두 도체 사이) 구조면 coax_resistance/coax_capacitance 소관.
  if (/동축|두\s*도체|내부\s*도체|외부\s*도체|내도체|외도체|반지름\s*a[^\w]|반경\s*a[^\w]/.test(text)) return false;
  const conductivity = /도전율|전도율|\\sigma|σ/.test(text);
  const cylinder = /원통|원기둥|cylind/.test(text);
  if (!conductivity || !cylinder) return false;
  // 이 유형의 최종 목표 = 외부 자계 또는 (전위차 ↔ 전류) 사슬.
  const target = /외부에서의?\s*자계|외부\s*자계|자계의?\s*크기|앙페르/.test(text) ||
    (/전위차|v_?\{?ab/.test(text) && /전류\s*밀도|전류밀도|전류\s*i\b/.test(text));
  return target;
}

/**
 * **동축선로**의 영역별 자계 (내부 도체 +a_z / 외부 도체 −a_z, 임용 11번) 감지 — 강제 라우팅용.
 *
 * ★ 실측 신고(2026-07-31): 이 원본이 **curl_field_current_density**(∇×H → J)로 dispatch돼
 *   전혀 다른 문제가 생성됐다(서버 로그 entryId 확인, totalIssues=0으로 조용히 통과).
 *   Vision은 topic="동축 도체의 자기장 해석"으로 정확히 읽었는데, 형제 동축 항목
 *   (coax_capacitance·coax_resistance)과 자계 항목들이 키워드를 나눠 가져 점수로 안 갈린다
 *   → **구조**(동축 = 내부/외부 도체 2개 + 자계 + 영역 구분)로 강제한다.
 *
 * 판별: 동축(또는 내부·외부 도체 쌍) + 자계/앙페르 + 영역 구분 신호.
 *   ★ 양보: 정전용량·유전율·저항·도전율이 주제면 형제 전기 항목(coax_capacitance·coax_resistance).
 */
export function detectCoaxLineMagneticField(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 전기적 양(정전용량·저항)이 주제면 형제 동축 항목 소관 — 자계 항목이 가로채지 않는다.
  if (/정전\s*용량|커패시턴스|축전기|유전율|\\varepsilon|비유전율/.test(text)) return false;
  if (/저항\s*r\b|도전율|전도율|옴의?\s*법칙/.test(text)) return false;

  // 동축 구조: "동축" 낱말 또는 내부·외부 도체 쌍.
  const coaxial =
    /동축|coax/.test(text) || (/내부\s*도체|내도체/.test(text) && /외부\s*도체|외도체/.test(text));
  if (!coaxial) return false;

  // 자계가 목표.
  const magnetic = /자계|자기장|자장|앙페르|암페어|\bh_?[123]\b|\\mathbf\{h\}/.test(text);
  if (!magnetic) return false;

  // 영역 구분(안쪽/사이/바깥) 또는 쇄교 전류 — 이 유형의 고유 구조.
  const regions =
    /안쪽|사이에서의|바깥|영역|0\s*<\s*ρ|ρ\s*>\s*b|a\s*<\s*ρ|쇄교/.test(text) ||
    /반지름의?\s*차/.test(text);
  return regions;
}

/**
 * 직각 좌표계 위 **두 점전하** → 점 P의 합성 전계 크기·전위 (임용 4번) 감지 — 강제 라우팅용.
 *
 * ★ 실측 신고(2026-07-29): 이 원본이 **point_charge_field(단일 점전하)** 로 dispatch돼 전혀 다른
 *   문제가 생성됐다(서버 로그 entryId 확인). 두 항목의 키워드("점전하·전계·전위")가 거의 같아
 *   점수로는 갈리지 않는다 → 구조(전하가 **2개** + 합성/좌표)로 강제한다.
 *
 * 시그니처: 점전하 문맥 + (두 점전하 | Q_A·Q_B | 점전하 2개) + (전계 또는 전위).
 *   ★ 양보: "힘"이 주제면 coulomb_force(두 전하 사이 정전기력), 면전하·선전하가 있으면 그쪽 항목.
 */
export function detectTwoPointCharges(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  if (!text.includes("점전하") && !text.includes("점 전하")) return false;
  // 면전하·선전하·자계 유형은 각자 항목 소관.
  if (/면전하|선전하|면전류|선전류|자계|자기장/.test(text)) return false;
  // 두 전하 사이의 **힘**을 구하는 문제는 coulomb_force.
  if (/정전기력|쿨롱\s*힘|전기력의?\s*크기|힘\s*f\b/.test(text) && !/전위|전계의\s*크기/.test(text)) return false;

  const twoCharges =
    /두\s*점전하|두\s*개의\s*점전하|점전하\s*2개|q_?a[^a-z]|q_?b[^a-z]|q_?1[^0-9]|q_?2[^0-9]/.test(text);
  const fieldOrPotential = /전계|전기장|전위/.test(text);
  return twoCharges && fieldOrPotential;
}

/**
 * 무한 면전하 + 무한 **직선** 선전하 합성 전계(임용 11번, sheet_line_efield_superposition) 감지 — 강제 라우팅용.
 *
 * ★ 실측 신고(2026-07-29): 이 원본이 **potential_to_charge_density**(전위 함수 V(x,y,z)→ρ_v)로
 *   dispatch돼 완전히 다른 문제가 생성됐다(서버 로그 entryId 확인). 이 항목의 strong 키워드는
 *   "합성 전계" 하나뿐이라, Vision 요약이 "전위·전계"를 많이 쓰면 점수로 밀린다
 *   (메모리에도 "실측 4중 1 오분류"로 기록된 상습 경쟁 항목).
 *
 * 구조 시그니처(표현 무관): 면전하 + 선전하 + 전계 문맥.
 *   · 단일 대전 평면 문제엔 선전하가 없고, 전위함수 문제엔 면전하·선전하가 없다 → 둘 동시는 이 유형 고유.
 *   ★ 양보: 원형/링이면 sheet_ring_efield_ratio, 자계·전류면 자기 유형, 유전체 경계면 유전체 유형.
 */
export function detectSheetLineEfieldSuperposition(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 자계·전류 문맥이면 자기 유형(sheet_line_superposition 등)에 양보.
  if (
    text.includes("자계") || text.includes("자기장") || text.includes("자장") ||
    text.includes("면전류") || text.includes("선전류") || text.includes("전류밀도")
  ) return false;
  // 유전체 경계·적층 문맥이면 유전체 유형에 양보.
  if (text.includes("유전체") || text.includes("비유전율")) return false;

  const electric =
    text.includes("전계") || text.includes("전기장") || text.includes("mathbf{e}");
  if (!electric) return false;

  const sheet =
    text.includes("면전하") || text.includes("면 전하") ||
    text.includes("대전 평면") || text.includes("대전평면") || text.includes("무한 평면");
  const lineCharge =
    text.includes("선전하") || text.includes("선 전하") ||
    text.includes("\\rho_l") || text.includes("ρ_l");
  // 원형 링이면 형제 항목(sheet_ring_efield_ratio) 소관.
  const ring =
    text.includes("원형") || text.includes("링") || text.includes("고리") ||
    text.includes("반지름") || text.includes("반경");

  return sheet && lineCharge && !ring;
}

function buildText(a: AnalysisResult | null | undefined): string {
  if (!a) return "";
  const parts: string[] = [];
  if (a.topic) parts.push(a.topic);
  if (a.interpretation) parts.push(a.interpretation);
  if (a.relatedConcepts?.length) parts.push(a.relatedConcepts.join(" "));
  if (a.fillInTheBlanks?.length) parts.push(a.fillInTheBlanks.map((f) => `${f.sentence} ${f.answer}`).join(" "));
  if (a.topicKey) parts.push(a.topicKey);
  return parts.join("\n");
}
