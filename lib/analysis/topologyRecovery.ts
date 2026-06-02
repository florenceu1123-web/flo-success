import type { TopologySignature } from "@/types";
import type { ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";
import { buildCanonicalGraph } from "@/lib/graph/canonical";
import { validateCanonicalGraph } from "@/lib/graph/graphValidator";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/analysis/topologyRecovery");

/**
 * Topology Recovery v1 (2026-05-31).
 *
 * 목표 (v1): "원본과 동일한 회로"가 아니라 "해석 가능한 회로를 95%+ 생성".
 *   - GPT의 branches·role·betweenNodes 추출이 제거된 후, components 리스트만으로
 *     buildFromTopology가 받을 수 있는 valid TopologySignature.branches[]를 derive.
 *   - singular·trivial(P=0W) 회로가 안 나오는 것이 최우선.
 *
 * v1 전략 — 가장 안전한 fallback인 ★ 단일 mesh ladder ★:
 *   - V 1개 → voltage_source_leg [좌측 vertical, top↔GND]
 *   - 나머지 component (L·R·C·I·SW 등) → top_rail horizontal chain
 *   - 마지막은 GND alias node로 닫힘 → 단일 mesh
 *   - V·L 단락 같은 trivial topology(P=0W) 회피 보장
 *
 * v2 (후속): visual hint·typical pattern으로 candidate graphs + scoring → 원본 정확 복원.
 */

export type RecoveryResult = {
  branches: TopologySignature["branches"];
  /** 매칭 신뢰도. v1 ladder는 0.5, v2 pattern 매치는 0.9, v3 pins 그래프는 0.9~0.95, empty 0. */
  confidence: number;
  /** 어떤 strategy로 생성됐는지 (디버그·로깅) */
  strategy: "ladder_v1" | "single_leg_v1" | "pattern_rl_v2" | "pattern_rc_v2" | "pattern_rlc_v2" | "pins_graph_v3" | "empty";
};

/**
 * v2 — Typical pattern dictionary로 component 시그니처 매칭.
 *  - V+L+R+R (or V+L+R*N) → RL 응용 (V·L 직렬 + R 병렬). 임용 8번 형식.
 *  - V+C+R+R               → RC 응용 (V·C 직렬 + R 병렬).
 *  - V+L+C+R+R             → RLC 응용 (V·L·C 직렬 + R 병렬).
 *  매치 없으면 v1 ladder fallback.
 *
 *  textHint(topic+interpretation+concepts)에서 "인덕터·임피던스·j_Ω" 키워드 감지 시
 *  inventory에 I만 있고 L=0이면 I → L 교체 후 pattern 매치 시도 (GPT inventory 누락 보정).
 */
export function recoverTopologyV2(
  inventory: ComponentInventoryItem[],
  textHint?: string,
): RecoveryResult {
  if (inventory.length === 0) {
    return { branches: [], confidence: 0, strategy: "empty" };
  }

  // inventory 보정 — textHint에 "인덕터/inductor/j숫자Ω/임피던스/H" 키워드 + inventory L=0 + I≥1.
  //   GPT가 코일 심볼을 current source로 오인한 케이스 자동 보정.
  //   ★ 단, 페이저 표기(∠)나 A 단위 값을 가진 I는 확인된 전류원 — 절대 변환 금지 (2026-06-03).
  //     (본문 식 교차 검증·correctTypeByValue로 확정된 전류원을 L로 바꾸면 회로가 깨짐)
  const correctedInventory = (() => {
    const text = (textHint ?? "").toLowerCase();
    const hasInductorHint = /인덕터|inductor|impedance|임피던스|j\(|j\d|jω|H\b|코일|coil/i.test(text);
    const hasL = inventory.some((c) => c.type.toUpperCase() === "L");
    const isConfirmedCurrentSource = (c: ComponentInventoryItem): boolean =>
      typeof c.value === "string" && /∠|A$/i.test(c.value.trim());
    const swappableISources = inventory.filter(
      (c) => c.type.toUpperCase() === "I" && !isConfirmedCurrentSource(c),
    );
    if (hasInductorHint && !hasL && swappableISources.length >= 1) {
      // 첫 (미확인) I를 L로 교체.
      const first = swappableISources[0];
      log.info("inventory_corrected", {
        reason: "textHint 인덕터 키워드 + L=0 + 미확인 I≥1 → 첫 I를 L로 교체",
        originalId: first.id,
        originalType: first.type,
      });
      return inventory.map((c) => c === first ? { ...c, type: "L" } : c);
    }
    return inventory;
  })();

  const count = (t: string) =>
    correctedInventory.filter((c) => c.type.toUpperCase() === t).length;
  const nV = count("V");
  const nI = count("I");
  const nL = count("L");
  const nC = count("C");
  const nR = count("R");
  const nSW = count("SW");

  // Pattern 1: RL 응용 — V=1, L≥1, R≥2, 다른 source/SW 없음 (임용 8번).
  //   토폴로지: V → L (직렬, 상단) → R 병렬 → GND.
  if (nV === 1 && nL >= 1 && nR >= 2 && nC === 0 && nI === 0 && nSW === 0) {
    return buildVSourceSeriesReactiveParallelR(correctedInventory, "L", "pattern_rl_v2");
  }
  // Pattern 2: RC 응용 — V=1, C≥1, R≥2.
  if (nV === 1 && nC >= 1 && nR >= 2 && nL === 0 && nI === 0 && nSW === 0) {
    return buildVSourceSeriesReactiveParallelR(correctedInventory, "C", "pattern_rc_v2");
  }
  // Pattern 3: RLC 응용 — V=1, L≥1, C≥1, R≥1.
  if (nV === 1 && nL >= 1 && nC >= 1 && nR >= 1 && nI === 0 && nSW === 0) {
    return buildVSourceSeriesReactiveParallelR(correctedInventory, "LC", "pattern_rlc_v2");
  }

  // Pattern 매치 없음 → v3 pins 기반 그래프 복원 시도 (2026-06-02).
  //   다중 전원(테브난·중첩·최대전력)·비정형 topology를 GPT가 본 연결 구조 그대로 보존.
  //   pattern이 v3보다 우선인 이유: pattern은 해당 임용 형식에 맞게 검증된 layout이고,
  //   pins는 GPT connectivity 추출 품질에 의존하므로 비정형 케이스의 흡수용.
  const pinsResult = recoverTopologyFromPins(correctedInventory);
  if (pinsResult) return pinsResult;

  // 매치 없음 → v1 fallback (corrected inventory가 아닌 원본 사용).
  return recoverTopology(inventory);
}

/**
 * v3 (2026-06-02) — pins(Connectivity Detection) 기반 회로 그래프 복원.
 *
 *  inventory의 pins로 실제 회로 그래프를 그대로 TopologySignature.branches로 변환.
 *  v1 ladder·v2 pattern과 달리 GPT가 본 연결 구조를 보존 → 다중 전원(테브난·중첩·최대전력),
 *  비정형 topology도 해석 가능한 형태로 복원한다.
 *
 *  단계:
 *   1. coverage 검사 — 2-pin component 전부 pins 보유 (하나라도 누락 → null로 fallback)
 *   2. 그래프 repair (범용 규칙, 특정 문제 hardcode 아님):
 *      a. 전원(V/I)의 dangling 끝(degree≤1) → 최고 degree 노드에 재연결
 *         (전원은 항상 닫힌 loop의 일부 — dangling이면 GPT가 wire를 누락한 것)
 *      b. GND 라벨이 없으면 최고 degree 노드를 GND로 지정 (기준 전위 선택은 해석에 영향 없음)
 *      c. 남은 dangling 비전원 노드 → GND로 닫음 (외부 단자 관례)
 *   3. component → branch 변환:
 *      GND 접촉 → vertical leg role (V/I/R·L·C/SW별), 아니면 horizontal role
 *   4. 복원 그래프 재검증 — connected + cycle ≥ 1이어야 채택, 아니면 null (pattern/ladder fallback)
 *
 * @param inventory pins가 포함된 component 리스트
 * @returns 채택 가능하면 RecoveryResult, 품질 미달이면 null
 */
export function recoverTopologyFromPins(inventory: ComponentInventoryItem[]): RecoveryResult | null {
  const TWO_PIN_TYPES = new Set(["R", "V", "I", "C", "L", "SW", "VCVS", "VCCS", "CCVS", "CCCS", "D"]);
  const twoPinComps = inventory.filter((c) => TWO_PIN_TYPES.has(c.type.toUpperCase()));
  if (twoPinComps.length < 2) return null;
  // coverage — 2-pin 소자 전부 valid pins 필요
  const allHavePins = twoPinComps.every(
    (c) => c.pins && c.pins.length >= 2 && c.pins[0] !== c.pins[1],
  );
  if (!allHavePins) {
    log.info("pins_recovery_skipped", { reason: "pins coverage 불충분" });
    return null;
  }

  const isGndLabel = (n: string): boolean => {
    const u = n.toUpperCase();
    return u === "GND" || u === "GROUND" || u === "0";
  };

  // 작업용 pins 사본 — repair 과정에서 수정
  const pinsMap = new Map<string, [string, string]>();
  for (const c of twoPinComps) pinsMap.set(c.id, [c.pins![0], c.pins![1]]);

  const degreeOf = (): Map<string, number> => {
    const deg = new Map<string, number>();
    for (const [a, b] of pinsMap.values()) {
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    return deg;
  };

  // ── 2a. 전원(V/I) dangling 끝 재연결 ─────────────────────────────────────
  for (const c of twoPinComps) {
    const t = c.type.toUpperCase();
    if (t !== "V" && t !== "I") continue;
    const deg = degreeOf();
    const [a, b] = pinsMap.get(c.id)!;
    const aDangling = !isGndLabel(a) && (deg.get(a) ?? 0) <= 1;
    const bDangling = !isGndLabel(b) && (deg.get(b) ?? 0) <= 1;
    if (!aDangling && !bDangling) continue;
    if (aDangling && bDangling) continue; // 완전 고립 전원 — 검증에서 reject
    const danglingEnd = aDangling ? a : b;
    const otherEnd = aDangling ? b : a;

    // 재연결 후보 우선순위 (2026-06-03 보강 — GPT가 같은 물리 노드에 다른 이름을 붙인 케이스):
    //  ① 다른 전원(V/I)의 비접지 hot 노드 — 임용 회로의 전원들은 같은 공급 rail을 공유하는 관례.
    //  ② 최고 degree 비접지 노드 (tie → 알파벳).
    //  ★ GND는 후보 제외 — GND에 붙이면 전원+직렬소자가 본 회로와 분리된 고립 루프가 됨.
    //    (정말 GND에 연결돼야 한다면 GPT가 애초에 GND로 라벨링했을 것)
    const otherSourceHotNodes: string[] = [];
    for (const other of twoPinComps) {
      if (other.id === c.id) continue;
      const ot = other.type.toUpperCase();
      if (ot !== "V" && ot !== "I") continue;
      for (const n of pinsMap.get(other.id)!) {
        if (!isGndLabel(n) && n !== danglingEnd && n !== otherEnd) otherSourceHotNodes.push(n);
      }
    }
    const byDegreeDesc = (x: string, y: string) =>
      (deg.get(y)! - deg.get(x)!) || (x < y ? -1 : 1);
    let target: string | undefined;
    if (otherSourceHotNodes.length > 0) {
      target = [...new Set(otherSourceHotNodes)].sort(byDegreeDesc)[0];
    } else {
      const candidates = [...deg.keys()].filter(
        (n) => n !== danglingEnd && n !== otherEnd && !isGndLabel(n),
      );
      target = candidates.sort(byDegreeDesc)[0];
    }
    if (!target) continue;
    pinsMap.set(c.id, aDangling ? [target, b] : [a, target]);
    log.info("pins_repair_dangling_source", { id: c.id, from: danglingEnd, to: target });
  }

  // ── 2b. GND 지정 ─────────────────────────────────────────────────────────
  let deg = degreeOf();
  const hasGndLabel = [...deg.keys()].some(isGndLabel);
  if (hasGndLabel) {
    // "ground"·"0" → "GND" normalize
    for (const [id, [a, b]] of pinsMap) {
      pinsMap.set(id, [isGndLabel(a) ? "GND" : a, isGndLabel(b) ? "GND" : b]);
    }
  } else {
    // 최고 degree 노드를 GND로 — tie면 두 번째 pin(음극/하단 관례)으로 더 자주 등장한 노드 → 알파벳
    const secondPinCount = new Map<string, number>();
    for (const [, b] of pinsMap.values()) secondPinCount.set(b, (secondPinCount.get(b) ?? 0) + 1);
    const nodes = [...deg.keys()];
    nodes.sort((x, y) =>
      (deg.get(y)! - deg.get(x)!) ||
      ((secondPinCount.get(y) ?? 0) - (secondPinCount.get(x) ?? 0)) ||
      (x < y ? -1 : 1));
    const gndNode = nodes[0];
    for (const [id, [a, b]] of pinsMap) {
      pinsMap.set(id, [a === gndNode ? "GND" : a, b === gndNode ? "GND" : b]);
    }
    log.info("pins_ground_designated", { node: gndNode });
  }

  // ── 2c. 남은 dangling 비전원 노드 → GND ──────────────────────────────────
  deg = degreeOf();
  for (const [id, [a, b]] of pinsMap) {
    const aD = a !== "GND" && (deg.get(a) ?? 0) <= 1;
    const bD = b !== "GND" && (deg.get(b) ?? 0) <= 1;
    if (aD && bD) continue; // 양끝 고립 component — 검증에서 reject
    if (aD) pinsMap.set(id, ["GND", b]);
    else if (bD) pinsMap.set(id, [a, "GND"]);
  }

  // ── 3. component → branch 변환 ───────────────────────────────────────────
  const branches: TopologySignature["branches"] = [];
  for (const c of twoPinComps) {
    const [a, b] = pinsMap.get(c.id)!;
    const t = c.type.toUpperCase();
    const touchesGnd = a === "GND" || b === "GND";
    if (touchesGnd) {
      const top = a === "GND" ? b : a;
      branches.push({
        role: inferVerticalLegRole(t),
        components: [{ type: t, value: c.value }],
        betweenNodes: [top, "GND"] as [string, string],
      });
    } else {
      branches.push({
        role: inferHorizontalRole(t),
        components: [{ type: t, value: c.value }],
        betweenNodes: [a, b] as [string, string],
      });
    }
  }

  // ── 4. 복원 그래프 재검증 ────────────────────────────────────────────────
  const repairedInventory: ComponentInventoryItem[] = twoPinComps.map((c) => ({
    ...c,
    pins: [...pinsMap.get(c.id)!],
  }));
  const graph = buildCanonicalGraph(repairedInventory);
  const validation = validateCanonicalGraph(graph);
  if (graph.features.connectedComponentCount > 1 || graph.features.cycleCount === 0) {
    log.info("pins_recovery_rejected", {
      cc: graph.features.connectedComponentCount,
      cycles: graph.features.cycleCount,
      reason: "끊김 또는 닫힌 loop 없음 — pattern/ladder fallback",
    });
    return null;
  }

  log.info("recovered_v3", {
    strategy: "pins_graph_v3",
    components: twoPinComps.length,
    branches: branches.length,
    graphConfidence: Number(validation.confidence.toFixed(2)),
  });

  return {
    branches,
    confidence: Math.max(0.9, validation.confidence),
    strategy: "pins_graph_v3",
  };
}

/**
 * V → (reactive component 직렬) → R 병렬 → GND 형식 builder.
 *  - reactiveMode "L": 첫 L만 직렬, 추가 L은 R 병렬 leg로
 *  - reactiveMode "C": 첫 C만 직렬, 추가 C도 R 병렬 leg로
 *  - reactiveMode "LC": L과 C 모두 직렬 (V → L → C → 병렬 R), 추가는 R 병렬 leg로
 */
function buildVSourceSeriesReactiveParallelR(
  inventory: ComponentInventoryItem[],
  reactiveMode: "L" | "C" | "LC",
  strategy: RecoveryResult["strategy"],
): RecoveryResult {
  const N_A = "n_a";
  const N_B = "n_b";
  const branches: TopologySignature["branches"] = [];

  // V → [n_a, GND]
  const vSource = inventory.find((c) => c.type.toUpperCase() === "V");
  if (vSource) {
    branches.push({
      role: "voltage_source_leg",
      components: [{ type: "V", value: vSource.value }],
      betweenNodes: [N_A, "GND"] as [string, string],
    });
  }

  // Reactive 직렬 (V·L 직렬 또는 V·C 직렬 또는 V·L·C 직렬) — n_a ↔ n_b.
  const reactives: ComponentInventoryItem[] = [];
  if (reactiveMode === "L" || reactiveMode === "LC") {
    const firstL = inventory.find((c) => c.type.toUpperCase() === "L");
    if (firstL) reactives.push(firstL);
  }
  if (reactiveMode === "C" || reactiveMode === "LC") {
    const firstC = inventory.find((c) => c.type.toUpperCase() === "C");
    if (firstC) reactives.push(firstC);
  }
  for (const r of reactives) {
    branches.push({
      role: "top_rail_resistor",   // horizontal element
      components: [{ type: r.type.toUpperCase(), value: r.value }],
      betweenNodes: [N_A, N_B] as [string, string],
    });
  }

  // R 모두 + 남은 reactive (둘째 L·C) → n_b ↔ GND vertical leg parallel.
  //   value가 placeholder("R"·"R_L"·빈 값)인 R에는 default 채움 — 화면에 값 없는 R 방지.
  const consumedIds = new Set(reactives.map((r) => r.id));
  const isPlaceholderValue = (v: string | undefined): boolean => {
    if (!v) return true;
    const s = String(v).trim().toUpperCase();
    return s === "" || s === "R" || s === "R_L" || s === "RL" || s === "?";
  };
  const DEFAULT_R_VALUES = ["1Ω", "3Ω", "4Ω", "5Ω", "10Ω"];
  let rDefaultIdx = 0;
  for (const c of inventory) {
    if (consumedIds.has(c.id)) continue;
    if (c.id === vSource?.id) continue;
    if (c.type.toUpperCase() === "V") continue;
    let value: string | number | undefined = c.value;
    if (c.type.toUpperCase() === "R" && isPlaceholderValue(typeof c.value === "string" ? c.value : undefined)) {
      value = DEFAULT_R_VALUES[rDefaultIdx % DEFAULT_R_VALUES.length];
      rDefaultIdx++;
    }
    branches.push({
      role: "load_leg",
      components: [{ type: c.type.toUpperCase(), value }],
      betweenNodes: [N_B, "GND"] as [string, string],
    });
  }

  log.info("recovered_v2", {
    strategy,
    components: inventory.length,
    seriesReactive: reactives.length,
    parallelLeg: branches.length - 1 - reactives.length,
  });

  return { branches, confidence: 0.9, strategy };
}

/**
 * components 리스트로 해석 가능한 단일 mesh ladder branches를 만든다.
 *
 * @param inventory  GPT가 추출한 component 리스트
 * @returns branches·confidence·strategy
 */
export function recoverTopology(inventory: ComponentInventoryItem[]): RecoveryResult {
  if (inventory.length === 0) {
    return { branches: [], confidence: 0, strategy: "empty" };
  }

  // V·others 분리.
  const vSources = inventory.filter((c) => c.type.toUpperCase() === "V");
  const others = inventory.filter((c) => c.type.toUpperCase() !== "V");

  // V가 없으면 ladder 형성 불가 — 모든 components를 vertical leg로 (current source 회로 등).
  if (vSources.length === 0) {
    const branches: TopologySignature["branches"] = inventory.map((c) => ({
      role: inferVerticalLegRole(c.type),
      components: [{ type: c.type.toUpperCase(), value: c.value }],
      betweenNodes: ["n_0", "GND"] as [string, string],
    }));
    log.info("recovered", { strategy: "single_leg_v1", components: inventory.length });
    return { branches, confidence: 0.5, strategy: "single_leg_v1" };
  }

  // 일반 케이스 — 단일 mesh ladder.
  //   V는 좌측 vertical leg [n_0, GND]
  //   others는 top_rail horizontal chain [n_0, n_1] [n_1, n_2] ... [n_{k-1}, GND]
  const branches: TopologySignature["branches"] = [];

  // V는 첫 번째 V만 사용 (v1 단순화 — multi-V는 v2에서)
  const primaryV = vSources[0];
  branches.push({
    role: "voltage_source_leg",
    components: [{ type: "V", value: primaryV.value }],
    betweenNodes: ["n_0", "GND"] as [string, string],
  });

  // 추가 V는 mesh_only_branch로 (top_rail에 끼인 horizontal V)
  for (let i = 1; i < vSources.length; i++) {
    const v = vSources[i];
    branches.push({
      role: "mesh_only_branch",
      components: [{ type: "V", value: v.value }],
      // 노드는 ladder 안에서 chain 배치 — 일단 placeholder, 아래에서 재할당
      betweenNodes: ["n_placeholder", "n_placeholder"] as [string, string],
    });
  }

  // others를 top_rail horizontal chain으로
  //   k개면 [n_0, n_1] [n_1, n_2] ... [n_{k-1}, GND]
  const totalHorizontal = others.length + Math.max(0, vSources.length - 1);
  // others ladder 노드 chain — n_0 (V top), n_1, ..., n_{k-1}, GND
  const nodeChain: string[] = ["n_0"];
  for (let i = 1; i < totalHorizontal; i++) nodeChain.push(`n_${i}`);
  nodeChain.push("GND");

  // 재배치 — vSources[1..]와 others를 ladder 순서대로 끼움.
  //   순서: vSources[1..] 다음 others (단순 v1).
  const horizontalComponents = [
    ...vSources.slice(1).map((v) => ({ ...v, role: "mesh_only_branch" as const })),
    ...others.map((c) => ({ ...c, role: inferHorizontalRole(c.type) })),
  ];

  // V leg(첫 branch)을 제외한 기존 branches는 모두 재구성.
  const rebuilt: TopologySignature["branches"] = [
    branches[0], // V leg
  ];
  horizontalComponents.forEach((hc, i) => {
    rebuilt.push({
      role: hc.role,
      components: [{ type: hc.type.toUpperCase(), value: hc.value }],
      betweenNodes: [nodeChain[i], nodeChain[i + 1]] as [string, string],
    });
  });

  log.info("recovered", {
    strategy: "ladder_v1",
    components: inventory.length,
    nodes: nodeChain.length,
    branches: rebuilt.length,
  });

  return { branches: rebuilt, confidence: 0.8, strategy: "ladder_v1" };
}

function inferVerticalLegRole(type: string): TopologySignature["branches"][number]["role"] {
  switch (type.toUpperCase()) {
    case "V":     return "voltage_source_leg";
    case "I":     return "current_source_leg";
    case "R":
    case "C":
    case "L":     return "load_leg";
    case "SW":    return "switching_leg";
    case "VCVS":
    case "VCCS":
    case "CCVS":
    case "CCCS":  return "dependent_source_leg";
    default:      return "load_leg";
  }
}

/**
 * 임용 8번 기출변형유형 — pattern_rl_v2의 variant.
 *  - 코일(L) → 캐패시터(C)로 swap. value도 임피던스 표기로 (j(2/3)Ω → -j(2/3)Ω).
 *  - R 두 개는 ★ 직렬 ★ ladder로 (V → C → R → R → GND 단일 mesh).
 *
 * @param baseTopology — pattern_rl_v2가 만든 V·L·R·R 병렬 topology
 * @returns L→C swap + R 직렬 ladder topology, 매치 안 되면 null
 */
export function applyRlExamVariant(baseTopology: TopologySignature): TopologySignature | null {
  const bs = baseTopology.branches;
  const vBranch = bs.find((b) =>
    b.components.some((c) => (c.type ?? "").toUpperCase() === "V"));
  const lBranch = bs.find((b) =>
    b.components.some((c) => (c.type ?? "").toUpperCase() === "L"));
  const rBranches = bs.filter((b) =>
    b.components.every((c) => (c.type ?? "").toUpperCase() === "R"));
  if (!vBranch || !lBranch || rBranches.length < 2) return null;

  const vValue = vBranch.components[0]?.value;
  const lValue = lBranch.components[0]?.value;
  // L value "j(2/3)Ω" → C 임피던스 표기 "-j(2/3)Ω" (jωC 부호 반전)
  const cValue = typeof lValue === "string" && lValue.startsWith("j")
    ? `-${lValue}`
    : lValue ?? "-j10Ω";

  // 새 토폴로지: V·C·R·R 직렬 ladder.
  //   V (vertical) → n_0
  //   C (horizontal) → n_0 ↔ n_1
  //   R (horizontal) → n_1 ↔ n_2
  //   R (vertical)  → n_2 ↔ GND
  const newBranches: TopologySignature["branches"] = [
    {
      role: "voltage_source_leg",
      components: [{ type: "V", value: vValue }],
      betweenNodes: ["n_0", "GND"] as [string, string],
    },
    {
      role: "top_rail_resistor",
      components: [{ type: "C", value: cValue }],
      betweenNodes: ["n_0", "n_1"] as [string, string],
    },
    {
      role: "top_rail_resistor",
      components: [{ type: "R", value: rBranches[0].components[0]?.value }],
      betweenNodes: ["n_1", "n_2"] as [string, string],
    },
    {
      role: "load_leg",
      components: [{ type: "R", value: rBranches[1].components[0]?.value }],
      betweenNodes: ["n_2", "GND"] as [string, string],
    },
  ];

  log.info("variant_applied", {
    transform: "rl_exam_variant",
    note: "L→C, R·R 직렬 ladder",
  });

  return {
    ...baseTopology,
    branches: newBranches,
  };
}

function inferHorizontalRole(type: string): TopologySignature["branches"][number]["role"] {
  switch (type.toUpperCase()) {
    case "R":
    case "C":
    case "L":     return "top_rail_resistor";
    case "V":     return "mesh_only_branch";
    case "I":     return "mesh_only_branch";
    case "SW":    return "switching_leg";  // SW가 horizontal이면 별도 처리 필요 — v2
    default:      return "top_rail_resistor";
  }
}
