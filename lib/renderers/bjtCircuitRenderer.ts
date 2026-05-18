import type { CircuitNetlist } from "@/types";

/**
 * BJT DC bias 회로 전용 renderer (임용 7번 형식).
 *
 * 표준 layout:
 *   V_CC ━┳━━━━━━━━━━━━━━━┳━━━ V_O
 *         │                │
 *        R_A              R_C
 *         │                │
 *         ┣━━ V_B (분압점) │
 *         │                │       ↓ I_C
 *        R_B              ┃C (collector)
 *         │           ←B (base)
 *         │              ┃E (emitter)
 *         GND             │
 *                        V_E
 *                         │
 *                        R_E
 *                         │
 *                        GND
 *
 * BJT 식별: components 중 type="BJT" 1개. id는 보통 "Q1" 또는 "Q_..".
 * R 식별: id로 (R_A·R_B·R_C·R_E). 또는 노드 연결로 (base 위/아래, collector 위, emitter 아래).
 *
 * GND, V_CC 라벨/심볼 자동 표시.
 */

const V_CC_X = 80;
const BASE_COL_X = 220;   // R_A, R_B column
const BJT_X = 420;        // BJT body x
const COLL_COL_X = 540;   // R_C column
const VO_X = 700;         // V_O output terminal
const TOP_Y = 80;
const VB_Y = 240;          // base node (R_A/R_B 사이)
const VC_Y = 200;          // collector node (R_C 아래)
const VE_Y = 360;          // emitter node (BJT 아래, R_E 위)
const BOT_Y = 480;         // ground rail

const RES_HALF = 28;       // resistor half height

export function hasBjt(netlist: CircuitNetlist): boolean {
  return (netlist.components ?? []).some((c) => c.type === "BJT");
}

