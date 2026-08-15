import type { MaxPowerTwoSourceCircuitDiagram } from "@/types";

/**
 * 임용 17번 전용 fixed-slot 렌더러 — (가)/(나) 공통 구조, 전원 라벨과 부하 첨자만 다르다.
 *
 *   좌 세로 = 교류 전원 / 상단 = 직렬 소자(C 또는 L) → 마디 A
 *   마디 A ─ [R_p ∥ 리액티브] ─ 마디 B  (위 저항 · 아래 리액티브, 두 마디는 junction dot)
 *   마디 B → 우측 세로 **부하 점선 박스**(R + L 또는 R + C 직렬) → 하단 rail
 */
const STROKE = "#111827";
const W = 1.5;
const DOT_R = 3.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";
const DASH = "#6b7280";

// ★ P_max 라벨이 부하 박스 오른쪽에 붙으므로 캔버스를 넉넉히 — 700이면 "P_ma"로 잘렸다(시각검증).
const SVG_W = 800, SVG_H = 400;
const X_SRC = 78, X_A = 250, X_B = 470, X_LOAD = 570;
const Y_TOP = 96, Y_BOT = 336;
const Y_PAR_HI = 62, Y_PAR_LO = 132;

type D = MaxPowerTwoSourceCircuitDiagram;

export function renderMaxPowerTwoSourceCircuit(d: D): string {
  const wires: string[] = [], dots: string[] = [], sym: string[] = [], lab: string[] = [];
  const yMid = (Y_TOP + Y_BOT) / 2;

  // 전원
  sym.push(acSource(X_SRC, yMid));
  wires.push(line(X_SRC, Y_TOP, X_SRC, yMid - 24));
  wires.push(line(X_SRC, yMid + 24, X_SRC, Y_BOT));
  lab.push(text(X_SRC + 32, yMid + 5, d.sourceLabel, { size: 13, weight: 700, anchor: "start" }));

  // 직렬 소자 (C 또는 L)
  const xS = (X_SRC + X_A) / 2;
  if (d.dual) { sym.push(inductorH(xS, Y_TOP)); wires.push(line(X_SRC, Y_TOP, xS - 24, Y_TOP)); wires.push(line(xS + 24, Y_TOP, X_A, Y_TOP)); }
  else { sym.push(capacitorH(xS, Y_TOP)); wires.push(line(X_SRC, Y_TOP, xS - 7, Y_TOP)); wires.push(line(xS + 7, Y_TOP, X_A, Y_TOP)); }
  lab.push(text(xS, Y_TOP - 18, d.seriesLabel, { size: 12 }));
  dots.push(dot(X_A, Y_TOP), dot(X_B, Y_TOP));

  // 병렬 블록 (위 저항 / 아래 리액티브)
  const xP = (X_A + X_B) / 2;
  wires.push(line(X_A, Y_TOP, X_A, Y_PAR_HI)); wires.push(line(X_A, Y_PAR_HI, xP - 24, Y_PAR_HI));
  sym.push(resistorH(xP, Y_PAR_HI));
  wires.push(line(xP + 24, Y_PAR_HI, X_B, Y_PAR_HI)); wires.push(line(X_B, Y_PAR_HI, X_B, Y_TOP));
  lab.push(text(xP, Y_PAR_HI - 16, d.parResLabel, { size: 12 }));

  wires.push(line(X_A, Y_TOP, X_A, Y_PAR_LO)); wires.push(line(X_A, Y_PAR_LO, xP - 24, Y_PAR_LO));
  if (d.dual) { sym.push(capacitorH(xP, Y_PAR_LO)); wires.push(line(xP - 24, Y_PAR_LO, xP - 7, Y_PAR_LO)); wires.push(line(xP + 7, Y_PAR_LO, xP + 24, Y_PAR_LO)); }
  else sym.push(inductorH(xP, Y_PAR_LO));
  wires.push(line(xP + 24, Y_PAR_LO, X_B, Y_PAR_LO)); wires.push(line(X_B, Y_PAR_LO, X_B, Y_TOP));
  lab.push(text(xP, Y_PAR_LO + 26, d.parReactLabel, { size: 12 }));

  // 부하 점선 박스
  wires.push(line(X_B, Y_TOP, X_LOAD, Y_TOP));
  lab.push(text(X_LOAD + 8, Y_TOP - 10, "부하", { size: 13, weight: 700, anchor: "start" }));
  sym.push(`<rect x="${X_LOAD - 44}" y="${Y_TOP + 18}" width="130" height="${Y_BOT - Y_TOP - 6}" fill="none" stroke="${DASH}" stroke-width="1.2" stroke-dasharray="5 4"/>`);
  const yR = Y_TOP + 78, yE = Y_TOP + 178;
  sym.push(resistorV(X_LOAD, yR));
  wires.push(line(X_LOAD, Y_TOP, X_LOAD, yR - 24));
  lab.push(text(X_LOAD + 18, yR + 5, d.loadResLabel, { size: 13, weight: 700, anchor: "start" }));
  if (d.dual) { sym.push(capacitorV(X_LOAD, yE)); wires.push(line(X_LOAD, yR + 24, X_LOAD, yE - 6)); wires.push(line(X_LOAD, yE + 6, X_LOAD, Y_BOT)); }
  else { sym.push(inductorV(X_LOAD, yE)); wires.push(line(X_LOAD, yR + 24, X_LOAD, yE - 30)); wires.push(line(X_LOAD, yE + 30, X_LOAD, Y_BOT)); }
  lab.push(text(X_LOAD + 18, yE + 5, d.loadElemLabel, { size: 13, weight: 700, anchor: "start" }));
  lab.push(text(X_LOAD + 96, yMid + 5, d.powerLabel, { size: 12, fill: ACCENT, anchor: "start" }));

  wires.push(line(X_SRC, Y_BOT, X_LOAD, Y_BOT));
  if (d.caption) lab.push(text(SVG_W / 2, SVG_H - 10, d.caption, { size: 11, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[...wires, ...dots, ...sym, ...lab].join("\n")}\n</svg>`;
}

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
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string { return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`; }
function text(x: number, y: number, s: string,
  o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(s)}</text>`;
}
function esc(s: string): string { return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
