/**
 * 임용 9번 정보과 형식 — Thevenin + Switched RC 2 figure renderer.
 *
 *   (가) thevenin_original_circuit: V_s + R_top + SW + (C_1, C_2) + 점선박스(R_a, R_b, R_c, I_s)
 *   (나) thevenin_equivalent_circuit: 좌측 동일 + V_Th + R_Th (점선박스 부분 등가 치환)
 *
 *  Fixed-slot layout. 값만 외부 결정, 위치/연결성은 결정론.
 */

const KOREAN_FONT_STACK = `'Noto Sans CJK KR', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;

// ─── 공통 좌표 ──────────────────────────────────────────────
const W = 720, H = 380;
const MID_Y = 200;             // 중간 신호선 y
const BOT_Y = 320;             // ground rail y
const VS_X = 80;               // V_s vertical leg x
const RTOP_X = 180;            // R_top horizontal 중간 x
const C1_X = 280;              // C_1 vertical leg x (= node a 위치)
const SW_X = 360;              // SW 위치
const BOX_LEFT_X = 440;        // 점선박스 좌측
const BOX_TOP_X = 510;         // R_a horizontal 중간 x (박스 내부 top)
const BOX_R_B_X = 510;         // R_b vertical x (박스 내부 중간)
const BOX_R_C_X = 600;         // R_c vertical x (박스 내부 우측)
const BOX_IS_X = 670;          // I_s vertical x (박스 내부 우측 끝)
const BOX_RIGHT_X = 700;       // 점선박스 우측
const BOX_TOP_Y = 130;
const BOX_BOT_Y = 290;

// ─── (가) 원본 회로 ─────────────────────────────────────────
export type TheveninOriginalDiagram = {
  V_s_label: string;        // "10V"
  R_top_label: string;      // "1Ω"
  C_1_label: string;        // "0.1F"
  C_2_label: string;        // "0.4F"
  R_a_label: string;        // "2Ω"
  R_b_label: string;        // "4Ω"
  R_c_label: string;        // "2Ω"
  I_s_label: string;        // "4A"
  /** SW 상태 시각 표현. 보통 "단자1↔단자2" 라벨로 양쪽 표시. */
  swState: "closed_to_term1" | "closed_to_term2" | "open";
};

export function renderTheveninOriginal(d: TheveninOriginalDiagram): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${KOREAN_FONT_STACK}">`;
  svg += defs();

  // 좌측 V_s vertical leg
  svg += renderDcSource(VS_X, MID_Y, BOT_Y, d.V_s_label);
  // V_s top → R_top
  svg += `<path d="M ${VS_X} ${MID_Y} L ${RTOP_X - 18} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // R_top horizontal
  svg += renderResistorHorizontal(RTOP_X, MID_Y, d.R_top_label);

  // SW (SPDT, common = node a). R_top output → 단자1(LEFT) → common → 단자2(RIGHT) → 점선박스
  const NODE_A_X = C1_X + 30;
  svg += renderSwitchAtNode(NODE_A_X, MID_Y, RTOP_X + 18, BOX_LEFT_X + 10, d.swState);

  // ── C_1 + C_2 직렬 stacked (node a → mid_node → GND) ──
  //   사용자 피드백: "두개의 커패시터 연결이 잘못되었어~ 직렬로 와야돼"
  //   원본 (이미지 #18): C_1(0.1F) 위, C_2(0.4F) 아래, 둘 다 vertical stacked.
  //   v_o(t) = C_1 양단 전압 (= V_a - V_mid).
  const MID_NODE_Y = (MID_Y + BOT_Y) / 2;  // C_1 bottom = C_2 top (중간 노드)
  // common (node a) → C_1 top: vertical wire from (NODE_A_X, MID_Y) down to C_1 top region
  svg += renderCapVertical(NODE_A_X, MID_Y, MID_NODE_Y, d.C_1_label, "C_1");
  // 중간 노드 dot
  svg += `<circle cx="${NODE_A_X}" cy="${MID_NODE_Y}" r="3" fill="black"/>`;
  // C_2: 중간 노드 → GND
  svg += renderCapVertical(NODE_A_X, MID_NODE_Y, BOT_Y, d.C_2_label, "C_2");
  // v_o(t) 라벨 — C_1 양단 옆 (우측)
  svg += `<text x="${NODE_A_X + 24}" y="${(MID_Y + MID_NODE_Y) / 2 + 4}" font-size="12" fill="#dc2626" font-weight="700">v_o(t)</text>`;

  // 점선박스 (dashed rectangle)
  svg += `<rect x="${BOX_LEFT_X}" y="${BOX_TOP_Y}" width="${BOX_RIGHT_X - BOX_LEFT_X}" height="${BOX_BOT_Y - BOX_TOP_Y}" stroke="#6b7280" fill="none" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  // 박스 진입 — node b at left edge
  svg += `<circle cx="${BOX_LEFT_X + 10}" cy="${MID_Y}" r="3" fill="black"/>`;
  svg += `<text x="${BOX_LEFT_X + 16}" y="${MID_Y - 12}" font-size="13" font-weight="700" fill="#1e3a8a">b</text>`;
  // node b → R_a horizontal top
  svg += `<path d="M ${BOX_LEFT_X + 10} ${MID_Y} L ${BOX_LEFT_X + 10} ${MID_Y - 50} L ${BOX_TOP_X - 18} ${MID_Y - 50}" stroke="black" fill="none" stroke-width="2"/>`;
  // R_a horizontal
  svg += renderResistorHorizontal(BOX_TOP_X, MID_Y - 50, d.R_a_label);
  // R_a → 박스 내부 mid_node (vertical drop)
  const BOX_MID_NODE_Y = MID_Y - 50;
  svg += `<path d="M ${BOX_TOP_X + 18} ${BOX_MID_NODE_Y} L ${BOX_R_B_X + 30} ${BOX_MID_NODE_Y} L ${BOX_R_B_X + 30} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // R_b vertical (mid_node → GND)
  const RB_TOP_Y = MID_Y;
  svg += renderResistorVertical(BOX_R_B_X + 30, RB_TOP_Y + 30, d.R_b_label);
  svg += `<circle cx="${BOX_R_B_X + 30}" cy="${MID_Y}" r="3" fill="black"/>`;
  svg += `<path d="M ${BOX_R_B_X + 30} ${RB_TOP_Y + 60} L ${BOX_R_B_X + 30} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // R_c vertical — node b 우측 평행 가지로 GND
  //   node b에서 다시 우측으로 가지, R_c 통해 GND
  svg += `<path d="M ${BOX_LEFT_X + 10} ${MID_Y} L ${BOX_R_C_X} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${BOX_R_C_X}" cy="${MID_Y}" r="3" fill="black"/>`;
  svg += renderResistorVertical(BOX_R_C_X, MID_Y + 30, d.R_c_label);
  svg += `<path d="M ${BOX_R_C_X} ${MID_Y + 60} L ${BOX_R_C_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  // I_s vertical (GND → top, 화살표 위)
  svg += `<path d="M ${BOX_R_C_X} ${MID_Y} L ${BOX_IS_X} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderCurrentSource(BOX_IS_X, MID_Y, BOT_Y, d.I_s_label);

  // 공통 ground rail (C_2 좌측 V_s에서 제외, 대신 NODE_A_X 위치로)
  svg += `<path d="M ${VS_X} ${BOT_Y} L ${BOX_IS_X} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  for (const dx of [VS_X, NODE_A_X, BOX_R_B_X + 30, BOX_R_C_X, BOX_IS_X]) {
    svg += `<circle cx="${dx}" cy="${BOT_Y}" r="3" fill="black"/>`;
  }
  svg += renderGround(Math.round((VS_X + BOX_IS_X) / 2), BOT_Y);

  svg += `</svg>`;
  return svg;
}

// ─── (나) Thevenin 등가 회로 ─────────────────────────────────
export type TheveninEquivalentDiagram = {
  V_s_label: string;
  R_top_label: string;
  C_1_label: string;
  C_2_label: string;
  V_Th_label: string;       // "V_Th" 또는 "6.4V" 등 — 변수 표기 우선
  R_Th_label: string;       // "R_Th" 또는 "1.6Ω"
  swState: "closed_to_term1" | "closed_to_term2" | "open";
};

export function renderTheveninEquivalent(d: TheveninEquivalentDiagram): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${KOREAN_FONT_STACK}">`;
  svg += defs();

  // 좌측은 (가)와 동일 — V_s, R_top
  svg += renderDcSource(VS_X, MID_Y, BOT_Y, d.V_s_label);
  svg += `<path d="M ${VS_X} ${MID_Y} L ${RTOP_X - 18} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderResistorHorizontal(RTOP_X, MID_Y, d.R_top_label);

  // SW at node a. R_top → 단자1(LEFT) → common(=a) → 단자2(RIGHT) → R_Th → V_Th
  const NODE_A_X_EQ = C1_X + 30;
  const SW_T2_X_EQ = NODE_A_X_EQ + 30;
  const RTH_X = SW_T2_X_EQ + 60;
  const VTH_X = RTH_X + 110;
  svg += renderSwitchAtNode(NODE_A_X_EQ, MID_Y, RTOP_X + 18, RTH_X - 18, d.swState);

  // C_1 + C_2 직렬 stacked (= (가)와 동일)
  const MID_NODE_Y_EQ = (MID_Y + BOT_Y) / 2;
  svg += renderCapVertical(NODE_A_X_EQ, MID_Y, MID_NODE_Y_EQ, d.C_1_label, "C_1");
  svg += `<circle cx="${NODE_A_X_EQ}" cy="${MID_NODE_Y_EQ}" r="3" fill="black"/>`;
  svg += renderCapVertical(NODE_A_X_EQ, MID_NODE_Y_EQ, BOT_Y, d.C_2_label, "C_2");
  svg += `<text x="${NODE_A_X_EQ + 24}" y="${(MID_Y + MID_NODE_Y_EQ) / 2 + 4}" font-size="12" fill="#dc2626" font-weight="700">v_o(t)</text>`;

  // R_Th horizontal + V_Th vertical
  svg += renderResistorHorizontal(RTH_X, MID_Y, d.R_Th_label);
  svg += `<path d="M ${RTH_X + 18} ${MID_Y} L ${VTH_X} ${MID_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${VTH_X}" cy="${MID_Y}" r="3" fill="black"/>`;
  svg += renderDcSource(VTH_X, MID_Y, BOT_Y, d.V_Th_label, /*isVar*/ true);

  // ground rail
  const RAIL_RIGHT = VTH_X;
  svg += `<path d="M ${VS_X} ${BOT_Y} L ${RAIL_RIGHT} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  for (const dx of [VS_X, NODE_A_X_EQ, VTH_X]) {
    svg += `<circle cx="${dx}" cy="${BOT_Y}" r="3" fill="black"/>`;
  }
  svg += renderGround(Math.round((VS_X + RAIL_RIGHT) / 2), BOT_Y);

  svg += `</svg>`;
  return svg;
}

