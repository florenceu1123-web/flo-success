import type { AcDcSourceSuperpositionCircuitDiagram } from "@/types";

/**
 * 임용 15번 전용 fixed-slot 렌더러 — 교류 전압원 + 직류 전류원 RLC (v_C 측정).
 *
 *  직사각 루프:
 *    좌 세로 = 교류 전압원 v(t)
 *    상단   = R₁ ─ L₁ ─ 마디 M
 *    중간 세로(마디 M ↓ 하단 rail) = R₂ ─ L₂ ─ C(v_C, + 위)
 *    우 세로 = 직류 전류원 I_dc (↑)
 */

const STROKE = "#111827";
const W = 1.5;
const DOT_R = 3.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const SVG_W = 760;
const SVG_H = 470;

const X_SRC = 96;
const X_M = 470;
const X_I = 660;
const Y_TOP = 86;
const Y_BOT = 404;

type D = AcDcSourceSuperpositionCircuitDiagram;

export function renderAcDcSourceSuperpositionCircuit(d: D): string {
  if (!d?.sourceLabel) return emptySvg("invalid ac_dc_source_superposition diagram");
  const wires: string[] = [], dots: string[] = [], sym: string[] = [], lab: string[] = [];
  const measure = d.measure ?? "vc";

  // 좌 세로: 교류 전압원
  const ySrc = (Y_TOP + Y_BOT) / 2;
  sym.push(acSource(X_SRC, ySrc));
  wires.push(line(X_SRC, Y_TOP, X_SRC, ySrc - 26));
  wires.push(line(X_SRC, ySrc + 26, X_SRC, Y_BOT));
  lab.push(text(X_SRC + 34, ySrc + 5, d.sourceLabel, { size: 14, weight: 700, anchor: "start" }));

  // 상단: R₁ ─ L₁ ─ M
  const xR1 = X_SRC + 130, xL1 = X_SRC + 270;
  sym.push(resistorH(xR1, Y_TOP));
  wires.push(line(X_SRC, Y_TOP, xR1 - 26, Y_TOP));
  wires.push(line(xR1 + 26, Y_TOP, xL1 - 26, Y_TOP));
  lab.push(text(xR1, Y_TOP - 18, d.r1Label, { size: 13 }));
  sym.push(inductorH(xL1, Y_TOP));
  wires.push(line(xL1 + 26, Y_TOP, X_I, Y_TOP));
  lab.push(text(xL1, Y_TOP - 20, d.l1Label, { size: 13 }));
  dots.push(dot(X_M, Y_TOP));

  // 중간 세로: R₂ ─ L₂ ─ C
  const yR2 = Y_TOP + 78, yL2 = Y_TOP + 168, yC = Y_TOP + 250;
  sym.push(resistorV(X_M, yR2));
  wires.push(line(X_M, Y_TOP, X_M, yR2 - 26));
  lab.push(text(X_M + 20, yR2 + 5, d.r2Label, { size: 13, anchor: "start" }));
  sym.push(inductorV(X_M, yL2));
  wires.push(line(X_M, yR2 + 26, X_M, yL2 - 32));
  wires.push(line(X_M, yL2 + 32, X_M, yC - 16));
  lab.push(text(X_M + 20, yL2 + 5, d.l2Label, { size: 13, anchor: "start" }));
  sym.push(capacitorV(X_M, yC));
  wires.push(line(X_M, yC + 6, X_M, Y_BOT));
  lab.push(text(X_M + 20, yC + 5, d.cLabel, { size: 13, anchor: "start" }));
  dots.push(dot(X_M, Y_BOT));

  // 측정 표기
  const mLabel = d.measureLabel ?? (measure === "vc" ? "v_c(t)" : "i(t)");
  if (measure === "vc") {
    lab.push(text(X_M - 22, yC - 22, "+", { size: 15, weight: 700, anchor: "end" }));
    lab.push(text(X_M - 22, yC + 34, "−", { size: 15, weight: 700, anchor: "end" }));
    lab.push(text(X_M - 26, yC + 6, mLabel, { size: 14, weight: 700, fill: ACCENT, anchor: "end" }));
  } else {
    sym.push(arrowDown(X_M - 34, yR2 - 34, yR2 + 14));
    lab.push(text(X_M - 42, yR2 - 6, mLabel, { size: 14, weight: 700, fill: ACCENT, anchor: "end" }));
  }

  // 우 세로: 직류 전류원
  const yI = (Y_TOP + Y_BOT) / 2;
  sym.push(currentSource(X_I, yI));
  wires.push(line(X_I, Y_TOP, X_I, yI - 26));
  wires.push(line(X_I, yI + 26, X_I, Y_BOT));
  lab.push(text(X_I + 34, yI + 5, d.idcLabel, { size: 14, weight: 700, anchor: "start" }));

  // 하단 rail
  wires.push(line(X_SRC, Y_BOT, X_I, Y_BOT));

  if (d.caption) lab.push(text(SVG_W / 2, SVG_H - 12, d.caption, { size: 11, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[
    ...wires, ...dots, ...sym, ...lab].join("\n")}\n</svg>`;
}

// ── 심볼 ─────────────────────────────────────
function acSource(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="26" fill="white" stroke="${STROKE}" stroke-width="${W}"/>` +
    `<path d="M${cx - 13},${cy} q6.5,-11 13,0 q6.5,11 13,0" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function currentSource(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="26" fill="white" stroke="${STROKE}" stroke-width="${W}"/>` +
    `<line x1="${cx}" y1="${cy + 15}" x2="${cx}" y2="${cy - 12}" stroke="${STROKE}" stroke-width="2"/>` +
    `<polygon points="${cx},${cy - 19} ${cx - 5},${cy - 8} ${cx + 5},${cy - 8}" fill="${STROKE}"/>`;
}
function resistorH(cx: number, cy: number): string {
  const w = 26, h = 9; let p = `M${cx - w},${cy}`;
  for (let i = 0; i < 6; i++) p += ` L${cx - w + ((i + 1) * 2 * w) / 7},${cy + (i % 2 === 0 ? -h : h)}`;
  return `<path d="${p} L${cx + w},${cy}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function resistorV(cx: number, cy: number): string {
  const h = 26, w = 9; let p = `M${cx},${cy - h}`;
  for (let i = 0; i < 6; i++) p += ` L${cx + (i % 2 === 0 ? w : -w)},${cy - h + ((i + 1) * 2 * h) / 7}`;
  return `<path d="${p} L${cx},${cy + h}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function inductorH(cx: number, cy: number): string {
  const n = 4, r = 6.5, left = cx - n * r; let p = `M${left},${cy}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${left + (i + 1) * 2 * r},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function inductorV(cx: number, cy: number): string {
  const n = 4, r = 8, top = cy - n * r; let p = `M${cx},${top}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx},${top + (i + 1) * 2 * r}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function capacitorV(cx: number, cy: number): string {
  const g = 5, w = 17;
  return `<line x1="${cx - w}" y1="${cy - g}" x2="${cx + w}" y2="${cy - g}" stroke="${STROKE}" stroke-width="2.2"/>` +
    `<line x1="${cx - w}" y1="${cy + g}" x2="${cx + w}" y2="${cy + g}" stroke="${STROKE}" stroke-width="2.2"/>` +
    `<line x1="${cx}" y1="${cy - 16}" x2="${cx}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${W}"/>`;
}
function arrowDown(x: number, y1: number, y2: number): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 8}" stroke="${ACCENT}" stroke-width="2"/>` +
    `<polygon points="${x},${y2} ${x - 5},${y2 - 10} ${x + 5},${y2 - 10}" fill="${ACCENT}"/>`;
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
