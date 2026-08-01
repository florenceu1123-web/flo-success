import type { OpampFiniteGainCircuitDiagram } from "@/types";

/**
 * 연산증폭기 유한 개방루프 이득 회로 (임용 11번 (가)) 전용 fixed-slot 렌더러.
 *
 *  V_in[좌측 단자] ─ R₁ ─ V⁻(반전입력) ─ OPAMP A(s) ─ V_out.
 *    R₂: V_out → V⁻ 피드백(상단 lane).  V⁺ → GND.
 */

const STROKE = "#111827";
const WIRE_W = 2;
const RED = "#dc2626";
const MUTED = "#6b7280";
const ACCENT = "#1d4ed8";

const SVG_W = 620;
const SVG_H = 300;

const VIN_X = 60;
const OP_CX = 360;
const MID_Y = 165;
const FB_Y = 70;      // R₂ 피드백 상단 lane
const GND_Y = 250;

type D = OpampFiniteGainCircuitDiagram;

export function renderOpampFiniteGainCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  const p = opampPins(OP_CX, MID_Y);

  // ── V_in 외부 입력 단자 (전압원 박스 없이, 원본과 동일) ──
  s.push(dot(VIN_X, p.minus.y));
  t.push(text(VIN_X - 8, p.minus.y + 5, d.vinLabel ?? "V_in", { anchor: "end", size: 13, weight: 700, fill: ACCENT }));

  // ── V_in ─ R₁ ─ V⁻ 노드 ──
  const R1_L = VIN_X + 24, R1_R = R1_L + 56;
  const VM_X = p.minus.x - 40;   // V⁻ 분기 노드(반전입력 좌측)
  w.push(line(VIN_X, p.minus.y, R1_L, p.minus.y));
  hResistor(s, R1_L, R1_R, p.minus.y);
  t.push(text((R1_L + R1_R) / 2, p.minus.y - 9, d.r1Label ?? "R₁", { size: 12, weight: 600 }));
  w.push(line(R1_R, p.minus.y, VM_X, p.minus.y));
  s.push(dot(VM_X, p.minus.y));
  t.push(text(VM_X - 4, p.minus.y + 18, "V⁻", { size: 12, weight: 700, fill: RED, anchor: "middle" }));
  w.push(line(VM_X, p.minus.y, p.minus.x, p.minus.y)); // V⁻ → op (−)

  // ── OPAMP A(s) ──
  s.push(opamp(OP_CX, MID_Y, d.asLabel ?? "A(s)"));

  // ── V⁺ → GND ──
  w.push(line(p.plus.x, p.plus.y, p.plus.x - 26, p.plus.y));
  w.push(line(p.plus.x - 26, p.plus.y, p.plus.x - 26, p.plus.y + 34));
  s.push(ground(p.plus.x - 26, p.plus.y + 34));

  // ── 출력 → V_out 단자 ──
  const VOUT_X = p.out.x + 70;
  w.push(line(p.out.x, p.out.y, VOUT_X, p.out.y));
  s.push(dot(VOUT_X, p.out.y));
  t.push(text(VOUT_X + 8, p.out.y + 5, d.voutLabel ?? "V_out", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  // ── R₂: V_out → 위 → R₂ → V⁻ (피드백) ──
  const OUT_NODE_X = p.out.x + 30;
  s.push(dot(OUT_NODE_X, p.out.y));
  w.push(line(OUT_NODE_X, p.out.y, OUT_NODE_X, FB_Y));
  const R2_R = OUT_NODE_X, R2_L = VM_X + 20;
  hResistor(s, R2_L, R2_R, FB_Y);
  t.push(text((R2_L + R2_R) / 2, FB_Y - 9, d.r2Label ?? "R₂", { size: 12, weight: 600 }));
  w.push(line(R2_L, FB_Y, VM_X, FB_Y));
  w.push(line(VM_X, FB_Y, VM_X, p.minus.y)); // 피드백 → V⁻ 노드

  t.push(text(SVG_W / 2, SVG_H - 10, "유한 개방루프 이득 A(s)=A₀ω₀/(s+ω₀) — V⁻은 가상접지(0)가 아닌 유한값", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

// ─── 심볼 ───────────────────────────────────────
function opampPins(cx: number, cy: number) {
  return {
    minus: { x: cx - 32, y: cy - 14 },
    plus: { x: cx - 32, y: cy + 14 },
    out: { x: cx + 34, y: cy },
  };
}
function opamp(cx: number, cy: number, label: string): string {
  const tri = `<polygon points="${cx - 32},${cy - 28} ${cx - 32},${cy + 28} ${cx + 34},${cy}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const minus = `<text x="${cx - 24}" y="${cy - 9}" font-size="13" font-weight="700" fill="${STROKE}">−</text>`;
  const plus = `<text x="${cx - 24}" y="${cy + 18}" font-size="12" font-weight="700" fill="${STROKE}">+</text>`;
  const lab = `<text x="${cx - 6}" y="${cy + 5}" font-size="12" font-weight="700" fill="${MUTED}">${escapeSvg(label)}</text>`;
  return tri + minus + plus + lab;
}
function hResistor(out: string[], x1: number, x2: number, y: number): void {
  const a = 7, lead = 6, teeth = 6, b1 = x1 + lead, b2 = x2 - lead, step = (b2 - b1) / teeth;
  let p = `M${x1},${y} L${b1},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${b1 + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${b2},${y} L${x2},${y}`;
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
