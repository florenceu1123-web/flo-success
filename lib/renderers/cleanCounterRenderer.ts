import type { LogicNetworkDiagram, LogicGate } from "@/types";

/**
 * 범용 카운터(N개 FF + 조합 게이트) 버스식 깔끔 렌더러.
 *
 * 자동 logicNetworkRenderer는 피드백 wire가 엉켜 판독 불가. 여기서는 **신호마다 수평 버스 레인**을
 * 두고, FF(위)·게이트(아래)에서 수직 탭으로만 레인에 연결한다 → 겹침 없는 3-밴드 레이아웃.
 *  · 상단: FF 한 줄 (출력 비트 순).  · 중단: 신호 버스 레인.  · 하단: 조합 게이트 + CP.
 * mod-N 등 임의 JK/D/T 카운터를 깔끔하게 표현.
 */

const STROKE = "#111827";
const WIRE_W = 1.4;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const FF_TYPES = new Set(["JKFF", "DFF", "TFF"]);
const isFF = (t: string) => FF_TYPES.has(t);

const FF_W = 76, FF_H = 76;
const FF_CY = 90;
const Y0 = FF_CY - FF_H / 2;
const jY = FF_CY - 20, kY = FF_CY + 20, qY = FF_CY - 14, qbY = FF_CY + 14;
const clkPinY = Y0 + FF_H - 12;
const FF_STEP = 200, FF_X0 = 150;

