import type { OpampSummerCircuitDiagram } from "@/types";

/**
 * 2-OPAMP 아날로그 가산기 (반전 가산기 → 반전 증폭) 전용 fixed-slot 렌더러.
 *  U₁: v₁─R─┐, v₂─R─┤(−) ─Rf─ out₁,  (+)=GND  → v_m = −(v₁+v₂)
 *  U₂: v_m ─R─(−) ─Rf─ out₂,  (+)=GND         → v₀ = −v_m = v₁+v₂
 *  ★ 모든 저항 = R (동일). op-amp 2개.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const DOT_R = 3.4;
const BLUE = "#1d4ed8";

const SVG_W = 780;
const SVG_H = 380;

// U1
const U1LX = 250, U1APEX = 340, U1Y = 150;
const U1M = U1Y - 20, U1P = U1Y + 20;   // (−) 위, (+) 아래
const SUMX = 210;                        // 가산 노드 X (U1 (−) 앞)
const V1X = 60, V1Y = 110;               // v₁ 입력
const V2X = 60, V2Y = 190;               // v₂ 입력
const R1AX = 110, R1BX = 190;            // v₁·v₂ 입력 저항 (수평)
const FB1Y = 70;                          // U1 피드백 상단
const FB1RX = 400;                        // U1 피드백 우측 세로

// U2
const U2LX = 500, U2APEX = 590, U2Y = 150;
const U2M = U2Y - 20, U2P = U2Y + 20;
const SUMX2 = 460;                        // U2 (−) 앞 노드
const R3AX = 400, R3BX = 445;            // v_m → U2 입력 저항
const FB2Y = 70, FB2RX = 650;
const VOX = 720;

type D = OpampSummerCircuitDiagram;

export function renderOpampSummerCircuit(d: D): string {
  const p: string[] = [];

  // ── U1: 반전 가산기 ──
  // v₁ → R → 가산노드
  p.push(line(V1X, V1Y, R1AX, V1Y));
  p.push(line(R1BX, V1Y, SUMX, V1Y));
  p.push(line(SUMX, V1Y, SUMX, U1M));
  // v₂ → R → 가산노드
  p.push(line(V2X, V2Y, R1AX, V2Y));
  p.push(line(R1BX, V2Y, SUMX, V2Y));
  p.push(line(SUMX, V2Y, SUMX, U1M));
  // 가산노드 → U1 (−)
  p.push(line(SUMX, U1M, U1LX, U1M));
  // U1 (+) → GND
  p.push(line(U1LX, U1P, U1LX - 30, U1P));
  p.push(gndSymbol(U1LX - 30, U1P + 6));
  // U1 피드백 Rf: (−)노드 → 위 → Rf → 우 → out
  p.push(line(SUMX, U1M, SUMX, FB1Y));
  p.push(line(SUMX, FB1Y, 300, FB1Y));         // Rf1 좌 리드
  p.push(line(370, FB1Y, FB1RX, FB1Y));        // Rf1 우 리드
  p.push(line(FB1RX, FB1Y, FB1RX, U1Y));       // → out1 rail
  // U1 out → v_m 노드(=U2 입력 저항 앞)
  p.push(line(U1APEX, U1Y, FB1RX, U1Y));

  // ── U2: 반전 단위증폭 ──
  // v_m(=out1) → R → U2 (−)
  p.push(line(FB1RX, U1Y, R3AX, U1Y));
  p.push(line(R3BX, U1Y, SUMX2, U1Y));
  p.push(line(SUMX2, U1Y, SUMX2, U2M));
  p.push(line(SUMX2, U2M, U2LX, U2M));
  // U2 (+) → GND
  p.push(line(U2LX, U2P, U2LX - 30, U2P));
  p.push(gndSymbol(U2LX - 30, U2P + 6));
  // U2 피드백 Rf
  p.push(line(SUMX2, U2M, SUMX2, FB2Y));
  p.push(line(SUMX2, FB2Y, 550, FB2Y));
  p.push(line(620, FB2Y, FB2RX, FB2Y));
  p.push(line(FB2RX, FB2Y, FB2RX, U2Y));
  // U2 out → v₀
  p.push(line(U2APEX, U2Y, VOX, U2Y));

  // ── 심볼 ──
  p.push(opamp(U1LX, U1APEX, U1Y, "U₁"));
  p.push(opamp(U2LX, U2APEX, U2Y, "U₂"));
  p.push(resistorH(R1AX, R1BX, V1Y));   // R (v₁)
  p.push(resistorH(R1AX, R1BX, V2Y));   // R (v₂)
  p.push(resistorH(300, 370, FB1Y));    // Rf1
  p.push(resistorH(R3AX, R3BX, U1Y));   // R (v_m)
  p.push(resistorH(550, 620, FB2Y));    // Rf2

  // ── 노드 dot ──
  p.push(dot(SUMX, U1M), dot(FB1RX, U1Y), dot(SUMX2, U2M));

  // ── 단자·라벨 ──
  p.push(openTerminal(V1X, V1Y), openTerminal(V2X, V2Y), openTerminal(VOX, U2Y));
  p.push(text(V1X - 8, V1Y + 5, d.v1Label, { size: 13, weight: 700, anchor: "end", fill: BLUE }));
  p.push(text(V2X - 8, V2Y + 5, d.v2Label, { size: 13, weight: 700, anchor: "end", fill: BLUE }));
  p.push(text(VOX + 8, U2Y + 5, d.voLabel, { size: 13, weight: 700, anchor: "start", fill: BLUE }));
  p.push(text((FB1RX + R3AX) / 2, U1Y - 8, "v_m", { size: 11, weight: 600, fill: "#7c3aed" }));
  // 저항 라벨 (모두 R)
  p.push(text((R1AX + R1BX) / 2, V1Y - 8, d.rLabel, { size: 11, weight: 600 }));
  p.push(text((R1AX + R1BX) / 2, V2Y + 20, d.rLabel, { size: 11, weight: 600 }));
  p.push(text(335, FB1Y - 8, d.rLabel, { size: 11, weight: 600 }));
  p.push(text((R3AX + R3BX) / 2, U1Y - 8, d.rLabel, { size: 11, weight: 600 }));
  p.push(text(585, FB2Y - 8, d.rLabel, { size: 11, weight: 600 }));
  // 단 설명
  p.push(text(U1LX + 40, U1Y + 54, "반전 가산기", { size: 10, fill: "#6b7280" }));
  p.push(text(U2LX + 40, U2Y + 54, "반전 증폭기", { size: 10, fill: "#6b7280" }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function opamp(leftX: number, apexX: number, cy: number, label: string): string {
  const half = 38;
  const tri = `<polygon points="${leftX},${cy - half} ${leftX},${cy + half} ${apexX},${cy}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const minus = `<text x="${leftX + 12}" y="${cy - 12}" text-anchor="start" font-size="15" fill="${STROKE}">−</text>`;
  const plus = `<text x="${leftX + 12}" y="${cy + 24}" text-anchor="start" font-size="13" fill="${STROKE}">+</text>`;
  const lab = `<text x="${(leftX + apexX) / 2 + 6}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${STROKE}">${label}</text>`;
  return tri + minus + plus + lab;
}
function openTerminal(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function gndSymbol(cx: number, y: number): string {
  return `<g stroke="${STROKE}" stroke-width="${WIRE_W}">` +
    `<line x1="${cx}" y1="${y - 6}" x2="${cx}" y2="${y}"/>` +
    `<line x1="${cx - 9}" y1="${y}" x2="${cx + 9}" y2="${y}"/>` +
    `<line x1="${cx - 5}" y1="${y + 4}" x2="${cx + 5}" y2="${y + 4}"/>` +
    `<line x1="${cx - 2}" y1="${y + 8}" x2="${cx + 2}" y2="${y + 8}"/></g>`;
}

const R_AMP = 6, R_TEETH = 6, R_PAD = 8;
function resistorH(x0: number, x1: number, y: number): string {
  const xa = x0 + R_PAD, xb = x1 - R_PAD, seg = (xb - xa) / R_TEETH;
  const pts: Array<[number, number]> = [[x0, y], [xa, y]];
  for (let i = 0; i < R_TEETH; i++) pts.push([xa + seg * (i + 0.5), y + (i % 2 === 0 ? -R_AMP : R_AMP)]);
  pts.push([xb, y], [x1, y]);
  return `<polyline points="${pts.map((q) => `${q[0]},${q[1]}`).join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}
function text(
  x: number, y: number, s: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  return `<text x="${x}" y="${y}" text-anchor="${opts.anchor ?? "middle"}" font-size="${opts.size ?? 12}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? STROKE}">${escapeSvg(s)}</text>`;
}
function escapeSvg(s: string): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
