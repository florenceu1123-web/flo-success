import type { DcWheatstoneBalanceCircuitDiagram } from "@/types";

/**
 * DC 휘트스톤 브리지 평형 (임용 3번 회로이론) — 전용 fixed-slot 렌더러.
 *
 *  원본 배치 그대로:
 *    좌측 세로 전원 V_s → 상단 레일의 직렬 R_s → 다이아몬드(T·L·R·B) → 하단 GND 레일.
 *    · 상단 좌 R1(T→L) / 상단 우 R_tr(T→R) / 하단 좌 R3a(L→B) / 하단 우 R_rb(R→B)
 *    · 하단 좌측에는 L→GND 병렬 저항 R3b(수직)가 하나 더 있다(원본 12Ω).
 *    · 브리지 암 R_g는 L–R 수평.
 *    · 미지 암(R_x)에는 보조 저항 R_p가 병렬(원본 15Ω, 상단 우측).
 *    · 출력 V_o는 상단 레일(+)과 우측 마디 R(−) 사이 **개방 단자**.
 *
 *  ★ 구조가 고정이므로 payload는 라벨 + 미지 암 위치만 받는다(좌표 정보 금지 — CLAUDE.md 절대 원칙).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

// 고정 슬롯 좌표
const W = 620, H = 430;
const X_SRC = 70;              // 전원 세로 leg
const Y_TOP = 70, Y_BOT = 360; // 상단 레일 · 하단 GND 레일
const X_T = 300, Y_T = Y_TOP;  // 다이아몬드 상단 꼭짓점(상단 레일 위)
const X_L = 205, Y_MID = 195;  // 좌 꼭짓점
const X_R = 395;               // 우 꼭짓점
const X_B = 300, Y_B = 300;    // 하단 꼭짓점
const X_P = 470;               // 병렬 보조 저항 R_p 레인
const X_VO = 550;              // 출력 단자 레인

export function renderDcWheatstoneBalanceCircuit(d: DcWheatstoneBalanceCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const upperUnknown = d.unknownArm === "upper_right";

  // ── 상단 레일: 전원(+) ─ R_s ─ T ─ … ─ V_o(+) 단자
  w.push(line(X_SRC, Y_TOP, 120, Y_TOP));
  resSeg(s, t, 120, Y_TOP, 200, Y_TOP, d.rsLabel, "above");
  w.push(line(200, Y_TOP, X_VO, Y_TOP));

  // ── 하단 GND 레일 (전원 − → 다이아몬드 하단 → R_p 하단(변형일 때))
  const xBotEnd = upperUnknown ? X_B : X_P;
  w.push(line(X_SRC, Y_BOT, xBotEnd, Y_BOT));

  // ── 전원 (세로)
  vSource(s, t, X_SRC, Y_TOP, Y_BOT, d.vsLabel);

  // ── 다이아몬드 4개 암
  resSeg(s, t, X_T, Y_T, X_L, Y_MID, d.r1Label, "left");            // 상단 좌
  resSeg(s, t, X_T, Y_T, X_R, Y_MID, d.rtrLabel, "right", upperUnknown);  // 상단 우 (미지면 강조)
  // 하단 좌 — 라벨은 다이아몬드 **안쪽**(오른쪽)에. 바깥쪽에 두면 바로 옆 세로 R3b 지그재그와 겹친다(규칙 #6).
  resSeg(s, t, X_L, Y_MID, X_B, Y_B, d.r3aLabel, "right");
  resSeg(s, t, X_R, Y_MID, X_B, Y_B, d.rrbLabel, "right", !upperUnknown); // 하단 우 (미지면 강조)
  // 브리지 암 (수평) — 평형이면 전류 0
  resSeg(s, t, X_L, Y_MID, X_R, Y_MID, d.rgLabel, "above");
  // 하단 꼭짓점 → GND
  w.push(line(X_B, Y_B, X_B, Y_BOT));
  // 하단 좌측 병렬 저항 R3b (L → GND 수직)
  resSeg(s, t, X_L, Y_MID, X_L, Y_BOT, d.r3bLabel, "left");

  // ── 우측: R 마디 → 출력 단자 (개방) + 보조 저항 R_p (미지 암과 병렬)
  w.push(line(X_R, Y_MID, X_VO, Y_MID));
  if (upperUnknown) {
    // R_p ∥ 상단 우측 암 → 상단 레일과 R 마디 사이 세로
    resSeg(s, t, X_P, Y_TOP, X_P, Y_MID, d.rpLabel, "right");
    s.push(dot(X_P, Y_TOP), dot(X_P, Y_MID));
  } else {
    // R_p ∥ 하단 우측 암 → R 마디와 GND 레일 사이 세로
    w.push(line(X_P, Y_MID, X_P, Y_MID));
    resSeg(s, t, X_P, Y_MID, X_P, Y_BOT, d.rpLabel, "right");
    s.push(dot(X_P, Y_MID), dot(X_P, Y_BOT));
  }

  // ── 노드 dot (degree ≥ 3)
  s.push(dot(X_T, Y_T), dot(X_L, Y_MID), dot(X_R, Y_MID), dot(X_B, Y_B));

  // ── 출력 단자 (개방) + 극성
  s.push(termCircle(X_VO, Y_TOP), termCircle(X_VO, Y_MID));
  t.push(text(X_VO - 12, Y_TOP - 10, "+", { size: 14, weight: 700, fill: RED, anchor: "middle" }));
  t.push(text(X_VO - 12, Y_MID + 22, "−", { size: 14, weight: 700, fill: RED, anchor: "middle" }));
  t.push(text(X_VO + 14, (Y_TOP + Y_MID) / 2 + 5, d.voLabel ?? "V_o", { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));

  // ── 접지 심볼
  ground(s, X_B + 60 > xBotEnd ? xBotEnd - 30 : X_B + 60, Y_BOT);

  t.push(text(W / 2, H - 10, "휘트스톤 브리지 — 브리지 암 전류 0(평형) 조건에서 R_x·개방 출력 V_o", { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────── 헬퍼 ───────────────────────
/**
 * (x1,y1)→(x2,y2) 방향을 따라 지그재그 저항 + 양쪽 리드.
 *  labelSide: 진행방향 기준 라벨 오프셋 방향. emphasize=true면 미지 저항(R_x) 강조색.
 */
