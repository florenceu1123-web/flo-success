import type { GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 전자기학(electromagnetics) — 규칙 기반 범용 생성기.
 *
 * 회로(netlist·MNA)와 달리 전자기학은 "공식 + 기하"가 핵심이다. 따라서 archetype을
 * 유형마다 새로 추가하는 대신([[feedback_universal_path]]), **공식 레지스트리**(FORMULA_REGISTRY)에
 * 물리 법칙을 한 번 등록하고, 파라미터만 결정론적으로 변형해 유사·변형 문제를 만든다.
 *
 *  - exam_similar(기출유사유형): 같은 공식·기하, 수치만 변경.
 *  - exam_variant(기출변형유형): 같은 물리 원리, "구하는 양"을 바꿈(예: 전기장→전위, 정전용량→에너지).
 *    변형 타깃이 없는 항목은 다른 수치로 변형.
 *
 * 모든 값·정답·풀이는 결정론(GPT 없음). 그림은 EM 전용 도식 렌더러(em_field_diagram)가 그린다.
 */

// ── 물리 상수 ────────────────────────────────────────────────────────
const K = 9.0e9; // 쿨롱 상수 N·m²/C²
const EPS0 = 8.85e-12; // 진공 유전율 F/m
const MU0 = 4 * Math.PI * 1e-7; // 진공 투자율 T·m/A
const C_LIGHT = 3.0e8; // 광속 m/s

// ── EM 도식(기하) 종류 — 렌더러 dispatch 키 ──────────────────────────
export type EmGeometryKind =
  | "point_charge" // 점전하 + 방사형 전계 + 측정점 P
  | "two_charges" // 두 점전하 (쿨롱 힘)
  | "line_charge" // 무한 선전하 + 방사 전계
  | "charged_sheet" // 무한 대전 평면 + 균일 전계
  | "parallel_plates" // 평행판 커패시터
  | "straight_wire" // 무한 직선 도선 + 원형 자기장
  | "solenoid" // 솔레노이드
  | "toroid" // 토로이드
  | "moving_rod" // 자기장 속 운동 도체봉 (운동 기전력)
  | "flux_loop_resistor" // 시변 자속 관통 고정 ㄷ자 도체 루프 + 저항 (패러데이 변압기 기전력 → Φ(t)·i(t))
  | "current_in_field" // 자기장 속 전류 도선 (자기력)
  | "em_wave" // 전자파 진행
  | "potential_field" // 전위 함수 V(x,y,z) → E=−∇V → ρ_v=−ε₀∇²V (해석 흐름 도식)
  | "coax" // 동축 케이블 단면 (내부 도체 + 유전체 + 외부 도체)
  | "sphere_cap" // 구 커패시터 (동심 구 a·b) 또는 고립 도체구
  | "mutual_coils" // 공통 철심 위 1차·2차 코일 (상호 인덕턴스)
  | "plane_flux" // 3D 좌표계 + 평면 S + 점 P·Q·R (전계 given → 전위차·전기력선 총수 → L)
  | "dielectric_slab" // 두 평판 도체 사이 서로 다른 유전체 2개 (병렬/직렬) 커패시터
  | "flux_prism" // 3D 삼각 프리즘 (자속밀도 B given → 각 면 면벡터·자속·가우스 법칙)
  | "sheet_line_superposition" // 무한 면전류 평면 + 무한 선전류 도선 → 합성 자계 (h·k 도출)
  | "circular_loops_axis" // z축 위 두 원형 전류 루프 (축상 자계 합성 → 전류 I 도출)
  | "sheet_line_efield" // 무한 면전하 평면 + 무한 선전하 도선 → 합성 전계 (E=0 조건 → ρ_l 도출)
  | "coax_resistor" // 동축 원통 (도전율 σ 물질) → 두 도체 사이 저항 R (J·E·V 경유)
  | "coax_two_dielectric" // 실린더형 커패시터에 두 유전체 축방향 나란히(ε₁ over L₁·ε₂ over L₂, 병렬)
  | "sheet_ring_efield" // 무한 면전하 + 원형 링 선전하 → 축상 합성 전계 (비율 조건 → λ 도출)
  | "square_loop_curl" // 자계 H(x) 속 정사각형 폐경로 (∮H·dl → 면적 극한 → ∇×H)
  | "two_charges_axes" // 직각 좌표계 위 두 점전하(y축·z축) + 점 P → 합성 전계 크기·전위
  | "cylinder_conductor" // 무한히 긴 직선 원통 도체(도전율 σ) — 단면 A·B 전위차 → E·J·I → 외부 자계 H
  | "coax_current"; // 무한히 긴 동축선로 (내부 도체 +a_z, 외부 도체 −a_z) — 앙페르 법칙 3영역 자계

/** EM 전용 도식 payload — 렌더러가 geometry로 dispatch해 고정 슬롯에 라벨 배치. */
export type EmFieldDiagram = {
  geometry: EmGeometryKind;
  title?: string;
  /** geometry별 라벨 (예: Q, r, P, lambda, sigma, I, B, N, L, v, E) */
  labels: Record<string, string>;
};

/** EM 세부 주제 (types/index.ts ElectromagneticsTopic와 동일 문자열). */
export type EmTopic =
  | "electrostatics"
  | "gauss_law"
  | "capacitance"
  | "magnetostatics"
  | "em_induction"
  | "magnetic_force"
  | "em_wave"
  | "current_conduction";

/** 생성된 단일 EM 문제 인스턴스 — 파이프라인이 GeneratedProblem으로 매핑. */
export type EmInstance = {
  entryId: string;
  topicKey: EmTopic;
  title: string;
  /** 문제 본문 (LaTeX \( \) 포함 가능) */
  content: string;
  /** 주어진 조건 목록 */
  givens: string[];
  /** 발문 */
  question: string;
  /** 정답 (단위 포함) */
  answer: string;
  /** 풀이 단계 */
  steps: string[];
  /** 그림 payload — 원본에 그림이 없는 유형(예: 유전체 경계조건)은 생략 가능(figure 없음). */
  diagram?: EmFieldDiagram;
};

// ── 숫자 포맷 헬퍼 ────────────────────────────────────────────────────
function roundSig(x: number, sig = 3): number {
  if (x === 0) return 0;
  const d = Math.ceil(Math.log10(Math.abs(x)));
  const power = sig - d;
  const mag = Math.pow(10, power);
  return Math.round(x * mag) / mag;
}

/** 숫자를 KaTeX 문자열로 — 큰/작은 값은 ×10^n 과학표기, 중간값은 일반. */
function numLatex(x: number, sig = 3): string {
  if (x === 0) return "0";
  const neg = x < 0;
  const ax = Math.abs(x);
  const exp = Math.floor(Math.log10(ax));
  let body: string;
  if (exp >= -2 && exp <= 3) {
    body = String(roundSig(ax, sig));
  } else {
    const mant = roundSig(ax / Math.pow(10, exp), sig);
    body = `${mant} \\times 10^{${exp}}`;
  }
  return neg ? `-${body}` : body;
}

type Rand = () => number;

/**
 * 원본 구조에서 감지한 힌트 — build가 유사유형에서 원본 구조를 보존하도록.
 * 대부분 항목은 무시하지만, 구조 자체가 mode와 직교인 항목(예: 두 유전체 직렬/병렬)은
 * 이 힌트로 유사유형이 원본 배치를 따라가야 [[절대규칙 0]](exam_similar=topology 보존)을 지킨다.
 */
export type EmBuildHints = {
  /** 두 유전체 평판 커패시터의 배치: 적층(직렬) 또는 나란히(병렬). */
  dielectricArrangement?: "series" | "parallel";
  /**
   * 두 유전체 커패시터의 문제 하위구조(구하는 대상):
   *  - "potential_distribution": 각 영역 전계(E₀ 비율)와 경계 전위가 주어지고,
   *    각 유전체 영역의 전위 V(z)를 z의 1차식으로 도출(임용 24번). 전하·정전용량 아님.
   *  - undefined: 기존 전하·정전용량 구조(임용 10·11번).
   * 배치와 마찬가지로 mode와 직교한 원본의 구조적 속성이라 유사유형이 보존해야 한다([[절대규칙 0]]).
   */
  dielectricStructure?: "potential_distribution";
};

// =====================================================================
// 레지스트리 항목 — 각 항목이 build(mode, rand, hints?)로 완성 인스턴스 생성
// =====================================================================
type EmEntry = {
  id: string;
  topicKey: EmTopic;
  title: string;
  /** 분류기 키워드 (analysis 텍스트 매칭용) */
  keywords: string[];
  /** 매우 특이적인 시그니처 키워드 — 하나만 맞아도 이 항목으로 강하게 라우팅(+큰 가중치). */
  strongKeywords?: string[];
  geometry: EmGeometryKind;
  build: (mode: GenerationMode, rand: Rand, hints?: EmBuildHints) => EmInstance;
};

// ── 항목별 값 풀 ──────────────────────────────────────────────────────
const Q_UC = [1, 2, 3, 4, 5, 6, 8, 10]; // μC
const R_CM = [10, 20, 30, 40, 50]; // cm
const Q_NC = [2, 4, 5, 8, 10, 20]; // nC

// =====================================================================
// 1. 점전하 전기장/전위 (정전계)
// =====================================================================
const pointCharge: EmEntry = {
  id: "point_charge_field",
  topicKey: "electrostatics",
  title: "점전하가 만드는 전기장",
  keywords: ["점전하", "전기장", "전계", "쿨롱", "전위", "point charge", "electric field"],
  geometry: "point_charge",
  build(mode, rand) {
    const Quc = pick(Q_UC, rand);
    const Rcm = pick(R_CM, rand);
    const Q = Quc * 1e-6;
    const r = Rcm / 100;
    const diagram: EmFieldDiagram = {
      geometry: "point_charge",
      title: "점전하 주변 전기장",
      labels: { charge: `Q = ${Quc}\\,\\mu\\mathrm{C}`, distance: `r = ${Rcm}\\,\\mathrm{cm}`, point: "P", field: "E" },
    };
    const givens = [
      `점전하 \\( Q = ${Quc}\\,\\mu\\mathrm{C} \\)`,
      `점전하로부터 거리 \\( r = ${Rcm}\\,\\mathrm{cm} = ${r}\\,\\mathrm{m} \\)`,
      `쿨롱 상수 \\( k = 9 \\times 10^{9}\\,\\mathrm{N\\cdot m^2/C^2} \\)`,
    ];
    if (mode === "exam_variant") {
      // 변형: 같은 배치에서 전위 V = kQ/r 를 구한다.
      const V = K * Q / r;
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "진공 중에 점전하가 놓여 있다. 점전하로부터 일정한 거리만큼 떨어진 점 P에서의 전위를 구하려고 한다.",
        givens, question: "점 P에서의 전위 \\( V \\)를 구하시오.",
        answer: `\\( V = ${numLatex(V)}\\,\\mathrm{V} \\)`,
        steps: [
          `점전하의 전위: \\( V = \\dfrac{kQ}{r} \\)`,
          `\\( V = \\dfrac{(9\\times10^{9})(${Quc}\\times10^{-6})}{${r}} = ${numLatex(V)}\\,\\mathrm{V} \\)`,
        ],
        diagram: { ...diagram, labels: { ...diagram.labels, field: "V" } },
      };
    }
    const E = K * Q / (r * r);
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "진공 중에 점전하가 놓여 있다. 점전하로부터 일정한 거리만큼 떨어진 점 P에서의 전기장을 구하려고 한다.",
      givens, question: "점 P에서의 전기장의 세기 \\( E \\)를 구하시오.",
      answer: `\\( E = ${numLatex(E)}\\,\\mathrm{N/C} \\)`,
      steps: [
        `점전하의 전기장: \\( E = \\dfrac{kQ}{r^2} \\)`,
        `\\( E = \\dfrac{(9\\times10^{9})(${Quc}\\times10^{-6})}{(${r})^2} = ${numLatex(E)}\\,\\mathrm{N/C} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 2. 쿨롱 힘 (두 점전하)
// =====================================================================
const coulombForce: EmEntry = {
  id: "coulomb_force",
  topicKey: "electrostatics",
  title: "두 점전하 사이의 쿨롱 힘",
  keywords: ["쿨롱", "쿨롱 힘", "두 점전하", "정전기력", "coulomb", "전기력"],
  geometry: "two_charges",
  build(mode, rand) {
    const q1uc = pick([1, 2, 3, 4, 5], rand);
    const q2uc = pick([2, 3, 4, 6, 8], rand);
    const Rcm = pick([10, 20, 30, 50], rand);
    // 변형: 거리를 더 다양하게(작은 mm 스케일)
    const distM = mode === "exam_variant" ? pick([5, 10, 15, 20], rand) / 100 : Rcm / 100;
    const distLabel = mode === "exam_variant" ? `${distM * 100}\\,\\mathrm{cm}` : `${Rcm}\\,\\mathrm{cm}`;
    const F = K * (q1uc * 1e-6) * (q2uc * 1e-6) / (distM * distM);
    const diagram: EmFieldDiagram = {
      geometry: "two_charges",
      title: "두 점전하 사이의 정전기력",
      labels: { q1: `Q_1 = ${q1uc}\\,\\mu\\mathrm{C}`, q2: `Q_2 = ${q2uc}\\,\\mu\\mathrm{C}`, distance: `r = ${distLabel}`, force: "F" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "진공 중에서 두 점전하가 일정한 거리만큼 떨어져 있다.",
      givens: [
        `두 점전하 \\( Q_1 = ${q1uc}\\,\\mu\\mathrm{C} \\), \\( Q_2 = ${q2uc}\\,\\mu\\mathrm{C} \\)`,
        `두 전하 사이 거리 \\( r = ${distLabel} = ${distM}\\,\\mathrm{m} \\)`,
        `쿨롱 상수 \\( k = 9 \\times 10^{9}\\,\\mathrm{N\\cdot m^2/C^2} \\)`,
      ],
      question: "두 점전하 사이에 작용하는 정전기력의 크기 \\( F \\)를 구하시오.",
      answer: `\\( F = ${numLatex(F)}\\,\\mathrm{N} \\)`,
      steps: [
        `쿨롱 법칙: \\( F = \\dfrac{kQ_1 Q_2}{r^2} \\)`,
        `\\( F = \\dfrac{(9\\times10^{9})(${q1uc}\\times10^{-6})(${q2uc}\\times10^{-6})}{(${distM})^2} = ${numLatex(F)}\\,\\mathrm{N} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 3. 무한 선전하 (가우스 법칙)
// =====================================================================
const lineCharge: EmEntry = {
  id: "line_charge_field",
  topicKey: "gauss_law",
  title: "무한 선전하가 만드는 전기장",
  keywords: ["선전하", "무한 직선", "선전하밀도", "가우스", "λ", "line charge", "gauss"],
  geometry: "line_charge",
  build(mode, rand) {
    const lamNc = pick([2, 4, 5, 8, 10], rand); // nC/m
    const Rcm = pick([5, 10, 20, 25, 50], rand);
    const lam = lamNc * 1e-9;
    const r = Rcm / 100;
    const E = lam / (2 * Math.PI * EPS0 * r);
    const diagram: EmFieldDiagram = {
      geometry: "line_charge",
      title: "무한 선전하 주변 전기장",
      labels: { lambda: `\\lambda = ${lamNc}\\,\\mathrm{nC/m}`, distance: `r = ${Rcm}\\,\\mathrm{cm}`, point: "P", field: "E" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "진공 중에 무한히 긴 직선 도선에 전하가 균일하게 분포해 있다(선전하밀도 \\( \\lambda \\)). 도선으로부터 수직 거리 \\( r \\)인 점 P에서의 전기장을 구하려고 한다.",
      givens: [
        `선전하밀도 \\( \\lambda = ${lamNc}\\,\\mathrm{nC/m} \\)`,
        `도선으로부터 수직 거리 \\( r = ${Rcm}\\,\\mathrm{cm} = ${r}\\,\\mathrm{m} \\)`,
        `\\( \\varepsilon_0 = 8.85 \\times 10^{-12}\\,\\mathrm{F/m} \\)`,
      ],
      question: "점 P에서의 전기장의 세기 \\( E \\)를 구하시오.",
      answer: `\\( E = ${numLatex(E)}\\,\\mathrm{N/C} \\)`,
      steps: [
        `가우스 법칙(원통 대칭): \\( E = \\dfrac{\\lambda}{2\\pi\\varepsilon_0 r} \\)`,
        `\\( E = \\dfrac{${lamNc}\\times10^{-9}}{2\\pi(8.85\\times10^{-12})(${r})} = ${numLatex(E)}\\,\\mathrm{N/C} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 4. 무한 대전 평면 (가우스 법칙)
// =====================================================================
const chargedSheet: EmEntry = {
  id: "charged_sheet_field",
  topicKey: "gauss_law",
  title: "무한 대전 평면이 만드는 전기장",
  keywords: ["대전 평면", "면전하", "면전하밀도", "무한 평면", "σ", "sheet", "가우스"],
  geometry: "charged_sheet",
  build(_mode, rand) {
    const sigNc = pick([2, 4, 5, 8, 10, 20], rand); // nC/m²
    const sig = sigNc * 1e-9;
    const E = sig / (2 * EPS0);
    const diagram: EmFieldDiagram = {
      geometry: "charged_sheet",
      title: "무한 대전 평면의 균일 전기장",
      labels: { sigma: `\\sigma = ${sigNc}\\,\\mathrm{nC/m^2}`, field: "E" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "진공 중에 무한히 넓은 평면에 전하가 균일하게 분포해 있다(면전하밀도 \\( \\sigma \\)). 평면 근처에서의 전기장을 구하려고 한다.",
      givens: [
        `면전하밀도 \\( \\sigma = ${sigNc}\\,\\mathrm{nC/m^2} \\)`,
        `\\( \\varepsilon_0 = 8.85 \\times 10^{-12}\\,\\mathrm{F/m} \\)`,
      ],
      question: "평면이 만드는 전기장의 세기 \\( E \\)를 구하시오.",
      answer: `\\( E = ${numLatex(E)}\\,\\mathrm{N/C} \\)`,
      steps: [
        `가우스 법칙(무한 평면): \\( E = \\dfrac{\\sigma}{2\\varepsilon_0} \\)`,
        `\\( E = \\dfrac{${sigNc}\\times10^{-9}}{2(8.85\\times10^{-12})} = ${numLatex(E)}\\,\\mathrm{N/C} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 4b. 무한 면전하(z=0) — 전속밀도 D + 전위차 V_BA + 등전위 점 C + 일 W (임용 12번)
//   ρ_s=k·(1/36π)·1e-9, ε₀=(1/36π)·1e-9 → E=ρ_s/(2ε₀)=k/2 V/m (딱 떨어짐).
//   D=ρ_s/2 a_z(z>0). V_BA=−E(z_B−z_A). 등전위 C: n=z_B. W(B→A)=q(V_A−V_B)=q·E·Δz.
//   ★ charged_sheet_field(단일 E 계산)와 구분 — 전위차·등전위·일 다단 구조.
// =====================================================================
const sheetChargePotentialWork: EmEntry = {
  id: "sheet_charge_potential_work",
  topicKey: "gauss_law",
  title: "무한 면전하 — 전속밀도·전위차·등전위·일",
  keywords: ["면전하", "무한평면", "무한 평면", "전속 밀도", "전속밀도", "전위차", "등전위", "이동", "일", "점전하"],
  strongKeywords: [
    "전위차", "v_ba", "등전위", "등전위가 되기 위한",
    "이동시키는 데 필요한 일", "이동시키는데 필요한 일", "필요한 일",
    "전속 밀도", "전속밀도",
  ],
  geometry: "plane_flux",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const k = pick(variant ? [4, 6] : [2, 4], rand);   // ρ_s = k·(1/36π)·1e-9 [C/m²]
    const zA = pick([1, 2, 3], rand);
    const zB = zA + pick([1, 2], rand);                 // z_B > z_A
    const q = pick([2, 3, 5], rand);                    // nC (단계3 점전하)
    const xa = pick([1, 2, 3], rand), ya = pick([0, 1, 2], rand);
    const xb = pick([0, 1, 2], rand), yb = pick([2, 3], rand);
    const xc = pick([1, 2, 3], rand), yc = pick([4, 5, 6], rand);

    const E = k / 2;                 // V/m
    const dCoef = k / 2;             // D = ρ_s/2 = (k/2)·(1/36π)·1e-9 a_z
    const Vba = -E * (zB - zA);      // V (z_B>z_A → 음수)
    const n = zB;                    // 등전위 (전위는 z에만 의존)
    const Wnj = q * E * (zB - zA);   // nJ = q[nC]·(V_A−V_B)

    const rhoTex = `\\rho_s = ${k}\\times\\frac{1}{36\\pi}\\times10^{-9}\\,\\mathrm{C/m^2}`;
    const diagram: EmFieldDiagram = {
      geometry: "plane_flux",
      title: "z=0 무한 면전하와 점 A·B·C",
      labels: {
        perpAxis: "z",
        pP: `A(${xa},${ya},${zA})`,
        pR: `B(${xb},${yb},${zB})`,
        pQ: `C(${xc},${yc},n)`,
        field: `\\rho_s = ${k}\\cdot\\tfrac{1}{36\\pi}\\times10^{-9}\\,\\mathrm{C/m^2}\\ (z=0)`,
      },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `그림은 자유 공간상의 z=0에 놓여 있는 균일 면전하밀도 \\( ${rhoTex} \\)를 갖는 무한평면이다. 제시된 <해석 절차>에 따라 각 단계별로 과정과 함께 결과를 서술하시오. (단, \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)는 각 직각좌표계에서 단위벡터, 좌표 단위는 [m], 자유 공간 유전율 \\( \\varepsilon_0 = \\tfrac{1}{36\\pi}\\times10^{-9}\\,\\mathrm{F/m} \\).)`,
      givens: [
        `면전하밀도 \\( ${rhoTex} \\), 무한평면 z=0`,
        `점 A(${xa},${ya},${zA}), B(${xb},${yb},${zB}), C(${xc},${yc},n) [m]`,
        `\\( \\varepsilon_0 = \\tfrac{1}{36\\pi}\\times10^{-9}\\,\\mathrm{F/m} \\)`,
      ],
      question: [
        `[단계 1] 점 A에서 전속 밀도 \\( \\mathbf{D}\\,[\\mathrm{C/m^2}] \\)를 구한다.`,
        `[단계 2] 점 B와 점 A의 전위차 \\( V_{BA}\\,[\\mathrm{V}] \\)를 구하고, 점 B와 점 C가 등전위가 되기 위한 점 C의 z=n 값을 구한다.`,
        `[단계 3] 점 B에 \\( ${q}\\,\\mathrm{nC} \\)를 갖는 점전하가 주어질 때, 점 B에서 점 A로 이동시키는 데 필요한 일 [J]을 구한다.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( \\mathbf{D} = \\tfrac{\\rho_s}{2}\\mathbf{a}_z = ${dCoef}\\cdot\\tfrac{1}{36\\pi}\\times10^{-9}\\,\\mathbf{a}_z\\,[\\mathrm{C/m^2}] \\)`,
        `[단계 2] \\( V_{BA} = ${Vba}\\,\\mathrm{V} \\),  n = ${n}`,
        `[단계 3] \\( W = ${Wnj}\\times10^{-9}\\,\\mathrm{J} = ${Wnj}\\,\\mathrm{nJ} \\)`,
      ].join("\n"),
      steps: [
        `[단계 1] 무한 면전하(z=0)의 전속밀도는 위치 무관, z>0에서 \\( \\mathbf{D}=\\tfrac{\\rho_s}{2}\\mathbf{a}_z \\). A는 z=${zA}>0이므로 \\( \\mathbf{D}=${dCoef}\\cdot\\tfrac{1}{36\\pi}\\times10^{-9}\\mathbf{a}_z \\).`,
        `[단계 2] \\( \\mathbf{E}=\\mathbf{D}/\\varepsilon_0=\\tfrac{\\rho_s}{2\\varepsilon_0}\\mathbf{a}_z=${E}\\,\\mathbf{a}_z\\,\\mathrm{V/m} \\). 전위는 z에만 의존, \\( V_{BA}=V_B-V_A=-E(z_B-z_A)=-${E}(${zB}-${zA})=${Vba}\\,\\mathrm{V} \\). 등전위는 같은 z이므로 \\( n=z_B=${n} \\).`,
        `[단계 3] B→A 이동에 필요한 일 \\( W=q(V_A-V_B)=q\\cdot E(z_B-z_A)=${q}\\times10^{-9}\\cdot${E}\\cdot(${zB}-${zA})=${Wnj}\\times10^{-9}\\,\\mathrm{J} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 5. 평행판 커패시터 (정전용량 / 에너지)
// =====================================================================
const parallelPlate: EmEntry = {
  id: "parallel_plate_cap",
  topicKey: "capacitance",
  title: "평행판 커패시터의 정전용량",
  keywords: ["평행판", "커패시터", "축전기", "정전용량", "전기용량", "capacit", "유전율"],
  geometry: "parallel_plates",
  build(mode, rand) {
    const Acm2 = pick([20, 50, 100, 200], rand); // cm²
    const dMm = pick([0.5, 1, 2, 4], rand); // mm
    const epsR = pick([1, 2, 4, 5], rand);
    const A = Acm2 * 1e-4;
    const d = dMm * 1e-3;
    const C = EPS0 * epsR * A / d;
    const diagram: EmFieldDiagram = {
      geometry: "parallel_plates",
      title: "평행판 커패시터",
      labels: {
        area: `A = ${Acm2}\\,\\mathrm{cm^2}`, gap: `d = ${dMm}\\,\\mathrm{mm}`,
        epsR: `\\varepsilon_r = ${epsR}`, cap: "C",
      },
    };
    const givensBase = [
      `극판 넓이 \\( A = ${Acm2}\\,\\mathrm{cm^2} = ${numLatex(A)}\\,\\mathrm{m^2} \\)`,
      `극판 간격 \\( d = ${dMm}\\,\\mathrm{mm} = ${numLatex(d)}\\,\\mathrm{m} \\)`,
      `비유전율 \\( \\varepsilon_r = ${epsR} \\)`,
      `\\( \\varepsilon_0 = 8.85 \\times 10^{-12}\\,\\mathrm{F/m} \\)`,
    ];
    if (mode === "exam_variant") {
      // 변형: 전압 V 인가 시 저장되는 에너지 U = ½CV²
      const Vv = pick([10, 12, 20, 50, 100], rand);
      const U = 0.5 * C * Vv * Vv;
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "평행판 커패시터에 일정한 전압이 인가되어 있다. 이 커패시터에 저장되는 정전 에너지를 구하려고 한다.",
        givens: [...givensBase, `인가 전압 \\( V = ${Vv}\\,\\mathrm{V} \\)`],
        question: "커패시터에 저장되는 에너지 \\( U \\)를 구하시오.",
        answer: `\\( U = ${numLatex(U)}\\,\\mathrm{J} \\)`,
        steps: [
          `정전용량: \\( C = \\dfrac{\\varepsilon_0 \\varepsilon_r A}{d} = ${numLatex(C)}\\,\\mathrm{F} \\)`,
          `저장 에너지: \\( U = \\tfrac{1}{2}CV^2 = \\tfrac{1}{2}(${numLatex(C)})(${Vv})^2 = ${numLatex(U)}\\,\\mathrm{J} \\)`,
        ],
        diagram: { ...diagram, labels: { ...diagram.labels, voltage: `V = ${Vv}\\,\\mathrm{V}` } },
      };
    }
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "유전체로 채워진 평행판 커패시터가 있다. 이 커패시터의 정전용량을 구하려고 한다.",
      givens: givensBase,
      question: "이 커패시터의 정전용량 \\( C \\)를 구하시오.",
      answer: `\\( C = ${numLatex(C)}\\,\\mathrm{F} \\)`,
      steps: [
        `평행판 정전용량: \\( C = \\dfrac{\\varepsilon_0 \\varepsilon_r A}{d} \\)`,
        `\\( C = \\dfrac{(8.85\\times10^{-12})(${epsR})(${numLatex(A)})}{${numLatex(d)}} = ${numLatex(C)}\\,\\mathrm{F} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 6. 무한 직선 도선의 자기장 (앙페르 법칙)
// =====================================================================
const straightWire: EmEntry = {
  id: "straight_wire_B",
  topicKey: "magnetostatics",
  title: "무한 직선 도선의 자기장",
  keywords: ["직선 도선", "도선", "자기장", "자속밀도", "앙페르", "ampere", "전류"],
  geometry: "straight_wire",
  build(_mode, rand) {
    const I = pick([2, 4, 5, 8, 10, 20], rand); // A
    const Rcm = pick([2, 5, 10, 20, 25], rand); // cm
    const r = Rcm / 100;
    const B = MU0 * I / (2 * Math.PI * r);
    const diagram: EmFieldDiagram = {
      geometry: "straight_wire",
      title: "직선 도선 주변 자기장",
      labels: { current: `I = ${I}\\,\\mathrm{A}`, distance: `r = ${Rcm}\\,\\mathrm{cm}`, field: "B" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "진공 중에 무한히 긴 직선 도선에 일정한 전류가 흐른다. 도선으로부터 수직 거리 \\( r \\)인 점에서의 자기장을 구하려고 한다.",
      givens: [
        `도선의 전류 \\( I = ${I}\\,\\mathrm{A} \\)`,
        `도선으로부터 수직 거리 \\( r = ${Rcm}\\,\\mathrm{cm} = ${r}\\,\\mathrm{m} \\)`,
        `\\( \\mu_0 = 4\\pi \\times 10^{-7}\\,\\mathrm{T\\cdot m/A} \\)`,
      ],
      question: "이 점에서의 자속밀도 \\( B \\)를 구하시오.",
      answer: `\\( B = ${numLatex(B)}\\,\\mathrm{T} \\)`,
      steps: [
        `앙페르 법칙(직선 도선): \\( B = \\dfrac{\\mu_0 I}{2\\pi r} \\)`,
        `\\( B = \\dfrac{(4\\pi\\times10^{-7})(${I})}{2\\pi(${r})} = ${numLatex(B)}\\,\\mathrm{T} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 7. 솔레노이드의 자기장
// =====================================================================
const solenoid: EmEntry = {
  id: "solenoid_B",
  topicKey: "magnetostatics",
  title: "솔레노이드 내부의 자기장",
  keywords: ["솔레노이드", "코일", "단위길이 권선수", "내부 자기장", "solenoid"],
  geometry: "solenoid",
  build(_mode, rand) {
    const N = pick([200, 400, 500, 800, 1000], rand);
    const Lcm = pick([10, 20, 25, 40, 50], rand);
    const I = pick([1, 2, 3, 5], rand);
    const L = Lcm / 100;
    const n = N / L;
    const B = MU0 * n * I;
    const diagram: EmFieldDiagram = {
      geometry: "solenoid",
      title: "솔레노이드 내부 자기장",
      labels: { turns: `N = ${N}`, length: `L = ${Lcm}\\,\\mathrm{cm}`, current: `I = ${I}\\,\\mathrm{A}`, field: "B" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "길이에 비해 충분히 가는 솔레노이드에 일정한 전류가 흐른다. 솔레노이드 내부의 자기장을 구하려고 한다.",
      givens: [
        `총 권선수 \\( N = ${N} \\)`,
        `솔레노이드 길이 \\( L = ${Lcm}\\,\\mathrm{cm} = ${L}\\,\\mathrm{m} \\)`,
        `전류 \\( I = ${I}\\,\\mathrm{A} \\)`,
        `\\( \\mu_0 = 4\\pi \\times 10^{-7}\\,\\mathrm{T\\cdot m/A} \\)`,
      ],
      question: "솔레노이드 내부의 자속밀도 \\( B \\)를 구하시오.",
      answer: `\\( B = ${numLatex(B)}\\,\\mathrm{T} \\)`,
      steps: [
        `단위길이당 권선수: \\( n = \\dfrac{N}{L} = ${numLatex(n)}\\,\\mathrm{/m} \\)`,
        `솔레노이드 내부 자기장: \\( B = \\mu_0 n I = (4\\pi\\times10^{-7})(${numLatex(n)})(${I}) = ${numLatex(B)}\\,\\mathrm{T} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 8. 자기장 속 운동 도체봉 (운동 기전력 / 유도)
// =====================================================================
const movingRod: EmEntry = {
  id: "moving_rod_emf",
  topicKey: "em_induction",
  title: "자기장 속 운동 도체봉의 기전력",
  keywords: ["도체봉", "운동 기전력", "유도 기전력", "패러데이", "레일", "faraday", "전자기 유도", "emf"],
  geometry: "moving_rod",
  build(mode, rand) {
    const B = pick([0.2, 0.4, 0.5, 0.8, 1.0], rand); // T
    const Lcm = pick([20, 40, 50, 80], rand); // cm
    const v = pick([2, 4, 5, 10], rand); // m/s
    const L = Lcm / 100;
    const emf = B * L * v;
    const diagram: EmFieldDiagram = {
      geometry: "moving_rod",
      title: "자기장 속 운동 도체봉",
      labels: { field: `B = ${B}\\,\\mathrm{T}`, length: `L = ${Lcm}\\,\\mathrm{cm}`, velocity: `v = ${v}\\,\\mathrm{m/s}`, emf: "\\varepsilon" },
    };
    const givensBase = [
      `자속밀도 \\( B = ${B}\\,\\mathrm{T} \\) (지면에 수직)`,
      `도체봉의 길이 \\( L = ${Lcm}\\,\\mathrm{cm} = ${L}\\,\\mathrm{m} \\)`,
      `도체봉의 속력 \\( v = ${v}\\,\\mathrm{m/s} \\)`,
    ];
    if (mode === "exam_variant") {
      // 변형: 레일에 저항 R 연결 시 유도 전류 I = ε/R
      const R = pick([2, 4, 5, 10], rand);
      const I = emf / R;
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "균일한 자기장 속에서 평행한 두 도선(레일) 위를 도체봉이 일정한 속력으로 움직인다. 레일 양 끝은 저항으로 연결되어 있다.",
        givens: [...givensBase, `레일에 연결된 저항 \\( R = ${R}\\,\\Omega \\)`],
        question: "도체봉에 흐르는 유도 전류의 크기 \\( I \\)를 구하시오.",
        answer: `\\( I = ${numLatex(I)}\\,\\mathrm{A} \\)`,
        steps: [
          `운동 기전력: \\( \\varepsilon = BLv = (${B})(${L})(${v}) = ${numLatex(emf)}\\,\\mathrm{V} \\)`,
          `유도 전류: \\( I = \\dfrac{\\varepsilon}{R} = \\dfrac{${numLatex(emf)}}{${R}} = ${numLatex(I)}\\,\\mathrm{A} \\)`,
        ],
        diagram: { ...diagram, labels: { ...diagram.labels, resistor: `R = ${R}\\,\\Omega` } },
      };
    }
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "균일한 자기장 속에서 평행한 두 도선(레일) 위를 도체봉이 자기장에 수직으로 일정한 속력으로 움직인다.",
      givens: givensBase,
      question: "도체봉에 유도되는 기전력 \\( \\varepsilon \\)을 구하시오.",
      answer: `\\( \\varepsilon = ${numLatex(emf)}\\,\\mathrm{V} \\)`,
      steps: [
        `운동 기전력: \\( \\varepsilon = BLv \\)`,
        `\\( \\varepsilon = (${B})(${L})(${v}) = ${numLatex(emf)}\\,\\mathrm{V} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 8b. 시변 자속 관통 고정 ㄷ자 루프 + 저항 → 쇄교 자속 Φ(t)·유도 전류 i(t)
//     (패러데이 법칙 변압기 기전력, 운동 기전력 무시 — 임용 전자기학 4번 형식)
//
// ★ movingRod(운동 기전력 ε=BLv, 도체봉 이동)와 다름: 루프·자속밀도 모두 고정,
//   B만 시간에 따라 변함(B=sin(t)) → dΦ/dt로 유도. 저항이 단자 a-b에 연결됨.
//   registry에 이 유형이 없어 키워드 겹치는 movingRod로 오분류되던 것을 전용 항목으로 흡수.
// =====================================================================
const fluxLoopInducedCurrent: EmEntry = {
  id: "flux_loop_induced_current",
  topicKey: "em_induction",
  title: "시변 자속에 의한 쇄교 자속과 유도 전류",
  keywords: ["쇄교 자속", "유도 전류", "패러데이", "유도 기전력", "전자기 유도", "자속밀도", "완전 도체"],
  // 운동 기전력(movingRod)과 확실히 구분되는 고유 시그니처 — 하나만 맞아도 강하게 라우팅.
  strongKeywords: ["쇄교 자속", "쇄교하는 자속", "쇄교", "완전 도체", "운동 기전력은 무시", "운동 기전력을 무시"],
  geometry: "flux_loop_resistor",
  build(mode, rand) {
    const B0 = pick([1, 2], rand); // Wb/m² 진폭
    const omega = pick([1, 2], rand); // rad/s
    const a = pick([2, 3], rand); // m (정사각 한 변)
    const R = pick([10, 20, 50, 100], rand); // Ω
    const A = a * a; // m²
    const fluxAmp = B0 * A; // Φ 진폭 [Wb]
    const emfAmp = B0 * A * omega; // EMF 진폭 [V]
    const iAmp = emfAmp / R; // i 진폭 [A]

    const wt = omega === 1 ? "t" : `${omega}t`;
    const Bexpr = B0 === 1 ? `\\sin(${wt})` : `${B0}\\sin(${wt})`;

    const diagram: EmFieldDiagram = {
      geometry: "flux_loop_resistor",
      title: "시변 자속이 관통하는 ㄷ자 도체 루프",
      labels: {
        field: `\\mathbf{B} = ${Bexpr}\\,\\mathbf{a}_x`,
        side: `${a}\\,\\mathrm{m}`,
        resistor: `R = ${R}\\,\\Omega`,
        current: "i(t)",
      },
    };

    const givens = [
      `한 변의 길이가 \\( ${a}\\,\\mathrm{m} \\)인 정사각형 완전 도체 루프의 단자 a-b에 저항 \\( R = ${R}\\,\\Omega \\)이 연결됨`,
      `루프를 수직으로 관통하는 자속밀도 \\( \\mathbf{B} = ${Bexpr}\\,\\mathbf{a}_x\\,[\\mathrm{Wb/m^2}] \\)`,
      `단, 저항의 자계와 운동 기전력은 무시한다`,
    ];

    if (mode === "exam_variant") {
      // 변형(기출변형유형) — "구하는 양" 변경: 유도 전류 i(t) 대신 저항 소비 평균 전력 P_avg.
      const pAvg = 0.5 * iAmp * iAmp * R; // ½ I_peak² R
      return {
        entryId: this.id,
        topicKey: this.topicKey,
        title: this.title,
        content:
          "그림은 정사각형 완전 도체 루프의 단자 a-b에 저항이 연결된 회로이다. 시간에 따라 변하는 자속밀도가 루프를 수직으로 관통한다.",
        givens,
        question:
          "회로 내부에 쇄교하는 자속 \\( \\Phi(t)\\,[\\mathrm{Wb}] \\)와 저항에서 소비되는 평균 전력 \\( P_{avg}\\,[\\mathrm{W}] \\)를 순서대로 구하시오. (단, 저항의 자계와 운동 기전력은 무시한다.)",
        answer: `\\( \\Phi(t) = ${fluxAmp}\\sin(${wt})\\,\\mathrm{Wb} \\), \\( P_{avg} = ${numLatex(pAvg)}\\,\\mathrm{W} \\)`,
        steps: [
          `쇄교 자속: \\( \\Phi(t) = \\mathbf{B}\\cdot\\mathbf{A} = ${Bexpr}\\times ${a}^2 = ${fluxAmp}\\sin(${wt})\\,\\mathrm{Wb} \\)`,
          `유도 기전력(패러데이 법칙): \\( \\varepsilon = -\\dfrac{d\\Phi}{dt} = -${emfAmp}\\cos(${wt})\\,\\mathrm{V} \\)`,
          `유도 전류 진폭: \\( I_m = \\dfrac{|\\varepsilon|_{max}}{R} = \\dfrac{${emfAmp}}{${R}} = ${numLatex(iAmp)}\\,\\mathrm{A} \\)`,
          `평균 전력: \\( P_{avg} = \\dfrac{1}{2}I_m^2 R = \\dfrac{1}{2}(${numLatex(iAmp)})^2(${R}) = ${numLatex(pAvg)}\\,\\mathrm{W} \\)`,
        ],
        diagram,
      };
    }

    return {
      entryId: this.id,
      topicKey: this.topicKey,
      title: this.title,
      content:
        "그림은 정사각형 완전 도체 루프의 단자 a-b에 저항이 연결된 회로이다. 시간에 따라 변하는 자속밀도가 루프를 수직으로 관통한다.",
      givens,
      question:
        "회로 내부에 쇄교하는 자속 \\( \\Phi(t)\\,[\\mathrm{Wb}] \\)와 저항에 흐르는 전류 \\( i(t)\\,[\\mathrm{A}] \\)를 순서대로 구하시오. (단, 저항의 자계와 운동 기전력은 무시한다.)",
      answer: `\\( \\Phi(t) = ${fluxAmp}\\sin(${wt})\\,\\mathrm{Wb} \\), \\( i(t) = -${numLatex(iAmp)}\\cos(${wt})\\,\\mathrm{A} \\)`,
      steps: [
        `쇄교 자속: \\( \\Phi(t) = \\mathbf{B}\\cdot\\mathbf{A} = ${Bexpr}\\times ${a}^2 = ${fluxAmp}\\sin(${wt})\\,\\mathrm{Wb} \\)`,
        `유도 기전력(패러데이 법칙): \\( \\varepsilon = -\\dfrac{d\\Phi}{dt} = -${emfAmp}\\cos(${wt})\\,\\mathrm{V} \\)`,
        `유도 전류: \\( i(t) = \\dfrac{\\varepsilon}{R} = \\dfrac{-${emfAmp}\\cos(${wt})}{${R}} = -${numLatex(iAmp)}\\cos(${wt})\\,\\mathrm{A} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 9. 자기장 속 전류 도선의 힘 (자기력)
// =====================================================================
const forceOnWire: EmEntry = {
  id: "force_on_wire",
  topicKey: "magnetic_force",
  title: "자기장 속 전류 도선이 받는 힘",
  keywords: ["자기력", "전류 도선", "힘", "F=BIL", "로렌츠", "자기장 속 도선", "lorentz", "force"],
  geometry: "current_in_field",
  build(_mode, rand) {
    const B = pick([0.1, 0.2, 0.5, 0.8, 1.0], rand);
    const I = pick([2, 4, 5, 10], rand);
    const Lcm = pick([10, 20, 50], rand);
    const L = Lcm / 100;
    const F = B * I * L;
    const diagram: EmFieldDiagram = {
      geometry: "current_in_field",
      title: "자기장 속 전류 도선의 힘",
      labels: { field: `B = ${B}\\,\\mathrm{T}`, current: `I = ${I}\\,\\mathrm{A}`, length: `L = ${Lcm}\\,\\mathrm{cm}`, force: "F" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "균일한 자기장 속에 자기장과 수직으로 놓인 직선 도선에 전류가 흐른다.",
      givens: [
        `자속밀도 \\( B = ${B}\\,\\mathrm{T} \\)`,
        `도선의 전류 \\( I = ${I}\\,\\mathrm{A} \\)`,
        `자기장 속 도선의 길이 \\( L = ${Lcm}\\,\\mathrm{cm} = ${L}\\,\\mathrm{m} \\)`,
      ],
      question: "도선이 받는 자기력의 크기 \\( F \\)를 구하시오.",
      answer: `\\( F = ${numLatex(F)}\\,\\mathrm{N} \\)`,
      steps: [
        `자기장 속 도선의 힘: \\( F = BIL \\) (도선이 자기장에 수직)`,
        `\\( F = (${B})(${I})(${L}) = ${numLatex(F)}\\,\\mathrm{N} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 10. 전자파 (맥스웰)
// =====================================================================
const emWave: EmEntry = {
  id: "em_wave_relation",
  topicKey: "em_wave",
  title: "전자기파의 성질",
  keywords: ["전자기파", "전자파", "맥스웰", "광속", "파장", "주파수", "포인팅", "maxwell", "wave"],
  geometry: "em_wave",
  build(mode, rand) {
    if (mode === "exam_variant") {
      // 변형: 전기장 진폭 → 자기장 진폭 B = E/c
      const E0 = pick([60, 90, 120, 300, 600], rand); // V/m
      const B0 = E0 / C_LIGHT;
      const diagram: EmFieldDiagram = {
        geometry: "em_wave",
        title: "전자기파의 진행",
        labels: { efield: `E_0 = ${E0}\\,\\mathrm{V/m}`, bfield: "B_0", speed: "c" },
      };
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "진공 중을 진행하는 평면 전자기파에서 전기장의 진폭이 주어져 있다.",
        givens: [
          `전기장 진폭 \\( E_0 = ${E0}\\,\\mathrm{V/m} \\)`,
          `광속 \\( c = 3 \\times 10^{8}\\,\\mathrm{m/s} \\)`,
        ],
        question: "자기장의 진폭 \\( B_0 \\)를 구하시오.",
        answer: `\\( B_0 = ${numLatex(B0)}\\,\\mathrm{T} \\)`,
        steps: [
          `전자기파에서 \\( E = cB \\) 이므로 \\( B_0 = \\dfrac{E_0}{c} \\)`,
          `\\( B_0 = \\dfrac{${E0}}{3\\times10^{8}} = ${numLatex(B0)}\\,\\mathrm{T} \\)`,
        ],
        diagram,
      };
    }
    // 유사: 주파수 → 파장 λ = c/f
    const fMHz = pick([50, 100, 150, 300, 600, 900], rand);
    const f = fMHz * 1e6;
    const lambda = C_LIGHT / f;
    const diagram: EmFieldDiagram = {
      geometry: "em_wave",
      title: "전자기파의 진행",
      labels: { freq: `f = ${fMHz}\\,\\mathrm{MHz}`, wavelength: "\\lambda", speed: "c" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "진공 중을 진행하는 전자기파의 주파수가 주어져 있다.",
      givens: [
        `전자기파의 주파수 \\( f = ${fMHz}\\,\\mathrm{MHz} = ${numLatex(f)}\\,\\mathrm{Hz} \\)`,
        `광속 \\( c = 3 \\times 10^{8}\\,\\mathrm{m/s} \\)`,
      ],
      question: "이 전자기파의 파장 \\( \\lambda \\)를 구하시오.",
      answer: `\\( \\lambda = ${numLatex(lambda)}\\,\\mathrm{m} \\)`,
      steps: [
        `파동의 기본식: \\( c = f\\lambda \\) 이므로 \\( \\lambda = \\dfrac{c}{f} \\)`,
        `\\( \\lambda = \\dfrac{3\\times10^{8}}{${numLatex(f)}} = ${numLatex(lambda)}\\,\\mathrm{m} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 11. 토로이드(환상 솔레노이드) 내부의 자기장
// =====================================================================
const toroid: EmEntry = {
  id: "toroid_B",
  topicKey: "magnetostatics",
  title: "토로이드 내부의 자기장",
  keywords: ["토로이드", "원환", "도넛형", "환상", "자기장", "자속밀도", "앙페르", "코일"],
  strongKeywords: ["토로이드", "toroid", "환상 솔레노이드", "원환체"],
  geometry: "toroid",
  build(mode, rand) {
    const N = pick([100, 200, 400, 500, 800], rand);
    const I = pick([1, 2, 3, 5], rand);
    const Rcm = pick([5, 8, 10, 20, 25], rand); // 평균 반지름
    const r = Rcm / 100;
    const diagram: EmFieldDiagram = {
      geometry: "toroid",
      title: "토로이드 내부 자기장",
      labels: { turns: `N = ${N}`, current: `I = ${I}\\,\\mathrm{A}`, radius: `r = ${Rcm}\\,\\mathrm{cm}`, field: "B" },
    };
    const givensBase = [
      `총 권선수 \\( N = ${N} \\)`,
      `전류 \\( I = ${I}\\,\\mathrm{A} \\)`,
      `토로이드 평균 반지름 \\( r = ${Rcm}\\,\\mathrm{cm} = ${r}\\,\\mathrm{m} \\)`,
    ];
    if (mode === "exam_variant") {
      // 변형: 자기장의 세기 H = NI/(2πr) [A/m] (B 대신 H — 다른 물리량)
      const H = N * I / (2 * Math.PI * r);
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "환상(토로이드) 코일에 일정한 전류가 흐른다. 토로이드 내부(평균 반지름 위)의 자기장의 세기 H를 구하려고 한다.",
        givens: givensBase,
        question: "토로이드 내부의 자기장의 세기 \\( H \\) [A/m]를 구하시오.",
        answer: `\\( H = ${numLatex(H)}\\,\\mathrm{A/m} \\)`,
        steps: [
          `앙페르 법칙(토로이드): \\( H = \\dfrac{NI}{2\\pi r} \\)`,
          `\\( H = \\dfrac{(${N})(${I})}{2\\pi(${r})} = ${numLatex(H)}\\,\\mathrm{A/m} \\)`,
        ],
        diagram: { ...diagram, labels: { ...diagram.labels, field: "H" } },
      };
    }
    const B = MU0 * N * I / (2 * Math.PI * r);
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "환상(토로이드) 코일에 일정한 전류가 흐른다. 토로이드 내부(평균 반지름 위)의 자기장을 구하려고 한다.",
      givens: [...givensBase, `\\( \\mu_0 = 4\\pi \\times 10^{-7}\\,\\mathrm{T\\cdot m/A} \\)`],
      question: "토로이드 내부의 자속밀도 \\( B \\)를 구하시오.",
      answer: `\\( B = ${numLatex(B)}\\,\\mathrm{T} \\)`,
      steps: [
        `앙페르 법칙(토로이드): \\( B = \\dfrac{\\mu_0 N I}{2\\pi r} \\)`,
        `\\( B = \\dfrac{(4\\pi\\times10^{-7})(${N})(${I})}{2\\pi(${r})} = ${numLatex(B)}\\,\\mathrm{T} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 12. 동축 케이블(원통 커패시터)의 정전용량
// =====================================================================
const coaxCapacitance: EmEntry = {
  id: "coax_capacitance",
  topicKey: "capacitance",
  title: "동축 케이블의 정전용량",
  keywords: ["동축 케이블", "동축선", "원통 커패시터", "원통형 축전기", "정전용량", "전기용량", "유전율", "capacit"],
  strongKeywords: ["동축", "coax", "원통 커패시터", "원통형 축전기"],
  geometry: "coax",
  build(mode, rand) {
    const aMm = pick([1, 2], rand); // 내부 도체 반지름
    const bMm = pick([4, 6, 8, 10], rand); // 외부 도체 반지름 (항상 a보다 큼)
    const epsR = pick([1, 2, 2.25, 4], rand);
    const Lm = pick([1, 2, 5, 10], rand);
    const lnr = Math.log(bMm / aMm);
    const C = 2 * Math.PI * EPS0 * epsR * Lm / lnr;
    const diagram: EmFieldDiagram = {
      geometry: "coax",
      title: "동축 케이블 단면",
      labels: { inner: `a = ${aMm}\\,\\mathrm{mm}`, outer: `b = ${bMm}\\,\\mathrm{mm}`, epsR: `\\varepsilon_r = ${epsR}`, length: `L = ${Lm}\\,\\mathrm{m}`, cap: "C" },
    };
    const givensBase = [
      `내부 도체 반지름 \\( a = ${aMm}\\,\\mathrm{mm} \\)`,
      `외부 도체 반지름 \\( b = ${bMm}\\,\\mathrm{mm} \\)`,
      `유전체 비유전율 \\( \\varepsilon_r = ${epsR} \\)`,
      `케이블 길이 \\( L = ${Lm}\\,\\mathrm{m} \\)`,
      `\\( \\varepsilon_0 = 8.85 \\times 10^{-12}\\,\\mathrm{F/m} \\)`,
    ];
    if (mode === "exam_variant") {
      // 변형: 인가 전압 시 저장 에너지 U = ½CV²
      const Vv = pick([100, 200, 500, 1000], rand);
      const U = 0.5 * C * Vv * Vv;
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "내부 도체와 외부 도체 사이가 유전체로 채워진 동축 케이블에 일정한 전압이 인가되어 있다. 케이블에 저장되는 정전 에너지를 구하려고 한다.",
        givens: [...givensBase, `인가 전압 \\( V = ${Vv}\\,\\mathrm{V} \\)`],
        question: "동축 케이블에 저장되는 에너지 \\( U \\)를 구하시오.",
        answer: `\\( U = ${numLatex(U)}\\,\\mathrm{J} \\)`,
        steps: [
          `동축(원통) 커패시터 정전용량: \\( C = \\dfrac{2\\pi\\varepsilon_0\\varepsilon_r L}{\\ln(b/a)} = ${numLatex(C)}\\,\\mathrm{F} \\)`,
          `저장 에너지: \\( U = \\tfrac{1}{2}CV^2 = \\tfrac{1}{2}(${numLatex(C)})(${Vv})^2 = ${numLatex(U)}\\,\\mathrm{J} \\)`,
        ],
        diagram: { ...diagram, labels: { ...diagram.labels, voltage: `V = ${Vv}\\,\\mathrm{V}` } },
      };
    }
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "내부 도체와 외부 도체 사이가 유전체로 채워진 동축 케이블이 있다. 이 케이블의 정전용량을 구하려고 한다.",
      givens: givensBase,
      question: "이 동축 케이블의 정전용량 \\( C \\)를 구하시오.",
      answer: `\\( C = ${numLatex(C)}\\,\\mathrm{F} \\)`,
      steps: [
        `동축(원통) 커패시터 정전용량: \\( C = \\dfrac{2\\pi\\varepsilon_0\\varepsilon_r L}{\\ln(b/a)} \\)`,
        `\\( C = \\dfrac{2\\pi(8.85\\times10^{-12})(${epsR})(${Lm})}{\\ln(${bMm}/${aMm})} = ${numLatex(C)}\\,\\mathrm{F} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 12b. 실린더형(동축) 커패시터 — 두 유전체 축방향 나란히(병렬) (임용 22번)
//     ε₁이 길이 L₁, ε₂가 길이 L₂를 채움(같은 a·b 공유) → 두 동축 커패시터 병렬.
//     C = C₁+C₂ = 2π(ε_r1·L₁+ε_r2·L₂)ε₀/ln(b/a). a·b는 기호로 유지(원본 답=Nπε₀/ln(b/a)).
// =====================================================================
/** 깔끔한 분수 문자열 — 정수면 정수, 아니면 기약분수 \dfrac. (num은 0.5 배수 허용) */
function fracOrNum(num: number, den: number): string {
  let n = Math.round(num * 2), d2 = den * 2; // 0.5 배수 정수화
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const gg = g(Math.abs(n), Math.abs(d2)) || 1;
  n /= gg; d2 /= gg;
  if (d2 === 1) return `${n}`;
  return `\\dfrac{${n}}{${d2}}`;
}
/** ε_r 값 표기 — 정수면 정수, 반정수면 소수. */
function erStr(er: number): string {
  return Number.isInteger(er) ? `${er}` : `${er}`;
}
type CoaxDielSet = { er1: number; er2: number; l1: number; l2: number };
function buildCoaxDielSpace(): CoaxDielSet[] {
  const ers = [1.5, 2, 2.5, 3, 4]; // 유전체(ε_r>1) — 진공(1) 제외
  const ls = [1, 2, 3];
  const out: CoaxDielSet[] = [];
  for (const er1 of ers) for (const er2 of ers) {
    if (er1 === er2) continue; // 서로 다른 유전체
    for (const l1 of ls) for (const l2 of ls) {
      const sumEL = er1 * l1 + er2 * l2;
      if (Math.abs(sumEL * 2 - Math.round(sumEL * 2)) > 1e-9) continue; // N=2·sumEL 정수
      const N = 2 * sumEL;
      if (N < 4 || N > 40) continue;
      // 원본(ε_r1=1.5·ε_r2=2·L₁=2·L₂=1 → N=10) 제외
      if (er1 === 1.5 && er2 === 2 && l1 === 2 && l2 === 1) continue;
      out.push({ er1, er2, l1, l2 });
    }
  }
  return out;
}
const COAX_DIEL_SPACE = buildCoaxDielSpace();

const coaxTwoDielectricAxial: EmEntry = {
  id: "coax_two_dielectric_axial",
  topicKey: "capacitance",
  title: "두 유전체 실린더형(동축) 커패시터의 정전용량",
  keywords: ["실린더형 커패시터", "실린더형", "원통 커패시터", "정전용량", "유전체", "정전용량 합산", "각 구간"],
  // ★ "실린더형/원통형 + 두 유전체(축방향)" 조합이 결정적 — 단일 동축(coax_capacitance)·
  //   평판 두 유전체(dielectric_two_region_cap)와 구분. 감지 안전망(pipeline)도 병행.
  strongKeywords: ["실린더형", "원통형 커패시터", "두 개의 유전체", "두 유전체", "축방향"],
  geometry: "coax_two_dielectric",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const { er1, er2, l1, l2 } = pick(COAX_DIEL_SPACE, rand);
    const sumEL = er1 * l1 + er2 * l2;
    const N = 2 * sumEL; // C = Nπε₀/ln(b/a)
    const diagram: EmFieldDiagram = {
      geometry: "coax_two_dielectric",
      title: "두 유전체 실린더형 커패시터",
      labels: {
        eps1: `\\varepsilon_1 = ${erStr(er1)}\\varepsilon_0`,
        eps2: `\\varepsilon_2 = ${erStr(er2)}\\varepsilon_0`,
        len1: `${l1}`, len2: `${l2}`,
        len1Label: `L_1 = ${l1}\\,\\mathrm{m}`, len2Label: `L_2 = ${l2}\\,\\mathrm{m}`,
        inner: "a", outer: "b",
      },
    };
    const contentBase = `그림과 같이 안쪽과 바깥쪽 도체의 반지름이 각각 \\( a\\,[\\mathrm{m}] \\), \\( b\\,[\\mathrm{m}] \\)인 실린더형(동축) 커패시터로, 도체 사이에 두 개의 유전체 \\( \\varepsilon_1 = ${erStr(er1)}\\varepsilon_0\\,[\\mathrm{F/m}] \\), \\( \\varepsilon_2 = ${erStr(er2)}\\varepsilon_0\\,[\\mathrm{F/m}] \\)가 축방향으로 나란히 채워져 있다. \\( \\varepsilon_1 \\)은 길이 \\( L_1=${l1}\\,[\\mathrm{m}] \\), \\( \\varepsilon_2 \\)는 길이 \\( L_2=${l2}\\,[\\mathrm{m}] \\)를 채운다. (단, \\( \\varepsilon_0 \\)는 진공에서의 유전율이며, 원통 양단의 전계는 무시한다.)`;
    const givensBase = [
      `내부·외부 도체 반지름 \\( a \\), \\( b\\,[\\mathrm{m}] \\)`,
      `유전체 \\( \\varepsilon_1=${erStr(er1)}\\varepsilon_0 \\) (길이 \\( L_1=${l1}\\,\\mathrm{m} \\)), \\( \\varepsilon_2=${erStr(er2)}\\varepsilon_0 \\) (길이 \\( L_2=${l2}\\,\\mathrm{m} \\))`,
    ];
    if (!variant) {
      // exam_similar — 원본 구조: 전체 정전용량 C 도출(축방향 병렬).
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: contentBase,
        givens: givensBase,
        question: `이 실린더형 커패시터의 정전용량 \\( C\\,[\\mathrm{F}] \\)를 구하시오.`,
        answer: `\\( C = \\dfrac{${N}\\pi\\varepsilon_0}{\\ln\\!\\dfrac{b}{a}}\\,[\\mathrm{F}] \\)`,
        steps: [
          `축방향으로 나란한 두 유전체 구간은 같은 두 도체(반지름 \\( a \\), \\( b \\))를 공유하므로 **두 동축 커패시터의 병렬**이다. 각 구간 정전용량은 \\( C_k=\\dfrac{2\\pi\\varepsilon_k L_k}{\\ln(b/a)} \\).`,
          `\\( C_1=\\dfrac{2\\pi(${erStr(er1)}\\varepsilon_0)(${l1})}{\\ln(b/a)}=\\dfrac{${2 * er1 * l1}\\pi\\varepsilon_0}{\\ln(b/a)} \\), \\( C_2=\\dfrac{2\\pi(${erStr(er2)}\\varepsilon_0)(${l2})}{\\ln(b/a)}=\\dfrac{${2 * er2 * l2}\\pi\\varepsilon_0}{\\ln(b/a)} \\).`,
          `\\( C=C_1+C_2=\\dfrac{2\\pi\\varepsilon_0(${erStr(er1)}\\cdot${l1}+${erStr(er2)}\\cdot${l2})}{\\ln(b/a)}=\\dfrac{${N}\\pi\\varepsilon_0}{\\ln(b/a)}\\,\\mathrm{F} \\).`,
        ],
        diagram,
      };
    }
    // exam_variant — 구하는 양 교환: 전체를 하나의 균일 유전체로 채웠을 때 같은 C를 주는 등가 비유전율.
    const erEq = fracOrNum(sumEL, l1 + l2);
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: contentBase,
      givens: givensBase,
      question: `이 커패시터와 동일한 정전용량을 갖도록, 전체 길이 \\( L_1+L_2 \\) 구간을 하나의 균일한 유전체(비유전율 \\( \\varepsilon_{r,\\mathrm{eq}} \\))로 채우려고 한다. 등가 비유전율 \\( \\varepsilon_{r,\\mathrm{eq}} \\)를 구하시오.`,
      answer: `\\( \\varepsilon_{r,\\mathrm{eq}} = ${erEq} \\)`,
      steps: [
        `축방향 병렬 정전용량 \\( C=\\dfrac{2\\pi\\varepsilon_0(\\varepsilon_{r1}L_1+\\varepsilon_{r2}L_2)}{\\ln(b/a)}=\\dfrac{${N}\\pi\\varepsilon_0}{\\ln(b/a)} \\).`,
        `균일 유전체(비유전율 \\( \\varepsilon_{r,\\mathrm{eq}} \\))로 전체 길이 \\( L_1+L_2=${l1 + l2}\\,\\mathrm{m} \\)를 채우면 \\( C=\\dfrac{2\\pi\\varepsilon_0\\,\\varepsilon_{r,\\mathrm{eq}}(L_1+L_2)}{\\ln(b/a)} \\).`,
        `두 식을 같게 두면 \\( \\varepsilon_{r,\\mathrm{eq}}=\\dfrac{\\varepsilon_{r1}L_1+\\varepsilon_{r2}L_2}{L_1+L_2}=\\dfrac{${erStr(er1)}\\cdot${l1}+${erStr(er2)}\\cdot${l2}}{${l1 + l2}}=${erEq} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 13. 구 커패시터(동심 구) / 고립 도체구의 정전용량
// =====================================================================
const sphericalCapacitor: EmEntry = {
  id: "spherical_capacitor",
  topicKey: "capacitance",
  title: "구 커패시터의 정전용량",
  keywords: ["구 커패시터", "구형 축전기", "동심구", "구 도체", "도체구", "정전용량", "전기용량", "유전율", "capacit"],
  strongKeywords: ["구 커패시터", "구형 커패시터", "구형 축전기", "동심 구", "동심구", "고립 도체구", "구 도체", "spherical"],
  geometry: "sphere_cap",
  build(mode, rand) {
    if (mode === "exam_variant") {
      // 변형: 고립 도체구 C = 4πε₀R (구조 단순화 — 다른 형태)
      const Rcm = pick([5, 10, 20, 30, 50], rand);
      const R = Rcm / 100;
      const C = 4 * Math.PI * EPS0 * R;
      const diagram: EmFieldDiagram = {
        geometry: "sphere_cap", title: "고립 도체구",
        labels: { kind: "isolated", radius: `R = ${Rcm}\\,\\mathrm{cm}`, cap: "C" },
      };
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "진공 중에 고립된 도체 구(반지름 R)가 있다. 이 도체구의 정전용량을 구하려고 한다.",
        givens: [
          `도체구 반지름 \\( R = ${Rcm}\\,\\mathrm{cm} = ${R}\\,\\mathrm{m} \\)`,
          `\\( \\varepsilon_0 = 8.85 \\times 10^{-12}\\,\\mathrm{F/m} \\)`,
        ],
        question: "고립 도체구의 정전용량 \\( C \\)를 구하시오.",
        answer: `\\( C = ${numLatex(C)}\\,\\mathrm{F} \\)`,
        steps: [
          `고립 도체구의 정전용량: \\( C = 4\\pi\\varepsilon_0 R \\)`,
          `\\( C = 4\\pi(8.85\\times10^{-12})(${R}) = ${numLatex(C)}\\,\\mathrm{F} \\)`,
        ],
        diagram,
      };
    }
    const aCm = pick([2, 5, 10], rand);
    const bCm = pick([20, 30, 50], rand); // 항상 a보다 큼
    const epsR = pick([1, 2, 4], rand);
    const a = aCm / 100, b = bCm / 100;
    const C = 4 * Math.PI * EPS0 * epsR * (a * b) / (b - a);
    const diagram: EmFieldDiagram = {
      geometry: "sphere_cap", title: "동심 구 커패시터",
      labels: { kind: "concentric", inner: `a = ${aCm}\\,\\mathrm{cm}`, outer: `b = ${bCm}\\,\\mathrm{cm}`, epsR: `\\varepsilon_r = ${epsR}`, cap: "C" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "안쪽 구 도체(반지름 a)와 바깥쪽 구 껍질 도체(반지름 b) 사이가 유전체로 채워진 동심 구 커패시터가 있다. 이 커패시터의 정전용량을 구하려고 한다.",
      givens: [
        `내부 도체 반지름 \\( a = ${aCm}\\,\\mathrm{cm} = ${a}\\,\\mathrm{m} \\)`,
        `외부 도체 반지름 \\( b = ${bCm}\\,\\mathrm{cm} = ${b}\\,\\mathrm{m} \\)`,
        `유전체 비유전율 \\( \\varepsilon_r = ${epsR} \\)`,
        `\\( \\varepsilon_0 = 8.85 \\times 10^{-12}\\,\\mathrm{F/m} \\)`,
      ],
      question: "이 동심 구 커패시터의 정전용량 \\( C \\)를 구하시오.",
      answer: `\\( C = ${numLatex(C)}\\,\\mathrm{F} \\)`,
      steps: [
        `동심 구 커패시터: \\( C = 4\\pi\\varepsilon_0\\varepsilon_r \\dfrac{ab}{b-a} \\)`,
        `\\( C = 4\\pi(8.85\\times10^{-12})(${epsR})\\dfrac{(${a})(${b})}{${b}-${a}} = ${numLatex(C)}\\,\\mathrm{F} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 14. 솔레노이드의 자기 인덕턴스 (자체 인덕턴스)
// =====================================================================
const selfInductance: EmEntry = {
  id: "self_inductance",
  topicKey: "em_induction",
  title: "솔레노이드의 자기 인덕턴스",
  keywords: ["인덕턴스", "코일", "솔레노이드", "자기 에너지", "유도계수", "권선"],
  // ★ bare "인덕턴스"는 strong에서 제외 — "상호 인덕턴스"의 부분문자열이라 상호유도 문제에 오발화.
  //   자기/자체만 strong, 상호는 mutualInductance가 "상호 인덕턴스"로 더 높게 가져감.
  strongKeywords: ["자기 인덕턴스", "자체 인덕턴스", "자기 유도계수", "self-inductance"],
  geometry: "solenoid",
  build(mode, rand) {
    const N = pick([100, 200, 400, 500], rand);
    const Acm2 = pick([5, 10, 20, 50], rand);
    const lcm = pick([10, 20, 25, 50], rand);
    const A = Acm2 * 1e-4, l = lcm / 100;
    const L = MU0 * N * N * A / l;
    const diagram: EmFieldDiagram = {
      geometry: "solenoid", title: "솔레노이드 인덕터",
      labels: { turns: `N = ${N}`, length: `l = ${lcm}\\,\\mathrm{cm}`, current: `A = ${Acm2}\\,\\mathrm{cm^2}`, field: "L" },
    };
    const givensBase = [
      `총 권선수 \\( N = ${N} \\)`,
      `단면적 \\( A = ${Acm2}\\,\\mathrm{cm^2} = ${numLatex(A)}\\,\\mathrm{m^2} \\)`,
      `솔레노이드 길이 \\( l = ${lcm}\\,\\mathrm{cm} = ${l}\\,\\mathrm{m} \\)`,
      `\\( \\mu_0 = 4\\pi \\times 10^{-7}\\,\\mathrm{T\\cdot m/A} \\)`,
    ];
    if (mode === "exam_variant") {
      // 변형: 코일에 전류 I 흐를 때 저장 자기 에너지 U = ½LI²
      const I = pick([2, 3, 5, 10], rand);
      const U = 0.5 * L * I * I;
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "단면적 A, 길이 l인 솔레노이드 코일(권선수 N)에 일정한 전류가 흐른다. 코일에 저장되는 자기 에너지를 구하려고 한다.",
        givens: [...givensBase, `전류 \\( I = ${I}\\,\\mathrm{A} \\)`],
        question: "솔레노이드에 저장되는 자기 에너지 \\( U \\)를 구하시오.",
        answer: `\\( U = ${numLatex(U)}\\,\\mathrm{J} \\)`,
        steps: [
          `자기 인덕턴스: \\( L = \\dfrac{\\mu_0 N^2 A}{l} = ${numLatex(L)}\\,\\mathrm{H} \\)`,
          `저장 자기 에너지: \\( U = \\tfrac{1}{2}LI^2 = \\tfrac{1}{2}(${numLatex(L)})(${I})^2 = ${numLatex(U)}\\,\\mathrm{J} \\)`,
        ],
        diagram,
      };
    }
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "단면적 A, 길이 l인 솔레노이드 코일에 도선이 N번 감겨 있다. 이 솔레노이드의 자기 인덕턴스를 구하려고 한다.",
      givens: givensBase,
      question: "솔레노이드의 자기 인덕턴스 \\( L \\)을 구하시오.",
      answer: `\\( L = ${numLatex(L)}\\,\\mathrm{H} \\)`,
      steps: [
        `솔레노이드의 자기 인덕턴스: \\( L = \\dfrac{\\mu_0 N^2 A}{l} \\)`,
        `\\( L = \\dfrac{(4\\pi\\times10^{-7})(${N})^2(${numLatex(A)})}{${l}} = ${numLatex(L)}\\,\\mathrm{H} \\)`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 15. 두 코일 사이의 상호 인덕턴스 (상호유도)
// =====================================================================
const mutualInductance: EmEntry = {
  id: "mutual_inductance",
  topicKey: "em_induction",
  title: "두 코일 사이의 상호 인덕턴스",
  keywords: ["상호 인덕턴스", "상호유도", "두 코일", "변압기", "1차 코일", "2차 코일", "유도 기전력", "결합"],
  strongKeywords: ["상호 인덕턴스", "상호유도", "상호 유도계수", "mutual inductance", "1차 코일", "2차 코일"],
  geometry: "mutual_coils",
  build(mode, rand) {
    const N1 = pick([100, 200, 300, 500], rand);
    const N2 = pick([100, 200, 400, 600], rand);
    const Acm2 = pick([5, 10, 20], rand);
    const lcm = pick([10, 20, 25, 50], rand);
    const A = Acm2 * 1e-4, l = lcm / 100;
    const M = MU0 * N1 * N2 * A / l;
    const labels: Record<string, string> = {
      n1: `N_1 = ${N1}`, n2: `N_2 = ${N2}`, area: `A = ${Acm2}\\,\\mathrm{cm^2}`, length: `l = ${lcm}\\,\\mathrm{cm}`, primary: "I_1", coupling: "M",
    };
    const givensBase = [
      `1차 코일 권선수 \\( N_1 = ${N1} \\)`,
      `2차 코일 권선수 \\( N_2 = ${N2} \\)`,
      `두 코일 공통 단면적 \\( A = ${Acm2}\\,\\mathrm{cm^2} = ${numLatex(A)}\\,\\mathrm{m^2} \\)`,
      `공통 길이 \\( l = ${lcm}\\,\\mathrm{cm} = ${l}\\,\\mathrm{m} \\)`,
      `\\( \\mu_0 = 4\\pi \\times 10^{-7}\\,\\mathrm{T\\cdot m/A} \\)`,
    ];
    if (mode === "exam_variant") {
      // 변형: 1차 전류 변화율 → 2차 유도 기전력 ε₂ = M·(dI₁/dt)
      const didt = pick([50, 100, 200, 500], rand); // A/s
      const emf2 = M * didt;
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: "같은 철심(단면적 A, 길이 l)에 1차 코일(N₁)과 2차 코일(N₂)이 감겨 있다. 1차 코일의 전류가 일정한 비율로 변할 때 2차 코일에 유도되는 기전력을 구하려고 한다.",
        givens: [...givensBase, `1차 전류 변화율 \\( \\dfrac{dI_1}{dt} = ${didt}\\,\\mathrm{A/s} \\)`],
        question: "2차 코일에 유도되는 기전력 \\( \\varepsilon_2 \\)를 구하시오.",
        answer: `\\( \\varepsilon_2 = ${numLatex(emf2)}\\,\\mathrm{V} \\)`,
        steps: [
          `상호 인덕턴스: \\( M = \\dfrac{\\mu_0 N_1 N_2 A}{l} = ${numLatex(M)}\\,\\mathrm{H} \\)`,
          `상호유도 기전력: \\( \\varepsilon_2 = M\\dfrac{dI_1}{dt} = (${numLatex(M)})(${didt}) = ${numLatex(emf2)}\\,\\mathrm{V} \\)`,
        ],
        diagram: { geometry: "mutual_coils", title: "공통 철심 위 두 코일 (상호유도)", labels: { ...labels, emf: "\\varepsilon_2" } },
      };
    }
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: "같은 철심(단면적 A, 길이 l)에 1차 코일(N₁)과 2차 코일(N₂)이 감겨 있다. 두 코일 사이의 상호 인덕턴스를 구하려고 한다.",
      givens: givensBase,
      question: "두 코일 사이의 상호 인덕턴스 \\( M \\)을 구하시오.",
      answer: `\\( M = ${numLatex(M)}\\,\\mathrm{H} \\)`,
      steps: [
        `상호 인덕턴스: \\( M = \\dfrac{\\mu_0 N_1 N_2 A}{l} \\)`,
        `\\( M = \\dfrac{(4\\pi\\times10^{-7})(${N1})(${N2})(${numLatex(A)})}{${l}} = ${numLatex(M)}\\,\\mathrm{H} \\)`,
      ],
      diagram: { geometry: "mutual_coils", title: "공통 철심 위 두 코일 (상호 인덕턴스)", labels },
    };
  },
};

// =====================================================================
// 16. 전위 함수 V(x,y,z) → 체적 전하 밀도 (벡터 미적분 / 푸아송)
//     임용 12번 형식: V 주어짐 → [1] V_P [2] E=−∇V·단위벡터 a_E [3] ρ_v=−ε₀∇²V.
//     ★ 특정 예시(½x²yz) 하드코딩이 아니라 범용 다항식 미분 엔진으로 임의 V 처리.
// =====================================================================

/** 단항식 c·x^ex·y^ey·z^ez */
type Mono = { c: number; ex: number; ey: number; ez: number };
type Poly = Mono[];

/** axis(0=x,1=y,2=z)에 대한 편미분. */
function dPoly(p: Poly, axis: 0 | 1 | 2): Poly {
  const out: Poly = [];
  for (const m of p) {
    const e = [m.ex, m.ey, m.ez];
    if (e[axis] === 0) continue;
    const c = m.c * e[axis];
    e[axis] -= 1;
    if (c !== 0) out.push({ c, ex: e[0], ey: e[1], ez: e[2] });
  }
  return out;
}

function dd(p: Poly, axis: 0 | 1 | 2): Poly {
  return dPoly(dPoly(p, axis), axis);
}

function evalPoly(p: Poly, x: number, y: number, z: number): number {
  return p.reduce((s, m) => s + m.c * Math.pow(x, m.ex) * Math.pow(y, m.ey) * Math.pow(z, m.ez), 0);
}

/** 같은 차수 항 합산 (라플라시안 표시용). */
function addPoly(...ps: Poly[]): Poly {
  const map = new Map<string, number>();
  for (const p of ps) for (const m of p) {
    const k = `${m.ex},${m.ey},${m.ez}`;
    map.set(k, (map.get(k) ?? 0) + m.c);
  }
  const out: Poly = [];
  for (const [k, c] of map) {
    if (Math.abs(c) < 1e-12) continue;
    const [ex, ey, ez] = k.split(",").map(Number);
    out.push({ c, ex, ey, ez });
  }
  return out;
}

/** 분수(분모 1·2) LaTeX. */
function fracLatex(x: number): string {
  if (Number.isInteger(x)) return String(x);
  const twice = x * 2;
  if (Number.isInteger(twice)) return `\\tfrac{${twice}}{2}`;
  return String(roundSig(x, 3));
}

function varsLatex(m: Mono): string {
  const part = (v: string, e: number) => (e === 0 ? "" : e === 1 ? v : `${v}^{${e}}`);
  return part("x", m.ex) + part("y", m.ey) + part("z", m.ez);
}

function polyLatex(p: Poly): string {
  if (p.length === 0) return "0";
  let s = "";
  p.forEach((m, i) => {
    const v = varsLatex(m);
    const a = Math.abs(m.c);
    const coeff = v ? (a === 1 ? "" : fracLatex(a)) : fracLatex(a);
    const body = coeff + v || "0";
    if (i === 0) s += (m.c < 0 ? "-" : "") + body;
    else s += ` ${m.c < 0 ? "-" : "+"} ` + body;
  });
  return s;
}

type PotCombo = { shapeId: string; V: Poly; P: [number, number, number]; E: [number, number, number]; lap: number; Vp: number };

type PotShape = { id: string; make: (c: number) => Poly };
// 유사: 원본형(½x²yz 계열). 변형: 다른 함수 구조(소자 종류 변경에 대응).
const SIMILAR_SHAPES: PotShape[] = [
  { id: "x2yz", make: (c) => [{ c, ex: 2, ey: 1, ez: 1 }] },
];
const VARIANT_SHAPES: PotShape[] = [
  { id: "xy2z", make: (c) => [{ c, ex: 1, ey: 2, ez: 1 }] },
  { id: "x2_y2", make: (c) => [{ c, ex: 2, ey: 0, ez: 0 }, { c, ex: 0, ey: 2, ez: 0 }] },
  { id: "x2y", make: (c) => [{ c, ex: 2, ey: 1, ez: 0 }] },
];
const POT_COEFFS = [0.5, 1, 2];

function buildPotentialSpace(shapes: PotShape[]): PotCombo[] {
  const out: PotCombo[] = [];
  for (const shape of shapes) for (const c of POT_COEFFS) {
    const V = shape.make(c);
    for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) for (let d = 1; d <= 3; d++) {
      const E: [number, number, number] = [
        -evalPoly(dPoly(V, 0), a, b, d),
        -evalPoly(dPoly(V, 1), a, b, d),
        -evalPoly(dPoly(V, 2), a, b, d),
      ];
      if (!E.every(Number.isInteger)) continue;
      if (E[0] === 0 && E[1] === 0 && E[2] === 0) continue; // E 0 아님
      const lap = evalPoly(dd(V, 0), a, b, d) + evalPoly(dd(V, 1), a, b, d) + evalPoly(dd(V, 2), a, b, d);
      if (!Number.isInteger(lap) || lap === 0) continue; // ρ 0 아님·정수
      const Vp = evalPoly(V, a, b, d);
      if (!Number.isInteger(Vp * 2)) continue; // V_P 깔끔(정수 또는 반정수)
      if (shape.id === "x2yz" && c === 0.5 && a === 1 && b === 2 && d === 2) continue; // 원본 제외
      out.push({ shapeId: shape.id, V, P: [a, b, d], E, lap, Vp });
    }
  }
  return out;
}
const POT_SPACE_SIMILAR = buildPotentialSpace(SIMILAR_SHAPES);
const POT_SPACE_VARIANT = buildPotentialSpace(VARIANT_SHAPES);

const potentialToChargeDensity: EmEntry = {
  id: "potential_to_charge_density",
  topicKey: "gauss_law",
  title: "전위 함수로부터 체적 전하 밀도",
  keywords: ["전위", "전계", "전기장", "등전위면", "단위 벡터", "자유 공간", "기울기", "발산", "gradient", "divergence"],
  strongKeywords: ["체적 전하 밀도", "체적전하밀도", "전위 함수", "라플라시안", "푸아송", "poisson", "∇²", "∇^2", "rho_v", "ρ_v", "ρv", "v(x,y,z)", "v(x, y, z)", "-∇v", "div d"],
  geometry: "potential_field",
  build(mode, rand) {
    const space = mode === "exam_variant" ? POT_SPACE_VARIANT : POT_SPACE_SIMILAR;
    const cmb = pick(space, rand);
    const [a, b, d] = cmb.P;
    const dx = dPoly(cmb.V, 0), dy = dPoly(cmb.V, 1), dz = dPoly(cmb.V, 2);
    const lapPoly = addPoly(dd(cmb.V, 0), dd(cmb.V, 1), dd(cmb.V, 2));
    const sumsq = cmb.E[0] ** 2 + cmb.E[1] ** 2 + cmb.E[2] ** 2;
    const mag = Math.sqrt(sumsq);
    const Vexpr = polyLatex(cmb.V);
    const Evec = `(${cmb.E[0]},\\, ${cmb.E[1]},\\, ${cmb.E[2]})`;
    const rhoCoeff = -cmb.lap; // ρ_v = −ε₀·∇²V
    const rhoLatex = `${rhoCoeff}\\varepsilon_0`;

    const diagram: EmFieldDiagram = {
      geometry: "potential_field",
      title: "정전계 해석 흐름 (전위 → 전계 → 전하밀도)",
      labels: { vExpr: `V = ${Vexpr}`, point: `P(${a},\\,${b},\\,${d})`, efield: "E = -∇V", rho: "ρ_v = -ε₀∇²V" },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `자유 공간(유전율 \\( \\varepsilon_0 \\))에서 전위가 \\( V(x,y,z) = ${Vexpr}\\ [\\mathrm{V}] \\)로 주어진다. 점 \\( P(${a},\\,${b},\\,${d}) \\)에서의 체적 전하 밀도를 〈해석 절차〉에 따라 단계별로 구하려고 한다.`,
      givens: [
        `전위 함수 \\( V(x,y,z) = ${Vexpr} \\) [V]`,
        `구하는 점 \\( P(${a},\\,${b},\\,${d}) \\)`,
        `자유 공간 유전율 \\( \\varepsilon_0 \\)`,
      ],
      question: [
        `[단계 1] 점 P에서의 전위 \\( V_P \\) [V]를 구하시오.`,
        `[단계 2] \\( \\mathbf{E} = -\\nabla V \\) [V/m]와 등전위면에 수직한 단위 벡터 \\( \\mathbf{a}_E \\)를 구하시오.`,
        `[단계 3] \\( \\rho_v = \\nabla\\cdot\\mathbf{D} = -\\varepsilon_0 \\nabla^2 V \\) [C/m³]를 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( V_P = ${numLatex(cmb.Vp)}\\,\\mathrm{V} \\)`,
        `[단계 2] \\( \\mathbf{E} = ${Evec}\\,\\mathrm{V/m} \\), \\( |\\mathbf{E}| = \\sqrt{${sumsq}} \\), \\( \\mathbf{a}_E = \\dfrac{1}{\\sqrt{${sumsq}}}${Evec} \\)`,
        `[단계 3] \\( \\rho_v = ${rhoLatex}\\,\\mathrm{C/m^3} \\)`,
      ].join("\n"),
      steps: [
        `[단계 1] 점 P 대입: \\( V_P = V(${a},${b},${d}) = ${numLatex(cmb.Vp)}\\,\\mathrm{V} \\).`,
        `[단계 2] \\( \\nabla V = \\left( ${polyLatex(dx)},\\ ${polyLatex(dy)},\\ ${polyLatex(dz)} \\right) \\) 이므로 \\( \\mathbf{E} = -\\nabla V \\). 점 P 대입 → \\( \\mathbf{E} = ${Evec}\\,\\mathrm{V/m} \\). \\( |\\mathbf{E}| = \\sqrt{${sumsq}} \\approx ${numLatex(mag)} \\), 단위 벡터 \\( \\mathbf{a}_E = \\dfrac{\\mathbf{E}}{|\\mathbf{E}|} = \\dfrac{1}{\\sqrt{${sumsq}}}${Evec} \\).`,
        `[단계 3] \\( \\nabla^2 V = ${polyLatex(lapPoly)} \\), 점 P에서 \\( \\nabla^2 V = ${cmb.lap} \\). 자유 공간에서 \\( \\rho_v = \\nabla\\cdot\\mathbf{D} = \\varepsilon_0 \\nabla\\cdot\\mathbf{E} = -\\varepsilon_0 \\nabla^2 V = ${rhoLatex}\\,\\mathrm{C/m^3} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 17. 전계 주어짐 → 전위차(선적분) + 전기력선 총수(flux) → 미지 L 도출
//     임용 11번 형식: E = A(y−L)â_y + B z â_z 가 주어지고, 점 P·Q·R 사이 전위차와
//     "평면 S를 통과하는 전기력선의 총수 = N" 조건으로 파라미터 L을 단계별로 구한다.
//
//     ★ 특정 예시(8·4·24) 하드코딩이 아니라 (A,B,L,면적) 규칙 열거 + 선적분·플럭스 공식화.
//        - 전위차는 선적분 V_b−V_a = −∫E·dl (축 정렬 구간에서 닫힌형).
//        - 전기력선 총수 N = ∮ E·dA = |E_⊥|·S (평면 위 균일 성분).
//        - 두 결과 모두 L에 대해 2차 동차(∝ L²·L¹)라 단계1·2는 L의 식(기호), 단계3에서 L 수치 도출.
// =====================================================================
type FluxCombo = { A: number; B: number; L: number; S: number };

/** (A,B,L,면적) 규칙 열거 — 계수 정수·V_QP 비영·원본(8,4,…) 제외. */
function buildFluxSpace(variant: boolean): FluxCombo[] {
  const As = [2, 4, 6, 8];
  const Bs = [2, 4, 6];
  const Ls = [1, 2, 3];
  const Ss = [5, 10, 20];
  const out: FluxCombo[] = [];
  for (const A of As) for (const B of Bs) for (const L of Ls) for (const S of Ss) {
    if (A === 3 * B) continue; // V_QP = ((A−3B)/2)L² 이 0이 되지 않도록
    if (!variant && A === 8 && B === 4) continue; // 원본 계수쌍 제외(참조 전용)
    out.push({ A, B, L, S });
  }
  return out;
}
const FLUX_SPACE_SIMILAR = buildFluxSpace(false);
const FLUX_SPACE_VARIANT = buildFluxSpace(true);

/** c·L² 를 LaTeX 로 (c=±1 은 계수 생략). */
function coefL2(c: number): string {
  if (c === 1) return "L^2";
  if (c === -1) return "-L^2";
  return `${c}L^2`;
}

const fieldPotentialFlux: EmEntry = {
  id: "field_potential_flux",
  topicKey: "electrostatics",
  title: "전계 속 전위차와 평면을 지나는 전기력선",
  // ★ 키워드는 이 유형의 고유 시그니처(전기력선·V_QP)로만 — "전계/전위/평면" 같은 범용어는
  //   다른 EM 문제(두 유전체 커패시터 등)를 가로채므로 제외.
  keywords: [
    "전기력선", "전위차", "선속", "전기력선의 총수", "전기 선속", "V_QP", "V_RP", "V_QR",
  ],
  // ★ "전기력선(의 총수)"·"전위차"는 이 유형의 결정적 시그니처 — 전위함수→전하밀도(∇²V)와 확실히 구분.
  strongKeywords: [
    "전기력선", "전기력선의 총수", "전기력선의 총 수", "전기 선속",
    "v_qp", "v_rp", "v_qr", "평면 s를 통과", "평면 s 를 통과", "평면을 통과하는 전기력선",
  ],
  geometry: "plane_flux",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const space = variant ? FLUX_SPACE_VARIANT : FLUX_SPACE_SIMILAR;
    const { A, B, L, S } = pick(space, rand);

    if (!variant) {
      // 유사(원본 구조): E = A(y−L)â_y + B z â_z, 평면 S = zx평면(y=0), 법선 −â_y.
      //   P(0,0,L) → R(0,L,L): y 0→L(z=L). V_RP = −∫₀^L A(y−L)dy = (A/2)L².
      //   R(0,L,L) → Q(0,L,2L): z L→2L(y=L). V_QR = −∫_L^{2L} B z dz = −(3B/2)L².
      const cRP = A / 2, cQR = -3 * B / 2, cQP = cRP + cQR;
      const N = A * L * S; // 전기력선 총수 = |E_y(y=0)|·S = (A L)·S
      const Lsolved = N / (A * S);
      const fieldStr = `\\mathbf{E} = ${A}(y - L)\\,\\mathbf{a}_y + ${B}z\\,\\mathbf{a}_z`;
      const diagram: EmFieldDiagram = {
        geometry: "plane_flux",
        title: "전계 속 평면 S와 전위차·전기력선",
        labels: {
          field: `E = ${A}(y−L)a_y + ${B}z a_z [N/C]`,
          perpAxis: "y", normalDir: "-a_y",
          area: `S = ${S} m²`, flux: `전기력선 총수 = ${N}`,
          pP: "P(0, 0, L)", pR: "R(0, L, L)", pQ: "Q(0, L, 2L)",
        },
      };
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: `공간에 전계 \\( ${fieldStr}\\ [\\mathrm{N/C}] \\)가 형성되어 있다. 그림은 \\( zx \\)평면 상에 면적이 \\( ${S}\\,\\mathrm{m^2} \\)인 평면 S를 나타낸 것이며, 세 점은 \\( P(0,0,L) \\), \\( Q(0,L,2L) \\), \\( R(0,L,L) \\)이다. (단, \\( x,y,z \\)축의 단위 벡터는 \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)이다.)`,
        givens: [
          `전계 \\( ${fieldStr}\\ [\\mathrm{N/C}] \\)`,
          `평면 S: \\( zx \\)평면 상, 면적 \\( ${S}\\,\\mathrm{m^2} \\)`,
          `세 점 \\( P(0,0,L),\\ Q(0,L,2L),\\ R(0,L,L) \\)`,
        ],
        question: [
          `[단계 1] 점 R과 점 P의 전위차 \\( V_{RP} \\)[V]와 점 Q와 점 R의 전위차 \\( V_{QR} \\)[V]를 구하시오.`,
          `[단계 2] [단계 1]의 결과를 이용하여 점 Q와 점 P의 전위차 \\( V_{QP} \\)[V]를 구하시오.`,
          `[단계 3] 평면 S에 수직인 단위 벡터가 \\( \\mathbf{a}_y \\)일 때, \\( y \\)축의 음(−) 방향으로 평면 S를 통과하는 전기력선의 총수가 \\( ${N} \\)을 만족하는 \\( L \\)을 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( V_{RP} = ${coefL2(cRP)}\\,\\mathrm{V} \\), \\( V_{QR} = ${coefL2(cQR)}\\,\\mathrm{V} \\)`,
          `[단계 2] \\( V_{QP} = ${coefL2(cQP)}\\,\\mathrm{V} \\)`,
          `[단계 3] \\( L = ${Lsolved}\\,\\mathrm{m} \\)`,
        ].join("\n"),
        steps: [
          `[단계 1] 전위차는 \\( V_b - V_a = -\\int_a^b \\mathbf{E}\\cdot d\\mathbf{l} \\). \\(P\\to R\\)는 \\(y:0\\to L\\)(\\(z=L\\)) 이므로 \\( V_{RP} = -\\int_0^{L} ${A}(y-L)\\,dy = ${coefL2(cRP)}\\,\\mathrm{V} \\). \\(R\\to Q\\)는 \\(z:L\\to 2L\\)(\\(y=L\\)) 이므로 \\( V_{QR} = -\\int_{L}^{2L} ${B}z\\,dz = ${coefL2(cQR)}\\,\\mathrm{V} \\).`,
          `[단계 2] \\( V_{QP} = V_{QR} + V_{RP} = ${coefL2(cQR)} + (${coefL2(cRP)}) = ${coefL2(cQP)}\\,\\mathrm{V} \\).`,
          `[단계 3] 평면 S(\\(zx\\)평면, \\(y=0\\)) 위에서 \\( E_y = ${A}(0-L) = -${A}L \\)(균일). \\(y\\)축 음의 방향으로 통과하는 전기력선의 총수 \\( N = \\mathbf{E}\\cdot(-\\mathbf{a}_y)\\,S = (${A}L)(${S}) = ${A * S}L \\). \\( ${A * S}L = ${N} \\Rightarrow L = ${Lsolved}\\,\\mathrm{m} \\).`,
        ],
        diagram,
      };
    }

    // 변형(축·성분 교환): E = A y â_y + B(z−L) â_z, 평면 S = xy평면(z=0), 법선 −â_z.
    //   P(0,L,0) → R(0,L,L): z 0→L(y=L). V_RP = −∫₀^L B(z−L)dz = (B/2)L².
    //   R(0,L,L) → Q(0,2L,L): y L→2L(z=L). V_QR = −∫_L^{2L} A y dy = −(3A/2)L².
    const cRP = B / 2, cQR = -3 * A / 2, cQP = cRP + cQR;
    const N = B * L * S; // 전기력선 총수 = |E_z(z=0)|·S = (B L)·S
    const Lsolved = N / (B * S);
    const fieldStr = `\\mathbf{E} = ${A}y\\,\\mathbf{a}_y + ${B}(z - L)\\,\\mathbf{a}_z`;
    const diagram: EmFieldDiagram = {
      geometry: "plane_flux",
      title: "전계 속 평면 S와 전위차·전기력선",
      labels: {
        field: `E = ${A}y a_y + ${B}(z−L)a_z [N/C]`,
        perpAxis: "z", normalDir: "-a_z",
        area: `S = ${S} m²`, flux: `전기력선 총수 = ${N}`,
        pP: "P(0, L, 0)", pR: "R(0, L, L)", pQ: "Q(0, 2L, L)",
      },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `공간에 전계 \\( ${fieldStr}\\ [\\mathrm{N/C}] \\)가 형성되어 있다. 그림은 \\( xy \\)평면 상에 면적이 \\( ${S}\\,\\mathrm{m^2} \\)인 평면 S를 나타낸 것이며, 세 점은 \\( P(0,L,0) \\), \\( Q(0,2L,L) \\), \\( R(0,L,L) \\)이다. (단, \\( x,y,z \\)축의 단위 벡터는 \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)이다.)`,
      givens: [
        `전계 \\( ${fieldStr}\\ [\\mathrm{N/C}] \\)`,
        `평면 S: \\( xy \\)평면 상, 면적 \\( ${S}\\,\\mathrm{m^2} \\)`,
        `세 점 \\( P(0,L,0),\\ Q(0,2L,L),\\ R(0,L,L) \\)`,
      ],
      question: [
        `[단계 1] 점 R과 점 P의 전위차 \\( V_{RP} \\)[V]와 점 Q와 점 R의 전위차 \\( V_{QR} \\)[V]를 구하시오.`,
        `[단계 2] [단계 1]의 결과를 이용하여 점 Q와 점 P의 전위차 \\( V_{QP} \\)[V]를 구하시오.`,
        `[단계 3] 평면 S에 수직인 단위 벡터가 \\( \\mathbf{a}_z \\)일 때, \\( z \\)축의 음(−) 방향으로 평면 S를 통과하는 전기력선의 총수가 \\( ${N} \\)을 만족하는 \\( L \\)을 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( V_{RP} = ${coefL2(cRP)}\\,\\mathrm{V} \\), \\( V_{QR} = ${coefL2(cQR)}\\,\\mathrm{V} \\)`,
        `[단계 2] \\( V_{QP} = ${coefL2(cQP)}\\,\\mathrm{V} \\)`,
        `[단계 3] \\( L = ${Lsolved}\\,\\mathrm{m} \\)`,
      ].join("\n"),
      steps: [
        `[단계 1] 전위차는 \\( V_b - V_a = -\\int_a^b \\mathbf{E}\\cdot d\\mathbf{l} \\). \\(P\\to R\\)는 \\(z:0\\to L\\)(\\(y=L\\)) 이므로 \\( V_{RP} = -\\int_0^{L} ${B}(z-L)\\,dz = ${coefL2(cRP)}\\,\\mathrm{V} \\). \\(R\\to Q\\)는 \\(y:L\\to 2L\\)(\\(z=L\\)) 이므로 \\( V_{QR} = -\\int_{L}^{2L} ${A}y\\,dy = ${coefL2(cQR)}\\,\\mathrm{V} \\).`,
        `[단계 2] \\( V_{QP} = V_{QR} + V_{RP} = ${coefL2(cQR)} + (${coefL2(cRP)}) = ${coefL2(cQP)}\\,\\mathrm{V} \\).`,
        `[단계 3] 평면 S(\\(xy\\)평면, \\(z=0\\)) 위에서 \\( E_z = ${B}(0-L) = -${B}L \\)(균일). \\(z\\)축 음의 방향으로 통과하는 전기력선의 총수 \\( N = \\mathbf{E}\\cdot(-\\mathbf{a}_z)\\,S = (${B}L)(${S}) = ${B * S}L \\). \\( ${B * S}L = ${N} \\Rightarrow L = ${Lsolved}\\,\\mathrm{m} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 18. 두 평판 도체 사이 서로 다른 유전체 2개 커패시터
//     임용 11번 형식: 면적 A·간격 d, 유전율 다른 유전체 ⓐ(ε_a)·ⓑ(ε_b), 부피비 1:m.
//     [1] 표면전하밀도 비 ρ_a/ρ_b·전계 E_z, [2] 전위차 V_d, [3] 정전용량 C_d.
//     ★ exam_similar=병렬(나란히, 같은 V·다른 σ) / exam_variant=직렬(적층, 같은 D·다른 E).
//        모두 결정론 닫힌형(GPT 없음), 답은 Q·A·d·ε₀ 기호식(계수만 수치).
// =====================================================================
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

/** p/q 를 기약분수 LaTeX 로 (정수면 그대로). */
function ratioLatex(p: number, q: number): string {
  const g = gcd(p, q) || 1;
  const np = p / g, nq = q / g;
  return nq === 1 ? `${np}` : `\\dfrac{${np}}{${nq}}`;
}

/** k·ε₀ (k=1 은 계수 생략). */
function epsLatex(k: number): string {
  return k === 1 ? "\\varepsilon_0" : `${k}\\varepsilon_0`;
}

/** 계수 c 와 기호 sym 결합 (c=1 이면 계수 생략, sym 없으면 숫자). */
function coefTimes(c: number, sym: string): string {
  if (!sym) return `${c}`;
  return c === 1 ? sym : `${c}${sym}`;
}

/** (numC·numSym)/(denC·denSym) 를 gcd 약분해 LaTeX 분수로 (분모 1이면 분자만). */
function reducedFrac(numC: number, numSym: string, denC: number, denSym: string): string {
  const g = gcd(numC, denC) || 1;
  const top = coefTimes(numC / g, numSym);
  const bot = coefTimes(denC / g, denSym);
  return bot === "1" ? top : `\\dfrac{${top}}{${bot}}`;
}

const EPS_A = "\\varepsilon_0 A"; // ε₀A 공통 기호

type DielCombo = { ka: number; kb: number; m: number };
function buildDielSpace(): DielCombo[] {
  const ks = [1, 2, 3, 4, 5];
  const ms = [2, 3];
  const out: DielCombo[] = [];
  for (const ka of ks) for (const kb of ks) for (const m of ms) {
    if (ka === kb) continue; // 서로 다른 유전체
    out.push({ ka, kb, m });
  }
  return out;
}
const DIEL_SPACE = buildDielSpace();

// ── 직렬(적층) 전용 값 공간 — 임용 10번 구조(수치·d 역산) ──────────────────
//   각 유전체 두께 d(동일, 총 2d), 전하 ±Q[nC], 면적 S=s·π[m²], ε₀=1/(36π)×10⁻⁹.
//   |E_k| = 36·Q / (s·ε_rk)  [V/m],  V = (|E_1|+|E_2|)·d,  C = Q/V = C_num/d,
//   목표 정전용량 C_t[nF] → d = s·ε_r1·ε_r2 / (36·(ε_r1+ε_r2)·C_t) [m].
//   규칙 열거 + 정수/깔끔 필터([[feedback_generic_code]]), 원본 튜플은 풀에서 제외.
type DielSeriesSet = { s: number; er1: number; er2: number; Qnc: number; CtNf: number };
function buildDielSeriesSpace(): DielSeriesSet[] {
  const ss = [9, 12, 18, 24, 36];
  const ers = [2, 3, 4, 5, 6, 8];
  const qs = [2, 3, 4, 6, 8, 12];
  const cts = [100, 200, 250, 500, 1000];
  const out: DielSeriesSet[] = [];
  for (const s of ss) for (const er1 of ers) for (const er2 of ers) {
    if (er1 >= er2) continue; // 서로 다른 유전체 + er1<er2 (작은 ε → 큰 E, |E_1|>|E_2|)
    for (const Qnc of qs) {
      const E1 = (36 * Qnc) / (s * er1);
      const E2 = (36 * Qnc) / (s * er2);
      if (!Number.isInteger(E1) || !Number.isInteger(E2)) continue;
      if (E1 < 1 || E1 > 20 || E2 < 1) continue;
      for (const CtNf of cts) {
        const dmm = (1000 * s * er1 * er2) / (36 * (er1 + er2) * CtNf);
        if (dmm < 0.5 || dmm > 8) continue;
        if (Math.abs(dmm * 2 - Math.round(dmm * 2)) > 1e-9) continue; // 0.5 배수(깔끔)
        if (s === 18 && er1 === 3 && er2 === 6 && Qnc === 6 && CtNf === 500) continue; // 원본 제외
        out.push({ s, er1, er2, Qnc, CtNf });
      }
    }
  }
  return out;
}
const DIEL_SERIES_SPACE = buildDielSeriesSpace();

// ── 직렬(적층) 전위 분포 값 공간 — 임용 24번 구조(E 비율·경계전위 → V(z) 1차식) ──
//   두 유전체 두께 d1·d2[mm](서로 다름), 각 영역 전계 E₁=E₀a_z·E₂=k·E₀a_z,
//   경계 전위 V(0)=vBot·V(d1+d2)=vTop[mV]. E_z=−dV/dz(z[mm]·V[mV]이면 기울기 a=−E₀[mV/mm]).
//   V₁(z)=vBot+a·z, V₂(z)=k·a·z+(vBot+a·d1·(1−k)). vTop=vBot+a·(d1+k·d2).
//   규칙 열거 + 정수 계수/깔끔 경계전위 필터([[feedback_generic_code]]), 원본 튜플 제외.
type DielPotSet = { d1: number; d2: number; k: number; vBot: number; a: number };
function buildDielPotentialSpace(): DielPotSet[] {
  const dims = [1, 2, 3];
  const ks = [2, 3];
  const as = [10, 20, 30]; // 기울기 a [mV/mm] = |E₀| [V/m]
  const vBots = [0, 20];
  const out: DielPotSet[] = [];
  for (const d1 of dims) for (const d2 of dims) {
    if (d1 === d2) continue; // 두께 서로 다름(원본처럼)
    for (const k of ks) for (const a of as) for (const vBot of vBots) {
      const vTop = vBot + a * (d1 + k * d2);
      if (vTop > 300 || vTop % 10 !== 0) continue; // 깔끔한 경계 전위
      if (d1 === 1 && d2 === 2 && k === 2 && vBot === 0 && a === 20) continue; // 원본(V=20z·40z−20) 제외
      out.push({ d1, d2, k, vBot, a });
    }
  }
  return out;
}
const DIEL_POTENTIAL_SPACE = buildDielPotentialSpace();

/** 기울기·절편(mV)으로 z의 1차식 문자열 — 예: (20,0)→"20z", (40,-20)→"40z - 20". */
function formatLinearMv(slope: number, intercept: number): string {
  const sTerm = slope === 0 ? "" : slope === 1 ? "z" : slope === -1 ? "-z" : `${slope}z`;
  if (intercept === 0) return sTerm || "0";
  const sign = intercept > 0 ? "+" : "-";
  return `${sTerm} ${sign} ${Math.abs(intercept)}`;
}

const dielectricTwoRegionCap: EmEntry = {
  id: "dielectric_two_region_cap",
  topicKey: "capacitance",
  title: "두 유전체가 채워진 평판 커패시터",
  // ★ 일반 키워드는 두 유전체 고유어만 — 단일 평행판(parallel_plate_cap)과 겹치는
  //   "평행판·커패시터·축전기·유전율·정전용량·전기용량"은 제외(회귀 실측: 단일 평행판을 오탈취).
  //   두 유전체 신호는 strongKeywords가 담당하므로 일반 키워드는 최소화해도 라우팅 안전.
  keywords: [
    "평판 도체", "표면전하밀도", "표면 전하밀도", "전위차",
  ],
  // ★ "서로 다른 유전체 2개·표면전하밀도(의 비)·두 평판 도체"가 결정적 시그니처 —
  //   단일 유전체 평행판(C=εA/d)이나 전기력선 유형과 확실히 구분(+10).
  strongKeywords: [
    "서로 다른 유전체", "두 유전체", "2개의 유전체", "두 종류의 유전체",
    "표면전하밀도", "표면 전하밀도", "두 평판 도체", "두 평행판 도체",
    "ρ_a", "ρ_b", "부피", "영역의 유전율",
  ],
  geometry: "dielectric_slab",
  build(mode, rand, hints) {
    // ── 전위 분포 하위구조(임용 24번): E 비율·경계전위 → 각 영역 V(z) 1차식 ──
    //   전하·정전용량 구조(임용 10·11번)와 직교 — 원본이 이 구조면 유사·변형 모두
    //   V(z) 도출을 유지하고, 변형은 EM 관례대로 "구하는 양"만 교환(경계전위 ↔ 전계 E₀).
    if (hints?.dielectricStructure === "potential_distribution") {
      const variant = mode === "exam_variant";
      const { d1, d2, k, vBot, a } = pick(DIEL_POTENTIAL_SPACE, rand);
      const dTop = d1 + d2;
      const vTop = vBot + a * (d1 + k * d2);
      const E0 = -a; // E₀ = a_z 성분 [V/m] (V가 +z로 증가 → E_z<0)
      const slope1 = a, int1 = vBot;
      const slope2 = k * a, int2 = vBot + a * d1 * (1 - k);
      const v1 = formatLinearMv(slope1, int1); // 0<z<d1
      const v2 = formatLinearMv(slope2, int2); // d1<z<dTop
      const vMid = slope1 * d1 + int1;         // z=d1 경계 전위(연속)
      const kPref = k === 1 ? "" : `${k}`;
      const diagram: EmFieldDiagram = {
        geometry: "dielectric_slab",
        title: "두 유전체(적층) 평판 커패시터 — 전위 분포",
        labels: {
          split: "series",
          regionA: `E_1 = E_0 a_z  (0<z<${d1})`,
          regionB: `E_2 = ${kPref}E_0 a_z  (${d1}<z<${dTop})`,
          zTop: `z = ${dTop} mm`,
          zBot: "z = 0",
          qTop: variant ? "V = ?" : `V = ${vTop} mV`,
          qBot: `V = ${vBot} mV`,
          thickFracA: `${d1 / dTop}`, // 두께 비례 분할(원본 1:2가 아닌 변형도 정확)
          area: variant ? `E_0 = ${E0} V/m` : "",
        },
      };
      if (!variant) {
        // exam_similar — 원본 구조: 두 경계 전위 given → V(z) 도출.
        return {
          entryId: this.id, topicKey: this.topicKey, title: this.title,
          content: `그림과 같이 도체판 사이에 두께가 각각 \\( ${d1}\\,\\mathrm{mm} \\)와 \\( ${d2}\\,\\mathrm{mm} \\)인 두 유전체로 적층되어 채워져 있는 이상적인 평행판 커패시터가 있다. 각 유전체에서의 전계는 \\( \\mathbf{E}_1 = E_0\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\) \\( (0<z<${d1}\\,[\\mathrm{mm}]) \\)와 \\( \\mathbf{E}_2 = ${kPref}E_0\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\) \\( (${d1}<z<${dTop}\\,[\\mathrm{mm}]) \\)이고, \\( z=0 \\)과 \\( z=${dTop}\\,[\\mathrm{mm}] \\)에서의 전위가 각각 \\( ${vBot}\\,[\\mathrm{mV}] \\)와 \\( ${vTop}\\,[\\mathrm{mV}] \\)이다. (단, \\( \\mathbf{a}_z \\)는 \\( z \\)방향 단위벡터이고 \\( E_0 \\)는 상수이다. 도체 가장자리 효과 및 도체판 두께는 무시하며, 도체 내부 및 경계면에 전하는 존재하지 않는다.)`,
          givens: [
            `유전체1 두께 \\( ${d1}\\,\\mathrm{mm} \\), 유전체2 두께 \\( ${d2}\\,\\mathrm{mm} \\) (적층)`,
            `\\( \\mathbf{E}_1 = E_0\\,\\mathbf{a}_z \\), \\( \\mathbf{E}_2 = ${kPref}E_0\\,\\mathbf{a}_z \\)`,
            `\\( V(z=0)=${vBot}\\,\\mathrm{mV} \\), \\( V(z=${dTop}\\,\\mathrm{mm})=${vTop}\\,\\mathrm{mV} \\)`,
          ],
          question: `각 유전체 영역에서의 전위 \\( V(z)\\,[\\mathrm{mV}] \\)를 \\( 0<z<${d1} \\)과 \\( ${d1}<z<${dTop} \\) 구간에 대해 각각 구하시오.`,
          answer: `\\( 0<z<${d1} \\): \\( V(z)=${v1}\\,[\\mathrm{mV}] \\), \\( ${d1}<z<${dTop} \\): \\( V(z)=${v2}\\,[\\mathrm{mV}] \\)`,
          steps: [
            `[단계 1] 전계와 전위의 관계는 \\( E_z=-\\dfrac{dV}{dz} \\)이다. \\( 0<z<${d1} \\)에서 \\( E_z=E_0 \\)이므로 \\( V(z)=V(0)-E_0 z=${vBot}-E_0 z \\).`,
            `[단계 2] \\( ${d1}<z<${dTop} \\)에서 \\( E_z=${kPref}E_0 \\)이므로 \\( V(z)=V(${d1})-${kPref}E_0(z-${d1}) \\).`,
            `[단계 3] 경계조건 \\( V(${dTop})=${vTop} \\), \\( V(0)=${vBot} \\)를 대입하면 \\( -E_0(${d1}+${k}\\cdot${d2})=${vTop - vBot} \\) → \\( -E_0=${a} \\) (즉 \\( E_0=${E0}\\,\\mathrm{V/m} \\)). 따라서 \\( 0<z<${d1} \\): \\( V(z)=${v1} \\), \\( ${d1}<z<${dTop} \\): \\( V(z)=${v2} \\). 경계 \\( z=${d1} \\)에서 \\( V=${vMid}\\,\\mathrm{mV} \\)로 연속이다.`,
          ],
          diagram,
        };
      }
      // exam_variant — 구하는 양 교환: 전계 \(E_0\) given → V(z)와 상단 도체판 전위 도출.
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: `그림과 같이 도체판 사이에 두께가 각각 \\( ${d1}\\,\\mathrm{mm} \\)와 \\( ${d2}\\,\\mathrm{mm} \\)인 두 유전체로 적층되어 채워져 있는 이상적인 평행판 커패시터가 있다. 각 유전체에서의 전계는 \\( \\mathbf{E}_1 = E_0\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\) \\( (0<z<${d1}\\,[\\mathrm{mm}]) \\)와 \\( \\mathbf{E}_2 = ${kPref}E_0\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\) \\( (${d1}<z<${dTop}\\,[\\mathrm{mm}]) \\)이며, \\( E_0=${E0}\\,[\\mathrm{V/m}] \\)이다. \\( z=0 \\)에서의 전위는 \\( ${vBot}\\,[\\mathrm{mV}] \\)이다. (단, \\( \\mathbf{a}_z \\)는 \\( z \\)방향 단위벡터이다. 도체 가장자리 효과 및 도체판 두께는 무시하며, 경계면에 전하는 존재하지 않는다.)`,
        givens: [
          `유전체1 두께 \\( ${d1}\\,\\mathrm{mm} \\), 유전체2 두께 \\( ${d2}\\,\\mathrm{mm} \\) (적층)`,
          `\\( \\mathbf{E}_1 = E_0\\,\\mathbf{a}_z \\), \\( \\mathbf{E}_2 = ${kPref}E_0\\,\\mathbf{a}_z \\), \\( E_0=${E0}\\,\\mathrm{V/m} \\)`,
          `\\( V(z=0)=${vBot}\\,\\mathrm{mV} \\)`,
        ],
        question: `각 유전체 영역에서의 전위 \\( V(z)\\,[\\mathrm{mV}] \\)와 상단 도체판(\\( z=${dTop}\\,\\mathrm{mm} \\))의 전위를 구하시오.`,
        answer: `\\( 0<z<${d1} \\): \\( V(z)=${v1}\\,[\\mathrm{mV}] \\), \\( ${d1}<z<${dTop} \\): \\( V(z)=${v2}\\,[\\mathrm{mV}] \\), \\( V(z=${dTop})=${vTop}\\,[\\mathrm{mV}] \\)`,
        steps: [
          `[단계 1] \\( E_z=-\\dfrac{dV}{dz} \\), \\( E_0=${E0} \\)이므로 \\( 0<z<${d1} \\)에서 \\( V(z)=${vBot}-E_0 z=${v1} \\).`,
          `[단계 2] \\( ${d1}<z<${dTop} \\)에서 \\( E_z=${kPref}E_0 \\)이므로 \\( V(z)=V(${d1})-${kPref}E_0(z-${d1})=${v2} \\). (경계 \\( z=${d1} \\)에서 \\( V=${vMid}\\,\\mathrm{mV} \\)로 연속.)`,
          `[단계 3] 상단 도체판 전위는 \\( V(${dTop})=${v2.replace(/z/g, `\\cdot ${dTop}`)}=${vTop}\\,\\mathrm{mV} \\).`,
        ],
        diagram,
      };
    }

    const { ka, kb, m } = pick(DIEL_SPACE, rand);
    const epsA = epsLatex(ka), epsB = epsLatex(kb);
    const ratioLabel = `1 : ${m}`;

    // ★ 직렬(적층)/병렬(나란히)은 mode가 아니라 원본의 구조적 속성이다.
    //   유사유형(exam_similar)은 원본 배치를 그대로 보존([[절대규칙 0]]),
    //   변형유형(exam_variant)은 반대 배치로 구조를 바꾼다(직렬↔병렬 dual).
    //   원본 배치 감지 실패 시 "병렬(나란히)"을 기본값으로(기존 임용 11번 형식 호환).
    const originalArrangement = hints?.dielectricArrangement ?? "parallel";
    const useSeries =
      mode === "exam_variant"
        ? originalArrangement !== "series" // 변형: 원본의 반대 배치
        : originalArrangement === "series"; // 유사: 원본 배치 유지

    if (!useSeries) {
      // 병렬(나란히): 같은 V·E, 다른 σ. A_a=A/(1+m), A_b=mA/(1+m).
      //   ρ_a/ρ_b = ε_a/ε_b = ka/kb. E_z = (1+m)Q / ((ka+m·kb)ε₀A). V_d=E·d. C_d=Q/V_d.
      const denom = ka + m * kb; // (ka + m kb)
      const numE = 1 + m;
      const diagram: EmFieldDiagram = {
        geometry: "dielectric_slab",
        title: "두 유전체(나란히) 평판 커패시터",
        labels: {
          split: "parallel", regionA: `ⓐ (${epsA})`, regionB: `ⓑ (${epsB})`,
          zTop: "z = d", zBot: "z = 0", area: "면적 A", ratio: `부피비 ⓐ:ⓑ = ${ratioLabel}`,
          qTop: "−Q", qBot: "+Q",
        },
      };
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: `그림과 같이 각각의 면적이 \\( A \\)인 두 평판 도체 사이의 간격이 \\( d \\)이고, 그 사이에 유전율이 서로 다른 2개의 유전체가 나란히 채워진 커패시터가 있다. \\(\\textcircled{a}\\)영역의 부피와 \\(\\textcircled{b}\\)영역의 부피의 비는 \\( ${ratioLabel} \\)이고, \\(\\textcircled{a}\\)영역 유전체의 유전율은 \\( \\varepsilon_a = ${epsA} \\), \\(\\textcircled{b}\\)영역 유전체의 유전율은 \\( \\varepsilon_b = ${epsB} \\)이다. (단, \\( \\mathbf{a}_z \\)는 \\( z \\)축 방향의 단위 벡터이고, 도체의 두께와 가장자리 효과는 무시한다.)`,
        givens: [
          `극판 면적 \\( A \\), 간격 \\( d \\)`,
          `두 유전체 유전율 \\( \\varepsilon_a = ${epsA} \\), \\( \\varepsilon_b = ${epsB} \\)`,
          `부피비 \\( \\textcircled{a} : \\textcircled{b} = ${ratioLabel} \\)`,
        ],
        question: [
          `[단계 1] 하부(\\(z=0\\)) 도체에 \\( +Q \\), 상부(\\(z=d\\)) 도체에 \\( -Q \\)의 전하가 대전될 때, 표면전하밀도 간의 비 \\( \\dfrac{\\rho_a}{\\rho_b} \\)와 전계 \\( \\mathbf{E}_z \\)[V/m]를 각각 순서대로 구하시오.`,
          `[단계 2] 두 도체의 전위차 \\( V_d \\)[V]를 구하시오.`,
          `[단계 3] 평판 커패시터의 정전용량 \\( C_d \\)[F]를 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( \\dfrac{\\rho_a}{\\rho_b} = ${ratioLatex(ka, kb)} \\), \\( \\mathbf{E}_z = ${reducedFrac(numE, "Q", denom, EPS_A)}\\,\\mathbf{a}_z\\,\\mathrm{[V/m]} \\)`,
          `[단계 2] \\( V_d = ${reducedFrac(numE, "Qd", denom, EPS_A)}\\,\\mathrm{[V]} \\)`,
          `[단계 3] \\( C_d = ${reducedFrac(denom, EPS_A, numE, "d")}\\,\\mathrm{[F]} \\)`,
        ].join("\n"),
        steps: [
          `[단계 1] 나란한(병렬) 유전체는 두 영역의 전계가 같다. 표면전하밀도 \\( \\rho = D = \\varepsilon E \\)이므로 \\( \\dfrac{\\rho_a}{\\rho_b} = \\dfrac{\\varepsilon_a}{\\varepsilon_b} = ${ratioLatex(ka, kb)} \\). 총전하 \\( Q = \\rho_a A_a + \\rho_b A_b \\), \\( A_a = \\dfrac{A}{${1 + m}} \\), \\( A_b = \\dfrac{${m}A}{${1 + m}} \\) 에 \\( \\rho=\\varepsilon E \\) 대입 → \\( Q = E\\,(\\varepsilon_a A_a + \\varepsilon_b A_b) = E\\dfrac{(${ka}+${m}\\cdot${kb})\\varepsilon_0 A}{${1 + m}} \\). \\( \\therefore \\mathbf{E}_z = ${reducedFrac(numE, "Q", denom, EPS_A)}\\,\\mathbf{a}_z \\).`,
          `[단계 2] \\( V_d = E_z\\, d = ${reducedFrac(numE, "Qd", denom, EPS_A)}\\,\\mathrm{V} \\).`,
          `[단계 3] \\( C_d = \\dfrac{Q}{V_d} = ${reducedFrac(denom, EPS_A, numE, "d")} \\). (병렬 합성 \\( C_d = \\varepsilon_a\\tfrac{A_a}{d} + \\varepsilon_b\\tfrac{A_b}{d} \\) 과 일치.)`,
        ],
        diagram,
      };
    }

    // 직렬(적층) — ★임용 10번 구조★: 각 유전체 두께 d(동일, 총 2d), 전하 ±Q[nC] given.
    //   [1] |E_1|,|E_2| 각각(수치) [2] V=(|E_1|+|E_2|)d 관계식 [3] 정전용량=C_t[nF] 되는 두께 d.
    //   D=Q/S(직렬 공통) → |E_k|=Q/(ε₀ε_rk S)=36Q/(s·ε_rk). ε₀S=(s/36)×10⁻⁹.
    const { s, er1, er2, Qnc, CtNf } = pick(DIEL_SERIES_SPACE, rand);
    const E1 = (36 * Qnc) / (s * er1);
    const E2 = (36 * Qnc) / (s * er2);
    const Vsum = E1 + E2; // V = Vsum·d
    const dmm = (1000 * s * er1 * er2) / (36 * (er1 + er2) * CtNf); // 두께 d [mm]
    const dmmStr = `${dmm}`;
    const diagram: EmFieldDiagram = {
      geometry: "dielectric_slab",
      title: "두 유전체(적층) 평판 커패시터",
      labels: {
        split: "series",
        regionA: `유전체1 (\\varepsilon_{r1}=${er1})`,
        regionB: `유전체2 (\\varepsilon_{r2}=${er2})`,
        zTop: "z = 2d", zBot: "z = 0",
        area: `S = ${s}\\pi\\,\\mathrm{m^2}`,
        ratio: "각 유전체 두께 d (총 2d)",
        qTop: `+${Qnc}\\,\\mathrm{nC}`, qBot: `-${Qnc}\\,\\mathrm{nC}`,
      },
    };
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `그림과 같이 도체판 1과 도체판 2 사이에 각각 두께 \\( d\\,[\\mathrm{m}] \\)인 유전체 1과 유전체 2로 채워져 있는 평행판 커패시터가 있다. 유전체 1, 2의 비유전율은 각각 \\( \\varepsilon_{r1}=${er1} \\), \\( \\varepsilon_{r2}=${er2} \\)이고, 두 도체판의 면적은 \\( S=${s}\\pi\\,[\\mathrm{m^2}] \\)로 동일하다. 두 도체판 사이의 전위차와 평행판 커패시터의 두께를 \\(\\langle\\)해석 절차\\(\\rangle\\)에 따라 구하여 서술하시오. (단, 자유공간의 유전율은 \\( \\varepsilon_0=\\dfrac{1}{36\\pi}\\times10^{-9}\\,[\\mathrm{F/m}] \\)이다. 전계의 모서리 효과(fringing effect) 및 도체판 두께는 무시한다.)`,
      givens: [
        `유전체 1, 2의 두께: 각각 \\( d\\,[\\mathrm{m}] \\) (동일, 총 간격 \\( 2d \\))`,
        `비유전율 \\( \\varepsilon_{r1}=${er1} \\), \\( \\varepsilon_{r2}=${er2} \\)`,
        `두 도체판의 면적 \\( S=${s}\\pi\\,[\\mathrm{m^2}] \\)`,
        `\\( \\varepsilon_0=\\dfrac{1}{36\\pi}\\times10^{-9}\\,[\\mathrm{F/m}] \\)`,
      ],
      question: [
        `[단계 1] 도체판 1에 \\( -${Qnc}\\,[\\mathrm{nC}] \\), 도체판 2에 \\( +${Qnc}\\,[\\mathrm{nC}] \\)이 대전되어 있을 때, 유전체 1 영역의 전계의 크기 \\( |E_1|\\,[\\mathrm{V/m}] \\)와 유전체 2 영역의 전계의 크기 \\( |E_2|\\,[\\mathrm{V/m}] \\)를 각각 구하시오.`,
        `[단계 2] 두 도체판 사이의 전위차 \\( V\\,[\\mathrm{V}] \\)를 두께 \\( d\\,[\\mathrm{m}] \\)의 관계식으로 표현하시오.`,
        `[단계 3] 평행판 커패시터의 전체 정전 용량이 \\( ${CtNf}\\,[\\mathrm{nF}] \\)이 되는 두께 \\( d\\,[\\mathrm{m}] \\)를 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( |E_1|=${E1}\\,[\\mathrm{V/m}] \\), \\( |E_2|=${E2}\\,[\\mathrm{V/m}] \\)`,
        `[단계 2] \\( V=${Vsum}d\\,[\\mathrm{V}] \\)`,
        `[단계 3] \\( d=${dmmStr}\\times10^{-3}\\,[\\mathrm{m}]=${dmmStr}\\,[\\mathrm{mm}] \\)`,
      ].join("\n"),
      steps: [
        `[단계 1] 적층(직렬)이므로 두 유전체의 전속밀도가 같다: \\( D=\\dfrac{Q}{S} \\). \\( |E|=\\dfrac{D}{\\varepsilon_0\\varepsilon_r}=\\dfrac{Q}{\\varepsilon_0\\varepsilon_r S} \\). \\( \\varepsilon_0 S=\\dfrac{1}{36\\pi}\\times10^{-9}\\cdot ${s}\\pi=\\dfrac{${s}}{36}\\times10^{-9} \\), \\( Q=${Qnc}\\times10^{-9}\\,\\mathrm{C} \\) 이므로 \\( |E_1|=\\dfrac{Q}{\\varepsilon_0\\varepsilon_{r1}S}=${E1}\\,\\mathrm{V/m} \\), \\( |E_2|=\\dfrac{Q}{\\varepsilon_0\\varepsilon_{r2}S}=${E2}\\,\\mathrm{V/m} \\).`,
        `[단계 2] 각 유전체의 두께가 \\( d \\)이므로 \\( V=|E_1|d+|E_2|d=(${E1}+${E2})d=${Vsum}d\\,\\mathrm{V} \\).`,
        `[단계 3] \\( C=\\dfrac{Q}{V}=\\dfrac{Q}{${Vsum}\\,d} \\)에 \\( C=${CtNf}\\times10^{-9}\\,\\mathrm{F} \\)를 대입 → \\( d=\\dfrac{Q}{${Vsum}\\cdot C}=\\dfrac{${Qnc}\\times10^{-9}}{${Vsum}\\times${CtNf}\\times10^{-9}}=${dmmStr}\\times10^{-3}\\,\\mathrm{m}=${dmmStr}\\,\\mathrm{mm} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 18b. 유전체 경계면 전계 굴절 + 정전 에너지 밀도 (임용 20번)
//     z=0 경계(법선 a_z)로 나뉜 두 유전체(z<0: ε_r1, z>0: ε_r2), 표면 자유전하 ρ_s=0.
//     경계조건: 접선 성분(a_x·a_y) 연속 → E₂x=E₁x·E₂y=E₁y. 법선 D 연속 → ε_r1E₁z=ε_r2E₂z
//     → E₂z=(ε_r1/ε_r2)E₁z. 에너지 밀도 w=½ε|E|²=½ε_rε₀|E|². ★그림 없음(순수 수식).
// =====================================================================
/** 전계 벡터 → LaTeX. 계수 ±1은 생략(예: 1a_x→a_x, -1a_z→-a_z). 첫 항은 항상 양수 성분. */
function eVecLatex(x: number, y: number, z: number): string {
  const term = (c: number, ax: string, first: boolean): string => {
    const sign = c >= 0 ? (first ? "" : "+ ") : first ? "-" : "- ";
    const mag = Math.abs(c);
    const coef = mag === 1 ? "" : `${mag}`;
    return `${sign}${coef}\\mathbf{a}_${ax}`;
  };
  return `${term(x, "x", true)} ${term(y, "y", false)} ${term(z, "z", false)}`;
}

type BndSet = { er1: number; er2: number; ex: number; ey: number; ez: number };
function buildDielBoundarySpace(): BndSet[] {
  const ers = [2, 3, 4, 5, 6];
  const comps = [1, 2, 3, 4];
  const ezs = [-4, -3, -2, -1, 1, 2, 3, 4];
  const out: BndSet[] = [];
  for (const er1 of ers) for (const er2 of ers) {
    if (er1 === er2) continue; // 서로 다른 유전체
    for (const ex of comps) for (const ey of comps) for (const ez of ezs) {
      const e2z = (er1 * ez) / er2;
      if (!Number.isInteger(e2z)) continue; // 법선 성분 정수
      const sq2 = ex * ex + ey * ey + e2z * e2z;
      const sq1 = ex * ex + ey * ey + ez * ez;
      const c2 = (er2 * sq2) / 2; // 영역2 에너지 계수 (w=c2·ε₀)
      const c1 = (er1 * sq1) / 2; // 영역1 에너지 계수 (변형용)
      if (!Number.isInteger(c2) || !Number.isInteger(c1)) continue; // 깔끔한 정수 에너지
      if (c2 > 80 || c1 > 80) continue;
      // 원본(ε_r1=3·ε_r2=2·E₁=3,2,−2 → E₂=3,2,−3·w=22ε₀) 제외
      if (er1 === 3 && er2 === 2 && ex === 3 && ey === 2 && ez === -2) continue;
      out.push({ er1, er2, ex, ey, ez });
    }
  }
  return out;
}
const DIEL_BND_SPACE = buildDielBoundarySpace();

const dielectricBoundaryField: EmEntry = {
  id: "dielectric_boundary_field",
  topicKey: "capacitance",
  title: "유전체 경계면에서의 전계와 정전 에너지 밀도",
  keywords: ["경계면", "경계 조건", "비유전율", "정전 에너지", "단위체적당", "전계", "유전체", "접선", "법선"],
  // ★ "두 유전율 영역(z<0·z>0) + 경계면 + 전계 E₁ 주어짐 + 정전 에너지"가 결정적 시그니처.
  //   평판/자속 면벡터와 구분. 감지 안전망(pipeline)도 병행.
  strongKeywords: ["경계면", "경계 조건", "굴절", "접선 성분", "법선 성분", "표면 전하밀도 ρ_s", "z<0", "z>0"],
  geometry: "potential_field", // 미사용(그림 생략) — 타입 충족용 placeholder
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const { er1, er2, ex, ey, ez } = pick(DIEL_BND_SPACE, rand);
    const e2z = (er1 * ez) / er2;
    const E1 = eVecLatex(ex, ey, ez);
    const E2 = eVecLatex(ex, ey, e2z);
    if (!variant) {
      // exam_similar — 원본 구조: E₁(z<0) given → E₂(z>0)와 w(영역2) 도출.
      const c2 = (er2 * (ex * ex + ey * ey + e2z * e2z)) / 2;
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: `직각좌표계에서 \\( z<0 \\)인 영역에는 비유전율 \\( \\varepsilon_{r1}=${er1} \\)인 유전체가, \\( z>0 \\)인 영역에는 \\( \\varepsilon_{r2}=${er2} \\)인 유전체가 있다. \\( z<0 \\)인 영역에서 전계가 \\( \\mathbf{E}_1 = ${E1}\\,[\\mathrm{V/m}] \\)일 때, \\( z>0 \\)인 영역에서의 전계 \\( \\mathbf{E}_2\\,[\\mathrm{V/m}] \\)와 단위체적당 정전 에너지 \\( w\\,[\\mathrm{J/m^3}] \\)를 구하시오. (단, \\( \\mathbf{a}_x, \\mathbf{a}_y, \\mathbf{a}_z \\)는 각각 \\( x, y, z \\)축 방향의 단위벡터, \\( \\varepsilon_0 \\)는 자유공간의 유전율, 유전체는 선형·등방성이며 경계면에서 표면 전하밀도 \\( \\rho_s=0 \\)이다.)`,
        givens: [
          `\\( z<0 \\): \\( \\varepsilon_{r1}=${er1} \\), \\( z>0 \\): \\( \\varepsilon_{r2}=${er2} \\)`,
          `\\( \\mathbf{E}_1 = ${E1}\\,[\\mathrm{V/m}] \\) (\\( z<0 \\)), 경계면 \\( \\rho_s=0 \\)`,
        ],
        question: `\\( z>0 \\)인 영역에서의 전계 \\( \\mathbf{E}_2 \\)와 단위체적당 정전 에너지 \\( w \\)를 구하시오.`,
        answer: `\\( \\mathbf{E}_2 = ${E2}\\,[\\mathrm{V/m}] \\), \\( w = ${c2}\\varepsilon_0\\,[\\mathrm{J/m^3}] \\)`,
        steps: [
          `경계면(\\( z=0 \\), 법선 \\( \\mathbf{a}_z \\))에서 **접선 성분(\\( \\mathbf{a}_x, \\mathbf{a}_y \\))의 전계는 연속**이다: \\( E_{2x}=E_{1x}=${ex} \\), \\( E_{2y}=E_{1y}=${ey} \\).`,
          `표면 자유전하가 없으므로(\\( \\rho_s=0 \\)) **법선 성분의 전속밀도 \\( D_z \\)가 연속**이다: \\( \\varepsilon_{r1}E_{1z}=\\varepsilon_{r2}E_{2z} \\) → \\( E_{2z}=\\dfrac{\\varepsilon_{r1}}{\\varepsilon_{r2}}E_{1z}=\\dfrac{${er1}}{${er2}}(${ez})=${e2z} \\). 따라서 \\( \\mathbf{E}_2=${E2} \\).`,
          `단위체적당 정전 에너지: \\( w=\\tfrac{1}{2}\\varepsilon_{r2}\\varepsilon_0|\\mathbf{E}_2|^2=\\tfrac{1}{2}(${er2})\\varepsilon_0(${ex}^2+${ey}^2+(${e2z})^2)=${c2}\\varepsilon_0\\,\\mathrm{J/m^3} \\).`,
        ],
      };
    }
    // exam_variant — 구하는 양 교환: E₂(z>0) given → E₁(z<0)와 w(영역1) 도출.
    const c1 = (er1 * (ex * ex + ey * ey + ez * ez)) / 2;
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `직각좌표계에서 \\( z<0 \\)인 영역에는 비유전율 \\( \\varepsilon_{r1}=${er1} \\)인 유전체가, \\( z>0 \\)인 영역에는 \\( \\varepsilon_{r2}=${er2} \\)인 유전체가 있다. \\( z>0 \\)인 영역에서 전계가 \\( \\mathbf{E}_2 = ${E2}\\,[\\mathrm{V/m}] \\)일 때, \\( z<0 \\)인 영역에서의 전계 \\( \\mathbf{E}_1\\,[\\mathrm{V/m}] \\)와 단위체적당 정전 에너지 \\( w\\,[\\mathrm{J/m^3}] \\)를 구하시오. (단, \\( \\mathbf{a}_x, \\mathbf{a}_y, \\mathbf{a}_z \\)는 각각 \\( x, y, z \\)축 방향의 단위벡터, \\( \\varepsilon_0 \\)는 자유공간의 유전율, 유전체는 선형·등방성이며 경계면에서 표면 전하밀도 \\( \\rho_s=0 \\)이다.)`,
      givens: [
        `\\( z<0 \\): \\( \\varepsilon_{r1}=${er1} \\), \\( z>0 \\): \\( \\varepsilon_{r2}=${er2} \\)`,
        `\\( \\mathbf{E}_2 = ${E2}\\,[\\mathrm{V/m}] \\) (\\( z>0 \\)), 경계면 \\( \\rho_s=0 \\)`,
      ],
      question: `\\( z<0 \\)인 영역에서의 전계 \\( \\mathbf{E}_1 \\)와 단위체적당 정전 에너지 \\( w \\)를 구하시오.`,
      answer: `\\( \\mathbf{E}_1 = ${E1}\\,[\\mathrm{V/m}] \\), \\( w = ${c1}\\varepsilon_0\\,[\\mathrm{J/m^3}] \\)`,
      steps: [
        `경계면(\\( z=0 \\), 법선 \\( \\mathbf{a}_z \\))에서 접선 성분은 연속: \\( E_{1x}=E_{2x}=${ex} \\), \\( E_{1y}=E_{2y}=${ey} \\).`,
        `\\( \\rho_s=0 \\)이므로 \\( D_z \\) 연속: \\( \\varepsilon_{r1}E_{1z}=\\varepsilon_{r2}E_{2z} \\) → \\( E_{1z}=\\dfrac{\\varepsilon_{r2}}{\\varepsilon_{r1}}E_{2z}=\\dfrac{${er2}}{${er1}}(${e2z})=${ez} \\). 따라서 \\( \\mathbf{E}_1=${E1} \\).`,
        `단위체적당 정전 에너지(\\( z<0 \\) 영역): \\( w=\\tfrac{1}{2}\\varepsilon_{r1}\\varepsilon_0|\\mathbf{E}_1|^2=\\tfrac{1}{2}(${er1})\\varepsilon_0(${ex}^2+${ey}^2+(${ez})^2)=${c1}\\varepsilon_0\\,\\mathrm{J/m^3} \\).`,
      ],
    };
  },
};

// =====================================================================
// 19. 자속밀도 B가 주어진 삼각 프리즘 — 면 벡터·자속·가우스 법칙 (정자계)
//     임용 형식: 자유공간에 정자계 B = p·aₓ + q·a_y + r·a_z [Wb/m²]. 도형은
//     밑면 정사각형(oabc)·삼각 단면(oce·abd)·경사면(bced, y+z=1)인 삼각 프리즘.
//     [1] 삼각면 oce 면 벡터 + 통과 자속, [2] 사각면 자속, [3] 가우스 법칙(∮B·dS=0)으로 경사면 자속.
//     ★ 결정론 닫힌형(GPT 없음), 면 벡터는 모두 외향 법선 → 폐곡면 순 자속=0으로 가우스 정확.
//        두 삼각면(x=0·x=1)은 자속이 상쇄 → 경사면 자속 = −(밑면+앞면) = q + r.
// =====================================================================

/** B = p aₓ + q a_y + r a_z 를 LaTeX 로. */
function bVecLatex(p: number, q: number, r: number): string {
  const tx = `${p}\\mathbf{a}_x`;
  const ty = `${q >= 0 ? "+" : "-"} ${Math.abs(q)}\\mathbf{a}_y`;
  const tz = `${r >= 0 ? "+" : "-"} ${Math.abs(r)}\\mathbf{a}_z`;
  return `${tx} ${ty} ${tz}`;
}

/** B = p a_x + q a_y + r a_z 를 SVG 라벨용 plain 문자열로. */
function bVecPlain(p: number, q: number, r: number): string {
  return `${p}a_x ${q >= 0 ? "+" : "−"} ${Math.abs(q)}a_y ${r >= 0 ? "+" : "−"} ${Math.abs(r)}a_z`;
}

/** 소수 한 자리까지 (정수면 정수, 반정수면 .5). */
function fluxNum(x: number): string {
  const rounded = Math.round(x * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

// (p, q, r) 자속밀도 후보 — 정수, 원본(3,−7,−2) 제외. 유사·변형 각각 다른 풀.
const FLUX_B_SIMILAR: Array<[number, number, number]> = [
  [2, -5, -3], [4, -6, 2], [-2, 4, -5], [6, -3, -4], [2, 5, 3], [-4, -6, 3], [4, 3, -5],
];
const FLUX_B_VARIANT: Array<[number, number, number]> = [
  [2, -4, 5], [-6, 3, -2], [4, -5, -6], [2, 6, -3], [-2, -5, 4], [6, 4, -3], [-4, 5, 2],
];

const magneticFluxPrism: EmEntry = {
  id: "magnetic_flux_prism",
  topicKey: "magnetostatics",
  title: "자속밀도가 주어진 삼각 프리즘의 면 자속과 가우스 법칙",
  keywords: [
    "자속", "자속밀도", "자속 밀도", "면 벡터", "면벡터", "가우스 법칙", "경사면",
    "삼각면", "사각면", "정자계", "자기 선속", "wb/m", "flux density",
  ],
  // ★ "면 벡터·경사면·삼각기둥의 각 면을 통과하는 자속"이 결정적 시그니처.
  //   ※ bare "자속밀도"는 strong에서 제외 — 직선 도선/솔레노이드/토로이드 등 B를 구하는
  //     모든 정자계 문제가 "자속밀도 B"를 언급해 오탈취하므로. 도형(삼각기둥) 시그니처로만 라우팅.
  strongKeywords: [
    "면 벡터", "면벡터", "경사면", "삼각면", "사각면",
    "이 면을 통과하는 자속", "면을 통과하는 자속", "삼각기둥",
  ],
  geometry: "flux_prism",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const [p, q, r] = pick(variant ? FLUX_B_VARIANT : FLUX_B_SIMILAR, rand);
    const bStr = bVecLatex(p, q, r);

    // 외향 법선 면 벡터 → 자속 Φ = B·S
    //   oce(x=0, ½·−aₓ): −p/2 | abd(x=1, ½·aₓ): p/2 | oabc(z=0, −a_z): −r
    //   oade(y=0, −a_y): −q | bced(y+z=1, (0,1,1)): q+r  (∮=0 → 삼각면 상쇄)
    const phiOce = -p / 2, phiAbd = p / 2, phiOabc = -r, phiOade = -q, phiBced = q + r;

    const diagram: EmFieldDiagram = {
      geometry: "flux_prism",
      title: "자속밀도 B 속의 삼각 프리즘",
      labels: {
        field: `B = ${bVecPlain(p, q, r)} [Wb/m²]`,
        hiFace: variant ? "oade" : "oabc", // [2]에서 묻는 사각면 강조
      },
    };

    if (!variant) {
      // 유사(원본 구조): [1] 삼각면 oce, [2] 사각면 oabc(밑면), [3] 경사면 bced(가우스).
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: `그림과 같이 자유 공간상의 직각 좌표계에 정자계의 자속 밀도 \\( \\mathbf{B} = ${bStr}\\ [\\mathrm{Wb/m^2}] \\)가 있다. 도형은 밑면이 정사각형 \\(oabc\\)이고 경사면 \\(bced\\)를 갖는 삼각기둥으로, 꼭짓점은 \\( o(0,0,0),\\ a(1,0,0),\\ b(1,1,0),\\ c(0,1,0),\\ d(1,0,1),\\ e(0,0,1) \\)이다. (단, \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)는 각각 \\(x,y,z\\)축 방향의 단위 벡터, 좌표계의 단위는 \\([\\mathrm{m}]\\)이며, 각 면의 면 벡터는 도형의 바깥쪽을 향하는 것으로 한다.)`,
        givens: [
          `자속 밀도 \\( \\mathbf{B} = ${bStr}\\ [\\mathrm{Wb/m^2}] \\)`,
          `삼각기둥 꼭짓점 \\( o(0,0,0),a(1,0,0),b(1,1,0),c(0,1,0),d(1,0,1),e(0,0,1) \\)`,
        ],
        question: [
          `[단계 1] 삼각면 \\(oce\\)의 면 벡터와 이 면을 통과하는 자속 \\([\\mathrm{Wb}]\\)을 각각 구하시오.`,
          `[단계 2] 사각면 \\(oabc\\)를 통과하는 자속 \\([\\mathrm{Wb}]\\)을 구하시오.`,
          `[단계 3] 가우스 법칙을 이용하여 경사면 \\(bced\\)를 통과하는 자속 \\([\\mathrm{Wb}]\\)을 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( \\mathbf{S}_{oce} = -\\tfrac{1}{2}\\mathbf{a}_x\\ [\\mathrm{m^2}] \\), \\( \\Phi_{oce} = ${fluxNum(phiOce)}\\,\\mathrm{Wb} \\)`,
          `[단계 2] \\( \\Phi_{oabc} = ${fluxNum(phiOabc)}\\,\\mathrm{Wb} \\)`,
          `[단계 3] \\( \\Phi_{bced} = ${fluxNum(phiBced)}\\,\\mathrm{Wb} \\)`,
        ].join("\n"),
        steps: [
          `[단계 1] 삼각면 \\(oce\\)는 \\(x=0\\) 평면 위의 직각삼각형(다리 \\(oc,oe\\), 넓이 \\(\\tfrac{1}{2}\\))이고 바깥쪽 법선은 \\(-\\mathbf{a}_x\\)이므로 면 벡터 \\( \\mathbf{S}_{oce} = \\tfrac{1}{2}(-\\mathbf{a}_x) = -\\tfrac{1}{2}\\mathbf{a}_x \\). \\( \\Phi_{oce} = \\mathbf{B}\\cdot\\mathbf{S}_{oce} = (${p})\\!\\left(-\\tfrac{1}{2}\\right) = ${fluxNum(phiOce)}\\,\\mathrm{Wb} \\).`,
          `[단계 2] 사각면 \\(oabc\\)는 \\(z=0\\) 평면 위의 단위 정사각형(넓이 1)이고 바깥쪽 법선은 \\(-\\mathbf{a}_z\\)이므로 \\( \\mathbf{S}_{oabc} = -\\mathbf{a}_z \\). \\( \\Phi_{oabc} = \\mathbf{B}\\cdot\\mathbf{S}_{oabc} = (${r})(-1) = ${fluxNum(phiOabc)}\\,\\mathrm{Wb} \\).`,
          `[단계 3] 자기장은 \\( \\nabla\\cdot\\mathbf{B}=0 \\)이므로 닫힌 곡면(5개 면)을 지나는 순 자속은 0이다. 두 삼각면 \\(oce(x=0)\\)·\\(abd(x=1)\\)의 자속은 \\( -\\tfrac{p}{2}+\\tfrac{p}{2}=0 \\)로 상쇄된다. 앞면 \\(oade(y=0)\\)는 \\( \\Phi_{oade}=\\mathbf{B}\\cdot(-\\mathbf{a}_y)=${fluxNum(phiOade)}\\,\\mathrm{Wb} \\). 따라서 \\( \\Phi_{bced} = -(\\Phi_{oabc}+\\Phi_{oade}) = -\\big((${fluxNum(phiOabc)})+(${fluxNum(phiOade)})\\big) = ${fluxNum(phiBced)}\\,\\mathrm{Wb} \\).`,
        ],
        diagram,
      };
    }

    // 변형(구하는 양 변경): [1] 삼각면 abd, [2] 사각면 oade(앞면), [3] 경사면 bced(가우스).
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `그림과 같이 자유 공간상의 직각 좌표계에 정자계의 자속 밀도 \\( \\mathbf{B} = ${bStr}\\ [\\mathrm{Wb/m^2}] \\)가 있다. 도형은 밑면이 정사각형 \\(oabc\\)이고 경사면 \\(bced\\)를 갖는 삼각기둥으로, 꼭짓점은 \\( o(0,0,0),\\ a(1,0,0),\\ b(1,1,0),\\ c(0,1,0),\\ d(1,0,1),\\ e(0,0,1) \\)이다. (단, \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)는 각각 \\(x,y,z\\)축 방향의 단위 벡터, 좌표계의 단위는 \\([\\mathrm{m}]\\)이며, 각 면의 면 벡터는 도형의 바깥쪽을 향하는 것으로 한다.)`,
      givens: [
        `자속 밀도 \\( \\mathbf{B} = ${bStr}\\ [\\mathrm{Wb/m^2}] \\)`,
        `삼각기둥 꼭짓점 \\( o(0,0,0),a(1,0,0),b(1,1,0),c(0,1,0),d(1,0,1),e(0,0,1) \\)`,
      ],
      question: [
        `[단계 1] 삼각면 \\(abd\\)의 면 벡터와 이 면을 통과하는 자속 \\([\\mathrm{Wb}]\\)을 각각 구하시오.`,
        `[단계 2] 사각면 \\(oade\\)를 통과하는 자속 \\([\\mathrm{Wb}]\\)을 구하시오.`,
        `[단계 3] 가우스 법칙을 이용하여 경사면 \\(bced\\)를 통과하는 자속 \\([\\mathrm{Wb}]\\)을 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( \\mathbf{S}_{abd} = \\tfrac{1}{2}\\mathbf{a}_x\\ [\\mathrm{m^2}] \\), \\( \\Phi_{abd} = ${fluxNum(phiAbd)}\\,\\mathrm{Wb} \\)`,
        `[단계 2] \\( \\Phi_{oade} = ${fluxNum(phiOade)}\\,\\mathrm{Wb} \\)`,
        `[단계 3] \\( \\Phi_{bced} = ${fluxNum(phiBced)}\\,\\mathrm{Wb} \\)`,
      ].join("\n"),
      steps: [
        `[단계 1] 삼각면 \\(abd\\)는 \\(x=1\\) 평면 위의 직각삼각형(넓이 \\(\\tfrac{1}{2}\\))이고 바깥쪽 법선은 \\(+\\mathbf{a}_x\\)이므로 \\( \\mathbf{S}_{abd} = \\tfrac{1}{2}\\mathbf{a}_x \\). \\( \\Phi_{abd} = \\mathbf{B}\\cdot\\mathbf{S}_{abd} = (${p})\\!\\left(\\tfrac{1}{2}\\right) = ${fluxNum(phiAbd)}\\,\\mathrm{Wb} \\).`,
        `[단계 2] 사각면 \\(oade\\)는 \\(y=0\\) 평면 위의 단위 정사각형이고 바깥쪽 법선은 \\(-\\mathbf{a}_y\\)이므로 \\( \\mathbf{S}_{oade} = -\\mathbf{a}_y \\). \\( \\Phi_{oade} = \\mathbf{B}\\cdot\\mathbf{S}_{oade} = (${q})(-1) = ${fluxNum(phiOade)}\\,\\mathrm{Wb} \\).`,
        `[단계 3] \\( \\nabla\\cdot\\mathbf{B}=0 \\)이므로 닫힌 곡면 순 자속은 0. 두 삼각면 \\(oce,abd\\) 자속은 상쇄(\\(-\\tfrac{p}{2}+\\tfrac{p}{2}=0\\))된다. 밑면 \\(oabc(z=0)\\)는 \\( \\Phi_{oabc}=\\mathbf{B}\\cdot(-\\mathbf{a}_z)=${fluxNum(phiOabc)}\\,\\mathrm{Wb} \\). 따라서 \\( \\Phi_{bced} = -(\\Phi_{oabc}+\\Phi_{oade}) = -\\big((${fluxNum(phiOabc)})+(${fluxNum(phiOade)})\\big) = ${fluxNum(phiBced)}\\,\\mathrm{Wb} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 20. 무한 면전류 + 무한 선전류 합성 자계 → h·k 도출 (정자계 중첩, 임용 9번 형식)
//     원본: 면전류 K a_x [A/m](평면 z=z_s, xy와 평행) + 선전류 I a_x [A]((0,y_L,0) 통과,
//     x축 나란) → 점 P(p_x,p_y,h)에서 H₁+H₂ = k a_z [A/m]가 되기 위한 h·k.
//     ★ 특정 예시(10·20π·h=1) 하드코딩 아님: (K₀,d,s,z_s,y_L,p_x) 규칙 열거 + 닫힌형.
//        H₁ = ½K₀ a_y (P가 평면 아래 → 법선 −a_z), H₂ = [G/(n+h²)](−h a_y + Δ a_z),
//        G = I₀/2π, n = d², Δ = p_y−y_L = s·d. a_y 성분=0 → (h−d)²=0 이중근 → h=d, k=s·K₀/2.
//        exam_similar=선전류 I given·h 도출 / exam_variant=h given·선전류 I 도출("구하는 양" 교환).
// =====================================================================
type SheetLineCombo = { K0: number; d: number; s: 1 | -1; zS: number; yL: number; pX: number };

/** (K₀,d,s,z_s,y_L,p_x) 규칙 열거 — h=d<z_s, p_y≥0, 원본 튜플 제외. */
function buildSheetLineSpace(): SheetLineCombo[] {
  const K0s = [8, 10, 12, 20]; // A/m (짝수 → k=±K₀/2 정수)
  const ds = [1, 2];
  const signs: Array<1 | -1> = [1, -1];
  const zSs = [4, 5, 6];
  const yLs = [2, 3, 4];
  const pXs = [-3, -2, 2, 3];
  const out: SheetLineCombo[] = [];
  for (const K0 of K0s) for (const d of ds) for (const s of signs)
    for (const zS of zSs) for (const yL of yLs) for (const pX of pXs) {
      if (zS <= d) continue; // 0 < h(=d) < z_s
      if (yL + s * d < 0) continue; // p_y ≥ 0 (그림 가독)
      if (K0 === 10 && d === 1 && s === -1 && zS === 6 && yL === 3 && pX === -3) continue; // 원본 제외
      out.push({ K0, d, s, zS, yL, pX });
    }
  return out;
}
const SHEET_LINE_SPACE = buildSheetLineSpace();

/** ±계수·단위벡터 항 LaTeX (c·a_axis, c=±1은 계수 생략, 부호 접두). */
function signedVec(c: number, axis: string, lead = false): string {
  const sign = c < 0 ? "-" : "+";
  const a = Math.abs(c);
  const body = a === 1 ? `\\mathbf{a}_${axis}` : `${a}\\mathbf{a}_${axis}`;
  if (lead) return (c < 0 ? "-" : "") + body;
  return ` ${sign} ${body}`;
}

const sheetLineSuperposition: EmEntry = {
  id: "sheet_line_superposition",
  topicKey: "magnetostatics",
  title: "면전류와 선전류에 의한 합성 자계",
  keywords: [
    "면전류", "선전류", "합성 자계", "합성자계", "면전류에 의한", "선전류에 의한",
  ],
  // ★ "면전류 + 선전류의 합성 자계"가 결정적 시그니처 — 단순 직선 도선 자기장(B=μ₀I/2πr)과 확실히 구분.
  //   ※ 공백 변형("선 전류")은 "도선 전류"의 부분문자열로 오발화하므로 금지 — 붙여쓴 형태만.
  strongKeywords: [
    "면전류", "선전류", "합성 자계", "합성자계",
    "면전류에 의한", "선전류에 의한", "surface current",
  ],
  geometry: "sheet_line_superposition",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const { K0, d, s, zS, yL, pX } = pick(SHEET_LINE_SPACE, rand);
    const pY = yL + s * d; // p_y − y_L = s·d
    const delta = s * d; // Δ = p_y − y_L
    const n = d * d;
    const G = K0 * d; // I₀ / 2π
    const I0coeff = 2 * K0 * d; // I₀ = (2K₀d)·π
    const hAns = d;
    const kAns = (s * K0) / 2;

    const halfK = K0 % 2 === 0 ? String(K0 / 2) : `\\tfrac{${K0}}{2}`;
    const deltaTerm = signedVec(delta, "z");
    const h2Body = `-h\\,\\mathbf{a}_y${deltaTerm}`;
    const denomSym = `${n} + h^2`;
    const H2sym = `\\mathbf{H}_2 = \\dfrac{${G}}{${denomSym}}\\left(${h2Body}\\right)`;

    const sheetLabel = `K = ${K0}\\mathbf{a}_x\\,[\\mathrm{A/m}]`;
    const lineLabel = variant ? `I\\,\\mathbf{a}_x\\,[\\mathrm{A}]` : `${I0coeff}\\pi\\,\\mathbf{a}_x\\,[\\mathrm{A}]`;
    const diagram: EmFieldDiagram = {
      geometry: "sheet_line_superposition",
      title: "무한 면전류와 무한 선전류에 의한 합성 자계",
      labels: {
        sheet: sheetLabel,
        sheetZ: `z = ${zS}`,
        line: lineLabel,
        linePoint: `(0, ${yL}, 0)`,
        pointP: `P(${pX}, ${pY}, h)`,
        target: "H_1 + H_2 = k a_z",
      },
    };

    // 공통 [단계 1]·[단계 2] (H₁·H₂) — 면전류/선전류 자계.
    const step1 = `[단계 1] 무한 면전류의 자계 크기는 \\( |\\mathbf{H}_1| = \\tfrac{1}{2}K = ${halfK}\\,\\mathrm{A/m} \\)이고, 점 P는 평면(\\( z = ${zS} \\)) 아래에 있어 법선 \\( \\mathbf{a}_n = -\\mathbf{a}_z \\). \\( \\mathbf{H}_1 = \\tfrac{1}{2}\\mathbf{K}\\times\\mathbf{a}_n = \\tfrac{1}{2}(${K0}\\mathbf{a}_x)\\times(-\\mathbf{a}_z) = ${halfK}\\,\\mathbf{a}_y\\,[\\mathrm{A/m}] \\).`;
    const step2 = `[단계 2] 선전류에서 점 P까지의 수직 벡터는 \\( (p_y-${yL})\\mathbf{a}_y + h\\,\\mathbf{a}_z = ${signedVec(delta, "y", true)} + h\\,\\mathbf{a}_z \\), 거리 \\( r = \\sqrt{${n}+h^2} \\). \\( \\mathbf{H}_2 = \\dfrac{I}{2\\pi r}\\,\\mathbf{a}_\\phi \\), \\( \\mathbf{a}_\\phi = \\mathbf{a}_x\\times\\mathbf{a}_r \\). \\( \\dfrac{I}{2\\pi} = ${G} \\)이므로 \\( ${H2sym} \\).`;

    if (!variant) {
      // 유사(원본 구조): 선전류 I=2πG given → h·k 도출.
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: `그림과 같이 \\( ${K0}\\mathbf{a}_x\\,[\\mathrm{A/m}] \\)의 면전류가 \\( (0,0,${zS}) \\)을 지나고 \\(xy\\)평면과 평행한 무한 평면에 균일하게 흐르고 있고, \\( ${I0coeff}\\pi\\,\\mathbf{a}_x\\,[\\mathrm{A}] \\)의 선전류가 \\( (0,${yL},0) \\)을 지나고 \\(x\\)축과 나란한 무한 도선에 균일하게 흐르고 있다. 점 \\( P(${pX},${pY},h) \\)에서 무한 면전류에 의한 자계 \\( \\mathbf{H}_1 \\)과 무한 선전류에 의한 자계 \\( \\mathbf{H}_2 \\)의 합성 자계 \\( \\mathbf{H}_1+\\mathbf{H}_2 = k\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)로 되기 위한 \\( h\\,[\\mathrm{m}] \\)값과 이때의 \\( k \\)값을 〈해석 절차〉에 따라 순서대로 구하시오. (단, \\( 0 < h < ${zS}\\,[\\mathrm{m}] \\)이고, \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)는 각 축의 단위 벡터이다.)`,
        givens: [
          `면전류 \\( \\mathbf{K} = ${K0}\\mathbf{a}_x\\,[\\mathrm{A/m}] \\) (평면 \\( z = ${zS} \\), \\(xy\\)면과 평행)`,
          `선전류 \\( \\mathbf{I} = ${I0coeff}\\pi\\,\\mathbf{a}_x\\,[\\mathrm{A}] \\) (점 \\( (0,${yL},0) \\), \\(x\\)축과 나란)`,
          `측정점 \\( P(${pX},${pY},h) \\), \\( 0 < h < ${zS} \\)`,
        ],
        question: [
          `[단계 1] 점 P에서 무한 면전류에 의한 자계 \\( \\mathbf{H}_1\\,[\\mathrm{A/m}] \\)을 구하시오.`,
          `[단계 2] 점 P에서 무한 선전류에 의한 자계 \\( \\mathbf{H}_2\\,[\\mathrm{A/m}] \\)를 \\( h \\)가 포함된 식으로 구하시오.`,
          `[단계 3] \\( \\mathbf{H}_1+\\mathbf{H}_2 = k\\,\\mathbf{a}_z \\)가 되기 위한 \\( h\\,[\\mathrm{m}] \\)값과 \\( k \\)값을 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( \\mathbf{H}_1 = ${halfK}\\,\\mathbf{a}_y\\,[\\mathrm{A/m}] \\)`,
          `[단계 2] \\( ${H2sym}\\,[\\mathrm{A/m}] \\)`,
          `[단계 3] \\( h = ${hAns}\\,\\mathrm{m} \\), \\( k = ${kAns}\\,\\mathrm{A/m} \\)`,
        ].join("\n"),
        steps: [
          step1,
          step2,
          `[단계 3] 합성 자계가 \\( \\mathbf{a}_z \\) 성분만 가지려면 \\( \\mathbf{a}_y \\) 성분이 0이어야 한다: \\( ${halfK} - \\dfrac{${G}h}{${denomSym}} = 0 \\Rightarrow ${n}+h^2 = ${2 * d}h \\Rightarrow (h-${d})^2 = 0 \\Rightarrow h = ${hAns}\\,\\mathrm{m} \\). 이때 \\( k = \\dfrac{${G}\\cdot(${delta})}{${n}+${hAns}^2} = \\dfrac{${G * delta}}{${n + hAns * hAns}} = ${kAns}\\,\\mathrm{A/m} \\).`,
        ],
        diagram,
      };
    }

    // 변형(구하는 양 변경): h=d given → 선전류 세기 I·k 도출.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `그림과 같이 \\( ${K0}\\mathbf{a}_x\\,[\\mathrm{A/m}] \\)의 면전류가 \\( (0,0,${zS}) \\)을 지나고 \\(xy\\)평면과 평행한 무한 평면에 균일하게 흐르고 있고, 세기가 미지인 선전류 \\( I\\,\\mathbf{a}_x\\,[\\mathrm{A}] \\)가 \\( (0,${yL},0) \\)을 지나고 \\(x\\)축과 나란한 무한 도선에 균일하게 흐르고 있다. 점 \\( P(${pX},${pY},${hAns}) \\)에서 면전류에 의한 자계 \\( \\mathbf{H}_1 \\)과 선전류에 의한 자계 \\( \\mathbf{H}_2 \\)의 합성 자계가 \\( \\mathbf{H}_1+\\mathbf{H}_2 = k\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)로 될 때, 선전류의 세기 \\( I\\,[\\mathrm{A}] \\)와 이때의 \\( k \\)값을 〈해석 절차〉에 따라 구하시오.`,
      givens: [
        `면전류 \\( \\mathbf{K} = ${K0}\\mathbf{a}_x\\,[\\mathrm{A/m}] \\) (평면 \\( z = ${zS} \\), \\(xy\\)면과 평행)`,
        `선전류 \\( I\\,\\mathbf{a}_x\\,[\\mathrm{A}] \\) (점 \\( (0,${yL},0) \\), \\(x\\)축과 나란, \\( I \\) 미지)`,
        `측정점 \\( P(${pX},${pY},${hAns}) \\)`,
      ],
      question: [
        `[단계 1] 점 P에서 무한 면전류에 의한 자계 \\( \\mathbf{H}_1\\,[\\mathrm{A/m}] \\)을 구하시오.`,
        `[단계 2] 점 P에서 무한 선전류에 의한 자계 \\( \\mathbf{H}_2\\,[\\mathrm{A/m}] \\)를 \\( I \\)가 포함된 식으로 구하시오.`,
        `[단계 3] \\( \\mathbf{H}_1+\\mathbf{H}_2 = k\\,\\mathbf{a}_z \\)가 되기 위한 선전류의 세기 \\( I\\,[\\mathrm{A}] \\)와 \\( k \\)값을 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( \\mathbf{H}_1 = ${halfK}\\,\\mathbf{a}_y\\,[\\mathrm{A/m}] \\)`,
        `[단계 2] \\( \\mathbf{H}_2 = \\dfrac{I}{2\\pi(${n + hAns * hAns})}\\left(${(-hAns === -1 ? "-\\mathbf{a}_y" : `-${hAns}\\mathbf{a}_y`)}${deltaTerm}\\right)\\,[\\mathrm{A/m}] \\)`,
        `[단계 3] \\( I = ${I0coeff}\\pi\\,\\mathrm{A} \\), \\( k = ${kAns}\\,\\mathrm{A/m} \\)`,
      ].join("\n"),
      steps: [
        step1,
        `[단계 2] 선전류에서 점 P까지 수직 거리 \\( r = \\sqrt{${n}+${hAns}^2} = \\sqrt{${n + hAns * hAns}} \\). \\( \\mathbf{H}_2 = \\dfrac{I}{2\\pi r}\\mathbf{a}_\\phi = \\dfrac{I}{2\\pi(${n + hAns * hAns})}\\left(-${hAns}\\mathbf{a}_y${deltaTerm}\\right)\\,[\\mathrm{A/m}] \\).`,
        `[단계 3] \\( \\mathbf{a}_y \\) 성분이 0이어야 하므로 \\( ${halfK} = \\dfrac{I\\cdot ${hAns}}{2\\pi(${n + hAns * hAns})} \\Rightarrow I = \\dfrac{${halfK}\\cdot 2\\pi(${n + hAns * hAns})}{${hAns}} = ${I0coeff}\\pi\\,\\mathrm{A} \\). 이때 \\( k = \\dfrac{I\\cdot(${delta})}{2\\pi(${n + hAns * hAns})} = ${kAns}\\,\\mathrm{A/m} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 21. z축 위 두 원형 전류 루프의 축상 자계 합성 → 전류 I 도출 (정자계 중첩, 임용 9번 형식)
//     원본: C₁(중심 P(0,0,z_p)·반지름 R₁·반시계 I₁) + C₂(중심 O·반지름 R₂·시계 I) →
//     점 P(=C₁ 중심, C₂ 축상 z_p)에서 H₁+H₂ = H_t·a_z 되는 전류 I.
//     ★ sheet_line_superposition(면전류+선전류)과 물리·기하 완전히 다름 → 전용 레지스트리 항목.
//     ★ 원형 루프 자계: 중심 |H|=I/(2R), 축상(거리 z) |H|=I·R²/(2(R²+z²)^{3/2}).
//        C₁(반시계)=+a_z, C₂(시계)=−a_z. H₃=I₁/(2R₁) − I·R₂²/(2·hyp³) = H_t (hyp=√(R₂²+z_p²)).
//        규칙 열거(피타고라스 hyp 정수 → 축상 항 깔끔) + 닫힌형, 원본 튜플 제외.
//        exam_similar=C₂ 전류 I 도출 / exam_variant=C₁ 전류 I₁ 도출("구하는 양" 교환).
// =====================================================================
type LoopAxisSet = { R1: number; I1: number; zp: number; R2: number; hyp: number; Ht: number };
function buildLoopAxisSpace(): LoopAxisSet[] {
  const triples: Array<[number, number, number]> = [
    [3, 4, 5], [4, 3, 5], [6, 8, 10], [8, 6, 10], [5, 12, 13], [12, 5, 13], [9, 12, 15], [16, 12, 20],
  ]; // (R2, z_p, hyp), hyp²=R2²+z_p²
  const R1s = [2, 4, 5, 6, 10];
  const H1s = [5, 6, 8, 10, 12, 15, 20]; // H₁ = I₁/(2R₁)
  const Hts = [1, 2, 3, 4, 5];
  const out: LoopAxisSet[] = [];
  for (const [R2, zp, hyp] of triples) for (const R1 of R1s) for (const H1 of H1s) {
    const I1 = 2 * R1 * H1;
    if (I1 < 10 || I1 > 600) continue;
    for (const Ht of Hts) {
      if (Ht >= H1) continue; // H₃ = H₁ − (C₂ 기여) = H_t > 0 → I > 0
      const I = ((H1 - Ht) * 2 * hyp ** 3) / (R2 * R2);
      if (!Number.isInteger(I) || I < 20 || I > 2000) continue;
      if (R1 === 5 && I1 === 100 && zp === 4 && R2 === 3 && Ht === 1) continue; // 원본 제외
      out.push({ R1, I1, zp, R2, hyp, Ht });
    }
  }
  return out;
}
const LOOP_AXIS_SPACE = buildLoopAxisSpace();

const circularLoopAxisField: EmEntry = {
  id: "circular_loop_axis_field",
  topicKey: "magnetostatics",
  title: "두 원형 전류 루프의 축상 자계 합성",
  keywords: [
    "원형 루프", "원형 도선", "원형 코일", "원형 전류", "루프", "축상 자계",
    "합성 자계", "합성자계", "비오사바르", "반지름", "circular loop",
  ],
  // ★ "원형 루프(도선)에 흐르는 전류의 (축상/중심) 자계 + 합성"이 결정적 시그니처.
  //   면전류·선전류가 없고 "원형 루프/도선"이 2개 → sheet_line_superposition과 명확히 구분.
  strongKeywords: [
    "원형 루프", "원형 도선", "원형 코일", "원형 전류", "원형 도선 루프",
    "루프 c_1", "루프 c_2", "원형 전류 루프",
  ],
  geometry: "circular_loops_axis",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const { R1, I1, zp, R2, hyp, Ht } = pick(LOOP_AXIS_SPACE, rand);
    const H1 = I1 / (2 * R1);            // C₁ 중심 자계
    const hyp3 = hyp ** 3;               // (R₂²+z_p²)^{3/2}
    const axialDenom = 2 * hyp3;         // 2·hyp³
    const I2 = ((H1 - Ht) * axialDenom) / (R2 * R2); // C₂ 전류(유사에서 미지)
    const H2mag = H1 - Ht;               // C₂(I₂) 기여 크기 = H₁ − H_t (정확값, FP 회피)

    const diagram: EmFieldDiagram = {
      geometry: "circular_loops_axis",
      title: "두 원형 전류 루프의 축상 자계 합성",
      labels: {
        loop1: `C_1`, loop2: `C_2`,
        r1: `${R1}\\,\\mathrm{m}`, r2: `${R2}\\,\\mathrm{m}`,
        i1: variant ? `I\\,[\\mathrm{A}]` : `${I1}\\,[\\mathrm{A}]`,
        i2: variant ? `${I2}\\,[\\mathrm{A}]` : `I\\,[\\mathrm{A}]`,
        pointP: `P(0, 0, ${zp})`,
        target: `H_3 = ${Ht} a_z [A/m]`,
      },
    };

    // 공통 [단계 1]·[단계 2] 물리식.
    const step1 = `[단계 1] 점 P는 \\(C_1\\)의 중심이므로 원형 루프 중심의 자계 공식 \\( |\\mathbf{H}_1| = \\dfrac{I_1}{2R_1} \\)을 쓴다. \\(C_1\\)의 전류가 반시계 방향이므로 \\( \\mathbf{H}_1 \\)은 \\(+\\mathbf{a}_z\\) 방향. \\( \\mathbf{H}_1 = \\dfrac{${variant ? "I" : I1}}{2\\cdot ${R1}}\\mathbf{a}_z${variant ? "" : ` = ${H1}\\,\\mathbf{a}_z`}\\,[\\mathrm{A/m}] \\).`;
    const step2 = `[단계 2] 점 P는 \\(C_2\\)의 축 위(중심에서 거리 \\( z=${zp} \\))에 있으므로 축상 자계 공식 \\( |\\mathbf{H}_2| = \\dfrac{I\\,R_2^2}{2(R_2^2+z^2)^{3/2}} \\)을 쓴다. \\( R_2^2+z^2 = ${R2}^2+${zp}^2 = ${hyp}^2 \\Rightarrow (R_2^2+z^2)^{3/2} = ${hyp3} \\). \\(C_2\\)의 전류가 시계 방향이므로 \\( \\mathbf{H}_2 \\)는 \\(-\\mathbf{a}_z\\) 방향. \\( \\mathbf{H}_2 = -\\dfrac{${variant ? I2 : "I"}\\cdot ${R2}^2}{${axialDenom}}\\mathbf{a}_z\\,[\\mathrm{A/m}] \\).`;

    const content = `그림과 같이 원통 좌표계에서 점 \\( P(0,0,${zp})\\,[\\mathrm{m}] \\)를 중심으로 \\(xy\\)평면에 나란한 반지름이 \\( ${R1}\\,[\\mathrm{m}] \\)인 원형 루프 \\(C_1\\)에 반시계 방향으로 \\( ${variant ? "I" : I1}\\,[\\mathrm{A}] \\)의 전류가 흐르고, 원점 \\(O\\)를 중심으로 \\(xy\\)평면 위에 놓인 반지름이 \\( ${R2}\\,[\\mathrm{m}] \\)인 원형 루프 \\(C_2\\)에 시계 방향으로 \\( ${variant ? I2 : "I"}\\,[\\mathrm{A}] \\)의 전류가 흐르고 있다. \\(P\\)에서 \\(C_1\\)에 흐르는 전류에 의한 자계 \\( \\mathbf{H}_1\\,[\\mathrm{A/m}] \\)와 \\(C_2\\)에 흐르는 전류에 의한 자계 \\( \\mathbf{H}_2\\,[\\mathrm{A/m}] \\)의 합성 자계 \\( \\mathbf{H}_3 = ${Ht}\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)가 되는 ${variant ? `\\(C_1\\)의 전류 \\( I\\,[\\mathrm{A}] \\)` : `전류 \\( I\\,[\\mathrm{A}] \\)`}의 값을 제시된 〈해석 절차〉에 따라 구하시오. (단, 원통 좌표계 \\( \\rho, \\phi, z \\)축의 단위 벡터는 \\( \\mathbf{a}_\\rho, \\mathbf{a}_\\phi, \\mathbf{a}_z \\)이다.)`;
    const givens = [
      `\\(C_1\\): 중심 \\( P(0,0,${zp}) \\), 반지름 \\( ${R1}\\,[\\mathrm{m}] \\), 반시계 방향 \\( ${variant ? "I" : I1}\\,[\\mathrm{A}] \\)`,
      `\\(C_2\\): 중심 \\( O \\), 반지름 \\( ${R2}\\,[\\mathrm{m}] \\) (\\(xy\\)평면), 시계 방향 \\( ${variant ? I2 : "I"}\\,[\\mathrm{A}] \\)`,
      `합성 자계 목표 \\( \\mathbf{H}_3 = ${Ht}\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)`,
    ];

    if (!variant) {
      // 유사(원본 구조): C₂ 전류 I 미지 → H₃ = H₁ − I·R₂²/(2hyp³) = H_t 로 I 도출.
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content, givens,
        question: [
          `[단계 1] \\(P\\)에서 \\(C_1\\)에 흐르는 전류에 의한 자계 \\( \\mathbf{H}_1\\,[\\mathrm{A/m}] \\)를 구하시오.`,
          `[단계 2] \\(P\\)에서 \\(C_2\\)에 흐르는 전류에 의한 자계 \\( \\mathbf{H}_2\\,[\\mathrm{A/m}] \\)를 구하시오.`,
          `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여, \\(P\\)에서 \\( \\mathbf{H}_1 \\)과 \\( \\mathbf{H}_2 \\)의 합성 자계 \\( \\mathbf{H}_3 = ${Ht}\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)가 되는 전류 \\( I\\,[\\mathrm{A}] \\)의 값을 풀이 과정과 함께 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( \\mathbf{H}_1 = ${H1}\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)`,
          `[단계 2] \\( \\mathbf{H}_2 = -\\dfrac{${R2 * R2}}{${axialDenom}}I\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)`,
          `[단계 3] \\( I = ${I2}\\,[\\mathrm{A}] \\)`,
        ].join("\n"),
        steps: [
          step1, step2,
          `[단계 3] \\( \\mathbf{H}_3 = \\mathbf{H}_1 + \\mathbf{H}_2 = \\left(${H1} - \\dfrac{${R2 * R2}}{${axialDenom}}I\\right)\\mathbf{a}_z = ${Ht}\\,\\mathbf{a}_z \\)이므로 \\( ${H1} - \\dfrac{${R2 * R2}}{${axialDenom}}I = ${Ht} \\Rightarrow I = \\dfrac{(${H1}-${Ht})\\cdot ${axialDenom}}{${R2 * R2}} = ${I2}\\,[\\mathrm{A}] \\).`,
        ],
        diagram,
      };
    }

    // 변형(구하는 양 교환): C₂ 전류 I₂ given, C₁ 전류 I₁ 미지 → H₃ = I₁/(2R₁) − I₂·R₂²/(2hyp³) = H_t.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content, givens,
      question: [
        `[단계 1] \\(P\\)에서 \\(C_2\\)에 흐르는 전류에 의한 자계 \\( \\mathbf{H}_2\\,[\\mathrm{A/m}] \\)를 구하시오.`,
        `[단계 2] \\(P\\)에서 \\(C_1\\)에 흐르는 전류에 의한 자계 \\( \\mathbf{H}_1\\,[\\mathrm{A/m}] \\)를 \\(C_1\\)의 전류 \\( I \\)로 나타내시오.`,
        `[단계 3] 합성 자계 \\( \\mathbf{H}_3 = ${Ht}\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)가 되는 \\(C_1\\)의 전류 \\( I\\,[\\mathrm{A}] \\)의 값을 풀이 과정과 함께 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( \\mathbf{H}_2 = -${H2mag}\\,\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)`,
        `[단계 2] \\( \\mathbf{H}_1 = \\dfrac{I}{2\\cdot ${R1}}\\mathbf{a}_z\\,[\\mathrm{A/m}] \\)`,
        `[단계 3] \\( I = ${I1}\\,[\\mathrm{A}] \\)`,
      ].join("\n"),
      steps: [
        step2, step1,
        `[단계 3] \\( \\mathbf{H}_3 = \\mathbf{H}_1 + \\mathbf{H}_2 = \\left(\\dfrac{I}{2\\cdot ${R1}} - ${H2mag}\\right)\\mathbf{a}_z = ${Ht}\\,\\mathbf{a}_z \\)이므로 \\( \\dfrac{I}{${2 * R1}} = ${Ht} + ${H2mag} = ${H1} \\Rightarrow I = ${2 * R1}\\times ${H1} = ${I1}\\,[\\mathrm{A}] \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 22. 무한 면전하 + 무한 선전하의 합성 전계 → E=0 조건으로 ρ_l 도출 (정전계 중첩, 임용 11번 형식)
//     원본: 면전하 ρ_s(z=0 평면) + 선전하 ρ_l(선 (0,0,z_L), y축과 나란). 점 P(0,0,z_P, 선 아래)에서
//     합성 전계 E_P=0 되는 ρ_l, 점 Q(0,0,z_Q, 선 위)에서 합성 전계 E_Q.
//     ★ 단일 무한 선전하(line_charge_field)와 다름 — 면전하+선전하 중첩·E=0 조건 → 전용 레지스트리 항목.
//     ★ 면전하 전계 E=ρ_s/(2ε₀), 선전하 전계 E=ρ_l/(2πε₀ d). 답은 ε₀·π를 그대로 둠(기호식·계수만 수치).
//        P는 선 아래(−a_z), Q는 선 위(+a_z). E_P=0 → ρ_l=π·ρ_s·d_P. E_Q=ρ_s/(2ε₀)(1+d_P/d_Q)a_z.
//        규칙 열거(ρ_s 짝수·좌표 소정수·E_Q 계수 깔끔) + 닫힌형, 원본 튜플 제외.
//        exam_similar=ρ_l 도출 / exam_variant=E=0 되는 위치 z_P 도출("구하는 양" 교환).
// =====================================================================
type SheetLineESet = { rhoS: number; zP: number; zL: number; zQ: number };
function buildSheetLineESpace(): SheetLineESet[] {
  const rhoSs = [2, 4, 6, 8];
  const zLs = [2, 3, 4];
  const zPs = [1, 2, 3];
  const zQs = [3, 4, 5, 6];
  const out: SheetLineESet[] = [];
  for (const rhoS of rhoSs) for (const zL of zLs) for (const zP of zPs) for (const zQ of zQs) {
    if (!(zP < zL && zL < zQ)) continue; // P는 선 아래(면 위), Q는 선 위
    const dP = zL - zP, dQ = zQ - zL;
    const eqNum = rhoS * (dP + dQ), eqDen = 2 * dQ;
    if (Math.abs((eqNum / eqDen) * 2 - Math.round((eqNum / eqDen) * 2)) > 1e-9) continue; // E_Q 계수 0.5배수
    if (rhoS === 4 && zP === 1 && zL === 2 && zQ === 3) continue; // 원본 제외
    out.push({ rhoS, zP, zL, zQ });
  }
  return out;
}
const SHEET_LINE_E_SPACE = buildSheetLineESpace();

const sheetLineEfieldSuperposition: EmEntry = {
  id: "sheet_line_efield_superposition",
  topicKey: "gauss_law",
  title: "무한 면전하와 무한 선전하의 합성 전계",
  // ★ bare "면전하"·"선전하"는 일반 keywords에서도 제외 (2026-07-29) — 단일 선전하 원본
  //   ("무한 선전하에 의한 전계" + 가우스)이 이 항목에 점수로 밀리는 것을 실측했다.
  //   두 전하가 **함께** 등장하는 복합어·합성 표현만 남긴다([[feedback_generic_code]] 잠식 금지).
  keywords: [
    "면전하 밀도", "선전하 밀도", "합성 전계", "합성전계",
    "무한 면전하", "무한 선전하", "중첩",
  ],
  // ★ 결정적 시그니처는 ★합성 전계★뿐 — 단일 면전하(charged_sheet)·단일 선전하(line_charge)에는
  //   없고, 면전하+선전하 중첩 유형에만 나타난다(자계 버전이 "합성 자계"를 쓰는 것과 동일 논리).
  //   ※ "면전하"/"선전하" bare는 strong 금지 — 각각 charged_sheet·line_charge를 오탈취(회귀 실측).
  //     (자계 sheet_line_superposition은 "면전류"가 고유해 strong 가능하지만, "면전하"는 charged_sheet와 겹침.)
  strongKeywords: ["합성 전계", "합성전계"],
  geometry: "sheet_line_efield",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const { rhoS, zP, zL, zQ } = pick(SHEET_LINE_E_SPACE, rand);
    const dP = zL - zP, dQ = zQ - zL;
    const rhoLcoef = rhoS * dP;          // ρ_l = rhoLcoef·π [C/m]
    const E0 = "\\varepsilon_0";

    const diagram: EmFieldDiagram = {
      geometry: "sheet_line_efield",
      title: "무한 면전하와 무한 선전하의 합성 전계",
      labels: {
        sheet: `\\rho_s = ${rhoS}\\,[\\mathrm{C/m^2}]`,
        line: variant ? `\\rho_l = ${rhoLcoef}\\pi\\,[\\mathrm{C/m}]` : `\\rho_l\\,[\\mathrm{C/m}]`,
        lineZ: `(0, 0, ${zL})`,
        pointP: variant ? "P" : `P(0, 0, ${zP})`,
        pointQ: `Q(0, 0, ${zQ})`,
        target: "E_P = 0",
      },
    };

    // 공통 전계 크기: 면전하 ρ_s/(2ε₀), 선전하 ρ_l/(2πε₀ d).
    const eSheet = reducedFrac(rhoS, "", 2, E0);            // ρ_s/(2ε₀)
    const e1Q = eSheet;                                      // E_1Q = 면전하 전계(동일)
    const e2Q = reducedFrac(rhoS * dP, "", 2 * dQ, E0);      // ρ_l/(2πε₀ d_Q) with ρ_l=πρ_s d_P → ρ_s d_P/(2 d_Q ε₀)
    const eQ = reducedFrac(rhoS * (dP + dQ), "", 2 * dQ, E0); // 합성 E_Q

    if (!variant) {
      // 유사(원본 구조): ρ_l 미지 → E_P=0으로 도출 → Q에서 E_Q.
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content: `그림과 같이 자유 공간 내의 직각 좌표계에서 \\( z=0 \\)인 \\(xy\\)평면에 면전하 밀도 \\( \\rho_s = ${rhoS}\\,[\\mathrm{C/m^2}] \\)인 무한 면전하가 균일하게 분포해 있고, 점 \\( (0,0,${zL}) \\)를 지나고 \\(y\\)축과 평행한 선을 따라 선전하 밀도 \\( \\rho_l\\,[\\mathrm{C/m}] \\)인 무한 선전하가 균일하게 분포하고 있다. 점 \\(P\\)에서 합성 전계 \\( \\mathbf{E}_P=0 \\)이 되는 선전하 밀도 \\( \\rho_l \\)과 점 \\(Q\\)에서의 합성 전계 \\( \\mathbf{E}_Q \\)를 제시된 〈해석 절차〉에 따라 구하시오. (단, 직각 좌표계 \\( x,y,z \\)의 단위 벡터는 \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)이고, 계산식에서 자유 공간의 유전율 \\( \\varepsilon_0 \\)와 \\( \\pi \\)는 그대로 둔다.)`,
        givens: [
          `면전하 밀도 \\( \\rho_s = ${rhoS}\\,[\\mathrm{C/m^2}] \\) (\\(z=0\\) 평면)`,
          `선전하 \\( \\rho_l\\,[\\mathrm{C/m}] \\): 점 \\( (0,0,${zL}) \\) 지나고 \\(y\\)축과 나란`,
          `점 \\( P(0,0,${zP}) \\), 점 \\( Q(0,0,${zQ}) \\)`,
        ],
        question: [
          `[단계 1] 점 \\( P(0,0,${zP}) \\)에서 무한 면전하에 의한 전계 \\( \\mathbf{E}_{1P}\\,[\\mathrm{V/m}] \\)과 무한 선전하에 의한 전계 \\( \\mathbf{E}_{2P}\\,[\\mathrm{V/m}] \\)을 각각 직각 좌표계로 구하시오.`,
          `[단계 2] [단계 1]의 결과를 이용하여, 점 \\(P\\)에서 합성 전계 \\( \\mathbf{E}_P = \\mathbf{E}_{1P}+\\mathbf{E}_{2P}=0\\,[\\mathrm{V/m}] \\)이 되는 선전하 밀도 \\( \\rho_l\\,[\\mathrm{C/m}] \\)을 구하시오.`,
          `[단계 3] [단계 2]의 결과를 이용하여, 점 \\( Q(0,0,${zQ}) \\)에서 무한 면전하에 의한 전계 \\( \\mathbf{E}_{1Q} \\)과 무한 선전하에 의한 전계 \\( \\mathbf{E}_{2Q} \\)의 합성 전계 \\( \\mathbf{E}_Q = \\mathbf{E}_{1Q}+\\mathbf{E}_{2Q}\\,[\\mathrm{V/m}] \\)을 직각 좌표계로 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( \\mathbf{E}_{1P} = ${eSheet}\\,\\mathbf{a}_z \\), \\( \\mathbf{E}_{2P} = -\\dfrac{\\rho_l}{${2 * dP}\\pi${E0}}\\mathbf{a}_z\\,[\\mathrm{V/m}] \\)`,
          `[단계 2] \\( \\rho_l = ${rhoLcoef}\\pi\\,[\\mathrm{C/m}] \\)`,
          `[단계 3] \\( \\mathbf{E}_Q = ${eQ}\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\)`,
        ].join("\n"),
        steps: [
          `[단계 1] 무한 면전하(\\(z=0\\))의 전계 크기는 \\( \\dfrac{\\rho_s}{2${E0}} \\)이고 점 \\(P\\)는 면 위(\\(z>0\\))라 \\(+\\mathbf{a}_z\\): \\( \\mathbf{E}_{1P}=${eSheet}\\,\\mathbf{a}_z \\). 무한 선전하의 전계 크기는 \\( \\dfrac{\\rho_l}{2\\pi${E0} d} \\), 선까지 거리 \\( d=${zL}-${zP}=${dP} \\), 점 \\(P\\)는 선 아래라 \\(-\\mathbf{a}_z\\): \\( \\mathbf{E}_{2P}=-\\dfrac{\\rho_l}{${2 * dP}\\pi${E0}}\\mathbf{a}_z \\).`,
          `[단계 2] \\( \\mathbf{E}_P = ${eSheet}\\,\\mathbf{a}_z-\\dfrac{\\rho_l}{${2 * dP}\\pi${E0}}\\mathbf{a}_z=0 \\) → \\( \\dfrac{\\rho_s}{2${E0}}=\\dfrac{\\rho_l}{${2 * dP}\\pi${E0}} \\Rightarrow \\rho_l=\\pi\\rho_s\\, d_P=\\pi\\cdot${rhoS}\\cdot${dP}=${rhoLcoef}\\pi\\,[\\mathrm{C/m}] \\).`,
          `[단계 3] 점 \\(Q(0,0,${zQ})\\)는 면 위·선 위(\\(z=${zQ}>${zL}\\))라 두 전계 모두 \\(+\\mathbf{a}_z\\). \\( \\mathbf{E}_{1Q}=${e1Q}\\,\\mathbf{a}_z \\), 선까지 거리 \\( d=${zQ}-${zL}=${dQ} \\)이므로 \\( \\mathbf{E}_{2Q}=\\dfrac{${rhoLcoef}\\pi}{${2 * dQ}\\pi${E0}}\\mathbf{a}_z=${e2Q}\\,\\mathbf{a}_z \\). \\( \\mathbf{E}_Q=${e1Q}\\,\\mathbf{a}_z+${e2Q}\\,\\mathbf{a}_z=${eQ}\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\).`,
        ],
        diagram,
      };
    }

    // 변형(구하는 양 교환): ρ_s·ρ_l given → 합성 전계 0 되는 점 P의 위치 z_P 도출 → Q에서 E_Q.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content: `그림과 같이 자유 공간 내의 직각 좌표계에서 \\( z=0 \\)인 \\(xy\\)평면에 면전하 밀도 \\( \\rho_s = ${rhoS}\\,[\\mathrm{C/m^2}] \\)인 무한 면전하가 균일하게 분포해 있고, 점 \\( (0,0,${zL}) \\)를 지나고 \\(y\\)축과 평행한 선을 따라 선전하 밀도 \\( \\rho_l = ${rhoLcoef}\\pi\\,[\\mathrm{C/m}] \\)인 무한 선전하가 균일하게 분포하고 있다. \\(z\\)축 위(\\(0<z<${zL}\\))에서 합성 전계가 0이 되는 점 \\(P\\)의 위치와 점 \\(Q\\)에서의 합성 전계 \\( \\mathbf{E}_Q \\)를 제시된 〈해석 절차〉에 따라 구하시오. (단, 직각 좌표계 단위 벡터는 \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)이고, \\( \\varepsilon_0 \\)와 \\( \\pi \\)는 그대로 둔다.)`,
      givens: [
        `면전하 밀도 \\( \\rho_s = ${rhoS}\\,[\\mathrm{C/m^2}] \\) (\\(z=0\\) 평면)`,
        `선전하 밀도 \\( \\rho_l = ${rhoLcoef}\\pi\\,[\\mathrm{C/m}] \\): 점 \\( (0,0,${zL}) \\) 지나고 \\(y\\)축과 나란`,
        `점 \\( Q(0,0,${zQ}) \\)`,
      ],
      question: [
        `[단계 1] \\(z\\)축 위 임의의 점(선 아래, \\(0<z<${zL}\\))에서 무한 면전하에 의한 전계 \\( \\mathbf{E}_1 \\)과 무한 선전하에 의한 전계 \\( \\mathbf{E}_2 \\)의 방향과 크기를 각각 서술하시오.`,
        `[단계 2] [단계 1]의 결과를 이용하여, 합성 전계 \\( \\mathbf{E}=\\mathbf{E}_1+\\mathbf{E}_2=0 \\)이 되는 점 \\(P\\)의 \\(z\\)좌표 \\( z_P\\,[\\mathrm{m}] \\)를 구하시오.`,
        `[단계 3] 점 \\( Q(0,0,${zQ}) \\)에서의 합성 전계 \\( \\mathbf{E}_Q\\,[\\mathrm{V/m}] \\)를 직각 좌표계로 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( |\\mathbf{E}_1| = \\dfrac{\\rho_s}{2${E0}} \\) (\\(+\\mathbf{a}_z\\)), \\( |\\mathbf{E}_2| = \\dfrac{\\rho_l}{2\\pi${E0} d} \\) (\\(-\\mathbf{a}_z\\), \\(d\\)=선까지 거리)`,
        `[단계 2] \\( z_P = ${zP}\\,[\\mathrm{m}] \\)`,
        `[단계 3] \\( \\mathbf{E}_Q = ${eQ}\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\)`,
      ].join("\n"),
      steps: [
        `[단계 1] 무한 면전하의 전계 크기 \\( \\dfrac{\\rho_s}{2${E0}} \\)(면 위라 \\(+\\mathbf{a}_z\\)), 무한 선전하의 전계 크기 \\( \\dfrac{\\rho_l}{2\\pi${E0} d} \\)(선 아래라 \\(-\\mathbf{a}_z\\)), \\(d=${zL}-z\\).`,
        `[단계 2] \\( \\dfrac{\\rho_s}{2${E0}}=\\dfrac{\\rho_l}{2\\pi${E0} d} \\Rightarrow d=\\dfrac{\\rho_l}{\\pi\\rho_s}=\\dfrac{${rhoLcoef}\\pi}{\\pi\\cdot${rhoS}}=${dP}\\,[\\mathrm{m}] \\). \\( z_P=${zL}-${dP}=${zP}\\,[\\mathrm{m}] \\).`,
        `[단계 3] 점 \\(Q(0,0,${zQ})\\)는 선 위라 두 전계 모두 \\(+\\mathbf{a}_z\\). \\( \\mathbf{E}_{1Q}=${e1Q}\\,\\mathbf{a}_z \\), \\( d=${zQ}-${zL}=${dQ} \\)이므로 \\( \\mathbf{E}_{2Q}=\\dfrac{${rhoLcoef}\\pi}{${2 * dQ}\\pi${E0}}\\mathbf{a}_z=${e2Q}\\,\\mathbf{a}_z \\). \\( \\mathbf{E}_Q=${eQ}\\,\\mathbf{a}_z\\,[\\mathrm{V/m}] \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 23. 동축 원통(도전율 σ 물질)의 두 도체 사이 저항 R (정상 전류, 임용 12번 형식)
//     원본: 내부 도체 반경 a·외부 도체 내경 b·길이 L, 사이에 도전율 σ 물질. 두 도체 사이 저항 R.
//     [1] 전류 I 반경방향 → 전류밀도 J=I/(2πρL)a_ρ(ρ 식) [2] E=J/σ·전압 V₁=∫E dρ [3] R=V₁/I.
//     ★ 동축 케이블 정전용량(coax_capacitance, C=2πεL/ln(b/a))과 다름 — 도전율 σ·저항 R(정상 전류).
//     ★ R=ln(b/a)/(2πσL). π·ln(b/a)는 기호로 둠(계수만 수치). exam_similar=R / exam_variant=소비전력 P.
//        규칙 열거(b/a=정수비 → ln 기호·계수 정수) + 닫힌형, 원본 튜플 제외.
// =====================================================================
type CoaxResSet = { ratio: number; a: number; b: number; L: number; n: number; jCoef: number };
function buildCoaxResSpace(): CoaxResSet[] {
  const ratios = [2, 3, 4, 5, 10];
  const as = [0.1, 0.2, 0.25, 0.5];
  const Ls = [0.5, 1, 2];
  const ns = [1, 2, 3]; // σ = 10^{-n}
  const js = [1, 2];
  const out: CoaxResSet[] = [];
  for (const ratio of ratios) for (const a of as) {
    const b = Math.round(ratio * a * 1000) / 1000;
    if (b > 1.0001) continue;
    for (const L of Ls) for (const n of ns) for (const jCoef of js) {
      if (!Number.isInteger(Math.pow(10, n) / (2 * L))) continue; // R 계수 C_R 정수
      if (!Number.isInteger(2 * L * jCoef)) continue;             // I 계수 정수(·π)
      if (a === 0.1 && Math.abs(b - 0.5) < 1e-9 && L === 1 && n === 2 && jCoef === 1) continue; // 원본 제외
      out.push({ ratio, a, b, L, n, jCoef });
    }
  }
  return out;
}
const COAX_RES_SPACE = buildCoaxResSpace();

/** 정수 n 에 대해 σ=10^{-n} 을 소수 문자열로 ("0.01" 등). */
function pow10Neg(n: number): string {
  return `10^{-${n}}`;
}

const coaxialResistance: EmEntry = {
  id: "coax_resistance",
  topicKey: "current_conduction",
  title: "동축 원통(도전율 물질)의 두 도체 사이 저항",
  keywords: [
    "동축", "동축 원통", "도전율", "전도율", "저항", "전류 밀도", "정상 전류",
    "두 도체 사이", "conductivity", "coax", "누설 저항",
  ],
  // ★ "도전율 σ 물질이 채워진 동축 + 두 도체 사이 저항 R" 이 결정적 시그니처 —
  //   동축 케이블 정전용량(유전율 ε·C)과 확실히 구분(도전율·저항이 핵심).
  strongKeywords: [
    "도전율", "전도율", "두 도체 사이의 저항", "누설 저항", "동축 원통",
  ],
  geometry: "coax_resistor",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const { ratio, a, b, L, n, jCoef } = pick(COAX_RES_SPACE, rand);
    const eCoef = jCoef * Math.pow(10, n);  // E = eCoef/ρ
    const Icoef = 2 * L * jCoef;            // I = Icoef·π
    const CR = Math.pow(10, n) / (2 * L);   // R = (CR/π)·ln(ratio)
    const Pcoef = eCoef * Icoef;            // P = Pcoef·π·ln(ratio)
    const sig = pow10Neg(n);
    const jStr = jCoef === 1 ? "\\dfrac{1}{\\rho}" : `\\dfrac{${jCoef}}{\\rho}`;

    const diagram: EmFieldDiagram = {
      geometry: "coax_resistor",
      title: "동축 원통(도전율 물질) 저항",
      labels: {
        inner: `a = ${a}\\,\\mathrm{m}`, outer: `b = ${b}\\,\\mathrm{m}`,
        sigma: `\\sigma = ${sig}\\,\\mathrm{S/m}`, length: `L = ${L}\\,\\mathrm{m}`,
        current: `I = ${Icoef}\\pi\\,\\mathrm{A}`,
        quantity: variant ? "P" : "R",
      },
    };

    const content = `그림은 두 완전 도체 사이의 공간에 도전율 \\( \\sigma \\)인 물질이 균일하게 채워져 있는 동축 원통이다. 내부 도체의 반경 \\( a=${a}\\,[\\mathrm{m}] \\), 외부 도체의 내경 \\( b=${b}\\,[\\mathrm{m}] \\), 길이 \\( L=${L}\\,[\\mathrm{m}] \\)일 때, 두 도체 사이의 ${variant ? "소비 전력 \\(P\\)" : "저항 \\(R\\)"}을 제시된 〈해석 절차〉에 따라 단계별로 구하여 서술하시오. (단, \\( \\sigma=${sig}\\,[\\mathrm{S/m}] \\)이고, 원통 좌표계 \\( \\rho,\\phi,z \\)의 단위 벡터는 \\( \\mathbf{a}_\\rho,\\mathbf{a}_\\phi,\\mathbf{a}_z \\)이다. 각 도체의 가장자리 효과(fringing effect)는 무시하고 계산식의 \\( \\pi \\)와 \\( \\ln ${ratio} \\)는 그대로 둔다.)`;
    const givens = [
      `내부 도체 반경 \\( a=${a}\\,[\\mathrm{m}] \\), 외부 도체 내경 \\( b=${b}\\,[\\mathrm{m}] \\), 길이 \\( L=${L}\\,[\\mathrm{m}] \\)`,
      `도전율 \\( \\sigma=${sig}\\,[\\mathrm{S/m}] \\)`,
    ];
    // 공통 [단계1]·[단계2].
    const q1 = `[단계 1] 두 도체 사이에 전압 \\( V_1\\,[\\mathrm{V}] \\)를 인가한 상태에서 내부 도체에서 외부 도체로 전류 \\( I=${Icoef}\\pi\\,[\\mathrm{A}] \\)가 흐를 때, 두 도체 사이의 전류 밀도 \\( \\mathbf{J}\\,[\\mathrm{A/m^2}] \\)를 원통 좌표계에서 \\( \\rho \\)가 포함된 식으로 구하시오.`;
    const q2 = `[단계 2] [단계 1]의 결과를 이용하여, 두 도체 사이의 전계 \\( \\mathbf{E}\\,[\\mathrm{V/m}] \\)을 원통 좌표계에서 \\( \\rho \\)가 포함된 식으로 구하고, 전압 \\( V_1\\,[\\mathrm{V}] \\)을 구하시오.`;
    const s1 = `[단계 1] 전류 \\(I\\)가 반경 방향으로 흐르고 반경 \\( \\rho \\)에서 원통면의 넓이는 \\( 2\\pi\\rho L \\)이므로 \\( \\mathbf{J}=\\dfrac{I}{2\\pi\\rho L}\\mathbf{a}_\\rho=\\dfrac{${Icoef}\\pi}{2\\pi\\rho\\cdot ${L}}\\mathbf{a}_\\rho=${jStr}\\mathbf{a}_\\rho\\,[\\mathrm{A/m^2}] \\).`;
    const s2 = `[단계 2] \\( \\mathbf{E}=\\dfrac{\\mathbf{J}}{\\sigma}=\\dfrac{${jStr}}{${sig}}\\mathbf{a}_\\rho=\\dfrac{${eCoef}}{\\rho}\\mathbf{a}_\\rho\\,[\\mathrm{V/m}] \\). \\( V_1=\\displaystyle\\int_a^b \\mathbf{E}\\cdot d\\boldsymbol{\\rho}=${eCoef}\\int_{${a}}^{${b}}\\dfrac{d\\rho}{\\rho}=${eCoef}\\ln\\dfrac{${b}}{${a}}=${eCoef}\\ln ${ratio}\\,[\\mathrm{V}] \\).`;

    if (!variant) {
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content, givens,
        question: [q1, q2, `[단계 3] [단계 2]의 결과를 이용하여, 두 도체 사이의 저항 \\( R\\,[\\Omega] \\)을 구하시오.`].join("\n"),
        answer: [
          `[단계 1] \\( \\mathbf{J}=${jStr}\\mathbf{a}_\\rho\\,[\\mathrm{A/m^2}] \\)`,
          `[단계 2] \\( \\mathbf{E}=\\dfrac{${eCoef}}{\\rho}\\mathbf{a}_\\rho\\,[\\mathrm{V/m}] \\), \\( V_1=${eCoef}\\ln ${ratio}\\,[\\mathrm{V}] \\)`,
          `[단계 3] \\( R=\\dfrac{${CR}}{\\pi}\\ln ${ratio}\\,[\\Omega] \\)`,
        ].join("\n"),
        steps: [s1, s2, `[단계 3] \\( R=\\dfrac{V_1}{I}=\\dfrac{${eCoef}\\ln ${ratio}}{${Icoef}\\pi}=\\dfrac{${CR}}{\\pi}\\ln ${ratio}\\,[\\Omega] \\).`],
        diagram,
      };
    }

    // 변형(구하는 양 교환): [3] 소비 전력 P = V₁·I.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content, givens,
      question: [q1, q2, `[단계 3] [단계 2]의 결과를 이용하여, 두 도체 사이에서 소비되는 전력 \\( P\\,[\\mathrm{W}] \\)를 구하시오.`].join("\n"),
      answer: [
        `[단계 1] \\( \\mathbf{J}=${jStr}\\mathbf{a}_\\rho\\,[\\mathrm{A/m^2}] \\)`,
        `[단계 2] \\( \\mathbf{E}=\\dfrac{${eCoef}}{\\rho}\\mathbf{a}_\\rho\\,[\\mathrm{V/m}] \\), \\( V_1=${eCoef}\\ln ${ratio}\\,[\\mathrm{V}] \\)`,
        `[단계 3] \\( P=${Pcoef}\\pi\\ln ${ratio}\\,[\\mathrm{W}] \\)`,
      ].join("\n"),
      steps: [s1, s2, `[단계 3] \\( P=V_1 I=(${eCoef}\\ln ${ratio})(${Icoef}\\pi)=${Pcoef}\\pi\\ln ${ratio}\\,[\\mathrm{W}] \\).`],
      diagram,
    };
  },
};

// =====================================================================
// 24. 무한 면전하 + 원형 링 선전하의 축상 합성 전계 → 비율 조건으로 λ 도출 (정전계, 임용 12번 형식)
//     원본: 면전하 ρ_s(z=z_s 평면) + 원형 링(반지름 R, z=0 평면, 원점 중심)에 선전하 λ.
//     점 P(0,0,z_p) 축상에서 |E_1|:|E_2|=a:b 되는 λ, 합성 전계 E_P.
//     ★ sheet_line_efield(무한 직선 선전하·E=0)와 다름 — ★원형 링★ 선전하 + ★비율★ 조건.
//     ★ 링 축상 전계: E_2=λ·R·z/(2ε₀(R²+z²)^{3/2}). E_1=ρ_s/(2ε₀). P는 면 아래(−a_z)·링 위(+a_z).
//        (R²+z²)가 완전제곱이 되게 R²·z²=완전제곱인 (R,z) 사용 → E_2=λ/(m ε₀) 깔끔.
//        λ=(b/a)·(ρ_s/2)·m, E_P=(ρ_s/2)(b−a)/a /ε₀. 규칙 열거 + 원본 제외.
//        exam_similar=비율 given→λ / exam_variant=λ given→비율·E_P("구하는 양" 교환).
// =====================================================================
type SheetRingFam = { Rsq: number; dsq: number; m: number; Rs: string; zp: string };
const SHEET_RING_FAMILIES: SheetRingFam[] = [
  { Rsq: 2, dsq: 2, m: 8, Rs: "\\sqrt{2}", zp: "\\sqrt{2}" },
  { Rsq: 8, dsq: 8, m: 16, Rs: "2\\sqrt{2}", zp: "2\\sqrt{2}" },
  { Rsq: 18, dsq: 18, m: 24, Rs: "3\\sqrt{2}", zp: "3\\sqrt{2}" },
  { Rsq: 5, dsq: 20, m: 25, Rs: "\\sqrt{5}", zp: "2\\sqrt{5}" },
  { Rsq: 20, dsq: 5, m: 25, Rs: "2\\sqrt{5}", zp: "\\sqrt{5}" },
];
type SheetRingSet = { fam: SheetRingFam; rhoS: number; a: number; b: number };
function buildSheetRingSpace(): SheetRingSet[] {
  const rhoss = [2, 4, 6];
  const ratios: Array<[number, number]> = [[2, 3], [1, 2], [3, 4], [2, 5], [3, 5], [1, 3], [4, 5], [3, 2], [2, 1]];
  const out: SheetRingSet[] = [];
  for (const fam of SHEET_RING_FAMILIES) for (const rhoS of rhoss) for (const [a, b] of ratios) {
    const E1 = rhoS / 2;
    const lam = (b / a) * E1 * fam.m;
    if (!Number.isInteger(lam) || lam < 1 || lam > 200) continue;
    const epc = E1 * (b - a) / a;
    if (Math.abs(epc * 2 - Math.round(epc * 2)) > 1e-9) continue; // E_P 계수 0.5배수
    if (fam.m === 8 && rhoS === 2 && a === 2 && b === 3) continue; // 원본 제외
    out.push({ fam, rhoS, a, b });
  }
  return out;
}
const SHEET_RING_SPACE = buildSheetRingSpace();

const sheetRingEfieldRatio: EmEntry = {
  id: "sheet_ring_efield_ratio",
  topicKey: "gauss_law",
  title: "무한 면전하와 원형 링 선전하의 합성 전계",
  keywords: [
    "원형 루프", "원형 도선", "링", "반지름", "면전하", "선전하", "합성 전계",
    "축상", "전계의 크기 비", "비", "정전계",
  ],
  // ★ "원형 루프(도선)에 선전하 + 합성 전계"가 결정적 — 두 신호를 함께 strong으로 둬야
  //   자기 원형 루프(circular_loops_axis, "합성 자계"만)·직선 선전하(sheet_line_efield, "원형" 없음)를
  //   둘 다 이긴다. 자기 루프 원본은 "합성 전계"가 없어 여기로 안 샘(라운드트립 검증).
  strongKeywords: [
    "원형 루프", "원형 도선", "합성 전계", "합성전계",
  ],
  geometry: "sheet_ring_efield",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const { fam, rhoS, a, b } = pick(SHEET_RING_SPACE, rand);
    const E1coef = rhoS / 2;                         // E_1 = E1coef/ε₀
    const sumSq = fam.Rsq + fam.dsq;                 // R²+z²
    const pcubed = Math.round(Math.pow(sumSq, 1.5)); // (R²+z²)^{3/2}
    const prod = Math.round(Math.sqrt(fam.Rsq * fam.dsq)); // R·z
    const m = fam.m;                                 // E_2 = λ/(m ε₀)
    const lam = Math.round((b / a) * E1coef * m);    // 도출 λ
    const zs = Math.ceil(Math.sqrt(fam.dsq)) + 1;    // 면 높이(정수)>z_p
    const E0 = "\\varepsilon_0";
    const e1 = reducedFrac(rhoS, "", 2, E0);         // ρ_s/(2ε₀)
    // gcd 축약된 비율(a':b')
    const g = ((x, y) => { while (y) { [x, y] = [y, x % y]; } return x; })(a, b);
    const ar = a / g, br = b / g;
    // E_P 계수 = E1coef·(b−a)/a
    const epNum = E1coef * (b - a), epDen = a;
    const epStr = epNum === 0
      ? "\\mathbf{0}"
      : `${epNum < 0 ? "-" : ""}${reducedFrac(Math.abs(epNum), "", epDen, E0)}\\,\\mathbf{a}_z`;

    const diagram: EmFieldDiagram = {
      geometry: "sheet_ring_efield",
      title: "무한 면전하와 원형 링 선전하의 합성 전계",
      labels: {
        sheet: `\\rho_s = ${rhoS}\\,[\\mathrm{C/m^2}]`,
        sheetZ: `z = ${zs}`,
        ring: `\\lambda\\,[\\mathrm{C/m}]`,
        ringR: `${fam.Rs}`,
        pointP: `P(0, 0, ${fam.zp})`,
        pZnum: `${Math.round(Math.sqrt(fam.dsq) * 1000) / 1000}`, // 렌더 배치용 수치
        rNum: `${Math.round(Math.sqrt(fam.Rsq) * 1000) / 1000}`,  // 링 반경 수치
        target: variant ? `\\lambda = ${lam}` : `|E_1| : |E_2| = ${ar} : ${br}`,
      },
    };

    // 공통 [단계 1] 물리식.
    const s1 = `[단계 1] 무한 면전하의 전계 크기는 \\( \\dfrac{\\rho_s}{2${E0}}=${e1} \\)이고 점 \\(P\\)는 면(\\(z=${zs}\\)) 아래라 \\(-\\mathbf{a}_z\\): \\( \\mathbf{E}_1=${e1}\\,(-\\mathbf{a}_z) \\). 반지름 \\(R=${fam.Rs}\\)인 원형 링(선전하 \\(\\lambda\\))의 축상(거리 \\(z=${fam.zp}\\)) 전계는 \\( \\mathbf{E}_2=\\dfrac{\\lambda R z}{2${E0}(R^2+z^2)^{3/2}}\\mathbf{a}_z \\). \\( R^2+z^2=${fam.Rsq}+${fam.dsq}=${sumSq} \\), \\( (R^2+z^2)^{3/2}=${pcubed} \\), \\( Rz=${prod} \\) 이므로 \\( \\mathbf{E}_2=\\dfrac{\\lambda\\cdot ${prod}}{2\\cdot ${pcubed}\\,${E0}}\\mathbf{a}_z=\\dfrac{\\lambda}{${m}${E0}}\\mathbf{a}_z \\).`;

    const content = `그림과 같이 자유 공간 내의 \\( z=${zs}\\,[\\mathrm{m}] \\)인 무한 평면에 면전하 밀도 \\( ${rhoS}\\,[\\mathrm{C/m^2}] \\)인 무한 면전하가 균일하게 분포해 있고, \\( z=0\\,[\\mathrm{m}] \\) 평면에 원점을 중심으로 반지름이 \\( ${fam.Rs}\\,[\\mathrm{m}] \\)인 원형 루프에 선전하 밀도 \\( \\lambda\\,[\\mathrm{C/m}] \\)인 선전하가 균일하게 분포해 있다. 점 \\( P(0,0,${fam.zp}) \\)에서 ${variant ? `선전하 밀도가 \\( \\lambda=${lam}\\,[\\mathrm{C/m}] \\)일 때 전계의 크기 비 \\( |\\mathbf{E}_1|:|\\mathbf{E}_2| \\)와 합성 전계 \\( \\mathbf{E}_P \\)` : `전계의 크기 비 \\( |\\mathbf{E}_1|:|\\mathbf{E}_2|=${ar}:${br} \\)이 되도록 하는 \\( \\lambda \\)와 합성 전계 \\( \\mathbf{E}_P\\,[\\mathrm{V/m}] \\)`}를 제시된 〈해석 절차〉에 따라 단계별로 구하여 순서대로 서술하시오. (단, 원통 좌표계에서 \\( \\rho,\\phi,z \\)축의 단위 벡터는 \\( \\mathbf{a}_\\rho,\\mathbf{a}_\\phi,\\mathbf{a}_z \\)이고, 계산식에서 진공 유전율 \\( ${E0} \\)는 그대로 둔다.)`;
    const givens = [
      `면전하 밀도 \\( \\rho_s=${rhoS}\\,[\\mathrm{C/m^2}] \\) (\\(z=${zs}\\) 평면)`,
      `원형 링(반지름 \\( ${fam.Rs} \\), \\(z=0\\) 평면, 원점 중심)에 선전하 \\( \\lambda\\,[\\mathrm{C/m}] \\)`,
      `점 \\( P(0,0,${fam.zp}) \\)`,
    ];

    if (!variant) {
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content, givens,
        question: [
          `[단계 1] 점 \\(P\\)에서 면전하에 의한 전계 \\( \\mathbf{E}_1\\,[\\mathrm{V/m}] \\)와 선전하에 의한 전계 \\( \\mathbf{E}_2\\,[\\mathrm{V/m}] \\)를 구하시오.`,
          `[단계 2] [단계 1]의 결과를 이용하여, 전계의 크기 비 \\( |\\mathbf{E}_1|:|\\mathbf{E}_2|=${ar}:${br} \\)이 되도록 \\( \\lambda\\,[\\mathrm{C/m}] \\)를 구하시오. (단, \\( \\lambda>0 \\)이다.)`,
          `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여, 점 \\(P\\)에서의 합성 전계 \\( \\mathbf{E}_P=\\mathbf{E}_1+\\mathbf{E}_2\\,[\\mathrm{V/m}] \\)를 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( \\mathbf{E}_1=${e1}\\,(-\\mathbf{a}_z) \\), \\( \\mathbf{E}_2=\\dfrac{\\lambda}{${m}${E0}}\\mathbf{a}_z\\,[\\mathrm{V/m}] \\)`,
          `[단계 2] \\( \\lambda=${lam}\\,[\\mathrm{C/m}] \\)`,
          `[단계 3] \\( \\mathbf{E}_P=${epStr}\\,[\\mathrm{V/m}] \\)`,
        ].join("\n"),
        steps: [
          s1,
          `[단계 2] \\( |\\mathbf{E}_1|:|\\mathbf{E}_2|=${e1}:\\dfrac{\\lambda}{${m}${E0}}=${ar}:${br} \\) 이므로 \\( \\dfrac{\\lambda/${m}}{${E1coef}}=\\dfrac{${br}}{${ar}} \\Rightarrow \\lambda=${E1coef}\\cdot ${m}\\cdot\\dfrac{${br}}{${ar}}=${lam}\\,[\\mathrm{C/m}] \\).`,
          `[단계 3] \\( \\mathbf{E}_P=\\mathbf{E}_1+\\mathbf{E}_2=\\left(-${E1coef}+\\dfrac{${lam}}{${m}}\\right)\\dfrac{1}{${E0}}\\mathbf{a}_z=${epStr} \\).`,
        ],
        diagram,
      };
    }

    // 변형(구하는 양 교환): λ given → 비율·E_P 도출.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content, givens,
      question: [
        `[단계 1] 점 \\(P\\)에서 면전하에 의한 전계 \\( \\mathbf{E}_1\\,[\\mathrm{V/m}] \\)와 선전하에 의한 전계 \\( \\mathbf{E}_2\\,[\\mathrm{V/m}] \\)를 \\( \\lambda=${lam} \\)를 대입하여 구하시오.`,
        `[단계 2] 전계의 크기 비 \\( |\\mathbf{E}_1|:|\\mathbf{E}_2| \\)를 가장 간단한 정수비로 구하시오.`,
        `[단계 3] 점 \\(P\\)에서의 합성 전계 \\( \\mathbf{E}_P\\,[\\mathrm{V/m}] \\)를 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( \\mathbf{E}_1=${e1}\\,(-\\mathbf{a}_z) \\), \\( \\mathbf{E}_2=\\dfrac{${lam}}{${m}${E0}}\\mathbf{a}_z\\,[\\mathrm{V/m}] \\)`,
        `[단계 2] \\( |\\mathbf{E}_1|:|\\mathbf{E}_2|=${ar}:${br} \\)`,
        `[단계 3] \\( \\mathbf{E}_P=${epStr}\\,[\\mathrm{V/m}] \\)`,
      ].join("\n"),
      steps: [
        s1.replace("\\(\\lambda\\)", `\\(\\lambda=${lam}\\)`),
        `[단계 2] \\( |\\mathbf{E}_1|:|\\mathbf{E}_2|=${E1coef}:\\dfrac{${lam}}{${m}}=${ar}:${br} \\).`,
        `[단계 3] \\( \\mathbf{E}_P=\\left(-${E1coef}+\\dfrac{${lam}}{${m}}\\right)\\dfrac{1}{${E0}}\\mathbf{a}_z=${epStr} \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
// 25. 정사각형 폐경로 선적분 → 면적 극한 → 회전 ∇×H (암페어 법칙 미분형, 임용 11번 형식)
//     원본: 자유 공간에 자계 H = 20x²a_z [A/m]. 한 변 ℓ=1인 정사각형 abcd(xz 평면,
//     중심 (x₀,0,0))에 대해 [1] ∮H·dl, [2] ∮H·dl/S 와 면 방향 단위 벡터 a_n,
//     [3] x₀=2일 때 ∇×H.
//     ★ 물리(닫힌형, GPT 없음): H = k x² a_z 이면 ∇×H = −2k x a_y.
//        경로 a(x₀+ℓ/2,0,−ℓ/2)→b(x₀+ℓ/2,0,ℓ/2)→c(x₀−ℓ/2,0,ℓ/2)→d(x₀−ℓ/2,0,−ℓ/2)→a 는
//        z방향 두 변만 기여 → ∮H·dl = kℓ[(x₀+ℓ/2)²−(x₀−ℓ/2)²] = 2kℓ²x₀ [A].
//        S=ℓ² → ∮H·dl/S = 2k x₀ [A/m²]. 오른손 법칙(x→z 회전)으로 a_n = −a_y 이므로
//        (∮H·dl/S)·a_n = −2k x₀ a_y = ∇×H|_{x=x₀} — 단계 2·3이 정확히 일치(2차식이라
//        유한 정사각형의 평균이 중심값과 같음. 3차 이상이면 어긋나므로 지수는 2로 고정).
//     ★ 값은 규칙 열거+필터, 원본 튜플(k=20·ℓ=1·x₀=2) 제외.
//        exam_similar = x₀ 주어짐 → ∇×H 도출 / exam_variant = "구하는 양 교환"(목표 ∇×H → x₀ 도출).
// =====================================================================
type CurlLoopCombo = { k: number; L: number; x0: number };

/** (k, ℓ, x₀) 규칙 열거 — 표기 가능한 크기로 필터, 원본 튜플 제외. */
function buildCurlLoopSpace(): CurlLoopCombo[] {
  const out: CurlLoopCombo[] = [];
  for (const k of [10, 20, 30, 40, 50, 60, 80, 100]) {
    for (const L of [1, 2]) {
      for (const x0 of [1, 2, 3, 4, 5]) {
        if (k === 20 && L === 1 && x0 === 2) continue; // 원본 튜플 제외
        const circ = 2 * k * L * L * x0; // ∮H·dl 계수(x₀ 대입값)
        const curl = 2 * k * x0;          // |∇×H| at x₀
        if (circ > 2000 || curl > 800) continue; // 지나치게 큰 수치 배제
        out.push({ k, L, x0 });
      }
    }
  }
  return out;
}
const CURL_LOOP_SPACE = buildCurlLoopSpace();

/** ℓ/2 표기 (1 → 0.5, 2 → 1). */
function halfStr(L: number): string {
  const h = L / 2;
  return Number.isInteger(h) ? `${h}` : `${h}`;
}

const curlFromLineIntegral: EmEntry = {
  id: "curl_from_line_integral",
  topicKey: "magnetostatics",
  title: "정사각형 폐경로 선적분과 자계의 회전(∇×H)",
  keywords: [
    "선적분", "경로 적분", "경로적분", "폐경로", "정사각형", "회전", "암페어", "앙페르",
    "단위 벡터", "적분 경로",
  ],
  // ★ "폐경로 선적분 → 회전(∇×H)"이 결정적 시그니처. bare "자계"·"자기장"은 strong 금지
  //   (직선 도선·솔레노이드·면전류 등 모든 정자계 문제가 언급 → 오탈취).
  // ★★ 2026-07-28 축소 (사용자 신고 회귀): bare "폐경로"·"선적분"·"회전"도 strong에서 뺐다 —
  //   **패러데이 유도 문제**(flux_loop_induced_current)를 Vision이 "폐회로를 따라 선적분"·
  //   "∇×E=−∂B/∂t의 회전"으로 요약하면 이 세 낱말만으로 점수가 뒤집혀 시변 자속 문제를
  //   정자계 ∇×H 문제로 변질시켰다(로그 dispatch 실측). 이 유형 고유 조합만 남긴다.
  //   ※ 여기서 놓쳐도 감지기 detectCurlLineIntegral(선적분+회전 구조)이 강제하므로 라우팅은 유지된다.
  strongKeywords: [
    "정사각형 경로", "경로 적분", "경로적분",
    "curl", "∇×", "nabla \\times", "암페어 법칙의 미분형",
  ],
  geometry: "square_loop_curl",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    // 유사·변형이 서로 다른 값을 쓰도록 풀을 절반으로 나눔(구조는 동일).
    const half = Math.ceil(CURL_LOOP_SPACE.length / 2);
    const pool = variant ? CURL_LOOP_SPACE.slice(half) : CURL_LOOP_SPACE.slice(0, half);
    const { k, L, x0 } = pick(pool.length ? pool : CURL_LOOP_SPACE, rand);

    const h = halfStr(L);              // ℓ/2
    const circCoef = 2 * k * L * L;    // ∮H·dl = circCoef·x₀ [A]
    const curlCoef = 2 * k;            // ∮H·dl/S = curlCoef·x₀ [A/m²]
    const curlAt = curlCoef * x0;      // |∇×H| at x₀
    const Hstr = `${k}x^2\\mathbf{a}_z`;
    const vtx = `a\\left(x_0+${h},\\,0,\\,-${h}\\right) \\to b\\left(x_0+${h},\\,0,\\,${h}\\right) \\to c\\left(x_0-${h},\\,0,\\,${h}\\right) \\to d\\left(x_0-${h},\\,0,\\,-${h}\\right) \\to a`;

    const diagram: EmFieldDiagram = {
      geometry: "square_loop_curl",
      title: "자계 H 속의 정사각형 폐경로와 회전(∇×H)",
      labels: {
        field: `H = ${k}x^2 a_z [A/m]`,
        side: `\\ell = ${L}`,
        center: `(x_0, 0, 0)`,
        sideNum: `${L}`,
        target: variant
          ? `\\nabla\\times\\mathbf{H} = -${curlAt}\\mathbf{a}_y 가 되는 x_0 는?`
          : `x_0 = ${x0} 일 때 \\nabla\\times\\mathbf{H} = ?`,
      },
    };

    // 공통 풀이 — [단계 1]·[단계 2]는 x₀에 대한 기호식(원본 구조 그대로).
    const s1 = `[단계 1] \\( \\mathbf{H}=${Hstr} \\)는 \\( \\mathbf{a}_z \\) 성분만 가지므로 \\(x\\)축과 나란한 두 변(\\(b\\to c\\), \\(d\\to a\\))에서는 \\( \\mathbf{H}\\cdot d\\mathbf{l}=0 \\)이다. \\(z\\)축과 나란한 두 변만 기여하며, \\( a\\to b \\)는 \\( x=x_0+${h} \\)에서 \\( +\\mathbf{a}_z \\) 방향(길이 \\( ${L} \\)), \\( c\\to d \\)는 \\( x=x_0-${h} \\)에서 \\( -\\mathbf{a}_z \\) 방향이다. 따라서 \\( \\oint \\mathbf{H}\\cdot d\\mathbf{l} = ${k}\\,${L}\\left[\\left(x_0+${h}\\right)^2-\\left(x_0-${h}\\right)^2\\right] = ${k}\\cdot ${L}\\cdot ${2 * L}x_0 = ${circCoef}x_0\\,[\\mathrm{A}] \\).`;
    const s2 = `[단계 2] 정사각형의 면적은 \\( S=\\ell^2=${L * L}\\,[\\mathrm{m^2}] \\)이므로 \\( \\dfrac{\\oint \\mathbf{H}\\cdot d\\mathbf{l}}{S}=\\dfrac{${circCoef}x_0}{${L * L}}=${curlCoef}x_0\\,[\\mathrm{A/m^2}] \\). 적분 경로 \\(a\\to b\\to c\\to d\\to a\\)에 오른손 법칙을 적용하면(\\(+\\mathbf{a}_x\\)에서 \\(+\\mathbf{a}_z\\)로 도는 방향) 면의 방향 단위 벡터는 \\( \\mathbf{a}_n=\\mathbf{a}_x\\times\\mathbf{a}_z=-\\mathbf{a}_y \\)이다.`;
    const s3common = `\\( \\nabla\\times\\mathbf{H} = \\left(\\dfrac{\\partial H_z}{\\partial y}-\\dfrac{\\partial H_y}{\\partial z}\\right)\\mathbf{a}_x + \\left(\\dfrac{\\partial H_x}{\\partial z}-\\dfrac{\\partial H_z}{\\partial x}\\right)\\mathbf{a}_y + \\left(\\dfrac{\\partial H_y}{\\partial x}-\\dfrac{\\partial H_x}{\\partial y}\\right)\\mathbf{a}_z = -\\dfrac{\\partial}{\\partial x}\\left(${k}x^2\\right)\\mathbf{a}_y = -${curlCoef}x\\,\\mathbf{a}_y \\)`;

    const content = `그림과 같이 자유 공간상에 자계 \\( \\mathbf{H}=${Hstr}\\,[\\mathrm{A/m}] \\)가 있다. 한 변의 길이가 \\( \\ell=${L}\\,[\\mathrm{m}] \\)인 정사각형 \\(abcd\\)는 \\(xz\\) 평면 위에 있고, 그 중심 좌표는 \\( (x_0,\\,0,\\,0) \\)이며 꼭짓점은 \\( ${vtx} \\) 순서로 놓여 있다. 제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)는 각각 \\(x\\)축, \\(y\\)축, \\(z\\)축 방향의 단위 벡터이고, 좌표계의 단위는 \\([\\mathrm{m}]\\)이다.)`;
    const givens = [
      `자계 \\( \\mathbf{H}=${Hstr}\\,[\\mathrm{A/m}] \\)`,
      `정사각형 \\(abcd\\): 한 변 \\( \\ell=${L}\\,[\\mathrm{m}] \\), \\(xz\\) 평면, 중심 \\( (x_0,0,0) \\)`,
      `적분 경로 \\( ${vtx} \\)`,
    ];

    if (!variant) {
      // 유사(원본 구조): x₀ 주어짐 → ∇×H 도출.
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content, givens,
        question: [
          `[단계 1] 그림과 같이 정사각형 경로 \\( a\\to b\\to c\\to d\\to a \\)를 따라 \\( \\oint \\mathbf{H}\\cdot d\\mathbf{l}\\,[\\mathrm{A}] \\)를 구하시오.`,
          `[단계 2] [단계 1]의 결과값을 이용하여 \\( x_0 \\)에서 \\( \\dfrac{\\oint \\mathbf{H}\\cdot d\\mathbf{l}}{S}\\,[\\mathrm{A/m^2}] \\)와 \\( \\mathbf{a}_n \\)을 각각 구하시오. (단, \\( S=\\ell^2 \\)이고, \\( \\mathbf{a}_n \\)은 정사각형 적분 경로로 둘러싸인 면의 방향 단위 벡터이다.)`,
          `[단계 3] \\( x_0=${x0}\\,[\\mathrm{m}] \\)일 때 \\( \\nabla\\times\\mathbf{H}\\,[\\mathrm{A/m^2}] \\)를 구하시오.`,
        ].join("\n"),
        answer: [
          `[단계 1] \\( \\oint \\mathbf{H}\\cdot d\\mathbf{l}=${circCoef}x_0\\,[\\mathrm{A}] \\)`,
          `[단계 2] \\( \\dfrac{\\oint \\mathbf{H}\\cdot d\\mathbf{l}}{S}=${curlCoef}x_0\\,[\\mathrm{A/m^2}] \\), \\( \\mathbf{a}_n=-\\mathbf{a}_y \\)`,
          `[단계 3] \\( \\nabla\\times\\mathbf{H}=-${curlAt}\\,\\mathbf{a}_y\\,[\\mathrm{A/m^2}] \\)`,
        ].join("\n"),
        steps: [
          s1,
          s2,
          `[단계 3] 정사각형을 한 점으로 줄이는 극한에서 \\( \\left(\\dfrac{\\oint \\mathbf{H}\\cdot d\\mathbf{l}}{S}\\right)\\mathbf{a}_n = ${curlCoef}x_0(-\\mathbf{a}_y) \\)가 곧 회전이다. 직접 계산해도 ${s3common}로 같다. \\( x_0=${x0} \\)를 대입하면 \\( \\nabla\\times\\mathbf{H}=-${curlCoef}\\cdot ${x0}\\,\\mathbf{a}_y=-${curlAt}\\,\\mathbf{a}_y\\,[\\mathrm{A/m^2}] \\).`,
        ],
        diagram,
      };
    }

    // 변형(구하는 양 교환): 목표 ∇×H 주어짐 → x₀ 역산.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content, givens,
      question: [
        `[단계 1] 그림과 같이 정사각형 경로 \\( a\\to b\\to c\\to d\\to a \\)를 따라 \\( \\oint \\mathbf{H}\\cdot d\\mathbf{l}\\,[\\mathrm{A}] \\)를 구하시오.`,
        `[단계 2] [단계 1]의 결과값을 이용하여 \\( x_0 \\)에서 \\( \\dfrac{\\oint \\mathbf{H}\\cdot d\\mathbf{l}}{S}\\,[\\mathrm{A/m^2}] \\)와 \\( \\mathbf{a}_n \\)을 각각 구하시오. (단, \\( S=\\ell^2 \\)이고, \\( \\mathbf{a}_n \\)은 정사각형 적분 경로로 둘러싸인 면의 방향 단위 벡터이다.)`,
        `[단계 3] \\( \\nabla\\times\\mathbf{H}=-${curlAt}\\,\\mathbf{a}_y\\,[\\mathrm{A/m^2}] \\)가 되는 정사각형의 중심 좌표 \\( x_0\\,[\\mathrm{m}] \\)를 구하시오.`,
      ].join("\n"),
      answer: [
        `[단계 1] \\( \\oint \\mathbf{H}\\cdot d\\mathbf{l}=${circCoef}x_0\\,[\\mathrm{A}] \\)`,
        `[단계 2] \\( \\dfrac{\\oint \\mathbf{H}\\cdot d\\mathbf{l}}{S}=${curlCoef}x_0\\,[\\mathrm{A/m^2}] \\), \\( \\mathbf{a}_n=-\\mathbf{a}_y \\)`,
        `[단계 3] \\( x_0=${x0}\\,[\\mathrm{m}] \\)`,
      ].join("\n"),
      steps: [
        s1,
        s2,
        `[단계 3] 면적을 0으로 보내는 극한에서 \\( \\left(\\dfrac{\\oint \\mathbf{H}\\cdot d\\mathbf{l}}{S}\\right)\\mathbf{a}_n=\\nabla\\times\\mathbf{H} \\)이고, 직접 계산해도 ${s3common}이다. 따라서 \\( -${curlCoef}x_0\\,\\mathbf{a}_y=-${curlAt}\\,\\mathbf{a}_y \\) → \\( x_0=\\dfrac{${curlAt}}{${curlCoef}}=${x0}\\,[\\mathrm{m}] \\).`,
      ],
      diagram,
    };
  },
};

// ── 레지스트리 ────────────────────────────────────────────────────────
// 34. 주어진 자계 벡터장 → ∇×H = J, ∇·J, ∇·H = 0 조건으로 상수 결정 (임용 2025 B-11)
//   원본: H = y·cos(mx − π/2) a_x + (n·e^x + y) a_z [A/m]  (m·n은 상수)
//     [1] ∇×H = J        → J = a_x − n·e^x a_y − sin(mx) a_z
//     [2] ∇·J 와 원점에서 |J| = K → ∇·J = 0(회전의 발산은 항등 0), |J(0)| = √(1+n²) = K → n = √(K²−1)
//     [3] 모든 좌표에서 ∇·H = 0 → ∇·H = m·y·cos(mx) → m = 0
//   ★ 위 curl_from_line_integral(∮H·dl → 면적 극한)과 **다른 유형** — 그쪽은 폐경로 선적분,
//     이쪽은 벡터장을 직접 미분한다. 실측 신고: 이 원본이 선적분 항목에 뺏겨 전혀 다른 문제가 생성됨.
//   ★ 그림 없음(순수 수식) — dielectric_boundary_field 선례.
type CurlFieldParam = { K2: number; n2: number; expCoef: number };
/** 값 규칙 열거 + 필터 — |J(0)|=√(1+n²)이 깔끔한 근호가 되도록. 원본 튜플(K²=3,n²=2) 제외. */
const CURL_FIELD_SPACE: CurlFieldParam[] = (() => {
  const out: CurlFieldParam[] = [];
  for (const n2 of [2, 3, 4, 8]) {          // n = √2, √3, 2, 2√2
    for (const expCoef of [1, 2]) {          // e^{x}, e^{2x}
      const K2 = 1 + n2;                     // |J(0)|² = 1 + n²
      if (n2 === 2 && expCoef === 1) continue; // 원본 제외
      out.push({ K2, n2, expCoef });
    }
  }
  return out;
})();

/** √v를 사람이 읽는 형태로 — 2→√2, 4→2, 8→2√2. */
function rootStr(v: number): string {
  const r = Math.sqrt(v);
  if (Number.isInteger(r)) return String(r);
  for (const k of [2, 3, 5, 6, 7]) {
    const q = v / (k * k);
    if (Number.isInteger(q) && q > 1) return `${k}\\sqrt{${q}}`;
  }
  return `\\sqrt{${v}}`;
}

const curlFieldCurrentDensity: EmEntry = {
  id: "curl_field_current_density",
  topicKey: "magnetostatics",
  title: "자계 벡터장의 회전(∇×H)으로 전류밀도와 상수 결정",
  keywords: [
    "전류 밀도", "전류밀도", "발산", "회전", "자계", "자유 공간", "단위 벡터", "상수",
  ],
  // ★ 고유 신호 = "∇×H = J(전류밀도)" + "∇·J(발산)" + "상수 결정".
  //   폐경로·선적분은 형제 항목(curl_from_line_integral) 소관이므로 strong에 넣지 않는다.
  strongKeywords: ["전류 밀도", "전류밀도", "발산", "divergence"],
  geometry: "square_loop_curl", // 미사용(그림 없는 순수 수식) — 타입 충족용 placeholder
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const half = Math.ceil(CURL_FIELD_SPACE.length / 2);
    const pool = variant ? CURL_FIELD_SPACE.slice(half) : CURL_FIELD_SPACE.slice(0, half);
    const p = pick(pool.length ? pool : CURL_FIELD_SPACE, rand);
    const a = p.expCoef;
    const expr = a === 1 ? "e^{x}" : `e^{${a}x}`;
    const Hlatex =
      `\\mathbf{H} = y\\cos\\!\\left(mx-\\dfrac{\\pi}{2}\\right)\\mathbf{a}_x + (n${expr} + y)\\mathbf{a}_z`;
    // 계수는 n 앞에 온다 — a=2면 "2n e^{2x}" (실측 버그: "n2e^{2x}"로 나왔음).
    const Jlatex = `\\mathbf{J} = \\mathbf{a}_x - ${a === 1 ? "" : a}n${expr}\\,\\mathbf{a}_y - \\sin(mx)\\,\\mathbf{a}_z`;
    const nStr = rootStr(p.n2);
    const Kstr = rootStr(p.K2);

    const common = {
      entryId: this.id,
      topicKey: this.topicKey,
      title: this.title,
      steps: [
        `\\( \\nabla\\times\\mathbf{H} \\)를 성분별로 계산한다. \\( H_x=y\\cos(mx-\\tfrac{\\pi}{2})=y\\sin(mx) \\), \\( H_y=0 \\), \\( H_z=n${expr}+y \\)이므로` +
          ` \\( (\\nabla\\times\\mathbf{H})_x=\\partial_y H_z-\\partial_z H_y=1 \\), \\( (\\nabla\\times\\mathbf{H})_y=\\partial_z H_x-\\partial_x H_z=-${a === 1 ? "" : a}n${expr} \\),` +
          ` \\( (\\nabla\\times\\mathbf{H})_z=\\partial_x H_y-\\partial_y H_x=-\\sin(mx) \\). 따라서 \\( ${Jlatex}\\,[\\mathrm{A/m^2}] \\).`,
        `**회전의 발산은 항등적으로 0**이다: \\( \\nabla\\cdot\\mathbf{J}=\\nabla\\cdot(\\nabla\\times\\mathbf{H})=0 \\).` +
          ` 원점 \\( (0,0,0) \\)에서 \\( \\mathbf{J}=\\mathbf{a}_x-${a === 1 ? "" : a}n\\,\\mathbf{a}_y \\)이므로` +
          ` \\( |\\mathbf{J}|=\\sqrt{1+${a === 1 ? "" : `${a * a}`}n^2} \\).`,
        `\\( \\nabla\\cdot\\mathbf{H}=\\partial_x H_x+\\partial_y H_y+\\partial_z H_z = m\\,y\\cos(mx)+0+0 = m\\,y\\cos(mx) \\).` +
          ` 모든 좌표에서 0이 되려면 \\( m\\,y\\cos(mx)\\equiv 0 \\) → **\\( m=0 \\)**.`,
      ],
    };

    if (!variant) {
      // exam_similar — 원본 구조: |J(원점)| 주고 n 도출, ∇·H=0으로 m 도출.
      const nAns = a === 1 ? nStr : `\\dfrac{${nStr}}{${a}}`;
      return {
        ...common,
        content: `자유 공간에서의 자계가 \\( ${Hlatex}\\,[\\mathrm{A/m}] \\)이다. 제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, \\( m \\)과 \\( n \\)은 상수이고, \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)는 각 축 방향의 단위 벡터이다.)`,
        givens: [
          `\\( ${Hlatex}\\,[\\mathrm{A/m}] \\)`,
          `원점 \\( (0,0,0) \\)에서 \\( |\\mathbf{J}|=${Kstr} \\)`,
        ],
        question: [
          `[단계 1] \\( \\nabla\\times\\mathbf{H}=\\mathbf{J} \\)를 이용하여 전류 밀도 \\( \\mathbf{J}\\,[\\mathrm{A/m^2}] \\)를 구하시오.`,
          `[단계 2] [단계 1]에서 구한 \\( \\mathbf{J} \\)의 발산 \\( \\nabla\\cdot\\mathbf{J} \\)와, 원점 \\( (0,0,0) \\)에서 \\( |\\mathbf{J}|=${Kstr} \\)일 때의 \\( n \\)을 각각 구하시오.`,
          `[단계 3] 모든 좌표값에 무관하게 \\( \\nabla\\cdot\\mathbf{H}=0 \\)이 되기 위한 \\( m \\)을 구하시오.`,
        ].join("\n"),
        answer: `[단계 1] \\( ${Jlatex} \\)\n[단계 2] \\( \\nabla\\cdot\\mathbf{J}=0 \\), \\( n=${nAns} \\)\n[단계 3] \\( m=0 \\)`,
      };
    }
    // exam_variant — 구하는 양 교환: n을 주고 원점에서 |J|를 구하게 함.
    const nGiven = a === 1 ? nStr : nStr;
    const KAns = a === 1 ? Kstr : rootStr(1 + a * a * p.n2);
    return {
      ...common,
      content: `자유 공간에서의 자계가 \\( ${Hlatex}\\,[\\mathrm{A/m}] \\)이고 \\( n=${nGiven} \\)이다. 제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, \\( m \\)은 상수이고, \\( \\mathbf{a}_x,\\mathbf{a}_y,\\mathbf{a}_z \\)는 각 축 방향의 단위 벡터이다.)`,
      givens: [`\\( ${Hlatex}\\,[\\mathrm{A/m}] \\)`, `\\( n=${nGiven} \\)`],
      question: [
        `[단계 1] \\( \\nabla\\times\\mathbf{H}=\\mathbf{J} \\)를 이용하여 전류 밀도 \\( \\mathbf{J}\\,[\\mathrm{A/m^2}] \\)를 구하시오.`,
        `[단계 2] [단계 1]에서 구한 \\( \\mathbf{J} \\)의 발산 \\( \\nabla\\cdot\\mathbf{J} \\)와 원점 \\( (0,0,0) \\)에서의 크기 \\( |\\mathbf{J}| \\)를 각각 구하시오.`,
        `[단계 3] 모든 좌표값에 무관하게 \\( \\nabla\\cdot\\mathbf{H}=0 \\)이 되기 위한 \\( m \\)을 구하시오.`,
      ].join("\n"),
      answer: `[단계 1] \\( ${Jlatex} \\)\n[단계 2] \\( \\nabla\\cdot\\mathbf{J}=0 \\), \\( |\\mathbf{J}|=${KAns} \\)\n[단계 3] \\( m=0 \\)`,
    };
  },
};

// =====================================================================
// 두 점전하(직각 좌표) → 점 P에서 합성 전계 크기 |E| + 전위 V_P (임용 4번 전자기학)
//
//  배치(원본 고정): Q_A는 y축 위 A(0,d,0), Q_B는 z축 위 B(0,0,d), 측정점 P(0,d,d).
//   · A→P 벡터 = (0,0,d) → 거리 d, 방향 +a_z
//   · B→P 벡터 = (0,d,0) → 거리 d, 방향 +a_y   → 두 전계가 **서로 수직**
//   · |E_A| = kQ_A/d², |E_B| = kQ_B/d², |E| = √(E_A²+E_B²)  (피타고라스)
//   · V_P = kQ_A/d + kQ_B/d = k(Q_A+Q_B)/d   (전위는 스칼라 합)
//  원본(d=3, Q_A=8nC, Q_B=6nC) → E_A=8·E_B=6 → |E|=10 V/m, V_P=42 V.
//
//  ★ 기존 항목으로는 재현 불가 — `point_charge_field`는 **단일** 점전하, `coulomb_force`는 두 전하
//    **사이의 힘 F**다. 실측 신고에서 이 원본이 point_charge_field로 dispatch돼 단일 전하 문제가 나왔다.
// =====================================================================
const K_COUL = 9e9; // 쿨롱 상수 N·m²/C²

/** 규칙 열거 + 필터: E_A·E_B·|E| 모두 정수(피타고라스), V_P 정수. 원본 튜플 제외. */
const TWO_CHARGE_SPACE: Array<{ d: number; qA: number; qB: number; eA: number; eB: number; eMag: number; vP: number }> = (() => {
  const out: Array<{ d: number; qA: number; qB: number; eA: number; eB: number; eMag: number; vP: number }> = [];
  for (const d of [1, 2, 3, 4, 5]) {
    for (let qA = 1; qA <= 40; qA++) {
      for (let qB = 1; qB <= 40; qB++) {
        if (qA === qB) continue;                       // 두 전계 크기가 같으면 √2 배가 되어 지저분
        const eA = (K_COUL * qA * 1e-9) / (d * d);     // V/m
        const eB = (K_COUL * qB * 1e-9) / (d * d);
        if (!Number.isInteger(eA) || !Number.isInteger(eB)) continue;
        const eMag = Math.hypot(eA, eB);
        if (!Number.isInteger(eMag)) continue;         // 피타고라스 조합만
        const vP = (K_COUL * (qA + qB) * 1e-9) / d;    // V
        if (!Number.isInteger(vP)) continue;
        if (eMag < 5 || eMag > 60 || vP < 10 || vP > 300) continue;
        if (d === 3 && qA === 8 && qB === 6) continue; // ★ 원본 튜플 제외
        out.push({ d, qA, qB, eA, eB, eMag, vP });
      }
    }
  }
  return out;
})();

const twoPointChargesFieldPotential: EmEntry = {
  id: "two_point_charges_field_potential",
  topicKey: "electrostatics",
  title: "직각 좌표계 위 두 점전하의 합성 전계와 전위",
  // ★ bare "점전하"·"두 점전하"는 keywords/strong 어디에도 두지 않는다 (실측):
  //   전자는 단일 점전하(point_charge_field), 후자는 두 전하 사이의 힘(coulomb_force)의 고유어라
  //   그대로 두면 형제 항목을 점수로 잠식한다([[feedback_generic_code]] 잠식 금지).
  keywords: ["전계와 전위", "합성 전계", "자유 공간", "직각 좌표"],
  // 결정적 시그니처 = "두 점전하 + 전계/전위를 함께 구함" — 힘(F) 문제엔 없는 조합.
  strongKeywords: ["두 점전하에 의한 전계", "두 점전하에 의한 전위", "점전하에 의한 전계와 전위"],
  geometry: "two_charges_axes",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const half = Math.ceil(TWO_CHARGE_SPACE.length / 2);
    const pool = variant ? TWO_CHARGE_SPACE.slice(half) : TWO_CHARGE_SPACE.slice(0, half);
    const p = pick(pool.length ? pool : TWO_CHARGE_SPACE, rand);
    const { d, qA, qB, eA, eB, eMag, vP } = p;

    const diagram: EmFieldDiagram = {
      geometry: "two_charges_axes",
      title: "자유 공간 내 두 점전하와 측정점 P",
      labels: {
        chargeA: `Q_A = ${qA}\\,[\\mathrm{nC}]`,
        chargeB: `Q_B = ${qB}\\,[\\mathrm{nC}]`,
        pointA: `A(0, ${d}, 0)`,
        pointB: `B(0, 0, ${d})`,
        pointP: `P(0, ${d}, ${d})`,
      },
    };

    const givens = [
      `점전하 \\( Q_A = ${qA}\\,[\\mathrm{nC}] \\) — 점 \\( A(0,${d},0) \\)`,
      `점전하 \\( Q_B = ${qB}\\,[\\mathrm{nC}] \\) — 점 \\( B(0,0,${d}) \\)`,
      `측정점 \\( P(0,${d},${d}) \\), 자유 공간의 유전율 \\( \\varepsilon_0 = \\dfrac{10^{-9}}{36\\pi}\\,[\\mathrm{F/m}] \\) (즉 \\( k = \\dfrac{1}{4\\pi\\varepsilon_0} = 9\\times10^{9} \\))`,
    ];

    const stepGeom =
      `\\( \\overrightarrow{AP} = (0,0,${d}) \\Rightarrow |AP| = ${d}\\,\\mathrm{m},\\ \\mathbf{a}_{AP} = \\mathbf{a}_z \\), ` +
      `\\( \\overrightarrow{BP} = (0,${d},0) \\Rightarrow |BP| = ${d}\\,\\mathrm{m},\\ \\mathbf{a}_{BP} = \\mathbf{a}_y \\) — 두 전계는 서로 수직이다.`;

    if (!variant) {
      // 유사(원본 구조): |E|와 V_P를 순서대로.
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content:
          `그림과 같이 자유 공간에서 \\( Q_A = ${qA}\\,[\\mathrm{nC}] \\)의 점전하가 점 \\( A(0,${d},0) \\)에 있고, ` +
          `\\( Q_B = ${qB}\\,[\\mathrm{nC}] \\)의 점전하가 점 \\( B(0,0,${d}) \\)에 놓여 있다. ` +
          `점 \\( P(0,${d},${d}) \\)에서 두 점전하에 의한 전계의 크기 \\( |\\mathbf{E}|\\,[\\mathrm{V/m}] \\)와 전위 \\( V_P\\,[\\mathrm{V}] \\)를 구하여 순서대로 쓰시오. ` +
          `(단, 자유 공간의 유전율은 \\( \\varepsilon_0 = \\dfrac{10^{-9}}{36\\pi}\\,[\\mathrm{F/m}] \\)이다.)`,
        givens,
        question:
          `점 \\(P\\)에서 두 점전하에 의한 전계의 크기 \\( |\\mathbf{E}|\\,[\\mathrm{V/m}] \\)와 전위 \\( V_P\\,[\\mathrm{V}] \\)를 순서대로 구하시오.`,
        answer: `\\( |\\mathbf{E}| = ${eMag}\\,[\\mathrm{V/m}] \\), \\( V_P = ${vP}\\,[\\mathrm{V}] \\)`,
        steps: [
          stepGeom,
          `각 점전하가 만드는 전계: \\( \\mathbf{E}_A = \\dfrac{kQ_A}{|AP|^2}\\mathbf{a}_z = \\dfrac{(9\\times10^{9})(${qA}\\times10^{-9})}{${d}^2}\\mathbf{a}_z = ${eA}\\,\\mathbf{a}_z \\), ` +
            `\\( \\mathbf{E}_B = \\dfrac{kQ_B}{|BP|^2}\\mathbf{a}_y = ${eB}\\,\\mathbf{a}_y\\,[\\mathrm{V/m}] \\)`,
          `두 성분이 수직이므로 크기는 피타고라스로: \\( |\\mathbf{E}| = \\sqrt{${eA}^2 + ${eB}^2} = ${eMag}\\,[\\mathrm{V/m}] \\)`,
          `전위는 스칼라 합: \\( V_P = \\dfrac{kQ_A}{|AP|} + \\dfrac{kQ_B}{|BP|} = \\dfrac{(9\\times10^{9})(${qA}+${qB})\\times10^{-9}}{${d}} = ${vP}\\,[\\mathrm{V}] \\)`,
        ],
        diagram,
      };
    }

    // 변형: 구하는 양 교환 — 합성 전계의 크기가 주어질 때 Q_B를 역산하고 전위를 구한다.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content:
        `그림과 같이 자유 공간에서 \\( Q_A = ${qA}\\,[\\mathrm{nC}] \\)의 점전하가 점 \\( A(0,${d},0) \\)에 있고, ` +
        `크기를 모르는 점전하 \\( Q_B \\)가 점 \\( B(0,0,${d}) \\)에 놓여 있다. 점 \\( P(0,${d},${d}) \\)에서 두 점전하에 의한 ` +
        `전계의 크기가 \\( |\\mathbf{E}| = ${eMag}\\,[\\mathrm{V/m}] \\)일 때, \\( Q_B\\,[\\mathrm{nC}] \\)와 점 \\(P\\)의 전위 \\( V_P\\,[\\mathrm{V}] \\)를 ` +
        `구하여 순서대로 쓰시오. (단, 자유 공간의 유전율은 \\( \\varepsilon_0 = \\dfrac{10^{-9}}{36\\pi}\\,[\\mathrm{F/m}] \\)이고, \\( Q_B > 0 \\)이다.)`,
      givens: [
        `점전하 \\( Q_A = ${qA}\\,[\\mathrm{nC}] \\) — 점 \\( A(0,${d},0) \\)`,
        `점전하 \\( Q_B \\) (미지, \\(>0\\)) — 점 \\( B(0,0,${d}) \\)`,
        `점 \\( P(0,${d},${d}) \\)에서 합성 전계의 크기 \\( |\\mathbf{E}| = ${eMag}\\,[\\mathrm{V/m}] \\)`,
      ],
      question:
        `점전하 \\( Q_B\\,[\\mathrm{nC}] \\)와 점 \\(P\\)에서의 전위 \\( V_P\\,[\\mathrm{V}] \\)를 순서대로 구하시오.`,
      answer: `\\( Q_B = ${qB}\\,[\\mathrm{nC}] \\), \\( V_P = ${vP}\\,[\\mathrm{V}] \\)`,
      steps: [
        stepGeom,
        `\\( Q_A \\)에 의한 전계: \\( |\\mathbf{E}_A| = \\dfrac{kQ_A}{${d}^2} = ${eA}\\,[\\mathrm{V/m}] \\) (\\(+\\mathbf{a}_z\\) 방향)`,
        `두 전계가 수직이므로 \\( |\\mathbf{E}|^2 = |\\mathbf{E}_A|^2 + |\\mathbf{E}_B|^2 \\Rightarrow |\\mathbf{E}_B| = \\sqrt{${eMag}^2 - ${eA}^2} = ${eB}\\,[\\mathrm{V/m}] \\)`,
        `\\( |\\mathbf{E}_B| = \\dfrac{kQ_B}{${d}^2} \\Rightarrow Q_B = \\dfrac{${eB}\\times ${d}^2}{9\\times10^{9}} = ${qB}\\times10^{-9} = ${qB}\\,[\\mathrm{nC}] \\)`,
        `\\( V_P = \\dfrac{kQ_A}{${d}} + \\dfrac{kQ_B}{${d}} = ${vP}\\,[\\mathrm{V}] \\)`,
      ],
      diagram: { ...diagram, labels: { ...diagram.labels, chargeB: "Q_B = ?" } },
    };
  },
};

// =====================================================================
// 무한히 긴 직선 원통 도체(도전율 σ) — 전위차 → 내부 전계·전류밀도·전류 → 외부 자계 (임용 12번 전자기학)
//
//  원본: 반경 r, 도전율 σ인 무한 원통 도체가 z축 위에 있고, 단면 A·B 사이 전위차 V_AB, 길이 L.
//   [1] 내부 전계 E = V_AB/L  (균일)          [2] J = σE, I = J·πr²
//   [3] 도체 **외부**(ρ > r) 자계: 앙페르 법칙 → |H| = I/(2πρ)
//  원본(r=0.01·σ=10⁷·V=0.1·L=10) → E=0.01 V/m, J=10⁵ A/m², I=10π A, |H| = 5/ρ A/m.
//
//  ★ 형제 `coax_resistance`(동축 원통 두 도체 **사이** 저항 R, 반경방향 전류)와 다르다 —
//    이쪽은 **단일 원통·축방향 전류**이고 최종 답이 외부 자계다. 실측 로그에서 이 원본이
//    coax_resistance로 dispatch돼 전혀 다른 문제가 생성됐다(사용자 신고).
// =====================================================================
/** 규칙 열거 + 필터: E·J가 깔끔하고 I가 정수×π, |H| 계수가 정수/반정수. 원본 튜플 제외. */
const CYL_COND_SPACE: Array<{ rCm: number; sigmaExp: number; V: number; L: number; E: number; J: number; iPi: number; hCoef: number }> = (() => {
  const out: Array<{ rCm: number; sigmaExp: number; V: number; L: number; E: number; J: number; iPi: number; hCoef: number }> = [];
  for (const rCm of [1, 2, 5]) {                      // 반경 [cm]
    for (const sigmaExp of [6, 7, 8]) {               // σ = 10^exp [S/m]
      for (const V of [0.1, 0.2, 0.4, 0.5, 1]) {      // V_AB [V]
        for (const L of [2, 4, 5, 10, 20]) {          // 길이 [m]
          const r = rCm / 100;
          const E = V / L;                            // V/m
          const J = Math.pow(10, sigmaExp) * E;       // A/m²
          const iPi = J * r * r;                      // I = iPi·π [A]
          const hCoef = iPi / 2;                      // |H| = hCoef/ρ [A/m]
          const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
          // I = iPi·π, |H| = hCoef/ρ 가 **모두 정수 계수**여야 답이 깔끔하다(iPi가 짝수).
          if (!near(iPi) || !near(hCoef)) continue;
          if (iPi < 1 || iPi > 200) continue;
          if (!near(E * 1000) || E < 0.005 || E > 0.5) continue; // E는 소수 셋째 자리까지
          if (rCm === 1 && sigmaExp === 7 && V === 0.1 && L === 10) continue; // ★ 원본 튜플 제외
          out.push({ rCm, sigmaExp, V, L, E, J, iPi, hCoef });
        }
      }
    }
  }
  return out;
})();

const cylinderConductorField: EmEntry = {
  id: "cylinder_conductor_current_field",
  topicKey: "current_conduction",
  title: "원통 도체(도전율)의 전류와 외부 자계",
  // ★ bare "도전율"·"원통"은 형제 coax_resistance의 고유어라 keywords에 두지 않는다(잠식 금지).
  keywords: ["전류 밀도", "전류밀도", "외부에서의 자계", "앙페르", "단면"],
  strongKeywords: ["도체 외부에서의 자계", "도체 내부의 전계", "도체 내부의 전류"],
  geometry: "cylinder_conductor",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const half = Math.ceil(CYL_COND_SPACE.length / 2);
    const pool = variant ? CYL_COND_SPACE.slice(half) : CYL_COND_SPACE.slice(0, half);
    const p = pick(pool.length ? pool : CYL_COND_SPACE, rand);
    const { rCm, sigmaExp, V, L, E, J, iPi, hCoef } = p;
    const rM = rCm / 100;
    const jStr = `${J >= 1e4 ? `${J / Math.pow(10, Math.floor(Math.log10(J)))}\\times10^{${Math.floor(Math.log10(J))}}` : J}`;

    const diagram: EmFieldDiagram = {
      geometry: "cylinder_conductor",
      title: "무한히 긴 직선 원통 도체 (도전율 σ)",
      labels: {
        radius: `r = ${rM}\\,[\\mathrm{m}]`,
        sigma: `\\sigma = 10^{${sigmaExp}}\\,[\\mathrm{S/m}]`,
        length: `L = ${L}\\,[\\mathrm{m}]`,
        vab: variant ? "V_{AB} = ?" : `V_{AB} = ${V}\\,[\\mathrm{V}]`,
        top: "B",
        bottom: "A",
      },
    };

    const givens = [
      `원통 도체: 반경 \\( r = ${rM}\\,[\\mathrm{m}] \\), 도전율 \\( \\sigma = 10^{${sigmaExp}}\\,[\\mathrm{S/m}] \\) (중심선이 \\(z\\)축, 무한히 김)`,
      variant
        ? `도체 외부 \\( \\rho \\)에서의 자계 크기 \\( |\\mathbf{H}| = \\dfrac{${hCoef}}{\\rho}\\,[\\mathrm{A/m}] \\), 길이 \\( L = ${L}\\,[\\mathrm{m}] \\)`
        : `단면 A·B 사이 전위차 \\( V_{AB} = ${V}\\,[\\mathrm{V}] \\), 길이 \\( L = ${L}\\,[\\mathrm{m}] \\)`,
      `원통 좌표계 \\( \\rho,\\phi,z \\)의 단위 벡터는 \\( \\mathbf{a}_\\rho,\\mathbf{a}_\\phi,\\mathbf{a}_z \\)이고, 계산식의 \\( \\pi \\)는 그대로 둔다.`,
    ];

    if (!variant) {
      // 유사(원본 구조): V_AB·L → E → J·I → 외부 |H|(ρ의 함수)
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content:
          `그림과 같이 반경 \\( r = ${rM}\\,[\\mathrm{m}] \\), 균일한 도전율 \\( \\sigma = 10^{${sigmaExp}}\\,[\\mathrm{S/m}] \\)을 갖는 무한히 긴 직선 원통형 도체의 중심선이 \\(z\\)축 상에 놓여 있다. ` +
          `무한 도체 상의 단면 A와 B 사이의 전위차 \\( V_{AB} = ${V}\\,[\\mathrm{V}] \\), 길이 \\( L = ${L}\\,[\\mathrm{m}] \\)일 때, ` +
          `도체 내부의 전류 \\( I\\,[\\mathrm{A}] \\)와 도체 외부에서의 자계의 크기 \\( |\\mathbf{H}|\\,[\\mathrm{A/m}] \\)를 제시된 〈해석 절차〉에 따라 단계별로 구하여 서술하시오.`,
        givens,
        question: [
          `[단계 1] \\( V_{AB} = ${V}\\,[\\mathrm{V}] \\), \\( L = ${L}\\,[\\mathrm{m}] \\)에 대한 도체 내부의 전계 \\( \\mathbf{E}\\,[\\mathrm{V/m}] \\)를 구하시오.`,
          `[단계 2] 도체 내부의 전류 밀도 \\( \\mathbf{J}\\,[\\mathrm{A/m^2}] \\)를 구하고, 전류 \\( I\\,[\\mathrm{A}] \\)를 구하시오.`,
          `[단계 3] [단계 2]에서 구한 전류 \\( I \\)가 무한 도체에 흐를 때, 도체 외부에서의 자계의 크기 \\( |\\mathbf{H}|\\,[\\mathrm{A/m}] \\)를 \\( \\rho \\)의 함수로 구하시오.`,
        ].join("\n"),
        answer: `\\( I = ${iPi}\\pi\\,[\\mathrm{A}] \\), \\( |\\mathbf{H}| = \\dfrac{${hCoef}}{\\rho}\\,[\\mathrm{A/m}] \\) (\\( \\rho > ${rM} \\))`,
        steps: [
          `[단계 1] 균일 도체 내부의 전계는 일정하므로 \\( |\\mathbf{E}| = \\dfrac{V_{AB}}{L} = \\dfrac{${V}}{${L}} = ${E}\\,[\\mathrm{V/m}] \\) (\\( +\\mathbf{a}_z \\) 방향).`,
          `[단계 2] 옴의 법칙(점 형태) \\( \\mathbf{J} = \\sigma\\mathbf{E} \\Rightarrow |\\mathbf{J}| = 10^{${sigmaExp}} \\times ${E} = ${jStr}\\,[\\mathrm{A/m^2}] \\). ` +
            `단면적 \\( S = \\pi r^2 = \\pi(${rM})^2 \\)이므로 \\( I = |\\mathbf{J}|\\,S = ${iPi}\\pi\\,[\\mathrm{A}] \\).`,
          `[단계 3] 도체 외부(\\( \\rho > r \\))에서 앙페르 주회 법칙: \\( \\oint \\mathbf{H}\\cdot d\\mathbf{l} = H_\\phi (2\\pi\\rho) = I \\) ` +
            `\\( \\Rightarrow |\\mathbf{H}| = \\dfrac{I}{2\\pi\\rho} = \\dfrac{${iPi}\\pi}{2\\pi\\rho} = \\dfrac{${hCoef}}{\\rho}\\,[\\mathrm{A/m}] \\) (\\( \\mathbf{a}_\\phi \\) 방향).`,
        ],
        diagram,
      };
    }

    // 변형: 구하는 양 교환 — 외부 자계가 주어질 때 거꾸로 전류·전류밀도·전위차를 구한다.
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content:
        `그림과 같이 반경 \\( r = ${rM}\\,[\\mathrm{m}] \\), 균일한 도전율 \\( \\sigma = 10^{${sigmaExp}}\\,[\\mathrm{S/m}] \\)을 갖는 무한히 긴 직선 원통형 도체의 중심선이 \\(z\\)축 상에 놓여 있다. ` +
        `도체 외부에서 측정한 자계의 크기가 \\( |\\mathbf{H}| = \\dfrac{${hCoef}}{\\rho}\\,[\\mathrm{A/m}] \\)일 때, 도체 내부의 전류 밀도 \\( |\\mathbf{J}|\\,[\\mathrm{A/m^2}] \\)와 ` +
        `길이 \\( L = ${L}\\,[\\mathrm{m}] \\)인 두 단면 A·B 사이의 전위차 \\( V_{AB}\\,[\\mathrm{V}] \\)를 제시된 〈해석 절차〉에 따라 단계별로 구하여 서술하시오.`,
      givens,
      question: [
        `[단계 1] 도체 외부의 자계 \\( |\\mathbf{H}| = \\dfrac{${hCoef}}{\\rho} \\)로부터 도체에 흐르는 전류 \\( I\\,[\\mathrm{A}] \\)를 구하시오.`,
        `[단계 2] [단계 1]의 \\( I \\)를 이용하여 도체 내부의 전류 밀도 \\( |\\mathbf{J}|\\,[\\mathrm{A/m^2}] \\)와 전계 \\( |\\mathbf{E}|\\,[\\mathrm{V/m}] \\)를 구하시오.`,
        `[단계 3] [단계 2]의 결과를 이용하여 길이 \\( L = ${L}\\,[\\mathrm{m}] \\)인 두 단면 사이의 전위차 \\( V_{AB}\\,[\\mathrm{V}] \\)를 구하시오.`,
      ].join("\n"),
      answer: `\\( |\\mathbf{J}| = ${jStr}\\,[\\mathrm{A/m^2}] \\), \\( V_{AB} = ${V}\\,[\\mathrm{V}] \\)`,
      steps: [
        `[단계 1] 앙페르 법칙 \\( |\\mathbf{H}| = \\dfrac{I}{2\\pi\\rho} \\Rightarrow I = 2\\pi\\rho\\cdot\\dfrac{${hCoef}}{\\rho} = ${iPi}\\pi\\,[\\mathrm{A}] \\).`,
        `[단계 2] \\( |\\mathbf{J}| = \\dfrac{I}{\\pi r^2} = \\dfrac{${iPi}\\pi}{\\pi(${rM})^2} = ${jStr}\\,[\\mathrm{A/m^2}] \\), ` +
          `\\( |\\mathbf{E}| = \\dfrac{|\\mathbf{J}|}{\\sigma} = ${E}\\,[\\mathrm{V/m}] \\).`,
        `[단계 3] 균일 전계이므로 \\( V_{AB} = |\\mathbf{E}|\\,L = ${E}\\times${L} = ${V}\\,[\\mathrm{V}] \\).`,
      ],
      diagram,
    };
  },
};

// =====================================================================
//  동축선로의 영역별 자계 + 반지름 차 (임용 11번, 전자기학)
//
//  구조: 무한히 긴 동축선로, 내부 도체(반지름 a)에 균일 전류 I가 +a_z, 외부 도체
//        (반지름 b, 두께 무시)에 같은 크기 I가 −a_z. 앙페르 주회 법칙으로 3영역 자계를
//        구하고, |H|가 주어진 값이 되는 두 반지름의 차 x를 구한다.
//
//  물리: H₁ = Iρ/(2πa²)  (0<ρ≤a, 내부 도체는 균일 전류 → 쇄교 전류 I·ρ²/a²)
//        H₂ = I/(2πρ)    (a<ρ<b, 쇄교 전류 I)
//        H₃ = 0          (ρ>b,   쇄교 전류 I − I = 0)  ← 동축선로의 핵심 결론
//        |H| = k/π 조건 → ρ₁ = 2a²k/I (영역1), ρ₂ = I/(2k) (영역2), x = ρ₂ − ρ₁
//
//  원본(a=0.02·b=0.06·I=10·k=125) → H₁ = 12500ρ/π, H₂ = 5/(πρ), H₃ = 0,
//                                   ρ₁ = 0.01, ρ₂ = 0.04, x = 0.03 [m] (수기 검산 일치).
//
//  ★ H₃ = 0은 영역1·영역2에만 해가 있게 만들어 "두 반지름"을 **모호하지 않게** 확정한다.
//    (외부 전류를 같은 방향으로 두면 영역3에도 해가 생겨 해가 3개가 되는 구간이 있다.)
//
//  ★ 형제 구분: coax_capacitance(정전용량)·coax_resistance(두 도체 사이 저항)는 모두
//    **전기적** 양이고, cylinder_conductor_current_field는 **단일** 원통이다. 이쪽은
//    동축 + 자계 + 3영역이 고유. 실측 로그에서 이 원본이 curl_field_current_density로
//    dispatch돼 전혀 다른 문제가 생성됐다(사용자 신고, totalIssues=0으로 조용히 통과).
// =====================================================================
/** 규칙 열거 + 필터: 두 반지름과 그 차가 모두 5mm 단위로 깔끔한 조합만. 원본 튜플 제외. */
const COAX_MAG_SPACE: Array<{
  a: number; b: number; I: number; k: number;
  c1: number; c2: number; rho1: number; rho2: number; x: number;
}> = (() => {
  const out: Array<{ a: number; b: number; I: number; k: number; c1: number; c2: number; rho1: number; rho2: number; x: number }> = [];
  const isMul = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
  const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  for (const a of [0.01, 0.02, 0.025, 0.03, 0.04]) {          // 내부 도체 반지름 [m]
    for (const b of [0.05, 0.06, 0.08, 0.1, 0.12]) {          // 외부 도체 반지름 [m]
      if (b < 2.5 * a) continue;                              // 동축 형태가 되도록 충분히 벌린다
      // ★ 전류는 짝수만 — H₂ = (I/2)/(πρ) 의 계수가 정수여야 한다. 홀수면 "5/2"가 되어
      //   답이 \dfrac{5/2}{\pi\rho} 같은 이중 분수로 나온다(실측 E2E에서 확인).
      for (const I of [10, 20, 30, 40, 50]) {                 // 전류 [A]
        for (const k of [50, 100, 125, 200, 250, 400, 500]) { // |H| = k/π [A/m]
          const rho1 = (2 * a * a * k) / I;                   // 영역1 해
          const rho2 = I / (2 * k);                           // 영역2 해
          if (!(rho1 > 0 && rho1 <= a)) continue;             // 영역1 안
          if (!(rho2 > a && rho2 < b)) continue;              // 영역2 안
          const x = rho2 - rho1;
          if (x <= 0) continue;
          // 두 반지름과 차가 모두 5mm 단위여야 답이 깔끔하다.
          if (![rho1, rho2, x].every((v) => isMul(v, 0.005) && v >= 0.005)) continue;
          const c1 = I / (2 * a * a);                         // H₁ = c1·ρ/π
          const c2 = I / 2;                                   // H₂ = c2/(πρ)
          if (!near(c1) || !near(c2)) continue;               // 두 계수 모두 정수
          if (a === 0.02 && b === 0.06 && I === 10 && k === 125) continue; // ★ 원본 튜플 제외
          out.push({ a, b, I, k, c1, c2, rho1, rho2, x });
        }
      }
    }
  }
  return out;
})();

/** 소수 꼬리(0.30000000000000004)를 없앤 표기. */
const fmtM = (v: number) => String(Number(v.toFixed(4)));

const coaxLineMagneticField: EmEntry = {
  id: "coax_line_magnetic_field",
  topicKey: "magnetostatics",
  title: "동축선로의 영역별 자계와 두 반지름의 차",
  // ★ bare "동축"은 형제 coax_capacitance의 고유어라 keywords에 두지 않는다(잠식 금지).
  keywords: ["내부 도체", "외부 도체", "앙페르", "주회", "쇄교"],
  strongKeywords: ["동축선로", "두 도체 사이에서의 자계", "외부 도체 바깥에서의 자계", "동축 도체의 자기장"],
  geometry: "coax_current",
  build(mode, rand) {
    const variant = mode === "exam_variant";
    const half = Math.ceil(COAX_MAG_SPACE.length / 2);
    const pool = variant ? COAX_MAG_SPACE.slice(half) : COAX_MAG_SPACE.slice(0, half);
    const p = pick(pool.length ? pool : COAX_MAG_SPACE, rand);
    const { a, b, I, k, c1, c2, rho1, rho2, x } = p;
    const aS = fmtM(a), bS = fmtM(b);

    const diagram: EmFieldDiagram = {
      geometry: "coax_current",
      title: "무한히 긴 동축선로 (내부 도체 +a_z, 외부 도체 −a_z)",
      labels: {
        a: `a = ${aS}\\,[\\mathrm{m}]`,
        b: `b = ${bS}\\,[\\mathrm{m}]`,
        iInner: `I = ${I}\\,[\\mathrm{A}]`,
        iOuter: `I = ${I}\\,[\\mathrm{A}]`,
        inner: "동축선로의 내부 도체",
        outer: "동축선로의 외부 도체",
      },
    };

    const givens = [
      `동축선로(중심선이 \\(z\\)축, 무한히 긺): 내부 도체 반지름 \\( a = ${aS}\\,[\\mathrm{m}] \\), 외부 도체 반지름 \\( b = ${bS}\\,[\\mathrm{m}] \\)`,
      `내부 도체에 균일한 전류 \\( I = ${I}\\,[\\mathrm{A}] \\)가 \\( +\\mathbf{a}_z \\) 방향, 외부 도체에 균일한 전류 \\( I = ${I}\\,[\\mathrm{A}] \\)가 \\( -\\mathbf{a}_z \\) 방향으로 흐른다.`,
      `도체의 표피 효과와 외부 도체의 두께는 무시하며, 원통 좌표계 \\( \\rho,\\phi,z \\)의 단위 벡터는 \\( \\mathbf{a}_\\rho,\\mathbf{a}_\\phi,\\mathbf{a}_z \\)이고, 계산식의 \\( \\pi \\)는 그대로 둔다.`,
    ];

    const h1Tex = `\\dfrac{${c1}\\rho}{\\pi}`;
    const h2Tex = `\\dfrac{${c2}}{\\pi\\rho}`;
    const stepH = [
      `[단계 1] 앙페르 주회 법칙 \\( \\oint \\mathbf{H}\\cdot d\\mathbf{l} = I_{enc} \\)를 반지름 \\( \\rho \\)인 원형 경로에 적용하면 \\( H_\\phi(2\\pi\\rho) = I_{enc} \\). ` +
        `내부 도체 안(\\( 0<\\rho\\le a \\))에서는 전류가 균일하므로 \\( I_{enc} = I\\dfrac{\\pi\\rho^2}{\\pi a^2} = I\\dfrac{\\rho^2}{a^2} \\) ` +
        `\\( \\Rightarrow \\mathbf{H}_1 = \\dfrac{I\\rho}{2\\pi a^2}\\mathbf{a}_\\phi = ${h1Tex}\\mathbf{a}_\\phi\\,[\\mathrm{A/m}] \\). ` +
        `두 도체 사이(\\( a<\\rho<b \\))에서는 \\( I_{enc} = I \\) \\( \\Rightarrow \\mathbf{H}_2 = \\dfrac{I}{2\\pi\\rho}\\mathbf{a}_\\phi = ${h2Tex}\\mathbf{a}_\\phi\\,[\\mathrm{A/m}] \\).`,
      `[단계 2] 외부 도체 바깥(\\( \\rho>b \\))에서는 두 전류가 크기가 같고 방향이 반대이므로 \\( I_{enc} = I - I = 0 \\) ` +
        `\\( \\Rightarrow \\mathbf{H}_3 = 0\\,[\\mathrm{A/m}] \\). (동축선로 바깥으로 자계가 새지 않는다.)`,
    ];

    if (!variant) {
      // 유사(원본 구조): 3영역 자계 → |H| = k/π 되는 두 반지름의 차 x
      return {
        entryId: this.id, topicKey: this.topicKey, title: this.title,
        content:
          `그림과 같이 원통 좌표계에서 \\(z\\)축 상에 무한히 긴 동축선로가 놓여 있다. ` +
          `반지름이 \\( a = ${aS}\\,[\\mathrm{m}] \\)인 내부 도체에 균일한 전류 \\( I = ${I}\\,[\\mathrm{A}] \\)이 \\( \\mathbf{a}_z \\) 방향으로 흐르며, ` +
          `반지름이 \\( b = ${bS}\\,[\\mathrm{m}] \\)인 외부 도체에 균일한 전류 \\( I = ${I}\\,[\\mathrm{A}] \\)이 \\( -\\mathbf{a}_z \\) 방향으로 흐르고 있다. ` +
          `내부 도체 안쪽에서의 자계 \\( \\mathbf{H}_1\\,[\\mathrm{A/m}] \\), 두 도체 사이에서의 자계 \\( \\mathbf{H}_2\\,[\\mathrm{A/m}] \\), ` +
          `외부 도체 바깥에서의 자계 \\( \\mathbf{H}_3\\,[\\mathrm{A/m}] \\)를 구하고, 자계의 크기가 \\( \\dfrac{${k}}{\\pi}\\,[\\mathrm{A/m}] \\)로 되는 두 반지름의 차 \\( x\\,[\\mathrm{m}] \\)를 ` +
          `제시된 〈해석 절차〉에 따라 구하여 순서대로 서술하시오.`,
        givens,
        question: [
          `[단계 1] 내부 도체 안쪽(\\( 0<\\rho\\le a \\))에서의 자계 \\( \\mathbf{H}_1\\,[\\mathrm{A/m}] \\)과 두 도체 사이(\\( a<\\rho<b \\))에서의 자계 \\( \\mathbf{H}_2\\,[\\mathrm{A/m}] \\)를 각각 \\( \\rho \\)가 포함된 식으로 구하시오.`,
          `[단계 2] 외부 도체 바깥(\\( \\rho>b \\))에서의 자계 \\( \\mathbf{H}_3\\,[\\mathrm{A/m}] \\)를 구하시오.`,
          `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여 자계의 크기가 \\( \\dfrac{${k}}{\\pi}\\,[\\mathrm{A/m}] \\)로 되는 두 반지름의 차 \\( x\\,[\\mathrm{m}] \\)를 구하시오.`,
        ].join("\n"),
        answer:
          `\\( \\mathbf{H}_1 = ${h1Tex}\\mathbf{a}_\\phi \\), \\( \\mathbf{H}_2 = ${h2Tex}\\mathbf{a}_\\phi \\), \\( \\mathbf{H}_3 = 0 \\), ` +
          `\\( x = ${fmtM(x)}\\,[\\mathrm{m}] \\)`,
        steps: [
          ...stepH,
          `[단계 3] \\( |\\mathbf{H}| = \\dfrac{${k}}{\\pi} \\)가 되는 반지름은 자계가 0이 아닌 두 영역에서 각각 하나씩 나온다. ` +
            `영역 1: \\( \\dfrac{${c1}\\rho}{\\pi} = \\dfrac{${k}}{\\pi} \\Rightarrow \\rho_1 = \\dfrac{${k}}{${c1}} = ${fmtM(rho1)}\\,[\\mathrm{m}] \\) (\\( \\le a = ${aS} \\) 이므로 유효). ` +
            `영역 2: \\( \\dfrac{${c2}}{\\pi\\rho} = \\dfrac{${k}}{\\pi} \\Rightarrow \\rho_2 = \\dfrac{${c2}}{${k}} = ${fmtM(rho2)}\\,[\\mathrm{m}] \\) (\\( ${aS} < \\rho_2 < ${bS} \\) 이므로 유효). ` +
            `\\( \\rho>b \\)에서는 \\( \\mathbf{H}_3 = 0 \\)이라 해가 없다. 따라서 \\( x = \\rho_2 - \\rho_1 = ${fmtM(rho2)} - ${fmtM(rho1)} = ${fmtM(x)}\\,[\\mathrm{m}] \\).`,
        ],
        diagram,
      };
    }

    // 변형: 구하는 양 교환 — 두 도체 사이의 자계가 주어질 때 전류 I를 역산하고,
    //       내부 도체 안에서 |H| = k/π가 되는 반지름을 구한다.
    const rhoC = rho2; // 자계가 주어지는 위치 (두 도체 사이, 영역 2)
    const hC = c2 / rhoC; // |H₂(ρ_c)| = c2/(π·ρ_c) = hC/π
    return {
      entryId: this.id, topicKey: this.topicKey, title: this.title,
      content:
        `그림과 같이 원통 좌표계에서 \\(z\\)축 상에 무한히 긴 동축선로가 놓여 있다. ` +
        `반지름이 \\( a = ${aS}\\,[\\mathrm{m}] \\)인 내부 도체에 균일한 전류 \\( I\\,[\\mathrm{A}] \\)이 \\( \\mathbf{a}_z \\) 방향으로 흐르며, ` +
        `반지름이 \\( b = ${bS}\\,[\\mathrm{m}] \\)인 외부 도체에 같은 크기의 전류가 \\( -\\mathbf{a}_z \\) 방향으로 흐르고 있다. ` +
        `두 도체 사이의 \\( \\rho = ${fmtM(rhoC)}\\,[\\mathrm{m}] \\)에서 자계의 크기가 \\( \\dfrac{${fmtM(hC)}}{\\pi}\\,[\\mathrm{A/m}] \\)로 측정되었을 때, ` +
        `전류 \\( I\\,[\\mathrm{A}] \\)와 내부 도체 안쪽에서 자계의 크기가 \\( \\dfrac{${k}}{\\pi}\\,[\\mathrm{A/m}] \\)로 되는 반지름 \\( \\rho_1\\,[\\mathrm{m}] \\)을 ` +
        `제시된 〈해석 절차〉에 따라 구하여 순서대로 서술하시오.`,
      givens: [
        givens[0],
        `내부 도체에 균일한 전류 \\( I\\,[\\mathrm{A}] \\)가 \\( +\\mathbf{a}_z \\) 방향, 외부 도체에 같은 크기의 전류가 \\( -\\mathbf{a}_z \\) 방향으로 흐른다. 두 도체 사이 \\( \\rho = ${fmtM(rhoC)}\\,[\\mathrm{m}] \\)에서 \\( |\\mathbf{H}| = \\dfrac{${fmtM(hC)}}{\\pi}\\,[\\mathrm{A/m}] \\)이다.`,
        givens[2],
      ],
      question: [
        `[단계 1] 내부 도체 안쪽(\\( 0<\\rho\\le a \\))과 두 도체 사이(\\( a<\\rho<b \\))에서의 자계 \\( \\mathbf{H}_1,\\mathbf{H}_2\\,[\\mathrm{A/m}] \\)를 전류 \\( I \\)와 \\( \\rho \\)로 나타내고, 외부 도체 바깥(\\( \\rho>b \\))에서의 자계 \\( \\mathbf{H}_3\\,[\\mathrm{A/m}] \\)를 구하시오.`,
        `[단계 2] \\( \\rho = ${fmtM(rhoC)}\\,[\\mathrm{m}] \\)에서의 자계 크기를 이용하여 전류 \\( I\\,[\\mathrm{A}] \\)를 구하시오.`,
        `[단계 3] [단계 2]의 \\( I \\)를 이용하여, 내부 도체 안쪽에서 자계의 크기가 \\( \\dfrac{${k}}{\\pi}\\,[\\mathrm{A/m}] \\)로 되는 반지름 \\( \\rho_1\\,[\\mathrm{m}] \\)을 구하시오.`,
      ].join("\n"),
      answer:
        `\\( \\mathbf{H}_1 = \\dfrac{I\\rho}{2\\pi a^2}\\mathbf{a}_\\phi \\), \\( \\mathbf{H}_2 = \\dfrac{I}{2\\pi\\rho}\\mathbf{a}_\\phi \\), \\( \\mathbf{H}_3 = 0 \\), ` +
        `\\( I = ${I}\\,[\\mathrm{A}] \\), \\( \\rho_1 = ${fmtM(rho1)}\\,[\\mathrm{m}] \\)`,
      steps: [
        `[단계 1] 앙페르 주회 법칙 \\( H_\\phi(2\\pi\\rho) = I_{enc} \\). 내부 도체 안에서는 \\( I_{enc} = I\\dfrac{\\rho^2}{a^2} \\Rightarrow \\mathbf{H}_1 = \\dfrac{I\\rho}{2\\pi a^2}\\mathbf{a}_\\phi \\), ` +
          `두 도체 사이에서는 \\( I_{enc} = I \\Rightarrow \\mathbf{H}_2 = \\dfrac{I}{2\\pi\\rho}\\mathbf{a}_\\phi \\). ` +
          `외부 도체 바깥에서는 \\( I_{enc} = I - I = 0 \\Rightarrow \\mathbf{H}_3 = 0 \\).`,
        `[단계 2] \\( |\\mathbf{H}_2| = \\dfrac{I}{2\\pi\\rho} \\)에 \\( \\rho = ${fmtM(rhoC)} \\), \\( |\\mathbf{H}| = \\dfrac{${fmtM(hC)}}{\\pi} \\)를 대입하면 ` +
          `\\( \\dfrac{I}{2\\pi(${fmtM(rhoC)})} = \\dfrac{${fmtM(hC)}}{\\pi} \\Rightarrow I = 2(${fmtM(rhoC)})(${fmtM(hC)}) = ${I}\\,[\\mathrm{A}] \\).`,
        `[단계 3] 내부 도체 안에서 \\( |\\mathbf{H}_1| = \\dfrac{I\\rho}{2\\pi a^2} = \\dfrac{${c1}\\rho}{\\pi} \\)이므로 ` +
          `\\( \\dfrac{${c1}\\rho_1}{\\pi} = \\dfrac{${k}}{\\pi} \\Rightarrow \\rho_1 = \\dfrac{${k}}{${c1}} = ${fmtM(rho1)}\\,[\\mathrm{m}] \\) (\\( \\le a = ${aS} \\) 이므로 유효).`,
      ],
      diagram,
    };
  },
};

export const EM_FORMULA_REGISTRY: EmEntry[] = [
  coaxLineMagneticField,
  cylinderConductorField,
  twoPointChargesFieldPotential,
  curlFieldCurrentDensity,
  pointCharge, coulombForce, lineCharge, chargedSheet, sheetChargePotentialWork, parallelPlate,
  straightWire, solenoid, toroid, movingRod, fluxLoopInducedCurrent, forceOnWire, emWave,
  coaxCapacitance, coaxTwoDielectricAxial, sphericalCapacitor, selfInductance, mutualInductance, potentialToChargeDensity,
  fieldPotentialFlux, dielectricTwoRegionCap, dielectricBoundaryField, magneticFluxPrism, sheetLineSuperposition,
  circularLoopAxisField, sheetLineEfieldSuperposition, coaxialResistance, sheetRingEfieldRatio,
  curlFromLineIntegral,
];

const ENTRY_BY_ID = new Map(EM_FORMULA_REGISTRY.map((e) => [e.id, e]));

/** entryId → topicKey (분류·rules용). */
export function emTopicOf(entryId: string): EmTopic {
  return ENTRY_BY_ID.get(entryId)?.topicKey ?? "electrostatics";
}

/**
 * 결정론 EM 문제 생성기.
 *  @param entryId 레지스트리 항목 id (미지정·미존재 시 첫 항목으로 폴백)
 */
export function generateElectromagnetics(args: {
  seed?: number;
  mode: GenerationMode;
  entryId?: string;
  hints?: EmBuildHints;
}): EmInstance {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const entry = (args.entryId && ENTRY_BY_ID.get(args.entryId)) || EM_FORMULA_REGISTRY[0];
  return entry.build(args.mode, rand, args.hints);
}
