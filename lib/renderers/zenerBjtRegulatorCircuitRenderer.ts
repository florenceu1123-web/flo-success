import type { ZenerBjtRegulatorCircuitDiagram } from "@/types";

/**
 * 제너다이오드 + BJT 전압 레귤레이터 (임용 8번) 전용 fixed-slot 렌더러.
 *
 *        I_1→
 *  20V+ ─R1─ A ───────┬───────────── V_o (출력 단자)
 *   │       │         │ R2            │
 *   │     Zener     (베이스 기준)    R3 ∥ R4   (부하, I_L↓)
 *   │     (V_z)     NPN BJT           │
 *   │       │       (포화)            │
 *  GND ─────┴────────┴───────────────┴─ GND
 *
 *  ★ 션트 레귤레이터: V_o 노드에 제너+BJT가 걸려 V_o=V_z+V_BE 로 안정화.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const DOT_R = 3.4;
const BLUE = "#1d4ed8";
const RED = "#dc2626";

const SVG_W = 760;
const SVG_H = 470;

const TOP = 90;       // 상단 rail
const BOT = 410;      // 하단 rail (GND)
const VX = 75;        // 20V leg
const R1L = 130, R1R = 235;  // R1 (상단)
const AX = 275;       // 마디 A
const R2X = 400;      // R2 (수직, 베이스 기준)
const QX = 470;       // BJT collector/emitter leg
const VOX = 645;      // V_o 출력 단자
const R3X = 600, R4X = 645;  // R3 ∥ R4 (부하)

type D = ZenerBjtRegulatorCircuitDiagram;

export function renderZenerBjtRegulatorCircuit(d: D): string {
  const p: string[] = [];

  // ── 도선 ──
  // 상단 rail: V → R1 → A → (R2top) → (Qcol) → Vo
  p.push(line(VX, TOP, R1L, TOP));
  p.push(line(R1R, TOP, VOX, TOP));      // R1 우 → V_o (마디 A·R2·collector·부하 공통)
  // 20V leg
  p.push(line(VX, TOP, VX, 150));
  p.push(line(VX, 206, VX, BOT));
  // Zener leg (A → 제너 → GND)
  p.push(line(AX, TOP, AX, 210));
  p.push(line(AX, 270, AX, BOT));
  // R2 leg (상단 rail → 베이스 노드)
  p.push(line(R2X, TOP, R2X, 175));
  p.push(line(R2X, 245, R2X, 258));      // R2 하단 → 베이스 lead 시작
  // 베이스 lead (R2 하단 → BJT base bar)
  p.push(line(R2X, 258, QX - 18, 258));
  // collector leg (BJT collector → 상단 rail)
  p.push(line(QX, 238, QX, TOP));
  // emitter leg (BJT emitter → GND)
  p.push(line(QX, 278, QX, BOT));
  // 부하 leg: V_o → R3∥R4 → GND
  p.push(line(R3X, TOP, R3X, 175));
  p.push(line(R3X, 285, R3X, BOT));
  p.push(line(R4X, TOP, R4X, 175));
  p.push(line(R4X, 285, R4X, BOT));
  // 하단 rail
  p.push(line(VX, BOT, R4X, BOT));

  // ── 심볼 ──
  p.push(vSource(VX, 178, d.vinLabel));        // 20V
  p.push(zigzagH(R1L, R1R, TOP));              // R1
  p.push(zener(AX, 240, d.vzLabel));           // 제너
  p.push(zigzagV(R2X, 175, 245));              // R2 (수직)
  p.push(npn(QX, 258));                        // BJT
  p.push(zigzagV(R3X, 175, 285));              // R3
  p.push(zigzagV(R4X, 175, 285));              // R4 (점선 박스 = 학생 도출)
  p.push(loadBoxV(R4X, 230));                  // R4 강조 (점선)

  // ── 노드 dot ──
  p.push(dot(AX, TOP), dot(R2X, TOP), dot(QX, TOP), dot(R3X, TOP));
  p.push(dot(QX, BOT), dot(R3X, BOT), dot(AX, BOT), dot(VX, BOT));

  // ── I_1 화살표 (R1 위, R₁ 라벨과 분리) ──
  p.push(arrowR((R1L + R1R) / 2 - 14, TOP - 30));
  p.push(text((R1L + R1R) / 2 + 22, TOP - 34, d.i1Label, { size: 12, weight: 600, anchor: "start", fill: BLUE }));

  // ── I_L 화살표 (부하 위) ──
  p.push(arrowD(VOX + 24, 130));
  p.push(text(VOX + 36, 126, d.ilLabel, { size: 12, weight: 600, anchor: "start", fill: RED }));

  // ── 라벨 ──
  p.push(text(AX, TOP - 12, "A", { size: 13, weight: 700, fill: BLUE }));
  p.push(text(VOX + 6, TOP - 12, d.voLabel, { size: 14, weight: 700, anchor: "start", fill: RED }));
  p.push(openTerminal(VOX, TOP));
  // 소자 라벨
  p.push(text(R1L + 52, TOP - 14, "R₁", { size: 13, weight: 600 }));
  p.push(text(R1L + 52, TOP + 24, d.r1Label, { size: 11 }));
  p.push(text(R2X + 16, 200, "R₂", { size: 13, weight: 600, anchor: "start" }));
  p.push(text(R2X + 16, 218, d.r2Label, { size: 11, anchor: "start" }));
  p.push(text(R3X - 16, 230, "R₃", { size: 13, weight: 600, anchor: "end" }));
  p.push(text(R3X - 16, 248, d.r3Label, { size: 11, anchor: "end" }));
  p.push(text(R4X + 18, 230, "R₄", { size: 13, weight: 600, anchor: "start", fill: "#7c3aed" }));
  p.push(text(AX - 14, 244, "V_z", { size: 12, weight: 600, anchor: "end", fill: BLUE }));
  p.push(text(AX - 14, 260, d.vzLabel, { size: 11, anchor: "end" }));
  p.push(text(QX + 30, 262, "Q", { size: 13, weight: 600, anchor: "start" }));
  p.push(gndSymbol((VX + R4X) / 2, BOT));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function vSource(cx: number, cy: number, label: string): string {
  const r = 22;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="13" fill="${STROKE}">+</text>` +
    `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="14" fill="${STROKE}">−</text>` +
    text(cx - 28, cy + 4, label, { size: 12, weight: 600, anchor: "end" });
}
function zener(cx: number, cy: number, _label: string): string {
  // 제너 다이오드 — 삼각형(cathode 위) + 꺾인 bar (Z 모양). 도선은 위(cathode)→아래(anode).
  // ★ 꼭짓점은 **위(cy-h)**, 밑변이 아래(cy+h)다 — bar(캐소드)는 꼭짓점 쪽에 붙는다.
  //   (사용자 신고 2026-08-04 "제너 다이오드 방향이 반대 아니야?": 꼭짓점을 cy+h에 찍어
  //    삼각형이 아래를 향하고 bar가 **밑변 쪽**에 붙어 원본과 방향이 뒤집혔다. 션트 레귤레이터는
  //    A 노드(+)에서 아래로 항복 전류가 흐르므로 캐소드가 위여야 한다.)
  const h = 14;
  const tri = `<polygon points="${cx},${cy - h} ${cx - 10},${cy + h} ${cx + 10},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // cathode bar (위) with zener serifs
  const bar = `<line x1="${cx - 11}" y1="${cy - h}" x2="${cx + 11}" y2="${cy - h}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 11}" y1="${cy - h}" x2="${cx - 15}" y2="${cy - h - 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + 11}" y1="${cy - h}" x2="${cx + 15}" y2="${cy - h + 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return tri + bar;
}
function npn(cx: number, cy: number): string {
  // NPN: 세로 base bar(x=cx-18), collector(위 lead), emitter(아래 lead, 화살표 out).
  const bx = cx - 18;
  const bar = `<line x1="${bx}" y1="${cy - 22}" x2="${bx}" y2="${cy + 22}" stroke="${STROKE}" stroke-width="2.4"/>`;
  const baseLead = `<line x1="${bx - 18}" y1="${cy}" x2="${bx}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const col = `<line x1="${bx}" y1="${cy - 12}" x2="${cx}" y2="${cy - 20}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const emi = `<line x1="${bx}" y1="${cy + 12}" x2="${cx}" y2="${cy + 20}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // emitter 화살표 (out = NPN)
  const ah = `<polygon points="${cx},${cy + 20} ${cx - 8},${cy + 14} ${cx - 3},${cy + 9} " fill="${STROKE}"/>`;
  const circ = `<circle cx="${cx - 4}" cy="${cy}" r="26" fill="none" stroke="${STROKE}" stroke-width="1.1"/>`;
  return circ + bar + baseLead + col + emi + ah;
}
function loadBoxV(cx: number, cy: number): string {
  return `<rect x="${cx - 12}" y="${cy - 38}" width="24" height="76" fill="none" stroke="#7c3aed" stroke-width="1.4" stroke-dasharray="5 3"/>`;
}
function openTerminal(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function gndSymbol(cx: number, y: number): string {
  return `<g stroke="${STROKE}" stroke-width="${WIRE_W}">` +
    `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 8}"/>` +
    `<line x1="${cx - 10}" y1="${y + 8}" x2="${cx + 10}" y2="${y + 8}"/>` +
    `<line x1="${cx - 6}" y1="${y + 12}" x2="${cx + 6}" y2="${y + 12}"/>` +
    `<line x1="${cx - 2}" y1="${y + 16}" x2="${cx + 2}" y2="${y + 16}"/></g>`;
}
function arrowR(x: number, y: number): string {
  return `<g stroke="${BLUE}" stroke-width="1.6" fill="${BLUE}">` +
    `<line x1="${x}" y1="${y}" x2="${x + 24}" y2="${y}"/>` +
    `<polygon points="${x + 28},${y} ${x + 20},${y - 4} ${x + 20},${y + 4}"/></g>`;
}
function arrowD(x: number, y: number): string {
  return `<g stroke="${RED}" stroke-width="1.6" fill="${RED}">` +
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 24}"/>` +
    `<polygon points="${x},${y + 28} ${x - 4},${y + 20} ${x + 4},${y + 20}"/></g>`;
}

const R_AMP = 7, R_TEETH = 6, R_PAD = 9;
function zigzagH(x0: number, x1: number, y: number): string {
  const xa = x0 + R_PAD, xb = x1 - R_PAD, seg = (xb - xa) / R_TEETH;
  const pts: Array<[number, number]> = [[x0, y], [xa, y]];
  for (let i = 0; i < R_TEETH; i++) pts.push([xa + seg * (i + 0.5), y + (i % 2 === 0 ? -R_AMP : R_AMP)]);
  pts.push([xb, y], [x1, y]);
  return poly(pts);
}
function zigzagV(x: number, y0: number, y1: number): string {
  const ya = y0 + R_PAD, yb = y1 - R_PAD, seg = (yb - ya) / R_TEETH;
  const pts: Array<[number, number]> = [[x, y0], [x, ya]];
  for (let i = 0; i < R_TEETH; i++) pts.push([x + (i % 2 === 0 ? -R_AMP : R_AMP), ya + seg * (i + 0.5)]);
  pts.push([x, yb], [x, y1]);
  return poly(pts);
}
function poly(pts: Array<[number, number]>): string {
  return `<polyline points="${pts.map((q) => `${q[0]},${q[1]}`).join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}

// ─── primitives ──────────────────────────────────
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
  return `<text x="${x}" y="${y}" text-anchor="${opts.anchor ?? "middle"}" font-size="${opts.size ?? 12}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? STROKE}">${escapeSvg(s)}</text>`;
}
function escapeSvg(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
