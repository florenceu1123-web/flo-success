import type {
  BranchRole,
  CircuitComponent,
  CircuitNetlist,
  GenerationMode,
  TopologySignature,
} from "@/types";
import { solveMNA, type SolverNetwork, type SolverResult } from "@/lib/solver/mna";
import { makeRand, NICE_CURRENTS, NICE_RESISTORS, NICE_VOLTAGES, pick, round3 } from "../topologies/_helpers";
import { parseValue } from "./parseValue";

/**
 * Topology-driven generator — analyze가 추출한 TopologySignature.branches를 그대로 따라
 *  결정론 netlist 1개(+ SW open/closed 두 상태 회로) + MNA 솔버 결과를 만든다.
 *
 *  핵심 매핑 가정:
 *   - top_rail_resistor 개수 K → top node 라벨 n0, n1, ..., nK (K+1개)
 *   - vertical leg-류 branches (voltage_source_leg/current_source_leg/dependent_source_leg/
 *     switching_leg/load_leg/shared_supermesh_branch)는 branches 등장 순서대로
 *     n0, n1, ..., n_{vertCount-1} 에 attach.
 *   - mesh_only_branch는 top rail에 끼어있는 horizontal V (Thevenin류) — 추후 보강.
 *   - 한 node에 leg가 두 개 이상 attach되는 케이스(예: V1에 V·dep 둘 다)는 MVP에선 미지원.
 *     vertCount > top nodes면 초과분은 last node에 병렬 부착.
 *   - bottom_rail_wire는 무시 (GND wire는 솔버에서 묵시적).
 *
 *  SW 두 상태:
 *   - hasSwitch=true 이면 switching_leg에서 SW만 제거(open=절단된 leg 모델: 해당 leg는 netlist 유지하되
 *     solver-side에선 그 component chain을 분리) vs 그대로(closed) 두 회로를 생성.
 *   - 본 MVP는 simple approach: open 상태에선 switching_leg 전체를 솔버에서 제외.
 */

export type TopologyDrivenGeneration = {
  /** SW open 상태 회로 (SW 없으면 main 회로) */
  netlistOpen: CircuitNetlist;
  /** SW closed 상태 회로 — SW가 있을 때만, 없으면 null */
  netlistClosed: CircuitNetlist | null;
  solverNetOpen: SolverNetwork;
  solverNetClosed: SolverNetwork | null;
  solutionOpen: SolverResult;
  solutionClosed: SolverResult | null;
  /** measure-friendly 결과 — node voltage + branch current (양수 = a→b) */
  branchCurrentsOpen: Record<string, number>;
  branchCurrentsClosed: Record<string, number> | null;
  /** GPT prompt 노출용 — 사용된 값들 */
  values: Record<string, number>;
  /** topology에 SW가 있었는가 */
  hasSwitch: boolean;
  /** topology에 종속전원이 있었는가 */
  hasDependentSource: boolean;
  /** supermesh 패턴인가 */
  isSupermesh: boolean;
};

const TOP_PREFIX = "n";
const GND = "GND";

const VERTICAL_LEG_ROLES = new Set<string>([
  "voltage_source_leg",
  "current_source_leg",
  "dependent_source_leg",
  "switching_leg",
  "load_leg",
  "shared_supermesh_branch",
]);

