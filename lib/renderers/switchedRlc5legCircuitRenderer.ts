import type { CircuitNetlist } from "@/types";

/**
 * Switched RLC 5-leg 회로 전용 renderer — 임용 9번 정확 재현.
 *
 * Layout (6 vertical legs + 2 top horizontal R + SPDT SW):
 *
 *       ┌── R_top_L ──┬─────────────────┬─── A ╲╳╱ B ──── R_top_R ──┐
 *       │             │                 │      │                     │
 *       V_s          R_2v           R_3 + L_a  │   leg4              L_b      ↑I_s
 *       (Leg1)      (Leg2)          (Leg3)     │  C∥R_4              (Leg5)   (Leg6)
 *       │             │                 │      ▼                     │        │
 *       │             │                 │   MID4(v_C+)               │        │
 *       │             │                 │   ┌──┴──┐                  │        │
 *       │             │                 │   C   R_4                  │        │
 *       GND          GND               GND  GND  GND                 GND      GND
 *
 *  6 column x positions (좌→우):
 *    LEG1_X = 80, LEG2_X = 200, LEG3_X = 320, LEG4_X = 440, LEG5_X = 560, LEG6_X = 680
 *    Top horizontal R_top_L: LEG1_X ↔ LEG2_X
 *    Top horizontal R_top_R: LEG5_X ↔ LEG6_X
 */

const LEG1_X = 80;
const LEG2_X = 200;
const LEG3_X = 320;
const LEG4_X = 440;
const LEG5_X = 580;
const LEG6_X = 720;

const TOP_Y = 60;             // top rail
const V_S_MID_Y = 260;        // V_s 배터리 중심
const R_TOP_L_MID_Y = 60;
const R_2V_MID_Y = 200;
const R_3_MID_Y = 160;        // leg3 R_3 (위쪽)
const L_A_MID_Y = 280;        // leg3 L_a (아래)
const SW_COMMON_Y = 130;       // SW common (leg4 top 위)
const SW_ARM_Y = TOP_Y;        // SW throw 위치
const MID4_Y = 180;            // leg4 top (C·R_4 위)
const C_MID_Y = 250;
const R_4_MID_Y = 250;
const L_B_MID_Y = 270;
const I_S_MID_Y = 260;
const R_TOP_R_MID_Y = 60;
const BOT_Y = 380;             // GND rail

const RES_HALF = 22;
const IND_HALF = 20;
const CAP_HALF = 12;

export function hasSwitchedRlc5leg(netlist: CircuitNetlist): boolean {
  const c = netlist.components ?? [];
  const ids = c.map((x) => x.id ?? "");
  return ids.includes("R_top_L") && ids.includes("R_top_R") && ids.includes("L_a") && ids.includes("L_b") && ids.includes("R_4");
}

