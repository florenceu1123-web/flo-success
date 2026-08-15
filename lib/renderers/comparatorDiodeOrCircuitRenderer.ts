import type { ComparatorDiodeOrCircuitDiagram } from "@/types";

/**
 * 비교기 2개 + 다이오드 결합 회로 (임용 3번 전자회로) 전용 fixed-slot 렌더러.
 *
 *  배치(원본 그대로):
 *    좌측 V_in 전원 → 수직 트렁크 → 두 비교기의 V_in 단자
 *    각 비교기의 기준 전압 단자는 반대쪽 핀에서 좌측으로 빠져 위(아래) 단자로
 *    각 출력 → 다이오드 → 공통 세로 레일(V_out) → 저항 → 접지(또는 +V_CC)
 *
 * ★ V_in이 (+)에 물리는지 (−)에 물리는지가 답을 가른다 — `inPin`으로 핀 배치를 결정한다.
 * ★ 다이오드 방향도 답을 가른다 — or_pulldown은 애노드가 비교기 쪽(레일로 향함),
 *   and_pullup은 캐소드가 비교기 쪽(비교기로 향함).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const W = 600, H = 420;
const X_TRUNK = 120;      // V_in 세로 트렁크
const X_REF = 172;        // 기준 전압 세로 레인
const X_AMP = 214;        // 삼각형 좌변
const AMP_W = 92, AMP_H = 84;
const X_APEX = X_AMP + AMP_W;
const X_DIODE = 372;
const X_RAIL = 452;       // 공통 출력 마디 세로 레일
const CY1 = 116, CY2 = 268;
const Y_MID = (CY1 + CY2) / 2;

export function renderComparatorDiodeOrCircuit(d: ComparatorDiodeOrCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const pullUp = d.config === "and_pullup";
  const cys = [CY1, CY2];

  // ── 비교기 2개 ──────────────────────────────────────────────────────────
  const vinPinYs: number[] = [];
  cys.forEach((cy, i) => {
    const c = d.comparators[i];
    const yTop = cy - 18, yBot = cy + 18;          // 위 핀 = (−), 아래 핀 = (+)  ← 원본 표기
    const yVin = c.inPin === "plus" ? yBot : yTop;
    const yRef = c.inPin === "plus" ? yTop : yBot;
    vinPinYs.push(yVin);

    s.push(triangle(X_AMP, cy));
    // 핀 기호는 삼각형 **안쪽**에 (규칙 #6 — 가장자리에 두면 인접 배선 라벨과 붙어 보인다)
    t.push(text(X_AMP + 16, yTop + 5, "−", { size: 15, weight: 700 }));
    t.push(text(X_AMP + 16, yBot + 5, "+", { size: 15, weight: 700 }));

    // 기준 전압 리드 — 반대쪽 핀에서 좌측으로 빠져 위(아래) 단자로.
    const yTerm = i === 0 ? 40 : H - 66;
    w.push(line(X_AMP, yRef, X_REF, yRef));
    w.push(line(X_REF, yRef, X_REF, yTerm));
    s.push(term(X_REF, yTerm));
    t.push(text(X_REF, i === 0 ? yTerm - 12 : yTerm + 20, c.refLabel, { size: 13, weight: 700 }));

    // V_in 리드 — 트렁크에서 수평으로.
    w.push(line(X_TRUNK, yVin, X_AMP, yVin));

    // 출력 → 다이오드 → 레일
    w.push(line(X_APEX, cy, X_DIODE - 22, cy));
    s.push(diodeH(X_DIODE, cy, pullUp ? -1 : +1));
    t.push(text(X_DIODE, cy - 20, c.diodeLabel, { size: 13, weight: 700 }));
    w.push(line(X_DIODE + 22, cy, X_RAIL, cy));
    s.push(dot(X_RAIL, cy));
  });

  // ── V_in 전원 + 트렁크 ─────────────────────────────────────────────────
  const yTrunkA = Math.min(...vinPinYs), yTrunkB = Math.max(...vinPinYs);
  w.push(line(X_TRUNK, yTrunkA, X_TRUNK, yTrunkB));
  const xSrc = 56, ySrc = Y_MID + 74;
  w.push(line(X_TRUNK, Y_MID, xSrc, Y_MID));
  s.push(dot(X_TRUNK, Y_MID));
  w.push(line(xSrc, Y_MID, xSrc, ySrc - 20));
  s.push(acSource(xSrc, ySrc));
  t.push(text(xSrc - 28, ySrc + 5, d.vinLabel, { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(xSrc, ySrc + 20, xSrc, ySrc + 48));
  s.push(gnd(xSrc, ySrc + 48));

  // ── 공통 레일 + 저항 + V_out ───────────────────────────────────────────
  w.push(line(X_RAIL, CY1, X_RAIL, CY2));
  w.push(line(X_RAIL, Y_MID, X_RAIL + 78, Y_MID));
  s.push(dot(X_RAIL, Y_MID), term(X_RAIL + 78, Y_MID));
  t.push(text(X_RAIL + 88, Y_MID + 5, d.outLabel, { anchor: "start", size: 13, weight: 700, fill: RED }));

  if (pullUp) {
    // 풀업 — 레일 위쪽으로 저항 → +V_CC 단자
    w.push(line(X_RAIL, CY1, X_RAIL, CY1 - 34));
    s.push(resistorV(X_RAIL, CY1 - 60));
    t.push(text(X_RAIL + 18, CY1 - 56, d.rLabel, { anchor: "start", size: 12, weight: 600 }));
    w.push(line(X_RAIL, CY1 - 86, X_RAIL, 34));
    s.push(term(X_RAIL, 34));
    t.push(text(X_RAIL, 22, d.pullSupplyLabel ?? "+V_CC", { size: 13, weight: 700 }));
  } else {
    // 풀다운 — 레일 아래쪽으로 저항 → 접지
    w.push(line(X_RAIL, CY2, X_RAIL, CY2 + 30));
    s.push(resistorV(X_RAIL, CY2 + 56));
    t.push(text(X_RAIL + 18, CY2 + 60, d.rLabel, { anchor: "start", size: 12, weight: 600 }));
    w.push(line(X_RAIL, CY2 + 82, X_RAIL, CY2 + 106));
    s.push(gnd(X_RAIL, CY2 + 106));
  }

  t.push(text(W / 2, H - 8,
    "모든 소자는 이상적 — 다이오드는 순방향 단락·역방향 개방, 연산 증폭기 출력은 ± 포화값",
    { size: 10, fill: MUTED }));

  return svg(W, H, [...w, ...s, ...t]);
}

/** 비교기 삼각형 — 좌변이 x, 꼭짓점이 오른쪽. */
function triangle(x: number, cy: number): string {
  const top = cy - AMP_H / 2, bot = cy + AMP_H / 2;
  return `<path d="M${x},${top} L${x},${bot} L${x + AMP_W},${cy} Z" fill="white" stroke="${STROKE}" stroke-width="1.7" stroke-linejoin="round"/>`;
}

