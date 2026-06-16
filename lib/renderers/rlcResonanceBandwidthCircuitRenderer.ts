import type { RlcResonanceBandwidthCircuitDiagram } from "@/types";

/**
 * 직렬 RLC 공진+대역폭 (임용 11번) (가) 전용 fixed-slot 렌더러.
 *
 *  단일 루프: v(t)[좌측 세로] → R[상단] → 마디 a → [C₁ ∥ C₂] → 마디 b → L[상단] → 우측 세로 → 하단 복귀.
 *  C₁(위)·C₂(아래)는 a–b 사이 병렬 두 가지. V_ab는 a–b 전압(학생 도출).
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const SVG_W = 640;
const SVG_H = 360;

const LEFT_X = 70;
const RIGHT_X = 560;
const RAIL_Y = 120;
const BOT_Y = 300;

const A_X = 250;
const B_X = 410;
const C1_Y = 78;   // 상단 병렬 가지
const C2_Y = 162;  // 하단 병렬 가지

type D = RlcResonanceBandwidthCircuitDiagram;

export function renderRlcResonanceBandwidthCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  // ── 좌측 AC 전원 (LEFT_X, RAIL_Y ↕ BOT_Y) ──
  const srcCy = (RAIL_Y + BOT_Y) / 2;
  w.push(line(LEFT_X, RAIL_Y, LEFT_X, srcCy - 20));
  w.push(line(LEFT_X, srcCy + 20, LEFT_X, BOT_Y));
  s.push(acSource(LEFT_X, srcCy));
  t.push(text(LEFT_X - 26, srcCy + 4, d.vLabel ?? "v(t)", { anchor: "end", size: 12, weight: 600 }));

  // ── 상단: 좌상 → R → 마디 a ──
  w.push(line(LEFT_X, RAIL_Y, 150, RAIL_Y));
  s.push(resistor(150, 210, RAIL_Y));
  t.push(text(180, RAIL_Y - 14, d.rLabel ?? "R", { size: 12, weight: 600 }));
  w.push(line(210, RAIL_Y, A_X, RAIL_Y));
  node(s, t, A_X, RAIL_Y, "a", "start");

  // ── a–b 병렬 C₁(위)·C₂(아래) ──
  // C₁: a → 위 → C₁ → 위 → b
  w.push(line(A_X, RAIL_Y, A_X, C1_Y));
  w.push(line(A_X, C1_Y, 300, C1_Y));
  s.push(capacitor(330, C1_Y));
  w.push(line(360, C1_Y, B_X, C1_Y));
  w.push(line(B_X, C1_Y, B_X, RAIL_Y));
  t.push(text(330, C1_Y - 12, d.c1Label ?? "C₁", { size: 12, weight: 600 }));
  t.push(text(300, C1_Y + 16, "C₁", { size: 9, fill: MUTED }));
  // C₂: a → 아래 → C₂ → 아래 → b
  w.push(line(A_X, RAIL_Y, A_X, C2_Y));
  w.push(line(A_X, C2_Y, 300, C2_Y));
  s.push(capacitor(330, C2_Y));
  w.push(line(360, C2_Y, B_X, C2_Y));
  w.push(line(B_X, C2_Y, B_X, RAIL_Y));
  t.push(text(330, C2_Y + 22, d.c2Label ?? "C₂", { size: 12, weight: 600 }));
  t.push(text(300, C2_Y - 8, "C₂", { size: 9, fill: MUTED }));

  // 마디 b
  node(s, t, B_X, RAIL_Y, "b", "end");

  // V_ab 표시 (a–b 사이)
  t.push(text((A_X + B_X) / 2, RAIL_Y + 38, "V_ab", { size: 12, weight: 700, fill: ACCENT }));
  s.push(`<path d="M${A_X},${RAIL_Y + 26} L${B_X},${RAIL_Y + 26}" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="3 3" marker-start="url(#arL)" marker-end="url(#arR)"/>`);

  // ── b → L → 우상 ──
  w.push(line(B_X, RAIL_Y, 450, RAIL_Y));
  s.push(inductor(450, 515, RAIL_Y));
  t.push(text(482, RAIL_Y - 14, d.lLabel ?? "L", { size: 13, weight: 700, fill: ACCENT }));
  w.push(line(515, RAIL_Y, RIGHT_X, RAIL_Y));

  // ── 우측·하단 복귀 ──
  w.push(line(RIGHT_X, RAIL_Y, RIGHT_X, BOT_Y));
  w.push(line(RIGHT_X, BOT_Y, LEFT_X, BOT_Y));

  t.push(text(SVG_W / 2, SVG_H - 8, "직렬 RLC 공진 — 공진시 Z=R, V_ab=I·(1/jω₀C_eq), 대역폭 β=R/L", { size: 10, fill: MUTED }));

  const defs = `<defs>
    <marker id="arL" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M6,0 L0,3 L6,6" fill="none" stroke="${ACCENT}"/></marker>
    <marker id="arR" markerWidth="8" markerHeight="8" refX="2" refY="3" orient="auto"><path d="M2,0 L8,3 L2,6" fill="none" stroke="${ACCENT}"/></marker>
  </defs>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${defs}\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

// ─── 심볼 ───────────────────────────────────────
function acSource(cx: number, cy: number): string {
  const r = 20;
  const sine = `<path d="M${cx - 10},${cy} q5,-9 10,0 q5,9 10,0" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}`;
}

function resistor(x1: number, x2: number, y: number): string {
  return `<rect x="${x1}" y="${y - 9}" width="${x2 - x1}" height="18" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function capacitor(cx: number, y: number): string {
  // 두 수직 plate (간격), 좌우 리드는 호출측 wire가 담당
  const g = 6, ph = 13;
  return (
    `<line x1="${cx - g}" y1="${y - ph}" x2="${cx - g}" y2="${y + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${cx + g}" y1="${y - ph}" x2="${cx + g}" y2="${y + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${cx - 20}" y1="${y}" x2="${cx - g}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + g}" y1="${y}" x2="${cx + 20}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`
  );
}

function inductor(x1: number, x2: number, y: number): string {
  const n = 4, span = x2 - x1, r = span / (n * 2);
  let p = `M${x1},${y}`;
  for (let i = 0; i < n; i++) {
    const cx = x1 + r * (2 * i + 1);
    p += ` A${r},${r} 0 0 1 ${cx + r},${y}`;
  }
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function node(s: string[], t: string[], x: number, y: number, label: string, side: "start" | "end"): void {
  s.push(`<circle cx="${x}" cy="${y}" r="3" fill="${STROKE}"/>`);
  const dx = side === "start" ? -6 : 6;
  t.push(text(x + dx, y - 10, label, { size: 13, weight: 700, anchor: side === "start" ? "end" : "start" }));
}

// ─── primitives ──────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function text(
  x: number,
  y: number,
  str: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  const size = opts.size ?? 12;
  const weight = opts.weight ?? 400;
  const anchor = opts.anchor ?? "middle";
  const fill = opts.fill ?? STROKE;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeSvg(str)}</text>`;
}

function escapeSvg(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
