/**
 * Time-step PWL transient simulator — 다이오드 + 콘덴서 + 시변 V source.
 *
 * Backward Euler discretization:
 *   I_C(t) = C·dV_C/dt ≈ C·(V_C(t) - V_C(t-Δt))/Δt = G_C·V_C(t) - G_C·V_C(t-Δt)
 *   여기서 G_C = C/Δt.
 *
 * Companion model:
 *   - 저항 R_eq = 1/G_C = Δt/C 를 a-b 사이에 추가
 *   - 전류원 I_eq = G_C·V_C(t-Δt) 를 b→a 방향으로 추가
 *     (저항이 G_C·V_C(t)를 a→b로 흘리는 것에서 history term을 차감해야 하므로 반대 방향 전류원)
 *
 * Each time step:
 *   1. 시변 V source의 V(t) 계산 → vsources에 추가
 *   2. 콘덴서의 companion 저항·전류원 추가 (V_C 이전 값 기준)
 *   3. solveDiodePwlDc로 mode + node voltage 결정
 *   4. V_C(t) = V(a) - V(b) 갱신
 *
 * 한계:
 *   - 1차 backward Euler (수렴성 보장, 정확도는 dt 의존). 더 정확하면 trapezoidal로 후속.
 *   - 다이오드 mode 변경 시점은 step boundary로 quantize (zero-crossing exact bisection 미적용).
 *   - inductor 미지원 (Phase 2 범위 외)
 *
 * Phase 2b deliverable. switch event(t=0 토글)는 vSourcesTimeVarying·options 활용 시
 * 호출 측에서 두 구간 시뮬을 이어붙이는 방식으로 처리 가능 (Phase 3).
 */

import { solveDiodePwlDc, type DiodeBranch, type DiodeState } from "./diodeMnaPwl";
import type { SolverNetwork } from "./mna";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/solver/diodeTimeStepPwl");

/** 시변 전압원 — V(t) 함수로 명시. id·a·b는 NMA vsource와 동일 의미. */
export type TimeVaryingVSource = {
  id: string;
  a: string;
  b: string;
  vFunc: (t: number) => number;
};

/** 콘덴서 branch — V_C = V(a) - V(b). C는 farad. V0는 초기 V_C (생략 시 0). */
export type CapacitorBranch = {
  id: string;
  a: string;
  b: string;
  C: number;
  V0?: number;
};

export type TimeStepSample = {
  t: number;
  nodeVoltages: Record<string, number>;
  diodeStates: Record<string, DiodeState>;
  diodeCurrents: Record<string, number>;
  capacitorVoltages: Record<string, number>;
  modeMask: number;
};

export type TimeStepPwlOptions = {
  tStart: number;
  tEnd: number;
  dt: number;
  /** 솔버 수치 허용오차 (solveDiodePwlDc에 전달). */
  eps?: number;
  /** 결과 sample 간격 (dt의 정수배). 기본 1 = 모든 step 저장. */
  sampleEvery?: number;
};

/**
 * Time-step transient 시뮬레이션.
 *
 * @param baseNet  정적 부분 (저항, OPAMP, 종속소스 등). 시변 V source와 콘덴서는 args의 별도 필드.
 * @param vSourcesTimeVarying  시변 V source 목록
 * @param capacitors  콘덴서 목록
 * @param diodes  이상적 다이오드 목록
 * @param options  시간 범위·step·sample 옵션
 */
export function simulateTimeStepPwl(args: {
  baseNet: SolverNetwork;
  vSourcesTimeVarying?: TimeVaryingVSource[];
  capacitors?: CapacitorBranch[];
  diodes?: DiodeBranch[];
  options: TimeStepPwlOptions;
}): TimeStepSample[] {
  const { baseNet, options } = args;
  const vSourcesTV = args.vSourcesTimeVarying ?? [];
  const capacitors = args.capacitors ?? [];
  const diodes = args.diodes ?? [];
  const { tStart, tEnd, dt } = options;
  const sampleEvery = options.sampleEvery ?? 1;
  if (dt <= 0) throw new Error("dt must be positive");
  if (tEnd < tStart) throw new Error("tEnd must be ≥ tStart");

  // V_C 상태 초기화
  const V_C: Record<string, number> = {};
  for (const c of capacitors) V_C[c.id] = c.V0 ?? 0;

  const samples: TimeStepSample[] = [];
  const totalSteps = Math.floor((tEnd - tStart) / dt) + 1;
  log.info("start", { tStart, tEnd, dt, totalSteps, capacitors: capacitors.length, diodes: diodes.length });

  for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
    const t = tStart + stepIdx * dt;

    // 시변 V source 인스턴스화
    const vsAtT = vSourcesTV.map((vs) => ({ id: vs.id, a: vs.a, b: vs.b, V: vs.vFunc(t) }));

    // 콘덴서 companion model 추가
    const capCompanionResistors: SolverNetwork["resistors"] = [];
    const capCompanionISources: SolverNetwork["isources"] = [];
    for (const c of capacitors) {
      const G_C = c.C / dt;
      const R_eq = 1 / G_C;
      const V_C_prev = V_C[c.id] ?? 0;
      const I_eq = G_C * V_C_prev;
      capCompanionResistors.push({ id: `__cap_R_${c.id}`, a: c.a, b: c.b, R: R_eq });
      // history 전류원은 b→a 방향. our isource type: a=source(전류 나가는 곳), b=sink.
      //   b→a 방향 = source 노드는 c.b, sink 노드는 c.a
      capCompanionISources.push({ id: `__cap_I_${c.id}`, a: c.b, b: c.a, I: I_eq });
    }

    // step-specific SolverNetwork 구성
    const stepNet: SolverNetwork = {
      ...baseNet,
      resistors: [...baseNet.resistors, ...capCompanionResistors],
      vsources: [...baseNet.vsources, ...vsAtT],
      isources: [...baseNet.isources, ...capCompanionISources],
    };

    const res = solveDiodePwlDc(stepNet, diodes, { eps: options.eps });

    // 콘덴서 V 갱신
    const newCapVoltages: Record<string, number> = {};
    for (const c of capacitors) {
      const newV_C = (res.nodeVoltages[c.a] ?? 0) - (res.nodeVoltages[c.b] ?? 0);
      newCapVoltages[c.id] = newV_C;
      V_C[c.id] = newV_C;
    }

    if (stepIdx % sampleEvery === 0 || stepIdx === totalSteps - 1) {
      samples.push({
        t,
        nodeVoltages: { ...res.nodeVoltages },
        diodeStates: { ...res.diodeStates },
        diodeCurrents: { ...res.diodeCurrents },
        capacitorVoltages: newCapVoltages,
        modeMask: res.modeMask,
      });
    }
  }

  log.info("done", { samples: samples.length });
  return samples;
}
