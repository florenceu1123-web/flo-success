import type { CircuitNetlist } from "@/types";

/**
 * OPAMP 차동증폭기 (임용 9번) 전용 fixed-slot 렌더러.
 *   generic OPAMP 렌더러가 노턴 입력(I_n∥R_n) + V+ 분배(R_3·R_4) 구조를 겹쳐 그리는 문제 회피.
 *   archetype 태그 "OPAMP_DIFFERENCE_AMP"로 dispatch.
 *
 *   레이아웃:
 *     반전 입력 rail(상단): I_n ∥ R_n (좌측 수직) — R_1 — V−
 *     피드백: V_o → R_2(상단 아치) → V−
 *     비반전 입력 rail(하단): V_p(수직) — R_3 — V+,  R_4: V+ → GND
 *     U1 출력 → 단자 a
 */
export function detectOpampDifferenceAmpCircuit(netlist: CircuitNetlist): boolean {
  return netlist.archetype === "OPAMP_DIFFERENCE_AMP";
}

// 고정 좌표
const Y_INV = 150;   // 반전 입력 rail
const Y_NIN = 300;   // 비반전 입력 rail
const Y_GND = 420;   // 하단 GND rail
const Y_FB = 70;     // 피드백 상단 아치
const X_IN = 80;     // I_n 수직
const X_RN = 160;    // R_n 수직
const X_VP = 250;    // V_p 수직
const X_VNODE = 380; // V−·V+ 노드 x
const OPX = 430;     // OPAMP 좌변 x
const OP_APEX = 540; // OPAMP 꼭짓점
const X_VO = 680;    // 출력 단자 a
const W = 760, H = 480;

const val = (netlist: CircuitNetlist, id: string): string => {
  const c = netlist.components.find((x) => x.id === id);
  return c?.value !== undefined ? String(c.value) : id;
};

