/**
 * Edge·branch를 노드 쌍 기준으로 그룹화 — 평행 가지(parallel branches) 식별용.
 *
 *  같은 두 노드를 잇는 edge들은 ORDER에 무관하게 같은 그룹.
 *  canonicalPair는 무방향 노드 쌍의 정규 키.
 *
 *  사용:
 *   const groups = groupEdgesByNodePair(edges);
 *   for (const [pairKey, parallelEdges] of groups) {
 *     // pairKey: "a__b" (sorted), parallelEdges: 그 두 노드 사이의 모든 edge
 *   }
 */

export function canonicalPair(a: string, b: string): string {
  return [a, b].sort().join("__");
}

export type EdgeLike = { a: string; b: string } | { from: string; to: string };

function endpoints(e: EdgeLike): [string, string] {
  if ("a" in e && "b" in e) return [e.a, e.b];
  return [e.from, e.to];
}

export function groupEdgesByNodePair<E extends EdgeLike>(edges: readonly E[]): Map<string, E[]> {
  const groups = new Map<string, E[]>();
  for (const e of edges) {
    const [a, b] = endpoints(e);
    const key = canonicalPair(a, b);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return groups;
}
