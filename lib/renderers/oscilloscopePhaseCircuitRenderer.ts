import type { OscilloscopePhaseCircuitDiagram, OscilloscopeScreenDiagram } from "@/types";

/**
 * 오실로스코프 화면 (가) + 측정 대상 회로 (나) 전용 fixed-slot 렌더러 (임용 11번 회로이론).
 *
 *  (가) 10 div × 8 div 격자 + 2채널 정현파(㉠ 실선 / ㉡ 점쇄선) + 위상차 α 화살표
 *      + 하단 스케일 표기(Ch1/Ch2 V/div, µs/div). 원본 화면 배치를 그대로 재현한다:
 *      실선의 골이 중앙 세로축에서 0.5 div 오른쪽, α는 **두 파형의 상승 영교차 사이**.
 *  (나) `v_s(t) ─ R ─ 마디 A`, 마디 A에 미지 소자(세로, v_L 측정 +/−),
 *      `마디 A ─ 직렬소자 ─ 마디 B ─ 세로소자 ─ 접지` 가지가 병렬.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";
const GRID = "#9ca3af";

// ── (가) 오실로스코프 화면 ────────────────────────────────────────
const SW = 700, SH = 470;
const BOX = { x: 120, y: 70, w: 480, h: 320 };   // 화면 영역

export function renderOscilloscopeScreen(d: OscilloscopeScreenDiagram): string {
  const nx = Math.max(1, d.widthDiv), ny = Math.max(1, d.heightDiv);
  const dx = BOX.w / nx, dy = BOX.h / ny;
  const cy = BOX.y + BOX.h / 2;                 // 0 V 기준선
  const cx = BOX.x + BOX.w / 2;                 // 중앙 세로축
  const out: string[] = [];

  // 격자 (점선) — 테두리는 실선
  for (let i = 1; i < nx; i++) {
    const x = BOX.x + dx * i;
    out.push(`<line x1="${r(x)}" y1="${BOX.y}" x2="${r(x)}" y2="${BOX.y + BOX.h}" stroke="${GRID}" stroke-width="0.8" stroke-dasharray="2 3"/>`);
  }
  for (let i = 1; i < ny; i++) {
    const y = BOX.y + dy * i;
    out.push(`<line x1="${BOX.x}" y1="${r(y)}" x2="${BOX.x + BOX.w}" y2="${r(y)}" stroke="${GRID}" stroke-width="0.8" stroke-dasharray="2 3"/>`);
  }
  out.push(`<rect x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" fill="none" stroke="${STROKE}" stroke-width="1.3"/>`);
  // 중앙 축 (눈금 tick)
  out.push(`<line x1="${BOX.x}" y1="${r(cy)}" x2="${BOX.x + BOX.w}" y2="${r(cy)}" stroke="${STROKE}" stroke-width="1"/>`);
  out.push(`<line x1="${r(cx)}" y1="${BOX.y}" x2="${r(cx)}" y2="${BOX.y + BOX.h}" stroke="${STROKE}" stroke-width="1"/>`);
  for (let i = 0; i <= nx * 5; i++) {
    const x = BOX.x + (BOX.w / (nx * 5)) * i;
    out.push(`<line x1="${r(x)}" y1="${r(cy - 3)}" x2="${r(x)}" y2="${r(cy + 3)}" stroke="${STROKE}" stroke-width="0.8"/>`);
  }
  for (let i = 0; i <= ny * 5; i++) {
    const y = BOX.y + (BOX.h / (ny * 5)) * i;
    out.push(`<line x1="${r(cx - 3)}" y1="${r(y)}" x2="${r(cx + 3)}" y2="${r(y)}" stroke="${STROKE}" stroke-width="0.8"/>`);
  }

  // 파형 — v(x) = −A·cos(2π(x − xt)/T),  ㉡는 α만큼 앞/뒤로 이동
  const T = d.periodDiv, xt = nx / 2 + (d.troughOffsetDiv ?? 0);
  const shift = (d.ch2Leads ? 1 : -1) * d.phaseDiv;
  const valueAt = (ampDiv: number, sh: number, xd: number) =>
    -ampDiv * Math.cos((2 * Math.PI * (xd + sh - xt)) / T);
  const wave = (ampDiv: number, sh: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 480; i++) {
      const xd = (nx * i) / 480;                                  // div 좌표
      pts.push(`${r(BOX.x + xd * dx)},${r(cy - valueAt(ampDiv, sh, xd) * dy)}`);
    }
    return pts.join(" ");
  };
  out.push(`<clipPath id="scopeclip"><rect x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}"/></clipPath>`);
  out.push(`<g clip-path="url(#scopeclip)">`);
  out.push(`<polyline points="${wave(d.ch1AmpDiv, 0)}" fill="none" stroke="${STROKE}" stroke-width="1.7"/>`);
  out.push(`<polyline points="${wave(d.ch2AmpDiv, shift)}" fill="none" stroke="${STROKE}" stroke-width="1.7" stroke-dasharray="10 4 2 4"/>`);
  out.push(`</g>`);

  // α 표시 — 두 파형의 **상승 영교차** 사이 (원본 배치)
  const zeroCh1 = xt + T / 4;                 // ㉠ 상승 영교차 [div]
  const zeroCh2 = zeroCh1 - shift;            // ㉡ 상승 영교차
  const xA = BOX.x + Math.min(zeroCh1, zeroCh2) * dx;
  const xB = BOX.x + Math.max(zeroCh1, zeroCh2) * dx;
  const yTop = BOX.y - 40;
  out.push(`<line x1="${r(xA)}" y1="${r(yTop)}" x2="${r(xA)}" y2="${BOX.y}" stroke="${MUTED}" stroke-width="0.9"/>`);
  out.push(`<line x1="${r(xB)}" y1="${r(yTop)}" x2="${r(xB)}" y2="${BOX.y}" stroke="${MUTED}" stroke-width="0.9"/>`);
  out.push(`<line x1="${r(xA)}" y1="${r(yTop + 14)}" x2="${r(xB)}" y2="${r(yTop + 14)}" stroke="${STROKE}" stroke-width="1.1"/>`);
  out.push(`<path d="M${r(xA)},${r(yTop + 14)} l7,-3.5 l0,7 z" fill="${STROKE}"/>`);
  out.push(`<path d="M${r(xB)},${r(yTop + 14)} l-7,-3.5 l0,7 z" fill="${STROKE}"/>`);
  out.push(txt((xA + xB) / 2, yTop + 4, d.alphaLabel ?? "α", { size: 14, weight: 700, style: "italic" }));

  // ㉠·㉡ 지시선 (좌측) — ★ 화살표 끝이 **실제 곡선 위**에 놓이도록 파형값을 그대로 평가한다
  //   (상수 비율로 찍었더니 빈 공간이나 남의 파형을 가리켰다 — 시각검증에서 발견).
  const x1d = 1.6, x2d = 0.6;
  const p1 = { x: BOX.x + x1d * dx, y: cy - valueAt(d.ch1AmpDiv, 0, x1d) * dy };
  const p2 = { x: BOX.x + x2d * dx, y: cy - valueAt(d.ch2AmpDiv, shift, x2d) * dy };
  out.push(`<circle cx="${BOX.x - 78}" cy="${r(cy - 2.4 * dy)}" r="11" fill="white" stroke="${STROKE}" stroke-width="1"/>`);
  out.push(txt(BOX.x - 78, cy - 2.4 * dy + 5, d.markerCh1 ?? "㉠", { size: 12, weight: 700 }));
  out.push(`<line x1="${BOX.x - 66}" y1="${r(cy - 2.4 * dy)}" x2="${r(p1.x)}" y2="${r(p1.y)}" stroke="${STROKE}" stroke-width="0.9"/>`);
  out.push(`<circle cx="${BOX.x - 78}" cy="${r(cy - 0.9 * dy)}" r="11" fill="white" stroke="${STROKE}" stroke-width="1"/>`);
  out.push(txt(BOX.x - 78, cy - 0.9 * dy + 5, d.markerCh2 ?? "㉡", { size: 12, weight: 700 }));
  out.push(`<line x1="${BOX.x - 66}" y1="${r(cy - 0.9 * dy)}" x2="${r(p2.x)}" y2="${r(p2.y)}" stroke="${STROKE}" stroke-width="0.9"/>`);

  // 하단 스케일 표기
  out.push(txt(BOX.x + 2, BOX.y + BOX.h + 24, d.ch1Label, { size: 12, anchor: "start" }));
  out.push(txt(BOX.x + 2, BOX.y + BOX.h + 42, d.ch2Label, { size: 12, anchor: "start" }));
  out.push(txt(cx + 6, BOX.y + BOX.h + 24, d.timeLabel, { size: 12, anchor: "start" }));
  out.push(txt(SW / 2, SH - 8, "오실로스코프 측정 화면 — ㉠은 Ch1, ㉡은 Ch2 (수평 스케일은 두 채널 공통)", { size: 10, fill: MUTED }));

  return svg(SW, SH, out);
}

// ── (나) 측정 대상 회로 ───────────────────────────────────────────
const CW = 660, CH = 380;
const TOP = 90, BOT = 300;
const XS = 110, XA = 330, XB = 520;

export function renderOscilloscopePhaseCircuit(d: OscilloscopePhaseCircuitDiagram): string {
  const out: string[] = [];
  const isC = d.kind === "C";

  // 전원 (좌측 세로)
  out.push(acSource(XS, TOP, BOT));
  out.push(txt(XS - 34, (TOP + BOT) / 2 + 5, d.vsLabel, { anchor: "end", size: 13, weight: 700, fill: ACCENT }));

  // 상단: R (수평)
  const rx1 = XS + 50, rx2 = rx1 + 76;
  out.push(line(XS, TOP, rx1, TOP));
  hRes(out, rx1, rx2, TOP);
  out.push(line(rx2, TOP, XA, TOP));
  out.push(txt((rx1 + rx2) / 2, TOP - 16, d.rLabel, { size: 12, weight: 600 }));

  // 마디 A — 미지 소자 (세로) + 전압 측정 표기
  out.push(dot(XA, TOP));
  vElem(out, XA, TOP + 40, TOP + 100, isC);
  out.push(line(XA, TOP, XA, TOP + 40));
  out.push(line(XA, TOP + 100, XA, BOT));
  out.push(txt(XA + 26, (TOP + 40 + TOP + 100) / 2 + 5, d.unknownLabel, { size: 14, weight: 700, anchor: "start" }));
  out.push(txt(XA - 26, TOP + 34, "+", { size: 13, weight: 700, anchor: "end" }));
  out.push(txt(XA - 26, TOP + 112, "−", { size: 13, weight: 700, anchor: "end" }));
  out.push(txt(XA - 26, TOP + 74, d.measureLabel, { size: 13, weight: 700, anchor: "end", fill: ACCENT }));

  // 마디 A → 직렬 소자 → 마디 B
  const sx1 = XA + 50, sx2 = sx1 + 70;
  out.push(line(XA, TOP, sx1, TOP));
  hElem(out, sx1, sx2, TOP, isC);
  out.push(line(sx2, TOP, XB, TOP));
  out.push(txt((sx1 + sx2) / 2, TOP - 16, d.serLabel, { size: 12, weight: 600 }));

  // 마디 B → 세로 소자 → 하단 rail
  out.push(dot(XB, TOP));
  vElem(out, XB, TOP + 40, TOP + 100, isC);
  out.push(line(XB, TOP, XB, TOP + 40));
  out.push(line(XB, TOP + 100, XB, BOT));
  out.push(txt(XB + 24, (TOP + 40 + TOP + 100) / 2 + 5, d.shuntLabel, { size: 12, weight: 600, anchor: "start" }));

  // 하단 rail
  out.push(line(XS, BOT, XB, BOT));
  out.push(dot(XA, BOT));

  out.push(txt(CW / 2, CH - 10, `측정 대상 회로 — 단자 전압 ${d.measureLabel}를 Ch2로 측정 (${isC ? "커패시터" : "인덕터"} 회로)`, { size: 10, fill: MUTED }));
  return svg(CW, CH, out);
}

// ── 심볼 ─────────────────────────────────────────────────────────
function hRes(out: string[], x1: number, x2: number, y: number): void {
  const a = 7, teeth = 6, step = (x2 - x1) / teeth;
  let p = `M${x1},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${r(x1 + step * (i + 0.5))},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${x2},${y}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
/** 수평 리액티브 소자 (인덕터 코일 / 커패시터 극판). */
function hElem(out: string[], x1: number, x2: number, y: number, isC: boolean): void {
  if (isC) {
    const mx = (x1 + x2) / 2, g = 5, ph = 12;
    out.push(line(x1, y, mx - g, y));
    out.push(`<line x1="${mx - g}" y1="${y - ph}" x2="${mx - g}" y2="${y + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.5}"/>`);
    out.push(`<line x1="${mx + g}" y1="${y - ph}" x2="${mx + g}" y2="${y + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.5}"/>`);
    out.push(line(mx + g, y, x2, y));
    return;
  }
  const n = 4, w = (x2 - x1) / n, rr = w / 2;
  let p = `M${x1},${y}`;
  for (let i = 0; i < n; i++) p += ` A${r(rr)},${r(rr)} 0 0 1 ${r(x1 + w * (i + 1))},${y}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
}
/** 수직 리액티브 소자. */
function vElem(out: string[], x: number, y1: number, y2: number, isC: boolean): void {
  if (isC) {
    const my = (y1 + y2) / 2, g = 5, pw = 14;
    out.push(line(x, y1, x, my - g));
    out.push(`<line x1="${x - pw}" y1="${my - g}" x2="${x + pw}" y2="${my - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.5}"/>`);
    out.push(`<line x1="${x - pw}" y1="${my + g}" x2="${x + pw}" y2="${my + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.5}"/>`);
    out.push(line(x, my + g, x, y2));
    return;
  }
  const n = 4, h = (y2 - y1) / n, rr = h / 2;
  let p = `M${x},${y1}`;
  for (let i = 0; i < n; i++) p += ` A${r(rr)},${r(rr)} 0 0 0 ${x},${r(y1 + h * (i + 1))}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
}
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, rr = 24;
  const sine = `<path d="M${cx - 13},${cy} Q${cx - 6.5},${cy - 9} ${cx},${cy} T${cx + 13},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - rr}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + rr}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;
}
function txt(x: number, y: number, s: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string; style?: string } = {}): string {
  return `<text x="${r(x)}" y="${r(y)}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}"` +
    `${o.style === "italic" ? ' font-style="italic"' : ""} fill="${o.fill ?? STROKE}">${esc(s)}</text>`;
}
function esc(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function r(n: number): number { return Math.round(n * 100) / 100; }
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