// ─── 심볼 helpers ───────────────────────────────────────────
function defs(): string {
  return `<defs>
    <marker id="thev_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/>
    </marker>
  </defs>`;
}

/** DC 전압원 — 원형 + +/-. cx=center x, top y=midY, bottom y=botY. */
function renderDcSource(cx: number, topY: number, botY: number, label: string, isVar: boolean = false): string {
  const cy = (topY + botY) / 2;
  const r = 18;
  let svg = "";
  // wire top
  svg += `<path d="M ${cx} ${topY} L ${cx} ${cy - r}" stroke="black" fill="none" stroke-width="2"/>`;
  // circle
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="black" fill="white" stroke-width="2"/>`;
  // +/-
  svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13" font-weight="700">+</text>`;
  svg += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="13" font-weight="700">−</text>`;
  // wire bottom
  svg += `<path d="M ${cx} ${cy + r} L ${cx} ${botY}" stroke="black" fill="none" stroke-width="2"/>`;
  // label (좌측)
  const fillColor = isVar ? "#dc2626" : "#1e3a8a";
  svg += `<text x="${cx - r - 6}" y="${cy + 4}" text-anchor="end" font-size="13" font-weight="700" fill="${fillColor}">${escapeSvg(label)}</text>`;
  return svg;
}

/** DC 전류원 — 원형 + 위 화살표. cx, topY → botY. */
function renderCurrentSource(cx: number, topY: number, botY: number, label: string): string {
  const cy = (topY + botY) / 2;
  const r = 18;
  let svg = "";
  svg += `<path d="M ${cx} ${topY} L ${cx} ${cy - r}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="black" fill="white" stroke-width="2"/>`;
  // up arrow inside
  svg += `<path d="M ${cx} ${cy + r - 4} L ${cx} ${cy - r + 4}" stroke="black" stroke-width="2" marker-end="url(#thev_arrow)"/>`;
  svg += `<path d="M ${cx} ${cy + r} L ${cx} ${botY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<text x="${cx + r + 6}" y="${cy + 4}" text-anchor="start" font-size="13" font-weight="700" fill="#1e3a8a">${escapeSvg(label)}</text>`;
  return svg;
}

