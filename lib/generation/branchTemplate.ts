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
  // ── top rail · ground rail ──────────────────────────────
  | "top_rail"                  // 인접 top node 사이의 horizontal branch (보통 R)
  | "bottom_return"             // dangling top↔GND 닫기 위한 wire branch
  // ── vertical source legs ───────────────────────────────
  | "left_source_leg"           // 좌측 V/I source leg
  | "right_source_leg"          // 우측 V/I source leg (Thevenin 출력 등)
  | "input_source_leg"          // 입력 신호 V source (V_1·V_2 등)
  | "dependent_source_leg"      // VCVS/VCCS/CCVS/CCCS leg
  | "switching_leg"             // SW가 포함된 vertical leg (SW + R + I 같은 chain)
  | "load_leg"                  // 부하 R (R_L 등) leg
  // ── OPAMP / multi-pin block ────────────────────────────
  | "opamp_block"               // OPAMP 자체 (3-pin: vp/vn/vo)
  | "opamp_input_resistor"      // OPAMP 반전 입력 쪽 R (R_in)
  | "opamp_feedback_resistor"   // OPAMP feedback R (R_f)
  | "cascade_coupling"          // cascade 단 사이 결합 R (앞단 vo → 뒷단 vn)
  // ── 기타 ───────────────────────────────────────────────
  | "ground_symbol";            // 명시적 GND 단자 표시 (시각화용)

export type BranchOrientation = "horizontal" | "vertical";

/** 한 branch가 따라야 할 도메인 규칙. validator·renderer 모두 이 규칙을 참조해 일관 동작. */
export type BranchRules = {
  /** branch에 허용되는 component type whitelist (없으면 무제한) */
  allowedComponentTypes?: string[];
  /** branch에 반드시 포함되어야 하는 component type */
  requiredComponentTypes?: string[];
  /** 양 끝 node의 최소 degree (회로 완결성) */
  minNodeDegree?: number;
  /** 시각화 시 권장 placement 영역 — renderer가 layout 결정에 참조 */
  layoutHint?:
    | "leftmost"          // 좌측 가장자리 (입력 source 등)
    | "rightmost"         // 우측 가장자리 (출력 source/load)
    | "center"            // 회로 중앙 (OPAMP 등)
    | "feedback_loop"     // feedback path (OPAMP body 위 또는 아래 wrap)
    | "ground_local"      // GND-attached 짧은 stub
    | "top_rail";         // top rail horizontal
  /** 같은 node를 공유해야 하는 sibling branch id (예: cascade_coupling은 앞단 opamp_block의 vo와 같음) */
  pairWithBranchId?: string;
};

export type RequiredComponentSpec = {
  type: string;       // 정해짐 (변경 불가)
  role: string;       // branch 안에서의 역할
  order: number;      // chain 안에서 위치 (1부터)
  required: boolean;
  /** 의미있는 id 강제 (예: "R_in1", "Vs1") — 없으면 type+sequence 기반 자동. */
  idOverride?: string;
};

export type BranchTemplate = {
  id: string;
  role: TemplateBranchRole;
  orientation: BranchOrientation;
  fromNode: string;
  toNode: string;
  components: RequiredComponentSpec[];
  /** 이 branch에 적용되는 도메인 규칙 (선택). buildBranchTemplate이 role별 기본값 자동 채움. */
  rules?: BranchRules;
  /** opamp_block role 전용 — OPAMP 3-pin 노드 매핑. fromNode/toNode 2-pin 모델로 표현 불가. */
  opampNodes?: { vp: string; vn: string; vo: string };
};

/** validation 결과 — 규칙 위반 issue 목록 */
export type BranchTemplateValidation = {
  ok: boolean;
  issues: Array<{ branchId?: string; rule: string; message: string }>;
};

