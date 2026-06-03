import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  MeasurementMark,
  NodeAnnotation,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 직류+교류 다중 전원 + 정상상태 중첩 회로 generator (universal_ac `acDcSuperposition` 모드).
 *
 * 원본 형식 (임용 2022 B-6 류):
 *   - 직류 전압원(V_dc)과 교류 전압원(V_ac = A√2 sin ωt)이 스위치(단자 선택)로 연결된 단일 루프
 *   - 루프에 저항 nR개 직렬 + 인덕터(또는 커패시터) nX개 병렬 블록
 *   - 해석 방향: [단계 1] 직류만 → I_DC, [단계 2] 교류만 → i_ac(t)·전류 분배,
 *                [단계 3] 중첩 i(t) = I_DC + i_ac(t)  ← 모두 "정상 상태" 해석 (과도응답 아님)
 *
 * 구조 (4-node 평면, 좌측 leg 전원 체인):
 *   N_TL ──── R_1 ──── N_TR
 *    │                  ║      (L_1 ∥ L_2 병렬 블록, N_TR → N_BR)
 *   V_ac                ║
 *    │                  ║
 *   SW_2               N_BR
 *    │                  │
 *   SW_1                │
 *    │                  │
 *   V_dc                │
 *    │                  │
 *   GND ────── R_2 ─── N_BR
 *
 * 값 선택 규칙 (모든 조합이 깔끔한 답 보장 — rejection 불필요):
 *   - 병렬 블록 등가 X_eq에 대해 ω·L_eq = ΣR (45° 위상 강제) → |Z| = ΣR·√2
 *   - I_DC = V_dc/ΣR, i_ac 진폭 = V_rms/ΣR — 둘 다 정수 mA가 되는 V만 후보
 *   - 전류 분배비 = L_eq/L_k (기약분수)
 */

export type AcDcSuperpositionGeneration = {
  netlist: CircuitNetlist;
  /** 사용한 값 */
  values: {
    /** 직류 전압원 [V] */
    Vdc: number;
    /** 교류 전압원 rms [V] */
    VacRms: number;
    /** 교류 전압원 라벨 (예: "10√2 sin4000t V") */
    VacLabel: string;
    /** 각주파수 [rad/s] */
    omega: number;
    /** 직렬 저항들 */
    resistors: Array<{ id: string; value: number; label: string }>;
    /** ΣR [Ω] */
    rTotal: number;
    /** 병렬 리액티브 소자들 (L 또는 C) + 각각의 전류 분배비 */
    reactives: Array<{ id: string; value: number; label: string; ratio: number; ratioLabel: string }>;
    reactiveKind: "L" | "C";
    /** 병렬 등가값 (L_eq [H] 또는 C_eq [F]) */
    eqValue: number;
  };
  /** 닫힌형 해 (결정론) */
  solution: {
    /** [단계 1] 직류 정상상태 전류 [mA] (L=단락 / C=개방이면 0) */
    iDcMilli: number;
    /** [단계 2] 교류 정상상태 전류 진폭 [mA] */
    iAcPeakMilli: number;
    /** [단계 2] 위상 [deg] — 유도성 −45, 용량성 +45 */
    phaseDeg: number;
    /** i_ac(t) 표현식 (mA) */
    iAcExpression: string;
    /** 측정 대상(첫 번째) 리액티브 소자 전류 분배비 — i_1ac/i_ac */
    dividerRatio: number;
    dividerRatioLabel: string;
    /** 측정 대상 소자의 i_1ac(t) 표현식 (mA) */
    iReactiveExpression: string;
    /** [단계 3] i(t) = I_DC + i_ac(t) 표현식 (mA) */
    totalExpression: string;
  };
};

/** 병렬 인덕터 페어 — L_eq·분배비가 기약분수로 깔끔한 조합 */
const L_PAIRS: Array<{
  values: number[];
  labels: string[];
  leq: number;
  /** 각 소자의 분배비 (L_eq/L_k) — [분자, 분모] */
  ratios: Array<[number, number]>;
}> = [
  { values: [1, 1 / 9], labels: ["1H", "1/9H"], leq: 0.1, ratios: [[1, 10], [9, 10]] },
  { values: [1, 1 / 4], labels: ["1H", "1/4H"], leq: 0.2, ratios: [[1, 5], [4, 5]] },
  { values: [1, 1 / 3], labels: ["1H", "1/3H"], leq: 0.25, ratios: [[1, 4], [3, 4]] },
  { values: [1, 1], labels: ["1H", "1H"], leq: 0.5, ratios: [[1, 2], [1, 2]] },
  { values: [2, 2 / 3], labels: ["2H", "2/3H"], leq: 0.5, ratios: [[1, 4], [3, 4]] },
  { values: [1 / 2, 1 / 8], labels: ["1/2H", "1/8H"], leq: 0.1, ratios: [[1, 5], [4, 5]] },
];

