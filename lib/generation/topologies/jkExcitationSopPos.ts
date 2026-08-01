import { minimizeSop, minimizePos } from "@/lib/digital/minimize";
import { sopToString, posToString, type BooleanFunction } from "@/lib/digital/booleanFunction";
import type { GenerationMode, JkExcitationCircuitDiagram, TruthTableDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * JK 플립플롭 2개 순서 논리 회로 — 상태 여기표 빈칸 + 조합 논리 J_A (최소 SOP → 분배법칙 → POS).
 * (2025 전기 A-8 형식 — 전용 archetype)
 *
 *  구조 (원본 고정):
 *    · FF_A: J_A·K_A ← 조합 논리 블록 ㉲ (입력 x, Q_A, Q_B)
 *    · FF_B: J_B = K_B = HIGH(1) → 매 클럭 토글
 *    · 두 FF 공통 CLK, 출력 Q_A·Q_B가 ㉲로 되먹임
 *
 *  (가) 상태 여기표: 현재상태 Q_A Q_B | 입력 x | FF 입력 J_A K_A J_B K_B | 다음 상태 Q_A(t+1) Q_B(t+1)
 *    ★ **여기표(excitation table)** 이므로 J·K는 전이(Q→Q⁺)에서 역산되며 **무관(×)** 이 생긴다.
 *      0→0: J=0,K=×  /  0→1: J=1,K=×  /  1→0: J=×,K=1  /  1→1: J=×,K=0
 *
 *  풀이 3단계 (원본 〈설계 절차〉):
 *    [단계 1] 빈칸 ㉠·㉡(J_A K_A) 과 ㉢·㉣(Q_A(t+1) Q_B(t+1))
 *    [단계 2] ㉲의 불 함수 J_A를 **간략화된 최소항의 합(SOP)** 으로 (무관 항 활용)
 *    [단계 3] [단계 2]에 **분배 법칙**을 적용해 **합의 곱(POS)** 으로 변환
 *
 *  ★ 왜 전용 archetype인가: 기존 디지털 순차 archetype 중 이 형식이 없다 —
 *    `fsm`(JK 상태표)은 상태도+출력 y 형식이고, `dff_mux_sequential`은 D-FF+2×1 MUX 구현 회로다
 *    (실측: 이 원본이 D-FF+MUX 회로로 생성돼 사용자 신고). JK 여기표 + ㉲ 조합논리 + SOP→POS 구조는
 *    어느 쪽으로도 재현되지 않는다.
 */

const VARS = ["Q_A", "Q_B", "x"] as const;   // minterm index = 4·Q_A + 2·Q_B + x

export type JkExcitationGeneration = {
  values: {
    /** Q_A의 차기 상태 진리값 (index 0..7) — 설계의 출발점 */
    nextA: number[];
    /** 구하는 대상 열 — 유사=J_A(원본), 변형=K_A(구하는 양 교환) */
    target: "J_A" | "K_A";
    /** 목표 함수 최소 SOP 항 수 / POS 항 수 (품질 지표) */
    sopCount: number;
    posCount: number;
  };
  answer: {
    /** ㉠·㉡ = 마지막 두 행(110·111)의 (J_A, K_A) — '×'는 무관 */
    blank1: string;
    blank2: string;
    /** ㉢·㉣ = 3·4번째 행(010·011)의 다음 상태 "Q_A(t+1) Q_B(t+1)" */
    blank3: string;
    blank4: string;
    sop: string;   // J_A 최소 SOP
    pos: string;   // 분배법칙 적용 결과 (합의 곱)
  };
  /** (가) 상태 여기표 (빈칸 포함) */
  tableDiagram: TruthTableDiagram;
  /** (나) 회로도 */
  circuitDiagram: JkExcitationCircuitDiagram;
};

/** JK 여기: (현재 Q, 다음 Q) → [J, K] ('×' = 무관) */
function excite(q: number, qn: number): [string, string] {
  if (q === 0 && qn === 0) return ["0", "×"];
  if (q === 0 && qn === 1) return ["1", "×"];
  if (q === 1 && qn === 0) return ["×", "1"];
  return ["×", "0"];
}

/** 행 인덱스(0..7) → [Q_A, Q_B, x] */
function bits(i: number): [number, number, number] {
  return [(i >> 2) & 1, (i >> 1) & 1, i & 1];
}

/**
 * 목표 열(J_A 또는 K_A)의 최소 SOP·POS 도출.
 *
 * ★ 구조상 J_A는 Q_A=0인 4행에서만, K_A는 Q_A=1인 4행에서만 값이 정해지고 나머지는 **무관(×)** 이다
 *   (JK 여기표의 성질). 즉 두 함수 모두 실질적으로 (Q_B, x) 2변수 함수다 — 3변수 최소화에
 *   무관 항을 넣어 돌리면 자동으로 Q_A가 사라진다.
 */
function reduceTarget(nextA: number[], target: "J_A" | "K_A"): { sop: string; pos: string; sopCount: number; posCount: number } {
  const minterms: number[] = [], dontCares: number[] = [];
  for (let i = 0; i < 8; i++) {
    const [qa] = bits(i);
    const [j, k] = excite(qa, nextA[i]);
    const cell = target === "J_A" ? j : k;
    if (cell === "1") minterms.push(i);
    else if (cell === "×") dontCares.push(i);
  }
  const bf: BooleanFunction = { vars: 3, varNames: [...VARS], minterms, dontCares };
  const sopTerms = minimizeSop(bf);
  const posTerms = minimizePos(bf);
  return {
    sop: sopToString(sopTerms, [...VARS]),
    pos: posToString(posTerms, [...VARS]),
    sopCount: sopTerms.length,
    posCount: posTerms.length,
  };
}

/**
 * 설계 후보(Q_A 차기 상태 8비트)를 규칙으로 열거 + 품질 필터.
 *  · 목표 함수(유사=J_A, 변형=K_A)는 최소 SOP·POS가 **둘 다 2항 이상**이어야 [단계 2]·[단계 3]이 의미 있다
 *    (단일 리터럴이면 분배 법칙 변환이 자명해진다).
 *  · 목표가 아닌 열도 상수(전부 0/1)면 표가 단조로워지므로 제외.
 */
function buildSpace(target: "J_A" | "K_A"): number[][] {
  const out: number[][] = [];
  const other: "J_A" | "K_A" = target === "J_A" ? "K_A" : "J_A";
  for (let mask = 0; mask < 256; mask++) {
    const nextA = Array.from({ length: 8 }, (_, i) => (mask >> i) & 1);
    const t = reduceTarget(nextA, target);
    if (t.sopCount < 2 || t.sopCount > 3) continue;
    if (t.posCount < 2 || t.posCount > 3) continue;
    const o = reduceTarget(nextA, other);
    if (o.sopCount === 0) continue;                 // 반대편 열이 상수 0 → 표가 단조로움
    // Q_A가 실제로 변하는 설계만 (전 구간 유지/고정 배제)
    const changes = nextA.filter((v, i) => v !== bits(i)[0]).length;
    if (changes < 2 || changes > 6) continue;
    out.push(nextA);
  }
  return out;
}

// 유사 = 원본대로 **J_A**를 구함 / 변형 = 구하는 양 교환(**K_A**) — 구조·절차는 동일.
const SIMILAR_SPACE = buildSpace("J_A");
const VARIANT_SPACE = buildSpace("K_A");

export function generateJkExcitationSopPos(args: { seed?: number; mode: GenerationMode }): JkExcitationGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const isVariant = args.mode === "exam_variant";
  const target: "J_A" | "K_A" = isVariant ? "K_A" : "J_A";
  const space = isVariant ? VARIANT_SPACE : SIMILAR_SPACE;
  const nextA = pick(space.length ? space : SIMILAR_SPACE, rand);

  // ── 표 조립: 8행 × (Q_A Q_B x | J_A K_A J_B K_B | Q_A⁺ Q_B⁺)
  //    FF_B는 J_B=K_B=1(HIGH)이라 Q_B는 매 클럭 토글.
  const BLANK_JK = [6, 7];      // ㉠·㉡ — 마지막 두 행의 (J_A K_A)
  const BLANK_NEXT = [2, 3];    // ㉢·㉣ — 3·4번째 행의 다음 상태
  const marker = ["㉠", "㉡", "㉢", "㉣"];

  const rows: string[][] = [];
  const answers: string[] = [];
  for (let i = 0; i < 8; i++) {
    const [qa, qb, x] = bits(i);
    const qaN = nextA[i];
    const qbN = qb ^ 1;                       // J_B=K_B=1 → 토글
    const [ja, ka] = excite(qa, qaN);
    const jkCell = `${ja} ${ka}`;
    const nextCell = `${qaN} ${qbN}`;
    const jkIdx = BLANK_JK.indexOf(i);
    const nxIdx = BLANK_NEXT.indexOf(i);
    rows.push([
      `${qa}`, `${qb}`, `${x}`,
      jkIdx >= 0 ? marker[jkIdx] : jkCell,
      "1", "1",                                // J_B, K_B = HIGH
      nxIdx >= 0 ? marker[2 + nxIdx] : nextCell,
    ]);
    if (jkIdx >= 0) answers[jkIdx] = jkCell;
    if (nxIdx >= 0) answers[2 + nxIdx] = nextCell;
  }

  const { sop, pos, sopCount, posCount } = reduceTarget(nextA, target);

  const tableDiagram: TruthTableDiagram = {
    variables: ["Q_A(t)", "Q_B(t)", "x(t)"],
    inputGroups: [{ label: "현재 상태", span: 2 }, { label: "입력", span: 1 }],
    outputLabels: ["J_A K_A", "J_B", "K_B", "Q_A(t+1) Q_B(t+1)"],
    rows: rows.map((r) => ({ inputs: [r[0], r[1], r[2]], outputs: [r[3], r[4], r[5], r[6]] })),
  };

  const circuitDiagram: JkExcitationCircuitDiagram = {
    blockLabel: "㉲",
    inputLabel: "x",
    ffALabel: "FF_A",
    ffBLabel: "FF_B",
    highLabel: "HIGH",
    clockLabel: "CLK",
  };

  return {
    values: { nextA, target, sopCount, posCount },
    answer: {
      blank1: answers[0], blank2: answers[1], blank3: answers[2], blank4: answers[3],
      sop, pos,
    },
    tableDiagram,
    circuitDiagram,
  };
}
