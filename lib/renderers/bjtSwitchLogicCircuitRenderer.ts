import type { BjtSwitchLogicCircuitDiagram } from "@/types";

/**
 * BJT 이상적 스위치 응용 회로 (임용 2번) 전용 fixed-slot 렌더러.
 *   config별 배치:
 *     pnp_high_side  — +V_CC → PNP 이미터(위) / 컬렉터(아래) → Y → R_C → 접지   [원본]
 *     npn_low_side   — +V_CC → R_C → Y → NPN 컬렉터(위) / 이미터(아래) → 접지
 *     npn_series2    — +V_CC → R_C → Y → Q₁ → Q₂ → 접지 (직렬)
 *     npn_parallel2  — +V_CC → R_C → Y → (Q₁ ∥ Q₂) → 접지 (병렬)
 *
 * ★ 트랜지스터 기호의 화살표가 답을 가른다 — PNP는 화살표가 **베이스를 향하고**,
 *   NPN은 **베이스에서 바깥으로** 향한다. 이미터 쪽 리드에만 화살표를 그린다.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderBjtSwitchLogicCircuit(d: BjtSwitchLogicCircuitDiagram): string {
  const two = d.config === "npn_series2" || d.config === "npn_parallel2";
  const W = two ? 560 : 480, H = two ? 400 : 360;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  const xQ = two ? 300 : 280;      // 트랜지스터 세로 축
  const yVcc = 52;                 // +V_CC 단자
  const yGnd = two ? 340 : 300;    // 접지

  if (d.config === "pnp_high_side") {
    // +V_CC — 이미터(위) — [PNP] — 컬렉터(아래) — 마디 Y — R_C — 접지
    const yQ = 138, yY = 214;
    s.push(term(xQ, yVcc));
    t.push(text(xQ, yVcc - 12, d.vccLabel, { size: 13, weight: 700 }));
    w.push(line(xQ, yVcc, xQ, yQ - 34));
    s.push(bjt(xQ, yQ, "pnp"));
    inputLead(w, s, t, xQ - 34, yQ, d.inputLabels[0], d.rbLabel);
    w.push(line(xQ, yQ + 34, xQ, yY));
    s.push(dot(xQ, yY));
    outputLead(w, s, t, xQ, yY, d.outputLabel, xQ + 120);
    w.push(line(xQ, yY, xQ, yY + 26));
    s.push(resistorV(xQ, yY + 52));
    t.push(text(xQ + 16, yY + 56, d.rcLabel, { anchor: "start", size: 12, weight: 600 }));
    w.push(line(xQ, yY + 78, xQ, yGnd));
    s.push(gnd(xQ, yGnd));
  } else if (d.config === "npn_low_side") {
    // +V_CC — R_C — 마디 Y — 컬렉터(위) — [NPN] — 이미터(아래) — 접지
    const yRc = 104, yY = 158, yQ = 226;
    s.push(term(xQ, yVcc));
    t.push(text(xQ, yVcc - 12, d.vccLabel, { size: 13, weight: 700 }));
    w.push(line(xQ, yVcc, xQ, yRc - 26));
    s.push(resistorV(xQ, yRc));
    t.push(text(xQ + 16, yRc + 4, d.rcLabel, { anchor: "start", size: 12, weight: 600 }));
    w.push(line(xQ, yRc + 26, xQ, yY));
    s.push(dot(xQ, yY));
    outputLead(w, s, t, xQ, yY, d.outputLabel, xQ + 120);
    w.push(line(xQ, yY, xQ, yQ - 34));
    s.push(bjt(xQ, yQ, "npn"));
    inputLead(w, s, t, xQ - 34, yQ, d.inputLabels[0], d.rbLabel);
    w.push(line(xQ, yQ + 34, xQ, yGnd));
    s.push(gnd(xQ, yGnd));
  } else if (d.config === "npn_series2") {
    // +V_CC — R_C — Y — Q₁ — Q₂ — 접지
    const yRc = 100, yY = 150, yQ1 = 202, yQ2 = 282;
    s.push(term(xQ, yVcc));
    t.push(text(xQ, yVcc - 12, d.vccLabel, { size: 13, weight: 700 }));
    w.push(line(xQ, yVcc, xQ, yRc - 26));
    s.push(resistorV(xQ, yRc));
    t.push(text(xQ + 16, yRc + 4, d.rcLabel, { anchor: "start", size: 12, weight: 600 }));
    w.push(line(xQ, yRc + 26, xQ, yY));
    s.push(dot(xQ, yY));
    outputLead(w, s, t, xQ, yY, d.outputLabel, xQ + 140);
    w.push(line(xQ, yY, xQ, yQ1 - 34));
    s.push(bjt(xQ, yQ1, "npn"));
    inputLead(w, s, t, xQ - 34, yQ1, d.inputLabels[0], `${d.rbLabel}1`);
    w.push(line(xQ, yQ1 + 34, xQ, yQ2 - 34));
    s.push(bjt(xQ, yQ2, "npn"));
    inputLead(w, s, t, xQ - 34, yQ2, d.inputLabels[1], `${d.rbLabel}2`);
    w.push(line(xQ, yQ2 + 34, xQ, yGnd));
    s.push(gnd(xQ, yGnd));
  } else {
    // 병렬 — +V_CC — R_C — Y — (Q₁ ∥ Q₂) — 접지
    const yRc = 100, yY = 150, yQ = 226;
    const xQ1 = xQ - 60, xQ2 = xQ + 80;
    s.push(term(xQ, yVcc));
    t.push(text(xQ, yVcc - 12, d.vccLabel, { size: 13, weight: 700 }));
    w.push(line(xQ, yVcc, xQ, yRc - 26));
    s.push(resistorV(xQ, yRc));
    t.push(text(xQ + 16, yRc + 4, d.rcLabel, { anchor: "start", size: 12, weight: 600 }));
    w.push(line(xQ, yRc + 26, xQ, yY));
    s.push(dot(xQ, yY));
    outputLead(w, s, t, xQ, yY, d.outputLabel, xQ + 160);
    // 두 컬렉터로 분기
    w.push(line(xQ1, yY, xQ2, yY));
    s.push(dot(xQ1, yY), dot(xQ2, yY));
    for (const [xx, lbl, rb] of [[xQ1, d.inputLabels[0], `${d.rbLabel}1`], [xQ2, d.inputLabels[1], `${d.rbLabel}2`]] as Array<[number, string, string]>) {
      w.push(line(xx, yY, xx, yQ - 34));
      s.push(bjt(xx, yQ, "npn"));
      inputLead(w, s, t, xx - 34, yQ, lbl, rb);
      w.push(line(xx, yQ + 34, xx, yGnd));
    }
    w.push(line(xQ1, yGnd, xQ2, yGnd));
    s.push(dot(xQ1, yGnd), dot(xQ2, yGnd));
    s.push(gnd((xQ1 + xQ2) / 2, yGnd));
  }

  t.push(text(W / 2, H - 8, "트랜지스터는 이상적인 스위칭 동작(도통=단락, 차단=개방)을 한다고 가정",
    { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

/** 베이스 입력 — 단자 X ─ R_B ─ 베이스. */
function inputLead(w: string[], s: string[], t: string[], xBase: number, yBase: number, label: string, rbLabel: string): void {
  const xR = xBase - 58, xTerm = xBase - 128;
  w.push(line(xBase, yBase, xR + 24, yBase));
  s.push(resistorH(xR, yBase));
  t.push(text(xR, yBase - 16, rbLabel, { size: 12, weight: 600 }));
  w.push(line(xR - 24, yBase, xTerm, yBase));
  s.push(term(xTerm, yBase));
  t.push(text(xTerm - 10, yBase + 4, `입력 ${label}`, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
}
/** 출력 단자 — 마디에서 오른쪽으로. */
function outputLead(w: string[], s: string[], t: string[], x: number, y: number, label: string, xTerm: number): void {
  w.push(line(x, y, xTerm, y));
  s.push(term(xTerm, y));
  t.push(text(xTerm + 10, y + 4, label, { anchor: "start", size: 12, weight: 700, fill: RED }));
}

/**
 * BJT (세로) — 베이스는 왼쪽. npn이면 **아래 리드(이미터)** 에 바깥 방향 화살표,
 * pnp이면 **위 리드(이미터)** 에 베이스를 향하는 화살표.
 */
function bjt(cx: number, cy: number, kind: "npn" | "pnp"): string {
  const r = 26;                       // 원
  const xBar = cx - 9;                // 베이스 바
  const barTop = cy - 15, barBot = cy + 15;
  const yLead = 15;                   // 대각선이 바에 닿는 y
  let g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="1.3"/>`;
  g += `<line x1="${xBar}" y1="${barTop}" x2="${xBar}" y2="${barBot}" stroke="${STROKE}" stroke-width="2.4"/>`;
  g += `<line x1="${xBar - 25}" y1="${cy}" x2="${xBar}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // 위 리드
  g += `<line x1="${xBar}" y1="${cy - yLead}" x2="${cx + 10}" y2="${cy - 26}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  g += `<line x1="${cx + 10}" y1="${cy - 26}" x2="${cx + 10}" y2="${cy - 34}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  g += `<line x1="${cx + 10}" y1="${cy - 34}" x2="${cx}" y2="${cy - 34}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // 아래 리드
  g += `<line x1="${xBar}" y1="${cy + yLead}" x2="${cx + 10}" y2="${cy + 26}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  g += `<line x1="${cx + 10}" y1="${cy + 26}" x2="${cx + 10}" y2="${cy + 34}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  g += `<line x1="${cx + 10}" y1="${cy + 34}" x2="${cx}" y2="${cy + 34}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // 화살표 — 이미터 리드에만.
  g += kind === "npn"
    // NPN: 아래 리드, 베이스에서 바깥(오른쪽 아래)으로
    ? arrowHead(xBar + 8, cy + yLead + 5, cx + 10, cy + 26)
    // PNP: 위 리드, 바깥에서 베이스(왼쪽 아래)로
    : arrowHead(cx + 3, cy - 21, xBar, cy - yLead);
  return g;
}
/** (x1,y1) → (x2,y2) 방향의 삼각 화살촉을 끝점에 그린다. */
function arrowHead(x1: number, y1: number, x2: number, y2: number): string {
  const ang = Math.atan2(y2 - y1, x2 - x1), L = 9, wdt = 3.6;
  const bx = x2 - L * Math.cos(ang), by = y2 - L * Math.sin(ang);
  const px = -Math.sin(ang) * wdt, py = Math.cos(ang) * wdt;
  return `<path d="M${x2},${y2} L${bx + px},${by + py} L${bx - px},${by - py} Z" fill="${STROKE}"/>`;
}

function resistorH(cx: number, cy: number): string {
  const half = 24, a = 7, teeth = 6, step = (2 * half) / teeth;
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
function gnd(x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
    <line x1="0" y1="0" x2="0" y2="10" stroke="${STROKE}" stroke-width="${WIRE_W}"/>
    <line x1="-9" y1="10" x2="9" y2="10" stroke="${STROKE}" stroke-width="2.2"/>
    <line x1="-6" y1="14" x2="6" y2="14" stroke="${STROKE}" stroke-width="2"/>
    <line x1="-3" y1="18" x2="3" y2="18" stroke="${STROKE}" stroke-width="2"/></g>`;
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
