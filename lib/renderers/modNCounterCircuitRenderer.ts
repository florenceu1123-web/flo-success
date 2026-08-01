import type { ModNCounterCircuitDiagram } from "@/types";

/**
 * mod-N 동기식 카운터 회로 (임용 9번) — 전용 fixed-slot 렌더러.
 *   FF1(T)·FF2(D)·FF3(T) 가로 배치 + 공통 CLK 버스 + 하단 CLR 라인 + 좌하단 검출 게이트 ⓒ.
 *   ⓒ의 입력은 Q₁·Q₂·Q₃(검출 상태의 0 비트는 반전 표기), 출력은 CLR 라인으로.
 *
 * ★ 자동 라우터(logic_network)는 CLR·되먹임이 얽힌 이 구조를 스파게티로 그린다 → 고정 슬롯.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const W = 760, H = 400;
const FW = 110, FH = 96;          // FF 박스
const FY = 90;                    // FF y
const FX = [150, 330, 510];       // FF x (3개)
const Y_FB = 46;                  // 상단 되먹임 레인 (인버터 출력 → FF1 입력)
const Y_CLK = 250;                // 공통 CLK 버스
const Y_CLR = 320;                // CLR 라인
const SUB = ["₁", "₂", "₃"];

export function renderModNCounterCircuit(d: ModNCounterCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const types = d.ffTypes ?? ["T", "D", "T"];
  const detect = d.detectState ?? "111";

  // ── 플립플롭 3개 (입력 핀 y, 출력 핀 y 공통)
  const yIn = FY + 30, yQ = FY + 30;
  types.forEach((ty, i) => {
    const x = FX[i];
    s.push(`<rect x="${x}" y="${FY}" width="${FW}" height="${FH}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    t.push(text(x + FW / 2, FY - 8, `FF${i + 1}`, { size: 11.5, weight: 700, fill: MUTED }));
    t.push(text(x + 14, yIn, `${ty}${SUB[i]}`, { size: 13, weight: 700, anchor: "start" }));
    t.push(text(x + FW - 14, yQ, `Q${SUB[i]}`, { size: 13, weight: 700, anchor: "end", fill: ACCENT }));
    // 클럭 삼각형 + CLR 핀
    const cy = FY + FH - 24;
    s.push(`<path d="M${x},${cy - 7} L${x + 12},${cy} L${x},${cy + 7} Z" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    t.push(text(x + 16, FY + FH - 8, "CLR", { size: 9.5, weight: 600, anchor: "start", fill: MUTED }));
    // CLK 버스 → 클럭 핀
    w.push(line(x - 18, Y_CLK, x - 18, cy), line(x - 18, cy, x, cy));
    s.push(dot(x - 18, Y_CLK));
    // CLR 라인 → CLR 핀 (박스 하단)
    w.push(line(x + 24, Y_CLR, x + 24, FY + FH));
    s.push(dot(x + 24, Y_CLR));
  });

  // ── ★ 단수 간 연결 (2026-07-30 사용자 지적: 원본은 세 FF가 **직렬로 이어져** 있는데
  //    박스만 그리고 배선을 빠뜨렸다). Q₁ → 다음 단 입력, Q₂ → 그다음 단 입력.
  for (let i = 0; i < 2; i++) {
    const xFrom = FX[i] + FW, xTo = FX[i + 1];
    w.push(line(xFrom, yQ, xTo, yIn));
    s.push(dot(xFrom, yQ));
  }
  // ── Q₃ → 인버터 → 상단 되먹임 레인 → FF1 입력 (원본의 우측 인버터 + 좌측 귀환)
  const xInvIn = FX[2] + FW, xInv = xInvIn + 40;
  w.push(line(xInvIn, yQ, xInv, yQ));
  s.push(dot(xInvIn, yQ));
  //   인버터 삼각형 + 버블
  s.push(`<path d="M${xInv},${yQ - 14} L${xInv + 26},${yQ} L${xInv},${yQ + 14} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<circle cx="${xInv + 30}" cy="${yQ}" r="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  const xInvOut = xInv + 34;
  w.push(line(xInvOut, yQ, xInvOut + 20, yQ), line(xInvOut + 20, yQ, xInvOut + 20, Y_FB));
  w.push(line(xInvOut + 20, Y_FB, FX[0] - 40, Y_FB), line(FX[0] - 40, Y_FB, FX[0] - 40, yIn), line(FX[0] - 40, yIn, FX[0], yIn));
  t.push(text((FX[0] + xInvOut) / 2, Y_FB - 8, `Q̅${SUB[2]} 되먹임`, { size: 10.5, weight: 600, fill: ACCENT }));

  // ── 공통 CLK 버스 · CLR 라인
  w.push(line(60, Y_CLK, 690, Y_CLK));
  s.push(term(60, Y_CLK));
  t.push(text(52, Y_CLK + 4, "CLK", { size: 12, weight: 700, anchor: "end" }));
  w.push(line(60, Y_CLR, 690, Y_CLR));
  // ★ 라벨은 선 **위쪽**에 (오른쪽 끝에 두면 캔버스를 넘어 잘린다 — 실측).
  t.push(text(690, Y_CLR - 8, d.clearActiveLow ? "CLR (active-low)" : "CLR (active-high)", { size: 10, fill: MUTED, anchor: "end" }));

  // ── 검출 게이트 ⓒ (좌하단) — 입력 Q₁Q₂Q₃, 출력 → CLR 라인
  const gx = 96, gy = Y_CLR - 46, gw = 56, gh = 52;
  s.push(`<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="6" fill="white" stroke="${ACCENT}" stroke-width="1.8" stroke-dasharray="5 3"/>`);
  t.push(text(gx + gw / 2, gy + gh / 2 + 6, d.gateLabel ?? "ⓒ", { size: 18, weight: 700, fill: ACCENT }));
  detect.split("").forEach((bit, i) => {
    const y = gy + 12 + i * 14;
    w.push(line(gx - 44, y, gx, y));
    t.push(text(gx - 48, y + 4, `${bit === "0" ? "Q̅" : "Q"}${SUB[i]}`, { size: 10.5, weight: 600, anchor: "end", fill: STROKE }));
    if (bit === "0") s.push(`<circle cx="${gx - 5}" cy="${y}" r="3.5" fill="white" stroke="${ACCENT}" stroke-width="1.2"/>`);
  });
  w.push(line(gx + gw, gy + gh / 2, gx + gw + 20, gy + gh / 2), line(gx + gw + 20, gy + gh / 2, gx + gw + 20, Y_CLR));
  s.push(dot(gx + gw + 20, Y_CLR));

  t.push(text(W / 2, H - 12, `mod-${d.modulus ?? "N"} 카운터 — 상태 ${detect} 검출 시 CLR로 000 리셋`, { size: 10, fill: MUTED }));
  t.push(text(W / 2, H - 28, "ⓒ: 미사용 상태 검출 게이트 (학생이 도출)", { size: 10, fill: RED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────── 헬퍼 ───────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
}
function term(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function svg(body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.join("\n")}\n</svg>`;
}
