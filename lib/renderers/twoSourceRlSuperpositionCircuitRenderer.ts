import type { TwoSourceRlSuperpositionCircuitDiagram } from "@/types";

/**
 * 임용 4번 전용 fixed-slot 렌더러 — 전압원 2개 RL 중첩 회로 (가)/(나)/(다).
 *
 *  직사각 루프:
 *    좌측 세로 = v₁ (+위)        [v2_only면 단락 도선]
 *    상단 = R₁ → 마디 M,  하단 = R₂ → 마디 N
 *    가운데 세로 = R₃ (M↓N)
 *    M ─ [L 또는 C](측정 화살표/극성) ─ 우측 세로 v₂(+위) ─ N   [v1_only면 v₂ 자리를 단락]
 *  dashedBox=true면 좌측 회로망(전원·R₁·R₂·R₃)을 점선으로 감싼다 — (나)·(다)의 "점선 부분".
 *  showPlots=true면 오른쪽에 v₁ 펄스·v₂ 정현파 작은 그래프를 함께 그린다(원본 (가) 표기).
 */

const STROKE = "#111827";
const W = 1.5;
const DOT_R = 3.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";
const DASH = "#6b7280";

const X_SRC = 110;      // 좌측 전원 세로선
const X_M = 400;        // 마디 M·N 세로선 (R₃)
const X_RIGHT = 640;    // 우측 세로선 (v₂)
const Y_TOP = 96;
const Y_BOT = 300;
const Y_MID = (Y_TOP + Y_BOT) / 2;

const PLOT_X = 720;
const SVG_W_PLOTS = 1000;
const SVG_W_PLAIN = 720;
const SVG_H = 380;

type D = TwoSourceRlSuperpositionCircuitDiagram;

