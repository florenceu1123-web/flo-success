import type { GenerationMode, ModNCounterCircuitDiagram, JkStateDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * T·D 플립플롭 혼합 동기식 **mod-N 카운터** — 상태도 빈칸 + 미사용 상태 + 리셋 논리 게이트
 * (임용 9번 형식) 전용 archetype.
 *
 *  (가) 상태도: 3비트 상태 N개가 고리로 순환(Q₁Q₂Q₃ 표기), 그중 2개가 빈칸 ㉠·㉡.
 *  (나) 카운터 회로: FF1(T)·FF2(D)·FF3(T) + 공통 CLK + CLR(비동기 리셋) + 리셋 검출 게이트 ⓒ.
 *
 *  〈설계 절차〉
 *   [단계 1] 상태도의 ㉠·㉡에 해당하는 상태
 *   [단계 2] 사용되지 않는 상태(8 − N개)
 *   [단계 3] 미사용 상태에서 Q₁Q₂Q₃=000으로 리셋하기 위한 ⓒ 게이트
 *
 *  ★ 기존 archetype으로 재현 불가 — `flipflop_mixed_app`은 T+JK **상태표·파형** 형식,
 *    `dff_state_design`은 상태도→D입력→게이트(자율 순환, 리셋·미사용 상태 개념 없음),
 *    `jk_sync_counter`는 타이밍 도표 중심이다. 실측 로그에서 이 원본이 flipflop_mixed_app으로 갔다.
 *
 *  ★ 리셋 논리: mod-N 카운터는 계수 N(=이진 N)에 **도달하는 순간** CLR로 000을 만든다.
 *    검출 대상 = 상태 N의 비트 패턴. CLR이 **active-low**면 검출 AND의 부정 = **NAND**,
 *    active-high면 **AND**. 1인 비트만 게이트 입력으로 쓰고 0인 비트는 반전 입력으로 넣는다.
 */

export type ModNCounterGeneration = {
  values: {
    n: number;                 // 계수 N (mod-N)
    activeLowClear: boolean;   // CLR이 active-low인가
    blankIdx: [number, number]; // 상태도에서 빈칸 처리한 순번
  };
  answer: {
    blank1: string;            // ㉠
    blank2: string;            // ㉡
    unused: string[];          // 사용되지 않는 상태들
    gate: string;              // ⓒ 게이트 (예: "3입력 NAND")
    gateInputs: string;        // 게이트 입력 표기 (예: "Q₁·Q₂·Q₃")
    detectState: string;       // 리셋을 발생시키는 상태 (계수 N의 비트 패턴)
  };
  stateDiagram: JkStateDiagram;          // (가) 고리 상태도 (빈칸 포함)
  circuitDiagram: ModNCounterCircuitDiagram; // (나) 카운터 회로
};

const SUB = ["₁", "₂", "₃"];
/** 3비트 이진 문자열 (Q₁Q₂Q₃ = MSB→LSB) */
function bits3(v: number): string {
  return v.toString(2).padStart(3, "0");
}

export function generateModNCounterReset(args: { seed?: number; mode: GenerationMode }): ModNCounterGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const variant = args.mode === "exam_variant";

  // 유사 = 원본과 같은 mod-7 계열(7 제외하고 6·5는 변형으로), 변형 = 다른 계수.
  //   ★ 원본 그대로(mod-7 + 같은 빈칸 위치)는 피하고, 계수·빈칸 위치를 바꾼다.
  // ★ 유사·변형이 **서로 다른 계수**를 쓰도록 풀을 분리한다(겹치면 같은 문제가 나온다 — 실측).
  //   원본은 mod-7이므로 유사는 7(구조 보존), 변형은 5·6(계수 변경 → 미사용 상태·게이트도 달라짐).
  const n = variant ? pick([5, 6], rand) : 7;
  const activeLowClear = pick([true, false], rand);

  // 상태 고리: 000 → 001 → … → (N−1) → 000  (이진 상향 계수)
  const cycle = Array.from({ length: n }, (_, i) => bits3(i));
  // 빈칸 2개 — 처음(000)은 주어진 상태로 두고, 중간에서 두 개를 가린다.
  const candidates = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const i1 = candidates[Math.floor(rand() * candidates.length)];
  const rest = candidates.filter((c) => Math.abs(c - i1) >= 2);
  const i2 = (rest.length ? rest : candidates.filter((c) => c !== i1))[
    Math.floor(rand() * (rest.length ? rest.length : candidates.length - 1))
  ];
  const [b1, b2] = [i1, i2].sort((a, b) => a - b);

  const shown = cycle.map((s, i) => (i === b1 ? "㉠" : i === b2 ? "㉡" : s));
  const unused = Array.from({ length: 8 }, (_, v) => bits3(v)).filter((s) => !cycle.includes(s));

  // 리셋 검출: 계수 N에 도달한 상태(= bits3(n))를 감지해 CLR.
  const detect = bits3(n);
  const ones = detect.split("").map((c, i) => ({ c, i })).filter((x) => x.c === "1");
  const zeros = detect.split("").map((c, i) => ({ c, i })).filter((x) => x.c === "0");
  // 답·풀이는 평문이므로 반전 표기는 유니코드 오버바로 (LaTeX \overline{}가 그대로 노출되던 것 수정).
  const inputsText = [
    ...ones.map((x) => `Q${SUB[x.i]}`),
    ...zeros.map((x) => `Q̅${SUB[x.i]}`),
  ].join("·");
  const gate = `${detect.length}입력 ${activeLowClear ? "NAND" : "AND"} 게이트`;

  const stateDiagram: JkStateDiagram = { cycle: shown, nonCyclic: [] };
  const circuitDiagram: ModNCounterCircuitDiagram = {
    ffTypes: ["T", "D", "T"],
    clearActiveLow: activeLowClear,
    gateLabel: "ⓒ",
    gateKind: activeLowClear ? "NAND" : "AND",
    detectState: detect,
    modulus: n,
  };

  return {
    values: { n, activeLowClear, blankIdx: [b1, b2] },
    answer: {
      blank1: cycle[b1],
      blank2: cycle[b2],
      unused,
      gate,
      gateInputs: inputsText,
      detectState: detect,
    },
    stateDiagram,
    circuitDiagram,
  };
}
