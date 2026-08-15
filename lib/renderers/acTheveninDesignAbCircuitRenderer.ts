import type { AcTheveninDesignAbCircuitDiagram } from "@/types";

/**
 * 교류 테브난 소자 값 설계(a·b) + 최대 평균전력 전용 fixed-slot 렌더러 (임용 7번) — 원본 배치 그대로.
 *
 *   V∠θ(좌, 세로) ─ 상단: [R_d + −jX_d 세로 션트] ─ a[Ω] ─ jb[Ω] ─ ● A
 *   마디 A 왼쪽에 −jb[Ω] 세로 션트 ─ 하단 rail
 *   단자 A ─ 점선 박스 Z_L(R 세로 + jX 세로 직렬) ─ 단자 B(하단 rail)
 *
 * ★ 라벨 규칙(#6): 상단 소자는 위쪽, 세로 소자는 왼쪽에만. Z_L 박스 라벨은 박스 **오른쪽 위** 바깥.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

export function renderAcTheveninDesignAbCircuit(d: AcTheveninDesignAbCircuitDiagram): string {
  const W = 700, H = 320;
  const xSrc = 74, xD = 186, xA = 300, xJb = 386, xSh = 462, xTerm = 566;
  const yTop = 80, yBot = 262;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 좌측 교류 전원
  s.push(acSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 22, (yTop + yBot) / 2 + 4, d.vLabel, { anchor: "end", size: 12.5, weight: 700, fill: ACCENT }));

  // 상단 rail: V ─ (션트 분기) ─ a ─ jb ─ 마디 A(=단자)
  w.push(line(xSrc, yTop, xTerm, yTop));
  s.push(dot(xD, yTop));
  s.push(dot(xSh, yTop));

  // 좌측 distractor 션트: R_d + (−jX_d) 직렬 (세로)
  const yMid = (yTop + yBot) / 2;
  w.push(line(xD, yTop, xD, yMid - 40));
  s.push(resistorV(xD, yMid - 14));
  t.push(text(xD - 16, yMid - 10, d.rdLabel, { anchor: "end", size: 11.5, weight: 600 }));
  w.push(line(xD, yMid + 12, xD, yMid + 26));
  s.push(capacitorV(xD, yMid + 40));
  t.push(text(xD - 16, yMid + 44, d.xdLabel, { anchor: "end", size: 11.5, weight: 600 }));
  w.push(line(xD, yMid + 54, xD, yBot));

  // 상단 직렬 a, jb  (라벨은 위쪽)
  s.push(resistorH(xA, yTop));
  t.push(text(xA, yTop - 16, d.aLabel, { size: 12.5, weight: 700 }));
  s.push(inductorH(xJb, yTop));
  t.push(text(xJb, yTop - 18, d.jbLabel, { size: 12.5, weight: 700 }));

  // −jb 션트 (세로)
  w.push(line(xSh, yTop, xSh, yMid - 14));
  s.push(capacitorV(xSh, yMid));
  t.push(text(xSh - 16, yMid + 4, d.shuntLabel, { anchor: "end", size: 12.5, weight: 700 }));
  w.push(line(xSh, yMid + 14, xSh, yBot));

  // 단자 A·B + 점선 박스 Z_L (R 직렬 jX)
  s.push(dot(xTerm, yTop));
  s.push(dot(xTerm, yBot));
  t.push(text(xTerm + 10, yTop - 8, "A", { anchor: "start", size: 12.5, weight: 700 }));
  t.push(text(xTerm + 10, yBot + 16, "B", { anchor: "start", size: 12.5, weight: 700 }));
  s.push(`<rect x="${xTerm - 34}" y="${yTop + 12}" width="68" height="${yBot - yTop - 24}" fill="none" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="5 4"/>`);
  t.push(text(xTerm + 40, yTop + 6, "Z_L", { anchor: "start", size: 12.5, weight: 700, fill: ACCENT }));
  const yR = yTop + 56, yX = yBot - 56;
  w.push(line(xTerm, yTop, xTerm, yR - 26));
  s.push(resistorV(xTerm, yR));
  t.push(text(xTerm + 18, yR + 4, d.zlRLabel, { anchor: "start", size: 11.5, weight: 600 }));
  w.push(line(xTerm, yR + 26, xTerm, yX - 26));
  s.push(inductorV(xTerm, yX));
  t.push(text(xTerm + 18, yX + 4, d.zlXLabel, { anchor: "start", size: 11.5, weight: 600 }));
  w.push(line(xTerm, yX + 26, xTerm, yBot));

  // 하단 rail
  w.push(line(xSrc, yBot, xTerm, yBot));

  return svg(W, H, [...w, ...s, ...t]);
}

/** 교류 전원 (원 + 사인 곡선) — 세로. */
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 19;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<path d="M${cx - 10},${cy} q5,-9 10,0 q5,9 10,0" fill="none" stroke="${STROKE}" stroke-width="1.5"/>` +
    `<text x="${cx + 12}" y="${cy - 10}" text-anchor="middle" font-size="12" font-weight="700" fill="${STROKE}">+</text>` +
    `<text x="${cx + 12}" y="${cy + 20}" text-anchor="middle" font-size="12" font-weight="700" fill="${STROKE}">−</text>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
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
function inductorH(cx: number, cy: number): string {
  const half = 26, n = 4, r = half / n;
  let p = `M${cx - half},${cy}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx - half + r * (2 * i + 2)},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
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
