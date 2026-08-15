import type { OpampSummerTFeedbackCircuitDiagram } from "@/types";

/**
 * 반전 가산기(미지 R₁) + T형 궤환 반전증폭기 + 부하 R_L 전용 fixed-slot 렌더러
 * (임용 7번 전자회로). 원본 배치 그대로.
 *
 *   V_a ─R_a─┬─────R_f─────┐            ┌──R_ta──T──R_tc──┐
 *   V_b ─R₁──┴─(−)\        │   V₁─R_in─┴─(−)\   │        │
 *              (+)/─ V₁ ───┘              (+)/──┴ R_tb   a=V_o ─ R_L ─ ⏚
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderOpampSummerTFeedbackCircuit(d: OpampSummerTFeedbackCircuitDiagram): string {
  const W = 780, H = 360;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 고정 좌표 ──
  const yTop = 72;          // 1단 궤환 rail
  const ySum = 132;         // 1단 반전 입력(가산 마디) 행
  const yMid = 150;         // OPAMP 중심선(출력)
  const yGnd = 268;         // 접지 rail
  // 1단
  const xVa = 58, xVb = 118;
  const xRa = 168, xR1 = 196;
  const xS = 246;           // 가산 마디
  const xOp1 = 262;         // OPAMP1 좌변
  const xOp1R = 352;        // OPAMP1 우변(출력)
  const xV1 = 384;
  // 2단
  const xRin = 440, xM = 492;
  const xOp2 = 508, xOp2R = 598;
  const xRta = 552, xT = 614, xRtc = 668;
  const xA = 716;           // 단자 a
  // T 궤환 rail — ★ R_tb의 접지 기호가 2단 출력 배선(yMid)과 겹치지 않도록 충분히 위에 둔다(실측).
  const yT = 44;

  // ───────── 1단: 전원 2개 → 가산 마디 ─────────
  // V_a — R_a — (상단 경로)
  s.push(dcSource(xVa, ySum + 40, d.vaLabel));
  w.push(line(xVa, ySum + 22, xVa, yTop), line(xVa, yTop, xRa - 24, yTop));
  s.push(resistorH(xRa, yTop));
  t.push(text(xRa, yTop - 16, d.raLabel, { size: 12, weight: 600 }));
  w.push(line(xRa + 24, yTop, xS, yTop));
  s.push(dot(xS, yTop));
  w.push(line(xS, yTop, xS, ySum));
  s.push(gnd(xVa, ySum + 58));

  // V_b — R₁ — (가산 마디 행)
  s.push(dcSource(xVb, ySum + 88, d.vbLabel));
  w.push(line(xVb, ySum + 70, xVb, ySum), line(xVb, ySum, xR1 - 24, ySum));
  s.push(resistorH(xR1, ySum));
  t.push(text(xR1, ySum - 16, d.r1Label, { size: 12, weight: 700, fill: d.r1Label.startsWith("R_1") ? RED : STROKE }));
  w.push(line(xR1 + 24, ySum, xS, ySum));
  s.push(dot(xS, ySum));
  s.push(gnd(xVb, ySum + 106));

  // 가산 마디 → OPAMP1 (−)
  w.push(line(xS, ySum, xOp1, ySum));
  // 궤환 R_f: 상단 rail → 출력
  w.push(line(xS, yTop, xS + 34, yTop));
  s.push(resistorH(xS + 62, yTop));
  t.push(text(xS + 62, yTop - 16, d.rfLabel, { size: 12, weight: 700, fill: d.rfLabel.startsWith("R_f") ? RED : STROKE }));
  w.push(line(xS + 86, yTop, xV1, yTop), line(xV1, yTop, xV1, yMid));

  s.push(opamp(xOp1, xOp1R, yMid));
  w.push(line(xOp1, yMid + 18, xOp1 - 26, yMid + 18), line(xOp1 - 26, yMid + 18, xOp1 - 26, yGnd));
  s.push(gnd(xOp1 - 26, yGnd));
  w.push(line(xOp1R, yMid, xV1, yMid));
  s.push(dot(xV1, yMid));
  t.push(text(xV1 - 4, yMid + 20, d.v1Label, { anchor: "end", size: 12.5, weight: 700, fill: ACCENT }));

  // ───────── 2단: V₁ — R_in — T형 궤환 ─────────
  w.push(line(xV1, yMid, xRin - 24, yMid));
  s.push(resistorH(xRin, yMid));
  t.push(text(xRin, yMid - 16, d.rinLabel, { size: 12, weight: 600 }));
  w.push(line(xRin + 24, yMid, xM, yMid));
  s.push(dot(xM, yMid));
  w.push(line(xM, yMid, xOp2, yMid));

  s.push(opamp(xOp2, xOp2R, yMid));
  w.push(line(xOp2, yMid + 18, xOp2 - 26, yMid + 18), line(xOp2 - 26, yMid + 18, xOp2 - 26, yGnd));
  s.push(gnd(xOp2 - 26, yGnd));

  // 궤환 T망: M ↑ — R_ta — T — R_tc — 단자 a,  T ↓ R_tb ↓ 접지
  w.push(line(xM, yMid, xM, yT), line(xM, yT, xRta - 24, yT));
  s.push(resistorH(xRta, yT));
  t.push(text(xRta, yT - 16, d.rtaLabel, { size: 12, weight: 600 }));
  w.push(line(xRta + 24, yT, xT, yT));
  s.push(dot(xT, yT));
  // R_tb (세로, 접지)
  w.push(line(xT, yT, xT, yT + 22));
  s.push(resistorV(xT, yT + 48));
  t.push(text(xT + 16, yT + 52, d.rtbLabel, { anchor: "start", size: 12, weight: 600 }));
  w.push(line(xT, yT + 74, xT, yT + 86));
  s.push(gnd(xT, yT + 86));
  // R_tc → 단자 a
  w.push(line(xT, yT, xRtc - 24, yT));
  s.push(resistorH(xRtc, yT));
  t.push(text(xRtc, yT - 16, d.rtcLabel, { size: 12, weight: 600 }));
  w.push(line(xRtc + 24, yT, xA, yT), line(xA, yT, xA, yMid));

  // 출력 단자 a + 부하 R_L
  w.push(line(xOp2R, yMid, xA, yMid));
  s.push(dot(xA, yMid));
  t.push(text(xA - 6, yMid - 10, "a", { anchor: "end", size: 12.5, weight: 700, fill: RED }));
  t.push(text(xA + 10, yMid + 4, d.voLabel, { anchor: "start", size: 12.5, weight: 700, fill: ACCENT }));
  w.push(line(xA, yMid, xA, yMid + 26));
  s.push(resistorV(xA, yMid + 52));
  t.push(text(xA - 16, yMid + 56, d.rlLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  // I_L 화살표
  s.push(`<path d="M ${xA + 20} ${yMid + 34} L ${xA + 20} ${yMid + 66}" stroke="${RED}" stroke-width="1.4" fill="none"/>`);
  s.push(`<path d="M ${xA + 16} ${yMid + 60} L ${xA + 20} ${yMid + 70} L ${xA + 24} ${yMid + 60} Z" fill="${RED}"/>`);
  t.push(text(xA + 28, yMid + 52, d.ilLabel, { anchor: "start", size: 12, weight: 700, fill: RED }));
  w.push(line(xA, yMid + 78, xA, yGnd));
  s.push(gnd(xA, yGnd));

  t.push(text(W / 2, H - 8,
    "1단 = 반전 가산기, 2단 = T형 궤환 반전증폭기 (등가 궤환저항 R_ta + R_tc + R_ta·R_tc/R_tb)",
    { size: 10, fill: MUTED }));

  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
/** 직류 전원(원 + 극성) — cy가 중심, 위쪽이 +. */
function dcSource(x: number, cy: number, label: string): string {
  return `<circle cx="${x}" cy="${cy}" r="18" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${x}" y="${cy - 3}" text-anchor="middle" font-size="12" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${x}" y="${cy + 14}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">−</text>` +
    `<text x="${x - 24}" y="${cy + 4}" text-anchor="end" font-size="12" font-weight="700" fill="${ACCENT}">${esc(label)}</text>` +
    `<line x1="${x}" y1="${cy - 18}" x2="${x}" y2="${cy - 18}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** OPAMP 삼각형 — 좌변 x1, 우변(꼭짓점) x2, 중심 cy. (−)는 위, (+)는 아래. */
function opamp(x1: number, x2: number, cy: number): string {
  const h = 34;
  return `<path d="M ${x1} ${cy - h} L ${x2} ${cy} L ${x1} ${cy + h} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${x1 + 14}" y="${cy - 12}" text-anchor="middle" font-size="13" font-weight="700">−</text>` +
    `<text x="${x1 + 14}" y="${cy + 22}" text-anchor="middle" font-size="13" font-weight="700">+</text>`;
}
function resistorH(cx: number, cy: number): string {
  const half = 24, a = 7, teeth = 6, step = (2 * half) / teeth;
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
  return `<g transform="translate(${x},${y})">
    <line x1="-9" y1="0" x2="9" y2="0" stroke="${STROKE}" stroke-width="2.2"/>
    <line x1="-6" y1="4" x2="6" y2="4" stroke="${STROKE}" stroke-width="2"/>
    <line x1="-3" y1="8" x2="3" y2="8" stroke="${STROKE}" stroke-width="2"/></g>`;
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