export function renderSwitchedRlc5legCircuit(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];
  const byId = (id: string) => components.find((c) => c.id === id);
  const V_s = byId("V_s");
  const R_top_L = byId("R_top_L");
  const R_2v = byId("R_2v");
  const R_3 = byId("R_3");
  const L_a = byId("L_a");
  const C = byId("C");
  const R_4 = byId("R_4");
  const L_b = byId("L_b");
  const R_top_R = byId("R_top_R");
  const I_s = byId("I_s");
  const SW = byId("SW");
  if (!V_s || !R_top_L || !R_2v || !R_3 || !L_a || !C || !R_4 || !L_b || !R_top_R || !I_s || !SW) return null;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="420" viewBox="0 0 820 420">`;
  svg += `<defs><marker id="rlc5_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ── Top rail: LEG1_X → LEG2_X (R_top_L) → LEG3_X → A (LEG4 위, dotted SW gap) → B → LEG5_X → LEG6_X (R_top_R) ───
  // V_s top → R_top_L 좌측 wire
  svg += `<path d="M ${LEG1_X} ${TOP_Y} L ${(LEG1_X + LEG2_X) / 2 - 24} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorHorizontal((LEG1_X + LEG2_X) / 2, TOP_Y);
  svg += `<text x="${(LEG1_X + LEG2_X) / 2}" y="${TOP_Y - 16}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">R_top_L</text>`;
  svg += `<text x="${(LEG1_X + LEG2_X) / 2}" y="${TOP_Y + 26}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(R_top_L.value ?? "")}</text>`;
  svg += `<path d="M ${(LEG1_X + LEG2_X) / 2 + 24} ${TOP_Y} L ${LEG3_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // 노드 분기 점 (LEG2, LEG3 top)
  svg += `<circle cx="${LEG2_X}" cy="${TOP_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${LEG3_X}" cy="${TOP_Y}" r="3" fill="black"/>`;
  // A 단자 표시 (LEG3 top과 SW의 A throw 사이) — 그냥 LEG3_X 옆 dot
  svg += `<text x="${LEG3_X + 8}" y="${TOP_Y - 8}" font-size="12" font-weight="700" fill="#dc2626">A</text>`;

  // SW SPDT (LEG4 위쪽) — common이 LEG4_X에서 SW_COMMON_Y. A throw (LEG3_X), B throw (LEG5_X)
  // SW arm: common → A (t<0 위치) 사선
  svg += `<circle cx="${LEG4_X}" cy="${SW_COMMON_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${LEG3_X}" cy="${TOP_Y}" r="4" fill="white" stroke="black" stroke-width="1.5"/>`;
  svg += `<circle cx="${LEG5_X}" cy="${TOP_Y}" r="4" fill="white" stroke="black" stroke-width="1.5"/>`;
  // SW arm: 가운데 common에서 A 방향 사선 (t<0 위치 표시)
  svg += `<path d="M ${LEG4_X} ${SW_COMMON_Y} L ${LEG3_X + 10} ${TOP_Y + 8}" stroke="black" fill="none" stroke-width="2.5"/>`;
  // "t=0: A→B" 라벨
  svg += `<text x="${LEG4_X + 14}" y="${SW_COMMON_Y - 4}" font-size="11" font-weight="600" fill="#7c3aed">t=0: A→B</text>`;
  // SW 전환 화살표 (dashed 보라, A → B)
  svg += `<path d="M ${LEG3_X + 12} ${TOP_Y - 22} Q ${(LEG3_X + LEG5_X) / 2} ${TOP_Y - 38} ${LEG5_X - 10} ${TOP_Y - 22}" stroke="#7c3aed" fill="none" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#rlc5_arrow)"/>`;
  // B 단자 표시
  svg += `<text x="${LEG5_X - 8}" y="${TOP_Y - 8}" text-anchor="end" font-size="12" font-weight="700" fill="#dc2626">B</text>`;

  // R_top_R: LEG5_X ↔ LEG6_X
  svg += `<path d="M ${LEG5_X} ${TOP_Y} L ${(LEG5_X + LEG6_X) / 2 - 24} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorHorizontal((LEG5_X + LEG6_X) / 2, TOP_Y);
  svg += `<text x="${(LEG5_X + LEG6_X) / 2}" y="${TOP_Y - 16}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">R_top_R</text>`;
  svg += `<text x="${(LEG5_X + LEG6_X) / 2}" y="${TOP_Y + 26}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(R_top_R.value ?? "")}</text>`;
  svg += `<path d="M ${(LEG5_X + LEG6_X) / 2 + 24} ${TOP_Y} L ${LEG6_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${LEG6_X}" cy="${TOP_Y}" r="3" fill="black"/>`;

  // ── Leg1: V_s vertical (LEG1_X) ─────────────────────────
  svg += `<path d="M ${LEG1_X} ${TOP_Y} L ${LEG1_X} ${V_S_MID_Y - 14}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${LEG1_X} ${V_S_MID_Y + 14} L ${LEG1_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderBatterySymbol(LEG1_X, V_S_MID_Y);
  svg += `<text x="${LEG1_X - 30}" y="${V_S_MID_Y + 4}" text-anchor="middle" font-size="13" font-weight="700">${escapeSvg(V_s.value ?? "")}</text>`;
  svg += `<text x="${LEG1_X - 30}" y="${V_S_MID_Y + 20}" text-anchor="middle" font-size="11" fill="#666">(V_s)</text>`;
  // (ground symbol은 bottom rail 가운데에 하나만)

  // ── Leg2: R_2v vertical (LEG2_X) ────────────────────────
  svg += `<path d="M ${LEG2_X} ${TOP_Y} L ${LEG2_X} ${R_2V_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorVertical(LEG2_X, R_2V_MID_Y);
  svg += `<path d="M ${LEG2_X} ${R_2V_MID_Y + RES_HALF} L ${LEG2_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${LEG2_X + 14}" y="${R_2V_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">R_2v</text>`;
  svg += `<text x="${LEG2_X + 14}" y="${R_2V_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(R_2v.value ?? "")}</text>`;

  // ── Leg3: R_3 (위) + L_a (아래) 직렬 (LEG3_X) ──────────
  svg += `<path d="M ${LEG3_X} ${TOP_Y} L ${LEG3_X} ${R_3_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorVertical(LEG3_X, R_3_MID_Y);
  svg += `<text x="${LEG3_X + 14}" y="${R_3_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">R_3</text>`;
  svg += `<text x="${LEG3_X + 14}" y="${R_3_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(R_3.value ?? "")}</text>`;
  svg += `<path d="M ${LEG3_X} ${R_3_MID_Y + RES_HALF} L ${LEG3_X} ${L_A_MID_Y - IND_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderInductorVertical(LEG3_X, L_A_MID_Y);
  svg += `<text x="${LEG3_X + 14}" y="${L_A_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">L_a</text>`;
  svg += `<text x="${LEG3_X + 14}" y="${L_A_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(L_a.value ?? "")}</text>`;
  svg += `<path d="M ${LEG3_X} ${L_A_MID_Y + IND_HALF} L ${LEG3_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── SW common → C 단독 (Leg4_C, LEG4_X column) ──────────
  //   원본 정정: R_4는 B_node 쪽에 별도 leg. SW common 아래에는 C만.
  svg += `<path d="M ${LEG4_X} ${SW_COMMON_Y} L ${LEG4_X} ${C_MID_Y - CAP_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${LEG4_X - 14} ${C_MID_Y - 4} L ${LEG4_X + 14} ${C_MID_Y - 4}" stroke="black" stroke-width="2.5"/>`;
  svg += `<path d="M ${LEG4_X - 14} ${C_MID_Y + 4} L ${LEG4_X + 14} ${C_MID_Y + 4}" stroke="black" stroke-width="2.5"/>`;
  svg += `<text x="${LEG4_X - 16}" y="${C_MID_Y - 8}" text-anchor="end" font-size="12" font-weight="700" fill="#1e3a8a">C</text>`;
  svg += `<text x="${LEG4_X - 16}" y="${C_MID_Y + 10}" text-anchor="end" font-size="11" fill="#374151">${escapeSvg(C.value ?? "")}</text>`;
  svg += `<path d="M ${LEG4_X} ${C_MID_Y + 4} L ${LEG4_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // v_C(t) 측정 표기 (C 우측)
  svg += `<text x="${LEG4_X + 16}" y="${C_MID_Y - 4}" font-size="10" fill="#666">+</text>`;
  svg += `<text x="${LEG4_X + 16}" y="${C_MID_Y + 14}" font-size="10" fill="#666">−</text>`;
  svg += `<text x="${LEG4_X + 22}" y="${C_MID_Y + 5}" font-size="11" font-weight="700" fill="#dc2626">v_C(t)</text>`;

  // ── R_4: B_node 쪽 (LEG5_X 좌측 옆에, B_node와 horizontal wire로 연결) ───
  //   B_node 같은 노드: SW B throw (LEG5_X, TOP_Y) = L_b top (LEG5_X, TOP_Y) = R_top_R left (LEG5_X, TOP_Y)
  //   R_4 top이 R4_X column에서 horizontal wire로 LEG5_X top과 연결.
  const R4_X = LEG5_X - 60;
  svg += `<path d="M ${R4_X} ${TOP_Y} L ${LEG5_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${R4_X} ${TOP_Y} L ${R4_X} ${R_4_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorVertical(R4_X, R_4_MID_Y);
  svg += `<text x="${R4_X + 14}" y="${R_4_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">R_4</text>`;
  svg += `<text x="${R4_X + 14}" y="${R_4_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(R_4.value ?? "")}</text>`;
  svg += `<path d="M ${R4_X} ${R_4_MID_Y + RES_HALF} L ${R4_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── Leg5: L_b vertical (LEG5_X) ────────────────────────
  svg += `<path d="M ${LEG5_X} ${TOP_Y} L ${LEG5_X} ${L_B_MID_Y - IND_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderInductorVertical(LEG5_X, L_B_MID_Y);
  svg += `<text x="${LEG5_X + 14}" y="${L_B_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">L_b</text>`;
  svg += `<text x="${LEG5_X + 14}" y="${L_B_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(L_b.value ?? "")}</text>`;
  svg += `<path d="M ${LEG5_X} ${L_B_MID_Y + IND_HALF} L ${LEG5_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // i_L(t) 화살표
  svg += `<path d="M ${LEG5_X - 30} ${L_B_MID_Y - 14} L ${LEG5_X - 30} ${L_B_MID_Y + 14}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#rlc5_arrow)"/>`;
  svg += `<text x="${LEG5_X - 36}" y="${L_B_MID_Y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#dc2626">i_L(t)</text>`;

  // ── Leg6: I_s vertical (LEG6_X) ────────────────────────
  svg += `<path d="M ${LEG6_X} ${TOP_Y} L ${LEG6_X} ${I_S_MID_Y - 22}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${LEG6_X}" cy="${I_S_MID_Y}" r="18" fill="white" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${LEG6_X} ${I_S_MID_Y + 12} L ${LEG6_X} ${I_S_MID_Y - 8}" stroke="black" fill="none" stroke-width="2" marker-end="url(#rlc5_arrow)"/>`;
  svg += `<path d="M ${LEG6_X} ${I_S_MID_Y + 22} L ${LEG6_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${LEG6_X + 28}" y="${I_S_MID_Y + 4}" font-size="13" font-weight="700">${escapeSvg(I_s.value ?? "")}</text>`;
  svg += `<text x="${LEG6_X + 28}" y="${I_S_MID_Y + 20}" font-size="11" fill="#666">(I_s)</text>`;

  // ── Bottom rail (모든 leg의 GND를 단일 horizontal wire로 묶음) ───
  svg += `<path d="M ${LEG1_X} ${BOT_Y} L ${LEG6_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // 가운데에 단일 ground symbol
  const gndCenterX = Math.round((LEG3_X + LEG4_X) / 2);
  svg += `<path d="M ${gndCenterX} ${BOT_Y} L ${gndCenterX} ${BOT_Y + 8}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(gndCenterX, BOT_Y + 8);

  svg += `</svg>`;
  return svg;
}