/** 수평 저항 (zigzag). cx 중심, cy 중심선. */
function renderResistorHorizontal(cx: number, cy: number, label: string): string {
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
  svg += `<text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="12" fill="#374151">${escapeSvg(label)}</text>`;
  return svg;
}

/** 수직 저항 (zigzag). cx 중심, cy 중심선. */
function renderResistorVertical(cx: number, cy: number, label: string): string {
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
  svg += `<text x="${cx + 14}" y="${cy + 4}" font-size="12" fill="#374151">${escapeSvg(label)}</text>`;
  return svg;
}

/** 수직 캐패시터 — 두 막대. C_1, C_2 라벨용. */
function renderCapVertical(cx: number, topY: number, botY: number, value: string, idLabel: string): string {
  const cy = (topY + botY) / 2;
  let svg = "";
  // wire top
  svg += `<path d="M ${cx} ${topY} L ${cx} ${cy - 4}" stroke="black" fill="none" stroke-width="2"/>`;
  // 상단 막대 (긴 평판)
  svg += `<path d="M ${cx - 14} ${cy - 4} L ${cx + 14} ${cy - 4}" stroke="black" stroke-width="2.5"/>`;
  // 하단 막대
  svg += `<path d="M ${cx - 14} ${cy + 4} L ${cx + 14} ${cy + 4}" stroke="black" stroke-width="2.5"/>`;
  // wire bottom
  svg += `<path d="M ${cx} ${cy + 4} L ${cx} ${botY}" stroke="black" fill="none" stroke-width="2"/>`;
  // 라벨 좌측: id + value
  svg += `<text x="${cx - 20}" y="${cy - 8}" text-anchor="end" font-size="12" font-weight="700" fill="#1e3a8a">${escapeSvg(idLabel)}</text>`;
  svg += `<text x="${cx - 20}" y="${cy + 8}" text-anchor="end" font-size="11" fill="#374151">${escapeSvg(value)}</text>`;
  return svg;
}

