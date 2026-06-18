import type { DffStateDesignCircuitDiagram } from "@/types";

/**
 * D-FF 2개 + 게이트 구현 회로 (임용 9번 정보과 (다)) 전용 fixed-slot 렌더러.
 *   게이트 ㉮(빈칸) → D_A → FF_A → Q_A,  ㉯(빈칸) → D_B → FF_B → Q_B.
 *   입력 Q_A·Q_B(피드백)가 두 게이트로, 공통 CLK.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 660, H = 440;
const GATE_X = 230, GATE_W = 64, GATE_H = 48;
const FF_L = 380, FF_W = 86;
const FF_A_CY = 120, FF_B_CY = 290, FF_HALF = 44;
const Q_OUT_X = FF_L + FF_W + 26;
const FB_A_Y = 60, FB_B_Y = 380;   // 피드백 lane
const CLK_RAIL_Y = 410;
const IN_X = 120;                   // Q_A·Q_B 입력 트렁크

type D = DffStateDesignCircuitDiagram;

export function renderDffStateDesignCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  for (const [sym, gateCy, ffCy, ffId, qLabel, dLabel] of [
    [d.gateASym ?? "㉮", FF_A_CY, FF_A_CY, "FF_A", "Q_A", "D_A"],
    [d.gateBSym ?? "㉯", FF_B_CY, FF_B_CY, "FF_B", "Q_B", "D_B"],
  ] as const) {
    // 게이트 박스 (빈칸 — 종류 미정)
    const gx = GATE_X, gy = gateCy - GATE_H / 2;
    s.push(`<rect x="${gx}" y="${gy}" width="${GATE_W}" height="${GATE_H}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-dasharray="5 3"/>`);
    t.push(text(gx + GATE_W / 2, gateCy + 6, sym, { size: 16, weight: 700, fill: ACCENT }));
    // 게이트 입력 2개 (Q_A·Q_B 트렁크에서)
    w.push(line(IN_X, gateCy - 10, gx, gateCy - 10));
    w.push(line(IN_X + 24, gateCy + 10, gx, gateCy + 10));
    t.push(text(gx - 6, gateCy - 13, "Q_A", { size: 9, anchor: "end", fill: MUTED }));
    t.push(text(gx - 6, gateCy + 20, "Q_B", { size: 9, anchor: "end", fill: MUTED }));
    // 게이트 출력 → D 핀
    w.push(line(gx + GATE_W, gateCy, FF_L, ffCy));
    t.push(text((gx + GATE_W + FF_L) / 2, ffCy - 6, dLabel, { size: 10, weight: 600, fill: "#dc2626" }));

    // FF 박스
    s.push(`<rect x="${FF_L}" y="${ffCy - FF_HALF}" width="${FF_W}" height="${FF_HALF * 2}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    t.push(text(FF_L + FF_W / 2, ffCy - 22, "D-FF", { size: 11, weight: 700, fill: MUTED }));
    t.push(text(FF_L + FF_W / 2, ffCy + 6, ffId.replace("FF_", "FF "), { size: 10, fill: MUTED }));
    t.push(text(FF_L + 10, ffCy - 12 + 4, "D", { size: 11, weight: 600, anchor: "start" }));
    t.push(text(FF_L + FF_W - 10, ffCy - 12 + 4, "Q", { size: 11, weight: 600, anchor: "end" }));
    s.push(clkTri(FF_L, ffCy + 16));
    // Q 출력
    w.push(line(FF_L + FF_W, ffCy - 12, Q_OUT_X, ffCy - 12));
    s.push(dot(Q_OUT_X, ffCy - 12));
    t.push(text(Q_OUT_X + 8, ffCy - 8, qLabel, { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  }

  // ── Q_A·Q_B 피드백 → 입력 트렁크 (IN_X / IN_X+24 세로) ──
  // Q_A 출력 → 위 lane → IN_X 트렁크
  w.push(line(Q_OUT_X, FF_A_CY - 12, Q_OUT_X, FB_A_Y));
  w.push(line(Q_OUT_X, FB_A_Y, IN_X, FB_A_Y));
  w.push(line(IN_X, FB_A_Y, IN_X, FF_B_CY + 10));
  // Q_B 출력 → 아래 lane → IN_X+24 트렁크
  w.push(line(Q_OUT_X, FF_B_CY - 12, Q_OUT_X + 14, FF_B_CY - 12));
  w.push(line(Q_OUT_X + 14, FF_B_CY - 12, Q_OUT_X + 14, FB_B_Y));
  w.push(line(Q_OUT_X + 14, FB_B_Y, IN_X + 24, FB_B_Y));
  w.push(line(IN_X + 24, FB_B_Y, IN_X + 24, FF_A_CY + 10));
  // 트렁크에서 각 게이트로 가는 tap은 위 루프의 line(IN_X..)이 담당.
  // 트렁크 라벨
  t.push(text(IN_X - 4, (FB_A_Y + FF_B_CY) / 2, "Q_A", { size: 10, weight: 700, fill: ACCENT, anchor: "end" }));
  t.push(text(IN_X + 28, (FB_B_Y + FF_A_CY) / 2, "Q_B", { size: 10, weight: 700, fill: ACCENT, anchor: "start" }));
  s.push(dot(IN_X, FB_A_Y)); s.push(dot(IN_X + 24, FB_B_Y));

  // ── CLK 공통 ──
  t.push(text(40, CLK_RAIL_Y + 4, "CLK", { size: 12, weight: 600, anchor: "end" }));
  w.push(line(46, CLK_RAIL_Y, FF_L - 16, CLK_RAIL_Y));
  w.push(line(FF_L - 16, CLK_RAIL_Y, FF_L - 16, FF_A_CY + 16));
  w.push(line(FF_L - 16, FF_A_CY + 16, FF_L, FF_A_CY + 16));
  w.push(line(FF_L - 16, FF_B_CY + 16, FF_L, FF_B_CY + 16));
  s.push(dot(FF_L - 16, FF_B_CY + 16));

  t.push(text(W / 2, H - 8, "D-FF 2개 + 게이트 ㉮·㉯ — D_A·D_B를 Q_A·Q_B 함수로 구현 (㉮·㉯ 학생 도출)", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function clkTri(x: number, cy: number): string {
  const h = 6;
  return `<polygon points="${x},${cy - h} ${x + 9},${cy} ${x},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
