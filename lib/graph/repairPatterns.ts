/**
 * Pattern-specific topology repair — analyzer가 놓친 특정 구조를 inferred component로 보완.
 *
 *   원칙:
 *     - semantic graph는 immutable이 기본.
 *     - 단, 잘 정의된 pattern에서 분석이 특정 component를 일관되게 놓치는 경우
 *       명시적 repair function으로 inferred=true 마킹해 추가 가능.
 *     - 자동 prune은 절대 안 함 (extract가 잘못된 거지 추가가 잘못된 건 아님).
 *
 *   사용:
 *     2-node nodal DC pattern 감지 후 → repairLeftParallelFeed → render.
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

/** nodeAnnotations에서 role 검색 → 첫 매치 node id 반환. role 누락 시 structural fallback. */
function findNodeByRole(netlist: CircuitNetlist, role: "source_plus" | "main_unknown" | "right_unknown" | "ground"): string | null {
  for (const ann of netlist.nodeAnnotations ?? []) {
    if (ann.role === role) return ann.node;
  }
  // ★ Fallback: GPT가 role 누락한 케이스 대응 — component 구조로부터 추론.
  if (role === "ground") {
    const g = netlist.ground;
    if (g) return g;
    for (const c of netlist.components) {
      for (const p of c.pins) {
        if (GROUND_LABELS.has(p.node)) return p.node;
      }
    }
    return null;
  }
  if (role === "source_plus") {
    // V 소스의 positive pin (non-GND) 노드를 source_plus로 간주.
    // 사용자 명시 fallback: "B. repair 함수에서 V source positive pin을 source_plus로 사용".
    for (const c of netlist.components) {
      if (c.type !== "V") continue;
      const posPin = c.pins.find((p) => p.role === "positive" && !GROUND_LABELS.has(p.node));
      if (posPin) return posPin.node;
      // role 미지정 V → non-GND 단자 첫 번째
      const nonGndPin = c.pins.find((p) => !GROUND_LABELS.has(p.node));
      if (nonGndPin) return nonGndPin.node;
    }
    return null;
  }
  return null;
}

/** 두 노드 쌍이 (a,b) 또는 (b,a)로 동일한가 검사. */
function samePair(p1a: string, p1b: string, a: string, b: string): boolean {
  return (p1a === a && p1b === b) || (p1a === b && p1b === a);
}

/**
 * Left parallel feed repair —
 *   source_plus ↔ main_unknown 사이에 R이 정확히 1개 있으면, 같은 값의 R을 평행으로 추가.
 *   분석이 위아래 stacked R을 1개로 본 케이스의 휴리스틱 보정.
 *   inferred=true 마킹 → solver는 정상 사용, 시각화는 평행 가지로 표시.
 *
 *   ★ 사용 조건: 2-node nodal DC pattern인 회로에 한해 호출.
 *     일반 회로(thevenin·supermesh 등)에선 호출 금지 — 잘못된 R을 추가할 위험.
 */
export function repairLeftParallelFeed(netlist: CircuitNetlist): CircuitNetlist {
  const src = findNodeByRole(netlist, "source_plus");
  const v1 = findNodeByRole(netlist, "main_unknown");
  if (!src || !v1) return netlist;

  // src ↔ v1 사이 R 검색.
  const feeds = netlist.components.filter((c) => {
    if (c.type !== "R") return false;
    const pins = c.pins ?? [];
    if (pins.length < 2) return false;
    return samePair(pins[0].node, pins[1].node, src, v1);
  });

  if (feeds.length === 1) {
    const orig = feeds[0];
    // user-facing label로 노출되므로 내부 jargon("_repaired") 제거.
    //   기존 R_top1 등과 구분하기 위해 _par suffix만.
    const newR: CircuitComponent = {
      ...orig,
      id: `${orig.id}_par`,
      value: orig.value,
      pins: [
        { id: "p1", node: src, side: "top" },
        { id: "p2", node: v1, side: "bottom" },
      ],
    };
    // inferred 플래그 — CircuitComponent에 추가 필드.
    (newR as CircuitComponent & { inferred?: boolean }).inferred = true;
    return {
      ...netlist,
      components: [...netlist.components, newR],
    };
  }
  return netlist;
}
