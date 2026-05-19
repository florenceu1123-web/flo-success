import type { CircuitNetlist } from "@/types";

/**
 * Switched RLC step response 회로 전용 renderer (임용 9번 switched 버전).
 *
 * 3-leg layout + SPDT SW:
 *      좌측 (V_s)            가운데 (SW + RLC)             우측 (I_s)
 *  ┌─V_s top━━ R_a ━━ A ╲╳╱ B ━━ R_b ━━ I_s top─┐
 *  │                         ║                        │
 *  V_s                    SW common                   I_s
 *  │                         ▼                        │
 *  │                       MID 노드 ━━━━━━━━━━━━━     │
 *  │                       │              │           │
 *  │                       C            R_c           │
 *  │                      (v_C)           │           │
 *  │                       │              L           │
 *  │                       │              │           │
 *  └────── GND ────── GND  ──  GND ── GND ──────── GND
 *
 * SW SPDT:
 *  - A throw: 좌측 위 (좌측 leg 끝)
 *  - B throw: 우측 위 (우측 leg 끝)
 *  - common: 가운데 아래 → MID 노드
 *  - arm: common→A 위치 (실선, "t<0" 표기) — t=0에 B로 전환 ("t=0: A→B" 라벨)
 *
 * 인식: SW(SPDT) + C + L + V + I 모두 존재.
 */

const V_S_X = 80;
const A_NODE_X = 240;
const SW_COMMON_X = 360;     // = MID column
const B_NODE_X = 480;
const I_S_X = 620;
const C_COL_X = 290;          // MID 좌측 (C column)
const RCL_COL_X = 430;        // MID 우측 (R_c·L column)

const TOP_Y = 70;             // R_a/R_b 수평 rail
const V_S_MID_Y = 230;
const I_S_MID_Y = 230;
const SW_ARM_TOP_Y = 60;      // SW throw 위치 (A·B dots)
const SW_COMMON_Y = 140;       // SW common 단자
const MID_NODE_Y = 200;        // C 위쪽 = R_c 위쪽 (가운데 노드)
const C_MID_Y = 260;
const RC_MID_Y = 250;
const L_MID_Y = 330;
const BOT_Y = 410;             // ground rail

const RES_HALF = 24;
const CAP_HALF = 14;
const IND_HALF = 22;

export function hasSwitchedRlcStep(netlist: CircuitNetlist): boolean {
  const c = netlist.components ?? [];
  const hasSW = c.some((x) => String(x.type ?? "").toUpperCase() === "SW" && (x.pins?.length ?? 0) >= 3);
  const hasC = c.some((x) => String(x.type ?? "").toUpperCase() === "C");
  const hasL = c.some((x) => String(x.type ?? "").toUpperCase() === "L");
  const hasV = c.some((x) => String(x.type ?? "").toUpperCase() === "V");
  const hasI = c.some((x) => String(x.type ?? "").toUpperCase() === "I");
  return hasSW && hasC && hasL && hasV && hasI;
}

