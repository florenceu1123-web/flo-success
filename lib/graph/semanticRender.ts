/**
 * Semantic graph / Render graph 분리 모델.
 *
 *   semantic graph  → immutable
 *      ↓
 *   render graph    → semantic 보존 + temporary bend point만 추가 가능
 *
 *   ★ 원칙:
 *     - 모든 SemanticNode(분석에서 추출한 회로 노드)는 render 단계에서 그대로 보존.
 *     - 시각 라우팅을 위해 필요한 경우 BendPoint(id: "__bend_*", transient: true,
 *       semantic: false)를 RenderGraph에 추가.
 *     - 노드/branch 자동 prune·merge·remap 금지. semantic 오류는 validator가
 *       reject(throw)로 차단하되 graph는 수정하지 않는다.
 *
 *   사용 패턴:
 *     edge(V1, V2)에서 시각 overlap 발생 시:
 *       path: (V1) → (bendpoint) → (bendpoint) → (V2)
 *     bendpoint는 SemanticGraph에는 존재하지 않음.
 */

/**
 * SemanticNode — 회로 분석에서 추출한 실제 회로 노드(V_1, V_3, GND 등).
 *   semantic === true 강제. immutable.
 */
export type SemanticNode = {
  readonly id: string;
  readonly semantic: true;
};

/**
 * BendPoint — render 단계에서 시각 라우팅을 위해 임시로 추가하는 노드.
 *   semantic === false, transient === true.
 *   SemanticGraph에는 존재하지 않는다.
 */
export type BendPoint = {
  readonly id: string;
  readonly semantic: false;
  readonly transient: true;
};

/**
 * 통합 Node 타입 — RenderGraph가 들고 다니는 노드. 모두 id와 semantic 플래그 보유.
 */
export type Node = SemanticNode | BendPoint;

/** Edge — bend point들을 경유할 수 있음. via는 bendpoint id 배열, 빈 배열 = 직선. */
export type Edge = {
  readonly id: string;
  readonly from: string;     // 시작 SemanticNode id
  readonly to: string;       // 끝 SemanticNode id
  /** 경유 bend point id들 — semantic은 from→to로만 정의됨. */
  readonly via?: readonly string[];
};

/**
 * SemanticGraph — 분석 결과의 immutable representation.
 *   nodes: 모두 SemanticNode (semantic === true).
 */
export type SemanticGraph = {
  readonly nodes: readonly SemanticNode[];
  readonly edges: readonly Edge[];
};

/**
 * RenderGraph — 시각화용. SemanticGraph + bend points.
 *   semantic 노드는 동일 id로 유지, bend points만 추가.
 */
export type RenderGraph = {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
};

/**
 * Bend point factory — 일관된 id 패턴(__bend_<n>).
 */
export function makeBendPoint(index: number): BendPoint {
  return { id: `__bend_${index}`, semantic: false, transient: true };
}

/**
 * 진단용 — semantic vs render node 차이 로깅.
 */
export function describeNodes(g: { nodes: readonly Node[] }): Array<{ id: string; semantic: boolean }> {
  return g.nodes.map((n) => ({ id: n.id, semantic: n.semantic }));
}
