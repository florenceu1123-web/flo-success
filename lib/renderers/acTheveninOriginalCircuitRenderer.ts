import type { CircuitNetlist } from "@/types";

/**
 * 2전원 테브난 최대전력 — **원본(임용 11번) 토폴로지** 전용 fixed-slot 렌더러 (유사유형).
 *
 *   I ↑ ∥ [V + R_s] ─┬─ jX_L ─ R_top ─ a ─┬─ −jX_C ─ b
 *                     └─────────────────── b     └─ R_L ─ b
 *
 *  원본 배치 그대로: 좌측에 전류원, 그 오른쪽에 전압원(+ 위) + 직렬 저항,
 *  상단 rail에 L·R 직렬, 우측에 −jX_C 와 R_L 이 단자 a–b 사이에 나란히.
 *
 * ★ 기존 `acTheveninMaxPowerCircuitRenderer`는 **두 전원망 병렬(변형유형)** 구조 전용이라
 *   이 토폴로지를 그리지 못한다(소자 id 자체가 다르다) → 별도 렌더러.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const W = 700, H = 380;
const Y_TOP = 96, Y_BOT = 300;
const X_I = 90, X_V = 180;            // 전류원 / 전압원 세로 가지
const X_C = 470, X_RL = 590;          // 단자 병렬 커패시터 / 부하
const X_A = X_RL;                     // 단자 a·b 위치

/** 검출 — original 토폴로지 고유 id 집합. */
export function detectAcTheveninOriginal(netlist: CircuitNetlist): boolean {
  const ids = new Set((netlist.components ?? []).map((c) => c.id));
  return ids.has("V1") && ids.has("I1") && ids.has("R_s") &&
    ids.has("L_top") && ids.has("R_top") && ids.has("C_a") && ids.has("R_L");
}

