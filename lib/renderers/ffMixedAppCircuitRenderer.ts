/**
 * 임용 9번 (가) — T 플립플롭(위) + JK 플립플롭(아래) 세로 스택 + 조합부 전용 fixed-slot 렌더러.
 *  원본 배치 재현: T_A→[T-FF] (상단), J_B·K_B→[JK-FF] (하단), 공통 CLK, Q_A·Q_B 우측 출력.
 *  각 FF 입력은 좌측 조합 게이트(XOR/AND/OR) 또는 직결(WIRE)로 구동. 게이트 입력핀은
 *  신호명(X·Q_A·Q_B) 라벨 + 보수는 버블(○)로 표기. Q_A·Q_B는 좌측 피드백 버스로 되돌림.
 */
import type { FfMixedAppCircuitDiagram, FfMixedAppGateSpec } from "@/types";

const S = 'stroke="#111827" fill="none" stroke-width="1.6"';   // 선
const SK = 'stroke="#111827" stroke-width="1.6"';              // 채움 도형(fill 개별)
const wire = (x1: number, y1: number, x2: number, y2: number) => `<path d="M ${x1} ${y1} L ${x2} ${y2}" ${S}/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.1" fill="#111827"/>`;
const bubble = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="4" fill="white" ${SK}/>`;
const txt = (x: number, y: number, s: string, a = "start", c = "#1e3a8a", sz = 13) =>
  `<text x="${x}" y="${y}" font-size="${sz}" font-family="sans-serif" fill="${c}" text-anchor="${a}">${s}</text>`;

// ── 레이아웃 좌표 ──
const XR = 60, QAR = 92, QBR = 124;          // 좌측 소스/피드백 세로 레일 (X · Q_A · Q_B)
const G_L = 250, G_R = 320, G_MID = 285;     // 게이트 입력면·출력면·중앙
const TA_CY = 130, JB_CY = 300, KB_CY = 362; // 게이트 중심 y
const FF_L = 480, FF_R = 560;                // FF 박스
const TFF_CY = 130, JKFF_CY = 330;           // FF 중심 y
const OUT_X = 660, TOP_RAIL = 46, BOT_RAIL = 452, CLK_Y = 452;

/** 신호명에서 보수 여부·베이스 반환. "Q_A'" → {base:"Q_A", inv:true} */
function sig(name: string): { base: string; inv: boolean } {
  const inv = name.endsWith("'");
  return { base: inv ? name.slice(0, -1) : name, inv };
}
function railX(base: string): number {
  if (base === "X") return XR;
  if (base === "Q_A") return QAR;
  return QBR; // Q_B
}

/** 조합 게이트(또는 직결) 렌더 + 출력 y 반환. 입력은 좌측 레일에서 급전(보수는 버블). */
function gate(spec: FfMixedAppGateSpec, cy: number, outToX: number, outToY: number): string {
  let s = "";
  const ins = spec.inputs;
  if (spec.op === "WIRE") {
    // 단일 신호 직결 — 레일 → FF 입력. 보수면 NOT 게이트(삼각형+버블).
    const { base, inv } = sig(ins[0]);
    const rx = railX(base);
    s += dot(rx, cy);
    if (inv) {
      // NOT: 작은 삼각형
      const nx = G_MID;
      s += wire(rx, cy, nx - 16, cy);
      s += `<polygon points="${nx - 16},${cy - 10} ${nx - 16},${cy + 10} ${nx + 4},${cy}" fill="white" ${SK}/>`;
      s += bubble(nx + 8, cy);
      s += wire(nx + 12, cy, outToX, cy);
      if (outToY !== cy) { s += wire(outToX - 20, cy, outToX - 20, outToY); }
    } else {
      s += wire(rx, cy, outToX, cy);
    }
    if (outToY !== cy) { s += wire(outToX, cy, outToX, outToY); }
    return s;
  }

  // 2-입력 게이트 몸통
  const top = cy - 22, bot = cy + 22, gx = G_L;
  if (spec.op === "AND") {
    s += `<path d="M ${gx} ${top} L ${gx + 34} ${top} A 22 22 0 0 1 ${gx + 34} ${bot} L ${gx} ${bot} Z" fill="white" ${SK}/>`;
  } else if (spec.op === "OR") {
    s += `<path d="M ${gx} ${top} Q ${gx + 26} ${top} ${gx + 56} ${cy} Q ${gx + 26} ${bot} ${gx} ${bot} Q ${gx + 16} ${cy} ${gx} ${top} Z" fill="white" ${SK}/>`;
  } else { // XOR
    s += `<path d="M ${gx + 4} ${top} Q ${gx + 30} ${top} ${gx + 60} ${cy} Q ${gx + 30} ${bot} ${gx + 4} ${bot} Q ${gx + 20} ${cy} ${gx + 4} ${top} Z" fill="white" ${SK}/>`;
    s += `<path d="M ${gx - 4} ${top} Q ${gx + 12} ${cy} ${gx - 4} ${bot}" ${S}/>`;
  }
  const outX = spec.op === "OR" || spec.op === "XOR" ? gx + (spec.op === "XOR" ? 60 : 56) : gx + 56;
  // 입력핀 2개
  const pinYs = [cy - 11, cy + 11];
  ins.slice(0, 2).forEach((name, i) => {
    const { base, inv } = sig(name);
    const rx = railX(base);
    const py = pinYs[i];
    const pinX = spec.op === "XOR" ? gx - 4 : gx;
    s += dot(rx, py);
    if (inv) {
      s += wire(rx, py, pinX - 8, py);
      s += bubble(pinX - 4, py);
    } else {
      s += wire(rx, py, pinX, py);
    }
    s += txt(rx + 6, py - 4, name, "start", "#7c3aed", 11);
  });
  // 게이트 출력 → FF 입력
  s += wire(outX, cy, outToX, cy);
  if (outToY !== cy) { s += wire(outToX, cy, outToX, outToY); }
  return s;
}

/** T 플립플롭 박스 (상단). */
function tff(): string {
  const cy = TFF_CY, top = cy - 34, bot = cy + 34;
  let s = `<rect x="${FF_L}" y="${top}" width="${FF_R - FF_L}" height="${bot - top}" fill="white" ${SK}/>`;
  s += txt((FF_L + FF_R) / 2, top - 8, "T-FF", "middle", "#6b7280", 12);
  s += txt(FF_L + 8, cy + 5, "T", "start", "#111827", 13);
  s += txt(FF_R - 8, cy - 8, "Q", "end", "#111827", 13);
  s += txt(FF_R - 8, cy + 18, "Q'", "end", "#6b7280", 11);
  s += `<path d="M ${FF_L} ${bot - 16} L ${FF_L + 11} ${bot - 10} L ${FF_L} ${bot - 4}" ${S}/>`; // CLK ▷
  return s;
}
/** JK 플립플롭 박스 (하단). */
function jkff(): string {
  const cy = JKFF_CY, top = cy - 40, bot = cy + 40;
  let s = `<rect x="${FF_L}" y="${top}" width="${FF_R - FF_L}" height="${bot - top}" fill="white" ${SK}/>`;
  s += txt((FF_L + FF_R) / 2, top - 8, "JK-FF", "middle", "#6b7280", 12);
  s += txt(FF_L + 8, cy - 10, "J", "start", "#111827", 13);
  s += txt(FF_L + 8, cy + 22, "K", "start", "#111827", 13);
  s += txt(FF_R - 8, cy - 6, "Q", "end", "#111827", 13);
  s += `<path d="M ${FF_L} ${bot - 16} L ${FF_L + 11} ${bot - 10} L ${FF_L} ${bot - 4}" ${S}/>`; // CLK ▷
  return s;
}

export function renderFfMixedAppCircuit(d: FfMixedAppCircuitDiagram): string {
  let s = "";

  // ── FF 박스 (세로 스택) ──
  s += tff();
  s += jkff();

  // ── 조합부 게이트 → FF 입력 ──
  const T_PIN_Y = TFF_CY;           // T 입력핀 y
  const J_PIN_Y = JKFF_CY - 16;     // J 입력핀 y
  const K_PIN_Y = JKFF_CY + 16;     // K 입력핀 y
  s += gate(d.taGate, TA_CY, FF_L, T_PIN_Y);   // T_A → T
  s += gate(d.jbGate, JB_CY, FF_L, J_PIN_Y);   // J_B → J
  s += gate(d.kbGate, KB_CY, FF_L, K_PIN_Y);   // K_B → K
  // FF 입력 라벨
  s += txt(FF_L - 24, T_PIN_Y - 5, "T_A", "middle", "#1e3a8a", 11);
  s += txt(FF_L - 24, J_PIN_Y - 5, "J_B", "middle", "#1e3a8a", 11);
  s += txt(FF_L - 24, K_PIN_Y + 14, "K_B", "middle", "#1e3a8a", 11);

  // ── X 외부 입력 → X 레일 ──
  s += txt(24, 130, "X", "start", "#111827", 14);
  s += dot(40, 130);
  s += wire(40, 130, XR, 130);
  s += wire(XR, TOP_RAIL, XR, BOT_RAIL);          // X 세로 레일
  s += txt(XR - 4, TOP_RAIL - 4, "X", "end", "#111827", 11);

  // ── Q_A·Q_B 출력 + 좌측 피드백 레일 ──
  // T-FF Q → 출력
  s += wire(FF_R, TFF_CY - 8, OUT_X, TFF_CY - 8); s += dot(OUT_X, TFF_CY - 8);
  s += txt(OUT_X + 8, TFF_CY - 4, "Q_A", "start", "#dc2626", 13);
  // JK-FF Q → 출력
  s += wire(FF_R, JKFF_CY - 6, OUT_X, JKFF_CY - 6); s += dot(OUT_X, JKFF_CY - 6);
  s += txt(OUT_X + 8, JKFF_CY - 2, "Q_B", "start", "#dc2626", 13);

  // Q_A 피드백: 출력 → 상단 마진 → 좌측 Q_A 레일
  s += wire(OUT_X, TFF_CY - 8, OUT_X, TOP_RAIL);
  s += wire(OUT_X, TOP_RAIL, QAR, TOP_RAIL);
  s += wire(QAR, TOP_RAIL, QAR, KB_CY + 20);      // Q_A 세로 레일 (게이트 영역까지)
  s += txt(QAR + 4, TOP_RAIL - 4, "Q_A", "start", "#dc2626", 11);
  // Q_B 피드백: 출력 → 하단 마진 → 좌측 Q_B 레일
  s += wire(OUT_X, JKFF_CY - 6, OUT_X, BOT_RAIL - 24);
  s += wire(OUT_X, BOT_RAIL - 24, QBR, BOT_RAIL - 24);
  s += wire(QBR, BOT_RAIL - 24, QBR, TA_CY - 20);  // Q_B 세로 레일
  s += txt(QBR + 4, TA_CY - 22, "Q_B", "start", "#dc2626", 11);

  // ── 공통 CLK → 두 FF ▷ ──
  s += txt(24, CLK_Y + 4, "CLK", "start", "#111827", 13);
  s += dot(56, CLK_Y);
  const clkX = FF_L - 34;
  s += wire(56, CLK_Y, clkX, CLK_Y);
  s += wire(clkX, CLK_Y, clkX, TFF_CY + 34 - 10);
  for (const [cy, off] of [[TFF_CY, 34], [JKFF_CY, 40]] as const) {
    const py = cy + off - 10;
    s += wire(clkX, py, FF_L, py);
    s += dot(clkX, py);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 760 490">${s}</svg>`;
}
