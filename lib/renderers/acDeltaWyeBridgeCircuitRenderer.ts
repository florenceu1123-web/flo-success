import type { AcDeltaWyeArm, AcDeltaWyeBridgeCircuitDiagram, AcDeltaWyeEquivCircuitDiagram } from "@/types";

/**
 * 교류 브리지 (가) + Δ-Y 변환 등가 (나) 전용 fixed-slot 렌더러 (임용 2번 회로이론).
 *
 *  (가) 다이아몬드 5-arm: 상단=단자 A, 하단=단자 B, 좌마디 L, 우마디 R.
 *      topLeft=A→L, topRight=A→R, bridge=L→R(가운데 수평), botLeft=L→B, botRight=R→B.
 *      좌측 세로에 교류 전원 V∠0°, 상단 rail에 전류 I 화살표.
 *  (나) 상단 델타(A,L,R)만 Y로 치환 — Z_A(세로 박스) → 마디 N → 좌·우 Z 박스 → 하단 2 arm → B.
 *      ★ Y 세 팔은 학생이 구하는 값이므로 **빈 박스**로 둔다(값 표기 금지 — 답 노출).
 *
 *  ★ 렌더 규칙: 대각 arm 라벨은 다이아몬드 **바깥쪽**으로 밀어 가교 소자·라벨과 겹치지 않게 한다
 *    (CLAUDE.md Layout 규칙 #6).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";
const DASH = "#9ca3af";

// ── (가) 좌표 ──
const W = 700, H = 480;
const NA = { x: 400, y: 105 };   // 단자 A (다이아몬드 상단)
const NB = { x: 400, y: 385 };   // 단자 B (다이아몬드 하단)
const NL = { x: 268, y: 245 };   // 좌 마디
const NR = { x: 532, y: 245 };   // 우 마디
const SRC_X = 110;

export function renderAcDeltaWyeBridgeCircuit(d: AcDeltaWyeBridgeCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 점선 박스 (브리지 영역)
  s.push(dashRect(NL.x - 52, NA.y + 22, NR.x - NL.x + 104, NB.y - NA.y - 44));

  // ── 전원 + 상·하단 rail ──
  s.push(acSource(SRC_X, NA.y, NB.y));
  t.push(text(SRC_X - 32, (NA.y + NB.y) / 2 + 4, d.vLabel ?? "V", { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  // ★ 극성: 전류 I가 단자 A(위)로 유입되므로 **위가 +** 다 (원본 그림과 동일).
  t.push(text(SRC_X - 32, (NA.y + NB.y) / 2 - 14, "+", { anchor: "end", size: 13, weight: 700 }));
  t.push(text(SRC_X - 32, (NA.y + NB.y) / 2 + 22, "−", { anchor: "end", size: 13, weight: 700 }));
  w.push(line(SRC_X, NA.y, NA.x, NA.y));
  w.push(line(SRC_X, NB.y, NB.x, NB.y));

  // 전류 I 화살표 (상단 rail, A로 유입)
  const iX = (SRC_X + NA.x) / 2;
  s.push(arrowRight(iX - 16, NA.y, iX + 16));
  t.push(text(iX, NA.y - 14, d.iLabel ?? "I[A]", { size: 13, weight: 700, fill: ACCENT }));

  // ── 5 arm ──
  elemOnEdge(s, t, NA, NL, d.arms.topLeft, "out");
  elemOnEdge(s, t, NA, NR, d.arms.topRight, "out");
  elemOnEdge(s, t, NL, NB, d.arms.botLeft, "out");
  elemOnEdge(s, t, NR, NB, d.arms.botRight, "out");
  // 가교 arm (수평, L↔R) — 라벨은 위쪽
  elemOnEdge(s, t, NL, NR, d.arms.bridge, "up");

  // 노드 dot + 단자 라벨
  for (const p of [NA, NB, NL, NR]) s.push(dot(p.x, p.y));
  t.push(text(NA.x, NA.y - 16, "A", { size: 15, weight: 700 }));
  t.push(text(NB.x, NB.y + 26, "B", { size: 15, weight: 700 }));

  if (d.boxLabel) t.push(text(NR.x + 74, (NA.y + NB.y) / 2 + 4, d.boxLabel, { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  t.push(text(W / 2, H - 10, "교류 브리지 — 단자 A–B 사이의 등가 임피던스 Z (상단 델타 A·L·R을 Y로 변환해 해석)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ── (나) Δ-Y 변환 등가 ──────────────────────────────────────────
const W2 = 700, H2 = 500;
const EA = { x: 400, y: 95 };    // 단자 A
const EN = { x: 400, y: 235 };   // Y 중심 마디 N
const EB = { x: 400, y: 430 };   // 단자 B
const EL_X = 310, ER_X = 490;    // 좌·우 가지 column
const SRC_X2 = 110;

export function renderAcDeltaWyeEquivCircuit(d: AcDeltaWyeEquivCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 점선 박스 (Δ-Y 변환된 영역만 — 하단 2 arm은 원본 그대로라 박스 밖)
  const boxTop = EA.y + 22, boxBot = 300;
  s.push(dashRect(EL_X - 60, boxTop, ER_X - EL_X + 120, boxBot - boxTop));
  t.push(text(ER_X + 56, boxTop + 18, d.boxLabel ?? "Δ-Y 변환", { size: 13, weight: 700, anchor: "start" }));

  // 전원 + rail
  s.push(acSource(SRC_X2, EA.y, EB.y));
  t.push(text(SRC_X2 - 32, (EA.y + EB.y) / 2 + 4, d.vLabel ?? "V", { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  t.push(text(SRC_X2 - 32, (EA.y + EB.y) / 2 - 14, "+", { anchor: "end", size: 13, weight: 700 }));
  t.push(text(SRC_X2 - 32, (EA.y + EB.y) / 2 + 22, "−", { anchor: "end", size: 13, weight: 700 }));
  w.push(line(SRC_X2, EA.y, EA.x, EA.y));
  w.push(line(SRC_X2, EB.y, EB.x, EB.y));
  const iX = (SRC_X2 + EA.x) / 2;
  s.push(arrowRight(iX - 16, EA.y, iX + 16));
  t.push(text(iX, EA.y - 14, d.iLabel ?? "I[A]", { size: 13, weight: 700, fill: ACCENT }));

  // Z_A 박스 (A → N)
  w.push(line(EA.x, EA.y, EA.x, 140));
  s.push(zBox(EA.x, 140, 172));
  w.push(line(EA.x, 172, EA.x, EN.y));
  s.push(dot(EA.x, EA.y)); s.push(dot(EN.x, EN.y));

  // N에서 좌·우 분기
  w.push(line(EL_X, EN.y, ER_X, EN.y));
  w.push(line(EL_X, EN.y, EL_X, 252));
  w.push(line(ER_X, EN.y, ER_X, 252));
  s.push(zBox(EL_X, 252, 284));
  s.push(zBox(ER_X, 252, 284));

  // 하단 2 arm (원본 소자 그대로)
  w.push(line(EL_X, 284, EL_X, 330));
  w.push(line(ER_X, 284, ER_X, 330));
  vElem(s, t, EL_X, 330, 390, d.botLeft, "left");
  vElem(s, t, ER_X, 330, 390, d.botRight, "right");
  w.push(line(EL_X, 390, EL_X, EB.y));
  w.push(line(ER_X, 390, ER_X, EB.y));
  w.push(line(EL_X, EB.y, ER_X, EB.y));
  s.push(dot(EB.x, EB.y));

  t.push(text(EA.x, EA.y - 16, "A", { size: 15, weight: 700 }));
  t.push(text(EB.x, EB.y + 26, "B", { size: 15, weight: 700 }));

  t.push(text(W2 / 2, H2 - 10, "Δ-Y 변환 등가 — 상단 델타(A·L·R)를 Y로 치환 (세 팔의 값은 [단계 1]에서 도출)", { size: 10, fill: MUTED }));
  return svg(W2, H2, [...w, ...s, ...t]);
}

// ── 소자 배치 ────────────────────────────────────────────────────
/** 두 노드를 잇는 선분 위에 소자를 회전 배치하고 라벨을 바깥쪽에 찍는다. */
function elemOnEdge(
  s: string[], t: string[],
  p1: { x: number; y: number }, p2: { x: number; y: number },
  arm: AcDeltaWyeArm, labelSide: "out" | "up",
): void {
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const deg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  const half = 20;
  const sym = arm.kind === "R" ? symResistor(half) : arm.kind === "C" ? symCapacitor(half) : symInductor(half);
  s.push(
    `<g transform="translate(${round(mx)},${round(my)}) rotate(${round(deg)})">` +
      `<line x1="${-len / 2}" y1="0" x2="${-half}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      sym +
      `<line x1="${half}" y1="0" x2="${len / 2}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `</g>`,
  );
  const label = arm.label ?? "";
  if (!label) return;
  if (labelSide === "up") {
    t.push(text(mx, my - 26, label, { size: 12, weight: 600 }));
    return;
  }
  // 다이아몬드 중심(NA.x, 중앙 y)에서 바깥쪽 법선 방향으로 밀어낸다.
  const cx = NA.x, cy = (NA.y + NB.y) / 2;
  let nx = -(p2.y - p1.y) / len, ny = (p2.x - p1.x) / len;
  if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
  const off = 30;
  t.push(text(round(mx + nx * off), round(my + ny * off + 4), label, { size: 12, weight: 600 }));
}

