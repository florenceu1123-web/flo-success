/**
 * 임용 10번 2-OPAMP cascade renderer.
 *
 *  Fixed-slot layout:
 *    V_i (AC source) ──R_1── V⁻(U_1) ─U_1─ V_o ──R_4── V⁻(U_2) ─U_2─ V_s
 *                              │                          │
 *                             R_3 (feedback to V_o)      R_5 (feedback to V_s)
 *                              │                          │
 *                             R_2 (V⁻ → GND)             R_6 (V⁻ → GND)
 */

const KOREAN_FONT_STACK = `'Noto Sans CJK KR', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;

export type OpampCascadeDiagram = {
  R_1_label: string;  // "10kΩ"
  R_2_label: string;
  R_3_label: string;
  R_4_label: string;
  R_5_label: string;
  R_6_label: string;
  V_i_label: string;  // "v_i(t)" 또는 "v_i"
};

const W = 820, H = 380;
const VI_X = 60;                  // V_i AC source
const R1_X = 170;                 // R_1 horizontal center
const U1_INPUT_X = 250;           // V⁻(U_1) node
const U1_CX = 310;                // U_1 OPAMP center
const VO_X = 410;                 // V_o (U_1 output) node
const R4_X = 470;                 // R_4 horizontal center
const U2_INPUT_X = 530;           // V⁻(U_2) node
const U2_CX = 590;                // U_2 OPAMP center
const VS_X = 700;                 // V_s (U_2 output) node
const VS_LABEL_X = 760;           // V_s output label

const MID_Y = 180;                // 신호선 y
const FB_Y = 70;                  // feedback 상단 y (R_3, R_5)
const BIAS_Y = 290;               // bias R 하단 y (R_2, R_6)
const BOT_Y = 340;                // GND rail

export function renderOpampCascade(d: OpampCascadeDiagram): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${KOREAN_FONT_STACK}">`;
  svg += defs();

  // V_i AC source (vertical, left)
  svg += renderAcSource(VI_X, MID_Y - 30, BOT_Y, d.V_i_label);

  // V_i top → R_1 → V⁻(U_1)
  svg += `<path d="M ${VI_X} ${MID_Y - 30} L ${VI_X} ${MID_Y} L ${R1_X - 18} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal(R1_X, MID_Y, d.R_1_label, "R_1");
  svg += `<path d="M ${R1_X + 18} ${MID_Y} L ${U1_INPUT_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<circle cx="${U1_INPUT_X}" cy="${MID_Y}" r="3" fill="black"/>`;
  svg += `<text x="${U1_INPUT_X - 6}" y="${MID_Y - 8}" text-anchor="end" font-size="12" font-weight="700" fill="#1e3a8a">V⁻</text>`;

  // U_1 OPAMP (triangle)
  svg += renderOpamp(U1_CX, MID_Y, "U_1");

  // U_1 output → V_o → R_4 → V⁻(U_2)
  svg += `<path d="M ${U1_CX + 30} ${MID_Y} L ${VO_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<circle cx="${VO_X}" cy="${MID_Y}" r="3" fill="black"/>`;
  svg += `<text x="${VO_X + 8}" y="${MID_Y - 8}" font-size="13" font-weight="700" fill="#dc2626">V_o</text>`;
  svg += `<path d="M ${VO_X} ${MID_Y} L ${R4_X - 18} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal(R4_X, MID_Y, d.R_4_label, "R_4");
  svg += `<path d="M ${R4_X + 18} ${MID_Y} L ${U2_INPUT_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<circle cx="${U2_INPUT_X}" cy="${MID_Y}" r="3" fill="black"/>`;
  svg += `<text x="${U2_INPUT_X - 6}" y="${MID_Y - 8}" text-anchor="end" font-size="12" font-weight="700" fill="#1e3a8a">V⁻</text>`;

  // U_2 OPAMP
  svg += renderOpamp(U2_CX, MID_Y, "U_2");

  // U_2 output → V_s
  svg += `<path d="M ${U2_CX + 30} ${MID_Y} L ${VS_LABEL_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<circle cx="${VS_X}" cy="${MID_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VS_LABEL_X + 8}" y="${MID_Y + 5}" font-size="14" font-weight="700" fill="#dc2626">V_s</text>`;

  // R_3 feedback (V⁻(U_1) → V_o)
  svg += `<path d="M ${U1_INPUT_X} ${MID_Y} L ${U1_INPUT_X} ${FB_Y} L ${(U1_INPUT_X + VO_X) / 2 - 18} ${FB_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal((U1_INPUT_X + VO_X) / 2, FB_Y, d.R_3_label, "R_3");
  svg += `<path d="M ${(U1_INPUT_X + VO_X) / 2 + 18} ${FB_Y} L ${VO_X} ${FB_Y} L ${VO_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;

  // R_5 feedback (V⁻(U_2) → V_s)
  svg += `<path d="M ${U2_INPUT_X} ${MID_Y} L ${U2_INPUT_X} ${FB_Y} L ${(U2_INPUT_X + VS_X) / 2 - 18} ${FB_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal((U2_INPUT_X + VS_X) / 2, FB_Y, d.R_5_label, "R_5");
  svg += `<path d="M ${(U2_INPUT_X + VS_X) / 2 + 18} ${FB_Y} L ${VS_X} ${FB_Y} L ${VS_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;

  // R_2 bias (V⁻(U_1) → GND)
  svg += `<path d="M ${U1_INPUT_X} ${MID_Y} L ${U1_INPUT_X} ${BIAS_Y - 18}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorVertical(U1_INPUT_X, BIAS_Y, d.R_2_label, "R_2");
  svg += `<path d="M ${U1_INPUT_X} ${BIAS_Y + 18} L ${U1_INPUT_X} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`;

  // R_6 bias (V⁻(U_2) → GND)
  svg += `<path d="M ${U2_INPUT_X} ${MID_Y} L ${U2_INPUT_X} ${BIAS_Y - 18}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorVertical(U2_INPUT_X, BIAS_Y, d.R_6_label, "R_6");
  svg += `<path d="M ${U2_INPUT_X} ${BIAS_Y + 18} L ${U2_INPUT_X} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`;

  // V⁺ → GND for both OPAMPs (vertical short stub)
  for (const cx of [U1_CX, U2_CX]) {
    const vpY = MID_Y + 12;
    svg += `<path d="M ${cx - 22} ${vpY} L ${cx - 22} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`;
    svg += `<circle cx="${cx - 22}" cy="${BOT_Y}" r="3" fill="black"/>`;
  }

  // Ground rail
  svg += `<path d="M ${VI_X} ${BOT_Y} L ${VS_X} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  for (const dx of [VI_X, U1_INPUT_X, U1_CX - 22, U2_INPUT_X, U2_CX - 22]) {
    svg += `<circle cx="${dx}" cy="${BOT_Y}" r="3" fill="black"/>`;
  }
  svg += renderGround(Math.round((VI_X + VS_X) / 2), BOT_Y);

  svg += `</svg>`;
  return svg;
}

// ─── 심볼 helpers ───────────────────────────────────────────
function defs(): string {
  return `<defs><marker id="opamp_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;
}

