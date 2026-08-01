/**
 * SW + 상보형 2단 BJT 바이어스 (임용 10번) 전용 fixed-slot 렌더러.
 *
 *  구조 (사용자 확인 2026-07-23):
 *   +V_CC ─┬─ SW ─ R1 ─ B1 ─ R2 ─ GND            (좌측 분압, Q1 베이스)
 *          ├─ R5 ─ C1(Q1 컬렉터)
 *          └─ R6 ─ E2(Q2 이미터, PNP)
 *   Q1(NPN): base=B1, emitter ─ R3 ─ M ─ R4 ─ GND,  ★M = Q2 base★
 *   Q2(PNP): base=M, collector ─ R7 ─ GND,  V_O = collector
 *   R5(Q1 컬렉터)·R6(Q2 이미터) = 학생 도출 미지 (점선 박스).
 */
import type { BjtTwoStageSwitchedCircuitDiagram } from "@/types";

const S = 'stroke="black" fill="none" stroke-width="2"';
const wire = (x1: number, y1: number, x2: number, y2: number) =>
  `<path d="M ${x1} ${y1} L ${x2} ${y2}" ${S}/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
const txt = (x: number, y: number, s: string, anchor = "start", color = "#1e3a8a", size = 13) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-family="sans-serif" fill="${color}" text-anchor="${anchor}">${s}</text>`;

