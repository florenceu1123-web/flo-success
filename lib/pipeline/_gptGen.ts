import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/pipeline/_gptGen");

/**
 * 비-회로 subject(C언어·통신)용 GPT 문제 생성 공용 헬퍼.
 *
 * 회로 subject는 결정론 archetype/렌더러로 생성하지만, C언어(코드 분석)·통신(공식 계산)은
 * 결정론 레지스트리로 흡수하기 어렵고 사용자가 GPT 생성을 택했다. 한 번의 호출로 count개
 * 서로 다른 문제를 JSON으로 받아 파싱한다(response_format: json_object).
 *
 * @returns problems 배열 (각 원소는 subject별 shape — 호출부에서 narrow). 실패 시 throw.
 */
export async function generateProblemsJson(args: {
  system: string;
  user: string;
  label: string;
}): Promise<Record<string, unknown>[]> {
  const openai = getOpenAI();
  const res = await withRateLimitRetry(() =>
    openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  );

  const raw = res.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.error("json_parse_failed", { label: args.label, rawHead: raw.slice(0, 200) });
    throw new Error(`${args.label}: GPT 응답 JSON 파싱 실패`);
  }

  const problems = extractProblemsArray(parsed);
  if (problems.length === 0) {
    log.error("empty_problems", { label: args.label });
    throw new Error(`${args.label}: 생성된 문제가 없음`);
  }
  return problems;
}

/**
 * 단일 JSON 객체를 받는 focused GPT 호출 (배열 언랩 없음).
 *
 * 회로 figure 추출처럼 "구조화된 객체 하나"만 필요할 때 사용. 본문 생성과 분리하면
 * 모델이 한 가지 일에만 집중해 신뢰성이 크게 오른다(낮은 temperature 권장).
 *
 * @returns 파싱된 객체. 파싱 실패 시 null(호출부에서 graceful skip).
 */
export async function generateJsonObject(args: {
  system: string;
  user: string;
  label: string;
  temperature?: number;
}): Promise<Record<string, unknown> | null> {
  const openai = getOpenAI();
  const res = await withRateLimitRetry(() =>
    openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: args.temperature ?? 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  );
  const raw = res.choices[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    log.error("json_object_parse_failed", { label: args.label, rawHead: raw.slice(0, 200) });
    return null;
  }
}

/** { problems: [...] } 또는 [...] 또는 { data: [...] } 등 흔한 래핑을 관대하게 언랩. */
function extractProblemsArray(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["problems", "items", "data", "results", "list"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
    // 단일 문제 객체면 배열로 승격
    if ("question" in obj || "content" in obj) return [obj];
  }
  return [];
}

/** 안전한 문자열 추출. */
export function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** 안전한 문자열 배열 추출. */
export function asStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}
