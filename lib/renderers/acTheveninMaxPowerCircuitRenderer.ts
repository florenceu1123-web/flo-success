/**
 * 2전원(V+I) 테브난 최대전력 회로 (임용 10번) 전용 fixed-slot 렌더러.
 *
 *  고정 토폴로지 (acTheveninMaxPower generator 전용):
 *    상단 V망:  e ─R_top─ m ─L_s─ a,  V1: e↓GND,  C_v: m↓GND
 *    하단 I망:  I1: GND↑p,  R_i: p→a,  C_i: p↓GND
 *    부하:      R_L: a↓GND
 *  단자 a = 부하 상단, b/GND = 부하 하단.
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

/** 검출 — V 1개 + I 1개 + R_L(value="R_L") + 단자 a annotation 구조. */
export function detectAcTheveninMaxPower(netlist: CircuitNetlist): boolean {
  const comps = netlist.components ?? [];
  const ids = new Set(comps.map((c) => c.id));
  return (
    ids.has("V1") && ids.has("I1") && ids.has("R_L") &&
    ids.has("R_top") && ids.has("L_s") && ids.has("C_v") &&
    ids.has("R_i") && ids.has("C_i") && ids.has("L_i")
  );
}

export function renderAcTheveninMaxPowerCircuit(netlist: CircuitNetlist): string | null {
  if (!detectAcTheveninMaxPower(netlist)) return null;
  const byId = (id: string) => netlist.components.find((c) => c.id === id);

  // ── 고정 좌표 (원본처럼 V박스 위 / I박스 아래, 각 박스 자체 ground) ──
  const xV = 130;     // V1 / I1 소스 (좌)
  const xM = 300;     // C_v (V박스 중) / R_i (I박스, C_i 출력 g)
  const xLi = 420;    // L_i (I박스, R_i와 병렬)
  const xA = 560;     // 단자 a/c (node A) 세로 bus
  const xL = 660;     // R_L (단자 a 뒤 = 오른쪽, 가깝게)
  const yTop = 80;    // V박스 상단 rail
  const yVgnd = 220;  // V박스 바닥 (V망 ground)
  const yItop = 340;  // I박스 상단 rail
  const yIgnd = 480;  // I박스 바닥 (I망 ground)
  const HALF = 28;

  const svg: string[] = [];
  const wire = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
  const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
  // 가로 wire (x1→x2, y) — 교차점 xHop에서 위로 hop(점프, 비접속) 표기.
  const hopWire = (x1: number, x2: number, y: number, xHop: number) => {
    const r = 8;
    return `<path d="M ${x1} ${y} L ${xHop - r} ${y} A ${r} ${r} 0 0 0 ${xHop + r} ${y} L ${x2} ${y}" stroke="black" fill="none" stroke-width="2"/>`;
  };
  const gnd = (x: number, y: number) => `<g transform="translate(${x},${y})">
    <line x1="0" y1="0" x2="0" y2="8" stroke="black" stroke-width="2"/>
    <line x1="-9" y1="8" x2="9" y2="8" stroke="black" stroke-width="2.2"/>
    <line x1="-6" y1="12" x2="6" y2="12" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="16" x2="3" y2="16" stroke="black" stroke-width="2"/></g>`;
  // 세로 component (양옆 wire + mask)
  const vcomp = (c: CircuitComponent, x: number, yA: number, yB: number) => {
    const cy = (yA + yB) / 2;
    svg.push(`<rect x="${x - HALF}" y="${cy - HALF - 2}" width="${HALF * 2}" height="${(HALF + 2) * 2}" fill="white"/>`);
    svg.push(wire(x, yA, x, cy - HALF), wire(x, cy + HALF, x, yB), renderComponentOnEdge(c, { x, y: cy }, "vertical"));
  };
  const hcomp = (c: CircuitComponent, xA: number, xB: number, y: number) => {
    const cx = (xA + xB) / 2;
    svg.push(`<rect x="${cx - HALF - 2}" y="${y - HALF}" width="${(HALF + 2) * 2}" height="${HALF * 2}" fill="white"/>`);
    svg.push(wire(xA, y, cx - HALF, y), wire(cx + HALF, y, xB, y), renderComponentOnEdge(c, { x: cx, y }, "horizontal"));
  };

  // ── V박스 (위, 컴팩트): e ─R_top─ m ─L_s─ a / V1·C_v ↓ V망 ground ──
  hcomp(byId("R_top")!, xV, xM, yTop);
  hcomp(byId("L_s")!, xM, xA, yTop);
  vcomp(byId("V1")!, xV, yTop, yVgnd);
  vcomp(byId("C_v")!, xM, yTop, yVgnd);
  svg.push(dot(xM, yTop)); // m 분기
  // V망 ground rail (V1 ↔ C_v)
  svg.push(wire(xV, yVgnd, xM, yVgnd));
  svg.push(dot(xV, yVgnd), dot(xM, yVgnd));

  // ── I박스 (아래, 컴팩트): I1 ─C_i(직렬)─ g ─[R_i ∥ L_i]─ GND, g→a (원본처럼) ──
  vcomp(byId("I1")!, xV, yItop, yIgnd);          // I 소스 (좌)
  hcomp(byId("C_i")!, xV, xM, yItop);            // 직렬 C (p→g)
  svg.push(dot(xV, yItop));                      // p
  // R_i ∥ L_i (g ↓ GND)
  vcomp(byId("R_i")!, xM, yItop, yIgnd);
  svg.push(wire(xM, yItop, xLi, yItop));         // g → L_i top
  vcomp(byId("L_i")!, xLi, yItop, yIgnd);
  svg.push(dot(xM, yItop));
  // g(=node A) → a 세로 bus
  svg.push(wire(xLi, yItop, xA, yItop));
  // I망 ground rail (I1 ↔ R_i ↔ L_i ↔ b까지 확장)
  svg.push(wire(xV, yIgnd, xL, yIgnd));
  for (const x of [xV, xM, xLi]) svg.push(dot(x, yIgnd));
  svg.push(gnd(xV, yIgnd + 4));

  // ── node A bus (xA): a(V박스 L_s) ↔ c(I박스) ──
  svg.push(wire(xA, yTop, xA, yItop));
  svg.push(dot(xA, yTop), dot(xA, yItop));

  // ── 부하 R_L: 단자 a 뒤(오른쪽). node A ↓ b. ──
  svg.push(wire(xA, yTop, xL, yTop));    // a(node A) → R_L 상단
  vcomp(byId("R_L")!, xL, yTop, yVgnd);  // R_L 세로 (yTop → yVgnd)
  svg.push(dot(xL, yVgnd));              // b
  // C_v bottom ↔ 단자 b 직접 연결 (a-c bus 위로 hop).
  svg.push(hopWire(xM, xL, yVgnd, xA));
  // b ↔ L_i bottom (I망 ground rail로 내려 연결).
  svg.push(wire(xL, yVgnd, xL, yIgnd));
  svg.push(dot(xL, yIgnd));

  // 단자 라벨 a(상단), b(R_L 하단)
  svg.push(`<text x="${xA + 8}" y="${yTop - 8}" font-size="13" fill="#1e3a8a" font-weight="700">a</text>`);
  svg.push(`<text x="${xL + 8}" y="${yVgnd - 6}" font-size="13" fill="#1e3a8a" font-weight="700">b</text>`);

  const svgW = xL + 110;
  const svgH = yIgnd + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n${svg.join("\n")}\n</svg>`;
}
