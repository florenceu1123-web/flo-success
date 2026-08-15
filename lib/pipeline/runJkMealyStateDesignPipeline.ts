import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateJkMealyStateDesign } from "@/lib/generation/topologies/jkMealyStateDesign";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runJkMealyStateDesignPipeline");

/** sopToString의 `X'`를 `X̄`로 — 임용 표기. */
function overbar(expr: string): string {
  return expr.replace(/([ABx])'/g, (_m, v: string) => `${v}̄`);
}

/**
 * JK-FF 2개 Mealy 순서논리회로 — 상태도 → 상태표 빈칸 → 출력 y → J/K 최소식 (임용 9번 디지털).
 * 결정론 파이프라인 — GPT 없음.
 *   유사 = [3] J_A·J_B (원본) / 변형 = [3] K_A·K_B (구하는 양 교환)
 */
export async function runJkMealyStateDesignPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateJkMealyStateDesign({ seed, mode });
    const v = gen.values, a = gen.answer;
    const variant = mode === "exam_variant";
    log.info("jk_mealy_state_design_generated", {
      mode, cycle: v.cycle.join("→"), outStates: v.outStates.join(","), blankRow: v.blankRow,
      y: a.yExpr, ja: a.jaExpr, jb: a.jbExpr, ka: a.kaExpr, kb: a.kbExpr,
    });

    const which = variant ? "K" : "J";
    const e1 = overbar(variant ? a.kaExpr : a.jaExpr);
    const e2 = overbar(variant ? a.kbExpr : a.jbExpr);

    const content =
      "그림 (가)는 출력 A를 갖는 J-K 플립플롭과 출력 B를 갖는 J-K 플립플롭으로 구성된 순서논리회로의 " +
      "상태도이다. 그림 (나)는 (가)를 상태표로 나타낸 것이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 " +
      "과정과 함께 결과를 서술하시오. (단, (가)에서 x/y는 입력 x에 대한 출력 y이고, 원(동그라미) 안의 " +
      "2개 비트는 J-K 플립플롭의 출력 AB이다.)";

    const conditions = [
      `상태는 AB = 00, 01, 10, 11의 4가지이고, 입력은 x, 출력은 y이다(Mealy 형).`,
      `x = 0일 때 상태는 ${v.cycle.map((s) => `${(s >> 1) & 1}${s & 1}`).join(" → ")} → ${(v.cycle[0] >> 1) & 1}${v.cycle[0] & 1} 순으로 순환한다.`,
      `x = 1일 때 상태는 그대로 유지되며, 이때 출력 y = 1이 되는 상태는 ` +
      `${v.outStates.map((s) => `${(s >> 1) & 1}${s & 1}`).join(", ")} 이다.`,
    ];

    const question = [
      `[단계 1] (나)의 ㉠, ㉡, ㉢, ㉣, ㉤, ㉥을 순서대로 구한다.`,
      `[단계 2] (나)를 이용하여 출력 y의 논리식을 구한다.`,
      `[단계 3] J-K 플립플롭의 출력 A와 출력 B에 대한 입력 ${which}_A와 입력 ${which}_B의 최소화된 논리식을 각각 순서대로 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ㉠ = ${a.blanks[0]}, ㉡ = ${a.blanks[1]}, ㉢ = ${a.blanks[2]}, ㉣ = ${a.blanks[3]}, ㉤ = ${a.blanks[4]}, ㉥ = ${a.blanks[5]}`,
      `[단계 2] y = ${overbar(a.yExpr)}`,
      `[단계 3] ${which}_A = ${e1},  ${which}_B = ${e2}`,
    ].join("\n");

    const br = a.rows.find((r) => r.a * 2 + r.b === v.blankRow)!;
    const tableLines = a.rows.map((r) =>
      `  AB = ${r.a}${r.b} : x=0 → ${r.n0[0]}${r.n0[1]} (y=${r.y0}),  x=1 → ${r.n1[0]}${r.n1[1]} (y=${r.y1})`);

    const solution = [
      `[단계 1] 상태도에서 현재 상태 ${br.a}${br.b}의 간선을 읽는다.`,
      `  x = 0이면 ${br.n0[0]}${br.n0[1]}로 전이하며 출력은 ${br.y0}, x = 1이면 ${br.n1[0]}${br.n1[1]}(자기 루프)이며 출력은 ${br.y1}이다.`,
      `  ∴ ㉠${a.blanks[0]}, ㉡${a.blanks[1]}, ㉢${a.blanks[2]}, ㉣${a.blanks[3]}, ㉤${a.blanks[4]}, ㉥${a.blanks[5]} (순서대로 ${a.blanks.join(", ")})`,
      `[단계 2] 상태표 전체는 다음과 같다.`,
      ...tableLines,
      `  y = 1인 칸만 모아 카르노맵(A, B, x)으로 간소화하면 y = ${overbar(a.yExpr)} 이다.`,
      `[단계 3] J-K 플립플롭의 여기표는 Q→Q⁺가 0→0이면 (J,K)=(0,X), 0→1이면 (1,X), 1→0이면 (X,1), 1→1이면 (X,0)이다.`,
      `  즉 J는 해당 플립플롭의 현재 출력이 0인 행에서만, K는 1인 행에서만 값이 정해지고 나머지는 무관항(X)이다.`,
      `  이 무관항까지 포함해 3변수(A, B, x) 카르노맵으로 간소화하면`,
      `  ${which}_A = ${e1},  ${which}_B = ${e2} 이다.`,
      variant
        ? `  (참고: 같은 표에서 J_A = ${overbar(a.jaExpr)}, J_B = ${overbar(a.jbExpr)} 이다.)`
        : `  (참고: 같은 표에서 K_A = ${overbar(a.kaExpr)}, K_B = ${overbar(a.kbExpr)} 이다.)`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_jkm_sd_${i + 1}`,
        label: "(가) 순서논리회로의 상태도 (x/y)",
        role: "state_diagram",
        diagramType: "concept_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_jkm_tt_${i + 1}`,
        label: "(나) 상태표",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.stateTable,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * JK 2개 Mealy 상태도 설계 감지 — 분류·route 안전망.
 *
 * ★ 판별선 = **상태도 + Mealy 출력 y(x/y 표기) + J-K 플립플롭 2개**.
 *   형제: `jk_excitation_sop_pos`(여기표만·상태도 없음)·`dff_state_design`(D-FF 자율·입력 없음)·
 *   `tff_state_design_input`(T-FF)·`sequence_detector`(검출기 발문)·`jk_sync_counter`(3-FF 카운터+파형).
 */
export function detectJkMealyStateDesign(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // 순서논리 + 상태도 문맥.
  const stateCtx = /상태도|상태\s*전이도|state\s*diagram/.test(text);
  const tableCtx = /상태표|state\s*table/.test(text);
  if (!stateCtx && !tableCtx) return false;

  // ★ J-K 플립플롭 — Vision이 종류를 D로 오독하는 회차가 있어(형제 사례) 낱말이 없으면
  //   **J_A·K_A 같은 입력 기호**로도 인정한다.
  const jkCtx = /j-?k\s*플립플롭|jk\s*플립플롭|j-?k\s*flip|j_?a|k_?a|j_?b|k_?b/.test(text);
  if (!jkCtx) return false;

  // ★ Mealy 출력 — 이 유형 고유(형제는 출력 y가 없거나 상태도가 없다).
  const mealyOut = /출력\s*y|x\s*\/\s*y|mealy|입력\s*x에\s*대한\s*출력/.test(text);
  if (!mealyOut) return false;

  // 형제 양보 — T 플립플롭·시퀀스 검출기·카운터 파형.
  if (/t\s*플립플롭|t-?ff|t_?a\b|t_?b\b/.test(text)) return false;
  if (/시퀀스\s*검출|sequence\s*detect|검출기/.test(text)) return false;
  if (/카운터|counter|타이밍\s*도표|파형/.test(text)) return false;
  return true;
}
