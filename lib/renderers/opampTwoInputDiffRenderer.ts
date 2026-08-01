/**
 * 2입력 2-OPAMP 캐스케이드 (가) + 차동증폭기 (나) 전용 fixed-slot 렌더러 (임용 5번).
 *  (가): OP1 반전(V₂) → OP2 반전가산(out1·V₁) → V_o.
 *  (나): V₁→R_v1→(−), V₂→R₁→(+), (+)→R₂→GND, 피드백 R₂ → V_o. R₁·R₂는 설계 대상(점선).
 */
import type { OpampTwoInputCascadeDiagram, OpampTwoInputDiffDiagram } from "@/types";

const S = 'stroke="black" fill="none" stroke-width="2"';
const wire = (x1: number, y1: number, x2: number, y2: number) =>
  `<path d="M ${x1} ${y1} L ${x2} ${y2}" ${S}/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
const txt = (x: number, y: number, s: string, a = "start", c = "#1e3a8a", sz = 13) =>
  `<text x="${x}" y="${y}" font-size="${sz}" font-family="sans-serif" fill="${c}" text-anchor="${a}">${s}</text>`;

/** 수평 저항 (지그재그, 중심 cx, 폭 ±22). */
function resH(cx: number, cy: number): string {
  const pts = [
    [cx - 22, cy], [cx - 16, cy - 7], [cx - 6, cy + 7],
    [cx + 4, cy - 7], [cx + 14, cy + 7], [cx + 20, cy], [cx + 22, cy],
  ];
  return `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" ${S}/>`;
}
/** 미지 저항 점선 강조 박스 (수평). */
function dashBoxH(cx: number, cy: number): string {
  return `<rect x="${cx - 26}" y="${cy - 16}" width="52" height="32" fill="none" stroke="#7c3aed" stroke-width="1.4" stroke-dasharray="4 3"/>`;
}
/** OPAMP 삼각형 — 좌면 x=lx, 우 apex x=lx+w, 중심 cy. 입력 (−)위·(+)아래.
 *  반환: 핀 좌표. */
function opamp(lx: number, cy: number, label: string, w = 70, h = 58) {
  const rx = lx + w, top = cy - h / 2, bot = cy + h / 2;
  const dy = h / 4;
  const svg =
    `<polygon points="${lx},${top} ${lx},${bot} ${rx},${cy}" fill="white" stroke="black" stroke-width="2"/>` +
    txt(lx + 8, cy - dy + 4, "−", "start", "#000", 15) +
    txt(lx + 8, cy + dy + 5, "+", "start", "#000", 15) +
    txt(lx + w / 2, top - 6, label, "middle", "#1e3a8a", 12);
  return { svg, minus: { x: lx, y: cy - dy }, plus: { x: lx, y: cy + dy }, out: { x: rx, y: cy } };
}
/** 접지 심볼. */
function gnd(x: number, y: number): string {
  return wire(x, y, x, y + 10) +
    `<line x1="${x - 12}" y1="${y + 10}" x2="${x + 12}" y2="${y + 10}" ${S}/>` +
    `<line x1="${x - 7}" y1="${y + 15}" x2="${x + 7}" y2="${y + 15}" ${S}/>` +
    `<line x1="${x - 3}" y1="${y + 20}" x2="${x + 3}" y2="${y + 20}" ${S}/>`;
}

type Da = OpampTwoInputCascadeDiagram;
type Db = OpampTwoInputDiffDiagram;

