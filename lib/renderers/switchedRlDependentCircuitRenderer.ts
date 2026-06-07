/**
 * 스위치 RL + 종속전원(2i_A) 과도응답 회로 (임용 2022 B-7) 전용 fixed-slot 렌더러.
 *
 *  레이아웃 (원본 충실):
 *    40V ─[2Ω]─ 단자2 ╲
 *                       common(blade) ── n_top ─[3H, i_L]─ n_a
 *    12V ───────  단자1 ╱                  │                │
 *                                      [4Ω](i_A)         [6Ω](v_o)
 *    전원− ─ n_s ─[2i_A 가로]─ GND ─ 4Ω−·6Ω−   (종속원은 전원 귀환경로 바닥 lane)
 *  SPDT 3단자: common→n_top, 단자1→12V, 단자2→40V·2Ω. blade는 단자1(단계1) 접점.
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

export function detectSwitchedRlDependent(netlist: CircuitNetlist): boolean {
  const ids = new Set((netlist.components ?? []).map((c) => c.id));
  const rl = ids.has("V_40") && ids.has("V_12") && ids.has("SW") &&
    ids.has("R_s") && ids.has("R_a") && ids.has("L_o") && ids.has("R_o") && ids.has("CCVS");
  const dual = ids.has("I_40") && ids.has("I_12") && ids.has("SW") &&
    ids.has("G1") && ids.has("G_a") && ids.has("C_o") && ids.has("G_o") && ids.has("CCCS");
  return rl || dual;
}

export function renderSwitchedRlDependentCircuit(netlist: CircuitNetlist): string | null {
  if (!detectSwitchedRlDependent(netlist)) return null;
  const byId = (id: string) => netlist.components.find((c) => c.id === id);

  // ── 좌표 ──
  const yMain = 135;    // n_top rail (4Ω/L 분기, common pivot)
  const yGnd = 490;     // 바닥(GND) rail
  const y2 = yMain - 26; // 단자2 (상) level
  const y1 = yMain + 26; // 단자1 (하) level
  const x40 = 80;       // 40V leg
  const x12 = 215;      // 12V leg → 단자1
  const xThrow = 300;   // 단자1/단자2 접점
  const xPivot = 350;   // common (blade pivot)
  const xTop = 415;     // n_top (4Ω & L 분기)
  const xRa = 500;      // 4Ω leg
  const xA = 670;       // n_a (L 끝 / 6Ω)
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
  const hcomp = (c: CircuitComponent, xA2: number, xB: number, y: number) => {
    const cx = (xA2 + xB) / 2;
    svg.push(`<rect x="${cx - HALF - 2}" y="${y - HALF}" width="${(HALF + 2) * 2}" height="${HALF * 2}" fill="white"/>`);
    svg.push(wire(xA2, y, cx - HALF, y), wire(cx + HALF, y, xB, y), renderComponentOnEdge(c, { x: cx, y }, "horizontal"));
  };
  const arrowDefs = `<defs><marker id="srl_arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ════ 기출변형 = 쌍대(dual) RC 병렬 회로 ════
  if (byId("C_o")?.type === "C") {
    const yC = 145, yG = 480;                 // V_C rail / GND rail
    const yt2 = yC - 28, yt1 = yC + 28;
    const xI40 = 80, xG1 = 158, xI12 = 250;   // I_40 ∥ G1, I_12
    const xThrowD = 320, xPivotD = 372, xRailL = 432;
    const xGa = 492, xCc = 575, xGo = 660, xDep = 748;  // 병렬 분기
    svg.push(arrowDefs);
    // I_40 ∥ G1(2S) → 단자2(상)
    vcomp(byId("I_40")!, xI40, yt2, yG);
    vcomp(byId("G1")!, xG1, yt2, yG);
    svg.push(wire(xI40, yt2, xThrowD, yt2), dot(xG1, yt2));
    // I_12 → 단자1(하)
    vcomp(byId("I_12")!, xI12, yt1, yG);
    svg.push(wire(xI12, yt1, xThrowD, yt1));
    // SPDT 셀렉터(전류원 선택) → V_C rail
    drawSpdtSelector(svg, { x: xThrowD, y: yt1 }, { x: xThrowD, y: yt2 }, { x: xPivotD, y: yC }, xRailL);
    // V_C 상단 rail + 병렬 분기 (G_a ∥ C ∥ G_o ∥ CCCS)
    svg.push(wire(xPivotD, yC, xDep, yC), dot(xRailL, yC));
    vcomp(byId("G_a")!, xGa, yC, yG);         // G_a (i_a, v_A=V_C)
    vcomp(byId("C_o")!, xCc, yC, yG);         // C
    vcomp(byId("G_o")!, xGo, yC, yG);         // G_o (i_o)
    vcomp(byId("CCCS")!, xDep, yC, yG);       // CCCS 2i_a
    for (const x of [xGa, xCc, xGo]) svg.push(dot(x, yC));
    // GND rail
    svg.push(wire(xI40, yG, xDep, yG), gnd((xCc + xGo) / 2, yG));
    // 측정 표시
    svg.push(`<text x="${xRailL + 6}" y="${yC - 10}" font-size="13" fill="#1e3a8a" font-weight="600">v_C(t)</text>`);
    // i_a (G_a ↓), i_o (G_o ↓)
    const my = (yC + yG) / 2;
    svg.push(`<path d="M ${xGa + 32} ${my - 26} L ${xGa + 32} ${my + 26}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#srl_arr)"/>`);
    svg.push(`<text x="${xGa + 38}" y="${my - 30}" font-size="13" fill="#1e3a8a" font-weight="600">i_a</text>`);
    svg.push(`<path d="M ${xGo + 32} ${my - 26} L ${xGo + 32} ${my + 26}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#srl_arr)"/>`);
    svg.push(`<text x="${xGo + 38}" y="${my - 30}" font-size="13" fill="#1e3a8a" font-weight="600">i_o(t)</text>`);
    const W = xDep + 120, H = yG + 50;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${svg.join("\n")}\n</svg>`;
  }

  // ── 40V leg + 2Ω → 단자2(상) ──
  vcomp(byId("V_40")!, x40, y2, yGnd);     // 40V leg (top at 단자2 level)
  hcomp(byId("R_s")!, x40, xThrow, y2);    // 2Ω: 40V top → 단자2

  // ── 12V leg → 단자1(하) ──
  vcomp(byId("V_12")!, x12, y1, yGnd);     // 12V leg (top at 단자1 level)
  svg.push(wire(x12, y1, xThrow, y1));     // 12V top → 단자1

  // ── SPDT 셀렉터: 단자2(상)·단자1(하) → common(pivot) → n_top ──
  drawSpdtSelector(svg, { x: xThrow, y: y1 }, { x: xThrow, y: y2 }, { x: xPivot, y: yMain }, xTop);

  // ── n_top rail ──
  svg.push(wire(xPivot, yMain, xTop, yMain), dot(xTop, yMain));

  // 변형(기출변형) 여부: 종속원 값이 v_A 제어이면 변형 레이아웃
  const variant = String(byId("CCVS")?.value ?? "").includes("v_A");

  svg.push(`<defs><marker id="srl_arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`);

  if (!variant) {
    // ── 유사: 4Ω leg(i_A) + L→6Ω,  2i_A 바닥 lane ──
    svg.push(wire(xTop, yMain, xRa, yMain));
    vcomp(byId("R_a")!, xRa, yMain, yGnd);      // 4Ω 전체 세로 (i_A↓ → GND)
    svg.push(dot(xTop, yMain));
    hcomp(byId("L_o")!, xRa, xA, yMain);        // 4Ω 분기 → L → n_a
    vcomp(byId("R_o")!, xA, yMain, yGnd);       // 6Ω full-height, v_o 양단
    svg.push(dot(xA, yMain));
    // i_L (L 위), i_A (4Ω 우측 ↓)
    const lcx = (xRa + xA) / 2;
    svg.push(`<path d="M ${lcx - 24} ${yMain - 30} L ${lcx + 24} ${yMain - 30}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#srl_arr)"/>`);
    svg.push(`<text x="${lcx}" y="${yMain - 36}" text-anchor="middle" font-size="13" fill="#1e3a8a" font-weight="600">i_L(t)</text>`);
    const racy = (yMain + yGnd) / 2;
    svg.push(`<path d="M ${xRa + 34} ${racy - 28} L ${xRa + 34} ${racy + 28}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#srl_arr)"/>`);
    svg.push(`<text x="${xRa + 40}" y="${racy - 32}" font-size="13" fill="#1e3a8a" font-weight="600">i_A</text>`);
    // 바닥 lane: 전원−(n_s) ─[2i_A 가로]─ GND
    const xCcL = 245, xCcR = 365;
    svg.push(wire(x40, yGnd, xCcL, yGnd));
    hcomp(byId("CCVS")!, xCcL, xCcR, yGnd);
    svg.push(wire(xCcR, yGnd, xA, yGnd));
    svg.push(gnd(xCcR + (xA - xCcR) * 0.66, yGnd));
    // v_o (+/−) 6Ω 양단 (우측)
    svg.push(`<text x="${xA + 60}" y="${yMain + 18}" font-size="14" fill="#1e3a8a">+</text>`);
    svg.push(`<text x="${xA + 60}" y="${yGnd - 30}" font-size="14" fill="#1e3a8a">−</text>`);
    svg.push(`<text x="${xA + 70}" y="${(yMain + yGnd) / 2 + 4}" font-size="13" fill="#1e3a8a" font-weight="600">v_o(t)</text>`);
  } else {
    // ── 변형(단일 루프): n_top─[R_a]─[L]─(바닥)[R_o]─[2v_A]─GND ──
    const yMid = 300;                            // R_a(상)/L(하) 분기
    svg.push(wire(xTop, yMain, xRa, yMain), dot(xTop, yMain));
    vcomp(byId("R_a")!, xRa, yMain, yMid);       // 4Ω (가운데 상)
    vcomp(byId("L_o")!, xRa, yMid, yGnd);        // L (가운데 하) → n_y(바닥)
    // 바닥 lane(가로): n_y(xRa) ─[6Ω]─[2v_A]─ GND ─ 전원−(좌)
    const xRoR = xRa - 40, xRoL = xRoR - 90;     // 6Ω 가로 구간 (n_y 왼쪽)
    const xCcR2 = xRoL - 20, xCcL2 = xCcR2 - 90; // 2v_A 가로 구간
    svg.push(wire(xRa, yGnd, xRoR, yGnd));       // n_y → 6Ω
    hcomp(byId("R_o")!, xRoL, xRoR, yGnd);       // 6Ω (가로, v_o 양단)
    svg.push(wire(xRoL, yGnd, xCcR2, yGnd));     // 6Ω → 2v_A
    hcomp(byId("CCVS")!, xCcL2, xCcR2, yGnd);    // 2v_A (가로, 인덕터 가지 직렬)
    svg.push(wire(x40, yGnd, xCcL2, yGnd));      // 2v_A → GND(전원−)
    svg.push(gnd((x40 + xCcL2) / 2, yGnd));      // GND 기호 (전원 쪽)
    // i_L (가운데 가지 우측 ↓)
    svg.push(`<path d="M ${xRa + 50} ${yMid - 8} L ${xRa + 50} ${yMid + 48}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#srl_arr)"/>`);
    svg.push(`<text x="${xRa + 56}" y="${yMid + 4}" font-size="13" fill="#1e3a8a" font-weight="600">i_L(t)</text>`);
    // v_A (+/−) R_a 양단 (좌측 — R_a 자동라벨과 겹치지 않게)
    svg.push(`<text x="${xRa - 46}" y="${yMain + 20}" font-size="14" fill="#1e3a8a">+</text>`);
    svg.push(`<text x="${xRa - 46}" y="${yMid - 6}" font-size="14" fill="#1e3a8a">−</text>`);
    svg.push(`<text x="${xRa - 72}" y="${(yMain + yMid) / 2 + 4}" font-size="13" fill="#1e3a8a" font-weight="600">v_A</text>`);
    // v_o (+/−) 6Ω 양단 (바닥, 위쪽 라벨)
    svg.push(`<text x="${xRoR + 4}" y="${yGnd - 12}" font-size="13" fill="#1e3a8a">+</text>`);
    svg.push(`<text x="${xRoL - 12}" y="${yGnd - 12}" font-size="13" fill="#1e3a8a">−</text>`);
    svg.push(`<text x="${(xRoL + xRoR) / 2 - 16}" y="${yGnd - 42}" font-size="13" fill="#1e3a8a" font-weight="600">v_o(t)</text>`);
  }

  const svgW = xA + 140;
  const svgH = yGnd + 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n${svg.join("\n")}\n</svg>`;
}

/** SPDT 3단자 셀렉터 — common(pivot) blade가 단자1(t1)/단자2(t2) 사이를 움직임.
 *  현재 단자1(단계1) 접점. common → out(n_top). 세 단자 모두 회로에 연결. */
