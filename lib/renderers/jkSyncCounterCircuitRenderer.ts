import type { JkSyncCounterCircuitDiagram } from "@/types";

/**
 * JK 플립플롭 3개 동기식 카운터 (가) 전용 fixed-slot 렌더러.
 *
 * 자동 logic_network 라우터는 피드백(Q→J/K) wire가 엉켜 지저분해진다. 3비트 구조가 고정이므로
 * 교과서식 고정 배치로 그린다: FF0·FF1·FF2를 한 행에 두고, J₀=K₀=High, 앞단 출력이 다음단 J/K로
 * 전진(forward) 피드백, Q₀·Q₁의 AND가 FF2 J/K로. 상향은 Q, 하향은 Q̄ 출력을 피드백에 사용.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 860, H = 360;
const FF_W = 78, FF_H = 96;
const CY = 120;                       // FF 세로 중심
const Y0 = CY - FF_H / 2;             // FF 박스 상단
const FF_X = [120, 360, 660];        // FF0·FF1·FF2 좌측 x
const AND_X = 512, AND_Y = 190, AND_W = 54, AND_H = 48; // AND 게이트 (하단, FF1↔FF2 사이)
const CLK_Y = 300;                    // 공통 CP 버스
const HIGH_X = 44;                    // High("1") 입력 x

// FF 핀 y 좌표 (박스 기준)
const jY = CY - 24;   // J 입력 (좌상)
const kY = CY + 24;   // K 입력 (좌하)
const qY = CY - 18;   // Q 출력 (우상)
const qbY = CY + 18;  // Q̄ 출력 (우하)
const clkPinY = Y0 + FF_H - 14; // ▷ 클럭 핀 (좌하)

type D = JkSyncCounterCircuitDiagram;

export function renderJkSyncCounterCircuit(d: D): string {
  const up = d.direction !== "down";
  const feedY = up ? qY : qbY;          // 피드백에 쓰는 출력 핀 y
  const feedLabel = up ? "Q" : "Q̄";
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  // ── FF 3개 ──
  const qNames = ["Q₀", "Q₁", "Q₂"];
  FF_X.forEach((x, i) => {
    s.push(rect(x, Y0, FF_W, FF_H));
    t.push(text(x + FF_W / 2, Y0 - 6, "JK-FF", { size: 11, weight: 700, fill: MUTED }));
    // 좌측 J·K 핀 라벨 + stub
    t.push(text(x + 9, jY + 4, "J", { size: 12, weight: 600, anchor: "start" }));
    t.push(text(x + 9, kY + 4, "K", { size: 12, weight: 600, anchor: "start" }));
    // 우측 Q·Q̄ 핀 라벨
    t.push(text(x + FF_W - 9, qY + 4, "Q", { size: 12, weight: 600, anchor: "end" }));
    t.push(text(x + FF_W - 9, qbY + 4, "Q̄", { size: 11, weight: 600, anchor: "end", fill: MUTED }));
    // ▷ 클럭 핀
    s.push(clkTri(x, clkPinY));
    // Q 출력 라벨 (각 FF 우측 바깥)
    const qx = x + FF_W;
    w.push(line(qx, qY, qx + 12, qY));
    s.push(dot(qx + 12, qY));
    t.push(text(qx + 18, qY + 4, qNames[i], { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  });

  // ── J₀=K₀=High("1") ──
  t.push(text(HIGH_X, CY + 4, "1", { size: 14, weight: 700 }));
  const hjx = FF_X[0] - 26;
  w.push(line(HIGH_X + 10, CY, hjx, CY));
  s.push(dot(hjx, CY));
  w.push(line(hjx, jY, hjx, kY));            // 세로 분기
  w.push(line(hjx, jY, FF_X[0], jY));        // → J₀
  w.push(line(hjx, kY, FF_X[0], kY));        // → K₀
  t.push(text(FF_X[0] - 4, jY - 4, "1", { size: 9, anchor: "end", fill: MUTED }));
  t.push(text(FF_X[0] - 4, kY - 4, "1", { size: 9, anchor: "end", fill: MUTED }));

  // ── 전진 피드백 helper: FF[i] 피드백 출력 → FF[i+1] J·K ──
  const feedToNextJK = (from: number, to: number) => {
    const sx = FF_X[from] + FF_W;          // 피드백 출력점
    const tapX = FF_X[to] - 26;            // 다음 FF 좌측 앞 세로 tap
    w.push(line(sx, feedY, tapX, feedY));  // 수평
    w.push(line(tapX, jY, tapX, kY));      // 세로 분기
    w.push(line(tapX, jY, FF_X[to], jY));  // → J
    w.push(line(tapX, kY, FF_X[to], kY));  // → K
    s.push(dot(tapX, feedY));
    t.push(text(FF_X[to] - 30, feedY - 6, `${feedLabel}${sub(from)}`, { size: 9, anchor: "end", fill: ACCENT }));
    return tapX;
  };

  // FF0 → FF1 J/K
  feedToNextJK(0, 1);

  // ── AND(Q0feed, Q1feed) → FF2 J/K ──
  s.push(andGate(AND_X, AND_Y, AND_W, AND_H));
  const andInY1 = AND_Y + AND_H * 0.3;
  const andInY2 = AND_Y + AND_H * 0.7;
  const andOutX = AND_X + AND_W + 6;
  const andOutY = AND_Y + AND_H / 2;
  // Q0 feed → AND 아래 입력: FF0 출력에서 아래로
  const q0x = FF_X[0] + FF_W + 12;   // FF0 Q dot 위치
  w.push(line(q0x, feedY, q0x, andInY2));
  w.push(line(q0x, andInY2, AND_X, andInY2));
  // Q1 feed → AND 위 입력
  const q1x = FF_X[1] + FF_W + 12;
  w.push(line(q1x, feedY, q1x, andInY1));
  w.push(line(q1x, andInY1, AND_X, andInY1));
  t.push(text((AND_X + andOutX) / 2, AND_Y - 4, `${feedLabel}₀·${feedLabel}₁`, { size: 9, anchor: "middle", fill: ACCENT }));
  // AND 출력 → FF2 J/K (위로 올려 좌측 tap)
  const f2tap = FF_X[2] - 26;
  w.push(line(andOutX, andOutY, f2tap, andOutY));
  w.push(line(f2tap, andOutY, f2tap, jY));
  w.push(line(f2tap, jY, f2tap, kY));
  w.push(line(f2tap, jY, FF_X[2], jY));
  w.push(line(f2tap, kY, FF_X[2], kY));
  s.push(dot(f2tap, andOutY));

  // ── 공통 CP 클럭 버스 ──
  t.push(text(40, CLK_Y + 4, "CP", { size: 12, weight: 700, anchor: "end" }));
  w.push(line(46, CLK_Y, FF_X[2] + 30, CLK_Y));
  FF_X.forEach((x) => {
    w.push(line(x - 12, CLK_Y, x - 12, clkPinY));
    w.push(line(x - 12, clkPinY, x, clkPinY));
    s.push(dot(x - 12, CLK_Y));
  });

  const dirKo = up ? "상향(2진 증가)" : "하향(2진 감소)";
  t.push(text(W / 2, H - 8, `JK 플립플롭 3개 동기식 카운터 — J·K를 하위 비트로 배선 (${dirKo}). Q₀=LSB.`, { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function sub(i: number): string {
  return ["₀", "₁", "₂"][i] ?? String(i);
}
function andGate(x: number, y: number, w: number, h: number): string {
  // D자 AND 게이트 (좌변 직선, 우측 반원)
  return `<path d="M ${x} ${y} L ${x + w * 0.5} ${y} A ${h / 2} ${h / 2} 0 0 1 ${x + w * 0.5} ${y + h} L ${x} ${y + h} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function rect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
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