/** (가) 2-OPAMP 캐스케이드. */
export function renderOpampTwoInputCascade(d: Da): string {
  const CY = 200;
  let s = "";
  // ── OP1 (반전, V₂) ──
  const O1 = opamp(250, CY, "OP1");
  // V₂ ─ Ri1 ─ nodeA ─ (−)OP1
  s += txt(40, CY - 30 + 4, "V₂", "start", "#dc2626", 14);
  s += wire(60, CY - 30, 118, CY - 30);
  s += resH(140, CY - 30); s += txt(140, CY - 42, "R", "middle", "#1e3a8a", 11); s += txt(140, CY - 30 + 20, `${d.Ri1}kΩ`, "middle", "#666", 11);
  s += wire(162, CY - 30, 220, CY - 30);         // → nodeA
  const AX = 220;
  s += dot(AX, CY - 30);
  // nodeA → (−)OP1: 세로 → 가로 (대각선 금지)
  s += wire(AX, CY - 30, AX, O1.minus.y);
  s += wire(AX, O1.minus.y, O1.minus.x, O1.minus.y);
  s += O1.svg;
  // (+)OP1 → GND
  s += wire(O1.plus.x, O1.plus.y, O1.plus.x - 20, O1.plus.y);
  s += gnd(O1.plus.x - 20, O1.plus.y);
  // 피드백 Rf1: nodeA ─ 위로 ─ Rf1 ─ out1
  const FBY1 = CY - 78;
  s += wire(AX, CY - 30, AX, FBY1);
  s += wire(AX, FBY1, 268, FBY1);
  s += resH(290, FBY1); s += txt(290, FBY1 - 10, "R", "middle", "#1e3a8a", 11); s += txt(290, FBY1 + 16, `${d.Ri1}kΩ`, "middle", "#666", 11);
  s += wire(312, FBY1, O1.out.x, FBY1); s += wire(O1.out.x, FBY1, O1.out.x, O1.out.y);
  s += dot(O1.out.x, O1.out.y);
  // out1 ─ Ra ─ nodeN
  s += wire(O1.out.x, CY, O1.out.x + 28, CY);
  s += resH(O1.out.x + 50, CY); s += txt(O1.out.x + 50, CY - 10, "R", "middle", "#1e3a8a", 11); s += txt(O1.out.x + 50, CY + 16, `${d.R0}kΩ`, "middle", "#666", 11);
  const NX = O1.out.x + 90;
  s += wire(O1.out.x + 72, CY, NX, CY);
  s += dot(NX, CY);
  // ── OP2 (반전가산) ──
  const O2 = opamp(NX + 40, CY, "OP2");
  s += wire(NX, CY, NX, O2.minus.y); s += wire(NX, O2.minus.y, O2.minus.x, O2.minus.y);
  // V₁ ─ Rb ─ nodeN (아래에서)
  const V1Y = CY + 70;
  s += txt(O1.out.x - 60, V1Y + 4, "V₁", "start", "#dc2626", 14);
  s += wire(O1.out.x - 40, V1Y, O1.out.x + 28, V1Y);
  s += resH(O1.out.x + 50, V1Y); s += txt(O1.out.x + 50, V1Y - 10, "R", "middle", "#1e3a8a", 11); s += txt(O1.out.x + 50, V1Y + 16, `${d.R0}kΩ`, "middle", "#666", 11);
  s += wire(O1.out.x + 72, V1Y, NX, V1Y); s += wire(NX, V1Y, NX, CY);
  s += O2.svg;
  // (+)OP2 → GND
  s += wire(O2.plus.x, O2.plus.y, O2.plus.x - 20, O2.plus.y);
  s += gnd(O2.plus.x - 20, O2.plus.y);
  // 피드백 Rf2: nodeN ─ 위로 ─ Rf2 ─ V_o
  const FBY2 = CY - 78;
  s += wire(NX, CY, NX, FBY2);
  s += wire(NX, FBY2, NX + 53, FBY2);
  s += resH(NX + 75, FBY2); s += txt(NX + 75, FBY2 - 10, "R_f", "middle", "#1e3a8a", 11); s += txt(NX + 75, FBY2 + 16, `${d.Rf2}kΩ`, "middle", "#666", 11);
  s += wire(NX + 97, FBY2, O2.out.x, FBY2); s += wire(O2.out.x, FBY2, O2.out.x, O2.out.y);
  s += dot(O2.out.x, O2.out.y);
  // V_o 출력
  s += wire(O2.out.x, CY, O2.out.x + 90, CY);
  s += dot(O2.out.x + 90, CY);
  s += txt(O2.out.x + 96, CY + 4, "V_o", "start", "#dc2626", 14);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 760 340">${s}</svg>`;
}

