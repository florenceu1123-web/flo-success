// src/lib/analog/subcircuit/types.ts
//
// Subcircuit template — archetype을 reusable block으로 분해.
// pipeline: archetype → subcircuit template → expand → component graph → routing.

/** template-expanded subgraph — 노드 + 컴포넌트 간 연결만 표현. layout 정보 없음. */
export type SubcircuitTemplate = {
  nodes: string[];
  components: Array<{
    type: "R" | "C" | "L" | "V" | "I";
    id: string;
    /** 두 끝점 노드 ID — between[0]과 between[1] 사이에 component 배치. */
    between: [string, string];
  }>;
};

/**
 * Wien Bridge RC 망 block — series + shunt 두 branch로 구성된 frequency-selective network.
 *   seriesBranch: [R, C] 직렬 (Z_1)
 *   shuntBranch:  [R, C] 병렬 (Z_2)
 */
export type RCNetworkBlock = {
  type: "WIEN_NETWORK";
  seriesBranch: {
    components: ["R", "C"];
  };
  shuntBranch: {
    components: ["R", "C"];
  };
};
