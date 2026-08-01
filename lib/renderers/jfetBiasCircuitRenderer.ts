import type { JfetBiasCircuitDiagram } from "@/types";

/**
 * JFET 전압(분압) 바이어스 회로 (임용 2번) — 전용 fixed-slot 렌더러.
 *
 *  원본 배치를 따른다:
 *    상단 +V_DD 레일 ─┬─ R₁ ─ G ─ R₂ ─ 접지        (좌: 분압)
 *                     └─ R_D ─ D ─[JFET]─ S ─ R_S ─ 접지  (우: 드레인 경로)
 *    G에서 게이트로 수평 배선, G–S 사이에 V_GS 극성 표기.
 *
 * ★ 자동 라우터(analog_netlist)는 JFET 심벌 자체가 없어 분압·소스저항 구조를 잃는다 → 고정 슬롯.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 560, H = 400;
const X_L = 150;              // 좌측(분압) 세로선
const X_R = 380;              // 우측(드레인 경로) 세로선
const Y_RAIL = 52;            // +V_DD 레일
const Y_G = 205;              // 게이트 노드 y
const Y_CH_TOP = 172, Y_CH_BOT = 238;   // JFET 채널(세로 막대) 범위
const X_GATE = 330;           // 게이트 스터브 시작 x

export function renderJfetBiasCircuit(d: JfetBiasCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── +V_DD 레일 ───────────────────────────────────────────────────
  w.push(line(X_L, Y_RAIL, X_R, Y_RAIL));
  s.push(`<circle cx="${X_R}" cy="${Y_RAIL}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  w.push(line(X_R, Y_RAIL, X_R, Y_RAIL - 18));
  t.push(tex(X_R, Y_RAIL - 26, d.vddLabel, { size: 13, weight: 700 }));

  // ── 좌측: R₁ ─ G ─ R₂ ─ 접지 ─────────────────────────────────────
  w.push(line(X_L, Y_RAIL, X_L, 88));
  s.push(resistor(X_L, 88, 148, "v"));
  t.push(tex(X_L - 14, 122, d.r1Label, { anchor: "end", size: 12 }));
  w.push(line(X_L, 148, X_L, Y_G));
  s.push(dot(X_L, Y_G));
  t.push(text(X_L - 12, Y_G - 8, "G", { anchor: "end", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(X_L, Y_G, X_L, 240));
  s.push(resistor(X_L, 240, 300, "v"));
  t.push(tex(X_L - 14, 274, d.r2Label, { anchor: "end", size: 12 }));
  w.push(line(X_L, 300, X_L, 336));
  s.push(ground(X_L, 336));

  // ── 우측: R_D ─ D ─ JFET ─ S ─ R_S ─ 접지 ────────────────────────
  w.push(line(X_R, Y_RAIL, X_R, 84));
  s.push(resistor(X_R, 84, 144, "v"));
  t.push(tex(X_R + 16, 118, d.rdLabel, { anchor: "start", size: 13, weight: 700, fill: ACCENT }));
  w.push(line(X_R, 144, X_R, Y_CH_TOP));
  t.push(text(X_R + 14, Y_CH_TOP - 4, "D", { anchor: "start", size: 12, weight: 700 }));

  // JFET 심벌 — 세로 채널 막대 + 게이트 화살표(n채널이면 안쪽 방향)
  s.push(`<line x1="${X_R}" y1="${Y_CH_TOP}" x2="${X_R}" y2="${Y_CH_BOT}" stroke="${STROKE}" stroke-width="3.4"/>`);
  const gy = (Y_CH_TOP + Y_CH_BOT) / 2;
  w.push(line(X_GATE, gy, X_R - 12, gy));
  const nCh = (d.channel ?? "n") === "n";
  // 화살촉: n채널은 게이트→채널(오른쪽), p채널은 채널→게이트(왼쪽)
  s.push(nCh
    ? `<polygon points="${X_R - 4},${gy} ${X_R - 14},${gy - 5} ${X_R - 14},${gy + 5}" fill="${STROKE}"/>`
    : `<polygon points="${X_R - 16},${gy} ${X_R - 6},${gy - 5} ${X_R - 6},${gy + 5}" fill="${STROKE}"/>`);
  t.push(text(X_R + 14, Y_CH_BOT + 12, "S", { anchor: "start", size: 12, weight: 700 }));

  // 게이트 배선: G 노드 → 게이트 스터브
  w.push(line(X_L, Y_G, X_GATE, Y_G));
  if (Math.abs(Y_G - gy) > 0.5) w.push(line(X_GATE, Y_G, X_GATE, gy));

  // V_GS 극성 표기 (게이트–소스 사이)
  //   게이트선 바로 아래에 +, 그 아래 라벨, 다시 아래 − (소스 쪽) — 세로로 붙여 극성이 한눈에 보이게.
  const vx = 300;
  s.push(`<line x1="${vx}" y1="${gy + 4}" x2="${vx}" y2="${Y_CH_BOT + 16}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="3 3"/>`);
  t.push(text(vx - 9, gy + 14, "+", { size: 13, weight: 700, fill: MUTED }));
  t.push(tex(vx - 9, gy + 32, d.vgsLabel ?? "V_{GS}", { anchor: "end", size: 11.5, fill: MUTED }));
  t.push(text(vx - 9, Y_CH_BOT + 16, "−", { size: 13, weight: 700, fill: MUTED }));

  // 소스 → R_S → 접지
  w.push(line(X_R, Y_CH_BOT, X_R, 268));
  s.push(resistor(X_R, 268, 324, "v"));
  t.push(tex(X_R + 16, 300, d.rsLabel, { anchor: "start", size: 12 }));
  w.push(line(X_R, 324, X_R, 352));
  s.push(ground(X_R, 352));

  t.push(text(W / 2, H - 12, "게이트 전류는 무시 → V_G는 분압비로, I_D는 소스 저항으로 결정된다", { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────────── 헬퍼 ───────────────────────────
/** 지그재그 저항 (세로 방향만 사용). */
function resistor(x: number, y1: number, y2: number, _dir: "v"): string {
  const n = 6, h = (y2 - y1) / n, a = 8;
  let p = `M${x},${y1}`;
  for (let i = 0; i < n; i++) {
    const yy = y1 + h * (i + 0.5);
    p += ` L${x + (i % 2 === 0 ? a : -a)},${yy}`;
  }
  p += ` L${x},${y2}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function ground(x: number, y: number): string {
  return `<line x1="${x}" y1="${y - 12}" x2="${x}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 14}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="${STROKE}" stroke-width="1.8"/>` +
    `<line x1="${x - 9}" y1="${y + 5}" x2="${x + 9}" y2="${y + 5}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<line x1="${x - 4}" y1="${y + 10}" x2="${x + 4}" y2="${y + 10}" stroke="${STROKE}" stroke-width="1.4"/>`;
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
/** LaTeX 라벨을 SVG 평문으로 — 렌더러는 MathJax를 못 쓰므로 흔한 표기만 풀어 쓴다. */
function tex(x: number, y: number, str: string, o: Parameters<typeof text>[3] = {}): string {
  const plain = String(str ?? "")
    .replaceAll("\\,", " ")
    .replaceAll("\\mathrm{k\\Omega}", "kΩ")
    .replaceAll("\\mathrm{V}", "V")
    .replaceAll("\\Omega", "Ω")
    .replaceAll("\\mathrm{", "").replaceAll("{", "").replaceAll("}", "")
    .replaceAll("_", "_");
  return text(x, y, plain, o);
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function svg(body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.join("\n")}\n</svg>`;
}
