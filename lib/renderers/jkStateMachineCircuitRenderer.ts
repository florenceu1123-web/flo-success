import type { JkStateMachineCircuitDiagram } from "@/types";

/**
 * 비순환 상태형 JK 카운터 (가) 전용 fixed-slot 렌더러.
 *  J·K가 단일 신호(High/Qᵢ/Q̄ᵢ)에 직결. 라벨 대신 실제 wire로 연결한다:
 *   ① High("1") → 좌측 "1" 스텁.
 *   ② 소스가 바로 앞 FF(index-1)의 Q/Q̄ → FF 사이 갭에서 직결 wire.
 *   ③ 그 외(뒤 FF·먼 FF) → 상단 채널(라인)을 통해 소스 출력 → 목적지 J/K로 직결 라우팅.
 *  게이트 없음, 하단 버스 없음 → 소스 위치에서 곧바로 목적지로 연결.
 */

const STROKE = "#111827";
const WIRE_W = 1.5;
const ACCENT = "#1d4ed8";
const MUTED = "#6b7280";

const W = 900, H = 340;
const FF_W = 78, FF_H = 88;
const CY = 190;
const Y0 = CY - FF_H / 2;
const FF_X = [150, 430, 710];
const CP_Y = 285;
const jY = CY - 22, kY = CY + 22, qY = CY - 16, qbY = CY + 16;
const clkPinY = Y0 + FF_H - 14;
const LANE_Y0 = 40, LANE_STEP = 26; // 상단 라우팅 채널

// 소스 신호별 wire 색상 (구분용)
const SIG_COLOR: Record<string, string> = {
  Q0: "#0ea5e9", Q1: "#8b5cf6", Q2: "#10b981",
};

type D = JkStateMachineCircuitDiagram;
type Pin = { ff: number; pin: "J" | "K"; y: number; label: string };

