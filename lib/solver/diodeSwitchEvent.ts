/**
 * Switch event orchestrator — t=0에 토폴로지 전환되는 PWL 회로의 시뮬레이션.
 *
 * 임용 6번 형식 회로의 핵심: SW가 단자1↔단자2로 전환되며 effective 회로가 달라짐.
 *   t < 0 : 회로 A (정상상태 도달까지 시뮬레이션)
 *   t ≥ 0 : 회로 B (회로 A의 마지막 V_C 상태를 초기조건으로 사용)
 *
 * 구현:
 *   1. preSwitch 시뮬을 `preSwitchPeriods` 주기 동안 실행 (t = -N·T → 0)
 *   2. 마지막 step의 V_C(t=0⁻)를 추출하여 postSwitch 시뮬의 capacitor V0로 전달
 *   3. postSwitch 시뮬을 `postSwitchPeriods` 주기 동안 실행 (t = 0 → M·T)
 *   4. 양쪽 시계열 concat + sample helper 제공
 *
 * 시간영역 sample helper:
 *   - sampleNodeAt(samples, nodeId, t)        : 특정 시점 보간(linear)
 *   - findExtremesInRange(samples, ..., t1,t2): 구간 min/max + 발생 시점
 *
 * Phase 3 deliverable. Phase 4(renderer)·Phase 5(pipeline+textWriter)는 별도.
 */

import {
  simulateTimeStepPwl,
  type TimeStepSample,
  type TimeVaryingVSource,
  type CapacitorBranch,
  type TimeStepPwlOptions,
} from "./diodeTimeStepPwl";
import type { DiodeBranch } from "./diodeMnaPwl";
import type { SolverNetwork } from "./mna";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/solver/diodeSwitchEvent");

/** 한 구간(switch state)에 해당하는 회로 묶음. */
export type CircuitPhase = {
  baseNet: SolverNetwork;
  vSourcesTimeVarying?: TimeVaryingVSource[];
  capacitors?: CapacitorBranch[];
  diodes?: DiodeBranch[];
};

export type SwitchEventSimArgs = {
  /** t<0 회로 — SW가 단자2(또는 초기 위치)에 있을 때. */
  preSwitch: CircuitPhase;
  /** t≥0 회로 — SW 토글 후. capacitors의 V0는 무시(자동으로 preSwitch 종료 V_C 사용). */
  postSwitch: CircuitPhase;
  /** 한 주기 T (sec). */
  T: number;
  /** t<0 정상상태 도달용 periods (기본 10). */
  preSwitchPeriods?: number;
  /** t≥0 시뮬 periods (기본 5). */
  postSwitchPeriods?: number;
  /** step 크기 (sec). 기본 T/200. */
  dt?: number;
  /** sample stride. 기본 1. */
  sampleEvery?: number;
  /** PWL 솔버 허용오차. */
  eps?: number;
};

export type SwitchEventSimResult = {
  /** t<0 sample 시계열. */
  preSwitchSamples: TimeStepSample[];
  /** t≥0 sample 시계열. */
  postSwitchSamples: TimeStepSample[];
  /** 양쪽 concat (시간 순서). */
  allSamples: TimeStepSample[];
  /** preSwitch 종료(=t=0⁻) 시점의 V_C (postSwitch 초기조건으로 사용된 값). */
  preSwitchFinalCapVoltages: Record<string, number>;
};

/** preSwitch + postSwitch 시뮬레이션을 이어붙여 실행. */
export function simulateSwitchEvent(args: SwitchEventSimArgs): SwitchEventSimResult {
  const { preSwitch, postSwitch, T } = args;
  const preSwitchPeriods = args.preSwitchPeriods ?? 10;
  const postSwitchPeriods = args.postSwitchPeriods ?? 5;
  const dt = args.dt ?? T / 200;
  const sampleEvery = args.sampleEvery ?? 1;

  // 1. preSwitch (t = -preSwitchPeriods·T → 0)
  const preSamples = simulateTimeStepPwl({
    baseNet: preSwitch.baseNet,
    vSourcesTimeVarying: preSwitch.vSourcesTimeVarying,
    capacitors: preSwitch.capacitors,
    diodes: preSwitch.diodes,
    options: {
      tStart: -preSwitchPeriods * T,
      tEnd: 0,
      dt,
      sampleEvery,
      eps: args.eps,
    },
  });

  // 2. preSwitch 마지막 step의 V_C 추출 → postSwitch 초기조건
  const lastPreSample = preSamples[preSamples.length - 1];
  const preFinalVc = lastPreSample ? { ...lastPreSample.capacitorVoltages } : {};
  log.info("switch_event_handoff", { preFinalVc });

  // postSwitch capacitor 목록에 V0 주입 (preSwitch 최종값으로). 매칭 안되면 0 유지.
  const postCapacitorsWithInit: CapacitorBranch[] = (postSwitch.capacitors ?? []).map((c) => ({
    ...c,
    V0: preFinalVc[c.id] ?? c.V0 ?? 0,
  }));

  // 3. postSwitch (t = 0 → postSwitchPeriods·T)
  const postSamples = simulateTimeStepPwl({
    baseNet: postSwitch.baseNet,
    vSourcesTimeVarying: postSwitch.vSourcesTimeVarying,
    capacitors: postCapacitorsWithInit,
    diodes: postSwitch.diodes,
    options: {
      tStart: 0,
      tEnd: postSwitchPeriods * T,
      dt,
      sampleEvery,
      eps: args.eps,
    },
  });

  return {
    preSwitchSamples: preSamples,
    postSwitchSamples: postSamples,
    allSamples: [...preSamples, ...postSamples],
    preSwitchFinalCapVoltages: preFinalVc,
  };
}

