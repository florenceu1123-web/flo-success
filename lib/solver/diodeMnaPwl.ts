/**
 * Piecewise-linear DC solver — 이상적 다이오드 + MNA.
 *
 * 이상적 다이오드 모델 (V_F = 0):
 *   - ON state: V(anode) - V(cathode) = 0 (단락), I_D ≥ 0 (anode→cathode 양방향)
 *   - OFF state: I_D = 0 (개방), V(anode) - V(cathode) ≤ 0 (역바이어스)
 *
 * Algorithm: mode enumeration (brute force 2^N).
 *   for mask = 0 to 2^N - 1:
 *     1. mask bit k=1 → diode k가 ON (V=0 vsource로 대체) / 0 → OFF (개방, 제거)
 *     2. modified SolverNetwork로 solveMNA
 *     3. consistency 검사:
 *        - ON 다이오드: vsource current (a→b) ≥ -eps
 *        - OFF 다이오드: V(anode) - V(cathode) ≤ +eps
 *     4. 일관된 mode 첫 발견 시 반환
 *
 * 한계:
 *   - 2^N modes: N≤10 권장 (1024 modes)
 *   - DC 정상상태만 (AC/transient는 별도, capacitor 정상상태는 open으로 미리 변환 필요)
 *   - 다중 consistent mode 가능성은 무시 (회로가 잘 정의되면 unique)
 *
 * Phase 2a deliverable. Phase 2b는 AC/시간영역 sample point별 PWL.
 */

import { solveMNA, type SolverNetwork, type SolverResult } from "./mna";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/solver/diodeMnaPwl");

/** 이상적 다이오드 branch. anode → cathode (forward 방향). */
export type DiodeBranch = {
  id: string;
  anode: string;
  cathode: string;
};

export type DiodeState = "ON" | "OFF";

export type DiodePwlResult = SolverResult & {
  /** 각 다이오드의 결정된 상태. */
  diodeStates: Record<string, DiodeState>;
  /** 각 다이오드를 흐르는 전류 (anode→cathode 양수). OFF면 0. */
  diodeCurrents: Record<string, number>;
  /** 어느 mode mask로 풀렸는지 (디버깅용). bit k=1 → diode k가 ON. */
  modeMask: number;
};

export type DiodePwlOptions = {
  /** 수치 허용오차 (전류 ≥ -eps, 전압 ≤ +eps). 기본 1e-9. */
  eps?: number;
  /** singular matrix 만나면 mode skip (true) vs throw (false). 기본 true. */
  skipSingular?: boolean;
};

/**
 * 다이오드 포함 DC 회로 풀이.
 *
 * @param baseNet  다이오드 제외한 선형 회로 (R/V/I/VCCS/VCVS/OPAMP). 다이오드 노드는 이미 baseNet.nodeIds에 포함되어야.
 * @param diodes   다이오드 branch 목록 (anode·cathode 노드는 baseNet 노드 또는 ground)
 */
export function solveDiodePwlDc(
  baseNet: SolverNetwork,
  diodes: DiodeBranch[],
  opts: DiodePwlOptions = {},
): DiodePwlResult {
  const eps = opts.eps ?? 1e-9;
  const skipSingular = opts.skipSingular ?? true;
  const N = diodes.length;

  if (N === 0) {
    const res = solveMNA(baseNet);
    return { ...res, diodeStates: {}, diodeCurrents: {}, modeMask: 0 };
  }

  if (N > 12) {
    log.warn("large_diode_count", { N, hint: "2^N modes — N>12면 분할 권장" });
  }

  const totalModes = 1 << N;
  let lastError: unknown = null;

  for (let mask = 0; mask < totalModes; mask++) {
    try {
      const result = trySolveMode(baseNet, diodes, mask, eps);
      if (result) {
        log.info("mode_found", {
          mask,
          maskBinary: mask.toString(2).padStart(N, "0"),
          states: result.diodeStates,
        });
        return result;
      }
    } catch (e) {
      lastError = e;
      if (!skipSingular) throw e;
      // singular matrix → 이 mode는 회로가 underdetermined. skip.
    }
  }

  throw new Error(
    `solveDiodePwlDc: ${totalModes} mode 모두 비일관(또는 singular). ` +
      `다이오드 ${N}개, 마지막 에러: ${String(lastError)}`,
  );
}

/**
 * 주어진 mode mask로 회로 변형 + 풀이 + consistency 검사.
 * 반환: consistent하면 DiodePwlResult, 아니면 null.
 */
function trySolveMode(
  baseNet: SolverNetwork,
  diodes: DiodeBranch[],
  mask: number,
  eps: number,
): DiodePwlResult | null {
  // 변형 netlist 구성 — base 복사 후 ON 다이오드를 V=0 vsource로 추가
  const onDiodes: DiodeBranch[] = [];
  const offDiodes: DiodeBranch[] = [];
  for (let k = 0; k < diodes.length; k++) {
    if ((mask >> k) & 1) onDiodes.push(diodes[k]);
    else offDiodes.push(diodes[k]);
  }

  const modifiedNet: SolverNetwork = {
    ...baseNet,
    vsources: [
      ...baseNet.vsources,
      ...onDiodes.map((d) => ({ id: `__diode_${d.id}`, a: d.anode, b: d.cathode, V: 0 })),
    ],
  };

  const res = solveMNA(modifiedNet);

  // ON 다이오드 consistency: forward current(anode→cathode) ≥ 0.
  //   MNA vsource convention: vsourceCurrents[id]는 a 노드로 들어오는 전류(I into a). 우리는 a=anode로 설정했으므로
  //   I_vs > 0이면 anode로 전류 유입 = anode에서 외부 회로로 흐름 = diode 내부는 cathode→anode 방향(역방향).
  //   따라서 forward(anode→cathode) = -I_vs.
  const diodeStates: Record<string, DiodeState> = {};
  const diodeCurrents: Record<string, number> = {};
  for (const d of onDiodes) {
    const I_vs = res.vsourceCurrents[`__diode_${d.id}`] ?? 0;
    const I_forward = -I_vs;
    if (I_forward < -eps) return null;  // forward < 0 → 역방향 전류 → ON 가정 위반
    diodeStates[d.id] = "ON";
    diodeCurrents[d.id] = I_forward;
  }
  // OFF 다이오드: V(anode) - V(cathode) ≤ +eps
  for (const d of offDiodes) {
    const V_a = res.nodeVoltages[d.anode] ?? 0;
    const V_c = res.nodeVoltages[d.cathode] ?? 0;
    if (V_a - V_c > eps) return null;  // 순방향 바이어스인데 OFF → 위반
    diodeStates[d.id] = "OFF";
    diodeCurrents[d.id] = 0;
  }

  // 결과에서 __diode_* vsource 전류는 외부에 노출 안 함 (내부 marker)
  const cleanVsourceCurrents: Record<string, number> = {};
  for (const [id, I] of Object.entries(res.vsourceCurrents)) {
    if (!id.startsWith("__diode_")) cleanVsourceCurrents[id] = I;
  }

  return {
    nodeVoltages: res.nodeVoltages,
    vsourceCurrents: cleanVsourceCurrents,
    diodeStates,
    diodeCurrents,
    modeMask: mask,
  };
}