export function renderBjtCircuit(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];
  const bjt = components.find((c) => c.type === "BJT");
  if (!bjt) return null;

  // 각 R component 식별 (id 기준)
  const resistors = components.filter((c) => c.type === "R");
  const vcc = components.find((c) => c.type === "V");
  const R_A = resistors.find((c) => c.id === "R_A" || c.id === "RA");
  const R_B = resistors.find((c) => c.id === "R_B" || c.id === "RB");
  const R_C = resistors.find((c) => c.id === "R_C" || c.id === "RC");
  const R_E = resistors.find((c) => c.id === "R_E" || c.id === "RE");

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">`;

  // arrow marker (I_C, I_E current 화살표용)
  svg += `<defs><marker id="bjt_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ── Wires (top rail, ground rail, vertical legs) ───────────────
  // Top rail: V_CC top → ... → V_O output
  svg += `<path d="M ${V_CC_X} ${TOP_Y} L ${BASE_COL_X} ${TOP_Y} L ${COLL_COL_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // V_CC 배터리 심볼 — vertical leg 중간. wire를 심볼 위·아래로 분할해서 겹침 방지.
  const vccCy = (TOP_Y + BOT_Y) / 2 - 20;
  const battTopY = vccCy - 8;   // 배터리 심볼 상단 (가장 위쪽 horizontal 선)
  const battBotY = vccCy + 10;  // 배터리 심볼 하단 (가장 아래쪽 horizontal 선)
  // V_CC vertical wire — 배터리 위쪽
  svg += `<path d="M ${V_CC_X} ${TOP_Y} L ${V_CC_X} ${battTopY}" stroke="black" fill="none" stroke-width="2"/>`;
  // V_CC vertical wire — 배터리 아래쪽
  svg += `<path d="M ${V_CC_X} ${battBotY} L ${V_CC_X} ${BOT_Y - 40}" stroke="black" fill="none" stroke-width="2"/>`;
  // V_CC label (배터리 좌측)
  svg += `<text x="${V_CC_X - 30}" y="${(TOP_Y + BOT_Y) / 2}" text-anchor="middle" font-size="13" font-weight="600">${escapeSvg(vcc?.value ?? "V_CC")}</text>`;
  svg += `<text x="${V_CC_X - 30}" y="${(TOP_Y + BOT_Y) / 2 + 16}" text-anchor="middle" font-size="11" fill="#666">(V_CC)</text>`;
  // V_CC battery 심볼 (긴 선·짧은 선 4개, 표준 직류 배터리 표기)
  svg += `<path d="M ${V_CC_X - 10} ${vccCy - 8} L ${V_CC_X + 10} ${vccCy - 8}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_CC_X - 6} ${vccCy - 2} L ${V_CC_X + 6} ${vccCy - 2}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_CC_X - 10} ${vccCy + 4} L ${V_CC_X + 10} ${vccCy + 4}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_CC_X - 6} ${vccCy + 10} L ${V_CC_X + 6} ${vccCy + 10}" stroke="black" stroke-width="2"/>`;

  // Bottom: V_CC leg → ground
  svg += `<path d="M ${V_CC_X} ${BOT_Y - 40} L ${V_CC_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // Ground rail (V_CC bottom → R_B bottom → R_E bottom 연속)
  const groundRightX = BJT_X + 22; // R_E reX와 정렬
  svg += `<path d="M ${V_CC_X} ${BOT_Y} L ${groundRightX} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // Ground symbol — V_CC bottom + R_E bottom 두 곳 (R_B는 같은 rail에 연결)
  svg += renderGroundSymbol(V_CC_X, BOT_Y);
  svg += renderGroundSymbol(groundRightX, BOT_Y);

  // ── R_A: V_CC top → V_B (BASE_COL_X column, TOP_Y → VB_Y) ──────
  if (R_A) {
    const cy = (TOP_Y + VB_Y) / 2;
    svg += `<path d="M ${BASE_COL_X} ${TOP_Y} L ${BASE_COL_X} ${cy - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(BASE_COL_X, cy);
    svg += `<path d="M ${BASE_COL_X} ${cy + RES_HALF} L ${BASE_COL_X} ${VB_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    // R_A placeholder 점선 박스 (임용 7번 원본 스타일)
    svg += `<rect x="${BASE_COL_X - 30}" y="${cy - RES_HALF - 8}" width="60" height="${RES_HALF * 2 + 16}" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    svg += `<text x="${BASE_COL_X + 38}" y="${cy - 4}" font-size="12" font-weight="700" fill="#1e3a8a">R_A</text>`;
    svg += `<text x="${BASE_COL_X + 38}" y="${cy + 12}" font-size="12" fill="#374151">${escapeSvg(String(R_A.value ?? ""))}</text>`;
  }

  // ── R_B: V_B → GND (BASE_COL_X column, VB_Y → BOT_Y) ──────────
  if (R_B) {
    const cy = (VB_Y + BOT_Y) / 2;
    svg += `<path d="M ${BASE_COL_X} ${VB_Y} L ${BASE_COL_X} ${cy - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(BASE_COL_X, cy);
    svg += `<path d="M ${BASE_COL_X} ${cy + RES_HALF} L ${BASE_COL_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${BASE_COL_X + 16}" y="${cy - 4}" font-size="12" font-weight="700" fill="#1e3a8a">R_B</text>`;
    svg += `<text x="${BASE_COL_X + 16}" y="${cy + 12}" font-size="12" fill="#374151">${escapeSvg(String(R_B.value ?? ""))}</text>`;
  }

  // V_B node dot (R_A 아래 + R_B 위 + BJT base wire 만나는 점)
  svg += `<circle cx="${BASE_COL_X}" cy="${VB_Y}" r="3" fill="black"/>`;

  // ── R_C: V_CC top → V_C (COLL_COL_X column, TOP_Y → VC_Y) ─────
  if (R_C) {
    const cy = (TOP_Y + VC_Y) / 2;
    svg += `<path d="M ${COLL_COL_X} ${TOP_Y} L ${COLL_COL_X} ${cy - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(COLL_COL_X, cy);
    svg += `<path d="M ${COLL_COL_X} ${cy + RES_HALF} L ${COLL_COL_X} ${VC_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${COLL_COL_X + 16}" y="${cy - 4}" font-size="12" font-weight="700" fill="#1e3a8a">R_C</text>`;
    svg += `<text x="${COLL_COL_X + 16}" y="${cy + 12}" font-size="12" fill="#374151">${escapeSvg(String(R_C.value ?? ""))}</text>`;
    // I_C current arrow
    svg += `<path d="M ${COLL_COL_X + 40} ${cy - 16} L ${COLL_COL_X + 40} ${cy + 16}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#bjt_arrow)"/>`;
    svg += `<text x="${COLL_COL_X + 46}" y="${cy + 4}" font-size="12" font-weight="600">I_C</text>`;
  }

  // V_C node = R_C bottom = BJT collector. wire to BJT collector.
  svg += `<circle cx="${COLL_COL_X}" cy="${VC_Y}" r="3" fill="black"/>`;
  // V_O 출력 단자 (V_C에서 우측으로)
  svg += `<path d="M ${COLL_COL_X} ${VC_Y} L ${VO_X} ${VC_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${VO_X}" cy="${VC_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VO_X + 10}" y="${VC_Y + 5}" font-size="14" font-weight="700" fill="#dc2626">V_O</text>`;

  // ── BJT body (NPN 표준 심볼) ───────────────────────────────────
  // 표준 NPN BJT:
  //   · vertical bar (height 50, base wire가 중앙에 직접 만남)
  //   · base wire: 좌측 horizontal로 bar 중앙에 연결
  //   · collector wire: bar 위쪽 끝에서 우상단 사선 (45도) → V_C 노드로 horizontal
  //   · emitter wire: bar 아래쪽 끝에서 우하단 사선 (45도) + NPN 화살표 (밖으로)
  const bjtBarX = BJT_X;
  const bjtBaseY = VB_Y;        // base wire는 BJT bar 중앙(=V_B node y)
  const bjtBarHalf = 25;        // bar 위·아래 각 25 → height 50
  const bjtBarTop = bjtBaseY - bjtBarHalf;
  const bjtBarBot = bjtBaseY + bjtBarHalf;
  const slantDx = 22;           // 사선 가로 폭
  const slantDy = 22;           // 사선 세로 폭
  // BJT vertical bar (두께 3, 표준 BJT 굵은 바)
  svg += `<path d="M ${bjtBarX} ${bjtBarTop} L ${bjtBarX} ${bjtBarBot}" stroke="black" fill="none" stroke-width="3"/>`;
  // base wire (V_B → bar 중앙)
  svg += `<path d="M ${BASE_COL_X} ${bjtBaseY} L ${bjtBarX} ${bjtBaseY}" stroke="black" fill="none" stroke-width="2"/>`;
  // collector 사선 (bar top → 우상)
  const collTipX = bjtBarX + slantDx;
  const collTipY = bjtBarTop - slantDy;
  svg += `<path d="M ${bjtBarX} ${bjtBarTop} L ${collTipX} ${collTipY}" stroke="black" fill="none" stroke-width="2"/>`;
  // collector wire (사선 끝 → V_C horizontal)
  svg += `<path d="M ${collTipX} ${collTipY} L ${collTipX} ${VC_Y} L ${COLL_COL_X} ${VC_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // emitter 사선 (bar bottom → 우하) + NPN arrow (밖으로 향함)
  const emTipX = bjtBarX + slantDx;
  const emTipY = bjtBarBot + slantDy;
  svg += `<path d="M ${bjtBarX} ${bjtBarBot} L ${emTipX} ${emTipY}" stroke="black" fill="none" stroke-width="2" marker-end="url(#bjt_arrow)"/>`;
  // emitter wire (사선 끝 → V_E vertical)
  svg += `<path d="M ${emTipX} ${emTipY} L ${emTipX} ${VE_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // BJT id label (bar 옆)
  svg += `<text x="${bjtBarX + 40}" y="${bjtBaseY + 4}" font-size="12" font-weight="600" fill="#1e3a8a">${escapeSvg(bjt.id ?? "Q1")}</text>`;
  // V_BE 표시 (base wire 위)
  svg += `<text x="${bjtBarX - 32}" y="${bjtBaseY - 6}" font-size="11" fill="#666">V_BE</text>`;

  // V_E node (emitter wire 끝)
  svg += `<circle cx="${emTipX}" cy="${VE_Y}" r="3" fill="black"/>`;
  svg += `<text x="${emTipX + 8}" y="${VE_Y - 6}" font-size="12" font-weight="700" fill="#dc2626">V_E</text>`;

  // ── R_E: V_E → GND (emitter tip column과 정렬) ──────────────────
  if (R_E) {
    const reX = bjtBarX + 22; // emTipX와 일치 (emitter wire vertical 연속)
    const cy = (VE_Y + BOT_Y) / 2;
    svg += `<path d="M ${reX} ${VE_Y} L ${reX} ${cy - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(reX, cy);
    svg += `<path d="M ${reX} ${cy + RES_HALF} L ${reX} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${reX + 16}" y="${cy - 4}" font-size="12" font-weight="700" fill="#1e3a8a">R_E</text>`;
    svg += `<text x="${reX + 16}" y="${cy + 12}" font-size="12" fill="#374151">${escapeSvg(String(R_E.value ?? ""))}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// =====================================================================
function renderResistorVertical(cx: number, cy: number): string {
  // zigzag — vertical, height 56 (±28)
  const zigCount = 4;
  const step = (RES_HALF * 2) / zigCount;
  let path = `M ${cx} ${cy - RES_HALF}`;
  for (let i = 0; i < zigCount; i++) {
    const y = cy - RES_HALF + step * (i + 0.5);
    const x = cx + (i % 2 === 0 ? 10 : -10);
    path += ` L ${x} ${y}`;
  }
  path += ` L ${cx} ${cy + RES_HALF}`;
  return `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>`;
}

function renderGroundSymbol(cx: number, y: number): string {
  return (
    `<path d="M ${cx - 10} ${y} L ${cx + 10} ${y}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 7} ${y + 4} L ${cx + 7} ${y + 4}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 4} ${y + 8} L ${cx + 4} ${y + 8}" stroke="black" stroke-width="2"/>`
  );
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
