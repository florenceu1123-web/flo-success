import type { CircuitComponent, CircuitNetlist, ViTheveninMaxPowerCircuitDiagram } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * 2전압원 + 2전류원 테브난 등가 + 최대전력 전달 (임용 5번 회로이론 형식) — 전용 archetype.
 *
 *  원본 토폴로지 (5 노드 TL·BL·c·a·GND):
 *    TL ─R1─ c ─R2─ a            (상단 rail, R1=2kΩ R2=3kΩ)
 *    TL ─V1─ BL ─V2─ GND         (좌측 직렬 전압원 2개: 3V, 1V)
 *    c ─[I_up↑ ∥ I_down↓]─ GND   (중앙 전류원 2개: 5mA, 3mA)
 *    a ─R_L─ b(=GND)             (우측 부하)
 *
 *  ★ generic max_power(thevenin vi_two_source)는 이 2V+2I 구조를 잃음 → 전용 archetype.
 *
 *  3단계 풀이:
 *   [단계 1] a–b 개방 → 마디 c 전압 V_c (= V_th, a 개방이라 R2 무전류 → V_a=V_c).
 *   [단계 2] a–b 단락 → a→b 전류 I_ab (= 단락전류 I_sc).
 *   [단계 3] R_th = V_th/I_sc = R1+R2. 최대전력 R_L=R_th, P_L=V_th²/(4R_th).
 */

export type ViTheveninMaxPowerGeneration = {
  netlist: CircuitNetlist;
  circuitDiagram: ViTheveninMaxPowerCircuitDiagram;
  answer: {
    Vc: number;       // 단계1: V_c = V_th (V)
    Iab: number;      // 단계2: I_sc (A)
    IabMa: number;    // mA 표기
    Rth: number;      // R1+R2 (Ω)
    RL: number;       // = Rth
    Pmax: number;     // V_th²/(4 Rth) (W)
    PmaxMw: number;   // mW 표기
  };
  values: { V1: number; V2: number; Iup: number; Idown: number; R1: number; R2: number };
};

type ParamSet = { V1: number; V2: number; Iup_mA: number; Idown_mA: number; R1_k: number; R2_k: number };

// 사전검증 세트 — 깔끔한 답. 첫 세트 = 원본(3V·1V·5mA·3mA·2k·3k → V_c=8V·I_ab=1.6mA·R_th=5k·P_L=3.2mW).
const PARAM_SETS: ParamSet[] = [
  { V1: 3, V2: 1, Iup_mA: 5, Idown_mA: 3, R1_k: 2, R2_k: 3 }, // 원본
  { V1: 4, V2: 2, Iup_mA: 4, Idown_mA: 1, R1_k: 2, R2_k: 2 },
  { V1: 2, V2: 2, Iup_mA: 6, Idown_mA: 2, R1_k: 1, R2_k: 3 },
  { V1: 5, V2: 1, Iup_mA: 3, Idown_mA: 1, R1_k: 2, R2_k: 4 },
  { V1: 6, V2: 2, Iup_mA: 2, Idown_mA: 1, R1_k: 3, R2_k: 3 },
];

function solveSet(s: ParamSet): ViTheveninMaxPowerGeneration {
  const Vtl = s.V1 + s.V2;                 // 좌측 직렬 전압원 합 (V)
  const R1 = s.R1_k * 1000, R2 = s.R2_k * 1000;
  const Iup = s.Iup_mA / 1000, Idown = s.Idown_mA / 1000;

  // 검산용 MNA — 개방(a 분리)
  const openNet: SolverNetwork = {
    nodeIds: ["TL", "c", "a"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "TL", b: "c", R: R1 },
      { id: "R2", a: "c", b: "a", R: R2 },
      { id: "RL_open", a: "a", b: "GND", R: 1e12 }, // 개방 ≈ 큰 저항
    ],
    vsources: [{ id: "Vsrc", a: "TL", b: "GND", V: Vtl }],
    isources: [
      { id: "Iup", a: "GND", b: "c", I: Iup },
      { id: "Idown", a: "c", b: "GND", I: Idown },
    ],
  };
  const openSol = solveMNA(openNet);
  const Vc = round3(openSol.nodeVoltages["c"]);

  // 단락(a=GND)
  const shortNet: SolverNetwork = {
    ...openNet,
    resistors: [
      { id: "R1", a: "TL", b: "c", R: R1 },
      { id: "R2", a: "c", b: "a", R: R2 },
      { id: "RL_short", a: "a", b: "GND", R: 1e-9 },
    ],
  };
  const shortSol = solveMNA(shortNet);
  const Iab = (shortSol.nodeVoltages["c"] - shortSol.nodeVoltages["a"]) / R2; // c→a→(단락)→b
  const Rth = R1 + R2;
  const RL = Rth;
  const Vth = Vc;
  const Pmax = (Vth * Vth) / (4 * Rth);

  const netlist = buildNetlist(s);
  const circuitDiagram: ViTheveninMaxPowerCircuitDiagram = {
    v1Label: `${s.V1}V`, v2Label: `${s.V2}V`,
    r1Label: `${s.R1_k}kΩ`, r2Label: `${s.R2_k}kΩ`,
    iupLabel: `${s.Iup_mA}mA`, idownLabel: `${s.Idown_mA}mA`,
  };
  return {
    netlist,
    circuitDiagram,
    answer: {
      Vc, Iab: round3(Iab), IabMa: round3(Iab * 1000),
      Rth, RL, Pmax: round3(Pmax), PmaxMw: round3(Pmax * 1000),
    },
    values: { V1: s.V1, V2: s.V2, Iup: s.Iup_mA, Idown: s.Idown_mA, R1, R2 },
  };
}

function buildNetlist(s: ParamSet): CircuitNetlist {
  const GND = "GND";
  const components: CircuitComponent[] = [
    { id: "V1", type: "V", value: `${s.V1}V`, pins: [{ id: "p", node: "TL", side: "top" }, { id: "n", node: "BL", side: "bottom" }] },
    { id: "V2", type: "V", value: `${s.V2}V`, pins: [{ id: "p", node: "BL", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "R1", type: "R", value: `${s.R1_k}kΩ`, pins: [{ id: "p", node: "TL", side: "left" }, { id: "n", node: "c", side: "right" }] },
    { id: "R2", type: "R", value: `${s.R2_k}kΩ`, pins: [{ id: "p", node: "c", side: "left" }, { id: "n", node: "a", side: "right" }] },
    { id: "Iup", type: "I", value: `${s.Iup_mA}mA`, pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: "c", side: "top" }] },
    { id: "Idown", type: "I", value: `${s.Idown_mA}mA`, pins: [{ id: "p", node: "c", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "R_L", type: "R", value: "R_L", pins: [{ id: "p", node: "a", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];
  return {
    components, ground: GND,
    nodeAnnotations: [
      { node: "c", label: "c", style: "label_only" },
      { node: "a", label: "a", style: "terminal_dot" },
      { node: GND, label: "b", style: "terminal_dot" },
    ],
    positions: {
      TL: { x: 120, y: 130 }, c: { x: 340, y: 130 }, a: { x: 560, y: 130 },
      BL: { x: 120, y: 290 }, GND: { x: 340, y: 430 },
    },
  };
}

export function generateViTheveninMaxPower(args: { seed?: number }): ViTheveninMaxPowerGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  return solveSet(pick(PARAM_SETS, rand));
}
