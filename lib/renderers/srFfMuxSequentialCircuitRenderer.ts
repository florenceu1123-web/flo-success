import type { SrFfMuxSequentialCircuitDiagram } from "@/types";

/**
 * SR 플립플롭 2개 + 2×1 MUX 4개 순차회로 (임용 10번 정보과 (다)) 전용 fixed-slot 렌더러.
 *
 *  layout (좌→우):
 *    [입력 라벨] → [MUX1..MUX4 세로 stack] → [SR FF A / FF B] → [Q·Q' 출력]
 *    · MUX1→S_A, MUX2→R_A (상단 FF A) / MUX3→S_B, MUX4→R_B (하단 FF B)
 *    · 공통 선택선(selectVar) = 선택 FF의 Q 출력 → 좌측 트렁크 → 각 MUX 선택핀
 *    · 클럭 = 하단 레일 → 두 FF
 *  빈칸 MUX의 데이터입력은 ㉠~㉣ 심볼로 표기 (학생 도출).
 */

const STROKE = "#111827";
const WIRE_W = 1.4;
const DOT_R = 3.2;

const SVG_W = 760;
const SVG_H = 600;

const INPUT_LABEL_X = 122;
const INPUT_WIRE_X0 = 136;

const MUX_LEFT = 185;
const MUX_RIGHT = 245;
const MUX_HALF_L = 28;
const MUX_HALF_R = 16;
const MUX_CY = [90, 205, 345, 460];
const I_OFFS = 13;
const SEL_OFFS = 24;

const SELECT_TRUNK_X = 95;
const SELECT_FEED_X = 560;
const SELECT_RAIL_Y = 540;

const OUT_MID_X = 320;

const FF_LEFT = 410;
const FF_RIGHT = 480;
const FF_HALF = 46;
const FF_CY: Record<"FF_A" | "FF_B", number> = { FF_A: 147, FF_B: 402 };
const PIN_OFFS = 24;

const CLK_TRUNK_X = 375;
const CLOCK_RAIL_Y = 568;
const Q_OUT_X = 530;

type Diagram = SrFfMuxSequentialCircuitDiagram;