// ── helpers ─────────────────────────────────────────────
function renderResistorVertical(cx: number, cy: number): string {
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

function renderResistorHorizontal(cx: number, cy: number): string {
  const half = 24;
  const zigCount = 4;
  const step = (half * 2) / zigCount;
  let path = `M ${cx - half} ${cy}`;
  for (let i = 0; i < zigCount; i++) {
    const x = cx - half + step * (i + 0.5);
    const y = cy + (i % 2 === 0 ? -10 : 10);
    path += ` L ${x} ${y}`;
  }
  path += ` L ${cx + half} ${cy}`;
  return `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>`;
}

function renderInductorVertical(cx: number, cy: number): string {
  const top = cy - IND_HALF;
  const stepH = (IND_HALF * 2) / 4;
  let path = "";
  for (let i = 0; i < 4; i++) {
    const yStart = top + stepH * i;
    const yEnd = top + stepH * (i + 1);
    path += `<path d="M ${cx} ${yStart} A ${stepH / 2} ${stepH / 2} 0 0 0 ${cx} ${yEnd}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  return path;
}

function renderBatterySymbol(cx: number, cy: number): string {
  return (
    `<path d="M ${cx - 10} ${cy - 8} L ${cx + 10} ${cy - 8}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 6} ${cy - 2} L ${cx + 6} ${cy - 2}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 10} ${cy + 4} L ${cx + 10} ${cy + 4}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 6} ${cy + 10} L ${cx + 6} ${cy + 10}" stroke="black" stroke-width="2"/>`
  );
}

function renderGroundSymbol(cx: number, y: number): string {
  return (
    `<path d="M ${cx - 10} ${y} L ${cx + 10} ${y}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 7} ${y + 4} L ${cx + 7} ${y + 4}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 4} ${y + 8} L ${cx + 4} ${y + 8}" stroke="black" stroke-width="2"/>`
  );
}

function escapeSvg(v: unknown): string {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
