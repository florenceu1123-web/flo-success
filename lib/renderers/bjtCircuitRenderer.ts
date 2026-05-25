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
  const bjts = components.filter((c) => c.type === "BJT");
  if (bjts.length === 0) return null;
  // multi-BJT 분기 — 전류미러 + 차동증폭기 (임용 7번 multi-BJT 형식).
  //   generateBjtBias의 multiBjtMirror 케이스에서 netlist 생성.
  //   Q1·Q5 mirror + Q2·Q3 diff pair 4-BJT 토폴로지 가정.
  if (bjts.length >= 2) {
    return renderBjtMirrorDiff(netlist);
  }
  const bjt = bjts[0];

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

// =====================================================================
// Multi-BJT (전류미러 + 차동증폭기) renderer — 임용 7번 형식.
// =====================================================================
/**
 * Q1·Q5 mirror + Q2·Q3 diff pair 4-BJT 회로 layout.
 *
 * 가로 순서: V_CC ─ Q1(mirror ref) ─ Q2(diff input) ─ Q5(mirror out) ─ Q3(diff out) ─ V_2
 * 세로 순서: 상단 R_1·R_2·R_3 collector load → diff/ref BJT 본체 → V_tail/V_2_node → GND
 * V_1 입력 배터리는 좌측 V_CC 옆 별도 column에 배치 (V_in1 wire를 Q2.B로 horizontal 연결).
 *
 * @param netlist  generateBjtCurrentMirrorDiffAmp가 만든 NPN 4-BJT 회로
 */