/** 세로 저항 (지그재그, 중앙 y 기준 높이 44). 리드는 호출측에서 연결. */
function resistorV(cx: number, cy: number): string {
  const h = 22;
  const pts = [
    [cx, cy - h], [cx - 7, cy - h + 6], [cx + 7, cy - h + 16],
    [cx - 7, cy - h + 26], [cx + 7, cy - h + 36], [cx, cy + h],
  ];
  return `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" ${S}/>`;
}
/** 가변저항 대각 화살표 (좌하→우상 관통, 끝에 화살촉). */
function varArrow(cx: number, cy: number): string {
  const x1 = cx - 17, y1 = cy + 20, x2 = cx + 17, y2 = cy - 20;
  return (
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="1.5"/>` +
    `<path d="M ${x2 - 8} ${y2 + 2} L ${x2} ${y2} L ${x2 - 3} ${y2 + 8} z" fill="black" stroke="black" stroke-width="1"/>`
  );
}
/** 스위치 (SW) — 세로 방향, 열린 arm. */
function switchV(cx: number, topY: number, botY: number): string {
  return (
    dot(cx, topY) + dot(cx, botY) +
    `<path d="M ${cx} ${topY} L ${cx + 18} ${botY - 4}" ${S}/>` +
    txt(cx - 24, (topY + botY) / 2 + 4, "SW", "end")
  );
}
/** NPN: bar 세로, base 좌측, collector 위(사선), emitter 아래(사선, 화살표 밖). */
function npn(barX: number, barCy: number): { svg: string; colX: number; colY: number; emX: number; emY: number; baseY: number } {
  const bh = 22;
  const barTop = barCy - bh, barBot = barCy + bh;
  const colX = barX + 26, colY = barCy - 30;
  const emX = barX + 26, emY = barCy + 30;
  const svg =
    `<line x1="${barX}" y1="${barTop}" x2="${barX}" y2="${barBot}" ${S}/>` +
    wire(barX, barTop + 8, colX, colY) +      // collector 사선(위)
    wire(barX, barBot - 8, emX, emY) +          // emitter 사선(아래)
    // NPN 이미터 화살표 (밖으로, emX·emY 방향)
    `<path d="M ${emX - 8} ${emY - 6} L ${emX} ${emY} L ${emX - 9} ${emY - 1}" fill="black" stroke="black" stroke-width="1"/>`;
  return { svg, colX, colY, emX, emY, baseY: barCy };
}
/** PNP: bar 세로, base 좌측, emitter 위(사선, 화살표 안), collector 아래(사선). */
function pnp(barX: number, barCy: number): { svg: string; emX: number; emY: number; colX: number; colY: number; baseY: number } {
  const bh = 22;
  const barTop = barCy - bh, barBot = barCy + bh;
  const emX = barX + 26, emY = barCy - 30;   // emitter 위
  const colX = barX + 26, colY = barCy + 30; // collector 아래
  const svg =
    `<line x1="${barX}" y1="${barTop}" x2="${barX}" y2="${barBot}" ${S}/>` +
    wire(barX, barTop + 8, emX, emY) +          // emitter 사선(위)
    wire(barX, barBot - 8, colX, colY) +        // collector 사선(아래)
    // PNP 이미터 화살표 (bar 안쪽으로 향함)
    `<path d="M ${barX + 10} ${barTop + 12} L ${barX + 2} ${barTop + 6} L ${barX + 11} ${barTop + 4} z" fill="black" stroke="black" stroke-width="1"/>`;
  return { svg, emX, emY, colX, colY, baseY: barCy };
}

type D = BjtTwoStageSwitchedCircuitDiagram;

export function renderBjtTwoStageSwitchedCircuit(d: D): string {
  const TOP = 70, GND = 580;
  const railL = 100, railR = 600;
  const divX = 140;   // 분압 열
  const q1X = 300;    // Q1 bar
  const q2X = 480;    // Q2 bar

  let s = "";
  // 상단 V_CC 레일
  s += wire(railL, TOP, railR, TOP);
  s += txt(300, TOP - 14, `+${d.Vcc}[V]`, "middle", "#1e3a8a", 15);
  s += dot(300, TOP);

  // ── 좌측 분압: V_CC ─ SW ─ R1 ─ B1 ─ R2 ─ GND ──
  s += wire(divX, TOP, divX, 110);
  s += switchV(divX, 110, 150);                 // SW
  s += wire(divX, 150, divX, 175);
  s += resistorV(divX, 197); s += txt(divX - 22, 201, "R_1", "end"); s += txt(divX - 22, 216, `${d.R1}kΩ`, "end", "#666", 11);
  s += wire(divX, 219, divX, 300);              // → B1
  const B1Y = 300;
  s += dot(divX, B1Y);
  s += wire(divX, B1Y, divX, 338);              // B1 → R2 top (틈 메움)
  s += resistorV(divX, 360); s += txt(divX - 22, 364, "R_2", "end"); s += txt(divX - 22, 379, `${d.R2}kΩ`, "end", "#666", 11);
  s += wire(divX, 382, divX, GND);
  s += wire(divX, GND, railR, GND);             // 하단 GND 레일

  // ── Q1 (NPN) ──
  const Q1 = npn(q1X, B1Y);
  s += Q1.svg;
  s += txt(q1X - 30, B1Y - 30, "Q_1", "end", "#1e3a8a");
  // base ← B1
  s += wire(divX, B1Y, q1X, B1Y);
  s += txt((divX + q1X) / 2, B1Y - 6, "V_BE1", "middle", "#666", 11);
  // collector → R5 → V_CC
  s += wire(Q1.colX, Q1.colY, Q1.colX, 187);    // collector → R5 bottom (틈 메움)
  s += resistorV(Q1.colX, 165); s += varArrow(Q1.colX, 165); s += txt(Q1.colX + 22, 168, "R_5", "start");
  s += wire(Q1.colX, 143, Q1.colX, TOP);
  s += dot(Q1.colX, TOP);
  s += txt(Q1.colX + 8, Q1.colY + 4, "V_CE1", "start", "#666", 11);
  // emitter → R3 → M
  s += wire(Q1.emX, Q1.emY, Q1.emX, 360);
  s += resistorV(Q1.emX, 382); s += txt(Q1.emX + 20, 386, "R_3", "start"); s += txt(Q1.emX + 20, 401, `${d.R3}kΩ`, "start", "#666", 11);
  s += wire(Q1.emX, 404, Q1.emX, 440);
  const MY = 440;
  s += dot(Q1.emX, MY);
  s += txt(Q1.emX - 8, MY - 6, "M", "end", "#dc2626", 12);
  // M → R4 → GND
  s += wire(Q1.emX, MY, Q1.emX, 478);           // M → R4 top (틈 메움)
  s += resistorV(Q1.emX, 500); s += txt(Q1.emX - 20, 504, "R_4", "end"); s += txt(Q1.emX - 20, 519, `${d.R4}kΩ`, "end", "#666", 11);
  s += wire(Q1.emX, 522, Q1.emX, GND);

  // ── Q2 (PNP), base ← M ──
  const Q2 = pnp(q2X, MY);
  s += Q2.svg;
  s += txt(q2X - 30, MY - 30, "Q_2", "end", "#1e3a8a");
  s += wire(Q1.emX, MY, q2X, MY);               // M → Q2 base
  s += txt((Q1.emX + q2X) / 2, MY - 6, "V_EB2", "middle", "#666", 11);
  // emitter → R6 → V_CC
  s += wire(Q2.emX, Q2.emY, Q2.emX, 187);       // emitter → R6 bottom (틈 메움)
  s += resistorV(Q2.emX, 165); s += varArrow(Q2.emX, 165); s += txt(Q2.emX + 22, 168, "R_6", "start");
  s += wire(Q2.emX, 143, Q2.emX, TOP);
  s += dot(Q2.emX, TOP);
  s += txt(Q2.emX + 8, Q2.emY + 4, "V_EC2", "start", "#666", 11);
  // collector → R7 → GND + V_O
  s += wire(Q2.colX, Q2.colY, Q2.colX, 480);
  const VOY = 480;
  s += dot(Q2.colX, VOY);
  s += wire(Q2.colX, VOY, Q2.colX, 498);        // V_O 노드 → R7 top (틈 메움)
  s += resistorV(Q2.colX, 520); s += txt(Q2.colX + 20, 524, "R_7", "start"); s += txt(Q2.colX + 20, 539, `${d.R7}kΩ`, "start", "#666", 11);
  s += wire(Q2.colX, 542, Q2.colX, GND);
  // V_O 단자
  s += wire(Q2.colX, VOY, railR - 20, VOY);
  s += dot(railR - 20, VOY);
  s += txt(railR - 14, VOY + 4, "V_O", "start", "#dc2626", 14);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 680 620">${s}</svg>`;
}
