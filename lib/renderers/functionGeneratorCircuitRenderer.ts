import type { FunctionGeneratorCircuitDiagram } from "@/types";

/**
 * 비정현파 발진기(함수발생기) 전용 fixed-slot 렌더러 (임용 29번).
 *
 *  (가) 슈미트 비교기(U₁): (−)→GND, (+)= 마디 J. 출력 = (가) 구형파.
 *  분압: (가) ─R₂─ J ─R₃─ (나), J → U₁(+).  [문턱 V+=0 → (나)=−(R₃/R₂)(가)]
 *  R₁: (가) → U₂(−) 적분기. (나) 적분기(U₂): C 피드백, (+)→GND. 출력 = (나) 삼각파.
 */

const STROKE = "#111827";
const WIRE_W = 2;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const SVG_W = 720;
const SVG_H = 400;

const CY = 165;
const U1_CX = 190;
const U2_CX = 480;
const GA_X = 275;   // (가) 노드
const J_Y = 300;    // 분압 마디 J
const NA_X = 560;   // (나) 노드
const OUT_X = 615;  // (나) 출력 단자
const FB_Y = 95;    // 적분기 C 피드백 lane

type D = FunctionGeneratorCircuitDiagram;

export function renderFunctionGenerator(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  const p1 = pins(U1_CX, CY); // U₁ 비교기
  const p2 = pins(U2_CX, CY); // U₂ 적분기

  // ── U₁ 비교기 ──
  s.push(opamp(U1_CX, CY, "U₁"));
  // (−) → GND
  w.push(line(p1.minus.x, p1.minus.y, 110, p1.minus.y));
  w.push(line(110, p1.minus.y, 110, 232));
  s.push(ground(110, 232));
  // 출력 → (가) 노드
  w.push(line(p1.out.x, p1.out.y, GA_X, CY));
  s.push(dot(GA_X, CY));
  t.push(text(GA_X, CY - 18, d.gaLabel ?? "(가)", { size: 14, weight: 700, fill: RED }));

  // ── R₁: (가) → U₂(−) 적분기 입력 ──
  w.push(line(GA_X, CY, GA_X + 30, CY));
  hResistor(s, GA_X + 30, GA_X + 100, CY);
  t.push(text(GA_X + 65, CY - 10, d.r1Label ?? "R₁", { size: 11, weight: 600 }));
  w.push(line(GA_X + 100, CY, 420, CY));
  w.push(line(420, CY, 420, p2.minus.y));
  w.push(line(420, p2.minus.y, p2.minus.x, p2.minus.y));

  // ── R₂: (가) → 마디 J (세로) ──
  w.push(line(GA_X, CY, GA_X, CY + 25));
  vResistor(s, GA_X, CY + 25, J_Y - 30);
  w.push(line(GA_X, J_Y - 30, GA_X, J_Y));
  s.push(dot(GA_X, J_Y));
  t.push(text(GA_X + 14, (CY + J_Y) / 2, d.r2Label ?? "R₂", { size: 11, weight: 600, anchor: "start" }));
  t.push(text(GA_X - 8, J_Y + 4, "J", { size: 10, weight: 700, fill: MUTED, anchor: "end" }));

  // ── J → U₁(+) ──
  w.push(line(p1.plus.x, p1.plus.y, 135, p1.plus.y));
  w.push(line(135, p1.plus.y, 135, J_Y));
  w.push(line(135, J_Y, GA_X, J_Y));

  // ── R₃: 마디 J → (나) (가로 후 상승) ──
  w.push(line(GA_X, J_Y, GA_X + 30, J_Y));
  hResistor(s, GA_X + 30, GA_X + 180, J_Y);
  t.push(text(GA_X + 105, J_Y - 10, d.r3Label ?? "R₃", { size: 11, weight: 600 }));
  w.push(line(GA_X + 180, J_Y, OUT_X, J_Y));
  w.push(line(OUT_X, J_Y, OUT_X, CY));

  // ── U₂ 적분기 ──
  s.push(opamp(U2_CX, CY, "U₂"));
  // C 피드백 (−) → 위 → C → (나)
  w.push(line(p2.minus.x, p2.minus.y, p2.minus.x, FB_Y));
  hCap(s, p2.minus.x + 20, NA_X - 20, FB_Y);
  w.push(line(p2.minus.x, FB_Y, p2.minus.x + 20, FB_Y));
  w.push(line(NA_X - 20, FB_Y, NA_X, FB_Y));
  w.push(line(NA_X, FB_Y, NA_X, CY));
  t.push(text((p2.minus.x + NA_X) / 2, FB_Y - 10, d.cLabel ?? "C", { size: 11, weight: 600 }));
  // (+) → GND
  w.push(line(p2.plus.x, p2.plus.y, 425, p2.plus.y));
  w.push(line(425, p2.plus.y, 425, 232));
  s.push(ground(425, 232));
  // 출력 → (나) 노드 → 단자
  w.push(line(p2.out.x, p2.out.y, NA_X, CY));
  s.push(dot(NA_X, CY));
  w.push(line(NA_X, CY, OUT_X, CY));
  s.push(dot(OUT_X, CY));
  t.push(text(OUT_X + 8, CY + 4, d.naLabel ?? "(나)", { size: 14, weight: 700, fill: RED, anchor: "start" }));

  t.push(text(SVG_W / 2, SVG_H - 10, "비정현파 발진기: (가) 비교기(구형파) + (나) 적분기(삼각파), R₂·R₃ 분압 피드백", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

// ─── 심볼 ───────────────────────────────────────
function pins(cx: number, cy: number) {
  return { minus: { x: cx - 30, y: cy - 12 }, plus: { x: cx - 30, y: cy + 12 }, out: { x: cx + 30, y: cy } };
}
function opamp(cx: number, cy: number, label: string): string {
  const tri = `<polygon points="${cx - 30},${cy - 24} ${cx - 30},${cy + 24} ${cx + 30},${cy}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const minus = `<text x="${cx - 22}" y="${cy - 8}" font-size="13" font-weight="700" fill="${STROKE}">−</text>`;
  const plus = `<text x="${cx - 22}" y="${cy + 16}" font-size="12" font-weight="700" fill="${STROKE}">+</text>`;
  const lab = `<text x="${cx - 4}" y="${cy - 28}" font-size="11" font-weight="700" fill="${MUTED}">${escapeSvg(label)}</text>`;
  return tri + minus + plus + lab;
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
function hCap(out: string[], x1: number, x2: number, y: number): void {
  const xm = (x1 + x2) / 2, gap = 5, plate = 13;
  out.push(line(x1, y, xm - gap, y));
  out.push(`<line x1="${xm - gap}" y1="${y - plate}" x2="${xm - gap}" y2="${y + plate}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  out.push(`<line x1="${xm + gap}" y1="${y - plate}" x2="${xm + gap}" y2="${y + plate}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  out.push(line(xm + gap, y, x2, y));
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
