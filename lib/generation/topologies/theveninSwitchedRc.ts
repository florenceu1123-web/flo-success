/**
 * Thevenin + Switched RC generator (임용 9번 정보과 형식).
 *
 *  원본 토폴로지:
 *    좌측 RC + SW + 우측 점선박스 (Thevenin 대상)
 *
 *    V_s ──[R_top]──┬── SW(단자1↔단자2) ──┬── [점선박스: R_a, R_b, R_c, I_s]
 *                   │                       │
 *                  [C_1]                    │
 *                   │                       │
 *                  [C_2]                    │
 *                   │                       │
 *                  GND                     GND
 *
 *    v_o(t) = C_1 양단 전압
 *
 *  학생 풀이 3단계:
 *    [단계 1] t<0 (SW=단자1)에서 정상상태 → C_1 양단 전압 v_o(0⁻)
 *    [단계 2] (나) Thevenin 등가회로의 V_Th, R_Th
 *    [단계 3] t≥0 (SW=단자2 이동) → v_o(t) RC step response
 *
 *  Topology 가정 (renderer와 일치):
 *    - SW=단자1 (t<0): 좌측만 활성. V_s가 R_top를 통해 C_1·C_2 충전.
 *      DC 정상상태에서 i=0, v_o(0⁻) = V_s.
 *    - SW=단자2 (t≥0): 우측 점선박스가 연결됨. 좌측 V_s가 R_top + (Thevenin V_Th, R_Th)
 *      직렬 회로로 C 충전. v_o(∞) = V_s 또는 V_Th에 따라 결정.
 *      ★ 단순화: SW가 V_s를 끊고 우측 Thevenin만 연결한다고 가정 (전형적 imyong 패턴).
 *        v_o(∞) = V_Th, τ = R_Th · C_eq.
 *
 *  점선박스 내부 토폴로지 (Thevenin 대상):
 *    터미널 b → R_a (horizontal, top) → R_b (vertical, 중간 노드 → GND) → I_s (병렬, 위로 흐름)
 *    → R_c (terminal b's other parallel branch)
 *
 *    간단화: b에서 GND로 가는 두 병렬 가지
 *      가지 1: R_a + R_b 직렬
 *      가지 2: R_c (그리고 I_s가 GND→b 방향으로 흐름)
 *
 *    Thevenin (b ↔ GND):
 *      V_Th = open circuit voltage at b = I_s × (R_a + R_b) || R_c
 *      R_Th = (R_a + R_b) || R_c
 *
 *  C_eq = C_1 + C_2 (병렬).
 */

import type { CircuitTypeParams } from "@/types";
import { makeRand, pick } from "./_helpers";

export type TheveninSwitchedRcGeneration = {
  /** 변형 수치 (값만, 단위 V/Ω/F는 디스플레이 라벨에 추가). */
  values: {
    V_s: number;        // 좌측 DC 전압원 (V)
    R_top: number;      // V_s와 SW 사이 직렬 저항 (Ω)
    C_1: number;        // 측정 캐패시터 (F, 보통 0.1·0.2·0.4 같은 정수배)
    C_2: number;        // 보조 캐패시터 (F)
    R_a: number;        // 점선박스 horizontal top R (Ω)
    R_b: number;        // 점선박스 vertical R (Ω)
    R_c: number;        // 점선박스 우측 vertical R (Ω)
    I_s: number;        // 점선박스 전류원 (A)
  };
  /** 솔버 결과. */
  answer: {
    v_o_0minus: number;   // [단계 1] t<0 정상상태에서 v_o(0⁻) = V_s [V]
    V_Th: number;          // [단계 2] Thevenin 전압 [V]
    R_Th: number;          // [단계 2] Thevenin 저항 [Ω]
    v_o_inf: number;       // t→∞ v_o(∞) [V] (= V_Th, 좌측 분리 가정)
    tau: number;           // RC 시정수 τ = R_Th · C_eq [sec]
    C_eq: number;          // C_1 + C_2 [F]
    /** v_o(t) 표현식 문자열 — 예: "1.6 + 8.4·exp(-t/0.4)". */
    v_o_t_expr: string;
  };
};

/** 두 병렬 저항 합성. */
function parallel(R1: number, R2: number): number {
  return (R1 * R2) / (R1 + R2);
}

/** 소수점 셋째자리 절사 (임용 표기 규칙). */
function trunc3(x: number): number {
  return Math.trunc(x * 1000) / 1000;
}

export function generateTheveninSwitchedRc(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): TheveninSwitchedRcGeneration {
  const rand = makeRand(args.seed);

  // 변형 수치 — 원본 임용 9번: V_s=10, R_top=1, C_1=0.1, C_2=0.4, R_a=2, R_b=4, R_c=2, I_s=4
  const V_s = pick([10, 12, 15], rand);
  const R_top = pick([1, 2], rand);
  const C_1 = pick([0.1, 0.2, 0.5], rand);
  const C_2 = pick([0.2, 0.4, 0.5], rand);
  const R_a = pick([2, 3, 4], rand);
  const R_b = pick([4, 5, 6], rand);
  const R_c = pick([2, 3], rand);
  const I_s = pick([2, 4, 5], rand);

  // Thevenin 계산 (점선박스 내부)
  const R_series_branch = R_a + R_b;
  const R_Th_raw = parallel(R_c, R_series_branch);
  const V_Th_raw = I_s * R_Th_raw;

  // ─── 캐패시터 분석 (사용자 피드백 반영 final layout) ────────────────
  //   원본 (이미지 #20) 토폴로지:
  //     C_1: node a leg (V_a ↔ GND) — v_o(t) 측정 대상
  //     C_2: V_s 옆 별도 leg (V_s top rail ↔ GND), V_s에 parallel
  //   따라서 C_2는 V_s에 의해 항상 charged (V_C2 = V_s 일정), 동역학에 영향 없음.
  //   v_o(t) = V_C1 (node a 전압).
  //
  //   t<0 SS (SW=단자1, V_s 활성): V_s → R_top → SW → a → C_1. SS: v_o(0⁻) = V_s.
  //   t→∞ SS (SW=단자2, Thevenin 활성): a → Thevenin. v_o(∞) = V_Th.
  //   τ = R_Th · C_1 (C_2는 SW로 분리되어 R_Th와 무관)
  const C_eq_series = C_1;  // 동역학에 참여하는 cap = C_1만
  const tau_raw = R_Th_raw * C_1;
  const v_o_0minus = V_s;
  const v_o_inf = V_Th_raw;

  // v_o(t) = v_o(∞) + (v_o(0⁻) - v_o(∞)) · exp(-t/τ)
  const A = trunc3(v_o_0minus - v_o_inf);
  const v_o_t_expr = `${trunc3(v_o_inf)} + (${A})·exp(-t/${trunc3(tau_raw)})`;

  return {
    values: { V_s, R_top, C_1, C_2, R_a, R_b, R_c, I_s },
    answer: {
      v_o_0minus: trunc3(v_o_0minus),
      V_Th: trunc3(V_Th_raw),
      R_Th: trunc3(R_Th_raw),
      v_o_inf: trunc3(v_o_inf),
      tau: trunc3(tau_raw),
      C_eq: trunc3(C_eq_series),
      v_o_t_expr,
    },
  };
}
