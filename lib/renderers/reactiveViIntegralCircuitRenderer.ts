import type { ReactiveViIntegralCircuitDiagram } from "@/types";

/**
 * 이상 인덕터/커패시터 v-i 적분 회로 (가) 전용 fixed-slot 렌더러.
 *  단일 루프: 좌측 전원 + 우측 소자(L 또는 C). L: 전압원 v(t)+인덕터, i(t) 화살표.
 *  C: 전류원 i(t)+커패시터, v(t) 극성 표시.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 380, H = 280;
const LX = 100, RX = 280, TOP = 66, BOT = 214, MID = 140;

type D = ReactiveViIntegralCircuitDiagram;

export function renderReactiveViIntegralCircuit(d: D): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const isCap = d.element === "C";

  // ── 루프 외곽 ──
  w.push(line(LX, TOP, RX, TOP));   // 상단
  w.push(line(LX, BOT, RX, BOT));   // 하단

  // ── 좌측 전원 ──
  w.push(line(LX, TOP, LX, MID - 22));
  w.push(line(LX, MID + 22, LX, BOT));
  if (isCap) s.push(iSource(LX, MID)); else s.push(vSource(LX, MID));
  t.push(text(LX - 30, MID + 4, d.sourceLabel, { size: 13, weight: 700, anchor: "end", fill: ACCENT }));

  // ── 우측 소자 ──
  if (isCap) {
    // 커패시터 (두 평행판, 세로)
    w.push(line(RX, TOP, RX, MID - 12));
    s.push(line(RX - 16, MID - 12, RX + 16, MID - 12)); // 위 판
    s.push(line(RX - 16, MID + 12, RX + 16, MID + 12)); // 아래 판
    w.push(line(RX, MID + 12, RX, BOT));
    t.push(text(RX + 22, MID + 4, d.elemLabel, { size: 12, anchor: "start" }));
    // v(t) 극성 (+/−) 표시
    t.push(text(RX + 22, MID - 16, "+", { size: 13, weight: 700, fill: ACCENT }));
    t.push(text(RX + 22, MID + 26, "−", { size: 13, weight: 700, fill: ACCENT }));
    t.push(text(RX + 40, MID + 4, d.measureLabel, { size: 12, weight: 700, fill: ACCENT, anchor: "start" }));
  } else {
    // 인덕터 (코일, 세로)
    w.push(line(RX, TOP, RX, MID - 26));
    s.push(inductor(RX, MID - 26, MID + 26));
    w.push(line(RX, MID + 26, RX, BOT));
    t.push(text(RX + 22, MID + 4, d.elemLabel, { size: 12, anchor: "start" }));
    // i(t) 화살표 (우측 상단, 아래로 = 루프 전류)
    w.push(line(RX + 6, TOP + 10, RX + 6, TOP + 40));
    s.push(`<polygon points="${RX + 2},${TOP + 34} ${RX + 10},${TOP + 34} ${RX + 6},${TOP + 42}" fill="${STROKE}"/>`);
    t.push(text(RX + 14, TOP + 28, d.measureLabel, { size: 12, weight: 700, fill: ACCENT, anchor: "start" }));
  }

  t.push(text(W / 2, H - 8, isCap
    ? "이상 커패시터 — i(t) 주어질 때 v(t)=(1/C)∫i dt (저항 없음)."
    : "이상 인덕터 — v(t) 주어질 때 i(t)=(1/L)∫v dt (저항 없음).", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function vSource(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14">+</text>` +
    `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="14">−</text>`;
}
function iSource(cx: number, cy: number): string {
  // 전류원: 원 + 위 화살표
  return `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${cy - 9}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<polygon points="${cx - 5},${cy - 4} ${cx + 5},${cy - 4} ${cx},${cy - 12}" fill="${STROKE}"/>`;
}
function inductor(x: number, y0: number, y1: number): string {
  const n = 4, seg = (y1 - y0) / n, r = seg / 2;
  let p = `M ${x} ${y0}`;
  for (let i = 0; i < n; i++) {
    const cy = y0 + seg * i + r;
    p += ` A ${r} ${r} 0 1 1 ${x} ${cy + r}`;
  }
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
