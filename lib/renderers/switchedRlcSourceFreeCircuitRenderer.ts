import type { SwitchedRlcSourceFreeCircuitDiagram } from "@/types";

/**
 * t=0 스위치 개방 무전원 직렬 RLC 전용 fixed-slot 렌더러 (임용 5번) — 원본 배치 그대로.
 *
 *   V_s(좌, 세로) ─ 상단: R_s ─ SW(t=0 개방) ─ ● 마디 N ─ R_3 ─ ┐
 *   마디 N ─ R_p(세로) ─ 하단 rail
 *   우측 세로 leg: C(v(t), + 위) ─ L(i(t), ↓) ─ 하단 rail   (직렬)
 *
 * ★ 라벨 규칙(#6): 상단 소자는 위쪽, 세로 소자는 왼쪽(값)·오른쪽(측정량)으로 나눠 배치.
 *   커패시터 극판 반폭이 16이라 값 라벨은 −22 바깥에서 끝나게 한다(겹침 실측).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderSwitchedRlcSourceFreeCircuit(d: SwitchedRlcSourceFreeCircuitDiagram): string {
  const W = 660, H = 320;
  const xSrc = 76, xRs = 176, xSw = 268, xN = 344, xR3 = 440, xRight = 566;
  const yTop = 86, yBot = 268;
  const yC = 150, yL = 214;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 좌측 전압원
  s.push(dcSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 20, (yTop + yBot) / 2 + 4, d.vsLabel, { anchor: "end", size: 12.5, weight: 700, fill: ACCENT }));

  // 상단 rail: V_s — R_s — SW — 마디 N — R_3 — 우측 leg
  w.push(line(xSrc, yTop, xRs - 26, yTop));
  s.push(resistorH(xRs, yTop));
  t.push(text(xRs, yTop - 16, d.rsLabel, { size: 12, weight: 600 }));
  w.push(line(xRs + 26, yTop, xSw - 22, yTop));
  s.push(switchOpen(xSw, yTop));
  t.push(text(xSw + 2, yTop + 24, "t=0", { size: 11, fill: MUTED }));
  w.push(line(xSw + 22, yTop, xN, yTop));
  s.push(dot(xN, yTop));
  w.push(line(xN, yTop, xR3 - 26, yTop));
  s.push(resistorH(xR3, yTop));
  t.push(text(xR3, yTop - 16, d.r3Label, { size: 12, weight: 600 }));
  w.push(line(xR3 + 26, yTop, xRight, yTop));

  // 마디 N ─ R_p(세로) ─ 하단
  const yMidL = (yTop + yBot) / 2;
  w.push(line(xN, yTop, xN, yMidL - 26));
  s.push(resistorV(xN, yMidL));
  w.push(line(xN, yMidL + 26, xN, yBot));
  t.push(text(xN - 16, yMidL + 4, d.rpLabel, { anchor: "end", size: 12, weight: 600 }));

  // 우측 세로 leg: C (v(t), + 위) → L (i(t), ↓)
  w.push(line(xRight, yTop, xRight, yC - 14));
  s.push(capacitorV(xRight, yC));
  t.push(text(xRight - 24, yC + 4, d.cLabel, { anchor: "end", size: 12, weight: 600 }));
  t.push(text(xRight + 14, yC - 12, "+", { anchor: "start", size: 13, weight: 700 }));
  t.push(text(xRight + 26, yC + 5, "v(t)", { anchor: "start", size: 12, weight: 700, fill: RED }));
  t.push(text(xRight + 14, yC + 20, "−", { anchor: "start", size: 13, weight: 700 }));
  w.push(line(xRight, yC + 14, xRight, yL - 26));
  s.push(inductorV(xRight, yL));
  t.push(text(xRight - 16, yL + 4, d.lLabel, { anchor: "end", size: 12, weight: 600 }));
  // i(t) 아래 방향 화살표 — 인덕터 오른쪽
  s.push(arrowDown(xRight + 18, yL - 16, yL + 12));
  t.push(text(xRight + 26, yL + 6, "i(t)", { anchor: "start", size: 12, weight: 700, fill: RED }));
  w.push(line(xRight, yL + 26, xRight, yBot));

  // 하단 rail
  w.push(line(xSrc, yBot, xRight, yBot));

  return svg(W, H, [...w, ...s, ...t]);
}

function dcSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 18;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">+</text>` +
    `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">−</text>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 열린 스위치 — arm이 위로 들려 있다(t=0에 개방). */
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
  return `<path d="${p} L${cx + half},${cy}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function resistorV(cx: number, cy: number): string {
  const half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  return `<path d="${p} L${cx},${cy + half}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function inductorV(cx: number, cy: number): string {
  const half = 26, n = 4, r = half / n;
  let p = `M${cx},${cy - half}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx},${cy - half + r * (2 * i + 2)}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function capacitorV(cx: number, cy: number): string {
  const g = 5, ph = 16;
  return `<line x1="${cx - ph}" y1="${cy - g}" x2="${cx + ph}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${cx - ph}" y1="${cy + g}" x2="${cx + ph}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${cx}" y1="${cy - 14}" x2="${cx}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + g}" x2="${cx}" y2="${cy + 14}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function arrowDown(x: number, y1: number, y2: number): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 6}" stroke="${RED}" stroke-width="1.4"/>` +
    `<path d="M${x - 4},${y2 - 7} L${x},${y2} L${x + 4},${y2 - 7} Z" fill="${RED}"/>`;
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
