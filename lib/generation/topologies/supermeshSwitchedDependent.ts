import type { GenerationMode, SupermeshSwitchedDependentCircuitDiagram } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import { round3 } from "./_helpers";

/**
 * 스위치 2-state + 종속전류원 + supermesh DC 회로 (임용 8번 회로이론) — 전용 결정론 archetype.
 *
 *  ★ Vision 토폴로지 추출이 이 회로(SW·R4·I_s 직렬 가지 + 종속전류원)를 신뢰성 있게 못 읽어
 *    (SW_top floating·1A 분리·mesh 4개 오생성) generic topology_driven으로는 재현 불가.
 *    → 사용자 정답으로 역검증한 고정 토폴로지를 박고 MNA solver로 정답을 도출한다.
 *
 *  고정 토폴로지 (mesh 3개, 4 세로가지 + 상단 R 3개):
 *    A(V_s+) ─R1─ V₁ ─R2─ V₂ ─R3─ (우외곽 wire) ─ GND
 *      │          │          │
 *     V_s     0.2·V₂        [SW─R4─I_s]      모두 GND 복귀
 *    (10V)   (종속전류원)   (스위치 아래 전류원)
 *
 *  ★ 종속전류원 제어전압 = 가운데 노드 V₂ (단계2에서 구하는 전압). 원본 라벨은 0.2V₃지만,
 *    우상단은 R3 거쳐 접지(0V)라 0.2V₃=0이 되어 정답이 안 나온다. 사용자 정답
 *    (가:V₁=20·I₁=−1 / 나:I₁=−4·I₂=2·I₃=3)을 재현하는 제어노드는 V₂뿐 — solver 역검증 완료.
 *
 *  (가) SW 개방: I_s 가지 단선 → V₁·I₁ 도출.   V₂ = V_s/(3−gR),  V₁ = 2·V₂,  I₁ = (V_s−V₁)/R₁.
 *  (나) SW 단락: supermesh(I_s 가지 활성) → V₂·I₂ 도출.
 *      V₂ = (V_s+2·I_s·R)/(3−gR),  V₁ = 2·V₂−I_s·R,  I₁=(V_s−V₁)/R₁, I₂=(V₁−V₂)/R₂, I₃=V₂/R₃.
 *      supermesh 조건: I₃ − I₂ = I_s (I_s 가지가 두 메쉬 공유).
 */

export type SupermeshSwitchedDependentGeneration = {
  values: { Vs: number; R1: number; R2: number; R3: number; R4: number; g: number; Is: number };
  /** (가) SW 개방 정답 */
  open: { V1: number; I1: number };
  /** (나) SW 단락 정답 */
  closed: { V1: number; V2: number; I1: number; I2: number; I3: number };
  diagramOpen: SupermeshSwitchedDependentCircuitDiagram;
  diagramClosed: SupermeshSwitchedDependentCircuitDiagram;
};

/**
 * 사전검증 PARAM_SETS — gR=2(분모 3−gR=1)로 정수 정답 보장. 모두 solver로 재검증됨.
 * ★ 원본값(Vs=10,R=10,g=0.2,Is=1)은 참조·물리검증 전용 → 생성 풀에서 제외 (예시 베끼기 금지).
 */
const PARAM_SETS: Array<{ Vs: number; R: number; g: number; Is: number }> = [
  { Vs: 10, R: 10, g: 0.2, Is: 2 }, // (가) V₁=20·I₁=−1 / (나) V₂=50·I₂=3·I₃=5
  { Vs: 20, R: 10, g: 0.2, Is: 1 }, // (가) V₁=40·I₁=−2 / (나) V₂=40·I₂=3·I₃=4
  { Vs: 30, R: 10, g: 0.2, Is: 2 }, // (가) V₁=60·I₁=−3 / (나) V₂=70·I₂=5·I₃=7
  { Vs: 40, R: 10, g: 0.2, Is: 1 }, // (가) V₁=80·I₁=−4 / (나) V₂=60·I₂=5·I₃=6
  { Vs: 50, R: 10, g: 0.2, Is: 2 }, // (가) V₁=100·I₁=−5 / (나) V₂=90·I₂=7·I₃=9
];

