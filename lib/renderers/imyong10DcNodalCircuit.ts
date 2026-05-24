// src/lib/renderers/imyong10DcNodalCircuit.ts
//
// IMYONG_10_DC_NODAL archetype 전용 renderer.
//   임용 10번 형식 — 2-source DC nodal 회로.
//
// 정책 (CLAUDE.md "Circuit Generation Architecture Principle"):
//   - LLM은 layout 출력 금지. 이 renderer가 구조 JSON을 받아 고정 slot에 배치.
//   - 같은 JSON → 같은 SVG (deterministic).
//
// Fixed layout:
//   VS_PLUS ┬─ R_left_top ─┬ V1 ┬─ R_v1_v2 ─┬ V2
//           └─ R_left_mid ─┘    └─ I_src ───┘
//                    │                    │
//                   R_var                R_right
//                    │                    │
//                   GND ──────────────────┘

import type { Imyong10DcNodalStructure } from "@/lib/analog/archetypeRegistry";

// ── Canvas 좌표 상수 — uniform grid (수평·수직 둘 다 일정) ─────────
// COL_GAP·ROW_GAP를 각각 단일 상수로 — 모든 인접 column·row 사이가 동일.
const COL_GAP = 200;          // 인접 top node 간 (수평)
const ROW_GAP = 120;          // 인접 row(Y-lane) 간 모두 동일 (수직)

const LEFT_X = 150;           // 좌측 padding
const TOP_Y = 100;            // row 0: top rail

const VS_X = LEFT_X;                       // 150
const V1_X = LEFT_X + COL_GAP;             // 350
const V2_X = LEFT_X + 2 * COL_GAP;         // 550

// 4 rows — 모두 ROW_GAP 동일 간격
const STACK_Y = TOP_Y + ROW_GAP;           // row 1: 220 (stacked horizontal)
const MID_Y = STACK_Y + ROW_GAP;           // row 2: 340 (vertical component center)
const BOT_Y = MID_Y + ROW_GAP;             // row 3: 460 (GND rail)

// vertical components — 모두 MID_Y에 center (균일)
const V_SOURCE_CY = MID_Y;
const R_VAR_CY = MID_Y;
const R_RIGHT_CY = MID_Y;

const W = LEFT_X + 2 * COL_GAP + 150;      // 700
const H = BOT_Y + 80;                      // 540 (bottom padding 포함)

// label offsets (component 중심에서 라벨까지)
const LABEL_VAL_OFFSET = 22;

// ── SVG primitives ────────────────────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number, sw = 2): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${sw}" stroke-linecap="round"/>`;
}

function dot(x: number, y: number, r = 3): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="black"/>`;
}

function textLabel(x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle", size = 12, color = "#1e3a8a"): string {
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}" font-family="sans-serif">${text}</text>`;
}

/** 가로 저항 zig-zag — width 56, center (cx, cy). */
function resistorH(cx: number, cy: number, label: string, value: string, isVariable = false): string {
  const x0 = cx - 28;
  const path = `M ${x0} ${cy} L ${x0 + 4} ${cy - 8} L ${x0 + 12} ${cy + 8} L ${x0 + 20} ${cy - 8} L ${x0 + 28} ${cy + 8} L ${x0 + 36} ${cy - 8} L ${x0 + 44} ${cy + 8} L ${x0 + 52} ${cy - 8} L ${x0 + 56} ${cy}`;
  let svg = `<path d="${path}" fill="none" stroke="black" stroke-width="2"/>`;
  if (isVariable) {
    // 화살표 — 가변 저항 표기 (좌하 → 우상)
    svg += `<line x1="${cx - 18}" y1="${cy + 16}" x2="${cx + 18}" y2="${cy - 16}" stroke="black" stroke-width="1.5"/>`;
    svg += `<polygon points="${cx + 18},${cy - 16} ${cx + 12},${cy - 14} ${cx + 14},${cy - 22}" fill="black"/>`;
  }
  svg += textLabel(cx, cy - 14, label, "middle", 12);
  if (value) svg += textLabel(cx, cy + LABEL_VAL_OFFSET, value, "middle", 11, "#475569");
  return svg;
}

