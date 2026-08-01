/**
 * 테브난 + 종속 전압원(k·v_x) + 시험전원법 (임용 2024 전기 6번) 전용 fixed-slot 렌더러.
 *   (가) 원본: Vs(좌세로) ─ R1(상가로) ─ M ─ k·v_x(다이아몬드, 상가로) ─ a / M ─ Rx(세로, v_x) ─ b / a ─ R_L(세로) ─ b.
 *   (나) 테브난 등가: V_TH(좌세로) ─ R_TH(상가로) ─ a / a ─ R_L(세로, I_L·V_L) ─ b.
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

/** ★ component.value는 string | number — 라벨 헬퍼는 string만 받는다
 *  (이 파일의 tsc 오류 8건 원인이었다. 2026-07-29 route에 배선하면서 해소). */
function lbl(v: string | number | undefined | null, fallback: string): string {
  return v === undefined || v === null || v === "" ? fallback : String(v);
}

export function detectTheveninDepVoltage(netlist: CircuitNetlist): boolean {
  const ids = new Set((netlist.components ?? []).map((c) => c.id));
  return (ids.has("VxG") && ids.has("RxG")) || (ids.has("RthN") && ids.has("VthN"));
}

export function renderTheveninDepVoltageCircuit(netlist: CircuitNetlist): string | null {
  const ids = new Set((netlist.components ?? []).map((c) => c.id));
  const byId = (id: string) => netlist.components.find((c) => c.id === id);
  if (ids.has("VxG")) return renderGa(byId);
  if (ids.has("RthN")) return renderNa(byId);
  return null;
}

