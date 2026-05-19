import type { MixedCircuitDiagram } from "@/types";

/**
 * 복합형 회로 renderer — counter_dac_comparator (임용 8번) 전용 single-pass layout.
 *
 * 원본 임용 8번 layout 재현:
 *   상단:  V_CC → 2kΩ → 3kΩ → V_REF leg → OPAMP(비교기) → V_o
 *          + R-2R 사다리망 (3kΩ·1.5kΩ·3kΩ 수평 + 3kΩ vertical legs to GND)
 *   하단:  JK_A → JK_B 수평 직렬, V_CC가 J_A·K_A에, Q_A → J_B·K_B
 *   하단 사다리망의 vertical legs는 FF의 Q_A·Q_A_bar·Q_B·Q_B_bar로 내려옴
 *   좌하단: 클럭 입력
 */

const W = 1100;
const H = 720;

// 상단 OPAMP·사다리망 좌표
const TOP_RAIL_Y = 40;        // V_CC top rail (분압 horizontal 위쪽)
const GND_RAIL_Y = 220;       // 사다리망 vertical legs의 GND
const LADDER_Y = 160;         // 사다리망 horizontal rail
// V_REF 분압 horizontal layout (OPAMP 위쪽): V_CC dot - 2kΩ horizontal - V_REF junction - 3kΩ horizontal - GND
const VREF_DIV_Y = 65;        // 분압 horizontal rail y (OPAMP body top과 충분 여유)
const VREF_VCC_X = 800;       // V_CC dot x (OPAMP 위쪽)
const VREF_R1_CX = 740;       // 2kΩ horizontal cx
const VREF_JUNCTION_X = 680;  // V_REF junction x (R1과 R2 사이)
const VREF_R2_CX = 620;       // 3kΩ horizontal cx
const VREF_GND_X = 560;       // GND symbol x
const VPLUS_LEG_X = 580;      // V+ leg column (사다리망 우측 끝)
// 사다리망 4 노드 (좌→우): n3, n2, n1 (top), 그리고 V+. 다만 R-2R는 4-bit이지만 우리 2-bit이므로 단순화.
// 임용 8번 원본: 4 R 노드 (Q_A_bar, Q_A, Q_B_bar, Q_B 각각). 우리는 2-bit이라 2 R + 2 R = 4 R column.
const LAD_NODE_XS = [180, 320, 460, 600]; // 4 사다리망 노드 column (Q_B_bar, Q_B, Q_A_bar, Q_A 또는 비슷)

// OPAMP 본체 — V+ pin y(OPAMP_Y_BOT - 25)를 LADDER_Y(160)과 정렬해서 V+ wire가 horizontal
const OPAMP_X = 800;
const OPAMP_Y_BOT = 185;     // V+ pin y = 185 - 25 = 160 (LADDER_Y와 정렬)
const OPAMP_Y_TOP = 85;      // height 100. V- pin y = 85 + 25 = 110
const VO_X = 1040;

// FF 영역 (하단)
const FF_ROW_Y = 480;
const JK_W = 120;
const JK_H = 140;
const JKA_X = 240;
const JKB_X = 480;
const VCC_FF_X = 100;          // V_CC dot (FF J_A·K_A 공급)
const CLK_RAIL_Y = 660;        // 클럭 rail (FF 하단)
const CLK_X = 60;

