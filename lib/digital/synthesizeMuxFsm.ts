import type { LogicBlank, LogicGate, LogicNetworkDiagram } from "@/types";
import type { SopTerm } from "./booleanFunction";
import { buildLogicNetworkMulti } from "./buildLogicNetwork";

/**
 * FSM 조합부를 2×1 MUX 기반으로 합성한다 (D1, D0). Z는 일반 SOP.
 *
 * 원본 임용 출제 형식 (그림 8):
 *  - D_A, D_B 각각이 2×1 MUX 하나로 결정됨.
 *  - 학생은 MUX 입력 핀 ㄱ/ㄴ/ㄷ/ㄹ에 들어갈 신호를 구해야 한다.
 *
 * 알고리즘:
 *  - D1, D0의 8-entry truth table (Q1, Q0, X) 생성.
 *  - 각 D 출력에 대해 (S ∈ {Q1, Q0, X}, I0 ∈ Cand, I1 ∈ Cand) 조합 brute force.
 *    Cand = {Q1, Q0, X, Q1', Q0', X', 0, 1}.
 *  - 진리표를 만족하는 첫 form 채택. 못 찾으면 fallback (해당 D만 SOP로).
 *
 * 결과 LogicNetworkDiagram:
 *  - inputs: [Q1, Q0, X] (조합부 단독 — DFF wrap은 호출자가 수행)
 *  - gates: NOT (필요 신호만), MUX (D1, D0 성공한 경우), 그리고 Z의 SOP 게이트
 *  - outputs: [D1, D0, Z]
 *  - blanks: 4개 (ㄱ, ㄴ, ㄷ, ㄹ) — D1/D0 MUX 입력 핀에 부착
 */

export type MuxFsmSynthesis = {
  diagram: LogicNetworkDiagram;
  /** MUX 합성에 성공한 출력별 form. fallback 시 해당 entry는 null. */
  muxForms: Record<"D1" | "D0", { S: string; I0: string; I1: string } | null>;
};

const VAR_NAMES = ["Q1", "Q0", "X"] as const;
export const MUX_SELECT_CANDIDATES = ["Q1", "Q0", "X"] as const;
export const MUX_INPUT_CANDIDATES = ["Q1", "Q0", "X", "Q1_n", "Q0_n", "X_n", "0", "1"] as const;
const SELECT_CANDIDATES = MUX_SELECT_CANDIDATES;
const INPUT_CANDIDATES = MUX_INPUT_CANDIDATES;

/** minterm 인덱스 i (bit2=Q1, bit1=Q0, bit0=X)에서 signal 값 평가 */
export function evalMuxSignal(sig: string, i: number): number {
  const Q1 = (i >> 2) & 1;
  const Q0 = (i >> 1) & 1;
  const X = i & 1;
  switch (sig) {
    case "Q1": return Q1;
    case "Q0": return Q0;
    case "X": return X;
    case "Q1_n": return 1 - Q1;
    case "Q0_n": return 1 - Q0;
    case "X_n": return 1 - X;
    case "0": return 0;
    case "1": return 1;
    default: throw new Error(`Unknown signal in MUX synthesis: ${sig}`);
  }
}

/** minterm 리스트 → 8-entry truth table */
function termsToTruth(minterms: number[]): number[] {
  const t = Array<number>(8).fill(0);
  for (const m of minterms) t[m] = 1;
  return t;
}

/**
 * 8-entry truth table을 만족하는 (S, I0, I1) brute force.
 *  - 사소한 form 우선 순위: S에 ¬-form 제외, I0=I1 같은 trivial form은 후순위로.
 *  - 가능한 form이 없으면 null.
 */
