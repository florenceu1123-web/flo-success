import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * BJT Common-Emitter 소신호 등가 회로 generator.
 *
 *  Hybrid-π 모델:
 *   - r_π: 베이스-에미터 사이 입력 저항
 *   - g_m: 트랜스컨덕턴스 (i_c = g_m · v_be)
 *   - β = g_m · r_π (전류이득)
 *
 *  토폴로지 (소신호 등가):
 *    v_s ──R_S── ●V_b ── r_π ── ●GND
 *                  │
 *                  └─→ VCCS i = g_m · v_be (V_b 기준), 출력 단자 V_c → GND
 *                                        ●V_c ── R_C ── GND
 *
 *  v_be = V(V_b) - V(GND) = V_b (in this AC small-signal context).
 *  i_c = g_m·V_b. 이 전류는 V_c에서 빠져나가는 방향 → R_C를 통해 V_c가 음수로 떨어짐.
 *  ⇒ A_v = V_c / v_s = -g_m·R_C · (r_π / (R_S + r_π))
 *
 *  솔버: MNA 그대로 사용 (VCCS 지원). closed-form 비교로 자체 검증.
 */

export type BjtArchetype = "ce_hybrid_pi";

export type BjtSmallSignalGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  /** 정답 — A_v (전압 이득, dimensionless) */
  Av: number;
  /** V_c (출력 전압, mV 단위) */
  Vc_mV: number;
  /** V_b (베이스 전압, mV) */
  Vb_mV: number;
  archetype: BjtArchetype;
  values: Record<string, number>;
};

const NICE_R_KOHM = [0.5, 1, 2, 4, 5, 8, 10];
const NICE_RC_KOHM = [2, 4, 5, 6, 8, 10];      // 컬렉터 저항 (조금 더 큼)
const NICE_RPI_KOHM = [1, 1.5, 2, 2.5, 3, 5];   // r_π
const NICE_GM_MA_PER_V = [10, 20, 25, 40, 50];  // g_m (mA/V = mS)

export function generateBjtSmallSignal(args: {
  params?: CircuitTypeParams;
  archetype?: BjtArchetype;
  seed?: number;
}): BjtSmallSignalGeneration {
  const rand = makeRand(args.seed);
  const archetype: BjtArchetype = args.archetype ?? "ce_hybrid_pi";
  return buildCeHybridPi(rand);
  void archetype;
}

function buildCeHybridPi(rand: () => number): BjtSmallSignalGeneration {
  const vs_mV = 10;   // 고정 10 mV (소신호)
  const RS_k = pick(NICE_R_KOHM, rand);
  const Rpi_k = pick(NICE_RPI_KOHM, rand);
  const Rc_k = pick(NICE_RC_KOHM, rand);
  const gm_mS = pick(NICE_GM_MA_PER_V, rand);

  // SI 단위로 변환
  const vs = vs_mV / 1000;        // V
  const RS = RS_k * 1000;          // Ω
  const Rpi = Rpi_k * 1000;        // Ω
  const Rc = Rc_k * 1000;          // Ω
  const gm = gm_mS / 1000;         // S (A/V)

  const solverNet: SolverNetwork = {
    nodeIds: ["Vs", "Vb", "Vc"],
    groundId: "GND",
    resistors: [
      { id: "RS",  a: "Vs", b: "Vb", R: RS },
      { id: "Rpi", a: "Vb", b: "GND", R: Rpi },
      { id: "RC",  a: "Vc", b: "GND", R: Rc },
    ],
    vsources: [{ id: "vs", a: "Vs", b: "GND", V: vs }],
    isources: [],
    vccs: [
      // i_c = g_m·V(Vb) — collector에서 빠져나가는 방향 (VCCS a=Vc, b=GND)
      { id: "BJT", a: "Vc", b: "GND", vca: "Vb", vcb: "GND", g: gm },
    ],
  };

  const sol = solveMNA(solverNet);
  const Vc = sol.nodeVoltages.Vc;
  const Vb = sol.nodeVoltages.Vb;
  const Av = Vc / vs;

  const Vc_mV = round3(Vc * 1000);
  const Vb_mV = round3(Vb * 1000);
  const AvRounded = round3(Av);

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "vs", type: "V", value: `${vs_mV}mV`,
        pins: [
          { id: "p1", node: "Vs", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "RS", type: "R", value: `${RS_k}kΩ`,
        pins: [
          { id: "p1", node: "Vs", side: "left" },
          { id: "p2", node: "Vb", side: "right" },
        ],
      },
      {
        id: "Rpi", type: "R", value: `${Rpi_k}kΩ`,
        pins: [
          { id: "p1", node: "Vb", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
      {
        id: "BJT", type: "VCCS", value: `${gm_mS}·v_be [mA]`, gain: gm_mS, control: "v_be",
        pins: [
          { id: "p1", node: "Vc", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
      {
        id: "RC", type: "R", value: `${Rc_k}kΩ`,
        pins: [
          { id: "p1", node: "Vc", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "Vb", label: "v_b (= v_be)", style: "label_only" },
      { node: "Vc", label: "v_c", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "voltage", refs: ["Vc", "GND"], label: "v_out" },
    ],
  };

  return {
    netlist, solverNet,
    Av: AvRounded,
    Vc_mV, Vb_mV,
    archetype: "ce_hybrid_pi",
    values: { v_s_mV: vs_mV, R_S_kohm: RS_k, r_pi_kohm: Rpi_k, g_m_mS: gm_mS, R_C_kohm: Rc_k },
  };
}
