import type { DffPresetClearCircuitDiagram, DffPresetClearGateInput } from "@/types";

/**
 * 임용 27번 (가) 전용 fixed-slot 렌더러 — D-FF + 비동기 PR·CLR + A·B NAND 디코더.
 *
 *  원본 배치 그대로:
 *    좌  : 클럭 심볼 → CLK 핀(▷; falling이면 버블)
 *    중앙: **큼직한** D-FF 박스 — PR(위, 버블) / CLR(아래, 버블) / D·CLK(좌) / Q·Q̄(우)
 *          D ← Q̄ 되먹임이 회로를 **감싸고 한 바퀴 돌아** D로 들어간다(= 토글 동작).
 *          ★ 되먹임은 NOT 게이트를 거치지 않는다 — FF가 Q̄ 핀을 직접 내놓는다.
 *    우  : **작은 좌향 NAND 4개**(2-to-4 디코더) + 인버터 2개(Ā·B̄).
 *          그중 두 줄이 PR·CLR을 구동하고 나머지 두 줄은 열린 단자로 남는다(원본과 부품 수 일치).
 *
 *  ※ 되먹임 도선과 PR 구동 도선은 한 번 교차한다 — 원본 그림도 그렇다.
 *    이 도면의 접속은 **전부 채워진 junction dot**으로만 표시하므로 교차는 비접속으로 읽힌다(규칙 #4).
 *    (반원 hop을 그렸더니 이 그림에서 이미 "논리 반전"을 뜻하는 속 빈 원과 헷갈렸다 — 시각검증에서 발견.)
 */

const STROKE = "#111827";
const WIRE_W = 1.4;
const DOT_R = 3;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const SVG_W = 1000;
const SVG_H = 520;

// ── D-FF 박스 (원본처럼 큼직하게) ───────────────
const FF_L = 288;
const FF_R = 462;
const FF_T = 150;
const FF_B = 332;
const FF_CX = (FF_L + FF_R) / 2; // 375
const D_PIN_Y = 196;
const CLK_PIN_Y = 296;
const Q_PIN_Y = 196;
const QBAR_PIN_Y = 266;
const BUBBLE_R = 5;

// ── 레인 ─────────────────────────────────────
const FB_TOP_Y = 52;    // 되먹임 상단 레인 (회로 전체를 감싼다)
const FB_X = 502;       // 되먹임 우측 세로선
const FB_LEFT_X = 236;  // 되먹임 좌측 세로선
const Q_TERM_X = 560;   // Q 외부 단자

// ── 게이트 (작게) ────────────────────────────
const GATE_OUT_X = 618;   // 출력 도선이 시작되는 x (버블 왼쪽)
const GATE_TIP_X = 624;   // 출력 버블 중심
const GATE_LEFT_X = 630;  // 몸통 왼쪽 꼭지
const GATE_RIGHT_X = 676; // 몸통 오른쪽(입력변)
const GATE_HALF_H = 19;
const GATE_IN_DY = 11;
/** 위→아래 4행. 0=PR 구동(FF 위), 1·2=여분(열린 단자), 3=CLR 구동(FF 아래). */
const GATE_ROW_Y = [96, 172, 252, 424];
/** 여분 게이트 출력은 **게이트 옆 짧은 stub**으로 끝낸다 — 길게 빼면 Q 외부 단자와 같은 높이에
 *  놓여 서로 헷갈린다(시각검증에서 발견). */
const SPARE_TERM_X = 594;

// ── 입력 버스 ────────────────────────────────
const BUS_X = [860, 926];  // A, B
const BUS_TOP_Y = 62;
const BUS_BOT_Y = 462;
const INV_X = 762;         // 인버터 중심 x

const CLK_SRC_X = 140;

type D = DffPresetClearCircuitDiagram;
type Pin = DffPresetClearGateInput;

