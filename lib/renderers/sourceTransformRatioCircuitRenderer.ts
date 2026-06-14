import type { CircuitNetlist } from "@/types";

/**
 * 전원변환 + 전압비 (임용 7번) 전용 fixed-slot 렌더러.
 *   generic mesh/cross 렌더러가 3-top-node + 우측 병렬쌍(R_a∥R_x)을 겹쳐 그리는 문제 회피.
 *   archetype 태그로 두 폼을 구분:
 *     "SOURCE_TRANSFORM_CURRENT"  — (가) 전류원 ∥ R_p — R_m — R_a∥R_x
 *     "SOURCE_TRANSFORM_VOLTAGE"  — (나) V_s — R_1 — R_2 — R_a∥R_x  (+ V_1·V_2·V_3·I_3 표시)
 */
export function detectSourceTransformCircuit(netlist: CircuitNetlist): "current" | "voltage" | null {
  if (netlist.archetype === "SOURCE_TRANSFORM_CURRENT") return "current";
  if (netlist.archetype === "SOURCE_TRANSFORM_VOLTAGE") return "voltage";
  return null;
}

// ── 고정 좌표 ──
const TOP_Y = 90;
const BOT_Y = 360;
const LEAD = 22; // 소자 lead 길이

// 우측 병렬쌍 (두 폼 공통)
const X_RA = 470;
const X_RX = 600;
const WIDTH = 720;
const HEIGHT = 430;

const val = (netlist: CircuitNetlist, id: string): string => {
  const c = netlist.components.find((x) => x.id === id);
  return c?.value !== undefined ? String(c.value) : id;
};

export function renderSourceTransformCircuit(netlist: CircuitNetlist): string {
  const form = detectSourceTransformCircuit(netlist);
  if (!form) return "";
  const body = form === "current" ? drawCurrentForm(netlist) : drawVoltageForm(netlist);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${body}</svg>`;
}

/** (가) 전류원 폼: I_s ∥ R_p (좌측 병렬) — R_m(top) — R_a ∥ R_x(우측 병렬) */
function drawCurrentForm(netlist: CircuitNetlist): string {
  const X_IS = 110;
  const X_RP = 240;
  let s = "";
  // 좌측 top rail (n_top): I_s ─ R_p 위쪽 연결
  s += wire(X_IS, TOP_Y, X_RP, TOP_Y);
  // R_m: n_top(R_p) → n_mid(R_a) top
  s += hResistor((X_RP + X_RA) / 2, TOP_Y, val(netlist, "R_m"), "R_m");
  s += wire(X_RP, TOP_Y, (X_RP + X_RA) / 2 - 28, TOP_Y);
  s += wire((X_RP + X_RA) / 2 + 28, TOP_Y, X_RA, TOP_Y);
  // 우측 top rail (n_mid): R_a ─ R_x
  s += wire(X_RA, TOP_Y, X_RX, TOP_Y);
  // 하단 rail
  s += wire(X_IS, BOT_Y, X_RX, BOT_Y);
  // 좌측 병렬: I_s, R_p
  s += currentSource(X_IS, val(netlist, "I_s"), "I_s");
  s += vResistor(X_RP, val(netlist, "R_p"), "R_p");
  // 우측 병렬: R_a(고정), R_x(=R_3 미지)
  s += vResistor(X_RA, val(netlist, "R_a"), "R_a");
  s += vResistor(X_RX, val(netlist, "R_x"), "R_3", true);
  // junction dots
  s += dot(X_RP, TOP_Y) + dot(X_RA, TOP_Y);
  s += dot(X_RP, BOT_Y) + dot(X_RA, BOT_Y);
  // ground (하단 중앙)
  s += ground((X_IS + X_RX) / 2, BOT_Y);
  return s;
}

/** (나) 전압원 폼: V_s — R_1 — R_2 — R_a ∥ R_x. V_1·V_2·V_3·I_3 측정 표시 */
function drawVoltageForm(netlist: CircuitNetlist): string {
  const X_VS = 110;
  const X_NA = 290;
  let s = "";
  // top rail: V_s ─ R_1 ─ n_a ─ R_2 ─ n_mid
  s += hResistor((X_VS + X_NA) / 2, TOP_Y, val(netlist, "R_1"), "R_1");
  s += wire(X_VS, TOP_Y, (X_VS + X_NA) / 2 - 28, TOP_Y);
  s += wire((X_VS + X_NA) / 2 + 28, TOP_Y, X_NA, TOP_Y);
  s += hResistor((X_NA + X_RA) / 2, TOP_Y, val(netlist, "R_2"), "R_2");
  s += wire(X_NA, TOP_Y, (X_NA + X_RA) / 2 - 28, TOP_Y);
  s += wire((X_NA + X_RA) / 2 + 28, TOP_Y, X_RA, TOP_Y);
  // 우측 top rail (n_mid): R_a ─ R_x
  s += wire(X_RA, TOP_Y, X_RX, TOP_Y);
  // 하단 rail
  s += wire(X_VS, BOT_Y, X_RX, BOT_Y);
  // 좌측: V_s
  s += voltageSource(X_VS, val(netlist, "V_s"), "V_s");
  // 우측 병렬: R_a, R_x
  s += vResistor(X_RA, val(netlist, "R_a"), "R_a");
  s += vResistor(X_RX, val(netlist, "R_x"), "R_3", true);
  // junction dots
  s += dot(X_NA, TOP_Y) + dot(X_RA, TOP_Y);
  s += dot(X_RA, BOT_Y);
  // 측정 표시: V_1(R_1), V_2(R_2), V_3(병렬블록), I_3(R_x)
  s += vDrop((X_VS + X_NA) / 2, TOP_Y, "V_1");
  s += vDrop((X_NA + X_RA) / 2, TOP_Y, "V_2");
  s += `<text x="${(X_RA + X_RX) / 2}" y="${TOP_Y + 24}" text-anchor="middle" font-size="12" fill="#b91c1c" font-weight="600">V_3</text>`;
  // I_3 (R_x 전류, 아래 방향 화살표)
  s += `<path d="M ${X_RX + 16} ${TOP_Y + 70} L ${X_RX + 16} ${TOP_Y + 110}" stroke="#b91c1c" stroke-width="1.6" fill="none"/>`;
  s += `<polyline points="${X_RX + 11},${TOP_Y + 104} ${X_RX + 16},${TOP_Y + 110} ${X_RX + 21},${TOP_Y + 104}" stroke="#b91c1c" fill="none" stroke-width="1.6"/>`;
  s += `<text x="${X_RX + 24}" y="${TOP_Y + 92}" text-anchor="start" font-size="12" fill="#b91c1c" font-weight="600">I_3</text>`;
  // ground
  s += ground((X_VS + X_RX) / 2, BOT_Y);
  return s;
}

// ─── primitives ───
function wire(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
}
function lbl(x: number, y: number, t: string, anchor = "start", fill = "#1e3a8a", size = 12): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" font-weight="600">${esc(t)}</text>`;
}

