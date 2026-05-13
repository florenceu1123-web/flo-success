import { randomUUID } from "node:crypto";
import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT, SUBJECT_HINT } from "@/lib/prompts";
import {
  type AnalogValueAssignment,
  type BranchTemplate,
  addGroundReturnWires,
  validateBranchTemplate,
  assembleNetlist,
  buildBranchTemplate,
  instantiateAnalogTemplate,
  normalizeSwitchingLegs,
} from "./branchTemplate";
import { validateAnswerSolution } from "@/lib/validators/validateAnswerSolution";
import { validateBranchTemplateInstance } from "@/lib/validators/validateBranchTemplateInstance";
import { validateIdTypeConsistencyStrict } from "@/lib/validators/validateIdTypeConsistencyStrict";
import { validateSwitchingLeg } from "@/lib/validators/validateSwitchingLeg";
import {
  SUBJECT_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type SubjectKey,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/generation/strictAnalogPipeline");

/**
 * strict pipeline 사용 여부 — analog topology 보존이 필요한 경우만.
 *
 * 적용:
 *  - hasSwitch=true (switch state pair 회로) — 가장 안전
 *  - hasSupermesh=true (multi-mesh 평탄화 방지)
 *
 * 제외:
 *  - hasWaveformEvolution=true → 파형 figure도 같이 만들어야 하는데 strict는 netlist만 생성. free pipeline이 둘 다 가능.
 *  - hasMesh 단독 (switch/supermesh 없음) → 단순 RC/RL 같은 케이스도 잡혀버려서 free가 더 적합.
 */
export function shouldUseStrictPipeline(
  analysis: AnalysisResult | null | undefined,
  subject: SubjectKey,
): boolean {
  if (!analysis?.topologySignature) return false;
  if (subject !== "circuit_theory" && subject !== "electronics") return false;
  const f = analysis.topologySignature.features;
  // waveform 동반 문제는 strict 적용 안 함 (free가 netlist + waveform 둘 다 가능)
  if (analysis.semantic?.hasWaveformEvolution) return false;
  return Boolean(f.hasSwitch || f.hasSupermesh);
}

type ValueOnlyResponse = {
  problems: Array<{
    content: string;
    conditions: string[];
    question: string;
    answer: string;
    solution: string;
    topicKey?: string;
    valueAssignments: AnalogValueAssignment[];
  }>;
};

const MAX_ATTEMPTS = 3;

export async function generateStrictAnalogProblems(args: {
  image: string;
  subject: SubjectKey;
  mode: GenerationMode;
  count: number;
  analysis: AnalysisResult;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const built = buildBranchTemplate(args.analysis.topologySignature!);
  const { topNodes, groundNode } = built;

  // 1) SW 들어있는 branch는 무조건 vertical switching_leg
  let template = normalizeSwitchingLegs(built.template);

  // 2) switching_leg 구조 검증 (SW+R+I/V 강제) — fail이면 throw하지 않고 로그만 (analyze 단계 책임)
  const swLegErrors = validateSwitchingLeg(template);
  if (swLegErrors.length > 0) {
    log.warn("switching_leg_violation", { errors: swLegErrors });
  }

  // 3) dangling top node에 ground return wire 자동 추가
  template = addGroundReturnWires(template, topNodes, groundNode);

  // 4) BranchTemplate 도메인 규칙 검증 — allowed/required type, orientation, degree, sibling 등.
  //    위반은 strict 가정 깨짐 → 경고 로그 (GPT 출력의 topology 추출 단계 책임).
  const branchValidation = validateBranchTemplate(template);
  if (!branchValidation.ok) {
    log.warn("branch_template_violation", {
      issues: branchValidation.issues.map((i) => `${i.branchId ?? "-"}:${i.rule}:${i.message}`),
    });
  }

  log.info("template_built", {
    branches: template.length,
    topNodes: topNodes.length,
    roles: template.map((b) => b.role),
    components: template.map((b) => `${b.id}:[${b.components.map((c) => c.type).join(",")}]`),
    branchRulesOk: branchValidation.ok,
  });

  const userPrompt = buildStrictPrompt({
    template,
    topNodes,
    groundNode,
    analysis: args.analysis,
    mode: args.mode,
    count: args.count,
    subject: args.subject,
    topicKey: args.topicKey,
  });

  const openai = getOpenAI();

  let lastError: string = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const finalPrompt = lastError
      ? `${userPrompt}\n\n【이전 시도 오류 — 반드시 수정】\n${lastError}`
      : userPrompt;

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${args.image}`, detail: "high" } },
            { type: "text", text: finalPrompt },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 3500,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: ValueOnlyResponse;
    try {
      parsed = JSON.parse(raw) as ValueOnlyResponse;
    } catch (e) {
      lastError = `JSON 파싱 실패: ${String(e)}`;
      continue;
    }
    if (!Array.isArray(parsed.problems)) {
      lastError = "problems 배열 누락";
      continue;
    }

    // 각 problem 인스턴스화 + 검증
    const problems: GeneratedProblem[] = [];
    const issues: string[] = [];
    for (let pi = 0; pi < parsed.problems.length; pi++) {
      const p = parsed.problems[pi];
      try {
        const instantiated = instantiateAnalogTemplate(template, p.valueAssignments ?? []);

        // template instance 검증
        const v = validateBranchTemplateInstance(template, instantiated);
        if (!v.ok) {
          issues.push(`problem${pi}: ${v.errors.join(" / ")}`);
          continue;
        }

        // figureVariants assemble (state_before/after 또는 main_circuit)
        const figureVariants = assembleFigures(template, instantiated, args.analysis, groundNode);

        // 모든 figure의 component id/type 일관성
        for (const f of figureVariants) {
          const comps = (f.diagram as { components?: Array<{ id?: string; type?: string }> }).components ?? [];
          const idErrs = validateIdTypeConsistencyStrict(comps);
          if (idErrs.length > 0) {
            issues.push(`problem${pi}/${f.id}: ${idErrs.join(" / ")}`);
          }
        }

        // answer/solution 품질
        const ansIssues = validateAnswerSolution({
          answer: p.answer,
          solution: p.solution,
          problemIndex: pi,
        });
        for (const ai of ansIssues) {
          issues.push(`[${ai.rule}] ${ai.message}`);
        }

        problems.push({
          id: randomUUID(),
          content: p.content,
          conditions: p.conditions ?? [],
          question: p.question,
          answer: p.answer,
          solution: p.solution,
          topicKey: (p.topicKey ?? args.topicKey) as TopicKey | undefined,
          figureVariants,
        });
      } catch (e) {
        issues.push(`problem${pi}: instantiate 실패 — ${String(e)}`);
      }
    }

    if (issues.length === 0 && problems.length === args.count) {
      log.info("strict_done", { attempts: attempt, generated: problems.length });
      return problems;
    }

    lastError = issues.join("\n");
    log.warn("strict_retry", { attempt, issuesCount: issues.length, sample: issues[0] });
  }

  // 최종 실패해도 부분 결과 반환
  log.warn("strict_exhausted", { lastError });
  throw new Error(`strict analog pipeline 실패: ${lastError}`);
}

function assembleFigures(
  template: BranchTemplate[],
  instantiated: ReturnType<typeof instantiateAnalogTemplate>,
  analysis: AnalysisResult,
  groundNode: string,
): FigureVariant[] {
  const f = analysis.topologySignature?.features ?? {};
  const swBranchExists = template.some((b) => b.role === "switching_leg" || b.components.some((c) => c.type === "SW"));
  const wantsState = (f.hasSwitch || f.hasStateTransition) && swBranchExists;

  if (wantsState) {
    const before = assembleNetlist(instantiated, groundNode, "open");
    const after = assembleNetlist(instantiated, groundNode, "closed");
    return [
      {
        id: "fig_state_before",
        label: "스위치 열린 상태의 회로",
        role: "state_before",
        diagramType: "analog_netlist",
        diagram: before,
      },
      {
        id: "fig_state_after",
        label: "스위치 닫힌 상태의 회로",
        role: "state_after",
        diagramType: "analog_netlist",
        diagram: after,
      },
    ];
  }

  const net = assembleNetlist(instantiated, groundNode);
  return [
    {
      id: "fig_main",
      label: "원본 회로",
      role: "main_circuit",
      diagramType: "analog_netlist",
      diagram: net,
    },
  ];
}

function buildStrictPrompt(args: {
  template: BranchTemplate[];
  topNodes: string[];
  groundNode: string;
  analysis: AnalysisResult;
  mode: GenerationMode;
  count: number;
  subject: SubjectKey;
  topicKey?: TopicKey;
}): string {
  const { template, topNodes, groundNode, analysis, mode, count, subject, topicKey } = args;

  const branchLines = template
    .map((b) => {
      const compStr = b.components
        .map((c) => `${c.type}(role="${c.role}", order=${c.order})`)
        .join(" → ");
      return `  - id="${b.id}", role="${b.role}", orientation="${b.orientation}", from="${b.fromNode}", to="${b.toNode}", components=[${compStr}]`;
    })
    .join("\n");

  // valueAssignments 출력 예시 — WIRE는 코드가 처리하므로 GPT가 안 채워도 됨
  const valueExampleLines = template
    .flatMap((b) =>
      b.components
        .filter((c) => c.type !== "WIRE")
        .map(
          (c) => `    { "branchId":"${b.id}", "componentRole":"${c.role}", "type":"${c.type}", "value":"..."${c.type === "VCVS" || c.type === "VCCS" || c.type === "CCVS" || c.type === "CCCS" ? `, "gain":"..."` : ""} }`,
        ),
    )
    .join(",\n");

  return `[★ ANALOG_TEMPLATE_GENERATION — strict mode]
이 회로 문제의 topology(branch 구조·orientation·node 연결)는 코드가 결정한 아래 branchTemplate으로 고정.
너는 절대 새 node를 만들거나 component를 추가/제거하지 않는다.
오직 각 component의 value(또는 gain, state)만 채운다.

[과목] ${SUBJECT_LABEL[subject]} (${subject})
[과목 힌트] ${SUBJECT_HINT[subject]}
${topicKey ? `[topicKey] 모든 problem.topicKey = "${topicKey}"` : ""}
[모드] ${mode}

[branchTemplate — 변경 절대 금지]
${branchLines}
groundNode = "${groundNode}"
topNodes = ${JSON.stringify(topNodes)}

[원본 분석 컨텍스트]
주제: ${analysis.topic}
해석: ${analysis.interpretation}
${analysis.signals ? `inputs=${JSON.stringify(analysis.signals.inputs)}, outputs=${JSON.stringify(analysis.signals.outputs)}\n` : ""}
[작업]
- 위 template를 그대로 보존하며 새 problem ${count}개 생성.
- 각 problem.valueAssignments 배열에 위 template의 모든 (branchId, componentRole, type) 조합에 대해 1개씩 entry 작성.
- value: 새 수치(예: "12V", "20Ω", "1.5A")
- VCVS/VCCS/CCVS/CCCS는 gain 채움 (예: "0.3", "0.2V2")
- SW는 value/gain 비워둠 (state는 코드가 state_before/after 그림마다 자동 결정)

[★ 답·풀이 작성 규칙 — 절대 준수]
- answer는 valueAssignments에 넘긴 실제 수치로 계산한 결과. 예: "V1 = 2.4V, I1 = 0.5A; V2 = 3.6V, I2 = 0.8A"
- "...", "TBD", "값", "계산됨" 같은 placeholder 명시 금지.
- solution은 최소 다음 단계 모두 포함:
  1) 각 mesh의 KVL/KCL/supermesh 방정식을 valueAssignments의 실제 숫자로 채워 나열 (예: "9·I1 − 11·I2 = 12")
  2) 연립방정식 풀이 과정 (대입 또는 행렬)
  3) 최종 수치 (예: "I1 = 1.6 A, V1 = 14.4 V")
