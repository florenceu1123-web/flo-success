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
  // ★★ 양보 가드 — **평판 커패시터 문맥이면 dielectric_two_region_cap에 양보**한다 (실측 2026-08-02).
  //   경계 굴절 유형은 무한 경계면의 E₂·에너지밀도를 묻지, **정전용량·전위차 V_d·극판·부피비**를 묻지 않는다.
  //   실측 신고: 임용 11번(나란히 두 유전체 커패시터)에서 Vision이 relatedConcepts에 개념 태그
  //   **"정전 에너지"** 를 붙이자 아래 boundarySignal이 발화해 이 감지기가 통째로 가로챘고,
  //   "경계면 전계 굴절 + 에너지 밀도" 문제가 생성됐다.
  //   ★ 교훈은 CLAUDE.md와 같다 — Vision이 붙인 **개념 태그는 구조적 사실이 아니다**.
  if (/정전\s*용량|정전용량|커패시터|capacitor|축전기|극판|평판\s*도체|부피비/.test(text)) return false;
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
/**
 * **두 무한 면전류** 사이의 자속밀도·스칼라 자위·벡터 자위·사각형 통과 자속 (임용 10번) 감지 — 강제 라우팅용.
 *
 * 구조 시그니처: (벡터 자위 또는 스칼라 자위) + 면전류 — 이 조합은 이 유형 고유다.
 *   · 형제 `sheet_line_superposition`(면전류 + **선전류** 합성 자계)에는 자위(potential) 개념이 없다.
 *   · `curl_from_line_integral`(∮H·dl → ∇×H)에는 면전류·자위가 없다.
 * ★ 자위 낱말이 흔들리는 회차 대비 — "면전류 2개 + 자속(flux)" 조합으로도 인정한다.
 */
export function detectSheetCurrentsVectorPotential(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 전기(전하) 문맥이면 정전계 유형 소관.
  if (/면전하|선전하|점전하|전위\s*함수|전계|전기장/.test(text) && !/면전류|자위|자속밀도/.test(text)) return false;
  // 선전류가 함께 나오면 면전류+선전류 합성 자계(sheet_line_superposition) 소관.
  if (/선전류/.test(text)) return false;

  const sheetCurrent = /면전류|면\s*전류|surface\s*current|\bk_?1\b|\bk_?2\b/.test(text);
  if (!sheetCurrent) return false;

  const potential = /벡터\s*자위|스칼라\s*자위|자위|magnetic\s*potential|v_?m\b/.test(text);
  const flux = /자속|magnetic\s*flux|\\phi|Φ/.test(text);
  return potential || flux;
}

/**
 * **점전하 + 무한 선전하** 합성 전계 → 크기 비로 선전하 밀도 역산 + 힘 (2023 전기 A-10) 감지 — 강제 라우팅용.
 *
 * ★ 실측 신고(2026-08-01): 이 원본이 `sheet_line_efield_superposition`(무한 **면**전하 + 선전하)로
 *   dispatch돼 "비슷해 보이지만 전혀 다른 걸 묻는" 문제가 생성됐다.
 *   두 유형의 차이:
 *     · 이쪽은 **점전하** + 선전하 (면전하 없음) / 저쪽은 **면전하** + 선전하
 *     · 조건이 E=0이 아니라 **전계의 크기 비**
 *     · 마지막이 전계가 아니라 **전하에 작용하는 힘 F**
 *
 * 구조 시그니처(표현 무관): 점전하 + 선전하가 **함께** 등장 + 면전하 없음 + 전계 문맥.
 *   · 단일 점전하(point_charge_field)엔 선전하가 없고, 두 점전하(two_point_charges)엔 선전하가 없다.
 *   · 면전하+선전하(sheet_line_efield_superposition)엔 점전하가 없다.
 *   → 이 조합은 이 유형 고유다.
 */
/**
 * 점전하 + **x축 무한 선전하** → 전계의 크기가 같아지는 전하량 Q_A → 전계가 0이 되는 위치 k
 * (임용 9번 전자기학, `point_line_null_field`) 구조 감지기.
 *
 * ★ 형제 `point_line_charge_force`는 "점전하 + 선전하 + 전계"면 **무조건 true**를 낸다 —
 *   그래서 이 유형은 강제 체인에서 **그보다 먼저** 평가되어야 하고, 그쪽에도 양보 가드를 단다.
 *   판별선 = **요구**: 이쪽은 "크기가 같아지는 전하량"·"전계가 0이 되는 위치", 저쪽은 "크기 비"·"힘 F".
 */