function drawSpdtSelector(
  svg: string[],
  t1: { x: number; y: number },     // 단자1 (하, 12V, 현재 접점)
  t2: { x: number; y: number },     // 단자2 (상, 40V·2Ω)
  pivot: { x: number; y: number },  // common (→ n_top)
  outX: number,
) {
  // 세 접점
  for (const p of [t1, t2, pivot]) {
    svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="white" stroke="black" stroke-width="1.7"/>`);
  }
  // blade: pivot → 단자1 (대각선, 현재 접점)
  svg.push(`<path d="M ${pivot.x} ${pivot.y} L ${t1.x} ${t1.y}" stroke="black" fill="none" stroke-width="2.2"/>`);
  // common → out(n_top)
  svg.push(`<path d="M ${pivot.x} ${pivot.y} L ${outX} ${pivot.y}" stroke="black" fill="none" stroke-width="2"/>`);
  // 라벨
  svg.push(`<text x="${t2.x - 8}" y="${t2.y - 8}" text-anchor="end" font-size="11" fill="#475569">단자2</text>`);
  svg.push(`<text x="${t1.x - 8}" y="${t1.y + 12}" text-anchor="end" font-size="11" fill="#475569">단자1</text>`);
  svg.push(`<text x="${(pivot.x + t2.x) / 2}" y="${t2.y - 22}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="600">SW (t=0)</text>`);
}
