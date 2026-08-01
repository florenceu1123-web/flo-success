import type { JkExcitationCircuitDiagram } from "@/types";

/**
 * JK-FF 2개 + 조합 논리 블록 ㉲ 순서 논리 회로 (2025 전기 A-8) — 전용 fixed-slot 렌더러.
 *
 *  원본 배치:
 *      x ─┐
 *          [㉲ 조합 논리]──J_A──▶┌ FF_A ┐──Q_A──┐
 *          (점선 박스)  ──K_A──▶└──▷CLK┘        │
 *      HIGH ─┬──J_B──▶┌ FF_B ┐──Q_B──┐          │
 *            └──K_B──▶└──▷CLK┘       │          │
 *      CLK ──────────────(공통 버스)──┴──────────┴──▶ ㉲로 되먹임(하단 레인)
 *
 *  ★ 자동 라우터(logic_network)는 되먹임이 많은 이 구조를 스파게티로 그린다(실측 신고) →
 *    고정 슬롯 + 되먹임 전용 레인으로 배선을 결정론적으로 그린다.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const GREEN = "#047857";
const MUTED = "#6b7280";

const W = 720, H = 400;
// 슬롯
const X_IN = 40;                 // 입력 x 단자
const BX = 150, BY = 70, BW = 130, BH = 120;   // ㉲ 조합 논리 블록
const FX = 360, FW = 120, FH = 96;             // 플립플롭 박스 x·폭·높이
const FAY = 60, FBY = 210;                     // FF_A / FF_B y
const X_OUT = 620;               // 출력 Q 라인 우측 끝
const Y_CLK = 350;               // 공통 CLK 버스
const Y_FBA = 320, Y_FBB = 300;  // Q_A·Q_B 되먹임 레인

export function renderJkExcitationCircuit(d: JkExcitationCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const block = d.blockLabel || "㉲";

  // ── 조합 논리 블록 ㉲ (점선)
  s.push(`<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-dasharray="6 4"/>`);
  t.push(text(BX + BW / 2, BY + BH / 2 + 6, block, { size: 20, weight: 700, fill: ACCENT }));
  t.push(text(BX + BW / 2, BY - 10, "조합 논리 회로", { size: 10, fill: MUTED }));

  // ── 입력 x → 블록
  s.push(term(X_IN, BY + 30));
  t.push(text(X_IN - 10, BY + 34, d.inputLabel || "x", { size: 13, weight: 700, anchor: "end" }));
  w.push(line(X_IN, BY + 30, BX, BY + 30));

  // ── 블록 출력 J_A·K_A → FF_A (★ 직교 라우팅 — 대각선은 다른 배선과 교차해 지저분해진다)
  const jaY = FAY + 26, kaY = FAY + 62;
  const xJa = BX + BW + 26, xKa = BX + BW + 46;
  w.push(line(BX + BW, BY + 34, xJa, BY + 34), line(xJa, BY + 34, xJa, jaY), line(xJa, jaY, FX, jaY));
  w.push(line(BX + BW, BY + 86, xKa, BY + 86), line(xKa, BY + 86, xKa, kaY), line(xKa, kaY, FX, kaY));
  t.push(text(xJa + 6, jaY - 8, "J_A", { size: 11, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(text(xKa + 6, kaY - 8, "K_A", { size: 11, weight: 700, fill: ACCENT, anchor: "start" }));

  // ── FF_A / FF_B
  ffBox(s, t, FX, FAY, d.ffALabel || "FF_A", "J_A", "K_A", "Q_A");
  ffBox(s, t, FX, FBY, d.ffBLabel || "FF_B", "J_B", "K_B", "Q_B");

  // ── HIGH → FF_B의 J_B·K_B
  const hx = BX + BW - 10, jbY = FBY + 26, kbY = FBY + 62;
  s.push(dot(hx, jbY));
  t.push(text(hx - 12, jbY + 4, d.highLabel || "HIGH", { size: 12, weight: 700, fill: GREEN, anchor: "end" }));
  w.push(line(hx, jbY, FX, jbY));
  w.push(line(hx, jbY, hx, kbY), line(hx, kbY, FX, kbY));

  // ── 공통 CLK 버스 → 두 FF의 ▷ 핀
  s.push(term(X_IN, Y_CLK));
  t.push(text(X_IN - 10, Y_CLK + 4, d.clockLabel || "CLK", { size: 12, weight: 700, anchor: "end" }));
  w.push(line(X_IN, Y_CLK, X_OUT, Y_CLK));
  // ★ 클럭 스텁은 FF 박스 **바로 옆**(FX−14/−28)에서만 올려 되먹임 레인과의 교차 구간을 최소화한다.
  const clkAY = FAY + FH - 18, clkBY = FBY + FH - 18;
  w.push(line(FX - 28, Y_CLK, FX - 28, clkAY), line(FX - 28, clkAY, FX, clkAY));
  w.push(line(FX - 14, Y_CLK, FX - 14, clkBY), line(FX - 14, clkBY, FX, clkBY));
  s.push(dot(FX - 28, Y_CLK), dot(FX - 14, Y_CLK));

  // ── 출력 Q_A·Q_B → 우측 단자 + 되먹임 레인 → ㉲ 좌측 입력
  const qAY = FAY + 26, qBY = FBY + 26;
  w.push(line(FX + FW, qAY, X_OUT, qAY));
  w.push(line(FX + FW, qBY, X_OUT, qBY));
  t.push(text(X_OUT + 12, qAY + 4, "Q_A", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  t.push(text(X_OUT + 12, qBY + 4, "Q_B", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  // 되먹임: Q_A·Q_B를 서로 다른 하단 레인으로 내려 좌측 별도 레인으로 돌아 블록 입력으로
  //   (레인 y·좌측 x를 분리해야 두 선이 겹치지 않는다 — 규칙 #3)
  feedback(w, X_OUT, qAY, Y_FBA, BX - 60, BX, BY + 62);
  feedback(w, X_OUT - 26, qBY, Y_FBB, BX - 36, BX, BY + 90);
  s.push(dot(X_OUT, qAY), dot(X_OUT - 26, qBY));
  t.push(text(BX - 6, BY + 56, "Q_A", { size: 10.5, weight: 600, fill: MUTED, anchor: "end" }));
  t.push(text(BX - 6, BY + 106, "Q_B", { size: 10.5, weight: 600, fill: MUTED, anchor: "end" }));

  t.push(text(W / 2, H - 8, "㉲의 출력 J_A·K_A가 FF_A를 구동, FF_B는 J_B=K_B=HIGH로 매 클럭 토글", { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

/** 되먹임 경로: (x0,y0) → 아래 레인(yLane) → 좌측 레인(xLeft) → 블록 입력(xIn,yIn) */
function feedback(w: string[], x0: number, y0: number, yLane: number, xLeft: number, xIn: number, yIn: number): void {
  w.push(line(x0, y0, x0, yLane));
  w.push(line(x0, yLane, xLeft, yLane));
  w.push(line(xLeft, yLane, xLeft, yIn));
  w.push(line(xLeft, yIn, xIn, yIn));
}

/** J-K 플립플롭 박스 (J·K 입력, ▷ 클럭, Q 출력) */
function ffBox(s: string[], t: string[], x: number, y: number, label: string, jLabel: string, kLabel: string, qLabel: string): void {
  s.push(`<rect x="${x}" y="${y}" width="${FW}" height="${FH}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(x + FW / 2, y - 8, label, { size: 11.5, weight: 700, fill: MUTED }));
  t.push(text(x + 14, y + 30, jLabel.startsWith("J") ? "J" : jLabel, { size: 13, weight: 700, anchor: "start" }));
  t.push(text(x + 14, y + 66, kLabel.startsWith("K") ? "K" : kLabel, { size: 13, weight: 700, anchor: "start" }));
  t.push(text(x + FW - 14, y + 30, "Q", { size: 13, weight: 700, anchor: "end" }));
  // 클럭 삼각형 (▷)
  const cy = y + FH - 18;
  s.push(`<path d="M${x},${cy - 8} L${x + 14},${cy} L${x},${cy + 8} Z" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  void qLabel;
}

function term(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4" fill="${STROKE}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
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