export function renderOpampDifferenceAmpCircuit(netlist: CircuitNetlist): string {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // ── 반전 입력 rail: I_n ∥ R_n — R_1 — V− ──
  s += currentSource(X_IN, Y_INV, Y_GND, val(netlist, "I_n"), "I_n");
  s += vResistor(X_RN, Y_INV, Y_GND, val(netlist, "R_n"), "R_n");
  s += wire(X_IN, Y_INV, X_RN, Y_INV);            // top wire I_n↔R_n (node N)
  s += dot(X_RN, Y_INV);
  s += hResistor((X_RN + X_VNODE) / 2, Y_INV, val(netlist, "R_1"), "R_1");
  s += wire(X_RN, Y_INV, (X_RN + X_VNODE) / 2 - 28, Y_INV);
  s += wire((X_RN + X_VNODE) / 2 + 28, Y_INV, X_VNODE, Y_INV);
  s += wire(X_VNODE, Y_INV, OPX, Y_INV);          // → V− pin
  s += dot(X_VNODE, Y_INV);
  s += label(X_VNODE - 6, Y_INV - 8, "V−", "end", "#1e3a8a", 12);

  // ── 피드백 R_2: V_o → 상단 아치 → V− ──
  s += wire(X_VNODE, Y_INV, X_VNODE, Y_FB);
  s += hResistor((X_VNODE + (OP_APEX + 40)) / 2, Y_FB, val(netlist, "R_2"), "R_2");
  s += wire(X_VNODE, Y_FB, (X_VNODE + (OP_APEX + 40)) / 2 - 28, Y_FB);
  s += wire((X_VNODE + (OP_APEX + 40)) / 2 + 28, Y_FB, OP_APEX + 40, Y_FB);
  s += wire(OP_APEX + 40, Y_FB, OP_APEX + 40, (Y_INV + Y_NIN) / 2);  // down to output level

  // ── OPAMP ──
  s += opampTriangle(OPX, Y_INV, Y_NIN, OP_APEX);
  const opOutY = (Y_INV + Y_NIN) / 2;
  s += wire(OP_APEX, opOutY, X_VO, opOutY);
  s += `<circle cx="${X_VO}" cy="${opOutY}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  s += label(X_VO + 10, opOutY + 4, "a", "start", "#dc2626", 13);
  s += dot(OP_APEX + 40, opOutY); // 피드백 분기점

  // ── 비반전 입력 rail: V_p — R_3 — V+,  R_4 → GND ──
  s += voltageSource(X_VP, Y_NIN, Y_GND, val(netlist, "V_p"), "V_p");
  s += hResistor((X_VP + X_VNODE) / 2, Y_NIN, val(netlist, "R_3"), "R_3");
  s += wire(X_VP, Y_NIN, (X_VP + X_VNODE) / 2 - 28, Y_NIN);
  s += wire((X_VP + X_VNODE) / 2 + 28, Y_NIN, X_VNODE, Y_NIN);
  s += wire(X_VNODE, Y_NIN, OPX, Y_NIN);          // → V+ pin
  s += dot(X_VNODE, Y_NIN);
  s += label(X_VNODE - 6, Y_NIN + 16, "V+", "end", "#1e3a8a", 12);
  // R_4: V+ → GND (미지 R)
  s += vResistor(X_VNODE, Y_NIN, Y_GND, val(netlist, "R_4"), "R_4", true);

  // ── GND rail ──
  s += wire(X_IN, Y_GND, X_VNODE, Y_GND);
  s += ground((X_IN + X_VNODE) / 2, Y_GND);

  s += `</svg>`;
  return s;
}

// ─── primitives ───
function wire(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
}
function label(x: number, y: number, t: string, anchor = "start", fill = "#1e3a8a", size = 12): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" font-weight="600">${esc(t)}</text>`;
}
function hResistor(cx: number, cy: number, value: string, name: string): string {
  const z = `M ${cx - 28} ${cy} L ${cx - 21} ${cy - 10} L ${cx - 9} ${cy + 10} L ${cx + 3} ${cy - 10} L ${cx + 15} ${cy + 10} L ${cx + 24} ${cy - 8} L ${cx + 28} ${cy}`;
  return `<path d="${z}" stroke="black" fill="none" stroke-width="2"/>` +
    label(cx, cy - 14, name, "middle") + label(cx, cy + 22, value, "middle", "#475569");
}
/** 수직 저항 (top→GND). unknown이면 보라 점선 강조. */
function vResistor(cx: number, yTop: number, yGnd: number, value: string, name: string, unknown = false): string {
  const midTop = yTop + 36, midBot = midTop + 56;
  let s = wire(cx, yTop, cx, midTop);
  const z = `M ${cx} ${midTop} L ${cx - 10} ${midTop + 7} L ${cx + 10} ${midTop + 19} L ${cx - 10} ${midTop + 31} L ${cx + 10} ${midTop + 43} L ${cx - 8} ${midBot - 4} L ${cx} ${midBot}`;
  s += `<path d="${z}" stroke="black" fill="none" stroke-width="2"/>`;
  s += wire(cx, midBot, cx, yGnd);
  if (unknown) s += `<rect x="${cx - 20}" y="${midTop - 6}" width="40" height="${midBot - midTop + 12}" fill="none" stroke="#7c3aed" stroke-width="1.4" stroke-dasharray="4 3"/>`;
  s += label(cx + 22, midTop + 26, name, "start", unknown ? "#7c3aed" : "#1e3a8a");
  s += label(cx + 22, midTop + 42, value, "start", "#475569");
  return s;
}
function currentSource(cx: number, yTop: number, yGnd: number, value: string, name: string): string {
  const cy = (yTop + yGnd) / 2;
  let s = wire(cx, yTop, cx, cy - 22);
  s += `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="black" stroke-width="2"/>`;
  s += `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 12}" stroke="black" stroke-width="2"/>`;
  s += `<polyline points="${cx - 5},${cy - 6} ${cx},${cy - 12} ${cx + 5},${cy - 6}" stroke="black" fill="none" stroke-width="2"/>`;
  s += wire(cx, cy + 22, cx, yGnd);
  s += label(cx - 26, cy - 2, name, "end") + label(cx - 26, cy + 14, value, "end", "#475569");
  return s;
}
function voltageSource(cx: number, yTop: number, yGnd: number, value: string, name: string): string {
  const cy = (yTop + yGnd) / 2;
  let s = wire(cx, yTop, cx, cy - 22);
  s += `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="black" stroke-width="2"/>`;
  s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="15">+</text>`;
  s += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="15">−</text>`;
  s += wire(cx, cy + 22, cx, yGnd);
  s += label(cx - 26, cy - 2, name, "end") + label(cx - 26, cy + 14, value, "end", "#475569");
  return s;
}
/** OPAMP 삼각형 — 좌변 x=ox, 위 yTop·아래 yBot, 꼭짓점 apex. −는 위, +는 아래. */
function opampTriangle(ox: number, yTop: number, yBot: number, apex: number): string {
  const oy = (yTop + yBot) / 2;
  let s = `<path d="M ${ox} ${yTop - 30} L ${ox} ${yBot + 30} L ${apex} ${oy} Z" fill="white" stroke="black" stroke-width="2"/>`;
  s += label(ox + 12, yTop + 6, "−", "start", "#000", 16);
  s += label(ox + 12, yBot - 0, "+", "start", "#000", 16);
  s += label(ox + 40, yTop - 16, "U1", "middle", "#1e3a8a", 12);
  // 입력 핀 stub
  s += wire(ox, yTop, ox, yTop); // (pin 위치는 rail wire가 이미 OPX까지 옴)
  return s;
}
function ground(cx: number, y: number): string {
  return `<g transform="translate(${cx},${y})">` +
    `<line x1="0" y1="0" x2="0" y2="12" stroke="black" stroke-width="2"/>` +
    `<line x1="-12" y1="12" x2="12" y2="12" stroke="black" stroke-width="2.4"/>` +
    `<line x1="-8" y1="16" x2="8" y2="16" stroke="black" stroke-width="2"/>` +
    `<line x1="-4" y1="20" x2="4" y2="20" stroke="black" stroke-width="2"/></g>`;
}
function esc(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
