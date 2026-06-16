import type { FlashAdc2bitCircuitDiagram } from "@/types";

/**
 * 2비트 플래시 ADC (임용 6번 (가)) 전용 fixed-slot 렌더러.
 *
 *  좌: 저항 사다리 (V_top + 4×R) → 기준전압 V_c·V_b·V_a (탭)
 *  중: V_in 버스 + 3개 비교기 (삼각형, + = V_in, − = 기준탭) → C_2·C_1·C_0
 *  우: 점선 인코더 박스 (C_2·C_1·C_0 입력 → Q_1(MSB)·Q_0 출력)
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const DOT_R = 3;
const BLUE = "#1d4ed8";
const PURPLE = "#7c3aed";

const SVG_W = 660;
const SVG_H = 440;

const LX = 70;       // 저항 사다리 x
const VTOP_Y = 45;
const TAP_Y = [120, 205, 290];  // V_c, V_b, V_a
const GND_Y = 380;
const VIN_X = 150;   // V_in 세로 버스
const CMP_L = 215, CMP_R = 285;  // 비교기 삼각형 좌/우
const CMP_CY = [120, 205, 290];  // C_2, C_1, C_0 중심
const BOX_L = 380, BOX_R = 560, BOX_T = 80, BOX_B = 330;
const OUT_X = 620;

type D = FlashAdc2bitCircuitDiagram;

export function renderFlashAdc2bitCircuit(d: D): string {
  const p: string[] = [];

  // ── 저항 사다리 (V_top → R → tap → ... → GND) ──
  p.push(text(LX, VTOP_Y - 8, d.vtopLabel, { size: 13, weight: 700 }));
  p.push(line(LX, VTOP_Y, LX, VTOP_Y + 8));
  const ladderYs = [VTOP_Y + 8, TAP_Y[0], TAP_Y[1], TAP_Y[2], GND_Y];
  for (let i = 0; i < 4; i++) {
    p.push(resistorV(LX, ladderYs[i], ladderYs[i + 1]));
  }
  p.push(gndSym(LX, GND_Y));
  // 탭 dot + 라벨 + 비교기 − 입력으로 연결
  TAP_Y.forEach((ty, i) => {
    p.push(dot(LX, ty));
    p.push(text(LX - 12, ty + 4, d.refLabels[i], { size: 12, anchor: "end", fill: BLUE }));
    // tap → 비교기 − 입력 (cy+12)
    const cy = CMP_CY[i];
    p.push(line(LX, ty, 185, ty));
    p.push(line(185, ty, 185, cy + 12));
    p.push(line(185, cy + 12, CMP_L, cy + 12));
  });

  // ── V_in 버스 (모든 비교기 + 입력) ──
  p.push(text(VIN_X, 22, d.vinLabel, { size: 13, weight: 700, fill: BLUE }));
  p.push(line(VIN_X, 28, VIN_X, 330));
  CMP_CY.forEach((cy) => {
    p.push(line(VIN_X, cy - 12, CMP_L, cy - 12));
    p.push(dot(VIN_X, cy - 12));
  });

  // ── 비교기 3개 + 출력 C_2·C_1·C_0 → 인코더 ──
  CMP_CY.forEach((cy, i) => {
    p.push(comparator(cy));
    p.push(text(CMP_L + 8, cy - 13, "+", { size: 12, anchor: "start" }));
    p.push(text(CMP_L + 8, cy + 17, "−", { size: 13, anchor: "start" }));
    // 출력 → 인코더 박스
    p.push(line(CMP_R, cy, BOX_L, cy));
    p.push(text((CMP_R + BOX_L) / 2, cy - 6, d.compLabels[i], { size: 12, weight: 600, fill: BLUE }));
    p.push(dot(BOX_L, cy));
  });

  // ── 점선 인코더 박스 ──
  p.push(`<rect x="${BOX_L}" y="${BOX_T}" width="${BOX_R - BOX_L}" height="${BOX_B - BOX_T}" fill="none" stroke="${PURPLE}" stroke-width="1.6" stroke-dasharray="6 4" rx="4"/>`);
  p.push(text((BOX_L + BOX_R) / 2, BOX_T - 8, "인코더 (논리회로)", { size: 12, fill: PURPLE }));
  // 출력 Q_1(MSB), Q_0
  const q1y = 150, q0y = 270;
  p.push(line(BOX_R, q1y, OUT_X, q1y));
  p.push(line(BOX_R, q0y, OUT_X, q0y));
  p.push(text(OUT_X + 6, q1y - 6, "(MSB)", { size: 10, anchor: "start", fill: "#6b7280" }));
  p.push(text(OUT_X + 6, q1y + 5, d.outLabels[0], { size: 13, weight: 700, anchor: "start" }));
  p.push(text(OUT_X + 6, q0y + 5, d.outLabels[1], { size: 13, weight: 700, anchor: "start" }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function comparator(cy: number): string {
  // 오른쪽을 향한 삼각형 (op-amp/비교기)
  const top = cy - 26, bot = cy + 26;
  return `<polygon points="${CMP_L},${top} ${CMP_R},${cy} ${CMP_L},${bot}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function resistorV(x: number, y0: number, y1: number): string {
  // 세로 지그재그 저항 + 양끝 리드
  const amp = 7, teeth = 6, pad = 8;
  const ya = y0 + pad, yb = y1 - pad, seg = (yb - ya) / teeth;
  const pts: Array<[number, number]> = [[x, y0], [x, ya]];
  for (let i = 0; i < teeth; i++) pts.push([x + (i % 2 === 0 ? -amp : amp), ya + seg * (i + 0.5)]);
  pts.push([x, yb], [x, y1]);
  return `<polyline points="${pts.map((q) => `${q[0]},${q[1]}`).join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function gndSym(cx: number, y: number): string {
  return `<g stroke="${STROKE}" stroke-width="${WIRE_W}">` +
    `<line x1="${cx - 9}" y1="${y}" x2="${cx + 9}" y2="${y}"/>` +
    `<line x1="${cx - 5}" y1="${y + 4}" x2="${cx + 5}" y2="${y + 4}"/>` +
    `<line x1="${cx - 2}" y1="${y + 8}" x2="${cx + 2}" y2="${y + 8}"/></g>`;
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
