/**
 * 다이오드 + SPDT SW + AC source + C 클램프/정류 회로 renderer (임용 6번 형식).
 *
 * 표준 layout (fixed slots):
 *   V_CC=+15V (top right battery)
 *           │
 *           ├── D_1 ──┐
 *                     │
 *   V_i(AC) ─ SW ─ C ─┼── V_o
 *                     │
 *                     ├── D_2 (cathode at clamp, anode at GND)
 *                     │
 *                     R_L
 *                     │
 *                    GND
 *
 *  Component id 규약:
 *   - V_i (or V1)  : AC source — type "V", id starts with "V_i"
 *   - SW (or SW1)  : SPDT switch — type "SW"
 *   - C  (or C1)   : series capacitor — type "C"
 *   - D_1, D_2 (or D1, D2): clamp 다이오드 — type "D"
 *   - R_L (or RL)  : 부하저항 — type "R"
 *   - V_CC         : DC clamp 전원 — type "V"
 *
 *  signature detection: 다이오드 ≥ 2 + SW ≥ 1 + C ≥ 1.
 *
 *  Phase 4 deliverable. 호출 측은 analogMeshRenderer에서 hasBjt·hasMosfet보다 먼저 dispatch.
 */

import type { CircuitNetlist } from "@/types";

const W = 880, H = 460;

// 좌표 (fixed slots)
const ACSRC_X = 100;
const SW_X = 240;
const C_X = 380;
const CLAMP_X = 500;       // n_clamp 노드 (D_1, D_2, C 출력, R_L 만나는 점)
const VCC_X = 660;
const VO_X = 760;

const TOP_Y = 100;
const MID_Y = 260;        // signal path y (V_i, SW, C, n_clamp, V_o)
const BOT_Y = 400;        // ground rail

/**
 * 신호: 다이오드 ≥ 2 + SW ≥ 1 + C ≥ 1.
 */
export function hasDiodePwl(netlist: CircuitNetlist): boolean {
  const comps = netlist.components ?? [];
  const dCount = comps.filter((c) => String(c.type ?? "").toUpperCase() === "D").length;
  const swCount = comps.filter((c) => String(c.type ?? "").toUpperCase() === "SW").length;
  const cCount = comps.filter((c) => String(c.type ?? "").toUpperCase() === "C").length;
  return dCount >= 2 && swCount >= 1 && cCount >= 1;
}

