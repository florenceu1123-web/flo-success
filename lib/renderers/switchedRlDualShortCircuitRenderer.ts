import type { SwitchedRlDualShortCircuitDiagram } from "@/types";
import { switchH, switchV } from "./_switchSymbol";

/**
 * 임용 17번 전용 fixed-slot 렌더러 — 전류원 구동 RL, 스위치 2개가 t=0에 소자를 단락.
 *
 *  원본 배치 그대로:
 *    하단 rail(접지) 위에
 *      · 좌: 전류원 I_s(↑)
 *      · 마디 A: 세로 R_a
 *      · A ─ B : 위쪽에 **SW₁**, 아래쪽에 **R_b** (병렬 — 닫히면 R_b 단락)
 *      · B 아래: 왼쪽 **SW₂** ∥ 오른쪽 **L₁** (닫히면 L₁ 단락) → 마디 C → R_c → 접지
 *      · 우: L₂ (측정 대상, i(t)↓ 또는 v(t) 극성)
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const DOT_R = 3.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const SVG_W = 900;
const SVG_H = 480;

const Y_TOP = 128;    // SW₁ 레인
const Y_MAIN = 248;   // A—B 주 레인
const Y_PAIR_T = 300; // SW₂∥L₁ 상단
const Y_PAIR_B = 372; // SW₂∥L₁ 하단 (= 마디 C)
const Y_BOT = 432;    // 접지 rail

const X_SRC = 96;
const X_A = 246;
const X_SW1 = 400;    // SW₁·R_b 가로 중앙
const X_B = 556;
const X_SW2 = 452;
const X_L2 = 780;

type D = SwitchedRlDualShortCircuitDiagram;

export function renderSwitchedRlDualShortCircuit(d: D): string {
  if (!d?.sourceLabel) return emptySvg("invalid switched_rl_dual_short diagram");
  const measure = d.measure ?? "current";
  const mLabel = d.measureLabel ?? (measure === "current" ? "i(t)" : "v(t)");
  const tLabel = d.switchTimeLabel ?? "t=0";
  // ★ 스위치 동작 방향을 화살표로 표시한다(공용 규칙) — 이 유형은 "개방 상태를 유지한 후 닫힘".
  const action = d.switchAction ?? "closing";

  const wires: string[] = [];
  const dots: string[] = [];
  const symbols: string[] = [];
  const labels: string[] = [];

  // ── 접지 rail ───────────────────────────────
  wires.push(line(X_SRC, Y_BOT, X_L2, Y_BOT));
  symbols.push(groundSymbol((X_SRC + X_A) / 2, Y_BOT));

  // ── 전류원 ──────────────────────────────────
  symbols.push(currentSource(X_SRC, (Y_MAIN + Y_BOT) / 2));
  wires.push(line(X_SRC, Y_MAIN, X_SRC, (Y_MAIN + Y_BOT) / 2 - 26));
  wires.push(line(X_SRC, (Y_MAIN + Y_BOT) / 2 + 26, X_SRC, Y_BOT));
  labels.push(text(X_SRC - 34, (Y_MAIN + Y_BOT) / 2 + 5, d.sourceLabel, { size: 14, weight: 700, anchor: "end" }));
  wires.push(line(X_SRC, Y_MAIN, X_A, Y_MAIN));

  // ── 마디 A + 세로 R_a ───────────────────────
  dots.push(dot(X_A, Y_MAIN));
  symbols.push(resistorV(X_A, (Y_MAIN + Y_BOT) / 2));
  wires.push(line(X_A, Y_MAIN, X_A, (Y_MAIN + Y_BOT) / 2 - 26));
  wires.push(line(X_A, (Y_MAIN + Y_BOT) / 2 + 26, X_A, Y_BOT));
  labels.push(text(X_A + 20, (Y_MAIN + Y_BOT) / 2 + 5, d.raLabel, { size: 13, anchor: "start" }));

  // ── A ─ [SW₁ ∥ R_b] ─ B ─────────────────────
  // 위쪽 가지: SW₁
  wires.push(line(X_A, Y_MAIN, X_A, Y_TOP));
  wires.push(line(X_A, Y_TOP, X_SW1 - 30, Y_TOP));
  symbols.push(switchH(X_SW1, Y_TOP, 22, action));
  wires.push(line(X_SW1 + 30, Y_TOP, X_B, Y_TOP));
  wires.push(line(X_B, Y_TOP, X_B, Y_MAIN));
  labels.push(text(X_SW1, Y_TOP - 22, d.sw1Label ?? "SW₁", { size: 14, weight: 700 }));
  labels.push(text(X_SW1, Y_TOP + 28, tLabel, { size: 12, fill: MUTED }));
  // 아래쪽 가지: R_b (주 레인)
  symbols.push(resistorH(X_SW1, Y_MAIN));
  wires.push(line(X_A, Y_MAIN, X_SW1 - 26, Y_MAIN));
  wires.push(line(X_SW1 + 26, Y_MAIN, X_B, Y_MAIN));
  labels.push(text(X_SW1, Y_MAIN - 20, d.rbLabel, { size: 13 }));

  // ── 마디 B ──────────────────────────────────
  dots.push(dot(X_B, Y_MAIN));

  // ── B ─ [SW₂ ∥ L₁] ─ C ─ R_c ─ 접지 ─────────
  wires.push(line(X_B, Y_MAIN, X_B, Y_PAIR_T));
  dots.push(dot(X_B, Y_PAIR_T));
  // 오른쪽 가지: L₁ (B 열 그대로 내려감)
  symbols.push(inductorV(X_B, (Y_PAIR_T + Y_PAIR_B) / 2));
  wires.push(line(X_B, Y_PAIR_T, X_B, (Y_PAIR_T + Y_PAIR_B) / 2 - 24));
  wires.push(line(X_B, (Y_PAIR_T + Y_PAIR_B) / 2 + 24, X_B, Y_PAIR_B));
  labels.push(text(X_B + 20, (Y_PAIR_T + Y_PAIR_B) / 2 + 5, d.l1Label, { size: 13, anchor: "start" }));
  // 왼쪽 가지: SW₂
  wires.push(line(X_B, Y_PAIR_T, X_SW2, Y_PAIR_T));
  wires.push(line(X_SW2, Y_PAIR_T, X_SW2, (Y_PAIR_T + Y_PAIR_B) / 2 - 20));
  symbols.push(switchV(X_SW2, (Y_PAIR_T + Y_PAIR_B) / 2, 16, action));
  wires.push(line(X_SW2, (Y_PAIR_T + Y_PAIR_B) / 2 + 20, X_SW2, Y_PAIR_B));
  wires.push(line(X_SW2, Y_PAIR_B, X_B, Y_PAIR_B));
  labels.push(text(X_SW2 - 16, (Y_PAIR_T + Y_PAIR_B) / 2 - 6, d.sw2Label ?? "SW₂", { size: 14, weight: 700, anchor: "end" }));
  labels.push(text(X_SW2 - 16, (Y_PAIR_T + Y_PAIR_B) / 2 + 12, tLabel, { size: 12, fill: MUTED, anchor: "end" }));
  // 마디 C → R_c → 접지
  dots.push(dot(X_B, Y_PAIR_B));
  symbols.push(resistorV(X_B, (Y_PAIR_B + Y_BOT) / 2));
  wires.push(line(X_B, Y_PAIR_B, X_B, (Y_PAIR_B + Y_BOT) / 2 - 26));
  wires.push(line(X_B, (Y_PAIR_B + Y_BOT) / 2 + 26, X_B, Y_BOT));
  labels.push(text(X_B + 20, (Y_PAIR_B + Y_BOT) / 2 + 5, d.rcLabel, { size: 13, anchor: "start" }));

  // ── L₂ (측정 대상) ──────────────────────────
  wires.push(line(X_B, Y_MAIN, X_L2, Y_MAIN));
  symbols.push(inductorV(X_L2, (Y_MAIN + Y_BOT) / 2));
  wires.push(line(X_L2, Y_MAIN, X_L2, (Y_MAIN + Y_BOT) / 2 - 30));
  wires.push(line(X_L2, (Y_MAIN + Y_BOT) / 2 + 30, X_L2, Y_BOT));
  labels.push(text(X_L2 + 20, (Y_MAIN + Y_BOT) / 2 + 5, d.l2Label, { size: 14, weight: 700, anchor: "start" }));

  if (measure === "current") {
    // i(t) 아래 방향 화살표 (원본 표기)
    const ax = X_L2 - 40;
    symbols.push(arrowDown(ax, Y_MAIN + 28, Y_MAIN + 76));
    labels.push(text(ax - 8, Y_MAIN + 56, mLabel, { size: 14, weight: 700, fill: ACCENT, anchor: "end" }));
  } else {
    // v(t) 양단 극성 (+ 위 / − 아래)
    const px = X_L2 - 36;
    labels.push(text(px, (Y_MAIN + Y_BOT) / 2 - 30, "+", { size: 16, weight: 700, fill: ACCENT }));
    labels.push(text(px, (Y_MAIN + Y_BOT) / 2 + 40, "−", { size: 16, weight: 700, fill: ACCENT }));
    labels.push(text(px - 12, (Y_MAIN + Y_BOT) / 2 + 6, mLabel, { size: 14, weight: 700, fill: ACCENT, anchor: "end" }));
  }

  if (d.caption) labels.push(text(SVG_W / 2, SVG_H - 12, d.caption, { size: 11, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[
    ...wires, ...dots, ...symbols, ...labels,
  ].join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────
function currentSource(cx: number, cy: number): string {
  const r = 26;
  const circ = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const shaft = `<line x1="${cx}" y1="${cy + 15}" x2="${cx}" y2="${cy - 13}" stroke="${STROKE}" stroke-width="2"/>`;
  const head = `<polygon points="${cx},${cy - 19} ${cx - 5},${cy - 8} ${cx + 5},${cy - 8}" fill="${STROKE}"/>`;
  return circ + shaft + head;
}

/** 세로 저항 (지그재그). 중심 cy, 반높이 26. */
function resistorV(cx: number, cy: number): string {
  const h = 26, w = 9;
  let p = `M${cx},${cy - h}`;
  for (let i = 0; i < 6; i++) {
    const y = cy - h + ((i + 1) * 2 * h) / 7;
    p += ` L${cx + (i % 2 === 0 ? w : -w)},${y}`;
  }
  p += ` L${cx},${cy + h}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

/** 가로 저항 (지그재그). 중심 cx, 반너비 26. */
function resistorH(cx: number, cy: number): string {
  const w = 26, h = 9;
  let p = `M${cx - w},${cy}`;
  for (let i = 0; i < 6; i++) {
    const x = cx - w + ((i + 1) * 2 * w) / 7;
    p += ` L${x},${cy + (i % 2 === 0 ? -h : h)}`;
  }
  p += ` L${cx + w},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

/** 세로 인덕터 (코일 4개). 중심 cy, 반높이 24~30. */
function inductorV(cx: number, cy: number): string {
  const n = 4, r = 8;
  const top = cy - n * r;
  let p = `M${cx},${top}`;
  for (let i = 0; i < n; i++) {
    const y0 = top + i * 2 * r;
    p += ` A${r},${r} 0 0 1 ${cx},${y0 + 2 * r}`;
  }
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}


function arrowDown(x: number, y1: number, y2: number): string {
  return (
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 8}" stroke="${ACCENT}" stroke-width="2"/>` +
    `<polygon points="${x},${y2} ${x - 5},${y2 - 10} ${x + 5},${y2 - 10}" fill="${ACCENT}"/>`
  );
}

function groundSymbol(cx: number, cy: number): string {
  return (
    `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 15}" y1="${cy + 12}" x2="${cx + 15}" y2="${cy + 12}" stroke="${STROKE}" stroke-width="2"/>` +
    `<line x1="${cx - 9}" y1="${cy + 18}" x2="${cx + 9}" y2="${cy + 18}" stroke="${STROKE}" stroke-width="2"/>` +
    `<line x1="${cx - 4}" y1="${cy + 24}" x2="${cx + 4}" y2="${cy + 24}" stroke="${STROKE}" stroke-width="2"/>`
  );
}

// ─── primitives ──────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}

function text(
  x: number,
  y: number,
  s: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  const size = opts.size ?? 12;
  const weight = opts.weight ?? 400;
  const anchor = opts.anchor ?? "middle";
  const fill = opts.fill ?? STROKE;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeSvg(s)}</text>`;
}

function escapeSvg(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} 64"><text x="${SVG_W / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${escapeSvg(msg)}</text></svg>`;
}
