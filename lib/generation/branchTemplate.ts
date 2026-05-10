import type {
  CircuitComponent,
  CircuitComponentType,
  CircuitNetlist,
  ComponentPin,
  PinSide,
  TopologySignature,
} from "@/types";

// =====================================================================
// Branch template — deterministic 회로 생성의 기반.
//
//   topologySignature(GPT analyze)
//     ↓ buildBranchTemplate (코드)
//   BranchTemplate[]
//     ↓ normalizeSwitchingLegs
//     ↓ addGroundReturnWires (dangling top 자동 닫음)
//   BranchTemplate[] final
//     ↓ GPT가 valueAssignments[]만 반환
//   instantiateAnalogTemplate (코드) → InstantiatedBranch[]
//     ↓ assembleNetlist (코드)
//   CircuitNetlist
// =====================================================================

export type TemplateBranchRole =
  | "top_rail"
  | "bottom_return"           // dangling top↔GND 닫기 위한 wire branch
  | "left_source_leg"
  | "dependent_source_leg"
  | "switching_leg"
  | "load_leg";

export type BranchOrientation = "horizontal" | "vertical";

export type RequiredComponentSpec = {
  type: string;       // 정해짐 (변경 불가)
  role: string;       // branch 안에서의 역할
  order: number;      // chain 안에서 위치 (1부터)
  required: boolean;
};

export type BranchTemplate = {
  id: string;
  role: TemplateBranchRole;
  orientation: BranchOrientation;
  fromNode: string;
  toNode: string;
  components: RequiredComponentSpec[];
};

export type AnalogValueAssignment = {
  branchId: string;
  componentRole: string;
  type: string;
  value?: string;
  gain?: string;
  state?: "open" | "closed";
};

export type InstantiatedComponent = {
  id: string;
  type: string;
  role: string;
  value?: string;
  gain?: string;
  state?: "open" | "closed";
};

export type InstantiatedBranch = BranchTemplate & {
  instantiated: InstantiatedComponent[];
};

// =====================================================================
// 1) topologySignature → BranchTemplate[]
// =====================================================================

const HORIZONTAL_ROLES = new Set([
  "top_rail_resistor",
  "shared_supermesh_branch",
  "mesh_only_branch",
  "bottom_rail_wire",
]);

function toTemplateRole(broad: string): TemplateBranchRole {
  switch (broad) {
    case "voltage_source_leg":      return "left_source_leg";
    case "current_source_leg":      return "load_leg";
    case "dependent_source_leg":    return "dependent_source_leg";
    case "switching_leg":           return "switching_leg";
    case "load_leg":                return "load_leg";
    case "top_rail_resistor":       return "top_rail";
    case "shared_supermesh_branch": return "top_rail";
    case "mesh_only_branch":        return "top_rail";
    case "bottom_rail_wire":        return "bottom_return";
    default:                        return "top_rail";
  }
}

function orientationFor(role: TemplateBranchRole): BranchOrientation {
  if (role === "top_rail") return "horizontal";
  return "vertical";
}

function componentRoleFor(type: string): string {
  switch (type.toUpperCase()) {
    case "V":    return "voltage_source";
    case "I":    return "current_source";
    case "R":    return "resistor";
    case "L":    return "inductor";
    case "C":    return "capacitor";
    case "D":    return "diode";
    case "SW":   return "switch";
    case "VCVS":
    case "CCVS": return "dep_voltage_source";
    case "VCCS":
    case "CCCS": return "dep_current_source";
    case "WIRE": return "wire";
    default:     return type.toLowerCase();
  }
}

export function buildBranchTemplate(topology: TopologySignature): {
  template: BranchTemplate[];
  topNodes: string[];
  groundNode: string;
} {
  const groundNode = "GND";

  const broadBranches = topology.branches.map((b) => ({
    ...b,
    templateRole: toTemplateRole(b.role),
  }));

  const horizontalCount = broadBranches.filter(
    (b) => orientationFor(b.templateRole) === "horizontal",
  ).length;
  const verticalCount = broadBranches.filter(
    (b) => orientationFor(b.templateRole) === "vertical",
  ).length;

  const topNodeCount = Math.max(horizontalCount + 1, verticalCount, 2);
  const topNodes = Array.from({ length: topNodeCount }, (_, i) => `n_top_${i + 1}`);

  const template: BranchTemplate[] = [];
  let id = 1;
  let topRailIdx = 0;
  let verticalIdx = 0;

  for (const b of broadBranches) {
    const orientation = orientationFor(b.templateRole);
    const branchId = `b${id}`;

    const components: RequiredComponentSpec[] = b.components.map((c, i) => ({
      type: c.type.toUpperCase(),
      role: componentRoleFor(c.type),
      order: i + 1,
      required: true,
    }));

    let fromNode: string;
    let toNode: string;
    if (orientation === "horizontal") {
      fromNode = topNodes[topRailIdx];
      toNode = topNodes[Math.min(topRailIdx + 1, topNodes.length - 1)];
      topRailIdx++;
    } else {
      fromNode = topNodes[verticalIdx % topNodes.length];
      toNode = groundNode;
      verticalIdx++;
    }

    template.push({
      id: branchId,
      role: b.templateRole,
      orientation,
      fromNode,
      toNode,
      components,
    });
    id++;
  }

  return { template, topNodes, groundNode };
}

