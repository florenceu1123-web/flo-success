/**
 * AC+DC 중첩 회로의 쌍대(dual) 회로 전용 렌더러 — 기출변형유형.
 *
 *  구조: 두 rail(N_T 상단, GND 하단) 사이 병렬 가지.
 *    [I_ac+SW₂] ‖ [I_dc+SW₁] ‖ [R] ‖ [C_1─N_MID─C_2(직렬)]
 *    v(t) = rail 양단 전압, v₁(t) = C_1 양단 전압.
 *
 *  전류원 선택 스위치(SPDT): 활성 단자는 rail로 연결, 다른 단자(단자3·단자1)는 개방 stub.
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

const TOP_Y = 90;
const BOT_Y = 480;
const COL0 = 160;
const COL_PITCH = 135;
const HALF = 28;

type DualDetected = {
  ground: string;
  topNode: string;
  midNode: string;
  cap1: CircuitComponent;
  cap2: CircuitComponent;
  rComp: CircuitComponent;
  branches: Array<{ src: CircuitComponent; sw: CircuitComponent; srcMid: string }>;
};

export function detectAcDcSuperpositionDual(netlist: CircuitNetlist): DualDetected | null {
  const ground = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;
  const comps = (netlist.components ?? []).filter((c) => (c.pins?.length ?? 0) >= 2);

  const iSrcs = comps.filter((c) => c.type === "I");
  const caps = comps.filter((c) => c.type === "C");
  const switches = comps.filter((c) => c.type === "SW");
  const rs = comps.filter((c) => c.type === "R");
  if (iSrcs.length < 1 || caps.length < 2 || switches.length < 1 || rs.length < 1) return null;

  const rComp = rs[0];
  const topNode = rComp.pins.map((p) => p.node).find((n) => !isGnd(n));
  if (!topNode) return null;

  const cap1 = caps.find((c) => c.pins.some((p) => p.node === topNode));
  const cap2 = caps.find((c) => c !== cap1 && c.pins.some((p) => isGnd(p.node)));
  if (!cap1 || !cap2) return null;
  const midNode = cap1.pins.map((p) => p.node).find((n) => n !== topNode && !isGnd(n));
  if (!midNode) return null;
  if (!cap2.pins.some((p) => p.node === midNode)) return null;

  const branches = iSrcs
    .map((src) => {
      const srcMid = src.pins.map((p) => p.node).find((n) => !isGnd(n));
      const sw = switches.find(
        (s) => srcMid && s.pins.some((p) => p.node === srcMid) && s.pins.some((p) => p.node === topNode),
      );
      return { src, sw: sw as CircuitComponent, srcMid: srcMid as string };
    })
    .filter((b) => b.sw && b.srcMid);
  if (branches.length < 1) return null;

  // I_ac 가지를 먼저(좌측) 오도록 정렬.
  branches.sort((a, b) => (a.src.id < b.src.id ? -1 : 1));

  return { ground, topNode, midNode, cap1, cap2, rComp, branches };
}

export function renderAcDcSuperpositionDualCircuit(netlist: CircuitNetlist): string | null {
  const d = detectAcDcSuperpositionDual(netlist);
  if (!d) return null;

  const svg: string[] = [];
  svg.push(
    `<defs><marker id="acdcd_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`,
  );

  // 컬럼 배치: 전류원 가지들 → R → C.
  const nBranch = d.branches.length;
  const colX: number[] = [];
  for (let i = 0; i < nBranch + 2; i++) colX.push(COL0 + i * COL_PITCH);
  const rX = colX[nBranch];
  const cX = colX[nBranch + 1];

  // ── rails ──
  svg.push(line(COL0, TOP_Y, cX, TOP_Y));
  svg.push(line(COL0, BOT_Y, cX, BOT_Y));

  // ── 전류원 가지 (I + SPDT 스위치) ──
  d.branches.forEach((b, i) => {
    const x = colX[i];
    // 아래(GND)→ I source → srcMid → SPDT → 위(N_T)
    const iCenterY = BOT_Y - 90;       // 전류원 (하단 가까이)
    const srcMidY = iCenterY - 90;     // 스위치 common 아래
    const swCenterY = (TOP_Y + srcMidY) / 2;
    // 전류원
    drawVertical(svg, b.src, srcMidY, BOT_Y, x, iCenterY);
    // SPDT 스위치 — 활성 단자(짝수) rail로, 개방 단자(홀수) 좌측 stub.
    // SW_2 → 단자4(활성)/단자3(개방), SW_1 → 단자2/단자1.
    const base = 3 - 2 * i;            // i=0 → 3, i=1 → 1
    drawBranchSpdt(svg, x, swCenterY, srcMidY, TOP_Y, b.sw.id, `단자${base}`, `단자${base + 1}`);
  });

  // ── 저항 가지 ──
  drawVertical(svg, d.rComp, TOP_Y, BOT_Y, rX, (TOP_Y + BOT_Y) / 2);

  // ── 직렬 커패시터 가지 ──
  const midY = (TOP_Y + BOT_Y) / 2;
  drawVertical(svg, { ...d.cap1, value: undefined, id: "" }, TOP_Y, midY, cX, (TOP_Y + midY) / 2);
  drawVertical(svg, { ...d.cap2, value: undefined, id: "" }, midY, BOT_Y, cX, (midY + BOT_Y) / 2);
  // 커패시터 라벨 (우측)
  capLabel(svg, d.cap1, cX + 16, (TOP_Y + midY) / 2);
  capLabel(svg, d.cap2, cX + 16, (midY + BOT_Y) / 2);
  // N_MID dot
  svg.push(dot(cX, midY));

  // ── junction dots: N_T(상단 rail, 각 가지 top) ──
  for (let i = 0; i < nBranch; i++) svg.push(dot(colX[i], TOP_Y));
  svg.push(dot(rX, TOP_Y));
  svg.push(dot(cX, TOP_Y));

  // ── GND symbol — 하단 rail 중앙 ──
  svg.push(groundSymbol((COL0 + cX) / 2, BOT_Y));

  // ── 측정 표시 ──
  for (const mark of netlist.measurementMarks ?? []) {
    if (mark.kind !== "voltage") continue;
    if (mark.label.includes("₁") || mark.label.includes("1")) {
      // v₁(t) — C_1 양단 (N_T ~ N_MID), + 위 / − 아래.
      const lx = cX + 54;
      svg.push(voltArrow(svg, lx, TOP_Y + 6, midY - 6, mark.label, "right"));
    } else {
      // v(t) — rail 양단, 우측 끝.
      const lx = cX + 86;
      svg.push(voltArrow(svg, lx, TOP_Y + 6, BOT_Y - 6, mark.label, "right"));
    }
  }

  const svgW = cX + 150;
  const svgH = BOT_Y + 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n${svg.join("\n")}\n</svg>`;
}

// ─── helpers ───────────────────────────────────────────────

/** 세로 가지에 component 배치 (cy 지정 가능) — 양옆 wire + 흰 mask. */
function drawVertical(svg: string[], comp: CircuitComponent, yA: number, yB: number, x: number, cy?: number): void {
  const cyy = cy ?? (yA + yB) / 2;
  svg.push(`<rect x="${x - HALF}" y="${cyy - HALF - 2}" width="${HALF * 2}" height="${(HALF + 2) * 2}" fill="white"/>`);
  svg.push(line(x, yA, x, cyy - HALF));
  svg.push(line(x, cyy + HALF, x, yB));
  svg.push(renderComponentOnEdge(comp, { x, y: cyy }, "vertical"));
}

