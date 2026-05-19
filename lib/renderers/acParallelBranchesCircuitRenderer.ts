import type { CircuitNetlist } from "@/types";

/**
 * AC parallel branches 회로 전용 renderer — 임용 5번 형식.
 *
 * Layout:
 *   ┌─ R_top ─ N_L ━ (I_S →) ━ N_R ━━━━━━━━━━━━━━━━━┐
 *   │            │              │     │     │       │
 *   V_s         L_1            L_2    R     C       │
 *   │            │              │     │     │       │
 *   └── GND ── GND ──────── GND ─ GND ─ GND ────────┘
 *
 *  - R_top: V_s top → N_L horizontal (I_R1 표시)
 *  - I_S: N_L → N_R horizontal current source (top rail의 일부, 가운데에 원형 심볼 + 화살표)
 *  - L_1: N_L → GND vertical (i_L1 측정)
 *  - L_2, R, C: N_R → GND 세 vertical (병렬, V_C 측정은 C 양단)
 *  - V_C 측정: N_R = 양단 + 노드, GND = 음단
 */

const V_S_X = 80;
const N_L_X = 240;
const I_S_X = 360;
const N_R_X = 480;
const R_BR_X = 580;
const C_BR_X = 680;
const RIGHT_END_X = 760;

const TOP_Y = 70;
const V_S_MID_Y = 220;
const L_1_MID_Y = 240;
const L_2_MID_Y = 240;
const R_MID_Y = 240;
const C_MID_Y = 240;
const BOT_Y = 380;

const RES_HALF = 22;
const IND_HALF = 20;
const CAP_HALF = 12;

export function hasAcParallelBranches(netlist: CircuitNetlist): boolean {
  const c = netlist.components ?? [];
  const ids = new Set(c.map((x) => x.id ?? ""));
  return ids.has("V_s") && ids.has("R_top") && ids.has("L_1") && ids.has("L_2") && ids.has("R") && ids.has("C") && ids.has("I_S");
}

