import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
  LoadPlaceholder,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * NMOS cascode current mirror 회로 generator — 임용 10번 정확 재현.
 *
 * 회로 (3-leg):
 *  좌측 leg (reference):
 *    V_DD ━ R(학생 도출) ━ V_GS1 노드(=M1.D=M1.G) ━ M1.S ━ GND
 *      I_M1 = I_ref (정의된 전류, M1 옆 화살표 라벨)
 *      M1: diode-connected (G=D 단락). V_GS1 = V_DS1 (자체 bias)
 *
 *  가운데 leg (M3 게이트 분압):
 *    V_DD ━ R_G1 ━ V_G3 노드 ━ R_G2 ━ GND
 *
 *  우측 leg (cascode output):
 *    V_DD ━ R_top ━ V_D3(=출력) ━ M3.D
 *    M3.S = V_D2(=V_S3) ━ M2.D
 *    M2.S ━ GND
 *    M2.G = M1.G (mirror wire)
 *    M3.G = V_G3 (분압점)
 *
 *  학생 단계 (모든 MOSFET 동일 V_TH, K, 포화):
 *    [단계 1] M1의 V_GS1 + R 도출
 *      I_ref = K(V_GS1 − V_TH)² → V_GS1 = V_TH + √(I_ref/K)
 *      R = (V_DD − V_GS1) / I_ref
 *    [단계 2] M2의 V_D2 도출
 *      M2가 mirror → I_M2 = I_ref → V_GS2 = V_GS1 → V_S2=0 → V_OV2 동일
 *      M3 cascode → I_M3 = I_ref → V_GS3 = V_GS1
 *      V_S3 = V_G3 − V_GS3 = V_D2
 *    [단계 3] M3의 V_GS3 + V_S3 도출 (단계 2 결과 재확인)
 *      V_GS3 = V_TH + √(I_ref/K) = V_GS1
 *      V_S3 = V_G3 − V_GS3
 */

export type MosfetCascodeGeneration = {
  netlist: CircuitNetlist;
  values: {
    V_DD: number;          // [V]
    I_ref_mA: number;      // [mA] (M1 정의된 전류)
    V_TH: number;          // [V]
    K_uA_per_V2: number;   // [μA/V²]
    R_G1_kohm: number;     // [kΩ] (V_G3 분압 위)
    R_G2_kohm: number;     // [kΩ] (V_G3 분압 아래)
    R_top_kohm: number;    // [kΩ] (V_D3 출력 leg 위)
    // 학생 도출값 (정답)
    V_GS1: number;         // 단계 1
    R_kohm: number;        // 단계 1
    V_G3: number;          // 가운데 분압점
    V_D2: number;          // 단계 2 (= V_S3)
    V_GS3: number;         // 단계 3
    V_S3: number;          // 단계 3
    V_D3: number;          // 출력 (= V_DD − R_top·I_ref)
    inSaturationM2: boolean;
    inSaturationM3: boolean;
  };
};

// ── (V_DD, I_ref, K, V_TH, R_G1, R_G2, R_top) 페어 — 모두 nice 출력 + 포화 강제 ─
type Pair = {
  V_DD: number; I_ref_mA: number; V_TH: number; K_uA_per_V2: number;
  R_G1_kohm: number; R_G2_kohm: number; R_top_kohm: number;
};

function derive(p: Pair) {
  // V_GS1 = V_TH + √(I_ref/K).
  // I_ref[A] = K[A/V²] · V_OV². K = K_uA_per_V2·1e-6 [A/V²]. I_ref = I_ref_mA·1e-3 [A].
  // V_OV = √(I_ref·1e-3 / (K·1e-6)) = √(I_ref/K·1000) = √(I_ref_mA·1000/K_uA_per_V2)
  const V_OV = Math.sqrt((p.I_ref_mA * 1000) / p.K_uA_per_V2);
  const V_GS1 = p.V_TH + V_OV;
  // R = (V_DD - V_GS1)/I_ref [V/mA = kΩ]
  const R_kohm = (p.V_DD - V_GS1) / p.I_ref_mA;
  if (R_kohm <= 0) return null;

  const V_G3 = p.V_DD * p.R_G2_kohm / (p.R_G1_kohm + p.R_G2_kohm);
  const V_GS3 = V_GS1;        // mirror + cascode same I → same V_GS
  const V_S3 = V_G3 - V_GS3;
  const V_D2 = V_S3;
  if (V_S3 < 0) return null;   // M3 cutoff

  const V_D3 = p.V_DD - p.R_top_kohm * p.I_ref_mA;
  if (V_D3 < V_S3) return null; // V_DS3 음수

  // 포화 검증
  const inSatM2 = V_D2 >= V_OV;             // V_DS2 = V_D2 ≥ V_OV2
  const inSatM3 = (V_D3 - V_S3) >= V_OV;    // V_DS3 ≥ V_OV3

  return { V_OV, V_GS1, R_kohm, V_G3, V_GS3, V_S3, V_D2, V_D3, inSatM2, inSatM3 };
}

