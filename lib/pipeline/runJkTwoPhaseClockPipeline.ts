import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateJkTwoPhaseClockXor, matchesJkTwoPhaseClock, type JkTwoPhaseGeneration,
} from "@/lib/generation/topologies/jkTwoPhaseClockXor";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem,
  type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runJkTwoPhaseClockPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectJkTwoPhaseClock(a?: Partial<AnalysisResult> | null): boolean {
  return matchesJkTwoPhaseClock(a);
}

const seq = (xs: Array<number | string>) => xs.join(" ");

function buildText(g: JkTwoPhaseGeneration) {
  const v = g.values, s = g.sim;
  const isXor = v.gate === "XOR";
  const gname = isXor ? "EX-OR" : "EX-NOR";
  const y1Expr = isXor ? "Y₁ = Q₁ ⊕ Q₂" : "Y₁ = (Q₁ ⊕ Q₂)′";
  const y2Expr = isXor ? "Y₂ = Q₁ ⊕ Q̄₂" : "Y₂ = (Q₁ ⊕ Q̄₂)′";

  const content =
    `그림 (가)는 JK 플립플롭과 2상 클럭발생기를 연결하여 활용한 순서논리회로이다. ` +
    `두 출력 게이트는 **${gname} 게이트**이며, 이 회로에 인가되는 클럭(CLK)과 입력 신호 J₁, K₁이 그림 (나)와 같다.`;

  const conditions = [
    "모든 소자는 이상적으로 동작하며, 각 JK 플립플롭의 초기값은 0이다.",
    "JK₁은 클럭의 **하강 에지**에서 동작하고, 2상 클럭발생기의 JK₂는 J₂ = K₂ = High이며 **Q₁의 상승 에지**에서 동작한다.",
    `출력은 ${y1Expr}, ${y2Expr}이다.`,
  ];

  const question = [
    "〈해석 절차〉에 따라 각 단계의 풀이 과정과 결과를 기술하시오.",
    "",
    "[단계 1] 각 클럭의 **하강 에지**에서 J₁, K₁의 값에 따른 JK₁의 동작(유지 / 세트 / 리셋 / 토글)을 판정하고, **Q₁의 파형**을 그림 (나)에 도시하시오.",
    "[단계 2] 2상 클럭발생기의 JK₂가 어떤 동작을 하는지 밝히고, **Q₂의 파형**을 도시하시오.",
    `[단계 3] [단계 1]·[단계 2]의 결과로부터 **출력 Y₁과 Y₂의 파형**을 도시하고, 두 출력 사이의 관계를 서술하시오.`,
  ].join("\n");

  const modeLine = v.j1.map((j, i) => `${i + 1}:${j}${v.k1[i]}(${s.modes[i]})`).join(" · ");

  const answer = [
    `[단계 1] 펄스별 (J₁K₁)과 동작 — ${modeLine}`,
    `  · Q₁ = ${seq(s.q1)}   (초기 0에서 시작, 각 하강 에지 직후 값)`,
    "",
    `[단계 2] J₂ = K₂ = High이므로 JK₂는 **Q₁의 상승 에지마다 토글**한다(2분주).`,
    `  · Q₂ = ${seq(s.q2)}`,
    "",
    `[단계 3] ${y1Expr}, ${y2Expr}`,
    `  · Y₁ = ${seq(s.y1)}`,
    `  · Y₂ = ${seq(s.y2)}`,
    `  · Q̄₂ = Q₂′이므로 **Y₂ = Y₁′** — 두 출력은 항상 서로 보수이다.`,
  ].join("\n");

  const solution = [
    `[단계 1] JK 플립플롭의 동작표는 (J,K) = (0,0) 유지 / (1,0) 세트 / (0,1) 리셋 / (1,1) 토글이다.`,
    `CLK 핀에 버블이 있으므로 **하강 에지**에서만 상태가 바뀐다. 초기 Q₁ = 0에서 출발해 펄스 순서대로 적용하면`,
    `Q₁ = ${seq(s.q1)}이다.`,
    "",
    `[단계 2] 점선 박스가 2상 클럭발생기이고, JK₂의 J₂·K₂가 모두 High(=1)이므로 JK₂는 **토글 전용**이다.`,
    `JK₂의 클럭 핀에는 버블이 없으므로 **Q₁이 0→1로 바뀌는 순간**마다 Q₂가 반전된다 — 즉 Q₁을 2분주한다.`,
    `따라서 Q₂ = ${seq(s.q2)}이다.`,
    "",
    `[단계 3] 두 출력 게이트가 ${gname}이므로 ${y1Expr}, ${y2Expr}이다.`,
    `Q̄₂는 Q₂의 보수이고 ${isXor ? "X ⊕ Y′ = (X ⊕ Y)′" : "(X ⊕ Y′)′ = X ⊕ Y"}이므로 **Y₂ = Y₁′** 이 항상 성립한다.`,
    `(원본의 AND 게이트에서는 두 출력이 겹치지 않는 2상 클럭이었지만, ${gname}으로 바꾸면 **서로 보수인 두 신호**가 된다 — 이 점이 달라진다.)`,
    `수치로 쓰면 Y₁ = ${seq(s.y1)}, Y₂ = ${seq(s.y2)}이다.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

export async function runJkTwoPhaseClockPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateJkTwoPhaseClockXor({ seed, index: i, mode });
    log.info("jk_two_phase_clock_generated", {
      mode, gate: gen.values.gate,
      j1: gen.values.j1.join(""), k1: gen.values.k1.join(""),
      y1: gen.sim.y1.join(""),
    });
    const text = buildText(gen);

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_circuit_${i + 1}`,
        label: `(가) JK 플립플롭 + 2상 클럭발생기 (${gen.values.gate === "XOR" ? "EX-OR" : "EX-NOR"} 출력)`,
        role: "main_circuit",
        diagramType: "jk_two_phase_clock_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(나) 클럭 CLK와 입력 J₁, K₁ (Q₁·Q₂·Y₁·Y₂는 학생이 도시)",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveforms.template,
      },
    ];

    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_solution_${i + 1}`,
        label: "(나) 정답 파형 — Q₁·Q₂·Y₁·Y₂",
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: gen.waveforms.solution,
      },
    ];

    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution, topicKey, figureVariants, solutionFigures,
    };
  });
}
