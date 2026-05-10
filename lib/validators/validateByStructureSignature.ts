import type { StructureSignature } from "@/types";
import { validateIdTypeConsistencyStrict } from "./validateIdTypeConsistencyStrict";
import { aliasGroupKey, getAliasGroup, isMainCircuitRole, isStateRole } from "./figureRoleAliases";

type Candidate = { figureVariants?: unknown[] };

// =====================================================================
// Helpers
// =====================================================================
function hasFigure(candidate: Candidate, diagramType: string): boolean {
  return Boolean(
    (candidate.figureVariants ?? []).some(
      (f) => (f as { diagramType?: string })?.diagramType === diagramType,
    ),
  );
}

function hasOverlay(candidate: Candidate, overlay: string): boolean {
  return Boolean(
    (candidate.figureVariants ?? []).some(
      (f) => Array.isArray((f as { overlays?: string[] })?.overlays) && (f as { overlays?: string[] }).overlays!.includes(overlay),
    ),
  );
}

function hasBlankGate(candidate: Candidate): boolean {
  return Boolean(
    (candidate.figureVariants ?? []).some((f) => {
      const blanks = (f as { diagram?: { blanks?: unknown[] } })?.diagram?.blanks;
      return Array.isArray(blanks) && blanks.length > 0;
    }),
  );
}

function hasComponent(candidate: Candidate, types: string[]): boolean {
  for (const fig of candidate.figureVariants ?? []) {
    const d = (fig as { diagram?: { components?: Array<{ type?: string }>; gates?: Array<{ type?: string }> } })?.diagram;
    const components = d?.components ?? [];
    const gates = d?.gates ?? [];
    if (components.some((c) => types.includes((c.type ?? "").toUpperCase()))) return true;
    if (gates.some((g) => types.includes((g.type ?? "").toUpperCase()))) return true;
  }
  return false;
}

// =====================================================================
// 공통 검증
// =====================================================================
function validateSubjectAndFamily(signature: StructureSignature, candidate: Candidate): string[] {
  const errors: string[] = [];
  // candidate.topicKey와 signature.family 비교 (있으면)
  const topicKey = (candidate as { topicKey?: string })?.topicKey;
  if (topicKey && signature.family && topicKey !== signature.family) {
    errors.push(`family mismatch: candidate.topicKey="${topicKey}" ≠ signature.family="${signature.family}"`);
  }
  return errors;
}

function roleMatches(figRole: unknown, reqRole: string): boolean {
  const aliases = getAliasGroup(reqRole);
  return aliases.includes(String(figRole ?? ""));
}

function validateFigureRequirements(signature: StructureSignature, candidate: Candidate): string[] {
  const errors: string[] = [];
  const figures = (candidate.figureVariants ?? []) as Array<Record<string, unknown>>;

  // state figure가 required면 main_circuit은 자동 satisfied로 간주
  const stateRequired = (signature.figureRequirements ?? []).some((r) => isStateRole(r.role));

  // alias 그룹 dedup용
  const checkedGroups = new Set<string>();

  for (const req of signature.figureRequirements ?? []) {
    if (!req.required) continue;
    if (stateRequired && isMainCircuitRole(req.role)) continue;

    const aliases = getAliasGroup(req.role);
    const groupKey = aliasGroupKey(req.role) + "|" + req.scope + "|" + req.diagramType;
    if (checkedGroups.has(groupKey)) continue;
    checkedGroups.add(groupKey);

    if (req.scope === "per_output") {
      for (const target of req.targets ?? signature.signals?.outputs ?? []) {
        const found = figures.some((f) => {
          const rOk = roleMatches(f.role, req.role);
          const dOk = f.diagramType === req.diagramType;
          const tOk =
            f.target === target ||
            f.output === target ||
            (f.diagram as { output?: string } | undefined)?.output === target ||
            String(f.label ?? "").includes(target);
          return rOk && dOk && tOk;
        });
        if (!found) errors.push(`필수 figure 누락: ${req.role}/${req.diagramType}/${target}`);
      }
      continue;
    }

    if (req.scope === "combined") {
      const found = figures.some((f) => roleMatches(f.role, req.role) && f.diagramType === req.diagramType);
      if (!found) errors.push(`필수 combined figure 누락: ${req.role}/${req.diagramType}`);
      continue;
    }

    if (req.scope === "per_state") {
      for (const state of req.states ?? []) {
        const found = figures.some((f) => roleMatches(f.role, req.role) && f.condition === state);
        if (!found) errors.push(`필수 state figure 누락: ${req.role}/${state}`);
      }
      continue;
    }

    // single
    const found = figures.some((f) => roleMatches(f.role, req.role) && f.diagramType === req.diagramType);
    if (!found) errors.push(`필수 figure 누락: ${req.role}/${req.diagramType}`);
  }

  return errors;
}

