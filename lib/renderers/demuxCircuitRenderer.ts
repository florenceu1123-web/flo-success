import type { DemuxCircuitDiagram } from "@/types";

/**
 * 1→4 디멀티플렉서(디코더형) 조합논리회로 (임용 8번) — 전용 fixed-slot 렌더러.
 *   좌측: 입력신호 · S₁ · S₀ 버스(+ 인버터로 보수 생성) → 우측: 게이트 4개(NAND/AND) → F₀~F₃.
 *   각 게이트는 (입력신호, S₁ 또는 S̅₁, S₀ 또는 S̅₀) 3입력.
 */

const STROKE = "#111827";
const WIRE_W = 1.4;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 700, H = 420;
const X_TERM = 86;          // 좌측 단자 (★ 라벨이 캔버스 밖으로 잘리지 않게 여유 — 실측)
const X_INV = 150;          // 인버터 열
const X_BUS = 210;          // 세로 버스 레인 시작
const GX = 430, GW = 70, GH = 62;  // 게이트
const GY = [40, 130, 220, 310];

export function renderDemuxCircuit(d: DemuxCircuitDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];
  const gate = d.gateKind ?? "NAND";
  const inputLabel = d.inputLabel ?? "입력신호";
  const [s1Label, s0Label] = d.selectLabels ?? ["S₁", "S₀"];

  // ── 좌측 단자 3개 (입력신호 · S₁ · S₀)
  const yIn = 24, yS1 = 356, yS0 = 384;
  for (const [y, lab] of [[yIn, inputLabel], [yS1, s1Label], [yS0, s0Label]] as const) {
    s.push(`<circle cx="${X_TERM}" cy="${y}" r="4" fill="${STROKE}"/>`);
    t.push(text(X_TERM - 8, y + 4, lab, { size: 11.5, weight: 700, anchor: "end" }));
  }

  // ── 인버터 2개 (S₁·S₀의 보수)
  const invY = [yS1 - 40, yS0 - 40];
  [s1Label, s0Label].forEach((lab, i) => {
    const y = invY[i], x = X_INV + i * 34;
    w.push(line(X_TERM + 6, i === 0 ? yS1 : yS0, x, i === 0 ? yS1 : yS0));
    w.push(line(x, i === 0 ? yS1 : yS0, x, y + 14));
    s.push(`<path d="M${x - 12},${y + 14} L${x + 12},${y + 14} L${x},${y - 8} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    s.push(`<circle cx="${x}" cy="${y - 12}" r="3.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    t.push(text(x + 14, y - 20, `${lab.replace("S", "S̅")}`, { size: 10.5, weight: 600, fill: ACCENT, anchor: "start" }));
  });

  // ── 세로 버스 4개: S₁, S̅₁, S₀, S̅₀ (+ 입력신호 가로 버스)
  const lanes = [
    { x: X_BUS + 0, label: s1Label, from: { x: X_TERM + 6, y: yS1 } },
    { x: X_BUS + 26, label: `${s1Label.replace("S", "S̅")}`, from: { x: X_INV, y: invY[0] - 16 } },
    { x: X_BUS + 52, label: s0Label, from: { x: X_TERM + 6, y: yS0 } },
    { x: X_BUS + 78, label: `${s0Label.replace("S", "S̅")}`, from: { x: X_INV + 34, y: invY[1] - 16 } },
  ];
  lanes.forEach((ln) => {
    w.push(line(ln.from.x, ln.from.y, ln.x, ln.from.y), line(ln.x, ln.from.y, ln.x, GY[0] + 20));
    t.push(text(ln.x, GY[0] + 12, ln.label, { size: 9.5, weight: 600, fill: MUTED }));
  });
  // 입력신호는 위쪽 가로 버스 → 각 게이트 첫 입력
  w.push(line(X_TERM + 6, yIn, GX - 20, yIn));

  // ── 게이트 4개 + 출력
  GY.forEach((gy, k) => {
    const cy = gy + GH / 2;
    // 게이트 몸통 (AND 형태 + NAND면 버블)
    s.push(
      `<path d="M${GX},${gy} L${GX + GW * 0.55},${gy} A${GH / 2},${GH / 2} 0 0 1 ${GX + GW * 0.55},${gy + GH} L${GX},${gy + GH} Z" ` +
      `fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`,
    );
    const xOut = GX + GW * 0.55 + GH / 2;
    if (gate === "NAND") s.push(`<circle cx="${xOut + 5}" cy="${cy}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
    const xLine = gate === "NAND" ? xOut + 10 : xOut;
    w.push(line(xLine, cy, xLine + 40, cy));
    t.push(text(xLine + 46, cy + 4, `F${["₀", "₁", "₂", "₃"][k]}`, { size: 12.5, weight: 700, fill: ACCENT, anchor: "start" }));

    // 입력 3개: 입력신호 + 선택 조합 (k = S₁S₀)
    const s1Idx = (k >> 1) & 1, s0Idx = k & 1;
    const pick = [lanes[s1Idx === 1 ? 0 : 1], lanes[s0Idx === 1 ? 2 : 3]];
    const pinY = [gy + 14, gy + GH / 2, gy + GH - 14];
    // 첫 핀 ← 입력신호 (위 가로 버스에서 분기)
    w.push(line(GX - 20, yIn, GX - 20, pinY[0]), line(GX - 20, pinY[0], GX, pinY[0]));
    s.push(dot(GX - 20, yIn));
    // 나머지 두 핀 ← 선택 버스
    pick.forEach((ln, i) => {
      w.push(line(ln.x, pinY[i + 1], GX, pinY[i + 1]));
      s.push(dot(ln.x, pinY[i + 1]));
    });
  });

  t.push(text(W / 2, H - 10, `${gate} 게이트 4개로 구성된 1→4 디멀티플렉서 (선택선 ${s1Label}${s0Label})`, { size: 10, fill: MUTED }));
  return svg([...w, ...s, ...t]);
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
function svg(body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.join("\n")}\n</svg>`;
}
