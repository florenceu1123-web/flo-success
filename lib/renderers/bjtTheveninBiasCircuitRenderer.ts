import type { BjtTheveninBiasCircuitDiagram } from "@/types";

/**
 * BJT 직류 바이어스 (가) 원본 / (나) 테브난 등가 전용 fixed-slot 렌더러 (임용 10번 전자회로).
 * 원본 배치 그대로 — 트랜지스터는 **베이스가 아래**, 이미터가 왼쪽 rail, 컬렉터가 오른쪽 rail.
 *
 *   E rail ──[Q]── C rail ──┬─ R_p ─┬─ 마디 M ─┬─ R_M ─┬─ 접지
 *     │        │             └─ R_C ─┘          └─ I_S ─┘
 *    R_E      V_B
 *     │        │
 *   V_EE   [점선: (R₁+V₁) ∥ (R₂+V₂)  또는  R_T+V_T]
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const DASH = "#94a3b8";

export function renderBjtTheveninBiasCircuit(d: BjtTheveninBiasCircuitDiagram): string {
  const W = 640, H = 400;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 고정 좌표 ──
  const yTop = 96;          // 이미터·컬렉터 rail
  const yBot = 344;         // 접지 rail
  const xE = 96;            // 이미터측 세로 다리
  const xQ = 262;           // 트랜지스터
  const yB = 168;           // 베이스 마디 V_B
  const xC1 = 424, xC2 = 508;   // 컬렉터측 두 열 (R_p / R_C, R_M / I_S)
  const yM = 214;           // 마디 M

  // ───────── 트랜지스터 (베이스 아래) ─────────
  s.push(bjtHBaseDown(xQ, yTop));
  t.push(text(xQ - 34, yTop - 26, "−", { size: 13, weight: 700, fill: RED }));
  t.push(text(xQ, yTop - 26, "V_CE", { size: 12, weight: 700 }));
  t.push(text(xQ + 34, yTop - 26, "+", { size: 13, weight: 700, fill: RED }));
  t.push(text(xQ - 30, yTop + 16, "−", { anchor: "end", size: 12, weight: 700, fill: RED }));
  t.push(text(xQ - 30, yTop + 32, "V_BE", { anchor: "end", size: 11.5, weight: 700 }));
  t.push(text(xQ - 14, yTop + 46, "+", { anchor: "end", size: 12, weight: 700, fill: RED }));

  // 베이스 리드 + I_B 화살표
  w.push(line(xQ, yTop + 26, xQ, yB));
  s.push(dot(xQ, yB));
  t.push(text(xQ - 10, yB + 4, "V_B", { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  s.push(`<path d="M ${xQ + 16} ${yB - 6} L ${xQ + 16} ${yTop + 34}" stroke="${RED}" stroke-width="1.3" fill="none"/>`);
  s.push(`<path d="M ${xQ + 12} ${yTop + 40} L ${xQ + 16} ${yTop + 30} L ${xQ + 20} ${yTop + 40} Z" fill="${RED}"/>`);
  t.push(text(xQ + 24, yB - 14, "I_B", { anchor: "start", size: 11.5, weight: 700, fill: RED }));

  // ───────── 이미터측: rail — R_E — V_EE — 접지 ─────────
  w.push(line(xE, yTop, xQ - 26, yTop));
  w.push(line(xE, yTop, xE, yTop + 30));
  s.push(resistorV(xE, yTop + 56));
  t.push(text(xE - 16, yTop + 60, d.reLabel, { anchor: "end", size: 12, weight: 600 }));
  w.push(line(xE, yTop + 82, xE, yTop + 106));
  // 전원 — 위쪽이 −(음전원)
  s.push(dcSource(xE, yTop + 130, d.veeLabel, "-"));
  w.push(line(xE, yTop + 154, xE, yBot));

  // ───────── 베이스망 (점선 박스) ─────────
  const yR = 246, ySrc = 300;
  if (d.variant === "original") {
    const xb1 = xQ - 54, xb2 = xQ + 54;
    s.push(dashBox(xb1 - 46, yB + 22, (xb2 - xb1) + 92, yBot - yB - 8, ""));
    w.push(line(xQ, yB, xQ, yB + 44));
    w.push(line(xb1, yB + 44, xb2, yB + 44));
    s.push(dot(xQ, yB + 44));
    for (const [xx, rLab, vLab, sign] of [
      [xb1, d.r1Label, d.v1Label, d.v1TopSign],
      [xb2, d.r2Label, d.v2Label, d.v2TopSign],
    ] as Array<[number, string, string, "+" | "-"]>) {
      w.push(line(xx, yB + 44, xx, yR - 24));
      s.push(resistorV(xx, yR));
      t.push(text(xx - 16, yR + 4, rLab, { anchor: "end", size: 12, weight: 600 }));
      w.push(line(xx, yR + 24, xx, ySrc - 20));
      s.push(dcSource(xx, ySrc, vLab, sign));
      w.push(line(xx, ySrc + 20, xx, yBot));
    }
  } else {
    s.push(dashBox(xQ - 60, yB + 22, 120, yBot - yB - 8, ""));
    w.push(line(xQ, yB, xQ, yR - 24));
    s.push(resistorV(xQ, yR));
    t.push(text(xQ - 16, yR + 4, d.rtLabel, { anchor: "end", size: 12.5, weight: 700, fill: ACCENT }));
    w.push(line(xQ, yR + 24, xQ, ySrc - 20));
    s.push(dcSource(xQ, ySrc, d.vtLabel, "+"));
    w.push(line(xQ, ySrc + 20, xQ, yBot));
  }

  // ───────── 컬렉터측: (R_p ∥ R_C) — 마디 M — (R_M ∥ I_S) ─────────
  w.push(line(xQ + 26, yTop, xC2, yTop));
  s.push(dot(xC1, yTop), dot(xC2, yTop));
  for (const [xx, lbl, accent] of [[xC1, d.rpLabel, false], [xC2, d.rcLabel, true]] as Array<[number, string, boolean]>) {
    w.push(line(xx, yTop, xx, yM - 52));
    s.push(resistorV(xx, yM - 26));
    t.push(text(xx - 16, yM - 22, lbl, { anchor: "end", size: 12, weight: accent ? 700 : 600, fill: accent ? ACCENT : STROKE }));
    w.push(line(xx, yM, xx, yM));
  }
  w.push(line(xC1, yM, xC2, yM));
  s.push(dot(xC1, yM), dot(xC2, yM));
  // 마디 M 아래 — R_M / 전류원
  w.push(line(xC1, yM, xC1, yM + 40));
  s.push(resistorV(xC1, yM + 66));
  t.push(text(xC1 - 16, yM + 70, d.rmLabel, { anchor: "end", size: 12, weight: 600 }));
  w.push(line(xC1, yM + 92, xC1, yBot));
  w.push(line(xC2, yM, xC2, yM + 42));
  s.push(currentSource(xC2, yM + 66, d.isLabel));
  w.push(line(xC2, yM + 90, xC2, yBot));

  // ───────── 접지 rail ─────────
  w.push(line(xE, yBot, xC2, yBot));
  // 접지 기호는 점선 박스 바깥(베이스망과 컬렉터망 사이)에 둔다 — 박스 위에 겹치지 않게.
  s.push(gnd(390, yBot));

  t.push(text(W / 2, H - 8,
    d.variant === "original"
      ? "(가) 원본 — 점선 부분(두 가지)을 테브난 등가로 변환한다"
      : "(나) 점선 부분을 테브난 등가(R_T·V_T)로 바꾼 회로",
    { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
/** NPN — 가로 배치(이미터 왼쪽·컬렉터 오른쪽), **베이스는 아래**. 화살표는 이미터(왼쪽)에 바깥 방향. */
function bjtHBaseDown(cx: number, cy: number): string {
  const r = 26, yBar = cy + 9, half = 15;
  let g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="1.3"/>`;
  g += `<line x1="${cx - half}" y1="${yBar}" x2="${cx + half}" y2="${yBar}" stroke="${STROKE}" stroke-width="2.4"/>`;
  g += `<line x1="${cx}" y1="${yBar}" x2="${cx}" y2="${cy + 26}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // 이미터(왼쪽) — 바에서 왼쪽 위로, 화살표는 바깥(왼쪽 위) 방향 = NPN
  g += `<line x1="${cx - 9}" y1="${yBar}" x2="${cx - 26}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  g += arrowHead(cx - 9, yBar, cx - 22, cy + 2);
  // 컬렉터(오른쪽)
  g += `<line x1="${cx + 9}" y1="${yBar}" x2="${cx + 26}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return g;
}
function arrowHead(x1: number, y1: number, x2: number, y2: number): string {
  const ang = Math.atan2(y2 - y1, x2 - x1), L = 9, wd = 3.6;
  const bx = x2 - L * Math.cos(ang), by = y2 - L * Math.sin(ang);
  const px = -Math.sin(ang) * wd, py = Math.cos(ang) * wd;
  return `<path d="M${x2},${y2} L${bx + px},${by + py} L${bx - px},${by - py} Z" fill="${STROKE}"/>`;
}
/** 직류 전원(원) — topSign이 위쪽 단자 극성. 라벨은 왼쪽. */
function dcSource(x: number, cy: number, label: string, topSign: "+" | "-"): string {
  return `<circle cx="${x}" cy="${cy}" r="20" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${x}" y="${cy - 3}" text-anchor="middle" font-size="12" font-weight="700" fill="${RED}">${topSign === "+" ? "+" : "−"}</text>` +
    `<text x="${x}" y="${cy + 15}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">${topSign === "+" ? "−" : "+"}</text>` +
    `<text x="${x - 26}" y="${cy + 4}" text-anchor="end" font-size="12" font-weight="700" fill="${ACCENT}">${esc(label)}</text>`;
}
/** 전류원(원 + 위 방향 화살표) — 라벨은 오른쪽. */
function currentSource(x: number, cy: number, label: string): string {
  return `<circle cx="${x}" cy="${cy}" r="20" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x}" y1="${cy + 12}" x2="${x}" y2="${cy - 10}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<path d="M${x - 4},${cy - 6} L${x},${cy - 13} L${x + 4},${cy - 6} Z" fill="${STROKE}"/>` +
    `<text x="${x + 26}" y="${cy + 4}" text-anchor="start" font-size="12" font-weight="700" fill="${ACCENT}">${esc(label)}</text>`;
}
function dashBox(x: number, y: number, w: number, h: number, label: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${DASH}" stroke-width="1.3" stroke-dasharray="5 4"/>` +
    (label ? `<text x="${x + 8}" y="${y + 14}" font-size="10.5" fill="${MUTED}">${esc(label)}</text>` : "");
}
function resistorV(cx: number, cy: number): string {
  const half = 24, a = 7, teeth = 6, step = (2 * half) / teeth;
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
