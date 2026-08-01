import type { ActiveLowpassFilterCircuitDiagram } from "@/types";

/**
 * 1차 능동 저역통과 필터 (임용 31번) 전용 fixed-slot 렌더러 — 원본 배치.
 *
 *                    ┌─────── R_f(5kΩ) ───────┐
 *                    │                        │
 *   v_i ─ R ─┬──────(−)                       │
 *            │        ╲  OPAMP  ▷──────┬────── v_o
 *            C        (+)              (출력)
 *            │      P──┘
 *           GND
 *
 *  입력단 R-C 저역통과가 대역폭 결정: f_c = 1/(2πRC). OPAMP 비반전 버퍼.
 *  (+) = RC 마디 P, (−) = 피드백(R_f). 원본처럼 (−) 위·(+) 아래.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const DOT_R = 3.4;
const BLUE = "#1d4ed8";

const SVG_W = 720;
const SVG_H = 400;

const OPLX = 330;      // OPAMP 좌변
const OPAPEX = 430;    // OPAMP 꼭짓점(출력)
const PIN = 24;        // OPAMP 입력 핀(리드) 길이
const PINX = OPLX - PIN; // 입력 핀 tip x (도선이 여기 연결)
const OPY = 210;       // OPAMP 세로 중심
const OPM_Y = OPY - 20; // (−) 입력 (위)
const OPP_Y = OPY + 20; // (+) 입력 (아래)

const VIX = 60;        // v_i 단자
const RX0 = 120, RX1 = 210; // R (수평)
const PX = 265;        // RC 마디 P
const CY0 = 240, CY1 = 300; // C 세로 구간
const GNDY = 330;      // C 접지

const FBY = 130;       // 피드백 상단 가로선
const FBRX = 500;      // 피드백 우측 세로 (출력 rail 탭)
const RFX0 = 370;      // R_f 좌 (피드백 저항 시작)
const RFX1 = 470;      // R_f 우 (피드백 저항 끝)
const VOX = 640;       // v_o 단자

type D = ActiveLowpassFilterCircuitDiagram;

export function renderActiveLowpassFilterCircuit(d: D): string {
  const p: string[] = [];

  // ── 도선 ──
  // v_i → R → P → (+) 핀 → (+) 입력
  p.push(line(VIX, OPP_Y, RX0, OPP_Y));
  p.push(line(RX1, OPP_Y, PINX, OPP_Y));       // R 우 → (+) 핀 tip (P 경유)
  p.push(line(PINX, OPP_Y, OPLX, OPP_Y));      // (+) 입력 핀 (lead)
  // C: P → GND
  p.push(line(PX, OPP_Y, PX, CY0));
  p.push(line(PX, CY1, PX, GNDY));
  // (−) 입력 핀 + 피드백 상단(R_f) → 우측 세로 → 출력 rail
  //   ★ (−) 단자에 핀(리드)을 달고, 피드백 도선을 핀 tip에 연결.
  //   ★ R_f 자리는 도선을 그리지 않고 양옆 리드만 (저항-도선 겹침 방지)
  p.push(line(PINX, OPM_Y, OPLX, OPM_Y));      // (−) 입력 핀 (lead)
  p.push(line(PINX, OPM_Y, PINX, FBY));        // 핀 tip → 피드백 riser
  p.push(line(PINX, FBY, RFX0, FBY));          // R_f 좌측 리드
  p.push(line(RFX1, FBY, FBRX, FBY));          // R_f 우측 리드
  p.push(line(FBRX, FBY, FBRX, OPY));          // 우측 세로 → 출력 rail
  // 출력 rail: apex → v_o
  p.push(line(OPAPEX, OPY, VOX, OPY));

  // ── 심볼 ──
  p.push(opamp(OPLX, OPAPEX, OPY));            // OPAMP
  p.push(resistorH(RX0, RX1, OPP_Y));          // R
  p.push(capV(PX, CY0, CY1));                  // C
  p.push(resistorH(RFX0, RFX1, FBY)); // R_f (피드백 가로)
  p.push(gndSymbol(PX, GNDY));

  // ── 노드 dot ──
  p.push(dot(PX, OPP_Y), dot(FBRX, OPY));

  // ── 단자/라벨 ──
  p.push(openTerminal(VIX, OPP_Y));
  p.push(text(VIX - 8, OPP_Y + 5, d.viLabel, { size: 14, weight: 700, anchor: "end", fill: BLUE }));
  p.push(openTerminal(VOX, OPY));
  p.push(text(VOX + 8, OPY + 5, d.voLabel, { size: 14, weight: 700, anchor: "start", fill: BLUE }));
  // R 라벨
  p.push(text((RX0 + RX1) / 2, OPP_Y + 24, d.rLabel, { size: 12, weight: 600 }));
  // C 라벨
  p.push(text(PX + 14, (CY0 + CY1) / 2 + 4, d.cLabel, { size: 13, weight: 700, anchor: "start" }));
  // R_f 라벨
  p.push(text((OPLX + FBRX) / 2, FBY - 10, d.rfLabel, { size: 12, weight: 600 }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function opamp(leftX: number, apexX: number, cy: number): string {
  const half = 40;
  const tri = `<polygon points="${leftX},${cy - half} ${leftX},${cy + half} ${apexX},${cy}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const minus = `<text x="${leftX + 12}" y="${cy - 14}" text-anchor="start" font-size="16" fill="${STROKE}">−</text>`;
  const plus = `<text x="${leftX + 12}" y="${cy + 26}" text-anchor="start" font-size="14" fill="${STROKE}">+</text>`;
  return tri + minus + plus;
}
function capV(cx: number, y0: number, y1: number): string {
  // 커패시터 (수평 두 판, 세로 방향 연결)
  const my = (y0 + y1) / 2;
  const top = `<line x1="${cx - 14}" y1="${my - 6}" x2="${cx + 14}" y2="${my - 6}" stroke="${STROKE}" stroke-width="2"/>`;
  const bot = `<line x1="${cx - 14}" y1="${my + 6}" x2="${cx + 14}" y2="${my + 6}" stroke="${STROKE}" stroke-width="2"/>`;
  const l1 = line(cx, y0, cx, my - 6);
  const l2 = line(cx, my + 6, cx, y1);
  return l1 + top + bot + l2;
}
function openTerminal(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function gndSymbol(cx: number, y: number): string {
  return `<g stroke="${STROKE}" stroke-width="${WIRE_W}">` +
    `<line x1="${cx}" y1="${y - 6}" x2="${cx}" y2="${y}"/>` +
    `<line x1="${cx - 10}" y1="${y}" x2="${cx + 10}" y2="${y}"/>` +
    `<line x1="${cx - 6}" y1="${y + 4}" x2="${cx + 6}" y2="${y + 4}"/>` +
    `<line x1="${cx - 2}" y1="${y + 8}" x2="${cx + 2}" y2="${y + 8}"/></g>`;
}

const R_AMP = 7, R_TEETH = 6, R_PAD = 9;
function resistorH(x0: number, x1: number, y: number): string {
  const xa = x0 + R_PAD, xb = x1 - R_PAD, seg = (xb - xa) / R_TEETH;
  const pts: Array<[number, number]> = [[x0, y], [xa, y]];
  for (let i = 0; i < R_TEETH; i++) pts.push([xa + seg * (i + 0.5), y + (i % 2 === 0 ? -R_AMP : R_AMP)]);
  pts.push([xb, y], [x1, y]);
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
