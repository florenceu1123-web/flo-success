import type { LogicNetworkDiagram, LogicGate } from "@/types";
import type { SopTerm } from "./booleanFunction";

// =====================================================================
// 사후 XOR/XNOR 패턴 검출 — SOP 합성 결과를 스캔해서 다음 구조를 단일 게이트로 교체.
//
//   F = AB' + A'B           → XOR(A, B)
//   F = AB + A'B'           → XNOR(A, B)
//
// 모든 digital 문제(FSM·카운터·K-map·조합논리)가 buildLogicNetwork* 를 거치므로
// 여기 1곳에서 패턴 매칭하면 일괄 적용.
// =====================================================================
function collapseXorPatterns(diagram: LogicNetworkDiagram): LogicNetworkDiagram {
  const gates = [...diagram.gates];
  const byOutput = new Map<string, LogicGate>();
  for (const g of gates) byOutput.set(g.output, g);

  // NOT 출력 → 원본 신호 매핑 (e.g., "A_n" → "A")
  const notInverse = new Map<string, string>();
  for (const g of gates) {
    if (g.type === "NOT" && g.inputs.length === 1) notInverse.set(g.output, g.inputs[0]);
  }
  const literalBase = (sig: string): { base: string; inv: boolean } =>
    notInverse.has(sig) ? { base: notInverse.get(sig)!, inv: true } : { base: sig, inv: false };

  // OR 게이트들에 대해 k-변수 XOR/XNOR 패턴 매칭.
  //   k 변수 XOR/XNOR을 SOP로 펼치면 2^(k-1)개의 minterm (k-literal AND) 을 OR로 묶는 형태.
  //   각 AND는 동일한 k개 변수를 모두 literal로 가지되 polarity 조합이 달라야 함.
  //   - XOR  : 모든 term의 inverted-literal 개수가 홀수 (odd parity, 2^(k-1)개 전부)
  //   - XNOR : 모든 term의 inverted-literal 개수가 짝수 (even parity, 2^(k-1)개 전부)
  //   k=2: 2 AND × 2 literal (예: F = AB' + A'B → XOR(A,B))
  //   k=3: 4 AND × 3 literal (예: F = A'B'C + A'BC' + AB'C' + ABC → XOR(A,B,C))
  type Repl = { orId: string; newType: "XOR" | "XNOR"; newInputs: string[]; obsoleteAnds: LogicGate[] };
  const replacements: Repl[] = [];

  for (const orGate of gates) {
    if (orGate.type !== "OR" || orGate.inputs.length < 2) continue;
    const ands = orGate.inputs.map((s) => byOutput.get(s));
    if (ands.some((g) => !g || g.type !== "AND")) continue;
    const literalsList = ands.map((and) => and!.inputs.map(literalBase));
    const k = literalsList[0].length;
    if (k < 2) continue;
    if (literalsList.some((lits) => lits.length !== k)) continue;
    if (literalsList.length !== Math.pow(2, k - 1)) continue;

    // 모든 AND가 같은 k개 변수 집합을 literal로 사용하는지
    const baseArr = [...new Set(literalsList[0].map((l) => l.base))].sort();
    if (baseArr.length !== k) continue;
    let sameVars = true;
    for (const lits of literalsList) {
      const s = new Set(lits.map((l) => l.base));
      if (s.size !== k || ![...s].every((b) => baseArr.includes(b))) {
        sameVars = false;
        break;
      }
    }
    if (!sameVars) continue;

    // 각 AND term의 polarity 벡터 (baseArr 순서)와 parity
    const polVectors: number[][] = literalsList.map((lits) => {
      const polByBase = new Map(lits.map((l) => [l.base, l.inv] as const));
      return baseArr.map((b) => (polByBase.get(b) ? 1 : 0));
    });
    const distinctVecs = new Set(polVectors.map((v) => v.join(""))).size === polVectors.length;
    if (!distinctVecs) continue;
    const parities = polVectors.map((v) => v.reduce<number>((a, b) => a ^ b, 0));
    const allOdd = parities.every((p) => p === 1);
    const allEven = parities.every((p) => p === 0);
    if (!allOdd && !allEven) continue;

    replacements.push({
      orId: orGate.id,
      newType: allOdd ? "XOR" : "XNOR",
      newInputs: baseArr,
      obsoleteAnds: ands as LogicGate[],
    });
  }

  if (replacements.length === 0) return diagram;

  // 다른 게이트가 동일 AND 출력을 공유하면 그 AND는 제거 금지 (orphan 방지).
  const signalUsageCount = new Map<string, number>();
  for (const g of gates) {
    for (const inp of g.inputs ?? []) signalUsageCount.set(inp, (signalUsageCount.get(inp) ?? 0) + 1);
  }
  const obsoleteIds = new Set<string>();
  for (const r of replacements) {
    for (const ag of r.obsoleteAnds) {
      if (signalUsageCount.get(ag.output) === 1) obsoleteIds.add(ag.id);
    }
  }

  const replByOrId = new Map<string, Repl>();
  for (const r of replacements) replByOrId.set(r.orId, r);

  const newGates: LogicGate[] = [];
  for (const g of gates) {
    if (obsoleteIds.has(g.id)) continue;
    const repl = replByOrId.get(g.id);
    if (repl) {
      newGates.push({ id: g.id, type: repl.newType, inputs: repl.newInputs, output: g.output });
    } else {
      newGates.push(g);
    }
  }

  // 더 이상 consumer가 없는 NOT 게이트 정리 (XOR 패턴이 NOT을 흡수했을 수 있음)
  const consumedAfter = new Set<string>(diagram.outputs);
  for (const g of newGates) for (const inp of g.inputs ?? []) consumedAfter.add(inp);
  const finalGates = newGates.filter((g) => g.type !== "NOT" || consumedAfter.has(g.output));

  return { ...diagram, gates: finalGates };
}

