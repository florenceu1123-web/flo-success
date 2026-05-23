/**
 * 4-노드 universal_dc 전용 layout — imyong 10번 형식.
 *
 *  사용자가 명시한 layout 제약:
 *   1) VS_PLUS와 GND를 같은 세로선에 두지 말 것
 *   2) V1은 중앙 위
 *   3) V2는 오른쪽 위
 *   4) GND는 중앙 아래
 *   5) 전압원은 VS_PLUS-GND 사이에 직접 세로로 그리지 말고 왼쪽 leg로 우회
 *
 *  결과 layout (3 columns × 2 rows of nodes):
 *
 *     VS_PLUS(좌상) ──H_top_L──── V1(중상) ──H_top_R──── V2(우상)
 *         │                          │                       │
 *         V_src                    R_var                   R_right
 *         │                          │                       │
 *      (좌하) ──wire──── GND(중하) ──wire──── (우하)
 *
 *  분류 가정:
 *   - V 소스의 양 단자가 모두 non-GND (즉 +단자 ≠ GND) → VS_PLUS 노드
 *   - 정확히 4 고유 노드 (V·+단자, V1, V2, GND)
 *   - V1, V2, VS_PLUS는 horizontal branch로 연결됨
 *   - V1·V2·VS_PLUS 각각 GND로 가는 vertical leg 존재 (또는 V·+에서 V로 직결)
 *
 *  cross-layout(2-row cell grid)의 V·+↔GND wire-only short 버그를 회피하는
 *  대안. 4-노드 전용이지만 universal_dc의 핵심 형식이라 폭넓게 적용됨.
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

const COL_X = [120, 320, 520];        // VS_PLUS, V1, V2 X 좌표
const ROW_Y = [80, 360];              // top·bottom Y
const HALF = 28;                       // component body half-size

/**
 * 4-노드 imyong 10번 pattern 감지.
 *
 *  조건:
 *   - V 소스 1개 (양 단자 모두 non-GND)
 *   - 정확히 4 고유 노드 (component pin 기준) 중 1개가 GND
 *   - V 소스가 가리키는 +단자(VS_PLUS) 노드와 V1·V2 후보 2개가 식별됨
 */
export function detectFourNodeImyong(netlist: CircuitNetlist): null | {
  vsPlus: string;
  v1: string;
  v2: string;
  ground: string;
  vSource: CircuitComponent;
} {
  const ground = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;

  // V 소스 (양 단자 non-GND).
  const vSources = netlist.components.filter((c) => c.type === "V");
  if (vSources.length !== 1) return null;
  const vSrc = vSources[0];
  if (vSrc.pins.length < 2) return null;
  const [vPin1, vPin2] = vSrc.pins;
  const vPositive = vPin1.role === "positive"
    ? vPin1
    : vPin2.role === "positive"
      ? vPin2
      : vPin1;  // role 미지정이면 첫 번째를 + 가정
  const vNegative = vPositive === vPin1 ? vPin2 : vPin1;
  if (isGnd(vPositive.node)) return null;  // +단자가 GND면 다른 패턴
  if (!isGnd(vNegative.node)) return null;  // −단자가 GND가 아니면 4-노드 아님 (e.g. floating V)
  const vsPlus = vPositive.node;

  // 고유 non-GND 노드 수집.
  const nonGndNodes = new Set<string>();
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (!isGnd(p.node)) nonGndNodes.add(p.node);
    }
  }
  if (nonGndNodes.size !== 3) return null;  // VS_PLUS + V1 + V2 = 3

  // V1·V2 결정 — VS_PLUS와 V1은 horizontal R로 연결 (degree≥1 from VS_PLUS).
  //   adjacency 구성: non-GND ↔ non-GND component (horizontal 후보).
  const adj = new Map<string, Set<string>>();
  for (const c of netlist.components) {
    if (c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    if (isGnd(p1.node) || isGnd(p2.node)) continue;  // vertical leg 제외
    if (c.type === "V") continue;  // V 소스는 horizontal이 아님
    if (!adj.has(p1.node)) adj.set(p1.node, new Set());
    if (!adj.has(p2.node)) adj.set(p2.node, new Set());
    adj.get(p1.node)!.add(p2.node);
    adj.get(p2.node)!.add(p1.node);
  }
  // VS_PLUS는 V1과만 인접 (V2는 V1 거쳐서). VS_PLUS의 이웃이 정확히 1개여야.
  const vsNeighbors = adj.get(vsPlus);
  if (!vsNeighbors || vsNeighbors.size !== 1) return null;
  const v1 = [...vsNeighbors][0];
  // V2는 V1의 이웃 중 VS_PLUS 아닌 것.
  const v1Neighbors = adj.get(v1);
  if (!v1Neighbors) return null;
  const v2Candidates = [...v1Neighbors].filter((n) => n !== vsPlus);
  if (v2Candidates.length !== 1) return null;
  const v2 = v2Candidates[0];

  return { vsPlus, v1, v2, ground, vSource: vSrc };
}

