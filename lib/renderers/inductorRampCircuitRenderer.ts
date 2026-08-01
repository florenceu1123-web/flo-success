/**
 * i(t) 램프 → L 도출 (임용 2번 회로이론) 전용 fixed-slot 회로 렌더러.
 *
 * 원본 배치 그대로:
 *   좌측 세로 전원 ─ 상단 도선에 SW(t=0) + R ─ 우측 세로에 L(v_L 측정, i(t) 화살표) ─ 하단 도선
 *
 * 쌍대(변형유형)는 전원이 전류원, 소자가 커패시터로 바뀐다.
 */

import type { CircuitNetlist } from "@/types";

const STROKE = "#111827";
const WIRE_W = 1.6;
const RED = "#dc2626";
const BLUE = "#1d4ed8";

export type InductorRampCircuitDiagram = {
  element: "L" | "C";
  elemLabel: string;      // "L" / "C"
  srcLabel: string;       // "V_s" / "I_s"
  rLabel: string;         // "R"
  measureLabel: string;   // "v_L(t)" / "i_C(t)"
  currentLabel?: string;  // "i(t)"
};

export function renderInductorRampCircuit(d: InductorRampCircuitDiagram): string {
  const W = 620, H = 420;
  const XL = 110, XR = 470, TOP = 90, BOT = 340;
  const s: string[] = [];

  // 외곽 도선
  s.push(line(XL, TOP, XR, TOP));
  s.push(line(XL, BOT, XR, BOT));

  // 좌측 전원 (세로)
  s.push(source(XL, TOP, BOT, d.element === "L" ? "V" : "I"));
  s.push(text(XL - 34, (TOP + BOT) / 2 - 6, d.srcLabel, { size: 13, weight: 700, anchor: "end", fill: BLUE }));

  // 상단: SW(t=0) → R
  const xSw = XL + 110;
  s.push(switchSym(xSw, TOP));
  s.push(text(xSw + 4, TOP - 30, "SW", { size: 13, weight: 700 }));
  s.push(text(xSw + 4, TOP - 14, "t=0", { size: 11, weight: 500, fill: "#6b7280" }));
  const xR1 = xSw + 60, xR2 = xR1 + 90;
  s.push(hRes(xR1, xR2, TOP, d.rLabel));

  // 우측 세로: 소자 (L 코일 / C 평행판) + 측정 라벨 + i(t) 화살표
  if (d.element === "L") s.push(vCoil(XR, TOP + 40, BOT - 40, d.elemLabel));
  else s.push(vCap(XR, TOP + 40, BOT - 40, d.elemLabel));
  s.push(line(XR, TOP, XR, TOP + 40), line(XR, BOT - 40, XR, BOT));

  // i(t) 화살표 — 상단 우측 진입부
  const xi = XR - 55;
  s.push(`<line x1="${xi - 26}" y1="${TOP - 22}" x2="${xi + 18}" y2="${TOP - 22}" stroke="${BLUE}" stroke-width="1.6"/>`);
  s.push(`<path d="M${xi + 18},${TOP - 22} L${xi + 10},${TOP - 26} L${xi + 10},${TOP - 18} Z" fill="${BLUE}"/>`);
  s.push(text(xi - 30, TOP - 26, d.currentLabel ?? "i(t)", { size: 13, weight: 700, fill: BLUE, anchor: "end" }));

  // v_L 극성 표시 (+ 위 / − 아래)
  const cy = (TOP + BOT) / 2;
  s.push(text(XR + 46, cy - 26, "+", { size: 14, weight: 700, fill: RED, anchor: "start" }));
  s.push(text(XR + 46, cy + 34, "−", { size: 16, weight: 700, fill: RED, anchor: "start" }));
  s.push(text(XR + 58, cy + 6, d.measureLabel, { size: 13, weight: 700, fill: RED, anchor: "start" }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${s.join("\n")}\n</svg>`;
}

/** netlist 경유 렌더는 쓰지 않지만, 타입 호환을 위해 감지기를 둔다. */
export function detectInductorRampCircuit(netlist: CircuitNetlist): boolean {
  return netlist.archetype === "INDUCTOR_RAMP";
}

function switchSym(x: number, y: number): string {
  return `<circle cx="${x - 12}" cy="${y}" r="3.5" fill="white" stroke="${STROKE}" stroke-width="1.4"/>` +
    `<circle cx="${x + 22}" cy="${y}" r="3.5" fill="white" stroke="${STROKE}" stroke-width="1.4"/>` +
    `<line x1="${x - 12}" y1="${y}" x2="${x + 18}" y2="${y - 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function hRes(x1: number, x2: number, y: number, label: string): string {
  const cx = (x1 + x2) / 2, half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  return line(x1, y, cx - half, y) + line(cx + half, y, x2, y) +
    `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>` +
    text(cx, y - a - 10, label, { size: 13, weight: 700, fill: BLUE });
}

function vCoil(x: number, y1: number, y2: number, label: string): string {
  const cy = (y1 + y2) / 2, sh = 34, n = 4, r = sh / n;
  let p = `M${x},${cy - sh}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 0 ${x},${cy - sh + r * (2 * i + 2)}`;
  return line(x, y1, x, cy - sh) + line(x, cy + sh, x, y2) +
    `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    text(x - r - 12, cy + 4, label, { size: 13, weight: 700, fill: BLUE, anchor: "end" });
}

function vCap(x: number, y1: number, y2: number, label: string): string {
  const cy = (y1 + y2) / 2, g = 6, pw = 16;
  return line(x, y1, x, cy - g) + line(x, cy + g, x, y2) +
    `<line x1="${x - pw}" y1="${cy - g}" x2="${x + pw}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${x - pw}" y1="${cy + g}" x2="${x + pw}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    text(x - pw - 8, cy + 4, label, { size: 13, weight: 700, fill: BLUE, anchor: "end" });
}

function source(cx: number, topY: number, botY: number, kind: "V" | "I"): string {
  const cy = (topY + botY) / 2, r = 22;
  const inner = kind === "V"
    ? `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">+</text>` +
      `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">−</text>`
    : `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 10}" stroke="${STROKE}" stroke-width="1.6"/>` +
      `<path d="M${cx - 5},${cy - 6} L${cx},${cy - 15} L${cx + 5},${cy - 6} Z" fill="${STROKE}"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${inner}` +
    line(cx, topY, cx, cy - r) + line(cx, cy + r, cx, botY);
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function text(
  x: number, y: number, str: string,
  o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  const esc = String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc}</text>`;
}
