/**
 * 2전원 SPDT 스위치 RL 과도응답 회로 (임용 3번 회로이론) 전용 fixed-slot 렌더러.
 *
 *  레이아웃 (원본 충실):
 *
 *        S(단자 A↔B, t=0)        i(t)→
 *    V_A ─┐단자A ╲                ┌── R ──┐
 *         │       common ── n_top │       (우측 세로: R 상단, L 하단)
 *    V_B ─┘단자B ╱                │       L
 *         │      │                │       │
 *    ─────┴──────┴────────────────┴───────┘  (하단 GND rail)
 *
 *  - 좌측 V_A leg(세로) 상단 → 단자 A, 가운데 V_B leg(세로) 상단 → 단자 B.
 *  - SPDT common(blade) → 우측 직렬 R+L 가지(i(t) 측정). blade는 단자 A(t<0 초기) 접점.
 *  - 세 leg 하단은 공통 GND rail.
 */

import type { CircuitComponent, SwitchedRlDualSrcCircuitDiagram } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

export function renderSwitchedRlSourceSwitchCircuit(d: SwitchedRlDualSrcCircuitDiagram): string {
  // ── 좌표 ──
  const yMain = 120;             // 상단 rail (common pivot · 우측 가지 상단)
  const yA = yMain - 28;         // 단자 A (상)
  const yB = yMain + 28;         // 단자 B (하)
  const yGnd = 470;              // 하단 GND rail
  const yMid = (yMain + yGnd) / 2; // R / L 경계
  const xVA = 80;                // V_A leg
  const xVB = 220;               // V_B leg
  const xThrow = 305;            // 단자 A·B x
  const xPivot = 362;            // common (blade pivot)
  const xR = 480;                // 우측 직렬 R+L 가지
  const HALF = 28;

  const svg: string[] = [];
  const wire = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
  const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
  const gnd = (x: number, y: number) => `<g transform="translate(${x},${y})">
    <line x1="0" y1="0" x2="0" y2="9" stroke="black" stroke-width="2"/>
    <line x1="-10" y1="9" x2="10" y2="9" stroke="black" stroke-width="2.4"/>
    <line x1="-6" y1="13" x2="6" y2="13" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="17" x2="3" y2="17" stroke="black" stroke-width="2"/></g>`;
  /** 세로 소자: (x, yTop)~(x, yBot) 중앙에 배치, 양쪽 짧은 도선. */
  const vcomp = (c: CircuitComponent, x: number, yTop: number, yBot: number) => {
    const cy = (yTop + yBot) / 2;
    svg.push(`<rect x="${x - HALF}" y="${cy - HALF - 2}" width="${HALF * 2}" height="${(HALF + 2) * 2}" fill="white"/>`);
    svg.push(wire(x, yTop, x, cy - HALF), wire(x, cy + HALF, x, yBot), renderComponentOnEdge(c, { x, y: cy }, "vertical"));
  };

  const VA: CircuitComponent = { id: "V_A", type: "V", value: d.vaLabel, pins: [] };
  const VB: CircuitComponent = { id: "V_B", type: "V", value: d.vbLabel, pins: [] };
  const R1: CircuitComponent = { id: "R", type: "R", value: d.rLabel, pins: [] };
  const L1: CircuitComponent = { id: "L", type: "L", value: d.lLabel, pins: [] };

  // ── 좌측 V_A leg → 단자 A ──
  vcomp(VA, xVA, yA, yGnd);
  svg.push(wire(xVA, yA, xThrow, yA));

  // ── 가운데 V_B leg → 단자 B ──
  vcomp(VB, xVB, yB, yGnd);
  svg.push(wire(xVB, yB, xThrow, yB));

  // ── SPDT 셀렉터: 단자 A(상)·단자 B(하) → common(pivot) → n_top ──
  drawSpdtSelector(svg, { x: xThrow, y: yA }, { x: xThrow, y: yB }, { x: xPivot, y: yMain }, xR);

  // ── 상단 rail → 우측 직렬 R+L 가지 ──
  svg.push(wire(xPivot, yMain, xR, yMain), dot(xR, yMain));
  vcomp(R1, xR, yMain, yMid);   // 우측 상단: R
  vcomp(L1, xR, yMid, yGnd);    // 우측 하단: L

  // ── 하단 GND rail (세 leg 하단 공통) ──
  svg.push(wire(xVA, yGnd, xR, yGnd));
  svg.push(gnd((xVB + xR) / 2, yGnd));

  // ── i(t) 화살표 (상단 rail, 우측 가지로 유입) ──
  const arrowDefs = `<defs><marker id="srlss_arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;
  svg.push(arrowDefs);
  svg.push(`<path d="M ${xPivot + 30} ${yMain - 18} L ${xR} ${yMain - 18}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#srlss_arr)"/>`);
  svg.push(`<text x="${(xPivot + xR) / 2 + 14}" y="${yMain - 24}" text-anchor="middle" font-size="13" fill="#1e3a8a" font-weight="600">${d.currentLabel ?? "i(t)"}</text>`);

  const W = xR + 130;
  const H = yGnd + 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${svg.join("\n")}\n</svg>`;
}

/** SPDT 3단자 셀렉터 — common(pivot) blade가 단자 A(t1)/단자 B(t2) 사이를 움직임.
 *  blade는 단자 A(t<0 초기 정상상태) 접점. common → out(n_top). t=0에 A→B. */
function drawSpdtSelector(
  svg: string[],
  tA: { x: number; y: number },     // 단자 A (상, V_A, t<0 접점)
  tB: { x: number; y: number },     // 단자 B (하, V_B, t≥0)
  pivot: { x: number; y: number },  // common (→ n_top)
  outX: number,
) {
  for (const p of [tA, tB, pivot]) {
    svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="white" stroke="black" stroke-width="1.7"/>`);
  }
  // blade: pivot → 단자 A (대각선, t<0 초기 접점)
  svg.push(`<path d="M ${pivot.x} ${pivot.y} L ${tA.x} ${tA.y}" stroke="black" fill="none" stroke-width="2.2"/>`);
  // common → out(n_top)
  svg.push(`<path d="M ${pivot.x} ${pivot.y} L ${outX} ${pivot.y}" stroke="black" fill="none" stroke-width="2"/>`);
  // 라벨
  svg.push(`<text x="${tA.x - 8}" y="${tA.y - 8}" text-anchor="end" font-size="11" fill="#475569">단자 A</text>`);
  svg.push(`<text x="${tB.x - 8}" y="${tB.y + 14}" text-anchor="end" font-size="11" fill="#475569">단자 B</text>`);
  svg.push(`<text x="${(pivot.x + tA.x) / 2}" y="${tA.y - 24}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="600">S (t=0)</text>`);
}
