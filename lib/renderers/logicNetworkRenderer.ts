import type { LogicBlank, LogicGate, LogicGateType, LogicNetworkDiagram } from "@/types";

type Point = { x: number; y: number };

type GateNode = {
  id: string;
  type: LogicGateType;
  gate: LogicGate;
  x: number;
  y: number;
  width: number;
  height: number;
};

// =====================================================================
// Validation — analog_netlist의 dangling 검사 미적용. 신호 그래프 검증만.
// =====================================================================
export function validateLogicNetwork(diagram: LogicNetworkDiagram) {
  const errors: string[] = [];
  const produced = new Set(diagram.inputs);

  diagram.gates.forEach((gate, gi) => {
    const gateLabel = gate.id ?? `gate#${gi}`;
    if (!gate.id) errors.push(`gate#${gi} (type=${gate.type ?? "?"}): id 필드 누락 — { id:"G1", type:"AND", inputs:[...], output:"..." } 형식 필수`);
    if (!gate.inputs?.length) errors.push(`${gateLabel}: 입력 없음`);
    for (const input of gate.inputs ?? []) {
      if (!produced.has(input)) {
        const looksLikeComplement = /^(?:¬|~|\\?!?\W?)?(\w+)['′̄]$|^(?:\w+)_n$/.test(input);
        const hint = looksLikeComplement
          ? ` (보수 신호로 보임 — 명시적 NOT 게이트 필요: { type:"NOT", inputs:["${input.replace(/['′̄]/g, "")}"], output:"${input}" })`
          : "";
        errors.push(`${gateLabel}: ${input} 신호의 source 없음${hint}`);
      }
    }
    if (!gate.output) errors.push(`${gateLabel}: output 없음`);
    if (gate.output) produced.add(gate.output);
  });
  for (const out of diagram.outputs) {
    if (!produced.has(out)) errors.push(`출력 ${out}의 source 없음`);
  }
  // unused gate output: 어떤 gate의 output이 다른 gate의 input에도, diagram.outputs에도 없으면 dangling
  const consumed = new Set<string>(diagram.outputs);
  for (const g of diagram.gates) {
    for (const inp of g.inputs ?? []) consumed.add(inp);
  }
  for (const g of diagram.gates) {
    if (g.output && !consumed.has(g.output)) {
      errors.push(
        `${g.id} (${g.type}): output 신호 "${g.output}"이 orphan. 두 가지 중 하나로 수정: ` +
        `(1) 이 gate의 output을 다른 gate(예: AND term)의 inputs에 추가하거나 ` +
        `(2) K-map 셀값을 조정해서 minimization 결과가 ${g.type}(${(g.inputs ?? []).join(",")})를 product term으로 사용하도록 만들 것.`,
      );
    }
  }
  // blank coverage
  const cov = validateBlankCoverage(diagram);
  errors.push(...cov.errors);
  return { ok: errors.length === 0, errors };
}

// =====================================================================
// Entry
// =====================================================================
export function renderLogicNetworkSVG(diagram: LogicNetworkDiagram): string {
  const validation = validateLogicNetwork(diagram);
  if (!validation.ok) {
    return `<pre>${escapeSvg(validation.errors.join("\n"))}</pre>`;
  }

  const levels = levelizeLogicGates(diagram);
  const nodes = layoutLogicGates(levels);
  const signalPos = new Map<string, Point>();

  diagram.inputs.forEach((input, i) => {
    signalPos.set(input, { x: 60, y: 90 + i * 90 });
  });

  for (const node of nodes) {
    signalPos.set(node.gate.output, getGateOutputPoint(node));
  }

  // viewBox 자동 산정 — 모든 노드·신호·output terminal 포함
  const inputYs = diagram.inputs.map((_, i) => 90 + i * 90);
  const allXs = [
    ...nodes.map((n) => n.x + n.width + PIN_STUB + 12),
    ...diagram.outputs.map((o) => (signalPos.get(o)?.x ?? 0) + 80 + 60),
  ];
  const allYs = [
    ...inputYs,
    ...nodes.map((n) => n.y + n.height),
    ...diagram.outputs.map((o) => signalPos.get(o)?.y ?? 0),
  ];
  const maxX = Math.max(900, ...allXs) + 40;
  const maxY = Math.max(220, ...allYs) + 50;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">`;

  for (const input of diagram.inputs) {
    const p = signalPos.get(input)!;
    svg += `<text x="30" y="${p.y + 5}" font-size="14">${escapeSvg(input)}</text>`;
    svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="black"/>`;
  }

  const routes = buildSignalRoutes(diagram, nodes, signalPos);
  // 게이트 bbox 목록 — wire의 endpoint가 PIN_STUB 위치(게이트 body 외부)이므로
  // bbox는 게이트 body만(핀 stub 제외) 포함. endpoint touch가 false-positive 안 되도록.
  const obstacles: GateBox[] = nodes.map((n) => {
    const bubble = ["NOT", "NAND", "NOR", "XNOR"].includes(n.type) ? 10 : 0;
    return {
      x: n.x,
      right: n.x + n.width + bubble,
      top: n.y,
      bottom: n.y + n.height,
    };
  });
  svg += routeLogicWires(routes, obstacles);

  // 사용되는 신호 set: 다른 gate의 inputs 또는 diagram.outputs
  const usedSignals = new Set<string>();
  for (const g of diagram.gates) {
    for (const inp of g.inputs ?? []) usedSignals.add(inp);
  }
  for (const o of diagram.outputs) usedSignals.add(o);

  // blank lookup — gate.id → LogicBlank
  const blankMap = buildBlankMap(diagram.blanks ?? []);
  for (const node of nodes) {
    svg += renderGateNode(node, blankMap);
    svg += renderGatePins(node, usedSignals);
  }

  // 외부 출력 라벨 (라우팅에서 wire는 이미 그렸음, 라벨만 별도)
  for (const output of diagram.outputs) {
    const p = signalPos.get(output);
    if (!p) continue;
    const endX = p.x + 80;
    svg += `<text x="${endX + 12}" y="${p.y + 5}" font-size="14">${escapeSvg(output)}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// =====================================================================
// Levelize / Layout
// =====================================================================
function levelizeLogicGates(diagram: LogicNetworkDiagram): LogicGate[][] {
  const produced = new Set(diagram.inputs);
  const remaining = [...diagram.gates];
  const levels: LogicGate[][] = [];

  while (remaining.length) {
    const level: LogicGate[] = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const g = remaining[i];
      if (g.inputs.every((x) => produced.has(x))) {
        level.push(g);
        produced.add(g.output);
        remaining.splice(i, 1);
      }
    }
    if (!level.length) {
      throw new Error("logic_network cycle 또는 source 누락");
    }
    levels.push(level.reverse());
  }
  return levels;
}

function layoutLogicGates(levels: LogicGate[][]): GateNode[] {
  const nodes: GateNode[] = [];
  const baseX = 180;
  const levelGap = 160;
  const rowGap = 110;

  levels.forEach((level, li) => {
    level.forEach((gate, ri) => {
      const inputCount = Math.max(1, gate.inputs.length);
      // 입력 핀 간 간격을 넉넉하게 (28px per input + 24 padding) → 2-input은 80px, 3-input은 108px
      const height = Math.max(56, inputCount * 28 + 24);
      nodes.push({
        id: gate.id,
        type: gate.type,
        gate,
        x: baseX + li * levelGap,
        y: 70 + ri * rowGap,
        width: 72,
        height,
      });
    });
  });
  return nodes;
}

// =====================================================================
// Pin coords — 게이트 body 외부에 stub 길이만큼 떨어진 endpoint 반환
// =====================================================================
const PIN_STUB = 12;

function getGateInputPoint(node: GateNode, idx: number, count: number): Point {
  const gap = node.height / (count + 1);
  return { x: node.x - PIN_STUB, y: node.y + gap * (idx + 1) };
}

function getGateOutputPoint(node: GateNode): Point {
  const bubble = ["NOT", "NAND", "NOR", "XNOR"].includes(node.type);
  const bodyRight = node.x + node.width + (bubble ? 10 : 0);
  return { x: bodyRight + PIN_STUB, y: node.y + node.height / 2 };
}

/** 게이트 body와 pin endpoint 사이의 stub 라인 + endpoint dot.
 *  output 신호가 어디에도 사용되지 않으면(usedSignals에 없으면) output 핀 stub은 그리지 않음 → dangling 방지.
 */
function renderGatePins(node: GateNode, usedSignals?: Set<string>): string {
  const inputCount = Math.max(1, node.gate.inputs?.length ?? 0);
  const gap = node.height / (inputCount + 1);
  let svg = "";

  // 입력 핀들 (왼쪽)
  for (let i = 0; i < inputCount; i++) {
    const py = node.y + gap * (i + 1);
    const startX = node.x - PIN_STUB;
    svg += `<path d="M ${startX} ${py} L ${node.x} ${py}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<circle cx="${startX}" cy="${py}" r="2" fill="black"/>`;
  }

  // 출력 핀 (오른쪽) — 사용되는 신호일 때만
  const used = !usedSignals || usedSignals.has(node.gate.output);
  if (used) {
    const bubble = ["NOT", "NAND", "NOR", "XNOR"].includes(node.type);
    const bodyRight = node.x + node.width + (bubble ? 10 : 0);
    const oy = node.y + node.height / 2;
    const pinEnd = bodyRight + PIN_STUB;
    svg += `<path d="M ${bodyRight} ${oy} L ${pinEnd} ${oy}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<circle cx="${pinEnd}" cy="${oy}" r="2" fill="black"/>`;
  }

  return svg;
}

// =====================================================================
// Wires + Fanout routing
// =====================================================================
type SignalRoute = {
  signal: string;
  source: Point;
  destinations: Point[];
};

/** wire 라우팅 시 회피해야 할 게이트 bbox */
type GateBox = { x: number; right: number; top: number; bottom: number };

/**
 * 어떤 x값이 obstacle 안에 들어가면 가장 가까운 외부 channel로 snap.
 * 우선순위: 왼쪽 가장자리(목표 가까움) → 오른쪽 가장자리.
 */
function findFreeX(targetX: number, obstacles: GateBox[], padding = 6): number {
  let result = targetX;
  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (const o of obstacles) {
      if (result >= o.x - padding && result <= o.right + padding) {
        const leftAlt = o.x - padding;
        const rightAlt = o.right + padding;
        result = Math.abs(leftAlt - targetX) <= Math.abs(rightAlt - targetX) ? leftAlt : rightAlt;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

/**
 * 어떤 y값이 xRange와 겹치는 obstacle의 y-range 안에 들어가면 row gap으로 snap.
 * xRange와 겹치지 않는 obstacle은 무시.
 */
function findFreeY(targetY: number, obstacles: GateBox[], xRange: [number, number], padding = 6): number {
  let result = targetY;
  for (let iter = 0; iter < 6; iter++) {
    let changed = false;
    for (const o of obstacles) {
      // x range가 겹치지 않으면 무시
      if (o.right < xRange[0] - padding || o.x > xRange[1] + padding) continue;
      if (result >= o.top - padding && result <= o.bottom + padding) {
        const topAlt = o.top - padding;
        const botAlt = o.bottom + padding;
        result = Math.abs(topAlt - targetY) <= Math.abs(botAlt - targetY) ? topAlt : botAlt;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

/** segment(a→b)가 어떤 obstacle을 가로지르는지. xRange/yRange 둘 다 겹쳐야 가로지름. */
function horizontalCrossesAny(y: number, x1: number, x2: number, obstacles: GateBox[], padding = 4): boolean {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
  return obstacles.some((o) =>
    o.right >= lo - padding && o.x <= hi + padding &&
    y >= o.top - padding && y <= o.bottom + padding,
  );
}

/** diagram + nodes + signalPos → SignalRoute[]. gate inputs와 외부 output 모두 destination에 포함. */
function buildSignalRoutes(
  diagram: LogicNetworkDiagram,
  nodes: GateNode[],
  signalPos: Map<string, Point>,
): SignalRoute[] {
  const sigToDsts = new Map<string, Point[]>();
  for (const node of nodes) {
    node.gate.inputs.forEach((sig, idx) => {
      const dst = getGateInputPoint(node, idx, node.gate.inputs.length);
      const list = sigToDsts.get(sig) ?? [];
      list.push(dst);
      sigToDsts.set(sig, list);
    });
  }
  for (const out of diagram.outputs) {
    const src = signalPos.get(out);
    if (!src) continue;
    const list = sigToDsts.get(out) ?? [];
    list.push({ x: src.x + 80, y: src.y });
    sigToDsts.set(out, list);
  }
  const routes: SignalRoute[] = [];
  for (const [sig, dsts] of sigToDsts) {
    const source = signalPos.get(sig);
    if (!source) continue;
    routes.push({ signal: sig, source, destinations: dsts });
  }
  return routes;
}

const TRUNK_STAGGER = 14; // 같은 source.x 그룹 내에서 trunk 간 lane 간격

/** 신호당 destination 1개 → orthogonal direct, 2개 이상 → trunk + branch + dot */
function routeLogicWires(routes: SignalRoute[], obstacles: GateBox[] = []): string {
  // 모든 라우트(fanout + single)에 source.x 그룹 인덱스 stagger 부여 — vertical/horizontal 채널 충돌 방지
  const xGroupOrder = new Map<number, number[]>();
  routes.forEach((r, i) => {
    const x = Math.round(r.source.x);
    if (!xGroupOrder.has(x)) xGroupOrder.set(x, []);
    xGroupOrder.get(x)!.push(i);
  });
  const staggerByRouteIdx = new Map<number, number>();
  for (const [, idxs] of xGroupOrder) {
    idxs.forEach((rIdx, i) => staggerByRouteIdx.set(rIdx, i * TRUNK_STAGGER));
  }

  let svg = "";
  routes.forEach((route, i) => {
    if (route.destinations.length === 0) return;
    const stagger = staggerByRouteIdx.get(i) ?? 0;
    if (route.destinations.length === 1) {
      svg += orthogonalWire(route.source, route.destinations[0], obstacles, stagger);
    } else {
      svg += renderFanoutRoute(route, obstacles, stagger);
    }
  });
  return svg;
}

function renderFanoutRoute(route: SignalRoute, obstacles: GateBox[] = [], stagger = 0): string {
  const { source, destinations } = route;
  const minTargetX = Math.min(...destinations.map((d) => d.x));
  const naturalTrunkX = Math.min(source.x + 40 + stagger, minTargetX - 40);
  const trunkX = findFreeX(naturalTrunkX, obstacles);
  const yMin = Math.min(source.y, ...destinations.map((d) => d.y));
  const yMax = Math.max(source.y, ...destinations.map((d) => d.y));

  let svg = "";
  // source → trunk 입구 (이 horizontal도 게이트 회피)
  if (!horizontalCrossesAny(source.y, source.x, trunkX, obstacles)) {
    svg += line(source, { x: trunkX, y: source.y });
  } else {
    const detourY = findFreeY(source.y, obstacles, [source.x, trunkX]);
    svg += `<path d="M ${source.x} ${source.y} L ${source.x} ${detourY} L ${trunkX} ${detourY} L ${trunkX} ${source.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  // 수직 trunk
  svg += line({ x: trunkX, y: yMin }, { x: trunkX, y: yMax });

  // source-side T-junction dot — source.y가 trunk 내부에 있으면 분기점
  const eps = 0.5;
  if (source.y > yMin + eps && source.y < yMax - eps) {
    svg += dot({ x: trunkX, y: source.y });
  }

  // 각 destination으로 분기 + junction dot
  for (const dst of destinations) {
    if (!horizontalCrossesAny(dst.y, trunkX, dst.x, obstacles)) {
      svg += line({ x: trunkX, y: dst.y }, dst);
    } else {
      // branch도 Z-detour: trunk → up/down to free y → over → down/up to dst
      const detourY = findFreeY(dst.y, obstacles, [trunkX, dst.x]);
      svg += `<path d="M ${trunkX} ${dst.y} L ${trunkX} ${detourY} L ${dst.x} ${detourY} L ${dst.x} ${dst.y}" stroke="black" fill="none" stroke-width="2"/>`;
    }
    // dst.y가 trunk 내부면 T-junction (위·아래로 trunk가 더 뻗음). 양 끝점이면 L-corner라 dot 불필요
    if (dst.y > yMin + eps && dst.y < yMax - eps) {
      svg += dot({ x: trunkX, y: dst.y });
    }
  }
  return svg;
}

function orthogonalWire(a: Point, b: Point, obstacles: GateBox[] = [], stagger = 0): string {
  // 같은 y → 직선, 단 게이트 가로지르면 Z-detour (stagger로 detour y도 살짝 분산)
  if (Math.abs(a.y - b.y) < 1) {
    if (!horizontalCrossesAny(a.y, a.x, b.x, obstacles)) return line(a, b);
    const naturalDetour = a.y + (stagger > 0 ? stagger : 30);
    const detourY = findFreeY(naturalDetour, obstacles, [Math.min(a.x, b.x), Math.max(a.x, b.x)]);
    if (Math.abs(detourY - a.y) > 80) return line(a, b);
    return `<path d="M ${a.x} ${a.y} L ${a.x} ${detourY} L ${b.x} ${detourY} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  // 같은 x → 직선
  if (Math.abs(a.x - b.x) < 1) return line(a, b);

  // V-H-V 우선: midY를 row gap으로 snap, stagger로 horizontal channel 분산
  const naturalMidY = (a.y + b.y) / 2 + stagger;
  const xRange: [number, number] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const midY = findFreeY(naturalMidY, obstacles, xRange);
  return `<path d="M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
}

function line(a: Point, b: Point): string {
  return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
}

function dot(p: Point): string {
  return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="black"/>`;
}

// =====================================================================
// Blank handling — topology는 유지, symbol만 ⓐ/ⓑ 박스로 치환
// =====================================================================
function buildBlankMap(blanks: LogicBlank[] = []): Map<string, LogicBlank> {
  const map = new Map<string, LogicBlank>();
  for (const blank of blanks) {
    for (const gateId of blank.gateIds) {
      map.set(gateId, blank);
    }
  }
  return map;
}

function renderGateNode(node: GateNode, blankMap: Map<string, LogicBlank>): string {
  const blank = blankMap.get(node.gate.id);
  if (blank) return renderBlankGate(node, blank.symbol);
  return renderGateSymbol(node);
}

function renderBlankGate(node: GateNode, symbol: string): string {
  const { x, y, width, height } = node;
  return (
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="black" stroke-width="2"/>` +
    `<text x="${x + width / 2}" y="${y + height / 2 + 5}" text-anchor="middle" font-size="22">${escapeSvg(symbol)}</text>`
  );
}

/** logic_network 검증: blank.gateIds가 실제 gate 배열 안에 있는지. */
export function validateBlankCoverage(diagram: LogicNetworkDiagram): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const gateIds = new Set(diagram.gates.map((g) => g.id));
  for (const blank of diagram.blanks ?? []) {
    for (const gateId of blank.gateIds) {
      if (!gateIds.has(gateId)) {
        errors.push(`blank target gate missing: ${gateId}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// =====================================================================
// Gate symbols
// =====================================================================
function renderGateSymbol(node: GateNode): string {
  switch (node.type) {
    case "AND":  return renderAndGate(node);
    case "NAND": return renderAndGate(node, true);
    case "OR":   return renderOrGate(node);
    case "NOR":  return renderOrGate(node, true);
    case "XOR":  return renderOrGate(node, false, true);
    case "XNOR": return renderOrGate(node, true, true);
    case "NOT":  return renderNotGate(node);
  }
}

function renderAndGate(node: GateNode, bubble = false): string {
  const { x, y, width: w, height: h } = node;
  const r = 5;
  return `<path d="M ${x} ${y} L ${x + w / 2} ${y} Q ${x + w} ${y} ${x + w} ${y + h / 2} Q ${x + w} ${y + h} ${x + w / 2} ${y + h} L ${x} ${y + h} Z" fill="white" stroke="black" stroke-width="2"/>` +
    (bubble ? `<circle cx="${x + w + r}" cy="${y + h / 2}" r="${r}" fill="white" stroke="black" stroke-width="2"/>` : "");
}

function renderOrGate(node: GateNode, bubble = false, xor = false): string {
  const { x, y, width: w, height: h } = node;
  const r = 5;
  return (
    (xor ? `<path d="M ${x - 10} ${y} Q ${x + 12} ${y + h / 2} ${x - 10} ${y + h}" fill="none" stroke="black" stroke-width="2"/>` : "") +
    `<path d="M ${x} ${y} Q ${x + w * 0.55} ${y} ${x + w} ${y + h / 2} Q ${x + w * 0.55} ${y + h} ${x} ${y + h} Q ${x + 24} ${y + h / 2} ${x} ${y} Z" fill="white" stroke="black" stroke-width="2"/>` +
    (bubble ? `<circle cx="${x + w + r}" cy="${y + h / 2}" r="${r}" fill="white" stroke="black" stroke-width="2"/>` : "")
  );
}

function renderNotGate(node: GateNode): string {
  const { x, y, width: w, height: h } = node;
  const r = 5;
  // triangle apex가 gate width 우측 경계(x+w)까지 확장 → bubble은 외부(NAND와 동일 스타일)
  // bubble 중심 (x+w+r), 우측 끝 (x+w+10) — getGateOutputPoint의 bubble offset(+10)과 정확히 일치
  return `<path d="M ${x} ${y} L ${x} ${y + h} L ${x + w} ${y + h / 2} Z" fill="white" stroke="black" stroke-width="2"/>` +
    `<circle cx="${x + w + r}" cy="${y + h / 2}" r="${r}" fill="white" stroke="black" stroke-width="2"/>`;
}

// =====================================================================
function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
