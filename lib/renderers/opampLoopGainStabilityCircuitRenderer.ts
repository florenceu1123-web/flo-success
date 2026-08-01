import type { OpampLoopGainCircuitDiagram } from "@/types";

/**
 * OPAMP 루프이득 + 안정도 (임용 12번 전자회로) — 전용 fixed-slot 렌더러.
 *
 *  (가) variant="original":     접지─R_a─V⁻ / 상단 R_f: V⁻↔출력 / V⁺─R_p─출력 / V⁺─R_S─V_s─접지
 *  (나) variant="loop_broken":  V_s 제거(R_S 접지) + **출력에서 루프 절단** — 연산증폭기 출력=V_r(개방),
 *                               귀환망은 별도 단자 V_t가 구동.
 *  ★ invertingSource=true(변형)면 R_S·전원 가지가 **반전 단자** 쪽, 분압망이 비반전 단자 쪽으로 교환된다.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const W = 640, H = 430;

// 고정 슬롯 좌표
const X_GND = 52, X_DIV = 150, X_SRC = 172;
const X_OP_L = 205, X_OP_R = 330, X_OUT = 500, X_TERM = 570;
const Y_TOP = 78, Y_MID = 177, Y_LOW = 252;
const Y_OP_T = 127, Y_OP_B = 227;

export function renderOpampLoopGainStabilityCircuit(d: OpampLoopGainCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const broken = d.variant === "loop_broken";
  const driveLabel = d.driveLabel ?? "V_t";
  // ★ 기하는 항상 고정 — 분압망=위쪽 핀, 전원+R_S=아래쪽 핀.
  //   변형(invertingSource)은 **단자 극성 기호만 교환**한다. 좌표까지 뒤집으면 전원 레인이
  //   분압 배선을 가로질러 가짜 접점처럼 보인다(시각검증에서 발견).
  const divPinY = Y_OP_T + 23;
  const srcPinY = Y_OP_B - 22;
  const divSign = d.invertingSource ? "+" : "−";
  const srcSign = d.invertingSource ? "−" : "+";
  const divName = d.invertingSource ? "V⁺" : "V⁻";
  const srcName = d.invertingSource ? "V⁻" : "V⁺";

  // ── 분압망: 접지 ─ R_a ─ (분압 노드) ─ OPAMP 핀,  상단 R_f ─ 출력
  ground(s, X_GND, divPinY);
  hRes(s, t, X_GND + 14, X_DIV - 6, divPinY, d.raLabel ?? "R");
  w.push(line(X_GND, divPinY, X_GND + 14, divPinY), line(X_DIV - 6, divPinY, X_OP_L, divPinY));
  s.push(dot(X_DIV, divPinY));
  t.push(text(X_DIV + 24, divPinY - 9, divName, { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));
  w.push(line(X_DIV, divPinY, X_DIV, Y_TOP));
  hRes(s, t, X_DIV + 18, X_OUT - 24, Y_TOP, d.rfLabel ?? "R");
  w.push(line(X_DIV, Y_TOP, X_DIV + 18, Y_TOP), line(X_OUT - 24, Y_TOP, X_OUT, Y_TOP), line(X_OUT, Y_TOP, X_OUT, Y_MID));

  // ── 전원 가지: (전원 노드) ─ OPAMP 핀,  아래로 R_S ─ V_s(또는 접지),  옆으로 R_p ─ 출력
  w.push(line(X_SRC, srcPinY, X_OP_L, srcPinY));
  t.push(text(X_SRC + 26, srcPinY + 16, srcName, { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));
  w.push(line(X_SRC, srcPinY, X_SRC, Y_LOW));
  s.push(dot(X_SRC, Y_LOW));
  // R_p (정귀환 경로) — 출력까지 수평
  hRes(s, t, X_SRC + 20, X_OUT - 24, Y_LOW, d.rpLabel ?? "R");
  w.push(line(X_SRC, Y_LOW, X_SRC + 20, Y_LOW), line(X_OUT - 24, Y_LOW, X_OUT, Y_LOW), line(X_OUT, Y_LOW, X_OUT, Y_MID));
  // R_S (수직) → 전원 또는 접지
  vRes(s, t, X_SRC, Y_LOW + 20, Y_LOW + 70, d.rsLabel ?? "R_S");
  w.push(line(X_SRC, Y_LOW, X_SRC, Y_LOW + 20));
  if (broken) {
    // V_s 제거 → 접지 (해석 절차의 전제)
    w.push(line(X_SRC, Y_LOW + 70, X_SRC, Y_LOW + 84));
    ground(s, X_SRC, Y_LOW + 84);
    t.push(text(X_SRC + 60, Y_LOW + 96, "(V_s 제거)", { size: 10.5, fill: MUTED, anchor: "middle" }));
  } else {
    w.push(line(X_SRC, Y_LOW + 70, X_SRC, Y_LOW + 84));
    dcSource(s, t, X_SRC, Y_LOW + 104, d.sourceLabel ?? "V_s");
    w.push(line(X_SRC, Y_LOW + 124, X_SRC, Y_LOW + 134));
    ground(s, X_SRC, Y_LOW + 134);
  }

  // ── OPAMP 삼각형
  s.push(`<path d="M${X_OP_L},${Y_OP_T} L${X_OP_L},${Y_OP_B} L${X_OP_R},${Y_MID} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(X_OP_L + 14, divPinY + 5, divSign, { size: divSign === "−" ? 15 : 13, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(X_OP_L + 14, srcPinY + 5, srcSign, { size: srcSign === "−" ? 15 : 13, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(X_OP_L + 48, Y_MID + 5, d.asLabel ?? "A(s)", { size: 12.5, weight: 700, fill: ACCENT }));

  // ── 출력단
  if (broken) {
    // 연산증폭기 출력 = V_r (개방 단자), 귀환망은 별도 단자 V_t가 구동 → **루프 절단**
    w.push(line(X_OP_R, Y_MID, X_OP_R + 48, Y_MID));
    s.push(term(X_OP_R + 54, Y_MID));
    t.push(text(X_OP_R + 64, Y_MID + 5, tex(d.outLabel ?? "V_r"), { size: 12.5, weight: 700, fill: ACCENT, anchor: "start" }));
    s.push(dot(X_OUT, Y_MID));
    w.push(line(X_OUT, Y_MID, X_TERM - 6, Y_MID));
    s.push(term(X_TERM, Y_MID));
    t.push(text(X_TERM + 10, Y_MID + 5, tex(driveLabel), { size: 12.5, weight: 700, fill: ACCENT, anchor: "start" }));
    // 절단 표시 (점선 갭)
    s.push(`<line x1="${X_OP_R + 70}" y1="${Y_MID - 26}" x2="${X_OUT - 24}" y2="${Y_MID + 26}" stroke="${RED}" stroke-width="1.2" stroke-dasharray="4 3"/>`);
    t.push(text((X_OP_R + 70 + X_OUT - 24) / 2, Y_MID - 34, "루프 절단", { size: 10, weight: 700, fill: RED }));
  } else {
    w.push(line(X_OP_R, Y_MID, X_TERM - 6, Y_MID));
    s.push(dot(X_OUT, Y_MID));
    s.push(term(X_TERM, Y_MID));
    t.push(text(X_TERM + 10, Y_MID + 5, tex(d.outLabel ?? "V_out"), { size: 12.5, weight: 700, fill: ACCENT, anchor: "start" }));
  }

  const cap = broken
    ? "(나) V_s 제거 + 귀환 루프 절단 후 V_t 인가 → 루프이득 L(s) = V_r / V_t"
    : "(가) 연산 증폭기 응용 회로 (A(s) = A₀ω₀/s)";
  t.push(text(W / 2, H - 12, cap, { size: 10.5, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────── 헬퍼 ───────────────────────
function hRes(s: string[], t: string[], x1: number, x2: number, y: number, label: string): void {
  const cx = (x1 + x2) / 2, half = 24, amp = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x1, y, cx - half, y), line(cx + half, y, x2, y));
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -amp : amp)}`;
  p += ` L${cx + half},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(cx, y - 12, tex(label), { size: 11.5, weight: 700, fill: ACCENT }));
}
function vRes(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, half = 20, amp = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -amp : amp)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(x - 14, cy + 4, tex(label), { size: 11.5, weight: 700, fill: ACCENT, anchor: "end" }));
}
/** 직류 전압원 (원 + 극성) */
function dcSource(s: string[], t: string[], x: number, y: number, label: string): void {
  s.push(`<circle cx="${x}" cy="${y}" r="20" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(x, y - 4, "+", { size: 13, weight: 700, fill: RED }));
  t.push(text(x, y + 14, "−", { size: 14, weight: 700, fill: RED }));
  t.push(text(x - 28, y + 4, tex(label), { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));
}
function ground(s: string[], x: number, y: number): void {
  s.push(line(x, y, x, y + 12));
  s.push(line(x - 11, y + 12, x + 11, y + 12));
  s.push(line(x - 6, y + 17, x + 6, y + 17));
  s.push(line(x - 2, y + 22, x + 2, y + 22));
}
function term(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 간단 TeX → 평문 (라벨용) */
function tex(str: string): string {
  return String(str ?? "")
    .replace(/\\,/g, " ")
    .replace(/\\mathrm\{([^}]*)\}/g, "$1")
    .replace(/\\Omega/g, "Ω")
    .replace(/\\omega/g, "ω")
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
