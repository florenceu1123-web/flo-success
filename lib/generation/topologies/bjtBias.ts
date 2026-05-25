import type { CircuitComponent, CircuitNetlist, CircuitTypeParams, NodeAnnotation, MeasurementMark, LoadPlaceholder } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * BJT DC bias 회로 generator (임용 7번 형식).
 *
 * 회로:
 *   V_CC ━┳━ R_A ━┳━ R_C ━┳━ V_O (out)
 *         ┃       ┃       ┃
 *      R_A box   B(BJT)   ┃
 *         ┃       ┃       ┃
 *         ━━━━━━━ V_B    Vo
 *         ┃       ┃        ┃
 *         R_B    E(BJT)
 *         ┃       ┃
 *         GND    R_E ━━ GND
 *
 *  단계별 풀이:
 *   [단계 1] R_A=10kΩ, V_E=4.3V → V_B = V_E + 0.7 = 5.0V → 분압기로 R_B 도출.
 *   [단계 2] ρ·A·ℓ → R_A' = ρℓ/A.
 *   [단계 3] R_A를 R_A'으로 교체 → 새 V_B → I_C·V_O.
 */

export type BjtBiasSingleGeneration = {
  kind: "single";
  netlist: CircuitNetlist;
  /** 정답 (단계별 결과) */
  answer: {
    R_B_kohm: number;     // 단계 1
    R_A_prime_kohm: number; // 단계 2
    I_C_mA: number;       // 단계 3
    V_O: number;          // 단계 3
  };
  /** 입력 값 (해설 텍스트용) */
  values: {
    V_CC: number;          // 10V
    R_A_kohm: number;      // 10kΩ (단계 1에서 주어진)
    R_C_kohm: number;      // 1.5kΩ
    R_E_kohm: number;      // 1.8kΩ
    V_E_given: number;     // 4.3V (단계 1 주어진 이미터 전압)
    V_BE: number;          // 0.7V
    rho: number;           // 9e3 Ω·m
    A_m2: number;          // 3e-4 m²
    L_m: number;           // 1e-3 m
  };
};

/**
 * 다중 BJT (전류미러 + 차동증폭기) generation 결과.
 *
 *  토폴로지 (NPN 4-BJT, 임용 7번 형식):
 *    Q1 (mirror reference, diode-connected): C=B=V_M, E=V_2_node
 *    Q5 (mirror output):                     B=V_M, C=V_tail, E=V_2_node
 *    Q2 (diff pair, signal input):           C=V_C2, B=V_in1, E=V_tail
 *    Q3 (diff pair, reference input):        C=V_O, B=GND, E=V_tail
 *    R_1: VCC_top→V_M  /  R_2: VCC_top→V_C2  /  R_3: VCC_top→V_O
 *    V_CC: VCC_top→GND  /  V_2: V_2_node→GND  /  V_1: V_in1→GND
 *
 *  단계별 풀이:
 *    [단계 1] I_1 = (V_CC − V_2 − V_BE) / R_1  (Q1 diode-connected, V_E1=V_2)
 *    [단계 2] I_5 = I_1  (Q5 mirror, ratio 1:1) = 차동쌍 tail current
 *    [단계 3] balanced(V_1=0): I_3 = I_5/2, V_O = V_CC − I_3·R_3
 *             perturbed(V_1=-0.5): |ΔV_BE|≫4·V_T → diff pair fully switched, Q3가 tail 전체 carry
 *               → I_3 = I_5, V_O = V_CC − I_5·R_3
 */
export type BjtBiasMirrorDiffGeneration = {
  kind: "mirror_diff";
  netlist: CircuitNetlist;
  answer: {
    I_1_mA: number;         // 단계 1: R_1 reference 전류
    I_5_mA: number;         // 단계 2: mirror 출력 = tail
    I_3_balanced_mA: number;// 단계 3: V_1 = 0V (balanced)
    V_O_balanced: number;   // 단계 3: V_1 = 0V
    I_3_perturbed_mA: number; // 단계 3: V_1 = V_1_perturbed
    V_O_perturbed: number;  // 단계 3: V_1 = V_1_perturbed
  };
  values: {
    V_CC: number;           // 15V
    V_2: number;            // 3V (mirror 양 emitter 공통전원)
    R_1_kohm: number;       // 7kΩ
    R_2_kohm: number;       // 5kΩ
    R_3_kohm: number;       // 5kΩ
    V_BE: number;           // 0.7V
    beta: number;           // 100 (early 무시)
    V_1_initial: number;    // 0V (balanced)
    V_1_perturbed: number;  // -0.5V
    bjtCount: number;       // 인벤토리 hint
  };
};