export function renderJkStateMachineCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];

  const qNames = ["Q₀", "Q₁", "Q₂"];
  // ── FF 3개 ──
  FF_X.forEach((x, i) => {
    s.push(rect(x, Y0, FF_W, FF_H));
    t.push(text(x + FF_W / 2, Y0 - 6, "JK-FF", { size: 11, weight: 700, fill: MUTED }));
    t.push(text(x + 9, jY + 4, "J", { size: 12, weight: 600, anchor: "start" }));
    t.push(text(x + 9, kY + 4, "K", { size: 12, weight: 600, anchor: "start" }));
    t.push(text(x + FF_W - 9, qY + 4, "Q", { size: 12, weight: 600, anchor: "end" }));
    t.push(text(x + FF_W - 9, qbY + 4, "Q̄", { size: 11, weight: 600, anchor: "end", fill: MUTED }));
    s.push(clkTri(x, clkPinY));
    // Q 출력 → 우측 라벨
    const qx = x + FF_W;
    w.push(line(qx, qY, qx + 14, qY));
    s.push(dot(qx + 14, qY));
    t.push(text(qx + 20, qY + 4, qNames[i], { size: 13, weight: 700, fill: ACCENT, anchor: "start" }));
  });

  const pins: Pin[] = [
    { ff: 0, pin: "J", y: jY, label: d.j0 }, { ff: 0, pin: "K", y: kY, label: d.k0 },
    { ff: 1, pin: "J", y: jY, label: d.j1 }, { ff: 1, pin: "K", y: kY, label: d.k1 },
    // J2·K2는 게이트가 있으면 게이트로 구동(아래) → 일반 배선에서 제외.
    ...(d.gate ? [] : [
      { ff: 2, pin: "J", y: jY, label: d.j2 }, { ff: 2, pin: "K", y: kY, label: d.k2 },
    ] as Pin[]),
  ];

  // 소스 신호별로 핀을 그룹화(High 제외) → 신호마다 트렁크 1개(가로1+세로1+핀별 탭)로
  //   라우팅해 같은 신호 wire가 겹쳐 그려지지 않게 한다. 교차는 수직↔수평 직교로만.
  const groups = new Map<string, Pin[]>();
  const highPins: Pin[] = [];
  for (const p of pins) {
    const srcFF = srcFFof(p.label);
    if (srcFF === null) { highPins.push(p); continue; }
    const arr = groups.get(p.label) ?? [];
    arr.push(p);
    groups.set(p.label, arr);
  }
  const bubble = (x: number, y: number, col: string) =>
    s.push(`<circle cx="${x - 5}" cy="${y}" r="4" fill="white" stroke="${col}" stroke-width="1.3"/>`);

  let laneIdx = 0;
  for (const [label, gpins] of groups) {
    const srcFF = srcFFof(label)!;
    const inv = isInv(label);
    const bus = busKeyOf(label);
    const col = bus ? SIG_COLOR[bus] : STROKE;
    const outX = FF_X[srcFF] + FF_W;
    const outY = inv ? qbY : qY;
    const allAdjFwd = gpins.every((p) => p.ff === srcFF + 1);

    if (allAdjFwd) {
      // 갭 트렁크: 모든 dest가 바로 다음 FF. 가로1 + 세로1 + 핀별 탭.
      const destFF = srcFF + 1;
      const chX = FF_X[destFF] - 24;
      const ys = [outY, ...gpins.map((p) => p.y)];
      w.push(cline(outX, outY, chX, outY, col));           // 소스 출력 → 채널
      s.push(cdot(outX, outY, col));
      w.push(cline(chX, Math.min(...ys), chX, Math.max(...ys), col)); // 채널 세로(범위)
      for (const p of gpins) {
        w.push(cline(chX, p.y, FF_X[p.ff], p.y, col));      // 핀 탭
        if (inv) bubble(FF_X[p.ff], p.y, col);
      }
    } else {
      // 상단 레인 트렁크: 소스 출력 위로 → 레인 가로 → 각 FF로 내려 탭.
      const laneY = LANE_Y0 + laneIdx * LANE_STEP;
      laneIdx++;
      const tapX = outX + 14;
      w.push(cline(outX, outY, tapX, outY, col));
      s.push(cdot(tapX, outY, col));
      w.push(cline(tapX, outY, tapX, laneY, col));
      const approaches = gpins.map((p) => FF_X[p.ff] - 22);
      w.push(cline(Math.min(tapX, ...approaches), laneY, Math.max(tapX, ...approaches), laneY, col));
      // 목적지 FF별로 세로 1 + 핀 탭 (같은 FF 여러 핀 겹침 방지)
      const byFF = new Map<number, Pin[]>();
      for (const p of gpins) { const a = byFF.get(p.ff) ?? []; a.push(p); byFF.set(p.ff, a); }
      for (const [ff, fpins] of byFF) {
        const apX = FF_X[ff] - 22;
        w.push(cline(apX, laneY, apX, Math.max(...fpins.map((p) => p.y)), col));
        for (const p of fpins) {
          w.push(cline(apX, p.y, FF_X[ff], p.y, col));
          if (inv) bubble(FF_X[ff], p.y, col);
        }
      }
    }
  }

  // High("1") 핀 스텁
  for (const p of highPins) {
    const stubX = FF_X[p.ff] - 30;
    w.push(line(stubX, p.y, FF_X[p.ff], p.y));
    t.push(text(stubX - 4, p.y + 4, "1", { size: 11, weight: 700, anchor: "end" }));
  }

  // ── 게이트 (변형유형: J2=K2=gate(a,b)) — a·b는 FF의 Q 출력, 출력 → FF2 J·K ──
  if (d.gate) {
    const gx = FF_X[1] + FF_W + 66, gy = CY - 24, gw = 54, gh = 48; // FF1-FF2 사이
    const gOutX = gx + gw + 8, gOutY = CY;
    const in1Y = qY, in2Y = qY + 26; // 위 입력=y174, 아래 입력=y200
    s.push(gateShape(d.gate.op, gx, gy, gw, gh));
    t.push(text(gx + gw / 2, gy - 5, d.gate.op, { size: 10, weight: 700, fill: ACCENT }));
    const aFF = srcFFof(d.gate.a) ?? 0, bFF = srcFFof(d.gate.b) ?? 1;
    // 입력 a (위): 소스 FF의 Q → 게이트 위 입력. 인접(FF1)이면 짧게, 멀면(FF0) 하단 레인.
    const routeGateIn = (srcFF: number, inY: number, laneY: number) => {
      const sx = FF_X[srcFF] + FF_W + 14; // Q dot
      const col = SIG_COLOR[`Q${srcFF}`] ?? STROKE;
      if (srcFF === 1) {
        w.push(cline(sx, qY, gx - 16, qY, col));
        w.push(cline(gx - 16, qY, gx - 16, inY, col));
        w.push(cline(gx - 16, inY, gx, inY, col));
      } else {
        w.push(cline(sx, qY, sx, laneY, col));
        w.push(cline(sx, laneY, gx - 16, laneY, col));
        w.push(cline(gx - 16, laneY, gx - 16, inY, col));
        w.push(cline(gx - 16, inY, gx, inY, col));
        s.push(cdot(sx, qY, col));
      }
      t.push(text(gx - 20, inY + 3, srcFF === 0 ? "Q₀" : srcFF === 1 ? "Q₁" : "Q₂", { size: 9, weight: 700, anchor: "end", fill: col }));
    };
    routeGateIn(bFF, in1Y, CY + 60);       // 위 입력 (보통 Q1, 인접)
    routeGateIn(aFF, in2Y, CY + 60);       // 아래 입력 (보통 Q0, 하단 레인)
    // 출력 → FF2 J·K
    const apX = FF_X[2] - 24;
    w.push(cline(gOutX, gOutY, apX, gOutY, ACCENT));
    w.push(cline(apX, jY, apX, kY, ACCENT));
    w.push(cline(apX, jY, FF_X[2], jY, ACCENT));
    w.push(cline(apX, kY, FF_X[2], kY, ACCENT));
  }

  // ── 공통 CP 클럭 버스 ──
  t.push(text(40, CP_Y + 4, "CP", { size: 12, weight: 700, anchor: "end" }));
  w.push(line(46, CP_Y, FF_X[2] + 30, CP_Y));
  FF_X.forEach((x) => {
    w.push(line(x - 14, CP_Y, x - 14, clkPinY));
    w.push(line(x - 14, clkPinY, x, clkPinY));
    s.push(dot(x - 14, CP_Y));
  });

  t.push(text(W / 2, H - 8, "JK 플립플롭 3개 동기식 카운터 — J·K를 Q 출력에서 직접 배선. Q₀=LSB.", { size: 10, fill: MUTED }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${[...w, ...s, ...t].join("\n")}\n</svg>`;
}

function gateShape(op: string, x: number, y: number, w: number, h: number): string {
  const or = op === "OR" || op === "NOR" || op === "XOR" || op === "XNOR";
  const xr = op === "XOR" || op === "XNOR";
  const bub = op === "NAND" || op === "NOR" || op === "XNOR";
  let p = "";
  if (or) {
    p += `<path d="M ${x} ${y} Q ${x + w * 0.45} ${y - h * 0.05} ${x + w} ${y + h / 2} Q ${x + w * 0.45} ${y + h * 1.05} ${x} ${y + h} Q ${x + w * 0.22} ${y + h / 2} ${x} ${y} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
    if (xr) p += `<path d="M ${x - 6} ${y} Q ${x + w * 0.16} ${y + h / 2} ${x - 6} ${y + h}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  } else {
    p += `<path d="M ${x} ${y} L ${x + w / 2} ${y} Q ${x + w} ${y} ${x + w} ${y + h / 2} Q ${x + w} ${y + h} ${x + w / 2} ${y + h} L ${x} ${y + h} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  }
  if (bub) p += `<circle cx="${x + w + 5}" cy="${y + h / 2}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  return p;
}
function srcFFof(label: string): number | null {
  // Q 접두사가 있을 때만 FF 인덱스로 (High "1"의 숫자를 Q1로 오인하지 않게).
  const m = label.match(/Q([012])/);
  return m ? parseInt(m[1], 10) : null;
}
function isInv(label: string): boolean {
  return label.startsWith("n") || label.includes("̄");
}
function busKeyOf(label: string): "Q0" | "Q1" | "Q2" | null {
  const n = srcFFof(label);
  return n === 0 ? "Q0" : n === 1 ? "Q1" : n === 2 ? "Q2" : null;
}

function rect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function clkTri(x: number, cy: number): string {
  const h = 6;
  return `<polygon points="${x},${cy - h} ${x + 9},${cy} ${x},${cy + h}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return cline(x1, y1, x2, y2, STROKE);
}
function cline(x1: number, y1: number, x2: number, y2: number, col: string): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string { return cdot(x, y, STROKE); }
function cdot(x: number, y: number, col: string): string {
  return `<circle cx="${x}" cy="${y}" r="3" fill="${col}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
