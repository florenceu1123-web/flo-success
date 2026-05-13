/**
 * Modified Nodal Analysis (MNA) — DC 선형 회로 솔버.
 *
 * 입력: SolverNetwork (저항 + 독립 V/I 소스)
 * 출력: 노드 전압 + 각 V 소스의 흐르는 전류
 *
 * 알고리즘:
 *  - n개 non-ground 노드 → conductance matrix G (n×n)
 *  - m개 독립 V 소스 → 추가 (n+m) × (n+m) system (Modified)
 *  - I 소스는 RHS에 직접 기여
 *  - Gauss-Jordan elimination으로 풀이
 *
 * 한계:
 *  - 종속전원 미지원 (VCCS/VCVS/CCCS/CCVS) — 다음 phase
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
};

export type SolverResult = {
  /** 각 노드의 절대 전압 (ground 기준) */
  nodeVoltages: Record<string, number>;
  /** 각 V 소스를 통해 흐르는 전류 (a에서 b로 흐르는 방향이 양수) */
  vsourceCurrents: Record<string, number>;
};

/**
 * 메인 진입점. 회로를 풀어 노드 전압 + V 소스 전류 반환.
 * @throws 특이 행렬(노드가 떠 있음, ground 미연결 등) — 회로가 결정 불가
 */
export function solveMNA(net: SolverNetwork): SolverResult {
  const { nodeIds, groundId, resistors, vsources, isources } = net;
  const n = nodeIds.length;
  const m = vsources.length;
  const size = n + m;

  // node id → row index (ground는 인덱스 없음 = "skip")
  const idx = new Map<string, number>();
  nodeIds.forEach((id, i) => idx.set(id, i));
  const isGround = (id: string) => id === groundId;

  // (size) × (size+1) 증강행렬 [A | b]
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

  // 2) I 소스 → RHS
  // 약속: I가 a에서 외부로 흘러나옴 (a는 source, b는 sink) → KCL 입장에서 a는 -I, b는 +I
  for (const s of isources) {
    const ia = idx.get(s.a);
    const ib = idx.get(s.b);
    if (ia !== undefined) M[ia][size] -= s.I;
    if (ib !== undefined) M[ib][size] += s.I;
  }

  // 3) V 소스 → MNA 확장 (각 V 소스마다 행/열 1개 추가)
  vsources.forEach((s, k) => {
    const row = n + k;
    const ia = idx.get(s.a);
    const ib = idx.get(s.b);
    // V 소스 전류 변수 I_s가 a→b 방향: KCL에서 a 노드는 -I_s, b 노드는 +I_s
    if (ia !== undefined) {
      M[ia][row] -= 1;
      M[row][ia] += 1;
    }
    if (ib !== undefined) {
      M[ib][row] += 1;
      M[row][ib] -= 1;
    }
    // V(a) - V(b) = V
    M[row][size] = s.V;
  });

  // 4) Gauss-Jordan
  const x = gaussJordan(M, size);

  // 5) 결과 packing
  const nodeVoltages: Record<string, number> = {};
  nodeVoltages[groundId] = 0;
  nodeIds.forEach((id, i) => { nodeVoltages[id] = x[i]; });

  const vsourceCurrents: Record<string, number> = {};
  vsources.forEach((s, k) => { vsourceCurrents[s.id] = x[n + k]; });

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
