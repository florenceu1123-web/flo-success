import type { AcDcSuperpositionRcDualCircuitDiagram } from "@/types";

/**
 * AC+DC 중첩 RC 회로의 쌍대(dual) — RL + 전류원, 전압 측정 (기출변형유형).
 *
 *  쌍대 그래프 (D0=접지, D1·D2·D3 상단 노드):
 *    D1 ─[ i(t) 전류원 ∥ L ]─ D0          (좌측: 병렬 전류원·인덕터, ↔ v(t) 직렬 C)
 *    D1 ─ I_dc 전류원 ─ D2                 (상단 좌, ↔ 20V 전압원)
 *    D2 ─ R₅ ─ D0                          (중앙 세로, ↔ 직렬 R₅)
 *    D2 ─ R₃ ─ D3 ─ R₄ ─ D0               (상단 우 + 우측 세로, ↔ 병렬 R₃∥R₄)
 *    측정: v_ab (I_dc 양단), V_DC, V_R₄.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const DOT_R = 3.4;
const BLUE = "#1d4ed8";

const SVG_W = 700;
const SVG_H = 470;
const TOP = 95;
const BOT = 400;

const IX = 130;   // i(t) 전류원
const LXc = 220;  // L
const D2X = 380;  // D2 (R₅)
const D3X = 540;  // D3 (R₄)

type D = AcDcSuperpositionRcDualCircuitDiagram;

export function renderAcDcSuperpositionRcDualCircuit(d: D): string {
  const p: string[] = [];

  const IDC_X = (LXc + D2X) / 2; // I_dc 전류원 (D1 우측 LXc ↔ D2)
  // ── 도선 ──
  // D1 상단 세그먼트 (IX..LXc) + I_dc leads (LXc..IDC, IDC..D2X)
  p.push(line(IX, TOP, LXc, TOP));
  p.push(line(LXc, TOP, IDC_X - 22, TOP));
  p.push(line(IDC_X + 22, TOP, D2X, TOP));
  // i(t) leg
  p.push(line(IX, TOP, IX, 221));
  p.push(line(IX, 269, IX, BOT));
  // L leg
  p.push(line(LXc, TOP, LXc, 198));
  p.push(line(LXc, 292, LXc, BOT));
  // D2 세로 R₅
  p.push(line(D2X, TOP, D2X, 198));
  p.push(line(D2X, 292, D2X, BOT));
  // D2→D3 상단 (R₃)
  p.push(line(D2X, TOP, D3X, TOP));   // (지그재그가 가운데 덮음)
  // D3 세로 R₄
  p.push(line(D3X, TOP, D3X, 198));
  p.push(line(D3X, 292, D3X, BOT));
  // 하단 rail
  p.push(line(IX, BOT, D3X, BOT));

  // ── 심볼 ──
  p.push(currentSourceV(IX, 245));          // i(t) (세로, ↑)
  p.push(inductorV(LXc, 245));              // L
  p.push(currentSourceH((LXc + D2X) / 2, TOP)); // I_dc (상단 가로, →)
  p.push(zigzagV(D2X, 198, 292));          // R₅
  p.push(zigzagH(D2X, D3X, TOP));          // R₃
  p.push(zigzagV(D3X, 198, 292));          // R₄

  // ── 노드 dot ──
  p.push(dot(IX, TOP), dot(LXc, TOP), dot(D2X, TOP), dot(D3X, TOP));
  p.push(dot(IX, BOT), dot(LXc, BOT), dot(D2X, BOT), dot(D3X, BOT));

  // ── 측정/라벨 ──
  p.push(text(IX, TOP - 12, "a", { size: 15, weight: 700 }));
  p.push(text(D2X, TOP - 12, "b", { size: 15, weight: 700 }));
  // v_ab: I_dc 전류원 양단 (D1=a ↔ D2=b)
  p.push(text((IX + D2X) / 2, TOP - 30, d.vabLabel, { size: 14, fill: BLUE }));
  p.push(text(D2X + 14, 250, d.vdcLabel, { size: 13, fill: BLUE, anchor: "start" }));

  // 소자 값
  p.push(text(IX - 40, 245, "i(t)", { size: 14, weight: 600, anchor: "end" }));
  p.push(text(LXc + 16, 245, "L", { size: 14, weight: 700, anchor: "start" }));
  p.push(text(LXc + 16, 263, d.lLabel.replace("L=", ""), { size: 12, anchor: "start" }));
  p.push(text((IX + D2X) / 2, TOP + 22, `I_dc=${d.idcLabel}`, { size: 12 }));
  p.push(text(D2X - 14, 250, "R₅", { size: 13, weight: 700, anchor: "end" }));
  p.push(text(D2X - 14, 268, d.r5Label, { size: 12, anchor: "end" }));
  p.push(text((D2X + D3X) / 2, TOP - 12, "R₃", { size: 13, weight: 700 }));
  p.push(text((D2X + D3X) / 2, TOP + 20, d.r3Label, { size: 12 }));
  p.push(text(D3X + 14, 250, "R₄", { size: 13, weight: 700, anchor: "start" }));
  p.push(text(D3X + 14, 268, d.r4Label, { size: 12, anchor: "start" }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function currentSourceV(cx: number, cy: number): string {
  const r = 24;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<polygon points="${cx},${cy - 16} ${cx - 4},${cy - 8} ${cx + 4},${cy - 8}" fill="${STROKE}"/>`;
}
function currentSourceH(cx: number, cy: number): string {
  // 상단 가로 전류원 — D1(a)→D2(b) 방향(→)
  const r = 22;
  return `<rect x="${cx - r - 2}" y="${cy - r - 2}" width="${(r + 2) * 2}" height="${(r + 2) * 2}" fill="white" stroke="none"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 11}" y1="${cy}" x2="${cx + 11}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<polygon points="${cx + 15},${cy} ${cx + 7},${cy - 4} ${cx + 7},${cy + 4}" fill="${STROKE}"/>`;
}
function inductorV(cx: number, cy: number): string {
  // 세로 인덕터 — 4개 반원 코일
  const top = cy - 24, n = 4, step = 48 / n;
  let dpath = `M ${cx} ${top}`;
  for (let i = 0; i < n; i++) {
    const y0 = top + step * i;
    dpath += ` A 7 ${step / 2} 0 0 1 ${cx} ${y0 + step}`;
  }
  return `<path d="${dpath}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

const R_AMP = 8, R_TEETH = 6, R_PAD = 10;
function zigzagH(x0: number, x1: number, y: number): string {
  const xa = x0 + R_PAD, xb = x1 - R_PAD, seg = (xb - xa) / R_TEETH;
  const pts: Array<[number, number]> = [[x0, y], [xa, y]];
  for (let i = 0; i < R_TEETH; i++) pts.push([xa + seg * (i + 0.5), y + (i % 2 === 0 ? -R_AMP : R_AMP)]);
  pts.push([xb, y], [x1, y]);
  return `<rect x="${x0}" y="${y - R_AMP - 2}" width="${x1 - x0}" height="${(R_AMP + 2) * 2}" fill="white" stroke="none"/>` + polyline(pts);
}
function zigzagV(x: number, y0: number, y1: number): string {
  const ya = y0 + R_PAD, yb = y1 - R_PAD, seg = (yb - ya) / R_TEETH;
  const pts: Array<[number, number]> = [[x, y0], [x, ya]];
  for (let i = 0; i < R_TEETH; i++) pts.push([x + (i % 2 === 0 ? -R_AMP : R_AMP), ya + seg * (i + 0.5)]);
  pts.push([x, yb], [x, y1]);
  return polyline(pts);
}

// ─── primitives ──────────────────────────────────
function polyline(pts: Array<[number, number]>): string {
  return `<polyline points="${pts.map((q) => `${q[0]},${q[1]}`).join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}
function text(
  x: number, y: number, s: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  return `<text x="${x}" y="${y}" text-anchor="${opts.anchor ?? "middle"}" font-size="${opts.size ?? 13}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? STROKE}">${escapeSvg(s)}</text>`;
}
function escapeSvg(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