/** 수평 저항 (zigzag), 중심 (cx, TOP_Y). 라벨은 위(이름)·아래(값). */
function hResistor(cx: number, cy: number, value: string, name: string): string {
  const z = `M ${cx - 28} ${cy} L ${cx - 21} ${cy - 10} L ${cx - 9} ${cy + 10} L ${cx + 3} ${cy - 10} L ${cx + 15} ${cy + 10} L ${cx + 24} ${cy - 8} L ${cx + 28} ${cy}`;
  return `<path d="${z}" stroke="black" fill="none" stroke-width="2"/>` +
    lbl(cx, cy - 16, name, "middle") + lbl(cx, cy + 22, value, "middle", "#475569");
}

/** 수직 저항 (zigzag), top node x=cx (TOP_Y→BOT_Y). 라벨은 우측. unknown이면 점선 박스 강조 */
function vResistor(cx: number, value: string, name: string, unknown = false): string {
  const midTop = TOP_Y + 60;
  const midBot = midTop + 56;
  let s = wire(cx, TOP_Y, cx, midTop);
  const z = `M ${cx} ${midTop} L ${cx - 10} ${midTop + 7} L ${cx + 10} ${midTop + 19} L ${cx - 10} ${midTop + 31} L ${cx + 10} ${midTop + 43} L ${cx - 8} ${midBot - 4} L ${cx} ${midBot}`;
  s += `<path d="${z}" stroke="black" fill="none" stroke-width="2"/>`;
  s += wire(cx, midBot, cx, BOT_Y);
  if (unknown) {
    s += `<rect x="${cx - 20}" y="${midTop - 6}" width="40" height="${midBot - midTop + 12}" fill="none" stroke="#7c3aed" stroke-width="1.4" stroke-dasharray="4 3"/>`;
  }
  s += lbl(cx + 22, midTop + 24, name, "start", unknown ? "#7c3aed" : "#1e3a8a");
  s += lbl(cx + 22, midTop + 40, value, "start", "#475569");
  return s;
}

/** 수직 전압원 (원 + +/−), top node x=cx. */
function voltageSource(cx: number, value: string, name: string): string {
  const cy = (TOP_Y + BOT_Y) / 2;
  let s = wire(cx, TOP_Y, cx, cy - 22);
  s += `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="black" stroke-width="2"/>`;
  s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="15">+</text>`;
  s += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="15">−</text>`;
  s += wire(cx, cy + 22, cx, BOT_Y);
  s += lbl(cx - 26, cy - 2, name, "end");
  s += lbl(cx - 26, cy + 14, value, "end", "#475569");
  return s;
}

/** 수직 전류원 (원 + 화살표 위방향), top node x=cx. */
function currentSource(cx: number, value: string, name: string): string {
  const cy = (TOP_Y + BOT_Y) / 2;
  let s = wire(cx, TOP_Y, cx, cy - 22);
  s += `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="black" stroke-width="2"/>`;
  s += `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 12}" stroke="black" stroke-width="2"/>`;
  s += `<polyline points="${cx - 5},${cy - 6} ${cx},${cy - 12} ${cx + 5},${cy - 6}" stroke="black" fill="none" stroke-width="2"/>`;
  s += wire(cx, cy + 22, cx, BOT_Y);
  s += lbl(cx + 26, cy - 2, name, "start");
  s += lbl(cx + 26, cy + 14, value, "start", "#475569");
  return s;
}

/** 수평 저항 위 전압강하 표시 "+  V_k  −" (왼쪽 +, 오른쪽 −). */
function vDrop(cx: number, cy: number, label: string): string {
  return `<text x="${cx - 36}" y="${cy - 30}" text-anchor="middle" font-size="12" fill="#b91c1c">+</text>` +
    `<text x="${cx}" y="${cy - 30}" text-anchor="middle" font-size="12" fill="#b91c1c" font-weight="600">${esc(label)}</text>` +
    `<text x="${cx + 36}" y="${cy - 30}" text-anchor="middle" font-size="12" fill="#b91c1c">−</text>`;
}

/** ground 심볼 (하단 rail 중앙) */
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

void LEAD;
