/**
 * AC+DC 중첩 회로 전용 fixed-slot renderer (universal_ac `acDcSuperposition` 모드).
 *
 *  배경: 이 회로는 좌측 leg에 전원·스위치 4개(V_ac·SW·SW·V_dc)가 직렬로 쌓인 단일 루프다.
 *        generic grid 빌더(crossLayout→buildCellGrid)는 한 column에 직렬 소자 4개를 표현하지
 *        못하고 붕괴시켜 "V·+단자 ↔ GND wire-only short" 검증 실패를 일으킨다.
 *        → fourNodeImyong과 동일하게 crossLayout의 short 버그를 우회하는 dedicated 경로.
 *
 *  고정 layout (직사각형 단일 루프):
 *     topLeft ── R_top ── topRight
 *        │                  ║   (리액티브 병렬 블록)
 *      [leg:               ║
 *       V·SW·SW·V          ║
 *       직렬 chain]         ║
 *        │                  ║
 *      GND ──── R_bot ── bottomRight
 *
 *  검출은 특정 id가 아니라 구조 signature로 한다:
 *    - V 소스 정확히 2개
 *    - SW ≥ 1
 *    - V·SW들이 한쪽 끝이 GND인 단일 직렬 chain을 이룸 (endpoint 2개, 하나가 GND)
 *    - 나머지에 리액티브(L 또는 C) ≥ 1
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

const LEFT_X = 175;
const RIGHT_X = 600;
const TOP_Y = 70;
const BOT_Y = 520;
const HALF = 28;
const PARALLEL_DX = 32;
const THROW_DX = 22;     // SPDT throw 가로 간격
const ARM_GAP = 18;      // common pivot ↔ throw 세로 간격

type Detected = {
  ground: string;
  topLeft: string;
  gnd: string;
  /** 좌측 leg 직렬 chain (위→아래 순서) */
  orderedLeg: CircuitComponent[];
  /** leg 노드 시퀀스 (topLeft … gnd), orderedLeg.length+1 개 */
  legNodes: string[];
  /** 상단 가로 소자 (R_top) */
  topComp: CircuitComponent;
  topRight: string;
  /** 하단 가로 소자 (R_bot, WIRE 일 수 있음) */
  bottomComp: CircuitComponent;
  bottomRight: string;
  /** 우측 병렬 리액티브 블록 */
  reactives: CircuitComponent[];
};

/** AC+DC 중첩 회로 구조 검출. 아니면 null. */
export function detectAcDcSuperposition(netlist: CircuitNetlist): Detected | null {
  const ground = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;
  const comps = (netlist.components ?? []).filter((c) => (c.pins?.length ?? 0) >= 2);

  const vSources = comps.filter((c) => c.type === "V");
  const switches = comps.filter((c) => c.type === "SW");
  if (vSources.length !== 2) return null;
  if (switches.length < 1) return null;

  // ── leg = 전원 + 스위치. 단일 직렬 chain인지 검사 (endpoint leg-degree=1 노드 2개).
  const leg = [...vSources, ...switches];
  const legDeg = new Map<string, number>();
  for (const c of leg) for (const p of c.pins) legDeg.set(p.node, (legDeg.get(p.node) ?? 0) + 1);
  const endpoints = [...legDeg.entries()].filter(([, d]) => d === 1).map(([n]) => n);
  if (endpoints.length !== 2) return null;
  const gnd = endpoints.find(isGnd);
  const topLeft = endpoints.find((n) => !isGnd(n));
  if (!gnd || !topLeft) return null;
  // 내부 노드는 정확히 degree 2 (분기 없는 단일 chain)
  for (const [n, d] of legDeg) {
    if (n === gnd || n === topLeft) continue;
    if (d !== 2) return null;
  }

  // ── chain을 topLeft → gnd 로 순서화.
  const orderedLeg: CircuitComponent[] = [];
  const legNodes: string[] = [topLeft];
  const used = new Set<CircuitComponent>();
  let current = topLeft;
  while (!isGnd(current)) {
    const next = leg.find((c) => !used.has(c) && c.pins.some((p) => p.node === current));
    if (!next) break;
    used.add(next);
    orderedLeg.push(next);
    const other = next.pins.find((p) => p.node !== current) ?? next.pins[0];
    current = other.node;
    legNodes.push(current);
  }
  if (orderedLeg.length !== leg.length) return null; // 모든 leg 소자를 chain으로 못 덮으면 부적합

  // ── 나머지 소자: 상단 R / 하단 R / 우측 리액티브 블록.
  const rest = comps.filter((c) => c.type !== "V" && c.type !== "SW");
  const reactives = rest.filter((c) => c.type === "L" || c.type === "C");
  if (reactives.length < 1) return null;

  // topLeft에 붙은 비-leg 소자 = R_top.
  const topComp = rest.find((c) => c.pins.some((p) => p.node === topLeft) && !reactives.includes(c));
  if (!topComp) return null;
  const topRight = (topComp.pins.find((p) => p.node !== topLeft) ?? topComp.pins[0]).node;

  // gnd에 붙은 비-leg 소자 = R_bot (또는 WIRE).
  const bottomComp = rest.find((c) => c.pins.some((p) => isGnd(p.node)) && !reactives.includes(c));
  if (!bottomComp) return null;
  const bottomRight = (bottomComp.pins.find((p) => !isGnd(p.node)) ?? bottomComp.pins[0]).node;

  // 리액티브 블록은 topRight ↔ bottomRight 사이여야 함.
  const reactivesOk = reactives.every((c) => {
    const ns = c.pins.map((p) => p.node);
    return ns.includes(topRight) && ns.includes(bottomRight);
  });
  if (!reactivesOk) return null;

  return {
    ground, topLeft, gnd, orderedLeg, legNodes,
    topComp, topRight, bottomComp, bottomRight, reactives,
  };
}