function renderAcSource(cx: number, topY: number, botY: number, label: string): string {
  const cy = (topY + botY) / 2;
  const r = 24;
  let svg = "";
  svg += `<path d="M ${cx} ${topY} L ${cx} ${cy - r}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="black" fill="white" stroke-width="2"/>`;
  // sine wave inside
  const sinPath = `M ${cx - 14} ${cy} Q ${cx - 7} ${cy - 8} ${cx} ${cy} T ${cx + 14} ${cy}`;
  svg += `<path d="${sinPath}" stroke="black" fill="none" stroke-width="1.5"/>`;
  svg += `<path d="M ${cx} ${cy + r} L ${cx} ${botY}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<text x="${cx - r - 6}" y="${cy + 5}" text-anchor="end" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  return svg;
}

function renderOpamp(cx: number, cy: number, label: string): string {
  // OPAMP triangle. cx = center x, cy = center y. width 60, height 60.
  let svg = "";
  // Triangle vertices: left-top (cx-30, cy-30), left-bottom (cx-30, cy+30), right-tip (cx+30, cy)
  svg += `<path d="M ${cx - 30} ${cy - 30} L ${cx - 30} ${cy + 30} L ${cx + 30} ${cy} Z" stroke="black" fill="white" stroke-width="2"/>`;
  // V⁻ at top-left (cy - 12), V⁺ at bottom-left (cy + 12)
  svg += `<text x="${cx - 24}" y="${cy - 9}" text-anchor="start" font-size="12" font-weight="700" fill="black">−</text>`;
  svg += `<text x="${cx - 24}" y="${cy + 17}" text-anchor="start" font-size="12" font-weight="700" fill="black">+</text>`;
  // label
  svg += `<text x="${cx - 4}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  return svg;
}

function renderResistorHorizontal(cx: number, cy: number, value: string, idLabel: string): string {
  const half = 18;
  const zigCount = 4;
  const step = (half * 2) / zigCount;
  let path = `M ${cx - half} ${cy}`;
  for (let i = 0; i < zigCount; i++) {
    const x = cx - half + step * (i + 0.5);
    const y = cy + (i % 2 === 0 ? -7 : 7);
    path += ` L ${x} ${y}`;
  }
  path += ` L ${cx + half} ${cy}`;
  let svg = `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(idLabel)}</text>`;
  svg += `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(value)}</text>`;
  return svg;
}

function renderResistorVertical(cx: number, cy: number, value: string, idLabel: string): string {
  const half = 18;
  const zigCount = 4;
  const step = (half * 2) / zigCount;
  let path = `M ${cx} ${cy - half}`;
  for (let i = 0; i < zigCount; i++) {
    const y = cy - half + step * (i + 0.5);
    const x = cx + (i % 2 === 0 ? 7 : -7);
    path += ` L ${x} ${y}`;
  }
  path += ` L ${cx} ${cy + half}`;
  let svg = `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${cx + 14}" y="${cy + 4}" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(idLabel)}</text>`;
  svg += `<text x="${cx + 14}" y="${cy + 18}" font-size="11" fill="#374151">${escapeSvg(value)}</text>`;
  return svg;
}

function renderGround(cx: number, y: number): string {
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
