import type { ZenerShuntRegulatorCircuitDiagram } from "@/types";

/**
 * 제너 n개 **직렬** 션트 정전압 회로 전용 fixed-slot 렌더러 (임용 2번 전자회로) — 원본 배치 그대로.
 *
 *   V_i(좌, 세로) ─ 상단: a[kΩ] ─ ● 마디 P ───── R_L(우측 세로, V_RL +/−)
 *   마디 P ─ 제너 n개(세로 직렬) ─ 하단 rail(접지)
 *
 * ★ 제너 기호: 삼각형 + 캐소드 바의 양 끝이 꺾인 형태(Z). 캐소드가 **위**(전류가 아래로 항복 통과).
 * ★ 라벨 규칙(#6): 제너 사양(V_Z·I_ZM)은 제너 **왼쪽**, 부하는 **오른쪽** — 가운데 세로선과 겹치지 않게.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";

export function renderZenerShuntRegulatorCircuit(d: ZenerShuntRegulatorCircuitDiagram): string {
  const n = Math.max(1, Math.min(4, d.zenerCount || 2));
  const W = 640, H = 300;
  const xSrc = 96, xA = 224, xP = 350, xLoad = 520;
  const yTop = 74, yBot = 246;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 좌측 입력 전원
  s.push(dcSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 22, (yTop + yBot) / 2 + 4, d.viLabel, { anchor: "end", size: 12.5, weight: 700, fill: ACCENT }));

  // 상단 rail: V_i — a — 마디 P — R_L
  w.push(line(xSrc, yTop, xA - 26, yTop));
  s.push(resistorH(xA, yTop));
  t.push(text(xA, yTop - 16, d.aLabel, { size: 12.5, weight: 700 }));
  w.push(line(xA + 26, yTop, xLoad, yTop));
  s.push(dot(xP, yTop));

  // 가운데 세로: 제너 n개 직렬
  const span = yBot - yTop;
  const slot = span / n;
  for (let k = 0; k < n; k++) {
    const cy = yTop + slot * (k + 0.5);
    s.push(zenerV(xP, cy));
    // 사양 라벨은 제너 왼쪽 (두 줄)
    t.push(text(xP - 26, cy - 4, d.vzLabel, { anchor: "end", size: 11, weight: 600 }));
    t.push(text(xP - 26, cy + 12, d.izmLabel, { anchor: "end", size: 11, weight: 600 }));
  }
  w.push(line(xP, yTop, xP, yTop + slot * 0.5 - 16));
  for (let k = 0; k < n - 1; k++) {
    w.push(line(xP, yTop + slot * (k + 0.5) + 16, xP, yTop + slot * (k + 1.5) - 16));
  }
  w.push(line(xP, yTop + slot * (n - 0.5) + 16, xP, yBot));

  // 우측 부하 R_L + V_RL 극성
  const yMid = (yTop + yBot) / 2;
  w.push(line(xLoad, yTop, xLoad, yMid - 26));
  s.push(resistorV(xLoad, yMid));
  t.push(text(xLoad - 16, yMid + 4, d.rlLabel, { anchor: "end", size: 12, weight: 600 }));
  w.push(line(xLoad, yMid + 26, xLoad, yBot));
  t.push(text(xLoad + 40, yTop + 34, "+", { anchor: "middle", size: 13, weight: 700 }));
  t.push(text(xLoad + 40, yMid + 5, "V_RL[V]", { anchor: "middle", size: 12, weight: 700, fill: RED }));
  t.push(text(xLoad + 40, yBot - 22, "−", { anchor: "middle", size: 13, weight: 700 }));

  // 하단 rail + 접지
  w.push(line(xSrc, yBot, xLoad, yBot));
  s.push(ground(xP, yBot));

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
/** 제너 다이오드 (세로) — 캐소드 바가 위, 바 양 끝이 꺾인 Z 형태. */
function zenerV(cx: number, cy: number): string {
  const hw = 11;
  return `<path d="M${cx - hw},${cy + 8} L${cx + hw},${cy + 8} L${cx},${cy - 6} Z" fill="#fff" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>` +
    `<path d="M${cx - hw - 4},${cy - 12} L${cx - hw},${cy - 6} L${cx + hw},${cy - 6} L${cx + hw + 4},${cy}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>` +
    `<line x1="${cx}" y1="${cy - 16}" x2="${cx}" y2="${cy - 6}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + 8}" x2="${cx}" y2="${cy + 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function ground(cx: number, cy: number): string {
  return `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 14}" y1="${cy + 16}" x2="${cx + 14}" y2="${cy + 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 9}" y1="${cy + 22}" x2="${cx + 9}" y2="${cy + 22}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 4}" y1="${cy + 28}" x2="${cx + 4}" y2="${cy + 28}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
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
