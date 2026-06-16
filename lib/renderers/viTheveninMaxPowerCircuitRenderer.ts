import type { ViTheveninMaxPowerCircuitDiagram } from "@/types";

/**
 * 2전압원 + 2전류원 테브난+최대전력 (임용 5번) 전용 fixed-slot 렌더러.
 *
 *  TL ─R1─ c ─R2─ a
 *  │                │
 *  V1(직렬)       R_L (부하, 점선)
 *  V2              │
 *  │      Iup↑ Idown↑   │
 *  BL ────┴────┴──── b(GND)
 *  ★ 두 전류원은 모두 마디 c(R2 좌측)에 연결 — R2 중간 탭 금지.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const DOT_R = 3.4;
const BLUE = "#1d4ed8";
const PURPLE = "#7c3aed";

const SVG_W = 720;
const SVG_H = 470;

const VX = 110;     // 좌측 전압원 leg
const TOP = 85;     // 상단 rail
const BOT = 410;    // 하단 rail
// 상단 rail x 슬롯
const R1L = 165, R1R = 275;   // R1 (TL→c 사이)
const CX = 320;               // 마디 c (dot)
const IUP_X = 360, IDOWN_X = 430; // 전류원 (둘 다 c-rail, R2 좌측)
const R2L = 480, R2R = 590;   // R2 (c→a 사이)
const AX = 640;               // 단자 a
const CSY = 250;              // 전류원/전압원/R_L 세로 중심

type D = ViTheveninMaxPowerCircuitDiagram;

export function renderViTheveninMaxPowerCircuit(d: D): string {
  const p: string[] = [];

  // ── 도선 ──
  // 상단 rail: TL → R1 → c-rail → R2 → a
  p.push(line(VX, TOP, R1L, TOP));
  p.push(line(R1R, TOP, R2L, TOP));     // c-rail (R1 우 ~ R2 좌, 마디 c)
  p.push(line(R2R, TOP, AX, TOP));      // R2 우 → a
  // 좌측 전압원 leg: TL → V1 → V2 → BL
  p.push(line(VX, TOP, VX, 150));
  p.push(line(VX, 206, VX, 296));       // V1-V2 사이
  p.push(line(VX, 352, VX, BOT));
  // 전류원 leg (둘 다 c-rail → 하단)
  p.push(line(IUP_X, TOP, IUP_X, CSY - 26));
  p.push(line(IUP_X, CSY + 26, IUP_X, BOT));
  p.push(line(IDOWN_X, TOP, IDOWN_X, CSY - 26));
  p.push(line(IDOWN_X, CSY + 26, IDOWN_X, BOT));
  // R_L leg (a → b)
  p.push(line(AX, TOP, AX, 196));
  p.push(line(AX, 304, AX, BOT));
  // 하단 rail
  p.push(line(VX, BOT, AX, BOT));

  // ── 심볼 ──
  p.push(vSource(VX, 178, d.v1Label, "V1"));
  p.push(vSource(VX, 324, d.v2Label, "V2"));
  p.push(zigzagH(R1L, R1R, TOP)); // R1
  p.push(zigzagH(R2L, R2R, TOP)); // R2
  p.push(iSource(IUP_X, CSY, true, d.iupLabel, "Iup"));    // ↑
  p.push(iSource(IDOWN_X, CSY, false, d.idownLabel, "Idown")); // ↓ (1mA 등)
  p.push(loadBox(AX, 250));        // R_L 점선 박스

  // ── 노드 dot ──
  p.push(dot(CX, TOP));
  p.push(dot(IUP_X, TOP), dot(IDOWN_X, TOP));
  p.push(dot(AX, TOP));
  p.push(dot(IUP_X, BOT), dot(IDOWN_X, BOT), dot(AX, BOT), dot(VX, BOT));

  // ── 라벨 ──
  p.push(text(CX, TOP - 12, "c", { size: 15, weight: 700, fill: BLUE }));
  p.push(text(AX + 12, TOP - 10, "a", { size: 15, weight: 700, anchor: "start", fill: "#dc2626" }));
  p.push(text(IUP_X - 12, BOT + 20, "b", { size: 15, weight: 700, anchor: "end", fill: "#dc2626" }));
  p.push(gndSymbol(IUP_X, BOT));

  // 소자 라벨
  p.push(text(R1L + 55, TOP - 14, "R₁", { size: 13, weight: 600 }));
  p.push(text(R1L + 55, TOP + 24, d.r1Label, { size: 12 }));
  p.push(text(R2L + 55, TOP - 14, "R₂", { size: 13, weight: 600 }));
  p.push(text(R2L + 55, TOP + 24, d.r2Label, { size: 12 }));
  p.push(text(AX + 18, 250, "R_L", { size: 13, weight: 600, anchor: "start", fill: PURPLE }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function vSource(cx: number, cy: number, label: string, name: string): string {
  const r = 22;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="13" fill="${STROKE}">+</text>` +
    `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="14" fill="${STROKE}">−</text>` +
    text(cx - 30, cy - 6, name, { size: 12, weight: 600, anchor: "end" }) +
    text(cx - 30, cy + 11, label, { size: 12, anchor: "end" });
}
function iSource(cx: number, cy: number, up: boolean, label: string, name: string): string {
  const r = 22;
  const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const ay1 = up ? cy + 11 : cy - 11, ay2 = up ? cy - 11 : cy + 11;
  const shaft = `<line x1="${cx}" y1="${ay1}" x2="${cx}" y2="${ay2}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const headY = up ? cy - 15 : cy + 15, hb = up ? cy - 7 : cy + 7;
  const head = `<polygon points="${cx},${headY} ${cx - 4},${hb} ${cx + 4},${hb}" fill="${STROKE}"/>`;
  return circle + shaft + head +
    text(cx + 28, cy - 4, name, { size: 12, weight: 600, anchor: "start", fill: BLUE }) +
    text(cx + 28, cy + 13, label, { size: 12, anchor: "start", fill: BLUE });
}
function loadBox(cx: number, cy: number): string {
  // R_L 점선 박스 (학생 도출 부하)
  return `<rect x="${cx - 13}" y="${cy - 28}" width="26" height="56" fill="white" stroke="${PURPLE}" stroke-width="1.5" stroke-dasharray="5 3"/>`;
}
function gndSymbol(cx: number, y: number): string {
  return `<g stroke="${STROKE}" stroke-width="${WIRE_W}">` +
    `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 8}"/>` +
    `<line x1="${cx - 10}" y1="${y + 8}" x2="${cx + 10}" y2="${y + 8}"/>` +
    `<line x1="${cx - 6}" y1="${y + 12}" x2="${cx + 6}" y2="${y + 12}"/>` +
    `<line x1="${cx - 2}" y1="${y + 16}" x2="${cx + 2}" y2="${y + 16}"/></g>`;
}

const R_AMP = 8, R_TEETH = 6, R_PAD = 10;
function zigzagH(x0: number, x1: number, y: number): string {
  const xa = x0 + R_PAD, xb = x1 - R_PAD, seg = (xb - xa) / R_TEETH;
  const pts: Array<[number, number]> = [[x0, y], [xa, y]];
  for (let i = 0; i < R_TEETH; i++) pts.push([xa + seg * (i + 0.5), y + (i % 2 === 0 ? -R_AMP : R_AMP)]);
  pts.push([xb, y], [x1, y]);
  return `<polyline points="${pts.map((q) => `${q[0]},${q[1]}`).join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}

// ─── primitives ──────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}
function text(
  x: number, y: number, s: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  return `<text x="${x}" y="${y}" text-anchor="${opts.anchor ?? "middle"}" font-size="${opts.size ?? 12}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? STROKE}">${escapeSvg(s)}</text>`;
}
function escapeSvg(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