export function renderCleanCounter(d: LogicNetworkDiagram): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // FF 정렬 (출력 비트순), 게이트(조합) 목록.
  const bitOf = (name: string): number => { const m = name.match(/(\d)/); return m ? parseInt(m[1], 10) : 99; };
  const ffs = d.gates.filter((g) => isFF(g.type)).sort((a, b) => bitOf(a.output) - bitOf(b.output));
  const gates = d.gates.filter((g) => !isFF(g.type) && g.type !== "MUX");
  const ffX = new Map<string, number>();      // FF output signal → FF x
  ffs.forEach((ff, i) => ffX.set(ff.output, FF_X0 + i * FF_STEP));

  // 버스 레인 y — FF 출력(비트순) → 게이트 출력 순으로 아래로.
  const laneY = new Map<string, number>();
  let ly = FF_CY + FF_H / 2 + 34;
  for (const ff of ffs) { laneY.set(ff.output, ly); ly += 24; }
  for (const g of gates) { laneY.set(g.output, ly); ly += 24; }
  const gateBandY = ly + 24;
  const cpY = gateBandY + Math.max(60, 20 + gates.length * 6);
  const rightEdge = FF_X0 + (ffs.length - 1) * FF_STEP + FF_W;

  // ── 게이트 배치 (하단 밴드, 좌→우) ──
  const GATE_W = 50, GATE_H = 42, GATE_STEP = 150, GATE_X0 = FF_X0 + 40;
  const gatePos = new Map<string, { x: number; y: number }>();
  gates.forEach((g, i) => gatePos.set(g.id, { x: GATE_X0 + i * GATE_STEP, y: gateBandY }));

  // 각 신호별 탭 x 수집 → 레인 span 계산.
  const taps = new Map<string, number[]>();
  const addTap = (sig: string, x: number) => {
    if (!laneY.has(sig)) return;
    const a = taps.get(sig) ?? []; a.push(x); taps.set(sig, a);
  };

  // ── FF 그리기 + 핀 탭 ──
  const sigLabel = (name: string) => name;
  ffs.forEach((ff) => {
    const x = ffX.get(ff.output)!;
    s.push(rect(x, Y0, FF_W, FF_H));
    const typeLabel = ff.type === "JKFF" ? "JK-FF" : ff.type === "TFF" ? "T-FF" : "D-FF";
    t.push(text(x + FF_W / 2, Y0 - 6, typeLabel, { size: 10, weight: 700, fill: MUTED }));
    s.push(clkTri(x, clkPinY));
    // 출력 Q → 레인으로 내리고, 우측 라벨.
    const qx = x + FF_W;
    t.push(text(qx - 8, qY + 4, "Q", { size: 11, weight: 600, anchor: "end" }));
    w.push(line(qx, qY, qx + 12, qY));
    s.push(dot(qx + 12, qY));
    t.push(text(qx + 17, qY + 4, sigLabel(ff.output), { size: 12, weight: 700, fill: ACCENT, anchor: "start" }));
    // Q → 레인 (아래로)
    const ql = laneY.get(ff.output)!;
    w.push(line(qx + 12, qY, qx + 12, ql));
    addTap(ff.output, qx + 12);

    // 입력 핀 (J·K 또는 D·T). FF 종류별 입력 이름.
    const inNames = ff.type === "JKFF" ? ["J", "K"] : ff.type === "TFF" ? ["T"] : ["D"];
    inNames.forEach((pinName, k) => {
      const py = inNames.length === 1 ? FF_CY : (k === 0 ? jY : kY);
      t.push(text(x + 8, py + 4, pinName, { size: 11, weight: 600, anchor: "start" }));
      const src = ff.inputs[k] ?? ff.inputs[0];
      if (src === "1" || src === "0") {
        const sx = x - 26;
        w.push(line(sx, py, x, py));
        t.push(text(sx - 3, py + 4, src, { size: 11, weight: 700, anchor: "end" }));
        return;
      }
      // 신호 → 레인 탭 (핀에서 왼쪽으로 나와 아래 레인으로).
      const chX = x - 14 - k * 8;
      const inv = src.includes("̄") || src.startsWith("n");
      const base = src.replace(/^n/, "");
      const sl = laneY.get(base);
      if (sl == null) { // 소스 미상 → 라벨만
        const sx = x - 26; w.push(line(sx, py, x, py));
        t.push(text(sx - 3, py + 4, sigLabel(src), { size: 9, anchor: "end", fill: MUTED }));
        return;
      }
      w.push(line(x, py, chX, py));
      w.push(line(chX, py, chX, sl));
      addTap(base, chX);
      if (inv) s.push(`<circle cx="${x - 5}" cy="${py}" r="4" fill="white" stroke="${STROKE}" stroke-width="1.2"/>`);
    });
  });

  // ── 게이트 그리기 + 입력/출력 탭 ──
  gates.forEach((g) => {
    const p = gatePos.get(g.id)!;
    s.push(gateShape(g.type, p.x, p.y, GATE_W, GATE_H));
    t.push(text(p.x + GATE_W / 2, p.y - 4, g.type, { size: 9, weight: 700, fill: ACCENT }));
    // 출력 → 자기 레인 (위로)
    const outX = p.x + GATE_W + 6, outY = p.y + GATE_H / 2;
    const ol = laneY.get(g.output)!;
    w.push(line(p.x + GATE_W, outY, outX, outY));
    w.push(line(outX, outY, outX, ol));
    addTap(g.output, outX);
    // 입력 ← 레인 (위 레인에서 게이트 위로).
    g.inputs.forEach((sig, k) => {
      const base = sig.replace(/^n/, "");
      const iy = p.y + (g.inputs.length === 1 ? GATE_H / 2 : (k === 0 ? 11 : GATE_H - 11));
      const chX = p.x - 10 - k * 8;
      const sl = laneY.get(base);
      if (sl == null) return;
      w.push(line(p.x, iy, chX, iy));
      w.push(line(chX, iy, chX, sl));
      addTap(base, chX);
    });
  });

  // ── 버스 레인 그리기 (탭 span) ──
  for (const [sig, ly2] of laneY) {
    const xs = taps.get(sig) ?? [];
    if (xs.length < 2) continue;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    w.push(line(minX, ly2, maxX, ly2));
    for (const x of xs) s.push(dot(x, ly2));
    t.push(text(minX - 4, ly2 + 3, sigLabel(sig), { size: 9, weight: 700, anchor: "end", fill: MUTED }));
  }

  // ── CP 공통 클럭 ──
  t.push(text(40, cpY + 4, "CP", { size: 11, weight: 700, anchor: "end" }));
  w.push(line(46, cpY, rightEdge + 20, cpY));
  ffs.forEach((ff) => {
    const x = ffX.get(ff.output)!;
    w.push(line(x - 12, cpY, x - 12, clkPinY));
    w.push(line(x - 12, clkPinY, x, clkPinY));
    s.push(dot(x - 12, cpY));
  });

  const W = rightEdge + 90, H = cpY + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function gateShape(op: string, x: number, y: number, w: number, h: number): string {
  const or = op === "OR" || op === "NOR" || op === "XOR" || op === "XNOR";
  const xr = op === "XOR" || op === "XNOR";
  const bub = op === "NAND" || op === "NOR" || op === "XNOR" || op === "NOT";
  let p = "";
  if (op === "NOT") {
    p += `<path d="M ${x} ${y} L ${x} ${y + h} L ${x + w} ${y + h / 2} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  } else if (or) {
    p += `<path d="M ${x} ${y} Q ${x + w * 0.45} ${y - h * 0.05} ${x + w} ${y + h / 2} Q ${x + w * 0.45} ${y + h * 1.05} ${x} ${y + h} Q ${x + w * 0.22} ${y + h / 2} ${x} ${y} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
    if (xr) p += `<path d="M ${x - 5} ${y} Q ${x + w * 0.16} ${y + h / 2} ${x - 5} ${y + h}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  } else {
    p += `<path d="M ${x} ${y} L ${x + w / 2} ${y} Q ${x + w} ${y} ${x + w} ${y + h / 2} Q ${x + w} ${y + h} ${x + w / 2} ${y + h} L ${x} ${y + h} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  }
  if (bub) p += `<circle cx="${x + w + 4}" cy="${y + h / 2}" r="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return p;
}
function rect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function clkTri(x: number, cy: number): string {
  const h = 6;
  return `<polygon points="${x},${cy - h} ${x + 8},${cy} ${x},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="2.6" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
