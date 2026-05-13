/**
 * Modified Nodal Analysis (MNA) — DC 선형 회로 솔버.
 *
 * 입력: SolverNetwork (저항 + 독립 V/I 소스 + 종속 VCCS/VCVS)
 * 출력: 노드 전압 + 각 V 소스의 흐르는 전류 + 각 VCVS 전류
 *
 * 알고리즘:
 *  - n개 non-ground 노드 → conductance matrix G (n×n)
 *  - m개 V 소스 (독립 + 종속 VCVS) → 추가 (n+m) × (n+m) system (Modified)
 *  - I 소스는 RHS에 직접 기여
 *  - VCCS: G 행렬에 control 노드 컬럼에 transconductance 추가
 *  - VCVS: V 소스처럼 추가 행/열, control 노드 컬럼에 -gain 계수
 *  - Gauss-Jordan elimination으로 풀이
 *
 * 한계:
 *  - CCCS/CCVS 미지원 (current-controlling refs 필요) — 후속 phase
 *  - C/L 미지원 (DC 정상상태만)
 */

export type SolverNetwork = {
  /** non-ground 노드 id 목록 — 순서가 인덱스 결정 */
  nodeIds: string[];
  /** ground 노드 id (예: "GND") */
  groundId: string;
  /** 저항 — a-b 양 끝, R(Ω) */
  resistors: Array<{ id: string; a: string; b: string; R: number }>;
  /** 독립 전압원 — a가 +, b가 -, V(V) */
  vsources: Array<{ id: string; a: string; b: string; V: number }>;
  /** 독립 전류원 — 전류가 a에서 흘러나와 b로 들어감 (외부 회로 입장). a=source, b=sink */
  isources: Array<{ id: string; a: string; b: string; I: number }>;
  /**
   * VCCS — voltage-controlled current source.
   * 출력 단자 (a, b)에서 a→b 방향으로 흐르는 전류 = g·(V(vca) - V(vcb)).
   */
  vccs?: Array<{ id: string; a: string; b: string; vca: string; vcb: string; g: number }>;
  /**
   * VCVS — voltage-controlled voltage source.
   * V(a) - V(b) = k·(V(vca) - V(vcb))
   */
  vcvs?: Array<{ id: string; a: string; b: string; vca: string; vcb: string; k: number }>;
};

export type SolverResult = {
  /** 각 노드의 절대 전압 (ground 기준) */
  nodeVoltages: Record<string, number>;
  /** 각 V 소스를 통해 흐르는 전류 (a에서 b로 흐르는 방향이 양수). 독립 + VCVS 모두 포함. */
  vsourceCurrents: Record<string, number>;
};

/**
 * 메인 진입점. 회로를 풀어 노드 전압 + V 소스 전류 반환.
 * @throws 특이 행렬(노드가 떠 있음, ground 미연결 등) — 회로가 결정 불가
 */