// ─────────────────────── (가) 원본 (VCVS) ───────────────────────
function renderGa(byId: (id: string) => CircuitComponent | undefined): string {
  const W = 600, H = 380;
  const xVs = 110, xM = 300, xa = 480;
  const yTop = 90, yBot = 320;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  w.push(line(xVs, yTop, xM, yTop));        // TL → M
  w.push(line(xVs, yBot, xa, yBot));        // 바닥 rail
  vSource(s, t, xVs, yTop, yBot, lbl(byId("VsG")?.value, "Vs"), true, "left");
  hRes(s, t, xVs + 36, xM - 36, yTop, lbl(byId("R1G")?.value, "R1"));
  s.push(dot(xM, yTop));
  // M ─ Rx ─ b (세로, v_x)
  vRes(s, t, xM, yTop, yBot, lbl(byId("RxG")?.value, "Rx"), "left");
  s.push(dot(xM, yBot));
  vxLabel(t, xM + 14, yTop, yBot);
  // M ─ k·v_x 다이아몬드 ─ a (상가로)
  diamondSource(s, t, (xM + xa) / 2, yTop, lbl(byId("VxG")?.value, "kv_x"));
  w.push(line(xM, yTop, (xM + xa) / 2 - 26, yTop), line((xM + xa) / 2 + 26, yTop, xa, yTop));
  s.push(dot(xa, yTop));
  // a ─ R_L ─ b + 단자 a·b
  vRes(s, t, xa, yTop, yBot, lbl(byId("RLG")?.value, "R_L"), "right");
  s.push(dot(xa, yBot));
  t.push(text(xa + 24, yTop - 4, "a", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(text(xa + 24, yBot + 14, "b", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  t.push(text(W / 2, H - 8, "(가) 독립 전압원 + 종속 전압원(k·v_x) — 단자 a–b, 부하 R_L", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────── (나) 테브난 등가 ───────────────────────
function renderNa(byId: (id: string) => CircuitComponent | undefined): string {
  const W = 480, H = 360;
  const xV = 150, xa = 360;
  const yTop = 90, yBot = 300;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  w.push(line(xV, yTop, xa, yTop));
  w.push(line(xV, yBot, xa, yBot));
  vSource(s, t, xV, yTop, yBot, lbl(byId("VthN")?.value, "V_TH"), true, "left");
  hRes(s, t, xV + 36, xa - 36, yTop, lbl(byId("RthN")?.value, "R_TH"));
  s.push(dot(xa, yTop));
  vRes(s, t, xa, yTop, yBot, lbl(byId("RLN")?.value, "R_L"), "right");
  s.push(dot(xa, yBot));
  // I_L ↓ + V_L
  s.push(`<path d="M ${xa - 30} ${yTop + 18} L ${xa - 30} ${yTop + 58}" stroke="${ACCENT}" fill="none" stroke-width="1.4" marker-end="url(#tdv_arr)"/>`);
  t.push(text(xa - 24, yTop + 30, "I_L", { size: 12, weight: 600, fill: ACCENT, anchor: "start" }));
  t.push(text(xa + 24, yTop - 4, "a", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(text(xa + 24, yBot + 14, "b", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(`<text x="${xa + 24}" y="${(yTop + yBot) / 2}" font-size="12" font-weight="600" fill="${ACCENT}">V_L</text>`);

  t.push(text(W / 2, H - 8, "(나) 테브난 등가 — V_TH 직렬 R_TH + 부하 R_L", { size: 10, fill: MUTED }));
  return svg(W, H, [arrowDef(), ...w, ...s, ...t]);
}

// ─────────────────────── 헬퍼 ───────────────────────
function vRes(s: string[], t: string[], x: number, y1: number, y2: number, label: string, side: "left" | "right"): void {
  const cy = (y1 + y2) / 2, half = 24, a = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(side === "left" ? x - 16 : x + 16, cy + 4, label, { size: 11, weight: 600, anchor: side === "left" ? "end" : "start", fill: ACCENT }));
}
function hRes(s: string[], t: string[], x1: number, x2: number, y: number, label: string): void {
  const cx = (x1 + x2) / 2, half = 24, a = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x1, y, cx - half, y), line(cx + half, y, x2, y));
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(cx, y - 12, label, { size: 11, weight: 600, fill: ACCENT }));
}
function vSource(s: string[], t: string[], x: number, y1: number, y2: number, label: string, plusTop: boolean, side: "left" | "right"): void {
  const cy = (y1 + y2) / 2, r = 20;
  s.push(line(x, y1, x, cy - r), line(x, cy + r, x, y2));
  s.push(`<circle cx="${x}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(`<text x="${x}" y="${cy - 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${RED}">${plusTop ? "+" : "−"}</text>`);
  t.push(`<text x="${x}" y="${cy + 13}" text-anchor="middle" font-size="14" font-weight="700" fill="${RED}">${plusTop ? "−" : "+"}</text>`);
  t.push(text(side === "left" ? x - 26 : x + 26, cy + 4, label, { size: 11, weight: 600, anchor: side === "left" ? "end" : "start", fill: ACCENT }));
}
/** 종속 전압원 다이아몬드 (가로 방향, 좌 − / 우 +). */
function diamondSource(s: string[], t: string[], cx: number, cy: number, label: string): void {
  const r = 24;
  s.push(`<path d="M ${cx - r} ${cy} L ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(`<text x="${cx - r + 7}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${RED}">−</text>`);
  t.push(`<text x="${cx + r - 7}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${RED}">+</text>`);
  t.push(text(cx, cy - r - 6, label, { size: 11, weight: 600, fill: ACCENT }));
}
/** v_x 측정 (+/− + 라벨, Rx 양단). */
function vxLabel(t: string[], x: number, yTop: number, yBot: number): void {
  t.push(`<text x="${x}" y="${yTop + 24}" font-size="12" font-weight="700" fill="${RED}">+</text>`);
  t.push(`<text x="${x}" y="${yBot - 14}" font-size="14" font-weight="700" fill="${RED}">−</text>`);
  t.push(`<text x="${x + 6}" y="${(yTop + yBot) / 2}" font-size="12" font-weight="600" fill="${ACCENT}">v_x</text>`);
}
function arrowDef(): string {
  return `<defs><marker id="tdv_arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="${ACCENT}"/></marker></defs>`;
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
