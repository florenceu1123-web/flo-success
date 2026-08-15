import type { AnalysisResult } from "@/types";

/**
 * 클럭 트리거 에지 감지 (플립플롭 공통).
 *
 * 회로도에서 클럭 입력의 **버블 유무**가 상승/하강을 가르는데, Vision 요약은 이걸
 * "하강 에지"·"부논리"·"negative edge"처럼 말로만 남긴다. 낱말이 아니라 **표현 변형을 흡수**하도록
 * 정규화한 텍스트에서 찾고, 근거가 없으면 `null`을 돌려준다(호출부가 원본 기본값을 정한다).
 *
 * ※ 특정 문제에 하드코딩하지 않는다 — 어떤 FF archetype에서도 같은 함수를 쓴다.
 */
export type ClockEdge = "rising" | "falling";

const FALLING_RE =
  /하강\s*(에지|엣지|모서리|edge)|하강\s*연변|내려가는\s*(에지|엣지|순간)|부(논리|성)\s*에지|네거티브\s*에지|negative[\s-]*edge|falling[\s-]*edge|후미\s*에지|하강\s*시점|하강할\s*때/i;
const RISING_RE =
  /상승\s*(에지|엣지|모서리|edge)|상승\s*연변|올라가는\s*(에지|엣지|순간)|정(논리|)\s*에지|포지티브\s*에지|positive[\s-]*edge|rising[\s-]*edge|전면\s*에지|상승\s*시점|상승할\s*때/i;

/** 클럭 입력의 버블(작은 동그라미) 서술 — 그림 묘사로만 남는 회차 대비. */
const CLOCK_BUBBLE_RE =
  /(클럭|clock|cp)[^.\n]{0,24}(버블|bubble|작은\s*원|동그라미|반전\s*표시|◦|○)|(버블|작은\s*원|동그라미)[^.\n]{0,24}(클럭|clock|cp)/i;

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

/**
 * 분석 결과에서 클럭 에지를 읽는다. 근거가 없거나 상승·하강이 함께 언급되면 `null`.
 * (둘 다 나오면 판단 근거가 못 된다 — 호출부가 원본 기본값을 쓰게 둔다.)
 */
export function detectClockEdge(analysis?: Partial<AnalysisResult> | null): ClockEdge | null {
  return detectClockEdgeFromText(analysisText(analysis));
}

/** 텍스트 직접 판정 (스모크·다른 호출부용). */
export function detectClockEdgeFromText(raw: string): ClockEdge | null {
  const text = String(raw ?? "");
  const falling = FALLING_RE.test(text) || CLOCK_BUBBLE_RE.test(text);
  const rising = RISING_RE.test(text);
  if (falling === rising) return null; // 둘 다 있거나 둘 다 없으면 판단 보류
  return falling ? "falling" : "rising";
}
