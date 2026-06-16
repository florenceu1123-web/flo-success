import type {
  FlashAdc2bitCircuitDiagram,
  GenerationMode,
  LogicNetworkDiagram,
  TruthTableDiagram,
} from "@/types";
import { sopToString, type BooleanFunction } from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * 2비트 플래시 ADC (임용 6번 정보과 형식) — 복합형(mixed_signal) 전용 archetype.
 *
 *  (가) 회로: 기준전압 V_top + 저항 사다리(N×R) → 기준전압 V_a<V_b<V_c
 *            → 3개 비교기 C_2·C_1·C_0 (V_in vs 각 tap, 온도계 코드)
 *            → 점선 인코더 박스 → 2비트 출력 Q_1(MSB)·Q_0.
 *  (나) 진리표: V_in 구간 vs C_2 C_1 C_0 (온도계) → Q_1 Q_0. 일부 셀 ㉠~㉣ 빈칸.
 *
 *  ★ 표준 2비트 플래시 ADC 인코딩 (온도계→2진, 고정):
 *    C₂C₁C₀=000→Q=00, 001→01, 011→10, 111→11. 나머지(010,100,101,110)=don't care.
 *    [단계1] ㉠~㉣ = 온도계 코드 채우기.
 *    [단계2] Q₁·Q₀ 최소 불함수 (don't care 활용, High=1):
 *            Q₁ = C₁,  Q₀ = C₂ + C₀·C₁'  (AND·OR·NOT 각 1개).
 *    [단계3] 점선 인코더에 논리회로 도시.
 *
 *  변형: V_top·R 값만 변경 (인코딩 구조는 표준 고정). GPT 없음.
 */

export type FlashAdc2bitGeneration = {
  circuitDiagram: FlashAdc2bitCircuitDiagram;
  truthTable: TruthTableDiagram;
  /** 빈칸 정답 ㉠~㉣. */
  blankAnswers: Array<{ symbol: string; answer: string }>;
  /** Q₁·Q₀ 최소 불함수 식. */
  q1Expr: string;
  q0Expr: string;
  /** 단계3 정답 — 인코더 논리회로 (solutionFigure). */
  encoderLogic: LogicNetworkDiagram;
  values: { Vtop: number; Rohm: number };
};

const BLANKS = ["㉠", "㉡", "㉢", "㉣"];
const VTOPS = [4, 5, 8, 10];
const ROHMS = [100, 200, 500, 1000];

// 온도계 코드 → 2비트. index = C2*4 + C1*2 + C0.
//   valid: 000→00, 001→01, 011→10, 111→11. 나머지 don't care.
const VALID = [
  { code: 0b000, q1: 0, q0: 0 },
  { code: 0b001, q1: 0, q0: 1 },
  { code: 0b011, q1: 1, q0: 0 },
  { code: 0b111, q1: 1, q0: 1 },
];

export function generateFlashAdc2bit(args: { seed?: number; mode?: GenerationMode }): FlashAdc2bitGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const Vtop = pick(VTOPS, rand);
  const Rohm = pick(ROHMS, rand);

  // ── 불 함수 최소화 (C2,C1,C0, don't care 포함) ──
  const validCodes = new Set(VALID.map((v) => v.code));
  const dontCares: number[] = [];
  for (let i = 0; i < 8; i++) if (!validCodes.has(i)) dontCares.push(i);
  const q1Min = VALID.filter((v) => v.q1 === 1).map((v) => v.code);
  const q0Min = VALID.filter((v) => v.q0 === 1).map((v) => v.code);
  const vars = ["C_2", "C_1", "C_0"];
  const mkFn = (m: number[]): BooleanFunction => ({ vars: 3, varNames: vars, minterms: m, dontCares });
  const q1Expr = sopToString(minimizeSop(mkFn(q1Min)), vars);
  const q0Expr = sopToString(minimizeSop(mkFn(q0Min)), vars);

  // ── (나) 진리표 (온도계 코드, 일부 빈칸) ──
  //   행: V_in 구간(높→낮), 열: C_2 C_1 C_0 | Q_1 Q_0.
  //   온도계: V_in>V_c → 111, V_b<≤V_c → 011, V_a<≤V_b → 001, ≤V_a → 000.
  const fmt = (b: number) => (b === 1 ? "High" : "Low");
  type Row = { cond: string; c2: number; c1: number; c0: number; q1: number; q0: number };
  const rows: Row[] = [
    { cond: `V_c < V_in < ${Vtop}[V]`, c2: 1, c1: 1, c0: 1, q1: 1, q0: 1 },
    { cond: "V_b < V_in ≤ V_c", c2: 0, c1: 1, c0: 1, q1: 1, q0: 0 },
    { cond: "V_a < V_in ≤ V_b", c2: 0, c1: 0, c0: 1, q1: 0, q0: 1 },
    { cond: "0 < V_in ≤ V_a", c2: 0, c1: 0, c0: 0, q1: 0, q0: 0 },
  ];
  // 빈칸: 2행의 C_1·C_0 (㉠㉡), 3행의 C_1·C_0 (㉢㉣) — 원본과 동일.
  const blankAnswers = [
    { symbol: BLANKS[0], answer: fmt(rows[1].c1) },
    { symbol: BLANKS[1], answer: fmt(rows[1].c0) },
    { symbol: BLANKS[2], answer: fmt(rows[2].c1) },
    { symbol: BLANKS[3], answer: fmt(rows[2].c0) },
  ];
  const cellC1Row2 = BLANKS[0], cellC0Row2 = BLANKS[1], cellC1Row3 = BLANKS[2], cellC0Row3 = BLANKS[3];
  const truthTable: TruthTableDiagram = {
    variables: ["V_in 입력조건"],
    inputGroups: [{ label: "입력", span: 3 }],
    outputLabels: ["C_2", "C_1", "C_0", "Q_1", "Q_0"],
    outputGroups: [{ label: "입력", span: 3 }, { label: "출력", span: 2 }],
    rows: [
      { inputs: [rows[0].cond], outputs: [fmt(rows[0].c2), fmt(rows[0].c1), fmt(rows[0].c0), rows[0].q1, rows[0].q0] },
      { inputs: [rows[1].cond], outputs: [fmt(rows[1].c2), cellC1Row2, cellC0Row2, rows[1].q1, rows[1].q0] },
      { inputs: [rows[2].cond], outputs: [fmt(rows[2].c2), cellC1Row3, cellC0Row3, rows[2].q1, rows[2].q0] },
      { inputs: [rows[3].cond], outputs: [fmt(rows[3].c2), fmt(rows[3].c1), fmt(rows[3].c0), rows[3].q1, rows[3].q0] },
    ],
  };

  // ── (다) 정답 인코더 논리회로 (Q₁=C₁ 직결, Q₀=C₂+C₀·C₁') ──
  // Q₁=C₁ 직결(게이트 없음, 텍스트로 명시). Q₀=C₂+C₀·C₁' = NOT·AND·OR 각 1개.
  const encoderLogic: LogicNetworkDiagram = {
    inputs: ["C_2", "C_1", "C_0"],
    outputs: ["Q_0"],
    gates: [
      { id: "NOT_C1", type: "NOT", inputs: ["C_1"], output: "C_1n" },
      { id: "AND0", type: "AND", inputs: ["C_0", "C_1n"], output: "t0" },
      { id: "OR0", type: "OR", inputs: ["C_2", "t0"], output: "Q_0" },
    ],
    signalLabels: { Q_0: "Q_0", C_1n: "C_1'" },
  };

  const circuitDiagram: FlashAdc2bitCircuitDiagram = {
    vtopLabel: `${Vtop}V`,
    rLabel: `${Rohm}Ω`,
    vinLabel: "V_in",
    refLabels: ["V_c", "V_b", "V_a"],
    compLabels: ["C_2", "C_1", "C_0"],
    outLabels: ["Q_1", "Q_0"],
  };

  return { circuitDiagram, truthTable, blankAnswers, q1Expr, q0Expr, encoderLogic, values: { Vtop, Rohm } };
}
