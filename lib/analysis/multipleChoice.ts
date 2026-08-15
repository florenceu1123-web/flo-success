import type { AnalysisResult } from "@/types";
import { looksLikeChoicePrompt } from "@/lib/format/threeStep";

/**
 * 원본이 **객관식(보기 ①~⑤ 중 고르기)** 인지 감지.
 *
 * 쓰임: 생성물을 3단계 단계별 주관식으로 강제하는 계약([[lib/format/threeStep]])의 트리거이자,
 * 계약 위반을 검증기에서 보고하기 위한 신호다.
 *
 * ★ 낱말 하나에 의존하지 않는다 — Vision은 같은 원본도 회차마다 다르게 요약한다
 *   (CLAUDE.md 규칙 2). 세 갈래 신호 중 하나만 맞아도 객관식으로 본다:
 *     (1) 원문자 보기 마커가 2개 이상 (①②③…)  — 요약에 선택지가 그대로 남은 회차
 *     (2) "옳은 것은/고른 것은/고르시오" 류의 **선택 요구** 문구
 *     (3) "객관식/5지 선다/보기 중에서" 같은 형식 언급
 * ※ ㉠㉡㉢ 빈칸 마커는 신호가 아니다(주관식 문항에도 흔하다).
 * ※ 감지 실패는 치명적이지 않다 — 결정론 생성기는 이미 3단계로 내고, 이 감지는
 *   GPT 경로 프롬프트 강화와 검증 경고에 쓰인다(2겹 방어).
 */
const MC_FORMAT_RE = /(객관식|오지선다|5지\s*선다|오지\s*선다|선택지|보기\s*중(에서)?|multiple[\s-]*choice)/;

/** 분석 텍스트를 한 덩어리로 (topic·해석·개념·빈칸 문장). */
function analysisText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}

/** 텍스트 직접 판정 (스모크·다른 호출부용). */
export function isMultipleChoiceText(raw: string): boolean {
  const text = String(raw ?? "");
  if (MC_FORMAT_RE.test(text)) return true;
  if (looksLikeChoicePrompt(text)) return true;
  // 원문자 2개만 있어도 보기 나열이다(hasChoiceList는 3개 이상을 본다 — 여기선 더 민감하게).
  const marks = text.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g);
  return (marks?.length ?? 0) >= 2;
}

/** 분석 결과가 객관식 원본을 가리키는가. */
export function detectMultipleChoiceOriginal(analysis?: Partial<AnalysisResult> | null): boolean {
  return isMultipleChoiceText(analysisText(analysis));
}
