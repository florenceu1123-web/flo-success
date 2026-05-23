// src/lib/renderers/wienBridgeOscillatorCircuit.ts
//
// Wien Bridge oscillator 전용 renderer.
//
// 배경: generic renderOpAmpCircuit은 6 branch 카테고리(feedback_inv/noninv·ref_inv/noninv·
//      input_inv/noninv·source_leg)로 분류 — Wien Bridge의 V_out→R_a→n_Z1→C_a→V+ chain
//      에서 R_a가 어디에도 안 맞아 drop됨. archetype-aware dispatch로 해결.
//
// 고정 layout 패턴 (사용자 명시):
//
//       V_out ── R_3 ── V−
//                       │
//                      R_1
//                       │
//                      GND
//
//       V_out ── R_a ── n_Z1 ── C_a ── V+
//                                       │
//                                     R_b ∥ C_b
//                                       │
//                                      GND
//
//   양 path 모두 V_out에서 출발. V−는 음피드백(resistive gain), V+는 양피드백(RC bridge).

import type { CircuitNetlist } from "@/types";

// ── canvas + 좌표 상수 ─────────────────────────────────────────────
const W = 700;
const H = 600;

// OPAMP triangle (left-vertical, right tip)
const OP_LEFT_X = 340;
const OP_RIGHT_X = 440;
const OP_TOP_Y = 240;
const OP_BOT_Y = 320;
const OP_MID_Y = 280;             // tip y
const VMINUS_PIN = { x: OP_LEFT_X, y: 260 };
const VPLUS_PIN  = { x: OP_LEFT_X, y: 300 };
const VOUT_PIN   = { x: OP_RIGHT_X, y: OP_MID_Y };

// V− net column (왼쪽 위 vertical leg)
const VMINUS_COL_X = 290;         // V− stub left end
const R1_COL_X = 200;             // R_1 vertical column
const VMINUS_GND_Y = 460;

// R_3 top horizontal feedback path
const R3_TOP_Y = 160;
const VOUT_COL_X = 530;           // Vout vertical column (R_3 우측·RC chain 우측 공통)

// V+ net + RC chain (아래쪽)
const VPLUS_COL_X = 290;          // V+ junction column (V− stub 컬럼과 같지만 y 분리)
const RC_CHAIN_Y = 420;           // R_a·C_a row
const VPLUS_BRANCH_Y = 470;       // R_b·C_b 공통 top rail
const VPLUS_GND_Y = 540;          // R_b·C_b 공통 bottom GND rail
const RB_COL_X = 240;
const CB_COL_X = 340;
const N_Z1_X = 410;               // n_Z1 dot column

// Vo output
const VO_LABEL_X = 600;

// ── 헬퍼 ──────────────────────────────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number, sw = 2): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${sw}" stroke-linecap="round"/>`;
}

function dot(x: number, y: number, r = 3): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="black"/>`;
}

function textLabel(x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle", size = 12): string {
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-family="sans-serif">${text}</text>`;
}

/** 가로 저항 zig-zag 심볼. center (cx, cy), width 40. */
function resistorH(cx: number, cy: number, label: string, value: string): string {
  const x0 = cx - 20, x1 = cx + 20;
  const path =
    `<polyline points="${x0},${cy} ${x0+4},${cy-7} ${x0+10},${cy+7} ${x0+16},${cy-7} ${x0+22},${cy+7} ${x0+28},${cy-7} ${x0+34},${cy+7} ${x0+40},${cy}" ` +
    `fill="none" stroke="black" stroke-width="2"/>`;
  return path +
    textLabel(cx, cy - 12, label, "middle", 12) +
    textLabel(cx, cy + 22, value, "middle", 11);
}

/** 세로 저항 zig-zag 심볼. center (cx, cy), height 40. */
function resistorV(cx: number, cy: number, label: string, value: string): string {
  const y0 = cy - 20, y1 = cy + 20;
  const path =
    `<polyline points="${cx},${y0} ${cx-7},${y0+4} ${cx+7},${y0+10} ${cx-7},${y0+16} ${cx+7},${y0+22} ${cx-7},${y0+28} ${cx+7},${y0+34} ${cx},${y0+40}" ` +
    `fill="none" stroke="black" stroke-width="2"/>`;
  return path +
    textLabel(cx + 16, cy + 2, label, "start", 12) +
    textLabel(cx + 16, cy + 16, value, "start", 11);
}

/** 가로 캡 심볼 (Capacitor symbol). center (cx, cy). */
function capacitorH(cx: number, cy: number, label: string, value: string): string {
  return (
    line(cx - 20, cy, cx - 6, cy) +
    line(cx + 6, cy, cx + 20, cy) +
    line(cx - 6, cy - 10, cx - 6, cy + 10) +
    line(cx + 6, cy - 10, cx + 6, cy + 10) +
    textLabel(cx, cy - 16, label, "middle", 12) +
    textLabel(cx, cy + 22, value, "middle", 11)
  );
}