function validateRequiredFeatures(signature: StructureSignature, candidate: Candidate): string[] {
  const errors: string[] = [];
  const features = signature.requiredFeatures ?? {};

  if (features.hasSwitch && !hasComponent(candidate, ["SW"])) {
    errors.push("필수 switch 누락");
  }
  if (features.hasDependentSource && !hasComponent(candidate, ["VCCS", "VCVS", "CCCS", "CCVS"])) {
    errors.push("필수 dependent source 누락");
  }
  if (features.hasSupermesh && !hasOverlay(candidate, "supermesh_boundary")) {
    errors.push("필수 supermesh overlay 누락");
  }
  if (features.hasKmap && !hasFigure(candidate, "kmap")) {
    errors.push("필수 K-map figure 누락");
  }
  if (features.hasWaveform && !hasFigure(candidate, "waveform")) {
    errors.push("필수 waveform figure 누락");
  }
  if (features.hasBlankGate && !hasBlankGate(candidate)) {
    errors.push("필수 blank gate 누락");
  }
  if (features.hasMesh && !(hasFigure(candidate, "analog_mesh_network") || hasFigure(candidate, "analog_netlist"))) {
    errors.push("필수 mesh figure 누락");
  }
  if (features.hasStateTransition && !(hasFigure(candidate, "concept_diagram") || hasFigure(candidate, "waveform"))) {
    errors.push("필수 state-transition figure 누락");
  }
  return errors;
}

// =====================================================================
// 과목별 — count 비교 (componentCounts/gateCounts) 위주
// =====================================================================
function compareCounts(label: string, expected: Record<string, number> | undefined, got: Record<string, number>, tolerance: number): string[] {
  const errors: string[] = [];
  if (!expected) return errors;
  for (const [type, expCount] of Object.entries(expected)) {
    const gotCount = got[type] ?? 0;
    if (Math.abs(gotCount - (expCount ?? 0)) > tolerance) {
      errors.push(`${label} ${type} count: got ${gotCount}, expected ${expCount} (tol ${tolerance})`);
    }
  }
  return errors;
}

function extractGateCounts(candidate: Candidate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of (candidate.figureVariants ?? []) as Array<Record<string, unknown>>) {
    if (f.diagramType !== "logic_network") continue;
    const gates = ((f.diagram as { gates?: Array<{ type?: string }> })?.gates ?? []);
    for (const g of gates) {
      const t = (g.type ?? "").toUpperCase();
      out[t] = (out[t] ?? 0) + 1;
    }
  }
  return out;
}

function extractComponentCounts(candidate: Candidate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of (candidate.figureVariants ?? []) as Array<Record<string, unknown>>) {
    if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
    const components = ((f.diagram as { components?: Array<{ type?: string }> })?.components ?? []);
    for (const c of components) {
      const t = (c.type ?? "").toUpperCase();
      out[t] = (out[t] ?? 0) + 1;
    }
  }
  return out;
}

function validateDigitalStructure(signature: StructureSignature, candidate: Candidate): string[] {
  const got = extractGateCounts(candidate);
  return compareCounts("gate", signature.gateCounts, got, 0);
}

