import type { RlcStateEquationCircuitDiagram } from "@/types";

/**
 * 직류 전압원·전류원 RLC **상태 방정식** 회로 전용 fixed-slot 렌더러 (임용 6번) — 원본 배치 그대로.
 *
 *   V₁(좌, 세로) ─ 상단: R₁ ─ L(전류 i →) ─ ● 마디 A ─────── 우측 상단
 *   마디 A ─ C(세로, + v −) ─ 하단 rail
 *   마디 A 오른쪽 ─ R₂(세로) ─ 하단 rail
 *   우측 끝 ─ I₁(세로 전류원, ↑ 마디로 유입) ─ 하단 rail
 *
 * ★ 라벨 규칙(#6): 상단 소자 라벨은 **위쪽**, 세로 소자 라벨은 **오른쪽**에만 둔다.
 *   전류 i 화살표는 인덕터 **아래**, v 극성(+/−)은 커패시터 **왼쪽**에 붙여 서로 겹치지 않게 한다.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";

export function renderRlcStateEquationCircuit(d: RlcStateEquationCircuitDiagram): string {
  const W = 680, H = 300;
  const xSrc = 74, xR1 = 168, xL = 268, xA = 366, xR2 = 470, xI = 588;
  const yTop = 92, yBot = 246;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 좌측 직류 전압원 V₁ (세로) ────────────────────────────────────
  s.push(dcSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 20, (yTop + yBot) / 2 + 4, d.vLabel, { anchor: "end", size: 12.5, weight: 700, fill: ACCENT }));

  // ── 상단 rail: V₁ — R₁ — L — 마디 A — R₂ — I₁ ────────────────────
  w.push(line(xSrc, yTop, xR1 - 26, yTop));
  s.push(resistorH(xR1, yTop));
  t.push(text(xR1, yTop - 16, d.r1Label, { size: 12, weight: 600 }));
  w.push(line(xR1 + 26, yTop, xL - 26, yTop));
  s.push(inductorH(xL, yTop));
  t.push(text(xL, yTop - 18, d.lLabel, { size: 12, weight: 600 }));
  // 전류 i — 인덕터 아래쪽 (라벨 겹침 회피)
  s.push(arrowRight(xL - 14, xL + 22, yTop + 22));
  t.push(text(xL - 22, yTop + 26, "i", { anchor: "end", size: 12.5, weight: 700, fill: RED }));
  w.push(line(xL + 26, yTop, xI, yTop));
  s.push(dot(xA, yTop));
  s.push(dot(xR2, yTop));

  // ── 마디 A ─ C(세로) ─ 하단 rail, 극성 + / − 는 왼쪽 ──────────────
  const yMid = (yTop + yBot) / 2;
  w.push(line(xA, yTop, xA, yMid - 14));
  s.push(capacitorV(xA, yMid));
  w.push(line(xA, yMid + 14, xA, yBot));
  // ★ 극판 반폭이 16이므로 라벨은 그보다 바깥(+22)에서 시작해야 겹치지 않는다(실측: "1/8[F]"의 앞이 가림).
  t.push(text(xA + 22, yMid + 4, d.cLabel, { anchor: "start", size: 12, weight: 600 }));
  t.push(text(xA - 14, yMid - 10, "+", { anchor: "end", size: 13, weight: 700 }));
  t.push(text(xA - 14, yMid + 18, "−", { anchor: "end", size: 13, weight: 700 }));
  t.push(text(xA - 26, yMid + 4, "v", { anchor: "end", size: 12.5, weight: 700, fill: RED }));

  // ── R₂ (세로) ────────────────────────────────────────────────────
  w.push(line(xR2, yTop, xR2, yMid - 26));
  s.push(resistorV(xR2, yMid));
  w.push(line(xR2, yMid + 26, xR2, yBot));
  t.push(text(xR2 + 16, yMid + 4, d.r2Label, { anchor: "start", size: 12, weight: 600 }));

  // ── I₁ (세로 전류원, 위로 = 마디 A 쪽으로 유입) ───────────────────
  w.push(line(xI, yTop, xI, yMid - 18));
  s.push(currentSourceV(xI, yMid));
  w.push(line(xI, yMid + 18, xI, yBot));
  t.push(text(xI + 20, yMid + 4, d.iLabel, { anchor: "start", size: 12.5, weight: 700, fill: ACCENT }));

  // ── 하단 rail ────────────────────────────────────────────────────
  w.push(line(xSrc, yBot, xI, yBot));

  return svg(W, H, [...w, ...s, ...t]);
}

/** 직류 전압원 (원 + / −) — 세로. */
function dcSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 18;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">+</text>` +
    `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">−</text>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 직류 전류원 (원 + 위쪽 화살표) — 세로. */
function currentSourceV(cx: number, cy: number): string {
  const r = 18;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + 10}" x2="${cx}" y2="${cy - 6}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<path d="M${cx - 5},${cy - 4} L${cx},${cy - 12} L${cx + 5},${cy - 4} Z" fill="${STROKE}"/>`;
}
function resistorH(cx: number, cy: number): string {
  const half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${cy}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${cy + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function resistorV(cx: number, cy: number): string {
  const half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${cx},${cy + half}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function inductorH(cx: number, cy: number): string {
  const half = 26, n = 4, r = half / n;
  let p = `M${cx - half},${cy}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx - half + r * (2 * i + 2)},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function capacitorV(cx: number, cy: number): string {
  const g = 5, ph = 16;
  return `<line x1="${cx - ph}" y1="${cy - g}" x2="${cx + ph}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${cx - ph}" y1="${cy + g}" x2="${cx + ph}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${cx}" y1="${cy - 14}" x2="${cx}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + g}" x2="${cx}" y2="${cy + 14}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function arrowRight(x1: number, x2: number, y: number): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2 - 6}" y2="${y}" stroke="${RED}" stroke-width="1.4"/>` +
    `<path d="M${x2 - 7},${y - 4} L${x2},${y} L${x2 - 7},${y + 4} Z" fill="${RED}"/>`;
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
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