export function detectPointLineNullField(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 자계·전류·유전체·면전하·원형 링 문맥이면 각자 유형 소관 (형제 감지기와 같은 양보선).
  if (/자계|자기장|자장|면전류|선전류|전류밀도/.test(text)) return false;
  if (/유전체|비유전율/.test(text)) return false;
  if (/면전하|면 전하|대전\s*평면|대전평면|무한\s*평면/.test(text)) return false;
  if (/원형|링|고리/.test(text)) return false;

  if (!/전계|전기장|mathbf\{e\}/.test(text)) return false;
  if (!/점전하|점 전하/.test(text)) return false;
  if (!/선전하|선 전하|\\rho_l|ρ_l/.test(text)) return false;

  // ★ 형제 양보 먼저 — "크기 비"가 조건으로 나오면 point_line_charge_force다(그쪽 고유 표현).
  if (/크기\s*비|크기비|크기의\s*비/.test(text)) return false;

  // ★ 요구 — 낱말 하나에 걸지 않는다. Vision이 회차마다 다르게 요약하므로(실측: "크기가 같다"도
  //   "0이 되는"도 안 쓰고 "전기장을 이용해 전하량 Q_A를 구한다"로만 서술한 회차가 있었다)
  //   **구조 신호**를 여러 개 두고 하나만 맞아도 인정한다.
  const equalMag = /크기가\s*같|크기\s*가\s*같|같아지는\s*전하량|\|e_?1\|\s*=\s*\|e_?2\||e_?1\s*=\s*e_?2/.test(text);
  const nullField = /0\s*이?\s*되는|영\(0\)|상쇄|합이\s*0|크기가\s*0/.test(text);
  //   미지가 **점전하의 전하량**이라는 것 자체가 형제와의 판별선이다(형제의 미지는 선전하밀도).
  const chargeUnknown = /전하량\s*(을|를)?\s*(구|계산)|전하량\s*q|q_?a\b|q_\\?mathrm\{a\}/.test(text);
  //   3단계 구조 — 전하를 (0,0,k) 같은 자리로 **이동**시켜 k를 구한다.
  const moveToK = /(이동|옮기|옮겨)/.test(text) && /\(\s*0\s*,\s*0\s*,\s*k\s*\)|k\s*(를|을)?\s*구|위치\s*k/.test(text);
  if (!equalMag && !nullField && !chargeUnknown && !moveToK) return false;

  // 형제 양보 — 힘 F가 주 요구이고 이쪽 구조 신호가 하나도 없으면 point_line_charge_force.
  if (/작용하는\s*힘|힘\s*\\?mathbf\{f\}|힘\s*f\b/.test(text) && !nullField && !equalMag && !moveToK) return false;
  return true;
}

export function detectPointLineChargeForce(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  // ★ 크기 일치 조건·전계 상쇄 위치를 묻는 원본은 point_line_null_field 소관 — 형제 양보.
  //   (이 감지기는 "점전하+선전하+전계"면 무조건 true라 가드가 없으면 통째로 삼킨다.)
  if (detectPointLineNullField(analysis)) return false;

  // 자계·전류 문맥이면 자기 유형 소관.
  if (/자계|자기장|자장|면전류|선전류|전류밀도/.test(text)) return false;
  // 유전체 경계·적층 문맥이면 유전체 유형 소관.
  if (/유전체|비유전율/.test(text)) return false;
  // ★ 면전하가 있으면 면전하+선전하 유형(sheet_line_efield_superposition)에 양보한다.
  if (/면전하|면 전하|대전\s*평면|대전평면|무한\s*평면/.test(text)) return false;
  // 원형 링이면 sheet_ring_efield_ratio 소관.
  if (/원형|링|고리/.test(text)) return false;

  const electric = /전계|전기장|mathbf\{e\}/.test(text);
  if (!electric) return false;

  const pointCharge = /점전하|점 전하|점\s*전하/.test(text);
  const lineCharge = /선전하|선 전하|\\rho_l|ρ_l|선전하\s*밀도/.test(text);
  if (!pointCharge || !lineCharge) return false;

  // 이 유형 고유의 요구 — 크기 비 또는 전하에 작용하는 힘.
  //   ※ 둘 다 흘린 회차라도 "점전하 + 선전하 + 전계"는 이 유형뿐이므로 그대로 인정한다.
  return true;
}

