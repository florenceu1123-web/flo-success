import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateTff3AutonomousCounter } from "@/lib/generation/topologies/tff3AutonomousCounter";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTff3AutonomousCounterPipeline");

// 감지기는 분류기 0-PRE와 **같은 구현**을 쓴다 — 두 곳에 복사하면 한쪽만 고쳐져 어긋난다.
//   판별 근거·실측 이력은 `lib/analysis/detectTff3AutonomousCounter.ts` 주석 참조.
export { detectTff3AutonomousCounter } from "@/lib/analysis/detectTff3AutonomousCounter";

/**
 * T-FF 3개 자율 카운터 (임용 11번) — 결정론 파이프라인. GPT 없음.
 *  (가) 상태도 · (나) 상태표(㉠·㉡ 빈칸) · (다) 회로도(㉢ 블록)
 *  [1] ㉠·㉡ · [2] T_B 최소 SOP · [3] ㉢을 2입력 게이트 2개로 구현
 */
export async function runTff3AutonomousCounterPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateTff3AutonomousCounter({ seed, mode });
    const b = gen.blanks;
    log.info("tff3_autonomous_counter_generated", {
      mode,
      gateKind: gen.gateKind,
      expressions: gen.expressions,
      tbSop: gen.tbSop,
      cycle: gen.cycle.join("→"),
      nonCyclic: gen.nonCyclic.map((x) => `${x.state}→${x.next}`).join(","),
      blanks: `㉠=${b.blank1.values.join("")} ㉡=${b.blank2.values.join("")}`,
    });

    const gate = gen.gateKind === "NAND" ? "NAND" : "NOR";
    const seq = (vals: number[]) => vals.join(", ");

    const content = [
      "그림 (가)는 상위부터 하위 순(C B A)으로 상태가 표시된 상태도(state diagram)이다.",
      "표 (나)와 그림 (다)는 T 플립플롭을 이용하여 (가)의 상태도에 동작하는 논리 회로를 설계하는 과정이다.",
      "(가)를 이용하여 (나)의 ㉠, ㉡을 순서대로 작성하고, T 플립플롭의 입력 T_B에 대한 불 함수와",
      "(다)의 ㉢에 해당하는 논리 회로를 제시된 〈설계 절차〉에 따라 구하여 순서대로 서술하시오.",
      "(단, 모든 소자는 이상적으로 동작한다.)",
    ].join(" ");

    const conditions = [
      `(가) 상태도: 3비트 상태 CBA 중 ${gen.cycle.length}개가 하나의 고리로 순환하고, ` +
        `나머지 ${gen.nonCyclic.length}개(${gen.nonCyclic.map((x) => x.state).join(", ")})는 순환하지 않고 고리로 진입만 한다.`,
      "(나) 상태표: 현재 상태 CₙBₙAₙ → 다음 상태 Cₙ₊₁Bₙ₊₁Aₙ₊₁ → T 플립플롭 입력 T_C·T_B·T_A. " +
        "★ ㉠은 Bₙ₊₁ **열 전체**, ㉡은 T_B **열 전체**가 비어 있다.",
      "(다) 회로: T 플립플롭 3개(위에서부터 C·B·A)와 공통 클럭(CLK). 각 플립플롭은 Q와 보수 Q̅를 출력하고, " +
        "그 되먹임이 각 조합 논리 블록의 입력이 된다. ㉢은 T_B를 만드는 논리 회로이다.",
    ];

    const question = [
      "[단계 1] 그림 (가)를 이용하여, 표 (나)에서 Bₙ₊₁(㉠)과 T_B(㉡)를 각각 순차대로 작성한다.",
      "[단계 2] [단계 1]에서 구한 결과를 이용하여 T 플립플롭의 입력 T_B에 대한 불 함수를 구한다. " +
        "(단, 불 함수는 간략화된 최소항의 합으로 표현한다.)",
      `[단계 3] [단계 2]에서 구한 결과를 이용하여 (다)의 ㉢에 해당하는 논리 회로를 2입력 ${gate} 게이트 2개만으로 구성하여 그린다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ㉠(Bₙ₊₁) = ${seq(b.blank1.values)} / ㉡(T_B) = ${seq(b.blank2.values)}  (현재 상태 000부터 111까지 순서대로)`,
      `[단계 2] T_B = ${gen.tbSop}`,
      `[단계 3] ${gen.tbGate.g1} / ${gen.tbGate.g2}  →  ㉢ = G₂`,
    ].join("\n");

    // 풀이 — 상태표 전체를 펼쳐 검산 가능하게 남긴다(정답만 주면 채점이 안 된다).
    const tableLines = gen.rows.map(
      (r) => `    ${r.cur} → ${r.next}  |  T_C T_B T_A = ${r.tc}${r.tb}${r.ta}`,
    );
    const tbOnes = gen.rows.filter((r) => r.tb === 1).map((r) => r.cur);

    const solution = [
      "[단계 1] T 플립플롭의 특성식 Qₙ₊₁ = Qₙ ⊕ T 를 뒤집으면 여기식 T = Qₙ ⊕ Qₙ₊₁ 이다. " +
        "즉 다음 상태는 상태도에서 읽고, 각 T는 현재 비트와 다음 비트의 배타적 논리합으로 정해진다.",
      `  상태도에서 고리는 ${gen.cycle.join(" → ")} → ${gen.cycle[0]} 이고, ` +
        `${gen.nonCyclic.map((x) => `${x.state}는 ${x.next}로 진입`).join(", ")}한다.`,
      "  상태표 전체는 다음과 같다.",
      ...tableLines,
      `  따라서 ㉠(Bₙ₊₁ 열) = ${seq(b.blank1.values)}, ㉡(T_B 열) = ${seq(b.blank2.values)} 이다.`,
      `[단계 2] T_B = 1 인 현재 상태는 ${tbOnes.join(", ")} (CBA) 이다. ` +
        `이를 C·B·A 3변수 카르노도에 옮겨 인접한 1을 묶으면 간략화된 최소항의 합은 T_B = ${gen.tbSop} 이다.`,
      `[단계 3] 위 식은 2입력 ${gate} 게이트 2개만으로 그대로 떨어진다.` +
        (gen.gateKind === "NAND"
          ? " 앞의 NAND는 두 입력을 묶어 인버터로 쓴다."
          : " T 플립플롭이 Q 와 Q̅ 를 모두 출력하므로 보수 리터럴은 인버터 없이 얻는다."),
      `  ${gen.tbGate.g1}`,
      `  ${gen.tbGate.g2}`,
      `  즉 ㉢ 은 위 두 ${gate} 게이트를 직렬로 연결한 회로이고, 그 출력이 T_B 로 플립플롭 B 에 들어간다.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_tff3_state_${i + 1}`,
        label: "(가) 상태도 (CBA 순, 사이클 + 비순환 상태)",
        role: "state_diagram",
        diagramType: "jk_state_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_tff3_table_${i + 1}`,
        label: "(나) 상태표 (㉠ = Bₙ₊₁ 열, ㉡ = T_B 열 빈칸)",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.stateTable,
      },
      {
        id: `fig_tff3_circuit_${i + 1}`,
        label: "(다) T 플립플롭 3개 논리 회로 (㉢ = T_B 논리 회로)",
        role: "implementation_circuit",
        diagramType: "tff3_counter_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    // 풀이 [단계 2] 카르노도는 정답·풀이 영역에만 노출한다(문제 figure 아님).
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_tff3_kmap_${i + 1}`,
        label: "[단계 2] T_B 카르노도",
        role: "kmap",
        diagramType: "kmap",
        diagram: gen.tbKmap,
      },
    ];

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey,
      figureVariants,
      solutionFigures,
    };
  });
}
