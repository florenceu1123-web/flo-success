import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSrFfMuxSequential } from "@/lib/generation/topologies/srFfMuxSequential";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSrFfMuxSequentialPipeline");

/**
 * SR 플립플롭 + 2×1 MUX 상태순환 순차회로 (임용 10번 정보과) — 결정론 파이프라인.
 *  GPT 호출 없음 (구조·풀이 모두 결정론 generator에서 도출).
 */
export async function runSrFfMuxSequentialPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSrFfMuxSequential({ seed, mode });
    log.info("sr_ff_mux_generated", {
      cycle: gen.cycleSeq.map((s) => `${(s >> 1) & 1}${s & 1}`).join("→"),
      select: gen.selectVar,
      blankFf: gen.blankFf,
      S: gen.blankSExpr,
      R: gen.blankRExpr,
      blanks: gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`).join(","),
    });

    // 빈칸 FF의 S·R MUX와 라벨
    const blankMuxes = gen.circuitDiagram.muxes.filter((m) => m.blank);
    const sMux = blankMuxes.find((m) => m.target.startsWith("S"))!;
    const rMux = blankMuxes.find((m) => m.target.startsWith("R"))!;
    const sLabel = sMux.target.replace("_", ""); // "S_B" → "SB"
    const rLabel = rMux.target.replace("_", "");
    const blankBitName = gen.blankFf === "FF_B" ? "Q_B" : "Q_A"; // 빈칸 FF 출력
    const blankFfName = gen.blankFf === "FF_B" ? "B" : "A";

    const cycleStr = gen.cycleSeq
      .map((s) => `${(s >> 1) & 1}${s & 1}`)
      .join(" → ") + ` → ${gen.cycleSeq.length ? `${(gen.cycleSeq[0] >> 1) & 1}${gen.cycleSeq[0] & 1}` : ""}`;

    const content = [
      "그림 (가)와 같이 순환하는 2비트 순서회로를 SR 플립플롭과 멀티플렉서(MUX)를 이용하여 설계하고자 한다.",
      "제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.",
      `(단, MUX의 선택 신호선은 S, 입력은 I₀·I₁, 출력은 데이터입력 중 선택된 값이며, 모든 MUX의 선택선은 ${gen.selectVar}로 공통 연결된다.`,
      "SR 플립플롭의 출력은 각각 Q_A·Q_B이고, 여기표(S·R)는 표준 SR-FF 규칙을 따른다. 무관(don't care)항은 ×로 표기한다.)",
    ].join(" ");

    const conditions = [
      `SR 플립플롭 2개(출력 Q_A·Q_B) + 2×1 MUX 4개로 구성된 2비트 순환 순서회로`,
      `상태 순환: ${cycleStr} (입력 없는 자율 순환)`,
      `MUX1→S_A, MUX2→R_A (FF A) / MUX3→S_B, MUX4→R_B (FF B), 공통 선택선 ${gen.selectVar}`,
      `그림 (다)에서 MUX${gen.blankFf === "FF_B" ? "3·4" : "1·2"}의 데이터입력 ㉠·㉡·㉢·㉣은 빈칸 — 학생이 도출`,
    ];

    const question = [
      `[단계 1] 진리표 (나)를 이용하여 플립플롭 입력 ${sLabel}, ${rLabel}를 최소항의 합(SOP)으로 각각 구한다. (단, 무관항은 1로 한다.)`,
      `[단계 2] 그림 (다)의 플립플롭의 출력을 이용하여 ${sMux.id}의 입력 ㉠·㉡과 ${rMux.id}의 입력 ㉢·㉣을 각각 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${sLabel} = ${gen.blankSExpr},  ${rLabel} = ${gen.blankRExpr}`,
      `[단계 2] ${gen.blankAnswers.map((b) => `${b.symbol} = ${b.answer}`).join(",  ")}`,
    ].join("\n");

    const solution = [
      `[단계 1] SR 플립플롭 여기표(Q→Q⁺): 0→0 ⟹ S=0·R=× / 0→1 ⟹ S=1·R=0 / 1→0 ⟹ S=0·R=1 / 1→1 ⟹ S=×·R=0.`,
      `  (나)의 현재상태 ${blankBitName}와 다음상태 ${blankBitName}(t+1)로 ${sLabel}·${rLabel} 열을 채운 뒤, 무관항을 1로 두고`,
      `  (Q_A, Q_B) 2변수 카르노맵으로 최소화하면:  ${sLabel} = ${gen.blankSExpr},  ${rLabel} = ${gen.blankRExpr}`,
      `[단계 2] 모든 MUX 선택선은 ${gen.selectVar}이므로, ${sLabel}·${rLabel}를 ${gen.selectVar}로 분해한다.`,
      `  · ${gen.selectVar}=0 → I₀, ${gen.selectVar}=1 → I₁ 이고, 각 입력은 나머지 변수 ${gen.dataVar}의 함수(${gen.dataVar} / ${gen.dataVar}' / 0 / 1)가 된다.`,
      `  · FF ${blankFfName}의 출력 ${blankBitName}·${blankBitName}'를 데이터입력으로 사용하여:`,
      `    ${gen.blankAnswers.map((b) => `${b.symbol} = ${b.answer}`).join(",  ")}`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_state_diagram_${i + 1}`,
        label: "(가) 상태 순환도",
        role: "state_diagram",
        diagramType: "concept_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_state_table_${i + 1}`,
        label: "(나) 상태표 (현재상태·다음상태·SR 입력)",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.stateTable,
      },
      {
        id: `fig_impl_circuit_${i + 1}`,
        label: "(다) SR 플립플롭 + 2×1 MUX 구현 회로",
        role: "implementation_circuit",
        diagramType: "sr_ff_mux_sequential_circuit",
        diagram: gen.circuitDiagram,
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
    };
  });
}
