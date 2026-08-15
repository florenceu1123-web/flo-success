import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateBjtSwitchLogicGate } from "@/lib/generation/topologies/bjtSwitchLogicGate";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtSwitchLogicGatePipeline");

/**
 * BJT 이상적 스위치 → 진리표 빈칸 + 동일 동작 논리게이트 (임용 2번) — 결정론 파이프라인. GPT 없음.
 *   유사 = 원본 구성(PNP 하이사이드 인버터), 전원 전압·저항값 변경
 *   변형 = 소자·구성 교환(NPN 로우사이드 / 직렬 2개 → NAND / 병렬 2개 → NOR)
 */
export async function runBjtSwitchLogicGatePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtSwitchLogicGate({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("bjt_switch_logic_generated", { mode, config: v.config, vcc: v.vcc, gate: a.gate });

    const inList = a.inputs.join(", ");
    const blankList = a.blankSymbols.join(", ");

    const content =
      `그림 (가)는 쌍극성 접합 트랜지스터(BJT : Bipolar Junction Transistor) 응용 회로이다. ` +
      `(가)와 같이 입력 ${inList}에 신호가 인가될 때, 그림 (나)의 출력 ${blankList}을 구하고, ` +
      `이와 동일한 동작을 하는 논리게이트를 그리시오. (단, 트랜지스터는 이상적인 스위칭 동작을 한다고 가정한다.)`;

    const conditions = [
      `전원 전압 +${v.vcc}[V], 입력 신호는 H = ${v.vcc}[V], L = 0[V]의 두 준위를 갖는다.`,
      `베이스 저항 R_B = ${fmtR(v.rb)}[kΩ], ${a.inputs.length > 1 ? "부하(풀업) " : ""}저항 R_C = ${fmtR(v.rc)}[kΩ]`,
      `트랜지스터는 이상적 스위치 — 도통 시 단락(V_CE = 0), 차단 시 개방으로 본다.`,
    ];

    const question = [
      `[단계 1] 입력이 각 준위일 때 트랜지스터의 도통·차단 상태를 판정한다.`,
      `[단계 2] 그림 (나) 진리표의 출력 ${blankList}을 H 또는 L로 구한다.`,
      `[단계 3] 이 회로와 동일한 동작을 하는 논리게이트를 밝히고 그 기호를 그린다.`,
    ].join("\n");

    // ★ 풀이에 **전압 값까지** 적는다 — 정답의 수치(H=V_CC)가 풀이에 없으면 검증기가
    //   solution_inconsistent_with_answer를 낸다(실측).
    const stateLines = a.rows.map((r, idx) => {
      const cond = r.inputs.map((s, k) => `${a.inputs[k]} = ${s}(${s === "H" ? `${v.vcc}[V]` : "0[V]"})`).join(", ");
      const outV = r.out === "H" ? `${v.vcc}[V]` : "0[V]";
      return `  ${cond} → 트랜지스터 ${conductsAt(v.config, r.inputs)} → 출력 Y = ${r.out}(${outV})  (${a.blankSymbols[idx]})`;
    });

    const answer = [
      `[단계 2] ${a.rows.map((r, idx) => `${a.blankSymbols[idx]} = ${r.out}(${r.out === "H" ? `${v.vcc}[V]` : "0[V]"})`).join(", ")}`,
      `[단계 3] ${a.gateLabel}`,
    ].join("\n");

    const solution = [
      `[단계 1] ${a.onCondition}`,
      `[단계 2] 이상적 스위치로 보면 도통 시 출력 마디가 단락 경로로 끌려가고, 차단 시에는 R_C를 통해 반대 전위가 된다.`,
      ...stateLines,
      `[단계 3] 입력과 출력의 대응이 ${describeTable(a)}이므로 이 회로는 **${a.gateLabel}** 와 동일하게 동작한다.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_bjt_${i + 1}`,
        label: "(가) BJT 응용 회로",
        role: "original_circuit",
        diagramType: "bjt_switch_logic_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_bjt_tt_${i + 1}`,
        label: "(나) 입력·출력 진리표",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.truthTable,
      },
    ];

    // 정답 게이트는 풀이 영역에만 — 본문에 두면 답이 노출된다.
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_bjt_gate_${i + 1}`,
        label: `동일 동작 논리게이트 (${a.gateLabel})`,
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.gateDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants, solutionFigures };
  });
}

function fmtR(x: number): string { return Number.isInteger(x) ? String(x) : String(x); }
/** 구성별 도통 여부 서술 — 이상적 스위치 판정을 풀이에 그대로 드러낸다. */
function conductsAt(config: string, inputs: string[]): string {
  const H = inputs.map((s) => s === "H");
  switch (config) {
    case "pnp_high_side": return H[0] ? "차단(V_EB = 0)" : "도통(V_EB = V_CC)";
    case "npn_low_side": return H[0] ? "도통(V_BE > 0)" : "차단(V_BE = 0)";
    case "npn_series2": return H[0] && H[1] ? "둘 다 도통 → 경로 형성" : "적어도 하나 차단 → 경로 끊김";
    default: return H[0] || H[1] ? "하나 이상 도통 → 경로 형성" : "둘 다 차단 → 경로 끊김";
  }
}
function describeTable(a: { inputs: string[]; rows: Array<{ inputs: string[]; out: string }> }): string {
  return a.rows.map((r) => `(${r.inputs.join(",")})→${r.out}`).join(", ");
}

/**
 * BJT 스위치 → 논리게이트 감지 — 분류·route 안전망.
 *
 * ★ 시그니처: **트랜지스터(BJT) + 이상적 스위칭 + 논리게이트/진리표(H·L)**.
 *   형제 BJT archetype은 전부 **아날로그 바이어스·증폭**(bjt_bias·특성곡선·레귤레이터)이라
 *   "논리게이트를 그리시오"라는 요구가 이 유형 고유다.
 */
export function detectBjtSwitchLogicGate(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const up = (x: unknown) => String(x ?? "").toUpperCase();
  const bjtCtx =
    /bjt|쌍극성|접합\s*트랜지스터|트랜지스터/.test(text) || inv.some((c) => up(c.type) === "BJT" || up(c.type) === "Q");
  if (!bjtCtx) return false;

  // ★ 요구 — 논리게이트 등가 또는 스위칭 진리표. 낱말이 흔들려도 하나만 맞으면 인정한다.
  const logicAsk =
    /논리\s*게이트|논리게이트|logic\s*gate|게이트를?\s*그리|등가\s*게이트/.test(text) ||
    /진리표/.test(text) ||
    (/스위칭|스위치/.test(text) && /\bh\b|\bl\b|high|low|하이|로우/.test(text));
  if (!logicAsk) return false;

  // 형제 양보 — 바이어스·증폭·특성곡선·레귤레이터는 아날로그 BJT archetype 소관.
  if (/바이어스|동작점|q[- ]?점|소신호|증폭도|이득/.test(text)) return false;
  if (/특성\s*곡선|출력\s*특성/.test(text)) return false;
  if (/제너|정전압|레귤레이터/.test(text)) return false;
  return true;
}
