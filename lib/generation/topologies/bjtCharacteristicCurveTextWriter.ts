import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { CharacteristicCurveGeneration } from "./bjtCharacteristicCurve";

const log = createLogger("lib/generation/topologies/bjtCharacteristicCurveTextWriter");

export type CharacteristicCurveTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * BJT/MOSFET 출력특성곡선 문제 텍스트 generator.
 *
 *  결정론 layer:
 *   - figure는 코드가 이미 만들었음 (diagram + regions + marker).
 *   - 영역 명칭과 ON/OFF 정답도 코드가 미리 산출(regionAnswers).
 *   - GPT는 문제 문장과 풀이 텍스트만 작성. 정답 수치/영역명/ON-OFF는 강제(enforced).
 */
export async function writeBjtCharacteristicCurveText(args: {
  generation: CharacteristicCurveGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<CharacteristicCurveTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const ans = generation.regionAnswers;

  const deviceLabel = v.device === "bjt" ? "쌍극성 접합 트랜지스터(BJT)" : "MOSFET";
  const xLabel = v.device === "bjt" ? "V_CE" : "V_DS";
  const yLabel = v.device === "bjt" ? "I_C" : "I_D";
  const familyParamLabel = v.device === "bjt" ? "베이스 전류 I_B" : "게이트-소스 전압 V_GS";

  const enforcedAnswer = ans
    .map((a) => `${a.marker} 영역: ${a.nameKr} — 스위칭 동작: ${a.switchState}`)
    .join("\n");

  const enforcedSolution = ans
    .map((a) => {
      const reason = buildRegionRationale(v.device, a.region as "saturation" | "active" | "cutoff" | "triode");
      return `${a.marker} ${a.nameKr}(${a.nameEn}): ${reason} 따라서 스위치 동작은 ${a.switchState}.`;
    })
    .join("\n");

  const userPrompt = `다음은 임용 4번 형식의 "${deviceLabel} 출력특성곡선 영역 식별" 문제이다.
회로 figure는 코드가 이미 결정 — 너는 문제 문장(content/conditions/question)과 풀이 서술만 작성.
정답 텍스트는 솔버가 강제하므로 너의 출력 answer은 무시되고 enforcedAnswer가 사용된다 — 그러나
풀이(solution)는 너의 작성이 사용되므로 정확히 작성하라.

[그림 정보]
- 다중 ${familyParamLabel} 값에 대한 ${xLabel}에 대한 ${yLabel}의 변화 곡선.
- 곡선 ${v.curveCount}개 (가장 위가 큰 ${familyParamLabel}, 가장 아래가 ${v.device === "bjt" ? "I_B = 0" : "V_GS < V_TH (차단)"}).
- 두 영역에 한국어 marker(${ans.map((a) => a.marker).join(", ")})로 표시되어 있다.

[솔버 결과 — 변경 금지]
${enforcedAnswer}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 ${deviceLabel}의 여러 개의 ${familyParamLabel} 값에 대하여 ${xLabel}에 대한 ${yLabel} 변화를 그린 특성 곡선이다. 그림에 표시된 ${ans.map((a) => a.marker).join(", ")} 영역의 명칭과 각 영역에 대응하는 ${deviceLabel}의 스위칭 동작(ON/OFF)을 쓰시오.",
  "conditions": ["${v.device === "bjt" ? "BJT는 NPN 또는 PNP 형, V_BE = 0.7 V 정상 동작" : "MOSFET은 NMOS 또는 PMOS 형, 채널 길이 변조 무시"}", "그림의 ${familyParamLabel}는 일정한 간격으로 ${v.curveCount - 1}개의 양의 값 + 0(${v.device === "bjt" ? "I_B=0" : "V_GS<V_TH"}) 1개"],
  "question":   "그림의 ${ans.map((a) => a.marker).join(" 영역과 ")} 영역의 명칭과 각 영역에 대응하는 ${deviceLabel}의 스위칭 동작(ON/OFF)을 쓰시오.",
  "answer":     "(솔버 강제 — 너는 비워둬도 무관)",
  "solution":   "${escapeJsonString(enforcedSolution)}"
}

[규칙]
- ${v.device === "bjt" ? "BJT" : "MOSFET"} 표준 동작 영역 정의에 따라 풀이 작성.
- ${v.device === "bjt" ? "BJT의 \"포화 영역(saturation)\"은 두 접합 모두 순방향 → V_CE 작음, I_C 큼; \"활성 영역(active)\"은 EBJ 순방향+CBJ 역방향 → 평탄 영역; \"차단 영역(cutoff)\"은 두 접합 모두 역방향 → I_C ≈ 0." : "MOSFET의 \"선형(triode) 영역\"은 V_DS < V_GS - V_TH → ohmic ON; \"포화 영역(saturation)\"은 V_DS ≥ V_GS - V_TH → 평탄, 증폭 동작; \"차단(cutoff)\"은 V_GS < V_TH → I_D ≈ 0."}
- 영역 명칭과 ON/OFF는 enforcedAnswer를 따른다. 다른 영역명·동작을 만들지 마라.
- 회로 figure 다시 만들지 마라 — 코드가 처리.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<CharacteristicCurveTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<CharacteristicCurveTextOutput>;
  } catch (e) {
    throw new Error(`CharacteristicCurve text JSON 파싱 실패: ${String(e)}`);
  }

  log.info("characteristic_curve_text_generated", {
    device: v.device,
    regions: ans.map((a) => `${a.marker}:${a.nameKr}`),
  });

  return {
    content: parsed.content ?? `${deviceLabel}의 출력특성곡선 영역 식별 문제`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `그림의 ${ans.map((a) => a.marker).join(", ")} 영역의 명칭과 스위칭 동작을 쓰시오.`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? enforcedSolution,
  };
}

/**
 * 영역명·근거 텍스트 builder — 솔버 강제 solution 작성용.
 */
function buildRegionRationale(
  device: "bjt" | "mosfet",
  region: "saturation" | "active" | "cutoff" | "triode",
): string {
  if (device === "bjt") {
    if (region === "saturation") {
      return "V_CE가 매우 작고(약 0.2 V 이하) I_C가 가파르게 증가하는 좌측 영역. 베이스-에미터·베이스-컬렉터 두 접합 모두 순방향이라 다이오드처럼 통전 — 스위치 닫힘에 해당.";
    }
    if (region === "active") {
      return "V_CE가 충분히 커 곡선들이 평탄해진 영역. 베이스-에미터는 순방향, 베이스-컬렉터는 역방향으로 BJT가 선형 증폭기로 동작.";
    }
    return "I_B = 0인 가장 아래 곡선의 평탄부 — 베이스 전류가 없어 I_C ≈ 0. 두 접합 모두 역방향(또는 역치 미만)이라 전류가 흐르지 않음 — 스위치 열림에 해당.";
  }
  // MOSFET
  if (region === "triode") {
    return "V_DS < V_GS − V_TH인 좌측 좁은 영역. 채널이 양 끝에 형성되어 ohmic 저항처럼 동작 — 스위치 ON(선형).";
  }
  if (region === "saturation") {
    return "V_DS ≥ V_GS − V_TH인 평탄 영역. 채널이 핀치오프되어 I_D가 V_DS에 거의 무관 — 증폭 동작.";
  }
  return "V_GS < V_TH인 가장 아래 곡선 — 채널이 형성되지 않아 I_D ≈ 0 — 스위치 OFF.";
}

function escapeJsonString(s: string): string {
  return s.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}
