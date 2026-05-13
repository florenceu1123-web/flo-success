import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import { makeRand, pick, round3 } from "./_helpers";
import {
  DEFAULT_BRANCH_RULES,
  assembleNetlist,
  instantiateAnalogTemplate,
  validateBranchTemplate,
  type AnalogValueAssignment,
  type BranchTemplate,
} from "@/lib/generation/branchTemplate";
import { createLogger } from "@/lib/logger";

const bjtlog = createLogger("lib/generation/topologies/bjtSmallSignal");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) bjtlog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

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

  const netlist = assembleViaBT({
    branches: [
      { id: "br_vs", role: "input_source_leg", orientation: "vertical", fromNode: "Vs", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "vs" }] },
      { id: "br_RS", role: "top_rail", orientation: "horizontal", fromNode: "Vs", toNode: "Vb",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "RS" }] },
      { id: "br_Rpi", role: "load_leg", orientation: "vertical", fromNode: "Vb", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "Rpi" }] },
      { id: "br_BJT", role: "dependent_source_leg", orientation: "vertical", fromNode: "Vc", toNode: "GND",
        components: [{ type: "VCCS", role: "dep_current_source", order: 1, required: true, idOverride: "BJT" }] },
      { id: "br_RC", role: "load_leg", orientation: "vertical", fromNode: "Vc", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "RC" }] },
    ],
    values: [
      { branchId: "br_vs", componentRole: "voltage_source", type: "V", value: `${vs_mV}mV` },
      { branchId: "br_RS", componentRole: "resistor", type: "R", value: `${RS_k}kΩ` },
      { branchId: "br_Rpi", componentRole: "resistor", type: "R", value: `${Rpi_k}kΩ` },
      { branchId: "br_BJT", componentRole: "dep_current_source", type: "VCCS", value: `${gm_mS}·v_be [mA]`, gain: `${gm_mS}` },
      { branchId: "br_RC", componentRole: "resistor", type: "R", value: `${Rc_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "Vb", label: "v_b (= v_be)", style: "label_only" },
        { node: "Vc", label: "v_c", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vc", "GND"], label: "v_out" }],
    },
  });

  return {
    netlist, solverNet,
    Av: AvRounded,
    Vc_mV, Vb_mV,
    archetype: "ce_hybrid_pi",
    values: { v_s_mV: vs_mV, R_S_kohm: RS_k, r_pi_kohm: Rpi_k, g_m_mS: gm_mS, R_C_kohm: Rc_k },
  };
}
