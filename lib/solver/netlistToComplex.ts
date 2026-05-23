/**
 * CircuitNetlist → ComplexSolverNetwork 변환 (AC pipeline 전용).
 *
 *   DC 솔버는 L/C를 무시하므로 floating node가 생길 수 있음. AC pipeline은 netlist
 *   에서 직접 nodeIds·R·V·I·L·C를 모두 추출.
 *   V·I 소스는 real → phasor (re=value, im=0). polar 파싱은 추후 확장.
 */

import type { CircuitNetlist } from "@/types";
import type { SolverNetwork } from "./mna";
import type { ComplexSolverNetwork } from "./complexMna";
import { parseValue } from "@/lib/generation/topologyDriven/parseValue";
import { parsePhasor } from "./parsePhasor";

/**
 * netlist 단독으로 ComplexSolverNetwork 구성. AC pipeline에서 권장.
 */
export function netlistToComplexStandalone(
  netlist: CircuitNetlist,
  omega: number,
): ComplexSolverNetwork {
  const nodeSet = new Set<string>();
  const groundId = netlist.ground ?? "GND";
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (typeof p.node === "string" && p.node !== groundId) nodeSet.add(p.node);
    }
  }
  const nodeIds = [...nodeSet];

  const resistors: ComplexSolverNetwork["resistors"] = [];
  const inductors: NonNullable<ComplexSolverNetwork["inductors"]> = [];
  const capacitors: NonNullable<ComplexSolverNetwork["capacitors"]> = [];
  const vsources: ComplexSolverNetwork["vsources"] = [];
  const isources: ComplexSolverNetwork["isources"] = [];
  const vccs: NonNullable<ComplexSolverNetwork["vccs"]> = [];
  const vcvs: NonNullable<ComplexSolverNetwork["vcvs"]> = [];

  for (const c of netlist.components) {
    const a = c.pins[0]?.node;
    const b = c.pins[1]?.node;
    if (!a || !b) continue;
    const parsed = parseValue(c.value as string | number | undefined);
    const numericRaw = parsed?.numeric;
    if (c.type === "R" && numericRaw !== undefined && numericRaw > 0) {
      resistors.push({ id: c.id, a, b, R: scaleByUnit(numericRaw, parsed?.suffix, "Ω") });
    } else if (c.type === "L" && numericRaw !== undefined && numericRaw > 0) {
      inductors.push({ id: c.id, a, b, L: scaleByUnit(numericRaw, parsed?.suffix, "H") });
    } else if (c.type === "C" && numericRaw !== undefined && numericRaw > 0) {
      capacitors.push({ id: c.id, a, b, C: scaleByUnit(numericRaw, parsed?.suffix, "F") });
    } else if (c.type === "V") {
      // polar phasor 지원 — "5∠30°V" 또는 일반 "10V" 모두 파싱
      const phasor = parsePhasor(c.value as string | number | undefined);
      if (phasor) {
        vsources.push({ id: c.id, a, b, V: phasor.phasor });
      } else if (numericRaw !== undefined) {
        vsources.push({ id: c.id, a, b, V: { re: scaleByUnit(numericRaw, parsed?.suffix, "V"), im: 0 } });
      }
    } else if (c.type === "I") {
      const phasor = parsePhasor(c.value as string | number | undefined);
      if (phasor) {
        isources.push({ id: c.id, a, b, I: phasor.phasor });
      } else if (numericRaw !== undefined) {
        isources.push({ id: c.id, a, b, I: { re: scaleByUnit(numericRaw, parsed?.suffix, "A"), im: 0 } });
      }
    } else if (c.type === "VCCS" && c.gain !== undefined) {
      // control은 c.control(예 "V1")에서 해석 — 단순화 위해 GND 대비 control node 가정
      const g = typeof c.gain === "number" ? c.gain : parseFloat(String(c.gain));
      if (Number.isFinite(g)) vccs.push({ id: c.id, a, b, vca: c.control || a, vcb: groundId, g });
    } else if (c.type === "VCVS" && c.gain !== undefined) {
      const k = typeof c.gain === "number" ? c.gain : parseFloat(String(c.gain));
      if (Number.isFinite(k)) vcvs.push({ id: c.id, a, b, vca: c.control || a, vcb: groundId, k });
    }
  }

  return { nodeIds, groundId, omega, resistors, inductors, capacitors, vsources, isources, vccs, vcvs };
}

/**
 * @deprecated AC pipeline은 netlistToComplexStandalone 권장. 이 함수는 호환용.
 */
export function netlistToComplex(
  solverNet: SolverNetwork,
  netlist: CircuitNetlist,
  omega: number,
): ComplexSolverNetwork {
  const inductors: NonNullable<ComplexSolverNetwork["inductors"]> = [];
  const capacitors: NonNullable<ComplexSolverNetwork["capacitors"]> = [];

  for (const c of netlist.components) {
    if (c.type === "L") {
      // L 값 파싱 — "100mH" "1H" 등. parseValue가 base 단위(H)로 정규화.
      const parsed = parseValue(c.value);
      const L = parsed?.numeric;
      if (L === undefined || !Number.isFinite(L) || L <= 0) continue;
      const a = c.pins[0]?.node;
      const b = c.pins[1]?.node;
      if (a && b) inductors.push({ id: c.id, a, b, L: scaleByUnit(L, parsed?.suffix, "H") });
    } else if (c.type === "C") {
      const parsed = parseValue(c.value);
      const C = parsed?.numeric;
      if (C === undefined || !Number.isFinite(C) || C <= 0) continue;
      const a = c.pins[0]?.node;
      const b = c.pins[1]?.node;
      if (a && b) capacitors.push({ id: c.id, a, b, C: scaleByUnit(C, parsed?.suffix, "F") });
    }
  }

  return {
    nodeIds: solverNet.nodeIds,
    groundId: solverNet.groundId,
    omega,
    resistors: solverNet.resistors,
    inductors,
    capacitors,
    vsources: solverNet.vsources.map((v) => ({
      id: v.id,
      a: v.a,
      b: v.b,
      V: { re: v.V, im: 0 }, // peak amplitude, phase 0
    })),
    isources: solverNet.isources.map((i) => ({
      id: i.id,
      a: i.a,
      b: i.b,
      I: { re: i.I, im: 0 },
    })),
  };
}

/**
 * SI prefix 단위 처리 — "100mH" 같은 표기에서 m·µ·k 등의 배율 반영.
 *
 *   parseValue는 numeric만 반환 (단위 prefix 미해석). 여기서 suffix를 분석해서 SI base로 변환.
 *   e.g., "100mH" → 0.1H, "1μF" → 1e-6F.
 */
function scaleByUnit(num: number, suffix: string | undefined, _baseUnit: string): number {
  if (!suffix) return num;
  // suffix는 "Ω", "V", "A", "H", "F", "mH", "μF" 등 자유 표기. SI prefix만 추출.
  const m = suffix.match(/^([kKmMμu]?)\s*(H|F|Ω|V|A|ohm)?/);
  if (!m) return num;
  const prefix = m[1];
  return num * prefixScale(prefix);
}

function prefixScale(p: string): number {
  switch (p) {
    case "k": case "K": return 1e3;
    case "m": return 1e-3;
    case "M": return 1e6;
    case "μ": case "u": return 1e-6;
    case "n": return 1e-9;
    case "p": return 1e-12;
    default: return 1;
  }
}
