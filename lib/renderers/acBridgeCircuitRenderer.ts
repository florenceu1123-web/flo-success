import type { AcBridgeCircuitDiagram, AcBridgeTheveninCircuitDiagram } from "@/types";

/**
 * AC 휘트스톤 브리지 (가) + 테브난 등가 (나) 전용 fixed-slot 렌더러 (임용 7번).
 *
 *  (가) 다이아몬드: 상단 T, 하단 G(GND), 좌 A, 우 B.
 *    Z1=T→A(좌상), Z2=T→B(우상), Z3=A→G(좌하·V_A), Z4=B→G(우하·V_B), R_L: A↔B.
 *    전원 V는 좌측(T↔G). 소자는 각 대각 edge에 회전 배치.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const W = 700, H = 470;

// 다이아몬드 노드
const T = { x: 380, y: 100 };
const G = { x: 380, y: 360 };
const A = { x: 250, y: 230 };
const B = { x: 510, y: 230 };
const SRC_X = 90;

type D = AcBridgeCircuitDiagram;

export function renderAcBridgeCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  // ── 전원 V (좌측 세로, T↔G) ──
  s.push(acSource(SRC_X, T.y, G.y));
  t.push(text(SRC_X - 30, (T.y + G.y) / 2 + 4, d.vLabel ?? "V", { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  w.push(line(SRC_X, T.y, T.x, T.y));   // 상단 rail → T
  w.push(line(SRC_X, G.y, G.x, G.y));   // 하단 rail → G
  s.push(dot(T.x, T.y)); s.push(dot(G.x, G.y));

  // ── 4 arm (대각 소자) ──
  elemOnEdge(w, s, t, T, A, "C", d.z1Label ?? "Z1", "outer");   // 좌상 C
  elemOnEdge(w, s, t, T, B, "R", d.z2Label ?? "Z2", "outer");   // 우상 R
  elemOnEdge(w, s, t, A, G, "L", d.z3Label ?? "Z3", "outer");   // 좌하 L (V_A)
  elemOnEdge(w, s, t, B, G, "R", d.z4Label ?? "Z4", "outer");   // 우하 R (V_B)
  s.push(dot(A.x, A.y)); s.push(dot(B.x, B.y));
  t.push(text(A.x - 12, A.y - 8, "A", { size: 13, weight: 700, anchor: "end" }));
  t.push(text(B.x + 12, B.y - 8, "B", { size: 13, weight: 700, anchor: "start" }));

  // ── R_L: A ↔ B (수평, 중앙) ──
  const rlMid = (A.x + B.x) / 2;
  hResistor(s, rlMid - 28, rlMid + 28, A.y);
  w.push(line(A.x, A.y, rlMid - 28, A.y));
  w.push(line(rlMid + 28, A.y, B.x, A.y));
  t.push(text((A.x + B.x) / 2, A.y - 10, d.rlLabel ?? "R_L", { size: 12, weight: 700, fill: RED }));

  // ── V_A·V_B 측정 표시 (좌하·우하 arm 옆) ──
  t.push(text((A.x + G.x) / 2 - 34, (A.y + G.y) / 2 + 4, "V_A", { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));
  t.push(text((B.x + G.x) / 2 + 34, (B.y + G.y) / 2 + 4, "V_B", { size: 12, weight: 700, fill: ACCENT, anchor: "start" }));

  // GND 심볼
  w.push(line(G.x, G.y, G.x, G.y + 18));
  s.push(ground(G.x, G.y + 18));

  t.push(text(W / 2, H - 8, "AC 휘트스톤 브리지 — 단자 A·B 개방 시 V_TH=V_A−V_B, Z_TH=(Z1∥Z3)+(Z2∥Z4)", { size: 10, fill: MUTED }));

  return svg(W, H, [...w, ...s, ...t]);
}

/**
 * (나) 테브난 등가: V_TH 직렬 Z_TH → 단자 A·B → R_L.
 *   ★ Z_TH 자리에 "전원 단락 브리지"를 그린다 (사용자 요청): T·G를 단락하면
 *     A↔B 임피던스 = (Z1∥Z3)+(Z2∥Z4) = Z_TH. 다이아몬드 4-arm + 중앙 단락선.
 */
