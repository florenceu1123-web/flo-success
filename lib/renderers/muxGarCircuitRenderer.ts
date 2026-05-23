import type { MuxGarCircuitDiagram } from "@/types";

/**
 * MUX (가) 전용 결정론 layout renderer — 임용 5번 형식 변형.
 *
 *   3 NOTs (세로 stack, 같은 x · 다른 y — OR 게이트와 동일 병렬 스타일)
 *   → 6 literal rails(A·A̅·B·B̅·C·C̅, 수직 bus) 가 OR 영역으로 확장
 *   → 3 ORs(같은 x로 세로 stack 병렬) → 1 AND(중앙) → F(직선)
 *
 *   layout 절대 규칙:
 *     - 3 NOT 모두 같은 NOT_X_CENTER에 세로 정렬
 *     - 3 OR 모두 같은 OR_X에 세로 정렬
 *     - AND.output → F는 수평 직선 (구부러짐 금지)
 *     - 입력 wire는 inline으로 NOT을 통과 (polygon white fill이 wire 내부 가림 → wire 양쪽 가시)
 *     - 변수 rail은 입력 wire의 junction에서 DOWN, 부정 rail은 NOT 출력 wire의 junction에서 DOWN
 *     - rail 간 교차는 dot 없는 plain crossing (전기적 연결 아님)
 */

// ─── 좌표 상수 ───────────────────────────────────

const INPUT_LABEL_X = 50;
// 입력 dot y + NOT y — 변수별로 다른 y에서 입력 wire가 inline으로 NOT 통과
const INPUT_NOT_Y = { A: 80, B: 180, C: 280 } as const;

// 3 NOT 모두 같은 x — 세로 stack 병렬
const NOT_W = 38;
const NOT_H = 22;
const NOT_BUBBLE_R = 3;
const NOT_X_CENTER = 290;
const NOT_LEFT_X = NOT_X_CENTER - NOT_W / 2;                       // 271
const NOT_RIGHT_X = NOT_X_CENTER + NOT_W / 2 + 2 * NOT_BUBBLE_R;   // 315

// rail x — 6개. 변수 rail은 NOT 좌측, 부정 rail은 NOT 우측에 분산.
const RAIL_X = {
  A: 110,
  B: 160,
  C: 210,
  A_n: 360,
  B_n: 410,
  C_n: 460,
} as const;

// rail 하한 — OR 영역 아래까지 확장 (모든 OR가 임의 rail tap 가능)
const RAIL_BOTTOM = 620;

// OR 게이트 — 3개 모두 같은 x, 세로 stack
const OR_X = 580;
const OR_Y = [400, 480, 560] as const;
const OR_W = 60;
const OR_H = 60;

// AND 게이트 — 3 OR 중앙 y(480)에 정렬, 우측
const AND_X = 720;
const AND_Y = 480;
const AND_W = 60;
const AND_H = 110;

// F 라벨
const F_LABEL_X = 850;
const F_LABEL_Y = AND_Y;

const SVG_W = 920;
const SVG_H = 660;

const STROKE = "#111827";
const WIRE_W = 1.4;
const DOT_R = 3.2;