// =====================================================================
// CONNECTION_LAYOUT_RULES — 회로 생성·렌더링이 항상 따라야 할 공통 규칙.
// generator/renderer가 한 곳을 참조하여 일관성 보장. (이 모듈을 import하면
// 자동으로 contract을 따르는 것이 강제됨 — 위반 시 validator가 issue 발행.)
// =====================================================================
export const CONNECTION_LAYOUT_RULES = {
  /**
   * Rule-1 (회로 완결성): 모든 node는 ≥2개 component pin에 연결되어야 한다.
   *   - dangling 금지. 출력 직전 검산 필수.
   *   - 위반 시: autoCloseAnalogDangling이 WIRE로 GND에 자동 연결.
   */
  minNodeDegree: 2,

  /**
   * Rule-2 (소자 회피 라우팅): node→node wire는 소자(component body)와 겹치지 않고
   *   최단거리로 우회하여 연결되어야 한다.
   *   - wire가 component bounding box 내부를 가로지르지 않음.
   *   - 우회 라우팅: orthogonal (horizontal-vertical-horizontal 또는 vertical-horizontal-vertical) 사용.
   *   - 가능한 candidate path(L-자, top-band 우회, 좌·우 외곽 우회 등) 중 segment 길이 합이 최소인 것 선택.
   *   - body 외곽까지만 wire 그리고, body 자체는 wire 위에 fill="white"로 덮음.
   */
  wireAvoidsComponentBody: true,

  /**
   * Rule-3 (lane 분리): 서로 다른 두 node의 wire는 같은 x-lane 또는 y-lane을
   *   공유하지 않도록 적절한 offset을 둔다.
   *   - 예외: 단순 교차 (점으로 지나치는 cross-over)는 허용 (junction dot으로 구분).
   *   - 같은 column-pair 다중 component는 x-offset 분산.
   *   - 같은 node-pair 다중 component(parallel)는 y-offset 분산.
   *   - OPAMP 입력 vp(+)/vn(−) wire는 위/아래 lane으로 분리.
   */
  laneOffsetMinPx: 16,

  /**
   * Rule-4 (Pin convention): multi-pin component는 정해진 pin 위치를 갖는다.
   *   - OPAMP: vp(좌상, +) / vn(좌하, −) / vo(우, output tip)
   *   - BJT:   B(좌)  / C(상)  / E(하)
   *   - MOSFET: G(좌) / D(상)  / S(하)
   *   - 모든 pin은 body 외곽에 명시적 stub + terminal dot 표시.
   *   - node wire는 stub dot에서 끊겨 body fill이 wire를 가리지 않음.
   */
  multiPinExposedStub: true,

  /**
   * Rule-5 (GND 표현): 회로의 GND는 단일 visual 위치로 모으지 않고, 각 GND-attached
   *   pin 옆에 분산 표시한다.
   *   - 단일 위치 long wire 회피.
   *   - 각 V source/OPAMP 등 GND pin 옆에 작은 GND symbol.
   *   - OPAMP vp=GND (상단)는 symbol을 위로 향한 ▽, vn=GND (하단)는 아래로 향한 △.
   */
  groundDistributed: true,

  /**
   * Rule-6 (Layout flow): 회로의 신호 흐름은 좌→우.
   *   - leftmost: 입력 source (V_1, V_2 등)
   *   - center:   active component (OPAMP/BJT 등) cascade는 좌→우 단 순서
   *   - rightmost: 출력 단자 (V_o, R_L)
   *   - top_rail: horizontal R chain
   *   - GND: 각 component 옆 local 표시
   */
  signalFlowLeftToRight: true,

  /**
   * Rule-7 (Junction dot): node와 node가 서로 연결되어 전류가 이어 흐르는 곳(분기점)에는
   *   junction dot(●)을 표시한다. — 표준 회로도 규칙.
   *   - T-junction (세 wire 만남, degree ≥ 3): dot 표시 (같은 net)
   *   - Fan-out (한 node에서 여러 wire 갈라짐): dot 표시
   *   - Simple corner (같은 net이 L자로 꺾임, degree 2): dot 안 찍음
   *   - Cross-over (서로 다른 net이 점으로 교차): dot 안 찍음 (별개 net임을 의미)
   *   - 구현: renderJunctions는 node degree ≥ 3에 dot. 점 교차는 wire 끊김으로 표현.
   */
  junctionDotOnDegreeAtLeast: 3,
} as const;