/** 세로 저항 zig-zag — height 56, center (cx, cy). */
function resistorV(cx: number, cy: number, label: string, value: string, isVariable = false): string {
  const y0 = cy - 28;
  const path = `M ${cx} ${y0} L ${cx - 8} ${y0 + 4} L ${cx + 8} ${y0 + 12} L ${cx - 8} ${y0 + 20} L ${cx + 8} ${y0 + 28} L ${cx - 8} ${y0 + 36} L ${cx + 8} ${y0 + 44} L ${cx - 8} ${y0 + 52} L ${cx} ${y0 + 56}`;
  let svg = `<path d="${path}" fill="none" stroke="black" stroke-width="2"/>`;
  if (isVariable) {
    svg += `<line x1="${cx - 18}" y1="${cy + 18}" x2="${cx + 18}" y2="${cy - 18}" stroke="black" stroke-width="1.5"/>`;
    svg += `<polygon points="${cx + 18},${cy - 18} ${cx + 12},${cy - 14} ${cx + 16},${cy - 22}" fill="black"/>`;
  }
  svg += textLabel(cx + 18, cy - 4, label, "start", 12);
  if (value) svg += textLabel(cx + 18, cy + 12, value, "start", 11, "#475569");
  return svg;
}

/** V 소스 — 원 + ⊕/⊖ 마크 + 라벨. orientation: "vertical" — top pin +, bottom pin -. */
function voltageSourceV(cx: number, cy: number, label: string, value: string): string {
  const r = 22;
  let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="black" stroke-width="2"/>`;
  svg += textLabel(cx, cy - 6, "+", "middle", 14, "#000");
  svg += textLabel(cx, cy + 14, "−", "middle", 14, "#000");
  svg += textLabel(cx + r + 10, cy - 4, label, "start", 12);
  svg += textLabel(cx + r + 10, cy + 12, value, "start", 11, "#475569");
  return svg;
}

/** I 소스 — 원 + 화살표 (right). orientation: "horizontal" pointing right. */
function currentSourceH(cx: number, cy: number, label: string, value: string): string {
  const r = 22;
  let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="black" stroke-width="2"/>`;
  svg += `<line x1="${cx - 10}" y1="${cy}" x2="${cx + 6}" y2="${cy}" stroke="black" stroke-width="2"/>`;
  svg += `<polygon points="${cx + 6},${cy - 5} ${cx + 12},${cy} ${cx + 6},${cy + 5}" fill="black"/>`;
  svg += textLabel(cx, cy - r - 6, label, "middle", 12);
  svg += textLabel(cx, cy + r + LABEL_VAL_OFFSET, value, "middle", 11, "#475569");
  return svg;
}

/** GND 심볼 (3-bar). top at (x, y). */
function groundSymbol(x: number, y: number): string {
  return (
    line(x - 12, y, x + 12, y) +
    line(x - 8, y + 4, x + 8, y + 4) +
    line(x - 4, y + 8, x + 4, y + 8)
  );
}

/** Node label (V_s·V_1·V_2 등). */
function nodeLabel(x: number, y: number, text: string): string {
  return textLabel(x, y, text, "middle", 14, "#dc2626");
}

// ── 메인 renderer ─────────────────────────────────────────────────

/**
 * Imyong10DcNodalStructure → SVG.
 *   고정 slot:
 *     slot_left_source   = V 소스 (VS_PLUS↔GND vertical)
 *     slot_left_top_R    = R_left_top (VS_PLUS↔V1 top horizontal)
 *     slot_left_mid_R    = R_left_mid (VS_PLUS↔V1 offset horizontal, parallel)
 *     slot_center_Rvar   = R_var (V1↔GND vertical, variable)
 *     slot_v1_v2_top_R   = R_v1_v2 (V1↔V2 top horizontal)
 *     slot_v1_v2_mid_I   = I_src (V1↔V2 offset horizontal)
 *     slot_right_R       = R_right (V2↔GND vertical)
 */
