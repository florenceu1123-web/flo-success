import type { AcRlAveragePowerDiagram } from "@/types";

/**
 * AC 전원 + 직렬 리액턴스 + 병렬 저항 2개 (임용 8번) — 전용 fixed-slot 렌더러.
 *   좌측 세로: 교류 전원 V∠0° (+ 위) / 상단 가로: 직렬 인덕터(유사) 또는 커패시터(변형)
 *   우측: R₁·R₂ 두 세로 가지가 병렬.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 560, H = 320;
const Y_TOP = 70, Y_BOT = 250;
const X_V = 90, X_R1 = 320, X_R2 = 440;

export function renderAcRlAveragePowerCircuit(d: AcRlAveragePowerDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 바깥 rail
  w.push(line(X_V, Y_TOP, X_R2, Y_TOP), line(X_V, Y_BOT, X_R2, Y_BOT));

  // ── 교류 전원 (좌측 세로) ────────────────────────────────────────
  const vy = 160;
  w.push(line(X_V, Y_TOP, X_V, vy - 27), line(X_V, vy + 27, X_V, Y_BOT));
  s.push(`<circle cx="${X_V}" cy="${vy}" r="27" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<path d="M${X_V - 11},${vy} q5.5,-8 11,0 q5.5,8 11,0" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`);
  t.push(text(X_V + 17, vy - 16, "+", { size: 14, weight: 700 }));
  t.push(text(X_V + 17, vy + 24, "−", { size: 14, weight: 700 }));
  t.push(text(X_V - 34, vy - 10, "V", { anchor: "end", size: 13, weight: 700 }));
  t.push(text(X_V - 34, vy + 8, d.sourceLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // ── 상단 직렬 소자 (인덕터 or 커패시터) ─────────────────────────
  const sx = 180, slen = 70;
  if (d.isCapacitor) {
    const cx = sx + slen / 2;
    w.push(line(sx, Y_TOP, cx - 6, Y_TOP), line(cx + 6, Y_TOP, sx + slen, Y_TOP));
    s.push(`<line x1="${cx - 6}" y1="${Y_TOP - 15}" x2="${cx - 6}" y2="${Y_TOP + 15}" stroke="${STROKE}" stroke-width="2.4"/>`);
    s.push(`<line x1="${cx + 6}" y1="${Y_TOP - 15}" x2="${cx + 6}" y2="${Y_TOP + 15}" stroke="${STROKE}" stroke-width="2.4"/>`);
  } else {
    s.push(inductorH(sx, Y_TOP, slen));
  }
  t.push(text(sx + slen / 2, Y_TOP - 24, d.seriesLabel, { size: 13, weight: 700, fill: ACCENT }));

  // ── 병렬 저항 2개 ────────────────────────────────────────────────
  for (const [x, label] of [[X_R1, d.r1Label], [X_R2, d.r2Label]] as Array<[number, string]>) {
    w.push(line(x, Y_TOP, x, 128));
    s.push(resistorV(x, 128, 196));
    w.push(line(x, 196, x, Y_BOT));
    t.push(text(x + 18, 166, label, { anchor: "start", size: 12.5, weight: 700, fill: ACCENT }));
    s.push(dot(x, Y_TOP), dot(x, Y_BOT));
  }

  s.push(ground(250, Y_BOT));
  t.push(text(W / 2, H - 10,
    d.isCapacitor
      ? "커패시터의 평균전력은 0 — 전원 전력은 두 저항이 모두 소비한다"
      : "인덕터의 평균전력은 0 — 전원 전력은 두 저항이 모두 소비한다",
    { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────────── 심벌 ───────────────────────────
function inductorH(x: number, y: number, len: number): string {
  const n = 4, r = len / (2 * n);
  let p = `M${x},${y}`;
  for (let i = 0; i < n; i++) p += ` a${r},${r} 0 0 1 ${2 * r},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function resistorV(x: number, y1: number, y2: number): string {
  const n = 6, h = (y2 - y1) / n, a = 8;
  let p = `M${x},${y1}`;
  for (let i = 0; i < n; i++) p += ` L${x + (i % 2 === 0 ? a : -a)},${y1 + h * (i + 0.5)}`;
  p += ` L${x},${y2}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function ground(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 14}" y1="${y + 12}" x2="${x + 14}" y2="${y + 12}" stroke="${STROKE}" stroke-width="1.8"/>` +
    `<line x1="${x - 9}" y1="${y + 17}" x2="${x + 9}" y2="${y + 17}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<line x1="${x - 4}" y1="${y + 22}" x2="${x + 4}" y2="${y + 22}" stroke="${STROKE}" stroke-width="1.4"/>`;
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
function svg(body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.join("\n")}\n</svg>`;
}