/**
 * 전류원 가지의 SPDT 스위치 — common(아래, srcMid) → 활성 단자(위, rail, 세로 직선) +
 * 개방 단자(좌측 stub). 점선 박스 + 단자 라벨.
 */
function drawBranchSpdt(
  svg: string[],
  x: number,
  cy: number,
  yBelow: number,
  yAbove: number,
  swId: string,
  openLabel: string,
  activeLabel: string,
): void {
  const gap = 16;
  const cm = { x, y: cy + gap };       // common (아래쪽 → 전류원 방향)
  const active = { x, y: cy - gap };    // 활성 throw (위쪽 → rail)
  const open = { x: x - 24, y: cy - gap }; // 개방 throw (좌측)
  // 아래 wire (전류원 → common)
  svg.push(line(x, yBelow, cm.x, cm.y));
  // 위 wire (활성 throw → rail)
  svg.push(line(active.x, active.y, x, yAbove));
  // 점선 박스
  svg.push(
    `<rect x="${x - 24 - 12}" y="${cy - gap - 12}" width="${(24 + 12) + 22}" height="${gap * 2 + 22}" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4" rx="4"/>`,
  );
  // 접점
  for (const p of [cm, active, open]) {
    svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3" fill="white" stroke="black" stroke-width="1.6"/>`);
  }
  // arm: common → 활성 throw (선택됨, 세로)
  svg.push(line(cm.x, cm.y, active.x, active.y));
  // 개방 throw stub
  svg.push(line(open.x, open.y, open.x - 10, open.y));
  // 단자 라벨
  svg.push(`<text x="${open.x - 4}" y="${open.y - 7}" text-anchor="middle" font-size="11" fill="#475569">${escapeSvg(openLabel)}</text>`);
  svg.push(`<text x="${active.x + 8}" y="${active.y - 7}" text-anchor="start" font-size="11" fill="#475569">${escapeSvg(activeLabel)}</text>`);
  // 스위치 id
  svg.push(`<text x="${x - 24 - 16}" y="${cy + gap + 18}" text-anchor="start" font-size="12" fill="#1e3a8a" font-weight="600">${escapeSvg(swId)}</text>`);
}

