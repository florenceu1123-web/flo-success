import type { CircuitComponent, CircuitNetlist } from "@/types";

/**
 * NMOS cascode current mirror 회로 전용 renderer (임용 10번 정확 재현).
 *
 * 3-leg layout:
 *   좌측 (reference):
 *     V_DD ━ R(학생 도출, 점선 박스) ━ M1.D=G(diode-connected) ━ M1.S ━ GND
 *   가운데 (M3 게이트 분압):
 *     V_DD ━ R_G1 ━ V_G3 ━ R_G2 ━ GND
 *   우측 (cascode 출력):
 *     V_DD ━ R_top ━ V_D3 ━ M3.D, M3.S=V_D2 ━ M2.D, M2.S ━ GND
 *     M2.G ←━ (수평 mirror wire) ━━ M1.G
 *
 *  3개 MOSFET — 단일 NMOS 전용 mosfetBiasCircuitRenderer로는 처리 불가.
 */

const V_DD_X = 80;
const LEFT_COL_X = 220;     // R, M1 column
const MID_COL_X = 400;      // R_G1, R_G2 column
const RIGHT_COL_X = 600;    // R_top, M3, M2 column

const TOP_Y = 60;            // top rail
// ★ M1·M2가 같은 y(400) — mirror wire가 짧은 horizontal 직선으로 자연스럽게 연결됨.
const M1_BODY_Y = 400;       // M1 channel 중심 (좌측 reference)
const M2_BODY_Y = 400;       // M2 channel 중심 (우측 mirror) — M1과 동일 row
const M3_BODY_Y = 250;       // M3 channel 중심 (우측 cascode, M2 위)
const R_MID_Y = 220;         // 좌측 R 중심 (R bottom → V_M1_top wire는 자연스러운 길이)
const RG1_MID_Y = 130;       // 가운데 R_G1 중심
const VG3_Y = 220;           // V_G3 분압점
const RG2_MID_Y = 310;       // 가운데 R_G2 중심
const RTOP_MID_Y = 120;      // 우측 R_top 중심
const VD3_Y = 200;           // M3.D 노드 (R_top bottom 직후)
const VS3_Y = 325;           // M3.S = M2.D 노드
const BOT_Y = 470;           // ground rail
const MIRROR_Y = 400;        // mirror wire y (M1·M2 body center와 동일)

const RES_HALF = 26;
const MOS_HALF = 30;         // MOSFET channel bar 절반

export function hasMosfetCascode(netlist: CircuitNetlist): boolean {
  const mos = (netlist.components ?? []).filter((c) =>
    ["MOSFET", "NMOS", "PMOS"].includes(String(c.type ?? "").toUpperCase()),
  );
  return mos.length >= 2;
}