/** 임용 6번 형식 PWL clamp 회로 renderer. */
export function renderDiodePwlCircuit(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];

  // 컴포넌트 분류 (id 기반)
  const V_i = components.find((c) => /^V_?i/i.test(c.id ?? "") || /^V1$/i.test(c.id ?? ""));
  const V_CC = components.find((c) => /^V_?CC$/i.test(c.id ?? ""));
  const SW = components.find((c) => c.type === "SW");
  const C = components.find((c) => c.type === "C");
  const D_1 = components.find((c) => /^D_?1$/i.test(c.id ?? ""));
  const D_2 = components.find((c) => /^D_?2$/i.test(c.id ?? ""));
  const R_L = components.find((c) =>
    c.type === "R" && (/^R_?L$/i.test(c.id ?? "") || /^R1$/i.test(c.id ?? "")),
  );

  if (!V_i || !SW || !C || !D_1 || !D_2 || !R_L) return null;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += defs();

  // ── AC source — 신호선(MID_Y) 아래로 60px 내려 배치, top wire가 위로 올라가 SW단자1까지 ──
  const ACSRC_Y = MID_Y + 60;
  svg += renderAcSourceSymbol(ACSRC_X, ACSRC_Y, String(V_i.value ?? "v_i(t)"));
  // AC top → 위쪽 신호선까지 + 수평 → SW단자1
  svg += `<path d="M ${ACSRC_X} ${ACSRC_Y - 28} L ${ACSRC_X} ${MID_Y} L ${SW_X - 30} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // AC bottom → 공통 ground rail
  svg += `<path d="M ${ACSRC_X} ${ACSRC_Y + 28} L ${ACSRC_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── SPDT SW (단자1: 수평 신호선 위, 단자2: 아래 GND, common → C) ──
  svg += renderSpdtSwitch(SW_X, MID_Y, "closed_to_term1", String(SW.value ?? ""));
  // 단자2 → 공통 ground rail
  svg += `<path d="M ${SW_X - 30} ${MID_Y + 30} L ${SW_X - 30} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // ── 캐패시터 C (수평) ──────────────────────────
  // C 막대 좌측 = (C_X - 3, MID_Y), 우측 = (C_X + 3, MID_Y). wire는 막대에 정확히 닿게 연결.
  svg += renderCapacitorHorizontal(C_X, MID_Y, String(C.value ?? "C"));
  // SW common → C 좌측 막대 (직접 연결)
  svg += `<path d="M ${SW_X + 20} ${MID_Y} L ${C_X - 3} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // C 우측 막대 → clamp node
  svg += `<path d="M ${C_X + 3} ${MID_Y} L ${CLAMP_X} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // clamp node dot
  svg += `<circle cx="${CLAMP_X}" cy="${MID_Y}" r="3" fill="black"/>`;

  // ── D_1 (clamp node → V_CC, anode=clamp, cathode=V_CC; 위로 향함) ──
  //   body를 조금 위로 올림 — clamp(MID_Y)에서 anode(MID_Y-35)까지 짧은 wire 추가.
  const D1_ANODE_Y = MID_Y - 35;
  svg += `<path d="M ${CLAMP_X} ${MID_Y} L ${CLAMP_X} ${D1_ANODE_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderDiodeVertical(CLAMP_X, D1_ANODE_Y, MID_Y - 100, "up", "D_1");
  // V_CC: 배터리 대신 단자 표기 — D_1 cathode wire 끝에 +단자 dot + "15V" 라벨
  svg += `<path d="M ${CLAMP_X} ${MID_Y - 100} L ${VCC_X} ${MID_Y - 100}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${VCC_X}" cy="${MID_Y - 100}" r="4" fill="#1e3a8a" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VCC_X + 10}" y="${MID_Y - 96}" font-size="13" font-weight="700" fill="#1e3a8a">${escapeSvg(String(V_CC?.value ?? "15V"))}</text>`;

  // ── D_2 (clamp node → GND, anode=GND, cathode=clamp; 아래로 향함) ──
  //   화살표 위(↑) = anode(GND) → cathode(clamp) forward 방향. cathode를 MID_Y에 두어 clamp node 직접 접속.
  svg += renderDiodeVertical(CLAMP_X, MID_Y + 100, MID_Y, "up", "D_2");
  // wire: CLAMP_X, MID_Y+100 → GND
  svg += `<path d="M ${CLAMP_X} ${MID_Y + 100} L ${CLAMP_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── R_L (clamp node 우측 → 공통 ground rail) ──
  const RL_X = (CLAMP_X + VO_X) / 2;
  svg += `<path d="M ${CLAMP_X} ${MID_Y} L ${RL_X} ${MID_Y} L ${RL_X} ${MID_Y + 20}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorVertical(RL_X, MID_Y + 50, String(R_L.value ?? "R_L"));
  svg += `<path d="M ${RL_X} ${MID_Y + 80} L ${RL_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // R_L label "R_L"
  svg += `<text x="${RL_X + 18}" y="${MID_Y + 54}" font-size="12" font-weight="700" fill="#1e3a8a">R_L</text>`;

  // ── V_o 출력 단자 (clamp node에서 우측 연장) ──
  svg += `<path d="M ${RL_X} ${MID_Y} L ${VO_X} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${VO_X}" cy="${MID_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VO_X + 8}" y="${MID_Y + 5}" font-size="14" font-weight="700" fill="#dc2626">V_o(t)</text>`;

  // ── 공통 ground rail (V_i·SW단자2·D_2·R_L 모두 묶고 ONE ground 심볼) ──
  //   solid rail at y=BOT_Y from ACSRC_X to RL_X. 각 drop 위치에 junction dot.
  svg += `<path d="M ${ACSRC_X} ${BOT_Y} L ${RL_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  const groundDropXs = [ACSRC_X, SW_X - 30, CLAMP_X, RL_X];
  for (const dx of groundDropXs) {
    svg += `<circle cx="${dx}" cy="${BOT_Y}" r="3" fill="black"/>`;
  }
  // ONE 공통 ground 심볼 — rail 중앙쯤
  const groundSymbolX = Math.round((ACSRC_X + RL_X) / 2);
  svg += renderGroundSymbol(groundSymbolX, BOT_Y);

  svg += `</svg>`;
  return svg;
}

// =====================================================================
// 심볼 helper
// =====================================================================

