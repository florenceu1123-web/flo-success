import type { TopologySignature } from "@/types";
import type { ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";
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
  /** v2 pattern 매칭 신뢰도. v1 ladder는 0.5, v2 pattern 매치는 0.9, empty 0. */
  confidence: number;
  /** 어떤 strategy로 생성됐는지 (디버그·로깅) */
  strategy: "ladder_v1" | "single_leg_v1" | "pattern_rl_v2" | "pattern_rc_v2" | "pattern_rlc_v2" | "empty";
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
  const correctedInventory = (() => {
    const text = (textHint ?? "").toLowerCase();
    const hasInductorHint = /인덕터|inductor|impedance|임피던스|j\(|j\d|jω|H\b|코일|coil/i.test(text);
    const hasL = inventory.some((c) => c.type.toUpperCase() === "L");
    const iSources = inventory.filter((c) => c.type.toUpperCase() === "I");
    if (hasInductorHint && !hasL && iSources.length >= 1) {
      // 첫 I를 L로 교체.
      const first = iSources[0];
      log.info("inventory_corrected", {
        reason: "textHint 인덕터 키워드 + L=0 + I≥1 → 첫 I를 L로 교체",
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

  // 매치 없음 → v1 fallback (corrected inventory가 아닌 원본 사용).
  return recoverTopology(inventory);
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
