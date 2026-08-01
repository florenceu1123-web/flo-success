/**
 * 종속전류원(g·V_c) 2단 구동 페이저 회로 전용 fixed-slot 렌더러 (임용 3번 회로이론).
 *
 *  원본 배치 그대로:
 *    좌측망: AC 전압원(세로) ─ 상단 rail의 R₁ 박스 ─ 마디 A ─ shunt 소자 2개 병렬(세로) ─ 하단 rail,
 *            마디 A 우측에 V_c 극성(+/−) 표기.
 *    우측망: 종속전류원 다이아몬드(g·V_c, ↑) ─ 마디 B ─ [ R₂ 박스 ∥ 부하 리액턴스 박스 ] ─ 하단 rail,
 *            R₂ 가지에 I_R 화살표(↓).
 *    두 망은 하단 rail(공통 접지)만 공유한다 — 상단은 이어지지 않는다 (종속전류원이 2단을 구동).
 *
 *  주파수 영역 표기(원본 style): 저항·부하 리액턴스는 임피던스 박스, shunt 소자는 C 평행판 / L 코일.
 */

import type { AcVccsPhasorCircuitDiagram } from "@/types";

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderAcVccsPhasorCircuit(d: AcVccsPhasorCircuitDiagram): string {
  const W = 820, H = 380;
  const yTop = 100, yBot = 300;

  // 좌측망 슬롯 (라벨 폭까지 감안한 고정 슬롯 — 겹침 0)
  const xSrc = 130, xR1a = 185, xR1b = 255, xSh1 = 300, xSh2 = 390, xVc = 445;
  // 우측망 슬롯
  const xDep = 530, xR2 = 645, xLd = 740;
  const xGnd = 487; // 공통 접지 (두 망 사이 하단)

  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 좌측망 ──
  s.push(acVSource(xSrc, yTop, yBot));
  t.push(text(xSrc - 28, (yTop + yBot) / 2 + 4, d.srcLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // 상단 rail: 전원 → R₁(지그재그) → 마디 A → V_c 표기점
  w.push(line(xSrc, yTop, xR1a, yTop));
  hRes(s, t, xR1a, xR1b, yTop, d.r1Label);
  w.push(line(xR1b, yTop, xVc, yTop));
  s.push(dot(xSh1, yTop), dot(xSh2, yTop));

  // shunt 소자 2개 병렬 (마디 A ↔ 접지) — 라벨은 좌측
  if (d.shuntKind === "C") {
    vCap(s, t, xSh1, yTop, yBot, d.shunt1Label, "left");
    vCap(s, t, xSh2, yTop, yBot, d.shunt2Label, "left");
  } else {
    vCoil(s, t, xSh1, yTop, yBot, d.shunt1Label, "left");
    vCoil(s, t, xSh2, yTop, yBot, d.shunt2Label, "left");
  }
  s.push(dot(xSh1, yBot), dot(xSh2, yBot));

  // V_c 극성 표기 (마디 A 전압) — 소자 없이 +/− 마커만 (원본 동일)
  t.push(text(xVc + 12, yTop + 22, "+", { size: 15, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(xVc + 12, (yTop + yBot) / 2 + 5, d.vcLabel, { size: 14, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(xVc + 12, yBot - 12, "−", { size: 15, weight: 700, fill: RED, anchor: "start" }));
  s.push(`<line x1="${xVc}" y1="${yTop}" x2="${xVc}" y2="${yTop + 8}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<line x1="${xVc}" y1="${yBot - 8}" x2="${xVc}" y2="${yBot}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<line x1="${xVc}" y1="${yTop + 8}" x2="${xVc}" y2="${yBot - 8}" stroke="${RED}" stroke-width="1" stroke-dasharray="4 4"/>`);

  // ── 우측망 ──
  // 종속전류원 (다이아몬드, 접지 → 마디 B로 전류 공급 ↑).
  //   ★ 라벨은 다이아몬드 ★위★ — 좌측(V_c 표기)·우측(I_R 화살표) 어느 쪽에 둬도 라벨이 겹친다.
  s.push(depISource(xDep, yTop, yBot));
  t.push(text(xDep, (yTop + yBot) / 2 - 32, d.depLabel, { size: 13, weight: 700, fill: ACCENT }));

  // 우측 상단 rail: 종속전류원 → R₂ → 부하 리액턴스
  w.push(line(xDep, yTop, xLd, yTop));
  s.push(dot(xR2, yTop), dot(xDep, yTop));

  // R₂(지그재그, I_R 흐르는 저항) + 부하 리액턴스(L=코일 / C=평행판) — 라벨은 둘 다 우측
  //   (R₂ 좌측은 I_R 화살표가, 부하 좌측은 R₂ 라벨이 쓰므로 겹침 방지)
  vRes(s, t, xR2, yTop, yBot, d.loadRLabel);
  if (d.loadKind === "L") vCoil(s, t, xLd, yTop, yBot, d.loadXLabel, "right");
  else vCap(s, t, xLd, yTop, yBot, d.loadXLabel, "right");
  s.push(dot(xR2, yBot), dot(xLd, yBot));

  // I_R 화살표 (R₂ 가지, 아래 방향)
  arrowDown(s, t, xR2 - 24, yTop + 14, yTop + 44, d.irLabel);

  // ── 하단 rail (공통 접지) ──
  w.push(line(xSrc, yBot, xLd, yBot));
  s.push(ground(xGnd, yBot));

  t.push(text(W / 2, H - 8, "좌측망 → V_c · 종속전류원이 우측망 구동 → I_R (두 망은 접지만 공유)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ════════════ 소자 헬퍼 ════════════
/** 가로 저항 (지그재그). */
function hRes(s: string[], t: string[], x1: number, x2: number, y: number, label: string): void {
  const cx = (x1 + x2) / 2, half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x1, y, cx - half, y), line(cx + half, y, x2, y));
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(cx, y - a - 10, label, { size: 12, weight: 600 }));
}
/** 세로 저항 (지그재그). */
function vRes(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, half = 28, a = 7, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(x + a + 8, cy + 4, label, { size: 12, weight: 600, anchor: "start" }));
}
type Side = "left" | "right";
/** 소자 라벨 — side에 따라 심볼 좌/우에 배치 (인접 라벨과 겹치지 않게 호출부가 선택). */
function sideLabel(t: string[], x: number, cy: number, gap: number, label: string, side: Side): void {
  t.push(
    side === "left"
      ? text(x - gap, cy + 4, label, { size: 12, weight: 600, anchor: "end" })
      : text(x + gap, cy + 4, label, { size: 12, weight: 600, anchor: "start" }),
  );
}
/** 세로 커패시터 (평행판). */
function vCap(s: string[], t: string[], x: number, y1: number, y2: number, label: string, side: Side): void {
  const cy = (y1 + y2) / 2, g = 5, pw = 14;
  s.push(line(x, y1, x, cy - g), line(x, cy + g, x, y2));
  s.push(`<line x1="${x - pw}" y1="${cy - g}" x2="${x + pw}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  s.push(`<line x1="${x - pw}" y1="${cy + g}" x2="${x + pw}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  sideLabel(t, x, cy, pw + 6, label, side);
}
/** 세로 인덕터 (코일). */
function vCoil(s: string[], t: string[], x: number, y1: number, y2: number, label: string, side: Side): void {
  const cy = (y1 + y2) / 2, sh = 24, n = 4, r = sh / n;
  s.push(line(x, y1, x, cy - sh), line(x, cy + sh, x, y2));
  let p = `M${x},${cy - sh}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 0 ${x},${cy - sh + r * (2 * i + 2)}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  sideLabel(t, x, cy, r + 8, label, side);
}
/** AC 전압원 (세로, 원+사인파+극성). */
function acVSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  const sine = `<path d="M${cx - 12},${cy} Q${cx - 6},${cy - 8} ${cx},${cy} T${cx + 12},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx + r + 4}" y="${cy - r + 10}" font-size="12" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx + r + 4}" y="${cy + r - 2}" font-size="14" font-weight="700" fill="${RED}">−</text>`;
}
/** 종속전류원 (다이아몬드 + 위 방향 전류 화살표). */
function depISource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 24;
  const dia = `<path d="M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const arr = `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 8}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<path d="M${cx - 4.5},${cy - 5} L${cx},${cy - 13} L${cx + 4.5},${cy - 5} Z" fill="${STROKE}"/>`;
  return `${dia}${arr}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 접지 심볼. */
function ground(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 13}" y1="${y + 12}" x2="${x + 13}" y2="${y + 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 8}" y1="${y + 17}" x2="${x + 8}" y2="${y + 17}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 3}" y1="${y + 22}" x2="${x + 3}" y2="${y + 22}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 전류 화살표 (아래 방향) + 라벨. */
function arrowDown(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  s.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${ACCENT}" stroke-width="1.6"/>`);
  s.push(`<path d="M${x - 4},${y2 - 7} L${x},${y2} L${x + 4},${y2 - 7} Z" fill="${ACCENT}"/>`);
  t.push(text(x - 6, (y1 + y2) / 2 + 4, label, { size: 13, weight: 700, fill: ACCENT, anchor: "end" }));
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
function svg(w2: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w2} ${h}">\n${body.join("\n")}\n</svg>`;
}