function renderBjtMirrorDiff(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];
  const Q1 = components.find((c) => c.id === "Q1");
  const Q5 = components.find((c) => c.id === "Q5");
  const Q2 = components.find((c) => c.id === "Q2");
  const Q3 = components.find((c) => c.id === "Q3");
  if (!Q1 || !Q5 || !Q2 || !Q3) return null;

  const R_1 = components.find((c) => c.id === "R_1");
  const R_2 = components.find((c) => c.id === "R_2");
  const R_3 = components.find((c) => c.id === "R_3");
  const V_CC = components.find((c) => c.id === "V_CC");
  const V_2 = components.find((c) => c.id === "V_2");
  const V_1 = components.find((c) => c.id === "V_1");

  // ── coords ─────────────────────────────────────────────────
  //   R column은 BJT slant tip(BJT_X + slantDx=22)에 정렬 → BJT collector wire가 R bottom과 직선 연결.
  //   V_2는 Q1·Q5 사이(중앙)에 배치, V_1과 Q3.B는 하단 공통 ground rail로 묶음.
  const VCC_X = 60;
  const V1_X = 150;
  const Q1_X = 280;
  const R_1_X = Q1_X + 22;     // = 302, slant tip x → R column
  const Q2_X = 430;
  const R_2_X = Q2_X + 22;     // = 452
  const V2_X = 405;            // V_2 column: Q1·Q5 사이 (사용자 요청)
  const Q5_X = 530;
  const Q3_X = 630;
  const R_3_X = Q3_X + 22;     // = 652
  const Q3_DROP_X = 700;       // Q3.B → 하단 rail drop column (V_2 우측, V_o line 아래 통과)
  const VO_X = 820;
  const W = 880, H = 580;

  const TOP_Y = 60;
  const R_MID_Y = 130;
  const RES_HALF = 26;
  const COLL_Y = 200;          // V_M, V_C2, V_O 노드 level (R bottom)
  const DIFF_BASE_Y = 270;
  const TAIL_Y = 340;
  const REF_BASE_Y = 380;
  const V2_NODE_Y = 450;       // Q1.E = Q5.E (V_2 + 단자)
  const BOT_Y = 520;           // 공통 ground rail

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<defs><marker id="bjt_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ── Top rail: V_CC → R_3 column ───────────────────────────
  svg += `<path d="M ${VCC_X} ${TOP_Y} L ${R_3_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── V_CC 좌측 배터리 (vertical) ───────────────────────────
  svg += makeVerticalBattery(VCC_X, TOP_Y, BOT_Y, String(V_CC?.value ?? "V_CC"), "V_CC");
  svg += renderGroundSymbol(VCC_X, BOT_Y);

  // ── V_1 입력 배터리 (V_in1 node) ──────────────────────────
  const v1TopY = DIFF_BASE_Y;
  svg += makeVerticalBattery(V1_X, v1TopY, BOT_Y, String(V_1?.value ?? "V_1"), "V_1");
  // V_in1 → Q2.B horizontal wire
  svg += `<path d="M ${V1_X} ${v1TopY} L ${Q2_X - 12} ${v1TopY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${V1_X - 10}" y="${v1TopY - 8}" font-size="13" font-weight="700" fill="#dc2626">V_1</text>`;

  // ── R_1, R_2, R_3: slant tip column에 정렬 (직선 연결) ────
  if (R_1) svg += renderTopResistor(R_1_X, TOP_Y, COLL_Y, R_MID_Y, RES_HALF, "R_1", String(R_1.value ?? ""));
  if (R_2) svg += renderTopResistor(R_2_X, TOP_Y, COLL_Y, R_MID_Y, RES_HALF, "R_2", String(R_2.value ?? ""));
  if (R_3) svg += renderTopResistor(R_3_X, TOP_Y, COLL_Y, R_MID_Y, RES_HALF, "R_3", String(R_3.value ?? ""));

  // ── V_o 출력 단자 (R_3 bottom = Q3.C 노드에서 우측 연장) ──
  svg += `<path d="M ${R_3_X} ${COLL_Y} L ${VO_X} ${COLL_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${VO_X}" cy="${COLL_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VO_X + 8}" y="${COLL_Y + 5}" font-size="14" font-weight="700" fill="#dc2626">V_o</text>`;

  // ── Q1 (diode-connected NPN, mirror reference) ────────────
  //   collector slant tip = (R_1_X, ...), R_1과 직선 연결.
  //   diodeConnected=false — Q1.B=Q1.C 단락은 별도 V_M wire path (R_1 bottom → V_M ← mirror ← Q1.B)로 명시.
  svg += renderBjtVertical({
    x: Q1_X,
    collectorY: COLL_Y,
    baseY: REF_BASE_Y,
    emitterY: V2_NODE_Y,
    id: "Q1",
    diodeConnected: false,
    baseFromLeft: false,
  });
  // Mirror wire: Q1.B 우측 stub → Q5.B 좌측 stub
  svg += `<path d="M ${Q1_X + 12} ${REF_BASE_Y} L ${Q5_X - 12} ${REF_BASE_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${Q1_X + 12}" cy="${REF_BASE_Y}" r="3" fill="black"/>`;
  svg += `<text x="${(Q1_X + Q5_X) / 2 - 70}" y="${REF_BASE_Y - 6}" font-size="11" fill="#666">mirror</text>`;

  // ── V_M 노드 표기 (Q1·Q5 중앙, mirror wire level) ─────────
  //   사용자 요청: V_M을 아래로 내려 Q1·Q5 중앙(=mirror wire 중점)에 위치시키고
  //   R_1 bottom과 연결. R_1 bottom→V_M 수직 wire는 V_1→Q2.B 가로 wire(y=DIFF_BASE_Y)와 교차하나
  //   junction dot 없음 → standard schematic convention(연결 안 됨).
  const V_M_X = Math.round((Q1_X + Q5_X) / 2);  // = 405
  const V_M_Y = REF_BASE_Y;                     // mirror wire 높이
  svg += `<circle cx="${V_M_X}" cy="${V_M_Y}" r="3" fill="black"/>`;
  svg += `<text x="${V_M_X + 8}" y="${V_M_Y + 4}" font-size="11" fill="#666">V_M</text>`;
  // R_1 bottom → V_M 연결 wire: 수평(R_1_X→V_M_X) at COLL_Y + 수직(V_M_X) COLL_Y→V_M_Y
  svg += `<path d="M ${R_1_X} ${COLL_Y} L ${V_M_X} ${COLL_Y} L ${V_M_X} ${V_M_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── Q5 (mirror output NPN) — C=V_tail, B=V_M (mirror), E=V_2_node ──
  svg += renderBjtVertical({
    x: Q5_X,
    collectorY: TAIL_Y,
    baseY: REF_BASE_Y,
    emitterY: V2_NODE_Y,
    id: "Q5",
    diodeConnected: false,
    baseFromLeft: true,
  });
  // I_5 화살표 (Q5.C 우측, V_tail 라벨 충돌 회피)
  svg += `<path d="M ${Q5_X + 40} ${TAIL_Y - 30} L ${Q5_X + 40} ${TAIL_Y - 6}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#bjt_arrow)"/>`;
  svg += `<text x="${Q5_X + 46}" y="${TAIL_Y - 16}" font-size="12" font-weight="600">I_5</text>`;

  // ── Q2 (diff input NPN) — C=R_2 bottom, B=V_in1, E=V_tail ─
  svg += renderBjtVertical({
    x: Q2_X,
    collectorY: COLL_Y,
    baseY: DIFF_BASE_Y,
    emitterY: TAIL_Y,
    id: "Q2",
    diodeConnected: false,
    baseFromLeft: true,
  });

  // ── Q3 (diff input NPN) — C=R_3 bottom (=V_O), B=GND, E=V_tail ──
  svg += renderBjtVertical({
    x: Q3_X,
    collectorY: COLL_Y,
    baseY: DIFF_BASE_Y,
    emitterY: TAIL_Y,
    id: "Q3",
    diodeConnected: false,
    baseFromLeft: false,
  });
  // I_3 화살표 (R_3 우측)
  svg += `<path d="M ${R_3_X + 20} ${R_MID_Y - 16} L ${R_3_X + 20} ${R_MID_Y + 16}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#bjt_arrow)"/>`;
  svg += `<text x="${R_3_X + 26}" y="${R_MID_Y + 4}" font-size="12" font-weight="600">I_3</text>`;
  // I_1 화살표 (R_1 우측)
  svg += `<path d="M ${R_1_X + 20} ${R_MID_Y - 16} L ${R_1_X + 20} ${R_MID_Y + 16}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#bjt_arrow)"/>`;
  svg += `<text x="${R_1_X + 26}" y="${R_MID_Y + 4}" font-size="12" font-weight="600">I_1</text>`;

  // ── Q3.B → 하단 ground rail (Q3_DROP_X로 우측 drop, V_o line 아래 통과) ─
  svg += `<path d="M ${Q3_X + 12} ${DIFF_BASE_Y} L ${Q3_DROP_X} ${DIFF_BASE_Y} L ${Q3_DROP_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── V_tail 노드 dot + 수평 wire (Q2.E + Q5.C + Q3.E 연결) ──
  svg += `<circle cx="${Q5_X + 22}" cy="${TAIL_Y}" r="3" fill="black"/>`;
  svg += `<path d="M ${Q2_X + 22} ${TAIL_Y} L ${Q3_X + 22} ${TAIL_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${(Q2_X + Q3_X) / 2 - 18}" y="${TAIL_Y - 8}" font-size="11" fill="#666">V_tail</text>`;

  // ── V_2_node 수평 wire (Q1.E + V_2.+ + Q5.E 연결) ─────────
  svg += `<path d="M ${Q1_X + 22} ${V2_NODE_Y} L ${Q5_X + 22} ${V2_NODE_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${Q1_X + 22}" cy="${V2_NODE_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${Q5_X + 22}" cy="${V2_NODE_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${V2_X}" cy="${V2_NODE_Y}" r="3" fill="black"/>`;
  // V_2 배터리 (Q1·Q5 사이, V_2_node → ground rail)
  svg += makeVerticalBattery(V2_X, V2_NODE_Y, BOT_Y, String(V_2?.value ?? "V_2"), "V_2");

  // ── 공통 ground rail (V_1 ─ V_2 ─ Q3.B 묶음) ──────────────
  //   V_1 (V1_X=150), V_2 (V2_X=405), Q3.B drop (Q3_DROP_X=700) 모두 동일 rail로 연결.
  //   GND 심볼은 rail 우측 끝(Q3.B drop)에 1개 + V_1 측에 1개로 양쪽 묶음 시각화.
  svg += `<path d="M ${V1_X} ${BOT_Y} L ${Q3_DROP_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(V1_X, BOT_Y);
  svg += renderGroundSymbol(Q3_DROP_X, BOT_Y);
  // rail 위 junction dots (V_2 - 단자, V_1, Q3 drop)
  svg += `<circle cx="${V1_X}" cy="${BOT_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${V2_X}" cy="${BOT_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${Q3_DROP_X}" cy="${BOT_Y}" r="3" fill="black"/>`;

  svg += `</svg>`;
  return svg;
}