export function renderAcParallelBranchesCircuit(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];
  const byId = (id: string) => components.find((c) => c.id === id);
  const V_s = byId("V_s");
  const R_top = byId("R_top");
  const L_1 = byId("L_1");
  const I_S = byId("I_S");
  const L_2 = byId("L_2");
  const R = byId("R");
  const C = byId("C");
  if (!V_s || !R_top || !L_1 || !I_S || !L_2 || !R || !C) return null;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420">`;
  svg += `<defs><marker id="apb_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ── Top rail ──────────────────────────────────────────────
  // V_s top → R_top → N_L → I_S(원형 심볼) → N_R → 우측 끝
  // V_s top wire
  svg += `<path d="M ${V_S_X} ${TOP_Y} L ${(V_S_X + N_L_X) / 2 - 24} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // R_top (horizontal)
  svg += renderResistorHorizontal((V_S_X + N_L_X) / 2, TOP_Y);
  svg += `<text x="${(V_S_X + N_L_X) / 2}" y="${TOP_Y - 16}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">R_top</text>`;
  svg += `<text x="${(V_S_X + N_L_X) / 2}" y="${TOP_Y + 24}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(R_top.value ?? "")}</text>`;
  // I_R1 화살표 (R_top 위)
  svg += `<path d="M ${(V_S_X + N_L_X) / 2 - 20} ${TOP_Y - 32} L ${(V_S_X + N_L_X) / 2 + 20} ${TOP_Y - 32}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#apb_arrow)"/>`;
  svg += `<text x="${(V_S_X + N_L_X) / 2 - 24}" y="${TOP_Y - 36}" text-anchor="end" font-size="11" font-weight="700" fill="#dc2626">I_R1</text>`;
  // R_top right wire
  svg += `<path d="M ${(V_S_X + N_L_X) / 2 + 24} ${TOP_Y} L ${N_L_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // N_L dot
  svg += `<circle cx="${N_L_X}" cy="${TOP_Y}" r="3" fill="black"/>`;

  // N_L → I_S 좌측 wire
  svg += `<path d="M ${N_L_X} ${TOP_Y} L ${I_S_X - 18} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // I_S 원형 심볼 (가운데, top rail 한가운데) + 우측 향 화살표
  svg += `<circle cx="${I_S_X}" cy="${TOP_Y}" r="18" fill="white" stroke="black" stroke-width="2"/>`;
  // 화살표: 좌→우 (전류 N_L → N_R 방향)
  svg += `<path d="M ${I_S_X - 10} ${TOP_Y} L ${I_S_X + 8} ${TOP_Y}" stroke="black" fill="none" stroke-width="2" marker-end="url(#apb_arrow)"/>`;
  svg += `<text x="${I_S_X}" y="${TOP_Y - 24}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">I_S</text>`;
  svg += `<text x="${I_S_X}" y="${TOP_Y + 32}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(I_S.value ?? "")}</text>`;
  // I_S 우측 wire → N_R
  svg += `<path d="M ${I_S_X + 18} ${TOP_Y} L ${N_R_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // N_R dot + v_C(+) 라벨
  svg += `<circle cx="${N_R_X}" cy="${TOP_Y}" r="3" fill="black"/>`;
  svg += `<text x="${N_R_X + 8}" y="${TOP_Y - 8}" font-size="11" font-weight="700" fill="#1e3a8a">v_C(+)</text>`;
  // N_R → 우측 끝 wire (L_2, R, C column 모두 연결)
  svg += `<path d="M ${N_R_X} ${TOP_Y} L ${C_BR_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // L_2, R, C column dots
  svg += `<circle cx="${R_BR_X}" cy="${TOP_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${C_BR_X}" cy="${TOP_Y}" r="3" fill="black"/>`;

  // ── V_s 좌측 vertical (AC source) ─────────────────────────
  svg += `<path d="M ${V_S_X} ${TOP_Y} L ${V_S_X} ${V_S_MID_Y - 22}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${V_S_X}" cy="${V_S_MID_Y}" r="20" fill="white" stroke="black" stroke-width="2"/>`;
  // AC sine wave 심볼 (원 안)
  svg += `<path d="M ${V_S_X - 10} ${V_S_MID_Y} Q ${V_S_X - 5} ${V_S_MID_Y - 6} ${V_S_X} ${V_S_MID_Y} T ${V_S_X + 10} ${V_S_MID_Y}" stroke="black" fill="none" stroke-width="1.5"/>`;
  svg += `<text x="${V_S_X + 26}" y="${V_S_MID_Y - 4}" font-size="13" font-weight="700">${escapeSvg(V_s.value ?? "V_s")}</text>`;
  svg += `<text x="${V_S_X - 26}" y="${V_S_MID_Y - 4}" text-anchor="end" font-size="11" fill="#666">+</text>`;
  svg += `<text x="${V_S_X - 26}" y="${V_S_MID_Y + 14}" text-anchor="end" font-size="11" fill="#666">−</text>`;
  svg += `<path d="M ${V_S_X} ${V_S_MID_Y + 20} L ${V_S_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── L_1 vertical (N_L → GND) ──────────────────────────────
  svg += `<path d="M ${N_L_X} ${TOP_Y} L ${N_L_X} ${L_1_MID_Y - IND_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderInductorVertical(N_L_X, L_1_MID_Y);
  svg += `<text x="${N_L_X + 14}" y="${L_1_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">L_1</text>`;
  svg += `<text x="${N_L_X + 14}" y="${L_1_MID_Y + 12}" font-size="11" fill="#374151">${escapeSvg(L_1.value ?? "")}</text>`;
  // I_L1 화살표 (L_1 좌측)
  svg += `<path d="M ${N_L_X - 30} ${L_1_MID_Y - 14} L ${N_L_X - 30} ${L_1_MID_Y + 14}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#apb_arrow)"/>`;
  svg += `<text x="${N_L_X - 36}" y="${L_1_MID_Y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#dc2626">I_L1</text>`;
  svg += `<path d="M ${N_L_X} ${L_1_MID_Y + IND_HALF} L ${N_L_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── L_2 vertical (N_R → GND) ──────────────────────────────
  svg += `<path d="M ${N_R_X} ${TOP_Y} L ${N_R_X} ${L_2_MID_Y - IND_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderInductorVertical(N_R_X, L_2_MID_Y);
  svg += `<text x="${N_R_X + 14}" y="${L_2_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">L_2</text>`;
  svg += `<text x="${N_R_X + 14}" y="${L_2_MID_Y + 12}" font-size="11" fill="#374151">${escapeSvg(L_2.value ?? "")}</text>`;
  // I_L2 화살표
  svg += `<path d="M ${N_R_X - 30} ${L_2_MID_Y - 14} L ${N_R_X - 30} ${L_2_MID_Y + 14}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#apb_arrow)"/>`;
  svg += `<text x="${N_R_X - 36}" y="${L_2_MID_Y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#dc2626">I_L2</text>`;
  svg += `<path d="M ${N_R_X} ${L_2_MID_Y + IND_HALF} L ${N_R_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── R vertical (R_BR_X → GND) ─────────────────────────────
  svg += `<path d="M ${R_BR_X} ${TOP_Y} L ${R_BR_X} ${R_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorVertical(R_BR_X, R_MID_Y);
  svg += `<text x="${R_BR_X + 14}" y="${R_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">R</text>`;
  svg += `<text x="${R_BR_X + 14}" y="${R_MID_Y + 12}" font-size="11" fill="#374151">${escapeSvg(R.value ?? "")}</text>`;
  svg += `<path d="M ${R_BR_X} ${R_MID_Y + RES_HALF} L ${R_BR_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── C vertical (C_BR_X → GND, V_C 측정) ───────────────────
  svg += `<path d="M ${C_BR_X} ${TOP_Y} L ${C_BR_X} ${C_MID_Y - CAP_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${C_BR_X - 14} ${C_MID_Y - 4} L ${C_BR_X + 14} ${C_MID_Y - 4}" stroke="black" stroke-width="2.5"/>`;
  svg += `<path d="M ${C_BR_X - 14} ${C_MID_Y + 4} L ${C_BR_X + 14} ${C_MID_Y + 4}" stroke="black" stroke-width="2.5"/>`;
  svg += `<text x="${C_BR_X + 16}" y="${C_MID_Y - 4}" font-size="12" font-weight="700" fill="#1e3a8a">C</text>`;
  svg += `<text x="${C_BR_X + 16}" y="${C_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(C.value ?? "")}</text>`;
  // V_C +/- 마크 (C 좌측)
  svg += `<text x="${C_BR_X - 18}" y="${C_MID_Y - 4}" text-anchor="end" font-size="11" fill="#666">+</text>`;
  svg += `<text x="${C_BR_X - 18}" y="${C_MID_Y + 14}" text-anchor="end" font-size="11" fill="#666">−</text>`;
  svg += `<text x="${C_BR_X - 26}" y="${C_MID_Y + 5}" text-anchor="end" font-size="11" font-weight="700" fill="#dc2626">V_C</text>`;
  svg += `<path d="M ${C_BR_X} ${C_MID_Y + 4} L ${C_BR_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── Bottom rail (단일 GND) ────────────────────────────────
  svg += `<path d="M ${V_S_X} ${BOT_Y} L ${C_BR_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // 단일 ground symbol (가운데)
  const gndX = Math.round((N_L_X + N_R_X) / 2);
  svg += `<path d="M ${gndX} ${BOT_Y} L ${gndX} ${BOT_Y + 8}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(gndX, BOT_Y + 8);

  svg += `</svg>`;
  return svg;
}

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
