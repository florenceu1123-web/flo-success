import type {
  CircuitComponent,
  CircuitNetlist,
  ComponentPin,
} from "@/types";

type Point = { x: number; y: number };

type PlacedComponent = {
  component: CircuitComponent;
  x: number;
  y: number;
  width: number;
  height: number;
};

type NetRail = {
  node: string;
  y: number;
  x1: number;
  x2: number;
  pins: Point[];
};

// =====================================================================
// Entry
// =====================================================================
export function renderNetlistRailSVG(netlist: CircuitNetlist): string {
  const validation = validateNetlist(netlist);
  if (!validation.ok) {
    return `<pre>${escapeSvg(validation.errors.join("\n"))}</pre>`;
  }

  const placed = layoutComponents(netlist);
  const pinPoints = collectPinPoints(placed);
  const rails = buildRails(pinPoints, netlist.ground ?? "0");

  const width = 1000;
  const height = 420;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}">`;

  for (const rail of rails) svg += renderRail(rail);
  for (const rail of rails) svg += renderPinStubs(rail);
  for (const rail of rails) svg += renderRailDot(rail);
  for (const p of placed) svg += renderComponent(p);

  svg += `</svg>`;
  return svg;
}

// =====================================================================
// Validation
// =====================================================================
function validateNetlist(netlist: CircuitNetlist) {
  const errors: string[] = [];

  if (!netlist.components?.length) errors.push("components가 없습니다.");

  for (const c of netlist.components ?? []) {
    if (!c.pins?.length) {
      errors.push(`${c.id}: pins 누락`);
      continue;
    }

    for (const pin of c.pins) {
      if (!pin.id) errors.push(`${c.id}: pin id 누락`);
      if (!pin.node) errors.push(`${c.id}.${pin.id}: node 누락`);
      if (!pin.side) errors.push(`${c.id}.${pin.id}: side 누락`);
    }

    if (!["GND"].includes(c.type) && c.pins.length < 2) {
      errors.push(`${c.id}: 2단자 이상 소자인데 pins가 부족합니다.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// =====================================================================
// Layout
// =====================================================================
function layoutComponents(netlist: CircuitNetlist): PlacedComponent[] {
  const topY = 140;
  const verticalY = 200;
  const baseX = 90;
  const gapX = 130;

  return netlist.components.map((c, i) => {
    const isVertical = ["V", "I", "VCCS", "VCVS", "CCCS", "CCVS", "SW"].includes(c.type);
    return {
      component: c,
      x: baseX + i * gapX,
      y: isVertical ? verticalY : topY,
      width: 70,
      height: 60,
    };
  });
}

// =====================================================================
// Pin coordinate
// =====================================================================
function getPinPoint(p: PlacedComponent, pin: ComponentPin): Point {
  const { x, y, width, height } = p;
  if (pin.side === "left") return { x, y: y + height / 2 };
  if (pin.side === "right") return { x: x + width, y: y + height / 2 };
  if (pin.side === "top") return { x: x + width / 2, y };
  return { x: x + width / 2, y: y + height };
}

function collectPinPoints(placed: PlacedComponent[]): Map<string, Point[]> {
  const map = new Map<string, Point[]>();
  for (const pc of placed) {
    for (const pin of pc.component.pins) {
      const arr = map.get(pin.node) ?? [];
      arr.push(getPinPoint(pc, pin));
      map.set(pin.node, arr);
    }
  }
  return map;
}

// =====================================================================
// Rails
// =====================================================================
function buildRails(pinPoints: Map<string, Point[]>, groundNode: string): NetRail[] {
  const rails: NetRail[] = [];

  for (const [node, pins] of pinPoints.entries()) {
    if (pins.length < 2) continue;

    const isGround =
      node === groundNode ||
      node === "0" ||
      node.toLowerCase() === "gnd";

    const y = isGround
      ? 330
      : Math.round(avg(pins.map((p) => p.y)) / 20) * 20;

    rails.push({
      node,
      y,
      x1: Math.min(...pins.map((p) => p.x)) - 20,
      x2: Math.max(...pins.map((p) => p.x)) + 20,
      pins,
    });
  }

  return rails;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// =====================================================================
// Rendering primitives
// =====================================================================
function renderRail(rail: NetRail): string {
  return `<path d="M ${rail.x1} ${rail.y} L ${rail.x2} ${rail.y}" stroke="black" fill="none" stroke-width="2"/>`;
}

function renderPinStubs(rail: NetRail): string {
  return rail.pins
    .map((p) => `<path d="M ${p.x} ${p.y} L ${p.x} ${rail.y}" stroke="black" fill="none" stroke-width="2"/>`)
    .join("");
}

function renderRailDot(rail: NetRail): string {
  if (rail.pins.length < 3) return "";
  return rail.pins
    .map((p) => `<circle cx="${p.x}" cy="${rail.y}" r="4" fill="black"/>`)
    .join("");
}

// =====================================================================
// Component symbols
// =====================================================================
function renderComponent(p: PlacedComponent): string {
  const c = p.component;
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;

  switch (c.type) {
    case "R":    return renderResistor(c, cx, cy);
    case "V":    return renderVoltageSource(c, cx, cy);
    case "I":    return renderCurrentSource(c, cx, cy);
    case "SW":   return renderSwitch(c, cx, cy);
    case "VCCS":
    case "CCCS": return renderDependentCurrentSource(c, cx, cy);
    case "VCVS":
    case "CCVS": return renderDependentVoltageSource(c, cx, cy);
    default:     return renderBox(c, cx, cy);
  }
}

function renderResistor(c: CircuitComponent, x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
  <path d="M -35 0 L -24 -10 L -12 10 L 0 -10 L 12 10 L 24 -10 L 35 0" stroke="black" fill="none" stroke-width="2"/>
  <text x="0" y="-18" text-anchor="middle" font-size="12">${escapeSvg(c.id)}</text>
  <text x="0" y="30" text-anchor="middle" font-size="12">${escapeSvg(c.value ?? "")}</text>
</g>`;
}

function renderVoltageSource(c: CircuitComponent, x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
  <circle cx="0" cy="0" r="25" fill="white" stroke="black" stroke-width="2"/>
  <text x="0" y="-6" text-anchor="middle" font-size="14">+</text>
  <text x="0" y="12" text-anchor="middle" font-size="14">−</text>
  <text x="0" y="44" text-anchor="middle" font-size="12">${escapeSvg(c.id)} ${escapeSvg(c.value ?? "")}</text>
</g>`;
}

function renderCurrentSource(c: CircuitComponent, x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
  <circle cx="0" cy="0" r="25" fill="white" stroke="black" stroke-width="2"/>
  <path d="M -10 0 L 10 0 M 4 -6 L 10 0 L 4 6" stroke="black" fill="none" stroke-width="2"/>
  <text x="0" y="44" text-anchor="middle" font-size="12">${escapeSvg(c.id)} ${escapeSvg(c.value ?? "")}</text>
</g>`;
}

function renderSwitch(c: CircuitComponent, x: number, y: number): string {
  const open = c.state !== "closed";
  return `<g transform="translate(${x},${y})">
  <circle cx="-22" cy="0" r="3" fill="white" stroke="black" stroke-width="2"/>
  <circle cx="22" cy="0" r="3" fill="white" stroke="black" stroke-width="2"/>
  ${open
    ? `<path d="M -22 0 L 12 -14" stroke="black" fill="none" stroke-width="2"/>`
    : `<path d="M -22 0 L 22 0" stroke="black" fill="none" stroke-width="2"/>`}
  <text x="0" y="28" text-anchor="middle" font-size="12">SW</text>
</g>`;
}

function renderDependentCurrentSource(c: CircuitComponent, x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
  <path d="M 0 -28 L 28 0 L 0 28 L -28 0 Z" fill="white" stroke="black" stroke-width="2"/>
  <path d="M -10 0 L 10 0 M 4 -6 L 10 0 L 4 6" stroke="black" fill="none" stroke-width="2"/>
  <text x="0" y="-36" text-anchor="middle" font-size="12">${escapeSvg(c.gain ?? c.value ?? "")}</text>
</g>`;
}

function renderDependentVoltageSource(c: CircuitComponent, x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
  <path d="M 0 -28 L 28 0 L 0 28 L -28 0 Z" fill="white" stroke="black" stroke-width="2"/>
  <text x="0" y="-6" text-anchor="middle" font-size="14">+</text>
  <text x="0" y="12" text-anchor="middle" font-size="14">−</text>
  <text x="0" y="-36" text-anchor="middle" font-size="12">${escapeSvg(c.gain ?? c.value ?? "")}</text>
</g>`;
}

function renderBox(c: CircuitComponent, x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
  <rect x="-30" y="-20" width="60" height="40" fill="white" stroke="black" stroke-width="2"/>
  <text x="0" y="4" text-anchor="middle" font-size="12">${escapeSvg(c.type)}</text>
  <text x="0" y="34" text-anchor="middle" font-size="11">${escapeSvg(c.id)}</text>
</g>`;
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
