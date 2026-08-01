import type {
  ConceptDiagram,
  DffStateDesignCircuitDiagram,
  GenerationMode,
  TruthTableDiagram,
} from "@/types";
import { sopToString, type BooleanFunction } from "@/lib/digital/booleanFunction";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand } from "./_helpers";

/**
 * D 플립플롭 2개 상태도 순차회로 설계 (임용 9번 정보과) — 전용 archetype.
 *
 *  원본: (가) 입력 없는 2-bit 자율 상태도(예 00→01→10→10(자기루프), 11→01) →
 *        (나) 상태표(현재상태 Q_A·Q_B | 다음상태 | D_A·D_B 입력, ㉠~㉣·①~④ 빈칸) →
 *        (다) D-FF 2개 + 논리 게이트(㉮·㉯) 구현.
 *  D 플립플롭은 D = 다음상태 (여기표 불필요). D_A·D_B를 Q_A·Q_B의 함수로 최소화 → 게이트.
 *
 *  ★ generic fsm(Mealy 입력/출력)·sequential_dff_generic(입력파형)은 이 "상태도→D입력→게이트"
 *    형식을 잃음 → 전용 결정론 archetype.
 *
 *  ★ 일반화(2026-06-24): 기존 CYCLE_POOL은 해밀턴 4-cycle(업/다운 카운터)만 표현 가능해
 *    원본처럼 자기루프·합류가 있는 비-해밀턴 자율 상태기계를 만들지 못했다. D-FF는 D=다음상태이므로
 *    "next-state의 두 비트(D_A·D_B)가 각각 (Q_A,Q_B)의 단일 게이트로 떨어지는" 모든 함수가 이 유형의
 *    유효 문제다. 이는 곧 2입력 게이트 6종의 쌍으로 전수 열거된다(특정 예시 hardcode 없음). 각 쌍이
 *    하나의 자율 상태기계(자기루프·합류·순환 자연 포함)를 결정한다. 원본 (XOR,XNOR)은 생성 풀 제외.
 */

type Bit = 0 | 1;
const BLANK_NEXT = ["㉠", "㉡", "㉢", "㉣"];   // (나) 다음상태 빈칸
const GATE_SYMS = ["㉮", "㉯"];                  // (다) 게이트 빈칸

type FfType = "D" | "T";

export type DffStateDesignGeneration = {
  transitions: string[];              // ["00→01","01→10",...] 전이 목록 (전 상태)
  nextOf: number[];                   // nextOf[s]
  ffAType: FfType; ffBType: FfType;   // 플립플롭 종류 (similar=D·D, variant=D·T)
  inputAName: string; inputBName: string; // 입력 라벨 ("D_A" / "D_B"|"T_B")
  dAExpr: string; dBExpr: string;     // ㉮·㉯가 구현하는 함수의 최소 SOP
  dAGate: string; dBGate: string;     // ㉮·㉯ 게이트 종류명
  nextAnswers: Array<{ symbol: string; answer: string }>; // ㉠~㉣ (다음상태)
  ffInputAnswers: Array<{ state: string; value: number }>; // FF_B 입력(여기표) 행별 값
  gateAnswers: Array<{ symbol: string; answer: string }>; // ㉮·㉯ (게이트)
  stateDiagram: ConceptDiagram;       // (가)
  stateTable: TruthTableDiagram;      // (나)
  circuitDiagram: DffStateDesignCircuitDiagram; // (다)
};

/** 2입력 게이트 — spec = [f(00), f(01), f(10), f(11)] (Q_A·Q_B 순). gateName 맵과 일치. */
type GateDef = { name: string; spec: Bit[] };
const TWO_INPUT_GATES: GateDef[] = [
  { name: "AND",  spec: [0, 0, 0, 1] },
  { name: "OR",   spec: [0, 1, 1, 1] },
  { name: "NAND", spec: [1, 1, 1, 0] },
  { name: "NOR",  spec: [1, 0, 0, 0] },
  { name: "XOR",  spec: [0, 1, 1, 0] },
  { name: "XNOR", spec: [1, 0, 0, 1] },
];
// 원본 임용 9번: D_A=XOR, D_B=XNOR → 참조 전용, 생성 풀에서 제외.
const ORIGINAL_A = "XOR";
const ORIGINAL_B = "XNOR";