/**
 * NPN BJT 수직 심볼 (bar + base wire + collector slant + emitter slant + 화살표).
 *
 * @param x                  BJT bar x 좌표
 * @param collectorY         collector slant 끝점 y (위)
 * @param baseY              base wire y (bar 중앙)
 * @param emitterY           emitter slant 끝점 y (아래)
 * @param id                 라벨 (Q1·Q2·Q3·Q5)
 * @param diodeConnected     true면 C·B 단락 wire 추가 (mirror reference)
 * @param baseFromLeft       base wire 방향 (true=좌측에서, false=우측에서)
 */
function renderBjtVertical(args: {
  x: number;
  collectorY: number;
  baseY: number;
  emitterY: number;
  id: string;
  diodeConnected: boolean;
  baseFromLeft: boolean;
}): string {
  const { x, collectorY, baseY, emitterY, id, diodeConnected, baseFromLeft } = args;
  const barHalf = 25;
  const barTop = baseY - barHalf;
  const barBot = baseY + barHalf;
  const slantDx = 22, slantDy = 22;
  let svg = "";
  // vertical bar
  svg += `<path d="M ${x} ${barTop} L ${x} ${barBot}" stroke="black" fill="none" stroke-width="3"/>`;
  // base wire (bar 중앙에서 좌/우 horizontal 12px)
  const baseDx = baseFromLeft ? -12 : 12;
  svg += `<path d="M ${x} ${baseY} L ${x + baseDx} ${baseY}" stroke="black" fill="none" stroke-width="2"/>`;
  // collector slant (bar top → 우상). collectorY가 bar에 가까우면 slantDy를 자동 단축해 geometry 일관.
  //   normal: collectorY ≪ barTop (e.g. R 노드 위) → 전체 slantDy 사용 + 슬랜트 끝점에서 vertical wire 위쪽으로
  //   compact: collectorY가 bar 근처/아래 (e.g. Q5 V_tail) → slantDy=barTop-collectorY 으로 줄여 슬랜트 끝점이 곧 collector y와 일치
  // 호출 측에서 R column을 (x + slantDx)에 정렬하면 BJT-R 연결이 직선이 됨 (horizontal back 불필요).
  const effectiveSlantDy = collectorY < barTop - slantDy ? slantDy : Math.max(0, barTop - collectorY);
  const collTipX = x + slantDx;
  const collTipY = barTop - effectiveSlantDy;
  svg += `<path d="M ${x} ${barTop} L ${collTipX} ${collTipY}" stroke="black" fill="none" stroke-width="2"/>`;
  if (collTipY !== collectorY) {
    svg += `<path d="M ${collTipX} ${collTipY} L ${collTipX} ${collectorY}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  // emitter slant (bar bottom → 우하) + NPN arrow (밖으로)
  const emTipX = x + slantDx;
  const emTipY = barBot + slantDy;
  svg += `<path d="M ${x} ${barBot} L ${emTipX} ${emTipY}" stroke="black" fill="none" stroke-width="2" marker-end="url(#bjt_arrow)"/>`;
  svg += `<path d="M ${emTipX} ${emTipY} L ${emTipX} ${emitterY}" stroke="black" fill="none" stroke-width="2"/>`;
  // diode connection: base end → 슬랜트 끝점 너머로 빼서 vertical → collector horizontal로 연결
  //   slant가 (x, barTop)→(x+slantDx, barTop-slantDy)이므로 vertical wire는 x+slantDx+8 (또는 좌측 대칭)로 빼서 교차 회피.
  if (diodeConnected) {
    const diodeDx = baseFromLeft ? -(slantDx + 8) : (slantDx + 8);
    svg += `<path d="M ${x + baseDx} ${baseY} L ${x + diodeDx} ${baseY} L ${x + diodeDx} ${collectorY} L ${x} ${collectorY}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  // label
  const labelX = baseFromLeft ? x + 36 : x - 30;
  svg += `<text x="${labelX}" y="${baseY + 4}" font-size="12" font-weight="600" fill="#1e3a8a">${escapeSvg(id)}</text>`;
  return svg;
}

/**
 * 수직 R (R_1/R_2/R_3 top-side collector load) — top rail에서 collector 노드까지.
 */
function renderTopResistor(
  x: number, topY: number, collY: number, midY: number, halfH: number,
  label: string, valueStr: string,
): string {
  let svg = "";
  svg += `<path d="M ${x} ${topY} L ${x} ${midY - halfH}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorVertical(x, midY);
  svg += `<path d="M ${x} ${midY + halfH} L ${x} ${collY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${x + 16}" y="${midY - 4}" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  svg += `<text x="${x + 16}" y="${midY + 12}" font-size="12" fill="#374151">${escapeSvg(valueStr)}</text>`;
  return svg;
}

/**
 * 수직 배터리 (4-bar 직류 심볼) — top → bottom column.
 */
function makeVerticalBattery(
  x: number, topY: number, botY: number, valueStr: string, label: string,
): string {
  const cy = (topY + botY) / 2 - 10;
  const battTop = cy - 8, battBot = cy + 10;
  let svg = "";
  svg += `<path d="M ${x} ${topY} L ${x} ${battTop}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${x} ${battBot} L ${x} ${botY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${x - 28}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="600">${escapeSvg(valueStr)}</text>`;
  svg += `<text x="${x - 28}" y="${cy + 20}" text-anchor="middle" font-size="10" fill="#666">(${escapeSvg(label)})</text>`;
  svg += `<path d="M ${x - 10} ${cy - 8} L ${x + 10} ${cy - 8}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${x - 6} ${cy - 2} L ${x + 6} ${cy - 2}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${x - 10} ${cy + 4} L ${x + 10} ${cy + 4}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${x - 6} ${cy + 10} L ${x + 6} ${cy + 10}" stroke="black" stroke-width="2"/>`;
  return svg;
}

