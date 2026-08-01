/**
 * 어드미턴스 공진 회로 전용 fixed-slot 렌더러 (임용 7번 회로이론).
 *
 *  유사(가): 교류 전압원(좌) → 상단 rail(i(t)) → 점선 블록[ C(좌 세로) ∥ (R+L 직렬, 우 세로) ] → 하단 rail.
 *  변형(쌍대): 교류 전류원(좌) → 직렬 L(상단 가로) → 마디 → 점선 블록[ R(좌 세로) ∥ C(우 세로) ] → 하단 rail.
 */

import type {
  AcAdmittanceResonanceCircuitDiagram,
  AcAdmittanceResonanceDualCircuitDiagram,
} from "@/types";

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const DASH = "#7c3aed";

// ════════════ 유사: 전압원 → 병렬[ C ∥ (R+L) ] ════════════
export function renderAcAdmittanceResonanceCircuit(d: AcAdmittanceResonanceCircuitDiagram): string {
  const W = 600, H = 380;
  const xSrc = 90, xC = 320, xRL = 440;
  const yTop = 80, yBot = 320, yMid = (yTop + yBot) / 2;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 전원 (좌, 세로 AC 전압원)
  s.push(acVSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 16, (yTop + yBot) / 2 + 4, `${d.srcLabel}[V]`, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 상단 rail: xSrc → xRL, i(t) 화살표
  w.push(line(xSrc, yTop, xRL, yTop));
  s.push(dot(xC, yTop), dot(xRL, yTop));
  arrowR(s, t, xSrc + 30, xC - 30, yTop - 14, "i(t)");

  // 점선 블록 (xC 좌 ~ xRL 우)
  s.push(`<rect x="${xC - 36}" y="${yTop - 20}" width="${xRL - xC + 72}" height="${yBot - yTop + 40}" fill="none" stroke="${DASH}" stroke-width="1.3" stroke-dasharray="6 4"/>`);
  if (d.yeqLabel) t.push(text((xC + xRL) / 2, yBot + 30, d.yeqLabel, { size: 13, weight: 700, fill: DASH }));

  // 병렬 가지 1: C (xC, yTop..yBot)
  vCap(s, t, xC, yTop, yBot, d.cLabel, "C");
  s.push(dot(xC, yBot));
  // 병렬 가지 2: R(상) + L(하) 직렬 (xRL, yTop..yBot)
  vRes(s, t, xRL, yTop, yMid, d.rLabel, "R");
  vInd(s, t, xRL, yMid, yBot, d.lLabel, "L");
  s.push(dot(xRL, yBot));

  // 하단 rail: xSrc → xRL
  w.push(line(xSrc, yBot, xRL, yBot));

  t.push(text(W / 2, H - 8, "전압원 → 병렬[ C ∥ (R+L 직렬) ] · 점선 블록 Y_eq=a+jb", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ════════════ 쌍대(변형): 전류원 → 직렬[ L + (R∥C) ] ════════════
export function renderAcAdmittanceResonanceDualCircuit(d: AcAdmittanceResonanceDualCircuitDiagram): string {
  const W = 620, H = 380;
  const xSrc = 90, xL1 = 200, xM = 330, xR = 360, xC = 470;
  const yTop = 80, yBot = 320;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 전원 (좌, 세로 AC 전류원)
  s.push(acISource(xSrc, yTop, yBot));
  t.push(text(xSrc - 16, (yTop + yBot) / 2 + 4, `${d.srcLabel}[A]`, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 상단: xSrc ─ 직렬 L ─ 마디 M, M → 블록 상단 rail(xR..xC)
  hInd(s, t, xSrc, xL1, yTop, d.lLabel, "L");
  w.push(line(xL1, yTop, xC, yTop));
  s.push(dot(xR, yTop), dot(xC, yTop));

  // 점선 블록 (xR 좌 ~ xC 우): L + (R∥C). v(t) 측정 표시
  s.push(`<rect x="${xL1 - 4}" y="${yTop - 20}" width="${xC - xL1 + 40}" height="${yBot - yTop + 40}" fill="none" stroke="${DASH}" stroke-width="1.3" stroke-dasharray="6 4"/>`);
  if (d.zeqLabel) t.push(text((xR + xC) / 2, yBot + 30, d.zeqLabel, { size: 13, weight: 700, fill: DASH }));

  // 병렬 가지: R (xR 세로), C (xC 세로)
  vRes(s, t, xR, yTop, yBot, d.rLabel, "R");
  vCap(s, t, xC, yTop, yBot, d.cLabel, "C");
  s.push(dot(xR, yBot), dot(xC, yBot));

  // 하단 rail: xSrc → xC
  w.push(line(xSrc, yBot, xC, yBot));

  // v(t) 측정 (전원 양단) — 라벨은 소자명과 겹치지 않게 좌측 상단에.
  t.push(text(xSrc + 2, yTop - 16, "v(t)", { size: 12, weight: 700, fill: RED, anchor: "start" }));
  s.push(`<line x1="${xSrc + 24}" y1="${yTop - 4}" x2="${xSrc + 24}" y2="${yBot + 4}" stroke="${RED}" stroke-width="1" stroke-dasharray="3 3"/>`);

  t.push(text(W / 2, H - 8, "전류원 → 직렬[ L + (R∥C) ] · 점선 블록 Z_eq=a+jb (쌍대)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ════════════ 소자 헬퍼 ════════════
function hInd(s: string[], t: string[], x1: number, x2: number, y: number, label: string, name: string): void {
  const cx = (x1 + x2) / 2, sh = 22, n = 4, r = sh / n;
  s.push(line(x1, y, cx - sh, y), line(cx + sh, y, x2, y));
  let p = `M${cx - sh},${y}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx - sh + r * (2 * i + 2)},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(cx, y - 12, name, { size: 11, weight: 700, fill: ACCENT }));
  t.push(text(cx, y + 18, label, { size: 10, fill: "#374151" }));
}
function vInd(s: string[], t: string[], x: number, y1: number, y2: number, label: string, name: string): void {
  const cy = (y1 + y2) / 2, sh = 22, n = 4, r = sh / n;
  s.push(line(x, y1, x, cy - sh), line(x, cy + sh, x, y2));
  let p = `M${x},${cy - sh}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 0 ${x},${cy - sh + r * (2 * i + 2)}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(x + 16, cy - 2, name, { size: 11, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(text(x + 16, cy + 14, label, { size: 10, fill: "#374151", anchor: "start" }));
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
  t.push(text(x + 16, cy + 14, label, { size: 10, fill: "#374151", anchor: "start" }));
}
function acVSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  const sine = `<path d="M${cx - 12},${cy} Q${cx - 6},${cy - 8} ${cx},${cy} T${cx + 12},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx + r + 3}" y="${cy - r + 8}" font-size="11" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx + r + 3}" y="${cy + r}" font-size="13" font-weight="700" fill="${RED}">−</text>`;
}
function acISource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  const sine = `<path d="M${cx - 11},${cy} Q${cx - 5.5},${cy - 7} ${cx},${cy} T${cx + 11},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.3"/>`;
  // 전류 방향 화살표 (위로)
  const arr = `<line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${cy - 11}" stroke="${STROKE}" stroke-width="1.5"/>` +
    `<path d="M${cx - 4},${cy - 6} L${cx},${cy - 13} L${cx + 4},${cy - 6} Z" fill="${STROKE}"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${arr}${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function arrowR(s: string[], t: string[], x1: number, x2: number, y: number, label: string): void {
  s.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ACCENT}" stroke-width="1.5"/>`);
  s.push(`<path d="M${x2 - 7},${y - 4} L${x2},${y} L${x2 - 7},${y + 4} Z" fill="${ACCENT}"/>`);
  t.push(text((x1 + x2) / 2, y - 6, label, { size: 12, weight: 700, fill: ACCENT }));
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
