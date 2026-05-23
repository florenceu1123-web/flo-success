import type { RlcResonanceMaxPowerCircuitDiagram } from "@/types";

/**
 * 임용 7번 형식 (RLC 공진 + 5R Wheatstone 등가 + R_L 최대전력) 전용 결정론 layout renderer.
 *
 *   고정 구조 (모든 variant 동일):
 *     좌측: v(t) AC source (수직)
 *     중앙: 점선 박스 (r_S) 안 5R Wheatstone bridge
 *     우측 상단: C (수평, 학생 도출 변수)
 *     우측 중단: R_L (수직, 점선 박스, 학생 도출)
 *     우측 하단: L (수직, 코일 심볼)
 *     하단: GND rail (좌→우, ground 심볼)
 *
 *   각 component는 절대 좌표로 고정 — variant마다 라벨(저항 값)만 변경됨.
 */

// ─── 좌표 상수 ───────────────────────────────────
const PAD = 30;
const SVG_W = 780;
const SVG_H = 500;

const STROKE = "#111827";
const WIRE_W = 1.5;
const DASH = "5 3";

// v(t) AC source
const VS_X = 70;
const VS_Y_TOP = 220;
const VS_Y_BOTTOM = 320;
const VS_R = 24;
const VS_CENTER_Y = (VS_Y_TOP + VS_Y_BOTTOM) / 2;

// 점선 박스 (r_S, 5R Wheatstone)
const BOX_X_LEFT = 160;
const BOX_X_RIGHT = 420;
const BOX_Y_TOP = 180;
const BOX_Y_BOTTOM = 360;

// Bridge 내부 노드 좌표
const L_NODE_X = 180;
const R_NODE_X = 400;
const TOP_WIRE_Y = 200;
const BOT_WIRE_Y = 340;
const TM_X = (L_NODE_X + R_NODE_X) / 2; // 290
const MID_Y = (TOP_WIRE_Y + BOT_WIRE_Y) / 2;

// 저항 박스 dimensions
const R_BOX_W = 60;
const R_BOX_H = 16;

// C (capacitor) — 수평
const C_PLATE_X1 = 480;
const C_PLATE_X2 = 490;
const C_Y = TOP_WIRE_Y;
const C_PLATE_H = 26;

// R_L (load) — 수직, 점선 박스
const RL_X = 580;
const RL_Y_TOP = 240;
const RL_Y_BOTTOM = 290;
const RL_BOX_W = 16;

// L (inductor) — 수직 코일
const L_X = 580;
const L_Y_TOP = 330;
const L_Y_BOTTOM = 410;

// GND rail y
const GND_RAIL_Y = 450;

