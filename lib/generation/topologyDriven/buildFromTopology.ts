import type {
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

  // ── 1) branches 분류 ────────────────────────────────────
  const topRailResistors = topology.branches.filter((b) => b.role === "top_rail_resistor");
  const verticalLegs = topology.branches.filter((b) => VERTICAL_LEG_ROLES.has(b.role));
  // mesh_only_branch (horizontal V 등)는 본 MVP에서 일반 vertical 처리 (추후 보강)
  const meshOnly = topology.branches.filter((b) => b.role === "mesh_only_branch");

  // ── 2) 노드 라벨 결정 ───────────────────────────────────
  // top rail R 개수 K → top node K+1개. 단 trailing(leg 없는) node는 GND로 alias —
  // 그 끝쪽에 ground rail로 떨어지는 wire가 있다는 ladder topology의 묵시적 가정.
  // (GPT topology가 bottom_rail_wire를 일관되게 추출 못 함 — 안전한 휴리스틱)
  const railNodes: string[] = [];
  for (let i = 0; i <= topRailResistors.length; i++) {
    railNodes.push(i < verticalLegs.length ? `${TOP_PREFIX}${i}` : GND);
  }
  // 단, leg가 한 개도 없는 극단 케이스(예: vertCount=0)는 fallback — 첫 node만 일반 node로
  if (verticalLegs.length === 0 && railNodes.length > 0) railNodes[0] = `${TOP_PREFIX}0`;

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

  // 4a) top rail resistors
  topRailResistors.forEach((b, i) => {
    const a = railNodes[i];
    const c = railNodes[i + 1];
    b.components.forEach((comp, ci) => {
      const id = `R_top${i + 1}${ci > 0 ? `_${ci + 1}` : ""}`;
      const R = valueRand(comp.value, NICE_RESISTORS);
      usedValues[id] = R;
      components.push({
        id, type: "R", value: `${R}Ω`,
        pins: [{ id: "p1", node: a, side: "left" }, { id: "p2", node: c, side: "right" }],
      });
      solverComponents.resistors.push({ id, a, b: c, R });
    });
  });

  // 4b) vertical legs — 순서대로 railNodes[i]에 부착, 직렬 chain은 intermediate node 생성
  let intermediateNodeCounter = 0;
  verticalLegs.forEach((leg, legIdx) => {
    const attachIdx = Math.min(legIdx, railNodes.length - 1);
    const topNode = railNodes[attachIdx];
    const legIsSwitching = leg.role === "switching_leg";
    const chainLength = leg.components.length;

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
  });

  // 4c) mesh_only_branch (horizontal V 등) — 현재 MVP: top rail의 인접 node 사이에 끼움
  // 단순화: 무시 (추후 보강 — Thevenin 등)
  void meshOnly;

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
  const solutionOpen = solveMNA(solverNetOpen);
  const solutionClosed = hasSwitch ? solveMNA(solverNetClosed) : null;

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
    isSupermesh: Boolean(topology.features.hasSupermesh) && topRailResistors.length >= 2,
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
    const V = valueRand(comp.value, NICE_VOLTAGES);
    usedValues[id] = V;
    components.push({
      id, type: "V", value: `${V}V`,
      pins: [
        { id: "p1", node: a, side: "top", role: "positive" },
        { id: "p2", node: b, side: "bottom", role: "negative" },
      ],
    });
    solver.vsources.push({ id, a, b, V });
    if (belongsToSwitching) switchingIds.add(id);
    return;
  }

  if (t === "I" || t === "IS") {
    const I = valueRand(comp.value, NICE_CURRENTS);
    usedValues[id] = I;
    components.push({
      id, type: "I", value: `${I}A`,
      pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }],
    });
    solver.isources.push({ id, a, b, I });
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

  // 미지원(CCVS, CCCS, C, L 등) — MVP에선 무시. 정답은 supported 소자만으로 풀이.
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