export function buildFromTopology(args: {
  topology: TopologySignature;
  mode: GenerationMode;
  seed?: number;
}): TopologyDrivenGeneration {
  const { topology, mode, seed } = args;
  const rand = makeRand(seed);

  // ── 0) Planar normalize — branch에 GND endpoint가 있으면 horizontal일 수 없음.
  //   role을 component 종류에 맞는 vertical leg로 강제 변환. GPT의 role 오기 흡수.
  //   동일 (role, betweenNodes 정규화, component fingerprint) branch는 dedupe.
  const isGndLikeStr = (n: string) => n === GND || n.toLowerCase() === "ground" || n === "0";
  const normalizedBranches = topology.branches.map((b) => {
    if (!b.betweenNodes) return b;
    const [a, c] = b.betweenNodes;
    const hasGnd = isGndLikeStr(a) || isGndLikeStr(c);
    if (!hasGnd) return b;
    // horizontal-style role이 GND를 포함하면 → vertical leg로 normalize.
    if (b.role === "top_rail_resistor" || b.role === "mesh_only_branch") {
      const types = b.components.map((x) => (x.type ?? "").toUpperCase());
      const newRole: BranchRole =
        types.some((t) => t === "V" || t === "VS") ? "voltage_source_leg"
        : types.some((t) => t === "I" || t === "IS") ? "current_source_leg"
        : types.some((t) => t === "SW") ? "switching_leg"
        : types.some((t) => ["VCCS","VCVS","CCCS","CCVS"].includes(t)) ? "dependent_source_leg"
        : "load_leg";
      // betweenNodes 정규화: GND는 항상 두 번째 위치.
      const top = isGndLikeStr(a) ? c : a;
      return { ...b, role: newRole, betweenNodes: [top, GND] as [string, string] };
    }
    return b;
  });
  // 명시적 평행 branch (같은 betweenNodes·같은 component 두 번) 보존 — 사용자가
  //   의도적으로 2개의 동일 R을 평행으로 두는 케이스 지원. dedupe 시도 시 평행 가지가
  //   하나로 줄어 mesh count·해석 결과가 모두 어긋남. 입력 신뢰 원칙.
  const dedupedBranches = normalizedBranches;
  const effectiveTopology: TopologySignature = { ...topology, branches: dedupedBranches };

  // ── 1) branches 분류 ────────────────────────────────────
  // horizontal branches: top_rail_resistor + mesh_only_branch (top rail에 끼인 V/R 등)
  //   mesh_only_branch는 Thevenin·등가회로의 horizontal V source가 흔히 들어가는 자리.
  const horizontalBranches = effectiveTopology.branches.filter(
    (b) => b.role === "top_rail_resistor" || b.role === "mesh_only_branch",
  );
  const verticalLegs = effectiveTopology.branches.filter((b) => VERTICAL_LEG_ROLES.has(b.role));

  // ── 2) 노드 라벨 결정 ───────────────────────────────────
  // horizontal branches 개수 K → top node K+1개. 마지막 1개만 GND alias (ladder의
  // ground rail 묵시 가정). 이전엔 leg 부족분을 모두 GND alias로 만들어 horizontal
  // branch 양 끝이 (GND, GND)가 되어 contradiction(singular) 발생 → 수정.
  const railNodes: string[] = [];
  const topNodesCount = horizontalBranches.length + 1;
  for (let i = 0; i < topNodesCount; i++) {
    const isLast = i === topNodesCount - 1;
    if (isLast && verticalLegs.length < topNodesCount) {
      railNodes.push(GND);
    } else {
      railNodes.push(`${TOP_PREFIX}${i}`);
    }
  }
  if (verticalLegs.length === 0 && railNodes.length > 0) railNodes[0] = `${TOP_PREFIX}0`;

  // ★ betweenNodes로 명시된 추가 노드 — railNodes에 병합 (parallel branch·4-mesh 지원).
  for (const b of effectiveTopology.branches) {
    if (!b.betweenNodes) continue;
    for (const n of b.betweenNodes) {
      const isGndLike = n === GND || n.toLowerCase() === "ground" || n === "0";
      if (isGndLike) continue;
      if (!railNodes.includes(n)) railNodes.push(n);
    }
  }

  // control ref 매핑 — "V1"·"V2" 등 leg attach node 라벨에 대응
  const controlRefMap = new Map<string, string>();
  verticalLegs.forEach((_, i) => {
    const nodeIdx = Math.min(i, railNodes.length - 1);
    controlRefMap.set(`V${i + 1}`, railNodes[nodeIdx]);
  });

  // ── 3) value 결정 (mode별 변형 폭 추후 보강 — 일단 동일) ─
  const valueRand = (raw: string | number | undefined, fallback: number[]): number => {
    const parsed = parseValue(raw);
    if (parsed && Number.isFinite(parsed.numeric)) {
      // exam_similar/exam_variant 무관 — MVP는 원본 값 그대로 유지
      void mode;
      return parsed.numeric;
    }
    return pick(fallback, rand);
  };

  // ── 4) component 및 solver-side 구성 ────────────────────
  const usedValues: Record<string, number> = {};
  const components: CircuitComponent[] = [];
  const solverComponents = {
    resistors: [] as SolverNetwork["resistors"],
    vsources: [] as SolverNetwork["vsources"],
    isources: [] as SolverNetwork["isources"],
    vccs: [] as NonNullable<SolverNetwork["vccs"]>,
    vcvs: [] as NonNullable<SolverNetwork["vcvs"]>,
  };
  // switching_leg에 속하는 solver-component id 목록 (open 상태에선 제외)
  const switchingSolverIds: Set<string> = new Set();
  // switching_leg가 만들어낸 mid 노드들 — open 상태에선 이 노드들도 nodeIds에서 제외해야 floating 방지
  const switchingLegNodes: Set<string> = new Set();

  // 4a) horizontal branches
  //   branch.betweenNodes가 설정되어 있으면 그 명시 노드 쌍 사용 (parallel 지원).
  //   미설정이면 legacy 순차 배치 (railNodes[i]-railNodes[i+1]).
  //   sequential 인덱스는 betweenNodes 없는 branch에만 부여.
  const normalizeNode = (n: string): string => {
    if (n === GND) return GND;
    if (n.toLowerCase() === "ground" || n === "0") return GND;
    return n;
  };
  let sequentialIdx = 0;
  let horizCounter = 0;
  horizontalBranches.forEach((b) => {
    let a: string;
    let c: string;
    if (b.betweenNodes) {
      a = normalizeNode(b.betweenNodes[0]);
      c = normalizeNode(b.betweenNodes[1]);
    } else {
      a = railNodes[sequentialIdx];
      c = railNodes[sequentialIdx + 1] ?? GND;
      sequentialIdx += 1;
    }
    horizCounter += 1;
    const idSuffix = `${horizCounter}`;
    const horizBefore = components.length;
    b.components.forEach((comp, ci) => {
      const t = comp.type.toUpperCase();
      if (t === "R" && b.role === "top_rail_resistor") {
        const id = `R_top${idSuffix}${ci > 0 ? `_${ci + 1}` : ""}`;
        const R = valueRand(comp.value, NICE_RESISTORS);
        usedValues[id] = R;
        components.push({
          id, type: "R", value: `${R}Ω`,
          pins: [{ id: "p1", node: a, side: "left" }, { id: "p2", node: c, side: "right" }],
        });
        solverComponents.resistors.push({ id, a, b: c, R });
      } else {
        const idBase = `${t}_horiz${idSuffix}${ci > 0 ? `_${ci + 1}` : ""}`;
        addComponent(comp, idBase, a, c, valueRand, usedValues, components, solverComponents, controlRefMap, false, switchingSolverIds);
      }
    });
    void horizBefore;
  });

  // 4b) vertical legs — branch.betweenNodes 설정되어 있으면 그 top 노드 사용, 아니면 순차 attach.
  let intermediateNodeCounter = 0;
  let verticalSeqIdx = 0;
  verticalLegs.forEach((leg, idx) => {
    let topNode: string;
    if (leg.betweenNodes) {
      topNode = normalizeNode(leg.betweenNodes[0]);
    } else {
      const attachIdx = Math.min(verticalSeqIdx, railNodes.length - 1);
      topNode = railNodes[attachIdx];
      verticalSeqIdx += 1;
    }
    const legIdx = idx; // id 명명용 — 항상 안정
    const legIsSwitching = leg.role === "switching_leg";
    const chainLength = leg.components.length;
    const componentsBeforeLeg = components.length;

    // chain: topNode → mid_1 → mid_2 → ... → GND
    let prevNode = topNode;
    leg.components.forEach((comp, ci) => {
      const isLast = ci === chainLength - 1;
      const nextNode = isLast ? GND : `mid_${legIdx + 1}_${++intermediateNodeCounter}`;
      const idBase = `${comp.type}_leg${legIdx + 1}_${ci + 1}`;
      if (legIsSwitching && nextNode !== GND) switchingLegNodes.add(nextNode);
      addComponent(comp, idBase, prevNode, nextNode, valueRand, usedValues, components, solverComponents, controlRefMap, legIsSwitching, switchingSolverIds);
      prevNode = nextNode;
    });

    // ★ chain이 2개 이상 component이면 (mid 노드 존재) 각 component에 legRoot 마킹.
    //   renderer가 mid↔mid component를 horizontal로 오분류하지 않고 이 leg의 vertical
    //   chain으로 그리도록.
    if (chainLength >= 2) {
      for (let k = componentsBeforeLeg; k < components.length; k++) {
        components[k].legRoot = topNode;
      }
    }
  });

  // 4c) mesh_only_branch는 이제 horizontalBranches에 통합되어 4a 단계에서 처리됨.

  // 4d) Dangling node 자동 처리 — GPT가 leaf component를 추출했지만 닫는 연결이 빠진 경우.
  //   degree 1 노드를 GND로 rename → 원래 의도가 "top→GND vertical leg"였을 가능성이 높음.
  //   solver도 일관되게 GND로 처리해 floating pin 검증 통과.
  //   ★ 단, 입력 branches가 모두 명시적 betweenNodes를 가졌으면 사용자가 의도한 topology이므로
  //     remap 비활성 — n_right처럼 끝 column이 정상적으로 degree=1인 케이스를 보존해야 함.
  //     remap 결과 발생할 component 중복(R_top4 + R_leg3_1)으로 시각적 overlap 발생 방지.
  const allHaveBetweenNodes = effectiveTopology.branches.every((b) => Array.isArray(b.betweenNodes) && b.betweenNodes.length === 2);
  if (!allHaveBetweenNodes) {
    const degree = new Map<string, number>();
    for (const c of components) {
      for (const p of c.pins ?? []) {
        if (!p.node || p.node === GND) continue;
        degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
      }
    }
    const remap = new Map<string, string>();
    for (const [node, deg] of degree) {
      if (deg === 1) remap.set(node, GND);
    }
    if (remap.size > 0) {
      // components의 pins 노드 교체
      for (const c of components) {
        for (const p of c.pins ?? []) {
          if (remap.has(p.node)) p.node = remap.get(p.node)!;
        }
      }
      // solver networks도 교체
      const remapNode = (n: string) => remap.get(n) ?? n;
      solverComponents.resistors = solverComponents.resistors.map((r) => ({ ...r, a: remapNode(r.a), b: remapNode(r.b) }));
      solverComponents.vsources = solverComponents.vsources.map((v) => ({ ...v, a: remapNode(v.a), b: remapNode(v.b) }));
      solverComponents.isources = solverComponents.isources.map((i) => ({ ...i, a: remapNode(i.a), b: remapNode(i.b) }));
    }
  }

  // ── 4e) Component dedupe — DISABLED.
  //   이전엔 동일 (type·value·pins) 컴포넌트를 중복으로 간주해 제거했으나, 명시적
  //   평행 branch(같은 두 노드 사이 동일 R 두 개)가 사라져 mesh count·해석 결과가
  //   어긋남. 입력 신뢰 원칙으로 dedupe 비활성. GPT 출력이 잘못된 중복이라면 prompt
  //   단계에서 해결할 것.
  if (false) {
    const seen = new Set<string>();
    const kept: typeof components = [];
    const removedIds = new Set<string>();
    for (const c of components) {
      const nodes = c.pins.map((p) => p.node).sort().join("|");
      const key = `${c.type}|${c.value ?? ""}|${nodes}`;
      if (seen.has(key)) {
        removedIds.add(c.id);
        continue;
      }
      seen.add(key);
      kept.push(c);
    }
    if (removedIds.size > 0) {
      components.splice(0, components.length, ...kept);
      solverComponents.resistors = solverComponents.resistors.filter((r) => !removedIds.has(r.id));
      solverComponents.vsources = solverComponents.vsources.filter((v) => !removedIds.has(v.id));
      solverComponents.isources = solverComponents.isources.filter((i) => !removedIds.has(i.id));
      solverComponents.vccs = solverComponents.vccs.filter((v) => !removedIds.has(v.id));
      solverComponents.vcvs = solverComponents.vcvs.filter((v) => !removedIds.has(v.id));
      for (const id of removedIds) delete usedValues[id];
    }
  }

  // ── 5) SolverNetwork 두 가지 (open / closed) ─────────────
  const allNodes = new Set<string>();
  components.forEach((c) => c.pins.forEach((p) => { if (p.node !== GND) allNodes.add(p.node); }));
  const nodeIds = Array.from(allNodes);

  const baseNet: SolverNetwork = {
    nodeIds,
    groundId: GND,
    resistors: solverComponents.resistors,
    vsources: solverComponents.vsources,
    isources: solverComponents.isources,
    vccs: solverComponents.vccs.length ? solverComponents.vccs : undefined,
    vcvs: solverComponents.vcvs.length ? solverComponents.vcvs : undefined,
  };

  const hasSwitch = switchingSolverIds.size > 0;
  // closed: 그대로 (SW는 addComponent에서 1mΩ resistor로 솔버에 추가됨)
  const solverNetClosed: SolverNetwork = baseNet;
  // open: switching_leg의 모든 solver component + mid 노드 제외
  const solverNetOpen: SolverNetwork = hasSwitch
    ? {
        ...baseNet,
        nodeIds:   baseNet.nodeIds.filter((n) => !switchingLegNodes.has(n)),
        resistors: baseNet.resistors.filter((r) => !switchingSolverIds.has(r.id)),
        vsources:  baseNet.vsources.filter((v) => !switchingSolverIds.has(v.id)),
        isources:  baseNet.isources.filter((i) => !switchingSolverIds.has(i.id)),
        vccs:      baseNet.vccs?.filter((d) => !switchingSolverIds.has(d.id)),
        vcvs:      baseNet.vcvs?.filter((d) => !switchingSolverIds.has(d.id)),
      }
    : baseNet;

  // ── 6) solve ────────────────────────────────────────────
  //   AC pipeline 등 L/C가 있는 회로는 DC 솔버가 singular matrix 던질 수 있음.
  //   solveMNA가 실패하면 빈 결과로 fallback해서 netlist는 사용 가능하게 함.
  let solutionOpen: SolverResult;
  let solutionClosed: SolverResult | null;
  try {
    solutionOpen = solveMNA(solverNetOpen);
  } catch {
    solutionOpen = { nodeVoltages: {}, vsourceCurrents: {} };
  }
  try {
    solutionClosed = hasSwitch ? solveMNA(solverNetClosed) : null;
  } catch {
    solutionClosed = null;
  }

  const branchCurrentsOpen = computeBranchCurrents(solverNetOpen, solutionOpen);
  const branchCurrentsClosed = hasSwitch && solutionClosed
    ? computeBranchCurrents(solverNetClosed, solutionClosed)
    : null;

  // ── 7) netlist (open/closed) — netlist 자체는 동일, 시각화 단계에서 SW 위치만 다르게 ─
  const netlistOpen: CircuitNetlist = { components, ground: GND };
  const netlistClosed: CircuitNetlist | null = hasSwitch ? netlistOpen : null;

  return {
    netlistOpen,
    netlistClosed,
    solverNetOpen,
    solverNetClosed,
    solutionOpen,
    solutionClosed,
    branchCurrentsOpen,
    branchCurrentsClosed,
    values: usedValues,
    hasSwitch,
    hasDependentSource: solverComponents.vccs.length + solverComponents.vcvs.length > 0,
    isSupermesh: Boolean(effectiveTopology.features.hasSupermesh) && horizontalBranches.length >= 2,
  };
}

