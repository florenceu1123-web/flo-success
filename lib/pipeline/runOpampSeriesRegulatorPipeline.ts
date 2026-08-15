import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampSeriesRegulator } from "@/lib/generation/topologies/opampSeriesRegulator";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampSeriesRegulatorPipeline");

/**
 * 재검출 안전망 — stale analysis로 circuitType이 generic opamp/zener로 와도, 텍스트/인벤토리가
 * "OPAMP + 제너 + 트랜지스터 + 정전압 안정화"면 여기서 판별 → route가 circuitType 강제 보정.
 */
export function detectOpampSeriesRegulator(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const inv = analysis.componentInventory ?? [];
  const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`.toLowerCase();
  const opampCtx = inv.some((c) => String(c.type ?? "").toUpperCase() === "OPAMP") ||
    analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/i.test(text);
  const hasZener = /제너|zener|정전압|전압\s*안정|전압안정/.test(text) ||
    inv.some((c) => {
      const t = String(c.type ?? "").toUpperCase();
      return t === "ZD" || t === "DZ" || t === "ZENER" || (t === "D" && /\d/.test(String(c.value ?? "")));
    });
  const hasBjt = /트랜지스터|transistor|bjt|npn|pnp|컬렉터|이미터|베이스|이미터 팔로|emitter follow/.test(text) ||
    inv.some((c) => ["BJT", "NPN", "PNP", "Q", "TR"].includes(String(c.type ?? "").toUpperCase()));
  const regulator = /정전압|전압\s*안정|전압안정|안정화|레귤레이터|regulator|기준\s*전압|기준전압|reference/.test(text);
  return opampCtx && hasZener && hasBjt && regulator;
}

/**
 * ★ 원본이 **동작 판정형 객관식**인가 — ON/OFF·동작 설명을 고르는 형식(임용 30번 원본).
 *
 *   그 원본의 〈보기〉는 (1) 정전압 상태의 트랜지스터 상태 (2) 출력전압 값
 *   (3) 부하 변동 시 보정 방향을 묻는다. 기존 수치형 3단계(I_f·I_L·I_E)로 내면 (1)·(3)이
 *   통째로 사라져 학습목표가 바뀐다(절대규칙 0). 그래서 같은 회로·같은 물리로 **형식만**
 *   "V_o → 트랜지스터 상태 → 보정 방향" 3단계 서술형으로 낸다.
 *
 *   ★ 판정은 **유형 목록이 아니라 형식 신호**로 한다 — 동작/상태 어휘가 있고 수치 계산을
 *     요구하지 않으면 동작 판정형. 수치를 묻는 원본은 기존 경로를 그대로 쓴다.
 */
export function isRegulatorOperationForm(analysis?: Partial<AnalysisResult> | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  // 동작 상태·보정 방향을 묻는 신호
  const opSignal = /\bon\b|\boff\b|도통|차단|동작에\s*관한|동작\s*설명|부하\s*변동|안정화된다|턴\s*온|턴\s*오프/.test(text);
  // 수치 계산을 요구하는 신호(있으면 기존 수치형 경로)
  const numeric = /전류를?\s*구|저항\s*값을?\s*구|이미터\s*전류|\[ma\]|밀리암페어/.test(text);
  return opSignal && !numeric;
}

/**
 * OPAMP(오차증폭기) 기반 직렬형 전압 레귤레이터 (임용 30번 전자회로) — 결정론 파이프라인. GPT 없음.
 *  (가) 회로 + 3단계 풀이.
 *  ★ zener_bjt_regulator(임용 8번, 션트형·OPAMP 없음)와 다름 — OPAMP 가상단락으로 출력 되먹임.
 */
export async function runOpampSeriesRegulatorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey, mode } = args;
  // gpt_generated 모드는 이 결정론 경로에 도달하지 않지만 타입 안전을 위해 좁혀둠.
  const genMode: "exam_similar" | "exam_variant" = mode === "exam_variant" ? "exam_variant" : "exam_similar";
  // ★ 문항 형식은 배치 전체에 대해 한 번만 정한다(원본 하나에서 나오는 문항들이므로).
  const operationForm = isRegulatorOperationForm(args.analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampSeriesRegulator({ seed, mode: genMode, index: i });
    const v = gen.values;
    const a = gen.answer;
    log.info("opamp_series_regulator_generated", {
      mode: genMode, Vdd: v.Vdd, Vz: v.Vz, Ra: v.Ra, Rb: v.Rb, RL: v.RL,
      Vo: a.Vo, If: a.If_mA, IL: a.IL_mA, IE: a.IE_mA,
    });

    const RaRb = v.Ra + v.Rb;

    // ── ★ 동작 판정형 (원본이 ON/OFF·동작 설명을 고르는 객관식일 때) ──────────────
    //   원본 임용 30번은 〈보기〉 ㄱ~ㅂ에서 (1) 정전압 상태의 트랜지스터 상태
    //   (2) 출력전압 값 (3) 부하 변동 시 보정 방향을 고르는 문항이다. 수치형 3단계로 내면
    //   (1)·(3)의 학습목표가 통째로 사라지므로(절대규칙 0) 같은 회로·같은 물리로
    //   **형식만** 3단계 서술형으로 바꾼다(절대규칙: 객관식 원본 → 3단계).
    //   ★ 무부하가 핵심 조건이다 — 출력 단자가 개방이어야 "패스 트랜지스터는 도통하지 않는다"가
    //     성립한다. 그래서 figure도 noLoad로 그린다.
    if (operationForm) {
      const rise = mode !== "exam_variant";           // 변형은 "낮아지면"으로 방향 교환
      const dirWord = rise ? "높아지려" : "낮아지려";
      const cmpWord = rise ? "커져" : "작아져";
      const opOut = rise ? "낮아진다" : "높아진다";
      const conduct = rise ? "줄어들어(차단 방향)" : "늘어나(도통 방향)";
      const back = rise ? "낮아져" : "높아져";

      const content2 = [
        `그림 (가)는 제너다이오드와 연산증폭기(OPAMP)를 이용한 직렬형 정전압 안정화 회로이다.`,
        `출력 단자는 개방되어 있다. 이 회로의 동작을 <해석 절차>에 따라 각 단계별 풀이과정과 함께 서술하시오.`,
        `(단, 연산증폭기와 트랜지스터를 포함한 모든 소자는 이상적인 조건으로 동작한다.)`,
      ].join(" ");

      const conditions2 = [
        `공급전압 V_DD=${v.Vdd}V, 기준 제너전압 V_z=${v.Vz}V`,
        `피드백 분압 저항 R_a=${v.Ra}kΩ, R_b=${v.Rb}kΩ`,
        `출력 단자 개방(무부하)`,
      ];

      const question2 = [
        `[단계 1] 연산증폭기의 가상단락 조건을 이용하여 출력전압 V_o [V]를 구한다.`,
        `[단계 2] 정전압이 안정화된 상태에서 트랜지스터 Q의 동작 상태(도통/차단)를 판정하고 그 근거를 쓴다.`,
        `[단계 3] 부하 변동으로 출력전압 V_o가 ${dirWord} 할 때, 회로가 다시 안정화되는 과정을 귀환 경로를 따라 서술한다.`,
      ].join("\n");

      const answer2 = [
        `[단계 1] V_o = V_z·(R_a+R_b)/R_b = ${a.Vo} [V]`,
        `[단계 2] 차단(OFF) — 부하가 없어 트랜지스터가 공급할 부하 전류가 0이기 때문`,
        `[단계 3] V_− ${rise ? "상승" : "하강"} → 오차증폭기 출력(베이스 전압) ${opOut} → 도통 ${conduct} → V_o가 ${back} 원래 값으로 복귀`,
      ].join("\n");

      const solution2 = [
        `[단계 1] 이상적 OPAMP는 두 입력 전압이 같다(가상단락). 비반전(+)에는 제너 기준전압이 걸리므로`,
        `  V_− = V_+ = V_z = ${v.Vz} [V]. 피드백 분압에서 V_− = V_o·R_b/(R_a+R_b) 이므로`,
        `  ⇒ V_o = V_z·(R_a+R_b)/R_b = ${v.Vz}·${RaRb}/${v.Rb} = ${a.Vo} [V].`,
        `[단계 2] 트랜지스터 Q는 V_DD와 출력 사이에 놓인 **직렬 패스 소자**로, 부하가 요구하는 전류만큼만 흘린다.`,
        `  출력 단자가 개방(무부하)이므로 공급할 부하 전류가 없다 ⇒ Q는 도통하지 않는다(차단, OFF).`,
        `  (R_a·R_b는 부하가 아니라 출력을 되먹임하기 위한 분압망이다.)`,
        `[단계 3] 부하 변동으로 V_o가 ${dirWord} 하면 분압 탭 전압 V_− = V_o·R_b/(R_a+R_b)가 함께 ${rise ? "커진다" : "작아진다"}.`,
        `  그러면 V_+ − V_− 가 ${cmpWord} 오차증폭기 출력(=Q의 베이스 전압)이 ${opOut}.`,
        `  이미터 팔로워인 Q의 도통이 ${conduct} 출력으로 흐르는 전류가 ${rise ? "감소" : "증가"}하고,`,
        `  ⇒ V_o가 ${back} 다시 ${a.Vo} [V]로 안정화된다(부귀환).`,
      ].join("\n");

      return buildProblem(i, gen, {
        content: content2, conditions: conditions2, question: question2, answer: answer2, solution: solution2,
      }, topicKey, true);
    }

    if (genMode === "exam_variant") {
      // 역문제 — 목표 V_o 주고 피드백 저항 R_a를 설계(도출).
      const content = [
        `그림 (가)는 제너다이오드와 연산증폭기(OPAMP)를 이용한 직렬형 정전압 안정화 회로이다.`,
        `연산증폭기와 트랜지스터는 이상적으로 동작한다고 할 때, 출력전압 V_o가 ${a.Vo}[V]로 안정화되도록 <해석 절차>에 따라 각 단계별 풀이과정과 함께 결과를 구하시오.`,
        `(단, 제너전압 V_z=${v.Vz}[V], R_b=${v.Rb}[kΩ], 부하 R_L=${v.RL}[kΩ]로 한다.)`,
      ].join(" ");

      const conditions = [
        `공급전압 V_DD=${v.Vdd}V, 기준 제너전압 V_z=${v.Vz}V`,
        `피드백 분압 저항 R_a는 미지 (학생 도출), R_b=${v.Rb}kΩ`,
        `부하 R_L=${v.RL}kΩ, 목표 출력 V_o=${a.Vo}V`,
      ];

      const question = [
        `[단계 1] 연산증폭기 가상단락 조건으로 반전입력 단자 전압을 구한다.`,
        `[단계 2] 피드백 저항 R_a [kΩ]를 구한다.`,
        `[단계 3] 피드백 분압기 전류 I_f [mA]와 부하 전류 I_L [mA]를 구한다.`,
      ].join("\n");

      const answer = [
        `[단계 1] V_− = V_+ = V_z = ${v.Vz} V`,
        `[단계 2] R_a = ${a.Ra} kΩ`,
        `[단계 3] I_f = ${a.If_mA} mA,  I_L = ${a.IL_mA} mA`,
      ].join("\n");

      const solution = [
        `[단계 1] 이상적 OPAMP는 두 입력 전압이 같다(가상단락). 비반전(+) 입력에 제너 기준전압이 걸리므로`,
        `  ⇒ V_− = V_+ = V_z = ${v.Vz} [V].`,
        `[단계 2] 피드백 분압으로 V_− = V_o·R_b/(R_a+R_b) = V_z. R_a에 대해 풀면`,
        `  R_a = R_b·(V_o/V_z − 1) = ${v.Rb}·(${a.Vo}/${v.Vz} − 1) = ${a.Ra} [kΩ].`,
        `[단계 3] 분압기 전류 I_f = V_z/R_b = ${v.Vz}/${v.Rb} = ${a.If_mA} [mA] (= V_o/(R_a+R_b) = ${a.Vo}/${RaRb}).`,
        `  부하 전류 I_L = V_o/R_L = ${a.Vo}/${v.RL} = ${a.IL_mA} [mA].`,
      ].join("\n");

      return buildProblem(i, gen, { content, conditions, question, answer, solution }, topicKey);
    }

    // exam_similar — V_o·전류 도출 (원본 구조).
    const content = [
      `그림 (가)는 제너다이오드와 연산증폭기(OPAMP)를 이용한 직렬형 정전압 안정화 회로이다.`,
      `연산증폭기와 트랜지스터는 이상적으로 동작한다고 할 때, 회로가 안정화된 후의 상태를 <해석 절차>에 따라 각 단계별 풀이과정과 함께 결과를 구하시오.`,
      `(단, 제너전압 V_z=${v.Vz}[V]이고 모든 소자는 이상적으로 동작한다.)`,
    ].join(" ");

    const conditions = [
      `공급전압 V_DD=${v.Vdd}V, 기준 제너전압 V_z=${v.Vz}V`,
      `피드백 분압 저항 R_a=${v.Ra}kΩ, R_b=${v.Rb}kΩ`,
      `부하 R_L=${v.RL}kΩ`,
    ];

    const question = [
      `[단계 1] 출력전압 V_o [V]를 구한다.`,
      `[단계 2] 피드백 분압기 전류 I_f [mA]와 부하 전류 I_L [mA]를 구한다.`,
      `[단계 3] 트랜지스터가 공급하는 이미터 전류 I_E [mA]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_o = ${a.Vo} V`,
      `[단계 2] I_f = ${a.If_mA} mA,  I_L = ${a.IL_mA} mA`,
      `[단계 3] I_E = ${a.IE_mA} mA`,
    ].join("\n");

    const solution = [
      `[단계 1] 이상적 OPAMP 가상단락으로 반전입력(−) = 비반전입력(+) = 제너 기준전압 V_z=${v.Vz}[V].`,
      `  피드백 분압 V_− = V_o·R_b/(R_a+R_b) = V_z 이므로`,
      `  ⇒ V_o = V_z·(R_a+R_b)/R_b = ${v.Vz}·${RaRb}/${v.Rb} = ${a.Vo} [V].`,
      `[단계 2] 분압기 전류 I_f = V_z/R_b = ${v.Vz}/${v.Rb} = ${a.If_mA} [mA] (= V_o/(R_a+R_b) = ${a.Vo}/${RaRb}).`,
      `  부하 전류 I_L = V_o/R_L = ${a.Vo}/${v.RL} = ${a.IL_mA} [mA].`,
      `[단계 3] 출력 노드 KCL: 트랜지스터 이미터 전류 = 부하 전류 + 분압기 전류.`,
      `  ⇒ I_E = I_L + I_f = ${a.IL_mA} + ${a.If_mA} = ${a.IE_mA} [mA].`,
    ].join("\n");

    return buildProblem(i, gen, { content, conditions, question, answer, solution }, topicKey);
  });
}

function buildProblem(
  i: number,
  gen: ReturnType<typeof generateOpampSeriesRegulator>,
  text: { content: string; conditions: string[]; question: string; answer: string; solution: string },
  topicKey?: TopicKey,
  noLoad = false,
): GeneratedProblem {
  const figureVariants: FigureVariant[] = [
    {
      id: `fig_opamp_series_reg_${i + 1}`,
      label: "(가) OPAMP 직렬형 정전압 안정화 회로",
      role: "original_circuit",
      diagramType: "opamp_series_regulator_circuit",
      // ★ 동작 판정형은 무부하로 그린다 — 부하가 그려져 있으면 [단계 2]의 "차단"이 성립하지 않는다.
      diagram: noLoad ? { ...gen.circuitDiagram, noLoad: true, raUnknown: false } : gen.circuitDiagram,
    },
  ];

  return {
    id: randomUUID(),
    content: text.content,
    conditions: text.conditions,
    question: text.question,
    answer: text.answer,
    solution: text.solution,
    topicKey,
    figureVariants,
  };
}
