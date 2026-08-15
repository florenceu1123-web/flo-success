import type { SwitchedRlcDualSwitchCircuitDiagram } from "@/types";

/**
 * SW₁ 닫힘 + SW₂(접점 b→c) 2전압원 RLC 전용 fixed-slot 렌더러 (2022 전기 B-5) — 원본 배치 그대로.
 *
 *   V_s(좌, 세로) ─ 상단: SW₁(t=0 닫힘) ─ R₁ ─ L(i₁ →) ─ ● 노드 a ─ SW₂(t=0, b→c)
 *   노드 a ─ C(세로, + v_c −) ─ 하단 rail
 *   SW₂ 접점 c(위) → 우측 R₂(세로),  접점 b(아래) → V_b(세로)   ─ 모두 하단 rail로.
 *
 * ★ 라벨 규칙(#6): 소자 라벨은 소자의 한쪽 side에만, 접점 b·c 라벨은 스위치 arm 바깥쪽에 둔다.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderSwitchedRlcDualSwitchCircuit(d: SwitchedRlcDualSwitchCircuitDiagram): string {
  const W = 700, H = 360;
  const xSrc = 80, xSw1 = 160, xR1 = 250, xL = 350, xA = 430, xSw2 = 500, xVb = 560, xR2 = 650;
  const yTop = 110, yBot = 300;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 좌측 전원 V_s (세로)
  s.push(dcSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 16, (yTop + yBot) / 2 + 4, d.vsLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 상단 rail: V_s — SW₁ — R₁ — L — 노드 a
  w.push(line(xSrc, yTop, xSw1 - 22, yTop));
  s.push(switchOpen(xSw1, yTop));
  t.push(text(xSw1, yTop - 30, "SW₁", { size: 12, weight: 700 }));
  t.push(text(xSw1, yTop + 24, "t=0", { size: 11, fill: MUTED }));
  w.push(line(xSw1 + 22, yTop, xR1 - 26, yTop));
  s.push(resistorH(xR1, yTop));
  t.push(text(xR1, yTop - 18, d.r1Label, { size: 12, weight: 600 }));
  w.push(line(xR1 + 26, yTop, xL - 26, yTop));
  s.push(inductorH(xL, yTop));
  t.push(text(xL, yTop - 18, d.lLabel, { size: 12, weight: 600 }));
  // 전류 i₁ 화살표 (인덕터 아래)
  s.push(arrowRight(xL - 18, xL + 14, yTop + 20));
  t.push(text(xL, yTop + 38, d.currentLabel, { size: 11.5, weight: 700, fill: RED }));
  w.push(line(xL + 26, yTop, xA, yTop));
  s.push(dot(xA, yTop));
  t.push(text(xA, yTop - 14, "a", { size: 13, weight: 700, fill: ACCENT }));

  // 노드 a — 커패시터(세로) — 하단
  const yC = (yTop + yBot) / 2;
  w.push(line(xA, yTop, xA, yC - 14));
  s.push(capacitorV(xA, yC));
  w.push(line(xA, yC + 14, xA, yBot));
  t.push(text(xA - 12, yC + 4, d.cLabel, { anchor: "end", size: 12, weight: 600 }));
  t.push(text(xA + 14, yC - 16, "+", { anchor: "start", size: 13, weight: 700, fill: RED }));
  t.push(text(xA + 14, yC + 24, "−", { anchor: "start", size: 13, weight: 700, fill: RED }));
  t.push(text(xA + 26, yC + 6, d.vcLabel, { anchor: "start", size: 12, weight: 700, fill: RED }));

  // 노드 a — SW₂ (SPDT: 접점 c 위 / 접점 b 아래)
  w.push(line(xA, yTop, xSw2 - 20, yTop));
  s.push(dot(xSw2 - 20, yTop));
  t.push(text(xSw2 + 4, yTop - 42, "SW₂", { size: 12, weight: 700 }));
  t.push(text(xSw2 - 10, yTop + 30, "t=0", { size: 11, fill: MUTED }));
  // arm — 현재 접점 b(아래)에 닿아 있고 t=0에 c(위)로 이동
  const yC2 = yTop - 26, yB2 = yTop + 14;
  s.push(`<line x1="${xSw2 - 20}" y1="${yTop}" x2="${xSw2 + 18}" y2="${yB2}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<path d="M${xSw2 + 4},${yTop - 14} A 22,22 0 0 1 ${xSw2 + 16},${yTop + 2}" fill="none" stroke="${MUTED}" stroke-width="1" stroke-dasharray="3 2"/>`);
  s.push(dot(xSw2 + 20, yC2), dot(xSw2 + 20, yB2));
  t.push(text(xSw2 + 30, yC2 - 4, "c", { anchor: "start", size: 12, weight: 700, fill: ACCENT }));
  t.push(text(xSw2 + 30, yB2 + 12, "b", { anchor: "start", size: 12, weight: 700, fill: ACCENT }));

  // 접점 c → 우측 R₂ (세로)
  w.push(line(xSw2 + 20, yC2, xR2, yC2), line(xR2, yC2, xR2, yC - 26));
  s.push(resistorV(xR2, yC));
  w.push(line(xR2, yC + 26, xR2, yBot));
  t.push(text(xR2 + 14, yC + 4, d.r2Label, { anchor: "start", size: 12, weight: 600 }));

  // 접점 b → V_b (세로)
  w.push(line(xSw2 + 20, yB2, xVb, yB2), line(xVb, yB2, xVb, yC - 24));
  s.push(dcSource(xVb, yC - 24, yBot));
  t.push(text(xVb - 16, yC + 22, d.vbLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 하단 rail
  w.push(line(xSrc, yBot, xR2, yBot));
  s.push(dot(xA, yBot), dot(xVb, yBot));

  t.push(text(W / 2, H - 12, "t<0: SW₁ 열림 → i₁(0₊)=0, SW₂=b → 커패시터가 V_b로 충전 (v_c(0₊)=V_b)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
function dcSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 20;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="14" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="16" font-weight="700" fill="${RED}">−</text>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 열린 스위치 (좌 단자 — arm이 위로 들림 — 우 단자). */
function switchOpen(cx: number, cy: number): string {
  return `<line x1="${cx - 22}" y1="${cy}" x2="${cx - 12}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + 12}" y1="${cy}" x2="${cx + 22}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 12}" y1="${cy}" x2="${cx + 10}" y2="${cy - 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<circle cx="${cx - 12}" cy="${cy}" r="2.6" fill="${STROKE}"/><circle cx="${cx + 12}" cy="${cy}" r="2.6" fill="${STROKE}"/>`;
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
