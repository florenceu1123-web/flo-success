import type { CircuitNetlist } from "@/types";

/**
 * NMOS DC bias 회로 전용 renderer.
 *
 * 표준 layout (단순 — R_S=0, V_G 외부 단자):
 *   V_DD ━┳━━━━━━━━━━━━━┳━━━ V_D (출력)
 *         │              │
 *        (V_DD)         R_D
 *        battery         │
 *         │              ┃D ── V_D
 *         │         ←G ━━ V_G (외부 단자 dot, "V_G = X V" 라벨)
 *         │              ┃S
 *         │              │
 *         GND            GND
 *
 *  NMOS 표준 심볼:
 *    · vertical channel bar (gate 옆 짧은 평행선)
 *    · gate wire: 좌측 horizontal, body와 작은 gap (capacitor 같이)
 *    · drain top, source bottom, source-body 내부 화살표 (NMOS 표시)
 *
 *  M1 식별: type="MOSFET" (meta.device="NMOS"|"PMOS").
 */

const V_DD_X = 80;
const MOS_X = 360;
const RD_COL_X = 460;
const VG_LEFT_X = 200;        // gate 외부 단자 위치
const VD_OUT_X = 620;
const TOP_Y = 80;
const VD_Y = 200;             // drain 노드 y
const MOS_BODY_CENTER_Y = 280;
const VS_Y = 360;             // source 노드 y (= GND wire 위)
const BOT_Y = 420;

const RES_HALF = 28;

export function hasMosfet(netlist: CircuitNetlist): boolean {
  return (netlist.components ?? []).some((c) =>
    ["MOSFET", "NMOS", "PMOS"].includes(String(c.type ?? "").toUpperCase()),
  );
}