/** 세로 소자 (위→아래) + 라벨. */
function vElem(
  s: string[], t: string[], x: number, y1: number, y2: number,
  arm: AcDeltaWyeArm, side: "left" | "right",
): void {
  const my = (y1 + y2) / 2, half = 20;
  const sym = arm.kind === "R" ? symResistor(half) : arm.kind === "C" ? symCapacitor(half) : symInductor(half);
  s.push(
    `<g transform="translate(${x},${round(my)}) rotate(90)">` +
      `<line x1="${-(y2 - y1) / 2}" y1="0" x2="${-half}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      sym +
      `<line x1="${half}" y1="0" x2="${(y2 - y1) / 2}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `</g>`,
  );
  if (arm.label) {
    const dx = side === "left" ? -26 : 26;
    t.push(text(x + dx, my + 4, arm.label, { size: 12, weight: 600, anchor: side === "left" ? "end" : "start" }));
  }
}

/** 미지 임피던스 박스 (값 미표기 — 학생이 도출). */
function zBox(cx: number, y1: number, y2: number): string {
  const hw = 17;
  return `<rect x="${cx - hw}" y="${y1}" width="${hw * 2}" height="${y2 - y1}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ── 심볼 (로컬 좌표, 중심 원점) ──────────────────────────────────
function symResistor(half: number): string {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${-half},0`;
  for (let i = 0; i < teeth; i++) p += ` L${-half + step * (i + 0.5)},${i % 2 === 0 ? -a : a}`;
  p += ` L${half},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function symCapacitor(half: number): string {
  const g = 5, ph = 12;
  return (
    `<line x1="${-g}" y1="${-ph}" x2="${-g}" y2="${ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.5}"/>` +
    `<line x1="${g}" y1="${-ph}" x2="${g}" y2="${ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.5}"/>` +
    `<line x1="${-half}" y1="0" x2="${-g}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${g}" y1="0" x2="${half}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`
  );
}
function symInductor(half: number): string {
  const n = 4, r = half / n;
  let p = `M${-half},0`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${-half + r * (2 * i + 2)},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ── 공통 ─────────────────────────────────────────────────────────
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 24;
  const sine = `<path d="M${cx - 13},${cy} Q${cx - 6.5},${cy - 9} ${cx},${cy} T${cx + 13},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function arrowRight(x1: number, y: number, x2: number): string {
  return `<path d="M${x1},${y - 9} L${x2},${y - 9}" stroke="${ACCENT}" stroke-width="1.8" fill="none"/>` +
    `<path d="M${x2},${y - 9} l-7,-4 l0,8 z" fill="${ACCENT}"/>`;
}
function dashRect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${DASH}" stroke-width="1.3" stroke-dasharray="6 5"/>`;
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
function round(n: number): number { return Math.round(n * 100) / 100; }
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