export function renderMosfetCascodeMirrorCircuit(netlist: CircuitNetlist): string | null {
  const components = netlist.components ?? [];
  const M1 = components.find((c) => /^M1$/i.test(c.id ?? ""));
  const M2 = components.find((c) => /^M2$/i.test(c.id ?? ""));
  const M3 = components.find((c) => /^M3$/i.test(c.id ?? ""));
  if (!M1 || !M2 || !M3) return null;

  const vdd = components.find((c) => c.type === "V");
  const R = components.find((c) => c.id === "R");
  const R_G1 = components.find((c) => /R_?G1/i.test(c.id ?? ""));
  const R_G2 = components.find((c) => /R_?G2/i.test(c.id ?? ""));
  const R_top = components.find((c) => /R_?top/i.test(c.id ?? ""));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="540" viewBox="0 0 780 540">`;
  svg += `<defs><marker id="cas_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // ── Top rail ──────────────────────────────────────────────
  svg += `<path d="M ${V_DD_X} ${TOP_Y} L ${RIGHT_COL_X} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── V_DD 좌측 vertical (배터리) ───────────────────────────
  const vddCy = (TOP_Y + BOT_Y) / 2 - 30;
  const battTop = vddCy - 8, battBot = vddCy + 10;
  svg += `<path d="M ${V_DD_X} ${TOP_Y} L ${V_DD_X} ${battTop}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X} ${battBot} L ${V_DD_X} ${BOT_Y - 40}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${V_DD_X - 32}" y="${vddCy + 4}" text-anchor="middle" font-size="13" font-weight="600">${escapeSvg(vdd?.value ?? "V_DD")}</text>`;
  svg += `<text x="${V_DD_X - 32}" y="${vddCy + 20}" text-anchor="middle" font-size="11" fill="#666">(V_DD)</text>`;
  // 4-bar 배터리
  svg += `<path d="M ${V_DD_X - 10} ${vddCy - 8} L ${V_DD_X + 10} ${vddCy - 8}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X - 6} ${vddCy - 2} L ${V_DD_X + 6} ${vddCy - 2}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X - 10} ${vddCy + 4} L ${V_DD_X + 10} ${vddCy + 4}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X - 6} ${vddCy + 10} L ${V_DD_X + 6} ${vddCy + 10}" stroke="black" stroke-width="2"/>`;
  svg += `<path d="M ${V_DD_X} ${BOT_Y - 40} L ${V_DD_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderGroundSymbol(V_DD_X, BOT_Y);

  // ── Bottom rail (V_DD GND → 각 column GND 연결) ──────────
  svg += `<path d="M ${V_DD_X} ${BOT_Y} L ${RIGHT_COL_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="1.5"/>`;

  // ─────────────────────────── 좌측 column (reference) ───────────
  // R (학생 도출, 점선 박스 강조): TOP_Y → V_M1_top (= M1.D=G 노드)
  const V_M1_top_Y = M1_BODY_Y - MOS_HALF;
  if (R) {
    svg += `<path d="M ${LEFT_COL_X} ${TOP_Y} L ${LEFT_COL_X} ${R_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(LEFT_COL_X, R_MID_Y);
    svg += `<path d="M ${LEFT_COL_X} ${R_MID_Y + RES_HALF} L ${LEFT_COL_X} ${V_M1_top_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    // R placeholder 점선 박스
    svg += `<rect x="${LEFT_COL_X - 28}" y="${R_MID_Y - RES_HALF - 8}" width="56" height="${RES_HALF * 2 + 16}" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    svg += `<text x="${LEFT_COL_X + 38}" y="${R_MID_Y + 4}" font-size="13" font-weight="700" fill="#7c3aed">R</text>`;
    svg += `<text x="${LEFT_COL_X + 38}" y="${R_MID_Y + 20}" font-size="10" fill="#666">(?)</text>`;
  }
  // V_GS1 측정 마크 (R 좌측에 +/- 표시)
  svg += `<text x="${LEFT_COL_X - 44}" y="${V_M1_top_Y - 4}" font-size="11" font-weight="600" fill="#1e3a8a">+</text>`;
  svg += `<text x="${LEFT_COL_X - 44}" y="${(V_M1_top_Y + BOT_Y) / 2}" font-size="11" font-weight="600" fill="#1e3a8a">V_GS1</text>`;
  svg += `<text x="${LEFT_COL_X - 44}" y="${BOT_Y - 4}" font-size="11" font-weight="600" fill="#1e3a8a">−</text>`;

  // I_ref 화살표 (R 우측)
  svg += `<path d="M ${LEFT_COL_X + 70} ${R_MID_Y - 18} L ${LEFT_COL_X + 70} ${R_MID_Y + 18}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#cas_arrow)"/>`;
  svg += `<text x="${LEFT_COL_X + 76}" y="${R_MID_Y + 4}" font-size="11" font-weight="600">I_ref</text>`;

  // M1 (diode-connected) — channel bar + gate plate (좌측), gate-drain short wire (위쪽 우회)
  const m1ChannelX = LEFT_COL_X + 10;
  const m1GatePlateX = LEFT_COL_X - 4;
  const m1DrainY = M1_BODY_Y - MOS_HALF;
  const m1SourceY = M1_BODY_Y + MOS_HALF;
  // drain wire: V_M1_top → M1 channel top
  svg += `<path d="M ${LEFT_COL_X} ${V_M1_top_Y} L ${m1ChannelX} ${m1DrainY}" stroke="black" fill="none" stroke-width="2"/>`;
  // channel bar
  svg += `<path d="M ${m1ChannelX} ${m1DrainY} L ${m1ChannelX} ${m1SourceY}" stroke="black" fill="none" stroke-width="3"/>`;
  // gate plate (좌측 gap)
  svg += `<path d="M ${m1GatePlateX} ${m1DrainY + 4} L ${m1GatePlateX} ${m1SourceY - 4}" stroke="black" fill="none" stroke-width="2"/>`;
  // gate-drain short (diode-connected): gate plate → 좌측 → 위로 → V_M1_top dot까지
  // V_M1_top과 정확히 같은 y에서 만나도록 wire 끝을 V_M1_top_Y로.
  svg += `<path d="M ${m1GatePlateX} ${M1_BODY_Y} L ${m1GatePlateX - 20} ${M1_BODY_Y} L ${m1GatePlateX - 20} ${V_M1_top_Y} L ${LEFT_COL_X} ${V_M1_top_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // V_M1_top junction dot (R bottom + diode short + drain wire 만나는 지점)
  svg += `<circle cx="${LEFT_COL_X}" cy="${V_M1_top_Y}" r="3" fill="black"/>`;
  // M1 label
  svg += `<text x="${m1ChannelX + 16}" y="${M1_BODY_Y + 4}" font-size="12" font-weight="600" fill="#1e3a8a">M1</text>`;
  svg += `<text x="${m1ChannelX + 4}" y="${m1DrainY - 4}" font-size="10" fill="#666">D</text>`;
  svg += `<text x="${m1ChannelX + 4}" y="${m1SourceY + 12}" font-size="10" fill="#666">S</text>`;
  svg += `<text x="${m1GatePlateX - 12}" y="${M1_BODY_Y - 4}" font-size="10" fill="#666">G</text>`;
  // M1 NMOS 화살표 (source 안쪽)
  svg += `<path d="M ${m1ChannelX + 10} ${m1SourceY - 5} L ${m1ChannelX + 3} ${m1SourceY - 5}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#cas_arrow)"/>`;
  // M1 source → GND
  svg += `<path d="M ${m1ChannelX} ${m1SourceY} L ${m1ChannelX} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ─────────────────────────── 가운데 column (분압) ──────────────
  // R_G1: top → V_G3
  if (R_G1) {
    svg += `<path d="M ${MID_COL_X} ${TOP_Y} L ${MID_COL_X} ${RG1_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(MID_COL_X, RG1_MID_Y);
    svg += `<path d="M ${MID_COL_X} ${RG1_MID_Y + RES_HALF} L ${MID_COL_X} ${VG3_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${MID_COL_X + 14}" y="${RG1_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">R_G1</text>`;
    svg += `<text x="${MID_COL_X + 14}" y="${RG1_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(String(R_G1.value ?? ""))}</text>`;
  }
  // V_G3 dot + 라벨
  svg += `<circle cx="${MID_COL_X}" cy="${VG3_Y}" r="3" fill="black"/>`;
  svg += `<text x="${MID_COL_X - 8}" y="${VG3_Y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#dc2626">V_G3</text>`;
  // R_G2: V_G3 → GND
  if (R_G2) {
    svg += `<path d="M ${MID_COL_X} ${VG3_Y} L ${MID_COL_X} ${RG2_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(MID_COL_X, RG2_MID_Y);
    svg += `<path d="M ${MID_COL_X} ${RG2_MID_Y + RES_HALF} L ${MID_COL_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${MID_COL_X + 14}" y="${RG2_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">R_G2</text>`;
    svg += `<text x="${MID_COL_X + 14}" y="${RG2_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(String(R_G2.value ?? ""))}</text>`;
  }

  // ─────────────────────────── 우측 column (cascode 출력) ─────────
  // R_top: top → V_D3
  if (R_top) {
    svg += `<path d="M ${RIGHT_COL_X} ${TOP_Y} L ${RIGHT_COL_X} ${RTOP_MID_Y - RES_HALF}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderResistorVertical(RIGHT_COL_X, RTOP_MID_Y);
    svg += `<path d="M ${RIGHT_COL_X} ${RTOP_MID_Y + RES_HALF} L ${RIGHT_COL_X} ${VD3_Y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<text x="${RIGHT_COL_X + 14}" y="${RTOP_MID_Y - 2}" font-size="12" font-weight="700" fill="#1e3a8a">R_top</text>`;
    svg += `<text x="${RIGHT_COL_X + 14}" y="${RTOP_MID_Y + 14}" font-size="11" fill="#374151">${escapeSvg(String(R_top.value ?? ""))}</text>`;
  }
  // V_D3 dot + 출력 단자
  svg += `<circle cx="${RIGHT_COL_X}" cy="${VD3_Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${RIGHT_COL_X + 70}" cy="${VD3_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<path d="M ${RIGHT_COL_X} ${VD3_Y} L ${RIGHT_COL_X + 70} ${VD3_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${RIGHT_COL_X + 78}" y="${VD3_Y + 4}" font-size="13" font-weight="700" fill="#dc2626">V_D3</text>`;

  // M3 cascode — V_D3 → M3.D, M3.S → V_S3
  const m3ChannelX = RIGHT_COL_X + 10;
  const m3GatePlateX = RIGHT_COL_X - 4;
  const m3DrainY = M3_BODY_Y - MOS_HALF;
  const m3SourceY = M3_BODY_Y + MOS_HALF;
  svg += `<path d="M ${RIGHT_COL_X} ${VD3_Y} L ${RIGHT_COL_X} ${m3DrainY} L ${m3ChannelX} ${m3DrainY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${m3ChannelX} ${m3DrainY} L ${m3ChannelX} ${m3SourceY}" stroke="black" fill="none" stroke-width="3"/>`;
  svg += `<path d="M ${m3GatePlateX} ${m3DrainY + 4} L ${m3GatePlateX} ${m3SourceY - 4}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${m3ChannelX + 16}" y="${M3_BODY_Y + 4}" font-size="12" font-weight="600" fill="#1e3a8a">M3</text>`;
  svg += `<text x="${m3ChannelX + 4}" y="${m3DrainY - 4}" font-size="10" fill="#666">D</text>`;
  svg += `<text x="${m3ChannelX + 4}" y="${m3SourceY + 12}" font-size="10" fill="#666">S</text>`;
  svg += `<text x="${m3GatePlateX - 12}" y="${M3_BODY_Y - 4}" font-size="10" fill="#666">G</text>`;
  svg += `<path d="M ${m3ChannelX + 10} ${m3SourceY - 5} L ${m3ChannelX + 3} ${m3SourceY - 5}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#cas_arrow)"/>`;
  // M3.G ← V_G3 (가운데 column에서 우측 column으로 horizontal wire)
  svg += `<path d="M ${MID_COL_X} ${VG3_Y} L ${MID_COL_X} ${M3_BODY_Y} L ${m3GatePlateX} ${M3_BODY_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${MID_COL_X}" cy="${M3_BODY_Y}" r="2.5" fill="black"/>`;

  // V_S3 = M3.S = M2.D node
  svg += `<path d="M ${m3ChannelX} ${m3SourceY} L ${m3ChannelX} ${VS3_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${m3ChannelX}" cy="${VS3_Y}" r="3" fill="black"/>`;
  svg += `<text x="${m3ChannelX + 12}" y="${VS3_Y + 4}" font-size="11" font-weight="700" fill="#dc2626">V_S3 = V_D2</text>`;

  // M2 mirror — V_S3 → M2.D, M2.S → GND
  const m2ChannelX = m3ChannelX;
  const m2GatePlateX = m3GatePlateX;
  const m2DrainY = M2_BODY_Y - MOS_HALF;
  const m2SourceY = M2_BODY_Y + MOS_HALF;
  svg += `<path d="M ${m2ChannelX} ${VS3_Y} L ${m2ChannelX} ${m2DrainY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<path d="M ${m2ChannelX} ${m2DrainY} L ${m2ChannelX} ${m2SourceY}" stroke="black" fill="none" stroke-width="3"/>`;
  svg += `<path d="M ${m2GatePlateX} ${m2DrainY + 4} L ${m2GatePlateX} ${m2SourceY - 4}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${m2ChannelX + 16}" y="${M2_BODY_Y + 4}" font-size="12" font-weight="600" fill="#1e3a8a">M2</text>`;
  svg += `<text x="${m2ChannelX + 4}" y="${m2DrainY - 4}" font-size="10" fill="#666">D</text>`;
  svg += `<text x="${m2ChannelX + 4}" y="${m2SourceY + 12}" font-size="10" fill="#666">S</text>`;
  svg += `<text x="${m2GatePlateX - 12}" y="${M2_BODY_Y - 4}" font-size="10" fill="#666">G</text>`;
  svg += `<path d="M ${m2ChannelX + 10} ${m2SourceY - 5} L ${m2ChannelX + 3} ${m2SourceY - 5}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#cas_arrow)"/>`;
  // M2.S → GND
  svg += `<path d="M ${m2ChannelX} ${m2SourceY} L ${m2ChannelX} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;

  // ── Mirror wire: M1.G ━→ M2.G (M1·M2 같은 row이므로 horizontal 직선) ─
  // 두 gate plate가 모두 y=MIRROR_Y에 위치. wire는 한 줄로 좌→우 직선.
  // 가운데 column R_G2 vertical wire(MID_COL_X, VG3_Y~BOT_Y)와 (MID_COL_X, MIRROR_Y)에서 cross —
  // 두 wire의 색·style이 다르므로(검정 solid vs 보라 dashed) 시각적으로 분리됨. dot 없음 = 연결 안 됨.
  svg += `<path d="M ${m1GatePlateX} ${MIRROR_Y} L ${m2GatePlateX} ${MIRROR_Y}" stroke="#7c3aed" fill="none" stroke-width="1.8" stroke-dasharray="5 3"/>`;
  // 라벨: mirror wire 위쪽
  svg += `<text x="${(m1GatePlateX + m2GatePlateX) / 2}" y="${MIRROR_Y - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="#7c3aed">M2.G = M1.G (mirror)</text>`;

  // 종합 GND symbols (column별 하단)
  svg += renderGroundSymbol(m1ChannelX, BOT_Y);
  svg += renderGroundSymbol(MID_COL_X, BOT_Y);
  svg += renderGroundSymbol(m2ChannelX, BOT_Y);

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
