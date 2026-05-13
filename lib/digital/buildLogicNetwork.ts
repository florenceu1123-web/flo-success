import type { LogicNetworkDiagram, LogicGate } from "@/types";
import type { SopTerm } from "./booleanFunction";

/**
 * SOP → LogicNetworkDiagram 변환.
 *
 *  각 SOP term을 AND 게이트로 합성하고, 모든 term을 OR 게이트로 묶어 출력.
 *  Complemented literal (pattern "0")은 NOT 게이트를 거쳐 신호 생성.
 *
 *  signal 명명:
 *   - 입력: varNames[i] (예: "A", "B")
 *   - NOT 출력: "A_n", "B_n" 등
 *   - AND 출력: "and1", "and2" 등
 *   - OR 출력: outputName (보통 "F")
 *
 *  단일 변수 SOP (예: F=A 또는 F=A')는 게이트 없이 inputs→outputs 직결할 수도 있으나,
 *  명시적으로 NOT/buffer를 표현하기 위해 항상 게이트 사용.
 *
 *  특수 케이스:
 *   - SOP가 비어 있음 (F=0): inputs만 있는 빈 네트워크.
 *   - SOP가 한 term이고 모든 X (F=1): 마찬가지.
 */
export function buildLogicNetwork(args: {
  sop: SopTerm[];
  varNames: string[];
  outputName: string;
}): LogicNetworkDiagram {
  const { sop, varNames, outputName } = args;
  const gates: LogicGate[] = [];

  if (sop.length === 0) {
    return {
      inputs: [...varNames],
      outputs: [outputName],
      gates: [],
    };
  }

  // 1) 각 변수에 대해 NOT이 필요한지 확인 (어느 term이든 pattern[i]="0"인 경우)
  const needsNot = new Set<string>();
  for (const term of sop) {
    for (let i = 0; i < term.pattern.length; i++) {
      if (term.pattern[i] === "0") needsNot.add(varNames[i]);
    }
  }

  // 2) NOT 게이트 생성 ("A_n" 등)
  let gateIdx = 1;
  const notSignal = new Map<string, string>();
  for (const v of varNames) {
    if (needsNot.has(v)) {
      const notOut = `${v}_n`;
      gates.push({
        id: `G_not_${v}`,
        type: "NOT",
        inputs: [v],
        output: notOut,
      });
      notSignal.set(v, notOut);
    }
  }

  // 3) 각 SOP term을 AND 게이트로 합성
  const termOutputs: string[] = [];
  for (const term of sop) {
    // term의 literal 모으기
    const literalSignals: string[] = [];
    for (let i = 0; i < term.pattern.length; i++) {
      if (term.pattern[i] === "X") continue;
      if (term.pattern[i] === "1") {
        literalSignals.push(varNames[i]);
      } else {
        // "0"
        literalSignals.push(notSignal.get(varNames[i])!);
      }
    }

    if (literalSignals.length === 0) {
      // tautology — 이 term은 항상 1. SOP 전체가 1이므로 더 이상 처리 불필요.
      // 출력 = 1 (constant). 표현 단순화: AND 게이트 없이 outputs 비움.
      return {
        inputs: [...varNames],
        outputs: [outputName],
        gates: [],   // tautology — 외부 처리 필요
      };
    }

    if (literalSignals.length === 1) {
      // 단일 literal — buffer 역할. 이미 NOT 처리됐을 가능성 → 그대로 OR 입력으로.
      termOutputs.push(literalSignals[0]);
    } else {
      const out = `and${gateIdx++}`;
      gates.push({
        id: `G_and_${gateIdx}`,
        type: "AND",
        inputs: literalSignals,
        output: out,
      });
      termOutputs.push(out);
    }
  }

  // 4) 모든 term을 OR — 결과는 outputName
  if (termOutputs.length === 1) {
    // 단일 term — buffer (1-input OR) 게이트로 outputName 노출. NOT 게이트 rename 금지
    // (단일 출력이라 안전하지만, 다중 출력 함수와 일관성 유지 + 변수 직접 케이스 대응).
    gates.push({
      id: `G_buf_${outputName}`,
      type: "OR",
      inputs: [termOutputs[0]],
      output: outputName,
    });
  } else {
    gates.push({
      id: `G_or_${gateIdx}`,
      type: "OR",
      inputs: termOutputs,
      output: outputName,
    });
  }

  return {
    inputs: [...varNames],
    outputs: [outputName],
    gates,
  };
}

/**
 * 다중 출력 SOP → 단일 LogicNetworkDiagram (NOT 게이트 공유).
 *
 *  여러 함수 D1, D0가 같은 입력 변수(Q1, Q0)를 쓸 때 통합 회로로 합성.
 *  NOT 게이트는 공유 (한 번만 생성).
 */
