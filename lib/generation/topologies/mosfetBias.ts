import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * NMOS DC bias 회로 generator (임용 10번 형식의 단일 NMOS 단순화).
 *
 * 회로 (단순 — R_S=0, V_G 외부 단자 직접):
 *   V_DD ━━┳━ R_D ━┳━ V_O (= V_D, drain)
 *          ┃       ┃
 *          ┃      D(NMOS)
 *          ┃   ←G (gate, 외부 단자 V_G로 직접 연결)
 *          ┃      S(NMOS)
 *          ┃       ┃
 *          ┃     GND
 *          GND
 *
 *  학생 단계 (포화 영역 가정):
 *   [단계 1] V_GS = V_G → I_D = K·(V_GS − V_TH)² [A] 도출
 *   [단계 2] V_D = V_DD − I_D·R_D [V] 도출
 *   [단계 3] V_DS = V_D (R_S=0) 확인 + 포화 동작 검증 (V_DS ≥ V_GS − V_TH)
 *
 *  값 선택 전략: (V_DD, V_G, V_TH, K, R_D) 페어 사전 정의 — 모두 nice 정수/소수 출력 + 포화 강제.
 */

export type MosfetBiasGeneration = {
  netlist: CircuitNetlist;
  values: {
    V_DD: number;          // [V]
    V_G: number;           // [V]
    V_TH: number;          // [V]
    K_uA_per_V2: number;   // [μA/V²] — 라벨링 편의 위해. SI: K·1e-6 A/V²
    R_D_kohm: number;      // [kΩ]
    // 도출값 (정답)
    V_GS: number;          // = V_G [V]
    V_OV: number;          // = V_GS − V_TH [V] (overdrive)
    I_D_mA: number;        // [mA]
    V_D: number;           // [V]
    V_DS: number;          // = V_D [V]
    inSaturation: boolean; // V_DS ≥ V_OV?
  };
};

// ── (V_DD, V_G, V_TH, K, R_D) 페어 — 모두 사전계산해서 nice 출력 + 포화 강제 ─
type MosfetTriple = {
  V_DD: number; V_G: number; V_TH: number;
  K_uA_per_V2: number;   // 1000 = 1mA/V², 500 = 0.5mA/V², 100 = 0.1mA/V²
  R_D_kohm: number;
};

function deriveValues(t: MosfetTriple) {
  const V_GS = t.V_G;                 // R_S=0 → V_S=0 → V_GS = V_G
  const V_OV = V_GS - t.V_TH;
  if (V_OV <= 0) return null;          // 컷오프 — 무효
  const I_D_mA = (t.K_uA_per_V2 / 1000) * V_OV * V_OV; // I_D[mA] = K[mA/V²]·V_OV²
  const V_D = t.V_DD - I_D_mA * t.R_D_kohm;
  if (V_D < 0) return null;            // R_D가 너무 커서 V_D 음수 — 무효
  const V_DS = V_D;
  const inSat = V_DS >= V_OV;          // 포화 조건
  return { V_GS, V_OV, I_D_mA, V_D, V_DS, inSat };
}

// 사전계산된 nice 페어 — 모두 포화, 정수/소수 출력
const RAW_PAIRS: MosfetTriple[] = [
  { V_DD: 12, V_G: 3, V_TH: 1, K_uA_per_V2: 1000, R_D_kohm: 2 },    // V_OV=2, I_D=4mA, V_D=4, V_DS=4 ✓
  { V_DD: 15, V_G: 4, V_TH: 2, K_uA_per_V2: 500,  R_D_kohm: 4 },    // V_OV=2, I_D=2mA, V_D=7, V_DS=7 ✓
  { V_DD: 10, V_G: 3, V_TH: 1, K_uA_per_V2: 500,  R_D_kohm: 2 },    // V_OV=2, I_D=2mA, V_D=6, V_DS=6 ✓
  { V_DD: 20, V_G: 5, V_TH: 1, K_uA_per_V2: 250,  R_D_kohm: 4 },    // V_OV=4, I_D=4mA, V_D=4, V_DS=4 → 경계
  { V_DD: 15, V_G: 5, V_TH: 1, K_uA_per_V2: 500,  R_D_kohm: 1 },    // V_OV=4, I_D=8mA, V_D=7, V_DS=7 ✓
  { V_DD: 12, V_G: 4, V_TH: 2, K_uA_per_V2: 1000, R_D_kohm: 1 },    // V_OV=2, I_D=4mA, V_D=8, V_DS=8 ✓
  { V_DD: 10, V_G: 4, V_TH: 2, K_uA_per_V2: 250,  R_D_kohm: 4 },    // V_OV=2, I_D=1mA, V_D=6, V_DS=6 ✓
  { V_DD: 18, V_G: 4, V_TH: 1, K_uA_per_V2: 500,  R_D_kohm: 2 },    // V_OV=3, I_D=4.5mA, V_D=9, V_DS=9 ✓
];