function defs(): string {
  return `<defs>
    <marker id="pwl_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/>
    </marker>
  </defs>`;
}

/**
 * AC source — 원 + 내부 sine wave + 라벨.
 * (cx, cy) 중심. 반지름 28.
 */
function renderAcSourceSymbol(cx: number, cy: number, label: string): string {
  const r = 28;
  let svg = "";
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="black" fill="white" stroke-width="2"/>`;
  // sine wave inside (3 짧은 곡선)
  const sinPath = `M ${cx - 16} ${cy} Q ${cx - 8} ${cy - 10} ${cx} ${cy} T ${cx + 16} ${cy}`;
  svg += `<path d="${sinPath}" stroke="black" fill="none" stroke-width="1.5"/>`;
  // label (좌측)
  svg += `<text x="${cx - 38}" y="${cy + 5}" text-anchor="end" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  return svg;
}

/**
 * SPDT switch (Single Pole, Double Throw). 단자1을 신호선과 수평으로 배치.
 *
 * Geometry:
 *   단자1: (cx-30, cy)         ← 좌측, 신호선과 수평 — V_i 입력
 *   단자2: (cx-30, cy+30)      ← 좌측 아래 — GND 측
 *   common pole: (cx+20, cy)   ← 우측 — C로 출력
 *   handle: common pole에서 둘 중 하나(closed)·또는 살짝 들린(open) 위치
 *
 * @param cx     common pole 본체 x 중심 (handle 회전 pivot 근처)
 * @param cy     common pole y (= MID_Y)
 * @param state  "closed_to_term1" | "closed_to_term2" | "open" — 핸들 위치
 * @param label  스위치 id 라벨
 */
function renderSpdtSwitch(
  cx: number, cy: number,
  state: "closed_to_term1" | "closed_to_term2" | "open",
  label: string,
): string {
  const t1X = cx - 30, t1Y = cy;        // 단자1: 신호선 수평
  const t2X = cx - 30, t2Y = cy + 30;   // 단자2: 아래
  const commonX = cx + 20, commonY = cy; // common pole: 우측
  let svg = "";
  // 단자 dots
  svg += `<circle cx="${t1X}" cy="${t1Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${t2X}" cy="${t2Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${commonX}" cy="${commonY}" r="3" fill="black"/>`;
  // 핸들 위치 — 기본 closed_to_term1 = 수평 직선 (common ↔ 단자1)
  let handleEndX: number, handleEndY: number;
  if (state === "closed_to_term1") {
    handleEndX = t1X; handleEndY = t1Y;
  } else if (state === "closed_to_term2") {
    handleEndX = t2X; handleEndY = t2Y;
  } else {  // open — 단자1 방향으로 살짝 들림 (미접촉)
    handleEndX = t1X + 8; handleEndY = t1Y + 6;
  }
  svg += `<path d="M ${commonX} ${commonY} L ${handleEndX} ${handleEndY}" stroke="black" fill="none" stroke-width="2"/>`;
  // 단자 label
  svg += `<text x="${t1X - 6}" y="${t1Y - 6}" text-anchor="end" font-size="11" fill="#666">단자1</text>`;
  svg += `<text x="${t2X - 6}" y="${t2Y + 14}" text-anchor="end" font-size="11" fill="#666">단자2</text>`;
  // SW id 라벨 (common pole 위쪽)
  svg += `<text x="${commonX + 8}" y="${commonY - 8}" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(label || "SW")}</text>`;
  return svg;
}

/**
 * 수평 캐패시터 — 두 평행 막대.
 * (cx, cy) 중심. 폭 30 (좌단 cx-30 ~ 우단 cx+30, 막대는 cx-3, cx+3).
 */
function renderCapacitorHorizontal(cx: number, cy: number, label: string): string {
  let svg = "";
  // 좌 막대 (긴 평판)
  svg += `<path d="M ${cx - 3} ${cy - 14} L ${cx - 3} ${cy + 14}" stroke="black" stroke-width="2.5"/>`;
  // 우 막대 (긴 평판)
  svg += `<path d="M ${cx + 3} ${cy - 14} L ${cx + 3} ${cy + 14}" stroke="black" stroke-width="2.5"/>`;
  // 라벨 (위쪽)
  svg += `<text x="${cx}" y="${cy - 22}" text-anchor="middle" font-size="13" font-weight="700" fill="#1e3a8a">${escapeSvg(label || "C")}</text>`;
  return svg;
}