export function renderTwoSourceRlSuperpositionCircuit(d: D): string {
  if (!d?.r1Label) return emptySvg("invalid two_source_rl_superposition diagram");
  const showPlots = d.showPlots === true;
  const svgW = showPlots ? SVG_W_PLOTS : SVG_W_PLAIN;

  const wires: string[] = [];
  const dots: string[] = [];
  const sym: string[] = [];
  const lab: string[] = [];

  // ── 점선 박스 (좌측 회로망) ─────────────────
  if (d.dashedBox) {
    sym.push(`<rect x="${X_SRC - 52}" y="${Y_TOP - 42}" width="${X_M - X_SRC + 96}" height="${Y_BOT - Y_TOP + 84}" ` +
      `fill="none" stroke="${DASH}" stroke-width="1.2" stroke-dasharray="5 4"/>`);
  }

  // ── 좌측 세로: v₁ (또는 단락) ───────────────
  if (d.variant === "v2_only") {
    wires.push(line(X_SRC, Y_TOP, X_SRC, Y_BOT));   // v₁ 제거 → 단락
    lab.push(text(X_SRC - 12, Y_MID + 4, "(v₁ 단락)", { size: 11, fill: MUTED, anchor: "end" }));
  } else {
    sym.push(sourceCircle(X_SRC, Y_MID, "dc"));
    wires.push(line(X_SRC, Y_TOP, X_SRC, Y_MID - 26));
    wires.push(line(X_SRC, Y_MID + 26, X_SRC, Y_BOT));
    lab.push(text(X_SRC - 34, Y_MID + 5, d.v1Label ?? "v₁(t)", { size: 14, weight: 700, anchor: "end" }));
    lab.push(text(X_SRC, Y_MID - 9, "+", { size: 14, weight: 700 }));
    lab.push(text(X_SRC, Y_MID + 19, "−", { size: 14, weight: 700 }));
  }

  // ── 상단 R₁ / 하단 R₂ ───────────────────────
  const xR1 = (X_SRC + X_M) / 2;
  sym.push(resistorH(xR1, Y_TOP));
  wires.push(line(X_SRC, Y_TOP, xR1 - 26, Y_TOP));
  wires.push(line(xR1 + 26, Y_TOP, X_M, Y_TOP));
  lab.push(text(xR1, Y_TOP - 18, d.r1Label, { size: 13 }));

  sym.push(resistorH(xR1, Y_BOT));
  wires.push(line(X_SRC, Y_BOT, xR1 - 26, Y_BOT));
  wires.push(line(xR1 + 26, Y_BOT, X_M, Y_BOT));
  lab.push(text(xR1, Y_BOT - 18, d.r2Label, { size: 13 }));

  // ── 가운데 R₃ (M ↓ N) ───────────────────────
  dots.push(dot(X_M, Y_TOP), dot(X_M, Y_BOT));
  sym.push(resistorV(X_M, Y_MID));
  wires.push(line(X_M, Y_TOP, X_M, Y_MID - 26));
  wires.push(line(X_M, Y_MID + 26, X_M, Y_BOT));
  lab.push(text(X_M + 20, Y_MID + 5, d.r3Label, { size: 13, anchor: "start" }));

  // ── M ─ [L | C] ─ 우측 ──────────────────────
  const xX = (X_M + X_RIGHT) / 2;
  if (d.reactive === "L") {
    sym.push(inductorH(xX, Y_TOP));
    wires.push(line(X_M, Y_TOP, xX - 26, Y_TOP));
    wires.push(line(xX + 26, Y_TOP, X_RIGHT, Y_TOP));
  } else {
    sym.push(capacitorH(xX, Y_TOP));
    wires.push(line(X_M, Y_TOP, xX - 9, Y_TOP));
    wires.push(line(xX + 9, Y_TOP, X_RIGHT, Y_TOP));
  }
  lab.push(text(xX, Y_TOP - 26, d.reactiveLabel, { size: 13, weight: 700 }));

  // 측정 표기 — L이면 전류 화살표(→), C면 양단 극성(+ −)
  const mLabel = d.measureLabel ?? (d.reactive === "L" ? "i(t)" : "v_C(t)");
  if (d.reactive === "L") {
    sym.push(arrowRight(xX - 22, xX + 26, Y_TOP + 20));
    lab.push(text(xX + 2, Y_TOP + 38, mLabel, { size: 14, weight: 700, fill: ACCENT }));
  } else {
    lab.push(text(xX - 20, Y_TOP + 20, "+", { size: 15, weight: 700, fill: ACCENT }));
    lab.push(text(xX + 20, Y_TOP + 20, "−", { size: 15, weight: 700, fill: ACCENT }));
    lab.push(text(xX, Y_TOP + 40, mLabel, { size: 14, weight: 700, fill: ACCENT }));
  }

  // ── 우측 세로: v₂ (또는 단락) ───────────────
  if (d.variant === "v1_only") {
    wires.push(line(X_RIGHT, Y_TOP, X_RIGHT, Y_BOT));   // v₂ 제거 → 단락
    lab.push(text(X_RIGHT + 12, Y_MID + 4, "(v₂ 단락)", { size: 11, fill: MUTED, anchor: "start" }));
  } else {
    sym.push(sourceCircle(X_RIGHT, Y_MID, "ac"));
    wires.push(line(X_RIGHT, Y_TOP, X_RIGHT, Y_MID - 26));
    wires.push(line(X_RIGHT, Y_MID + 26, X_RIGHT, Y_BOT));
    lab.push(text(X_RIGHT + 34, Y_MID + 5, d.v2Label ?? "v₂(t)", { size: 14, weight: 700, anchor: "start" }));
    lab.push(text(X_RIGHT, Y_MID - 9, "+", { size: 14, weight: 700 }));
    lab.push(text(X_RIGHT, Y_MID + 19, "−", { size: 14, weight: 700 }));
  }
  wires.push(line(X_M, Y_BOT, X_RIGHT, Y_BOT));

  // ── 파형 그래프 (원본 (가) 표기) ─────────────
  if (showPlots) {
    sym.push(pulsePlot(PLOT_X, 70, d.pulseHeight ?? 10, d.pulseWidthTex ?? "π"));
    sym.push(sinePlot(PLOT_X, 232, d.sineAmp ?? 10, d.omega ?? 1));
  }

  if (d.caption) lab.push(text(svgW / 2, SVG_H - 10, d.caption, { size: 11, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${svgW} ${SVG_H}">\n${[
    ...wires, ...dots, ...sym, ...lab,
  ].join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────
function sourceCircle(cx: number, cy: number, kind: "dc" | "ac"): string {
  const r = 26;
  const c = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${W}"/>`;
  if (kind === "dc") return c;
  const wv = `<path d="M${cx - 13},${cy} q6.5,-11 13,0 q6.5,11 13,0" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
  return c + wv;
}

function resistorH(cx: number, cy: number): string {
  const w = 26, h = 9;
  let p = `M${cx - w},${cy}`;
  for (let i = 0; i < 6; i++) p += ` L${cx - w + ((i + 1) * 2 * w) / 7},${cy + (i % 2 === 0 ? -h : h)}`;
  return `<path d="${p} L${cx + w},${cy}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}

function resistorV(cx: number, cy: number): string {
  const h = 26, w = 9;
  let p = `M${cx},${cy - h}`;
  for (let i = 0; i < 6; i++) p += ` L${cx + (i % 2 === 0 ? w : -w)},${cy - h + ((i + 1) * 2 * h) / 7}`;
  return `<path d="${p} L${cx},${cy + h}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}

/** 가로 인덕터 — 코일 4개(위로 볼록). */
function inductorH(cx: number, cy: number): string {
  const n = 4, r = 6.5;
  const left = cx - n * r;
  let p = `M${left},${cy}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${left + (i + 1) * 2 * r},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W}"/>`;
}

/** 가로 커패시터 — 평행 두 극판. */
function capacitorH(cx: number, cy: number): string {
  const g = 5, h = 15;
  return (
    `<line x1="${cx - g}" y1="${cy - h}" x2="${cx - g}" y2="${cy + h}" stroke="${STROKE}" stroke-width="2.2"/>` +
    `<line x1="${cx + g}" y1="${cy - h}" x2="${cx + g}" y2="${cy + h}" stroke="${STROKE}" stroke-width="2.2"/>`
  );
}

function arrowRight(x1: number, x2: number, y: number): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2 - 8}" y2="${y}" stroke="${ACCENT}" stroke-width="2"/>` +
    `<polygon points="${x2},${y} ${x2 - 9},${y - 5} ${x2 - 9},${y + 5}" fill="${ACCENT}"/>`;
}

/** v₁ 펄스 파형 (0~T₁ 동안 높이 V₁). */
function pulsePlot(x: number, y: number, h: number, widthTex: string): string {
  const w = 190, hh = 62;
  const ax = `<line x1="${x}" y1="${y + hh}" x2="${x + w}" y2="${y + hh}" stroke="${STROKE}" stroke-width="1.3"/>` +
    `<polygon points="${x + w + 7},${y + hh} ${x + w - 3},${y + hh - 4} ${x + w - 3},${y + hh + 4}" fill="${STROKE}"/>` +
    `<line x1="${x + 22}" y1="${y + hh + 8}" x2="${x + 22}" y2="${y}" stroke="${STROKE}" stroke-width="1.3"/>` +
    `<polygon points="${x + 22},${y - 7} ${x + 18},${y + 3} ${x + 26},${y + 3}" fill="${STROKE}"/>`;
  const top = y + 14;
  const pulse = `<path d="M${x + 22},${y + hh} L${x + 22},${top} L${x + 86},${top} L${x + 86},${y + hh} L${x + w - 10},${y + hh}" ` +
    `fill="none" stroke="${STROKE}" stroke-width="1.8"/>`;
  const labs =
    `<text x="${x + 16}" y="${top + 4}" text-anchor="end" font-size="11">${h}</text>` +
    `<text x="${x + 22}" y="${y + hh + 20}" text-anchor="middle" font-size="11">0</text>` +
    `<text x="${x + 86}" y="${y + hh + 20}" text-anchor="middle" font-size="11">${escapeSvg(widthTex)}</text>` +
    `<text x="${x + w + 4}" y="${y + hh + 20}" text-anchor="end" font-size="11">t[s]</text>` +
    `<text x="${x + 26}" y="${y - 12}" font-size="12" fill="${MUTED}">v₁(t)[V]</text>`;
  return ax + pulse + labs;
}

/**
 * π의 유리수배를 **구체적인 값**으로 적는다 — "π/2", "π", "3π/2", "2π".
 * (원본처럼 눈금값을 직접 적기 위한 것 — "kπ/ω" 같은 **식으로 적지 않는다**.)
 */
function piMul(r: number): string {
  const round = (z: number) => Math.round(z * 1e6) / 1e6;
  const n = round(r);
  if (Math.abs(n - Math.round(n)) < 1e-9) {
    const k = Math.round(n);
    return k === 1 ? "π" : `${k}π`;
  }
  for (const d of [2, 3, 4]) {
    const num = n * d;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const k = Math.round(num);
      return `${k === 1 ? "" : k}π/${d}`;
    }
  }
  return `${round(n)}π`;
}