export function renderMixedCircuitSVG(diagram: MixedCircuitDiagram): string {
  // diagram에서 JK 개수 추출 → 3-bit 케이스는 별도 분기.
  const jkCount = (diagram.logic?.gates ?? []).filter((g) => g.type === "JKFF").length;
  if (jkCount >= 3) {
    return renderMixedCircuit3bit(diagram);
  }
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // ─── 상단: V_CC + 2k + V_REF junction + 3k + GND (horizontal 분압기) + OPAMP V− ──
  //   V_CC top → vertical down → 분압 rail (y=VREF_DIV_Y)
  //   분압 rail (가로): V_CC_X · 2kΩ · V_REF junction · 3kΩ · GND
  //   V_REF junction → vertical down → OPAMP V−
  // V_CC top dot + label
  svg += dot(VREF_VCC_X, TOP_RAIL_Y);
  svg += label(VREF_VCC_X + 8, TOP_RAIL_Y + 4, "V_CC", "start", "#000", 12);
  // V_CC top → 분압 rail vertical
  svg += wire(VREF_VCC_X, TOP_RAIL_Y, VREF_VCC_X, VREF_DIV_Y);
  // R1 (2kΩ) horizontal: V_CC_X → V_REF junction
  svg += rZigzagH(VREF_R1_CX, VREF_DIV_Y);
  svg += wire(VREF_VCC_X, VREF_DIV_Y, VREF_R1_CX + 28, VREF_DIV_Y);
  svg += wire(VREF_R1_CX - 28, VREF_DIV_Y, VREF_JUNCTION_X, VREF_DIV_Y);
  svg += label(VREF_R1_CX, VREF_DIV_Y - 12, "2kΩ", "middle", "#374151", 12);
  // V_REF junction dot + label
  svg += dot(VREF_JUNCTION_X, VREF_DIV_Y);
  svg += label(VREF_JUNCTION_X, VREF_DIV_Y - 12, "V_REF", "middle", "#1e3a8a", 11);
  // V_REF junction → OPAMP V− (vertical down + horizontal)
  svg += wire(VREF_JUNCTION_X, VREF_DIV_Y, VREF_JUNCTION_X, OPAMP_Y_TOP + 25);
  svg += wire(VREF_JUNCTION_X, OPAMP_Y_TOP + 25, OPAMP_X, OPAMP_Y_TOP + 25);
  // R2 (3kΩ) horizontal: V_REF junction → GND
  svg += rZigzagH(VREF_R2_CX, VREF_DIV_Y);
  svg += wire(VREF_JUNCTION_X, VREF_DIV_Y, VREF_R2_CX + 28, VREF_DIV_Y);
  svg += wire(VREF_R2_CX - 28, VREF_DIV_Y, VREF_GND_X, VREF_DIV_Y);
  svg += label(VREF_R2_CX, VREF_DIV_Y - 12, "3kΩ", "middle", "#374151", 12);
  // GND symbol (분압 좌측 끝, vertical down)
  svg += wire(VREF_GND_X, VREF_DIV_Y, VREF_GND_X, VREF_DIV_Y + 20);
  svg += groundSymbol(VREF_GND_X, VREF_DIV_Y + 20);

  // ─── R-2R 사다리망 (상단 horizontal + vertical GND legs) ────
  // horizontal R: 3kΩ, 1.5kΩ, 3kΩ (사다리망 상단)
  const ladderRails = [
    { from: LAD_NODE_XS[0], to: LAD_NODE_XS[1], value: "3kΩ" },
    { from: LAD_NODE_XS[1], to: LAD_NODE_XS[2], value: "1.5kΩ" },
    { from: LAD_NODE_XS[2], to: LAD_NODE_XS[3], value: "3kΩ" },
  ];
  for (const r of ladderRails) {
    const cx = (r.from + r.to) / 2;
    svg += rZigzagH(cx, LADDER_Y);
    svg += wire(r.from, LADDER_Y, cx - 28, LADDER_Y);
    svg += wire(cx + 28, LADDER_Y, r.to, LADDER_Y);
    svg += label(cx, LADDER_Y - 12, r.value, "middle", "#374151", 11);
  }
  // 4개 vertical leg (Q outputs로 내려감) — 단, 사다리망 좌측 첫 leg는 GND. 우측은 V+.
  // 임용 8번 원본: 4 노드 중 좌측 첫 leg는 GND, 나머지 3 노드는 각각 vertical R(3kΩ) → 아래로
  // 단순화: 모든 노드에 vertical R(3kΩ) 내려감. 좌측 첫 leg는 GND, 우측 3 노드는 FF.Q로.
  // GND leg (좌측)
  svg += rZigzagV(LAD_NODE_XS[0], (LADDER_Y + GND_RAIL_Y) / 2);
  svg += wire(LAD_NODE_XS[0], LADDER_Y, LAD_NODE_XS[0], (LADDER_Y + GND_RAIL_Y) / 2 - 28);
  svg += wire(LAD_NODE_XS[0], (LADDER_Y + GND_RAIL_Y) / 2 + 28, LAD_NODE_XS[0], GND_RAIL_Y);
  svg += label(LAD_NODE_XS[0] + 16, (LADDER_Y + GND_RAIL_Y) / 2 - 4, "3kΩ", "start", "#374151", 11);
  svg += groundSymbol(LAD_NODE_XS[0], GND_RAIL_Y);
  // 우측 3 노드는 FF로 (아래쪽 hangs) — 사다리망 노드에서 vertical R → FF.Q로
  // 우리는 2-bit이라 단순화: LAD_NODE_XS[1], [2], [3]에 각각 vertical R, 아래로 wire가 FF Q outputs로.
  // V+ leg (우측 끝): LAD_NODE_XS[3] 위치, V_PLUS_node로
  svg += wire(LAD_NODE_XS[3], LADDER_Y, OPAMP_X, OPAMP_Y_BOT - 25);
  svg += label(LAD_NODE_XS[3] + 8, LADDER_Y - 6, "V+", "start", "#1e3a8a", 11);

  // vertical R legs for digital inputs (Q_A·Q_B를 사다리망 vertical legs로 연결)
  //   LAD_NODE_XS[1] → Q_A (JK_A.Q에서 vertical wire)
  //   LAD_NODE_XS[2] → Q_B (JK_B.Q에서 vertical wire)
  const digitalLabels = ["Q_A", "Q_B"];
  const digitalSources = [LAD_NODE_XS[1], LAD_NODE_XS[2]];
  for (let i = 0; i < digitalSources.length; i++) {
    const xc = digitalSources[i];
    const ry = (LADDER_Y + GND_RAIL_Y + 40) / 2;
    svg += rZigzagV(xc, ry);
    svg += wire(xc, LADDER_Y, xc, ry - 28);
    svg += wire(xc, ry + 28, xc, GND_RAIL_Y + 40);
    svg += label(xc + 16, ry - 4, "3kΩ", "start", "#374151", 11);
    svg += dot(xc, GND_RAIL_Y + 40);
    svg += label(xc + 8, GND_RAIL_Y + 36, digitalLabels[i], "start", "#1e3a8a", 11);
  }

  // V+ wire to OPAMP V+
  svg += wire(OPAMP_X, OPAMP_Y_BOT - 25, OPAMP_X, OPAMP_Y_BOT - 25);

  // ─── OPAMP (비교기) ────────────────────────────────────────
  svg += opampTriangle(OPAMP_X, OPAMP_Y_TOP, OPAMP_Y_BOT);
  svg += label(OPAMP_X + 10, OPAMP_Y_TOP + 28, "−", "start", "#000", 16);
  svg += label(OPAMP_X + 10, OPAMP_Y_BOT - 22, "+", "start", "#000", 16);
  svg += label(OPAMP_X + 50, OPAMP_Y_TOP - 6, "U1", "middle", "#1e3a8a", 11);
  // V_o output
  const opampOutX = OPAMP_X + 100;
  const opampOutY = (OPAMP_Y_TOP + OPAMP_Y_BOT) / 2;
  svg += wire(opampOutX, opampOutY, VO_X, opampOutY);
  svg += `<circle cx="${VO_X}" cy="${opampOutY}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += label(VO_X + 12, opampOutY + 4, "V_o", "start", "#dc2626", 14);

  // ─── 하단: JK_A → JK_B 수평 직렬 + V_CC + CLK ──────────────
  // V_CC dot (FF J_A·K_A 공급)
  svg += dot(VCC_FF_X, FF_ROW_Y + 30);
  svg += label(VCC_FF_X - 8, FF_ROW_Y + 34, "V_CC", "end", "#000", 12);
  // V_CC wire → JK_A J·K stub
  const jkaJpinY = FF_ROW_Y + 30;
  const jkaKpinY = FF_ROW_Y + JK_H - 30;
  svg += wire(VCC_FF_X, jkaJpinY, JKA_X - 12, jkaJpinY); // stub end로
  // V_CC 분기: K 입력
  svg += wire(VCC_FF_X + 60, jkaJpinY, VCC_FF_X + 60, jkaKpinY);
  svg += wire(VCC_FF_X + 60, jkaKpinY, JKA_X - 12, jkaKpinY); // stub end로
  svg += dot(VCC_FF_X + 60, jkaJpinY);

  // JK_A
  svg += jkBox(JKA_X, FF_ROW_Y, JK_W, JK_H, "JK_A");
  // JK_A.Q (stub end at JKA_X + JK_W + 12) → JK_B.J·K stub + 사다리망 LAD_NODE_XS[1]
  const jkaQ_X = JKA_X + JK_W + 12; // Q stub end
  const jkaQ_Y = FF_ROW_Y + 30; // Q pin y = J pin y (horizontal wire 정렬)
  // JK_A.Q stub end → JK_B.J stub end
  svg += wire(jkaQ_X, jkaQ_Y, JKB_X - 12, FF_ROW_Y + 30);
  // K 분기 (JK_B K stub end로)
  svg += wire(jkaQ_X + 40, jkaQ_Y, jkaQ_X + 40, FF_ROW_Y + JK_H - 30);
  svg += wire(jkaQ_X + 40, FF_ROW_Y + JK_H - 30, JKB_X - 12, FF_ROW_Y + JK_H - 30);
  svg += dot(jkaQ_X + 40, jkaQ_Y);
  svg += label(jkaQ_X + 20, jkaQ_Y - 8, "Q_A", "middle", "#1e3a8a", 11);
  // Q_A → 사다리망 LAD_NODE_XS[1] (vertical up)
  svg += wire(jkaQ_X, jkaQ_Y, jkaQ_X, GND_RAIL_Y + 60);
  svg += wire(jkaQ_X, GND_RAIL_Y + 60, LAD_NODE_XS[1], GND_RAIL_Y + 60);
  svg += wire(LAD_NODE_XS[1], GND_RAIL_Y + 60, LAD_NODE_XS[1], GND_RAIL_Y + 40);
  svg += dot(jkaQ_X, jkaQ_Y);

  // JK_B
  svg += jkBox(JKB_X, FF_ROW_Y, JK_W, JK_H, "JK_B");
  // JK_B.Q (stub end at JKB_X + JK_W + 12) → 사다리망 LAD_NODE_XS[2] (Q_B)
  const jkbQ_X = JKB_X + JK_W + 12;
  const jkbQ_Y = FF_ROW_Y + 30;
  svg += wire(jkbQ_X, jkbQ_Y, LAD_NODE_XS[2], jkbQ_Y);
  svg += wire(LAD_NODE_XS[2], jkbQ_Y, LAD_NODE_XS[2], GND_RAIL_Y + 40);
  svg += dot(LAD_NODE_XS[2], GND_RAIL_Y + 40);

  // CLK rail (좌하단) → JK_A·JK_B ▷ stub end로 (박스 좌측 외부)
  svg += dot(CLK_X, CLK_RAIL_Y);
  svg += label(CLK_X - 8, CLK_RAIL_Y + 4, "클럭", "end", "#000", 12);
  // CLK 메인 rail (CLK_X → JK_B ▷ stub end x)
  const ffClkY = FF_ROW_Y + JK_H - 6; // ▷ stub y
  const jkaClkStubX = JKA_X - 12;
  const jkbClkStubX = JKB_X - 12;
  // CLK rail horizontal (좌하단)
  svg += wire(CLK_X, CLK_RAIL_Y, jkbClkStubX, CLK_RAIL_Y);
  // JK_A ▷ 분기: CLK rail에서 vertical up to ▷ stub y
  svg += wire(jkaClkStubX, CLK_RAIL_Y, jkaClkStubX, ffClkY);
  svg += dot(jkaClkStubX, CLK_RAIL_Y);
  // JK_B ▷ 분기
  svg += wire(jkbClkStubX, CLK_RAIL_Y, jkbClkStubX, ffClkY);
  svg += dot(jkbClkStubX, CLK_RAIL_Y);

  svg += `</svg>`;
  return svg;
}

// ─── 3-bit 변형 layout (JK_A·JK_B·JK_C + R-2R 사다리 5 노드) ───
function renderMixedCircuit3bit(_diagram: MixedCircuitDiagram): string {
  const W3 = 1300;
  const H3 = 760;
  // 3-bit: 5 노드 사다리망 (GND + Q_A + Q_B + Q_C + V+)
  const LAD_NODE_XS_3 = [180, 320, 460, 600, 740];
  const VPLUS_X_3 = 740;
  const OPAMP_X_3 = 940;
  const VO_X_3 = 1180;
  // 3 JK 박스 가로 배치
  const JKA_X_3 = 240;
  const JKB_X_3 = 480;
  const JKC_X_3 = 720;
  const VCC_FF_X_3 = 100;
  // V_REF 분압 (OPAMP 위쪽) — 우측 끝 위로 옮김
  const VREF_VCC_X_3 = 940;
  const VREF_R1_CX_3 = 880;
  const VREF_JUNCTION_X_3 = 820;
  const VREF_R2_CX_3 = 760;
  const VREF_GND_X_3 = 700;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W3}" height="${H3}" viewBox="0 0 ${W3} ${H3}">`;

  // V_REF 분압 + OPAMP V−
  svg += dot(VREF_VCC_X_3, TOP_RAIL_Y);
  svg += label(VREF_VCC_X_3 + 8, TOP_RAIL_Y + 4, "V_CC", "start", "#000", 12);
  svg += wire(VREF_VCC_X_3, TOP_RAIL_Y, VREF_VCC_X_3, VREF_DIV_Y);
  svg += rZigzagH(VREF_R1_CX_3, VREF_DIV_Y);
  svg += wire(VREF_VCC_X_3, VREF_DIV_Y, VREF_R1_CX_3 + 28, VREF_DIV_Y);
  svg += wire(VREF_R1_CX_3 - 28, VREF_DIV_Y, VREF_JUNCTION_X_3, VREF_DIV_Y);
  svg += label(VREF_R1_CX_3, VREF_DIV_Y - 12, "2kΩ", "middle", "#374151", 12);
  svg += dot(VREF_JUNCTION_X_3, VREF_DIV_Y);
  svg += label(VREF_JUNCTION_X_3, VREF_DIV_Y - 12, "V_REF", "middle", "#1e3a8a", 11);
  svg += wire(VREF_JUNCTION_X_3, VREF_DIV_Y, VREF_JUNCTION_X_3, OPAMP_Y_TOP + 25);
  svg += wire(VREF_JUNCTION_X_3, OPAMP_Y_TOP + 25, OPAMP_X_3, OPAMP_Y_TOP + 25);
  svg += rZigzagH(VREF_R2_CX_3, VREF_DIV_Y);
  svg += wire(VREF_JUNCTION_X_3, VREF_DIV_Y, VREF_R2_CX_3 + 28, VREF_DIV_Y);
  svg += wire(VREF_R2_CX_3 - 28, VREF_DIV_Y, VREF_GND_X_3, VREF_DIV_Y);
  svg += label(VREF_R2_CX_3, VREF_DIV_Y - 12, "3kΩ", "middle", "#374151", 12);
  svg += wire(VREF_GND_X_3, VREF_DIV_Y, VREF_GND_X_3, VREF_DIV_Y + 20);
  svg += groundSymbol(VREF_GND_X_3, VREF_DIV_Y + 20);

  // R-2R 사다리 horizontal: 4 R (3kΩ + 1.5kΩ + 1.5kΩ + 3kΩ)
  const ladderRails3 = [
    { from: LAD_NODE_XS_3[0], to: LAD_NODE_XS_3[1], value: "3kΩ" },
    { from: LAD_NODE_XS_3[1], to: LAD_NODE_XS_3[2], value: "1.5kΩ" },
    { from: LAD_NODE_XS_3[2], to: LAD_NODE_XS_3[3], value: "1.5kΩ" },
    { from: LAD_NODE_XS_3[3], to: LAD_NODE_XS_3[4], value: "3kΩ" },
  ];
  for (const r of ladderRails3) {
    const cx = (r.from + r.to) / 2;
    svg += rZigzagH(cx, LADDER_Y);
    svg += wire(r.from, LADDER_Y, cx - 28, LADDER_Y);
    svg += wire(cx + 28, LADDER_Y, r.to, LADDER_Y);
    svg += label(cx, LADDER_Y - 12, r.value, "middle", "#374151", 11);
  }
  // 좌측 첫 leg → GND (3kΩ vertical)
  svg += rZigzagV(LAD_NODE_XS_3[0], (LADDER_Y + GND_RAIL_Y) / 2);
  svg += wire(LAD_NODE_XS_3[0], LADDER_Y, LAD_NODE_XS_3[0], (LADDER_Y + GND_RAIL_Y) / 2 - 28);
  svg += wire(LAD_NODE_XS_3[0], (LADDER_Y + GND_RAIL_Y) / 2 + 28, LAD_NODE_XS_3[0], GND_RAIL_Y);
  svg += label(LAD_NODE_XS_3[0] + 16, (LADDER_Y + GND_RAIL_Y) / 2 - 4, "3kΩ", "start", "#374151", 11);
  svg += groundSymbol(LAD_NODE_XS_3[0], GND_RAIL_Y);
  // 우측 끝 (V+) → OPAMP V+
  svg += wire(VPLUS_X_3, LADDER_Y, OPAMP_X_3, OPAMP_Y_BOT - 25);
  svg += label(VPLUS_X_3 + 8, LADDER_Y - 6, "V+", "start", "#1e3a8a", 11);
  // 가운데 3 노드 → Q_A·Q_B·Q_C vertical R
  const digitalLabels3 = ["Q_A", "Q_B", "Q_C"];
  const digitalSources3 = [LAD_NODE_XS_3[1], LAD_NODE_XS_3[2], LAD_NODE_XS_3[3]];
  for (let i = 0; i < digitalSources3.length; i++) {
    const xc = digitalSources3[i];
    const ry = (LADDER_Y + GND_RAIL_Y + 40) / 2;
    svg += rZigzagV(xc, ry);
    svg += wire(xc, LADDER_Y, xc, ry - 28);
    svg += wire(xc, ry + 28, xc, GND_RAIL_Y + 40);
    svg += label(xc + 16, ry - 4, "3kΩ", "start", "#374151", 11);
    svg += dot(xc, GND_RAIL_Y + 40);
    svg += label(xc + 8, GND_RAIL_Y + 36, digitalLabels3[i], "start", "#1e3a8a", 11);
  }

  // OPAMP
  svg += opampTriangle(OPAMP_X_3, OPAMP_Y_TOP, OPAMP_Y_BOT);
  svg += label(OPAMP_X_3 + 10, OPAMP_Y_TOP + 28, "−", "start", "#000", 16);
  svg += label(OPAMP_X_3 + 10, OPAMP_Y_BOT - 22, "+", "start", "#000", 16);
  svg += label(OPAMP_X_3 + 50, OPAMP_Y_TOP - 6, "U1", "middle", "#1e3a8a", 11);
  const opampOutX_3 = OPAMP_X_3 + 100;
  const opampOutY_3 = (OPAMP_Y_TOP + OPAMP_Y_BOT) / 2;
  svg += wire(opampOutX_3, opampOutY_3, VO_X_3, opampOutY_3);
  svg += `<circle cx="${VO_X_3}" cy="${opampOutY_3}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += label(VO_X_3 + 12, opampOutY_3 + 4, "V_o", "start", "#dc2626", 14);

  // 하단 JK_A·JK_B·JK_C 가로 배치
  // V_CC dot + J·K 공급
  svg += dot(VCC_FF_X_3, FF_ROW_Y + 30);
  svg += label(VCC_FF_X_3 - 8, FF_ROW_Y + 34, "V_CC", "end", "#000", 12);
  const jpY = FF_ROW_Y + 30;
  const kpY = FF_ROW_Y + JK_H - 30;
  svg += wire(VCC_FF_X_3, jpY, JKA_X_3 - 12, jpY);
  svg += wire(VCC_FF_X_3 + 60, jpY, VCC_FF_X_3 + 60, kpY);
  svg += wire(VCC_FF_X_3 + 60, kpY, JKA_X_3 - 12, kpY);
  svg += dot(VCC_FF_X_3 + 60, jpY);

  // JK_A
  svg += jkBox(JKA_X_3, FF_ROW_Y, JK_W, JK_H, "JK_A");
  const jkaQ_X3 = JKA_X_3 + JK_W + 12;
  // JK_A.Q → JK_B.J·K + Q_A 사다리망
  svg += wire(jkaQ_X3, jpY, JKB_X_3 - 12, jpY);
  svg += wire(jkaQ_X3 + 40, jpY, jkaQ_X3 + 40, kpY);
  svg += wire(jkaQ_X3 + 40, kpY, JKB_X_3 - 12, kpY);
  svg += dot(jkaQ_X3 + 40, jpY);
  svg += label(jkaQ_X3 + 20, jpY - 8, "Q_A", "middle", "#1e3a8a", 11);
  // Q_A → 사다리망 LAD_NODE_XS_3[1] (vertical up)
  svg += wire(jkaQ_X3, jpY, jkaQ_X3, GND_RAIL_Y + 60);
  svg += wire(jkaQ_X3, GND_RAIL_Y + 60, LAD_NODE_XS_3[1], GND_RAIL_Y + 60);
  svg += wire(LAD_NODE_XS_3[1], GND_RAIL_Y + 60, LAD_NODE_XS_3[1], GND_RAIL_Y + 40);
  svg += dot(jkaQ_X3, jpY);

  // JK_B
  svg += jkBox(JKB_X_3, FF_ROW_Y, JK_W, JK_H, "JK_B");
  const jkbQ_X3 = JKB_X_3 + JK_W + 12;
  // JK_B.Q → AND_QA·QB (Q_A·Q_B) → JK_C.J·K
  // 단순화: JK_B.Q를 사다리 LAD_NODE_XS_3[2]에 + JK_C.J·K stub에 직접 연결 (AND 게이트 simplified)
  svg += wire(jkbQ_X3, jpY, JKC_X_3 - 12, jpY);
  svg += wire(jkbQ_X3 + 40, jpY, jkbQ_X3 + 40, kpY);
  svg += wire(jkbQ_X3 + 40, kpY, JKC_X_3 - 12, kpY);
  svg += dot(jkbQ_X3 + 40, jpY);
  svg += label(jkbQ_X3 + 20, jpY - 8, "Q_B", "middle", "#1e3a8a", 11);
  // Q_B → 사다리 LAD_NODE_XS_3[2] (vertical up)
  svg += wire(jkbQ_X3, jpY, jkbQ_X3, GND_RAIL_Y + 80);
  svg += wire(jkbQ_X3, GND_RAIL_Y + 80, LAD_NODE_XS_3[2], GND_RAIL_Y + 80);
  svg += wire(LAD_NODE_XS_3[2], GND_RAIL_Y + 80, LAD_NODE_XS_3[2], GND_RAIL_Y + 40);
  svg += dot(jkbQ_X3, jpY);
  // J·K=Q_A·Q_B 표기 (JK_C 위에 AND 라벨)
  svg += label((JKB_X_3 + JKC_X_3) / 2, jpY - 22, "J=K=Q_A·Q_B", "middle", "#7c3aed", 10);

  // JK_C
  svg += jkBox(JKC_X_3, FF_ROW_Y, JK_W, JK_H, "JK_C");
  const jkcQ_X3 = JKC_X_3 + JK_W + 12;
  svg += dot(jkcQ_X3, jpY);
  svg += label(jkcQ_X3 + 20, jpY - 8, "Q_C", "middle", "#1e3a8a", 11);
  // Q_C → 사다리 LAD_NODE_XS_3[3] (vertical up)
  svg += wire(jkcQ_X3, jpY, jkcQ_X3, GND_RAIL_Y + 100);
  svg += wire(jkcQ_X3, GND_RAIL_Y + 100, LAD_NODE_XS_3[3], GND_RAIL_Y + 100);
  svg += wire(LAD_NODE_XS_3[3], GND_RAIL_Y + 100, LAD_NODE_XS_3[3], GND_RAIL_Y + 40);

  // CLK rail (좌하단) → JK_A·JK_B·JK_C ▷
  svg += dot(CLK_X, CLK_RAIL_Y);
  svg += label(CLK_X - 8, CLK_RAIL_Y + 4, "클럭", "end", "#000", 12);
  const ffClkY = FF_ROW_Y + JK_H - 6;
  const jkaClk_3 = JKA_X_3 - 12;
  const jkbClk_3 = JKB_X_3 - 12;
  const jkcClk_3 = JKC_X_3 - 12;
  svg += wire(CLK_X, CLK_RAIL_Y, jkcClk_3, CLK_RAIL_Y);
  svg += wire(jkaClk_3, CLK_RAIL_Y, jkaClk_3, ffClkY);
  svg += dot(jkaClk_3, CLK_RAIL_Y);
  svg += wire(jkbClk_3, CLK_RAIL_Y, jkbClk_3, ffClkY);
  svg += dot(jkbClk_3, CLK_RAIL_Y);
  svg += wire(jkcClk_3, CLK_RAIL_Y, jkcClk_3, ffClkY);
  svg += dot(jkcClk_3, CLK_RAIL_Y);

  svg += `</svg>`;
  return svg;
}

// ─── helper drawing primitives ─────────────────────────────
function wire(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3" fill="black"/>`;
}
function label(x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "start", fill = "#000", size = 13): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="600" fill="${fill}">${escapeSvg(text)}</text>`;
}
const JK_STUB_LEN = 20; // FF 핀 외부 stub 길이 — 박스 가장자리와 외부 wire 사이 명확 분리

function jkBox(x: number, y: number, w: number, h: number, name: string): string {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="2"/>`;
  // J·K·Q 라벨 (박스 안) — Q는 J와 같은 y로 정렬해 외부 wire가 horizontal로 깔끔히
  s += label(x + 14, y + 34, "J", "start", "#000", 13);
  s += label(x + 14, y + h - 22, "K", "start", "#000", 13);
  s += label(x + w - 8, y + 34, "Q", "end", "#000", 13);
  // J 핀 외부 stub (좌측)
  const jPinY = y + 30;
  s += `<path d="M ${x - JK_STUB_LEN} ${jPinY} L ${x} ${jPinY}" stroke="black" fill="none" stroke-width="2"/>`;
  // K 핀 외부 stub
  const kPinY = y + h - 30;
  s += `<path d="M ${x - JK_STUB_LEN} ${kPinY} L ${x} ${kPinY}" stroke="black" fill="none" stroke-width="2"/>`;
  // Q 핀 외부 stub
  const qPinY = y + 30;
  s += `<path d="M ${x + w} ${qPinY} L ${x + w + JK_STUB_LEN} ${qPinY}" stroke="black" fill="none" stroke-width="2"/>`;
  // CLK indicator ▷ + 외부 stub
  const clkY = y + h - 6;
  s += `<path d="M ${x} ${clkY - 4} L ${x + 7} ${clkY} L ${x} ${clkY + 4} Z" fill="none" stroke="black" stroke-width="1.3"/>`;
  s += `<path d="M ${x - JK_STUB_LEN} ${clkY} L ${x} ${clkY}" stroke="black" fill="none" stroke-width="2"/>`;
  s += `<circle cx="${x - JK_STUB_LEN}" cy="${clkY}" r="2" fill="black"/>`;
  s += label(x + w / 2, y - 6, name, "middle", "#1e3a8a", 11);
  return s;
}
function rZigzagH(cx: number, cy: number): string {
  const path: string[] = [`M ${cx - 28} ${cy}`];
  for (let i = 0; i < 4; i++) {
    const px = cx - 28 + (56 * (i + 0.5)) / 4;
    const py = cy + (i % 2 === 0 ? -8 : 8);
    path.push(`L ${px} ${py}`);
  }
  path.push(`L ${cx + 28} ${cy}`);
  return `<path d="${path.join(" ")}" stroke="black" fill="none" stroke-width="2"/>`;
}
function rZigzagV(cx: number, cy: number): string {
  const path: string[] = [`M ${cx} ${cy - 28}`];
  for (let i = 0; i < 4; i++) {
    const py = cy - 28 + (56 * (i + 0.5)) / 4;
    const px = cx + (i % 2 === 0 ? -10 : 10);
    path.push(`L ${px} ${py}`);
  }
  path.push(`L ${cx} ${cy + 28}`);
  return `<path d="${path.join(" ")}" stroke="black" fill="none" stroke-width="2"/>`;
}
function opampTriangle(x: number, yTop: number, yBot: number): string {
  const tipX = x + 100;
  const tipY = (yTop + yBot) / 2;
  return `<path d="M ${x} ${yTop} L ${tipX} ${tipY} L ${x} ${yBot} Z" fill="white" stroke="black" stroke-width="2"/>`;
}
function groundSymbol(cx: number, cy: number): string {
  return (
    `<path d="M ${cx - 10} ${cy} L ${cx + 10} ${cy}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 7} ${cy + 4} L ${cx + 7} ${cy + 4}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 4} ${cy + 8} L ${cx + 4} ${cy + 8}" stroke="black" stroke-width="2"/>`
  );
}
function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
