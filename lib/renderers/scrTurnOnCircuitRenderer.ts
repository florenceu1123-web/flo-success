import type { ScrTurnOnCircuitDiagram } from "@/types";

/**
 * SCR 턴온 회로 (가) 전용 fixed-slot 렌더러.
 *  +V ─ R_A(I_A) ─ 애노드 A ─[SCR 삼각형+게이트]─ 캐소드 K(접지). 게이트: V_G ─ R_G ─ G.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 470, H = 430;
const MX = 300;            // 메인 수직선 x
const RY0 = 60, RY1 = 120; // R_A 세로 범위
const AY = 168;            // 노드 A
const TRI_TOP = 178, TRI_APEX = 208; // SCR 삼각형
const KY = 258;            // 캐소드 K
const GND_Y = 282;
const GY = 208;            // 게이트 수평선 y (캐소드 바 레벨)

type D = ScrTurnOnCircuitDiagram;

export function renderScrTurnOnCircuit(d: D): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── +V 상단 ──
  t.push(text(MX, 34, d.supplyLabel, { size: 13, weight: 700 }));
  w.push(line(MX, 42, MX, RY0));
  s.push(dot(MX, 42));

  // ── R_A (세로 지그재그) + I_A ──
  s.push(resistorV(MX, RY0, RY1));
  t.push(text(MX - 14, (RY0 + RY1) / 2 + 4, d.rLabel, { size: 12, anchor: "end" }));
  // I_A 화살표 (아래 방향)
  w.push(line(MX + 42, RY0 + 8, MX + 42, RY1 - 8));
  s.push(`<polygon points="${MX + 38},${RY1 - 14} ${MX + 46},${RY1 - 14} ${MX + 42},${RY1 - 6}" fill="${STROKE}"/>`);
  t.push(text(MX + 48, (RY0 + RY1) / 2 + 4, d.iaLabel, { size: 12, weight: 700, fill: ACCENT, anchor: "start" }));

  // ── R_A → 노드 A ──
  w.push(line(MX, RY1, MX, AY));
  s.push(dot(MX, AY));
  t.push(text(MX + 16, AY - 2, "A", { size: 12, weight: 700, anchor: "start" }));

  // ── SCR 삼각형 (애노드 위→캐소드 아래) ──
  w.push(line(MX, AY, MX, TRI_TOP));
  s.push(`<polygon points="${MX - 18},${TRI_TOP} ${MX + 18},${TRI_TOP} ${MX},${TRI_APEX}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  // 캐소드 바
  w.push(line(MX - 18, TRI_APEX, MX + 18, TRI_APEX));
  // 캐소드 → K → 접지
  w.push(line(MX, TRI_APEX, MX, KY));
  t.push(text(MX + 16, KY - 4, "K", { size: 12, weight: 700, anchor: "start" }));
  w.push(line(MX, KY, MX, GND_Y));
  s.push(ground(MX, GND_Y));

  // ── 게이트 G (캐소드 바 왼쪽 → 좌측 수평) ──
  w.push(line(MX - 12, TRI_APEX, MX - 12, GY));   // 바 왼쪽에서 살짝
  w.push(line(MX - 12, GY, 250, GY));             // 왼쪽 수평
  s.push(dot(MX - 12, TRI_APEX));
  t.push(text(255, GY - 6, "G", { size: 12, weight: 700, anchor: "middle", fill: MUTED }));

  // ── R_G (게이트 저항) ──
  s.push(resistorH(180, GY, 250, GY));
  t.push(text(215, GY - 12, d.rGateLabel, { size: 12, anchor: "middle" }));
  w.push(line(180, GY, 118, GY));

  // ── V_G 전원 (좌측) ──
  w.push(line(118, GY, 118, 232));
  s.push(sourceCircle(118, 254, "+"));
  t.push(text(88, 254, d.vGateLabel, { size: 13, weight: 700, anchor: "end", fill: ACCENT }));
  w.push(line(118, 276, 118, 300));
  s.push(ground(118, 300));

  t.push(text(W / 2, H - 10, "SCR 턴온 회로 — 게이트 펄스로 t=0 턴온 후 래칭(I_A > I_H이면 게이트 제거돼도 ON 유지).", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function resistorV(x: number, y0: number, y1: number): string {
  const n = 6, dy = (y1 - y0) / n, amp = 8;
  let p = `M ${x} ${y0}`;
  for (let i = 0; i < n; i++) p += ` L ${x + (i % 2 === 0 ? amp : -amp)} ${y0 + dy * (i + 0.5)}`;
  p += ` L ${x} ${y1}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function resistorH(x0: number, y: number, x1: number, ignore?: number): string {
  const n = 6, dx = (x1 - x0) / n, amp = 7;
  let p = `M ${x0} ${y}`;
  for (let i = 0; i < n; i++) p += ` L ${x0 + dx * (i + 0.5)} ${y + (i % 2 === 0 ? -amp : amp)}`;
  p += ` L ${x1} ${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function sourceCircle(cx: number, cy: number, sign: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13">${sign}</text>` +
    `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="13">−</text>`;
}
function ground(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 4}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 12}" y1="${y + 4}" x2="${x + 12}" y2="${y + 4}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 7}" y1="${y + 9}" x2="${x + 7}" y2="${y + 9}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 3}" y1="${y + 14}" x2="${x + 3}" y2="${y + 14}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string { return `<circle cx="${x}" cy="${y}" r="3" fill="${STROKE}"/>`; }
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
