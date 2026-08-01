import type { DcThevenin2srcCircuitDiagram, DcTheveninEquivCircuitDiagram } from "@/types";

/**
 * 2전압원 병렬가지 (가) + 테브난 등가 (나) 전용 fixed-slot 렌더러 (임용 3번 회로이론).
 *   (가): 단자 a(상)–b(하) 사이 2 leg. leg1: R1(상)+V1(하), leg2: R2(상)+V2(하).
 *   (나): R_T(상)+V_T(하) 단일 leg + 단자 a·b.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

// ─────────────────────── (가) 2전압원 병렬 ───────────────────────
export function renderDcThevenin2srcCircuit(d: DcThevenin2srcCircuitDiagram): string {
  const W = 480, H = 360;
  const x1 = 140, x2 = 270, xa = 400;
  const yTop = 80, yMid = 185, yBot = 300;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 상·하 rail
  w.push(line(x1, yTop, xa, yTop));
  w.push(line(x1, yBot, xa, yBot));
  // leg1
  vRes(s, t, x1, yTop, yMid, d.r1Label, "left");
  vSource(s, t, x1, yMid, yBot, d.v1Label, d.v1PlusTop, "left");
  s.push(dot(x1, yTop), dot(x1, yBot));
  // leg2
  vRes(s, t, x2, yTop, yMid, d.r2Label, "right");
  vSource(s, t, x2, yMid, yBot, d.v2Label, d.v2PlusTop, "right");
  s.push(dot(x2, yTop), dot(x2, yBot));
  // 단자 a·b — 부하(R_L) 있으면 완성 회로(a–b에 R_L), 없으면 개방 단자.
  abTerminals(s, t, xa, yTop, yBot, d.loadLabel);

  t.push(text(W / 2, H - 8, d.loadLabel ? "(가) 2개 전압원 + 부하 R_L 완성 회로 — 단자 a–b" : "(가) 2개 전압원 병렬가지 — 단자 a–b", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────── (나) 테브난 등가 ───────────────────────
export function renderDcTheveninEquivCircuit(d: DcTheveninEquivCircuitDiagram): string {
  const W = 420, H = 360;
  const xL = 230, xa = 350;
  const yTop = 80, yMid = 185, yBot = 300;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  w.push(line(xL, yTop, xa, yTop));
  w.push(line(xL, yBot, xa, yBot));
  vRes(s, t, xL, yTop, yMid, d.rtLabel, "left");
  vSource(s, t, xL, yMid, yBot, d.vtLabel, d.vtPlusTop, "left");
  s.push(dot(xL, yTop), dot(xL, yBot));
  abTerminals(s, t, xa, yTop, yBot, d.loadLabel);

  t.push(text(W / 2, H - 8, d.loadLabel ? "(나) 테브난 등가 + 부하 R_L (최대 전력)" : "(나) 테브난 등가 — V_T 직렬 R_T", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────── 헬퍼 ───────────────────────
/** 수직 저항 (지그재그), x, y1→y2. 라벨 좌/우. */
function vRes(s: string[], t: string[], x: number, y1: number, y2: number, label: string, side: "left" | "right"): void {
  const cy = (y1 + y2) / 2, half = 22, a = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(side === "left" ? x - 14 : x + 14, cy + 4, label, { size: 11, weight: 600, anchor: side === "left" ? "end" : "start" }));
}
/** DC 전압원 (원 + 극성). plusTop=true면 + 위. */
function vSource(s: string[], t: string[], x: number, y1: number, y2: number, label: string, plusTop: boolean, side: "left" | "right"): void {
  const cy = (y1 + y2) / 2, r = 20;
  s.push(line(x, y1, x, cy - r), line(x, cy + r, x, y2));
  s.push(`<circle cx="${x}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  const plusY = plusTop ? cy - 7 : cy + 11, minusY = plusTop ? cy + 11 : cy - 4;
  t.push(`<text x="${x}" y="${plusY}" text-anchor="middle" font-size="12" font-weight="700" fill="${RED}">+</text>`);
  t.push(`<text x="${x}" y="${minusY}" text-anchor="middle" font-size="14" font-weight="700" fill="${RED}">−</text>`);
  t.push(text(side === "left" ? x - 26 : x + 26, cy + 4, label, { size: 11, weight: 600, anchor: side === "left" ? "end" : "start", fill: ACCENT }));
}
/** 단자 a·b — loadLabel 있으면 a–b에 부하 R_L(수직) 연결(완성 회로), 없으면 개방 단자. */
function abTerminals(s: string[], t: string[], x: number, yTop: number, yBot: number, loadLabel?: string): void {
  if (loadLabel) {
    vRes(s, t, x, yTop, yBot, loadLabel, "right");
    s.push(dot(x, yTop), dot(x, yBot));
    t.push(text(x + 30, yTop + 4, "a", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
    t.push(text(x + 30, yBot + 4, "b", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  } else {
    term(s, t, x, yTop, "a", "top");
    term(s, t, x, yBot, "b", "bot");
  }
}
/** 우측 개방 단자 (작은 원 + 라벨). */
function term(s: string[], t: string[], x: number, y: number, label: string, pos: "top" | "bot"): void {
  s.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(x + 12, y + 4, label, { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
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
