import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateModNCounterReset } from "@/lib/generation/topologies/modNCounterReset";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runModNCounterResetPipeline");

/**
 * T·D 혼합 동기식 **mod-N 카운터** + 미사용 상태 + 리셋 게이트 (임용 9번) 감지 — 라우팅용.
 *
 * ★ 실측 신고(2026-07-30): 이 원본이 `flipflop_mixed_app`(T+JK 상태표·파형)로 dispatch됐다.
 *   두 유형 모두 "T 플립플롭"을 쓰지만, 이쪽의 정의적 특징은 **mod-N 계수 + 미사용 상태 + 리셋**이다.
 *
 * 시그니처: (mod-N 또는 모듈러 카운터) + 카운터 + (미사용/사용되지 않는 상태 또는 리셋/CLR).
 *   ★ 양보: 파형·타이밍 도표 중심(ff_with_waveform·jk_sync_counter)·MUX·여기표는 각자 archetype.
 */
export function detectModNCounterReset(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const counter = /카운터|counter|계수기/.test(text);
  const modN = /mod[\s-]?\d|모듈러|모드\s?\d|mod-n/.test(text);
  const resetCtx = /사용되지\s*않는\s*상태|미사용\s*상태|리셋|reset|clr|클리어/.test(text);
  // 형제 archetype 양보
  if (/mux|멀티플렉서|여기표|상태\s*여기/.test(text)) return false;
  if (/타이밍\s*도표|타이밍도|파형/.test(text) && !resetCtx) return false;

  return counter && (modN || resetCtx) && (resetCtx || modN);
}

/**
 * mod-N 카운터 + 리셋 논리 (임용 9번) — 결정론 파이프라인. GPT 없음.
 *  [1] 상태도 빈칸 ㉠·㉡, [2] 사용되지 않는 상태, [3] 리셋 검출 게이트 ⓒ.
 */
export async function runModNCounterResetPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateModNCounterReset({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("mod_n_counter_reset_generated", {
      mode, n: v.n, activeLowClear: v.activeLowClear,
      blanks: [a.blank1, a.blank2], unused: a.unused.join(","), gate: a.gate,
    });

    const clrText = v.activeLowClear ? "CLR은 active-low(0일 때 리셋)" : "CLR은 active-high(1일 때 리셋)";

    const content = [
      `그림 (가)는 T 플립플롭과 D 플립플롭을 이용한 동기식 mod-${v.n} 카운터의 상태도이고,`,
      "그림 (나)는 그림 (가)에 대한 카운터 회로도이다.",
      "카운터가 정상적으로 동작하기 위한 논리 회로를 제시된 〈설계 절차〉에 따라 단계별로 구하여 서술하시오.",
      `(단, 모든 소자는 이상적으로 동작하고, 그림 (가)의 상태변수는 Q₁Q₂Q₃의 순서로 표기한 것이다.)`,
    ].join(" ");

    const conditions = [
      `(가) 상태도: 3비트 상태 Q₁Q₂Q₃가 ${v.n}개의 상태를 순환한다(mod-${v.n}).`,
      `(나) 회로: FF1(T), FF2(D), FF3(T)과 공통 클럭(CLK), 비동기 클리어(CLR) 입력. ${clrText}.`,
      "ⓒ는 미사용 상태를 검출해 CLR을 구동하는 논리 게이트이다.",
    ];

    const question = [
      "[단계 1] 그림 (가)의 상태도에서 ㉠과 ㉡에 해당하는 상태를 순서대로 구한다.",
      "[단계 2] 그림 (가)의 상태도에서 사용되지 않는 상태를 구한다.",
      `[단계 3] 사용되지 않는 상태가 주어질 경우, Q₁Q₂Q₃ = 000으로 리셋(reset)하기 위한 논리 회로를 완성할 때 그림 (나)의 ⓒ에 해당하는 논리 게이트를 도시한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ㉠ = ${a.blank1}, ㉡ = ${a.blank2}`,
      `[단계 2] 사용되지 않는 상태: ${a.unused.join(", ")}`,
      `[단계 3] ⓒ = ${a.gate} (입력 ${a.gateInputs})`,
    ].join("\n");

    const solution = [
      `[단계 1] 상태도는 000부터 이진 상향으로 ${v.n}개 상태를 순환한다: ${Array.from({ length: v.n }, (_, k) => k.toString(2).padStart(3, "0")).join(" → ")} → 000. ` +
        `순서대로 대응시키면 ㉠ = ${a.blank1}, ㉡ = ${a.blank2}이다.`,
      `[단계 2] 3비트로 표현 가능한 상태는 8개(000~111)인데 mod-${v.n} 카운터는 ${v.n}개만 쓴다. ` +
        `따라서 사용되지 않는 상태는 ${a.unused.length}개: ${a.unused.join(", ")}.`,
      `[단계 3] 카운터가 계수 ${v.n}에 해당하는 상태 ${a.detectState}에 도달하는 순간 CLR을 활성화해 000으로 되돌린다. ` +
        `이 상태를 검출하는 곱항은 ${a.gateInputs}이고, ${clrText}이므로 ⓒ에는 **${a.gate}**를 둔다. ` +
        `(검출 즉시 비동기 클리어가 걸리므로 ${a.detectState} 상태는 과도적으로만 나타난다.)`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_modn_state_${i + 1}`,
        label: `(가) mod-${v.n} 카운터 상태도 (㉠·㉡ 빈칸)`,
        role: "state_diagram",
        diagramType: "jk_state_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_modn_circuit_${i + 1}`,
        label: "(나) 카운터 회로도 (T·D 플립플롭 + CLR + ⓒ)",
        role: "implementation_circuit",
        diagramType: "mod_n_counter_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
