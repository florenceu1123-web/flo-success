import type { DiodeClamperCircuitDiagram, DiodeClamperWaveformDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 다이오드 클램퍼(clamper) — 출력 파형의 상·하한 a·b 도출 (임용 2번 전자회로) 전용 archetype. GPT 없음.
 *
 *  (가) 고정 토폴로지 (원본 그대로):
 *      v_i ─ C(직렬) ─ 마디 A ─ [다이오드 + 바이어스 전지 V_B] ─ 접지
 *                        마디 A ─ R ─ 접지 (v_o = 마디 A 전압)
 *  (나) 파형 2단: 위 = v_i(V_H/V_L 사각파, 수치), 아래 = v_o(상한 a·하한 b — 학생이 구함)
 *   원본: C=1µF, R=100kΩ, V_B=−5V(전지 −단자가 위), 다이오드 애노드가 A, v_i = +10/−5V, 반주기 1ms.
 *
 * ★ 물리(이상 클램퍼): RC ≫ 주기이면 커패시터 전압 V_C는 한 주기 동안 거의 일정하다.
 *   · 다이오드 애노드가 A("down") → 마디 A는 **V_B를 넘지 못한다**(상한 클램프):
 *       도통 시 v_A = V_B → V_C = V_H − V_B,  **a = V_B**,  **b = V_L − (V_H − V_B)**
 *   · 다이오드 캐소드가 A("up") → 마디 A는 **V_B 아래로 못 내려간다**(하한 클램프):
 *       **b = V_B**,  **a = V_H − (V_L − V_B)**
 *   어느 쪽이든 **a − b = V_H − V_L** (파형 모양은 그대로, 위치만 이동) — 검산에 쓴다.
 *   원본 검산: V_H=10, V_L=−5, V_B=−5 → **a = −5V**, V_C = 15V, **b = −20V** ✓ (a−b = 15 = V_H−V_L)
 *
 * ★ 왜 전용 archetype인가: 실측에서 generic 경로가 **다이오드를 통째로 떨어뜨리고**(C·V·R만 남음)
 *   파형도 무의미한 단일 스텝으로 냈다(사용자 신고). 클램퍼는 "다이오드 도통 구간 → 커패시터 충전 →
 *   전 파형 이동"이라는 비선형 동작이라 MNA 기반 generic 경로로는 재현할 수 없다.
 *
 * ★ 값은 예시 hardcode가 아니라 ★규칙 열거 + 정수 필터★ — 원본 튜플 제외.
 */

export type DiodeClamperGeneration = {
  values: {
    vH: number; vL: number; vB: number;      // 입력 상·하한, 바이어스(부호 포함) [V]
    cUf: number; rKohm: number; halfMs: number;
    dir: "down" | "up";                       // 다이오드 방향
    cLabel: string; rLabel: string; biasLabel: string;
  };
  answer: {
    a: number; b: number;                     // 출력 상·하한 [V]
    vC: number;                               // 커패시터 전압 [V]
    tauMs: number;                            // RC [ms] (≫ 주기 확인용)
    clampSide: "upper" | "lower";
  };
  circuitDiagram: DiodeClamperCircuitDiagram;
  waveformDiagram: DiodeClamperWaveformDiagram;
};

type Family = { vH: number; vL: number; vB: number; cUf: number; rKohm: number; halfMs: number; dir: "down" | "up" };

// 원본 튜플 (참조·검증 전용, 생성 풀 제외).
const ORIGINAL: Family = { vH: 10, vL: -5, vB: -5, cUf: 1, rKohm: 100, halfMs: 1, dir: "down" };

function solve(f: Family): DiodeClamperGeneration {
  const { vH, vL, vB, cUf, rKohm, halfMs, dir } = f;
  // 상한 클램프(down): a = V_B, 하한 클램프(up): b = V_B. 진폭(V_H−V_L)은 보존된다.
  const span = vH - vL;
  const a = dir === "down" ? vB : vB + span;
  const b = dir === "down" ? vB - span : vB;
  const vC = vH - a;                       // V_C = v_i(도통 시) − v_A
  const tauMs = rKohm * cUf;               // kΩ × µF = ms

  const sign = (x: number) => (x < 0 ? "-" : "+");
  const circuitDiagram: DiodeClamperCircuitDiagram = {
    cLabel: `${cUf}[µF]`,
    rLabel: `${rKohm}[kΩ]`,
    biasLabel: `${Math.abs(vB)}[V]`,
    diodeDir: dir,
    // 전지 위쪽 단자 극성: 마디 쪽 기준 전압이 V_B가 되도록 (V_B<0이면 −가 위)
    biasTopSign: sign(vB) === "-" ? "-" : "+",
    viLabel: "v_i", voLabel: "v_o",
  };
  const waveformDiagram: DiodeClamperWaveformDiagram = {
    vH, vL, shape: "sine", halfPeriodMs: halfMs, cycles: 2, aLabel: "a", bLabel: "b",
    aValue: a, bValue: b,   // 위치 계산 전용 — 라벨은 문자 a·b 그대로
  };

  return {
    values: {
      vH, vL, vB, cUf, rKohm, halfMs, dir,
      cLabel: circuitDiagram.cLabel, rLabel: circuitDiagram.rLabel, biasLabel: circuitDiagram.biasLabel,
    },
    answer: { a, b, vC, tauMs, clampSide: dir === "down" ? "upper" : "lower" },
    circuitDiagram, waveformDiagram,
  };
}

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *   · a·b 정수, |b| ≤ 40, a ≠ b
 *   · RC ≥ 20×주기 (이상 클램퍼 근사가 성립해야 문제가 성립)
 *   · V_H > 0 > V_L (원본처럼 양·음을 오가는 입력)
 *   · 원본 튜플 제외
 */
function buildSpace(dir: "down" | "up"): Family[] {
  const out: Family[] = [];
  // ★ 입력은 **정현파**(사용자 지정 2026-08-02) — 직류 성분 없는 대칭파 ±V_m.
  //   진폭 V_m이면 첨두치 간 진폭이 2V_m이고, 출력은 그 파형이 그대로 이동한다.
  for (const vH of [2, 3, 4, 5, 6, 8, 10, 12])
    for (const vL of [-vH])
      for (const vB of [-10, -8, -6, -5, -4, -2, 0, 2, 4, 5])
        for (const [cUf, rKohm] of [[0.1, 470], [0.47, 100], [1, 100], [1, 200], [2.2, 47]] as Array<[number, number]>)
          for (const halfMs of [0.5, 1, 2]) {
            if (rKohm * cUf < 20 * (2 * halfMs)) continue;     // RC ≫ 주기
            if (!Number.isInteger(rKohm * cUf)) continue;      // RC가 정수[ms] — 풀이에 103.4 같은 값이 안 나오게
            const f: Family = { vH, vL, vB, cUf, rKohm, halfMs, dir };
            const a = solve(f).answer;
            if (!Number.isInteger(a.a) || !Number.isInteger(a.b)) continue;
            if (Math.abs(a.b) > 40 || Math.abs(a.a) > 40) continue;
            if (a.a === a.b) continue;
            if (
              dir === ORIGINAL.dir && vH === ORIGINAL.vH && vL === ORIGINAL.vL && vB === ORIGINAL.vB &&
              cUf === ORIGINAL.cUf && rKohm === ORIGINAL.rKohm && halfMs === ORIGINAL.halfMs
            ) continue;                                        // 원본 튜플 제외
            out.push(f);
          }
  return out;
}
const SPACE_DOWN = buildSpace("down");
const SPACE_UP = buildSpace("up");

/**
 * exam_similar = 원본과 같은 **상한 클램프**(다이오드 애노드가 마디 A) — 수치만 변경.
 * exam_variant = **다이오드 방향 반전**(하한 클램프) — 소자 종류가 아니라 **방향** 교환.
 *   같은 절차(도통 구간 → V_C → 전 파형 이동)로 풀지만 a·b의 결정 순서가 뒤바뀐다.
 */
export function generateDiodeClamper(args: { seed?: number; mode: GenerationMode }): DiodeClamperGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const pool = args.mode === "exam_variant" ? SPACE_UP : SPACE_DOWN;
  return solve(pick(pool.length ? pool : SPACE_DOWN, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalDiodeClamperForVerify(): DiodeClamperGeneration {
  return solve(ORIGINAL);
}
/** 스모크용 — 생성 풀 크기. */
export function __diodeClamperPoolSizes(): { down: number; up: number } {
  return { down: SPACE_DOWN.length, up: SPACE_UP.length };
}
