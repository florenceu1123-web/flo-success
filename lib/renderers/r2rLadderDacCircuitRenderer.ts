import type { R2rLadderDacDiagram } from "@/types";

/**
 * 임용 28번 — **4비트 R-2R 사다리형 D/A 변환회로** 전용 fixed-slot 렌더러.
 *
 * 원본 배치를 그대로 따른다:
 *   좌측 접지 → 종단 2R(가로) → 마디 n₁ … n₄ (직렬 R로 연결)
 *   각 마디에서 아래로 2R → 비트 상자 [A] [B] [C] [D]  (A=LSB, D=MSB)
 *   n₄ → OPAMP (+), (−)에는 접지측 R_g 와 귀환 R_f → V_o
 *
 * ★ 비트 상자는 원본처럼 **네모 박스**로 그린다 — 스위치가 아니라 디지털 입력 단자다.
 */

const STROKE = "#111827";
const MUTED = "#6b7280";
const FONT = `'Noto Sans CJK KR','Malgun Gothic',sans-serif`;
const W_LINE = 1.7;

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(x: number, y: number, s: string, o: { size?: number; weight?: number; fill?: string; anchor?: string } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}"` +
    ` font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}" font-family="${FONT}">${esc(s)}</text>`;
}
function line(x1: number, y1: number, x2: number, y2: number, w = W_LINE) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${w}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number) {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;
}
/** 가로 저항 — 라벨은 위. */
function hRes(cx: number, y: number, half: number, label: string) {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i += 1) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W_LINE}" stroke-linejoin="round"/>` +
    text(cx, y - 14, label, { size: 11.5, weight: 600 });
}
/** 세로 저항 — 라벨은 오른쪽. */
function vRes(x: number, cy: number, half: number, label: string) {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i += 1) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${W_LINE}" stroke-linejoin="round"/>` +
    text(x + a + 8, cy + 4, label, { size: 11.5, weight: 600, anchor: "start" });
}
function ground(x: number, y: number) {
  return line(x, y, x, y + 12) + line(x - 15, y + 12, x + 15, y + 12, 1.9) +
    line(x - 9, y + 18, x + 9, y + 18) + line(x - 4, y + 24, x + 4, y + 24, 1.4);
}

const W = 860, H = 470;
const RAIL_Y = 150;          // 사다리 가로 rail
const BIT_Y = 300;           // 비트 상자 y
const X_GND = 60;            // 좌측 접지
const X0 = 130;              // 첫 마디 n₁
const DX = 96;               // 마디 간격
const OP_X = 590, OP_Y = 176, OP_W = 96, OP_H = 96;

export function renderR2rLadderDacCircuit(d: R2rLadderDacDiagram): string {
  const rs = d.seriesLabel, rp = d.shuntLabel;
  const bits = d.bitLabels ?? ["A", "B", "C", "D"];
  const nodes = bits.map((_, i) => X0 + i * DX);

  let svg = "";

  // ── 좌측 접지 + 종단 2R ──
  svg += ground(X_GND, RAIL_Y);
  svg += hRes((X_GND + nodes[0]) / 2, RAIL_Y, 26, rp);
  svg += line(X_GND, RAIL_Y, (X_GND + nodes[0]) / 2 - 26, RAIL_Y);
  svg += line((X_GND + nodes[0]) / 2 + 26, RAIL_Y, nodes[0], RAIL_Y);

  // ── 직렬 R + 마디 + 션트 2R + 비트 상자 ──
  nodes.forEach((x, i) => {
    svg += dot(x, RAIL_Y);
    if (i < nodes.length - 1) {
      const mid = (x + nodes[i + 1]) / 2;
      svg += hRes(mid, RAIL_Y, 24, rs);
      svg += line(x, RAIL_Y, mid - 24, RAIL_Y);
      svg += line(mid + 24, RAIL_Y, nodes[i + 1], RAIL_Y);
    }
    // 션트 2R (아래로)
    const cy = (RAIL_Y + BIT_Y) / 2;
    svg += line(x, RAIL_Y, x, cy - 26);
    svg += vRes(x, cy, 26, rp);
    svg += line(x, cy + 26, x, BIT_Y - 14);
    // 비트 상자
    svg += `<rect x="${x - 14}" y="${BIT_Y - 14}" width="28" height="28" fill="#ffffff" stroke="${STROKE}" stroke-width="1.6"/>`;
    svg += text(x, BIT_Y + 5, bits[i], { size: 13, weight: 700 });
  });

  // ── 사다리 출력 → OPAMP (+) ──
  const nLast = nodes[nodes.length - 1];
  const plusY = OP_Y + OP_H * 0.72;
  svg += line(nLast, RAIL_Y, nLast + 40, RAIL_Y);
  svg += line(nLast + 40, RAIL_Y, nLast + 40, plusY);
  svg += line(nLast + 40, plusY, OP_X, plusY);

  // ── OPAMP 삼각형 ──
  const minusY = OP_Y + OP_H * 0.28;
  const outX = OP_X + OP_W, outY = OP_Y + OP_H / 2;
  svg += `<path d="M ${OP_X} ${OP_Y} L ${OP_X} ${OP_Y + OP_H} L ${outX} ${outY} Z" fill="#ffffff" stroke="${STROKE}" stroke-width="1.8"/>`;
  svg += text(OP_X + 16, minusY + 5, "−", { size: 15, weight: 700 });
  svg += text(OP_X + 16, plusY + 5, "+", { size: 15, weight: 700 });

  // ── (−) 접지측 R_g — **아래로** 내린다.
  //   좌측으로 뻗으면 사다리의 마지막 션트 열과 겹친다(시각검증에서 발견).
  const gx = OP_X - 46;
  svg += line(OP_X, minusY, gx, minusY);
  svg += dot(gx, minusY);
  const gTop = minusY + 34;
  svg += line(gx, minusY, gx, gTop);
  svg += vRes(gx, gTop + 26, 26, d.rgLabel);
  svg += line(gx, gTop + 52, gx, gTop + 66);
  svg += ground(gx, gTop + 66);

  // ── 귀환 R_f (위쪽) ──
  const fbY = OP_Y - 52;
  svg += line(gx, minusY, gx, fbY);
  svg += hRes((gx + outX + 40) / 2, fbY, 30, d.rfLabel);
  svg += line(gx, fbY, (gx + outX + 40) / 2 - 30, fbY);
  svg += line((gx + outX + 40) / 2 + 30, fbY, outX + 40, fbY);
  svg += line(outX + 40, fbY, outX + 40, outY);

  // ── 출력 단자 ──
  svg += line(outX, outY, outX + 90, outY);
  svg += dot(outX + 40, outY);
  svg += `<circle cx="${outX + 90}" cy="${outY}" r="4" fill="none" stroke="${STROKE}" stroke-width="1.6"/>`;
  svg += text(outX + 100, outY + 5, d.outLabel ?? "V_o", { size: 13, weight: 700, anchor: "start" });

  const caption = d.caption ? text(W / 2, H - 8, d.caption, { size: 12, fill: MUTED }) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">
${svg}
${caption}
</svg>`;
}
