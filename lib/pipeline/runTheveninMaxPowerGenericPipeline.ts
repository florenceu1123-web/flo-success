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
import { decimalToFraction } from "@/lib/format/fraction";
import {
  type AnalysisResult, type CircuitNetlist, type FigureVariant,
  type GeneratedProblem, type GenerationMode, type TopicKey,
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

/** (나) V_RL–I_RL 테브난 직선 — 전용 vi_line_graph (세로 길고 가로 좁게, 절편 명확). */
function buildViGraph(ex: TheveninExtraction): { Vth: number; Isc: number; vSymbol: string; iSymbol: string; vUnit: string; iUnit: string } {
  return { Vth: ex.Vth, Isc: ex.Isc, vSymbol: "V_RL", iSymbol: "I_RL", vUnit: "V", iUnit: "A" };
}

type Txt = { content: string; conditions: string[]; question: string; answer: string; solution: string };

/**
 * 원본이 (나) V-I 그래프 형식인지 판정.
 *
 * ★ 이 파이프라인은 임용 9번(그래프로 가변 R을 읽는 형식)을 위해 만들어져 **항상** 그래프를
 *   붙이고 [단계1]을 "그래프로 R을 구한다"로 썼다. 그런데 같은 계열이라도 임용 7번처럼
 *   **그래프 없이 V_oc → I_sc → R_L·P_L**만 묻는 원본이 있다(실측 신고). 그 경우 없는 그림을
 *   만들고 발문도 원본과 달라진다 → 원본 구조에 맞춰 분기한다([[절대규칙 0]] 구조 보존).
 */
export function originalHasViGraph(analysis: AnalysisResult | null | undefined): boolean {
  const text = [
    analysis?.topic ?? "",
    analysis?.interpretation ?? "",
    (analysis?.relatedConcepts ?? []).join(" "),
    (analysis?.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
  // ★★ 가장 견고한 신호 — 인벤토리에 **값이 기호인 저항**(예: value "R")이 있으면 이 형식이다.
  //   그 저항값을 (나) 그래프의 절편으로 역산하는 것이 문항의 뼈대라, 표현이 어떻게 흔들려도 남는다.
  //   실측(2026-08-04): Vision이 "그래프"도 "(나)"도 안 쓴 회차에서 그래프·미지 R이 통째로 빠져
  //   **R 값이 그림에 노출**되고 (나)가 사라졌다(사용자 신고).
  const symbolicR = (analysis?.componentInventory ?? []).some(
    (c) => String(c?.type ?? "").toUpperCase() === "R" &&
      /^[A-Za-z](_[A-Za-z0-9]+)?$/.test(String(c?.value ?? "").trim()),
  );
  if (symbolicR) return true;
  if (/그래프|직선|특성\s*곡선|v_rl|v-i|i-v|절편/i.test(text)) return true;
  // ★ 낱말에만 걸면 놓친다 (실측 2026-08-04): Vision이 임용 9번의 (나) V-I 그래프를
  //   *"**회로** (나)를 통해 I_SC를 구하여"* 라고 요약해 "그래프"라는 낱말이 아예 없었다.
  //   ⇒ **두 번째 그림 (나) + 단락전류 I_sc** 라는 구조 신호로도 인정한다.
  //   (그래프 없는 형제(임용 7번류)는 (나) 자체가 없어 이 조건에 걸리지 않는다.)
  return /\(\s*나\s*\)|그림\s*나/.test(text) && /i_?sc|단락\s*전류/i.test(text);
}

const TEXT_SYSTEM = `너는 회로이론(테브난 등가 + 최대전력 전달) 임용 문제의 본문·문항·풀이를 쓰는 엔진이다.
회로와 정확한 계산 결과(V_th, R_th, I_sc, P_max, 가변 R 값)가 주어진다. 주어진 수치를 절대 바꾸지 마라.
출력 JSON 한 개만(코드펜스 금지): {content, question, solution}
- content: 회로 설명 + "그림 (나)의 V_RL–I_RL 그래프를 이용해 <해석 절차>대로 구하시오"
- question: 3단계 <해석 절차> (\\n 구분): [단계1] 테브난 전압 V_th를 R의 함수로 제시하고 (나) 그래프로 R[Ω]을 구한다,
  [단계2] I_sc[A]를 구한다, [단계3] 부하 R_L에 최대전력 전달 시 P_L[W]을 구한다.
- solution: 단계별 풀이 (테브난 등가, R_L=R_th, P_max=V_th²/(4R_th)). 결과는 주어진 수치와 일치.
- 종속전원(2i_x)이 있으면 그 영향을 풀이에 반영(독립원 zero out만으로 R_th 구하지 말 것 — V_oc/I_sc).`;

/** 그래프 없는 원본(임용 7번류) 전용 시스템 프롬프트 — V_oc → I_sc → R_L·P_L 3단계. */
const TEXT_SYSTEM_NO_GRAPH = `너는 회로이론(테브난 등가 + 최대전력 전달) 임용 문제의 본문·문항·풀이를 쓰는 엔진이다.
회로와 정확한 계산 결과(V_oc, R_th, I_sc, P_max)가 주어진다. 주어진 수치를 절대 바꾸지 마라.
출력 JSON 한 개만(코드펜스 금지): {content, question, solution}
- content: "그림은 독립 전원과 종속 전원이 포함된 회로이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오."
  ★ 그래프·직선·V-I 곡선은 이 문제에 **없다**. 그림 (나)나 그래프를 절대 언급하지 마라.
- question: 3단계 <해석 절차> (\\n 구분):
  [단계 1] 마디 a와 b 사이를 개방하였을 때, a와 b 사이의 전압 V_oc[V]를 구한다.
  [단계 2] 마디 a와 b 사이를 단락시켰을 때, a에서 b로 흐르는 전류 I_sc[A]를 구한다.
  [단계 3] [단계 1]과 [단계 2]를 이용하여 부하 저항 R_L에 최대 전력이 전달되도록 하는 R_L[Ω]과 부하 전력 P_L[W]을 각각 구한다.
- solution: 단계별 풀이. 종속전원이 있으면 독립원 zero-out만으로 R_th를 구하지 말고 **R_th = V_oc/I_sc**로 구하라.`;

/**
 * 표시용 수 포맷 — **정확히 떨어지는 기약분수**(분모 ≤ 400)면 분수로, 아니면 소수 3자리.
 *
 * ★ 근사 복원 단계는 쓰지 않는다(approxDen=0). 솔버 값은 이미 정확한 실수라
 *   근사를 허용하면 81/280을 9/31로 바꿔 놓는다(실측). 여기서 분수로 확정해 두면
 *   route의 전역 변환기(CLAUDE.md 1-4-3)가 나중에 손댈 소수 자체가 남지 않는다.
 */
function numText(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (Number.isInteger(x)) return String(x);
  const f = decimalToFraction(x, 400, 0);
  return f ? `${f.num}/${f.den}` : x.toFixed(3);
}

async function writeText(ex: TheveninExtraction, withGraph: boolean): Promise<Txt> {
  const openai = getOpenAI();
  const comp = ex.netlist.components
    .map((c) => `  - ${c.id}(${c.type})${c.id === ex.unknownId ? " [미지 R]" : c.value !== undefined ? ` = ${c.value}` : ""}`)
    .join("\n");
  const answer = [
    ex.unknownId && ex.unknownValue !== undefined ? `R = ${ex.unknownValue}${ex.unknownUnit || "Ω"}` : null,
    `V_th = ${numText(ex.Vth)}V, R_th = ${numText(ex.Rth)}Ω`,
    `I_sc = ${numText(ex.Isc)}A`,
    `R_L = R_th = ${numText(ex.RLopt)}Ω일 때 P_L(max) = ${numText(ex.Pmax)}W`,
  ].filter(Boolean).join(" / ");

  const conditions = [
    ...ex.netlist.components.filter((c) => c.value !== undefined && c.id !== ex.unknownId).map((c) => `${c.id} = ${c.value}`),
    ex.hasDependent ? "종속전원 포함 (제어전류 i_x)" : "",
    withGraph ? "그림 (나): V_RL–I_RL 직선 (절편 V_th, I_sc 제시)" : "",
    withGraph && ex.unknownId ? "R은 가변(학생 도출)" : "",
    "단자 a와 b 사이에 부하 저항 R_L이 연결되어 있음",
  ].filter(Boolean);

  const userPrompt = [
    `[소자]\n${comp}`,
    `[계산 결과 — 변경 금지] V_th=${numText(ex.Vth)}V, R_th=${numText(ex.Rth)}Ω, I_sc=${numText(ex.Isc)}A, P_max=${numText(ex.Pmax)}W` +
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
        messages: [
          { role: "system", content: withGraph ? TEXT_SYSTEM : TEXT_SYSTEM_NO_GRAPH },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" }, max_tokens: 1600,
      }),
    );
    parsed = JSON.parse(c.choices[0]?.message?.content ?? "{}") as Partial<Txt>;
  } catch (e) { log.warn("text_failed", { reason: String(e) }); }

  return {
    content: parsed.content ?? (withGraph
      ? "그림 (가)는 전압원이 포함된 저항회로이고, (나)는 부하 R_L의 V_RL–I_RL 관계이다. <해석 절차>에 따라 구하시오."
      : "그림은 독립 전원과 종속 전원이 포함된 회로이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오."),
    conditions,
    question: parsed.question ?? (withGraph
      ? "[단계 1] V_th를 R의 함수로 제시하고 (나)로 R을 구한다.\n[단계 2] I_sc를 구한다.\n[단계 3] 최대전력 P_L을 구한다."
      : "[단계 1] 마디 a와 b 사이를 개방하였을 때, a와 b 사이의 전압 V_oc[V]를 구한다.\n[단계 2] 마디 a와 b 사이를 단락시켰을 때, a에서 b로 흐르는 전류 I_sc[A]를 구한다.\n[단계 3] [단계 1]과 [단계 2]를 이용하여 부하 저항 R_L에 최대 전력이 전달되도록 하는 R_L[Ω]과 부하 전력 P_L[W]을 각각 구한다."),
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
    // ★ 원본에 그래프가 없으면 (나)를 만들지 않고 가변 R도 만들지 않는다 —
    //   없는 그림을 지어내면 발문·구조가 원본과 어긋난다([[절대규칙 0]]).
    const withGraph = originalHasViGraph(analysis);
    const ex = await extractTheveninNetlist({ analysis, mode, seed, wantUnknownR: withGraph });
    log.info("thevenin_generic_generated", { Vth: ex.Vth, Rth: ex.Rth, Isc: ex.Isc, Pmax: ex.Pmax, hasDependent: ex.hasDependent });
    const text = await writeText(ex, withGraph);
    const renderNetlist = blankUnknown(ex.netlist, withGraph ? ex.unknownId : undefined);
    const figureVariants: FigureVariant[] = [
      { id: `fig_main_${i + 1}`, label: withGraph ? "(가) 주어진 회로 (단자 a-b 부하)" : "주어진 회로 (단자 a-b 부하)", role: "original_circuit", diagramType: "analog_netlist", diagram: renderNetlist as unknown as Record<string, unknown> },
    ];
    if (withGraph) {
      figureVariants.push({ id: `fig_vi_${i + 1}`, label: "(나) V_RL–I_RL 그래프", role: "main_graph", diagramType: "vi_line_graph", diagram: buildViGraph(ex) as unknown as Record<string, unknown> });
    }
    log.info("thevenin_generic_form", { withGraph, hasUnknownR: Boolean(ex.unknownId) });
    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution,
      topicKey, figureVariants,
    };
  });
}
