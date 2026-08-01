import type { AcSuperpositionSourceDesignCircuitDiagram } from "@/types";

/**
 * 2전원 페이저 RLC 회로 (임용 5번 회로이론) — 전용 fixed-slot 렌더러. 원본 배치 그대로:
 *   상단 rail: [V_s 위] ─ R₁ ─ 마디 A ─ R₂ ─ [I_s 위]
 *   가운데 leg: A ─ R₃ ─ jX_L ─ (−jX_C) ─ 하단 rail,  목표 전압(V_c 또는 V_L)은 해당 소자 양단 +/−
 *   좌측: 교류 전압원(원 + 정현파 기호, V_s∠0°) / 우측: 교류 전류원(원 + ↑ 화살표, I_s∠−90°)
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

// ★ W는 전류원 라벨(I_s∠−90°[A], 우측 anchor=start)이 잘리지 않을 만큼 넉넉히 (규칙 #6 — 라벨 폭까지 감안).
const W = 650, H = 400;
const X_V = 90, X_A = 300, X_I = 470;   // 전압원 leg · 가운데 마디 · 전류원 leg
const Y_TOP = 70, Y_BOT = 340;

export function renderAcSuperpositionSourceDesignCircuit(d: AcSuperpositionSourceDesignCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 상단 rail: R₁ (좌) · R₂ (우)
  w.push(line(X_V, Y_TOP, 150, Y_TOP));
  hRes(s, t, 150, 240, Y_TOP, d.r1Label);
  w.push(line(240, Y_TOP, X_A, Y_TOP));
  w.push(line(X_A, Y_TOP, 350, Y_TOP));
  hRes(s, t, 350, 440, Y_TOP, d.r2Label);
  w.push(line(440, Y_TOP, X_I, Y_TOP));

  // ── 하단 rail
  w.push(line(X_V, Y_BOT, X_I, Y_BOT));

  // ── 좌: 교류 전압원 / 우: 교류 전류원
  acVSource(s, t, X_V, Y_TOP, Y_BOT, d.vsLabel);
  acISource(s, t, X_I, Y_TOP, Y_BOT, d.isLabel);

  // ── 가운데 leg: R₃ → jX_L → −jX_C (직렬), 목표 소자에 +/− 극성 표기
  const y1 = 110, y2 = 175, y3 = 240, y4 = 305;   // 소자 4개 구간 경계
  w.push(line(X_A, Y_TOP, X_A, y1));
  vRes(s, t, X_A, y1, y2, d.r3Label);
  vInductor(s, t, X_A, y2, y3, d.lLabel);
  vCap(s, t, X_A, y3, y4, d.cLabel);
  w.push(line(X_A, y4, X_A, Y_BOT));
  s.push(dot(X_A, Y_TOP));
  t.push(text(X_A + 12, Y_TOP - 10, "A", { size: 12, weight: 700, fill: ACCENT, anchor: "start" }));

  // 목표 전압 극성 (+ 위, − 아래) — 측정 소자 구간에 표기
  const [ty1, ty2] = d.targetOn === "capacitor" ? [y3, y4] : [y2, y3];
  t.push(text(X_A - 46, ty1 + 14, "+", { size: 13, weight: 700, fill: RED }));
  t.push(text(X_A - 46, ty2 - 4, "−", { size: 15, weight: 700, fill: RED }));
  t.push(text(X_A - 46, (ty1 + ty2) / 2 + 5, d.targetLabel, { size: 13, weight: 700, fill: ACCENT, anchor: "middle" }));

  // ── 접지
  ground(s, X_A, Y_BOT);

  t.push(text(W / 2, H - 10, "중첩의 원리: 전류원 개방 / 전압원 단락 → 두 결과의 합", { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────── 소자 헬퍼 ───────────────────────
/** 수평 저항 (지그재그), 라벨 위. */
function hRes(s: string[], t: string[], x1: number, x2: number, y: number, label: string): void {
  const cx = (x1 + x2) / 2, half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x1, y, cx - half, y), line(cx + half, y, x2, y));
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  s.push(path(p));
  t.push(text(cx, y - 16, label, { size: 11.5, weight: 600 }));
}
/** 수직 저항 (지그재그), 라벨 우측. */
function vRes(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, half = 24, a = 7, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(path(p));
  t.push(text(x + 16, cy + 4, label, { size: 11.5, weight: 600, anchor: "start" }));
}
/** 수직 인덕터 (반원 코일 4개), 라벨 우측. */
function vInductor(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, half = 24, coils = 4, step = (2 * half) / coils, r = step / 2;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < coils; i++) {
    const yA = cy - half + step * i, yB = yA + step;
    p += ` A${r},${r} 0 0 1 ${x},${yB}`;
  }
  s.push(path(p));
  t.push(text(x + 16, cy + 4, label, { size: 11.5, weight: 600, anchor: "start" }));
}
/** 수직 커패시터 (평행 두 판), 라벨 우측. */
function vCap(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, gap = 7, plate = 22;
  s.push(line(x, y1, x, cy - gap), line(x, cy + gap, x, y2));
  s.push(line(x - plate, cy - gap, x + plate, cy - gap));
  s.push(line(x - plate, cy + gap, x + plate, cy + gap));
  t.push(text(x + 28, cy + 4, label, { size: 11.5, weight: 600, anchor: "start" }));
}
/** 교류 전압원 (원 + 정현파 + 극성). */
function acVSource(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, r = 22;
  s.push(line(x, y1, x, cy - r), line(x, cy + r, x, y2));
  s.push(`<circle cx="${x}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(path(`M${x - 12},${cy} q6,-9 12,0 q6,9 12,0`));
  t.push(text(x + 30, cy - 14, "+", { size: 13, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(x + 30, cy + 20, "−", { size: 15, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(x - 30, cy + 4, label, { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));
}
/** 교류 전류원 (원 + 위 방향 화살표). */
function acISource(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, r = 22;
  s.push(line(x, y1, x, cy - r), line(x, cy + r, x, y2));
  s.push(`<circle cx="${x}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(line(x, cy + 13, x, cy - 10));
  s.push(`<path d="M${x},${cy - 15} l-5,8 l10,0 z" fill="${STROKE}"/>`);
  t.push(text(x + 30, cy + 4, label, { size: 12, weight: 700, fill: ACCENT, anchor: "start" }));
}
function ground(s: string[], x: number, y: number): void {
  s.push(line(x, y, x, y + 14));
  s.push(line(x - 12, y + 14, x + 12, y + 14));
  s.push(line(x - 7, y + 19, x + 7, y + 19));
  s.push(line(x - 3, y + 24, x + 3, y + 24));
}
function path(d: string): string {
  return `<path d="${d}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
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