function addComponent(
  comp: { type: string; value?: string | number },
  idBase: string,
  a: string,
  b: string,
  valueRand: (raw: string | number | undefined, fallback: number[]) => number,
  usedValues: Record<string, number>,
  components: CircuitComponent[],
  solver: {
    resistors: SolverNetwork["resistors"];
    vsources: SolverNetwork["vsources"];
    isources: SolverNetwork["isources"];
    vccs: NonNullable<SolverNetwork["vccs"]>;
    vcvs: NonNullable<SolverNetwork["vcvs"]>;
  },
  controlRefMap: Map<string, string>,
  belongsToSwitching: boolean,
  switchingIds: Set<string>,
): void {
  const t = comp.type.toUpperCase();
  const id = idBase;

  if (t === "SW") {
    // 시각화용 SW component
    components.push({
      id, type: "SW",
      pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }],
    });
    // closed 상태 솔버: SW를 1mΩ wire-equivalent로 추가. MNA는 R>0만 허용.
    // open 상태에선 switchingSolverIds로 제외 → leg 단선.
    solver.resistors.push({ id, a, b, R: 1e-3 });
    if (belongsToSwitching) switchingIds.add(id);
    return;
  }

  if (t === "R") {
    const R = valueRand(comp.value, NICE_RESISTORS);
    usedValues[id] = R;
    components.push({
      id, type: "R", value: `${R}Ω`,
      pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }],
    });
    solver.resistors.push({ id, a, b, R });
    if (belongsToSwitching) switchingIds.add(id);
    return;
  }

  if (t === "V" || t === "VS") {
    const Vraw = valueRand(comp.value, NICE_VOLTAGES);
    // 음수 값은 단자 swap으로 흡수 — 그림은 양수 + 극성 반전된 +/- 단자.
    //   ★ 단, 한 단자가 GND인 경우(ground-referenced) swap 금지 — +단자가 GND가 되면
    //     topology semantics 깨짐 (V·+ = 0V로 detector·validator가 short으로 오해).
    //     이 경우 값 부호를 그대로 유지 (solver는 음수 V로 정확히 풀이).
    const aIsGnd = a === GND, bIsGnd = b === GND;
    const isGroundReferenced = aIsGnd || bIsGnd;
    const flip = Vraw < 0 && !isGroundReferenced;
    const V = flip ? Math.abs(Vraw) : Vraw;
    const [na, nb] = flip ? [b, a] : [a, b];
    usedValues[id] = V;
    components.push({
      id, type: "V", value: `${V}V`,
      pins: [
        { id: "p1", node: na, side: "top", role: "positive" },
        { id: "p2", node: nb, side: "bottom", role: "negative" },
      ],
    });
    solver.vsources.push({ id, a: na, b: nb, V });
    if (belongsToSwitching) switchingIds.add(id);
    return;
  }

  if (t === "I" || t === "IS") {
    const Iraw = valueRand(comp.value, NICE_CURRENTS);
    // 음수 값은 단자 swap으로 흡수 — 그림은 양수 + 화살표 방향 반전.
    //   ★ 단, GND-referenced I 소스는 swap 금지 (V와 동일 이유).
    const aIsGndI = a === GND, bIsGndI = b === GND;
    const isGroundReferencedI = aIsGndI || bIsGndI;
    const flipI = Iraw < 0 && !isGroundReferencedI;
    const I = flipI ? Math.abs(Iraw) : Iraw;
    const [na, nb] = flipI ? [b, a] : [a, b];
    usedValues[id] = I;
    components.push({
      id, type: "I", value: `${I}A`,
      pins: [{ id: "p1", node: na, side: "top" }, { id: "p2", node: nb, side: "bottom" }],
    });
    solver.isources.push({ id, a: na, b: nb, I });
    if (belongsToSwitching) switchingIds.add(id);
    return;
  }

  if (t === "VCCS") {
    const parsed = parseValue(comp.value);
    const g = parsed?.numeric ?? 0.2;
    const controlNode = parsed?.controlRef ? (controlRefMap.get(parsed.controlRef) ?? a) : a;
    usedValues[id] = g;
    components.push({
      id, type: "VCCS",
      gain: g,
      control: parsed?.controlRef ?? "",
      pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }],
    });
    solver.vccs.push({ id, a, b, vca: controlNode, vcb: GND, g });
    if (belongsToSwitching) switchingIds.add(id);
    return;
  }

  if (t === "VCVS") {
    const parsed = parseValue(comp.value);
    const k = parsed?.numeric ?? 0.5;
    const controlNode = parsed?.controlRef ? (controlRefMap.get(parsed.controlRef) ?? a) : a;
    usedValues[id] = k;
    components.push({
      id, type: "VCVS",
      gain: k,
      control: parsed?.controlRef ?? "",
      pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }],
    });
    solver.vcvs.push({ id, a, b, vca: controlNode, vcb: GND, k });
    if (belongsToSwitching) switchingIds.add(id);
    return;
  }

  // L · C — DC solver 미지원, 그러나 visual component로는 추가 (AC pipeline이 netlistToComplex로 사용).
  if (t === "L") {
    const Lraw = comp.value ?? "100mH";
    components.push({
      id, type: "L", value: `${Lraw}`,
      pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }],
    });
    return;
  }
  if (t === "C") {
    const Craw = comp.value ?? "1μF";
    components.push({
      id, type: "C", value: `${Craw}`,
      pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }],
    });
    return;
  }

  // 미지원(CCVS, CCCS 등) — MVP에선 무시. 정답은 supported 소자만으로 풀이.
}

function computeBranchCurrents(net: SolverNetwork, sol: SolverResult): Record<string, number> {
  const out: Record<string, number> = {};
  const v = (n: string): number => (n === net.groundId ? 0 : sol.nodeVoltages[n] ?? 0);
  for (const r of net.resistors) {
    out[r.id] = round3((v(r.a) - v(r.b)) / r.R);
  }
  for (const vs of net.vsources) {
    out[vs.id] = round3(sol.vsourceCurrents[vs.id] ?? 0);
  }
  for (const is of net.isources) {
    out[is.id] = round3(is.I);
  }
  return out;
}