function capLabel(svg: string[], c: CircuitComponent, x: number, cy: number): void {
  svg.push(`<text x="${x}" y="${cy - 4}" text-anchor="start" font-size="11" fill="#1e3a8a" font-weight="600">${escapeSvg(c.id)}</text>`);
  if (c.value != null) {
    svg.push(`<text x="${x}" y="${cy + 12}" text-anchor="start" font-size="11" fill="#475569">${escapeSvg(String(c.value))}</text>`);
  }
}

/** 전압 측정 표시 — 세로 양방향 화살표(+위/−아래) + 라벨. */
function voltArrow(_svg: string[], x: number, yTop: number, yBot: number, label: string, _side: string): string {
  const cyl = (yTop + yBot) / 2;
  return (
    `<path d="M ${x} ${yTop} L ${x} ${yBot}" stroke="#1e3a8a" fill="none" stroke-width="1.4" marker-start="url(#acdcd_arrow)" marker-end="url(#acdcd_arrow)"/>` +
    `<text x="${x - 4}" y="${yTop - 4}" text-anchor="middle" font-size="12" fill="#1e3a8a" font-weight="600">+</text>` +
    `<text x="${x - 4}" y="${yBot + 14}" text-anchor="middle" font-size="12" fill="#1e3a8a" font-weight="600">−</text>` +
    `<text x="${x + 8}" y="${cyl + 4}" text-anchor="start" font-size="13" fill="#1e3a8a" font-weight="600">${escapeSvg(label)}</text>`
  );
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
}

function groundSymbol(cx: number, y: number): string {
  return `<g transform="translate(${cx},${y})">
    <line x1="0" y1="0" x2="0" y2="10" stroke="black" stroke-width="2"/>
    <line x1="-10" y1="10" x2="10" y2="10" stroke="black" stroke-width="2.4"/>
    <line x1="-7" y1="14" x2="7" y2="14" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="18" x2="3" y2="18" stroke="black" stroke-width="2"/>
  </g>`;
}

function escapeSvg(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
