/**
 * Complex MNA — 단일 주파수 ω에서 AC 정상상태 phasor 해석.
 *
 *  지원 컴포넌트:
 *    - R: 실수 admittance 1/R
 *    - L: 복소 admittance 1/(jωL) = -j/(ωL)
 *    - C: 복소 admittance jωC
 *    - V (독립): phasor V_phasor (Complex). DC면 im=0, AC면 polar magnitude·각도.
 *    - I (독립): phasor I_phasor (Complex).
 *
 *  ★ V/I phasor 입력은 peak 또는 rms 어느 쪽이든 통일된 단위. solver는 단위 무관 — 입력 일관성만.
 *
 *  알고리즘: MNA의 복소 확장. n개 노드 + m개 V 소스 → (n+m) × (n+m) 복소 system. Gauss elimination.
 *
 *  한계:
 *    - 종속전원(VCCS/VCVS) MVP 미지원 (확장 가능)
 *    - OPAMP 미지원 (확장 가능)
 *    - DC와 AC 혼합 해석 (mixed-domain)은 안 함 — 단일 ω 가정.
 */

import {
  type Complex,
  admittanceC,
  admittanceL,
  admittanceR,
  add,
  div,
  mul,
  neg,
  ONE,
  scale,
  sub,
  ZERO,
} from "./complex";

export type ComplexSolverNetwork = {
  nodeIds: string[];
  groundId: string;
  omega: number; // rad/s — 0이면 DC와 동일하지만 L/C 처리 NaN. AC는 > 0.
  resistors: Array<{ id: string; a: string; b: string; R: number }>;
  inductors?: Array<{ id: string; a: string; b: string; L: number }>;
  capacitors?: Array<{ id: string; a: string; b: string; C: number }>;
  /** 독립 전압원 — phasor (peak 또는 rms 일관) */
  vsources: Array<{ id: string; a: string; b: string; V: Complex }>;
  /** 독립 전류원 — phasor */
  isources: Array<{ id: string; a: string; b: string; I: Complex }>;
  /**
   * VCCS — I(a→b) = g·(V(vca) - V(vcb)). g는 실수 transconductance.
   */
  vccs?: Array<{ id: string; a: string; b: string; vca: string; vcb: string; g: number }>;
  /**
   * VCVS — V(a) - V(b) = k·(V(vca) - V(vcb)). k는 실수 gain.
   */
  vcvs?: Array<{ id: string; a: string; b: string; vca: string; vcb: string; k: number }>;
};

export type ComplexSolverResult = {
  /** 각 노드 phasor V (ground 기준) */
  nodeVoltages: Record<string, Complex>;
  /** 각 V 소스 phasor 전류 (a → b 양수 방향) */
  vsourceCurrents: Record<string, Complex>;
};