/**
 * SW between R_top and node a — horizontal SPDT, common pivot at node a 좌표.
 *   사용자 피드백 반영: "저항 2옴과 c1 node Top 사이를 끊고 스위치가 와야지"
 *
 *   T1 (단자1, LEFT) ●────  ●  ────● T2 (단자2, RIGHT)
 *                            ↑
 *                          common (= node a, C_1 top)
 *                          handle ↗ to T2 (closed_to_term2)
 *                              or ↖ to T1 (closed_to_term1)
 *
 *   T1 wire ← R_top right edge (t1SourceX)
 *   T2 wire → 점선박스 entry / R_Th 시작점 (t2TargetX)
 *   common (node a) — C_1 top과 동일 좌표, 라벨 "a"
 */
function renderSwitchAtNode(commonX: number, commonY: number, t1SourceX: number, t2TargetX: number, state: "closed_to_term1" | "closed_to_term2" | "open"): string {
  const T1_X = commonX - 30;
  const T1_Y = commonY;
  const T2_X = commonX + 30;
  const T2_Y = commonY;
  let svg = "";
  // R_top → T1 horizontal wire (LEFT side incoming)
  svg += `<path d="M ${t1SourceX} ${commonY} L ${T1_X} ${T1_Y}" stroke="black" stroke-width="2" fill="none"/>`;
  // T2 → 점선박스 horizontal wire (RIGHT side outgoing)
  svg += `<path d="M ${T2_X} ${T2_Y} L ${t2TargetX} ${commonY}" stroke="black" stroke-width="2" fill="none"/>`;
  // 단자1 dot + 라벨 (LEFT)
  svg += `<circle cx="${T1_X}" cy="${T1_Y}" r="3" fill="black"/>`;
  svg += `<text x="${T1_X - 4}" y="${T1_Y + 18}" text-anchor="end" font-size="10" fill="#666">단자1</text>`;
  // common pivot dot (node a) — slightly larger
  svg += `<circle cx="${commonX}" cy="${commonY}" r="3.5" fill="black"/>`;
  // 단자2 dot + 라벨 (RIGHT)
  svg += `<circle cx="${T2_X}" cy="${T2_Y}" r="3" fill="black"/>`;
  svg += `<text x="${T2_X + 4}" y="${T2_Y + 18}" text-anchor="start" font-size="10" fill="#666">단자2</text>`;
  // handle — common pivot에서 UP 방향으로 angled, T1 또는 T2 위쪽 끝점으로
  if (state === "closed_to_term1") {
    svg += `<path d="M ${commonX} ${commonY} L ${T1_X + 4} ${T1_Y - 22}" stroke="black" stroke-width="2" fill="none"/>`;
  } else if (state === "closed_to_term2") {
    svg += `<path d="M ${commonX} ${commonY} L ${T2_X - 4} ${T2_Y - 22}" stroke="black" stroke-width="2" fill="none"/>`;
  } else {
    svg += `<path d="M ${commonX} ${commonY} L ${commonX} ${commonY - 22}" stroke="black" stroke-width="2" fill="none"/>`;
  }
  // SW (t=0) 라벨 (handle 위쪽)
  svg += `<text x="${commonX}" y="${commonY - 30}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="700">SW (t=0)</text>`;
  // node a 라벨 (common 우측 살짝 위)
  svg += `<text x="${commonX + 8}" y="${commonY - 10}" font-size="13" font-weight="700" fill="#1e3a8a">a</text>`;
  return svg;
}

