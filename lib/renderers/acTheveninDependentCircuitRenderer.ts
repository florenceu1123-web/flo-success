import type { AcTheveninDepCircuitDiagram, AcTheveninDepEquivCircuitDiagram } from "@/types";

/**
 * 종속전원 포함 페이저 회로 (가) + 테브난 등가 (나) 전용 fixed-slot 렌더러 (임용 6번 회로이론).
 *
 *  (가): 독립 전류원(좌, 세로 ↑) ∥ 션트 Z₁(세로) — 상단 rail의 ★종속 전압원(다이아몬드 k·I₂)★ —
 *        마디 2 ∥ 션트 Z₂(세로, 전류 I₂ ↓) — 단자 A(우상). 단자 B = 하단 rail 우측.
 *        ※ 점선 테두리 = "테브난 등가로 변환할 영역"(원본 표기).
 *  (나): V_AB(좌, 세로) — Z_AB(직렬 박스) — 단자 A — [부하 Z_L = R + jX 세로 직렬] — 단자 B.
 *
 * ★ 라벨 규칙(#6): 소자 라벨은 해당 소자의 한쪽 side에만, 다이아몬드 라벨은 **위쪽**(좌우는 마디 배선과 겹침).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

type Elem = "R" | "L" | "C";

// ─────────────────────────── (가) 종속전원 포함 원회로 ───────────────────────────
export function renderAcTheveninDepCircuit(d: AcTheveninDepCircuitDiagram): string {
  const W = 660, H = 360;
  const xSrc = 130, xN1 = 250, xDep = 340, xN2 = 440, xA = 560;
  const yTop = 110, yBot = 285;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 점선 영역 (원본: "(가)의 점선 영역을 테브난 등가로 변환")
  s.push(`<rect x="${xSrc - 70}" y="${yTop - 62}" width="${xA - xSrc + 40}" height="${yBot - yTop + 110}" ` +
    `fill="none" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="6 4"/>`);

  // 독립 전류원 (좌, 세로, ↑)
  s.push(currentSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 30, (yTop + yBot) / 2 + 4, d.isrcLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 상단 rail: xSrc — xN1 —[종속 전압원]— xN2 — xA
  w.push(line(xSrc, yTop, xN1, yTop));
  w.push(line(xN1, yTop, xDep - 26, yTop));
  s.push(diamondVSource(xDep, yTop));
  t.push(text(xDep, yTop - 34, d.depLabel, { size: 13, weight: 700, fill: RED }));
  w.push(line(xDep + 26, yTop, xN2, yTop));
  s.push(dot(xN1, yTop), dot(xN2, yTop));

  // 션트 Z₁ (마디 1) · 션트 Z₂ (마디 2, 전류 I₂ ↓)
  vElem(s, d.z1Type, xN1, yTop, yBot, d.z1Label, t);
  vElem(s, d.z2Type, xN2, yTop, yBot, d.z2Label, t);
  // 제어 전류 화살표 (Z₂ 왼쪽, 아래 방향)
  s.push(arrowDown(xN2 - 24, yTop + 22, yTop + 58));
  t.push(text(xN2 - 30, yTop + 44, d.currentLabel, { anchor: "end", size: 12, weight: 700, fill: RED }));

  // 단자 A·B (우측)
  w.push(line(xN2, yTop, xA, yTop));
  s.push(dot(xA, yTop));
  t.push(text(xA + 12, yTop + 4, "A", { anchor: "start", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(xSrc, yBot, xA, yBot));
  s.push(dot(xA, yBot), dot(xN1, yBot), dot(xN2, yBot));
  t.push(text(xA + 12, yBot + 4, "B", { anchor: "start", size: 13, weight: 700, fill: ACCENT }));

  if (d.showLoad) {
    // 부하 Z_L (단자 A–B 가교, 점선 박스)
    const xL = xA + 60;
    w.push(line(xA, yTop, xL, yTop), line(xA, yBot, xL, yBot));
    loadBox(s, t, xL, yTop, yBot, "Z_L");
  } else {
    t.push(text(xA + 14, (yTop + yBot) / 2 + 4, "V_AB, Z_AB", { anchor: "start", size: 12, weight: 700, fill: MUTED }));
  }

  t.push(text(W / 2, H - 12, "종속전원이 있어 전원 무효화법을 쓸 수 없다 — A–B 단락 전류 I_AB로 Z_AB를 구한다", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── (나) 테브난 등가 + 부하 Z_L = R + jX ───────────────────────────
export function renderAcTheveninDepEquivCircuit(d: AcTheveninDepEquivCircuitDiagram): string {
  const W = 620, H = 340;
  const xSrc = 110, xZ1 = 230, xZ2 = 380, xA = 470, xL = 545;
  const yTop = 85, yBot = 265;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // V_AB (좌, 세로) + Z_AB (상단 직렬 박스)
  s.push(acSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 28, (yTop + yBot) / 2 + 4, d.vthLabel, { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(xSrc, yTop, xZ1, yTop));
  impBox(s, t, xZ1, xZ2, yTop, d.zthLabel);
  w.push(line(xZ2, yTop, xA, yTop));
  s.push(dot(xA, yTop));
  t.push(text(xA - 6, yTop - 12, "A", { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(xA, yTop, xL, yTop));

  // 부하 Z_L = R 직렬 jX (세로 2소자) + 점선 묶음
  const yR = yTop + 50, yX = yTop + 120;
  s.push(`<rect x="${xL - 46}" y="${yTop + 16}" width="92" height="${yBot - yTop - 32}" fill="none" ` +
    `stroke="${ACCENT}" stroke-width="1.2" stroke-dasharray="5 3"/>`);
  s.push(line(xL, yTop, xL, yR - 20), sym("R", xL, yR, 20, 90), line(xL, yR + 20, xL, yX - 20));
  t.push(text(xL + 26, yR + 4, d.rLabel, { anchor: "start", size: 12, weight: 600 }));
  s.push(sym("L", xL, yX, 20, 90), line(xL, yX + 20, xL, yBot));
  t.push(text(xL + 26, yX + 4, d.xLabel, { anchor: "start", size: 12, weight: 600 }));
  t.push(text(xL + 54, (yTop + yBot) / 2 + 4, d.loadLabel, { anchor: "start", size: 13, weight: 700, fill: ACCENT }));

  s.push(dot(xL, yBot));
  t.push(text(xA - 6, yBot + 18, "B", { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(xSrc, yBot, xL, yBot));
  s.push(dot(xA, yBot));

  t.push(text(W / 2, H - 12, "복소 켤레 정합 Z_L = Z_AB* 일 때 최대평균전력 P_L(max) = |V_AB|²/(4·R_AB)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
function vElem(s: string[], type: Elem, x: number, y1: number, y2: number, label: string, t: string[]): void {
  const cyv = (y1 + y2) / 2, half = 22;
  s.push(line(x, y1, x, cyv - half), sym(type, x, cyv, half, 90), line(x, cyv + half, x, y2));
  t.push(text(x + 16, cyv + 4, label, { size: 12, weight: 600, anchor: "start" }));
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
  const g = 5, ph = 12;
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
/** 독립 전류원 — 원 + 위 방향 화살표. */
function currentSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 8}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<path d="M${cx - 5},${cy - 6} L${cx},${cy - 14} L${cx + 5},${cy - 6} Z" fill="${STROKE}"/>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 종속 전압원 — 다이아몬드 + 극성(+/−). 상단 rail에 직렬(가로). */
function diamondVSource(cx: number, cy: number): string {
  const rx = 26, ry = 20;
  return `<polygon points="${cx - rx},${cy} ${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry}" ` +
    `fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx - 12}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx + 12}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">−</text>`;
}
function arrowDown(x: number, y1: number, y2: number): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 6}" stroke="${RED}" stroke-width="1.4"/>` +
    `<path d="M${x - 4},${y2 - 7} L${x},${y2} L${x + 4},${y2 - 7} Z" fill="${RED}"/>`;
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