- "키르히호프 법칙을 적용하여 구한다" 같은 추상적 한 줄 풀이 금지 — 방정식과 수치 대입 필수.
- solution 최소 100자 이상, 숫자 여러 개 포함.
- 수식은 LaTeX inline \\( ... \\) 사용 가능 (UI에서 KaTeX로 렌더).
- ★ 원본이 [단계 1][단계 2] 포맷이면 conditions/question/solution 모두 동일 단계 라벨 유지.

[출력 JSON]
{
  "problems": [
    {
      "content": "문제 본문 (한국어)",
      "conditions": ["조건1","조건2"],
      "question": "질문 한 문장",
      "answer": "V1 = ?V, I1 = ?A, V2 = ?V, I2 = ?A  ← ?에 실제 계산한 숫자",
      "solution": "1) (가) 회로 KVL: 9·I1 − 11·I2 = 12 ... 수치 대입 계산 ... ∴ V1 = ?, I1 = ? (실제 숫자)",
      "topicKey": "${topicKey ?? ""}",
      "valueAssignments": [
${valueExampleLines}
      ]
    }
  ]
}

★ 절대 금지:
- problems[].figureVariants 직접 출력 금지 — 코드가 template+valueAssignments로 자동 조립.
- valueAssignments에 template에 없는 (branchId, componentRole, type) 추가 금지.
- template의 어느 (branchId, componentRole, type)도 누락 금지 — 모두 1개 entry.
- branchTemplate 자체를 바꾸려는 시도 (새 branch / 새 node 만들기) 금지.

JSON 객체 하나만 출력. 코드펜스·머리말 금지.`;
}
