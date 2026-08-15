import type { DiodeClamperCircuitDiagram, DiodeClamperWaveformDiagram } from "@/types";

/**
 * 다이오드 클램퍼 (가) 회로 + (나) 파형 2단 패널 전용 fixed-slot 렌더러 (임용 2번 전자회로).
 * 원본 배치 그대로 — generic 경로는 **다이오드를 통째로 잃어버렸다**(사용자 신고).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

// ─────────────────────────── (가) 회로 ───────────────────────────
export function renderDiodeClamperCircuit(d: DiodeClamperCircuitDiagram): string {
  const W = 560, H = 320;
  const xIn = 70, xC = 180, xA = 300, xR = 430, xOut = 500;
  const yTop = 90, yBot = 250;
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // 입력 단자 (+/−)
  s.push(term(xIn, yTop), term(xIn, yBot));
  t.push(text(xIn - 12, yTop - 8, "+", { anchor: "end", size: 13, weight: 700, fill: RED }));
  t.push(text(xIn - 12, yBot + 14, "−", { anchor: "end", size: 14, weight: 700, fill: RED }));
  t.push(text(xIn - 12, (yTop + yBot) / 2 + 4, d.viLabel, { anchor: "end", size: 13, weight: 700, fill: ACCENT }));

  // 상단: v_i — C — 마디 A — R 쪽 — 출력 단자
  w.push(line(xIn, yTop, xC - 10, yTop));
  s.push(capacitorH(xC, yTop));
  t.push(text(xC, yTop - 18, d.cLabel, { size: 12, weight: 600 }));
  w.push(line(xC + 10, yTop, xA, yTop));
  s.push(dot(xA, yTop));
  w.push(line(xA, yTop, xR, yTop));
  s.push(dot(xR, yTop));
  w.push(line(xR, yTop, xOut, yTop));
  s.push(term(xOut, yTop), term(xOut, yBot));
  t.push(text(xOut + 12, yTop - 8, "+", { anchor: "start", size: 13, weight: 700, fill: RED }));
  t.push(text(xOut + 12, yBot + 14, "−", { anchor: "start", size: 14, weight: 700, fill: RED }));
  t.push(text(xOut + 12, (yTop + yBot) / 2 + 4, d.voLabel, { anchor: "start", size: 13, weight: 700, fill: ACCENT }));

  // 마디 A 아래: 다이오드 + 바이어스 전지
  const yD = yTop + 46, yB = yTop + 108;
  w.push(line(xA, yTop, xA, yD - 16));
  s.push(diodeV(xA, yD, d.diodeDir));
  w.push(line(xA, yD + 16, xA, yB - 14));
  s.push(batteryV(xA, yB, d.biasTopSign));
  t.push(text(xA - 18, yB + 4, d.biasLabel, { anchor: "end", size: 12, weight: 600 }));
  w.push(line(xA, yB + 14, xA, yBot));

  // 부하 저항 R
  const yR = (yTop + yBot) / 2;
  w.push(line(xR, yTop, xR, yR - 26));
  s.push(resistorV(xR, yR));
  t.push(text(xR + 16, yR + 4, d.rLabel, { anchor: "start", size: 12, weight: 600 }));
  w.push(line(xR, yR + 26, xR, yBot));

  // 하단 rail
  w.push(line(xIn, yBot, xOut, yBot));
  s.push(dot(xA, yBot), dot(xR, yBot));

  t.push(text(W / 2, H - 10,
    d.diodeDir === "down"
      ? "다이오드 도통 시 마디 전압이 바이어스로 고정된다 → 출력 파형의 **상한**이 결정된다"
      : "다이오드 도통 시 마디 전압이 바이어스로 고정된다 → 출력 파형의 **하한**이 결정된다",
    { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── (나) 파형 2단 ───────────────────────────
export function renderDiodeClamperWaveform(d: DiodeClamperWaveformDiagram): string {
  const W = 640, H = 380;
  const xL = 100, xR = 540;
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const half = d.halfPeriodMs, cycles = Math.max(1, d.cycles ?? 2);
  const tMax = 2 * half * cycles;
  const px = (tt: number) => xL + (tt / tMax) * (xR - xL);

  /**
   * 한 패널 — **실제 값으로 스케일**해 0 기준 위/아래가 원본처럼 맞게 그려진다.
   *  (라벨은 입력이면 수치, 출력이면 문자 a·b — 값은 위치 계산에만 쓴다.)
   *  ★ 라벨 겹침 방지(규칙 #6): 패널 이름은 y축 **위쪽**, 눈금 숫자는 0선 아래, 축 단위는 더 아래 우측.
   */
  const panel = (yTop: number, hi: number, lo: number, hLabel: string, lLabel: string, name: string, numeric: boolean) => {
    const PH = 110;                                   // 패널 높이
    const vMax = Math.max(hi, 0), vMin = Math.min(lo, 0);
    const span = vMax - vMin || 1;
    const y = (v: number) => yTop + PH - ((v - vMin) / span) * PH;
    const yZero = y(0), yHi = y(hi), yLo = y(lo);

    w.push(line(xL, yTop - 6, xL, yTop + PH + 6));    // y축
    w.push(line(xL, yZero, xR, yZero));               // 0 기준선
    t.push(text(xL - 8, yTop - 12, name, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));
    t.push(text(xL - 8, yZero + 4, "0", { anchor: "end", size: 11, fill: MUTED }));
    for (let k = 1; k <= 2 * cycles; k++) {
      const xx = px(k * half);
      w.push(line(xx, yZero - 4, xx, yZero + 4));
      t.push(text(xx, yZero + 15, String(Number((k * half).toFixed(3))), { size: 9.5, fill: MUTED }));
    }
    // 축 단위 — 마지막 눈금 숫자와 겹치지 않도록 **0선보다 아래, 마지막 눈금 오른쪽**에 둔다.
    t.push(text(px(2 * cycles * half) + 16, yZero + 36, "t [ms]", { anchor: "start", size: 10, fill: MUTED }));

    const pts: string[] = [];
    if ((d.shape ?? "sine") === "sine") {
      // ★ 정현파 — 상·하한 사이를 진동. 주기 = 2·반주기. 샘플을 촘촘히 찍어 부드럽게.
      const mid = (hi + lo) / 2, amp = (hi - lo) / 2, T = 2 * half;
      const N = 40 * cycles;
      for (let i = 0; i <= N; i++) {
        const tt = (i / N) * tMax;
        pts.push(`${px(tt)},${y(mid + amp * Math.sin((2 * Math.PI * tt) / T))}`);
      }
    } else {
      for (let k = 0; k < 2 * cycles; k++) {
        const yy = k % 2 === 0 ? yHi : yLo;
        pts.push(`${px(k * half)},${yy}`, `${px((k + 1) * half)},${yy}`);
      }
    }
    s.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${STROKE}" stroke-width="1.8"/>`);

    for (const [yy, lbl] of [[yHi, hLabel], [yLo, lLabel]] as Array<[number, string]>) {
      w.push(`<line x1="${xL}" y1="${yy}" x2="${xR}" y2="${yy}" stroke="${MUTED}" stroke-width="0.8" stroke-dasharray="4 4"/>`);
      // ★ 레벨이 0선과 가까우면 좌측에서 "0"과 겹친다 → 그 라벨만 **오른쪽**에 놓는다(규칙 #6).
      const nearZero = Math.abs(yy - yZero) < 18;
      t.push(nearZero
        ? text(xR + 6, yy + 4, lbl, { anchor: "start", size: 11.5, weight: 700, fill: numeric ? STROKE : RED })
        : text(xL - 8, yy + 4, lbl, { anchor: "end", size: 11.5, weight: 700, fill: numeric ? STROKE : RED }));
    }
  };

  panel(50, d.vH, d.vL, `${d.vH}`, `${d.vL}`, "v_i[V]", true);
  panel(230, d.aValue, d.bValue, d.aLabel, d.bLabel, "v_o[V]", false);

  t.push(text(W / 2, H - 6, "출력 파형의 상한 a와 하한 b를 구한다 (파형 모양은 그대로, 위치만 이동)",
    { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─────────────────────────── 소자/도형 헬퍼 ───────────────────────────
/** 다이오드(세로) — dir="down"이면 애노드가 위(삼각형이 아래를 향함). */
function diodeV(x: number, cy: number, dir: "down" | "up"): string {
  const h = 12, w2 = 10;
  const tri = dir === "down"
    ? `M${x - w2},${cy - h} L${x + w2},${cy - h} L${x},${cy + 2} Z`
    : `M${x - w2},${cy + h} L${x + w2},${cy + h} L${x},${cy - 2} Z`;
  const barY = dir === "down" ? cy + 2 : cy - 2;
  return `<path d="${tri}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - w2}" y1="${barY}" x2="${x + w2}" y2="${barY}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>` +
    `<line x1="${x}" y1="${cy - 16}" x2="${x}" y2="${cy - h}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x}" y1="${cy + h}" x2="${x}" y2="${cy + 16}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
/** 바이어스 전지(세로) — topSign이 위쪽 단자 극성. 긴 판=+, 짧은 판=−. */
function batteryV(x: number, cy: number, topSign: "+" | "-"): string {
  const longW = 13, shortW = 7;
  const upperW = topSign === "+" ? longW : shortW;
  const lowerW = topSign === "+" ? shortW : longW;
  return `<line x1="${x - upperW}" y1="${cy - 5}" x2="${x + upperW}" y2="${cy - 5}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${x - lowerW}" y1="${cy + 5}" x2="${x + lowerW}" y2="${cy + 5}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${x}" y1="${cy - 14}" x2="${x}" y2="${cy - 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x}" y1="${cy + 5}" x2="${x}" y2="${cy + 14}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${x + 16}" y="${cy - 4}" font-size="11" font-weight="700" fill="${RED}">${topSign === "+" ? "+" : "−"}</text>` +
    `<text x="${x + 16}" y="${cy + 14}" font-size="11" font-weight="700" fill="${RED}">${topSign === "+" ? "−" : "+"}</text>`;
}
function capacitorH(cx: number, cy: number): string {
  const g = 5, ph = 13;
  return `<line x1="${cx - g}" y1="${cy - ph}" x2="${cx - g}" y2="${cy + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${cx + g}" y1="${cy - ph}" x2="${cx + g}" y2="${cy + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.6}"/>` +
    `<line x1="${cx - 10}" y1="${cy}" x2="${cx - g}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + g}" y1="${cy}" x2="${cx + 10}" y2="${cy}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function resistorV(cx: number, cy: number): string {
  const half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  return `<path d="${p} L${cx},${cy + half}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function term(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
