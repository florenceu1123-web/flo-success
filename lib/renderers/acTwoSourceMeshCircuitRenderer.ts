import type { AcTwoSourceMeshArm, AcTwoSourceMeshCircuitDiagram } from "@/types";

/**
 * 2전원 RLC 2-메시 회로 전용 fixed-slot 렌더러 (임용 5번 회로이론).
 *
 *   직사각 2-메시 — 좌 세로 = v₁, 우 세로 = v₂ (둘 다 + 위).
 *     상단 좌: topLeft (전류 I₁ →)     상단 우: topRight (전류 I₂ →)
 *     가운데 세로: mid (평균전력을 묻는 저항)
 *     하단 좌: botLeft                 하단 우: botRight
 *
 *   ★ 라벨 배치: 상단 소자는 **위**, 하단 소자는 **아래**, 가운데 세로는 **왼쪽**에 둔다
 *     (규칙 #6 — 서로 다른 lane으로 분리해 겹침 0).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 720, H = 430;
const TOP = 110, BOT = 320;
const XL = 130, XM = 400, XR = 640;

export function renderAcTwoSourceMeshCircuit(d: AcTwoSourceMeshCircuitDiagram): string {
  const out: string[] = [];
  // ★ 가산적 확장 — 미지정이면 기존(임용 5번) 그림과 **완전히 동일**하다(스모크가 단언).
  const showArrows = d.showMeshArrows ?? true;

  // ── 좌·우 전원 (세로) ──
  out.push(acSource(XL, TOP, BOT));
  // ★ 좌측 전원 라벨이 길면 캔버스 왼쪽 밖으로 잘린다(실측: "V_s = √2∠45°V"의 앞 글자가 사라졌다).
  //   폭을 추정해 넘칠 때만 **전원 위쪽**으로 옮긴다(그 자리는 비어 있다 — 상단 소자 라벨은 x=265 근처).
  const v1W = d.v1Label.length * 6.8;
  if (XL - 36 - v1W < 6) {
    out.push(txt(XL, TOP - 46, d.v1Label, { size: 13, weight: 700, fill: ACCENT }));
  } else {
    out.push(txt(XL - 36, (TOP + BOT) / 2 + 5, d.v1Label, { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  }
  out.push(d.rightSource === "current" ? acCurrentSource(XR, TOP, BOT) : acSource(XR, TOP, BOT));
  out.push(txt(XR + 36, (TOP + BOT) / 2 + 5, d.v2Label, { anchor: "start", size: 13, weight: 700, fill: ACCENT }));

  // ── 상단 좌: topLeft (I₁) ──
  hArm(out, XL, XM, TOP, d.topLeft, "up");
  if (showArrows) {
    arrow(out, XL + 34, TOP - 26, XL + 74);
    out.push(txt(XL + 54, TOP - 32, d.i1Label ?? "I₁", { size: 13, weight: 700, fill: ACCENT }));
  }

  // ── 상단 우: topRight (I₂) ──
  hArm(out, XM, XR, TOP, d.topRight, "up");
  if (showArrows) {
    arrow(out, XM + 34, TOP - 26, XM + 74);
    out.push(txt(XM + 54, TOP - 32, d.i2Label ?? "I₂", { size: 13, weight: 700, fill: ACCENT }));
  }

  // ── 가운데 세로: mid ──
  vArm(out, XM, TOP, BOT, d.mid, "left");
  out.push(dot(XM, TOP));
  out.push(dot(XM, BOT));
  // 측정 전압 표기 — 가운데 가지 **오른쪽**에 +/−(소자 라벨은 왼쪽 lane이라 겹치지 않는다, 규칙 #6).
  if (d.midMeasureLabel) {
    const cy = (TOP + BOT) / 2;
    out.push(txt(XM + 26, TOP + 30, "+", { size: 14, weight: 700 }));
    out.push(txt(XM + 26, cy + 5, d.midMeasureLabel, { size: 13, weight: 700, fill: ACCENT }));
    out.push(txt(XM + 26, BOT - 20, "−", { size: 14, weight: 700 }));
  }

  // ── 하단 좌·우 ──
  hArm(out, XL, XM, BOT, d.botLeft, "down");
  hArm(out, XM, XR, BOT, d.botRight, "down");

  out.push(txt(W / 2, H - 10, d.caption ?? "두 교류 전원이 포함된 RLC 회로 — 메시 전류 I₁·I₂ (가운데 저항에는 I₁ − I₂가 흐른다)", { size: 10, fill: MUTED }));
  return svg(W, H, out);
}

// ── 소자 배치 ────────────────────────────────────────────────────
/** 수평 가지에 소자 1개 + 라벨(위/아래). */
function hArm(out: string[], x1: number, x2: number, y: number, arm: AcTwoSourceMeshArm, side: "up" | "down"): void {
  const mid = (x1 + x2) / 2, half = 26;
  out.push(line(x1, y, mid - half, y));
  out.push(sym(mid, y, half, arm.kind, false));
  out.push(line(mid + half, y, x2, y));
  const dy = side === "up" ? -22 : 30;
  out.push(txt(mid, y + dy, arm.name, { size: 12, weight: 700 }));
  out.push(txt(mid, y + dy + (side === "up" ? -15 : 15), arm.label, { size: 12 }));
}
/** 수직 가지에 소자 1개 + 라벨(좌/우). */
function vArm(out: string[], x: number, y1: number, y2: number, arm: AcTwoSourceMeshArm, side: "left" | "right"): void {
  const mid = (y1 + y2) / 2, half = 26;
  out.push(line(x, y1, x, mid - half));
  out.push(sym(x, mid, half, arm.kind, true));
  out.push(line(x, mid + half, x, y2));
  const dx = side === "left" ? -18 : 18;
  const anchor = side === "left" ? "end" : "start";
  out.push(txt(x + dx, mid - 4, arm.name, { size: 12, weight: 700, anchor }));
  out.push(txt(x + dx, mid + 14, arm.label, { size: 12, anchor }));
}