export function detectSheetLineEfieldSuperposition(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;
  // ★ 점전하 + 선전하(면전하 없음)는 point_line_charge_force 소관 — 형제 양보 (2026-08-01 실측 신고).
  if (detectPointLineChargeForce(analysis)) return false;

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

/**
 * **두 무한 직선 도선**(전류 반대 방향)의 합성 자계 → 위치 a 도출 → **단위 길이당 힘** (임용 11번) 감지 — 강제 라우팅용.
 *
 * ★ 실측(2026-08-02): 이 원본이 `straight_wire_B`(단일 도선 B=μ₀I/2πr)로 dispatch돼
 *   도선 1개짜리 단순 계산 문제로 변질됐다. 텍스트에 "무한 도선"·"자기장"이 있으면
 *   단일 도선 항목이 점수로 이기기 때문 — 이 유형 고유 신호는 **도선이 2개**라는 구조다.
 *
 * 구조 시그니처(표현 무관): 직선 도선 2개(A·B 또는 "두 도선") + 자계 문맥
 *   + (단위 길이당 힘 | 합성 자계 | 크기 비) 중 하나.
 *   · 형제 양보: 면전류·선전류(sheet_line_superposition), 원형 루프·코일(circular_loop_axis_field),
 *     동축·원통 도체(coax_line_magnetic_field·cylinder_conductor), 솔레노이드·토로이드,
 *     전하·전계(정전계 유형), 자속밀도 given(면벡터·회전 유형).
 */
export function detectTwoWiresFieldForce(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 전기(전하·전계) 문맥이면 정전계 유형 소관.
  if (/전하|전계|전기장|유전체|정전용량/.test(text)) return false;
  // 형제 자기 유형 양보 — 면전류/선전류·원형 루프·솔레노이드/토로이드·동축/원통 도체.
  if (/면전류|면 전류|선전류|surface\s*current|벡터\s*자위|스칼라\s*자위/.test(text)) return false;
  if (/원형|루프|코일|고리|반지름|반경/.test(text)) return false;
  if (/솔레노이드|토로이드|환상/.test(text)) return false;
  if (/동축|원통\s*도체|도전율|전도율/.test(text)) return false;
  // 자계가 좌표 함수로 주어지고 회전·자속을 구하는 유형(curl·flux) 양보.
  if (/회전|∇\s*×|curl|자속밀도|자속|삼각기둥/.test(text)) return false;
  // 시변 자속·유도 기전력(패러데이) 양보.
  if (/유도\s*기전력|유도\s*전류|시간에\s*따라|패러데이/.test(text)) return false;

  const magnetic = /자계|자기장|자장|앙페르|암페어/.test(text);
  if (!magnetic) return false;

  // 도선이 **2개**인 구조 — "도선 A·B", "두 (개의) 무한 도선", "도선 2개", "평행(한) 두 도선".
  const twoWires =
    /도선\s*a[^가-힣]|도선\s*b[^가-힣]|도선\s*a\b|도선\s*b\b/.test(text) ||
    /두\s*(개의\s*)?(무한\s*)?(직선\s*)?도선|도선\s*2\s*개|평행한?\s*두\s*도선|두\s*평행\s*도선/.test(text);
  if (!twoWires) return false;

  // 이 유형 고유의 요구 — 단위 길이당 힘, 합성 자계, 또는 자계 크기 비.
  const demand =
    /단위\s*길이당|단위길이당|합성\s*자계|합성자계|크기\s*비|자계의\s*비/.test(text);
  return demand;
}

/**
 * **원점에서 꺾인 반무한 직선 도선**(y축 −a_y 유입 → x축 +a_x 유출)의 합성 자계 → 전류 I (임용 11번) 감지.
 *
 * ★ 실측(2026-08-03): 이 원본이 `circular_loop_axis_field`(두 원형 루프 축상 자계)로 dispatch돼
 *   전혀 다른 문제가 생성됐다. Vision이 topic을 **"두 원형 루프의 합성 자계"** 로 요약해 버린 회차라
 *   낱말 기반으로는 형제를 이길 수 없다 — 이 유형 고유 신호는 **전류가 좌표축을 따라 흐르고
 *   원점에서 방향을 바꾼다**는 구조다(루프에는 "축을 따라 무한히 먼 곳"이라는 서술이 없다).
 *
 * 구조 시그니처(표현 무관): 자계 문맥 + 축을 따라 흐르는 선전류 + (무한히 먼 곳 | 반무한 | 원점에서 꺾임).
 *   · 형제 양보: 원형 루프·코일(반지름이 실제로 주어지는 경우), 면전류·솔레노이드/토로이드,
 *     동축·원통 도체, 전하·전계(정전계), 자속·회전, 시변 유도.
 */
export function detectBentSemiInfiniteWires(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 정전계·형제 자기 유형 양보 (detectTwoWiresFieldForce와 같은 기준).
  if (/전하|전계|전기장|유전체|정전용량/.test(text)) return false;
  if (/면전류|면 전류|surface\s*current|벡터\s*자위|스칼라\s*자위/.test(text)) return false;
  if (/솔레노이드|토로이드|환상/.test(text)) return false;
  if (/동축|원통\s*도체|도전율|전도율/.test(text)) return false;
  if (/회전|∇\s*×|curl|자속밀도|자속|삼각기둥/.test(text)) return false;
  if (/유도\s*기전력|유도\s*전류|패러데이/.test(text)) return false;

  const magnetic = /자계|자기장|자장|앙페르|암페어/.test(text);
  if (!magnetic) return false;

  // ★★ 가장 강한 구조 신호 = **서로 다른 두 좌표축이 각각 전류를 갖는다**
  //   ("y축의 전류에 의한 자계"와 "x축의 전류에 의한 자계"). 원형 루프 문제는 전류를 축이 아니라
  //   루프(C₁·C₂)에 붙이므로 이 표현이 나올 수 없다. 실측(2026-08-03)에서 Vision이 이 원본을
  //   "두 원형 전류 루프"로 오요약하면서도 이 문구만은 남겼다 — 그래서 이게 최후의 판별선이다.
  const axes = new Set((text.match(/[xyz]\s*축의?\s*(?:전류|선전류)/g) ?? []).map((m) => m[0]));
  const twoAxisCurrents = axes.size >= 2;

  // 축을 따라 흐르는 선전류 — "y축을 따라"·"x축 방향으로 흐".
  const alongAxis = /[xyz]\s*축을?\s*따라|[xyz]\s*축\s*방향으로\s*흐/.test(text);
  // 반무한 구조 — "무한히 먼 곳"·"반무한"·"원점 O까지/에서"·"꺾".
  const semiInfinite = /무한히\s*먼\s*곳|반무한|원점\s*o?\s*까지|원점\s*o?\s*에서|꺾/.test(text);

  const structural = twoAxisCurrents || (alongAxis && semiInfinite);
  if (!structural) return false;

  // ★ 원형 루프 형제 양보 — 단, 위 축-전류 신호가 있으면 양보하지 않는다.
  //   Vision이 이 원본에 "원형 루프"·"반지름"을 덧붙여 요약해도 축 전류 구조가 우선한다.
  if (!twoAxisCurrents && /반지름|반경|radius/.test(text)) return false;

  // 요구 — 합성 자계 또는 그 조건이 되는 전류.
  return /합성\s*자계|합성자계|자계\s*h_?3|전류\s*i를?\s*구|되는\s*전류|전류를?\s*구/.test(text);
}

/**
 * **원통 도체의 내부 인덕턴스**(임용 10번) 감지 — 강제 라우팅용.
 *
 * ★ 실측(2026-08-03): 레지스트리에 이 유형이 없어 bare "인덕턴스" 낱말로 **솔레노이드 인덕턴스**
 *   (L = μ₀N²A/l) 문제가 생성됐다(사용자 신고). Vision의 요약은 정확했는데(topic="무한 원통 도체의
 *   내부 인덕턴스 계산") 받아 줄 항목이 없었던 것 — 항목 추가 + 구조 감지가 함께 필요하다.
 *
 * 구조 시그니처: (원통/원기둥 도체 문맥) + (내부 인덕턴스 | 쇄교 자속 | 표피 효과 | 도체 내부 자계).
 *   · 형제 양보: 솔레노이드·토로이드·코일 권선(N회), 동축(두 도체), 상호 인덕턴스,
 *     도전율·전위차(cylinder_conductor_current_field), 전하·전계(정전계), 시변 유도.
 */
export function detectCylinderInternalInductance(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  // 형제 양보 — 권선 코일·동축·상호 인덕턴스·도전율 유형·정전계·시변 유도.
  if (/솔레노이드|토로이드|환상|권선|감은|감겨|턴수|권수|\bn회\b/.test(text)) return false;
  if (/동축|외부\s*도체|내부\s*도체와\s*외부/.test(text)) return false;
  if (/상호\s*인덕턴스|mutual/.test(text)) return false;
  if (/도전율|전도율|전위차|저항\s*r을|누설/.test(text)) return false;
  if (/전하|전계|전기장|유전체|정전용량/.test(text)) return false;
  if (/유도\s*기전력|패러데이|시간에\s*따라/.test(text)) return false;

  // 원통 도체 문맥 — "원통(형) 도체"·"원기둥 도체"·"단면이 원형인 도체".
  const cylinder = /원통형?\s*도체|원기둥\s*도체|원통\s*도선|cylindrical\s*conductor|원통형\s*도선/.test(text);
  if (!cylinder) return false;

  // 이 유형 고유 요구 — 내부 인덕턴스·쇄교 자속·표피 효과·도체 내부 자계.
  return /내부\s*인덕턴스|internal\s*inductance|쇄교하?는?\s*자속|쇄교\s*자속|표피\s*효과|도체\s*내부(의)?\s*(자계|자속)/.test(text);
}

/**
 * **무한 면전하 + 무한 직선 선전하 → 합성 전계 벡터로 두 밀도 역산** (임용 12번) 감지 — 강제 라우팅용.
 *
 * ★ 실측(2026-08-03, 사용자 신고): 이 원본이 `sheet_ring_efield_ratio`(면전하 + **원형 링** 선전하,
 *   크기 비 조건)로 dispatch돼 전혀 다른 문제가 생성됐다. Vision이 topic을
 *   **"무한 면전하와 원형 루프 선전하의 합성 전계"** 로 오요약한 회차라 낱말로는 갈리지 않는다.
 *
 * 구조 시그니처: 면전하 + 선전하 + **두 밀도를 동시에 구한다**(C₁·C₂ 또는 "면전하 밀도와 선전하 밀도").
 *   · 형제 양보: **반지름이 실제로 주어진** 원형 링(sheet_ring), 자계·전류 문맥, E=0 조건만 묻는 경우.
 */
export function detectSheetLineEfieldVector(
  analysis: AnalysisResult | null | undefined,
): boolean {
  const text = buildText(analysis).toLowerCase();
  if (!text.trim()) return false;

  if (/자계|자기장|전류|면전류|선전류|솔레노이드|토로이드/.test(text)) return false;
  if (/유전체|정전용량|커패시터/.test(text)) return false;

  const sheet = /면전하|무한\s*평면|무한\s*면/.test(text);
  const line = /선전하|무한\s*선|무한선/.test(text);
  if (!(sheet && line)) return false;

  // ★ 두 밀도를 **동시에** 구하는 것이 이 유형 고유 — 형제(sheet_ring·sheet_line_superposition)는
  //   미지수가 하나(λ 또는 ρ_l)다.
  const twoUnknowns =
    /c_?1\s*(과|와|,|·)\s*c_?2|c₁\s*(과|와|,|·)\s*c₂|면전하\s*밀도\s*(와|과).*선전하\s*밀도|두\s*전하\s*밀도|각각\s*구/.test(text) &&
    /합성\s*전계/.test(text);
  if (!twoUnknowns) return false;

  // 진짜 원형 링 문제(반지름 given)면 양보 — Vision의 "원형 루프" 오요약만으로는 양보하지 않는다.
  if (/반지름|반경|radius/.test(text)) return false;
  return true;
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
