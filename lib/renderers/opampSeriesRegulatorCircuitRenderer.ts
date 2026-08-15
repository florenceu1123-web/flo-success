import type { OpampSeriesRegulatorCircuitDiagram } from "@/types";

/**
 * OPAMP(오차증폭기) 직렬형 정전압 안정화 회로 (임용 30번) 전용 fixed-slot 렌더러.
 * ★ 원본(임용 30번) 배치를 따름:
 *   - 트랜지스터는 ★수평★ 직렬 패스: collector(좌)=V_DD ─ [Q] ─ emitter(우)=V_o, base(하단)←OPAMP 출력.
 *   - R_s(1kΩ)는 ★제너 위★ 바이어스 저항: V_DD ─ R_s ─ V_+ 노드 ─ 제너 ─ GND.
 *   - OPAMP는 중앙, (+)=V_+(제너 기준), (−)=피드백 분압 중점 M. 출력이 위로 베이스 구동.
 *   - 피드백 분압 R_a/R_b는 우측 세로 스택(V_o→GND), 중점 M → OPAMP(−). 부하 R_L 출력단.
 *
 *   V_DD ──┬── R_s ──(제너)── GND        (collector)      (emitter)
 *   (18V)  │   V_+ ─(+)┐                V_DD ──[ Q 수평 ]── V_o ──○
 *          │           │ OPAMP           (base)            │   │
 *          │       V_z │      ▷out────────┘              R_a  R_L
 *          │        (−)┘←─ M(피드백)                       │M   │
 *          │                                             R_b   │
 *   GND ───┴───────────────────────────────────────────────┴───┴
 *
 *  가상단락: V_− = V_+ = V_z → V_o = V_z(1 + R_a/R_b). R_s는 제너 바이어스만 담당(정답 불변).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const DOT_R = 3.4;
const BLUE = "#1d4ed8";
const RED = "#dc2626";
const PURPLE = "#7c3aed";

const SVG_W = 900;
const SVG_H = 520;

const TCY = 100;       // 트랜지스터 C-E 축 = 상단 수평선 (V_DD·V_o rail)
const BOT = 470;       // 하단 rail (GND)
const OPY = 280;       // OPAMP 세로 중심
const VPY = OPY - 18;  // V_+ 기준 노드 = OPAMP (+) 입력 높이 (262)
const OPMY = OPY + 18; // OPAMP (−) 입력 높이 (298)
const MY = 350;        // 피드백 분압 중점 M / 피드백 배선 y (OPAMP 아래)

const VDDX = 60;       // V_DD leg
const ZX = 175;        // R_s + 제너 세로 열
const OPLX = 330;      // OPAMP 삼각형 좌변
const OPAPEX = 410;    // OPAMP 우측 꼭짓점(출력)
const QX = 480;        // 수평 트랜지스터 중심
const RAX = 640;       // 피드백 분압 R_a/R_b (우측 세로 스택)
const RLX = 750;       // 부하 R_L (출력단)
const VOTERMX = 840;   // V_o 출력 단자
const FBLX = 300;      // 피드백 좌측 세로 우회선 (OPAMP 좌측)

type D = OpampSeriesRegulatorCircuitDiagram;

export function renderOpampSeriesRegulatorCircuit(d: D): string {
  const p: string[] = [];

  // ── 도선 ──
  // V_DD leg
  p.push(line(VDDX, TCY, VDDX, 178));
  p.push(line(VDDX, 222, VDDX, BOT));
  // 상단 수평 (V_DD 측): V_DD → R_s tap → collector(QX-20)
  p.push(line(VDDX, TCY, QX - 20, TCY));
  // 상단 수평 (V_o 측): emitter(QX+20) → 단자
  p.push(line(QX + 20, TCY, VOTERMX, TCY));
  // 트랜지스터 base(하단) ← OPAMP 출력 (apex → 우 → 위 → base)
  p.push(line(OPAPEX, OPY, QX, OPY));          // (410,280)→(480,280)
  p.push(line(QX, OPY, QX, TCY + 36));          // (480,280)→(480,136) base 단자
  // ★ 제너 기준: V_DD ─ R_s ─ V_+ ─ 제너 ─ GND (R_s가 제너 위)
  p.push(line(OPLX, VPY, ZX, VPY));             // (+) 리드 ← V_+
  p.push(line(ZX, VPY, ZX, 318));               // V_+ → 제너 cathode(318)
  p.push(line(ZX, 346, ZX, BOT));               // 제너 anode(346) → GND
  // OPAMP (−) 입력 ← 피드백 M (OPAMP 아래로 우회)
  p.push(line(OPLX, OPMY, FBLX, OPMY));         // (−) 리드 좌측
  p.push(line(FBLX, OPMY, FBLX, MY));           // 좌측 세로 (OPAMP 좌측)
  p.push(line(FBLX, MY, RAX, MY));              // OPAMP 아래 가로 → M
  // 하단 rail
  // ★ 무부하면 하단 레일을 분압기(R_b)까지만 — 부하 자리까지 뻗으면 끝이 떠 있는 배선이 된다(규칙 #1·시각검증).
  p.push(line(VDDX, BOT, d.noLoad ? RAX : RLX, BOT));

  // ── 심볼 ──
  p.push(vSource(VDDX, 200, d.vddLabel));      // V_DD
  p.push(resistorV(ZX, TCY, VPY));             // R_s (1k) — 제너 위 (바이어스 저항)
  p.push(opamp(OPLX, OPAPEX, OPY));            // OPAMP
  p.push(zener(ZX, 332, d.vzLabel));           // 제너 기준 (cathode 318, anode 346)
  p.push(npnH(QX, TCY));                        // 수평 NPN 직렬 패스
  p.push(resistorV(RAX, TCY, MY));              // R_a
  p.push(resistorV(RAX, MY, BOT));              // R_b
  // ★ noLoad(무부하) — 원본 동작 판정형은 출력 단자가 개방이다. 미지정이면 기존과 동일.
  if (!d.noLoad) p.push(resistorV(RLX, TCY, BOT));             // R_L
  if (d.raUnknown) p.push(unknownBoxV(RAX, (TCY + MY) / 2));

  // ── 노드 dot ──
  p.push(dot(ZX, TCY), dot(ZX, VPY));
  p.push(dot(RAX, TCY), dot(RAX, MY));
  if (!d.noLoad) p.push(dot(RLX, TCY));
  p.push(dot(ZX, BOT), dot(RAX, BOT), dot(VDDX, BOT));
  if (!d.noLoad) p.push(dot(RLX, BOT));

  // ── 라벨 ──
  // R_s (제너 위 바이어스 저항)
  p.push(text(ZX + 15, 178, "R_s", { size: 12, weight: 600, anchor: "start" }));
  p.push(text(ZX + 15, 194, d.rsLabel, { size: 11, anchor: "start" }));
  // V_o 단자
  p.push(openTerminal(VOTERMX, TCY));
  p.push(text(VOTERMX + 8, TCY - 8, d.voLabel, { size: 14, weight: 700, anchor: "start", fill: RED }));
  // R_a
  p.push(text(RAX + 15, (TCY + MY) / 2 - 6, "R_a", { size: 12, weight: 600, anchor: "start", fill: d.raUnknown ? PURPLE : STROKE }));
  p.push(text(RAX + 15, (TCY + MY) / 2 + 10, d.raLabel, { size: 11, anchor: "start", fill: d.raUnknown ? PURPLE : STROKE }));
  // R_b
  p.push(text(RAX + 15, (MY + BOT) / 2 - 6, "R_b", { size: 12, weight: 600, anchor: "start" }));
  p.push(text(RAX + 15, (MY + BOT) / 2 + 10, d.rbLabel, { size: 11, anchor: "start" }));
  // R_L
  if (!d.noLoad) {
    p.push(text(RLX + 15, (TCY + BOT) / 2 - 6, "R_L", { size: 12, weight: 600, anchor: "start" }));
    p.push(text(RLX + 15, (TCY + BOT) / 2 + 10, d.rlLabel, { size: 11, anchor: "start" }));
  }
  // 제너 라벨
  p.push(text(ZX - 16, 328, "V_z", { size: 12, weight: 600, anchor: "end", fill: BLUE }));
  p.push(text(ZX - 16, 344, d.vzLabel, { size: 11, anchor: "end" }));
  // 노드 라벨
  p.push(text(RAX + 9, MY - 8, "M", { size: 12, weight: 700, anchor: "start", fill: BLUE }));
  p.push(text(ZX + 9, VPY - 6, "V₊", { size: 11, weight: 600, anchor: "start", fill: BLUE }));
  // 트랜지스터 라벨
  p.push(text(QX + 4, TCY - 30, "Q", { size: 13, weight: 600, anchor: "start" }));

  // ── 전류 화살표 ──
  // I_E (emitter → V_o, 우측 흐름)
  p.push(arrowR(QX + 34, TCY - 12));
  p.push(text(QX + 40, TCY - 18, "I_E", { size: 12, weight: 600, anchor: "start", fill: BLUE }));
  // I_f (분압기 R_a)
  p.push(arrowD(RAX - 22, TCY + 16));
  p.push(text(RAX - 34, TCY + 32, "I_f", { size: 12, weight: 600, anchor: "end", fill: PURPLE }));
  // I_L (부하 R_L)
  if (!d.noLoad) {
    p.push(arrowD(RLX - 22, TCY + 16));
    p.push(text(RLX - 34, TCY + 32, "I_L", { size: 12, weight: 600, anchor: "end", fill: RED }));
  }

  // 접지
  p.push(gndSymbol(400, BOT));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${p.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function opamp(leftX: number, apexX: number, cy: number): string {
  const half = 42;
  const tri = `<polygon points="${leftX},${cy - half} ${leftX},${cy + half} ${apexX},${cy}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const plus = `<text x="${leftX + 12}" y="${cy - 12}" text-anchor="start" font-size="14" fill="${STROKE}">+</text>`;
  const minus = `<text x="${leftX + 12}" y="${cy + 22}" text-anchor="start" font-size="16" fill="${STROKE}">−</text>`;
  return tri + plus + minus;
}
function vSource(cx: number, cy: number, label: string): string {
  const r = 22;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="13" fill="${STROKE}">+</text>` +
    `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="14" fill="${STROKE}">−</text>` +
    text(cx - 28, cy + 4, label, { size: 12, weight: 600, anchor: "end" });
}
function zener(cx: number, cy: number, _label: string): string {
  // 제너 다이오드 — 삼각형(cathode 위) + 꺾인 bar. cathode(cy-14) → anode(cy+14).
  // ★ 꼭짓점은 **위(cy-h)** — bar(캐소드)가 붙는 쪽이 꼭짓점이다(zenerBjtRegulator와 같은 오류를
  //   공유하고 있었다, 2026-08-04). 기준 전압원이므로 캐소드가 위(R_s 쪽)여야 항복 동작이 맞다.
  const h = 14;
  const tri = `<polygon points="${cx},${cy - h} ${cx - 10},${cy + h} ${cx + 10},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const bar = `<line x1="${cx - 11}" y1="${cy - h}" x2="${cx + 11}" y2="${cy - h}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 11}" y1="${cy - h}" x2="${cx - 15}" y2="${cy - h - 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + 11}" y1="${cy - h}" x2="${cx + 15}" y2="${cy - h + 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return tri + bar;
}
function npnH(cx: number, cy: number): string {
  // 수평 NPN (수직형을 90° CCW 회전): collector 좌, emitter 우(화살표 out), base 하단.
  const plateY = cy + 18;
  const circ = `<circle cx="${cx}" cy="${cy + 4}" r="26" fill="none" stroke="${STROKE}" stroke-width="1.1"/>`;
  const bar = `<line x1="${cx - 22}" y1="${plateY}" x2="${cx + 22}" y2="${plateY}" stroke="${STROKE}" stroke-width="2.4"/>`;
  const baseLead = `<line x1="${cx}" y1="${cy + 36}" x2="${cx}" y2="${plateY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const col = `<line x1="${cx - 12}" y1="${plateY}" x2="${cx - 20}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const emi = `<line x1="${cx + 12}" y1="${plateY}" x2="${cx + 20}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  // emitter 화살표 (out = NPN, up-right 방향)
  const ah = `<polygon points="${cx + 20},${cy} ${cx + 9},${cy + 3} ${cx + 15},${cy + 11}" fill="${STROKE}"/>`;
  return circ + bar + baseLead + col + emi + ah;
}
function unknownBoxV(cx: number, cy: number): string {
  return `<rect x="${cx - 13}" y="${cy - 34}" width="26" height="68" fill="none" stroke="${PURPLE}" stroke-width="1.4" stroke-dasharray="5 3"/>`;
}
function openTerminal(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function gndSymbol(cx: number, y: number): string {
  return `<g stroke="${STROKE}" stroke-width="${WIRE_W}">` +
    `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 8}"/>` +
    `<line x1="${cx - 10}" y1="${y + 8}" x2="${cx + 10}" y2="${y + 8}"/>` +
    `<line x1="${cx - 6}" y1="${y + 12}" x2="${cx + 6}" y2="${y + 12}"/>` +
    `<line x1="${cx - 2}" y1="${y + 16}" x2="${cx + 2}" y2="${y + 16}"/></g>`;
}
function arrowD(x: number, y: number): string {
  return `<g stroke="${STROKE}" stroke-width="1.6" fill="${STROKE}">` +
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 20}"/>` +
    `<polygon points="${x},${y + 24} ${x - 4},${y + 16} ${x + 4},${y + 16}"/></g>`;
}
function arrowR(x: number, y: number): string {
  return `<g stroke="${BLUE}" stroke-width="1.6" fill="${BLUE}">` +
    `<line x1="${x}" y1="${y}" x2="${x + 20}" y2="${y}"/>` +
    `<polygon points="${x + 24},${y} ${x + 16},${y - 4} ${x + 16},${y + 4}"/></g>`;
}

// 저항(세로) — 심볼을 중앙 밴드(≤84px)에 그리고 양끝은 리드선. 스팬 무관 균일 톱니.
const R_AMP = 7;
function resistorV(x: number, y0: number, y1: number): string {
  const len = Math.abs(y1 - y0);
  const band = Math.min(len - 10, 84);
  const c = (y0 + y1) / 2;
  const a = c - band / 2, b = c + band / 2;
  return line(x, y0, x, a) + zigzagBand(x, a, b) + line(x, b, x, y1);
}
function zigzagBand(x: number, ya: number, yb: number): string {
  const teeth = 6, seg = (yb - ya) / teeth;
  const pts: Array<[number, number]> = [[x, ya]];
  for (let i = 0; i < teeth; i++) pts.push([x + (i % 2 === 0 ? -R_AMP : R_AMP), ya + seg * (i + 0.5)]);
  pts.push([x, yb]);
  return poly(pts);
}
function poly(pts: Array<[number, number]>): string {
  return `<polyline points="${pts.map((q) => `${q[0]},${q[1]}`).join(" ")}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}

// ─── primitives ──────────────────────────────────
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
