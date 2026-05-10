import type { CircuitComponent } from "@/types";
import type { RenderNode } from "./layout";
import { escapeSvg } from "./labels";

/**
 * Spec 8 — RenderNode → SVG 문자열.
 * 각 component의 중심에 type별 표준 심볼을 그린다.
 */
export function renderComponentSymbol(node: RenderNode): string {
  const c = node.component;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  switch (c.type) {
    case "R":
      return renderResistor(c, cx, cy);
    case "V":
      return renderVoltageSource(c, cx, cy);
    case "I":
      return renderCurrentSource(c, cx, cy);
    case "SW":
      return renderSwitch(c, cx, cy);
    case "VCCS":
    case "CCCS":
      return renderDependentCurrentSource(c, cx, cy);
    case "VCVS":
    case "CCVS":
      return renderDependentVoltageSource(c, cx, cy);
    default:
      return renderGenericComponent(c, cx, cy);
  }
}

function renderResistor(c: CircuitComponent, x: number, y: number) {
  return `
<g transform="translate(${x},${y})">
  <path d="M -35 0 L -24 -10 L -12 10 L 0 -10 L 12 10 L 24 -10 L 35 0"
        stroke="black" fill="none" stroke-width="2"/>
  <text x="0" y="-18" text-anchor="middle" font-size="12">${escapeSvg(c.id)}</text>
  <text x="0" y="30" text-anchor="middle" font-size="12">${escapeSvg(c.value)}</text>
</g>`;
}

function renderVoltageSource(c: CircuitComponent, x: number, y: number) {
  return `
<g transform="translate(${x},${y})">
  <circle cx="0" cy="0" r="25" fill="white" stroke="black" stroke-width="2"/>
  <text x="0" y="-6" text-anchor="middle" font-size="14">+</text>
  <text x="0" y="12" text-anchor="middle" font-size="14">−</text>
  <text x="0" y="44" text-anchor="middle" font-size="12">${escapeSvg(c.id)} ${escapeSvg(c.value)}</text>
</g>`;
}

function renderCurrentSource(c: CircuitComponent, x: number, y: number) {
  return `
<g transform="translate(${x},${y})">
  <circle cx="0" cy="0" r="25" fill="white" stroke="black" stroke-width="2"/>
  <path d="M -10 0 L 10 0 M 4 -6 L 10 0 L 4 6"
        stroke="black" fill="none" stroke-width="2"/>
  <text x="0" y="44" text-anchor="middle" font-size="12">${escapeSvg(c.id)} ${escapeSvg(c.value)}</text>
</g>`;
}

function renderSwitch(c: CircuitComponent, x: number, y: number) {
  const open = c.state !== "closed";

  return `
<g transform="translate(${x},${y})">
  <circle cx="-22" cy="0" r="3" fill="white" stroke="black" stroke-width="2"/>
  <circle cx="22" cy="0" r="3" fill="white" stroke="black" stroke-width="2"/>
  ${
    open
      ? `<path d="M -22 0 L 12 -14" stroke="black" fill="none" stroke-width="2"/>`
      : `<path d="M -22 0 L 22 0" stroke="black" fill="none" stroke-width="2"/>`
  }
  <text x="0" y="28" text-anchor="middle" font-size="12">SW</text>
</g>`;
}

function renderDependentCurrentSource(c: CircuitComponent, x: number, y: number) {
  return `
<g transform="translate(${x},${y})">
  <path d="M 0 -28 L 28 0 L 0 28 L -28 0 Z"
        fill="white" stroke="black" stroke-width="2"/>
  <path d="M -10 0 L 10 0 M 4 -6 L 10 0 L 4 6"
        stroke="black" fill="none" stroke-width="2"/>
  <text x="0" y="-36" text-anchor="middle" font-size="12">${escapeSvg(c.gain ?? c.value)}</text>
</g>`;
}

function renderDependentVoltageSource(c: CircuitComponent, x: number, y: number) {
  return `
<g transform="translate(${x},${y})">
  <path d="M 0 -28 L 28 0 L 0 28 L -28 0 Z"
        fill="white" stroke="black" stroke-width="2"/>
  <text x="0" y="-6" text-anchor="middle" font-size="14">+</text>
  <text x="0" y="12" text-anchor="middle" font-size="14">−</text>
  <text x="0" y="-36" text-anchor="middle" font-size="12">${escapeSvg(c.gain ?? c.value)}</text>
</g>`;
}

function renderGenericComponent(c: CircuitComponent, x: number, y: number) {
  return `
<g transform="translate(${x},${y})">
  <rect x="-30" y="-20" width="60" height="40"
        fill="white" stroke="black" stroke-width="2"/>
  <text x="0" y="4" text-anchor="middle" font-size="12">${c.type}</text>
  <text x="0" y="34" text-anchor="middle" font-size="11">${escapeSvg(c.id)}</text>
</g>`;
}