/** 단일 인덕터 (인벤토리 L=1) */
const L_SINGLES: Array<{ values: number[]; labels: string[]; leq: number; ratios: Array<[number, number]> }> = [
  { values: [0.1], labels: ["0.1H"], leq: 0.1, ratios: [[1, 1]] },
  { values: [0.2], labels: ["0.2H"], leq: 0.2, ratios: [[1, 1]] },
  { values: [0.5], labels: ["0.5H"], leq: 0.5, ratios: [[1, 1]] },
  { values: [0.25], labels: ["1/4H"], leq: 0.25, ratios: [[1, 1]] },
];

/** 병렬 커패시터 페어 (L 없는 회로용) — C_eq = ΣC, 분배비 = C_k/C_eq */
const C_PAIRS: Array<{ values: number[]; labels: string[]; ceq: number; ratios: Array<[number, number]> }> = [
  { values: [1e-6, 4e-6], labels: ["1μF", "4μF"], ceq: 5e-6, ratios: [[1, 5], [4, 5]] },
  { values: [2e-6, 2e-6], labels: ["2μF", "2μF"], ceq: 4e-6, ratios: [[1, 2], [1, 2]] },
  { values: [1e-6, 9e-6], labels: ["1μF", "9μF"], ceq: 1e-5, ratios: [[1, 10], [9, 10]] },
];
const C_SINGLES: Array<{ values: number[]; labels: string[]; ceq: number; ratios: Array<[number, number]> }> = [
  { values: [5e-6], labels: ["5μF"], ceq: 5e-6, ratios: [[1, 1]] },
  { values: [1e-5], labels: ["10μF"], ceq: 1e-5, ratios: [[1, 1]] },
];

/** ω 후보 */
const OMEGAS = [500, 1000, 2000, 4000, 5000];

/** ΣR을 nR개로 나누는 분할 (각 항이 정수가 되는 것만 채택) */
const R_SPLITS: Record<number, number[][]> = {
  1: [[1]],
  2: [[1 / 2, 1 / 2], [1 / 4, 3 / 4]],
  3: [[1 / 4, 1 / 4, 1 / 2], [1 / 2, 1 / 4, 1 / 4]],
};

/** V 후보 — I = V/ΣR 가 정수 mA가 되는 것만 필터해서 사용 */
const V_CANDIDATES = [4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 40];

/** 분수 [분자,분모] → 라벨 ("1/10" 또는 "1") */
function fracLabel([num, den]: [number, number]): string {
  return den === 1 ? `${num}` : `${num}/${den}`;
}

/**
 * 직류+교류 중첩 회로 + 닫힌형 해 생성.
 *
 * @param args.params 분류기가 전달한 소자 카운트 (resistorCount·inductorCount·capacitorCount)
 * @param args.mode   exam_similar(값만 변경) | exam_variant(전원 위치 교환 + 값 변경)
 * @param args.seed   결정론 시드
 */
