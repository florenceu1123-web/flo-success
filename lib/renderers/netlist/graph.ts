import type { CircuitNetlist } from "@/types";

export type Point = { x: number; y: number };

export type GraphNet = {
  node: string;
  pins: {
    componentId: string;
    pinId: string;
  }[];
};

/**
 * Spec 3 — netlist를 net 그래프로 변환.
 * 같은 node id를 가진 pin들이 하나의 net으로 묶인다.
 */
export function buildPinGraph(netlist: CircuitNetlist) {
  const nets = new Map<string, GraphNet>();

  for (const c of netlist.components) {
    for (const pin of c.pins) {
      const net = nets.get(pin.node) ?? {
        node: pin.node,
        pins: [],
      };

      net.pins.push({
        componentId: c.id,
        pinId: pin.id,
      });

      nets.set(pin.node, net);
    }
  }

  return {
    nets: Array.from(nets.values()),
  };
}
