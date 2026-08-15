/**
 * 종속전원 포함 저항회로 + 점선 박스 + 전류계·전압계 — 임용 9번 (가) 전용 fixed-slot 렌더러.
 *
 * 원본 배치를 그대로 재현한다(원본 6배 확대로 확정):
 *   점선 박스 안: `V_s(+위) — R_a — ◇k·i_x(+왼쪽) — R_b — 마디 M — R_c — 단자 a`
 *                 `마디 M — R(i_x ↓) — 하단 rail`,  하단 rail → 단자 b
 *   점선 박스 밖: `a — Ⓐ(I_RL) — R_L(V_RL, +위) — b`, R_L에 Ⓥ 병렬
 *
 * ★ 점선 박스는 [단계 1]의 "단자 a-b의 **좌측 점선 부분**을 테브난 등가로"라는 발문과 직결된다 —
 *   박스가 없으면 무엇을 등가변환하라는 것인지 그림에서 읽을 수 없다.
 * ★ 미지 저항은 값 없이 **"R"** 로만 적는다(값을 적으면 [단계 1]의 답이 노출된다).
 */

import type { TheveninDepGraphCircuitDiagram } from "@/lib/generation/topologies/theveninDepGraphMaxPower";

const STROKE = "#111827";
const RED = "#dc2626";
const W_LINE = 1.6;
const FONT = `'Noto Sans CJK KR','Malgun Gothic',sans-serif`;

const W = 780, H = 330;
const TOP = 92, BOT = 258;
// ★ 전원 값 라벨(원 왼쪽)이 점선 박스 왼쪽 변에 닿지 않도록 X_SRC를 충분히 안쪽에 둔다(규칙 #6).
const X_SRC = 102;
const X_RA = 172, X_DEP = 264, X_RB = 350;
const X_M = 418, X_RC = 480, X_A = 540;
const BOX_L = 40, BOX_R = 516, BOX_T = 46, BOX_B = 288;
const X_AMM = 588, X_LOAD = 654, X_VM = 726;

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function line(x1: number, y1: number, x2: number, y2: number, w = W_LINE): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${w}" stroke-linecap="round"/>`;
}
function text(x: number, y: number, s: string, o: { size?: number; weight?: number; fill?: string; anchor?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}"` +
    ` font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}" font-family="${FONT}">${esc(s)}</text>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.6" fill="${STROKE}"/>`;
}

/** 가로 저항 — 라벨은 위(값)만. */
function hRes(cx: number, y: number, half: number, label: string): string {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W_LINE}" stroke-linejoin="round"/>` +
    text(cx, y - 16, label, { size: 12, weight: 600 });
}
/** 세로 저항 — 라벨은 오른쪽. */
function vRes(x: number, cy: number, half: number, label: string): string {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W_LINE}" stroke-linejoin="round"/>` +
    text(x + a + 9, cy + 4, label, { size: 13, weight: 600, anchor: "start" });
}

/** 직류 전압원 (원 + 극성) — 세로. */
function dcSource(cx: number, cy: number, label: string): string {
  const r = 23;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${W_LINE}"/>` +
    text(cx, cy - 4, "+", { size: 14, weight: 700, fill: RED }) +
    text(cx, cy + 16, "−", { size: 16, weight: 700, fill: RED }) +
    text(cx - r - 8, cy + 4, label, { size: 13, weight: 600, anchor: "end" });
}

/** 가로 종속 전압원 — 다이아몬드, + 왼쪽 (전류가 좌→우로 흐르며 전압 강하). */
function depSource(cx: number, cy: number, label: string): string {
  const r = 25;
  return `<path d="M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z" fill="white" stroke="${STROKE}" stroke-width="${W_LINE}"/>` +
    text(cx - 10, cy + 5, "+", { size: 13, weight: 700, fill: RED }) +
    text(cx + 10, cy + 5, "−", { size: 15, weight: 700, fill: RED }) +
    text(cx, cy - r - 8, label, { size: 13, weight: 600 });
}

/** 계기 (Ⓐ·Ⓥ). */
function meter(cx: number, cy: number, letter: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="18" fill="white" stroke="${STROKE}" stroke-width="${W_LINE}"/>` +
    text(cx, cy + 6, letter, { size: 15, weight: 600 });
}

function terminal(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${W_LINE}"/>`;
}