export function generateAcDcSuperposition(args: {
  params?: CircuitTypeParams;
  mode?: string;
  seed?: number;
}): AcDcSuperpositionGeneration {
  const rand = makeRand(args.seed);
  const params = args.params ?? {};
  const isVariant = args.mode === "exam_variant";

  // ── 소자 수 결정 (원본 inventory 따라가되 generator 지원 범위로 clamp) ──
  const nR = Math.min(Math.max(params.resistorCount ?? 2, 1), 3);
  const useInductor = (params.inductorCount ?? 2) > 0 || (params.capacitorCount ?? 0) === 0;
  const nX = useInductor
    ? Math.min(Math.max(params.inductorCount ?? 2, 1), 2)
    : Math.min(Math.max(params.capacitorCount ?? 2, 1), 2);

  // ── 리액티브 블록 선택 ──
  const reactiveKind: "L" | "C" = useInductor ? "L" : "C";

  // ── (블록, ω) 조합 enumerate — ΣR = (유도성) ω·L_eq | (용량성) 1/(ω·C_eq) 가
  //    100~1000 사이 50의 배수인 조합만 채택 (45° 위상 + 깔끔한 저항값 보장) ──
  type Combo = {
    blockValues: number[];
    blockLabels: string[];
    ratios: Array<[number, number]>;
    eqValue: number;
    omega: number;
    rTotal: number;
  };
  const combos: Combo[] = [];
  if (reactiveKind === "L") {
    const pool = nX >= 2 ? L_PAIRS : L_SINGLES;
    for (const p of pool) {
      for (const omega of OMEGAS) {
        const rTotal = omega * p.leq;
        if (rTotal >= 100 && rTotal <= 1000 && rTotal % 50 === 0) {
          combos.push({
            blockValues: p.values, blockLabels: p.labels, ratios: p.ratios,
            eqValue: p.leq, omega, rTotal,
          });
        }
      }
    }
  } else {
    const pool = nX >= 2 ? C_PAIRS : C_SINGLES;
    for (const p of pool) {
      for (const omega of OMEGAS) {
        const rTotal = 1 / (omega * p.ceq);
        if (rTotal >= 100 && rTotal <= 1000 && Number.isInteger(rTotal) && rTotal % 50 === 0) {
          combos.push({
            blockValues: p.values, blockLabels: p.labels, ratios: p.ratios,
            eqValue: p.ceq, omega, rTotal,
          });
        }
      }
    }
  }
  if (combos.length === 0) {
    throw new Error("acDcSuperposition: 유효한 (리액티브 블록, ω) 조합이 없습니다");
  }
  const combo = pick(combos, rand);

  // ── 저항 분할 — 각 R_i가 정수인 분할만 ──
  const splits = (R_SPLITS[nR] ?? R_SPLITS[2]).filter((s) =>
    s.every((f) => Number.isInteger(combo.rTotal * f)),
  );
  const split = splits.length > 0 ? pick(splits, rand) : [1 / Math.max(nR, 1)];
  const rValues = split.map((f) => combo.rTotal * f);

  // ── 전압 선택 — I_DC·i_ac 진폭이 정수 mA가 되는 후보만 ──
  const niceV = V_CANDIDATES.filter((v) => Number.isInteger((v / combo.rTotal) * 1000));
  const Vdc = niceV.length > 0 ? pick(niceV, rand) : 10;
  const VacRms = niceV.length > 0 ? pick(niceV, rand) : 10;
  const VacLabel = `${VacRms}√2 sin${combo.omega}t V`;

  // ── 닫힌형 해 ──
  //   유도성: I_DC = V_dc/ΣR (L 단락), Z = ΣR(1+j) → i_ac = (V_rms/ΣR)·sin(ωt−45°)
  //   용량성: I_DC = 0 (C 개방),     Z = ΣR(1−j) → i_ac = (V_rms/ΣR)·sin(ωt+45°)
  const iDcMilli = reactiveKind === "L" ? (Vdc / combo.rTotal) * 1000 : 0;
  const iAcPeakMilli = (VacRms / combo.rTotal) * 1000;
  const phaseDeg = reactiveKind === "L" ? -45 : 45;
  const phaseLabel = phaseDeg < 0 ? `− ${Math.abs(phaseDeg)}°` : `+ ${phaseDeg}°`;
  const iAcExpression = `${iAcPeakMilli} sin(${combo.omega}t ${phaseLabel}) [mA]`;

  // 측정 대상 = 첫 번째 리액티브 소자 (가장 큰 값 — 원본 1H처럼)
  const measuredIdx = 0;
  const ratio = combo.ratios[measuredIdx];
  const dividerRatio = ratio[0] / ratio[1];
  const dividerRatioLabel = fracLabel(ratio);
  const iReactivePeak = iAcPeakMilli * dividerRatio;
  const iReactiveExpression = `${roundNice(iReactivePeak)} sin(${combo.omega}t ${phaseLabel}) [mA]`;

  const totalExpression =
    reactiveKind === "L"
      ? `${iDcMilli} + ${iAcExpression.replace(" [mA]", "")} [mA]`
      : iAcExpression;

  // ── netlist 구성 ──
  const N_TL = "n_tl";
  const N_TR = "n_tr";
  const N_BR = "n_br";
  const GND = "GND";
  // 좌측 leg 중간 노드 (전원·스위치 체인)
  const N_M1 = "n_m1";
  const N_M2 = "n_m2";
  const N_M3 = "n_m3";

  // exam_variant: 직류·교류 전원 위치 교환 (위↔아래)
  const acOnTop = !isVariant;

  const sourceTop: CircuitComponent = {
    id: acOnTop ? "V_ac" : "V_dc",
    type: "V",
    value: acOnTop ? VacLabel : `${Vdc}V`,
    legRoot: N_TL,
    pins: [
      { id: "p", node: N_TL, side: "top" },
      { id: "n", node: N_M3, side: "bottom" },
    ],
  };
  const sourceBottom: CircuitComponent = {
    id: acOnTop ? "V_dc" : "V_ac",
    type: "V",
    value: acOnTop ? `${Vdc}V` : VacLabel,
    legRoot: N_TL,
    pins: [
      { id: "p", node: N_M1, side: "top" },
      { id: "n", node: GND, side: "bottom" },
    ],
  };

  const components: CircuitComponent[] = [
    // ── 좌측 leg (위→아래): 전원 — SW₂ — SW₁ — 전원 ──
    sourceTop,
    {
      id: "SW_2",
      type: "SW",
      state: "closed",
      legRoot: N_TL,
      pins: [
        { id: "p", node: N_M3, side: "top" },
        { id: "n", node: N_M2, side: "bottom" },
      ],
    },
    {
      id: "SW_1",
      type: "SW",
      state: "closed",
      legRoot: N_TL,
      pins: [
        { id: "p", node: N_M2, side: "top" },
        { id: "n", node: N_M1, side: "bottom" },
      ],
    },
    sourceBottom,
    // ── 상단 horizontal: R_1 ──
    {
      id: "R_1",
      type: "R",
      value: `${rValues[0]}Ω`,
      pins: [
        { id: "p", node: N_TL, side: "left" },
        { id: "n", node: N_TR, side: "right" },
      ],
    },
    // ── 우측 병렬 리액티브 블록 ──
    ...combo.blockValues.map((_v, k): CircuitComponent => ({
      id: `${reactiveKind}_${k + 1}`,
      type: reactiveKind,
      value: combo.blockLabels[k],
      pins: [
        { id: "p", node: N_TR, side: "top" },
        { id: "n", node: N_BR, side: "bottom" },
      ],
    })),
    // ── 하단 horizontal: 나머지 R (없으면 WIRE로 루프 닫기) ──
    ...(rValues.length >= 2
      ? rValues.slice(1).map((v, k): CircuitComponent => ({
          id: `R_${k + 2}`,
          type: "R",
          value: `${v}Ω`,
          pins: [
            { id: "p", node: GND, side: "left" },
            { id: "n", node: N_BR, side: "right" },
          ],
        }))
      : [
          {
            id: "W_bot",
            type: "WIRE",
            pins: [
              { id: "p", node: GND, side: "left" },
              { id: "n", node: N_BR, side: "right" },
            ],
          } satisfies CircuitComponent,
        ]),
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "current", refs: ["R_1"], label: "i(t)" },
    ...(nX >= 2
      ? [{ kind: "current" as const, refs: [`${reactiveKind}_1`], label: "i₁(t)" }]
      : []),
  ];

  const nodeAnnotations: NodeAnnotation[] = [];

  // positions hint — 원본 layout (좌측 전원 체인 + 우측 병렬 블록)
  const positions: Record<string, { x: number; y: number }> = {
    [N_TL]: { x: 80, y: 60 },
    [N_TR]: { x: 480, y: 60 },
    [N_M3]: { x: 80, y: 150 },
    [N_M2]: { x: 80, y: 230 },
    [N_M1]: { x: 80, y: 310 },
    [GND]: { x: 80, y: 390 },
    [N_BR]: { x: 480, y: 390 },
  };

  return {
    netlist: {
      components,
      ground: GND,
      nodeAnnotations,
      measurementMarks,
      positions,
    },
    values: {
      Vdc,
      VacRms,
      VacLabel,
      omega: combo.omega,
      resistors: rValues.map((v, k) => ({ id: `R_${k + 1}`, value: v, label: `${v}Ω` })),
      rTotal: combo.rTotal,
      reactives: combo.blockValues.map((v, k) => ({
        id: `${reactiveKind}_${k + 1}`,
        value: v,
        label: combo.blockLabels[k],
        ratio: combo.ratios[k][0] / combo.ratios[k][1],
        ratioLabel: fracLabel(combo.ratios[k]),
      })),
      reactiveKind,
      eqValue: combo.eqValue,
    },
    solution: {
      iDcMilli,
      iAcPeakMilli,
      phaseDeg,
      iAcExpression,
      dividerRatio,
      dividerRatioLabel,
      iReactiveExpression,
      totalExpression,
    },
  };
}

/** 소수점이 길어지지 않게 round (정수면 정수, 아니면 소수 2자리) */
function roundNice(x: number): number {
  return Number.isInteger(x) ? x : Math.round(x * 100) / 100;
}
