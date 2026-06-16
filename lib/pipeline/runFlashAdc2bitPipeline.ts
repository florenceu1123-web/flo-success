import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFlashAdc2bit } from "@/lib/generation/topologies/flashAdc2bit";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFlashAdc2bitPipeline");

/**
 * 2비트 플래시 ADC (임용 6번 복합형) — 결정론 파이프라인. GPT 없음.
 *  (가) 회로 + (나) 진리표(빈칸) + (다) 인코더 논리회로(정답) + 3단계 풀이.
 */
export async function runFlashAdc2bitPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFlashAdc2bit({ seed, mode });
    log.info("flash_adc_2bit_generated", {
      Vtop: gen.values.Vtop, R: gen.values.Rohm,
      blanks: gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`).join(","),
      q1: gen.q1Expr, q0: gen.q0Expr,
    });

    const blankList = gen.blankAnswers.map((b) => b.symbol).join(", ");
    const content = [
      `그림 (가)는 입력 전압신호 V_in을 2비트 디지털 신호로 출력하기 위한 회로(2비트 플래시 ADC)이다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`,
      `(단, 비교기의 V_+ > V_−인 경우 High, 그렇지 않을 경우 Low로 가정하고, MSB는 최상위 비트이다.)`,
    ].join(" ");

    const conditions = [
      `기준전압 ${gen.values.Vtop}V + 저항 사다리(${gen.values.Rohm}Ω) → 기준 V_a<V_b<V_c, 비교기 3개(C_2·C_1·C_0)`,
      `(나) 진리표의 ${blankList}은 빈칸 — 온도계 코드로 채움`,
      `출력 Q_1(MSB)·Q_0, 무관(don't care)항은 1로 처리 가능 (최소화)`,
    ];

    const question = [
      `[단계 1] V_in 입력조건이 진리표 (나)와 같을 때 ${blankList}를 순서대로 구한다.`,
      `[단계 2] [단계 1]의 진리표와 무관(don't care)항을 고려하여 출력 Q_1과 Q_0을 최소화된 불 함수로 각각 구한다. (High=1, Low=0)`,
      `[단계 3] [단계 2]에서 구한 불 함수를 AND, OR, NOT 게이트 1개씩 사용하여 그림 (가)의 점선 내부에 논리회로로 도시한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${gen.blankAnswers.map((b) => `${b.symbol} = ${b.answer}`).join(",  ")}`,
      `[단계 2] Q_1 = ${gen.q1Expr},  Q_0 = ${gen.q0Expr}`,
      `[단계 3] Q_1 = C_1 (직결), Q_0 = NOT(C_1) → AND(C_0, C_1') → OR(C_2, ·) (아래 (다) 회로)`,
    ].join("\n");

    const solution = [
      `[단계 1] 온도계 코드(thermometer): V_in이 기준전압을 넘을 때마다 아래 비교기부터 High.`,
      `  V_b<V_in≤V_c → C_2=Low, C_1=High, C_0=High (${gen.blankAnswers[0].symbol}=${gen.blankAnswers[0].answer}, ${gen.blankAnswers[1].symbol}=${gen.blankAnswers[1].answer}).`,
      `  V_a<V_in≤V_b → C_2=Low, C_1=Low, C_0=High (${gen.blankAnswers[2].symbol}=${gen.blankAnswers[2].answer}, ${gen.blankAnswers[3].symbol}=${gen.blankAnswers[3].answer}).`,
      `[단계 2] 유효 코드 (C_2C_1C_0): 000→00, 001→01, 011→10, 111→11. 나머지(010·100·101·110)는 don't care.`,
      `  3변수 카르노맵 최소화 (don't care 활용): Q_1 = ${gen.q1Expr}, Q_0 = ${gen.q0Expr}.`,
      `[단계 3] Q_1=C_1은 직결(MSB). Q_0=${gen.q0Expr}: NOT 1개(C_1'), AND 1개(C_0·C_1'), OR 1개(+C_2) — (다) 인코더 논리회로.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_flash_adc_${i + 1}`,
        label: "(가) 2비트 플래시 ADC 회로",
        role: "original_circuit",
        diagramType: "flash_adc_2bit_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_truth_${i + 1}`,
        label: `(나) 진리표 (${blankList} 빈칸)`,
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.truthTable,
      },
    ];
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_encoder_${i + 1}`,
        label: "(다) 인코더 논리회로 (정답)",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.encoderLogic,
      },
    ];

    return {
      id: randomUUID(),
      content, conditions, question, answer, solution,
      topicKey, figureVariants, solutionFigures,
    };
  });
}
