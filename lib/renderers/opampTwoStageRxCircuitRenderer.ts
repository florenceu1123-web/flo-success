import type { OpampTwoStageRxCircuitDiagram } from "@/types";

/**
 * 2단 OPAMP + 저항 R_X 설계 전용 fixed-slot 렌더러 (임용 2번 전자회로) — 원본 배치 그대로.
 *
 *   1단 U₁: V₁(좌하) ─R_a─ (−)  /  R_b 피드백(위) : V_X → (−)  /  V₂ ─R_c─ (+) ─R_X(점선, 세로)─ GND
 *   2단 U₂: V_X ─R_d─ (+) ─R_e(세로)─ GND  /  GND ─R_f─ (−) ─R_g(위, 피드백)─ V_o  /  V_o ─R_L(세로)─ GND
 *
 * ★ 라벨 규칙(#6): 저항 라벨은 소자 한쪽 side에만, OPAMP 핀 기호(+/−)는 삼각형 안쪽에.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderOpampTwoStageRxCircuit(d: OpampTwoStageRxCircuitDiagram): string {
  const W = 900, H = 520;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 좌표 (fixed slot) ────────────────────────────────────────────
  //  ★ 라벨 겹침 방지(규칙 #3·#6, 사용자 신고 2026-08-02):
  //    · 입력 4개(V₁ + (+)측 3개)를 **행(y)으로 완전히 분리**하고,
  //    · 각 전원의 세로 다리를 **서로 다른 x 열**에 두어(위 행일수록 왼쪽) 다른 행의 가로선과 만나지 않게 한다.
  //    · 저항 라벨은 소자 위, 전원 라벨은 소자 왼쪽 — 서로 다른 행이라 충돌하지 않는다.
  const rowY = [150, 230, 285, 340];          // 행: V₁(반전) / V₂·V₃·V₄(비반전)
  const srcX = [48, 92, 136, 180];            // 전원 세로 다리 x (위 행일수록 왼쪽)
  const xR = 268;                             // 입력 저항 열
  const xNm = 336, xNp = 358;                 // (−) 마디 / (+) 트렁크
  const xU1 = 392, xVx = 508;                 // U₁ 좌변 / V_X 마디
  const yMinus = 150, yPlus = 210;            // U₁ 입력 핀
  const yFb1 = 96;                            // 1단 피드백 배선
  const yGnd = 452;

  const drawSource = (x: number, y: number, label: string) => {
    const cy = y + 34;
    s.push(dcSource(x, y, yGnd, cy));
    t.push(text(x - 22, cy + 4, label, { anchor: "end", size: 11.5, weight: 700, fill: ACCENT }));
    s.push(gnd(x, yGnd));
  };

  // ── 1단: V₁ ─ R_a ─ (−) ─────────────────────────────────────────
  drawSource(srcX[0], rowY[0], `V_1 = ${d.v1Label}`);
  w.push(line(srcX[0], rowY[0], xR - 24, rowY[0]));
  s.push(resistorH(xR, rowY[0]));
  t.push(text(xR, rowY[0] - 14, d.raLabel, { size: 11.5, weight: 600 }));
  w.push(line(xR + 24, rowY[0], xNm, rowY[0]));
  s.push(dot(xNm, rowY[0]));
  w.push(line(xNm, yMinus, xU1, yMinus));

  // ── 1단: (+) 3입력 ─ 각 저항 ─ 트렁크 ────────────────────────────
  const plus = (d.plusInputs ?? []).slice(0, 3);
  plus.forEach((p, i) => {
    const y = rowY[i + 1];
    drawSource(srcX[i + 1], y, `${p.name} = ${p.vLabel}`);
    w.push(line(srcX[i + 1], y, xR - 24, y));
    s.push(resistorH(xR, y));
    t.push(text(xR, y - 14, p.rLabel, { size: 11.5, weight: 600 }));
    w.push(line(xR + 24, y, xNp, y));
    s.push(dot(xNp, y));
  });
  // (+) 트렁크 + U₁ (+) 핀
  w.push(line(xNp, rowY[1], xNp, rowY[3]));
  w.push(line(xNp, rowY[1], xNp, yPlus), line(xNp, yPlus, xU1, yPlus));

  // R_X (미지, 점선 박스) — 트렁크 하단 → GND
  const yRx = rowY[3] + 26;
  w.push(line(xNp, rowY[3], xNp, yRx));
  s.push(`<rect x="${xNp - 17}" y="${yRx}" width="34" height="46" fill="white" stroke="${RED}" stroke-width="1.5" stroke-dasharray="5 3"/>`);
  t.push(text(xNp + 26, yRx + 28, d.rxLabel, { anchor: "start", size: 12, weight: 700, fill: RED }));
  w.push(line(xNp, yRx + 46, xNp, yGnd));
  s.push(gnd(xNp, yGnd));

  // U₁ + 출력 V_X + 피드백 R_b
  s.push(opamp(xU1, yMinus, yPlus));
  const yU1 = (yMinus + yPlus) / 2;
  t.push(text(xU1 + 34, yU1 + 5, "U₁", { size: 12, weight: 700, fill: MUTED }));
  w.push(line(xU1 + 76, yU1, xVx, yU1));
  s.push(dot(xVx, yU1));
  t.push(text(xVx + 4, yU1 - 12, d.vxLabel, { anchor: "start", size: 12, weight: 700, fill: ACCENT }));
  w.push(line(xVx, yU1, xVx, yFb1), line(xVx, yFb1, xU1 + 40 + 24, yFb1));
  s.push(resistorH(xU1 + 40, yFb1));
  t.push(text(xU1 + 40, yFb1 - 13, d.rbLabel, { size: 11.5, weight: 600 }));
  w.push(line(xU1 + 40 - 24, yFb1, xNm, yFb1), line(xNm, yFb1, xNm, yMinus));

  // ── 2단 ─────────────────────────────────────────────────────────
  const xRd = 582, xNp2 = 650, xNm2 = 628, xU2 = 674, xVo = 812;
  const yM2 = 150, yP2 = 210, yFb2 = 84;
  const yU2 = (yM2 + yP2) / 2;
  // V_X ─ R_d ─ (+)₂ ─ R_e ─ GND
  w.push(line(xVx, yU1, xRd - 24, yP2));
  s.push(resistorH(xRd, yP2));
  t.push(text(xRd, yP2 + 18, d.rdLabel, { size: 11.5, weight: 600 }));
  w.push(line(xRd + 24, yP2, xNp2, yP2));
  s.push(dot(xNp2, yP2));
  w.push(line(xNp2, yP2, xNp2, 300));
  s.push(resistorV(xNp2, 326));
  w.push(line(xNp2, 352, xNp2, yGnd));
  s.push(gnd(xNp2, yGnd));
  t.push(text(xNp2 + 16, 330, d.reLabel, { anchor: "start", size: 11.5, weight: 600 }));

  // GND ─ R_f ─ (−)₂ ─ R_g ─ V_o (상단)
  const xGf = 500;
  s.push(gnd(xGf, yFb2 + 26));
  w.push(line(xGf, yFb2 + 26, xGf, yFb2), line(xGf, yFb2, 556 - 24, yFb2));
  s.push(resistorH(556, yFb2));
  t.push(text(556, yFb2 - 13, d.rfLabel, { size: 11.5, weight: 600 }));
  w.push(line(556 + 24, yFb2, xNm2, yFb2), line(xNm2, yFb2, xNm2, yM2));
  s.push(dot(xNm2, yFb2));
  s.push(resistorH(740, yFb2));
  t.push(text(740, yFb2 - 13, d.rgLabel, { size: 11.5, weight: 600 }));
  w.push(line(xNm2, yFb2, 740 - 24, yFb2), line(740 + 24, yFb2, xVo, yFb2), line(xVo, yFb2, xVo, yU2));

  // U₂ + 출력 V_o + 부하 R_L
  s.push(opamp(xU2, yM2, yP2));
  t.push(text(xU2 + 34, yU2 + 5, "U₂", { size: 12, weight: 700, fill: MUTED }));
  w.push(line(xU2 + 76, yU2, xVo, yU2));
  s.push(dot(xVo, yU2));
  w.push(line(xVo, yU2, xVo + 44, yU2));
  s.push(`<circle cx="${xVo + 46}" cy="${yU2}" r="3.4" fill="none" stroke="${STROKE}" stroke-width="1.4"/>`);
  t.push(text(xVo + 54, yU2 + 4, d.voLabel, { anchor: "start", size: 12, weight: 700, fill: ACCENT }));
  w.push(line(xVo, yU2, xVo, 300));
  s.push(resistorV(xVo, 326));
  w.push(line(xVo, 352, xVo, yGnd));
  s.push(gnd(xVo, yGnd));
  t.push(text(xVo + 16, 330, d.rlLabel, { anchor: "start", size: 11.5, weight: 600 }));

  // U₂ 입력 핀 배선
  w.push(line(xNm2, yM2, xU2, yM2), line(xNp2, yP2, xU2, yP2));

  const goal = d.unknown === "Vo" ? "V_o가 목표값이 되도록 R_X를 정한다" : "V_X가 목표값이 되도록 R_X를 정한다";
  t.push(text(W / 2, H - 12, `이상 OPAMP(가상단락) — ${goal}`, { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
/** OPAMP 삼각형 — 좌측 두 핀(위 −, 아래 +), 우측 출력. */
function opamp(x: number, yMinus: number, yPlus: number): string {
  const yc = (yMinus + yPlus) / 2, h = 62, wdt = 76;
  return `<polygon points="${x},${yc - h / 2} ${x},${yc + h / 2} ${x + wdt},${yc}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${x + 13}" y="${yMinus + 4}" text-anchor="middle" font-size="14" font-weight="700" fill="${STROKE}">−</text>` +
    `<text x="${x + 13}" y="${yPlus + 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${STROKE}">+</text>`;
}
/** 직류 전원 — 세로. cyOpt를 주면 원의 중심을 그 y에 고정한다(다리가 길어도 원이 아래로 안 내려감). */
function dcSource(cx: number, topY: number, botY: number, cyOpt?: number): string {
  const cy = cyOpt ?? (topY + botY) / 2, r = 16;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="12" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">−</text>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function gnd(x: number, y: number): string {
  return `<line x1="${x - 12}" y1="${y}" x2="${x + 12}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 7}" y1="${y + 5}" x2="${x + 7}" y2="${y + 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 3}" y1="${y + 10}" x2="${x + 3}" y2="${y + 10}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function resistorH(cx: number, cy: number): string {
  const half = 24, a = 6, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${cy}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${cy + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${cy}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function resistorV(cx: number, cy: number): string {
  const half = 24, a = 6, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${cx},${cy + half}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
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
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
