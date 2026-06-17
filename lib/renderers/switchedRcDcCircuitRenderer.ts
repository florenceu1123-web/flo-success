import type { SwitchedRcDcCircuitDiagram } from "@/types";

/**
 * t=0 스위치 개방 RC 회로 (임용 2번) 전용 fixed-slot 렌더러.
 *   상·하 레일 사이 병렬 가지: [V_s + 직렬 R_s] · [I_s] ─[SW t=0]─ [C(v_c)] · [R_load(v_o)].
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const W = 620, H = 340;
const TOP = 100, BOT = 280;
const VS_X = 70, IS_X = 200, C_X = 380, RL_X = 500;
const SW_L = 260, SW_R = 320; // 스위치 (I_s 가지와 C 가지 사이 top rail)

type D = SwitchedRcDcCircuitDiagram;

export function renderSwitchedRcDcCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  // 하단 레일
  w.push(line(VS_X, BOT, RL_X, BOT));

  // ── 가지1: V_s + 직렬 R_s (좌측 세로 + 상단 R) ──
  s.push(dcSource(VS_X, TOP + 30, BOT));
  t.push(text(VS_X - 26, (TOP + 30 + BOT) / 2 + 4, d.vsLabel ?? "V_s", { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  // 상단: V_s top → R_s → N1(I_s 가지)
  w.push(line(VS_X, TOP + 30, VS_X, TOP));
  hResistor(s, VS_X + 16, IS_X - 16, TOP);
  w.push(line(VS_X, TOP, VS_X + 16, TOP));
  w.push(line(IS_X - 16, TOP, IS_X, TOP));
  t.push(text((VS_X + IS_X) / 2, TOP - 8, d.rsLabel ?? "R_s", { size: 11, weight: 600 }));

  // ── 가지2: I_s 전류원 ──
  s.push(currentSource(IS_X, TOP, BOT));
  t.push(text(IS_X - 22, (TOP + BOT) / 2 + 4, d.isLabel ?? "I_s", { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  s.push(dot(IS_X, TOP));

  // ── 스위치 (t=0, top rail I_s↔C 사이) ──
  w.push(line(IS_X, TOP, SW_L, TOP));
  s.push(`<line x1="${SW_L}" y1="${TOP}" x2="${SW_R}" y2="${TOP - 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`); // 개방된 arm
  s.push(dot(SW_L, TOP)); s.push(dot(SW_R, TOP));
  t.push(text((SW_L + SW_R) / 2, TOP - 22, "t=0", { size: 11, weight: 600 }));
  w.push(line(SW_R, TOP, C_X, TOP));

  // ── 가지3: 리액티브 (RC=커패시터 / RL=코일) ──
  if (d.kind === "RL") {
    vInductor(s, C_X, TOP + 16, BOT - 16);
    w.push(line(C_X, TOP, C_X, TOP + 16));
    w.push(line(C_X, BOT - 16, C_X, BOT));
  } else {
    capacitor(s, C_X, TOP + 18, BOT - 18);
    w.push(line(C_X, TOP, C_X, TOP + 18));
    w.push(line(C_X, BOT - 18, C_X, BOT));
  }
  s.push(dot(C_X, TOP));
  t.push(text(C_X + 14, (TOP + BOT) / 2 - 8, d.reactLabel ?? (d.kind === "RL" ? "L" : "C"), { size: 11, weight: 600, anchor: "start" }));
  t.push(text(C_X - 14, (TOP + BOT) / 2 + 4, d.reactMeasLabel ?? (d.kind === "RL" ? "i_L" : "v_c"), { size: 11, weight: 700, fill: ACCENT, anchor: "end" }));

  // ── 가지4: R_load (v_o) ──
  w.push(line(C_X, TOP, RL_X, TOP));
  vResistor(s, RL_X, TOP + 16, BOT - 16);
  w.push(line(RL_X, TOP, RL_X, TOP + 16));
  w.push(line(RL_X, BOT - 16, RL_X, BOT));
  s.push(dot(C_X, TOP));
  t.push(text(RL_X + 14, (TOP + BOT) / 2 - 8, d.rlLabel ?? "R_L", { size: 11, weight: 600, anchor: "start" }));
  t.push(text(RL_X + 14, (TOP + BOT) / 2 + 10, d.voLabel ?? "v_o", { size: 11, weight: 700, fill: RED, anchor: "start" }));

  t.push(text(W / 2, H - 8, "t=0 스위치 개방 — t<0 DC정상상태로 v_c(0⁻), t≥0 C∥R_load 방전으로 v_o(t)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─── 심볼 ───────────────────────────────────────
function dcSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 20;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">+</text>` +
    `<text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">−</text>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function currentSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 20;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${cy - 11}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<path d="M${cx - 4},${cy - 5} L${cx},${cy - 12} L${cx + 4},${cy - 5}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function capacitor(out: string[], x: number, y1: number, y2: number): void {
  const cy = (y1 + y2) / 2, g = 6, pw = 13;
  out.push(
    `<line x1="${x - pw}" y1="${cy - g}" x2="${x + pw}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${x - pw}" y1="${cy + g}" x2="${x + pw}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x}" y1="${cy + g}" x2="${x}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`,
  );
}
function vInductor(out: string[], x: number, y1: number, y2: number): void {
  const n = 4, r = (y2 - y1) / (n * 2);
  let p = `M${x},${y1}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${x},${y1 + r * (2 * i + 2)}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
}
function vResistor(out: string[], x: number, y1: number, y2: number): void {
  const a = 7, teeth = 6, step = (y2 - y1) / teeth;
  let p = `M${x},${y1}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${y1 + step * (i + 0.5)}`;
  p += ` L${x},${y2}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
function hResistor(out: string[], x1: number, x2: number, y: number): void {
  const a = 7, teeth = 6, step = (x2 - x1) / teeth;
  let p = `M${x1},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${x1 + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${x2},${y}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
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
