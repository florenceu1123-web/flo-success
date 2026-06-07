import type { CircuitComponent, CircuitNetlist, MeasurementMark, NodeAnnotation } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 스위치 RL + 2 독립 직류전원 + 종속전원(2i_A) 과도응답 (임용 2022 B-7 형식) archetype.
 *
 * 고정 토폴로지 (SPDT 3단자 셀렉터 common→n_top; 종속원은 전원 귀환경로 바닥 lane):
 *   n_top ─[4Ω]─ GND               (i_A = V_top/R_a, 아래로)
 *   n_top ─[L 3H]─ n_a ─[6Ω]─ GND  (i_L, v_o = V_a = V_top)
 *   전원− ─ n_s ─[2i_A]─ GND        (종속전압원 V(n_s)=k·i_A, 전원 귀환전류가 통과)
 *   단자1: 12V(+n_top, −n_s)        ← 단계1(steady)
 *   단자2: 40V·2Ω                   ← 단계2
 *
 * 해석 (CCVS 2i_A가 전원− 와 GND 사이; i_A는 4Ω 전류):
 *   V(n_s)=k·i_A=k·V_top/R_a,  전원전압 = V_top − V(n_s) = V_top·(1−k/R_a)=facA·V_top.
 *   [단계1] SW=단자1: facA·V_top=V2 → V_top=V2/facA → i_L(0)=V_top/R_o, v_o(0)=V_top.
 *   [단계2] SW=단자2 (V1·2Ω): V_top·[facA + R1/R_a + R1/R_o]=V1 → V_top.
 *           i_L(∞)=V_top/R_o. R_th = R_o + (R_a ∥ (R1/facA)), τ=L/R_th(=3/8s).
 *           i_L(t) = i_L(∞) + (i_L(0)−i_L(∞))e^(−t/τ),  v_o(t) = R_o·i_L(t).
 */

export type SwitchedRlDependentGeneration = {
  netlist: CircuitNetlist;
  values: {
    V1: number; V2: number; R1: number; Ra: number; Ro: number; L: number; k: number;
  };
  solution: {
    iL0: number; vo0: number;      // [단계1] 정상상태 (단자1)
    iLinf: number; voInf: number;  // [단계2] t→∞ (단자2)
    tau: number;
    iLExpr: string;                // i_L(t)
    voExpr: string;                // v_o(t)
  };
  variant?: boolean;               // 기출변형(코일·R_a 교환 + 2v_A) 여부
};

const R1 = 2, Ra = 4, Ro = 6, L = 3, k = 2; // 고정 (k/Ra=0.5 → 깔끔)
// 토폴로지C: i_L0=V2/3 정수 → V2 3의 배수, i_L∞=V1/8 정수 → V1 8의 배수
const V1_CANDS = [40, 80, 24, 48];
const V2_CANDS = [12, 24, 36];
// 변형(단일루프): i_L0=V2/18 정수 → V2 18배수, i_L∞=V1/20 정수 → V1 20배수
const V1_CANDS_V = [40, 60];
const V2_CANDS_V = [18, 36];

function round(x: number, d = 3): number {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
}

const coef = (m: number) => (Math.abs(m) === 1 ? "" : `${Math.abs(m)}`);