// ─── 메인 ────────────────────────────────────────
export function renderRlcResonanceMaxPowerCircuitSVG(d: RlcResonanceMaxPowerCircuitDiagram): string {
  if (!Array.isArray(d?.Rlabels) || d.Rlabels.length !== 5) {
    return emptySvg("Rlabels length !== 5");
  }
  const [R1, R2, R3, R4, R5] = d.Rlabels;
  const parts: string[] = [];

  // ─── 1. v(t) AC source (좌측 수직) ─────────────
  parts.push(acSource(VS_X, VS_CENTER_Y, VS_R));
  // v(t) 라벨 (왼쪽)
  parts.push(text(VS_X - VS_R - 8, VS_CENTER_Y + 5, d.vSourceLabel, { size: 12, anchor: "end" }));
  // top stub from VS_TOP up to TOP_WIRE_Y
  parts.push(line(VS_X, VS_Y_TOP, VS_X, TOP_WIRE_Y));
  // bottom stub from VS_BOTTOM down to GND_RAIL_Y
  parts.push(line(VS_X, VS_Y_BOTTOM, VS_X, GND_RAIL_Y));

  // ─── 2. 좌측 top wire from VS to bridge L node ─
  parts.push(line(VS_X, TOP_WIRE_Y, L_NODE_X, TOP_WIRE_Y));

  // ─── 3. 점선 박스 (r_S) ──────────────────────────
  parts.push(rectDashed(BOX_X_LEFT, BOX_Y_TOP, BOX_X_RIGHT - BOX_X_LEFT, BOX_Y_BOTTOM - BOX_Y_TOP, "#7c3aed"));
  // r_S 라벨 — 박스 위쪽
  parts.push(text(BOX_X_LEFT + (BOX_X_RIGHT - BOX_X_LEFT) / 2, BOX_Y_TOP - 10, "r_S", { size: 13, weight: 600, fill: "#5b21b6" }));

  // ─── 4. 5R Wheatstone bridge ────────────────────
  //   L node vertical wire (TL=BL)
  parts.push(line(L_NODE_X, TOP_WIRE_Y, L_NODE_X, BOT_WIRE_Y));
  //   R node vertical wire (TR=BR)
  parts.push(line(R_NODE_X, TOP_WIRE_Y, R_NODE_X, BOT_WIRE_Y));

  //   Top wire: L_NODE → R1 → TM → R2 → R_NODE
  //   R1 horizontal at top: x ∈ [200, 260]
  const R1_X1 = L_NODE_X + 20;
  const R1_X2 = R1_X1 + R_BOX_W;
  parts.push(line(L_NODE_X, TOP_WIRE_Y, R1_X1, TOP_WIRE_Y));
  parts.push(resistorHorizontal(R1_X1, TOP_WIRE_Y, R_BOX_W, R_BOX_H, R1));
  parts.push(line(R1_X2, TOP_WIRE_Y, TM_X, TOP_WIRE_Y));
  // TM junction dot
  parts.push(dot(TM_X, TOP_WIRE_Y));
  // R2 horizontal at top: x ∈ [320, 380]
  const R2_X1 = TM_X + 30;
  const R2_X2 = R2_X1 + R_BOX_W;
  parts.push(line(TM_X, TOP_WIRE_Y, R2_X1, TOP_WIRE_Y));
  parts.push(resistorHorizontal(R2_X1, TOP_WIRE_Y, R_BOX_W, R_BOX_H, R2));
  parts.push(line(R2_X2, TOP_WIRE_Y, R_NODE_X, TOP_WIRE_Y));

  //   Bottom wire: L_NODE → R3 → BM → R4 → R_NODE
  const R3_X1 = L_NODE_X + 20;
  const R3_X2 = R3_X1 + R_BOX_W;
  parts.push(line(L_NODE_X, BOT_WIRE_Y, R3_X1, BOT_WIRE_Y));
  parts.push(resistorHorizontal(R3_X1, BOT_WIRE_Y, R_BOX_W, R_BOX_H, R3, { labelBelow: true }));
  parts.push(line(R3_X2, BOT_WIRE_Y, TM_X, BOT_WIRE_Y));
  parts.push(dot(TM_X, BOT_WIRE_Y));
  const R4_X1 = TM_X + 30;
  const R4_X2 = R4_X1 + R_BOX_W;
  parts.push(line(TM_X, BOT_WIRE_Y, R4_X1, BOT_WIRE_Y));
  parts.push(resistorHorizontal(R4_X1, BOT_WIRE_Y, R_BOX_W, R_BOX_H, R4, { labelBelow: true }));
  parts.push(line(R4_X2, BOT_WIRE_Y, R_NODE_X, BOT_WIRE_Y));

  //   R5 vertical (TM-BM): y ∈ [TOP_WIRE_Y+12, BOT_WIRE_Y-12]
  //   resistorVertical(cx, y1, w=진폭, h=세로길이) — h는 R5_Y2-R5_Y1로 충분히 길게.
  const R5_Y1 = TOP_WIRE_Y + 12;
  const R5_Y2 = BOT_WIRE_Y - 12;
  parts.push(line(TM_X, TOP_WIRE_Y, TM_X, R5_Y1));
  parts.push(resistorVertical(TM_X, R5_Y1, R_BOX_H, R5_Y2 - R5_Y1, R5));
  parts.push(line(TM_X, R5_Y2, TM_X, BOT_WIRE_Y));

  // ─── 5. Bridge 출력 → C → R_L → L 직렬 ────────
  // 박스 우측에서 wire가 오른쪽으로 나옴
  parts.push(line(R_NODE_X, TOP_WIRE_Y, C_PLATE_X1 - 10, TOP_WIRE_Y));
  // C symbol (두 plate)
  parts.push(capacitor(C_PLATE_X1, C_PLATE_X2, C_Y, C_PLATE_H, "C"));
  // C 우측에서 RL_X까지 wire, 그 후 down
  parts.push(line(C_PLATE_X2 + 10, TOP_WIRE_Y, RL_X, TOP_WIRE_Y));
  parts.push(line(RL_X, TOP_WIRE_Y, RL_X, RL_Y_TOP));
  // R_L (수직, zigzag) — 학생 도출 변수지만 표기는 일반 저항. 정답 위치는 문제 본문이 명시.
  parts.push(resistorVertical(RL_X, RL_Y_TOP, RL_BOX_W, RL_Y_BOTTOM - RL_Y_TOP, "R_L"));
  // R_L과 L 사이 wire
  parts.push(line(RL_X, RL_Y_BOTTOM, RL_X, L_Y_TOP));
  // L (inductor, 코일 심볼)
  parts.push(inductorVertical(L_X, L_Y_TOP, L_Y_BOTTOM, d.Llabel));
  // L 아래에서 GND_RAIL로
  parts.push(line(L_X, L_Y_BOTTOM, L_X, GND_RAIL_Y));

  // ─── 6. GND rail (하단) ────────────────────────
  parts.push(line(VS_X, GND_RAIL_Y, L_X, GND_RAIL_Y));
  // Ground 심볼 (가운데 부근)
  parts.push(groundSymbol(VS_X, GND_RAIL_Y));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${parts.join("\n")}\n</svg>`;
}

// ─── 컴포넌트 심볼 ─────────────────────────────────

function acSource(cx: number, cy: number, r: number): string {
  // 원 + 안에 sine wave + 위 +, 아래 −
  const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // sine wave path 내부
  const x1 = cx - r * 0.6;
  const x4 = cx + r * 0.6;
  const yMid = cy;
  const amp = r * 0.35;
  const sineD = `M ${x1} ${yMid} Q ${cx - r * 0.3} ${yMid - amp}, ${cx} ${yMid} T ${x4} ${yMid}`;
  const sine = `<path d="${sineD}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`;
  // + 위, − 아래
  const plus = `<text x="${cx - r - 10}" y="${cy - r + 8}" font-size="13" font-weight="700" fill="${STROKE}">+</text>`;
  const minus = `<text x="${cx - r - 10}" y="${cy + r + 4}" font-size="13" font-weight="700" fill="${STROKE}">−</text>`;
  return circle + sine + plus + minus;
}

