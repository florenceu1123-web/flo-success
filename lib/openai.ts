import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * OpenAI 클라이언트 싱글톤. .env.local OPENAI_API_KEY를 사용한다.
 * 키가 없으면 명시적으로 throw한다 (조용한 401 회피).
 *
 * maxRetries는 SDK 기본(2)보다 높여 429(rate limit) sustained burst를 견딘다.
 * SDK는 429에서 자동으로 backoff + Retry-After 헤더 존중.
 */
export function getOpenAI(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 .env.local에 설정되지 않았습니다.");
  }
  const raw = new OpenAI({
    apiKey,
    maxRetries: 6,        // 429 sustained burst 견딤 (기본 2 → 6)
    timeout: 120_000,     // 2분 — Vision API + 긴 generation 응답 대비
  });
  client = withJsonTextNormalization(raw);
  return client;
}

/**
 * ★★ GPT 출력 **형식 정규화** — JSON 응답의 텍스트 필드를 문자열로 강제한다 (2026-08-12).
 *
 *  실측: GPT가 `answer`·`solution`·`question`을 간헐적으로 **배열/객체**로 돌려주는 회차가 있어
 *  HTTP 500이 났다 — `text.replace is not a function`(switched_dc),
 *  `text.match is not a function`(bjt_small_signal), `parsed.answer.includes is not a function`(flipflop_counter).
 *
 *  텍스트 라이터가 **30개 넘게 각자 `JSON.parse`** 하므로 소비자마다 방어를 넣으면 반드시 빠지는 곳이
 *  생긴다. 모든 GPT 호출이 지나는 **클라이언트 한 곳**에서 흡수한다
 *  ([[feedback_gpt_format_normalization]] — 프롬프트·로직 fix보다 정규화 우선).
 *
 *  · `response_format: json_object` 응답에만 적용하고, 아래 키에 한해 문자열로 평탄화한다.
 *  · `conditions`는 문자열 배열로 맞춘다. 그 외 필드(회로 JSON 등)는 **건드리지 않는다**.
 */
const TEXT_KEYS = new Set(["content", "question", "answer", "solution"]);

function flattenToText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(flattenToText).filter(Boolean).join("\n");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(flattenToText).filter(Boolean).join("\n");
  return String(v);
}

/** 최상위 + problems[] 항목의 텍스트 키만 정규화한다(깊은 회로 JSON은 그대로 둔다). */
function normalizeNode(node: unknown): unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;
  const o = node as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (TEXT_KEYS.has(k) && o[k] != null && typeof o[k] !== "string") o[k] = flattenToText(o[k]);
    else if (k === "conditions") {
      const c = o[k];
      if (c != null) o[k] = Array.isArray(c) ? c.map(flattenToText) : [flattenToText(c)];
    }
  }
  if (Array.isArray(o.problems)) o.problems = o.problems.map(normalizeNode);
  return o;
}

function withJsonTextNormalization(inner: OpenAI): OpenAI {
  const origCreate = inner.chat.completions.create.bind(inner.chat.completions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (inner.chat.completions as any).create = async (...args: any[]) => {
    const res = await origCreate(...(args as Parameters<typeof origCreate>));
    // 스트리밍 응답은 대상이 아니다.
    const anyRes = res as unknown as { choices?: Array<{ message?: { content?: string | null } }> };
    const msg = anyRes?.choices?.[0]?.message;
    const wantsJson = (args[0] as { response_format?: { type?: string } })?.response_format?.type === "json_object";
    if (!wantsJson || typeof msg?.content !== "string") return res;
    try {
      const parsed = JSON.parse(msg.content);
      msg.content = JSON.stringify(normalizeNode(parsed));
    } catch {
      // 파싱 실패는 호출부가 각자 처리한다(여기서 삼키지 않는다).
    }
    return res;
  };
  return inner;
}

/** 프로젝트 전역 기본 모델 — 필요 시 단일 지점에서 교체. */
export const DEFAULT_MODEL = "gpt-4o";

/**
 * Vision 추출(회로 소자·connectivity) 전용 모델 (2026-06-03 도입).
 *
 * 임용 11번 비교 테스트 결과 (scripts/compareVisionModels.mjs):
 *   gpt-4o: 75~80점 (R 누락·값 환각·실행마다 다름) → gpt-5.4-mini: 100점·100점 (완벽·재현 가능)
 *
 * gpt-5.x는 max_tokens 미지원 → 이 모델을 쓰는 호출은 max_completion_tokens 사용 필수.
 * textWriter류(문제 텍스트 생성)는 DEFAULT_MODEL 유지 — 정확도 병목이 아니고 max_tokens 호환 필요.
 */
export const VISION_MODEL = "gpt-5.4-mini";

/**
 * 429 rate-limit 응답을 자체 catch해서 메시지의 "try again in Xs" 텍스트를 따라 backoff 후 재시도.
 *   SDK의 기본 retry로 부족하거나 body-only Retry-After 표기를 정확히 따르고 싶을 때 wrapping.
 *
 * 사용 예:
 *   const result = await withRateLimitRetry(() => openai.chat.completions.create({ ... }));
 *
 * 정책:
 *   - 429 외 에러는 즉시 rethrow.
 *   - 메시지에서 "try again in {seconds}s" 패턴 추출. 못 찾으면 exponential backoff (2^n + jitter).
 *   - 최대 attempts (기본 4) 초과 시 마지막 에러 rethrow.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const err = e as { status?: number; message?: string };
      if (err.status !== 429) throw e;
      // 429 — 대기 시간 추출. 없으면 exponential backoff.
      const match = /try again in ([\d.]+)s/i.exec(err.message ?? "");
      const waitMs = match
        ? Math.ceil(parseFloat(match[1]) * 1000) + 200  // +200ms safety margin
        : Math.min(baseDelayMs * Math.pow(2, i) + Math.random() * 500, 30_000);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