/** 세로 캡 심볼. center (cx, cy). */
function capacitorV(cx: number, cy: number, label: string, value: string): string {
  return (
    line(cx, cy - 20, cx, cy - 6) +
    line(cx, cy + 6, cx, cy + 20) +
    line(cx - 10, cy - 6, cx + 10, cy - 6) +
    line(cx - 10, cy + 6, cx + 10, cy + 6) +
    textLabel(cx + 16, cy - 4, label, "start", 12) +
    textLabel(cx + 16, cy + 10, value, "start", 11)
  );
}

/** GND 심볼 (3-bar). top at (x, y). */
function groundSymbol(x: number, y: number): string {
  return (
    line(x - 10, y, x + 10, y) +
    line(x - 7, y + 4, x + 7, y + 4) +
    line(x - 4, y + 8, x + 4, y + 8)
  );
}

function opampBody(): string {
  return (
    `<polygon points="${OP_LEFT_X},${OP_TOP_Y} ${OP_LEFT_X},${OP_BOT_Y} ${OP_RIGHT_X},${OP_MID_Y}" fill="white" stroke="black" stroke-width="2"/>` +
    textLabel(OP_LEFT_X + 8, VMINUS_PIN.y + 4, "−", "start", 16) +
    textLabel(OP_LEFT_X + 8, VPLUS_PIN.y + 6, "+", "start", 16) +
    textLabel(OP_LEFT_X + 40, OP_TOP_Y - 4, "U1", "middle", 12)
  );
}

// ── 컴포넌트 조회 ────────────────────────────────────────────────
function getById(netlist: CircuitNetlist, id: string) {
  return (netlist.components ?? []).find((c) => c.id === id);
}

// ── 검출 ─────────────────────────────────────────────────────────
export function hasWienBridgeOscillator(netlist: CircuitNetlist): boolean {
  if ((netlist as { archetype?: string }).archetype === "WIEN_BRIDGE_OSCILLATOR") return true;
  return false;
}