/** v₂ 정현파 파형. ω를 받아 **t축 눈금값(영교차 시각)** 을 실제 시간으로 찍는다. */
function sinePlot(x: number, y: number, amp: number, omega: number): string {
  const w = 190, hh = 46;
  const midY = y + hh;
  const ax = `<line x1="${x}" y1="${midY}" x2="${x + w}" y2="${midY}" stroke="${STROKE}" stroke-width="1.3"/>` +
    `<polygon points="${x + w + 7},${midY} ${x + w - 3},${midY - 4} ${x + w - 3},${midY + 4}" fill="${STROKE}"/>` +
    `<line x1="${x + 22}" y1="${midY + hh - 4}" x2="${x + 22}" y2="${y - 4}" stroke="${STROKE}" stroke-width="1.3"/>` +
    `<polygon points="${x + 22},${y - 11} ${x + 18},${y - 1} ${x + 26},${y - 1}" fill="${STROKE}"/>`;
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const tt = (i / 120) * 4 * Math.PI;
    const px = x + 22 + (tt / (4 * Math.PI)) * (w - 34);
    const py = midY - Math.sin(tt) * (hh - 8);
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  const curve = `<polyline points="${pts.join(" ")}" fill="none" stroke="${STROKE}" stroke-width="1.8"/>`;
  // ★ t축 눈금 — 그래프는 인수 0~4π를 그리므로 **실제 시간은 kπ/ω**(k = 0..4)에서 영교차한다.
  //   원본처럼 그 값을 직접 적는다(식이 아니라 구체값: π/2·π·3π/2·2π …).
  let ticks = "";
  for (let k = 0; k <= 4; k++) {
    const px = x + 22 + (k / 4) * (w - 34);
    ticks += `<line x1="${px.toFixed(1)}" y1="${midY - 4}" x2="${px.toFixed(1)}" y2="${midY + 4}" stroke="${STROKE}" stroke-width="1.1"/>`;
    const label = k === 0 ? "0" : piMul(k / omega);
    ticks += `<text x="${px.toFixed(1)}" y="${midY + 18}" text-anchor="middle" font-size="10.5">${escapeSvg(label)}</text>`;
  }
  const labs =
    `<text x="${x + 16}" y="${midY - hh + 12}" text-anchor="end" font-size="11">${amp}</text>` +
    `<text x="${x + 16}" y="${midY + hh - 2}" text-anchor="end" font-size="11">−${amp}</text>` +
    `<text x="${x + w + 6}" y="${midY - 8}" text-anchor="end" font-size="11">t[s]</text>` +
    `<text x="${x + 26}" y="${y - 16}" font-size="12" fill="${MUTED}">v₂(t)[V]</text>`;
  return ax + curve + ticks + labs;
}

// ─── primitives ──────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}
function text(
  x: number, y: number, s: string,
  o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" ` +
    `font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${escapeSvg(s)}</text>`;
}
function escapeSvg(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W_PLAIN} 64"><text x="${SVG_W_PLAIN / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${escapeSvg(msg)}</text></svg>`;
}