// ─────────────────────────────────────────────────────────────────
// 시간영역 sample helper
// ─────────────────────────────────────────────────────────────────

/**
 * 특정 시점 t에서 노드 전압을 linear 보간으로 추출.
 * t가 sample 범위 밖이면 가장 가까운 끝값.
 */
export function sampleNodeAt(
  samples: TimeStepSample[],
  nodeId: string,
  t: number,
): number {
  if (samples.length === 0) throw new Error("sampleNodeAt: empty samples");
  // binary search로 t를 둘러싼 두 sample 찾기
  let lo = 0, hi = samples.length - 1;
  if (t <= samples[lo].t) return samples[lo].nodeVoltages[nodeId] ?? 0;
  if (t >= samples[hi].t) return samples[hi].nodeVoltages[nodeId] ?? 0;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const sL = samples[lo], sH = samples[hi];
  const vL = sL.nodeVoltages[nodeId] ?? 0;
  const vH = sH.nodeVoltages[nodeId] ?? 0;
  const dt = sH.t - sL.t;
  if (dt <= 0) return vL;
  const alpha = (t - sL.t) / dt;
  return vL + alpha * (vH - vL);
}

/** 구간 [t1, t2]에서 노드 전압의 min/max + 발생 시점. */
export function findExtremesInRange(
  samples: TimeStepSample[],
  nodeId: string,
  t1: number,
  t2: number,
): { min: number; minAt: number; max: number; maxAt: number } {
  let min = Infinity, max = -Infinity;
  let minAt = NaN, maxAt = NaN;
  for (const s of samples) {
    if (s.t < t1 || s.t > t2) continue;
    const v = s.nodeVoltages[nodeId];
    if (typeof v !== "number") continue;
    if (v < min) { min = v; minAt = s.t; }
    if (v > max) { max = v; maxAt = s.t; }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`findExtremesInRange: no samples for node "${nodeId}" in [${t1}, ${t2}]`);
  }
  return { min, minAt, max, maxAt };
}

/**
 * 임용 6번 형식 3단계 답 추출 helper.
 *
 *   단계 1: V_o(T/2) — switch 이후 반주기 시점
 *   단계 2: V_o(T)   — switch 이후 한 주기
 *   단계 3: V_o min/max for t ∈ [(M-1)·T, M·T] (마지막 주기 = 정상상태 가정)
 *
 * @param postSwitchSamples  simulateSwitchEvent의 postSwitchSamples
 * @param outputNode         V_o 노드 id (예: "v_out")
 * @param T                  주기
 * @param postSwitchPeriods  postSwitch 시뮬레이션 주기 수 (마지막 주기 정상상태로 가정)
 */
export function extractImyong6Answers(
  postSwitchSamples: TimeStepSample[],
  outputNode: string,
  T: number,
  postSwitchPeriods: number,
): {
  step1_Vo_at_halfT: number;
  step2_Vo_at_T: number;
  step3_Vo_min: number;
  step3_Vo_max: number;
  step3_Vo_minAt: number;
  step3_Vo_maxAt: number;
} {
  const step1 = sampleNodeAt(postSwitchSamples, outputNode, T / 2);
  const step2 = sampleNodeAt(postSwitchSamples, outputNode, T);
  const lastPeriodStart = (postSwitchPeriods - 1) * T;
  const lastPeriodEnd = postSwitchPeriods * T;
  const ext = findExtremesInRange(postSwitchSamples, outputNode, lastPeriodStart, lastPeriodEnd);
  return {
    step1_Vo_at_halfT: step1,
    step2_Vo_at_T: step2,
    step3_Vo_min: ext.min,
    step3_Vo_max: ext.max,
    step3_Vo_minAt: ext.minAt,
    step3_Vo_maxAt: ext.maxAt,
  };
}
