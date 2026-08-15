/**
 * concept_diagram renderer — state transition diagram, FSM, 상태 그래프 등 일반 노드-엣지.
 *
 * 권장 diagram payload shape:
 * {
 *   title?: string,
 *   nodes: [{ id, label, x?, y? }],
 *   edges: [{ from, to, label?, condition?, output? }],
 *   layout?: "circular" | "horizontal" | "manual"
 * }
 *
 * 좌표 누락 시 자동 layout (원형/가로).
 */

type ConceptNode = { id: string; label?: string; x?: number; y?: number };
type ConceptEdge = { from: string; to: string; label?: string; condition?: string; output?: string };
type ConceptDiagram = {
  title?: string;
  nodes?: ConceptNode[];
  edges?: ConceptEdge[];
  layout?: "circular" | "horizontal" | "manual";
};

const NODE_R = 28;
const PAD = 60;
const W = 720;
const H = 380;

export function renderConceptDiagramSVG(diagram: ConceptDiagram | undefined | null): string {
  if (!diagram || !Array.isArray(diagram.nodes) || diagram.nodes.length === 0) {
    return `<pre>concept_diagram: nodes 비어있음</pre>`;
  }

  const nodes = autoLayoutNodes(diagram.nodes, diagram.layout ?? "circular");
  const nodeMap = new Map<string, ConceptNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  let svg = "";

  // 평행 간선 coalesce — 같은 from→to에 여러 transition이 있으면 라벨을 합쳐서 한 번만 그린다.
  // FSM에서 X=0, X=1이 같은 next state로 가는 경우(e.g. s2→s2 self-loop "0/0"과 "1/0")가 흔한데,
  // 그대로 덧그리면 마지막 한 줄만 보여 다른 입력의 transition이 누락된 것처럼 표시됨.
  const groupedEdges = groupParallelEdges(diagram.edges ?? []);

  // ★ 라벨 겹침 방지 (2026-08-02 사용자 신고 "상태도에서 X끼리 겹쳐서 보이지 않는다"):
  //   (1) 양방향 쌍(a→b와 b→a)은 **같은 직선의 같은 중점**에 라벨을 찍어 정확히 포개졌다 → 서로 반대로 **휘어** 그린다.
  //   (2) 그래도 남는 충돌은 **후보 위치 탐색**으로 피한다(노드 원·이미 놓인 라벨을 장애물로).
  const bidir = new Set<string>();
  for (const g of groupedEdges) {
    if (g.from !== g.to && groupedEdges.some((h) => h.from === g.to && h.to === g.from)) bidir.add(`${g.from}|${g.to}`);
  }
  const obstacles: Box[] = nodes
    .filter((n) => n.x !== undefined && n.y !== undefined)
    .map((n) => ({ x0: n.x! - NODE_R - 3, y0: n.y! - NODE_R - 3, x1: n.x! + NODE_R + 3, y1: n.y! + NODE_R + 3 }));

  for (const g of groupedEdges) {
    const src = nodeMap.get(g.from);
    const dst = nodeMap.get(g.to);
    if (!src || !dst || src.x === undefined || src.y === undefined || dst.x === undefined || dst.y === undefined) continue;

    const label = g.labels.join(", ");
    if (g.from === g.to) {
      svg += renderSelfLoop(src.x!, src.y!, label, obstacles);
    } else {
      // 양방향이면 한쪽은 +, 다른 쪽은 − 로 휘게 한다(from<to 사전순으로 부호 결정 — 결정론).
      const curve = bidir.has(`${g.from}|${g.to}`) ? (g.from < g.to ? 22 : -22) : 0;
      svg += renderEdge(src.x!, src.y!, dst.x!, dst.y!, label, curve, obstacles);
    }
  }

  // nodes
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    svg += `<circle cx="${n.x}" cy="${n.y}" r="${NODE_R}" fill="white" stroke="#1e3a8a" stroke-width="2"/>`;
    svg += `<text x="${n.x}" y="${n.y + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="#1e3a8a">${escapeSvg(n.label ?? n.id)}</text>`;
  }

  // title
  if (diagram.title) {
    svg = `<text x="${W / 2}" y="22" text-anchor="middle" font-size="14" font-weight="700" fill="#1e3a8a">${escapeSvg(diagram.title)}</text>` + svg;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>`;
}

function autoLayoutNodes(nodes: ConceptNode[], layout: string): ConceptNode[] {
  // 이미 모든 node에 x,y가 있으면 그대로
  const allHaveCoords = nodes.every((n) => typeof n.x === "number" && typeof n.y === "number");
  if (allHaveCoords) return nodes;

  if (layout === "horizontal") {
    const spacing = (W - 2 * PAD) / Math.max(1, nodes.length - 1);
    return nodes.map((n, i) => ({ ...n, x: PAD + i * spacing, y: H / 2 }));
  }

  // circular (default)
  //  ★ self-loop(노드 위로 ~36px)와 그 라벨(+16px)이 캔버스 밖으로 잘리지 않도록 반지름을 줄이고
  //    중심을 아래로 내린다 (실측 신고: 최상단 노드의 self-loop 라벨이 안 보였다).
  const cx = W / 2;
  const cy = H / 2 + 22;
  const r = Math.min(W, H) / 2 - PAD - 18;
  return nodes.map((n, i) => {
    const theta = (-Math.PI / 2) + (2 * Math.PI * i) / nodes.length;
    return { ...n, x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
  });
}

/** 같은 from→to를 가지는 edge들을 한 그룹으로 모아 라벨 배열로 묶음. 입력 순서 유지. */
function groupParallelEdges(
  edges: ConceptEdge[],
): Array<{ from: string; to: string; labels: string[] }> {
  const order: string[] = [];
  const groups = new Map<string, { from: string; to: string; labels: string[] }>();
  for (const e of edges) {
    const key = `${e.from}${e.to}`;
    let g = groups.get(key);
    if (!g) {
      g = { from: e.from, to: e.to, labels: [] };
      groups.set(key, g);
      order.push(key);
    }
    const lbl = edgeLabel(e);
    if (lbl) g.labels.push(lbl);
  }
  return order.map((k) => groups.get(k)!);
}

function edgeLabel(e: ConceptEdge): string {
  const parts: string[] = [];
  if (e.condition) parts.push(e.condition);
  if (e.output) parts.push(`/${e.output}`);
  if (parts.length === 0 && e.label) parts.push(e.label);
  return parts.join(" ");
}

/** 라벨 충돌 판정용 bbox. */
type Box = { x0: number; y0: number; x1: number; y1: number };
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const labelBox = (cx: number, cy: number, text: string): Box => {
  const w = text.length * 7 + 10, h = 16;
  return { x0: cx - w / 2, y0: cy - h + 3, x1: cx + w / 2, y1: cy + 4 };
};
/** 라벨이 캔버스 안에 완전히 들어오는가 — 밖으로 나가면 화면에서 잘려 "안 보인다"(실측 신고). */
const inCanvas = (b: Box) => b.x0 >= 2 && b.x1 <= W - 2 && b.y0 >= 26 && b.y1 <= H - 4;
/** 후보 위치 중 **캔버스 안**이면서 장애물과 겹치지 않는 첫 자리를 고른다(없으면 캔버스로 clamp). */
function placeLabel(cands: Array<[number, number]>, text: string, obstacles: Box[]): [number, number, Box] {
  for (const [cx, cy] of cands) {
    const b = labelBox(cx, cy, text);
    if (inCanvas(b) && !obstacles.some((o) => hits(b, o))) return [cx, cy, b];
  }
  // 전부 실패 — 첫 후보를 캔버스 안으로 밀어 넣는다(잘리는 것보다 겹치는 편이 낫다).
  const w = text.length * 7 + 10;
  const [cx0, cy0] = cands[0];
  const cx = Math.min(Math.max(cx0, w / 2 + 3), W - w / 2 - 3);
  const cy = Math.min(Math.max(cy0, 39), H - 6);
  return [cx, cy, labelBox(cx, cy, text)];
}
function labelSvg(cx: number, cy: number, text: string): string {
  const w = text.length * 7 + 10;
  return `<rect x="${cx - w / 2}" y="${cy - 13}" width="${w}" height="16" fill="white" stroke="#9ca3af" stroke-width="0.5" rx="2"/>` +
    `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(text)}</text>`;
}

/**
 * 간선 하나 — curve≠0이면 수직 방향으로 휘어 그린다(양방향 쌍 분리).
 * 라벨은 곡선 중점 근처의 여러 후보 중 **충돌하지 않는 자리**에 놓고, 놓인 자리를 obstacles에 등록한다.
 */
function renderEdge(
  x1: number, y1: number, x2: number, y2: number, label: string,
  curve = 0, obstacles: Box[] = [],
): string {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return "";
  const ux = dx / dist, uy = dy / dist;
  const px = -uy, py = ux;                       // 수직 단위벡터
  // 시작·끝점을 node 가장자리로 보정 (곡선이면 제어점 방향으로 살짝 이동)
  const sx = x1 + ux * NODE_R + px * curve * 0.35;
  const sy = y1 + uy * NODE_R + py * curve * 0.35;
  const ex = x2 - ux * (NODE_R + 8) + px * curve * 0.35;
  const ey = y2 - uy * (NODE_R + 8) + py * curve * 0.35;
  // 곡선 제어점
  const qx = (sx + ex) / 2 + px * curve;
  const qy = (sy + ey) / 2 + py * curve;
  // 끝점 접선(화살표 방향) — 2차 베지어의 끝 접선은 (end − control)
  const tvx = ex - qx, tvy = ey - qy;
  const tl = Math.hypot(tvx, tvy) || 1;
  const ax = tvx / tl, ay = tvy / tl;
  const ah = 9, aw = 5;
  const arrowX1 = ex - ah * ax + aw * ay;
  const arrowY1 = ey - ah * ay - aw * ax;
  const arrowX2 = ex - ah * ax - aw * ay;
  const arrowY2 = ey - ah * ay + aw * ax;

  let svg = curve === 0
    ? `<path d="M ${sx} ${sy} L ${ex} ${ey}" stroke="#374151" fill="none" stroke-width="1.6"/>`
    : `<path d="M ${sx} ${sy} Q ${qx} ${qy} ${ex} ${ey}" stroke="#374151" fill="none" stroke-width="1.6"/>`;
  svg += `<polygon points="${ex},${ey} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}" fill="#374151"/>`;

  if (label) {
    // 베지어 중점(t=0.5) = (s + 2q + e)/4. 직선이면 그냥 중점.
    const bx = curve === 0 ? (sx + ex) / 2 : (sx + 2 * qx + ex) / 4;
    const by = curve === 0 ? (sy + ey) / 2 : (sy + 2 * qy + ey) / 4;
    // 후보: 중점에서 수직으로 ±, 그리고 간선을 따라 앞뒤로 이동
    const cands: Array<[number, number]> = [];
    for (const along of [0, -0.14, 0.14, -0.28, 0.28]) {
      for (const off of [-11, 11, -26, 26, -40, 40]) {
        cands.push([bx + ux * dist * along + px * off, by + uy * dist * along + py * off]);
      }
    }
    const [lx, ly, box] = placeLabel(cands, label, obstacles);
    obstacles.push(box);
    svg += labelSvg(lx, ly, label);
  }
  return svg;
}

function renderSelfLoop(cx: number, cy: number, label: string, obstacles: Box[] = []): string {
  // 위쪽 self-loop
  const r = NODE_R;
  const top = cy - r;
  let svg = `<path d="M ${cx - 8} ${top - 4} q -22 -28 0 -36 q 22 8 0 36" stroke="#374151" fill="none" stroke-width="1.6"/>`;
  // 화살표 head (오른쪽 끝에서 다시 들어옴)
  svg += `<polygon points="${cx + 5},${top + 2} ${cx + 1},${top - 6} ${cx + 9},${top - 6}" fill="#374151"/>`;
  // 루프 자체를 장애물로 등록(다른 간선 라벨이 루프 위에 얹히지 않게)
  obstacles.push({ x0: cx - 24, y0: top - 42, x1: cx + 14, y1: top + 2 });
  if (label) {
    // 루프 위 → 좌 → 우 순으로 빈자리를 찾는다
    const [lx, ly, box] = placeLabel(
      [[cx, top - 44], [cx - 30, top - 30], [cx + 30, top - 30], [cx - 40, top - 6], [cx + 40, top - 6]],
      label, obstacles,
    );
    obstacles.push(box);
    svg += labelSvg(lx, ly, label);
  }
  return svg;
}

function escapeSvg(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
