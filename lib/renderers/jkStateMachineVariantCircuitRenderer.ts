import type { JkStateMachineVariantCircuitDiagram } from "@/types";

/**
 * 변형유형 JK 카운터 (가) — 단일신호 카운터에 2입력 게이트 1개 추가.
 *  고정 구조: J0=K0=1, J1=K1=(Q2/Q̄2 from FF2, 뒤로 피드백), J2=K2=gate(Q1,Q2)(FF2로).
 *  게이트는 FF1-FF2 사이에 배치, Q1(FF1)·Q2(FF2 자기귀환) 입력 → FF2 J·K.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";
const GCOL = "#0ea5e9";   // 게이트 관련 wire
const FBCOL = "#8b5cf6";  // Q̄2 피드백

const W = 940, H = 400;
const FF_W = 78, FF_H = 88;
const CY = 150;
const Y0 = CY - FF_H / 2;
const FF_X = [160, 450, 740];
const CP_Y = 350;
const jY = CY - 22, kY = CY + 22, qY = CY - 16, qbY = CY + 16;
const clkPinY = Y0 + FF_H - 14;
const GATE_X = 566, GATE_Y = 126, GATE_W = 54, GATE_H = 48; // FF1-FF2 사이 게이트
const FB_LANE = 50;   // Q̄2 상단 피드백 레인
const SELF_Y = 272;   // Q2 자기귀환 하단 채널

type D = JkStateMachineVariantCircuitDiagram;

export function renderJkStateMachineVariantCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];
  const invJ1 = d.j1k1.startsWith("n"); // Q̄2 여부

  const qNames = ["Q₀", "Q₁", "Q₂"];
  // ── FF 3개 ──
  FF_X.forEach((x, i) => {
    s.push(rect(x, Y0, FF_W, FF_H));
    t.push(text(x + FF_W / 2, Y0 - 6, "JK-FF", { size: 11, weight: 700, fill: MUTED }));
    t.push(text(x + 9, jY + 4, "J", { size: 12, weight: 600, anchor: "start" }));
    t.push(text(x + 9, kY + 4, "K", { size: 12, weight: 600, anchor: "start" }));
    t.push(text(x + FF_W - 9, qY + 4, "Q", { size: 12, weight: 600, anchor: "end" }));
    t.push(text(x + FF_W - 9, qbY + 4, "Q̄", { size: 11, weight: 600, anchor: "end", fill: MUTED }));
    s.push(clkTri(x, clkPinY));
    const qx = x + FF_W;
    w.push(line(qx, qY, qx + 14, qY));
    s.push(dot(qx + 14, qY));
    t.push(text(qx + 20, qY + 4, qNames[i], { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  });

  // ── J0=K0=1 (High) ──
  for (const y of [jY, kY]) {
    const sx = FF_X[0] - 30;
    w.push(line(sx, y, FF_X[0], y));
    t.push(text(sx - 4, y + 4, "1", { size: 11, weight: 700, anchor: "end" }));
  }

  // ── 게이트 (J2=K2=gate(Q1,Q2)) ──
  const gIn1Y = GATE_Y + 12, gIn2Y = GATE_Y + GATE_H - 12;
  const gOutX = GATE_X + GATE_W + 8, gOutY = GATE_Y + GATE_H / 2;
  s.push(gateShape(d.gateOp, GATE_X, GATE_Y, GATE_W, GATE_H));
  t.push(text(GATE_X + GATE_W / 2, GATE_Y - 5, d.gateOp, { size: 10, weight: 700, fill: GCOL }));

  // Q1 입력: FF1.Q → 게이트 위 입력
  const f1qx = FF_X[1] + FF_W;
  w.push(cline(f1qx, qY, GATE_X, gIn1Y, GCOL)); // 대각 아님 — 직교로
  // 직교 라우팅으로 교체
  w.pop();
  w.push(cline(f1qx, qY, GATE_X - 18, qY, GCOL));
  w.push(cline(GATE_X - 18, qY, GATE_X - 18, gIn1Y, GCOL));
  w.push(cline(GATE_X - 18, gIn1Y, GATE_X, gIn1Y, GCOL));
  t.push(text(GATE_X - 22, gIn1Y - 4, "Q₁", { size: 9, weight: 700, anchor: "end", fill: GCOL }));

  // Q2 입력(자기귀환): FF2.Q → 하단 채널 → 게이트 아래 입력
  const f2qx = FF_X[2] + FF_W + 14; // Q dot
  w.push(cline(f2qx, qY, f2qx, SELF_Y, GCOL));
  w.push(cline(f2qx, SELF_Y, GATE_X - 18, SELF_Y, GCOL));
  w.push(cline(GATE_X - 18, SELF_Y, GATE_X - 18, gIn2Y, GCOL));
  w.push(cline(GATE_X - 18, gIn2Y, GATE_X, gIn2Y, GCOL));
  t.push(text(GATE_X - 22, gIn2Y + 10, "Q₂", { size: 9, weight: 700, anchor: "end", fill: GCOL }));

  // 게이트 출력 → FF2 J·K (묶임)
  const apX = FF_X[2] - 24;
  w.push(cline(gOutX, gOutY, apX, gOutY, GCOL));
  w.push(cline(apX, Math.min(jY, gOutY), apX, Math.max(kY, gOutY), GCOL));
  w.push(cline(apX, jY, FF_X[2], jY, GCOL));
  w.push(cline(apX, kY, FF_X[2], kY, GCOL));

  // ── J1=K1 = Q2/Q̄2 (FF2 → FF1, 상단 피드백) ──
  const srcY = invJ1 ? qbY : qY;
  const srcTap = FF_X[2] + FF_W + 28;
  w.push(cline(FF_X[2] + FF_W, srcY, srcTap, srcY, FBCOL));
  s.push(cdot(srcTap, srcY, FBCOL));
  w.push(cline(srcTap, srcY, srcTap, FB_LANE, FBCOL));
  const f1ap = FF_X[1] - 24;
  w.push(cline(f1ap, FB_LANE, srcTap, FB_LANE, FBCOL));
  w.push(cline(f1ap, FB_LANE, f1ap, kY, FBCOL));
  w.push(cline(f1ap, jY, FF_X[1], jY, FBCOL));
  w.push(cline(f1ap, kY, FF_X[1], kY, FBCOL));
  if (invJ1) { bubble(FF_X[1], jY, FBCOL, s); bubble(FF_X[1], kY, FBCOL, s); }

  // ── 공통 CP ──
  t.push(text(44, CP_Y + 4, "CP", { size: 12, weight: 700, anchor: "end" }));
  w.push(line(50, CP_Y, FF_X[2] + 30, CP_Y));
  FF_X.forEach((x) => {
    w.push(line(x - 14, CP_Y, x - 14, clkPinY));
    w.push(line(x - 14, clkPinY, x, clkPinY));
    s.push(dot(x - 14, CP_Y));
  });

  t.push(text(W / 2, H - 8, `JK 카운터 (변형) — J₂·K₂를 ${d.gateOp}(Q₁, Q₂) 게이트로 구동. Q₀=LSB.`, { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function gateShape(op: string, x: number, y: number, w: number, h: number): string {
  const or = op === "OR" || op === "NOR" || op === "XOR" || op === "XNOR";
  const xr = op === "XOR" || op === "XNOR";
  const bub = op === "NAND" || op === "NOR" || op === "XNOR";
  let p = "";
  if (or) {
    p += `<path d="M ${x} ${y} Q ${x + w * 0.45} ${y - h * 0.05} ${x + w} ${y + h / 2} Q ${x + w * 0.45} ${y + h * 1.05} ${x} ${y + h} Q ${x + w * 0.22} ${y + h / 2} ${x} ${y} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
    if (xr) p += `<path d="M ${x - 6} ${y} Q ${x + w * 0.16} ${y + h / 2} ${x - 6} ${y + h}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  } else {
    p += `<path d="M ${x} ${y} L ${x + w / 2} ${y} Q ${x + w} ${y} ${x + w} ${y + h / 2} Q ${x + w} ${y + h} ${x + w / 2} ${y + h} L ${x} ${y + h} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  }
  if (bub) p += `<circle cx="${x + w + 5}" cy="${y + h / 2}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return p;
}
function bubble(x: number, y: number, col: string, s: string[]) {
  s.push(`<circle cx="${x - 5}" cy="${y}" r="4" fill="white" stroke="${col}" stroke-width="1.3"/>`);
}
function rect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function clkTri(x: number, cy: number): string {
  const h = 6;
  return `<polygon points="${x},${cy - h} ${x + 9},${cy} ${x},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string { return cline(x1, y1, x2, y2, STROKE); }
function cline(x1: number, y1: number, x2: number, y2: number, col: string): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string { return cdot(x, y, STROKE); }
function cdot(x: number, y: number, col: string): string { return `<circle cx="${x}" cy="${y}" r="3" fill="${col}"/>`; }
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
