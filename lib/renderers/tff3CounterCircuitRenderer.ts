import type { Tff3CounterCircuitDiagram } from "@/types";

/**
 * T-FF 3개 자율(외부 입력 없음) 동기식 카운터 (임용 11번 (다)) — 전용 fixed-slot 렌더러.
 *
 *  ★ 원본 배치를 따른다: **세로 스택**(위→아래 = C·B·A), 각 T-FF 왼쪽에 조합 블록,
 *    왼쪽 아래에 클럭 파형 심볼 + CLK 세로 버스, 오른쪽에 상태변수 되먹임 버스.
 *
 *  ★ 원본은 T_C·T_A 조합 블록의 **내용을 주지 않는다**(상태도만으로 문제가 풀린다).
 *    식을 그려 넣으면 원본에 없는 정보가 생기므로 빈 블록으로 둔다.
 *    가운데 블록이 **㉢** — 학생이 2입력 게이트 2개로 그려 넣는다.
 *
 *  ★ 되먹임을 가는 실선 한 줄로 그리면 C·B·A가 한 노드로 단락된 회로가 된다 →
 *    굵은 **버스**로 그리고 분기마다 사선 탭을 붙인다(디지털 회로도 표준 표기).
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const BUS = "#94a3b8";

const W = 720, H = 560;
const FF_X = 430, FF_W = 118, FF_H = 104;
const FF_Y = [40, 190, 340];                 // 위→아래 = C · B · A
const BLK_X = 240, BLK_W = 100, BLK_H = 58;
const X_CLK = 150;                           // CLK 세로 버스
const X_FBK = 206;                           // 되먹임 버스(왼쪽 세로 구간)
const X_OUT = 622;                           // 되먹임 버스(오른쪽 세로 구간) = 출력 탭 지점
const Y_BUS_TOP = 22, Y_BUS_BOT = 480;
const NAMES = ["C", "B", "A"];

export function renderTff3CounterCircuit(d: Tff3CounterCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── 상태변수 되먹임 버스 (오른쪽 세로 → 아래 가로 → 왼쪽 세로) ──────────
  const bus = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BUS}" stroke-width="5" stroke-linecap="round"/>`;
  s.push(bus(X_OUT, Y_BUS_TOP, X_OUT, Y_BUS_BOT));
  s.push(bus(X_OUT, Y_BUS_BOT, X_FBK, Y_BUS_BOT));
  s.push(bus(X_FBK, Y_BUS_BOT, X_FBK, Y_BUS_TOP));
  t.push(text(X_FBK + 8, Y_BUS_BOT + 18, "상태변수 되먹임 버스 — C · B · A 와 각 보수", { size: 10, anchor: "start", fill: MUTED }));

  FF_Y.forEach((fy, i) => {
    const name = NAMES[i];
    const isBlank = i === 1;
    const yIn = fy + 34, yQ = fy + 30, yQbar = fy + 72, yClk = fy + FF_H - 22;

    // ── 조합 블록 ────────────────────────────────────────────────────
    const by = fy + 12;
    if (isBlank) {
      s.push(`<rect x="${BLK_X}" y="${by}" width="${BLK_W}" height="${BLK_H}" rx="6" fill="white" stroke="${ACCENT}" stroke-width="1.8" stroke-dasharray="6 4"/>`);
      t.push(text(BLK_X + BLK_W / 2, by + 30, d.blockLabel ?? "㉢", { size: 21, weight: 700, fill: ACCENT }));
      t.push(text(BLK_X + BLK_W / 2, by + 48, `(2입력 ${d.gateKind ?? "NAND"} 2개)`, { size: 9, fill: RED }));
    } else {
      s.push(`<rect x="${BLK_X}" y="${by}" width="${BLK_W}" height="${BLK_H}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
      t.push(text(BLK_X + BLK_W / 2, by + 34, "조합 논리", { size: 12, fill: MUTED }));
    }

    // 버스 → 블록 입력 (사선 탭)
    w.push(line(X_FBK, by + BLK_H / 2, BLK_X, by + BLK_H / 2));
    s.push(`<line x1="${X_FBK + 4}" y1="${by + BLK_H / 2 + 7}" x2="${X_FBK + 16}" y2="${by + BLK_H / 2 - 5}" stroke="${BUS}" stroke-width="2"/>`);

    // 블록 출력 → FF T 입력 (신호 이름 T_C·T_B·T_A)
    w.push(line(BLK_X + BLK_W, by + BLK_H / 2, BLK_X + BLK_W + 20, by + BLK_H / 2));
    w.push(line(BLK_X + BLK_W + 20, by + BLK_H / 2, BLK_X + BLK_W + 20, yIn), line(BLK_X + BLK_W + 20, yIn, FF_X, yIn));
    t.push(text((BLK_X + BLK_W + 20 + FF_X) / 2, yIn - 8, `T_${name}`, { size: 12, weight: 700, fill: ACCENT }));

    // ── T 플립플롭 ───────────────────────────────────────────────────
    s.push(`<rect x="${FF_X}" y="${fy}" width="${FF_W}" height="${FF_H}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    t.push(text(FF_X + FF_W / 2, fy - 8, "T 플립플롭", { size: 11, weight: 700, fill: MUTED }));
    t.push(text(FF_X + 14, yIn + 4, "T", { size: 13, weight: 700, anchor: "start" }));
    t.push(text(FF_X + FF_W - 14, yQ + 4, "Q", { size: 13, weight: 700, anchor: "end" }));
    t.push(text(FF_X + FF_W - 14, yQbar + 4, "Q̅", { size: 13, weight: 700, anchor: "end" }));
    // 클럭 삼각형 + CLK 버스 연결
    s.push(`<path d="M${FF_X},${yClk - 7} L${FF_X + 12},${yClk} L${FF_X},${yClk + 7} Z" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    w.push(line(X_CLK, yClk, FF_X, yClk));
    s.push(dot(X_CLK, yClk));

    // ── Q · Q̅ → 되먹임 버스 (출력 이름 C·B·A는 Q 선 위에) ─────────────
    w.push(line(FF_X + FF_W, yQ, X_OUT, yQ));
    w.push(line(FF_X + FF_W, yQbar, X_OUT, yQbar));
    s.push(`<line x1="${X_OUT - 16}" y1="${yQ + 7}" x2="${X_OUT - 4}" y2="${yQ - 5}" stroke="${BUS}" stroke-width="2"/>`);
    s.push(`<line x1="${X_OUT - 16}" y1="${yQbar + 7}" x2="${X_OUT - 4}" y2="${yQbar - 5}" stroke="${BUS}" stroke-width="2"/>`);
    t.push(text(X_OUT - 26, yQ - 8, name, { size: 14, weight: 700, anchor: "end", fill: ACCENT }));
    t.push(text(X_OUT - 26, yQbar - 8, `${name}̅`, { size: 12, weight: 700, anchor: "end", fill: ACCENT }));
  });

  // ── CLK 세로 버스 + 클럭 파형 심볼 (원본 배치) ────────────────────────
  w.push(line(X_CLK, FF_Y[0] + FF_H - 22, X_CLK, FF_Y[2] + FF_H - 22));
  const yClkLabel = FF_Y[2] + FF_H - 22;
  w.push(line(96, yClkLabel, X_CLK, yClkLabel));
  t.push(text(56, yClkLabel + 4, d.clockLabel ?? "CLK", { size: 12, weight: 700, anchor: "end" }));
  // 작은 구형파 심볼 (□□) — 원본의 CLK 옆 파형 표기
  s.push(`<path d="M62,${yClkLabel - 18} h8 v-10 h8 v10 h8 v-10 h8 v10 h6" fill="none" stroke="${MUTED}" stroke-width="1.3"/>`);

  t.push(text(W / 2, H - 32, "외부 입력 없이 클럭만으로 상태가 진행하는 자율 카운터 (Qₙ₊₁ = Qₙ ⊕ T)", { size: 10, fill: MUTED }));
  t.push(text(W / 2, H - 14, `${d.blockLabel ?? "㉢"} : T_B 를 만드는 논리 회로 — 2입력 ${d.gateKind ?? "NAND"} 게이트 2개만으로 구성하여 그릴 것`, { size: 10.5, fill: RED }));
  return svg([...w, ...s, ...t]);
}

// ─────────────────────────── 헬퍼 ───────────────────────────
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