const RAW_PAIRS: Pair[] = [
  // 원본 임용 10번
  { V_DD: 10, I_ref_mA: 0.1, V_TH: 1.1, K_uA_per_V2: 100, R_G1_kohm: 20, R_G2_kohm: 20, R_top_kohm: 40 },
  // 변형 1
  { V_DD: 10, I_ref_mA: 0.1, V_TH: 1.0, K_uA_per_V2: 100, R_G1_kohm: 20, R_G2_kohm: 20, R_top_kohm: 40 },
  // 변형 2 — V_DD 12V
  { V_DD: 12, I_ref_mA: 0.2, V_TH: 1.0, K_uA_per_V2: 200, R_G1_kohm: 20, R_G2_kohm: 20, R_top_kohm: 30 },
  // 변형 3 — V_DD 15V
  { V_DD: 15, I_ref_mA: 0.5, V_TH: 1.0, K_uA_per_V2: 500, R_G1_kohm: 30, R_G2_kohm: 30, R_top_kohm: 20 },
  // 변형 4 — 비대칭 분압
  { V_DD: 10, I_ref_mA: 0.1, V_TH: 1.0, K_uA_per_V2: 100, R_G1_kohm: 30, R_G2_kohm: 20, R_top_kohm: 50 },
  // 변형 5 — V_DD 20V
  { V_DD: 20, I_ref_mA: 0.4, V_TH: 1.0, K_uA_per_V2: 400, R_G1_kohm: 25, R_G2_kohm: 25, R_top_kohm: 25 },
];

const PAIRS = RAW_PAIRS.filter((p) => {
  const d = derive(p);
  return d !== null && d.inSatM2 && d.inSatM3;
});

