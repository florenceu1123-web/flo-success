import type { DcTwoSourceLadderCircuitDiagram } from "@/types";

/**
 * 전압원 + 전류원 DC 사다리 전용 fixed-slot 렌더러 (임용 3번 회로이론) — **원본 배치 그대로**.
 *
 *      ┌──[R_a]──●M──[R_b]──┐          ← 상단 rail (R_a에 I₁ →)
 *      │          │          │
 *    (V_s)      [R_c]      (I_s ↑)
 *      │          │          │
 *      │         ●N          │
 *      │      [R_d][R_e]     │          ← 병렬 뱅크 (R_e에 I₂ ↓)
 *      └──────────┴──────────┘          ← 하단 rail(접지)
 *
 * ★ generic netlist 렌더러는 "hub + 직렬 pendant leg"를 세로 체인으로 접어 그려
 *   원본 사다리와 전혀 다르게 보였다(사용자 신고 2회) → 고정 슬롯으로 원본 배치를 고정한다.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderDcTwoSourceLadderCircuit(d: DcTwoSourceLadderCircuitDiagram): string {
  const W = 640, H = 420;
  const xL = 110, xM = 300, xR = 520;     // 좌측 전원 leg / 가운데 마디 / 우측 전류원 leg
  const yTop = 90, yBot = 350;            // 상단 rail / 하단 rail
  const yN = 235;                          // 마디 N (병렬 뱅크 상단)
  const xD = 258, xE = 342;                // 병렬 뱅크 두 가지
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 상단 rail: 좌 —R_a— M —R_b— 우 ─────────────────────────────
  const xRa = (xL + xM) / 2, xRb = (xM + xR) / 2;
  w.push(line(xL, yTop, xRa - 26, yTop));
  s.push(resistorH(xRa, yTop));
  t.push(text(xRa, yTop - 16, d.raLabel, { size: 12, weight: 600 }));
  w.push(line(xRa + 26, yTop, xM, yTop));
  w.push(line(xM, yTop, xRb - 26, yTop));
  s.push(resistorH(xRb, yTop));
  t.push(text(xRb, yTop - 16, d.rbLabel, { size: 12, weight: 600 }));
  w.push(line(xRb + 26, yTop, xR, yTop));
  s.push(dot(xM, yTop));

  // ── 좌측: 전압원 leg ───────────────────────────────────────────
  const yVs = (yTop + yBot) / 2;
  w.push(line(xL, yTop, xL, yVs - 22));
  s.push(dcSource(xL, yVs));
  w.push(line(xL, yVs + 22, xL, yBot));
  t.push(text(xL - 30, yVs + 4, d.vsLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // ── 우측: 전류원 leg (↑) ───────────────────────────────────────
  w.push(line(xR, yTop, xR, yVs - 22));
  s.push(currentSource(xR, yVs));
  w.push(line(xR, yVs + 22, xR, yBot));
  t.push(text(xR + 30, yVs + 4, d.isLabel, { anchor: "start", size: 12, weight: 700, fill: ACCENT }));

  // ── 마디 M 아래: R_c → 마디 N ──────────────────────────────────
  const yRc = (yTop + yN) / 2;
  w.push(line(xM, yTop, xM, yRc - 26));
  s.push(resistorV(xM, yRc));
  t.push(text(xM + 18, yRc + 4, d.rcLabel, { anchor: "start", size: 12, weight: 600 }));
  w.push(line(xM, yRc + 26, xM, yN));
  s.push(dot(xM, yN));

  // ── 병렬 뱅크 R_d ∥ R_e ────────────────────────────────────────
  w.push(line(xD, yN, xE, yN));
  const yRde = (yN + yBot) / 2;
  for (const [x, label] of [[xD, d.rdLabel], [xE, d.reLabel]] as Array<[number, string]>) {
    w.push(line(x, yN, x, yRde - 26));
    s.push(resistorV(x, yRde));
    w.push(line(x, yRde + 26, x, yBot));
  }
  t.push(text(xD - 18, yRde + 4, d.rdLabel, { anchor: "end", size: 12, weight: 600 }));
  t.push(text(xE + 18, yRde + 4, d.reLabel, { anchor: "start", size: 12, weight: 600 }));

  // ── 하단 rail + 접지 ───────────────────────────────────────────
  w.push(line(xL, yBot, xR, yBot));
  s.push(dot(xD, yBot), dot(xE, yBot));
  s.push(gnd(xM, yBot));

  // ── 측정 전류 화살표 ───────────────────────────────────────────
  //   유사: I₁ = R_a(가로, →), I₂ = R_e(세로, ↓) / 변형: I₁ = R_c(세로, ↓), I₂ = R_d(세로, ↓)
  if (d.i1On === "Ra") {
    s.push(arrowRight(xRa - 16, xRa + 18, yTop + 22));
    t.push(text(xRa, yTop + 40, d.i1Label, { size: 12, weight: 700, fill: RED }));
  } else {
    s.push(arrowDown(xM - 22, yRc - 18, yRc + 16));
    t.push(text(xM - 30, yRc + 4, d.i1Label, { anchor: "end", size: 12, weight: 700, fill: RED }));
  }
  const i2x = d.i2On === "Re" ? xE : xD;
  s.push(arrowDown(i2x + (d.i2On === "Re" ? -20 : 20), yRde - 18, yRde + 16));
  t.push(text(i2x + (d.i2On === "Re" ? -28 : 28), yRde - 22,
    d.i2Label, { anchor: d.i2On === "Re" ? "end" : "start", size: 12, weight: 700, fill: RED }));

  t.push(text(W / 2, H - 12, "전압원·전류원이 함께 있는 직류 회로 — 마디 해석(KCL)으로 각 전류를 구한다",
    { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
function dcSource(cx: number, cy: number): string {
  const r = 22;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="17" font-weight="700" fill="${RED}">−</text>`;
}
function currentSource(cx: number, cy: number): string {
  const r = 22;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 8}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<path d="M${cx - 5},${cy - 6} L${cx},${cy - 14} L${cx + 5},${cy - 6} Z" fill="${STROKE}"/>`;
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
function gnd(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 14}" y1="${y + 16}" x2="${x + 14}" y2="${y + 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 8}" y1="${y + 22}" x2="${x + 8}" y2="${y + 22}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 3}" y1="${y + 28}" x2="${x + 3}" y2="${y + 28}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function arrowRight(x1: number, x2: number, y: number): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2 - 7}" y2="${y}" stroke="${RED}" stroke-width="1.5"/>` +
    `<path d="M${x2 - 8},${y - 4} L${x2},${y} L${x2 - 8},${y + 4} Z" fill="${RED}"/>`;
}
function arrowDown(x: number, y1: number, y2: number): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 7}" stroke="${RED}" stroke-width="1.5"/>` +
    `<path d="M${x - 4},${y2 - 8} L${x},${y2} L${x + 4},${y2 - 8} Z" fill="${RED}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;
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
