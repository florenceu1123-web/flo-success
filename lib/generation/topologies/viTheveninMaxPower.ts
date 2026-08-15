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

/** 원본 튜플(3V·1V·5mA·3mA·2k·3k → V_c=8V·I_ab=1.6mA·R_th=5k·P_L=3.2mW) — 참조·검산 전용, 생성 금지. */
const ORIGINAL: ParamSet = { V1: 3, V2: 1, Iup_mA: 5, Idown_mA: 3, R1_k: 2, R2_k: 3 };

/** 원본의 도출량 — V_c = (3+1) + (5−3)·2 = 8[V], R_th = 2+3 = 5[kΩ] (→ I_sc=1.6mA·P_L=3.2mW). */
const ORIGINAL_VC = ORIGINAL.V1 + ORIGINAL.V2 + (ORIGINAL.Iup_mA - ORIGINAL.Idown_mA) * ORIGINAL.R1_k;
const ORIGINAL_RTH = ORIGINAL.R1_k + ORIGINAL.R2_k;

/** 기약분수의 분모 (a/b, b>0). 값이 깔끔한지(분모가 작은지) 판정할 때 쓴다. */
function denomOf(num: number, den: number): number {
  const scale = 1000;
  let a = Math.round(num * scale), b = Math.round(den * scale);
  const g = (x: number, y: number): number => (y === 0 ? Math.abs(x) : g(y, x % y));
  const d = g(a, b) || 1;
  a /= d; b /= d;
  return Math.abs(b);
}

/**
 * 값 공간 — **규칙 열거 + 필터**(특정 예시 hardcode 금지, [[feedback_generic_code]]).
 *
 * 닫힌형(모두 정수 단위: V[V]·I[mA]·R[kΩ] → V=I·R 가 그대로 성립):
 *   · 개방:  V_c = (V1+V2) + (I_up − I_down)·R1        ← 이상 전류원이 R1에 흘리는 전압강하
 *   · R_th = R1 + R2                                    ← 전원 무효화(V 단락·I 개방)
 *   · I_sc = V_c / R_th,  P_max = V_c²/(4·R_th)
 * 필터: V_c 정수(4~30) · R_th 3~10kΩ · I_sc·P_max의 기약분모 ≤ 5(지저분한 소수 방지) ·
 *       순 주입전류 ≥ 1mA(전류원이 답에 실제로 기여) · **원본 튜플 제외**.
 */
function buildSpace(): ParamSet[] {
  const out: ParamSet[] = [];
  for (let V1 = 1; V1 <= 6; V1++) {
    for (let V2 = 1; V2 <= 6; V2++) {
      for (let Iup = 2; Iup <= 8; Iup++) {
        for (let Idown = 1; Idown < Iup; Idown++) {
          for (let R1_k = 1; R1_k <= 4; R1_k++) {
            for (let R2_k = 1; R2_k <= 6; R2_k++) {
              const Inet = Iup - Idown;
              if (Inet < 1) continue;
              const Vc = V1 + V2 + Inet * R1_k;
              if (!Number.isInteger(Vc) || Vc < 4 || Vc > 30) continue;
              const Rth = R1_k + R2_k;
              if (Rth < 3 || Rth > 10) continue;
              if (denomOf(Vc, Rth) > 5) continue;                 // I_sc [mA]
              if (denomOf(Vc * Vc, 4 * Rth) > 5) continue;        // P_max [mW]
              const s: ParamSet = { V1, V2, Iup_mA: Iup, Idown_mA: Idown, R1_k, R2_k };
              if (isOriginal(s)) continue;                        // ★ 원본 튜플은 생성하지 않는다
              // ★ 소자값만 다르고 **도출량이 원본과 같은** 조합도 제외한다 —
              //   V_c·R_th가 같으면 I_sc·P_L까지 전부 같아져 사실상 원본과 같은 문항이 된다(실측).
              if (Vc === ORIGINAL_VC && Rth === ORIGINAL_RTH) continue;
              out.push(s);
            }
          }
        }
      }
    }
  }
  return out;
}

function isOriginal(s: ParamSet): boolean {
  return s.V1 === ORIGINAL.V1 && s.V2 === ORIGINAL.V2 && s.Iup_mA === ORIGINAL.Iup_mA &&
    s.Idown_mA === ORIGINAL.Idown_mA && s.R1_k === ORIGINAL.R1_k && s.R2_k === ORIGINAL.R2_k;
}

/** 결정론 해시 — 열거 순서대로 두면 앞쪽이 전부 비슷한 값이라 다양성이 죽는다. */
function hashOf(s: ParamSet): number {
  const k = `${s.V1}|${s.V2}|${s.Iup_mA}|${s.Idown_mA}|${s.R1_k}|${s.R2_k}`;
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const ALL_SETS: ParamSet[] = buildSpace().sort((a, b) => hashOf(a) - hashOf(b));
// ★ 유사/변형이 **같은 문제를 내지 않도록** 풀을 절반씩 나눈다(이전엔 mode를 무시해 두 모드가 완전히 동일했다).
const SIMILAR_SETS: ParamSet[] = ALL_SETS.filter((_, i) => i % 2 === 0);
const VARIANT_SETS: ParamSet[] = ALL_SETS.filter((_, i) => i % 2 === 1);

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

export function generateViTheveninMaxPower(
  args: { seed?: number; mode?: string },
): ViTheveninMaxPowerGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const pool = args.mode === "exam_variant" ? VARIANT_SETS : SIMILAR_SETS;
  return solveSet(pick(pool, rand));
}

/** 스모크 전용 — 값 공간 점검(원본 미포함·풀 비중첩 단언). */
export const __viThevSpace = { ALL_SETS, SIMILAR_SETS, VARIANT_SETS, ORIGINAL, isOriginal, solveSet };