export function renderMosfetBiasCircuit(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];
  const mos = components.find((c) =>
    ["MOSFET", "NMOS", "PMOS"].includes(String(c.type ?? "").toUpperCase()),
  );
  if (!mos) return null;

  const resistors = components.filter((c) => c.type === "R");
  const vSources = components.filter((c) => c.type === "V");
  const vdd = vSources.find((c) => /VDD|V_DD/i.test(c.id ?? "")) ?? vSources[0];
  const vgSrc = vSources.find((c) => /^V_?G$/i.test(c.id ?? ""));
  const R_D = resistors.find((c) => /^R[_]?D$|^RD$/i.test(c.id ?? "")) ?? resistors[0];

  // V_G label — V source 값 우선, 없으면 annotation, 둘 다 없으면 "V_G"
  const vgValueLabel = vgSrc?.value ?? "";
  const vgLabel = vgValueLabel ? `V_G = ${vgValueLabel}` : "V_G";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="500" viewBox="0 0 720 500">`;

  // arrow marker (NMOS 화살표 + I_D 표시)
  svg += `<defs><marker id="mos_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ── Top rail: V_DD top → R_D top ──────────────────────────────
  svg += `<path d="M ${V_DD_X} ${TOP_Y} L ${RD_COL_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── V_DD battery (좌측 vertical) ──────────────────────────────
  const vddCy = (TOP_Y + BOT_Y) / 2 - 20;
  const battTopY = vddCy - 8;
  const battBotY = vddCy + 10;
  svg += `<path d="M ${V_DD_X} ${TOP_Y} L ${V_DD_X} ${battTopY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X} ${battBotY} L ${V_DD_X} ${BOT_Y - 40}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${V_DD_X - 30}" y="${(TOP_Y + BOT_Y) / 2}" text-anchor="middle" font-size="13" font-weight="600">${escapeSvg(vdd?.value ?? "V_DD")}</text>`;
  svg += `<text x="${V_DD_X - 30}" y="${(TOP_Y + BOT_Y) / 2 + 16}" text-anchor="middle" font-size="11" fill="#666">(V_DD)</text>`;
  // 4-bar 배터리 심볼
  svg += `<path d="M ${V_DD_X - 10} ${vddCy - 8} L ${V_DD_X + 10} ${vddCy - 8}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X - 6} ${vddCy - 2} L ${V_DD_X + 6} ${vddCy - 2}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X - 10} ${vddCy + 4} L ${V_DD_X + 10} ${vddCy + 4}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X - 6} ${vddCy + 10} L ${V_DD_X + 6} ${vddCy + 10}" stroke="black" stroke-width="2"/>`;
  // V_DD GND
  svg += `<path d="M ${V_DD_X} ${BOT_Y - 40} L ${V_DD_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(V_DD_X, BOT_Y);

  // ── R_D: top rail → V_D node (RD_COL_X column) ──────────────
  if (R_D) {
    const cy = (TOP_Y + VD_Y) / 2;
    svg += `<path d="M ${RD_COL_X} ${TOP_Y} L ${RD_COL_X} ${cy - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(RD_COL_X, cy);
    svg += `<path d="M ${RD_COL_X} ${cy + RES_HALF} L ${RD_COL_X} ${VD_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${RD_COL_X + 16}" y="${cy - 4}" font-size="12" font-weight="700" fill="#1e3a8a">R_D</text>`;
    svg += `<text x="${RD_COL_X + 16}" y="${cy + 12}" font-size="12" fill="#374151">${escapeSvg(String(R_D.value ?? ""))}</text>`;
    // I_D 화살표 (R_D 우측)
    svg += `<path d="M ${RD_COL_X + 60} ${cy - 16} L ${RD_COL_X + 60} ${cy + 16}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#mos_arrow)"/>`;
    svg += `<text x="${RD_COL_X + 66}" y="${cy + 4}" font-size="12" font-weight="600">I_D</text>`;
  }

  // V_D 노드 dot + 출력 단자
  svg += `<circle cx="${RD_COL_X}" cy="${VD_Y}" r="3" fill="black"/>`;
  svg += `<path d="M ${RD_COL_X} ${VD_Y} L ${VD_OUT_X} ${VD_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${VD_OUT_X}" cy="${VD_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VD_OUT_X + 10}" y="${VD_Y + 5}" font-size="14" font-weight="700" fill="#dc2626">V_D</text>`;

  // ── NMOS 심볼 ─────────────────────────────────────────────────
  // standard NMOS layout:
  //   - drain wire 수직 (top → channel bar top)
  //   - channel bar: 수직 막대 (gate 옆에)
  //   - gate wire: 좌측에서 small gap 후 gate plate
  //   - source wire 수직 (channel bar bottom → bottom), source 내부 화살표 (밖→안)
  const mosDrainY = MOS_BODY_CENTER_Y - 30;
  const mosSourceY = MOS_BODY_CENTER_Y + 30;
  const channelX = MOS_X + 10;
  const gatePlateX = MOS_X - 4;       // gate plate (수직 짧은 선)

  // drain wire: V_D → channel top
  svg += `<path d="M ${RD_COL_X} ${VD_Y} L ${RD_COL_X} ${mosDrainY} L ${channelX} ${mosDrainY}" stroke="black" fill="none" stroke-width="2"/>`;
  // source wire: channel bottom → GND
  svg += `<path d="M ${channelX} ${mosSourceY} L ${channelX} ${VS_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${channelX} ${VS_Y} L ${channelX} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(channelX, BOT_Y);

  // channel bar (수직 굵은 선)
  svg += `<path d="M ${channelX} ${mosDrainY} L ${channelX} ${mosSourceY}" stroke="black" fill="none" stroke-width="3"/>`;

  // gate plate (수직 짧은 선, channel 좌측 gap)
  const gatePlateTopY = mosDrainY + 4;
  const gatePlateBotY = mosSourceY - 4;
  svg += `<path d="M ${gatePlateX} ${gatePlateTopY} L ${gatePlateX} ${gatePlateBotY}" stroke="black" fill="none" stroke-width="2"/>`;

  // gate wire (좌측 단자 V_G → gate plate)
  svg += `<path d="M ${VG_LEFT_X} ${MOS_BODY_CENTER_Y} L ${gatePlateX} ${MOS_BODY_CENTER_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // V_G 외부 단자 dot + 라벨
  svg += `<circle cx="${VG_LEFT_X}" cy="${MOS_BODY_CENTER_Y}" r="4" fill="#7c3aed" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VG_LEFT_X - 8}" y="${MOS_BODY_CENTER_Y + 5}" text-anchor="end" font-size="13" font-weight="700" fill="#7c3aed">${escapeSvg(vgLabel)}</text>`;

  // NMOS 화살표 (source side, channel → source: 밖에서 안으로 향함 = NMOS)
  // body line 내부에 화살표 (source 쪽에서 channel로)
  const arrowStartX = channelX + 12;
  const arrowEndX = channelX + 3;
  const arrowY = mosSourceY - 5;
  svg += `<path d="M ${arrowStartX} ${arrowY} L ${arrowEndX} ${arrowY}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#mos_arrow)"/>`;

  // M1 라벨
  svg += `<text x="${channelX + 18}" y="${MOS_BODY_CENTER_Y + 4}" font-size="12" font-weight="600" fill="#1e3a8a">${escapeSvg(mos.id ?? "M1")}</text>`;
  // D/G/S 핀 라벨
  svg += `<text x="${channelX + 6}" y="${mosDrainY - 4}" font-size="10" fill="#666">D</text>`;
  svg += `<text x="${channelX + 6}" y="${mosSourceY + 14}" font-size="10" fill="#666">S</text>`;
  svg += `<text x="${gatePlateX - 10}" y="${MOS_BODY_CENTER_Y - 8}" font-size="10" fill="#666">G</text>`;

  svg += `</svg>`;
  return svg;
}

// =====================================================================
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