/**
 * 사후 partial XOR/XNOR 인수분해 — 공통 literal을 가진 두 AND term을 XOR/XNOR로 압축.
 *
 *   F = A'BC + AB'C   →   AND(C, XOR(A, B))         [2 AND + 1 OR → 1 XOR + 1 AND]
 *   F = ABC + A'B'C   →   AND(C, XNOR(A, B))
 *   F = A'BCD + AB'CD →   AND(C, D, XOR(A, B))      [common = {C, D}]
 *
 *   조건:
 *     - 2-input OR 게이트가 정확히 두 K-input AND를 입력으로 받음 (K ≥ 3)
 *     - 두 AND는 동일 변수 집합 사용
 *     - 정확히 2개 변수의 polarity만 다름 (나머지는 공통, factor-out 대상)
 *     - 공통 literal 중 inverted 가 있다면 해당 NOT 게이트가 이미 네트워크에 존재
 *
 *   순수 XOR/XNOR(k=K, 2^(K-1) AND 모두 존재) 케이스는 collapseXorPatterns가 먼저 처리.
 *   여기는 부분 패턴 — 게이트 수 감소가 명확한 경우에만 적용.
 */
function factorPartialXorPatterns(diagram: LogicNetworkDiagram): LogicNetworkDiagram {
  const gates = [...diagram.gates];
  const byOutput = new Map<string, LogicGate>();
  for (const g of gates) byOutput.set(g.output, g);

  const notInverse = new Map<string, string>();
  for (const g of gates) {
    if (g.type === "NOT" && g.inputs.length === 1) notInverse.set(g.output, g.inputs[0]);
  }
  const invSignal = new Map<string, string>();
  for (const [notOut, src] of notInverse) invSignal.set(src, notOut);
  const literalBase = (sig: string): { base: string; inv: boolean } =>
    notInverse.has(sig) ? { base: notInverse.get(sig)!, inv: true } : { base: sig, inv: false };

  type Repl = {
    orGate: LogicGate;
    newType: "XOR" | "XNOR";
    common: { base: string; inv: boolean }[];
    diff: [string, string];
    obsoleteAnds: LogicGate[];
  };
  const replacements: Repl[] = [];

  for (const orGate of gates) {
    if (orGate.type !== "OR" || orGate.inputs.length !== 2) continue;
    const and1 = byOutput.get(orGate.inputs[0]);
    const and2 = byOutput.get(orGate.inputs[1]);
    if (!and1 || !and2 || and1.type !== "AND" || and2.type !== "AND") continue;
    if (and1.inputs.length !== and2.inputs.length || and1.inputs.length < 3) continue;

    const lits1 = and1.inputs.map(literalBase);
    const lits2 = and2.inputs.map(literalBase);
    const map1 = new Map(lits1.map((l) => [l.base, l.inv] as const));
    const map2 = new Map(lits2.map((l) => [l.base, l.inv] as const));
    if (map1.size !== lits1.length || map2.size !== lits2.length) continue;
    if (map1.size !== map2.size) continue;
    let sameSet = true;
    for (const b of map1.keys()) if (!map2.has(b)) { sameSet = false; break; }
    if (!sameSet) continue;

    const common: { base: string; inv: boolean }[] = [];
    const diff: string[] = [];
    for (const [b, inv1] of map1) {
      const inv2 = map2.get(b)!;
      if (inv1 === inv2) common.push({ base: b, inv: inv1 });
      else diff.push(b);
    }
    if (diff.length !== 2) continue;

    const [X, Y] = diff;
    const polX1 = map1.get(X)!;
    const polY1 = map1.get(Y)!;
    const newType: "XOR" | "XNOR" = polX1 !== polY1 ? "XOR" : "XNOR";

    // inverted common literal은 기존 NOT 게이트가 있어야 안전하게 사용 가능
    let usableCommon = true;
    for (const c of common) {
      if (c.inv && !invSignal.has(c.base)) { usableCommon = false; break; }
    }
    if (!usableCommon) continue;

    replacements.push({ orGate, newType, common, diff: [X, Y], obsoleteAnds: [and1, and2] });
  }

  if (replacements.length === 0) return diagram;

  // AND·OR 출력이 다른 게이트에서도 쓰이면 obsolete 처리 금지
  const signalUsageCount = new Map<string, number>();
  for (const g of gates) {
    for (const inp of g.inputs ?? []) signalUsageCount.set(inp, (signalUsageCount.get(inp) ?? 0) + 1);
  }
  for (const o of diagram.outputs) signalUsageCount.set(o, (signalUsageCount.get(o) ?? 0) + 1);

  const obsoleteIds = new Set<string>();
  for (const r of replacements) {
    // 두 AND 모두 유일 consumer만 가지면 제거 가능
    for (const ag of r.obsoleteAnds) {
      if (signalUsageCount.get(ag.output) === 1) obsoleteIds.add(ag.id);
    }
    // OR은 항상 obsolete (output을 새 AND로 옮긴다)
    obsoleteIds.add(r.orGate.id);
  }

  const newGates: LogicGate[] = [];
  for (const g of gates) {
    if (obsoleteIds.has(g.id)) continue;
    newGates.push(g);
  }

  let idx = 0;
  for (const r of replacements) {
    const xorOut = `xor_factored_${r.orGate.output}_${idx++}`;
    newGates.push({
      id: `G_xor_factored_${r.orGate.output}`,
      type: r.newType,
      inputs: r.diff,
      output: xorOut,
    });
    const andInputs: string[] = r.common.map((c) => (c.inv ? invSignal.get(c.base)! : c.base));
    andInputs.push(xorOut);
    newGates.push({
      id: `G_and_factored_${r.orGate.output}`,
      type: "AND",
      inputs: andInputs,
      output: r.orGate.output,
    });
  }

  // 더 이상 consumer 없는 NOT 정리
  const consumedAfter = new Set<string>(diagram.outputs);
  for (const g of newGates) for (const inp of g.inputs ?? []) consumedAfter.add(inp);
  const finalGates = newGates.filter((g) => g.type !== "NOT" || consumedAfter.has(g.output));

  return { ...diagram, gates: finalGates };
}

/** XOR/XNOR 압축 두 단계 일괄 적용 (k-var 패턴 → partial 인수분해). */
function applyXorReductions(d: LogicNetworkDiagram): LogicNetworkDiagram {
  return factorPartialXorPatterns(collapseXorPatterns(d));
}

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

  return applyXorReductions({
    inputs: [...varNames],
    outputs: [outputName],
    gates,
  });
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

  return applyXorReductions({ inputs: finalInputs, outputs, gates });
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

  return applyXorReductions({ inputs: [...varNames], outputs: [outputName], gates });
}