function findMuxForm(truth: number[]): { S: string; I0: string; I1: string } | null {
  // priority: trivial(I0==I1) 마지막, 그 외 순서대로
  const candidates: Array<{ S: string; I0: string; I1: string; priority: number }> = [];
  for (const S of SELECT_CANDIDATES) {
    for (const I0 of INPUT_CANDIDATES) {
      for (const I1 of INPUT_CANDIDATES) {
        let ok = true;
        for (let i = 0; i < 8; i++) {
          const sel = evalMuxSignal(S, i);
          const expected = truth[i];
          const got = sel === 0 ? evalMuxSignal(I0, i) : evalMuxSignal(I1, i);
          if (got !== expected) { ok = false; break; }
        }
        if (!ok) continue;
        // trivial cases — I0=I1 (S에 의존 안 함) 또는 둘 다 상수 → 후순위
        const trivial =
          I0 === I1 ||
          (["0", "1"].includes(I0) && ["0", "1"].includes(I1));
        candidates.push({ S, I0, I1, priority: trivial ? 1 : 0 });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.priority - b.priority);
  return { S: candidates[0].S, I0: candidates[0].I0, I1: candidates[0].I1 };
}

/** signal name → 사람이 읽는 답 표기 (예: Q1_n → "Q1'", "0"/"1" 그대로) */
function answerLabel(sig: string): string {
  if (sig.endsWith("_n")) return `${sig.slice(0, -2)}'`;
  return sig;
}

const BLANK_SYMBOLS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ"] as const;

export function synthesizeMuxFsmCombinational(args: {
  d1Minterms: number[];
  d0Minterms: number[];
  d1Sop: SopTerm[];
  d0Sop: SopTerm[];
  zSop: SopTerm[];
}): MuxFsmSynthesis {
  const d1Truth = termsToTruth(args.d1Minterms);
  const d0Truth = termsToTruth(args.d0Minterms);

  const d1Form = findMuxForm(d1Truth);
  const d0Form = findMuxForm(d0Truth);

  // 사용되는 보수 신호 수집 — NOT 게이트로 한 번만 생성
  const neededComplements = new Set<string>();
  for (const form of [d1Form, d0Form]) {
    if (!form) continue;
    for (const sig of [form.S, form.I0, form.I1]) {
      if (sig.endsWith("_n")) neededComplements.add(sig.slice(0, -2));
    }
  }
  // Z의 SOP가 보수를 쓰는지도 buildLogicNetworkMulti가 자체 처리하므로 여기는 D 쪽만.

  const gates: LogicGate[] = [];
  // 1) NOT gates (보수 신호)
  for (const v of neededComplements) {
    gates.push({ id: `G_not_${v}`, type: "NOT", inputs: [v], output: `${v}_n` });
  }

  // 2) MUX gates — D1, D0
  const blanks: LogicBlank[] = [];
  let blankCursor = 0;
  for (const [outputName, form] of [["D1", d1Form], ["D0", d0Form]] as const) {
    if (!form) continue; // fallback path (별도 SOP 합성)
    const muxId = `G_mux_${outputName}`;
    gates.push({
      id: muxId,
      type: "MUX",
      // 입력 순서: I0, I1, S — renderer가 이 순서 기준으로 핀 배치
      inputs: [form.I0, form.I1, form.S],
      output: outputName,
    });
    // I0(pinIndex 0), I1(pinIndex 1)을 각각 빈칸으로 — S는 학생에게 보임
    blanks.push({
      symbol: BLANK_SYMBOLS[blankCursor++],
      gateIds: [muxId],
      answer: answerLabel(form.I0),
      pinIndex: 0,
    });
    blanks.push({
      symbol: BLANK_SYMBOLS[blankCursor++],
      gateIds: [muxId],
      answer: answerLabel(form.I1),
      pinIndex: 1,
    });
  }

  // 3) D 쪽 fallback (MUX form 미발견) — buildLogicNetworkMulti로 일반 SOP 합성.
  //    Z와 같이 호출해 NOT 공유 + 상수 처리도 한 번에 처리.
  const fallbackSops: Array<{ sop: SopTerm[]; outputName: string }> = [];
  if (!d1Form) fallbackSops.push({ sop: args.d1Sop, outputName: "D1" });
  if (!d0Form) fallbackSops.push({ sop: args.d0Sop, outputName: "D0" });

  // 4) Z + fallback D 합성 — 기존 multi 빌더 활용
  const zNetwork = buildLogicNetworkMulti({
    sops: [...fallbackSops, { sop: args.zSop, outputName: "Z" }],
    varNames: [...VAR_NAMES],
  });

  // Z 합성이 자체적으로 NOT(Q1), NOT(Q0), NOT(X) 게이트를 만들었을 수 있다.
  // 우리가 이미 추가한 NOT과 중복되지 않도록 merge.
  const existingNotOutputs = new Set(gates.filter((g) => g.type === "NOT").map((g) => g.output));
  const mergedGates: LogicGate[] = [...gates];
  for (const g of zNetwork.gates) {
    if (g.type === "NOT" && existingNotOutputs.has(g.output)) continue; // 중복 NOT 제외
    mergedGates.push(g);
  }

  // MUX form 또는 Z 회로가 상수 0/1 신호를 input으로 쓰는지 확인
  const muxUsesConst0 = [d1Form, d0Form].some(
    (f) => f != null && (f.I0 === "0" || f.I1 === "0"),
  );
  const muxUsesConst1 = [d1Form, d0Form].some(
    (f) => f != null && (f.I0 === "1" || f.I1 === "1"),
  );
  const zInputs = zNetwork.inputs;
  const zUsesConst0 = zInputs.includes("0");
  const zUsesConst1 = zInputs.includes("1");

  const inputs: string[] = [...VAR_NAMES];
  if (muxUsesConst1 || zUsesConst1) inputs.push("1");
  if (muxUsesConst0 || zUsesConst0) inputs.push("0");
  const outputs = ["D1", "D0", "Z"];

  return {
    diagram: {
      inputs,
      outputs,
      gates: mergedGates,
      blanks,
    },
    muxForms: { D1: d1Form, D0: d0Form },
  };
}