export function renderImyong10DcNodalCircuit(structure: Imyong10DcNodalStructure): string {
  const { values } = structure;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // ── Node labels (3개 top nodes 위에) ──
  svg += nodeLabel(VS_X, TOP_Y - 18, "V_s");
  svg += nodeLabel(V1_X, TOP_Y - 18, "V_1");
  svg += nodeLabel(V2_X, TOP_Y - 18, "V_2");

  // ── Top rail wires (VS_PLUS↔V1, V1↔V2) ──
  //   stacked horizontal이라 top rail은 안 그리고 각 layer가 connect.
  //   대신 각 column에서 TOP_Y로 모이는 dot을 그림.
  svg += dot(VS_X, TOP_Y);
  svg += dot(V1_X, TOP_Y);
  svg += dot(V2_X, TOP_Y);

  // ── slot_left_top_R (VS_PLUS↔V1 top horizontal) ──
  //   wire from VS_X to cx-28, resistor, wire to V1_X
  const leftTopCx = (VS_X + V1_X) / 2;
  svg += line(VS_X, TOP_Y, leftTopCx - 28, TOP_Y);
  svg += resistorH(leftTopCx, TOP_Y, "R_left_top", `${values.R_left_top}Ω`);
  svg += line(leftTopCx + 28, TOP_Y, V1_X, TOP_Y);

  // ── slot_left_mid_R (VS_PLUS↔V1 offset horizontal, parallel) ──
  //   vertical stubs from TOP_Y to STACK_Y at VS_X and V1_X
  svg += line(VS_X, TOP_Y, VS_X, STACK_Y);
  svg += line(V1_X, TOP_Y, V1_X, STACK_Y);
  const leftMidCx = (VS_X + V1_X) / 2;
  svg += line(VS_X, STACK_Y, leftMidCx - 28, STACK_Y);
  svg += resistorH(leftMidCx, STACK_Y, "R_left_mid", `${values.R_left_mid}Ω`);
  svg += line(leftMidCx + 28, STACK_Y, V1_X, STACK_Y);

  // ── slot_v1_v2_top_R (V1↔V2 top horizontal) ──
  const v1v2TopCx = (V1_X + V2_X) / 2;
  svg += line(V1_X, TOP_Y, v1v2TopCx - 28, TOP_Y);
  svg += resistorH(v1v2TopCx, TOP_Y, "R_v1_v2", `${values.R_v1_v2}Ω`);
  svg += line(v1v2TopCx + 28, TOP_Y, V2_X, TOP_Y);

  // ── slot_v1_v2_mid_I (V1↔V2 offset horizontal, parallel with R_v1_v2) ──
  svg += line(V2_X, TOP_Y, V2_X, STACK_Y);
  const v1v2MidCx = (V1_X + V2_X) / 2;
  svg += line(V1_X, STACK_Y, v1v2MidCx - 22, STACK_Y);
  svg += currentSourceH(v1v2MidCx, STACK_Y, "I_src", `${values.I_src}A`);
  svg += line(v1v2MidCx + 22, STACK_Y, V2_X, STACK_Y);

  // ── slot_left_source (VS_PLUS↔GND vertical V 소스) ──
  svg += line(VS_X, STACK_Y, VS_X, V_SOURCE_CY - 22);
  svg += voltageSourceV(VS_X, V_SOURCE_CY, "V_s", `${values.V_s}V`);
  svg += line(VS_X, V_SOURCE_CY + 22, VS_X, BOT_Y);

  // ── slot_center_Rvar (V1↔GND vertical R, variable) ──
  svg += line(V1_X, STACK_Y, V1_X, R_VAR_CY - 28);
  svg += resistorV(V1_X, R_VAR_CY, "R", "", true);
  svg += line(V1_X, R_VAR_CY + 28, V1_X, BOT_Y);

  // ── slot_right_R (V2↔GND vertical R) ──
  svg += line(V2_X, STACK_Y, V2_X, R_RIGHT_CY - 28);
  svg += resistorV(V2_X, R_RIGHT_CY, "R_right", `${values.R_right}Ω`);
  svg += line(V2_X, R_RIGHT_CY + 28, V2_X, BOT_Y);

  // ── Bottom rail (GND) ──
  svg += line(VS_X, BOT_Y, V2_X, BOT_Y);
  svg += groundSymbol(V1_X, BOT_Y + 4);

  svg += `</svg>`;
  return svg;
}
