import type { JkTwoPhaseClockCircuitDiagram } from "@/types";

/**
 * 임용 30번 (가) 전용 fixed-slot 렌더러 — JK₁ + 2상 클럭발생기(점선 박스) + EX-OR 2개.
 *
 *   좌  : JK₁ 박스 — J₁·CLK(버블=하강 에지)·K₁ / Q₁·Q̄₁
 *   중앙: 점선 박스 "2상 클럭발생기" — High → J₂·K₂, CLK₂ ← Q₁(버블 없음=상승 에지), JK₂
 *   우  : EX-OR 2개 — 위 (Q₁, Q₂) → Y₁ / 아래 (Q₁, Q̄₂) → Y₂
 *   Q₁은 **위 레인**으로 상단 게이트에, **아래 레인**으로 하단 게이트에 각각 분기한다.
 */

const STROKE = "#111827";
const W = 1.5;
const DOT_R = 3.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";
const DASH = "#6b7280";

const SVG_W = 960;
const SVG_H = 470;

// JK₁
const FF1_L = 96, FF1_R = 236, FF1_T = 150, FF1_B = 300;
const J1_Y = 186, CLK1_Y = 228, K1_Y = 270;
const Q1_Y = 186, Q1B_Y = 270;

// 점선 박스 + JK₂
const BOX_L = 300, BOX_R = 620, BOX_T = 74, BOX_B = 330;
const FF2_L = 420, FF2_R = 560, FF2_T = 150, FF2_B = 300;
const J2_Y = 186, CLK2_Y = 228, K2_Y = 270;
const Q2_Y = 186, Q2B_Y = 270;
const HIGH_X = 356, HIGH_Y = 110;

// 게이트
const G_L = 700, G_R = 790;
const G1_CY = 150, G2_CY = 300;
const Q1_TOP_LANE = 104;   // Q₁ → 상단 게이트
const Q1_BOT_LANE = 400;   // Q₁ → 하단 게이트
const Q1_TAP_X = 268;      // Q₁ 분기점

type D = JkTwoPhaseClockCircuitDiagram;

