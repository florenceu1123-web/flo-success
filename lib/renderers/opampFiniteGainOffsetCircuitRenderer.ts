import type { OpampFiniteGainOffsetCircuitDiagram } from "@/types";

/**
 * 유한 이득 OPAMP + 출력단 오프셋 전압원 V_B (임용 9번 전자회로) — 전용 fixed-slot 렌더러.
 *   접지 ─ R₁ ─ V⁻ ─(OPAMP −)   /   R₂: V⁻ ↔ 출력 노드(V_out)  (상단 되먹임)
 *   v_in(교류원) → V⁺,  OPAMP 출력 V_D ─ V_B(직렬 전압원) ─ V_out 단자
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const W = 620, H = 340;

export function renderOpampFiniteGainOffsetCircuit(d: OpampFiniteGainOffsetCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const xGnd = 60, xMinus = 210, xOp = 260, xVd = 400, xVb = 450, xOut = 545;
  const yMinus = 150, yPlus = 196, yFb = 76, yIn = 250;

  // ── 상단 되먹임 R₂: V⁻ → 출력 노드
  w.push(line(xMinus, yMinus, xMinus, yFb));
  hRes(s, t, xMinus + 20, xOut - 40, yFb, d.r2Label ?? "R_2");
  w.push(line(xMinus, yFb, xMinus + 20, yFb), line(xOut - 40, yFb, xOut, yFb), line(xOut, yFb, xOut, yMinus + 10));
  s.push(dot(xMinus, yMinus));

  // ── 좌측 R₁: 접지 → V⁻
  ground(s, xGnd, yMinus);
  hRes(s, t, xGnd + 16, xMinus - 24, yMinus, d.r1Label ?? "R_1");
  w.push(line(xGnd, yMinus, xGnd + 16, yMinus), line(xMinus - 24, yMinus, xMinus, yMinus));
  t.push(text(xMinus - 6, yMinus - 10, "V⁻", { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));

  // ── OPAMP 삼각형
  s.push(`<path d="M${xOp},${yMinus - 46} L${xOp},${yPlus + 46} L${xOp + 110},${(yMinus + yPlus) / 2} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(xOp + 14, yMinus + 4, "−", { size: 15, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(xOp + 14, yPlus + 4, "+", { size: 13, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(xOp + 44, (yMinus + yPlus) / 2 + 5, d.a0Label ?? "A_0", { size: 12, weight: 700, fill: ACCENT }));
  w.push(line(xMinus, yMinus, xOp, yMinus));

  // ── v_in → V⁺
  w.push(line(xOp, yPlus, xOp - 70, yPlus), line(xOp - 70, yPlus, xOp - 70, yIn - 22));
  acSource(s, t, xOp - 70, yIn, d.vinLabel ?? "v_{in}");
  ground(s, xOp - 70, yIn + 46);
  t.push(text(xOp - 4, yPlus - 10, "V⁺", { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));

  // ── 출력 V_D ─ V_B(직렬 전압원) ─ V_out
  const yMid = (yMinus + yPlus) / 2;
  w.push(line(xOp + 110, yMid, xVd, yMid));
  t.push(text(xVd - 6, yMid - 12, "V_D", { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));
  s.push(dot(xVd, yMid));
  // 직렬 전압원 (배터리 기호: 긴/짧은 선)
  const bx = xVb + 20;
  w.push(line(xVd, yMid, bx - 12, yMid));
  //  ★ 긴 판/짧은 판 길이 차를 크게 — 안 그러면 커패시터로 오독된다(시각검증).
  s.push(line(bx - 12, yMid - 17, bx - 12, yMid + 17));   // 긴 판 (+)
  s.push(line(bx, yMid - 6, bx, yMid + 6));               // 짧은 판 (−)
  t.push(text(bx - 16, yMid + 30, "+", { size: 12, weight: 700, fill: RED }));
  t.push(text(bx + 8, yMid + 30, "−", { size: 13, weight: 700, fill: RED }));
  t.push(text(bx - 4, yMid - 22, tex(d.vbLabel ?? "V_B"), { size: 11.5, weight: 700, fill: ACCENT }));
  w.push(line(bx, yMid, xOut, yMid), line(xOut, yMid, xOut, yFb));
  s.push(dot(xOut, yMid));
  s.push(`<circle cx="${xOut + 30}" cy="${yMid}" r="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  w.push(line(xOut, yMid, xOut + 26, yMid));
  t.push(text(xOut + 38, yMid + 4, "V_out", { size: 12.5, weight: 700, fill: ACCENT, anchor: "start" }));

  t.push(text(W / 2, H - 10, "유한 개방루프 이득 A₀ + 출력단 오프셋 전압원 V_B (V_out = V_D − V_B)", { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────── 헬퍼 ───────────────────────
function hRes(s: string[], t: string[], x1: number, x2: number, y: number, label: string): void {
  const cx = (x1 + x2) / 2, half = 24, a = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x1, y, cx - half, y), line(cx + half, y, x2, y));
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(cx, y - 12, tex(label), { size: 11, weight: 600, fill: ACCENT }));
}
function acSource(s: string[], t: string[], x: number, y: number, label: string): void {
  s.push(`<circle cx="${x}" cy="${y}" r="20" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<path d="M${x - 11},${y} q5.5,-8 11,0 q5.5,8 11,0" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(line(x, y - 20, x, y - 22), line(x, y + 20, x, y + 26));
  t.push(text(x - 28, y + 4, tex(label), { size: 11, weight: 700, fill: ACCENT, anchor: "end" }));
}
function ground(s: string[], x: number, y: number): void {
  s.push(line(x, y, x, y + 12));
  s.push(line(x - 11, y + 12, x + 11, y + 12));
  s.push(line(x - 6, y + 17, x + 6, y + 17));
  s.push(line(x - 2, y + 22, x + 2, y + 22));
}
/** 간단 TeX → 평문 (라벨용) */
function tex(s: string): string {
  return String(s ?? "")
    .replace(/\\,/g, " ")
    .replace(/\\mathrm\{([^}]*)\}/g, "$1")
    .replace(/\\Omega/g, "Ω")
    .replace(/\\pi/g, "π")
    .replace(/\\sin/g, "sin")
    .replace(/[{}]/g, "");
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function svg(body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.join("\n")}\n</svg>`;
}