/**
 * 수평 저항 — IEEE 표준 zigzag (3-peak, 6-segment).
 *
 *   x1: 좌측 시작 x, cy: 중심 y, w: 전체 가로 폭 (양 끝 wire 포함하지 않은 zigzag 부분).
 *   amplitude: 위·아래 진폭 (h/2 권장).
 */
function resistorHorizontal(
  x1: number,
  cy: number,
  w: number,
  h: number,
  label: string,
  opts: { labelBelow?: boolean; dashed?: boolean } = {},
): string {
  const a = h * 0.55; // zigzag 진폭
  const seg = w / 6;  // 6개 segment
  // 6 peak alternating: start → up → down → up → down → up → down → end
  // 좌단 (x1, cy) → x1+seg/2: up (cy-a)
  // 다음 peaks
  const pts: string[] = [];
  pts.push(`${x1},${cy}`);
  pts.push(`${x1 + seg / 2},${cy - a}`);
  pts.push(`${x1 + seg * 1.5},${cy + a}`);
  pts.push(`${x1 + seg * 2.5},${cy - a}`);
  pts.push(`${x1 + seg * 3.5},${cy + a}`);
  pts.push(`${x1 + seg * 4.5},${cy - a}`);
  pts.push(`${x1 + seg * 5.5},${cy + a}`);
  pts.push(`${x1 + w},${cy}`);
  const dashAttr = opts.dashed ? ` stroke-dasharray="${DASH}"` : "";
  const zig = `<polyline points="${pts.join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"${dashAttr}/>`;
  const lblY = opts.labelBelow ? cy + a + 18 : cy - a - 8;
  const lbl = `<text x="${x1 + w / 2}" y="${lblY}" text-anchor="middle" font-size="12" fill="${STROKE}">${escapeSvg(label)}</text>`;
  return zig + lbl;
}