export function renderJkTwoPhaseClockCircuit(d: D): string {
  const gate = d.gate ?? "XOR";
  const wires: string[] = [], dots: string[] = [], sym: string[] = [], lab: string[] = [];
  const bubble1 = (d.clockEdge1 ?? "falling") === "falling";
  const bubble2 = (d.clockEdge2 ?? "rising") === "falling";

  // ── 점선 박스 ────────────────────────────────
  sym.push(`<rect x="${BOX_L}" y="${BOX_T}" width="${BOX_R - BOX_L}" height="${BOX_B - BOX_T}" fill="none" stroke="${DASH}" stroke-width="1.2" stroke-dasharray="5 4"/>`);
  lab.push(text((BOX_L + BOX_R) / 2, BOX_T - 8, d.blockLabel ?? "2상 클럭발생기", { size: 12, fill: MUTED }));

  // ── JK₁ ─────────────────────────────────────
  sym.push(rect(FF1_L, FF1_T, FF1_R - FF1_L, FF1_B - FF1_T));
  lab.push(text(FF1_L + 14, J1_Y + 5, "J₁", { size: 14, weight: 600, anchor: "start" }));
  lab.push(text(FF1_L + 30, CLK1_Y + 5, "CLK", { size: 13, weight: 600, anchor: "start" }));
  lab.push(text(FF1_L + 14, K1_Y + 5, "K₁", { size: 14, weight: 600, anchor: "start" }));
  lab.push(text(FF1_R - 14, Q1_Y + 5, "Q₁", { size: 14, weight: 600, anchor: "end" }));
  lab.push(text(FF1_R - 14, Q1B_Y + 5, "Q̄₁", { size: 14, weight: 600, anchor: "end" }));
  sym.push(clkTri(FF1_L, CLK1_Y));
  if (bubble1) sym.push(circle(FF1_L - 5, CLK1_Y, 5));
  // 외부 입력 stub
  for (const [y, nm] of [[J1_Y, "J₁"], [CLK1_Y, "CLK"], [K1_Y, "K₁"]] as Array<[number, string]>) {
    const x0 = 20;
    wires.push(line(x0, y, FF1_L - (y === CLK1_Y && bubble1 ? 10 : 0), y));
    lab.push(text(x0 - 4, y + 5, nm, { size: 13, weight: 700, fill: ACCENT, anchor: "end" }));
  }
  wires.push(line(FF1_R, Q1B_Y, FF1_R + 22, Q1B_Y));   // Q̄₁ 미사용 stub

  // ── Q₁ 분기 ─────────────────────────────────
  wires.push(line(FF1_R, Q1_Y, Q1_TAP_X, Q1_Y));
  dots.push(dot(Q1_TAP_X, Q1_Y));
  // (1) JK₂의 CLK로
  wires.push(line(Q1_TAP_X, Q1_Y, Q1_TAP_X, CLK2_Y));
  wires.push(line(Q1_TAP_X, CLK2_Y, FF2_L - (bubble2 ? 10 : 0), CLK2_Y));
  // (2) 위 레인 → 상단 게이트
  wires.push(line(Q1_TAP_X, Q1_Y, Q1_TAP_X, Q1_TOP_LANE));
  wires.push(line(Q1_TAP_X, Q1_TOP_LANE, G_L - 30, Q1_TOP_LANE));
  wires.push(line(G_L - 30, Q1_TOP_LANE, G_L - 30, G1_CY - 14));
  wires.push(line(G_L - 30, G1_CY - 14, G_L, G1_CY - 14));
  // (3) 아래 레인 → 하단 게이트
  wires.push(line(Q1_TAP_X, Q1_Y, Q1_TAP_X, Q1_BOT_LANE));
  wires.push(line(Q1_TAP_X, Q1_BOT_LANE, G_L - 30, Q1_BOT_LANE));
  wires.push(line(G_L - 30, Q1_BOT_LANE, G_L - 30, G2_CY + 14));
  wires.push(line(G_L - 30, G2_CY + 14, G_L, G2_CY + 14));

  // ── High → J₂·K₂ ────────────────────────────
  lab.push(text(HIGH_X, HIGH_Y - 12, d.highLabel ?? "High", { size: 13, weight: 700 }));
  wires.push(line(HIGH_X, HIGH_Y, HIGH_X, J2_Y));
  dots.push(dot(HIGH_X, J2_Y));
  wires.push(line(HIGH_X, J2_Y, FF2_L, J2_Y));
  wires.push(line(HIGH_X, J2_Y, HIGH_X, K2_Y));
  wires.push(line(HIGH_X, K2_Y, FF2_L, K2_Y));

  // ── JK₂ ─────────────────────────────────────
  sym.push(rect(FF2_L, FF2_T, FF2_R - FF2_L, FF2_B - FF2_T));
  lab.push(text(FF2_L + 14, J2_Y + 5, "J₂", { size: 14, weight: 600, anchor: "start" }));
  lab.push(text(FF2_L + 30, CLK2_Y + 5, "CLK", { size: 13, weight: 600, anchor: "start" }));
  lab.push(text(FF2_L + 14, K2_Y + 5, "K₂", { size: 14, weight: 600, anchor: "start" }));
  lab.push(text(FF2_R - 14, Q2_Y + 5, "Q₂", { size: 14, weight: 600, anchor: "end" }));
  lab.push(text(FF2_R - 14, Q2B_Y + 5, "Q̄₂", { size: 14, weight: 600, anchor: "end" }));
  sym.push(clkTri(FF2_L, CLK2_Y));
  if (bubble2) sym.push(circle(FF2_L - 5, CLK2_Y, 5));

  // ── Q₂ / Q̄₂ → 게이트 ────────────────────────
  wires.push(line(FF2_R, Q2_Y, G_L - 60, Q2_Y));
  wires.push(line(G_L - 60, Q2_Y, G_L - 60, G1_CY + 14));
  wires.push(line(G_L - 60, G1_CY + 14, G_L, G1_CY + 14));
  wires.push(line(FF2_R, Q2B_Y, G_L - 60, Q2B_Y));
  wires.push(line(G_L - 60, Q2B_Y, G_L - 60, G2_CY - 14));
  wires.push(line(G_L - 60, G2_CY - 14, G_L, G2_CY - 14));

  // ── 게이트 2개 (EX-OR / EX-NOR) ─────────────
  sym.push(xorGate(G_L, G1_CY, gate === "XNOR"));
  sym.push(xorGate(G_L, G2_CY, gate === "XNOR"));
  const outX = G_R + (gate === "XNOR" ? 12 : 4);
  wires.push(line(outX, G1_CY, outX + 32, G1_CY));
  wires.push(line(outX, G2_CY, outX + 32, G2_CY));
  lab.push(text(outX + 38, G1_CY + 5, d.out1Label ?? "Y₁", { size: 15, weight: 700, fill: ACCENT, anchor: "start" }));
  lab.push(text(outX + 38, G2_CY + 5, d.out2Label ?? "Y₂", { size: 15, weight: 700, fill: ACCENT, anchor: "start" }));

  if (d.caption) lab.push(text(SVG_W / 2, SVG_H - 12, d.caption, { size: 11, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[
    ...wires, ...dots, ...sym, ...lab].join("\n")}\n</svg>`;
}

// ── 심볼 ─────────────────────────────────────
/** EX-OR (XNOR이면 출력 버블). 입력 좌측 2개, 출력 우측. */
function xorGate(x: number, cy: number, bubble: boolean): string {
  const w = G_R - G_L, h = 56;
  const top = cy - h / 2, bot = cy + h / 2;
  const body =
    `<path d="M${x + 8},${top} Q${x + w * 0.62},${top} ${x + w},${cy} Q${x + w * 0.62},${bot} ${x + 8},${bot} ` +
    `Q${x + 26},${cy} ${x + 8},${top} Z" fill="white" stroke="${STROKE}" stroke-width="${W}"/>`;
  const arc = `<path d="M${x - 4},${top} Q${x + 14},${cy} ${x - 4},${bot}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
  const bub = bubble ? `<circle cx="${x + w + 6}" cy="${cy}" r="5.5" fill="white" stroke="${STROKE}" stroke-width="${W}"/>` : "";
  return arc + body + bub;
}
function clkTri(x: number, cy: number): string {
  const hh = 7;
  return `<polygon points="${x},${cy - hh} ${x + 13},${cy} ${x},${cy + hh}" fill="white" stroke="${STROKE}" stroke-width="${W}"/>`;
}

// ── primitives ───────────────────────────────
function rect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function circle(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string { return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`; }
function text(x: number, y: number, s: string,
  o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" ` +
    `font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(s)}</text>`;
}
function esc(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
