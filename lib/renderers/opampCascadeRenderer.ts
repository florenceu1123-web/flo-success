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

const MID_Y = 180;                // 신호선 y (U_2 기준)
const U1_CY = MID_Y - 30;         // U_1 OPAMP 중심 y (U_2보다 위로) — 사용자 피드백
const FB_Y = 70;                  // feedback 상단 y (R_3, R_5)
const BIAS_Y = 290;               // bias R 하단 y
const BOT_Y = 340;                // GND rail

export function renderOpampCascade(d: OpampCascadeDiagram): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${KOREAN_FONT_STACK}">`;
  svg += defs();

  // V_i AC source (vertical, left)
  svg += renderAcSource(VI_X, MID_Y - 30, BOT_Y, d.V_i_label);

  // OPAMP 핀 좌표 — U_1은 U1_CY 기준, U_2는 MID_Y 기준
  const u1Pins = opampPins(U1_CX, U1_CY);
  const u2Pins = opampPins(U2_CX, MID_Y);

  // V_i top → R_1 → V⁻(U_1) pin (모두 U1_CY level — 평평하게)
  svg += `<path d="M ${VI_X} ${MID_Y - 30} L ${VI_X} ${U1_CY} L ${R1_X - 18} ${U1_CY}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal(R1_X, U1_CY, d.R_1_label, "R_1");
  svg += `<path d="M ${R1_X + 18} ${U1_CY} L ${u1Pins.vMinus.x} ${u1Pins.vMinus.y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<text x="${R1_X + 30}" y="${U1_CY - 6}" font-size="12" font-weight="700" fill="#1e3a8a">V⁻</text>`;

  // (V_i의 +측은 이미 R_1을 통해 V⁻에 연결됨. V_i의 -측은 GND rail 경유 — 별도 wire는
  //   아래의 글로벌 feedback wire의 V⁺ 측 leg에서 GND rail로 연결됨)

  // U_1 OPAMP (triangle + pins) at U1_CY
  svg += renderOpamp(U1_CX, U1_CY, "U_1");

  // U_1 output pin → V_o (U1_CY) → 수직 down to MID_Y → R_4 horizontal at MID_Y → V⁻(U_2) pin
  svg += `<path d="M ${u1Pins.output.x} ${u1Pins.output.y} L ${VO_X} ${U1_CY} L ${VO_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<circle cx="${VO_X}" cy="${U1_CY}" r="3" fill="black"/>`;
  svg += `<text x="${VO_X + 8}" y="${U1_CY - 8}" font-size="13" font-weight="700" fill="#dc2626">V_o</text>`;
  svg += `<path d="M ${VO_X} ${MID_Y} L ${R4_X - 18} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal(R4_X, MID_Y, d.R_4_label, "R_4");
  svg += `<path d="M ${R4_X + 18} ${MID_Y} L ${u2Pins.vMinus.x} ${u2Pins.vMinus.y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<text x="${R4_X + 30}" y="${MID_Y - 6}" font-size="12" font-weight="700" fill="#1e3a8a">V⁻</text>`;

  // U_2 OPAMP (triangle + pins) at MID_Y
  svg += renderOpamp(U2_CX, MID_Y, "U_2");

  // U_2 output pin → V_s
  svg += `<path d="M ${u2Pins.output.x} ${u2Pins.output.y} L ${VS_LABEL_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += `<circle cx="${VS_X}" cy="${MID_Y}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += `<text x="${VS_LABEL_X + 8}" y="${MID_Y + 5}" font-size="14" font-weight="700" fill="#dc2626">V_s</text>`;

  // R_3 feedback for U_1 (V⁻ pin → output pin, both at U1_CY)
  const FB_Y_U1 = FB_Y;  // 상단 feedback y
  svg += `<path d="M ${u1Pins.vMinus.x} ${u1Pins.vMinus.y} L ${u1Pins.vMinus.x} ${FB_Y_U1} L ${(u1Pins.vMinus.x + u1Pins.output.x) / 2 - 18} ${FB_Y_U1}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal((u1Pins.vMinus.x + u1Pins.output.x) / 2, FB_Y_U1, d.R_3_label, "R_3");
  svg += `<path d="M ${(u1Pins.vMinus.x + u1Pins.output.x) / 2 + 18} ${FB_Y_U1} L ${u1Pins.output.x} ${FB_Y_U1} L ${u1Pins.output.x} ${u1Pins.output.y}" stroke="black" stroke-width="2" fill="none"/>`;

  // R_5 feedback (V⁻ pin of U_2 → output pin of U_2)
  svg += `<path d="M ${u2Pins.vMinus.x} ${u2Pins.vMinus.y} L ${u2Pins.vMinus.x} ${FB_Y} L ${(u2Pins.vMinus.x + u2Pins.output.x) / 2 - 18} ${FB_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal((u2Pins.vMinus.x + u2Pins.output.x) / 2, FB_Y, d.R_5_label, "R_5");
  svg += `<path d="M ${(u2Pins.vMinus.x + u2Pins.output.x) / 2 + 18} ${FB_Y} L ${u2Pins.output.x} ${FB_Y} L ${u2Pins.output.x} ${u2Pins.output.y}" stroke="black" stroke-width="2" fill="none"/>`;

  // R_2, R_6 모두 원본에 없는 저항 (사용자 피드백) — 제거
  //   V⁻ node에 bias R 없음. 입력 = R_1, feedback = R_3 만.

  // ── 글로벌 피드백: V⁺(U_1) → R_2 → V_s ──
  //   path: V⁺ pin → DOWN to y=250 → RIGHT half → R_2 → RIGHT half → V_s
  //   ★ R_2의 좌측 leg 끝(= V⁺와 만나는 지점)에서 V_i의 - (V_i bottom = GND) 으로 추가 wire
  //     사용자 피드백 "R_2 leg의 끝부분과 U_1의 V+가 만나는 지점에서 V_i의 -로 이어주면돼"
  const GF_Y_DOWN = 250;
  const R2_X_NEW = (u1Pins.vPlus.x + VS_X) / 2;
  const R2_LEFT_X = R2_X_NEW - 18;
  // V+ pin DOWN → horizontal to R_2 left
  svg += `<path d="M ${u1Pins.vPlus.x} ${u1Pins.vPlus.y} L ${u1Pins.vPlus.x} ${GF_Y_DOWN} L ${R2_LEFT_X} ${GF_Y_DOWN}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderResistorHorizontal(R2_X_NEW, GF_Y_DOWN, d.R_2_label, "R_2");
  svg += `<path d="M ${R2_X_NEW + 18} ${GF_Y_DOWN} L ${VS_X} ${GF_Y_DOWN} L ${VS_X} ${MID_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  // 합류 node의 왼쪽 모서리 (V⁺ pin 수직선이 horizontal과 만나는 corner)에서 V_i 의 - (GND) 으로
  //   사용자 피드백: "그 node의 왼쪽 모서리 부분으로 연결지점을 옮겨봐봐"
  const NODE_LEFT_CORNER_X = u1Pins.vPlus.x;  // = 268 (V⁺ pin 위치)
  svg += `<circle cx="${NODE_LEFT_CORNER_X}" cy="${GF_Y_DOWN}" r="3" fill="black"/>`;
  svg += `<path d="M ${NODE_LEFT_CORNER_X} ${GF_Y_DOWN} L ${NODE_LEFT_CORNER_X} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`;

  // V⁺(U_2)에 독립적 GND 심볼 (사용자 피드백 "U_2 의 V+에는 그라운드를 독립적으로 달아줘")
  //   main GND rail 연결하지 않고 V⁺ pin 바로 아래 별도 ground triangle.
  const U2_GND_Y = u2Pins.vPlus.y + 30;
  svg += `<path d="M ${u2Pins.vPlus.x} ${u2Pins.vPlus.y} L ${u2Pins.vPlus.x} ${U2_GND_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  svg += renderGround(u2Pins.vPlus.x, U2_GND_Y);

  // GND 심볼 — V_i bottom에 독립, 합류 node down 지점에 독립 (사용자: rail 줄이기 + V_i bottom에 ground)
  svg += renderGround(VI_X, BOT_Y);                 // V_i bottom 독립 GND
  svg += renderGround(NODE_LEFT_CORNER_X, BOT_Y);   // V⁺(U_1)·R_2 합류 node down 독립 GND

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

/** OPAMP 핀 위치 — V⁻ pin은 signal flow Y와 동일 (R_4 ↔ V⁻ 평평하게). */
function opampPins(cx: number, cy: number): {
  vMinus: { x: number; y: number };
  vPlus: { x: number; y: number };
  output: { x: number; y: number };
} {
  return {
    vMinus: { x: cx - 42, y: cy },         // V⁻ pin = signal Y (사용자 피드백: R_4와 평평하게)
    vPlus: { x: cx - 42, y: cy + 22 },     // V⁺ pin 살짝 아래
    output: { x: cx + 42, y: cy },         // 출력 pin = signal Y
  };
}

function renderOpamp(cx: number, cy: number, label: string): string {
  // OPAMP triangle + pin stubs + pin dots.
  //   Triangle: (cx-30, cy-30) → (cx-30, cy+30) → (cx+30, cy)
  //   V⁻ pin: 좌측 (cx-30, cy)에서 leftward stub → dot at (cx-42, cy)  ← signal Y
  //   V⁺ pin: (cx-30, cy+22)에서 leftward stub → dot at (cx-42, cy+22)
  //   Output pin: tip (cx+30, cy)에서 rightward stub → dot at (cx+42, cy)
  let svg = "";
  svg += `<path d="M ${cx - 30} ${cy - 30} L ${cx - 30} ${cy + 30} L ${cx + 30} ${cy} Z" stroke="black" fill="white" stroke-width="2"/>`;
  // V⁻ pin stub + dot (at signal Y)
  svg += `<path d="M ${cx - 30} ${cy} L ${cx - 42} ${cy}" stroke="black" stroke-width="2"/>`;
  svg += `<circle cx="${cx - 42}" cy="${cy}" r="3" fill="black"/>`;
  // V⁺ pin stub + dot (slightly below)
  svg += `<path d="M ${cx - 30} ${cy + 22} L ${cx - 42} ${cy + 22}" stroke="black" stroke-width="2"/>`;
  svg += `<circle cx="${cx - 42}" cy="${cy + 22}" r="3" fill="black"/>`;
  // Output pin stub + dot
  svg += `<path d="M ${cx + 30} ${cy} L ${cx + 42} ${cy}" stroke="black" stroke-width="2"/>`;
  svg += `<circle cx="${cx + 42}" cy="${cy}" r="3" fill="black"/>`;
  // V⁻ V⁺ markers (inside triangle, aligned with pins)
  svg += `<text x="${cx - 24}" y="${cy + 3}" text-anchor="start" font-size="13" font-weight="700" fill="black">−</text>`;
  svg += `<text x="${cx - 24}" y="${cy + 27}" text-anchor="start" font-size="13" font-weight="700" fill="black">+</text>`;
  // label (위쪽)
  svg += `<text x="${cx}" y="${cy - 36}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
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