/**
 * 다이오드 (수평). dir=+1이면 **오른쪽으로 도통**(애노드가 왼쪽 = 비교기 쪽),
 * dir=-1이면 왼쪽으로 도통(캐소드가 왼쪽).
 */
function diodeH(cx: number, cy: number, dir: 1 | -1): string {
  const h = 10, len = 14;
  const tipX = cx + dir * len / 2, backX = cx - dir * len / 2;
  const bar = tipX;
  let g = `<path d="M${backX},${cy - h} L${backX},${cy + h} L${tipX},${cy} Z" fill="${STROKE}"/>`;
  g += `<line x1="${bar}" y1="${cy - h}" x2="${bar}" y2="${cy + h}" stroke="${STROKE}" stroke-width="2.4"/>`;
  // 양쪽 리드
  g += `<line x1="${cx - 22}" y1="${cy}" x2="${Math.min(backX, tipX)}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  g += `<line x1="${Math.max(backX, tipX)}" y1="${cy}" x2="${cx + 22}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return g;
}

/** 입력 전원 — 원 안에 +/− (원본의 V_in 기호). */
function acSource(cx: number, cy: number): string {
  let g = `<circle cx="${cx}" cy="${cy}" r="20" fill="white" stroke="${STROKE}" stroke-width="1.6"/>`;
  g += `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">+</text>`;
  g += `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">−</text>`;
  return g;
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
