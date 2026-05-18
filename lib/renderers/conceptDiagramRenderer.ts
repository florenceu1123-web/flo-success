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
  for (const g of groupedEdges) {
    const src = nodeMap.get(g.from);
    const dst = nodeMap.get(g.to);
    if (!src || !dst || src.x === undefined || src.y === undefined || dst.x === undefined || dst.y === undefined) continue;

    const label = g.labels.join(", ");
    if (g.from === g.to) {
      svg += renderSelfLoop(src.x!, src.y!, label);
    } else {
      svg += renderEdge(src.x!, src.y!, dst.x!, dst.y!, label);
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
  const cx = W / 2;
  const cy = H / 2 + 10;
  const r = Math.min(W, H) / 2 - PAD;
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

function renderEdge(x1: number, y1: number, x2: number, y2: number, label: string): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return "";
  const ux = dx / dist;
  const uy = dy / dist;
  // 시작·끝점을 node 가장자리로 보정
  const sx = x1 + ux * NODE_R;
  const sy = y1 + uy * NODE_R;
  const ex = x2 - ux * (NODE_R + 8);
  const ey = y2 - uy * (NODE_R + 8);
  // 화살표 head
  const ah = 9;
  const aw = 5;
  const arrowX1 = ex - ah * ux + aw * uy;
  const arrowY1 = ey - ah * uy - aw * ux;
  const arrowX2 = ex - ah * ux - aw * uy;
  const arrowY2 = ey - ah * uy + aw * ux;

  let svg = `<path d="M ${sx} ${sy} L ${ex} ${ey}" stroke="#374151" fill="none" stroke-width="1.6"/>`;
  svg += `<polygon points="${ex},${ey} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}" fill="#374151"/>`;
  if (label) {
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2 - 6;
    // label 배경 box
    const tw = label.length * 7 + 8;
    svg += `<rect x="${mx - tw / 2}" y="${my - 11}" width="${tw}" height="15" fill="white" stroke="#9ca3af" stroke-width="0.5" rx="2"/>`;
    svg += `<text x="${mx}" y="${my}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(label)}</text>`;
  }
  return svg;
}

function renderSelfLoop(cx: number, cy: number, label: string): string {
  // 위쪽 self-loop
  const r = NODE_R;
  const top = cy - r;
  let svg = `<path d="M ${cx - 8} ${top - 4} q -22 -28 0 -36 q 22 8 0 36" stroke="#374151" fill="none" stroke-width="1.6"/>`;
  // 화살표 head (오른쪽 끝에서 다시 들어옴)
  svg += `<polygon points="${cx + 5},${top + 2} ${cx + 1},${top - 6} ${cx + 9},${top - 6}" fill="#374151"/>`;
  if (label) {
    svg += `<text x="${cx}" y="${top - 28}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(label)}</text>`;
  }
  return svg;
}

function escapeSvg(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
