import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * OpenAI 클라이언트 싱글톤. .env.local OPENAI_API_KEY를 사용한다.
 * 키가 없으면 명시적으로 throw한다 (조용한 401 회피).
 */
export function getOpenAI(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 .env.local에 설정되지 않았습니다.");
  }
  client = new OpenAI({ apiKey });
  return client;
}

/** 프로젝트 전역 기본 모델 — 필요 시 단일 지점에서 교체. */
export const DEFAULT_MODEL = "gpt-4o";
