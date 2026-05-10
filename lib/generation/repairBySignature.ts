import type {
  CircuitComponent,
  CircuitComponentType,
  CircuitNetlist,
  FigureVariant,
  GeneratedProblem,
  StructureSignature,
} from "@/types";
import { normalizeTerminalAnalogNetwork } from "./analogNormalizer";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

// =====================================================================
// repair-first: 자유 GPT 생성 → 구조 차이 검사 → 부족분만 보정 → 재검증.
//   ensureRequiredFigures
//   ensureRequiredTerminals
//   restoreMissingComponentCounts
//   normalizeSourcePlacement
//   normalizeMeasurementOverlays
// =====================================================================

export function repairBySignature(
  candidate: GeneratedProblem,
  signature: StructureSignature | undefined,
): GeneratedProblem {
  if (!signature) return candidate;
  let repaired = structuredClone(candidate);

  repaired = ensureRequiredFigures(repaired, signature);
  repaired = ensureRequiredTerminals(repaired, signature);
  repaired = restoreMissingComponentCounts(repaired, signature);
  repaired = normalizeSourcePlacement(repaired);
  repaired = normalizeMeasurementOverlays(repaired);

  return repaired;
}

/** 여러 problem 일괄 처리 */
export function repairProblemsBySignature(
  problems: GeneratedProblem[],
  signature: StructureSignature | undefined,
): void {
  if (!signature) return;
  for (let i = 0; i < problems.length; i++) {
    problems[i] = repairBySignature(problems[i], signature);
  }
}

// =====================================================================
// 1) ensureRequiredFigures — 누락 figure role을 stub으로 추가
// =====================================================================
function ensureRequiredFigures(
  candidate: GeneratedProblem,
  signature: StructureSignature,
): GeneratedProblem {
  const reqs = signature.figureRequirements ?? [];
  if (reqs.length === 0) return candidate;

  const figures = candidate.figureVariants ?? [];
  const presentRoles = new Set(figures.map((f) => f.role));

  for (const req of reqs) {
    if (!req.required) continue;
    if (presentRoles.has(req.role)) continue;

    figures.push({
      id: `fig_${req.role}`,
      label: req.role,
      role: req.role,
      diagramType: req.diagramType as FigureVariant["diagramType"],
      diagram: createStubDiagram(req.diagramType, figures),
    });
    presentRoles.add(req.role);
  }
  candidate.figureVariants = figures;
  return candidate;
}

function createStubDiagram(diagramType: string, existing: FigureVariant[]): unknown {
  if (diagramType === "analog_netlist" || diagramType === "analog_mesh_network") {
    const main = existing.find(
      (f) => f.diagramType === "analog_netlist" || f.diagramType === "analog_mesh_network",
    );
    if (main?.diagram) return structuredClone(main.diagram);
    return { components: [], ground: "GND" };
  }
  if (diagramType === "logic_network") return { inputs: [], outputs: [], gates: [] };
  if (diagramType === "kmap") return { variables: [], rows: [] };
  if (diagramType === "waveform") return { signals: [] };
  if (diagramType === "truth_table") return { variables: [], rows: [] };
  if (diagramType === "concept_diagram") return { nodes: [], edges: [] };
  return {};
}

// =====================================================================
// 2) ensureRequiredTerminals — Thevenin context면 a/b 자동 부여
// =====================================================================
function ensureRequiredTerminals(
  candidate: GeneratedProblem,
  signature: StructureSignature,
): GeneratedProblem {
  const text = problemText(candidate);
  for (const f of candidate.figureVariants ?? []) {
    if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
    const netlist = f.diagram as CircuitNetlist | undefined;
    if (!netlist) continue;
    // analogNormalizer가 a/b 단자를 보장 (ensureTerminalsAB 포함)
    normalizeTerminalAnalogNetwork(netlist, text);
  }
  return candidate;
}

// =====================================================================
// 3) restoreMissingComponentCounts — 부족한 type만큼 자동 추가
// =====================================================================
function restoreMissingComponentCounts(
  candidate: GeneratedProblem,
  signature: StructureSignature,
): GeneratedProblem {
  const expected = signature.componentCounts ?? {};
  if (Object.keys(expected).length === 0) return candidate;

  const actual = countComponents(candidate);

  for (const [type, expectedCount] of Object.entries(expected)) {
    const missing = (expectedCount ?? 0) - (actual[type.toUpperCase()] ?? 0);
    for (let i = 0; i < missing; i++) {
      insertReasonableComponent(candidate, type.toUpperCase());
    }
  }
  return candidate;
}

