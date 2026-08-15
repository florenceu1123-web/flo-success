import type { DffStateDesignCircuitDiagram } from "@/types";

/**
 * D-FF 2개 + 게이트 구현 회로 (임용 9번 정보과 (다)) 전용 fixed-slot 렌더러.
 *   게이트 ㉮(빈칸) → D_A → FF_A → Q_A,  ㉯(빈칸) → D_B → FF_B → Q_B.
 *   입력 Q_A·Q_B(피드백)가 두 게이트로, 공통 CLK.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 660, H = 440;
const GATE_X = 230, GATE_W = 64, GATE_H = 48;
const FF_L = 380, FF_W = 86;
const FF_A_CY = 120, FF_B_CY = 290, FF_HALF = 44;
const Q_OUT_X = FF_L + FF_W + 26;
const FB_A_Y = 60, FB_B_Y = 380;   // 피드백 lane
const CLK_RAIL_Y = 410;
const IN_X = 120;                   // Q_A·Q_B 입력 트렁크
const EXT_X = 62;                   // 외부 입력(X) 트렁크 — externalInput이 있을 때만 그린다

type D = DffStateDesignCircuitDiagram;

export function renderDffStateDesignCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  /** 게이트 입력 탭 좌표 — 트렁크(세로선) 길이를 여기서 역산한다. */
  const taps: Array<{ x: number; y: number }> = [];

  const rows = [
    { sym: d.gateASym ?? "㉮", gateCy: FF_A_CY, ffCy: FF_A_CY, ffId: "FF_A", qLabel: "Q_A",
      ffType: d.ffAType ?? "D", inputName: d.ffAInputName ?? "D_A" },
    { sym: d.gateBSym ?? "㉯", gateCy: FF_B_CY, ffCy: FF_B_CY, ffId: "FF_B", qLabel: "Q_B",
      ffType: d.ffBType ?? "D", inputName: d.ffBInputName ?? "D_B" },
  ] as const;
  for (const { sym, gateCy, ffCy, ffId, qLabel, ffType, inputName } of rows) {
    const pin = ffType === "T" ? "T" : "D";   // 입력 핀 라벨
    // 게이트 박스 (빈칸 — 종류 미정)
    const gx = GATE_X, gy = gateCy - GATE_H / 2;
    s.push(`<rect x="${gx}" y="${gy}" width="${GATE_W}" height="${GATE_H}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-dasharray="5 3"/>`);
    t.push(text(gx + GATE_W / 2, gateCy + 6, sym, { size: 16, weight: 700, fill: ACCENT }));
    // 게이트 입력 — 기본 Q_A·Q_B, payload에 gateXInputs가 있으면 그대로 사용(외부 입력 X 포함 가능).
    //   ★ 입력 개수만큼 y로 분리해 그린다(레인 규칙 #3) — 3입력(임용 12번 X 포함 상태기계)도 지원.
    const gIns = (sym === (d.gateASym ?? "㉮") ? d.gateAInputs : d.gateBInputs) ?? ["Q_A", "Q_B"];
    const nIn = Math.max(2, Math.min(gIns.length, 3));
    const step = GATE_H / (nIn + 1);
    gIns.slice(0, 3).forEach((name, gi) => {
      const y = gateCy - GATE_H / 2 + step * (gi + 1);
      const fromX = name === (d.externalInput ?? "X") ? EXT_X : gi === 0 ? IN_X : IN_X + 24;
      w.push(line(fromX, y, gx, y));
      t.push(text(gx - 6, y - 4, name, { size: 9, anchor: "end", fill: MUTED }));
      // ★ 트렁크 길이는 이 탭 좌표에서 역산한다 — 상수로 박으면 입력 수가 바뀔 때
      //   위아래로 삐져나오거나(dangling) 반대로 탭에 못 닿는다(실측 신고 2026-08-02).
      taps.push({ x: fromX, y });
    });
    // 게이트 출력 → 입력 핀(D 또는 T)
    w.push(line(gx + GATE_W, gateCy, FF_L, ffCy));
    t.push(text((gx + GATE_W + FF_L) / 2, ffCy - 6, inputName, { size: 10, weight: 600, fill: "#dc2626" }));

    // FF 박스
    s.push(`<rect x="${FF_L}" y="${ffCy - FF_HALF}" width="${FF_W}" height="${FF_HALF * 2}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    t.push(text(FF_L + FF_W / 2, ffCy - 22, `${pin}-FF`, { size: 11, weight: 700, fill: MUTED }));
    t.push(text(FF_L + FF_W / 2, ffCy + 6, ffId.replace("FF_", "FF "), { size: 10, fill: MUTED }));
    t.push(text(FF_L + 10, ffCy - 12 + 4, pin, { size: 11, weight: 600, anchor: "start" }));
    t.push(text(FF_L + FF_W - 10, ffCy - 12 + 4, "Q", { size: 11, weight: 600, anchor: "end" }));
    s.push(clkTri(FF_L, ffCy + 16));
    // Q 출력
    w.push(line(FF_L + FF_W, ffCy - 12, Q_OUT_X, ffCy - 12));
    s.push(dot(Q_OUT_X, ffCy - 12));
    t.push(text(Q_OUT_X + 8, ffCy - 8, qLabel, { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  }

  // ── 입력 트렁크 — 길이는 **실제 탭 좌표**에서 역산한다 (삐져나옴·미도달 방지) ──
  const tapsAt = (x: number) => taps.filter((p) => p.x === x).map((p) => p.y);
  const spanOf = (x: number, ...extra: number[]) => {
    const ys = [...tapsAt(x), ...extra];
    return ys.length ? { top: Math.min(...ys), bot: Math.max(...ys) } : null;
  };

  // Q_A 출력 → 위 lane(FB_A_Y) → IN_X 트렁크 (아래 끝 = Q_A 탭 중 가장 아래)
  const qaSpan = spanOf(IN_X, FB_A_Y);
  if (qaSpan) {
    w.push(line(Q_OUT_X, FF_A_CY - 12, Q_OUT_X, FB_A_Y));
    w.push(line(Q_OUT_X, FB_A_Y, IN_X, FB_A_Y));
    w.push(line(IN_X, qaSpan.top, IN_X, qaSpan.bot));
    s.push(dot(IN_X, FB_A_Y));
    t.push(text(IN_X - 4, (qaSpan.top + qaSpan.bot) / 2, "Q_A", { size: 10, weight: 700, fill: ACCENT, anchor: "end" }));
  }
  // Q_B 출력 → 아래 lane(FB_B_Y) → IN_X+24 트렁크 (위 끝 = Q_B 탭 중 가장 위)
  const qbSpan = spanOf(IN_X + 24, FB_B_Y);
  if (qbSpan) {
    w.push(line(Q_OUT_X, FF_B_CY - 12, Q_OUT_X + 14, FF_B_CY - 12));
    w.push(line(Q_OUT_X + 14, FF_B_CY - 12, Q_OUT_X + 14, FB_B_Y));
    w.push(line(Q_OUT_X + 14, FB_B_Y, IN_X + 24, FB_B_Y));
    w.push(line(IN_X + 24, qbSpan.top, IN_X + 24, qbSpan.bot));
    s.push(dot(IN_X + 24, FB_B_Y));
    t.push(text(IN_X + 28, (qbSpan.top + qbSpan.bot) / 2, "Q_B", { size: 10, weight: 700, fill: ACCENT, anchor: "start" }));
  }

  // ── 외부 입력 X (있을 때만) — 트렁크는 X 탭 사이만, 인입 stub은 **첫 탭 높이**로 ──
  const xSpan = d.externalInput ? spanOf(EXT_X) : null;
  if (d.externalInput && xSpan) {
    w.push(line(EXT_X, xSpan.top, EXT_X, xSpan.bot));
    w.push(line(EXT_X - 26, xSpan.top, EXT_X, xSpan.top));
    t.push(text(EXT_X - 30, xSpan.top + 4, d.externalInput, { size: 12, weight: 700, fill: ACCENT, anchor: "end" }));
    s.push(dot(EXT_X, xSpan.top));
  }

  // ── CLK 공통 ──
  t.push(text(40, CLK_RAIL_Y + 4, "CLK", { size: 12, weight: 600, anchor: "end" }));
  w.push(line(46, CLK_RAIL_Y, FF_L - 16, CLK_RAIL_Y));
  w.push(line(FF_L - 16, CLK_RAIL_Y, FF_L - 16, FF_A_CY + 16));
  w.push(line(FF_L - 16, FF_A_CY + 16, FF_L, FF_A_CY + 16));
  w.push(line(FF_L - 16, FF_B_CY + 16, FF_L, FF_B_CY + 16));
  s.push(dot(FF_L - 16, FF_B_CY + 16));

  const ffSummary = `${d.ffAType ?? "D"}-FF + ${d.ffBType ?? "D"}-FF`;
  const inSummary = `${d.ffAInputName ?? "D_A"}·${d.ffBInputName ?? "D_B"}`;
  t.push(text(W / 2, H - 8, `${ffSummary} + 게이트 ㉮·㉯ — ${inSummary}를 Q_A·Q_B 함수로 구현 (㉮·㉯ 학생 도출)`, { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function clkTri(x: number, cy: number): string {
  const h = 6;
  return `<polygon points="${x},${cy - h} ${x + 9},${cy} ${x},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