/** AC+DC 중첩 회로 fixed-slot SVG 렌더. */
export function renderAcDcSuperpositionCircuit(netlist: CircuitNetlist): string | null {
  const d = detectAcDcSuperposition(netlist);
  if (!d) return null;

  const svg: string[] = [];
  svg.push(
    `<defs><marker id="acdc_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`,
  );

  // ── 노드 좌표.
  const nodePos: Record<string, { x: number; y: number }> = {
    [d.topLeft]: { x: LEFT_X, y: TOP_Y },
    [d.gnd]: { x: LEFT_X, y: BOT_Y },
    [d.topRight]: { x: RIGHT_X, y: TOP_Y },
    [d.bottomRight]: { x: RIGHT_X, y: BOT_Y },
  };
  // leg 내부 노드 — TOP_Y~BOT_Y 사이 균등 분포.
  const k = d.orderedLeg.length;
  d.legNodes.forEach((n, i) => {
    nodePos[n] = { x: LEFT_X, y: TOP_Y + ((BOT_Y - TOP_Y) * i) / k };
  });

  // ── 1) 좌측 leg.
  //   전원(양 끝)은 vertical source, 중간 스위치는 SPDT 선택 스위치(단자 라벨 + 점선 박스 +
  //   전원 단락용 bypass)로 그린다. 원본(임용 2022 B-6)의 선택 스위치 구조 재현.
  const switchIdxs = d.orderedLeg
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.type === "SW")
    .map((x) => x.i);
  const S = switchIdxs.length;
  const endsAreSources =
    d.orderedLeg[0]?.type === "V" && d.orderedLeg[d.orderedLeg.length - 1]?.type === "V";
  const middleAllSwitches = d.orderedLeg.slice(1, -1).every((c) => c.type === "SW");
  const useSpdt = endsAreSources && middleAllSwitches && S >= 1;

  const LANE_X = LEFT_X - THROW_DX - 65;  // 좌측 단자 → 상/하단 노드 라우팅 lane (SW 라벨 왼쪽)
  for (let i = 0; i < d.orderedLeg.length; i++) {
    const comp = d.orderedLeg[i];
    const yA = nodePos[d.legNodes[i]].y;
    const yB = nodePos[d.legNodes[i + 1]].y;
    if (!useSpdt || comp.type === "V") {
      drawVertical(svg, comp, yA, yB, LEFT_X);
      continue;
    }
    // ── SPDT 선택 스위치.
    const cy = (yA + yB) / 2;
    const order = switchIdxs.indexOf(i);        // 0 = 최상단 스위치
    const fromBottom = S - 1 - order;            // 0 = 최하단 스위치 (단자1·2)
    const leftLabel = `단자${2 * fromBottom + 1}`;
    const rightLabel = `단자${2 * fromBottom + 2}`;
    const pts = drawSpdt(svg, LEFT_X, cy, comp.id, leftLabel, rightLabel, comp.value != null ? String(comp.value) : undefined);
    // 직렬 입력: 위 노드 → 우측 throw(활성 단자).
    svg.push(line(LEFT_X, yA, LEFT_X + THROW_DX, yA));
    svg.push(line(LEFT_X + THROW_DX, yA, pts.rt.x, pts.rt.y));
    // 직렬 출력: common pivot → 아래 노드.
    svg.push(line(pts.cm.x, pts.cm.y, LEFT_X, yB));
    // 좌측 throw(단자) 배선: 최상단 스위치 단자 → 상단 노드(TOP), 최하단 → 하단 노드(BOT).
    svg.push(line(pts.lt.x, pts.lt.y, LANE_X, pts.lt.y));
    if (order === 0) {
      svg.push(line(LANE_X, pts.lt.y, LANE_X, TOP_Y));
      svg.push(line(LANE_X, TOP_Y, LEFT_X, TOP_Y));
    } else if (order === S - 1) {
      svg.push(line(LANE_X, pts.lt.y, LANE_X, BOT_Y));
      svg.push(line(LANE_X, BOT_Y, LEFT_X, BOT_Y));
    }
  }

  // 전원 옆 단자 노드 dot — 전원과 스위치망 접점 (원본의 "전원 옆 노드").
  //   + 상단/하단 노드(단자3·단자1 합류점)도 junction dot.
  if (useSpdt) {
    const dotNodes = [
      d.legNodes[1],
      d.legNodes[d.legNodes.length - 2],
      d.topLeft,
      d.gnd,
    ];
    for (const n of dotNodes) {
      const p = nodePos[n];
      if (p) svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="black"/>`);
    }
  }

  // ── 2) 상단 가로 rail — R_top.
  drawHorizontal(svg, d.topComp, LEFT_X, RIGHT_X, TOP_Y);

  // ── 3) 하단 가로 rail — R_bot (WIRE면 단순 도선).
  drawHorizontal(svg, d.bottomComp, LEFT_X, RIGHT_X, BOT_Y);

  // ── 4) 우측 리액티브 병렬 블록 (vertical, parallel이면 x offset stack).
  //   ★ 라벨은 직접 배치 — 평행 가지가 가까워 renderComponentOnEdge의 우측 고정 라벨이
  //     옆 가지 위에 겹쳐 가려지는 문제 회피. 좌측 가지는 라벨을 왼쪽, 나머지는 오른쪽.
  const nR = d.reactives.length;
  const reactiveCy = (TOP_Y + BOT_Y) / 2;
  d.reactives.forEach((c, i) => {
    const dx = nR >= 2 ? (i - (nR - 1) / 2) * PARALLEL_DX : 0;
    const x = RIGHT_X + dx;
    if (Math.abs(dx) > 0.5) {
      // 본선(topRight·bottomRight)에서 offset 가지로 stub.
      svg.push(line(RIGHT_X, TOP_Y, x, TOP_Y));
      svg.push(line(RIGHT_X, BOT_Y, x, BOT_Y));
    }
    // 라벨 없는 clone으로 심볼만 그림.
    drawVertical(svg, { ...c, id: "", value: undefined }, TOP_Y, BOT_Y, x);
    // 라벨 직접 배치 — 좌측 가지(i=0)는 왼쪽, 그 외는 오른쪽.
    const onLeft = nR >= 2 && i === 0;
    const lx = onLeft ? x - 44 : x + 34;
    const anchor = onLeft ? "end" : "start";
    svg.push(`<text x="${lx}" y="${reactiveCy - 4}" text-anchor="${anchor}" font-size="11" fill="#1e3a8a" font-weight="600">${escapeSvg(c.id)}</text>`);
    if (c.value != null) {
      svg.push(`<text x="${lx}" y="${reactiveCy + 12}" text-anchor="${anchor}" font-size="11" fill="#475569">${escapeSvg(String(c.value))}</text>`);
    }
  });

  // ── 5) Junction dots (degree ≥ 3).
  const degree = new Map<string, number>();
  for (const c of netlist.components ?? []) {
    for (const p of c.pins ?? []) degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
  }
  for (const [n, dd] of degree) {
    const p = nodePos[n];
    if (p && dd >= 3 && !isGndNode(n, d.ground)) {
      svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="black"/>`);
    }
  }

  // ── 6) GND symbol — bottom-left corner.
  svg.push(groundSymbol(LEFT_X, BOT_Y));

  // ── 7) 측정 표시 (i(t) 상단 rail, i₁(t) 첫 리액티브).
  for (const mark of netlist.measurementMarks ?? []) {
    if (mark.kind !== "current") continue;
    const ref = mark.refs?.[0];
    if (ref === d.topComp.id) {
      // 상단 rail 위에 좌→우 화살표 (rail 위쪽 여유 있게).
      const ax = LEFT_X + 60;
      svg.push(
        `<path d="M ${ax} ${TOP_Y - 46} L ${ax + 44} ${TOP_Y - 46}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#acdc_arrow)"/>`,
      );
      svg.push(
        `<text x="${ax}" y="${TOP_Y - 52}" font-size="13" fill="#1e3a8a" font-weight="600">${escapeSvg(mark.label)}</text>`,
      );
    } else if (d.reactives.some((c) => c.id === ref)) {
      // 첫 리액티브(좌측 가지) 옆 아래방향 화살표 — L_1 라벨과 안 겹치게 inductor 가까이.
      const leftReactiveX = RIGHT_X - (d.reactives.length >= 2 ? (d.reactives.length - 1) / 2 * PARALLEL_DX : 0);
      const rx = leftReactiveX - 20;
      const my = (TOP_Y + BOT_Y) / 2;
      svg.push(
        `<path d="M ${rx} ${my - 22} L ${rx} ${my + 22}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#acdc_arrow)"/>`,
      );
      svg.push(
        `<text x="${rx}" y="${my - 28}" text-anchor="middle" font-size="13" fill="#1e3a8a" font-weight="600">${escapeSvg(mark.label)}</text>`,
      );
    }
  }

  const svgW = RIGHT_X + 160;
  const svgH = BOT_Y + 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n${svg.join("\n")}\n</svg>`;
}

// ─── helpers ───────────────────────────────────────────────

/** 세로 segment (yA→yB, 같은 x)에 component 배치 — 양옆 wire + 흰 mask. */
function drawVertical(svg: string[], comp: CircuitComponent, yA: number, yB: number, x: number): void {
  const cy = (yA + yB) / 2;
  if (comp.type === "WIRE") {
    svg.push(line(x, yA, x, yB));
    return;
  }
  svg.push(`<rect x="${x - HALF}" y="${cy - HALF - 2}" width="${HALF * 2}" height="${(HALF + 2) * 2}" fill="white"/>`);
  svg.push(line(x, yA, x, cy - HALF));
  svg.push(line(x, cy + HALF, x, yB));
  svg.push(renderComponentOnEdge(comp, { x, y: cy }, "vertical"));
}

/** 가로 segment (xA→xB, 같은 y)에 component 배치 — 양옆 wire + 흰 mask. */
function drawHorizontal(svg: string[], comp: CircuitComponent, xA: number, xB: number, y: number): void {
  const cx = (xA + xB) / 2;
  if (comp.type === "WIRE") {
    svg.push(line(xA, y, xB, y));
    return;
  }
  svg.push(`<rect x="${cx - HALF - 2}" y="${y - HALF}" width="${(HALF + 2) * 2}" height="${HALF * 2}" fill="white"/>`);
  svg.push(line(xA, y, cx - HALF, y));
  svg.push(line(cx + HALF, y, xB, y));
  svg.push(renderComponentOnEdge(comp, { x: cx, y }, "horizontal"));
}

/**
 * SPDT 선택 스위치 — 두 throw 단자(좌·우) + common pivot + arm(우측 활성) + 점선 박스.
 *   common(x, cy+gap) 아래로 직렬 출력, 두 throw(x±dx, cy-gap)가 단자.
 *   반환: throw·common 접점 좌표.
 */
function drawSpdt(
  svg: string[],
  x: number,
  cy: number,
  swId: string,
  leftLabel: string,
  rightLabel: string,
  value?: string,
): { lt: { x: number; y: number }; rt: { x: number; y: number }; cm: { x: number; y: number } } {
  const lt = { x: x - THROW_DX, y: cy - ARM_GAP };
  const rt = { x: x + THROW_DX, y: cy - ARM_GAP };
  const cm = { x, y: cy + ARM_GAP };
  const boxPad = 16;
  // 점선 박스 (ganged 스위치 표기)
  svg.push(
    `<rect x="${x - THROW_DX - boxPad}" y="${cy - ARM_GAP - 14}" width="${(THROW_DX + boxPad) * 2}" height="${ARM_GAP * 2 + 24}" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4" rx="4"/>`,
  );
  // 접점 (throw 2개 + common)
  for (const p of [lt, rt, cm]) {
    svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3" fill="white" stroke="black" stroke-width="1.6"/>`);
  }
  // arm — common → 우측 throw (활성 위치)
  svg.push(`<path d="M ${cm.x} ${cm.y} L ${rt.x} ${rt.y}" stroke="black" fill="none" stroke-width="2"/>`);
  // 단자 라벨 — 박스 위쪽에 throw별 정렬 (박스·접점과 겹침 방지)
  const labelY = cy - ARM_GAP - 20;
  svg.push(`<text x="${lt.x}" y="${labelY}" text-anchor="middle" font-size="11" fill="#475569">${escapeSvg(leftLabel)}</text>`);
  svg.push(`<text x="${rt.x}" y="${labelY}" text-anchor="middle" font-size="11" fill="#475569">${escapeSvg(rightLabel)}</text>`);
  // 스위치 id (박스 좌측)
  svg.push(`<text x="${x - THROW_DX - boxPad - 6}" y="${cy + 4}" text-anchor="end" font-size="12" fill="#1e3a8a" font-weight="600">${escapeSvg(swId)}</text>`);
  if (value) {
    svg.push(`<text x="${x}" y="${cy + ARM_GAP + 22}" text-anchor="middle" font-size="10" fill="#475569">${escapeSvg(value)}</text>`);
  }
  return { lt, rt, cm };
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}

function isGndNode(n: string, ground: string): boolean {
  return GROUND_LABELS.has(n) || n === ground;
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