export function renderSwitchedRlcStepCircuit(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];

  const V_s = components.find((c) => /^V_?s$/i.test(c.id ?? "")) ?? components.find((c) => c.type === "V");
  const I_s = components.find((c) => /^I_?s$/i.test(c.id ?? "")) ?? components.find((c) => c.type === "I");
  const SW = components.find((c) => String(c.type ?? "").toUpperCase() === "SW");
  const R_a = components.find((c) => /^R_?a$/i.test(c.id ?? ""));
  const R_b = components.find((c) => /^R_?b$/i.test(c.id ?? ""));
  const R_c = components.find((c) => /^R_?c$/i.test(c.id ?? ""));
  const Cap = components.find((c) => String(c.type ?? "").toUpperCase() === "C");
  const Ind = components.find((c) => String(c.type ?? "").toUpperCase() === "L");

  if (!V_s || !I_s || !SW || !R_a || !R_b || !R_c || !Cap || !Ind) return null;

  const swLabel = SW.value ?? "t=0: A→B";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450">`;
  svg += `<defs><marker id="srl_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ── Top rail ─────────────────────────────────────────────
  // V_s top → R_a → A_node ╳ B_node → R_b → I_s top (SW가 A·B 사이를 끊음, 두 부분은 SW 통해서만 연결)
  // V_s top → R_a 좌측: wire
  svg += `<path d="M ${V_S_X} ${TOP_Y} L ${A_NODE_X - 60} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // R_a (horizontal, V_S_X~A_NODE_X 사이)
  svg += renderResistorHorizontal((V_S_X + A_NODE_X) / 2, TOP_Y);
  svg += `<text x="${(V_S_X + A_NODE_X) / 2}" y="${TOP_Y - 16}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">R_a</text>`;
  svg += `<text x="${(V_S_X + A_NODE_X) / 2}" y="${TOP_Y + 26}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(R_a.value ?? "")}</text>`;
  // R_a right → A_node
  svg += `<path d="M ${(V_S_X + A_NODE_X) / 2 + 24} ${TOP_Y} L ${A_NODE_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // A_node terminal dot
  svg += `<circle cx="${A_NODE_X}" cy="${TOP_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${A_NODE_X - 10}" y="${TOP_Y - 8}" text-anchor="end" font-size="13" font-weight="700" fill="#dc2626">A</text>`;

  // B_node terminal dot + B → R_b → I_s top
  svg += `<circle cx="${B_NODE_X}" cy="${TOP_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${B_NODE_X + 10}" y="${TOP_Y - 8}" font-size="13" font-weight="700" fill="#dc2626">B</text>`;
  svg += `<path d="M ${B_NODE_X} ${TOP_Y} L ${(B_NODE_X + I_S_X) / 2 - 24} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorHorizontal((B_NODE_X + I_S_X) / 2, TOP_Y);
  svg += `<text x="${(B_NODE_X + I_S_X) / 2}" y="${TOP_Y - 16}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">R_b</text>`;
  svg += `<text x="${(B_NODE_X + I_S_X) / 2}" y="${TOP_Y + 26}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(R_b.value ?? "")}</text>`;
  svg += `<path d="M ${(B_NODE_X + I_S_X) / 2 + 24} ${TOP_Y} L ${I_S_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── V_s 좌측 vertical (배터리) ───────────────────────────
  svg += `<path d="M ${V_S_X} ${TOP_Y} L ${V_S_X} ${V_S_MID_Y - 14}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${V_S_X} ${V_S_MID_Y + 14} L ${V_S_X} ${BOT_Y - 40}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${V_S_X - 32}" y="${V_S_MID_Y + 4}" text-anchor="middle" font-size="13" font-weight="700">${escapeSvg(V_s.value ?? "V_s")}</text>`;
  svg += `<text x="${V_S_X - 32}" y="${V_S_MID_Y + 20}" text-anchor="middle" font-size="11" fill="#666">(V_s)</text>`;
  svg += `<text x="${V_S_X + 12}" y="${V_S_MID_Y - 4}" font-size="11" fill="#666">+</text>`;
  svg += `<text x="${V_S_X + 12}" y="${V_S_MID_Y + 20}" font-size="11" fill="#666">−</text>`;
  // 4-bar 배터리 심볼
  const vy = V_S_MID_Y - 8;
  svg += `<path d="M ${V_S_X - 10} ${vy} L ${V_S_X + 10} ${vy}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_S_X - 6} ${vy + 6} L ${V_S_X + 6} ${vy + 6}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_S_X - 10} ${vy + 12} L ${V_S_X + 10} ${vy + 12}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_S_X - 6} ${vy + 18} L ${V_S_X + 6} ${vy + 18}" stroke="black" stroke-width="2"/>`;
  // V_s → GND
  svg += `<path d="M ${V_S_X} ${BOT_Y - 40} L ${V_S_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(V_S_X, BOT_Y);

  // ── I_s 우측 vertical (전류원) ───────────────────────────
  svg += `<path d="M ${I_S_X} ${TOP_Y} L ${I_S_X} ${I_S_MID_Y - 22}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${I_S_X} ${I_S_MID_Y + 22} L ${I_S_X} ${BOT_Y - 40}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${I_S_X + 30}" y="${I_S_MID_Y + 4}" text-anchor="start" font-size="13" font-weight="700">${escapeSvg(I_s.value ?? "I_s")}</text>`;
  svg += `<text x="${I_S_X + 30}" y="${I_S_MID_Y + 20}" text-anchor="start" font-size="11" fill="#666">(I_s)</text>`;
  // 전류원 원 + 위쪽 화살표 (전류 방향: GND→top)
  svg += `<circle cx="${I_S_X}" cy="${I_S_MID_Y}" r="18" fill="white" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${I_S_X} ${I_S_MID_Y + 12} L ${I_S_X} ${I_S_MID_Y - 8}" stroke="black" fill="none" stroke-width="2" marker-end="url(#srl_arrow)"/>`;
  // I_s → GND
  svg += `<path d="M ${I_S_X} ${BOT_Y - 40} L ${I_S_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(I_S_X, BOT_Y);

  // ── SW SPDT ──────────────────────────────────────────────
  // common dot (MID 위쪽)
  const swCommonY = SW_COMMON_Y;
  svg += `<circle cx="${SW_COMMON_X}" cy="${swCommonY}" r="3" fill="black"/>`;
  // common → MID wire (vertical)
  svg += `<path d="M ${SW_COMMON_X} ${swCommonY} L ${SW_COMMON_X} ${MID_NODE_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // A throw dot (TOP_Y 위치)
  svg += `<circle cx="${A_NODE_X}" cy="${TOP_Y}" r="3" fill="white" stroke="black" stroke-width="1.5"/>`;
  // B throw dot (TOP_Y 위치)
  svg += `<circle cx="${B_NODE_X}" cy="${TOP_Y}" r="3" fill="white" stroke="black" stroke-width="1.5"/>`;
  // SW arm — common에서 A 방향으로 (t<0 위치). 사선.
  svg += `<path d="M ${SW_COMMON_X} ${swCommonY} L ${A_NODE_X + 10} ${TOP_Y + 8}" stroke="black" fill="none" stroke-width="2.5"/>`;
  // SW arm의 끝에 dot (A throw에 닿기 직전)
  // (이미 위에서 A dot 그렸음)
  // "t=0: A→B" 라벨 (SW 우측)
  svg += `<text x="${SW_COMMON_X + 20}" y="${swCommonY - 4}" font-size="11" font-weight="600" fill="#7c3aed">${escapeSvg(swLabel)}</text>`;
  // SW transition 화살표 표시 (A → B, dashed 보라)
  svg += `<path d="M ${A_NODE_X + 18} ${TOP_Y - 22} Q ${(A_NODE_X + B_NODE_X) / 2} ${TOP_Y - 38} ${B_NODE_X - 8} ${TOP_Y - 22}" stroke="#7c3aed" fill="none" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#srl_arrow)"/>`;

  // ── MID 노드 분기 (C 좌측, R_c+L 우측) ────────────────────
  // MID node dot
  svg += `<circle cx="${SW_COMMON_X}" cy="${MID_NODE_Y}" r="3" fill="black"/>`;
  svg += `<text x="${SW_COMMON_X + 8}" y="${MID_NODE_Y - 8}" font-size="11" font-weight="700" fill="#1e3a8a">v_C(+)</text>`;
  // MID에서 C 가지로 horizontal wire
  svg += `<path d="M ${SW_COMMON_X} ${MID_NODE_Y} L ${C_COL_X} ${MID_NODE_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // MID에서 R_c·L 가지로 horizontal wire
  svg += `<path d="M ${SW_COMMON_X} ${MID_NODE_Y} L ${RCL_COL_X} ${MID_NODE_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── C 가지 (vertical, MID → C → GND) ─────────────────────
  // wire 위
  svg += `<path d="M ${C_COL_X} ${MID_NODE_Y} L ${C_COL_X} ${C_MID_Y - CAP_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  // capacitor 심볼 (두 평행 plate)
  svg += `<path d="M ${C_COL_X - 14} ${C_MID_Y - 4} L ${C_COL_X + 14} ${C_MID_Y - 4}" stroke="black" stroke-width="2.5"/>`;
  svg += `<path d="M ${C_COL_X - 14} ${C_MID_Y + 4} L ${C_COL_X + 14} ${C_MID_Y + 4}" stroke="black" stroke-width="2.5"/>`;
  // C 라벨
  svg += `<text x="${C_COL_X - 22}" y="${C_MID_Y - 8}" text-anchor="end" font-size="12" font-weight="700" fill="#1e3a8a">C</text>`;
  svg += `<text x="${C_COL_X - 22}" y="${C_MID_Y + 10}" text-anchor="end" font-size="11" fill="#374151">${escapeSvg(Cap.value ?? "")}</text>`;
  // wire 아래 (C → GND)
  svg += `<path d="M ${C_COL_X} ${C_MID_Y + 4} L ${C_COL_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(C_COL_X, BOT_Y);
  // v_C 측정 마크 (좌측에 +/-)
  svg += `<text x="${C_COL_X + 18}" y="${C_MID_Y - 10}" font-size="10" fill="#666">+</text>`;
  svg += `<text x="${C_COL_X + 18}" y="${C_MID_Y + 18}" font-size="10" fill="#666">−</text>`;
  svg += `<text x="${C_COL_X + 24}" y="${C_MID_Y + 5}" font-size="11" font-weight="700" fill="#dc2626">v_C(t)</text>`;

  // ── R_c+L 가지 (직렬 vertical, MID → R_c → L → GND) ──────
  // wire 위 (MID → R_c top)
  svg += `<path d="M ${RCL_COL_X} ${MID_NODE_Y} L ${RCL_COL_X} ${RC_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorVertical(RCL_COL_X, RC_MID_Y);
  svg += `<text x="${RCL_COL_X + 14}" y="${RC_MID_Y - 4}" font-size="12" font-weight="700" fill="#1e3a8a">R_c</text>`;
  svg += `<text x="${RCL_COL_X + 14}" y="${RC_MID_Y + 12}" font-size="11" fill="#374151">${escapeSvg(R_c.value ?? "")}</text>`;
  // R_c bottom → L top
  svg += `<path d="M ${RCL_COL_X} ${RC_MID_Y + RES_HALF} L ${RCL_COL_X} ${L_MID_Y - IND_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
  // L 심볼 (4 loop coil)
  svg += renderInductorVertical(RCL_COL_X, L_MID_Y);
  svg += `<text x="${RCL_COL_X + 14}" y="${L_MID_Y - 4}" font-size="12" font-weight="700" fill="#1e3a8a">L</text>`;
  svg += `<text x="${RCL_COL_X + 14}" y="${L_MID_Y + 12}" font-size="11" fill="#374151">${escapeSvg(Ind.value ?? "")}</text>`;
  // L bottom → GND
  svg += `<path d="M ${RCL_COL_X} ${L_MID_Y + IND_HALF} L ${RCL_COL_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(RCL_COL_X, BOT_Y);
  // i_L 화살표 (L 우측 옆)
  svg += `<path d="M ${RCL_COL_X + 40} ${L_MID_Y - 14} L ${RCL_COL_X + 40} ${L_MID_Y + 14}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#srl_arrow)"/>`;
  svg += `<text x="${RCL_COL_X + 46}" y="${L_MID_Y + 4}" font-size="11" font-weight="700" fill="#dc2626">i_L(t)</text>`;

  // ── Bottom rail (V_s GND ━━ C GND ━━ R_c+L GND ━━ I_s GND) ─
  // 명시적 ground rail 안 두고 각 column별 ground symbol 사용 (모두 같은 GND 노드)

  svg += `</svg>`;
  return svg;
}

// ── helpers ──────────────────────────────────────────────
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
  // zigzag horizontal, width 48 (±24)
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
  // 4개 작은 반원 (좌측으로 볼록)
  const top = cy - IND_HALF;
  const stepH = (IND_HALF * 2) / 4;
  let path = "";
  for (let i = 0; i < 4; i++) {
    const yStart = top + stepH * i;
    const yEnd = top + stepH * (i + 1);
    // 반원: M (cx, yStart) A r r 0 0 0 (cx, yEnd) — 좌측으로 볼록(반시계 방향)
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
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