export function buildLogicNetworkMulti(args: {
  sops: Array<{ sop: SopTerm[]; outputName: string }>;
  varNames: string[];
}): LogicNetworkDiagram {
  const { sops, varNames } = args;
  const gates: LogicGate[] = [];

  // NOT 게이트가 필요한 변수 추출 (모든 SOP 통틀어서)
  const needsNot = new Set<string>();
  for (const { sop } of sops) {
    for (const term of sop) {
      for (let i = 0; i < term.pattern.length; i++) {
        if (term.pattern[i] === "0") needsNot.add(varNames[i]);
      }
    }
  }
  let gateIdx = 1;
  const notSignal = new Map<string, string>();
  for (const v of varNames) {
    if (needsNot.has(v)) {
      const notOut = `${v}_n`;
      gates.push({ id: `G_not_${v}`, type: "NOT", inputs: [v], output: notOut });
      notSignal.set(v, notOut);
    }
  }

  const outputs: string[] = [];
  // 상수 입력 필요 — tautology(constant 1) 또는 empty SOP(constant 0)
  let needsConstant0 = false;
  let needsConstant1 = false;

  for (const { sop, outputName } of sops) {
    outputs.push(outputName);

    if (sop.length === 0) {
      // F = 0: "0" 상수 입력에 연결한 buffer 게이트
      needsConstant0 = true;
      gates.push({ id: `G_buf_${outputName}`, type: "OR", inputs: ["0"], output: outputName });
      continue;
    }

    // tautology 검사 — 어떤 term이라도 모든 자리 X면 SOP=1
    const hasTautology = sop.some((t) => Array.from(t.pattern).every((ch) => ch === "X"));
    if (hasTautology) {
      needsConstant1 = true;
      gates.push({ id: `G_buf_${outputName}`, type: "OR", inputs: ["1"], output: outputName });
      continue;
    }

    // 각 SOP term → AND 게이트
    const termOutputs: string[] = [];
    for (const term of sop) {
      const literalSignals: string[] = [];
      for (let i = 0; i < term.pattern.length; i++) {
        if (term.pattern[i] === "X") continue;
        if (term.pattern[i] === "1") literalSignals.push(varNames[i]);
        else literalSignals.push(notSignal.get(varNames[i])!);
      }
      if (literalSignals.length === 0) continue;   // 안전망 (tautology 분기에서 이미 처리)
      if (literalSignals.length === 1) {
        termOutputs.push(literalSignals[0]);
      } else {
        const out = `and_${outputName}_${gateIdx++}`;
        gates.push({ id: `G_and_${outputName}_${gateIdx}`, type: "AND", inputs: literalSignals, output: out });
        termOutputs.push(out);
      }
    }

    if (termOutputs.length === 1) {
      gates.push({ id: `G_buf_${outputName}`, type: "OR", inputs: [termOutputs[0]], output: outputName });
    } else if (termOutputs.length > 1) {
      gates.push({ id: `G_or_${outputName}_${gateIdx++}`, type: "OR", inputs: termOutputs, output: outputName });
    }
  }

  const finalInputs = [...varNames];
  if (needsConstant1) finalInputs.push("1");
  if (needsConstant0) finalInputs.push("0");

  return { inputs: finalInputs, outputs, gates };
}

/**
 * POS → LogicNetworkDiagram 변환. OR-AND 구조 (SOP의 AND-OR dual).
 *
 *  각 POS term을 OR 게이트로 합성, 모든 term을 AND 게이트로 묶어 출력.
 *  pattern 해석: "1"=직접 literal, "0"=반전 literal, "X"=없음.
 *  (sopTermToString과 동일 convention. NOT 게이트로 보수 신호 처리.)
 */
export function buildLogicNetworkPos(args: {
  pos: SopTerm[];
  varNames: string[];
  outputName: string;
}): LogicNetworkDiagram {
  const { pos, varNames, outputName } = args;
  const gates: LogicGate[] = [];

  if (pos.length === 0) {
    return { inputs: [...varNames], outputs: [outputName], gates: [] };   // F = 1
  }

  // NOT 게이트가 필요한 변수 추출
  const needsNot = new Set<string>();
  for (const term of pos) {
    for (let i = 0; i < term.pattern.length; i++) {
      if (term.pattern[i] === "0") needsNot.add(varNames[i]);
    }
  }
  let gateIdx = 1;
  const notSignal = new Map<string, string>();
  for (const v of varNames) {
    if (needsNot.has(v)) {
      const notOut = `${v}_n`;
      gates.push({ id: `G_not_${v}`, type: "NOT", inputs: [v], output: notOut });
      notSignal.set(v, notOut);
    }
  }

  // 각 POS term → OR 게이트
  const termOutputs: string[] = [];
  for (const term of pos) {
    const literalSignals: string[] = [];
    for (let i = 0; i < term.pattern.length; i++) {
      if (term.pattern[i] === "X") continue;
      if (term.pattern[i] === "1") literalSignals.push(varNames[i]);
      else literalSignals.push(notSignal.get(varNames[i])!);
    }
    if (literalSignals.length === 0) {
      // 항상 1인 sum term — POS 전체에서 이 항은 무시 (1·X = X), term 생략
      continue;
    }
    if (literalSignals.length === 1) {
      termOutputs.push(literalSignals[0]);
    } else {
      const out = `or${gateIdx++}`;
      gates.push({ id: `G_or_${gateIdx}`, type: "OR", inputs: literalSignals, output: out });
      termOutputs.push(out);
    }
  }

  // 모든 term을 AND로 결합
  if (termOutputs.length === 1) {
    // 단일 sum term — buffer 게이트로 노출 (NOT rename 금지, OR 게이트 공유될 수 있음)
    gates.push({ id: `G_buf_${outputName}`, type: "AND", inputs: [termOutputs[0]], output: outputName });
  } else {
    gates.push({ id: `G_and_${gateIdx}`, type: "AND", inputs: termOutputs, output: outputName });
  }

  return { inputs: [...varNames], outputs: [outputName], gates };
}