function countComponents(candidate: GeneratedProblem): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of candidate.figureVariants ?? []) {
    if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
    const netlist = f.diagram as CircuitNetlist | undefined;
    if (!netlist?.components) continue;
    for (const c of netlist.components) {
      const t = (c.type ?? "").toUpperCase();
      if (t === "GND" || t === "WIRE") continue;
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}

const ID_PREFIX_MAP: Record<string, string> = {
  R: "R", L: "L", C: "C", D: "D",
  V: "V", I: "I", SW: "SW",
  VCVS: "E", CCVS: "H", VCCS: "G", CCCS: "F",
};

function insertReasonableComponent(candidate: GeneratedProblem, type: string): void {
  // 첫 번째 analog netlist figure에 추가
  const fig = (candidate.figureVariants ?? []).find(
    (f) => f.diagramType === "analog_netlist" || f.diagramType === "analog_mesh_network",
  );
  if (!fig) return;
  const netlist = fig.diagram as CircuitNetlist | undefined;
  if (!netlist) return;
  if (!Array.isArray(netlist.components)) netlist.components = [];

  const T = type.toUpperCase();
  const prefix = ID_PREFIX_MAP[T] ?? T;
  const id = `${prefix}${nextIdNumber(netlist, prefix)}`;

  const groundIds = identifyGroundNodes(netlist);
  const groundNode = netlist.ground ?? [...groundIds][0] ?? "GND";
  netlist.ground = netlist.ground ?? groundNode;
  groundIds.add(groundNode);

  const topNodes = collectTopNodes(netlist, groundIds);

  if (T === "R" || T === "L" || T === "C") {
    // 인접한 두 top node 사이에 추가 (없으면 새 top 생성)
    if (topNodes.length >= 2) {
      const n1 = topNodes[topNodes.length - 2];
      const n2 = topNodes[topNodes.length - 1];
      netlist.components.push({
        id,
        type: T as CircuitComponentType,
        value: defaultValue(T),
        pins: [
          { id: "p1", node: n1, side: "left" },
          { id: "p2", node: n2, side: "right" },
        ],
      });
    } else {
      const baseTop = topNodes[0] ?? `n_top_extra_1`;
      const newTop = `n_top_extra_${Date.now() % 10000}`;
      netlist.components.push({
        id,
        type: T as CircuitComponentType,
        value: defaultValue(T),
        pins: [
          { id: "p1", node: baseTop, side: "left" },
          { id: "p2", node: newTop, side: "right" },
        ],
      });
    }
    return;
  }

  // V/I/SW/dep — vertical leg (top↔ground). top node가 없으면 새로 만듦
  const attachTop = topNodes[0] ?? `n_top_extra_1`;
  const comp: CircuitComponent = {
    id,
    type: T as CircuitComponentType,
    value: defaultValue(T),
    pins: [
      { id: "p1", node: attachTop, side: "top" },
      { id: "p2", node: groundNode, side: "bottom" },
    ],
  };
  if (T === "SW") comp.state = "open";
  if (T === "VCVS" || T === "VCCS" || T === "CCVS" || T === "CCCS") comp.gain = "0.1";
  netlist.components.push(comp);
}

function defaultValue(t: string): string | undefined {
  switch (t) {
    case "R": return "1kΩ";
    case "L": return "1mH";
    case "C": return "1μF";
    case "V": return "5V";
    case "I": return "1mA";
    default:  return undefined;
  }
}

function nextIdNumber(netlist: CircuitNetlist, prefix: string): number {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)`);
  for (const c of netlist.components ?? []) {
    const m = (c.id ?? "").match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function collectTopNodes(netlist: CircuitNetlist, groundIds: Set<string>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const c of netlist.components) {
    const t = (c.type ?? "").toUpperCase();
    if (t === "GND" || t === "WIRE") continue;
    for (const pin of c.pins ?? []) {
      if (!pin?.node) continue;
      if (groundIds.has(pin.node)) continue;
      if (!seen.has(pin.node)) {
        seen.add(pin.node);
        ordered.push(pin.node);
      }
    }
  }
  return ordered;
}

// =====================================================================
// 4) normalizeSourcePlacement — analogNormalizer 위임
// =====================================================================
function normalizeSourcePlacement(candidate: GeneratedProblem): GeneratedProblem {
  const text = problemText(candidate);
  for (const f of candidate.figureVariants ?? []) {
    if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
    const netlist = f.diagram as CircuitNetlist | undefined;
    if (!netlist) continue;
    normalizeTerminalAnalogNetwork(netlist, text);
  }
  return candidate;
}

// =====================================================================
// 5) normalizeMeasurementOverlays — overlay 정리 (renderer 측 collision avoidance가 주 처리)
// =====================================================================
function normalizeMeasurementOverlays(candidate: GeneratedProblem): GeneratedProblem {
  // 현재는 no-op. renderer의 routeOverlayPath/findFreeLabelPos가 layout 처리.
  // 향후 V_ab refs, R_L betweenNodes의 일관성 검증·자동 매핑 등 가능.
  return candidate;
}

// =====================================================================
// helpers
// =====================================================================
function problemText(candidate: GeneratedProblem): string {
  return [candidate.content, candidate.question, ...(candidate.conditions ?? [])].join(" ");
}

function identifyGroundNodes(netlist: CircuitNetlist): Set<string> {
  const ids = new Set<string>();
  if (netlist.ground) ids.add(netlist.ground);
  for (const c of netlist.components ?? []) {
    if ((c.type ?? "").toUpperCase() === "GND") {
      for (const pin of c.pins ?? []) if (pin?.node) ids.add(pin.node);
    }
    for (const pin of c.pins ?? []) {
      if (pin?.node && GROUND_LABELS.has(pin.node)) ids.add(pin.node);
    }
  }
  return ids;
}