// =====================================================================
// Role별 기본 BranchRules — buildBranchTemplate이 자동 적용.
// validator·renderer가 이 규칙을 참조하면 새 role 추가 시 한 곳만 갱신.
// =====================================================================
export const DEFAULT_BRANCH_RULES: Record<TemplateBranchRole, BranchRules> = {
  top_rail:                  { allowedComponentTypes: ["R", "L", "C", "V", "WIRE"], minNodeDegree: 2, layoutHint: "top_rail" },
  bottom_return:             { allowedComponentTypes: ["WIRE"], minNodeDegree: 2, layoutHint: "ground_local" },
  left_source_leg:           { allowedComponentTypes: ["V", "I"], requiredComponentTypes: ["V", "I"], minNodeDegree: 2, layoutHint: "leftmost" },
  right_source_leg:          { allowedComponentTypes: ["V", "I", "R"], minNodeDegree: 2, layoutHint: "rightmost" },
  input_source_leg:          { allowedComponentTypes: ["V"], requiredComponentTypes: ["V"], minNodeDegree: 2, layoutHint: "leftmost" },
  dependent_source_leg:      { allowedComponentTypes: ["VCVS", "VCCS", "CCVS", "CCCS"], requiredComponentTypes: ["VCVS", "VCCS", "CCVS", "CCCS"], minNodeDegree: 2 },
  switching_leg:             { allowedComponentTypes: ["SW", "R", "L", "C", "I", "V"], requiredComponentTypes: ["SW"], minNodeDegree: 2 },
  load_leg:                  { allowedComponentTypes: ["R", "I", "L", "C"], minNodeDegree: 2, layoutHint: "rightmost" },
  opamp_block:               { allowedComponentTypes: ["OPAMP"], requiredComponentTypes: ["OPAMP"], minNodeDegree: 2, layoutHint: "center" },
  opamp_input_resistor:      { allowedComponentTypes: ["R", "C", "L"], requiredComponentTypes: ["R", "C", "L"], minNodeDegree: 2 },
  opamp_feedback_resistor:   { allowedComponentTypes: ["R", "C"], requiredComponentTypes: ["R"], minNodeDegree: 2, layoutHint: "feedback_loop" },
  cascade_coupling:          { allowedComponentTypes: ["R"], requiredComponentTypes: ["R"], minNodeDegree: 2 },
  ground_symbol:             { allowedComponentTypes: [], minNodeDegree: 1, layoutHint: "ground_local" },
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
      rules: DEFAULT_BRANCH_RULES[b.templateRole],
    });
    id++;
  }

  return { template, topNodes, groundNode };
}