// ─── 메인 ────────────────────────────────────────
export function renderMuxGarCircuitSVG(d: MuxGarCircuitDiagram): string {
  if (!Array.isArray(d?.factors) || d.factors.length !== 3) {
    return emptySvg("factors !== 3");
  }

  const parts: string[] = [];

  // 1. 각 변수별 — 입력 라벨/dot + 입력 wire(inline) + 변수 rail + 부정 rail + NOT
  for (const v of ["A", "B", "C"] as const) {
    const y = INPUT_NOT_Y[v];
    const railV = RAIL_X[v];
    const railVn = RAIL_X[`${v}_n` as keyof typeof RAIL_X];

    // 입력 라벨 + dot
    parts.push(text(INPUT_LABEL_X - 14, y + 5, v, { size: 14, weight: 700 }));
    parts.push(dot(INPUT_LABEL_X, y));

    // 입력 wire (수평, inline으로 NOT을 통과 — 한 줄)
    //   draw 순서: wire 먼저 → 그 다음 polygon (polygon white fill이 wire 내부 가림)
    parts.push(line(INPUT_LABEL_X, y, NOT_LEFT_X, y));

    // 변수 rail (NOT 좌측 입력 wire에서 분기 DOWN)
    parts.push(line(railV, y, railV, RAIL_BOTTOM));
    parts.push(dot(railV, y));

    // NOT polygon (마지막 — wire 위 white fill로 inline 단절 효과)
    parts.push(notSymbol(NOT_X_CENTER, y));

    // 출력 wire (수평, NOT 우측에서 부정 rail까지)
    parts.push(line(NOT_RIGHT_X, y, railVn, y));

    // 부정 rail (출력 wire에서 분기 DOWN)
    parts.push(line(railVn, y, railVn, RAIL_BOTTOM));
    parts.push(dot(railVn, y));
  }

  // 2. OR 게이트 3개 + 각각 2개 literal tap (수평 wire)
  d.factors.forEach((factor, i) => {
    const cx = OR_X;
    const cy = OR_Y[i];
    const topInY = cy - 14;
    const botInY = cy + 14;
    const railX1 = RAIL_X[litKey(factor[0])];
    const railX2 = RAIL_X[litKey(factor[1])];

    // OR 본체
    parts.push(orSymbol(cx, cy));

    // 입력 1 — rail → OR 좌측 (top pin)
    const orLeft = cx - OR_W / 2 + 12;
    parts.push(line(railX1, topInY, orLeft, topInY));
    parts.push(dot(railX1, topInY));
    // 입력 2 — rail → OR 좌측 (bottom pin)
    parts.push(line(railX2, botInY, orLeft, botInY));
    parts.push(dot(railX2, botInY));
  });

  // 3. AND 게이트 + OR→AND 라우팅
  parts.push(andSymbol(AND_X, AND_Y));
  const andInputs = [AND_Y - 28, AND_Y, AND_Y + 28];
  OR_Y.forEach((or_cy, i) => {
    const orOutX = OR_X + OR_W / 2;
    const andInX = AND_X - AND_W / 2;
    const andInY = andInputs[i];
    if (or_cy === andInY) {
      // 가운데 OR — 직선
      parts.push(line(orOutX, or_cy, andInX, andInY));
    } else {
      const midX = (orOutX + andInX) / 2;
      parts.push(line(orOutX, or_cy, midX, or_cy));
      parts.push(line(midX, or_cy, midX, andInY));
      parts.push(line(midX, andInY, andInX, andInY));
    }
  });

  // 4. AND 출력 → F (수평 직선)
  const andOutX = AND_X + AND_W / 2;
  parts.push(line(andOutX, AND_Y, F_LABEL_X - 12, AND_Y));
  parts.push(text(F_LABEL_X, F_LABEL_Y + 5, "F", { size: 16, weight: 700 }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">\n${parts.join("\n")}\n</svg>`;
}

// ─── 심볼 ────────────────────────────────────────
function notSymbol(cx: number, cy: number): string {
  const left = cx - NOT_W / 2;
  const right = cx + NOT_W / 2;
  const top = cy - NOT_H / 2;
  const bot = cy + NOT_H / 2;
  const tri = `<polygon points="${left},${top} ${right},${cy} ${left},${bot}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const bub = `<circle cx="${right + NOT_BUBBLE_R}" cy="${cy}" r="${NOT_BUBBLE_R}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return tri + bub;
}

function orSymbol(cx: number, cy: number): string {
  const left = cx - OR_W / 2;
  const right = cx + OR_W / 2;
  const top = cy - OR_H / 2;
  const bot = cy + OR_H / 2;
  const d = [
    `M ${left} ${top}`,
    `Q ${left + 18} ${cy}, ${left} ${bot}`,
    `Q ${left + OR_W * 0.55} ${bot}, ${right} ${cy}`,
    `Q ${left + OR_W * 0.55} ${top}, ${left} ${top}`,
    `Z`,
  ].join(" ");
  return `<path d="${d}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function andSymbol(cx: number, cy: number): string {
  const left = cx - AND_W / 2;
  const right = cx + AND_W / 2;
  const top = cy - AND_H / 2;
  const bot = cy + AND_H / 2;
  const midX = left + AND_W * 0.4;
  const d = [
    `M ${left} ${top}`,
    `L ${midX} ${top}`,
    `Q ${right} ${top}, ${right} ${cy}`,
    `Q ${right} ${bot}, ${midX} ${bot}`,
    `L ${left} ${bot}`,
    `Z`,
  ].join(" ");
  return `<path d="${d}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

// ─── primitives ──────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${STROKE}"/>`;
}

function text(
  x: number,
  y: number,
  s: string,
  opts: { size?: number; weight?: number; anchor?: "start" | "middle" | "end" } = {},
): string {
  const size = opts.size ?? 12;
  const weight = opts.weight ?? 400;
  const anchor = opts.anchor ?? "middle";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${STROKE}">${escapeSvg(s)}</text>`;
}

function litKey(l: { variable: "A" | "B" | "C"; negated: boolean }): keyof typeof RAIL_X {
  if (l.negated) {
    if (l.variable === "A") return "A_n";
    if (l.variable === "B") return "B_n";
    return "C_n";
  }
  return l.variable;
}

function escapeSvg(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} 64"><text x="${SVG_W / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${escapeSvg(msg)}</text></svg>`;
}