// 페어 중 포화 만족하는 것만 통과
const PAIRS = RAW_PAIRS.filter((t) => {
  const d = deriveValues(t);
  return d !== null && d.inSat;
});

export function generateMosfetBias(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): MosfetBiasGeneration {
  const rand = makeRand(args.seed);
  const t = pick(PAIRS, rand);
  const d = deriveValues(t);
  if (!d) throw new Error("MosfetBias 페어 무효 — PAIRS 검증 실패");

  // ── netlist ───────────────────────────────────────────────
  // V_DD 좌측 vertical, R_D 우측 vertical (top→V_D), NMOS (D=V_D, G=V_G, S=GND).
  // V_G는 별도 DC source(V_G_src)로 두어 회로 닫힘 (validator floating pin 회피).
  const components: CircuitComponent[] = [
    {
      id: "V_DD", type: "V", value: `${t.V_DD}V`,
      pins: [
        { id: "p", node: "VDD_top", side: "top" },
        { id: "n", node: "GND",     side: "bottom" },
      ],
    },
    {
      id: "V_G", type: "V", value: `${t.V_G}V`,
      pins: [
        { id: "p", node: "V_G_node", side: "top" },
        { id: "n", node: "GND",      side: "bottom" },
      ],
    },
    {
      id: "R_D", type: "R", value: `${t.R_D_kohm}kΩ`,
      pins: [
        { id: "p", node: "VDD_top", side: "top" },
        { id: "n", node: "V_D_node", side: "bottom" },
      ],
    },
    {
      id: "M1", type: "MOSFET",
      value: `NMOS V_TH=${t.V_TH}V K=${t.K_uA_per_V2}μA/V²`,
      pins: [
        { id: "d", node: "V_D_node", side: "top",    role: "drain" },
        { id: "g", node: "V_G_node", side: "left",   role: "gate" },
        { id: "s", node: "GND",      side: "bottom", role: "source" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "V_D_node", label: "V_D", style: "label_only" },
    { node: "V_G_node", label: "V_G", style: "label_only" },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["V_D_node", "GND"], label: "V_D" },
    { kind: "current", refs: ["R_D"], label: "I_D" },
  ];

  const netlist: CircuitNetlist = {
    components,
    ground: "GND",
    nodeAnnotations,
    measurementMarks,
  };

  return {
    netlist,
    values: {
      V_DD: t.V_DD,
      V_G: t.V_G,
      V_TH: t.V_TH,
      K_uA_per_V2: t.K_uA_per_V2,
      R_D_kohm: t.R_D_kohm,
      V_GS: d.V_GS,
      V_OV: d.V_OV,
      I_D_mA: d.I_D_mA,
      V_D: d.V_D,
      V_DS: d.V_DS,
      inSaturation: d.inSat,
    },
  };
}

/**
 * K 표기 helper — μA/V² → mA/V² 또는 SI 형태.
 *   1000 → "1mA/V² (= 10⁻³ A/V²)"
 *   500  → "0.5mA/V² (= 5×10⁻⁴ A/V²)"
 *   250  → "0.25mA/V² (= 2.5×10⁻⁴ A/V²)"
 */
export function formatK(K_uA_per_V2: number): string {
  const mA = K_uA_per_V2 / 1000;
  const si = K_uA_per_V2 * 1e-6;
  return `${mA}mA/V² (= ${formatSci(si)} A/V²)`;
}

function formatSci(x: number): string {
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(x)));
  const mantissa = x / Math.pow(10, exp);
  if (Math.abs(mantissa - 1) < 1e-9) return `10⁻${-exp}`.replace("⁻-", "");
  return `${mantissa}×10${formatSuperscript(exp)}`;
}

function formatSuperscript(n: number): string {
  const sup: Record<string, string> = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "-": "⁻",
  };
  return String(n).split("").map((c) => sup[c] ?? c).join("");
}