const stateLabel = (s: number): string => `${(s >> 1) & 1}${s & 1}`;

/** 4-bit spec(f(00),f(01),f(10),f(11)) → 단일 게이트 종류명. */
function gateName(spec: Bit[]): string {
  const key = spec.join("");
  const map: Record<string, string> = {
    "0001": "AND", "0111": "OR", "0110": "XOR", "1001": "XNOR",
    "1110": "NAND", "1000": "NOR",
    "0011": "버퍼(Q_A)", "0101": "버퍼(Q_B)", "1100": "NOT(Q_A)", "1010": "NOT(Q_B)",
    "0000": "0(상수)", "1111": "1(상수)",
  };
  return map[key] ?? "복합";
}

/** 2변수(Q_A,Q_B) 최소 SOP. */
function sopExpr(spec: Bit[]): string {
  const minterms: number[] = [];
  for (let s = 0; s < 4; s++) if (spec[s] === 1) minterms.push(s);
  const fn: BooleanFunction = { vars: 2, varNames: ["Q_A", "Q_B"], minterms, dontCares: [] };
  const sop = sopToString(minimizeSop(fn), ["Q_A", "Q_B"]);
  return sop || "0";
}

/**
 * 게이트 쌍 → 자율 상태기계 전체.
 *  FF_A는 항상 D-FF: ㉮ = D_A = gateA.spec, nextA = D_A.
 *  FF_B는 ffBType:
 *    "D" (exam_similar): ㉯ = D_B = gateB.spec, nextB = D_B.
 *    "T" (exam_variant): ㉯ = T_B = gateB.spec (여기), nextB = Q_B ⊕ T_B  (T-FF: Q(t+1)=Q⊕T).
 *  nextOf[s] = (nextA(s) << 1) | nextB(s). 상태도는 4노드 전부 + 각 노드 1엣지(자기루프·합류 자연 포함).
 */
