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
  client = new OpenAI({
    apiKey,
    maxRetries: 6,        // 429 sustained burst 견딤 (기본 2 → 6)
    timeout: 120_000,     // 2분 — Vision API + 긴 generation 응답 대비
  });
  return client;
}

/** 프로젝트 전역 기본 모델 — 필요 시 단일 지점에서 교체. */
export const DEFAULT_MODEL = "gpt-4o";

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