/**
 * 4-노드 imyong 10번 layout 렌더링.
 */
export function renderFourNodeImyong(
  netlist: CircuitNetlist,
  detected: NonNullable<ReturnType<typeof detectFourNodeImyong>>,
): string {
  const { vsPlus, v1, v2, ground } = detected;
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;

  // 노드 좌표 (3 columns × 2 rows of grid nodes).
  //   n_top[0]=VS_PLUS, n_top[1]=V1, n_top[2]=V2 (전부 top row)
  //   n_bot[0]=좌하 junction, n_bot[1]=GND symbol 위치(중하), n_bot[2]=우하 junction
  //   bot row는 wire로 연결되어 전기적으로 모두 GND.
  const TOP_Y = ROW_Y[0];
  const BOT_Y = ROW_Y[1];
  const nodePos: Record<string, { x: number; y: number }> = {
    [vsPlus]: { x: COL_X[0], y: TOP_Y },
    [v1]:     { x: COL_X[1], y: TOP_Y },
    [v2]:     { x: COL_X[2], y: TOP_Y },
  };

  // 컴포넌트 분류.
  const horizontals: CircuitComponent[] = [];
  const verticals: CircuitComponent[] = [];
  for (const c of netlist.components) {
    if ((c.pins?.length ?? 0) < 2) continue;
    const [p1, p2] = c.pins;
    if (isGnd(p1.node) && isGnd(p2.node)) continue;
    if (!isGnd(p1.node) && !isGnd(p2.node)) horizontals.push(c);
    else verticals.push(c);
  }

  const svg: string[] = [];

  // ── 1) Top rail node + wire 그리기 (각 인접 column 사이) ──
  //   parallel horizontal branches stacking은 component body 그릴 때 offset 적용.
  //   top rail은 horizontal로 일자, 평행 branch도 같은 두 노드를 잇지만 시각적으론 +offset.

  // ── 2) Bottom rail wire (좌하 - GND - 우하 모두 GND, 일자) ──
  svg.push(`<path d="M ${COL_X[0]} ${BOT_Y} L ${COL_X[2]} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`);

  // ── 3) Top rail node positions + horizontal branches ──
  //   같은 (from, to) pair branches 그룹핑 — 평행 가지.
  type HBranch = { c: CircuitComponent; from: string; to: string };
  const horizGroups = new Map<string, HBranch[]>();
  for (const c of horizontals) {
    const [p1, p2] = c.pins;
    const fromNode = p1.node;
    const toNode = p2.node;
    const key = [fromNode, toNode].sort().join("|");
    if (!horizGroups.has(key)) horizGroups.set(key, []);
    horizGroups.get(key)!.push({ c, from: fromNode, to: toNode });
  }
  for (const [, group] of horizGroups) {
    const N = group.length;
    group.forEach((b, i) => {
      const offset = N > 1 ? (i - (N - 1) / 2) * 36 : 0;  // ±offset stack
      const from = nodePos[b.from];
      const to = nodePos[b.to];
      if (!from || !to) return;
      const y = TOP_Y + offset;
      // stub wires (from-to를 본선에서 분기)
      if (offset !== 0) {
        svg.push(`<path d="M ${from.x} ${from.y} L ${from.x} ${y}" stroke="black" stroke-width="2" fill="none"/>`);
        svg.push(`<path d="M ${to.x} ${to.y} L ${to.x} ${y}" stroke="black" stroke-width="2" fill="none"/>`);
      }
      // wire 본선에서 component 위치를 비움 (white rect으로 가림)
      const cx = (from.x + to.x) / 2;
      const cy = y;
      svg.push(`<rect x="${cx - HALF - 2}" y="${cy - HALF}" width="${(HALF + 2) * 2}" height="${HALF * 2}" fill="white"/>`);
      const xMin = Math.min(from.x, to.x);
      const xMax = Math.max(from.x, to.x);
      svg.push(`<path d="M ${xMin} ${cy} L ${cx - HALF} ${cy}" stroke="black" stroke-width="2" fill="none"/>`);
      svg.push(`<path d="M ${cx + HALF} ${cy} L ${xMax} ${cy}" stroke="black" stroke-width="2" fill="none"/>`);
      svg.push(renderComponentOnEdge(b.c, { x: cx, y: cy }, "horizontal"));
    });
  }

  // ── 4) Vertical legs ──
  //   각 컴포넌트의 top pin 노드 column에 vertical edge 그림. bottom은 BOT_Y로.
  for (const c of verticals) {
    const top = c.pins.find((p) => !isGnd(p.node));
    if (!top) continue;
    const tp = nodePos[top.node];
    if (!tp) continue;
    const cy = (tp.y + BOT_Y) / 2;
    svg.push(`<rect x="${tp.x - HALF}" y="${cy - HALF - 2}" width="${HALF * 2}" height="${(HALF + 2) * 2}" fill="white"/>`);
    svg.push(`<path d="M ${tp.x} ${tp.y} L ${tp.x} ${cy - HALF}" stroke="black" stroke-width="2" fill="none"/>`);
    svg.push(`<path d="M ${tp.x} ${cy + HALF} L ${tp.x} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`);
    svg.push(renderComponentOnEdge(c, { x: tp.x, y: cy }, "vertical"));
  }

  // ── 5) Junction dots (degree≥3 top 노드) ──
  const degree = new Map<string, number>();
  for (const c of [...horizontals, ...verticals]) {
    for (const p of c.pins) {
      degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
    }
  }
  for (const n of [vsPlus, v1, v2]) {
    if ((degree.get(n) ?? 0) >= 3) {
      const p = nodePos[n];
      svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="black"/>`);
    }
  }

  // ── 6) GND symbol — 중앙 하단 (COL_X[1], BOT_Y).
  const gndCx = COL_X[1];
  svg.push(`<g transform="translate(${gndCx},${BOT_Y})">
    <line x1="0" y1="0" x2="0" y2="10" stroke="black" stroke-width="2"/>
    <line x1="-10" y1="10" x2="10" y2="10" stroke="black" stroke-width="2.4"/>
    <line x1="-7" y1="14" x2="7" y2="14" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="18" x2="3" y2="18" stroke="black" stroke-width="2"/>
  </g>`);

  // ── 7) Node labels (V1·V2 — VS_PLUS는 V_s 등으로 별도 표기 가능, 여기선 텍스트 생략) ──
  svg.push(`<text x="${nodePos[v1].x + 8}" y="${nodePos[v1].y - 8}" font-size="14" fill="#1e3a8a" font-weight="600">V_1</text>`);
  svg.push(`<text x="${nodePos[v2].x + 8}" y="${nodePos[v2].y - 8}" font-size="14" fill="#1e3a8a" font-weight="600">V_2</text>`);

  const svgW = COL_X[2] + 100;
  const svgH = BOT_Y + 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n${svg.join("\n")}\n</svg>`;
}
