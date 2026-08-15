/**
 * (+)단자 3입력 평균 + 2단 중첩 — 임용 8번 (가) 전용 fixed-slot 렌더러.
 *
 * 원본 배치를 그대로 재현한다(원본 5배 확대로 확정):
 *   1단 U₁ — ★(+)단자에 입력 3개★가 각각 R_in을 거쳐 **한 마디**에 모여 (+)로 들어간다.
 *            (+) 마디에서 접지로 내려가는 저항은 **없다**(있으면 형제 opamp_two_stage_rx가 된다).
 *            (−)단자는 `접지 ─ R_g ─ (−)` + `(−) ─ R_f1 ─ V₁` 궤환.
 *   2단 U₂ — `V₁ ─ R ─ (−)`, `(−) ─ R_f2 ─ 단자 a(V_o)`, (+)에는 직류 전원 V₂.
 *
 * ★ 미지 저항은 값 없이 기호("R" 또는 "R_f")로만 적는다 — 값을 적으면 [단계 3]의 답이 노출된다.
 */

import type { OpampAvgSuperpositionCircuitDiagram } from "@/lib/generation/topologies/opampAvgSuperpositionR";

const STROKE = "#111827";
const RED = "#dc2626";
const W_LINE = 1.6;
const FONT = `'Noto Sans CJK KR','Malgun Gothic',sans-serif`;

const W = 820, H = 440;
const Y_TOP = 96;                     // 접지—R_g—(−) 및 궤환이 지나는 상단 레인
const X_GND = 68, X_RG = 176, X_N1 = 268;
const U1_L = 336, U1_R = 410, U1_CY = 190;
const Y_MINUS1 = U1_CY - 24, Y_PLUS1 = U1_CY + 24;
const X_TRUNK = 300;                  // (+) 마디 세로 트렁크
const X_V1 = 452;
const X_R2 = 528, X_N3 = 592;
const U2_L = 620, U2_R = 694, U2_CY = 232;
const Y_MINUS2 = U2_CY - 24, Y_PLUS2 = U2_CY + 24;
const X_A = 748;

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const line = (x1: number, y1: number, x2: number, y2: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${W_LINE}" stroke-linecap="round"/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${STROKE}"/>`;
function text(x: number, y: number, s: string, o: { size?: number; weight?: number; fill?: string; anchor?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}"` +
    ` font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}" font-family="${FONT}">${esc(s)}</text>`;
}

/** 가로 저항 (라벨 위). */
function hRes(cx: number, y: number, label: string, half = 26): string {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W_LINE}" stroke-linejoin="round"/>` +
    text(cx, y - 14, label, { size: 12, weight: 600 });
}

/** 접지 기호. */
function ground(x: number, y: number): string {
  return line(x, y, x, y + 10) +
    line(x - 12, y + 10, x + 12, y + 10) + line(x - 7, y + 15, x + 7, y + 15) + line(x - 3, y + 20, x + 3, y + 20);
}

/** 직류 전압원 (원 + 극성) — 세로, 아래는 접지. */
function dcSource(cx: number, cy: number, label: string, nameRight?: string): string {
  const r = 19;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${W_LINE}"/>` +
    text(cx, cy - 3, "+", { size: 13, weight: 700, fill: RED }) +
    text(cx, cy + 15, "−", { size: 15, weight: 700, fill: RED }) +
    text(cx - r - 6, cy + 4, label, { size: 12, weight: 600, anchor: "end" }) +
    (nameRight ? text(cx + r + 6, cy + 4, nameRight, { size: 12, weight: 600, anchor: "start" }) : "") +
    line(cx, cy + r, cx, cy + r + 14) + ground(cx, cy + r + 14);
}

/** OPAMP 삼각형 — 좌변에 −(위)/+(아래) 핀, 우측 꼭짓점이 출력. */
function opamp(xl: number, xr: number, cy: number, name: string): string {
  const h = 46;
  return `<path d="M${xl},${cy - h} L${xr},${cy} L${xl},${cy + h} Z" fill="white" stroke="${STROKE}" stroke-width="${W_LINE}"/>` +
    text(xl + 16, cy - 18, "−", { size: 15, weight: 700 }) +
    text(xl + 16, cy + 26, "+", { size: 14, weight: 700 }) +
    text((xl + xr) / 2, cy - h - 8, name, { size: 12, weight: 700, fill: "#1d4ed8" });
}