export function renderTheveninDepGraphCircuit(d: TheveninDepGraphCircuitDiagram): string {
  const s: string[] = [];

  // ── 점선 박스 (테브난 등가로 바꿀 좌측 부분)
  s.push(`<rect x="${BOX_L}" y="${BOX_T}" width="${BOX_R - BOX_L}" height="${BOX_B - BOX_T}"` +
    ` fill="none" stroke="${STROKE}" stroke-width="1.2" stroke-dasharray="6,4"/>`);

  // ── 좌측 전원 leg
  const cySrc = (TOP + BOT) / 2;
  s.push(line(X_SRC, TOP, X_SRC, cySrc - 23));
  s.push(line(X_SRC, cySrc + 23, X_SRC, BOT));
  s.push(dcSource(X_SRC, cySrc, `${d.Vs}V`));

  // ── 상단 rail: R_a → ◇ → R_b → M → R_c → a
  const segs: Array<[number, number]> = [[X_SRC, X_RA - 30], [X_RA + 30, X_DEP - 25], [X_DEP + 25, X_RB - 30], [X_RB + 30, X_M], [X_M, X_RC - 30], [X_RC + 30, X_A]];
  for (const [x1, x2] of segs) if (x2 > x1) s.push(line(x1, TOP, x2, TOP));
  s.push(hRes(X_RA, TOP, 30, `${d.Ra}Ω`));
  s.push(depSource(X_DEP, TOP, d.depLabel));
  s.push(hRes(X_RB, TOP, 30, `${d.Rb}Ω`));
  s.push(hRes(X_RC, TOP, 30, `${d.Rc}Ω`));

  // ── 마디 M → 미지 저항 R → 하단 rail
  const cyR = (TOP + BOT) / 2;
  s.push(line(X_M, TOP, X_M, cyR - 32));
  s.push(line(X_M, cyR + 32, X_M, BOT));
  s.push(vRes(X_M, cyR, 32, d.unknownLabel));
  s.push(dot(X_M, TOP));
  s.push(dot(X_M, BOT));

  // 제어 전류 i_x — R을 아래로 흐른다 (원본과 같은 방향)
  const ax = X_M - 26;
  s.push(line(ax, cyR - 20, ax, cyR + 12, 1.6).replace(STROKE, RED));
  s.push(`<path d="M${ax},${cyR + 18} L${ax - 4.5},${cyR + 9} L${ax + 4.5},${cyR + 9} Z" fill="${RED}"/>`);
  s.push(text(ax - 7, cyR - 22, d.currentLabel, { size: 13, weight: 700, fill: RED, anchor: "end" }));

  // ── 하단 rail + 단자 a·b
  s.push(line(X_SRC, BOT, X_A, BOT));
  s.push(terminal(X_A, TOP));
  s.push(terminal(X_A, BOT));
  s.push(text(X_A + 4, TOP - 12, "a", { size: 13, weight: 700, anchor: "start" }));
  s.push(text(X_A + 4, BOT + 20, "b", { size: 13, weight: 700, anchor: "start" }));

  // ── 점선 박스 밖: a — Ⓐ — R_L(Ⓥ 병렬) — b
  s.push(line(X_A + 5, TOP, X_AMM - 18, TOP));
  s.push(meter(X_AMM, TOP, "A"));
  s.push(line(X_AMM + 18, TOP, X_LOAD, TOP));
  // I_RL 화살표
  s.push(line(X_AMM + 24, TOP - 22, X_AMM + 54, TOP - 22));
  s.push(`<path d="M${X_AMM + 60},${TOP - 22} L${X_AMM + 51},${TOP - 26.5} L${X_AMM + 51},${TOP - 17.5} Z" fill="${STROKE}"/>`);
  s.push(text(X_AMM + 40, TOP - 30, "I_RL", { size: 12, weight: 600 }));

  const cyL = (TOP + BOT) / 2;
  s.push(line(X_LOAD, TOP, X_LOAD, cyL - 32));
  s.push(line(X_LOAD, cyL + 32, X_LOAD, BOT));
  s.push(vRes(X_LOAD, cyL, 32, d.loadLabel));
  s.push(text(X_LOAD - 40, cyL - 22, "+", { size: 14, weight: 700, fill: RED }));
  s.push(text(X_LOAD - 40, cyL + 30, "−", { size: 16, weight: 700, fill: RED }));
  s.push(text(X_LOAD - 40, cyL + 6, "V_RL", { size: 12, weight: 600 }));
  s.push(dot(X_LOAD, TOP));
  s.push(dot(X_LOAD, BOT));

  // 전압계 — R_L에 병렬
  s.push(line(X_LOAD, TOP, X_VM, TOP));
  s.push(line(X_VM, TOP, X_VM, cyL - 18));
  s.push(meter(X_VM, cyL, "V"));
  s.push(line(X_VM, cyL + 18, X_VM, BOT));
  s.push(line(X_LOAD, BOT, X_VM, BOT));
  s.push(line(X_A + 5, BOT, X_LOAD, BOT));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">\n${s.join("\n")}\n</svg>`;
}