// =====================================================================
// validateBranchTemplate — branch들이 도메인 규칙을 따르는지 검사.
// 회로 생성 단계의 결정론 invariant. 위반 시 GPT 재시도 또는 generator fix 신호.
// =====================================================================
export function validateBranchTemplate(branches: BranchTemplate[]): BranchTemplateValidation {
  const issues: BranchTemplateValidation["issues"] = [];

  // Rule 1: 각 branch의 component type이 rules.allowedComponentTypes 안에 있는지
  for (const b of branches) {
    const rules = b.rules ?? DEFAULT_BRANCH_RULES[b.role];
    if (!rules) continue;
    if (rules.allowedComponentTypes && rules.allowedComponentTypes.length > 0) {
      for (const c of b.components) {
        if (!rules.allowedComponentTypes.includes(c.type)) {
          issues.push({
            branchId: b.id,
            rule: "component_type_not_allowed",
            message: `${b.id} (role=${b.role}): component type "${c.type}"는 허용 enum [${rules.allowedComponentTypes.join(",")}]에 없음`,
          });
        }
      }
    }
    if (rules.requiredComponentTypes && rules.requiredComponentTypes.length > 0) {
      const present = new Set(b.components.map((c) => c.type));
      const hasAny = rules.requiredComponentTypes.some((t) => present.has(t));
      if (!hasAny) {
        issues.push({
          branchId: b.id,
          rule: "required_component_missing",
          message: `${b.id} (role=${b.role}): 필수 component type 중 하나 필요 [${rules.requiredComponentTypes.join("|")}], 실제=[${[...present].join(",")}]`,
        });
      }
    }
  }

  // Rule 2: switching_leg는 SW 포함 + vertical
  for (const b of branches) {
    if (b.role !== "switching_leg") continue;
    if (b.orientation !== "vertical") {
      issues.push({ branchId: b.id, rule: "switching_leg_orientation", message: `${b.id}: switching_leg는 반드시 vertical (현재 ${b.orientation})` });
    }
    if (!b.components.some((c) => c.type === "SW")) {
      issues.push({ branchId: b.id, rule: "switching_leg_no_sw", message: `${b.id}: switching_leg에 SW component 누락` });
    }
  }

  // Rule 3: opamp_block은 3-pin 가정 — instantiate 단계에서 별도 검증 필요하지만 type 강제
  for (const b of branches) {
    if (b.role !== "opamp_block") continue;
    if (!b.components.some((c) => c.type === "OPAMP")) {
      issues.push({ branchId: b.id, rule: "opamp_block_no_opamp", message: `${b.id}: opamp_block에 OPAMP component 누락` });
    }
  }

  // Rule 4: top_rail/bottom_return은 horizontal, vertical leg-류는 vertical
  // dependent_source_leg는 의미상 leg지만 CCVS in series처럼 horizontal로도 들어감 — 제외.
  const VERTICAL_ROLES: TemplateBranchRole[] = [
    "left_source_leg", "right_source_leg", "input_source_leg",
    "switching_leg", "load_leg",
  ];
  const HORIZONTAL_ROLES: TemplateBranchRole[] = ["top_rail", "bottom_return"];
  for (const b of branches) {
    if (HORIZONTAL_ROLES.includes(b.role) && b.orientation !== "horizontal") {
      issues.push({ branchId: b.id, rule: `${b.role}_orientation`, message: `${b.id}: ${b.role}은 horizontal (현재 ${b.orientation})` });
    }
    if (VERTICAL_ROLES.includes(b.role) && b.orientation !== "vertical") {
      issues.push({ branchId: b.id, rule: "leg_orientation", message: `${b.id} (role=${b.role}): vertical 필요 (현재 ${b.orientation})` });
    }
  }

  // Rule 5: node degree — 모든 node가 적어도 2개 branch에 등장 (회로 완결성, bottom_return 제외)
  const degree = new Map<string, number>();
  for (const b of branches) {
    degree.set(b.fromNode, (degree.get(b.fromNode) ?? 0) + 1);
    degree.set(b.toNode, (degree.get(b.toNode) ?? 0) + 1);
  }
  for (const [node, deg] of degree) {
    if (deg < 2) {
      issues.push({ rule: "node_dangling", message: `node "${node}"가 1개 branch에만 등장 (degree ${deg} — 회로 완결성 위반)` });
    }
  }

  // Rule 6: pairWithBranchId 정합성 — sibling 관계가 박혀있으면 해당 branch가 존재해야
  const branchIds = new Set(branches.map((b) => b.id));
  for (const b of branches) {
    if (b.rules?.pairWithBranchId && !branchIds.has(b.rules.pairWithBranchId)) {
      issues.push({ branchId: b.id, rule: "pair_branch_missing", message: `${b.id} rules.pairWithBranchId="${b.rules.pairWithBranchId}"가 존재하지 않음` });
    }
  }

  return { ok: issues.length === 0, issues };
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
      const id = req.idOverride ?? makeComponentId(req.type, req.role);
      // WIRE·OPAMP·BJT·MOSFET·SW — value 없는 component. value lookup skip.
      //   SW: 시각적으로 스위치 심볼만 그려지면 됨. value 대신 state(open/closed)만 의미.
      if (req.type === "WIRE" || req.type === "OPAMP" || req.type === "BJT" || req.type === "MOSFET" || req.type === "SW") {
        return { id, type: req.type, role: req.role };
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
        id,
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
    // ★ opamp_block: 3-pin OPAMP component. fromNode/toNode chain 모델 우회.
    if (b.role === "opamp_block" && b.opampNodes) {
      for (const c of b.instantiated) {
        if (c.type !== "OPAMP") continue;
        components.push({
          id: c.id,
          type: "OPAMP",
          pins: [
            { id: "p1", node: b.opampNodes.vp, side: "left", role: "non_inverting" },
            { id: "p2", node: b.opampNodes.vn, side: "left", role: "inverting" },
            { id: "p3", node: b.opampNodes.vo, side: "right" },
          ],
        });
      }
      continue;
    }

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