export function renderAcBridgeThevenin(d: AcBridgeTheveninCircuitDiagram): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];
  // 전원 단락 브리지(=Z_TH) 다이아몬드 + 가운데 부하 R_L (A↔B). (가)와 같은 구조, 전원만 단락.
  const Tv = { x: 360, y: 95 }, Gv = { x: 360, y: 335 };
  const A = { x: 230, y: 215 }, B = { x: 490, y: 215 };
  const SHORT_X = 140;

  // 전원 자리 = 단락 (T·G를 좌측 세로 wire로 직결)
  w.push(line(Tv.x, Tv.y, SHORT_X, Tv.y));
  w.push(`<line x1="${SHORT_X}" y1="${Tv.y}" x2="${SHORT_X}" y2="${Gv.y}" stroke="${ACCENT}" stroke-width="${WIRE_W}"/>`);
  w.push(line(SHORT_X, Gv.y, Gv.x, Gv.y));
  t.push(text(SHORT_X - 6, (Tv.y + Gv.y) / 2 + 4, `${d.vthLabel ?? "V_TH"} 단락`, { anchor: "end", size: 10, weight: 600, fill: ACCENT }));
  s.push(dot(Tv.x, Tv.y)); s.push(dot(Gv.x, Gv.y));

  // 4 arm
  elemOnEdge(w, s, t, Tv, A, "C", "Z₁", "outer");
  elemOnEdge(w, s, t, Tv, B, "R", "Z₂", "outer");
  elemOnEdge(w, s, t, A, Gv, "L", "Z₃", "outer");
  elemOnEdge(w, s, t, B, Gv, "R", "Z₄", "outer");
  s.push(dot(A.x, A.y)); s.push(dot(B.x, B.y));
  t.push(text(A.x - 12, A.y - 8, "A", { size: 13, weight: 700, anchor: "end" }));
  t.push(text(B.x + 12, B.y - 8, "B", { size: 13, weight: 700, anchor: "start" }));

  // ★ 가운데 부하 R_L (A↔B 가교) ★
  const rlMid = (A.x + B.x) / 2;
  hResistor(s, rlMid - 28, rlMid + 28, A.y);
  w.push(line(A.x, A.y, rlMid - 28, A.y));
  w.push(line(rlMid + 28, A.y, B.x, A.y));
  t.push(text((A.x + B.x) / 2, A.y - 10, d.rlLabel ?? "R_L", { size: 12, weight: 700, fill: RED }));

  t.push(text((A.x + B.x) / 2, Tv.y - 18, `${d.zthLabel ?? "Z_TH"} = (Z₁∥Z₃)+(Z₂∥Z₄) (전원 단락)`, { size: 11, weight: 700, fill: ACCENT }));
  t.push(text(320, H - 12, "테브난 등가 — 단자 A·B에서 본 Z_TH에 부하 R_L. 최대평균전력: R_L = |Z_TH|", { size: 10, fill: MUTED }));
  return svg(640, 420, [...w, ...s, ...t]);
}

// ─── edge 소자 (대각 회전 배치) ───────────────────────────────
function elemOnEdge(
  w: string[], s: string[], t: string[],
  p1: { x: number; y: number }, p2: { x: number; y: number },
  type: "R" | "C" | "L", label: string, _side: string,
): void {
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const deg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  const half = 18;
  const sym =
    type === "R" ? symResistor(half) : type === "C" ? symCapacitor(half) : symInductor(half);
  s.push(
    `<g transform="translate(${round(mx)},${round(my)}) rotate(${round(deg)})">` +
      `<line x1="${-len / 2}" y1="0" x2="${-half}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      sym +
      `<line x1="${half}" y1="0" x2="${len / 2}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `</g>`,
  );
  // 라벨 — 미드포인트에서 바깥쪽으로 offset (회전 안 함, 가독성)
  const nx = -(p2.y - p1.y) / len, ny = (p2.x - p1.x) / len; // 법선
  const outSign = mx < 380 ? -1 : 1; // 다이아몬드 중심(380) 기준 바깥
  const off = 22;
  t.push(text(round(mx + nx * off * outSign), round(my + ny * off * outSign + 4), label, { size: 11, weight: 600 }));
}

// ─── 심볼 (로컬 좌표, x축 −half..half, 중심 원점) ──────────────
function symResistor(half: number): string {
  const a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${-half},0`;
  for (let i = 0; i < teeth; i++) p += ` L${-half + step * (i + 0.5)},${i % 2 === 0 ? -a : a}`;
  p += ` L${half},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function symCapacitor(half: number): string {
  const g = 5, ph = 11;
  return (
    `<line x1="${-g}" y1="${-ph}" x2="${-g}" y2="${ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${g}" y1="${-ph}" x2="${g}" y2="${ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${-half}" y1="0" x2="${-g}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${g}" y1="0" x2="${half}" y2="0" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`
  );
}
function symInductor(half: number): string {
  const n = 4, r = half / n;
  let p = `M${-half},0`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${-half + r * (2 * i + 2)},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ─── 수평/수직 R + 공통 ───────────────────────────────────────
function hResistor(out: string[], x1: number, x2: number, y: number): void {
  const a = 7, teeth = 6, step = (x2 - x1) / teeth;
  let p = `M${x1},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${x1 + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${x2},${y}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
function hResistorV(out: string[], x: number, y1: number, y2: number): void {
  const a = 7, teeth = 6, step = (y2 - y1) / teeth;
  let p = `M${x},${y1}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${y1 + step * (i + 0.5)}`;
  p += ` L${x},${y2}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
function acSource(cx: number, topY: number, botY: number): string {
  const cy = (topY + botY) / 2, r = 22;
  const sine = `<path d="M${cx - 12},${cy} Q${cx - 6},${cy - 8} ${cx},${cy} T${cx + 12},${cy}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>${sine}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function ground(cx: number, y: number): string {
  return `<line x1="${cx - 12}" y1="${y}" x2="${cx + 12}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 7}" y1="${y + 5}" x2="${cx + 7}" y2="${y + 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 3}" y1="${y + 10}" x2="${cx + 3}" y2="${y + 10}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
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
function round(n: number): number { return Math.round(n * 100) / 100; }
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