export type BjtBiasGeneration = BjtBiasSingleGeneration | BjtBiasMirrorDiffGeneration;

export function generateBjtBias(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): BjtBiasGeneration {
  if (args.params?.multiBjtMirror) {
    return generateBjtCurrentMirrorDiffAmp(args);
  }
  const rand = makeRand(args.seed);

  // 임용 7번 default 값 (exam_similar 수치만 살짝 변형)
  const V_CC = pick([10, 12, 15], rand);
  const R_A_kohm = pick([10, 8, 15], rand);
  const R_C_kohm = pick([1.5, 2, 1.2], rand);
  const R_E_kohm = pick([1.8, 1.5, 2.2], rand);
  // V_E_given을 V_CC와 R_E 비율 기반으로 그럴듯하게 (이미터 전위가 V_CC의 30-50%)
  const V_E_given = Math.round((V_CC * 0.43 + (rand() - 0.5) * 0.4) * 10) / 10;
  const V_BE = 0.7;
  // 단계 2 저항률 값 (R_A_prime이 단계 1 R_A와 다른 크기로 유의미한 변화 주도록)
  const rho = pick([9e3, 6e3, 12e3], rand);
  const A_m2 = pick([3e-4, 4e-4, 2e-4], rand);
  const L_m = pick([1e-3, 1.5e-3, 0.8e-3], rand);

  // 단계 1: V_B = V_E + V_BE → 분압기 공식 (베이스 전류 0 가정) R_B/(R_A+R_B) = V_B/V_CC
  //   → R_B = R_A · V_B / (V_CC - V_B)
  const V_B = V_E_given + V_BE;
  const R_B_kohm = Math.round((R_A_kohm * V_B / (V_CC - V_B)) * 100) / 100;

  // 단계 2: R_A' = ρ·ℓ/A [Ω] → kΩ
  const R_A_prime_ohm = (rho * L_m) / A_m2;
  const R_A_prime_kohm = Math.round((R_A_prime_ohm / 1000) * 100) / 100;

  // 단계 3: R_A → R_A'. 새 V_B = V_CC · R_B / (R_A' + R_B). 새 V_E = V_B - V_BE.
  //   I_E ≈ I_C = V_E / R_E. V_O = V_CC - I_C · R_C.
  const newV_B = V_CC * R_B_kohm / (R_A_prime_kohm + R_B_kohm);
  const newV_E = newV_B - V_BE;
  const I_C_mA = Math.round((newV_E / R_E_kohm) * 100) / 100;
  const V_O = Math.round((V_CC - I_C_mA * R_C_kohm) * 100) / 100;

  // ─── netlist 구성 ───────────────────────────────────────────
  // V_CC: 좌측 vertical (top → GND)
  // R_A: 베이스 위 (top → V_B), placeholder 점선 박스로
  // R_B: V_B → GND vertical
  // R_C: top → V_C(=Vout, 컬렉터)
  // BJT: collector=V_C, base=V_B, emitter=V_E_node
  // R_E: V_E_node → GND
  const components: CircuitComponent[] = [
    {
      id: "V_CC",
      type: "V",
      value: `${V_CC}V`,
      pins: [
        { id: "p", node: "VCC_top", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    // R_A (placeholder로 점선 박스 표기되도록 별도. 일단 component로 두고 metadata.loadPlaceholders로 점선 강조)
    {
      id: "R_A",
      type: "R",
      value: `${R_A_kohm}kΩ`,
      pins: [
        { id: "p", node: "VCC_top", side: "top" },
        { id: "n", node: "V_B_node", side: "bottom" },
      ],
    },
    {
      id: "R_B",
      type: "R",
      value: `${R_B_kohm}kΩ`,
      pins: [
        { id: "p", node: "V_B_node", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "R_C",
      type: "R",
      value: `${R_C_kohm}kΩ`,
      pins: [
        { id: "p", node: "VCC_top", side: "top" },
        { id: "n", node: "V_C_node", side: "bottom" },
      ],
    },
    {
      id: "Q1",
      type: "BJT",
      pins: [
        { id: "c", node: "V_C_node", side: "top", role: "drain" },     // collector
        { id: "b", node: "V_B_node", side: "left", role: "gate" },     // base
        { id: "e", node: "V_E_node", side: "bottom", role: "source" }, // emitter
      ],
    },
    {
      id: "R_E",
      type: "R",
      value: `${R_E_kohm}kΩ`,
      pins: [
        { id: "p", node: "V_E_node", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "V_C_node", label: "V_O", style: "label_only" },
    { node: "V_E_node", label: "V_E", style: "label_only" },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["V_C_node", "GND"], label: "V_O" },
    { kind: "voltage", refs: ["V_E_node", "GND"], label: "V_E" },
    { kind: "current", refs: ["R_C"], label: "I_C" },
  ];

  // R_A를 점선 placeholder로 강조 (학생이 단계 2에서 R_A'으로 교체할 변수)
  const loadPlaceholders: LoadPlaceholder[] = [
    {
      betweenNodes: ["VCC_top", "V_B_node"],
      label: "R_A",
      emphasize: true,
    },
  ];

  const netlist: CircuitNetlist = {
    components,
    ground: "GND",
    nodeAnnotations,
    measurementMarks,
    loadPlaceholders,
  };

  return {
    kind: "single",
    netlist,
    answer: {
      R_B_kohm,
      R_A_prime_kohm,
      I_C_mA,
      V_O,
    },
    values: {
      V_CC,
      R_A_kohm,
      R_C_kohm,
      R_E_kohm,
      V_E_given,
      V_BE,
      rho,
      A_m2,
      L_m,
    },
  };
}

/**
 * BJT 전류미러 + 차동증폭기 generator (임용 7번 multi-BJT 형식).
 *
 * classifyCircuitType에서 BJT 인벤토리 ≥ 2 + 전류미러/차동 키워드 검출 시
 * params.multiBjtMirror = true 로 dispatch.
 *
 * Topology / 단계별 풀이는 위 BjtBiasMirrorDiffGeneration 주석 참조.
 *
 * @param args.params  CircuitTypeParams (multiBjtMirror·bjtCount 사용)
 * @param args.seed    재현 가능한 변형용 seed
 */
function generateBjtCurrentMirrorDiffAmp(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): BjtBiasMirrorDiffGeneration {
  const rand = makeRand(args.seed);

  // 변형 수치 (원본: V_CC=15, V_2=3, R_1=7k, R_2=R_3=5k, V_1_pert=-0.5)
  const V_CC = pick([12, 15, 18], rand);
  const V_2 = pick([2, 3, 4], rand);
  const R_1_kohm = pick([5, 7, 10], rand);
  const R_C_kohm = pick([4, 5, 6], rand);
  const R_2_kohm = R_C_kohm;
  const R_3_kohm = R_C_kohm;
  const V_BE = 0.7;
  const beta = 100;
  const V_1_initial = 0;
  const V_1_perturbed = pick([-0.5, -0.3, -0.7], rand);
  const bjtCount = args.params?.bjtCount ?? 4;

  // 단계 1: Q1 diode-connected (V_E1 = V_2, V_B1 = V_2 + V_BE).
  //   I_1 = (V_CC − V_B1) / R_1 = (V_CC − V_2 − V_BE) / R_1
  const I_1_mA = trunc3((V_CC - V_2 - V_BE) / R_1_kohm);

  // 단계 2: Q5 mirror 1:1 → I_5 = I_1
  const I_5_mA = I_1_mA;

  // 단계 3 balanced (V_1 = 0V = Q3.B): I_3 = I_5 / 2
  const I_3_balanced_mA = trunc3(I_5_mA / 2);
  const V_O_balanced = trunc3(V_CC - I_3_balanced_mA * R_3_kohm);

  // 단계 3 perturbed (V_1 = -0.5V): |ΔV_BE| ≫ 4·V_T → 차동쌍 완전 switch.
  //   Q2 off, Q3가 tail 전류 전체 carry → I_3 = I_5
  const I_3_perturbed_mA = I_5_mA;
  const V_O_perturbed = trunc3(V_CC - I_3_perturbed_mA * R_3_kohm);

  // ─── netlist 구성 (NPN 4-BJT) ──────────────────────────────────
  const components: CircuitComponent[] = [
    {
      id: "V_CC",
      type: "V",
      value: `${V_CC}V`,
      pins: [
        { id: "p", node: "VCC_top", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "V_2",
      type: "V",
      value: `${V_2}V`,
      pins: [
        { id: "p", node: "V_2_node", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "V_1",
      type: "V",
      value: `${V_1_initial}V`,
      pins: [
        { id: "p", node: "V_in1", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "R_1",
      type: "R",
      value: `${R_1_kohm}kΩ`,
      pins: [
        { id: "p", node: "VCC_top", side: "top" },
        { id: "n", node: "V_M", side: "bottom" },
      ],
    },
    {
      id: "R_2",
      type: "R",
      value: `${R_2_kohm}kΩ`,
      pins: [
        { id: "p", node: "VCC_top", side: "top" },
        { id: "n", node: "V_C2", side: "bottom" },
      ],
    },
    {
      id: "R_3",
      type: "R",
      value: `${R_3_kohm}kΩ`,
      pins: [
        { id: "p", node: "VCC_top", side: "top" },
        { id: "n", node: "V_O", side: "bottom" },
      ],
    },
    {
      id: "Q1",
      type: "BJT",
      pins: [
        { id: "c", node: "V_M", side: "top", role: "drain" },
        { id: "b", node: "V_M", side: "left", role: "gate" },
        { id: "e", node: "V_2_node", side: "bottom", role: "source" },
      ],
    },
    {
      id: "Q5",
      type: "BJT",
      pins: [
        { id: "c", node: "V_tail", side: "top", role: "drain" },
        { id: "b", node: "V_M", side: "left", role: "gate" },
        { id: "e", node: "V_2_node", side: "bottom", role: "source" },
      ],
    },
    {
      id: "Q2",
      type: "BJT",
      pins: [
        { id: "c", node: "V_C2", side: "top", role: "drain" },
        { id: "b", node: "V_in1", side: "left", role: "gate" },
        { id: "e", node: "V_tail", side: "bottom", role: "source" },
      ],
    },
    {
      id: "Q3",
      type: "BJT",
      pins: [
        { id: "c", node: "V_O", side: "top", role: "drain" },
        { id: "b", node: "GND", side: "right", role: "gate" },
        { id: "e", node: "V_tail", side: "bottom", role: "source" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "V_O", label: "V_o", style: "label_only" },
    { node: "V_in1", label: "V_1", style: "label_only" },
    { node: "V_2_node", label: "V_2", style: "label_only" },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "current", refs: ["R_1"], label: "I_1" },
    { kind: "current", refs: ["R_3"], label: "I_3" },
    { kind: "current", refs: ["Q5"], label: "I_5" },
    { kind: "voltage", refs: ["V_O", "GND"], label: "V_o" },
  ];

  // 차동쌍 입력측 강조 (학생이 V_1을 변경하는 placeholder)
  const loadPlaceholders: LoadPlaceholder[] = [
    {
      betweenNodes: ["V_in1", "GND"],
      label: "V_1",
      emphasize: true,
    },
  ];

  const netlist: CircuitNetlist = {
    components,
    ground: "GND",
    nodeAnnotations,
    measurementMarks,
    loadPlaceholders,
  };

  return {
    kind: "mirror_diff",
    netlist,
    answer: {
      I_1_mA,
      I_5_mA,
      I_3_balanced_mA,
      V_O_balanced,
      I_3_perturbed_mA,
      V_O_perturbed,
    },
    values: {
      V_CC,
      V_2,
      R_1_kohm,
      R_2_kohm,
      R_3_kohm,
      V_BE,
      beta,
      V_1_initial,
      V_1_perturbed,
      bjtCount,
    },
  };
}

/** 소수점 셋째자리 이하 절사 (원본 임용 7번 규칙). */
function trunc3(x: number): number {
  return Math.trunc(x * 1000) / 1000;
}