/** 소자 심볼 (중심 (cx,cy), 반길이 half, vertical이면 90° 회전). */
function sym(cx: number, cy: number, half: number, kind: "R" | "L" | "C", vertical: boolean): string {
  const body =
    kind === "R" ? symResistor(half) : kind === "C" ? symCapacitor(half) : symInductor(half);
  return `<g transform="translate(${r(cx)},${r(cy)})${vertical ? " rotate(90)" : ""}">${body}</g>`;
}
function symResistor(half: number): string {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${-half},0`;
  for (let i = 0; i < teeth; i++) p += ` L${r(-half + step * (i + 0.5))},${i % 2 === 0 ? -a : a}`;
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
  const n = 4, rr = half / n;
  let p = `M${-half},0`;
  for (let i = 0; i < n; i++) p += ` A${r(rr)},${r(rr)} 0 0 1 ${r(-half + rr * (2 * i + 2))},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ── 공통 ─────────────────────────────────────────────────────────
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, rr = 22;
  const sine = `<path d="M${cx - 12},${cy} Q${cx - 6},${cy - 8} ${cx},${cy} T${cx + 12},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - rr}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + rr}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx + 15}" y="${cy - 24}" text-anchor="middle" font-size="12" font-weight="700" fill="${STROKE}">+</text>` +
    `<text x="${cx + 15}" y="${cy + 34}" text-anchor="middle" font-size="12" font-weight="700" fill="${STROKE}">−</text>`;
}
/** 교류 **전류원** — 원 안에 위로 향하는 화살표(원본의 I_s 표기). */
function acCurrentSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, rr = 22;
  const shaft = `<line x1="${cx}" y1="${cy + 13}" x2="${cx}" y2="${cy - 11}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const head = `<path d="M${cx},${cy - 15} l-5,8 l10,0 z" fill="${STROKE}"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${shaft}${head}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - rr}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + rr}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function arrow(out: string[], x1: number, y: number, x2: number): void {
  out.push(`<path d="M${r(x1)},${y} L${r(x2)},${y}" stroke="${ACCENT}" stroke-width="1.8" fill="none"/>`);
  out.push(`<path d="M${r(x2)},${y} l-7,-4 l0,8 z" fill="${ACCENT}"/>`);
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;
}
function txt(x: number, y: number, s: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${r(x)}" y="${r(y)}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(s)}</text>`;
}
function esc(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function r(n: number): number { return Math.round(n * 100) / 100; }
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
