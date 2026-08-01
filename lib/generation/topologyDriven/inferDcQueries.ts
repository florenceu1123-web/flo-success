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

  // 2) total power — "전체/총/합" 이 붙은 전력만
  if (
    /전체.*소비.*전력|전체.*전력.*소비|총.*전력|총.*소비|소비.*전력.*총|소비.*전력.*합/.test(text)
  ) {
    queries.push({ kind: "totalPower", label: "P_total" });
  }

  // 2b) 특정 저항 전력 — "N[Ω]에서 소모/소비되는 전력" 또는 "저항 R_k가 소모하는 전력".
  //   ★ 중첩의 원리 문제(임용 전기 A-3 류)의 핵심 query. totalPower(전체/총/합)와 구분 —
  //     "전체/총/합" 없이 특정 저항 하나의 소비전력을 물으면 resistorPower.
  //   대상 저항은 값(N Ω)으로 지목 → "__rvalue:N" placeholder. pipeline이 원본(비perturb)
  //     빌드로 실제 저항 id를 확정한다(id는 위치 기반이라 perturbation 후에도 안정).
  const isTotalPower = queries.some((q) => q.kind === "totalPower");
  if (!isTotalPower) {
    // "12[Ω]에서 소모되는 전력", "12Ω 저항에서 소비하는 전력" 등
    const rPowerByValue = text.match(
      /(\d+(?:\.\d+)?)\s*\[?\s*(?:Ω|옴|ohm)\s*\]?\s*(?:저항)?\s*(?:에서|의|에)?\s*(?:소모|소비)(?:되는|하는)?\s*전력/i,
    );
    // "저항 R에서 소모되는 전력", "R_2가 소비하는 전력"
    const rPowerByLabel = text.match(
      /(?:저항\s*)?R[_]?(\d+|L|x|o)?\s*(?:에서|가|이|의|에)?\s*(?:소모|소비)(?:되는|하는)?\s*전력/i,
    );
    // 일반 표현: "특정 저항이 소모/소비하는 전력" (값·라벨 없이) — 대상 미지정
    const rPowerGeneric =
      /(?:특정|해당|한)\s*저항.*(?:소모|소비).*전력|저항.*소[모비].*전력\s*P\b/.test(text) ||
      /전력\s*P\s*\[?\s*W/i.test(text);

    if (rPowerByValue) {
      const val = rPowerByValue[1];
      queries.push({ kind: "resistorPower", resistorId: `__rvalue:${val}`, label: "P" });
    } else if (rPowerByLabel && rPowerByLabel[1]) {
      const label = `R_${rPowerByLabel[1]}`;
      queries.push({ kind: "resistorPower", resistorId: `__rlabel:${label}`, label: "P" });
    } else if (rPowerGeneric) {
      // 대상 미지정 — pipeline이 기본 대상(전원 직렬 저항/첫 R)으로 fallback.
      queries.push({ kind: "resistorPower", resistorId: "__rdefault__", label: "P" });
    }
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
  // 네트워크 노드 추출 — non-GND 노드 모두. 이전엔 startsWith("n") 강제로 "n0","n1"만
  //   잡았는데, betweenNodes로 명시한 사용자 노드 이름(VS_PLUS, V1, V2 등)을 놓치고
  //   labelToNode 매핑 실패 → V_n 라벨이 GND로 fallback되던 버그 fix.
  const groundLabels = new Set(["GND", "ground", "Ground", "gnd", "Gnd", "0"]);
  const topNodes = new Set<string>();
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (typeof p.node === "string" && !groundLabels.has(p.node)) {
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
 * 개념형 "원리의 명칭 쓰기" lead 질문 감지 (예: 임용 전기 A-3 중첩의 원리).
 *
 *   원본이 (가) 원리 설명 박스 + "원리의 명칭을 쓰시오" 형식일 때, universal_dc의
 *   순수 수치 query로는 표현 못 하는 개념형 소문항을 보존한다.
 *
 *   ★ 특정 문제의 값을 hardcode하는 게 아니라, 원리를 그 정의(텍스트)·빈칸 정답 형태로
 *     인식하는 규칙 기반 감지 ([[feedback_generic_code]]). 빈칸 정답이 "…의 원리/법칙/정리"
 *     꼴이면 그 이름을 그대로 쓰므로 테브난의 정리 등도 별도 규칙 없이 잡힌다.
 *
 * @returns 감지된 개념 lead, 없으면 null
 */
export type DcConceptLead = { principleName: string };

export function inferDcConceptLead(analysis: AnalysisResult): DcConceptLead | null {
  const blanks = analysis.fillInTheBlanks ?? [];
  const condText = blanks.map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ");
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    condText,
  ].join(" ");

  // ── (1) "명칭을 쓰라"는 지시 — ★ Vision이 원문의 "명칭"을 그대로 옮기는 경우는 드물다.
  //   실측: 원문 "(가)의 원리에 해당하는 명칭을 쓰고"가 분석에선 "이 원리는 ____이다"로 의역됐고,
  //   "명칭" 리터럴을 요구하던 예전 규칙이 감지에 실패해 원리 소문항이 통째로 사라졌다.
  //   → 표현 흔들림을 정규화로 흡수 ([[feedback_gpt_format_normalization]]):
  //     "명칭/이름을 쓰라"류 지시 **또는** 원리 자체를 답으로 요구하는 빈칸이면 인정.
  const asksName =
    /(?:원리|법칙|정리).*(?:명칭|이름)|(?:명칭|이름).*(?:쓰|서술|기술|답)|해석.*(?:원리|법칙|정리).*(?:명칭|이름|무엇)|무슨\s*(?:원리|법칙|정리)|어떤\s*(?:원리|법칙|정리)/.test(text);

  // ── (2) 빈칸의 정답이 곧 원리·법칙·정리 이름인 경우 — "이 원리는 ____이다 → 중첩의 원리".
  //   특정 원리를 hardcode하지 않고 이름 형태(…의 원리/법칙/정리)로 일반 인식 ([[feedback_generic_code]]).
  //   ★ 정답 표기도 흔들린다 — 같은 이미지에서 "중첩의 원리"로 나오기도, 문장을
  //     "____의 원리이다"로 쪼개고 정답은 "중첩"만 주기도 한다(실측). 둘 다 흡수한다.
  const PRINCIPLE_NAME = /^[가-힣A-Za-z][가-힣A-Za-z\s·']{0,20}?(?:의\s*)?(?:원리|법칙|정리)$/;
  const blankPrincipleName = (b: { sentence?: string; answer?: string } | null): string | null => {
    const ans = (b?.answer ?? "").trim();
    if (!ans) return null;
    if (PRINCIPLE_NAME.test(ans)) return ans;
    // "…는 ____의 원리이다" 처럼 종류어가 문장 쪽에 남은 경우 → 정답에 붙여 이름 복원.
    const kind = (b?.sentence ?? "").match(/_{2,}\s*(?:의\s*)?(원리|법칙|정리)/)?.[1];
    if (!kind) return null;
    // 수치·단위가 섞인 정답(예 "P[W]")은 원리 이름이 아니다.
    if (ans.length > 12 || /[\d[\]()Ω]/.test(ans)) return null;
    return `${ans}의 ${kind}`;
  };
  const namedByBlank = blanks.map(blankPrincipleName).find((n): n is string => Boolean(n));

  // ★ 빈칸 정답만으로 인정하면 오탐이 난다 — Vision은 어떤 회로 문제에든 "옴의 법칙" 같은
  //   학습용 빈칸을 만들어 붙이기 때문. 원본이 실제로 원리를 제시(설명·정의)하는 구조,
  //   즉 (가) 박스에 원리 설명이 있는 형식일 때만 개념 소문항으로 인정한다.
  const presentsPrinciple =
    /(?:원리|법칙|정리)[^.]{0,30}(?:설명|정의|서술|제시)/.test(text) ||
    /독립\s*전원.*단독.*(?:존재|작용).*합|각\s*전원.*단독.*합/.test(text);

  if (!asksName && !(namedByBlank && presentsPrinciple)) return null;

  // ── (3) 원리 이름 확정. 빈칸 정답이 있으면 그걸 그대로 쓰고(테브난의 정리 등도 자동 지원),
  //   없으면 정의문·키워드로 중첩의 원리를 인식한다.
  if (namedByBlank) {
    return { principleName: namedByBlank };
  }
  const isSuperposition =
    /중첩(?:의)?\s*원리|superposition/i.test(text) ||
    /독립\s*전원.*단독.*(?:존재|작용).*합|각\s*전원.*단독.*합/.test(text);
  if (isSuperposition) {
    return { principleName: "중첩의 원리" };
  }

  return null;
}

/**
 * resistorPower query의 대상 저항 placeholder(__rvalue:N / __rlabel:R_k / __rdefault__)를
 * 실제 netlist 저항 id로 해석. pipeline이 원본(비perturb) 빌드 netlist를 넘겨 호출한다.
 *
 *   - __rvalue:N   → value가 N Ω인 저항 (원본 값 기준, 위치-안정 id)
 *   - __rlabel:R_k → nodeAnnotations/loadPlaceholders 라벨 매칭 (없으면 default)
 *   - __rdefault__ → 전원(V/I 소스) 직렬 저항 우선, 없으면 첫 R
 *
 * @returns 해석된 저항 id, 매칭 실패 시 첫 R id
 */
export function resolveResistorPowerTarget(
  placeholder: string,
  baseNetlist: CircuitNetlist,
): string | undefined {
  const resistors = baseNetlist.components.filter((c) => c.type === "R");
  if (resistors.length === 0) return undefined;

  const parseR = (v: unknown): number => {
    const m = String(v ?? "").match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };

  if (placeholder.startsWith("__rvalue:")) {
    const target = parseFloat(placeholder.slice("__rvalue:".length));
    let best: { id: string; diff: number } | null = null;
    for (const r of resistors) {
      const diff = Math.abs(parseR(r.value) - target);
      if (best === null || diff < best.diff) best = { id: r.id, diff };
    }
    // 값이 근접(±0.6)해야 신뢰 — 아니면 default로
    if (best && best.diff <= 0.6) return best.id;
  }

  if (placeholder.startsWith("__rlabel:")) {
    const label = placeholder.slice("__rlabel:".length).toUpperCase();
    // id에 라벨 조각이 들어간 저항 우선 (예: label R_2 → id에 "2")
    const num = label.match(/\d+/)?.[0];
    if (num) {
      const byId = resistors.find((r) => r.id.includes(num));
      if (byId) return byId.id;
    }
  }

  // __rdefault__ 또는 매칭 실패 — 전원 직렬 저항 우선
  const sourceNodes = new Set<string>();
  for (const c of baseNetlist.components) {
    if (c.type === "V" || c.type === "I") {
      for (const p of c.pins) sourceNodes.add(p.node);
    }
  }
  const seriesR = resistors.find((r) => r.pins.some((p) => sourceNodes.has(p.node)));
  return (seriesR ?? resistors[resistors.length - 1]).id;
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
