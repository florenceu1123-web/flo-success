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

import type { CircuitTypeParams, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/** 측정 변수 모드 — RC: v_o(t) [V], RL: i_o(t) [A]. */
export type TheveninSwitchedMode = "RC" | "RL";

export type TheveninSwitchedRcGeneration = {
  /** "RC" (exam_similar 기본) 또는 "RL" (exam_variant — 2 캐패시터를 2 인덕터로 교체). */
  componentMode: TheveninSwitchedMode;
  /** 변형 수치 (값만, 단위는 displayUnit·라벨에 추가). */
  values: {
    V_s: number;        // 좌측 DC 전압원 (V)
    R_top: number;      // V_s와 SW 사이 직렬 저항 (Ω)
    /** RC 모드: 측정 캐패시터 [F] / RL 모드: 측정 인덕터 [H]. */
    C_1: number;
    /** RC 모드: 보조 캐패시터 [F] / RL 모드: 보조 인덕터 [H]. */
    C_2: number;
    R_a: number;
    R_b: number;
    R_c: number;
    I_s: number;
  };
  /** 솔버 결과. RC면 v_o(t), RL이면 i_o(t)가 측정 변수. */
  answer: {
    /** RC: v_o(0⁻) = V_s·α [V] / RL: i_o(0⁻) = V_s/R_top [A] */
    v_o_0minus: number;
    V_Th: number;          // [단계 2] Thevenin 전압 [V]
    R_Th: number;          // [단계 2] Thevenin 저항 [Ω]
    /** RC: v_o(∞) = V_Th / RL: i_o(∞) = V_Th/R_Th */
    v_o_inf: number;
    /** τ = R_Th·C_1 (RC) 또는 L_1/R_Th (RL) [sec]. */
    tau: number;
    /** RC: C_1 [F] / RL: L_1 [H]. 라벨용 등가값. */
    C_eq: number;
    /** v_o(t) (RC) 또는 i_o(t) (RL) 표현식 문자열. */
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
  /** GenerationMode — exam_variant이면 2 capacitor를 2 inductor로 swap (RL transient). */
  mode?: GenerationMode;
}): TheveninSwitchedRcGeneration {
  const rand = makeRand(args.seed);
  const componentMode: TheveninSwitchedMode = args.mode === "exam_variant" ? "RL" : "RC";

  // 변형 수치 — 원본 임용 9번: V_s=10, R_top=1, C_1=0.1, C_2=0.4, R_a=2, R_b=4, R_c=2, I_s=4
  //   RL 모드는 C 값 대신 L 값 (H 단위, 0.1~1H 범위)
  const V_s = pick([10, 12, 15], rand);
  const R_top = pick([1, 2], rand);
  const C_1 = componentMode === "RL" ? pick([0.1, 0.2, 0.5, 1.0], rand) : pick([0.1, 0.2, 0.5], rand);
  const C_2 = componentMode === "RL" ? pick([0.2, 0.5, 1.0], rand) : pick([0.2, 0.4, 0.5], rand);
  const R_a = pick([2, 3, 4], rand);
  const R_b = pick([4, 5, 6], rand);
  const R_c = pick([2, 3], rand);
  const I_s = pick([2, 4, 5], rand);

  // Thevenin 계산 (점선박스 내부 — 사용자 피드백 #21 토폴로지):
  //   b = R_b 좌측 vertical top
  //   n_mid = R_c 가운데 vertical top (= I_s top)
  //   R_a = b ↔ n_mid 사이 horizontal (top bridge)
  //   R_b vertical: b → GND
  //   R_c vertical: n_mid → GND
  //   I_s vertical: GND → n_mid (current up)
  //
  //   R_Th (b에서 보는 등가저항, I_s OFF=open):
  //     R_Th = R_b || (R_a + R_c)
  //   V_Th (b open-circuit voltage):
  //     V_nmid = I_s · ((R_a + R_b) || R_c)
  //     V_b = V_nmid · R_b / (R_a + R_b)  (전압분배)
  //     단순 정리: V_Th = I_s · R_b · R_c / (R_a + R_b + R_c)
  const R_Th_raw = parallel(R_b, R_a + R_c);
  const V_Th_raw = (I_s * R_b * R_c) / (R_a + R_b + R_c);

  // ─── 동역학 분석 — componentMode 따라 RC vs RL 분기 ─────────────────
  let v_o_0minus: number, v_o_inf: number, tau_raw: number, C_eq_value: number, A: number;
  let v_o_t_expr: string;

  if (componentMode === "RL") {
    // RL 변형: C_1 → L_1, C_2 → L_2.
    //   t<0 SS (SW=단자1): closed loop V_s → R_top → SW → L_1 → GND → L_2 → V_s.
    //     At DC SS, L_1·L_2 모두 short. Loop current i = V_s / R_top.
    //     → i_L1(0⁻) = V_s / R_top.
    //   t=0 SW=단자2: L_1이 Thevenin과 closed loop (R_top측 분리).
    //     i_L1 연속. t→∞: i_L1(∞) = V_Th / R_Th.
    //   τ = L_1 / R_Th. (L_2는 SW로 분리되어 동역학 무관, current frozen)
    v_o_0minus = V_s / R_top;        // i_L1(0⁻) [A]
    v_o_inf = V_Th_raw / R_Th_raw;   // i_L1(∞) [A]
    tau_raw = C_1 / R_Th_raw;         // C_1은 RL 모드에서 L_1 [H]
    C_eq_value = C_1;                 // = L_1
    A = trunc3(v_o_0minus - v_o_inf);
    v_o_t_expr = `${trunc3(v_o_inf)} + (${A})·exp(-t/${trunc3(tau_raw)})`;
  } else {
    // RC 기본 (exam_similar): V_s + C_2 직렬, C_1 단독.
    //   t<0 SS (SW=단자1): closed loop, no current. KVL: V_s = V_C1 + V_C2.
    //     Same charge: V_C1/V_C2 = C_2/C_1 → V_C1 = V_s · C_2/(C_1+C_2)
    //   t≥0 SW=단자2: V_s+C_2 분리. C_1만 Thevenin과 loop.
    //     v_o(∞) = V_Th. τ = R_Th · C_1.
    const alpha_ratio = C_2 / (C_1 + C_2);
    v_o_0minus = V_s * alpha_ratio;
    v_o_inf = V_Th_raw;
    tau_raw = R_Th_raw * C_1;
    C_eq_value = C_1;
    A = trunc3(v_o_0minus - v_o_inf);
    v_o_t_expr = `${trunc3(v_o_inf)} + (${A})·exp(-t/${trunc3(tau_raw)})`;
  }
  const C_eq_series = C_eq_value;

  return {
    componentMode,
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