/**
 * 수직 저항 — IEEE 표준 zigzag.
 *   cx: 중심 x, y1: 상단 시작 y, w: zigzag 가로 진폭 (총 폭 = 2a), h: 전체 세로 길이.
 *   라벨은 우측에 표시 (labelLeft=true면 좌측).
 */
function resistorVertical(
  cx: number,
  y1: number,
  w: number,
  h: number,
  label: string,
  opts: { dashed?: boolean; labelLeft?: boolean } = {},
): string {
  const a = w * 0.55;
  const seg = h / 6;
  const pts: string[] = [];
  pts.push(`${cx},${y1}`);
  pts.push(`${cx - a},${y1 + seg / 2}`);
  pts.push(`${cx + a},${y1 + seg * 1.5}`);
  pts.push(`${cx - a},${y1 + seg * 2.5}`);
  pts.push(`${cx + a},${y1 + seg * 3.5}`);
  pts.push(`${cx - a},${y1 + seg * 4.5}`);
  pts.push(`${cx + a},${y1 + seg * 5.5}`);
  pts.push(`${cx},${y1 + h}`);
  const dashAttr = opts.dashed ? ` stroke-dasharray="${DASH}"` : "";
  const zig = `<polyline points="${pts.join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"${dashAttr}/>`;
  const lblX = opts.labelLeft ? cx - a - 8 : cx + a + 8;
  const anchor = opts.labelLeft ? "end" : "start";
  const lbl = `<text x="${lblX}" y="${y1 + h / 2 + 4}" text-anchor="${anchor}" font-size="12" fill="${STROKE}">${escapeSvg(label)}</text>`;
  return zig + lbl;
}

function capacitor(x1: number, x2: number, cy: number, plateH: number, label: string): string {
  const p1 = `<line x1="${x1}" y1="${cy - plateH / 2}" x2="${x1}" y2="${cy + plateH / 2}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`;
  const p2 = `<line x1="${x2}" y1="${cy - plateH / 2}" x2="${x2}" y2="${cy + plateH / 2}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`;
  const stubLeft = `<line x1="${x1 - 10}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const stubRight = `<line x1="${x2}" y1="${cy}" x2="${x2 + 10}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const lbl = `<text x="${(x1 + x2) / 2}" y="${cy - plateH / 2 - 6}" text-anchor="middle" font-size="13" font-weight="600" fill="${STROKE}">${escapeSvg(label)}</text>`;
  return p1 + p2 + stubLeft + stubRight + lbl;
}

function inductorVertical(cx: number, y1: number, y2: number, label: string): string {
  // 4개 반원 코일
  const N = 4;
  const span = y2 - y1;
  const r = span / (N * 2);
  let d = `M ${cx} ${y1}`;
  for (let i = 0; i < N; i++) {
    const cy = y1 + r * (2 * i + 1);
    // 우측으로 볼록한 반원
    d += ` A ${r} ${r} 0 0 1 ${cx} ${cy + r}`;
  }
  const coil = `<path d="${d}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const lbl = `<text x="${cx + 12}" y="${(y1 + y2) / 2 + 4}" text-anchor="start" font-size="12" fill="${STROKE}">${escapeSvg(label)}</text>`;
  return coil + lbl;
}

function groundSymbol(cx: number, y: number): string {
  // 3개 horizontal lines decreasing in length, with short vertical stub above
  const stub = `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const l1 = `<line x1="${cx - 12}" y1="${y + 5}" x2="${cx + 12}" y2="${y + 5}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.5}"/>`;
  const l2 = `<line x1="${cx - 8}" y1="${y + 10}" x2="${cx + 8}" y2="${y + 10}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const l3 = `<line x1="${cx - 4}" y1="${y + 14}" x2="${cx + 4}" y2="${y + 14}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return stub + l1 + l2 + l3;
}

// ─── primitives ──────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3" fill="${STROKE}"/>`;
}

function rectDashed(x: number, y: number, w: number, h: number, color = "#7c3aed"): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="1.3" stroke-dasharray="${DASH}"/>`;
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