// ── 메인 렌더러 ───────────────────────────────────────────────────
export function renderWienBridgeOscillatorCircuit(netlist: CircuitNetlist): string {
  // role-기반 component lookup — id로 매핑.
  // (generator가 id를 role과 동기화해서 부여 — R_1·R_3·R_a·C_a·R_b·C_b·U1)
  const r1 = getById(netlist, "R_1");
  const r3 = getById(netlist, "R_3");
  const ra = getById(netlist, "R_a");
  const ca = getById(netlist, "C_a");
  const rb = getById(netlist, "R_b");
  const cb = getById(netlist, "C_b");

  const r1Val = String(r1?.value ?? "R_1");
  const r3Val = String(r3?.value ?? "R_3");
  const raVal = String(ra?.value ?? "R_a");
  const caVal = String(ca?.value ?? "C_a");
  const rbVal = String(rb?.value ?? "R_b");
  const cbVal = String(cb?.value ?? "C_b");

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // ── OPAMP body + V_o 출력 ──
  svg += opampBody();
  svg += line(VOUT_PIN.x, VOUT_PIN.y, VO_LABEL_X - 20, VOUT_PIN.y);
  svg += dot(VOUT_PIN.x, VOUT_PIN.y);
  svg += textLabel(VO_LABEL_X, VOUT_PIN.y + 4, "V_o", "start", 14);

  // ── V− 음피드백 path: V_out ── R_3 ── V− ──┐
  //                                          R_1
  //                                           │
  //                                          GND
  // V− stub: pin → 왼쪽 (VMINUS_COL_X)
  svg += line(VMINUS_PIN.x, VMINUS_PIN.y, VMINUS_COL_X, VMINUS_PIN.y);
  svg += textLabel(VMINUS_COL_X - 22, VMINUS_PIN.y - 8, "V−", "start", 13);
  // V− junction: up to R_3 row + left to R_1
  svg += line(VMINUS_COL_X, VMINUS_PIN.y, VMINUS_COL_X, R3_TOP_Y);
  svg += dot(VMINUS_COL_X, VMINUS_PIN.y);
  // R_3 horizontal: VMINUS_COL_X → VOUT_COL_X at R3_TOP_Y
  svg += line(VMINUS_COL_X, R3_TOP_Y, R1_COL_X + 80, R3_TOP_Y); // wire to R_3 left
  const r3Cx = (VMINUS_COL_X + VOUT_COL_X) / 2;
  svg += resistorH(r3Cx, R3_TOP_Y, "R_3", r3Val);
  svg += line(r3Cx + 20, R3_TOP_Y, VOUT_COL_X, R3_TOP_Y);
  // Vout column down from R3 to OPAMP output
  svg += line(VOUT_COL_X, R3_TOP_Y, VOUT_COL_X, VOUT_PIN.y);
  svg += dot(VOUT_COL_X, VOUT_PIN.y);
  // R_1 leg: V− junction → left → R_1 column → down → GND
  svg += line(VMINUS_COL_X, VMINUS_PIN.y, R1_COL_X, VMINUS_PIN.y);
  svg += line(R1_COL_X, VMINUS_PIN.y, R1_COL_X, VMINUS_GND_Y);
  svg += resistorV(R1_COL_X, (VMINUS_PIN.y + VMINUS_GND_Y) / 2, "R_1", r1Val);
  svg += groundSymbol(R1_COL_X, VMINUS_GND_Y);

  // ── V+ 양피드백 path: V_out ── R_a ── n_Z1 ── C_a ── V+
  //                                                    │
  //                                                  R_b ∥ C_b
  //                                                    │
  //                                                   GND
  // V+ stub: pin → 왼쪽 (VPLUS_COL_X)
  svg += line(VPLUS_PIN.x, VPLUS_PIN.y, VPLUS_COL_X, VPLUS_PIN.y);
  svg += textLabel(VPLUS_COL_X - 22, VPLUS_PIN.y + 14, "V+", "start", 13);
  // V+ junction: down to RC chain row (and down further to R_b∥C_b)
  svg += line(VPLUS_COL_X, VPLUS_PIN.y, VPLUS_COL_X, VPLUS_BRANCH_Y);
  svg += dot(VPLUS_COL_X, VPLUS_PIN.y);
  // V+ junction at RC chain row
  svg += dot(VPLUS_COL_X, RC_CHAIN_Y);
  // RC chain: VPLUS_COL_X → C_a → n_Z1 → R_a → VOUT_COL_X (at RC_CHAIN_Y)
  // C_a horizontal: x from VPLUS_COL_X to a bit right
  const caCx = (VPLUS_COL_X + N_Z1_X) / 2;
  const raCx = (N_Z1_X + VOUT_COL_X) / 2;
  svg += line(VPLUS_COL_X, RC_CHAIN_Y, caCx - 20, RC_CHAIN_Y);
  svg += capacitorH(caCx, RC_CHAIN_Y, "C_a", caVal);
  svg += line(caCx + 20, RC_CHAIN_Y, N_Z1_X, RC_CHAIN_Y);
  svg += dot(N_Z1_X, RC_CHAIN_Y);
  svg += textLabel(N_Z1_X, RC_CHAIN_Y - 8, "n_Z1", "middle", 10);
  svg += line(N_Z1_X, RC_CHAIN_Y, raCx - 20, RC_CHAIN_Y);
  svg += resistorH(raCx, RC_CHAIN_Y, "R_a", raVal);
  svg += line(raCx + 20, RC_CHAIN_Y, VOUT_COL_X, RC_CHAIN_Y);
  // RC chain right end joins Vout column (down from OPAMP output)
  svg += line(VOUT_COL_X, VOUT_PIN.y, VOUT_COL_X, RC_CHAIN_Y);
  svg += dot(VOUT_COL_X, RC_CHAIN_Y);
  // V+ → R_b ∥ C_b → GND
  // V+ continues from RC junction down to R_b/C_b common top rail
  svg += line(VPLUS_COL_X, RC_CHAIN_Y, VPLUS_COL_X, VPLUS_BRANCH_Y);
  // Common top rail at VPLUS_BRANCH_Y between RB_COL_X and CB_COL_X
  svg += line(RB_COL_X, VPLUS_BRANCH_Y, CB_COL_X, VPLUS_BRANCH_Y);
  svg += dot(VPLUS_COL_X, VPLUS_BRANCH_Y);
  // R_b vertical: VPLUS_BRANCH_Y → VPLUS_GND_Y at RB_COL_X
  svg += line(RB_COL_X, VPLUS_BRANCH_Y, RB_COL_X, VPLUS_GND_Y);
  svg += resistorV(RB_COL_X, (VPLUS_BRANCH_Y + VPLUS_GND_Y) / 2, "R_b", rbVal);
  svg += groundSymbol(RB_COL_X, VPLUS_GND_Y);
  // C_b vertical
  svg += line(CB_COL_X, VPLUS_BRANCH_Y, CB_COL_X, VPLUS_GND_Y);
  svg += capacitorV(CB_COL_X, (VPLUS_BRANCH_Y + VPLUS_GND_Y) / 2, "C_b", cbVal);
  svg += groundSymbol(CB_COL_X, VPLUS_GND_Y);

  svg += `</svg>`;
  return svg;
}