export function renderSrFfMuxSequentialCircuit(d: Diagram): string {
  if (!d?.muxes || d.muxes.length !== 4 || !d.flipflops || d.flipflops.length !== 2) {
    return emptySvg("invalid sr_ff_mux diagram");
  }

  const wires: string[] = [];
  const dots: string[] = [];
  const symbols: string[] = [];
  const labels: string[] = [];

  const muxById = new Map(d.muxes.map((m) => [m.id, m]));
  const ffByPair: Array<{ ff: Diagram["flipflops"][number]; muxes: Diagram["muxes"] }> = [];
  for (const ff of d.flipflops) {
    const sMux = muxById.get(ff.sFrom);
    const rMux = muxById.get(ff.rFrom);
    if (sMux && rMux) ffByPair.push({ ff, muxes: [sMux, rMux] });
  }

  // ── MUX 4개 ─────────────────────────────────────
  d.muxes.forEach((mux, idx) => {
    const cy = MUX_CY[idx];
    const i0y = cy - I_OFFS;
    const i1y = cy + I_OFFS;
    const sely = cy + SEL_OFFS;

    // 입력 라벨 + wire (I0, I1)
    labels.push(text(INPUT_LABEL_X, i0y + 4, mux.i0, { size: 14, weight: mux.blank ? 700 : 500 }));
    labels.push(text(INPUT_LABEL_X, i1y + 4, mux.i1, { size: 14, weight: mux.blank ? 700 : 500 }));
    wires.push(line(INPUT_WIRE_X0, i0y, MUX_LEFT, i0y));
    wires.push(line(INPUT_WIRE_X0, i1y, MUX_LEFT, i1y));
    labels.push(text(MUX_LEFT + 12, i0y + 4, "I₀", { size: 9, fill: "#6b7280" }));
    labels.push(text(MUX_LEFT + 12, i1y + 4, "I₁", { size: 9, fill: "#6b7280" }));

    // MUX 본체 (사다리꼴)
    symbols.push(muxSymbol(cy));
    labels.push(text((MUX_LEFT + MUX_RIGHT) / 2, cy + 4, mux.label, { size: 10, weight: 600 }));

    // 선택핀 + 라벨
    labels.push(text(MUX_LEFT + 14, sely + 3, "S", { size: 9, fill: "#6b7280" }));

    // 출력 → 대상 FF 입력 라벨 (출력 도선 위쪽)
    labels.push(text(MUX_RIGHT + 16, cy - 8, mux.target.replace("_", ""), { size: 11, weight: 600, fill: "#1d4ed8", anchor: "start" }));
  });

  // ── SR FF 2개 + MUX 출력 라우팅 ──────────────────
  ffByPair.forEach(({ ff, muxes }) => {
    const cy = FF_CY[ff.id as "FF_A" | "FF_B"];
    const sPinY = cy - PIN_OFFS;
    const rPinY = cy + PIN_OFFS;

    symbols.push(ffBox(cy));
    labels.push(text((FF_LEFT + FF_RIGHT) / 2, cy - 6, "SR", { size: 11, weight: 700 }));
    labels.push(text((FF_LEFT + FF_RIGHT) / 2, cy + 12, ff.label.replace("SR FF ", "FF "), { size: 10, weight: 600 }));
    labels.push(text(FF_LEFT + 10, sPinY + 4, "S", { size: 10, weight: 600 }));
    labels.push(text(FF_LEFT + 10, rPinY + 4, "R", { size: 10, weight: 600 }));

    // Q / Q' 출력
    wires.push(line(FF_RIGHT, sPinY, Q_OUT_X, sPinY));
    wires.push(line(FF_RIGHT, rPinY, Q_OUT_X, rPinY));
    labels.push(text(Q_OUT_X + 16, sPinY + 4, ff.qLabel, { size: 13, weight: 700, fill: "#1d4ed8" }));
    labels.push(text(Q_OUT_X + 18, rPinY + 4, ff.qbarLabel, { size: 13, weight: 700, fill: "#1d4ed8" }));

    // MUX(S) → FF.S, MUX(R) → FF.R
    routeMuxToFf(wires, dots, muxes[0], sPinY);
    routeMuxToFf(wires, dots, muxes[1], rPinY);
  });

  // ── 공통 선택선 (selectVar = 선택 FF의 Q) ─────────
  const selFf = d.flipflops.find((f) => f.qLabel === d.selectVar) ?? d.flipflops[0];
  const selCy = FF_CY[selFf.id as "FF_A" | "FF_B"];
  const selQy = selCy - PIN_OFFS;
  // 선택 FF Q → 우측 → 하단 → 좌측 트렁크 바닥
  wires.push(line(Q_OUT_X, selQy, SELECT_FEED_X, selQy));
  wires.push(line(SELECT_FEED_X, selQy, SELECT_FEED_X, SELECT_RAIL_Y));
  wires.push(line(SELECT_FEED_X, SELECT_RAIL_Y, SELECT_TRUNK_X, SELECT_RAIL_Y));
  dots.push(dot(Q_OUT_X, selQy));
  // 트렁크 (좌측 세로) — 최상단 tap부터 바닥까지
  const topSelY = MUX_CY[0] + SEL_OFFS;
  wires.push(line(SELECT_TRUNK_X, topSelY, SELECT_TRUNK_X, SELECT_RAIL_Y));
  // 각 MUX 선택핀 tap
  MUX_CY.forEach((cy) => {
    const sely = cy + SEL_OFFS;
    wires.push(line(SELECT_TRUNK_X, sely, MUX_LEFT, sely));
    dots.push(dot(SELECT_TRUNK_X, sely));
  });
  labels.push(text(SELECT_TRUNK_X - 8, SELECT_RAIL_Y + 18, `선택선 S = ${d.selectVar}`, { size: 11, weight: 600, anchor: "start", fill: "#6b7280" }));

  // ── 클럭 ────────────────────────────────────────
  labels.push(text(56, CLOCK_RAIL_Y + 4, "클럭", { size: 12, weight: 600, anchor: "end" }));
  wires.push(line(62, CLOCK_RAIL_Y, CLK_TRUNK_X, CLOCK_RAIL_Y));
  const clkTop = Math.min(FF_CY.FF_A, FF_CY.FF_B);
  wires.push(line(CLK_TRUNK_X, clkTop, CLK_TRUNK_X, CLOCK_RAIL_Y));
  d.flipflops.forEach((ff) => {
    const cy = FF_CY[ff.id as "FF_A" | "FF_B"];
    wires.push(line(CLK_TRUNK_X, cy, FF_LEFT, cy));
    dots.push(dot(CLK_TRUNK_X, cy));
    // 클럭 입력 삼각형 (FF 좌측 edge 안쪽)
    symbols.push(clkTriangle(FF_LEFT, cy));
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[
    ...wires,
    ...dots,
    ...symbols,
    ...labels,
  ].join("\n")}\n</svg>`;
}

/** MUX 출력 → FF 입력핀 라우팅 (수평-수직-수평). */
function routeMuxToFf(
  wires: string[],
  dots: string[],
  mux: SrFfMuxSequentialCircuitDiagram["muxes"][number],
  ffPinY: number,
): void {
  const idx = MUX_CY_INDEX[mux.id] ?? 0;
  const cy = MUX_CY[idx];
  wires.push(line(MUX_RIGHT, cy, OUT_MID_X, cy));
  wires.push(line(OUT_MID_X, cy, OUT_MID_X, ffPinY));
  wires.push(line(OUT_MID_X, ffPinY, FF_LEFT, ffPinY));
}

const MUX_CY_INDEX: Record<string, number> = { MUX1: 0, MUX2: 1, MUX3: 2, MUX4: 3 };

// ─── 심볼 ────────────────────────────────────────
function muxSymbol(cy: number): string {
  const pts = [
    `${MUX_LEFT},${cy - MUX_HALF_L}`,
    `${MUX_RIGHT},${cy - MUX_HALF_R}`,
    `${MUX_RIGHT},${cy + MUX_HALF_R}`,
    `${MUX_LEFT},${cy + MUX_HALF_L}`,
  ].join(" ");
  return `<polygon points="${pts}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function ffBox(cy: number): string {
  return `<rect x="${FF_LEFT}" y="${cy - FF_HALF}" width="${FF_RIGHT - FF_LEFT}" height="${FF_HALF * 2}" rx="3" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function clkTriangle(x: number, cy: number): string {
  const h = 6;
  return `<polygon points="${x},${cy - h} ${x + 9},${cy} ${x},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ─── primitives ──────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
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
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} 64"><text x="${SVG_W / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${escapeSvg(msg)}</text></svg>`;
}
