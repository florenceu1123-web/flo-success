import type { DcThevenin2srcCircuitDiagram, DcTheveninEquivCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 2개 전압원 병렬가지 → 테브난 등가 (임용 3번 회로이론) — 전용 archetype.
 *
 *  (가): 단자 a(상)–b(하) 사이 2개 병렬 leg.
 *    leg1: a ─R1─ m1 ─V1(±)─ b,  leg2: a ─R2─ m2 ─V2(±)─ b.
 *  (나): 테브난 등가 = V_T 직렬 R_T, 단자 a–b.
 *  Millman: R_T = R1∥R2 = R1R2/(R1+R2),  V_T = R_T·(s1·V1/R1 + s2·V2/R2).
 *
 *  ★ generic thevenin 파이프라인은 archetype="voltage_divider"(단일 전원 분압) 하드코딩이라 2번째
 *    전압원을 잃음(실측: V1만 남은 단일 루프) → 전용 결정론 archetype 필수.
 *  ★ 값은 손으로 고른 예시가 아니라 규칙 열거+필터(R_T·V_T 깔끔), 원본 튜플 제외.
 */

export type DcTheveninTwoSourceGeneration = {
  values: { V1: number; R1: number; s1: 1 | -1; V2: number; R2: number; s2: 1 | -1 };
  /** answer: Rt·Vt 항상. 변형(전력)이면 Rl(=Rt, 최대전력 부하)·Pmax 추가. */
  answer: { Rt: number; Vt: number; Rl?: number; Pmax?: number };
  withLoad: boolean;  // 변형(전력 문제)이면 true → 부하 R_L 연결된 완성 회로
  circuitDiagram: DcThevenin2srcCircuitDiagram;  // (가)
  equivDiagram: DcTheveninEquivCircuitDiagram;    // (나)
};

type Params = { V1: number; R1: number; s1: 1 | -1; V2: number; R2: number; s2: 1 | -1 };
// 원본 튜플 (참조·검증 전용, 생성 풀 제외): 2Ω+12V(+위) ∥ 6Ω+6V(−위) — ★극성 반대★.
//   V_T = 1.5·(12/2 − 6/6) = 1.5·5 = 7.5V, R_T = 1.5Ω.
const ORIGINAL: Params = { V1: 12, R1: 2, s1: 1, V2: 6, R2: 6, s2: -1 };

function r3(x: number): number { return Math.round(x * 1000) / 1000; }
function nice(x: number): boolean {
  return Math.abs(x * 2 - Math.round(x * 2)) < 1e-6; // 0.5 배수
}

function solve(p: Params, withLoad = false): DcTheveninTwoSourceGeneration {
  const Rt = (p.R1 * p.R2) / (p.R1 + p.R2);
  const Vt = Rt * (p.s1 * p.V1 / p.R1 + p.s2 * p.V2 / p.R2);
  // 변형(전력): 부하 R_L에 최대 전력 전달 → R_L = R_T, P_max = V_T²/(4·R_T).
  const Rl = withLoad ? Rt : undefined;
  const Pmax = withLoad ? (Vt * Vt) / (4 * Rt) : undefined;
  const loadLabel = withLoad ? "R_L" : undefined;

  const vLabel = (v: number) => `${v}[V]`;  // 크기 라벨 (극성은 +/− 단자로 렌더)
  const circuitDiagram: DcThevenin2srcCircuitDiagram = {
    r1Label: `${p.R1}[Ω]`, v1Label: vLabel(p.V1), v1PlusTop: p.s1 === 1,
    r2Label: `${p.R2}[Ω]`, v2Label: vLabel(p.V2), v2PlusTop: p.s2 === 1,
    loadLabel,
  };
  const equivDiagram: DcTheveninEquivCircuitDiagram = {
    rtLabel: "R_T[Ω]", vtLabel: "V_T[V]", vtPlusTop: Vt >= 0, loadLabel,
  };

  return {
    values: { ...p },
    answer: { Rt: r3(Rt), Vt: r3(Vt), ...(withLoad ? { Rl: r3(Rl!), Pmax: r3(Pmax!) } : {}) },
    withLoad,
    circuitDiagram, equivDiagram,
  };
}

/** 규칙 열거+필터: R_T(=R1∥R2) 0.5배수, V_T 0.5배수·|V_T|∈[2,30], 원본 제외. */
function buildSpace(mode: GenerationMode): Params[] {
  const out: Params[] = [];
  const Rs = [1, 2, 3, 4, 6, 8, 12];
  const Vs = [3, 4, 6, 8, 9, 10, 12, 15, 18];
  // ★ exam_similar = 원본 구조(극성 반대: 한쪽 +위·다른쪽 −위) 보존. exam_variant = 같은 극성(둘 다 +위)로 변형.
  const signCombos: Array<[1 | -1, 1 | -1]> = mode === "exam_variant" ? [[1, 1]] : [[1, -1], [-1, 1]];
  for (const R1 of Rs) for (const R2 of Rs) {
    if (R1 > R2) continue; // 중복 제거
    const Rt = (R1 * R2) / (R1 + R2);
    if (!nice(Rt)) continue;
    for (const V1 of Vs) for (const V2 of Vs) for (const [s1, s2] of signCombos) {
      const p: Params = { V1, R1, s1, V2, R2, s2 };
      const a = solve(p, mode === "exam_variant").answer;
      // ★ V_T 양수만 (원본 7.5처럼 깔끔). 극성 반대 조합 [1,-1]/[−1,1] 중 양수 나오는 방향이 선택됨.
      if (!nice(a.Vt) || a.Vt < 2 || a.Vt > 30) continue;
      // ★ 변형(전력): P_max = V_T²/(4R_T)도 0.5배수로 깔끔하게.
      if (mode === "exam_variant" && (!a.Pmax || !nice(a.Pmax) || a.Pmax < 1 || a.Pmax > 50)) continue;
      if (V1 === ORIGINAL.V1 && R1 === ORIGINAL.R1 && V2 === ORIGINAL.V2 && R2 === ORIGINAL.R2 && s1 === ORIGINAL.s1 && s2 === ORIGINAL.s2) continue;
      out.push(p);
    }
  }
  return out;
}
const SIMILAR_SPACE = buildSpace("exam_similar");
const VARIANT_SPACE = buildSpace("exam_variant");

export function generateDcTheveninTwoSource(args: { seed?: number; mode: GenerationMode }): DcTheveninTwoSourceGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const isVariant = args.mode === "exam_variant";
  const space = isVariant ? VARIANT_SPACE : SIMILAR_SPACE;
  // 변형(전력 문제)이면 부하 R_L 연결된 완성 회로 + 최대전력.
  return solve(pick(space.length ? space : SIMILAR_SPACE, rand), isVariant);
}

/** 원본 검증용 (생성 풀 제외 튜플: 2Ω+12V ∥ 6Ω+6V → R_T=1.5·V_T=10.5). */
export function __originalDcTheveninForVerify(): DcTheveninTwoSourceGeneration {
  return solve(ORIGINAL);
}
