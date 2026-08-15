import type { AcDcSuperpositionRcCircuitDiagram } from "@/types";

/**
 * AC+DC 중첩 RC 회로 (임용 12번 회로이론 (가)) 전용 fixed-slot 렌더러.
 *
 *  ★ 원본 구조 (사용자 이미지 확정):
 *    g ─ v(t) ─ TL ─ C ─ a
 *    a ═[ R_3(위) ∥ R_4(아래) ]═ c            (상단 병렬쌍, 둘 다 a–c 사이)
 *    c ─ R_5 ─ g                              (우측 세로 저항, c→접지)
 *    a ─ 20V ─ b ─ (도선) ─ g                 (중앙: DC 소스, b 바닥 접지선 직결)
 *    bottom rail: v(t)·b·R_5 바닥 공통(g)
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const DOT_R = 3.4;
const BLUE = "#1d4ed8";

const SVG_W = 700;
const SVG_H = 520;

const VX = 95;
const AX = 305;
const CX = 560;
const TOP_Y = 105;
const B_Y = 285;
const BOT_Y = 460;

const PL = 365;    // 병렬 좌측 split
const PR = 500;    // 병렬 우측 split
const R3_Y = 80;   // 상단 병렬쌍 위 (원본 R₂)
const R4_Y = 130;  // 상단 병렬쌍 아래 (원본 R₃)
// 중앙 leg의 직류 전원 직렬 저항 R₁ (원본에 있으나 누락돼 있던 소자)
const R1_Y0 = 218;
const R1_Y1 = 272;

type D = AcDcSuperpositionRcCircuitDiagram;

export function renderAcDcSuperpositionRcCircuit(d: D): string {
  const p: string[] = [];

  // ── 도선 ──
  // 좌측 v(t) leg
  p.push(line(VX, BOT_Y, VX, 322));
  p.push(line(VX, 248, VX, TOP_Y));
  // 상단 rail 좌: TL → C → a
  p.push(line(VX, TOP_Y, 162, TOP_Y));
  p.push(line(208, TOP_Y, AX, TOP_Y));
  // a → 병렬쌍 → c
  p.push(line(AX, TOP_Y, PL, TOP_Y));
  p.push(line(PL, R3_Y, PL, R4_Y));
  p.push(line(PR, R3_Y, PR, R4_Y));
  p.push(line(PR, TOP_Y, CX, TOP_Y));
  // 중앙 leg: a → 20V → R₁ → b → g
  //   ★ R₁(직류 전원과 직렬)은 원본에 있는데 빠져 있었다(사용자 신고 2026-08-05).
  //     이게 없으면 교류 해석에서 점 a가 접지에 그대로 클램프돼 문항이 성립하지 않는다.
  p.push(line(AX, TOP_Y, AX, 152));
  p.push(line(AX, 208, AX, R1_Y0));       // 20V 하단 → R₁ 상단
  p.push(line(AX, R1_Y1, AX, BOT_Y));     // R₁ 하단 → b → g
  // 우측 leg: c → R_5 → g
  p.push(line(CX, TOP_Y, CX, 200));
  p.push(line(CX, 360, CX, BOT_Y));
  // 하단 rail
  p.push(line(VX, BOT_Y, CX, BOT_Y));

  // ── 심볼 ──
  p.push(acSource(VX, 285));
  p.push(dcSource(AX, 180));
  p.push(capacitorH(185, TOP_Y));
  p.push(zigzagH(PL, PR, R3_Y));         // 상단 병렬쌍 위 (원본 R₂)
  p.push(zigzagH(PL, PR, R4_Y));         // 상단 병렬쌍 아래 (원본 R₃)
  p.push(zigzagV(CX, 200, 360));         // 우측 세로 (원본 R₄ — 문항이 묻는 저항)
  p.push(zigzagV(AX, R1_Y0, R1_Y1));     // 직류 전원 직렬 (원본 R₁)

  // ── 노드 dot ──
  p.push(dot(AX, TOP_Y));   // a
  p.push(dot(PL, TOP_Y), dot(PR, TOP_Y));
  p.push(dot(AX, B_Y));     // b
  p.push(dot(CX, TOP_Y));   // c
  p.push(dot(VX, BOT_Y), dot(AX, BOT_Y), dot(CX, BOT_Y));

  // ── i_ac 화살표 — 원본처럼 **C에서 점 a로 들어가는 가로 방향**이다.
  //   (이전엔 세로 아래 방향으로 그려 DC 가지 전류처럼 보였다 — 문항이 묻는 양과 어긋난다.)
  p.push(arrowRight(AX - 78, TOP_Y + 16, 42));
  p.push(text(AX - 57, TOP_Y + 36, d.iabLabel, { size: 14, anchor: "middle", fill: BLUE }));

  // ── 노드 라벨 ──
  p.push(text(AX - 8, TOP_Y - 10, "a", { size: 16, weight: 700, anchor: "end" }));
  p.push(text(AX + 14, B_Y + 5, "b", { size: 16, weight: 700, anchor: "start" }));
  p.push(text(CX + 12, TOP_Y - 10, "c", { size: 16, weight: 700, anchor: "start" }));
  p.push(text(AX + 16, B_Y + 24, d.idcLabel, { size: 14, anchor: "start", fill: BLUE }));

  // ── 소자 값 ──
  p.push(text(VX - 36, 290, "v(t)", { size: 15, weight: 600, anchor: "end" }));
  p.push(text(185, TOP_Y - 18, "C", { size: 14, weight: 700 }));
  p.push(text(185, TOP_Y + 28, d.cLabel, { size: 13 }));
  // ★ 표기는 원본 이름을 따른다 — R₁(직류 직렬)·R₂·R₃(상단 병렬쌍)·R₄(우측 세로).
  p.push(text((PL + PR) / 2, R3_Y - 12, "R₂", { size: 14, weight: 700 }));
  p.push(text(PR + 14, R3_Y + 4, d.r3Label, { size: 13, anchor: "start" }));
  p.push(text((PL + PR) / 2, R4_Y + 22, "R₃", { size: 14, weight: 700 }));
  p.push(text(PR + 14, R4_Y + 4, d.r4Label, { size: 13, anchor: "start" }));
  p.push(text(AX - 34, 184, d.vdcLabel, { size: 14, weight: 700, anchor: "end" }));
  p.push(text(AX - 20, (R1_Y0 + R1_Y1) / 2 - 4, "R₁", { size: 14, weight: 700, anchor: "end" }));
  p.push(text(AX - 20, (R1_Y0 + R1_Y1) / 2 + 15, d.r1Label ?? "", { size: 13, anchor: "end" }));
  p.push(text(CX + 16, 275, "R₄", { size: 14, weight: 700, anchor: "start" }));
  p.push(text(CX + 16, 294, d.r5Label, { size: 13, anchor: "start" }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function acSource(cx: number, cy: number): string {
  const r = 28;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<path d="M ${cx - 15} ${cy} Q ${cx - 7.5} ${cy - 13}, ${cx} ${cy} T ${cx + 15} ${cy}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function dcSource(cx: number, cy: number): string {
  const r = 26;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 7}" text-anchor="middle" font-size="15" fill="${STROKE}">+</text>` +
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="16" fill="${STROKE}">−</text>`;
}
function capacitorH(cx: number, cy: number): string {
  const gap = 8, h = 18;
  return `<line x1="${cx - 23}" y1="${cy}" x2="${cx - gap}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - gap}" y1="${cy - h}" x2="${cx - gap}" y2="${cy + h}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + gap}" y1="${cy - h}" x2="${cx + gap}" y2="${cy + h}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + gap}" y1="${cy}" x2="${cx + 23}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

const R_AMP = 8, R_TEETH = 6, R_PAD = 10;
function zigzagH(x0: number, x1: number, y: number): string {
  const xa = x0 + R_PAD, xb = x1 - R_PAD, seg = (xb - xa) / R_TEETH;
  const pts: Array<[number, number]> = [[x0, y], [xa, y]];
  for (let i = 0; i < R_TEETH; i++) pts.push([xa + seg * (i + 0.5), y + (i % 2 === 0 ? -R_AMP : R_AMP)]);
  pts.push([xb, y], [x1, y]);
  return polyline(pts);
}
function zigzagV(x: number, y0: number, y1: number): string {
  const ya = y0 + R_PAD, yb = y1 - R_PAD, seg = (yb - ya) / R_TEETH;
  const pts: Array<[number, number]> = [[x, y0], [x, ya]];
  for (let i = 0; i < R_TEETH; i++) pts.push([x + (i % 2 === 0 ? -R_AMP : R_AMP), ya + seg * (i + 0.5)]);
  pts.push([x, yb], [x, y1]);
  return polyline(pts);
}
function arrowDown(x: number, y: number, len: number): string {
  const y2 = y + len;
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y2}" stroke="${BLUE}" stroke-width="${WIRE_W}"/>` +
    `<polygon points="${x},${y2 + 5} ${x - 4},${y2 - 3} ${x + 4},${y2 - 3}" fill="${BLUE}"/>`;
}
/** 오른쪽 화살표 — i_ac(t)가 C에서 점 a로 흘러드는 방향(원본 표기). */
function arrowRight(x: number, y: number, len: number): string {
  const x2 = x + len;
  return `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y}" stroke="${BLUE}" stroke-width="${WIRE_W}"/>` +
    `<polygon points="${x2 + 5},${y} ${x2 - 3},${y - 4} ${x2 - 3},${y + 4}" fill="${BLUE}"/>`;
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
