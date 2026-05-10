import type { CircuitNetlist } from "@/types";
import type { CircuitLane, RoutedComponent, TopologyInfo } from "./topology";

const LANE_TOP_PAD = 60;
const LANE_HEIGHT = 140;
const COMP_LEFT_PAD = 60;
const COMP_PITCH = 160;

/**
 * 추론 기반 lane 분리:
 *  - 모든 component는 기본 lane 0
 *  - parallel group(같은 두 노드를 공유하는 component ≥2)에 속한 components는 각자 lane 0,1,2...로 분산
 *  - series chain은 같은 lane에서 가로 정렬
 *  - lane 안에서는 array 등장 순서로 좌→우
 *
 * 결과:
 *  - lanes: id/y/components(좌→우 id 목록)
 *  - routed: 각 component의 (laneId, x, orientation)
 */
export function assignLanes(
  netlist: CircuitNetlist,
  topology: TopologyInfo
): { lanes: CircuitLane[]; routed: RoutedComponent[] } {
  const laneIdx = new Map<string, number>();
  for (const c of netlist.components) laneIdx.set(c.id, 0);

  // parallel group마다 첫 component는 lane 0 유지, 나머지는 새 lane으로
  for (const group of topology.parallelGroups) {
    group.componentIds.forEach((id, i) => {
      // 이미 더 큰 lane에 있으면 유지 (다른 group과 겹칠 때)
      const prev = laneIdx.get(id) ?? 0;
      laneIdx.set(id, Math.max(prev, i));
    });
  }

  // lane index → ordered component ids (array 등장 순서 보존)
  const byLane = new Map<number, string[]>();
  for (const c of netlist.components) {
    const idx = laneIdx.get(c.id) ?? 0;
    const list = byLane.get(idx) ?? [];
    list.push(c.id);
    byLane.set(idx, list);
  }

  const sortedLaneIdxs = Array.from(byLane.keys()).sort((a, b) => a - b);
  const lanes: CircuitLane[] = sortedLaneIdxs.map((idx) => ({
    id: `lane${idx}`,
    y: LANE_TOP_PAD + idx * LANE_HEIGHT,
    components: byLane.get(idx)!,
  }));

  const routed: RoutedComponent[] = [];
  for (const lane of lanes) {
    lane.components.forEach((id, i) => {
      routed.push({
        componentId: id,
        laneId: lane.id,
        x: COMP_LEFT_PAD + i * COMP_PITCH,
        orientation: "horizontal",
      });
    });
  }

  return { lanes, routed };
}