function solve(gateA: GateDef, gateB: GateDef, ffBType: FfType): DffStateDesignGeneration {
  const dASpec = gateA.spec;        // FF_A(D-FF) 입력 = next Q_A
  const bInputSpec = gateB.spec;    // FF_B 입력(㉯)이 구현하는 함수 (D_B 또는 T_B)
  const nextA: Bit[] = dASpec;
  // T-FF: Q_B(t+1) = Q_B ⊕ T_B  →  nextB = (s&1) ⊕ T_B.  D-FF: nextB = D_B.
  const nextB: Bit[] = [0, 1, 2, 3].map((s) =>
    (ffBType === "T" ? ((s & 1) ^ bInputSpec[s]) : bInputSpec[s]) as Bit,
  );
  const nextOf: number[] = [0, 1, 2, 3].map((s) => (nextA[s] << 1) | nextB[s]);

  const ffAType: FfType = "D";
  const inputAName = "D_A";
  const inputBName = ffBType === "T" ? "T_B" : "D_B";

  const dAExpr = sopExpr(dASpec), dBExpr = sopExpr(bInputSpec);
  const dAGate = gateName(dASpec), dBGate = gateName(bInputSpec);

  const transitions = [0, 1, 2, 3].map((s) => `${stateLabel(s)}→${stateLabel(nextOf[s])}`);

  // (가) 상태도 — 입력 없는 자율 그래프. 4노드 전부, 각 노드 1개 출력엣지.
  const stateDiagram: ConceptDiagram = {
    nodes: [0, 1, 2, 3].map((s) => ({ id: `s${s}`, label: stateLabel(s) })),
    edges: [0, 1, 2, 3].map((s) => ({ from: `s${s}`, to: `s${nextOf[s]}` })),
  };

  // (나) 상태표 — 현재상태 | 다음상태(㉠~㉣) | 플립플롭 입력(D_A · D_B|T_B). 표는 00,01,10,11 순.
  const rowsOrder = [0, 1, 2, 3];
  const nextAnswers: Array<{ symbol: string; answer: string }> = rowsOrder.map((s, i) => ({
    symbol: BLANK_NEXT[i],
    answer: stateLabel(nextOf[s]),
  }));
  // FF_B 입력값(행별): D-FF이면 nextB, T-FF이면 Q_B ⊕ nextB(=여기표) = bInputSpec.
  const ffBInputVal = (s: number): number =>
    ffBType === "T" ? ((s & 1) ^ (nextOf[s] & 1)) : (nextOf[s] & 1);
  const ffInputAnswers = rowsOrder.map((s) => ({ state: stateLabel(s), value: ffBInputVal(s) }));
  const stateTable: TruthTableDiagram = {
    variables: ["Q_A", "Q_B"],
    inputGroups: [{ label: "현재 상태", span: 2 }],
    outputLabels: ["Q_A(t+1)", "Q_B(t+1)", inputAName, inputBName],
    outputGroups: [
      { label: "다음 상태", span: 2 },
      { label: "플립플롭 입력", span: 2 },
    ],
    rows: rowsOrder.map((s) => ({
      inputs: [(s >> 1) & 1, s & 1],
      outputs: [(nextOf[s] >> 1) & 1, nextOf[s] & 1, (nextOf[s] >> 1) & 1, ffBInputVal(s)],
    })),
  };

  // (다) 구현 회로 — 게이트 ㉮(D_A)·㉯(D_B|T_B), 입력 Q_A·Q_B. FF_A=D, FF_B=ffBType.
  const circuitDiagram: DffStateDesignCircuitDiagram = {
    gateASym: GATE_SYMS[0],
    gateBSym: GATE_SYMS[1],
    gateAInputs: ["Q_A", "Q_B"],
    gateBInputs: ["Q_A", "Q_B"],
    ffAType, ffBType,
    ffAInputName: inputAName,
    ffBInputName: inputBName,
  };

  const gateAnswers = [
    { symbol: GATE_SYMS[0], answer: `${inputAName} = ${dAExpr} (${dAGate})` },
    { symbol: GATE_SYMS[1], answer: `${inputBName} = ${dBExpr} (${dBGate})` },
  ];

  return {
    transitions, nextOf, ffAType, ffBType, inputAName, inputBName,
    dAExpr, dBExpr, dAGate, dBGate,
    nextAnswers, ffInputAnswers, gateAnswers, stateDiagram, stateTable, circuitDiagram,
  };
}

/**
 * 게이트 쌍 풀 — 2입력 게이트 6종의 전수 조합.
 *  exam_similar (D-FF + D-FF): a=D_A, b=D_B. 서로 다른 두 게이트(원본 XOR≠XNOR 처럼)·원본(XOR,XNOR) 제외 → 6×5−1 = 29
 *  exam_variant (D-FF + T-FF): a=D_A, b=T_B. 전 조합(같은 게이트 허용) → 6×6 = 36. FF 종류가 원본(D·D)과 달라 원본 충돌 없음.
 */
function buildGatePairPool(mode: GenerationMode): Array<[GateDef, GateDef]> {
  const pairs: Array<[GateDef, GateDef]> = [];
  for (const a of TWO_INPUT_GATES) {
    for (const b of TWO_INPUT_GATES) {
      if (mode === "exam_similar") {
        if (a.name === ORIGINAL_A && b.name === ORIGINAL_B) continue; // 원본 제외 (D·D)
        if (a.name === b.name) continue;                             // 유사: 서로 다른 두 게이트
      }
      pairs.push([a, b]);
    }
  }
  return pairs;
}

export function generateDffStateDesign(args: {
  seed?: number;
  mode: GenerationMode;
  index?: number;
}): DffStateDesignGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 5; i++) rand();
  const pool = buildGatePairPool(args.mode);
  const ffBType: FfType = args.mode === "exam_variant" ? "T" : "D"; // 변형은 FF_B = T 플립플롭
  // seed로 시작 오프셋 결정 + index로 count개 distinct 보장(count ≤ pool.length).
  const offset = Math.floor(rand() * pool.length);
  const idx = (offset + (args.index ?? 0)) % pool.length;
  const [a, b] = pool[idx];
  return solve(a, b, ffBType);
}
