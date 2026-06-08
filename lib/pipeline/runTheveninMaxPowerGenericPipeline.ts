/**
 * 회로이론 테브난 + 최대전력(+종속전원) generic 파이프라인 (임용 9번류).
 *  예시 하드코딩(maxPowerTransfer의 vi_two_source) 대신 업로드 구조를 GPT가 추출 →
 *  종속원 보존 테브난 결정론 풀이 → (가) 회로 + (나) V-I 그래프 + 3단계 풀이.
 */

import { randomUUID } from "node:crypto";
import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { extractTheveninNetlist, type TheveninExtraction } from "@/lib/generation/circuitTheory/extractTheveninNetlist";
import { buildContextHint, generateInParallel } from "./_common";
import {
  type AnalysisResult, type CircuitNetlist, type FigureVariant,
  type GeneratedProblem, type GenerationMode, type TopicKey, type WaveformDiagram,
} from "@/types";

const log = createLogger("lib/pipeline/runTheveninMaxPowerGenericPipeline");

/** 가변 R 값을 "R"로 숨긴 렌더용 netlist (학생이 도출). */
function blankUnknown(netlist: CircuitNetlist, unknownId?: string): CircuitNetlist {
  if (!unknownId) return netlist;
  return {
    ...netlist,
    components: netlist.components.map((c) => (c.id === unknownId ? { ...c, value: "R" } : c)),
  };
}

/** (나) V_RL–I_RL 테브난 직선: (0, V_th) → (I_sc, 0). */
function buildViGraph(ex: TheveninExtraction): WaveformDiagram {
  return {
    signals: [{ name: "V_RL", shape: "linear", samples: [{ t: 0, v: ex.Vth }, { t: ex.Isc, v: 0 }] }],
    xAxis: { symbol: "I_RL", unit: "A" },
    unit: { value: "V" },
    yMarkers: [{ v: ex.Vth, label: `V_th=${ex.Vth}V` }],
    markers: [{ t: ex.Isc, label: `I_sc=${ex.Isc}A` }],
  };
}

type Txt = { content: string; conditions: string[]; question: string; answer: string; solution: string };

const TEXT_SYSTEM = `너는 회로이론(테브난 등가 + 최대전력 전달) 임용 문제의 본문·문항·풀이를 쓰는 엔진이다.
회로와 정확한 계산 결과(V_th, R_th, I_sc, P_max, 가변 R 값)가 주어진다. 주어진 수치를 절대 바꾸지 마라.
출력 JSON 한 개만(코드펜스 금지): {content, question, solution}
- content: 회로 설명 + "그림 (나)의 V_RL–I_RL 그래프를 이용해 <해석 절차>대로 구하시오"
- question: 3단계 <해석 절차> (\\n 구분): [단계1] 테브난 전압 V_th를 R의 함수로 제시하고 (나) 그래프로 R[Ω]을 구한다,
  [단계2] I_sc[A]를 구한다, [단계3] 부하 R_L에 최대전력 전달 시 P_L[W]을 구한다.
- solution: 단계별 풀이 (테브난 등가, R_L=R_th, P_max=V_th²/(4R_th)). 결과는 주어진 수치와 일치.
- 종속전원(2i_x)이 있으면 그 영향을 풀이에 반영(독립원 zero out만으로 R_th 구하지 말 것 — V_oc/I_sc).`;

async function writeText(ex: TheveninExtraction): Promise<Txt> {
  const openai = getOpenAI();
  const comp = ex.netlist.components
    .map((c) => `  - ${c.id}(${c.type})${c.id === ex.unknownId ? " [미지 R]" : c.value !== undefined ? ` = ${c.value}` : ""}`)
    .join("\n");
  const answer = [
    ex.unknownId && ex.unknownValue !== undefined ? `R = ${ex.unknownValue}${ex.unknownUnit || "Ω"}` : null,
    `V_th = ${ex.Vth}V, R_th = ${ex.Rth}Ω`,
    `I_sc = ${ex.Isc}A`,
    `R_L = R_th = ${ex.RLopt}Ω일 때 P_L(max) = ${ex.Pmax}W`,
  ].filter(Boolean).join(" / ");

  const conditions = [
    ...ex.netlist.components.filter((c) => c.value !== undefined && c.id !== ex.unknownId).map((c) => `${c.id} = ${c.value}`),
    ex.hasDependent ? "종속전원 포함 (제어전류 i_x)" : "",
    "그림 (나): V_RL–I_RL 직선 (절편 V_th, I_sc 제시)",
    ex.unknownId ? "R은 가변(학생 도출)" : "",
  ].filter(Boolean);

  const userPrompt = [
    `[소자]\n${comp}`,
    `[계산 결과 — 변경 금지] V_th=${ex.Vth}V, R_th=${ex.Rth}Ω, I_sc=${ex.Isc}A, P_max=${ex.Pmax}W` +
      (ex.unknownId ? `, 가변 R=${ex.unknownValue}${ex.unknownUnit || "Ω"}` : ""),
    `[종속전원] ${ex.hasDependent ? "있음 (2i_x 등) — V_oc/I_sc로 R_th 계산" : "없음"}`,
    `[확정 정답] ${answer}`,
    ``,
    `위 회로의 임용 스타일 문제(content/question/solution) 작성. answer는 [확정 정답] 그대로.`,
  ].join("\n");

  let parsed: Partial<Txt> = {};
  try {
    const c = await withRateLimitRetry(() =>
      openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "system", content: TEXT_SYSTEM }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" }, max_tokens: 1600,
      }),
    );
    parsed = JSON.parse(c.choices[0]?.message?.content ?? "{}") as Partial<Txt>;
  } catch (e) { log.warn("text_failed", { reason: String(e) }); }

  return {
    content: parsed.content ?? "그림 (가)는 전압원이 포함된 저항회로이고, (나)는 부하 R_L의 V_RL–I_RL 관계이다. <해석 절차>에 따라 구하시오.",
    conditions,
    question: parsed.question ?? "[단계 1] V_th를 R의 함수로 제시하고 (나)로 R을 구한다.\n[단계 2] I_sc를 구한다.\n[단계 3] 최대전력 P_L을 구한다.",
    answer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

export async function runTheveninMaxPowerGenericPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  void buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const ex = await extractTheveninNetlist({ analysis, mode, seed });
    log.info("thevenin_generic_generated", { Vth: ex.Vth, Rth: ex.Rth, Isc: ex.Isc, Pmax: ex.Pmax, hasDependent: ex.hasDependent });
    const text = await writeText(ex);
    const renderNetlist = blankUnknown(ex.netlist, ex.unknownId);
    const figureVariants: FigureVariant[] = [
      { id: `fig_main_${i + 1}`, label: "(가) 주어진 회로 (단자 a-b 부하)", role: "original_circuit", diagramType: "analog_netlist", diagram: renderNetlist as unknown as Record<string, unknown> },
      { id: `fig_vi_${i + 1}`, label: "(나) V_RL–I_RL 그래프", role: "main_graph", diagramType: "waveform", diagram: buildViGraph(ex) as unknown as Record<string, unknown> },
    ];
    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution,
      topicKey, figureVariants,
    };
  });
}
