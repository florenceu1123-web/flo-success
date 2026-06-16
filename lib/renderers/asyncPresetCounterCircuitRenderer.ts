import type { AsyncPresetCounterCircuitDiagram } from "@/types";

/**
 * 비동기 SET/RESET D 플립플롭 응용회로 (가) 전용 fixed-slot 렌더러.
 *
 *  layout (좌→우 3셀):
 *    [클럭] → [D-FF × 3] (각 FF의 SET·RESET 핀은 하단)
 *    각 FF **바로 아래에 두 AND 게이트를 나란히 묶음**:
 *      · 좌 AND_set  = F · I_k   → SET 핀
 *      · 우 AND_rst  = F · I_k′  → RESET 핀 (I_k′ = 인버터)
 *      같은 입력 I_k가 두 게이트로 분기 → 가까이 그룹화.
 *    F는 **실제 가로 도선(F-bus)** — 우측 NOR 출력에서 모든 셀의 AND로 분배.
 *    NOR: 우측 끝, F = (Q₀+Q₁+Q₂+CLK)′. 리플 클럭: CLK→FF0, Q₀→FF1, Q₁→FF2.
 *    D_k = Q̄_k (T 동작) — FF 위쪽 피드백 도선.
 */

const STROKE = "#111827";
const WIRE_W = 1.4;
const DOT_R = 3;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";
const FWIRE = "#7c3aed"; // F-bus 강조색

const SVG_W = 1000;
const SVG_H = 560;

const CELL_CX = [205, 460, 715];
const FF_HALF = 48;
const FF_TOP = 120;
const FF_H = 92;
const FF_BOT = FF_TOP + FF_H; // 212
const FF_CY = FF_TOP + FF_H / 2; // 166

const D_PIN_Y = FF_CY - 16;   // 150
const CLK_PIN_Y = FF_CY + 22; // 188
const Q_PIN_Y = FF_CY - 16;   // 150
const QBAR_PIN_Y = FF_CY + 22;

const SET_DX = -22;  // SET 핀 x오프셋 (하단)
const RST_DX = 22;   // RESET 핀 x오프셋 (하단)

const GATE_OUT_Y = 234;  // AND 출력(상단) — SET/RESET 핀(212)으로 짧게 연결
const GATE_H = 30;
const GATE_HALF_W = 15;
const GATE_IN_Y = GATE_OUT_Y + GATE_H; // 264 — AND 입력(하단)
const F_BUS_Y = 300;      // F 가로 도선
const INV_Y = 360;        // I_k′ 인버터
const I_LABEL_Y = 470;    // I_k 입력 라벨

const FB_TOP_Y = 44;      // D=Q̄ 피드백 상단 lane (최상단)
const RIPPLE_Y = 188;     // 리플 클럭 가로 lane (FF 사이 간격)
// Q₀·Q₁·Q₂·CLK → NOR 연결 상단 레인 (피드백 lane 아래, FF 위)
const NOR_LANE_Y = [66, 80, 94, 108];

const CLK_IN_X = 44;
const NOR_CX = 902;
const NOR_CY = 87;        // NOR 입력 레인(66~108)의 중앙

type D = AsyncPresetCounterCircuitDiagram;