export function renderAcTheveninOriginalCircuit(netlist: CircuitNetlist): string | null {
  if (!detectAcTheveninOriginal(netlist)) return null;
  const val = (id: string) => String(netlist.components.find((c) => c.id === id)?.value ?? "");
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 바깥 rail ────────────────────────────────────────────────────
  w.push(line(X_I, Y_TOP, X_A, Y_TOP));
  w.push(line(X_I, Y_BOT, X_A, Y_BOT));
  w.push(line(X_I, Y_TOP, X_I, 168), line(X_I, 222, X_I, Y_BOT));

  // ── 전류원 (좌, 위 방향 화살표) ──────────────────────────────────
  const iy = 195;
  s.push(`<circle cx="${X_I}" cy="${iy}" r="27" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<line x1="${X_I}" y1="${iy + 13}" x2="${X_I}" y2="${iy - 10}" stroke="${STROKE}" stroke-width="1.8"/>`);
  s.push(`<polygon points="${X_I},${iy - 16} ${X_I - 5},${iy - 6} ${X_I + 5},${iy - 6}" fill="${STROKE}"/>`);
  t.push(text(X_I - 34, iy + 4, plain(val("I1")), { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  t.push(text(X_I - 34, iy - 14, "I", { anchor: "end", size: 13, weight: 700 }));

  // ── 전압원 + 직렬 저항 (두 번째 세로 가지) ───────────────────────
  w.push(line(X_V, Y_TOP, X_V, 138));
  const vy = 168;
  s.push(`<circle cx="${X_V}" cy="${vy}" r="27" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(`<path d="M${X_V - 11},${vy} q5.5,-8 11,0 q5.5,8 11,0" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`);
  // 극성: + 위(단자 a 쪽 rail), − 아래(직렬 저항 쪽) — 원본과 같은 방향.
  t.push(text(X_V + 16, vy - 20, "+", { size: 15, weight: 700 }));
  t.push(text(X_V + 16, vy + 26, "−", { size: 15, weight: 700 }));
  t.push(text(X_V - 34, vy - 12, "V", { anchor: "end", size: 13, weight: 700 }));
  t.push(text(X_V - 34, vy + 6, plain(val("V1")), { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  w.push(line(X_V, vy + 27, X_V, 218));
  s.push(resistorV(X_V, 218, 268));
  t.push(text(X_V + 18, 246, plain(val("R_s")), { anchor: "start", size: 12 }));
  w.push(line(X_V, 268, X_V, Y_BOT));
  s.push(dot(X_V, Y_TOP));
  s.push(dot(X_V, Y_BOT));

  // ── 상단 rail 직렬 소자: jX_L → R_top ────────────────────────────
  s.push(inductorH(268, Y_TOP, 60));
  t.push(text(298, Y_TOP - 14, plain(val("L_top")), { size: 12, weight: 700, fill: ACCENT }));
  s.push(resistorH(368, Y_TOP, 62));
  t.push(text(399, Y_TOP - 14, plain(val("R_top")), { size: 12, weight: 700, fill: ACCENT }));

  // ── 단자 병렬 커패시터 −jX_C ─────────────────────────────────────
  w.push(line(X_C, Y_TOP, X_C, 178));
  s.push(capacitorV(X_C, 178));
  w.push(line(X_C, 198, X_C, Y_BOT));
  t.push(text(X_C - 14, 196, plain(val("C_a")), { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
  s.push(dot(X_C, Y_TOP), dot(X_C, Y_BOT));

  // ── 부하 R_L + 단자 a·b ──────────────────────────────────────────
  w.push(line(X_RL, Y_TOP, X_RL, 158));
  s.push(resistorV(X_RL, 158, 230));
  w.push(line(X_RL, 230, X_RL, Y_BOT));
  t.push(text(X_RL + 18, 198, "R_L", { anchor: "start", size: 13, weight: 700, fill: RED }));
  s.push(`<circle cx="${X_A}" cy="${Y_TOP}" r="4" fill="${RED}"/>`);
  s.push(`<circle cx="${X_A}" cy="${Y_BOT}" r="4" fill="${RED}"/>`);
  t.push(text(X_A + 14, Y_TOP - 8, "a", { anchor: "start", size: 13, weight: 700, fill: RED }));
  t.push(text(X_A + 14, Y_BOT + 16, "b", { anchor: "start", size: 13, weight: 700, fill: RED }));

  // 접지 (하단 rail)
  s.push(ground(320, Y_BOT));

  t.push(text(W / 2, H - 12, "단자 a–b에서 본 테브난 등가 → 순저항 부하 R_L = |Z_th| 일 때 최대 평균 전력", { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────────── 심벌 ───────────────────────────
function resistorV(x: number, y1: number, y2: number): string {
  const n = 6, h = (y2 - y1) / n, a = 8;
  let p = `M${x},${y1}`;
  for (let i = 0; i < n; i++) p += ` L${x + (i % 2 === 0 ? a : -a)},${y1 + h * (i + 0.5)}`;
  p += ` L${x},${y2}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function resistorH(x: number, y: number, len: number): string {
  const n = 6, wStep = len / n, a = 8;
  let p = `M${x},${y}`;
  for (let i = 0; i < n; i++) p += ` L${x + wStep * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${x + len},${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function inductorH(x: number, y: number, len: number): string {
  const n = 4, r = len / (2 * n);
  let p = `M${x},${y}`;
  for (let i = 0; i < n; i++) p += ` a${r},${r} 0 0 1 ${2 * r},0`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function capacitorV(x: number, y: number): string {
  return `<line x1="${x - 16}" y1="${y}" x2="${x + 16}" y2="${y}" stroke="${STROKE}" stroke-width="2.2"/>` +
    `<line x1="${x - 16}" y1="${y + 20}" x2="${x + 16}" y2="${y + 20}" stroke="${STROKE}" stroke-width="2.2"/>`;
}
function ground(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 14}" y1="${y + 12}" x2="${x + 14}" y2="${y + 12}" stroke="${STROKE}" stroke-width="1.8"/>` +
    `<line x1="${x - 9}" y1="${y + 17}" x2="${x + 9}" y2="${y + 17}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<line x1="${x - 4}" y1="${y + 22}" x2="${x + 4}" y2="${y + 22}" stroke="${STROKE}" stroke-width="1.4"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;
}
/** netlist value의 표기를 그림용 평문으로 (−j 기호 통일). */
function plain(v: string): string {
  return v.replaceAll("-j", "−j");
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
