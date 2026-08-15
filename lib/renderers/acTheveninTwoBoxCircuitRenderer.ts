import type { AcTheveninTwoBoxCircuitDiagram } from "@/types";

/**
 * 점선 박스 2개(전압원망 a-b + 전류원망 c-d) **병렬**(a–c·b–d 접속) + 부하 R_L 전용
 * fixed-slot 렌더러 (임용 10번 회로이론). 원본 배치 그대로.
 *
 *   ┌ (점선) 전압원망 ─────────────┐
 *   │  V_s ─ R₁ ─ m ─ jX_L1 ─ ● a  │──┬───── R_L ──┐
 *   │           m ─ −jX_C1 ─ ⏚     │  │            │
 *   └───────────────────── ● b ────┘──│──┬─────────┘
 *   ┌ (점선) 전류원망 ─────────────┐  │  │
 *   │  I_s ↑ n ─ (R₂ ∥ jX_L2) ─ ⏚  │  │  │
 *   │      n ─ −jX_C2 ─ ● c ───────│──┘  │
 *   └───────────────────── ● d ────┘─────┘
 *  (a–c 세로 lane / b–d 세로 lane을 분리해 겹치지 않게 그린다 — 규칙 #3)
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const DASH = "#94a3b8";

export function renderAcTheveninTwoBoxCircuit(d: AcTheveninTwoBoxCircuitDiagram): string {
  const W = 660, H = 430;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 고정 좌표 ──
  const xSrc = 100;      // 두 전원의 세로 다리
  const xTerm = 460;     // 단자 a·b·c·d 세로 bus
  const xLoad = 570;     // 부하 R_L
  // 위 박스(전압원망)
  const y1T = 80, y1B = 190;
  const xR1 = 190, xM = 265, xL1 = 360;
  // 아래 박스(전류원망)
  const y2T = 260, y2B = 370;
  const xR2 = 210, xL2 = 285, xC2 = 380;

  // ───────── 위 박스: V_s — R₁ — m — jX_L1 — a ─────────
  s.push(dashBox(60, y1T - 34, xTerm - 60 + 8, y1B - y1T + 68, "(전압원망)"));
  s.push(acSource(xSrc, (y1T + y1B) / 2));
  t.push(text(xSrc - 26, (y1T + y1B) / 2 + 4, d.vsLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  w.push(line(xSrc, y1T, xSrc, (y1T + y1B) / 2 - 18));
  w.push(line(xSrc, (y1T + y1B) / 2 + 18, xSrc, y1B));

  w.push(line(xSrc, y1T, xR1 - 26, y1T));
  s.push(resistorH(xR1, y1T));
  t.push(text(xR1, y1T - 18, d.r1Label, { size: 12, weight: 600 }));
  w.push(line(xR1 + 26, y1T, xM, y1T));
  s.push(dot(xM, y1T));
  t.push(text(xM - 8, y1T - 12, "m", { anchor: "end", size: 11, weight: 700, fill: MUTED }));

  // m ↓ −jX_C1 ↓ 하단 rail
  const y1C = (y1T + y1B) / 2;
  w.push(line(xM, y1T, xM, y1C - 14));
  s.push(capacitorV(xM, y1C));
  t.push(text(xM + 16, y1C + 4, d.xc1Label, { anchor: "start", size: 12, weight: 600 }));
  w.push(line(xM, y1C + 14, xM, y1B));

  // m — jX_L1 — 단자 a
  w.push(line(xM, y1T, xL1 - 26, y1T));
  s.push(inductorH(xL1, y1T));
  t.push(text(xL1, y1T - 20, d.xl1Label, { size: 12, weight: 600 }));
  w.push(line(xL1 + 26, y1T, xTerm, y1T));

  // 하단 rail (= 단자 b). ★ 접지 기호는 그리지 않는다 — b와 d는 우측에서 이어진 **같은 노드**라
  //   기호를 둘 그리면 서로 다른 접지처럼 읽힌다(회로이론은 접지 기호 하나로 통일, 사용자 지정).
  w.push(line(xSrc, y1B, xTerm, y1B));
  s.push(dot(xM, y1B));

  s.push(term(xTerm, y1T), term(xTerm, y1B));
  t.push(text(xTerm + 12, y1T - 8, "a", { anchor: "start", size: 13, weight: 700, fill: RED }));
  t.push(text(xTerm + 12, y1B + 16, "b", { anchor: "start", size: 13, weight: 700, fill: RED }));

  // ───────── 아래 박스: I_s ↑ n — (R₂ ∥ jX_L2) — −jX_C2 — c ─────────
  s.push(dashBox(60, y2T - 34, xTerm - 60 + 8, y2B - y2T + 68, "(전류원망)"));
  const y2C = (y2T + y2B) / 2;
  s.push(acCurrentSource(xSrc, y2C));
  t.push(text(xSrc - 26, y2C + 4, d.isLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  w.push(line(xSrc, y2T, xSrc, y2C - 18));
  w.push(line(xSrc, y2C + 18, xSrc, y2B));

  w.push(line(xSrc, y2T, xC2 - 26, y2T));
  // 션트 R₂ / jX_L2
  for (const [xx, lbl, kind] of [[xR2, d.r2Label, "R"], [xL2, d.xl2Label, "L"]] as Array<[number, string, "R" | "L"]>) {
    s.push(dot(xx, y2T), dot(xx, y2B));
    w.push(line(xx, y2T, xx, y2C - 26));
    s.push(kind === "R" ? resistorV(xx, y2C) : inductorV(xx, y2C));
    t.push(text(xx - 14, y2C + 4, lbl, { anchor: "end", size: 12, weight: 600 }));
    w.push(line(xx, y2C + 26, xx, y2B));
  }
  t.push(text(xR2 - 8, y2T - 12, "n", { anchor: "end", size: 11, weight: 700, fill: MUTED }));

  // n — −jX_C2 — 단자 c
  s.push(capacitorH(xC2, y2T));
  t.push(text(xC2, y2T - 20, d.xc2Label, { size: 12, weight: 600 }));
  w.push(line(xC2 + 10, y2T, xTerm, y2T));

  // 하단 rail (= 단자 d) + 접지 기호(원본 배치)
  w.push(line(xSrc, y2B, xTerm, y2B));
  w.push(line(xSrc, y2B, xSrc, y2B + 12));
  s.push(gnd(xSrc, y2B + 12));

  s.push(term(xTerm, y2T), term(xTerm, y2B));
  t.push(text(xTerm + 12, y2T - 8, "c", { anchor: "start", size: 13, weight: 700, fill: RED }));
  t.push(text(xTerm + 12, y2B + 16, "d", { anchor: "start", size: 13, weight: 700, fill: RED }));

  // ───────── 우측: a–c 접속 / b–d 접속, 그 사이에 R_L (두 회로망 병렬) ─────────
  //  ★ 원본 배선: 단자 a에서 나온 도선이 R_L 위쪽과 **단자 c**로 가고,
  //    R_L 아래쪽이 **단자 b·d**로 간다. b–c 접속(직렬)은 없다.
  const xJoin = xTerm + 40;     // a–c 세로 lane
  const xLow = xTerm + 78;      // b–d 세로 lane (겹치지 않게 분리, 규칙 #3)
  // a–c
  w.push(line(xTerm, y1T, xJoin, y1T));
  s.push(dot(xJoin, y1T));
  w.push(line(xJoin, y1T, xJoin, y2T));
  w.push(line(xTerm, y2T, xJoin, y2T));
  // b–d
  w.push(line(xTerm, y1B, xLow, y1B));
  s.push(dot(xLow, y1B));
  w.push(line(xLow, y1B, xLow, y2B));
  w.push(line(xTerm, y2B, xLow, y2B));
  // 부하 R_L — a lane(위) ↔ b lane(아래)
  const yL = (y1T + y1B) / 2;
  w.push(line(xJoin, y1T, xLoad, y1T));
  w.push(line(xLoad, y1T, xLoad, yL - 30));
  s.push(resistorV(xLoad, yL));
  t.push(text(xLoad + 18, yL + 4, d.rlLabel, { anchor: "start", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(xLoad, yL + 30, xLoad, y1B));
  w.push(line(xLow, y1B, xLoad, y1B));

  t.push(text(W / 2, H - 10,
    "단자 a–c, b–d가 연결되어 두 회로망이 병렬로 부하 R_L(순저항)을 구동한다",
    { size: 10, fill: MUTED }));

  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
function dashBox(x: number, y: number, w: number, h: number, label: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="${DASH}" stroke-width="1.3" stroke-dasharray="6 5"/>` +
    `<text x="${x + 10}" y="${y + 16}" font-size="11" fill="${MUTED}">${esc(label)}</text>`;
}
/** 교류 전압원 — 원 + 정현파. */
function acSource(x: number, cy: number): string {
  return `<circle cx="${x}" cy="${cy}" r="18" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<path d="M${x - 10},${cy} q5,-9 5,0 t5,0" fill="none" stroke="${STROKE}" stroke-width="1.5"/>` +
    `<text x="${x - 24}" y="${cy - 12}" text-anchor="end" font-size="11" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${x - 24}" y="${cy + 20}" text-anchor="end" font-size="12" font-weight="700" fill="${RED}">−</text>`;
}
/** 교류 전류원 — 원 + 위로 향한 화살표(하단→상단 주입). */
function acCurrentSource(x: number, cy: number): string {
  return `<circle cx="${x}" cy="${cy}" r="18" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x}" y1="${cy + 11}" x2="${x}" y2="${cy - 9}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<path d="M${x - 4},${cy - 5} L${x},${cy - 12} L${x + 4},${cy - 5} Z" fill="${STROKE}"/>`;
}
function resistorH(cx: number, cy: number): string {
  const half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${cy}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${cy + (i % 2 === 0 ? -a : a)}`;
  return `<path d="${p} L${cx + half},${cy}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function resistorV(cx: number, cy: number): string {
  const half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  return `<path d="${p} L${cx},${cy + half}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
/** 인덕터(가로) — 코일 4개. */
function inductorH(cx: number, cy: number): string {
  const half = 26, r = 6.5, n = 4;
  let p = `M${cx - half},${cy}`;
  for (let i = 0; i < n; i++) {
    const x0 = cx - half + 2 + i * (2 * r);
    p += ` A ${r} ${r} 0 0 1 ${x0 + 2 * r} ${cy}`;
  }
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - half + 2 + n * 2 * r}" y1="${cy}" x2="${cx + half}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 인덕터(세로) — 코일 4개. */
function inductorV(cx: number, cy: number): string {
  const half = 26, r = 6.5, n = 4;
  let p = `M${cx},${cy - half}`;
  for (let i = 0; i < n; i++) {
    const y0 = cy - half + 2 + i * (2 * r);
    p += ` A ${r} ${r} 0 0 1 ${cx} ${y0 + 2 * r}`;
  }
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy - half + 2 + n * 2 * r}" x2="${cx}" y2="${cy + half}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function capacitorH(cx: number, cy: number): string {
  const g = 5, ph = 13;
  return `<line x1="${cx - g}" y1="${cy - ph}" x2="${cx - g}" y2="${cy + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${cx + g}" y1="${cy - ph}" x2="${cx + g}" y2="${cy + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${cx - 26}" y1="${cy}" x2="${cx - g}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + g}" y1="${cy}" x2="${cx + 10}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function capacitorV(cx: number, cy: number): string {
  const g = 5, pw = 13;
  return `<line x1="${cx - pw}" y1="${cy - g}" x2="${cx + pw}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${cx - pw}" y1="${cy + g}" x2="${cx + pw}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${cx}" y1="${cy - 14}" x2="${cx}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + g}" x2="${cx}" y2="${cy + 14}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function gnd(x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
    <line x1="-9" y1="0" x2="9" y2="0" stroke="${STROKE}" stroke-width="2.2"/>
    <line x1="-6" y1="4" x2="6" y2="4" stroke="${STROKE}" stroke-width="2"/>
    <line x1="-3" y1="8" x2="3" y2="8" stroke="${STROKE}" stroke-width="2"/></g>`;
}
function term(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4" fill="white" stroke="${STROKE}" stroke-width="1.5"/>`;
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
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