/** id prefix와 type 일치성 (SPICE 컨벤션) — strict version 위임 */
function validateIdTypeConsistency(candidate: Candidate): string[] {
  const errors: string[] = [];
  for (const f of (candidate.figureVariants ?? []) as Array<Record<string, unknown>>) {
    if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
    const components = ((f.diagram as { components?: Array<{ id?: string; type?: string }> })?.components ?? []);
    errors.push(...validateIdTypeConsistencyStrict(components));
  }
  return errors;
}

/** topology hints 검증 (mesh/branch/node count) — mode별 tolerance */
function validateTopologyHints(signature: StructureSignature, candidate: Candidate, mode?: string): string[] {
  const errors: string[] = [];
  const hints = signature.topologyHints;
  if (!hints) return errors;
  const tol = mode === "exam_similar" ? 0 : 1;

  // analog candidate에서 node·branch·mesh 추정
  for (const f of (candidate.figureVariants ?? []) as Array<Record<string, unknown>>) {
    if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
    const components = ((f.diagram as { components?: Array<{ pins?: unknown[] }> })?.components ?? []);
    const pinNodes = new Set<string>();
    let branchCount = 0;
    for (const c of components) {
      const pins = c.pins as Array<{ node?: string }> | undefined;
      if (!Array.isArray(pins)) continue;
      branchCount += pins.length >= 2 ? 1 : 0;
      for (const p of pins) if (p.node) pinNodes.add(p.node);
    }
    const nodeCount = pinNodes.size;
    // mesh count 추정: branch - node + 1 (Euler for planar connected graph)
    const meshCount = Math.max(0, branchCount - nodeCount + 1);

    if (hints.nodeCount !== undefined && Math.abs(nodeCount - hints.nodeCount) > tol) {
      errors.push(`node count: got ${nodeCount}, expected ${hints.nodeCount} (tol ±${tol})`);
    }
    if (hints.branchCount !== undefined && Math.abs(branchCount - hints.branchCount) > tol) {
      errors.push(`branch count: got ${branchCount}, expected ${hints.branchCount} (tol ±${tol})`);
    }
    if (hints.meshCount !== undefined && Math.abs(meshCount - hints.meshCount) > tol) {
      errors.push(`mesh count(추정): got ${meshCount}, expected ${hints.meshCount} (tol ±${tol}). 단순 series-loop로 단순화 금지`);
    }
  }
  return errors;
}

function validateAnalogStructure(signature: StructureSignature, candidate: Candidate, mode?: string): string[] {
  const errors: string[] = [];
  const got = extractComponentCounts(candidate);
  const tol = mode === "exam_similar" ? 0 : 1;
  errors.push(...compareCounts("component", signature.componentCounts, got, tol));
  errors.push(...validateIdTypeConsistency(candidate));
  errors.push(...validateTopologyHints(signature, candidate, mode));
  return errors;
}

function validateElectronicsStructure(signature: StructureSignature, candidate: Candidate, mode?: string): string[] {
  const errors: string[] = [];
  const got = extractComponentCounts(candidate);
  const tol = mode === "exam_similar" ? 0 : 1;
  errors.push(...compareCounts("component", signature.componentCounts, got, tol));
  errors.push(...validateIdTypeConsistency(candidate));
  errors.push(...validateTopologyHints(signature, candidate, mode));
  return errors;
}

// =====================================================================
// Main entry
// =====================================================================
export function validateByStructureSignature(
  signature: StructureSignature,
  candidate: Candidate,
  mode?: string,
): { ok: boolean; errors: string[]; severity: "critical" | "ok" } {
  const errors: string[] = [];

  errors.push(...validateSubjectAndFamily(signature, candidate));
  errors.push(...validateFigureRequirements(signature, candidate));
  errors.push(...validateRequiredFeatures(signature, candidate));

  if (signature.subjectKey === "digital_logic") {
    errors.push(...validateDigitalStructure(signature, candidate));
  }
  if (signature.subjectKey === "circuit_theory") {
    errors.push(...validateAnalogStructure(signature, candidate));
  }
  if (signature.subjectKey === "electronics") {
    errors.push(...validateElectronicsStructure(signature, candidate));
  }

  return {
    ok: errors.length === 0,
    errors,
    severity: errors.length ? "critical" : "ok",
  };
}