export function renderAsyncPresetCounterCircuit(d: D): string {
  if (!d?.qLabels || d.qLabels.length < 1) return emptySvg("invalid async_preset_counter diagram");
  const n = Math.min(d.bitCount ?? d.qLabels.length, 3);
  const qLabels = d.qLabels;
  const iLabels = d.iLabels ?? ["I₀", "I₁", "I₂"];
  const norLabel = d.norLabel ?? "F";

  const wires: string[] = [];
  const fwires: string[] = [];
  const dots: string[] = [];
  const symbols: string[] = [];
  const labels: string[] = [];

  const ffL = (cx: number) => cx - FF_HALF;
  const ffR = (cx: number) => cx + FF_HALF;

  // ── 클럭 입력 ─────────────────────────────────────
  labels.push(text(CLK_IN_X - 10, RIPPLE_Y + 4, "클럭", { anchor: "end", size: 13, weight: 600 }));
  symbols.push(clockWave(CLK_IN_X, RIPPLE_Y));
  wires.push(line(CLK_IN_X + 12, RIPPLE_Y, ffL(CELL_CX[0]) - 16, RIPPLE_Y));
  wires.push(line(ffL(CELL_CX[0]) - 16, RIPPLE_Y, ffL(CELL_CX[0]) - 16, CLK_PIN_Y));
  wires.push(line(ffL(CELL_CX[0]) - 16, CLK_PIN_Y, ffL(CELL_CX[0]), CLK_PIN_Y));

  const fTapXs: number[] = []; // F-bus가 닿는 좌측 한계 계산용

  for (let k = 0; k < n; k++) {
    const cx = CELL_CX[k];
    const xl = ffL(cx);
    const xr = ffR(cx);
    const setX = cx + SET_DX;
    const rstX = cx + RST_DX;

    // FF 박스
    symbols.push(`<rect x="${xl}" y="${FF_TOP}" width="${FF_HALF * 2}" height="${FF_H}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    labels.push(text(cx, FF_TOP + 20, "D-FF", { size: 11, weight: 700, fill: MUTED }));
    labels.push(text(cx, FF_CY + 30, `(${k})`, { size: 9, fill: MUTED }));
    labels.push(text(xl + 9, D_PIN_Y + 4, "D", { size: 11, weight: 600, anchor: "start" }));
    labels.push(text(xr - 9, Q_PIN_Y + 4, "Q", { size: 11, weight: 600, anchor: "end" }));
    labels.push(text(xr - 9, QBAR_PIN_Y + 4, "Q̄", { size: 11, weight: 600, anchor: "end" }));
    labels.push(text(setX, FF_BOT - 6, "SET", { size: 8, fill: MUTED }));
    labels.push(text(rstX, FF_BOT - 6, "RST", { size: 8, fill: MUTED }));

    // 클럭 삼각형 (좌하)
    symbols.push(clkTriangle(xl, CLK_PIN_Y));

    // Q 출력 도선 + 라벨
    wires.push(line(xr, Q_PIN_Y, xr + 26, Q_PIN_Y));
    dots.push(dot(xr + 26, Q_PIN_Y));
    labels.push(text(xr + 32, Q_PIN_Y + 4, qLabels[k] ?? `Q${k}`, { size: 14, weight: 700, fill: ACCENT, anchor: "start" }));

    // D = Q̄ 피드백 (Q̄ → 우측 → 위 lane → 좌측 → D)
    const fbX = xr + 14;
    wires.push(line(xr, QBAR_PIN_Y, fbX, QBAR_PIN_Y));
    wires.push(line(fbX, QBAR_PIN_Y, fbX, FB_TOP_Y));
    wires.push(line(fbX, FB_TOP_Y, xl - 14, FB_TOP_Y));
    wires.push(line(xl - 14, FB_TOP_Y, xl - 14, D_PIN_Y));
    wires.push(line(xl - 14, D_PIN_Y, xl, D_PIN_Y));
    labels.push(text(cx, FB_TOP_Y - 5, "D = Q̄ (T)", { size: 9, fill: MUTED }));

    // ── 두 AND 게이트 (FF 바로 아래 나란히, 위를 향함) ──
    // 좌: AND_set = F·I_k → SET핀,  우: AND_rst = F·I_k′ → RESET핀
    drawUpAnd(symbols, setX);
    drawUpAnd(symbols, rstX);
    labels.push(text(setX, GATE_OUT_Y + GATE_H / 2 + 4, "&", { size: 11, weight: 700 }));
    labels.push(text(rstX, GATE_OUT_Y + GATE_H / 2 + 4, "&", { size: 11, weight: 700 }));
    // AND 출력(상단) → SET/RESET 핀
    wires.push(line(setX, GATE_OUT_Y, setX, FF_BOT));
    wires.push(line(rstX, GATE_OUT_Y, rstX, FF_BOT));

    // AND 입력(하단) 2개: 좌=F, 우=I(또는 I′)
    const setF_x = setX - 7, setI_x = setX + 7;
    const rstF_x = rstX - 7, rstI_x = rstX + 7;
    // F 입력: F-bus(y=F_BUS_Y)에서 위로 tap (보라색 F net)
    fwires.push(line(setF_x, GATE_IN_Y, setF_x, F_BUS_Y, FWIRE));
    fwires.push(line(rstF_x, GATE_IN_Y, rstF_x, F_BUS_Y, FWIRE));
    dots.push(dotC(setF_x, F_BUS_Y, FWIRE));
    dots.push(dotC(rstF_x, F_BUS_Y, FWIRE));
    fTapXs.push(setF_x);
    labels.push(text(setF_x - 3, GATE_IN_Y + 11, norLabel, { size: 8, anchor: "end", fill: FWIRE, weight: 600 }));
    labels.push(text(rstF_x - 3, GATE_IN_Y + 11, norLabel, { size: 8, anchor: "end", fill: FWIRE, weight: 600 }));

    // I_k 입력 (바닥) → 분기: AND_set 우입력(직접) + 인버터→AND_rst 우입력
    const branchY = INV_Y + 40; // 400
    labels.push(text(cx, I_LABEL_Y + 4, iLabels[k] ?? `I${k}`, { size: 13, weight: 700 }));
    wires.push(line(cx, I_LABEL_Y - 8, cx, branchY));
    dots.push(dot(cx, branchY));
    // → AND_set 우입력 (I_k 직접)
    wires.push(line(cx, branchY, setI_x, branchY));
    wires.push(line(setI_x, branchY, setI_x, GATE_IN_Y));
    labels.push(text(setI_x + 3, GATE_IN_Y + 11, iLabels[k] ?? `I${k}`, { size: 8, anchor: "start", fill: MUTED }));
    // → 인버터 → AND_rst 우입력 (I_k′)
    wires.push(line(cx, branchY, rstI_x, branchY));
    wires.push(line(rstI_x, branchY, rstI_x, INV_Y + 9));
    drawUpInverter(symbols, rstI_x, INV_Y);
    wires.push(line(rstI_x, INV_Y - 13, rstI_x, GATE_IN_Y));
    labels.push(text(rstI_x + 5, GATE_IN_Y + 11, `${iLabels[k] ?? `I${k}`}′`, { size: 8, anchor: "start", fill: MUTED }));
  }

  // ── 리플 클럭 체인: Q_k → FF_{k+1}.CLK ───────────
  for (let k = 0; k + 1 < n; k++) {
    const xrk = ffR(CELL_CX[k]);
    const tapX = xrk + 26;
    const xlNext = ffL(CELL_CX[k + 1]);
    wires.push(line(tapX, Q_PIN_Y, tapX, RIPPLE_Y));
    wires.push(line(tapX, RIPPLE_Y, xlNext - 16, RIPPLE_Y));
    wires.push(line(xlNext - 16, RIPPLE_Y, xlNext - 16, CLK_PIN_Y));
    wires.push(line(xlNext - 16, CLK_PIN_Y, xlNext, CLK_PIN_Y));
    labels.push(text((tapX + xlNext) / 2, RIPPLE_Y - 5, `${qLabels[k] ?? `Q${k}`}→CLK`, { size: 8, fill: MUTED }));
  }

  // ── 우향 NOR + 입력 실제 도선 연결 (Q₀·Q₁·Q₂·CLK) + F-bus ───
  drawNor(symbols, NOR_CX, NOR_CY);
  labels.push(text(NOR_CX + 4, NOR_CY + 4, "NOR", { size: 9, weight: 700, fill: MUTED }));
  const norInX = NOR_CX - 28; // NOR 입력측(좌) x

  // Q₀..Q_{n-1} : 각 FF 출력 dot → 위로 → NOR 입력 레인으로 실제 도선
  for (let k = 0; k < n; k++) {
    const qx = ffR(CELL_CX[k]) + 26; // Q 출력 dot x
    const ly = NOR_LANE_Y[k];
    wires.push(line(qx, Q_PIN_Y, qx, ly));   // 출력 dot에서 위로
    wires.push(line(qx, ly, norInX, ly));     // 레인 따라 NOR 입력까지
    dots.push(dot(qx, Q_PIN_Y));
  }
  // CLK : 좌측 클럭 도선에서 tap → 위로 → NOR 마지막 입력 레인
  const clkLy = NOR_LANE_Y[n] ?? NOR_LANE_Y[NOR_LANE_Y.length - 1];
  const clkTapX = CLK_IN_X + 30;
  wires.push(line(clkTapX, RIPPLE_Y, clkTapX, clkLy));
  wires.push(line(clkTapX, clkLy, norInX, clkLy));
  dots.push(dot(clkTapX, RIPPLE_Y));
  labels.push(text(clkTapX + 4, clkLy - 4, "CLK", { size: 8, fill: MUTED, anchor: "start" }));

  // NOR 출력(우, 버블) → 우측 가장자리 → 아래로 → F-bus(좌향, 게이트로)
  const norOutX = NOR_CX + 33;
  const edgeX = SVG_W - 24;
  const fBusLeft = Math.min(...fTapXs) - 4;
  fwires.push(line(norOutX, NOR_CY, edgeX, NOR_CY, FWIRE));
  fwires.push(line(edgeX, NOR_CY, edgeX, F_BUS_Y, FWIRE));
  fwires.push(line(edgeX, F_BUS_Y, fBusLeft, F_BUS_Y, FWIRE));
  labels.push(text(norOutX + 4, NOR_CY - 6, norLabel, { size: 13, weight: 700, fill: FWIRE, anchor: "start" }));
  labels.push(text(fBusLeft + 40, F_BUS_Y - 8, `${norLabel} = (Q₀+Q₁+Q₂+CLK)′  (모두 0이면 ${norLabel}=1 → I 적재)`, { size: 9, fill: FWIRE, anchor: "start" }));

  labels.push(text(SVG_W / 2, SVG_H - 10, "비동기 SET/RESET D-FF 응용회로 — F=NOR(Q,CLK)로 I 적재 + 리플 T-FF 카운트", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${[
    ...wires,
    ...fwires,
    ...dots,
    ...symbols,
    ...labels,
  ].join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
/** 위를 향하는 AND (평평한 하단=입력, 둥근 상단=출력). 중심 x, 출력 상단 y=GATE_OUT_Y. */
function drawUpAnd(out: string[], cx: number): void {
  const w = GATE_HALF_W * 2, h = GATE_H, r = w / 2;
  const xl = cx - GATE_HALF_W, top = GATE_OUT_Y, bot = GATE_OUT_Y + h;
  // 하단 직선 + 양옆 직선 + 상단 반원
  const dpath = `M${xl},${bot} L${xl},${top + r} A${r},${r} 0 0 1 ${xl + w},${top + r} L${xl + w},${bot} Z`;
  out.push(`<path d="${dpath}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
}

/** 위를 향하는 인버터 (입력 하단, 출력 상단 + 버블). 중심 cx, 중심 y. */
function drawUpInverter(out: string[], cx: number, cy: number): void {
  const w = 14, h = 16;
  const tri = `<polygon points="${cx - w / 2},${cy + h / 2} ${cx + w / 2},${cy + h / 2} ${cx},${cy - h / 2}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const bubble = `<circle cx="${cx}" cy="${cy - h / 2 - 3}" r="3" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  out.push(tri + bubble);
}

/** 우향 NOR (입력 좌측, 출력 우측 + 버블). */
function drawNor(out: string[], cx: number, cy: number): void {
  const h = 56;
  const xl = cx - 28; // 입력측(좌)
  const top = cy - h / 2, bot = cy + h / 2;
  // OR 몸체: 좌측 오목(입력변), 우측 꼭지(출력)
  const body = `<path d="M${xl},${top} Q${xl + 18},${cy} ${xl},${bot} Q${xl + 32},${bot} ${cx + 28},${cy} Q${xl + 32},${top} ${xl},${top} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const bubble = `<circle cx="${cx + 28 + 5}" cy="${cy}" r="5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  out.push(body + bubble);
}

function clkTriangle(x: number, cy: number): string {
  const hh = 6;
  return `<polygon points="${x},${cy - hh} ${x + 10},${cy} ${x},${cy + hh}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function clockWave(x: number, cy: number): string {
  const h = 7;
  const p = `M${x - 10},${cy + h} L${x - 6},${cy + h} L${x - 6},${cy - h} L${x + 2},${cy - h} L${x + 2},${cy + h} L${x + 10},${cy + h} L${x + 10},${cy - h}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ─── primitives ──────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number, color = STROKE): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}

function dotC(x: number, y: number, color: string): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${color}"/>`;
}

function text(
  x: number,
  y: number,
  s: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  const size = opts.size ?? 12;
  const weight = opts.weight ?? 400;
  const anchor = opts.anchor ?? "middle";
  const fill = opts.fill ?? STROKE;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeSvg(s)}</text>`;
}

function escapeSvg(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} 64"><text x="${SVG_W / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${escapeSvg(msg)}</text></svg>`;
}
