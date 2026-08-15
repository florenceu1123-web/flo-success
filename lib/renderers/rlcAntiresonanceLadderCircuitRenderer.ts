import type { RlcAntiresonanceLadderCircuitDiagram } from "@/types";

/**
 * 임용 16번 전용 fixed-slot 렌더러 — 병렬 LC 반공진 RLC 사다리.
 *
 *   좌 세로 = 교류 전압원  /  상단 = R₁ ─ L₁ ─ 마디 A ─ C₁ ─ 마디 B ─(도선)─ 우측
 *   마디 A ↓ R₂ ↓ 마디 A′ /  하단 = A′ ─ C₂ ─ B′ ─(도선)─ 우측
 *   마디 B ↓ L₂ ↓ B′   ∥   우측 세로 C₃    ← ★ 병렬 LC
 *   i(t)는 전원에서 나오는 전류(상단 좌측 화살표).
 */

const STROKE = "#111827";
const W = 1.5;
const DOT_R = 3.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const SVG_W = 880;
const SVG_H = 400;
const X_SRC = 74;
const X_A = 430;
const X_B = 660;
const X_C3 = 810;
const Y_TOP = 78;
const Y_BOT = 322;

type D = RlcAntiresonanceLadderCircuitDiagram;

export function renderRlcAntiresonanceLadderCircuit(d: D): string {
  if (!d?.sourceLabel) return emptySvg("invalid rlc_antiresonance_ladder diagram");
  const wires: string[] = [], dots: string[] = [], sym: string[] = [], lab: string[] = [];
  const yMid = (Y_TOP + Y_BOT) / 2;

  // 좌: 교류 전압원
  sym.push(acSource(X_SRC, yMid));
  wires.push(line(X_SRC, Y_TOP, X_SRC, yMid - 24));
  wires.push(line(X_SRC, yMid + 24, X_SRC, Y_BOT));
  lab.push(text(X_SRC + 32, yMid + 5, d.sourceLabel, { size: 13, weight: 700, anchor: "start" }));

  // 상단: R₁ ─ L₁ ─ A
  const xR1 = 190, xL1 = 320;
  sym.push(resistorH(xR1, Y_TOP));
  wires.push(line(X_SRC, Y_TOP, xR1 - 24, Y_TOP));
  wires.push(line(xR1 + 24, Y_TOP, xL1 - 24, Y_TOP));
  lab.push(text(xR1, Y_TOP - 16, d.r1Label, { size: 12 }));
  sym.push(inductorH(xL1, Y_TOP));
  wires.push(line(xL1 + 24, Y_TOP, X_A, Y_TOP));
  lab.push(text(xL1, Y_TOP - 18, d.l1Label, { size: 12 }));
  dots.push(dot(X_A, Y_TOP));

  // i(t) 화살표 (전원 직후)
  sym.push(arrowRight(X_SRC + 22, X_SRC + 74, Y_TOP - 22));
  lab.push(text(X_SRC + 30, Y_TOP - 30, d.measureLabel ?? "i(t)", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  // A ↓ R₂ ↓ A′
  sym.push(resistorV(X_A, yMid));
  wires.push(line(X_A, Y_TOP, X_A, yMid - 24));
  wires.push(line(X_A, yMid + 24, X_A, Y_BOT));
  lab.push(text(X_A + 18, yMid + 5, d.r2Label, { size: 12, anchor: "start" }));
  dots.push(dot(X_A, Y_BOT));

  // 상단 C₁ (A → B) / 하단 C₂ (A′ → B′)
  const xC = (X_A + X_B) / 2;
  sym.push(capacitorH(xC, Y_TOP));
  wires.push(line(X_A, Y_TOP, xC - 7, Y_TOP));
  wires.push(line(xC + 7, Y_TOP, X_B, Y_TOP));
  lab.push(text(xC, Y_TOP - 16, d.c1Label, { size: 12 }));
  sym.push(capacitorH(xC, Y_BOT));
  wires.push(line(X_A, Y_BOT, xC - 7, Y_BOT));
  wires.push(line(xC + 7, Y_BOT, X_B, Y_BOT));
  lab.push(text(xC, Y_BOT + 22, d.c1Label, { size: 12 }));
  dots.push(dot(X_B, Y_TOP), dot(X_B, Y_BOT));

  // 병렬 LC: B ↓ L₂ ↓ B′  ∥  C₃
  sym.push(inductorV(X_B, yMid));
  wires.push(line(X_B, Y_TOP, X_B, yMid - 30));
  wires.push(line(X_B, yMid + 30, X_B, Y_BOT));
  lab.push(text(X_B + 18, yMid + 5, d.l2Label, { size: 12, anchor: "start" }));
  wires.push(line(X_B, Y_TOP, X_C3, Y_TOP));
  wires.push(line(X_B, Y_BOT, X_C3, Y_BOT));
  sym.push(capacitorV(X_C3, yMid));
  wires.push(line(X_C3, Y_TOP, X_C3, yMid - 7));
  wires.push(line(X_C3, yMid + 7, X_C3, Y_BOT));
  lab.push(text(X_C3 + 16, yMid + 5, d.c3Label, { size: 12, anchor: "start" }));

  // 하단 rail (좌측 전원 ↔ A′)
  wires.push(line(X_SRC, Y_BOT, X_A, Y_BOT));

  if (d.caption) lab.push(text(SVG_W / 2, SVG_H - 10, d.caption, { size: 11, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[
    ...wires, ...dots, ...sym, ...lab].join("\n")}\n</svg>`;
}

// ── 심볼 ─────────────────────────────────────
function acSource(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="24" fill="white" stroke="${STROKE}" stroke-width="${W}"/>` +
    `<path d="M${cx - 12},${cy} q6,-10 12,0 q6,10 12,0" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function resistorH(cx: number, cy: number): string {
  const w = 24, h = 8; let p = `M${cx - w},${cy}`;
  for (let i = 0; i < 6; i++) p += ` L${cx - w + ((i + 1) * 2 * w) / 7},${cy + (i % 2 === 0 ? -h : h)}`;
  return `<path d="${p} L${cx + w},${cy}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function resistorV(cx: number, cy: number): string {
  const h = 24, w = 8; let p = `M${cx},${cy - h}`;
  for (let i = 0; i < 6; i++) p += ` L${cx + (i % 2 === 0 ? w : -w)},${cy - h + ((i + 1) * 2 * h) / 7}`;
  return `<path d="${p} L${cx},${cy + h}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function inductorH(cx: number, cy: number): string {
  const n = 4, r = 6, left = cx - n * r; let p = `M${left},${cy}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${left + (i + 1) * 2 * r},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function inductorV(cx: number, cy: number): string {
  const n = 4, r = 7.5, top = cy - n * r; let p = `M${cx},${top}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx},${top + (i + 1) * 2 * r}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function capacitorH(cx: number, cy: number): string {
  const g = 4, h = 13;
  return `<line x1="${cx - g}" y1="${cy - h}" x2="${cx - g}" y2="${cy + h}" stroke="${STROKE}" stroke-width="2.2"/>` +
    `<line x1="${cx + g}" y1="${cy - h}" x2="${cx + g}" y2="${cy + h}" stroke="${STROKE}" stroke-width="2.2"/>`;
}
function capacitorV(cx: number, cy: number): string {
  const g = 4, w = 15;
  return `<line x1="${cx - w}" y1="${cy - g}" x2="${cx + w}" y2="${cy - g}" stroke="${STROKE}" stroke-width="2.2"/>` +
    `<line x1="${cx - w}" y1="${cy + g}" x2="${cx + w}" y2="${cy + g}" stroke="${STROKE}" stroke-width="2.2"/>`;
}
function arrowRight(x1: number, x2: number, y: number): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2 - 8}" y2="${y}" stroke="${ACCENT}" stroke-width="2"/>` +
    `<polygon points="${x2},${y} ${x2 - 9},${y - 5} ${x2 - 9},${y + 5}" fill="${ACCENT}"/>`;
}

// ── primitives ───────────────────────────────
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
function emptySvg(m: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} 64"><text x="${SVG_W / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${esc(m)}</text></svg>`;
}