// =====================================================================
// 2) normalizeSwitchingLegs — SW 있는 branch는 무조건 vertical switching_leg
//    (분류 오류 방지: 누가 SW를 top_rail에 넣었으면 강제 보정)
// =====================================================================
export function normalizeSwitchingLegs(branches: BranchTemplate[]): BranchTemplate[] {
  return branches.map((b) => {
    const hasSwitch = b.components.some((c) => c.type === "SW");
    if (!hasSwitch) return b;
    return {
      ...b,
      role: "switching_leg" as const,
      orientation: "vertical" as const,
      components: orderSwitchingLegComponents(b.components),
    };
  });
}

const SW_LEG_PRIORITY: Record<string, number> = {
  SW: 1,
  R: 2,
  L: 2,
  C: 2,
  I: 3,
  V: 3,
};

function orderSwitchingLegComponents(
  components: RequiredComponentSpec[],
): RequiredComponentSpec[] {
  return [...components]
    .sort((a, b) => (SW_LEG_PRIORITY[a.type] ?? 99) - (SW_LEG_PRIORITY[b.type] ?? 99))
    .map((c, i) => ({ ...c, order: i + 1 }));
}

// =====================================================================
// 3) addGroundReturnWires — top node 중 vertical leg가 없는 것이 있으면 WIRE branch로 GND 닫음
// =====================================================================
export function addGroundReturnWires(
  branches: BranchTemplate[],
  topNodes: string[],
  groundNode: string,
): BranchTemplate[] {
  // 각 top node가 vertical branch에 fromNode로 등장하는지 카운트
  const verticalAttached = new Set<string>();
  for (const b of branches) {
    if (b.orientation === "vertical") verticalAttached.add(b.fromNode);
  }

  const result = [...branches];
  let nextId = branches.length + 1;
  for (const tn of topNodes) {
    if (verticalAttached.has(tn)) continue;
    // 이 top node에 vertical이 없음 → bottom_return wire 추가
    result.push({
      id: `b${nextId}_wire`,
      role: "bottom_return",
      orientation: "vertical",
      fromNode: tn,
      toNode: groundNode,
      components: [{
        type: "WIRE",
        role: "wire",
        order: 1,
        required: false,  // GPT는 value를 안 줘도 됨 (코드가 자동)
      }],
    });
    nextId++;
  }
  return result;
}

// =====================================================================
// 4) instantiateAnalogTemplate
// =====================================================================

const ID_PREFIX: Record<string, string> = {
  R: "R", L: "L", C: "C", D: "D",
  V: "V", I: "I", SW: "SW",
  VCVS: "E", CCVS: "H", VCCS: "G", CCCS: "F",
  BJT: "Q", MOSFET: "M", OPAMP: "U",
  WIRE: "W",
};

const idCounter = new Map<string, number>();

function makeComponentId(type: string, role: string): string {
  const t = type.toUpperCase();
  const prefix = ID_PREFIX[t] ?? t;
  const key = `${prefix}|${role}`;
  const next = (idCounter.get(key) ?? 0) + 1;
  idCounter.set(key, next);
  return `${prefix}${next}`;
}

export function resetComponentIdCounter(): void {
  idCounter.clear();
}

export function instantiateAnalogTemplate(
  template: BranchTemplate[],
  values: AnalogValueAssignment[],
): InstantiatedBranch[] {
  resetComponentIdCounter();
  return template.map((branch) => ({
    ...branch,
    instantiated: branch.components.map((req) => {
      // WIRE는 GPT value 없어도 OK — 코드가 처리
      if (req.type === "WIRE") {
        return {
          id: makeComponentId(req.type, req.role),
          type: req.type,
          role: req.role,
        };
      }
      const v = values.find(
        (x) =>
          x.branchId === branch.id &&
          x.componentRole === req.role &&
          x.type === req.type,
      );
      if (!v && req.required) {
        throw new Error(`missing value for ${branch.id}/${req.role}/${req.type}`);
      }
      return {
        id: makeComponentId(req.type, req.role),
        type: req.type,
        role: req.role,
        value: v?.value,
        gain: v?.gain,
        state: v?.state,
      };
    }),
  }));
}

// =====================================================================
// 5) assembleNetlist
// =====================================================================
export function assembleNetlist(
  instantiated: InstantiatedBranch[],
  groundNode: string,
  swStateOverride?: "open" | "closed",
): CircuitNetlist {
  const components: CircuitComponent[] = [];

  for (const b of instantiated) {
    const chain: string[] = [b.fromNode];
    for (let i = 0; i < b.instantiated.length - 1; i++) {
      chain.push(`${b.id}_mid_${i + 1}`);
    }
    chain.push(b.toNode);

    for (let i = 0; i < b.instantiated.length; i++) {
      const c = b.instantiated[i];
      const pin1Side: PinSide = b.orientation === "horizontal" ? "left" : "top";
      const pin2Side: PinSide = b.orientation === "horizontal" ? "right" : "bottom";

      const pins: ComponentPin[] = [
        { id: "p1", node: chain[i], side: pin1Side },
        { id: "p2", node: chain[i + 1], side: pin2Side },
      ];

      const comp: CircuitComponent = {
        id: c.id,
        type: c.type as CircuitComponentType,
        value: c.value,
        gain: c.gain,
        pins,
      };
      if (c.type === "SW") {
        comp.state = swStateOverride ?? c.state ?? "open";
      }
      components.push(comp);
    }
  }

  return { components, ground: groundNode };
}