/** SolverNetwork 구성 — closed=true면 I_s 가지(SW 단락) 추가. */
function buildNet(Vs: number, R: number, g: number, Is: number, closed: boolean): SolverNetwork {
  return {
    nodeIds: ["A", "V1", "V2"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "A", b: "V1", R },
      { id: "R2", a: "V1", b: "V2", R },
      { id: "R3", a: "V2", b: "GND", R }, // 우외곽 wire가 V₃를 GND로 흡수 → R3는 V₂↔GND
    ],
    vsources: [{ id: "V_s", a: "A", b: "GND", V: Vs }],
    // 종속전류원 0.2·V₂: GND→V₁ 주입 (제어 = 가운데 노드 V₂)
    vccs: [{ id: "G_dep", a: "GND", b: "V1", vca: "V2", vcb: "GND", g }],
    // (나) SW 단락: I_s 전류원이 V₂에 주입 (SW─R4 직렬, I_s가 가지 전류 강제 → R4는 figure 전용)
    isources: closed ? [{ id: "I_s", a: "GND", b: "V2", I: Is }] : [],
  };
}

function diagramOf(
  swState: "open" | "closed",
  Vs: number,
  R: number,
  g: number,
  Is: number,
): SupermeshSwitchedDependentCircuitDiagram {
  return {
    swState,
    vsLabel: `${Vs}V`,
    r1Label: `${R}Ω`,
    r2Label: `${R}Ω`,
    r3Label: `${R}Ω`,
    r4Label: `${R}Ω`,
    depLabel: `${g}V₂`,
    isLabel: `${Is}A`,
    v1Label: "V₁",
    v2Label: "V₂",
    showSupermesh: swState === "closed",
  };
}

/**
 * 임용 8번 archetype generator. mode·seed로 PARAM_SET 하나를 선택해 solver로 정답 도출.
 * (exam_similar·exam_variant 모두 구조가 본질 — 값만 사전검증 세트에서 변경.)
 */
export function generateSupermeshSwitchedDependent(args: {
  mode?: GenerationMode;
  seed?: number;
}): SupermeshSwitchedDependentGeneration {
  // ★ PARAM_SET은 seed에서 직접 분산한다. generateInParallel은 seed=baseSeed+i*7919로 주는데
  //   makeRand(seed) 첫 출력이 seed 차이에 둔감해 count=3에서 같은 세트가 뽑힌다(다양성 0).
  //   seed를 인덱스에 직접 modulo(7919 mod 5 = 4 → i=0·1·2가 서로 다른 인덱스)하면 한 호출 내
  //   문제들이 서로 다른 값 세트를 갖는다.
  const seed = Math.abs(Math.floor(args.seed ?? 0));
  const { Vs, R, g, Is } = PARAM_SETS[seed % PARAM_SETS.length];

  const open = solveMNA(buildNet(Vs, R, g, Is, false));
  const closed = solveMNA(buildNet(Vs, R, g, Is, true));

  const I1open = round3((Vs - open.nodeVoltages.V1) / R);
  const I1closed = round3((Vs - closed.nodeVoltages.V1) / R);
  const I2closed = round3((closed.nodeVoltages.V1 - closed.nodeVoltages.V2) / R);
  const I3closed = round3(closed.nodeVoltages.V2 / R);

  return {
    values: { Vs, R1: R, R2: R, R3: R, R4: R, g, Is },
    open: {
      V1: round3(open.nodeVoltages.V1),
      I1: I1open,
    },
    closed: {
      V1: round3(closed.nodeVoltages.V1),
      V2: round3(closed.nodeVoltages.V2),
      I1: I1closed,
      I2: I2closed,
      I3: I3closed,
    },
    diagramOpen: diagramOf("open", Vs, R, g, Is),
    diagramClosed: diagramOf("closed", Vs, R, g, Is),
  };
}