export function generateSwitchedRlDependent(args: { seed?: number; variant?: boolean }): SwitchedRlDependentGeneration {
  const rand = makeRand(args.seed);
  if (args.variant) return generateSwitchedRlVariant(rand);
  // 종속전원 2i_A는 전원 귀환경로(바닥 lane)에 위치: 전원− → n_s → 2i_A → GND.
  //   V(n_s)=k·i_A,  i_A=V_top/Ra,  부하(4Ω·6Ω)는 n_top↔GND, v_o=V_top, i_L=V_top/Ro.
  //   전원은 n_top과 n_s 사이 → V_top − V_ns = (source). V_ns=k·V_top/Ra.
  // SPDT 셀렉터: 단자1=V2(직결) / 단자2=V1(2Ω 경유). 단계1=단자1, 단계2=단자2.
  const facA = 1 - k / Ra;                 // 1−2/4=0.5  (V_top−V_ns = facA·V_top)
  const vtop1Of = (b: number) => b / facA; // 단계1: V_top − V_ns = V2 → V_top = V2/facA
  // 단계2(V1·2Ω): V_top[facA + R1/Ra + R1/Ro] = V1
  const c2 = facA + R1 / Ra + R1 / Ro;     // 0.5+0.5+1/3 = 4/3
  const vtop2Of = (a: number) => a / c2;

  // i_L(0) ≠ i_L(∞) 이 되는 (V1,V2) 조합 선택.
  let V1 = 40, V2 = 12;
  const combos: Array<{ V1: number; V2: number }> = [];
  for (const a of V1_CANDS) for (const b of V2_CANDS) {
    const iL0 = vtop1Of(b) / Ro;
    const iLinf = vtop2Of(a) / Ro;
    if (Math.abs(iL0 - iLinf) > 1e-6 && Number.isInteger(iL0) && Number.isInteger(iLinf)) {
      combos.push({ V1: a, V2: b });
    }
  }
  if (combos.length > 0) { const c = pick(combos, rand); V1 = c.V1; V2 = c.V2; }

  // [단계1] SW=단자1 (V2 직결): V_top1 = V2/facA
  const Vtop1 = vtop1Of(V2);
  const iL0 = round(Vtop1 / Ro);
  const vo0 = round(Vtop1);          // v_o = V_top1
  // [단계2] SW=단자2 (V1, 2Ω 경유) t→∞
  const Vtop2 = vtop2Of(V1);
  const iLinf = round(Vtop2 / Ro);
  const voInf = round(Vtop2);        // v_o = V_top2
  // 과도(단계2): L이 보는 R_th = Ro + (Ra ∥ (R1/facA)).  (40V off, 종속원 유지)
  const Rbr = R1 / facA;                                // 2/0.5 = 4
  const Rth = Ro + (Ra * Rbr) / (Ra + Rbr);             // 6 + 4∥4 = 8
  const tau = round(L / Rth);  // 0.375

  // i_L(t) = iLinf + (iL0−iLinf)e^(−t/τ),  v_o(t) = Ro·i_L(t)
  const dIL = round(iL0 - iLinf);
  const invTau = round(1 / tau); // e^(−t/0.375) = e^(−2.667t)
  const iLExpr = `${iLinf} ${dIL >= 0 ? "+" : "−"} ${coef(dIL)}e^(−${invTau}t) [A]`;
  const voExpr = `${voInf} ${dIL >= 0 ? "+" : "−"} ${coef(round(dIL * Ro))}e^(−${invTau}t) [V]`;

  // ── netlist (전용 렌더러용) ──
  const GND = "GND";
  const components: CircuitComponent[] = [
    // ※ 핀은 검증용 닫힌 회로 표현. 실제 SPDT 셀렉터 도면은 전용 렌더러가 좌표로 그림.
    { id: "V_40", type: "V", value: `${V1}V`, pins: [{ id: "p", node: "n1", side: "top" }, { id: "n", node: "n_s", side: "bottom" }] },
    { id: "R_s", type: "R", value: `${R1}Ω`, pins: [{ id: "p", node: "n1", side: "left" }, { id: "n", node: "n_sw", side: "right" }] },
    { id: "SW", type: "SW", state: "closed", value: "t=0", pins: [{ id: "p", node: "n_sw", side: "left" }, { id: "n", node: "n_top", side: "right" }] },
    { id: "V_12", type: "V", value: `${V2}V`, pins: [{ id: "p", node: "n_top", side: "top" }, { id: "n", node: "n_s", side: "bottom" }] },
    { id: "R_a", type: "R", value: `${Ra}Ω`, pins: [{ id: "p", node: "n_top", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "L_o", type: "L", value: `${L}H`, pins: [{ id: "p", node: "n_top", side: "left" }, { id: "n", node: "n_a", side: "right" }] },
    { id: "R_o", type: "R", value: `${Ro}Ω`, pins: [{ id: "p", node: "n_a", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "CCVS", type: "CCVS", value: `${k}i_A`, gain: `${k}i_A`, pins: [{ id: "p", node: "n_s", side: "left" }, { id: "n", node: GND, side: "right" }] },
  ];
  const nodeAnnotations: NodeAnnotation[] = [];
  const measurementMarks: MeasurementMark[] = [
    { kind: "current", refs: ["L_o"], label: "i_L(t)" },
    { kind: "current", refs: ["R_a"], label: "i_A" },
    { kind: "voltage", refs: ["n_a", "GND"], label: "v_o(t)" },
  ];

  return {
    netlist: { components, ground: GND, nodeAnnotations, measurementMarks, positions: {} },
    values: { V1, V2, R1, Ra, Ro, L, k },
    solution: { iL0, vo0, iLinf, voInf, tau, iLExpr, voExpr },
  };
}

/**
 * 기출변형 = 원본의 쌍대(dual) 회로. V↔I, 직렬↔병렬, L↔C, CCVS↔CCCS, v_o↔i_o.
 *  병렬 노드(V_C): 전류원(선택) ∥ G_a ∥ C ∥ G_o ∥ CCCS(2i_a).
 *    숫자는 그대로(Ω→S, H→F, V→A): G_a=4S, G_o=6S, G1=2S, C=3F.
 *    i_a = G_a 통과전류, CCCS = 2i_a (병렬, +2G_a 등가 → 안정).
 *    정상상태(C 개방): I_source = V_C(G_a + G_o + 2G_a) = V_C(3G_a+G_o).
 *    [단계1] I2 직결: V_C0 = I2/(3G_a+G_o).  [단계2] I1∥G1: V_C∞ = I1/(G1+3G_a+G_o).
 *    i_o = G_o·V_C,  τ = C/(G1+3G_a+G_o).  (쌍대: i_L↔V_C, v_o↔i_o)
 */
function generateSwitchedRlVariant(rand: () => number): SwitchedRlDependentGeneration {
  // 쌍대 — 숫자는 원본과 동일(단위만 Ω→S, H→F, V→A)
  const Ga = Ra, Go = Ro, G1 = R1, Cap = L;   // 4S, 6S, 2S, 3F
  const Gloop = 3 * Ga + Go;          // 18 (단계1)
  const Gth = G1 + Gloop;             // 20 (단계2 = 1/R_th_dual)

  let I1 = 40, I2 = 18;
  const combos: Array<{ I1: number; I2: number }> = [];
  for (const a of V1_CANDS_V) for (const b of V2_CANDS_V) {
    const vC0 = b / Gloop;
    const vCinf = a / Gth;
    if (Math.abs(vC0 - vCinf) > 1e-6 && Number.isInteger(vC0) && Number.isInteger(vCinf)) {
      combos.push({ I1: a, I2: b });
    }
  }
  if (combos.length > 0) { const c = pick(combos, rand); I1 = c.I1; I2 = c.I2; }

  // solution 필드명은 유지하되 의미는 쌍대(iL0→V_C0, vo0→i_o0 ...)
  const vC0 = round(I2 / Gloop);
  const vCinf = round(I1 / Gth);
  const io0 = round(vC0 * Go);        // i_o = Go·V_C
  const ioInf = round(vCinf * Go);
  const tau = round(Cap / Gth);       // 3/20 = 0.15
  const invTau = round(1 / tau);
  const dV = round(vC0 - vCinf);
  const vCExpr = `${vCinf} ${dV >= 0 ? "+" : "−"} ${coef(dV)}e^(−${invTau}t) [V]`;
  const dIo = round(dV * Go);
  const ioExpr = `${ioInf} ${dIo >= 0 ? "+" : "−"} ${coef(dIo)}e^(−${invTau}t) [A]`;

  const GND = "GND";
  const components: CircuitComponent[] = [
    { id: "I_40", type: "I", value: `${I1}A`, pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: "n1", side: "top" }] },
    { id: "G1", type: "R", value: `${G1}S`, pins: [{ id: "p", node: "n1", side: "left" }, { id: "n", node: "n_top", side: "right" }] },
    { id: "SW", type: "SW", state: "closed", value: "t=0", pins: [{ id: "p", node: "n1", side: "left" }, { id: "n", node: "n_top", side: "right" }] },
    { id: "I_12", type: "I", value: `${I2}A`, pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: "n_top", side: "top" }] },
    { id: "G_a", type: "R", value: `${Ga}S`, pins: [{ id: "p", node: "n_top", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "C_o", type: "C", value: `${Cap}F`, pins: [{ id: "p", node: "n_top", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "G_o", type: "R", value: `${Go}S`, pins: [{ id: "p", node: "n_top", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "CCCS", type: "CCCS", value: `${k}i_a`, gain: `${k}i_a`, pins: [{ id: "p", node: "n_top", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];
  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["n_top", "GND"], label: "v_C(t)" },
    { kind: "current", refs: ["G_o"], label: "i_o(t)" },
    { kind: "current", refs: ["G_a"], label: "i_a" },
  ];

  return {
    netlist: { components, ground: GND, nodeAnnotations: [], measurementMarks, positions: {} },
    values: { V1: I1, V2: I2, R1: G1, Ra: Ga, Ro: Go, L: Cap, k },
    solution: { iL0: vC0, vo0: io0, iLinf: vCinf, voInf: ioInf, tau, iLExpr: vCExpr, voExpr: ioExpr },
    variant: true,
  };
}