export function renderOpampAvgSuperpositionCircuit(d: OpampAvgSuperpositionCircuitDiagram): string {
  const s: string[] = [];
  const n = d.inputs.length;

  // ── 1단 (−) 경로: 접지 — R_g — N1 — (−),  그리고 N1 — R_f1 — V₁ (상단 레인)
  s.push(ground(X_GND, Y_TOP));
  s.push(line(X_GND, Y_TOP, X_RG - 26, Y_TOP));
  s.push(hRes(X_RG, Y_TOP, `${d.Rg}kΩ`));
  s.push(line(X_RG + 26, Y_TOP, X_N1, Y_TOP));
  s.push(dot(X_N1, Y_TOP));
  s.push(line(X_N1, Y_TOP, X_N1, Y_MINUS1), line(X_N1, Y_MINUS1, U1_L, Y_MINUS1));
  s.push(line(X_N1, Y_TOP, (X_N1 + X_V1) / 2 - 26, Y_TOP));
  s.push(hRes((X_N1 + X_V1) / 2, Y_TOP, `${d.Rf1}kΩ`));
  s.push(line((X_N1 + X_V1) / 2 + 26, Y_TOP, X_V1, Y_TOP), line(X_V1, Y_TOP, X_V1, U1_CY));

  // ── 1단 (+) 경로: 입력 n개가 각각 R_in을 거쳐 트렁크 한 마디에 모인다
  const rowY: number[] = [];
  for (let i = 0; i < n; i++) rowY.push(Y_PLUS1 + i * 52);
  s.push(line(X_TRUNK, rowY[0], X_TRUNK, rowY[n - 1]));
  s.push(line(X_TRUNK, Y_PLUS1, U1_L, Y_PLUS1));
  for (let i = 0; i < n; i++) {
    const y = rowY[i];
    const xs = 84 + i * 54;                       // 원본처럼 아래 행일수록 오른쪽에서 시작(계단식)
    const cx = (xs + X_TRUNK) / 2;
    s.push(line(xs, y, cx - 26, y));
    s.push(hRes(cx, y, `${d.Rin}kΩ`));
    s.push(line(cx + 26, y, X_TRUNK, y));
    if (i > 0) s.push(dot(X_TRUNK, y));
    s.push(line(xs, y, xs, y + 32));
    s.push(dcSource(xs, y + 51, `${d.inputs[i]}V`));
  }
  s.push(dot(X_TRUNK, Y_PLUS1));
  s.push(opamp(U1_L, U1_R, U1_CY, "U₁"));

  // ── 1단 출력 V₁
  s.push(line(U1_R, U1_CY, X_V1, U1_CY));
  s.push(dot(X_V1, U1_CY));
  s.push(text(X_V1, U1_CY + 20, "V₁", { size: 13, weight: 700, fill: "#1d4ed8" }));

  // ── 2단: V₁ — R — N3 — (−),  N3 — R_f2 — V_o (상단 레인)
  s.push(line(X_V1, U1_CY, X_R2 - 26, U1_CY));
  s.push(hRes(X_R2, U1_CY, d.seriesLabel));
  s.push(line(X_R2 + 26, U1_CY, X_N3, U1_CY));
  s.push(dot(X_N3, U1_CY));
  s.push(line(X_N3, U1_CY, X_N3, Y_MINUS2), line(X_N3, Y_MINUS2, U2_L, Y_MINUS2));
  const yFb2 = Y_TOP + 24;
  s.push(line(X_N3, U1_CY, X_N3, yFb2), line(X_N3, yFb2, (X_N3 + X_A) / 2 - 26, yFb2));
  s.push(hRes((X_N3 + X_A) / 2, yFb2, d.feedbackLabel));
  s.push(line((X_N3 + X_A) / 2 + 26, yFb2, X_A, yFb2), line(X_A, yFb2, X_A, U2_CY));

  // ── 2단 (+): V₂ 전원
  s.push(line(U2_L, Y_PLUS2, X_R2, Y_PLUS2), line(X_R2, Y_PLUS2, X_R2, Y_PLUS2 + 30));
  s.push(dcSource(X_R2, Y_PLUS2 + 49, `${d.V2}V`, "V₂"));
  s.push(opamp(U2_L, U2_R, U2_CY, "U₂"));

  // ── 출력 단자 a / V_o
  s.push(line(U2_R, U2_CY, X_A + 26, U2_CY));
  s.push(dot(X_A, U2_CY));
  s.push(text(X_A, U2_CY + 20, "a", { size: 13, weight: 700 }));
  s.push(text(X_A + 32, U2_CY + 4, "V_o", { size: 13, weight: 700, fill: "#1d4ed8", anchor: "start" }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">\n${s.join("\n")}\n</svg>`;
}
