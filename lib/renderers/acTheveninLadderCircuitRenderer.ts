import type { AcTheveninLadderCircuitDiagram, AcTheveninEquivCircuitDiagram } from "@/types";

/**
 * 단일 AC원 L-C-R 사다리 (가) + 테브난 등가 (나) 전용 fixed-slot 렌더러 (임용 7번 회로이론).
 *
 *  (가): V_RMS(좌, 세로) — 직렬 ser1 — 마디 M — [션트 sh ↓ 하단] — 직렬 ser2 — 단자 a.
 *        b = 하단 rail. 부하 Z_L(점선 박스)이 a–b 가교.
 *  (나): V_TH(좌) — Z_TH(직렬 박스) — 단자 a — Z_L(점선 박스, a↓b) — 하단 rail.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

type Elem = "R" | "L" | "C";

// ─────────────────────────── (가) 사다리 ───────────────────────────
export function renderAcTheveninLadderCircuit(d: AcTheveninLadderCircuitDiagram): string {
  const W = 660, H = 380;
  const xSrc = 95, xM = 310, xA = 480, xL = 575;
  const yTop = 95, yBot = 300;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 전원 (좌, 세로)
  s.push(acSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 28, (yTop + yBot) / 2 + 4, d.vLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 상단 rail: xSrc —ser1— xM —ser2— xA
  hElem(s, d.ser1Type, xSrc, xM, yTop, d.ser1Label, t);
  hElem(s, d.ser2Type, xM, xA, yTop, d.ser2Label, t);
  s.push(dot(xM, yTop));

  // 션트 (xM, yTop↓yBot)
  vElem(s, d.shType, xM, yTop, yBot, d.shLabel, t);

  // 단자 a (xA, 상단)
  s.push(dot(xA, yTop));
  t.push(text(xA - 8, yTop - 10, "a", { size: 13, weight: 700, fill: ACCENT, anchor: "end" }));
  w.push(line(xA, yTop, xL, yTop));

  // 부하 Z_L (점선 박스, xL, yTop↓yBot)
  loadBox(s, t, xL, yTop, yBot, d.loadLabel);
  s.push(dot(xL, yBot));
  t.push(text(xL + 10, yBot - 4, "b", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  // 하단 rail: xSrc — xL
  w.push(line(xSrc, yBot, xL, yBot));
  s.push(dot(xM, yBot));

  t.push(text(W / 2, H - 10, "단자 a–b 개방: V_TH=V·Z_sh/(Z_ser1+Z_sh), Z_TH=Z_ser2+(Z_ser1∥Z_sh)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── (나) 테브난 등가 ───────────────────────────
export function renderAcTheveninEquivCircuit(d: AcTheveninEquivCircuitDiagram): string {
  const W = 620, H = 340;
  const xSrc = 95, xZ1 = 215, xZ2 = 370, xA = 460, xL = 555;
  const yTop = 90, yBot = 260;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // V_TH (좌, 세로)
  s.push(acSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 26, (yTop + yBot) / 2 + 4, d.vthLabel, { anchor: "end", size: 13, weight: 700, fill: ACCENT }));

  // Z_TH 직렬 박스 (상단)
  w.push(line(xSrc, yTop, xZ1, yTop));
  impBox(s, t, xZ1, xZ2, yTop, d.zthLabel);
  w.push(line(xZ2, yTop, xA, yTop));
  s.push(dot(xA, yTop));
  t.push(text(xA - 8, yTop - 10, "a", { size: 13, weight: 700, fill: ACCENT, anchor: "end" }));
  w.push(line(xA, yTop, xL, yTop));

  // 부하 Z_L (점선 박스, a↓b)
  loadBox(s, t, xL, yTop, yBot, d.loadLabel);
  s.push(dot(xL, yBot));
  t.push(text(xL + 10, yBot - 4, "b", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  w.push(line(xSrc, yBot, xL, yBot));

  t.push(text(W / 2, H - 10, "테브난 등가 — 복소 켤레 정합 Z_L = Z_TH* 일 때 최대평균전력 P_max=|V_TH|²/(4R_TH)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
function hElem(s: string[], type: Elem, x1: number, x2: number, y: number, label: string, t: string[]): void {
  const cxv = (x1 + x2) / 2, half = 20;
  s.push(line(x1, y, cxv - half, y), sym(type, cxv, y, half, 0), line(cxv + half, y, x2, y));
  t.push(text(cxv, y - 14, label, { size: 11, weight: 600 }));
}
function vElem(s: string[], type: Elem, x: number, y1: number, y2: number, label: string, t: string[]): void {
  const cyv = (y1 + y2) / 2, half = 20;
  s.push(line(x, y1, x, cyv - half), sym(type, x, cyv, half, 90), line(x, cyv + half, x, y2));
  t.push(text(x + 14, cyv + 4, label, { size: 11, weight: 600, anchor: "start" }));
}
function sym(type: Elem, cx: number, cy: number, half: number, deg: number): string {
  const body = type === "R" ? symResistor(half) : type === "C" ? symCapacitor(half) : symInductor(half);
  return `<g transform="translate(${cx},${cy}) rotate(${deg})">${body}</g>`;
}
function symResistor(half: number): string {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${-half},0`;
  for (let i = 0; i < teeth; i++) p += ` L${-half + step * (i + 0.5)},${i % 2 === 0 ? -a : a}`;
  p += ` L${half},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function symCapacitor(half: number): string {
  const g = 5, ph = 11;
  return (
    `<line x1="${-g}" y1="${-ph}" x2="${-g}" y2="${ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${g}" y1="${-ph}" x2="${g}" y2="${ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${-half}" y1="0" x2="${-g}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${g}" y1="0" x2="${half}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`
  );
}
function symInductor(half: number): string {
  const n = 4, r = half / n;
  let p = `M${-half},0`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${-half + r * (2 * i + 2)},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function impBox(s: string[], t: string[], x1: number, x2: number, y: number, label: string): void {
  const bw = x2 - x1, bh = 36;
  s.push(`<rect x="${x1}" y="${y - bh / 2}" width="${bw}" height="${bh}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text((x1 + x2) / 2, y + 5, label, { size: 13, weight: 700, fill: ACCENT }));
}
function loadBox(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const bw = 44, bh = 70, cyv = (y1 + y2) / 2;
  s.push(line(x, y1, x, cyv - bh / 2));
  s.push(`<rect x="${x - bw / 2}" y="${cyv - bh / 2}" width="${bw}" height="${bh}" fill="white" stroke="${ACCENT}" stroke-width="${WIRE_W}" stroke-dasharray="5 3"/>`);
  s.push(line(x, cyv + bh / 2, x, y2));
  t.push(text(x, cyv + 5, label, { size: 14, weight: 700, fill: ACCENT }));
}
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  const sine = `<path d="M${cx - 12},${cy} Q${cx - 6},${cy - 8} ${cx},${cy} T${cx + 12},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx + r + 4}" y="${cy - r + 6}" font-size="11" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx + r + 4}" y="${cy + r}" font-size="13" font-weight="700" fill="${RED}">−</text>`;
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
