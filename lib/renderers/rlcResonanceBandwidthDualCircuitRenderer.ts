import type { RlcResonanceBandwidthDualCircuitDiagram } from "@/types";

/**
 * 병렬 RLC 공진+대역폭 — 직렬 RLC의 쌍대 (기출변형) 전용 fixed-slot 렌더러.
 *
 *  전류원 i(t) [좌측 세로] ∥ R_d ∥ [L₁ 직렬 L₂] ∥ C_d (세로 가지 3개, 상·하 레일 사이).
 *  I_ab = 인덕터 가지 전류 (직렬회로 V_ab의 쌍대).
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const SVG_W = 640;
const SVG_H = 360;

const TOP_Y = 110;
const BOT_Y = 300;
const SRC_X = 70;
const R_X = 250;
const L_X = 390;
const C_X = 530;
const RIGHT_X = 530;

type D = RlcResonanceBandwidthDualCircuitDiagram;

export function renderRlcResonanceBandwidthDualCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  // ── 전류원 (좌측 세로) ──
  const srcCy = (TOP_Y + BOT_Y) / 2;
  w.push(line(SRC_X, TOP_Y, SRC_X, srcCy - 20));
  w.push(line(SRC_X, srcCy + 20, SRC_X, BOT_Y));
  s.push(currentSource(SRC_X, srcCy));
  t.push(text(SRC_X - 26, srcCy + 4, d.iLabel ?? "i(t)", { anchor: "end", size: 12, weight: 600 }));

  // ── 상·하 레일 ──
  w.push(line(SRC_X, TOP_Y, RIGHT_X, TOP_Y));
  w.push(line(SRC_X, BOT_Y, RIGHT_X, BOT_Y));

  // ── 가지 1: R_d (지그재그, 세로) ──
  vResistor(s, R_X, TOP_Y, BOT_Y);
  branchDots(s, R_X);
  t.push(text(R_X + 14, (TOP_Y + BOT_Y) / 2, d.rdLabel ?? "R_d", { anchor: "start", size: 12, weight: 600 }));

  // ── 가지 2: L₁ 직렬 L₂ (세로) + I_ab ──
  const midY = (TOP_Y + BOT_Y) / 2;
  vInductor(s, L_X, TOP_Y + 18, midY - 6);   // L₁
  vInductor(s, L_X, midY + 6, BOT_Y - 18);   // L₂
  w.push(line(L_X, TOP_Y, L_X, TOP_Y + 18));
  w.push(line(L_X, midY - 6, L_X, midY + 6));
  w.push(line(L_X, BOT_Y - 18, L_X, BOT_Y));
  branchDots(s, L_X);
  t.push(text(L_X + 14, TOP_Y + 36, d.l1Label ?? "L₁", { anchor: "start", size: 11, weight: 600 }));
  t.push(text(L_X + 14, BOT_Y - 36, d.l2Label ?? "L₂", { anchor: "start", size: 11, weight: 600 }));
  // I_ab 화살표 (인덕터 가지 옆)
  s.push(`<path d="M${L_X - 16},${TOP_Y + 24} L${L_X - 16},${BOT_Y - 24}" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="3 3" marker-end="url(#arD)"/>`);
  t.push(text(L_X - 20, midY, "I_ab", { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // ── 가지 3: C_d (세로, 미지) ──
  vCapacitor(s, C_X, TOP_Y, BOT_Y);
  branchDots(s, C_X);
  t.push(text(C_X + 14, (TOP_Y + BOT_Y) / 2, d.cdLabel ?? "C", { anchor: "start", size: 13, weight: 700, fill: ACCENT }));

  t.push(text(SVG_W / 2, SVG_H - 8, "병렬 RLC (직렬 RLC의 쌍대) — 공진시 Y=1/R_d, I_ab=인덕터 가지전류, 대역폭 β=1/(R_d·C_d)", { size: 10, fill: MUTED }));

  const defs = `<defs><marker id="arD" markerWidth="8" markerHeight="8" refX="3" refY="7" orient="auto"><path d="M0,2 L3,8 L6,2" fill="none" stroke="${ACCENT}"/></marker></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${defs}\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

// ─── 심볼 ───────────────────────────────────────
function currentSource(cx: number, cy: number): string {
  const r = 20;
  const arrow = `<line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${cy - 11}" stroke="${STROKE}" stroke-width="${WIRE_W}"/><path d="M${cx - 4},${cy - 5} L${cx},${cy - 12} L${cx + 4},${cy - 5}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${arrow}`;
}

function vResistor(out: string[], x: number, y1: number, y2: number): string | void {
  const a = 8, lead = 26, teeth = 6;
  const by1 = y1 + lead, by2 = y2 - lead;
  const step = (by2 - by1) / teeth;
  let p = `M${x},${y1} L${x},${by1}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${by1 + step * (i + 0.5)}`;
  p += ` L${x},${by2} L${x},${y2}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}

function vInductor(out: string[], x: number, y1: number, y2: number): void {
  const n = 3, span = y2 - y1, r = span / (n * 2);
  let p = `M${x},${y1}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${x},${y1 + r * (2 * i + 2)}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
}

function vCapacitor(out: string[], x: number, y1: number, y2: number): void {
  const cy = (y1 + y2) / 2, g = 6, pw = 13;
  out.push(
    `<line x1="${x - pw}" y1="${cy - g}" x2="${x + pw}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${x - pw}" y1="${cy + g}" x2="${x + pw}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x}" y1="${cy + g}" x2="${x}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`,
  );
}

function branchDots(out: string[], x: number): void {
  out.push(`<circle cx="${x}" cy="${TOP_Y}" r="3" fill="${STROKE}"/>`);
  out.push(`<circle cx="${x}" cy="${BOT_Y}" r="3" fill="${STROKE}"/>`);
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function text(
  x: number,
  y: number,
  str: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  const size = opts.size ?? 12, weight = opts.weight ?? 400, anchor = opts.anchor ?? "middle", fill = opts.fill ?? STROKE;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeSvg(str)}</text>`;
}

function escapeSvg(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