export function renderDffPresetClearCircuit(d: D): string {
  if (!d?.presetInputs || !d?.clearInputs) return emptySvg("invalid dff_preset_clear diagram");

  const names = d.inputNames?.length ? d.inputNames : ["A", "B"];
  const qLabel = d.qLabel ?? "Q";
  const qBarLabel = d.qBarLabel ?? "Q̄";
  const clockLabel = d.clockLabel ?? "CLK";
  const falling = d.clockEdge === "falling";
  const spares = (d.spareGates ?? []).slice(0, 2);

  const wires: string[] = [];
  const dots: string[] = [];
  const symbols: string[] = [];
  const labels: string[] = [];

  // ── D-FF 박스 + 핀 ──────────────────────────
  symbols.push(rect(FF_L, FF_T, FF_R - FF_L, FF_B - FF_T));
  labels.push(text(FF_CX, FF_T + 18, "PR", { size: 12, weight: 600, fill: MUTED }));
  labels.push(text(FF_CX, FF_B - 9, "CLR", { size: 12, weight: 600, fill: MUTED }));
  labels.push(text(FF_CX, (D_PIN_Y + QBAR_PIN_Y) / 2 + 6, "D-FF", { size: 15, weight: 700, fill: MUTED }));
  labels.push(text(FF_L + 13, D_PIN_Y + 5, "D", { size: 15, weight: 600, anchor: "start" }));
  labels.push(text(FF_R - 13, Q_PIN_Y + 5, qLabel, { size: 15, weight: 600, anchor: "end" }));
  labels.push(text(FF_R - 13, QBAR_PIN_Y + 5, qBarLabel, { size: 15, weight: 600, anchor: "end" }));

  symbols.push(clkTriangle(FF_L, CLK_PIN_Y));
  if (falling) symbols.push(circle(FF_L - BUBBLE_R, CLK_PIN_Y, BUBBLE_R));
  symbols.push(circle(FF_CX, FF_T - BUBBLE_R, BUBBLE_R));   // PR 버블 (active-low)
  symbols.push(circle(FF_CX, FF_B + BUBBLE_R, BUBBLE_R));   // CLR 버블

  // ── 클럭 입력 ───────────────────────────────
  symbols.push(clockWave(CLK_SRC_X, CLK_PIN_Y));
  labels.push(text(CLK_SRC_X - 24, CLK_PIN_Y + 5, clockLabel, { size: 14, weight: 700, anchor: "end" }));
  wires.push(line(CLK_SRC_X + 15, CLK_PIN_Y, FF_L - (falling ? 2 * BUBBLE_R : 0), CLK_PIN_Y));

  // ── D ← Q̄ 되먹임 (NOT 게이트 없이 Q̄ 핀에서 곧바로 한 바퀴) ──
  wires.push(line(FF_R, QBAR_PIN_Y, FB_X, QBAR_PIN_Y));
  wires.push(line(FB_X, QBAR_PIN_Y, FB_X, FB_TOP_Y));
  wires.push(line(FB_X, FB_TOP_Y, FB_LEFT_X, FB_TOP_Y));
  wires.push(line(FB_LEFT_X, FB_TOP_Y, FB_LEFT_X, D_PIN_Y));
  wires.push(line(FB_LEFT_X, D_PIN_Y, FF_L, D_PIN_Y));
  labels.push(text((FB_LEFT_X + FB_X) / 2, FB_TOP_Y - 10, `D = ${qBarLabel}  (토글 동작)`, { size: 12, fill: MUTED }));

  // ── Q 외부 단자 ─────────────────────────────
  wires.push(line(FF_R, Q_PIN_Y, Q_TERM_X, Q_PIN_Y));
  dots.push(dot(Q_TERM_X, Q_PIN_Y));
  labels.push(text(Q_TERM_X + 8, Q_PIN_Y + 5, qLabel, { size: 16, weight: 700, fill: ACCENT, anchor: "start" }));

  // ── 입력 버스 A·B ───────────────────────────
  names.slice(0, 2).forEach((nm, i) => {
    wires.push(line(BUS_X[i], BUS_TOP_Y, BUS_X[i], BUS_BOT_Y));
    labels.push(text(BUS_X[i], BUS_TOP_Y - 10, nm, { size: 16, weight: 700, fill: ACCENT }));
  });

  /** 게이트 한 개 — 몸통 + 두 입력 배선(반전 입력엔 인버터). */
  const drawGate = (rowY: number, pins: [Pin, Pin]) => {
    drawLeftNand(symbols, rowY);
    pins.forEach((pin, slot) => {
      const y = rowY + (slot === 0 ? -GATE_IN_DY : GATE_IN_DY);
      const busIdx = Math.max(0, names.indexOf(pin.name));
      const busX = BUS_X[busIdx] ?? BUS_X[0];
      if (pin.inverted) {
        // ★ 두 입력이 모두 반전이면 인버터 두 개가 위아래로 붙어 겹쳐 보인다(실측) → slot별로 x를 벌린다.
        const invX = INV_X - (slot === 1 ? 30 : 0);
        wires.push(line(GATE_RIGHT_X, y, invX - 9, y));
        drawLeftInverter(symbols, invX, y);
        wires.push(line(invX + 9, y, busX, y));
      } else {
        wires.push(line(GATE_RIGHT_X, y, busX, y));
      }
      dots.push(dot(busX, y));
      // ★ 게이트 입력 옆 신호 부호(A / Ā)는 찍지 않는다 — 사용자 지정(2026-08-12).
      //   반전 여부는 인버터 심볼과 배선이 이미 보여 준다.
    });
  };

  // row 0 — PR 구동
  drawGate(GATE_ROW_Y[0], d.presetInputs);
  wires.push(line(GATE_OUT_X, GATE_ROW_Y[0], FF_CX, GATE_ROW_Y[0]));
  wires.push(line(FF_CX, GATE_ROW_Y[0], FF_CX, FF_T - 2 * BUBBLE_R));
  labels.push(text(FF_CX + 9, GATE_ROW_Y[0] - 9, "PR", { size: 13, weight: 700, anchor: "start" }));

  // row 3 — CLR 구동
  drawGate(GATE_ROW_Y[3], d.clearInputs);
  wires.push(line(GATE_OUT_X, GATE_ROW_Y[3], FF_CX, GATE_ROW_Y[3]));
  wires.push(line(FF_CX, GATE_ROW_Y[3], FF_CX, FF_B + 2 * BUBBLE_R));
  labels.push(text(FF_CX + 9, GATE_ROW_Y[3] - 9, "CLR", { size: 13, weight: 700, anchor: "start" }));

  // row 1·2 — 디코더의 나머지 두 줄 (열린 단자)
  spares.forEach((pins, i) => {
    const rowY = GATE_ROW_Y[1 + i];
    drawGate(rowY, pins);
    wires.push(line(GATE_OUT_X, rowY, SPARE_TERM_X, rowY));
    symbols.push(circle(SPARE_TERM_X - 4, rowY, 4)); // 열린 단자
  });

  if (d.caption) labels.push(text(SVG_W / 2, SVG_H - 12, d.caption, { size: 12, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[
    ...wires, ...dots, ...symbols, ...labels,
  ].join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────
/** 좌향 NAND — 입력변(직선)이 오른쪽, 출력 꼭지 + 버블이 왼쪽. */
function drawLeftNand(out: string[], cy: number): void {
  const top = cy - GATE_HALF_H, bot = cy + GATE_HALF_H;
  const body =
    `<path d="M${GATE_RIGHT_X},${top} L${GATE_LEFT_X + 16},${top} ` +
    `Q${GATE_LEFT_X},${cy} ${GATE_LEFT_X + 16},${bot} L${GATE_RIGHT_X},${bot} Z" ` +
    `fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const bubble = `<circle cx="${GATE_TIP_X}" cy="${cy}" r="${BUBBLE_R}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  out.push(body + bubble);
}

/** 좌향 인버터 — 입력 오른쪽, 출력 왼쪽 + 버블. */
function drawLeftInverter(out: string[], cx: number, cy: number): void {
  const w = 15, h = 14;
  const tri = `<polygon points="${cx + w / 2},${cy - h / 2} ${cx + w / 2},${cy + h / 2} ${cx - w / 2},${cy}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const bubble = `<circle cx="${cx - w / 2 - 3}" cy="${cy}" r="3" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  out.push(tri + bubble);
}

function clkTriangle(x: number, cy: number): string {
  const hh = 8;
  return `<polygon points="${x},${cy - hh} ${x + 14},${cy} ${x},${cy + hh}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function clockWave(x: number, cy: number): string {
  const h = 9;
  const p = `M${x - 15},${cy + h} L${x - 10},${cy + h} L${x - 10},${cy - h} L${x - 1},${cy - h} L${x - 1},${cy + h} L${x + 8},${cy + h} L${x + 8},${cy - h} L${x + 15},${cy - h}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ─── primitives ──────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function rect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function circle(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}

function text(
  x: number,
  y: number,
  s: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  const size = opts.size ?? 12;
  const weight = opts.weight ?? 400;
  const anchor = opts.anchor ?? "middle";
  const fill = opts.fill ?? STROKE;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeSvg(s)}</text>`;
}

function escapeSvg(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} 64"><text x="${SVG_W / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${escapeSvg(msg)}</text></svg>`;
}