/**
 * 수직 다이오드 — anode (시작 y) → cathode (끝 y). 방향 "up" = 아래 anode → 위 cathode.
 *   "up": yStart > yEnd (시작이 아래 = anode), 화살표가 위로 향함
 *   "down": yStart < yEnd, 화살표가 아래로
 *
 * 표준 심볼: 삼각형(anode 쪽 base, cathode 쪽 tip) + 가로 막대 (cathode bar).
 */
function renderDiodeVertical(cx: number, yAnode: number, yCathode: number, dir: "up" | "down", label: string): string {
  const triHalf = 10;  // 삼각형 가로 반폭
  const triHeight = 18;
  let svg = "";
  if (dir === "up") {
    // anode(yAnode 큰값, 아래) → cathode(yCathode 작은값, 위). 삼각형 base at anode side, tip at cathode side.
    const baseY = yAnode;
    const tipY = baseY - triHeight;  // 삼각형 끝
    svg += `<path d="M ${cx - triHalf} ${baseY} L ${cx + triHalf} ${baseY} L ${cx} ${tipY} Z" stroke="black" fill="white" stroke-width="2"/>`;
    // cathode bar (tip 위)
    const barY = tipY - 2;
    svg += `<path d="M ${cx - triHalf} ${barY} L ${cx + triHalf} ${barY}" stroke="black" stroke-width="2.5"/>`;
    // cathode bar에서 yCathode까지 wire — barY부터 시작해 갭 없이 연결.
    svg += `<path d="M ${cx} ${barY} L ${cx} ${yCathode}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${cx + 14}" y="${(baseY + tipY) / 2 + 4}" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  } else {
    // down: anode(yAnode 작은값, 위) → cathode(yCathode 큰값, 아래). 삼각형 base 위, tip 아래.
    const baseY = yAnode;
    const tipY = baseY + triHeight;
    svg += `<path d="M ${cx - triHalf} ${baseY} L ${cx + triHalf} ${baseY} L ${cx} ${tipY} Z" stroke="black" fill="white" stroke-width="2"/>`;
    const barY = tipY + 2;
    svg += `<path d="M ${cx - triHalf} ${barY} L ${cx + triHalf} ${barY}" stroke="black" stroke-width="2.5"/>`;
    // cathode bar에서 yCathode까지 wire — barY부터 시작해 갭 없이 연결.
    svg += `<path d="M ${cx} ${barY} L ${cx} ${yCathode}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${cx + 14}" y="${(baseY + tipY) / 2 + 4}" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  }
  return svg;
}

/** 수직 DC 배터리 (긴 막대·짧은 막대 4개). topY → botY column. */
function renderDcBattery(cx: number, topY: number, botY: number, label: string): string {
  const cy = (topY + botY) / 2;
  let svg = "";
  // 상단 wire
  svg += `<path d="M ${cx} ${topY} L ${cx} ${cy - 12}" stroke="black" fill="none" stroke-width="2"/>`;
  // 하단 wire
  svg += `<path d="M ${cx} ${cy + 14} L ${cx} ${botY}" stroke="black" fill="none" stroke-width="2"/>`;
  // 배터리 4-bar
  svg += `<path d="M ${cx - 10} ${cy - 12} L ${cx + 10} ${cy - 12}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${cx - 6} ${cy - 6} L ${cx + 6} ${cy - 6}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${cx - 10} ${cy} L ${cx + 10} ${cy}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${cx - 6} ${cy + 6} L ${cx + 6} ${cy + 6}" stroke="black" stroke-width="2"/>`;
  // label
  svg += `<text x="${cx + 14}" y="${cy + 4}" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  return svg;
}

/** 수직 저항 (zigzag). (cx, cy) 중심. */
function renderResistorVertical(cx: number, cy: number, label: string): string {
  const half = 26;
  const zigCount = 4;
  const step = (half * 2) / zigCount;
  let path = `M ${cx} ${cy - half}`;
  for (let i = 0; i < zigCount; i++) {
    const y = cy - half + step * (i + 0.5);
    const x = cx + (i % 2 === 0 ? 9 : -9);
    path += ` L ${x} ${y}`;
  }
  path += ` L ${cx} ${cy + half}`;
  let svg = `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${cx + 14}" y="${cy + 4}" font-size="12" fill="#374151">${escapeSvg(label)}</text>`;
  return svg;
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