export function solveComplexMna(net: ComplexSolverNetwork): ComplexSolverResult {
  const { nodeIds, groundId, omega, resistors, vsources, isources } = net;
  const inductors = net.inductors ?? [];
  const capacitors = net.capacitors ?? [];
  const vccsList = net.vccs ?? [];
  const vcvsList = net.vcvs ?? [];

  const n = nodeIds.length;
  const m = vsources.length + vcvsList.length;
  const size = n + m;

  const idx = new Map<string, number>();
  nodeIds.forEach((id, i) => idx.set(id, i));

  // 복소 augmented matrix M[size][size+1]
  const M: Complex[][] = Array.from({ length: size }, () =>
    Array.from({ length: size + 1 }, () => ({ re: 0, im: 0 })),
  );

  const addToCell = (r: number, c: number, val: Complex) => {
    M[r][c] = add(M[r][c], val);
  };
  const subFromCell = (r: number, c: number, val: Complex) => {
    M[r][c] = sub(M[r][c], val);
  };

  // 1) admittance branches (R, L, C) → conductance/admittance block
  const addAdmittance = (a: string, b: string, Y: Complex) => {
    const i = idx.get(a);
    const j = idx.get(b);
    if (i !== undefined) addToCell(i, i, Y);
    if (j !== undefined) addToCell(j, j, Y);
    if (i !== undefined && j !== undefined) {
      subFromCell(i, j, Y);
      subFromCell(j, i, Y);
    }
  };

  for (const r of resistors) {
    if (r.R <= 0) throw new Error(`resistor ${r.id}: R must be > 0`);
    addAdmittance(r.a, r.b, admittanceR(r.R));
  }
  for (const L of inductors) {
    if (L.L <= 0 || omega <= 0) throw new Error(`inductor ${L.id}: L>0 and omega>0 required`);
    addAdmittance(L.a, L.b, admittanceL(L.L, omega));
  }
  for (const C of capacitors) {
    if (C.C <= 0 || omega <= 0) throw new Error(`capacitor ${C.id}: C>0 and omega>0 required`);
    addAdmittance(C.a, C.b, admittanceC(C.C, omega));
  }

  // 2) 독립 I 소스 → RHS (a에서 sink로 흐르는 외부 전류 = +I_a, b로 들어가는 전류 = -I_b)
  for (const s of isources) {
    const ia = idx.get(s.a);
    const ib = idx.get(s.b);
    if (ia !== undefined) subFromCell(ia, size, s.I);
    if (ib !== undefined) addToCell(ib, size, s.I);
  }

  // 3) 독립 V 소스 → MNA 확장 (n+k 행/열)
  vsources.forEach((s, k) => {
    const row = n + k;
    const ia = idx.get(s.a);
    const ib = idx.get(s.b);
    // V(a) - V(b) = s.V
    if (ia !== undefined) {
      addToCell(row, ia, ONE);
      addToCell(ia, row, ONE);
    }
    if (ib !== undefined) {
      subFromCell(row, ib, ONE);
      subFromCell(ib, row, ONE);
    }
    M[row][size] = add(M[row][size], s.V);
  });

  // 3b) VCCS — admittance 블록에 transconductance 추가 (DC mna 동일 패턴, 복소수로 적용).
  //   I(a→b) = g·(V(vca) - V(vcb))
  //   KCL at a: -g·V(vca) + g·V(vcb) 추가 → M[a][vca] += g, M[a][vcb] -= g
  //   KCL at b: +g·V(vca) - g·V(vcb) 추가 → M[b][vca] -= g, M[b][vcb] += g
  for (const dep of vccsList) {
    const ia = idx.get(dep.a);
    const ib = idx.get(dep.b);
    const vca = idx.get(dep.vca);
    const vcb = idx.get(dep.vcb);
    const gC: Complex = { re: dep.g, im: 0 };
    if (ia !== undefined && vca !== undefined) addToCell(ia, vca, gC);
    if (ia !== undefined && vcb !== undefined) subFromCell(ia, vcb, gC);
    if (ib !== undefined && vca !== undefined) subFromCell(ib, vca, gC);
    if (ib !== undefined && vcb !== undefined) addToCell(ib, vcb, gC);
  }

  // 3c) VCVS — V(a) - V(b) = k·(V(vca) - V(vcb)). 독립 V 소스처럼 행/열 추가하되 RHS=0, control coefficients in row.
  vcvsList.forEach((s, kIdx) => {
    const row = n + vsources.length + kIdx;
    const ia = idx.get(s.a);
    const ib = idx.get(s.b);
    const vca = idx.get(s.vca);
    const vcb = idx.get(s.vcb);
    const kC: Complex = { re: s.k, im: 0 };
    if (ia !== undefined) {
      addToCell(row, ia, ONE);
      addToCell(ia, row, ONE);
    }
    if (ib !== undefined) {
      subFromCell(row, ib, ONE);
      subFromCell(ib, row, ONE);
    }
    // control: row에 -k·V(vca) + k·V(vcb) 추가 (V(a)-V(b)+k·(vcb-vca)=0)
    if (vca !== undefined) subFromCell(row, vca, kC);
    if (vcb !== undefined) addToCell(row, vcb, kC);
    // RHS = 0 (이미)
  });

  // 3.5) ε 정규화 — exact 공진(예: Y_L + Y_C = 0)에서 발생하는 degenerate singularity 회피.
  //   각 node KCL 행의 diagonal에 매우 작은 conductance(1e-12) 추가. 실제 회로의 leak.
  //   결과 정확도엔 미미한 영향 (relative error ~1e-12).
  for (let i = 0; i < n; i++) {
    M[i][i] = add(M[i][i], { re: 1e-12, im: 0 });
  }

  // 4) 복소 Gauss elimination
  for (let p = 0; p < size; p++) {
    // pivot — 절댓값 최대인 row 선택
    let bestRow = p;
    let bestMag = magnitude(M[p][p]);
    for (let r = p + 1; r < size; r++) {
      const mg = magnitude(M[r][p]);
      if (mg > bestMag) {
        bestMag = mg;
        bestRow = r;
      }
    }
    if (bestMag < 1e-14) {
      throw new Error(`complex MNA: singular at pivot ${p}`);
    }
    if (bestRow !== p) {
      const tmp = M[p];
      M[p] = M[bestRow];
      M[bestRow] = tmp;
    }
    // normalize
    const piv = M[p][p];
    for (let c = p; c <= size; c++) M[p][c] = div(M[p][c], piv);
    // eliminate
    for (let r = 0; r < size; r++) {
      if (r === p) continue;
      const factor = M[r][p];
      if (factor.re === 0 && factor.im === 0) continue;
      for (let c = p; c <= size; c++) {
        M[r][c] = sub(M[r][c], mul(factor, M[p][c]));
      }
    }
  }

  // 5) 결과 추출
  const nodeVoltages: Record<string, Complex> = {};
  nodeIds.forEach((id, i) => {
    nodeVoltages[id] = M[i][size];
  });
  nodeVoltages[groundId] = ZERO;

  const vsourceCurrents: Record<string, Complex> = {};
  vsources.forEach((s, k) => {
    vsourceCurrents[s.id] = M[n + k][size];
  });
  // VCVS 전류도 vsourceCurrents에 함께 (id 키로 lookup 가능)
  vcvsList.forEach((s, kIdx) => {
    vsourceCurrents[s.id] = M[n + vsources.length + kIdx][size];
  });

  return { nodeVoltages, vsourceCurrents };
}

function magnitude(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im);
}