/** [구버전] SPDT-style switch — 단자1·단자2 양쪽 표기. 간단 horizontal. */
function renderSwitch(cx: number, cy: number, state: "closed_to_term1" | "closed_to_term2" | "open"): string {
  const t1X = cx - 25, t1Y = cy;        // 단자1 (좌측)
  const t2X = cx + 25, t2Y = cy;        // 단자2 (우측)
  let svg = "";
  svg += `<circle cx="${t1X}" cy="${t1Y}" r="3" fill="black"/>`;
  svg += `<circle cx="${t2X}" cy="${t2Y}" r="3" fill="black"/>`;
  // handle — 위쪽으로 꺾인 모양
  let handleEndX: number;
  if (state === "closed_to_term1") handleEndX = t1X;
  else if (state === "closed_to_term2") handleEndX = t2X;
  else handleEndX = (t1X + t2X) / 2;  // open 표현 — 가운데 (실제로는 살짝 들어올림)
  if (state === "open") {
    svg += `<path d="M ${t1X} ${t1Y} L ${cx} ${cy - 14}" stroke="black" fill="none" stroke-width="2"/>`;
  } else {
    svg += `<path d="M ${t1X} ${t1Y} L ${handleEndX} ${t1Y}" stroke="black" fill="none" stroke-width="2"/>`;
    if (state === "closed_to_term2") {
      svg += `<path d="M ${handleEndX} ${t1Y} L ${t2X} ${t2Y}" stroke="black" fill="none" stroke-width="2"/>`;
    }
  }
  // 라벨
  svg += `<text x="${t1X - 4}" y="${t1Y - 8}" text-anchor="end" font-size="10" fill="#666">단자1</text>`;
  svg += `<text x="${t2X + 4}" y="${t2Y - 8}" text-anchor="start" font-size="10" fill="#666">단자2</text>`;
  svg += `<text x="${cx}" y="${cy - 22}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="700">SW (t=0)</text>`;
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