export function generateMosfetCascodeMirror(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): MosfetCascodeGeneration {
  const rand = makeRand(args.seed);
  const p = pick(PAIRS, rand);
  const d = derive(p);
  if (!d) throw new Error("MosfetCascodeMirror 페어 유효성 검증 실패");

  // ── netlist ───────────────────────────────────────────────
  // node 정의:
  //   VDD_top       : V_DD positive
  //   V_R_M1_top    : R bottom = M1.D = M1.G (diode-connected reference, V_GS1 node)
  //   V_RG_mid      : V_G3 (가운데 분압점) = M3.G
  //   V_D3_node     : M3.D = R_top bottom (= V_D3 출력)
  //   V_S3_node     : M3.S = M2.D (= V_D2)
  //   GND
  const components: CircuitComponent[] = [
    // V_DD
    {
      id: "V_DD", type: "V", value: `${p.V_DD}V`,
      pins: [
        { id: "p", node: "VDD_top", side: "top" },
        { id: "n", node: "GND",      side: "bottom" },
      ],
    },
    // 좌측 leg: R (학생 도출) ━ M1 diode-connected
    {
      id: "R", type: "R", value: "R",   // 학생 도출 변수
      pins: [
        { id: "p", node: "VDD_top",     side: "top" },
        { id: "n", node: "V_M1_top",    side: "bottom" },
      ],
    },
    {
      id: "M1", type: "MOSFET",
      value: `NMOS V_TH=${p.V_TH}V K=${p.K_uA_per_V2}μA/V² (diode)`,
      pins: [
        { id: "d", node: "V_M1_top", side: "top",    role: "drain" },
        { id: "g", node: "V_M1_top", side: "left",   role: "gate" },     // diode-connected: G=D
        { id: "s", node: "GND",      side: "bottom", role: "source" },
      ],
    },
    // I_ref 표시는 generator에서 직접 component 안 두고 measurementMark로 (M1에 흐르는 전류)
    // 가운데 leg: R_G1 + R_G2
    {
      id: "R_G1", type: "R", value: `${p.R_G1_kohm}kΩ`,
      pins: [
        { id: "p", node: "VDD_top",  side: "top" },
        { id: "n", node: "V_G3_mid", side: "bottom" },
      ],
    },
    {
      id: "R_G2", type: "R", value: `${p.R_G2_kohm}kΩ`,
      pins: [
        { id: "p", node: "V_G3_mid", side: "top" },
        { id: "n", node: "GND",      side: "bottom" },
      ],
    },
    // 우측 leg: R_top ━ M3.D=V_D3, M3.S=V_S3, M2.D=V_S3, M2.S=GND, M2.G=M1.G (mirror)
    {
      id: "R_top", type: "R", value: `${p.R_top_kohm}kΩ`,
      pins: [
        { id: "p", node: "VDD_top",   side: "top" },
        { id: "n", node: "V_D3_node", side: "bottom" },
      ],
    },
    {
      id: "M3", type: "MOSFET",
      value: `NMOS V_TH=${p.V_TH}V K=${p.K_uA_per_V2}μA/V² (cascode)`,
      pins: [
        { id: "d", node: "V_D3_node", side: "top",    role: "drain" },
        { id: "g", node: "V_G3_mid",  side: "left",   role: "gate" },
        { id: "s", node: "V_S3_node", side: "bottom", role: "source" },
      ],
    },
    {
      id: "M2", type: "MOSFET",
      value: `NMOS V_TH=${p.V_TH}V K=${p.K_uA_per_V2}μA/V² (mirror)`,
      pins: [
        { id: "d", node: "V_S3_node", side: "top",    role: "drain" },
        { id: "g", node: "V_M1_top",  side: "left",   role: "gate" },   // mirror: M2.G = M1.G
        { id: "s", node: "GND",       side: "bottom", role: "source" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "V_M1_top", label: "V_GS1", style: "label_only" },
    { node: "V_G3_mid", label: "V_G3",  style: "label_only" },
    { node: "V_D3_node", label: "V_D3", style: "terminal_dot" },
    { node: "V_S3_node", label: "V_S3 (= V_D2)", style: "label_only" },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "current", refs: ["M1"], label: `I_ref = ${p.I_ref_mA}mA` },
    { kind: "voltage", refs: ["V_M1_top", "GND"], label: "V_GS1" },
    { kind: "voltage", refs: ["V_S3_node", "GND"], label: "V_D2 (= V_S3)" },
    { kind: "voltage", refs: ["V_D3_node", "GND"], label: "V_D3" },
  ];

  // R을 학생 도출 placeholder로 강조 (점선 박스)
  const loadPlaceholders: LoadPlaceholder[] = [
    { betweenNodes: ["VDD_top", "V_M1_top"], label: "R", emphasize: true },
  ];

  return {
    netlist: {
      components,
      ground: "GND",
      nodeAnnotations,
      measurementMarks,
      loadPlaceholders,
    },
    values: {
      V_DD: p.V_DD,
      I_ref_mA: p.I_ref_mA,
      V_TH: p.V_TH,
      K_uA_per_V2: p.K_uA_per_V2,
      R_G1_kohm: p.R_G1_kohm,
      R_G2_kohm: p.R_G2_kohm,
      R_top_kohm: p.R_top_kohm,
      V_GS1: round(d.V_GS1, 3),
      R_kohm: round(d.R_kohm, 2),
      V_G3:  round(d.V_G3, 3),
      V_D2:  round(d.V_D2, 3),
      V_GS3: round(d.V_GS3, 3),
      V_S3:  round(d.V_S3, 3),
      V_D3:  round(d.V_D3, 3),
      inSaturationM2: d.inSatM2,
      inSaturationM3: d.inSatM3,
    },
  };
}

function round(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

export function formatKLabel(K_uA_per_V2: number): string {
  const mA = K_uA_per_V2 / 1000;
  if (Math.abs(K_uA_per_V2 - 100) < 1e-9) return `10⁻⁴ A/V² (= 0.1mA/V²)`;
  if (Math.abs(K_uA_per_V2 - 200) < 1e-9) return `2×10⁻⁴ A/V² (= 0.2mA/V²)`;
  if (Math.abs(K_uA_per_V2 - 500) < 1e-9) return `5×10⁻⁴ A/V² (= 0.5mA/V²)`;
  if (Math.abs(K_uA_per_V2 - 400) < 1e-9) return `4×10⁻⁴ A/V² (= 0.4mA/V²)`;
  if (Math.abs(K_uA_per_V2 - 1000) < 1e-9) return `10⁻³ A/V² (= 1mA/V²)`;
  return `${mA}mA/V² (= ${K_uA_per_V2 * 1e-6} A/V²)`;
}
