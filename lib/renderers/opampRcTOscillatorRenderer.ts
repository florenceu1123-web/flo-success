import type { OpampRcTOscillatorDiagram } from "@/types";

/**
 * 반전 OPAMP + 전방/귀환 T형 RC망 (임용 9번) — 전용 fixed-slot 렌더러.
 *
 *   V_in ─[Z₁]─ ① ─[Z₁]─ (−)      ①에서 [Y₁] 접지
 *   (−) ─[Z₂]─ ③ ─[Z₂]─ V_out      ③에서 [Y₂] 접지     (+)는 접지
 *   feedbackToInput 이면 V_out 을 V_in 단자로 되돌리는 배선을 추가한다 = (나) 발진기.
 *
 *  swapped=false(원본): 전방 R-R + 2C 접지 / 귀환 C-C + ½R 접지
 *  swapped=true(변형) : 전방 C-C + ½R 접지 / 귀환 R-R + 2C 접지
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 640, H = 340;
const Y_IN = 178;                 // 입력 라인 y (= (−) 단자)
const Y_FB = 68;                  // 귀환망 y
const X_IN = 60, X_N1 = 200, X_N2 = 300;   // V_in, 마디 ①, (−) 단자
const X_OP = 320, OP_W = 92, OP_H = 84;    // OPAMP 삼각형
const X_OUT = 560;                // 출력 단자
const X_N3 = 430;                 // 귀환망 마디 ③
const Y_BOT = 300;                // (나) 되먹임 배선 y

export function renderOpampRcTOscillator(d: OpampRcTOscillatorDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const fwdIsR = !d.swapped;                       // 전방 T가 R-R인가
  const R = d.rLabel ?? "R", C = d.cLabel ?? "C";
  const fwdSeries = fwdIsR ? "R" : "C";
  const fbSeries = fwdIsR ? "C" : "R";
  const fwdShunt = fwdIsR ? "2C" : "½R";
  const fbShunt = fwdIsR ? "½R" : "2C";

  // ── 입력 T (V_in → ① → (−)) ─────────────────────────────────────
  s.push(term(X_IN, Y_IN));
  t.push(text(X_IN - 10, Y_IN + 4, "V_in", { anchor: "end", size: 12, weight: 700 }));
  w.push(line(X_IN, Y_IN, 110, Y_IN));
  s.push(seriesSym(fwdSeries, 110, Y_IN, 60));
  t.push(text(140, Y_IN - 14, fwdSeries, { size: 12, weight: 700, fill: ACCENT }));
  w.push(line(170, Y_IN, X_N1, Y_IN));
  s.push(dot(X_N1, Y_IN));
  t.push(text(X_N1, Y_IN - 16, "①", { size: 12, weight: 700, fill: MUTED }));
  // ① 션트 → 접지
  w.push(line(X_N1, Y_IN, X_N1, Y_IN + 26));
  s.push(shuntSym(fwdShunt, X_N1, Y_IN + 26));
  w.push(line(X_N1, Y_IN + 66, X_N1, Y_IN + 82));
  s.push(ground(X_N1, Y_IN + 82));
  t.push(text(X_N1 + 16, Y_IN + 50, fwdShunt, { anchor: "start", size: 11.5, weight: 700, fill: ACCENT }));
  // ① → (−)
  s.push(seriesSym(fwdSeries, X_N1 + 4, Y_IN, 56));
  t.push(text(X_N1 + 32, Y_IN - 14, fwdSeries, { size: 12, weight: 700, fill: ACCENT }));
  w.push(line(X_N1 + 60, Y_IN, X_OP, Y_IN));
  // 전류 I₁ 화살표
  s.push(currentArrow(X_N1 + 24, Y_IN + 16));
  t.push(text(X_N1 + 34, Y_IN + 30, "I₁", { anchor: "start", size: 11.5, weight: 700, fill: MUTED }));
  s.push(dot(X_N2, Y_IN));

  // ── OPAMP (삼각형, − 위 / + 아래·접지) ───────────────────────────
  const opTop = Y_IN - OP_H / 2 + 10;
  s.push(`<polygon points="${X_OP},${opTop} ${X_OP},${opTop + OP_H} ${X_OP + OP_W},${opTop + OP_H / 2}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(X_OP + 12, Y_IN + 4, "−", { anchor: "start", size: 15, weight: 700 }));
  const yPlus = opTop + OP_H - 18;
  t.push(text(X_OP + 12, yPlus + 5, "+", { anchor: "start", size: 15, weight: 700 }));
  w.push(line(X_OP - 26, yPlus, X_OP, yPlus), line(X_OP - 26, yPlus, X_OP - 26, yPlus + 22));
  s.push(ground(X_OP - 26, yPlus + 22));
  const yOpOut = opTop + OP_H / 2;
  w.push(line(X_OP + OP_W, yOpOut, X_OUT, yOpOut));
  s.push(term(X_OUT, yOpOut));
  t.push(text(X_OUT + 12, yOpOut + 4, "V_out", { anchor: "start", size: 12, weight: 700 }));

  // ── 귀환 T ((−) → ③ → V_out), 위쪽 경로 ─────────────────────────
  w.push(line(X_N2, Y_IN, X_N2, Y_FB));
  w.push(line(X_N2, Y_FB, X_N2 + 20, Y_FB));
  s.push(seriesSym(fbSeries, X_N2 + 20, Y_FB, 58));
  t.push(text(X_N2 + 49, Y_FB - 14, fbSeries, { size: 12, weight: 700, fill: ACCENT }));
  w.push(line(X_N2 + 78, Y_FB, X_N3, Y_FB));
  s.push(dot(X_N3, Y_FB));
  t.push(text(X_N3, Y_FB - 16, "③", { size: 12, weight: 700, fill: MUTED }));
  // ③ 션트 → 접지
  w.push(line(X_N3, Y_FB, X_N3, Y_FB + 20));
  s.push(shuntSym(fbShunt, X_N3, Y_FB + 20));
  w.push(line(X_N3, Y_FB + 60, X_N3, Y_FB + 74));
  s.push(ground(X_N3, Y_FB + 74));
  t.push(text(X_N3 + 16, Y_FB + 44, fbShunt, { anchor: "start", size: 11.5, weight: 700, fill: ACCENT }));
  // ③ → V_out
  s.push(seriesSym(fbSeries, X_N3 + 4, Y_FB, 58));
  t.push(text(X_N3 + 33, Y_FB - 14, fbSeries, { size: 12, weight: 700, fill: ACCENT }));
  w.push(line(X_N3 + 62, Y_FB, X_OUT, Y_FB), line(X_OUT, Y_FB, X_OUT, yOpOut));
  s.push(dot(X_OUT, yOpOut));
  // 전류 I₂ 화살표
  s.push(currentArrow(X_N2 + 40, Y_FB + 16));
  t.push(text(X_N2 + 50, Y_FB + 30, "I₂", { anchor: "start", size: 11.5, weight: 700, fill: MUTED }));

  // ── (나) 출력 → 입력 되먹임 배선 ─────────────────────────────────
  if (d.feedbackToInput) {
    w.push(line(X_OUT, yOpOut, X_OUT + 34, yOpOut), line(X_OUT + 34, yOpOut, X_OUT + 34, Y_BOT));
    w.push(line(X_OUT + 34, Y_BOT, X_IN, Y_BOT), line(X_IN, Y_BOT, X_IN, Y_IN));
    t.push(text((X_IN + X_OUT) / 2, Y_BOT - 8, "출력단자를 입력단자에 연결 (사인파 발진기)", { size: 10.5, weight: 600, fill: ACCENT }));
  }

  t.push(text(W / 2, H - 26, `R = ${plain(R)},  C = ${plain(C)}  (연산증폭기는 이상적, (+) 단자 접지 → (−)는 가상접지)`, { size: 10, fill: MUTED }));
  if (d.caption) t.push(text(W / 2, H - 8, d.caption, { size: 12, weight: 700 }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────────── 심벌 ───────────────────────────
/** 가로 직렬 소자 — "R"·"C" (또는 그 변형 라벨) */
function seriesSym(kind: string, x: number, y: number, len: number): string {
  if (kind.includes("C")) {
    const cx = x + len / 2;
    return `<line x1="${x}" y1="${y}" x2="${cx - 5}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${cx - 5}" y1="${y - 12}" x2="${cx - 5}" y2="${y + 12}" stroke="${STROKE}" stroke-width="2.2"/>` +
      `<line x1="${cx + 5}" y1="${y - 12}" x2="${cx + 5}" y2="${y + 12}" stroke="${STROKE}" stroke-width="2.2"/>` +
      `<line x1="${cx + 5}" y1="${y}" x2="${x + len}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  }
  const n = 6, step = len / n, a = 7;
  let p = `M${x},${y}`;
  for (let i = 0; i < n; i++) p += ` L${x + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${x + len},${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
/** 세로 션트 소자 — "2C" 또는 "½R" */
function shuntSym(kind: string, x: number, y: number): string {
  if (kind.includes("C")) {
    const cy = y + 20;
    return `<line x1="${x}" y1="${y}" x2="${x}" y2="${cy - 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x - 13}" y1="${cy - 5}" x2="${x + 13}" y2="${cy - 5}" stroke="${STROKE}" stroke-width="2.2"/>` +
      `<line x1="${x - 13}" y1="${cy + 5}" x2="${x + 13}" y2="${cy + 5}" stroke="${STROKE}" stroke-width="2.2"/>` +
      `<line x1="${x}" y1="${cy + 5}" x2="${x}" y2="${y + 40}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  }
  const n = 6, step = 40 / n, a = 7;
  let p = `M${x},${y}`;
  for (let i = 0; i < n; i++) p += ` L${x + (i % 2 === 0 ? a : -a)},${y + step * (i + 0.5)}`;
  p += ` L${x},${y + 40}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function currentArrow(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x + 20}" y2="${y}" stroke="${MUTED}" stroke-width="1.2"/>` +
    `<polygon points="${x + 24},${y} ${x + 16},${y - 4} ${x + 16},${y + 4}" fill="${MUTED}"/>`;
}
function ground(x: number, y: number): string {
  return `<line x1="${x - 12}" y1="${y}" x2="${x + 12}" y2="${y}" stroke="${STROKE}" stroke-width="1.8"/>` +
    `<line x1="${x - 8}" y1="${y + 5}" x2="${x + 8}" y2="${y + 5}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<line x1="${x - 4}" y1="${y + 10}" x2="${x + 4}" y2="${y + 10}" stroke="${STROKE}" stroke-width="1.4"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
}
function term(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function plain(v: string): string {
  return String(v ?? "").replaceAll("\\,", " ").replaceAll("\\mathrm{k\\Omega}", "kΩ").replaceAll("\\mathrm{nF}", "nF")
    .replaceAll("\\mathrm{", "").replaceAll("{", "").replaceAll("}", "");
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