export function solveMNA(net: SolverNetwork): SolverResult {
  const { nodeIds, groundId, resistors, vsources, isources } = net;
  const vccsList = net.vccs ?? [];
  const vcvsList = net.vcvs ?? [];

  const n = nodeIds.length;
  // V 소스(독립) + VCVS는 동일하게 행/열 1개씩 추가 — 합쳐서 m_v
  const m_v = vsources.length + vcvsList.length;
  const size = n + m_v;

  const idx = new Map<string, number>();
  nodeIds.forEach((id, i) => idx.set(id, i));

  const M: number[][] = Array.from({ length: size }, () => Array(size + 1).fill(0));

  // 1) 저항 → G (n×n 좌상 블록)
  for (const r of resistors) {
    if (r.R <= 0) throw new Error(`resistor ${r.id}: R must be > 0 (got ${r.R})`);
    const g = 1 / r.R;
    const i = idx.get(r.a);
    const j = idx.get(r.b);
    if (i !== undefined) M[i][i] += g;
    if (j !== undefined) M[j][j] += g;
    if (i !== undefined && j !== undefined) {
      M[i][j] -= g;
      M[j][i] -= g;
    }
  }

  // 2) I 소스 (독립) → RHS
  for (const s of isources) {
    const ia = idx.get(s.a);
    const ib = idx.get(s.b);
    if (ia !== undefined) M[ia][size] -= s.I;
    if (ib !== undefined) M[ib][size] += s.I;
  }

  // 3) VCCS → G에 transconductance 추가
  // VCCS 출력 a→b 방향 I = g·(V(vca)-V(vcb))
  // KCL at a: i_a = -g·V(vca) + g·V(vcb) + i_indep
  //   LHS로 옮기면: M[a][vca] += g, M[a][vcb] -= g
  // KCL at b: i_b = +g·V(vca) - g·V(vcb) + i_indep
  //   LHS: M[b][vca] -= g, M[b][vcb] += g
  for (const dep of vccsList) {
    const ia = idx.get(dep.a);
    const ib = idx.get(dep.b);
    const vca = idx.get(dep.vca);
    const vcb = idx.get(dep.vcb);
    const g = dep.g;
    if (ia !== undefined && vca !== undefined) M[ia][vca] += g;
    if (ia !== undefined && vcb !== undefined) M[ia][vcb] -= g;
    if (ib !== undefined && vca !== undefined) M[ib][vca] -= g;
    if (ib !== undefined && vcb !== undefined) M[ib][vcb] += g;
  }

  // 4) V 소스 (독립) → MNA 확장
  vsources.forEach((s, k) => {
    const row = n + k;
    const ia = idx.get(s.a);
    const ib = idx.get(s.b);
    if (ia !== undefined) {
      M[ia][row] -= 1;
      M[row][ia] += 1;
    }
    if (ib !== undefined) {
      M[ib][row] += 1;
      M[row][ib] -= 1;
    }
    M[row][size] = s.V;
  });

  // 5) VCVS → MNA 확장 + control 노드 컬럼에 -k 계수
  // V(a) - V(b) = k·(V(vca) - V(vcb))
  // KCL at a, b: V source처럼 (current variable I_dep)
  // Row n+vsources.length+kk: V(a) - V(b) - k·V(vca) + k·V(vcb) = 0
  vcvsList.forEach((dep, kk) => {
    const row = n + vsources.length + kk;
    const ia = idx.get(dep.a);
    const ib = idx.get(dep.b);
    const vca = idx.get(dep.vca);
    const vcb = idx.get(dep.vcb);
    if (ia !== undefined) {
      M[ia][row] -= 1;
      M[row][ia] += 1;
    }
    if (ib !== undefined) {
      M[ib][row] += 1;
      M[row][ib] -= 1;
    }
    // control coefficient: -k·V(vca) + k·V(vcb) on LHS
    if (vca !== undefined) M[row][vca] -= dep.k;
    if (vcb !== undefined) M[row][vcb] += dep.k;
    M[row][size] = 0;  // 독립 항 없음
  });

  // 6) Gauss-Jordan
  const x = gaussJordan(M, size);

  // 7) 결과 packing
  const nodeVoltages: Record<string, number> = {};
  nodeVoltages[groundId] = 0;
  nodeIds.forEach((id, i) => { nodeVoltages[id] = x[i]; });

  const vsourceCurrents: Record<string, number> = {};
  vsources.forEach((s, k) => { vsourceCurrents[s.id] = x[n + k]; });
  vcvsList.forEach((dep, kk) => {
    vsourceCurrents[dep.id] = x[n + vsources.length + kk];
  });

  return { nodeVoltages, vsourceCurrents };
}

/** 부분 피벗팅 Gauss-Jordan elimination. M = [A | b], 길이 size×(size+1). 결과 x[]. */
function gaussJordan(M: number[][], size: number): number[] {
  for (let i = 0; i < size; i++) {
    // 부분 피벗: |M[k][i]| 최대인 k를 찾아 swap
    let pivotRow = i;
    let pivotVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < size; k++) {
      const v = Math.abs(M[k][i]);
      if (v > pivotVal) { pivotVal = v; pivotRow = k; }
    }
    if (pivotVal < 1e-12) {
      throw new Error(`singular matrix at row ${i} (network underdetermined — check for floating nodes or missing ground)`);
    }
    if (pivotRow !== i) [M[i], M[pivotRow]] = [M[pivotRow], M[i]];

    // 정규화
    const piv = M[i][i];
    for (let j = i; j <= size; j++) M[i][j] /= piv;

    // 소거
    for (let k = 0; k < size; k++) {
      if (k === i) continue;
      const f = M[k][i];
      if (f === 0) continue;
      for (let j = i; j <= size; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map((row) => row[size]);
}
