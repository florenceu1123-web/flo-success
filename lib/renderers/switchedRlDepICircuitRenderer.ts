/**
 * 스위치 RL + 종속 전류원(k·iₙ) 과도응답 회로 (임용 2024 전기 B-5) 전용 fixed-slot 렌더러.
 *
 *  레이아웃 (노드 A=상단 rail, B=중간 마디, GND=바닥):
 *    A ──────────────────────────────────────── A
 *    │            │            │                 │
 *   [SW t=0]   [k·iₙ]        [L,i_L]           [Vs]
 *    │            │            │                 │
 *   [R1,iₙ]      └──── B ──────┘  (B = CCCS·L 하단 공통마디)
 *    │                 │                         │
 *    │              [R_R, i_R]                   │
 *    └───────────────── GND ────────────────────┘
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

export function detectSwitchedRlDepI(netlist: CircuitNetlist): boolean {
  const ids = new Set((netlist.components ?? []).map((c) => c.id));
  return ids.has("Vs") && ids.has("R1") && ids.has("CCCSn") && ids.has("Ln") && ids.has("Rr") && ids.has("SWn");
}

export function renderSwitchedRlDepICircuit(netlist: CircuitNetlist): string | null {
  if (!detectSwitchedRlDepI(netlist)) return null;
  const byId = (id: string) => netlist.components.find((c) => c.id === id);

  // ── 좌표 ──
  const yTop = 110; // A rail
  const yMid = 290; // B 마디 (CCCS·L 하단)
  const yGnd = 470; // GND rail
  const ySW = yTop + 80; // SW↔R1 접점
  const xR1 = 110; // 좌측 SW+R1 leg
  const xCCCS = 300; // 종속전류원 leg
  const xL = 440; // 인덕터 leg
  const xRr = (xCCCS + xL) / 2; // R_R leg (B에서 GND)
  const xVs = 580; // 우측 전압원 leg
  const HALF = 28;

  const svg: string[] = [];
  const wire = (x1: number, yy1: number, x2: number, yy2: number) =>
    `<path d="M ${x1} ${yy1} L ${x2} ${yy2}" stroke="black" fill="none" stroke-width="2"/>`;
  const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
  const gnd = (x: number, y: number) => `<g transform="translate(${x},${y})">
    <line x1="0" y1="0" x2="0" y2="9" stroke="black" stroke-width="2"/>
    <line x1="-10" y1="9" x2="10" y2="9" stroke="black" stroke-width="2.4"/>
    <line x1="-6" y1="13" x2="6" y2="13" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="17" x2="3" y2="17" stroke="black" stroke-width="2"/></g>`;
  const vcomp = (c: CircuitComponent, x: number, yA: number, yB: number) => {
    const cy = (yA + yB) / 2;
    svg.push(`<rect x="${x - HALF}" y="${cy - HALF - 2}" width="${HALF * 2}" height="${(HALF + 2) * 2}" fill="white"/>`);
    svg.push(wire(x, yA, x, cy - HALF), wire(x, cy + HALF, x, yB), renderComponentOnEdge(c, { x, y: cy }, "vertical"));
  };
  const arrow = (x: number, y1: number, y2: number, label: string, lx: number, ly: number) => {
    svg.push(`<path d="M ${x} ${y1} L ${x} ${y2}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#sri_arr)"/>`);
    svg.push(`<text x="${lx}" y="${ly}" font-size="13" fill="#1e3a8a" font-weight="600">${label}</text>`);
  };
  svg.push(`<defs><marker id="sri_arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`);

  // ── 상단 rail A (좌 SW ~ 우 Vs) ──
  svg.push(wire(xR1, yTop, xVs, yTop));
  for (const x of [xCCCS, xL]) svg.push(dot(x, yTop));

  // ── 좌측 leg: SW(t=0) + R1 (iₙ) ──
  vcomp(byId("SWn")!, xR1, yTop, ySW);
  vcomp(byId("R1")!, xR1, ySW, yGnd);
  arrow(xR1 + 34, (ySW + yGnd) / 2 - 26, (ySW + yGnd) / 2 + 26, "iₙ", xR1 + 40, (ySW + yGnd) / 2 - 30);

  // ── 종속 전류원 leg: A → B (k·iₙ) ──
  vcomp(byId("CCCSn")!, xCCCS, yTop, yMid);

  // ── 인덕터 leg: A → B (i_L) ──
  vcomp(byId("Ln")!, xL, yTop, yMid);
  arrow(xL + 34, (yTop + yMid) / 2 - 26, (yTop + yMid) / 2 + 26, "i_L(t)", xL + 40, (yTop + yMid) / 2 - 30);

  // ── B 마디 (CCCS·L 하단 공통) + R_R → GND ──
  svg.push(wire(xCCCS, yMid, xL, yMid));
  for (const x of [xCCCS, xL]) svg.push(dot(x, yMid));
  svg.push(wire(xRr, yMid, xRr, yMid)); // (anchor)
  vcomp(byId("Rr")!, xRr, yMid, yGnd);
  svg.push(dot(xRr, yMid));
  arrow(xRr + 34, (yMid + yGnd) / 2 - 26, (yMid + yGnd) / 2 + 26, "i_R(t)", xRr + 40, (yMid + yGnd) / 2 - 30);

  // ── 우측 전압원 leg ──
  vcomp(byId("Vs")!, xVs, yTop, yGnd);

  // ── 바닥 GND rail ──
  svg.push(wire(xR1, yGnd, xVs, yGnd));
  svg.push(gnd((xRr + xVs) / 2, yGnd));

  const W = xVs + 110, H = yGnd + 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${svg.join("\n")}\n</svg>`;
}