function resSeg(
  s: string[], t: string[],
  x1: number, y1: number, x2: number, y2: number,
  label: string, labelSide: "left" | "right" | "above", emphasize = false,
): void {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;      // 진행 방향
  const px = -uy, py = ux;                 // 좌측 법선
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const half = Math.min(24, len / 2 - 6), amp = 6, teeth = 6, step = (2 * half) / teeth;

  const ax = cx - ux * half, ay = cy - uy * half;   // 지그재그 시작
  const bx = cx + ux * half, by = cy + uy * half;   // 지그재그 끝
  s.push(line(x1, y1, ax, ay), line(bx, by, x2, y2));

  let p = `M${r(ax)},${r(ay)}`;
  for (let i = 0; i < teeth; i++) {
    const along = step * (i + 0.5), sign = i % 2 === 0 ? 1 : -1;
    p += ` L${r(ax + ux * along + px * amp * sign)},${r(ay + uy * along + py * amp * sign)}`;
  }
  p += ` L${r(bx)},${r(by)}`;
  s.push(`<path d="${p}" fill="none" stroke="${emphasize ? ACCENT : STROKE}" stroke-width="${emphasize ? 2.2 : WIRE_W}" stroke-linejoin="round"/>`);

  // 라벨 — 소자 box 밖으로 법선 방향 오프셋 (규칙 #6: 라벨 겹침 회피)
  const off = 20;
  const sign = labelSide === "left" ? 1 : -1;
  const lx = labelSide === "above" ? cx : cx + px * off * sign;
  const ly = labelSide === "above" ? cy - 14 : cy + py * off * sign + 4;
  t.push(text(lx, ly, label, {
    size: 11.5, weight: emphasize ? 700 : 600,
    fill: emphasize ? ACCENT : STROKE,
    anchor: labelSide === "left" ? "end" : labelSide === "right" ? "start" : "middle",
  }));
}

/** DC 전압원 (원 + 극성, 세로). + 위. */
function vSource(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, rad = 20;
  s.push(line(x, y1, x, cy - rad), line(x, cy + rad, x, y2));
  s.push(`<circle cx="${x}" cy="${cy}" r="${rad}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(`<text x="${x}" y="${cy - 5}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">+</text>`);
  t.push(`<text x="${x}" y="${cy + 15}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">−</text>`);
  t.push(text(x - 28, cy + 4, label, { size: 12, weight: 700, anchor: "end", fill: ACCENT }));
}

function ground(s: string[], x: number, y: number): void {
  s.push(line(x, y, x, y + 14));
  s.push(line(x - 12, y + 14, x + 12, y + 14));
  s.push(line(x - 7, y + 19, x + 7, y + 19));
  s.push(line(x - 3, y + 24, x + 3, y + 24));
}
function termCircle(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${r(x)}" y="${r(y)}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function r(x: number): number { return Math.round(x * 10) / 10; }
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function svg(body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.join("\n")}\n</svg>`;
}
