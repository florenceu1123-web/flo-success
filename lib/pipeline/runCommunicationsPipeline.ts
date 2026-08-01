import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildContextHint } from "./_common";
import { generateProblemsJson, asStr, asStrArray } from "./_gptGen";
import { GENERATION_MODE_LABEL, GENERATION_POLICIES } from "@/types";
import type {
  AnalysisResult,
  CommDiagram,
  FigureVariant,
  GeneratedProblem,
  GenerationMode,
  TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runCommunicationsPipeline");

/**
 * 통신 파이프라인 — GPT 기반 신호·변조·정보이론 문제 생성.
 *
 * 회로가 아니라 신호·시스템·정보이론 공식 문제다. 원본 분석을 컨텍스트로 GPT에게 count개
 * 문제를 요청하고, 필요 시 파형(시간영역)·스펙트럼(주파수영역)·블록도(송수신) figure를
 * comm_diagram으로 첨부한다.
 *
 * exam_similar=같은 원리, 파라미터만 변형 / exam_variant=같은 원리, 구하는 양 변경 가능.
 */
export async function runCommunicationsPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const ctx = buildContextHint(analysis) ?? "(원본 컨텍스트 없음 — 일반적인 통신 이론 문제)";
  const policy = GENERATION_POLICIES[mode];
  log.info("dispatch", { mode, count, topicKey });

  const system = `당신은 중등 정보·전자 임용시험 통신 이론 출제·해설 전문가입니다.
주어진 원본 문제와 같은 원리·학습목표를 유지하면서 새로운 통신 문제(변조·표본화·정보이론·스펙트럼·잡음)를 만듭니다.
- 표준 공식을 정확히 적용해 수치 정답을 도출하세요. 예: AM 변조지수 m=Am/Ac, FM 카슨 대역폭 B=2(Δf+fm), 나이퀴스트 fs≥2fmax, 엔트로피 H=−Σp·log₂p, 채널용량 C=B·log₂(1+S/N), SNR(dB)=10log₁₀(S/N).
- 계산 과정을 solution에 단계적으로 제시하고, 단위(Hz·kHz·bps·dB·bit 등)를 정확히 표기하세요.
- 필요하면 figure(파형/스펙트럼/블록도)를 첨부하되, 문제 이해에 실제로 도움이 될 때만 넣습니다(불필요하면 figure 생략).
- 출력은 반드시 JSON 하나. 마크다운 코드펜스 없이 순수 JSON만.`;

  const user = `[원본 분석 컨텍스트]
${ctx}

[생성 요청]
- 생성 모드: ${GENERATION_MODE_LABEL[mode]} (${policy.description})
- 개수: ${count}개 (서로 파라미터가 다르게)
- 세부 주제(topicKey): ${topicKey ?? "원본과 동일 원리 유지"}
- 모드 규칙:
  · exam_similar(기출유사유형): 원본과 같은 원리·구하는 양을 유지하고 수치 파라미터만 변형.
  · exam_variant(기출변형유형): 같은 원리를 유지하되 구하는 양을 바꾸거나(대역폭→변조지수 등) 조건을 일부 변형 가능.

[figure 스키마 — 필요 시 problems[].figure 에 하나만]
① 시간영역 파형:
  { "kind":"waveform", "caption":"...", "xLabel":"t", "timeSpan":1,
    "signals":[ {"name":"m(t)","form":"sine|cosine|square|triangle|pulse|samples","amplitude":1,"freq":2,"phase":0,"offset":0} ] }
  (form이 analytic이면 freq=timeSpan 내 사이클 수. samples면 "samples":[{"t":0,"v":0},...])
② 주파수 스펙트럼(막대):
  { "kind":"spectrum", "caption":"...", "xLabel":"f [Hz]",
    "lines":[ {"freq":1000,"amplitude":1,"label":"fc"}, {"freq":1200,"amplitude":0.5,"label":"fc+fm"} ] }
③ 송수신 블록도(좌→우):
  { "kind":"block", "caption":"...",
    "blocks":[ {"id":"src","label":"신호원"},{"id":"mod","label":"변조기"},{"id":"ch","label":"채널"},{"id":"dem","label":"복조기"} ],
    "edges":[ {"from":"src","to":"mod"},{"from":"mod","to":"ch"},{"from":"ch","to":"dem"} ] }

[출력 JSON 스키마]
{
  "problems": [
    {
      "content": "문제 상황·주어진 조건 서술.",
      "conditions": ["주어진 수치·조건 목록 (없으면 빈 배열)"],
      "question": "구하는 것.",
      "answer": "정확한 수치 정답 (단위 포함).",
      "solution": "공식 적용·계산 단계.",
      "figure": { /* 위 ①~③ 중 하나 — 불필요하면 이 키 생략 */ }
    }
  ]
}
정확히 ${count}개의 problems를 생성하세요.`;

  const raw = await generateProblemsJson({ system, user, label: "communications" });

  const problems: GeneratedProblem[] = raw.slice(0, count).map((p, i) => {
    const figureVariants: FigureVariant[] = [];
    const fig = normalizeCommDiagram(p.figure);
    if (fig) {
      figureVariants.push({
        id: `fig_comm_${i + 1}`,
        label: (fig as { caption?: string }).caption || commFigureLabel(fig),
        role: "concept_diagram",
        diagramType: "comm_diagram",
        diagram: fig,
      });
    }
    return {
      id: randomUUID(),
      content: asStr(p.content),
      conditions: asStrArray(p.conditions),
      question: asStr(p.question),
      answer: asStr(p.answer),
      solution: asStr(p.solution),
      topicKey: topicKey,
      figureVariants,
    } satisfies GeneratedProblem;
  });

  return problems;
}