/** (나) 차동증폭기 (설계 대상 R₁·R₂). */
export function renderOpampTwoInputDiff(d: Db): string {
  const CY = 190;
  let s = "";
  const OP = opamp(320, CY, "OP", 76, 62);
  // V₁ ─ R_v1 ─ (−)
  s += txt(40, OP.minus.y + 4, "V₁", "start", "#dc2626", 14);
  s += wire(60, OP.minus.y, 148, OP.minus.y);
  s += resH(170, OP.minus.y); s += txt(170, OP.minus.y - 10, "R", "middle", "#1e3a8a", 11); s += txt(170, OP.minus.y + 16, `${d.Rv1}kΩ`, "middle", "#666", 11);
  s += wire(192, OP.minus.y, OP.minus.x, OP.minus.y);
  const MN = { x: 230, y: OP.minus.y };
  s += dot(MN.x, MN.y);
  // 피드백 R₂: (−)node ─ 위로 ─ R₂ ─ V_o
  const FBY = CY - 84;
  s += wire(MN.x, MN.y, MN.x, FBY);
  s += wire(MN.x, FBY, 348, FBY);
  s += dashBoxH(370, FBY);
  s += resH(370, FBY); s += txt(370, FBY - 12, "R₂", "middle", "#7c3aed", 12); s += txt(370, FBY + 18, "(?)", "middle", "#7c3aed", 11);
  s += wire(392, FBY, OP.out.x, FBY); s += wire(OP.out.x, FBY, OP.out.x, OP.out.y);
  // V₂ ─ R₁ ─ (+)
  s += txt(40, OP.plus.y + 4, "V₂", "start", "#dc2626", 14);
  s += wire(60, OP.plus.y, 148, OP.plus.y);
  s += dashBoxH(170, OP.plus.y);
  s += resH(170, OP.plus.y); s += txt(170, OP.plus.y - 12, "R₁", "middle", "#7c3aed", 12); s += txt(170, OP.plus.y + 18, "(?)", "middle", "#7c3aed", 11);
  s += wire(192, OP.plus.y, OP.plus.x, OP.plus.y);
  const PN = { x: 250, y: OP.plus.y };
  s += dot(PN.x, PN.y);
  // (+)node ─ R₂(세로) ─ GND (아래)
  const GY = CY + 96;
  const rvCy = (PN.y + (GY - 12)) / 2;   // 세로 저항 중심
  s += wire(PN.x, PN.y, PN.x, rvCy - 20);
  // 세로 지그재그 저항
  s += `<polyline points="${PN.x},${rvCy - 20} ${PN.x - 7},${rvCy - 14} ${PN.x + 7},${rvCy - 4} ${PN.x - 7},${rvCy + 6} ${PN.x + 7},${rvCy + 16} ${PN.x},${rvCy + 20}" ${S}/>`;
  s += `<rect x="${PN.x - 15}" y="${rvCy - 22}" width="30" height="44" fill="none" stroke="#7c3aed" stroke-width="1.4" stroke-dasharray="4 3"/>`;
  s += txt(PN.x + 20, rvCy - 2, "R₂", "start", "#7c3aed", 12);
  s += wire(PN.x, rvCy + 20, PN.x, GY);
  s += gnd(PN.x, GY);
  s += OP.svg;
  s += dot(OP.out.x, OP.out.y);
  // V_o
  s += wire(OP.out.x, CY, OP.out.x + 90, CY);
  s += dot(OP.out.x + 90, CY);
  s += txt(OP.out.x + 96, CY + 4, "V_o", "start", "#dc2626", 14);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 560 340">${s}</svg>`;
}
