import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import {
  NICE_RESISTORS,
  NICE_VOLTAGES,
  makeRand,
  pick,
  round3,
} from "./_helpers";

/**
 * DC 종속전원 회로 generator.
 *
 *  Archetype: "vccs_chain"
 *  ──────────────────────
 *  ●top ──R1── ●a ──R2── ●b
 *   │           │          │
 *   V1          R_x        R3
 *   │           │          │
 *  GND         GND        GND
 *  ※ VCCS: I = g_m · V_x  (V_x = V(a))
 *     출력 단자: GND → b (b 노드로 g_m·V_x 만큼 inject)
 *
 *  종속전원 풀이 절차:
 *    1) 미지수 정의 (V_a, V_b 또는 mesh 전류)
 *    2) KCL에서 종속 전류 항을 미지수의 함수로 표기 (별도 미지수 아님)
 *    3) 연립방정식 풀이
 */

export type DepSourceArchetype = "vccs_chain";

export type DepSourceGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  Vnodes: Record<string, number>;
  /** 정답 대상 (V(a), V(b), 또는 I_R3 등 중 하나) */
  target: "Va" | "Vb" | "Ir3";
  targetValue: number;
  targetLabel: string;
  archetype: DepSourceArchetype;
  values: Record<string, number>;
};

/** g_m 후보 (S, siemens) — 임용에서 자주 등장 */
const NICE_GM = [0.05, 0.1, 0.2, 0.25, 0.5];

export function generateDcDependentSource(args: {
  params?: CircuitTypeParams;
  archetype?: DepSourceArchetype;
  seed?: number;
}): DepSourceGeneration {
  const rand = makeRand(args.seed);
  const archetype: DepSourceArchetype = args.archetype ?? "vccs_chain";
  return buildVccsChain(rand);
  void archetype;
}

function buildVccsChain(rand: () => number): DepSourceGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);
  let Rx = pick(NICE_RESISTORS, rand);
  if (Rx === R1) Rx = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);
  const gm = pick(NICE_GM, rand);

  // VCCS 출력 단자: GND→b (b로 g·V_a inject). 제어: vca=a, vcb=GND → I = g·V(a)
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a",   R: R1 },
      { id: "R2", a: "a",   b: "b",   R: R2 },
      { id: "Rx", a: "a",   b: "GND", R: Rx },
      { id: "R3", a: "b",   b: "GND", R: R3 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
    vccs: [{ id: "Gx", a: "GND", b: "b", vca: "a", vcb: "GND", g: gm }],
  };

  const sol = solveMNA(solverNet);
  const Vnodes = {
    top: round3(sol.nodeVoltages["top"]),
    a:   round3(sol.nodeVoltages["a"]),
    b:   round3(sol.nodeVoltages["b"]),
  };
  const Ir3 = round3(Vnodes.b / R3);

  // 정답 대상 랜덤 선택
  const choices: Array<{ key: "Va"|"Vb"|"Ir3"; label: string; value: number }> = [
    { key: "Va",  label: "V(a)",  value: Vnodes.a },
    { key: "Vb",  label: "V(b)",  value: Vnodes.b },
    { key: "Ir3", label: "I_{R_3}", value: Ir3 },
  ];
  const t = choices[Math.floor(rand() * choices.length)];

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "V1", type: "V", value: `${V1}V`,
        pins: [
          { id: "p1", node: "top", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "R1", type: "R", value: `${R1}Ω`,
        pins: [
          { id: "p1", node: "top", side: "left" },
          { id: "p2", node: "a", side: "right" },
        ],
      },
      {
        id: "R2", type: "R", value: `${R2}Ω`,
        pins: [
          { id: "p1", node: "a", side: "left" },
          { id: "p2", node: "b", side: "right" },
        ],
      },
      {
        id: "Rx", type: "R", value: `${Rx}Ω`,
        pins: [
          { id: "p1", node: "a", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
      {
        id: "R3", type: "R", value: `${R3}Ω`,
        pins: [
          { id: "p1", node: "b", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
      {
        id: "Gx", type: "VCCS", value: `${gm}·V_x`, gain: gm, control: "V_a",
        pins: [
          { id: "p1", node: "GND", side: "bottom" },
          { id: "p2", node: "b", side: "top" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "a", label: "a (V_x)", style: "label_only" },
      { node: "b", label: "b", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "voltage", refs: ["a", "GND"], label: "V_x" },
    ],
  };

  return {
    netlist,
    solverNet,
    Vnodes,
    target: t.key,
    targetValue: t.value,
    targetLabel: t.label,
    archetype: "vccs_chain",
    values: { V1, R1, R2, Rx, R3, g_m: gm },
  };
}
