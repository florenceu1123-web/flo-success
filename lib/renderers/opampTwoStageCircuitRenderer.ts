import type { OpampTwoStageCircuitDiagram } from "@/types";

/**
 * 2단 OPAMP 응용회로 (임용 2번) 전용 fixed-slot 렌더러.
 *
 *  V_i[좌측 세로] → 1단 비반전 OPAMP(U₁: V_i→+, Rg1→GND, Rf1 피드백) → V_P
 *    → Rin2 → 2단 반전 OPAMP(U₂: −입력, Rf2 피드백, +→GND) → V_o.
 */

const STROKE = "#111827";
const WIRE_W = 2;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const SVG_W = 760;
const SVG_H = 360;

const VI_X = 60;
const U1_CX = 250;
const U2_CX = 540;
const MID_Y = 185;
const FB_Y = 95;       // 피드백 상단 lane
const GND_Y = 300;
const VP_X = U1_CX + 38 + 26;

type D = OpampTwoStageCircuitDiagram;

export function renderOpampTwoStage(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  const p1 = opampPins(U1_CX, MID_Y);
  const p2 = opampPins(U2_CX, MID_Y);

  // ── V_i 전원 (좌측 세로) — 상단 단자를 op1 (+)입력 높이에 맞춰 위로 삐친 stub 제거 ──
  s.push(acSource(VI_X, p1.plus.y, GND_Y));
  t.push(text(VI_X - 28, (p1.plus.y + GND_Y) / 2, d.viLabel ?? "v_i", { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  // V_i top → U₁ (+)입력 (비반전) — 수평 도선만
  w.push(line(VI_X, p1.plus.y, p1.plus.x, p1.plus.y));

  // ── U₁ 비반전: (−)입력 → Rg1 → GND, Rf1 피드백(−→출력) ──
  s.push(opamp(U1_CX, MID_Y, "U₁"));
  // (−) stub 좌측
  w.push(line(p1.minus.x, p1.minus.y, p1.minus.x - 40, p1.minus.y));
  const negNodeX = p1.minus.x - 40;
  s.push(dot(negNodeX, p1.minus.y));
  // Rg1: (−) → 아래 → GND
  w.push(line(negNodeX, p1.minus.y, negNodeX, MID_Y + 60));
  vResistor(s, negNodeX, MID_Y + 60, GND_Y - 16);
  w.push(line(negNodeX, GND_Y - 16, negNodeX, GND_Y));
  s.push(ground(negNodeX, GND_Y));
  t.push(text(negNodeX - 12, (MID_Y + 60 + GND_Y) / 2, d.rg1Label ?? "Rg1", { anchor: "end", size: 11, weight: 600 }));
  // Rf1: (−) → 위 → Rf1 → 출력
  w.push(line(negNodeX, p1.minus.y, negNodeX, FB_Y));
  hResistor(s, negNodeX, VP_X, FB_Y);
  w.push(line(VP_X, FB_Y, VP_X, p1.out.y));
  t.push(text((negNodeX + VP_X) / 2, FB_Y - 8, d.rf1Label ?? "Rf1", { size: 11, weight: 600 }));
  // 출력 → V_P node
  w.push(line(p1.out.x, p1.out.y, VP_X, p1.out.y));
  s.push(dot(VP_X, p1.out.y));
  t.push(text(VP_X + 6, p1.out.y - 8, d.vpLabel ?? "V_P", { size: 13, weight: 700, fill: RED, anchor: "start" }));

  // ── V_P → Ra → 마디 N → Rb → U₂ (−)입력 (T자 피드백 반전, 직렬 입력저항 2개) ──
  const y = p1.out.y;
  const RA_L = VP_X + 18, RA_R = RA_L + 50;
  const N_X = RA_R + 16;                  // 두 저항 사이 마디 N
  const RB_L = N_X + 16, RB_R = RB_L + 50;
  const JOG_X = p2.minus.x - 20;
  w.push(line(VP_X, y, RA_L, y));         // V_P → Ra
  hResistor(s, RA_L, RA_R, y);
  t.push(text((RA_L + RA_R) / 2, y - 8, d.rin2aLabel ?? "Ra", { size: 11, weight: 600 }));
  w.push(line(RA_R, y, N_X, y));          // Ra → N
  s.push(dot(N_X, y));
  t.push(text(N_X, y + 16, "N", { size: 10, weight: 700, fill: MUTED }));
  w.push(line(N_X, y, RB_L, y));          // N → Rb
  hResistor(s, RB_L, RB_R, y);
  t.push(text((RB_L + RB_R) / 2, y - 8, d.rin2bLabel ?? "Rb", { size: 11, weight: 600 }));
  w.push(line(RB_R, y, JOG_X, y));        // Rb → jog
  w.push(line(JOG_X, y, JOG_X, p2.minus.y));
  w.push(line(JOG_X, p2.minus.y, p2.minus.x, p2.minus.y)); // → op2 (−)

  // ── U₂ 반전: Rf2 피드백(−→출력), (+)→GND ──
  s.push(opamp(U2_CX, MID_Y, "U₂"));
  // Rf2: (−) → 위 → Rf2 → 출력
  const u2OutX = p2.out.x + 30;
  w.push(line(p2.minus.x, p2.minus.y, p2.minus.x, FB_Y));
  hResistor(s, p2.minus.x, u2OutX, FB_Y);
  w.push(line(u2OutX, FB_Y, u2OutX, p2.out.y));
  t.push(text((p2.minus.x + u2OutX) / 2, FB_Y - 8, d.rf2Label ?? "Rf2", { size: 11, weight: 600 }));
  // (+) → GND
  w.push(line(p2.plus.x, p2.plus.y, p2.plus.x - 24, p2.plus.y));
  w.push(line(p2.plus.x - 24, p2.plus.y, p2.plus.x - 24, p2.plus.y + 28));
  s.push(ground(p2.plus.x - 24, p2.plus.y + 28));
  // 출력 → V_o
  w.push(line(p2.out.x, p2.out.y, u2OutX, p2.out.y));
  s.push(dot(u2OutX, p2.out.y));
  w.push(line(u2OutX, p2.out.y, u2OutX + 40, p2.out.y));
  t.push(text(u2OutX + 46, p2.out.y + 5, d.voLabel ?? "V_o", { size: 14, weight: 700, fill: RED, anchor: "start" }));

  // ── Rf3: 마디 N ↔ V_o (T자 피드백). ★ Rf2(FB_Y)보다 위쪽 lane ★ 에 그린다. ──
  const RF3_Y = FB_Y - 36;            // Rf2(95)보다 위(59)
  const rf3L = N_X + 24, rf3R = u2OutX - 6;
  const VO_DESC_X = u2OutX + 16;       // V_o 합류는 출력도선 위(겹침 회피)
  w.push(line(N_X, p1.out.y, N_X, RF3_Y));   // N → 최상단으로
  w.push(line(N_X, RF3_Y, rf3L, RF3_Y));
  hResistor(s, rf3L, rf3R, RF3_Y);
  w.push(line(rf3R, RF3_Y, VO_DESC_X, RF3_Y));
  w.push(line(VO_DESC_X, RF3_Y, VO_DESC_X, p2.out.y)); // 우측으로 내려와
  w.push(line(VO_DESC_X, p2.out.y, u2OutX, p2.out.y)); // V_o 출력도선에 합류
  s.push(dot(VO_DESC_X, p2.out.y));
  t.push(text((rf3L + rf3R) / 2, RF3_Y - 8, d.rf3Label ?? "Rf3", { size: 11, weight: 600 }));
  t.push(text((rf3L + rf3R) / 2, RF3_Y + 14, "Rf3 (N–V_o)", { size: 9, fill: MUTED }));

  t.push(text(SVG_W / 2, SVG_H - 8, "2단 OPAMP — 1단 비반전(×A₁) → V_P → 2단 반전(×−A₂) → V_o", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

// ─── 심볼 ───────────────────────────────────────
function opampPins(cx: number, cy: number) {
  return {
    minus: { x: cx - 30, y: cy - 12 },
    plus: { x: cx - 30, y: cy + 12 },
    out: { x: cx + 30, y: cy },
  };
}
function opamp(cx: number, cy: number, label: string): string {
  const tri = `<polygon points="${cx - 30},${cy - 24 } ${cx - 30},${cy + 24} ${cx + 30},${cy}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const minus = `<text x="${cx - 22}" y="${cy - 8}" font-size="13" font-weight="700" fill="${STROKE}">−</text>`;
  const plus = `<text x="${cx - 22}" y="${cy + 16}" font-size="12" font-weight="700" fill="${STROKE}">+</text>`;
  const lab = `<text x="${cx - 4}" y="${cy - 28}" font-size="11" font-weight="700" fill="${MUTED}">${escapeSvg(label)}</text>`;
  return tri + minus + plus + lab;
}
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  const sine = `<path d="M${cx - 12},${cy} Q${cx - 6},${cy - 8} ${cx},${cy} T${cx + 12},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    ground(cx, botY);
}
function hResistor(out: string[], x1: number, x2: number, y: number): void {
  const a = 7, lead = 6, teeth = 6, b1 = x1 + lead, b2 = x2 - lead, step = (b2 - b1) / teeth;
  let p = `M${x1},${y} L${b1},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${b1 + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${b2},${y} L${x2},${y}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
function vResistor(out: string[], x: number, y1: number, y2: number): void {
  const a = 7, lead = 6, teeth = 6, b1 = y1 + lead, b2 = y2 - lead, step = (b2 - b1) / teeth;
  let p = `M${x},${y1} L${x},${b1}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${b1 + step * (i + 0.5)}`;
  p += ` L${x},${b2} L${x},${y2}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
function ground(cx: number, y: number): string {
  return `<line x1="${cx - 12}" y1="${y}" x2="${cx + 12}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 7}" y1="${y + 5}" x2="${cx + 7}" y2="${y + 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 3}" y1="${y + 10}" x2="${cx + 3}" y2="${y + 10}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3" fill="${STROKE}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function text(x: number, y: number, str: string, opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${opts.anchor ?? "middle"}" font-size="${opts.size ?? 12}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? STROKE}">${escapeSvg(str)}</text>`;
}
function escapeSvg(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
