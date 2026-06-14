import type { AnalysisResult, CircuitNetlist } from "@/types";
import type { AcQuery } from "@/lib/solver/universalAc";

/**
 * AnalysisResult에서 AC query 구조 추출.
 *
 *  지원 패턴:
 *    - "|I| 또는 I[A]" → magnitude(전류원이 1개면 그 source의 phasor)
 *    - "공진주파수 / f_0 / ω_0" → resonanceFreq
 *    - "최대 평균전력 / P_max" → maxAvgPower (R_L sweep)
 *    - "공진 시 C 구하기" → inverseC
 *    - "V_n 노드 전압" → phasorVoltage / magnitude
 */
export function inferAcQueries(analysis: AnalysisResult): AcQuery[] {
  const condText = (analysis.fillInTheBlanks ?? [])
    .map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`)
    .join(" ");
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    condText,
  ].join(" ");

  const queries: AcQuery[] = [];

  // 1) V_n 노드 phasor magnitude
  const vMatches = Array.from(text.matchAll(/V[_]?(\d+|o|x|a|b|c)/gi));
  const seen = new Set<string>();
  for (const m of vMatches) {
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `|V_${m[1]}|`;
    queries.push({ kind: "magnitude", node: `__label:V_${m[1]}`, label });
  }

  // 2) 공진주파수
  if (/공진주파수|공진 주파수|f_?0|ω_?0|omega_?0|resonance freq/i.test(text)) {
    queries.push({
      kind: "resonanceFreq",
      vsourceId: "__primary_vs__",
      label: "ω_0 (공진주파수)",
    });
  }

  // 3) 최대 평균전력 → R_L sweep
  if (/최대\s*평균전력|최대\s*전력|P_?max|maximum\s*power/i.test(text)) {
    queries.push({
      kind: "maxAvgPower",
      resistorId: "__variable_R__",
      vsourceId: "__primary_vs__",
      label: "R_L (P_max 전달)",
    });
  }

  // 4) 공진 시 C — "공진" + ("C를 구" | "C 용량")
  if (/(공진).*(C\b|C 용량|커패시터)/i.test(text)) {
    queries.push({
      kind: "inverseC",
      capacitorId: "__variable_C__",
      targetOmega: 0, // 외부에서 채워야 함 (analysis.relatedConcepts에서 ω_0 추출)
      label: "C (공진)",
    });
  }

  // 5) 컴포넌트 평균전력 — "평균전력" 키워드 (최대평균전력 제외 — line 48에서 이미 처리).
  //   임용 8번 형식: 전원 공급 / 인덕터 / R 각각 평균전력.
  //   placeholder __all_components_avg_power__ 1개 query 추가 — resolveAcQueryRefs가 netlist 모든
  //   V·L·R·C로 expand해서 multi-query로 변환.
  const hasAvgPowerKw = /(평균전력|평균 전력|소비되는\s*평균|공급하는\s*평균|average power|P_avg|P_R|P_L)/i.test(text);
  const hasMaxPowerOnly = /최대\s*(평균)?전력|P_?max|maximum\s*power/i.test(text);
  if (hasAvgPowerKw && !hasMaxPowerOnly) {
    queries.push({
      kind: "componentAvgPower",
      componentType: "V", // 의미 없음 — resolve에서 expand
      componentId: "__all_components_avg_power__",
      label: "평균전력 (전체 컴포넌트)",
    });
  }

  return queries;
}

/**
 * placeholder query를 실제 네트워크 id로 변환.
 *   - "__label:V_n" → 실제 node id
 *   - "__primary_vs__" → 첫 V source id
 *   - "__variable_R__" → load_leg R
 *   - "__variable_C__" → load_leg C 또는 마지막 C
 */
export function resolveAcQueryRefs(
  queries: AcQuery[],
  netlist: CircuitNetlist,
  analysis: AnalysisResult,
): AcQuery[] {
  // ★ netlist에 실제 존재하는 노드 집합 — 분석 단계의 nodeAnnotations는 종종 라벨("V_1")을
  //   그대로 node id로 쓰는데, buildFromTopology는 노드를 n1·n2…로 재명명한다. 그 불일치로
  //   phantom 노드를 query에 넣으면 nodeVoltages[phantom]=undefined → 결과 NaN.
  //   따라서 label→node 매핑·위치 fallback 모두 이 집합으로 검증한다.
  const validNodes = new Set<string>();
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (typeof p.node === "string") validNodes.add(p.node);
    }
  }

  // 1) label → node id (DC 로직과 동일). 단, netlist에 실재하는 node로 매핑될 때만 채택.
  const labelToNode = new Map<string, string>();
  for (const ann of analysis.nodeAnnotations ?? []) {
    if (typeof ann.label === "string" && ann.node && validNodes.has(ann.node)) {
      labelToNode.set(ann.label.toUpperCase(), ann.node);
      labelToNode.set(`V_${ann.label}`.toUpperCase(), ann.node);
    }
  }
  const topNodes = new Set<string>();
  const vSourceTops = new Set<string>();
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (typeof p.node === "string" && p.node.startsWith("n")) topNodes.add(p.node);
    }
    if (c.type === "V") {
      const top = c.pins.find((p) => p.side === "top");
      if (top && top.node !== netlist.ground) vSourceTops.add(top.node);
    }
  }
  const sortedTops = [...topNodes].sort((a, b) => {
    const na = parseInt(a.replace(/^n/, ""), 10);
    const nb = parseInt(b.replace(/^n/, ""), 10);
    return na - nb;
  });
  const measurementNodes = sortedTops.filter((n) => !vSourceTops.has(n));

  const resolveNode = (placeholder: string): string => {
    if (!placeholder.startsWith("__label:")) return placeholder;
    const label = placeholder.slice("__label:".length);
    const labelUpper = label.toUpperCase();
    if (labelToNode.has(labelUpper)) return labelToNode.get(labelUpper)!;
    const m = label.match(/V[_]?(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10) - 1;
      if (n >= 0 && n < measurementNodes.length) return measurementNodes[n];
      if (n >= 0 && n < sortedTops.length) return sortedTops[n];
    }
    return measurementNodes[0] ?? sortedTops[0] ?? "GND";
  };

  // 2) primary vsource — 첫 V
  const primaryVs = netlist.components.find((c) => c.type === "V");
  const primaryVsId = primaryVs?.id;

  // 3) variable R — 우선순위:
  //   (0) ★ R_L 부하 component (addLoadResistor가 추가한 것) — 최대전력 문제의 정답 경로.
  //       기존 회로 R(전원 내부저항 등)을 가변으로 오선택하지 않도록 항상 최우선.
  //   (1) loadPlaceholders 위치 매칭 R
  //   (2) load_leg R (legacy 휴리스틱)
  //   (3) 마지막 R (fallback)
  let variableRid: string | undefined;
  const loadR = netlist.components.find((c) => c.type === "R" && /^R_?L$/i.test(c.id));
  if (loadR) variableRid = loadR.id;

  if (!variableRid) {
    const placeholderR = analysis.loadPlaceholders?.find((ph) =>
      ph.label && /^R(_L)?$/i.test(ph.label.trim()),
    );
    if (placeholderR) {
      const [a, b] = placeholderR.betweenNodes;
      const match = netlist.components.find(
        (c) =>
          c.type === "R" &&
          c.pins.some((p) => p.node === a) &&
          c.pins.some((p) => p.node === b),
      );
      variableRid = match?.id;
    }
  }
  if (!variableRid) {
    const legR = netlist.components.find((c) => c.type === "R" && /R_leg/i.test(c.id));
    variableRid = legR?.id;
  }
  if (!variableRid) {
    const rs = netlist.components.filter((c) => c.type === "R");
    variableRid = rs[rs.length - 1]?.id;
  }

  // 4) variable C — 첫 C (보통 학생 도출 변수)
  const variableC = netlist.components.find((c) => c.type === "C");
  const variableCid = variableC?.id;

  return queries.flatMap<AcQuery>((q) => {
    if (q.kind === "phasorVoltage" || q.kind === "magnitude" || q.kind === "phaseDeg") {
      return [{ ...q, node: resolveNode(q.node) }];
    }
    if (q.kind === "phasorCurrent" || q.kind === "resonanceFreq") {
      return [{
        ...q,
        vsourceId: q.vsourceId === "__primary_vs__" ? primaryVsId ?? q.vsourceId : q.vsourceId,
      }];
    }
    if (q.kind === "maxAvgPower") {
      return [{
        ...q,
        vsourceId: q.vsourceId === "__primary_vs__" ? primaryVsId ?? q.vsourceId : q.vsourceId,
        resistorId: q.resistorId === "__variable_R__" ? variableRid ?? q.resistorId : q.resistorId,
      }];
    }
    if (q.kind === "inverseC") {
      return [{
        ...q,
        capacitorId: q.capacitorId === "__variable_C__" ? variableCid ?? q.capacitorId : q.capacitorId,
      }];
    }
    if (q.kind === "componentAvgPower" && q.componentId === "__all_components_avg_power__") {
      // netlist 모든 V·L·R·C 각각에 query 생성 — 임용 8번 [단계 1·2·3] 모두 한 번에.
      const expanded: AcQuery[] = [];
      for (const c of netlist.components) {
        if (c.type === "V") {
          expanded.push({ kind: "componentAvgPower", componentType: "V", componentId: c.id, label: `P_avg (전원 ${c.id} 공급)` });
        } else if (c.type === "L") {
          expanded.push({ kind: "componentAvgPower", componentType: "L", componentId: c.id, label: `P_${c.id} (인덕터)` });
        } else if (c.type === "C") {
          expanded.push({ kind: "componentAvgPower", componentType: "C", componentId: c.id, label: `P_${c.id} (캐패시터)` });
        } else if (c.type === "R") {
          expanded.push({ kind: "componentAvgPower", componentType: "R", componentId: c.id, label: `P_${c.id}` });
        }
      }
      return expanded;
    }
    return [q];
  });
}