function commFigureLabel(fig: CommDiagram): string {
  switch (fig.kind) {
    case "waveform": return "파형";
    case "spectrum": return "스펙트럼";
    case "block": return "시스템 블록도";
    default: return "도식";
  }
}

/** GPT figure 페이로드를 CommDiagram으로 검증·정규화. 유효하지 않으면 null. */
function normalizeCommDiagram(v: unknown): CommDiagram | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kind = o.kind;

  if (kind === "waveform") {
    const signals = Array.isArray(o.signals)
      ? (o.signals as Record<string, unknown>[])
          .filter((s) => s && typeof s === "object" && typeof s.form === "string")
          .map((s) => ({
            name: asStr(s.name),
            form: s.form as "sine" | "cosine" | "square" | "triangle" | "pulse" | "samples",
            amplitude: numOr(s.amplitude),
            freq: numOr(s.freq),
            phase: numOr(s.phase),
            offset: numOr(s.offset),
            samples: Array.isArray(s.samples)
              ? (s.samples as Record<string, unknown>[])
                  .filter((p) => typeof p?.t === "number" && typeof p?.v === "number")
                  .map((p) => ({ t: p.t as number, v: p.v as number }))
              : undefined,
          }))
      : [];
    if (signals.length === 0) return null;
    return { kind: "waveform", caption: asStr(o.caption) || undefined, xLabel: asStr(o.xLabel) || undefined, yLabel: asStr(o.yLabel) || undefined, timeSpan: numOr(o.timeSpan), signals };
  }

  if (kind === "spectrum") {
    const lines = Array.isArray(o.lines)
      ? (o.lines as Record<string, unknown>[])
          .filter((l) => typeof l?.freq === "number" && typeof l?.amplitude === "number")
          .map((l) => ({ freq: l.freq as number, amplitude: l.amplitude as number, label: asStr(l.label) || undefined }))
      : [];
    if (lines.length === 0) return null;
    return { kind: "spectrum", caption: asStr(o.caption) || undefined, xLabel: asStr(o.xLabel) || undefined, yLabel: asStr(o.yLabel) || undefined, lines };
  }

  if (kind === "block") {
    const blocks = Array.isArray(o.blocks)
      ? (o.blocks as Record<string, unknown>[])
          .filter((b) => b && typeof b === "object" && typeof b.id === "string")
          .map((b) => ({ id: b.id as string, label: asStr(b.label) || (b.id as string) }))
      : [];
    if (blocks.length === 0) return null;
    const edges = Array.isArray(o.edges)
      ? (o.edges as Record<string, unknown>[])
          .filter((e) => typeof e?.from === "string" && typeof e?.to === "string")
          .map((e) => ({ from: e.from as string, to: e.to as string, label: asStr(e.label) || undefined }))
      : [];
    return { kind: "block", caption: asStr(o.caption) || undefined, blocks, edges };
  }

  return null;
}

function numOr(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
