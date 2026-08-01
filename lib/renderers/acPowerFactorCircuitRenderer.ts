import type { AcPowerFactorCircuitDiagram } from "@/types";

/**
 * AC 역률보정 회로 전용 fixed-slot 렌더러 (임용 9번 회로이론).
 *   V_s(좌, 세로 AC) ─ 직렬 R₁ ─ 직렬 L ─ 마디 M ─ 부하 Z[ R₂ ∥ C(−jX_C) ] ─ 하단 rail.
 *   부하 Z는 점선 박스로 묶음.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderAcPowerFactorCircuit(d: AcPowerFactorCircuitDiagram): string {
  const W = 620, H = 380;
  const xSrc = 90, xR1 = 200, xL = 320, xM = 430, xC = 520;  // 마디 M, 부하 R₂(xM)·C(xC)
  const yTop = 80, yMid = 215, yBot = 320;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 전원 (좌, 세로 AC)
  s.push(acSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 14, (yTop + yBot) / 2 + 4, `V_s=${d.vsLabel}V`, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 상단 직렬: xSrc ─R₁─ ─L─ → 마디 M
  hRes(s, t, xSrc, xR1, yTop, d.r1Label, "R₁");
  hInd(s, t, xR1, xL, yTop, d.xlLabel, "L");
  w.push(line(xL, yTop, xC + 0, yTop));   // L 끝 → 부하 상단 rail (xM·xC까지)
  s.push(dot(xM, yTop));

  // 부하 Z 점선 박스 (xM 좌 ~ xC 우)
  s.push(`<rect x="${xM - 34}" y="${yTop - 18}" width="${xC - xM + 68}" height="${yBot - yTop + 18}" fill="none" stroke="#7c3aed" stroke-width="1.3" stroke-dasharray="6 4"/>`);
  t.push(text((xM + xC) / 2, yBot + 14, "Z", { size: 14, weight: 700, fill: "#7c3aed" }));

  // 부하 R₂ (마디 M ↓ 하단)
  vRes(s, t, xM, yTop, yBot, d.r2Label, "R₂");
  s.push(dot(xM, yBot));
  // 부하 C (xC ↓ 하단)
  vCap(s, t, xC, yTop, yBot, d.xcLabel, "C");
  s.push(dot(xC, yTop), dot(xC, yBot));

  // 하단 rail: xSrc ─ xC
  w.push(line(xSrc, yBot, xC, yBot));

  t.push(text(W / 2, H - 10, "직렬 R₁+L · 부하 Z = R₂ ∥ C — 역률 1 되는 X_C 도출", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ── 소자 헬퍼 ──
function hRes(s: string[], t: string[], x1: number, x2: number, y: number, label: string, name: string): void {
  const cx = (x1 + x2) / 2, sh = Math.min((x2 - x1) / 2 - 4, 22);
  s.push(line(x1, y, cx - sh, y), symResH(cx, y, sh), line(cx + sh, y, x2, y));
  t.push(text(cx, y - 12, name, { size: 11, weight: 700, fill: ACCENT }));
  t.push(text(cx, y + 18, label, { size: 10, fill: "#374151" }));
}
function hInd(s: string[], t: string[], x1: number, x2: number, y: number, label: string, name: string): void {
  const cx = (x1 + x2) / 2, sh = 22, n = 4, r = sh / n;
  s.push(line(x1, y, cx - sh, y), line(cx + sh, y, x2, y));
  let p = `M${cx - sh},${y}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx - sh + r * (2 * i + 2)},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(cx, y - 12, name, { size: 11, weight: 700, fill: ACCENT }));
  t.push(text(cx, y + 18, label, { size: 10, fill: "#374151" }));
}
function vRes(s: string[], t: string[], x: number, y1: number, y2: number, label: string, name: string): void {
  const cy = (y1 + y2) / 2, half = 24, a = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(x + 14, cy - 4, name, { size: 11, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(text(x + 14, cy + 12, label, { size: 10, fill: "#374151", anchor: "start" }));
}
function vCap(s: string[], t: string[], x: number, y1: number, y2: number, label: string, name: string): void {
  const cy = (y1 + y2) / 2, g = 5, pw = 13;
  s.push(line(x, y1, x, cy - g), line(x, cy + g, x, y2));
  s.push(`<line x1="${x - pw}" y1="${cy - g}" x2="${x + pw}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  s.push(`<line x1="${x - pw}" y1="${cy + g}" x2="${x + pw}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  t.push(text(x + 16, cy - 2, name, { size: 11, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(text(x + 16, cy + 14, label, { size: 10, fill: RED, anchor: "start" }));
}
function symResH(cx: number, y: number, half: number): string {
  const a = 6, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  const sine = `<path d="M${cx - 12},${cy} Q${cx - 6},${cy - 8} ${cx},${cy} T${cx + 12},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx + r + 3}" y="${cy - r + 8}" font-size="11" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx + r + 3}" y="${cy + r}" font-size="13" font-weight="700" fill="${RED}">−</text>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function svg(w2: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w2} ${h}">\n${body.join("\n")}\n</svg>`;
}
