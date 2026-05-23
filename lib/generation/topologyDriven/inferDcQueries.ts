import type { AnalysisResult, CircuitNetlist } from "@/types";
import type { DcQuery } from "@/lib/solver/universalDc";

/**
 * AnalysisResult (특히 conditions·question)에서 query 구조 추출.
 *
 *  지원 패턴:
 *    - "V_1, V_3 ... 구하시오" → nodeVoltage queries
 *    - "전체 저항이 소비하는 전력" / "소비 전력" → totalPower
 *    - "V_x = N V 되도록 R 조정" → inverseR query
 *
 *  ★ node label resolution은 별도 함수(resolveQueryNodes)에서 수행 — 여기선
 *    "__label:V_1" 같은 placeholder만 부여.
 */
export function inferDcQueries(analysis: AnalysisResult): DcQuery[] {
  const condText = (analysis.fillInTheBlanks ?? [])
    .map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`)
    .join(" ");
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    condText,
  ].join(" ");

  const queries: DcQuery[] = [];

  // 1) node voltage queries — V_숫자 또는 V_o, V_x 패턴
  const vMatches = Array.from(text.matchAll(/V[_]?(\d+|o|x|a|b|c)/gi));
  const seen = new Set<string>();
  for (const m of vMatches) {
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `V_${m[1]}`;
    queries.push({ kind: "nodeVoltage", node: `__label:${label}`, label });
  }

  // 2) total power
  if (
    /전체.*소비.*전력|전체.*전력.*소비|총.*전력|총.*소비|소비.*전력.*총|소비.*전력.*합/.test(text)
  ) {
    queries.push({ kind: "totalPower", label: "P_total" });
  }

  // 3) inverse R — "V_x = N V 되도록 R" 패턴
  const inverseMatch = text.match(
    /V[_]?(\d+|o|x|a|b|c)\s*=\s*(\d+(?:\.\d+)?)\s*\[?\s*V/i,
  );
  const hasRTuning =
    /R.*조정|R.*값.*구|가변|adjusting R|adjust R/i.test(text);
  if (inverseMatch && hasRTuning) {
    const targetLabel = `V_${inverseMatch[1]}`;
    const targetValue = parseFloat(inverseMatch[2]);
    queries.push({
      kind: "inverseR",
      resistorId: "__variable_R__",
      targetNode: `__label:${targetLabel}`,
      targetValue,
      rRange: [0.01, 10000],
      label: `R for ${targetLabel}=${targetValue}V`,
    });
  }

  return queries;
}

/**
 * placeholder 노드 id (예: "__label:V_1")를 실제 네트워크 노드 id로 변환.
 *
 *  매핑 우선순위:
 *    1. analysis.nodeAnnotations에 label과 일치하는 node id가 있으면 → 그 node id
 *    2. "measurement" 노드 ordering — V 소스의 + 단자 노드를 제외한 top node만 추려서
 *        V_n → measurementNodes[n-1] (n번째 측정 노드).
 *        임용 관례: V_n은 학생이 풀어야 할 측정 노드이므로 V 소스 단자는 보통 라벨하지 않음.
 *    3. fallback → V_label_숫자 - 1 인덱스의 sortedTopNodes.
 */
export function resolveQueryNodes(
  queries: DcQuery[],
  netlist: CircuitNetlist,
  analysis: AnalysisResult,
): DcQuery[] {
  // 네트워크 노드 추출 — top rail nodes (n0, n1, ...)
  const topNodes = new Set<string>();
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (typeof p.node === "string" && p.node.startsWith("n") && !["GND", "ground"].includes(p.node)) {
        topNodes.add(p.node);
      }
    }
  }

  // (1) analysis 기반 명시 매핑 — analysis가 가리키는 node id가 실제 netlist에 존재할 때만 신뢰.
  //   topology dedupe/normalize 과정에서 노드가 사라질 수 있어 phantom 매핑 방지.
  const labelToNode = new Map<string, string>();
  for (const ann of analysis.nodeAnnotations ?? []) {
    if (typeof ann.label === "string" && ann.node && topNodes.has(ann.node)) {
      labelToNode.set(ann.label.toUpperCase(), ann.node);
      labelToNode.set(`V_${ann.label}`.toUpperCase(), ann.node);
    }
  }
  const sortedTopNodes = [...topNodes].sort((a, b) => {
    const na = parseInt(a.replace(/^n/, ""), 10);
    const nb = parseInt(b.replace(/^n/, ""), 10);
    return na - nb;
  });

  // (2) "measurement" 노드 — V 소스의 +단자 노드를 제외.
  //   V 소스는 top↔bottom 형식. 그 top 노드는 v_source의 출력 단자라 V_n으로는 잘 라벨링 안 됨.
  const vSourceTopNodes = new Set<string>();
  for (const c of netlist.components) {
    if (c.type !== "V") continue;
    // V 소스의 + pin (top side)을 찾음
    const topPin = c.pins.find((p) => p.side === "top");
    if (topPin && topPin.node !== netlist.ground) {
      vSourceTopNodes.add(topPin.node);
    }
  }
  const measurementNodes = sortedTopNodes.filter((n) => !vSourceTopNodes.has(n));

  const resolveOne = (placeholder: string): string => {
    if (!placeholder.startsWith("__label:")) return placeholder;
    const label = placeholder.slice("__label:".length);
    const labelUpper = label.toUpperCase();
    if (labelToNode.has(labelUpper)) return labelToNode.get(labelUpper)!;
    // V_숫자 패턴 → measurementNodes[N-1] 우선
    const m = label.match(/V[_]?(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10) - 1;
      if (n >= 0 && n < measurementNodes.length) return measurementNodes[n];
      if (n >= 0 && n < sortedTopNodes.length) return sortedTopNodes[n];
    }
    // fallback — measurement 노드 첫 번째
    return measurementNodes[0] ?? sortedTopNodes[0] ?? "GND";
  };

  // 가변 R 식별 — load_leg 컴포넌트 우선, 없으면 마지막 R
  const variableRId = findVariableResistor(netlist, analysis);

  return queries.map((q) => {
    if (q.kind === "nodeVoltage") {
      return { ...q, node: resolveOne(q.node) };
    }
    if (q.kind === "inverseR") {
      return {
        ...q,
        targetNode: resolveOne(q.targetNode),
        resistorId: q.resistorId === "__variable_R__"
          ? (variableRId ?? q.resistorId)
          : q.resistorId,
      };
    }
    return q;
  });
}

/**
 * 가변 저항 식별 — public export (universal pipeline에서 placeholder 주입용으로도 사용).
 *
 *  우선순위:
 *   1. analysis.loadPlaceholders 중 label이 R/R_L이고 emphasize=true → 그 betweenNodes의 R
 *   2. netlist 컴포넌트 중 id에 "R_leg"가 들어가고 legRoot이 있는 첫 R (vertical leg의 R = 가변 후보)
 *   3. fallback — 마지막 R
 */
export function findVariableResistor(
  netlist: CircuitNetlist,
  analysis: AnalysisResult,
): string | undefined {
  // (1) load placeholder 매치
  const placeholders = analysis.loadPlaceholders ?? [];
  for (const ph of placeholders) {
    if (ph.label && /^R(_L)?$/i.test(ph.label.trim())) {
      const [a, b] = ph.betweenNodes;
      const match = netlist.components.find(
        (c) =>
          c.type === "R" &&
          c.pins.some((p) => p.node === a) &&
          c.pins.some((p) => p.node === b),
      );
      if (match) return match.id;
    }
  }
  // (2) vertical leg의 첫 R (load_leg에서 만들어진 R) — 통상 imyong 가변 R은 vertical
  const legR = netlist.components.find(
    (c) => c.type === "R" && /R_leg/i.test(c.id),
  );
  if (legR) return legR.id;
  // (3) fallback — 마지막 R
  const rs = netlist.components.filter((c) => c.type === "R");
  return rs[rs.length - 1]?.id;
}
