/**
 * ★★ 절대 규칙 — **객관식 원본은 3단계 단계별 주관식으로 출제한다** (사용자 지정 2026-08-12).
 *
 * 임용 기출에는 보기 ①~⑤ 중 하나를 고르는 객관식이 많다(전자기학 다수, 전자회로 개념형 일부).
 * 그대로 흉내 내면 학습 목표가 "답 고르기"로 축소되고, 생성기가 만든 정답 하나만 남아
 * 풀이 과정을 평가할 수 없다. 그래서 **원본이 객관식이면 생성물은 언제나**
 *   〈해석 절차〉 [단계 1] → [단계 2] → [단계 3]
 * 의 단계별 주관식(서술형)으로 낸다. 원본의 구조·원리·학습 목표는 그대로 유지한다(절대규칙 0) —
 * 바뀌는 것은 **답을 고르는 형식 → 도출 과정을 쓰는 형식** 뿐이다.
 *
 * 이 모듈은 그 계약을 **한 곳에서** 정의한다(유형마다 문구를 새로 쓰면 반드시 어긋난다):
 *  · `buildStepQuestion` / `buildStepAnswer` — 발문·정답 조립
 *  · `countStepMarkers` / `isThreeStepText`  — 계약 준수 검사(검증기·스모크가 사용)
 *  · `hasChoiceList`                          — 생성물에 보기(①~⑤)가 남았는지 검사
 */

/**
 * GPT 경로(비회로 subject·자유 출제)에 주입하는 계약 문구.
 * 결정론 생성기는 코드로 3단계를 보장하지만, GPT 경로는 프롬프트로 규칙을 세우고
 * 검증기(`missing_three_step_question`·`multiple_choice_output`)가 위반을 보고한다(2겹).
 */
export const MULTIPLE_CHOICE_TO_THREE_STEP_RULE = `
[객관식 → 3단계 단계별 주관식 — 절대 규칙]
- 원본이 객관식(보기 ①~⑤ 중 고르기, "…옳은 것은?", "고르시오")이어도 **생성 문제는 객관식으로 내지 않는다**.
- 반드시 〈해석 절차〉 **정확히 3단계**의 단계별 주관식으로 낸다:
  question = "[단계 1] … / [단계 2] … / [단계 3] …" (세 줄), answer도 같은 [단계 N] 라벨로 3개.
- 표준 분해: [단계 1] 적용 개념·법칙·식 세우기 → [단계 2] 중간 결과 → [단계 3] 최종 답(단위 포함).
- 보기(①②③④⑤)를 만들지 말고 "옳은 것은/고르시오" 같은 선택 요구 문구도 쓰지 마라.
- 구조·원리·학습 목표는 원본 그대로 유지한다 — 바뀌는 것은 형식(답 고르기 → 과정 서술)뿐이다.`;

/**
 * generic 텍스트 라이터(GPT가 발문을 쓰는 경로)의 `[규칙]` 블록에 주입하는 발문 계약.
 *
 * ★ 왜 여기에 또 넣나 (실측 2026-08-12): 각 라이터의 `[출력 JSON]` **예시**가
 *   `"question": "…를 구하시오 (한 문장)"`처럼 단일 물음이라, SYSTEM_PROMPT의 3단계 규칙보다
 *   **가까이 있는 예시가 이겼다**. 그래서 해설만 단계별이고 발문은 한 줄인 문항이 나갔다
 *   (사용자 신고). 예시 **뒤에** 오는 이 규칙이 예시를 덮어쓴다.
 */
export const STEP_QUESTION_RULE = `- ★★ **발문(question)은 반드시 "[단계 1] … / [단계 2] … / [단계 3] …" 세 줄**로 쓴다(줄바꿈 \\n으로 구분).
  위 [출력 JSON]의 question 예시는 **무엇을 묻는지에 대한 내용 예시일 뿐 형식 예시가 아니다** — 형식은 이 규칙을 따른다.
  묻는 양이 1~2개뿐이어도 3단계로 쪼갠다: [단계 1] 적용할 법칙·정의식 세우기 → [단계 2] 중간량 →
  [단계 3] 최종 값(단위 포함). solution도 같은 [단계 N] 라벨로 쓰고, 가능하면 answer도 단계별로 나눈다.`;

/** 단계 마커 — `[단계 1]` 형식. 프로젝트 전 파이프라인 공통 표기. */
export function stepMark(i: number): string {
  return `[단계 ${i}]`;
}

/** 본문 말미에 붙이는 단계별 서술 지시문 — 모든 3단계 문항이 같은 문구를 쓴다. */
export const THREE_STEP_TAIL =
  "제시된 \\(\\langle\\)해석 절차\\(\\rangle\\)에 따라 각 단계의 풀이 과정과 함께 결과를 서술하시오.";

/** 발문 조립 — `[단계 N] ask` 줄들을 개행으로 잇는다. */
export function buildStepQuestion(asks: readonly string[]): string {
  return asks.map((a, i) => `${stepMark(i + 1)} ${a}`).join("\n");
}

/** 정답 조립 — 발문과 같은 단계 번호로 값을 나열한다. */
export function buildStepAnswer(values: readonly string[]): string {
  return values.map((v, i) => `${stepMark(i + 1)} ${v}`).join("\n");
}

/** 텍스트에 등장하는 **서로 다른** 단계 번호의 개수. (같은 마커 반복은 1로 센다.) */
export function countStepMarkers(text: string | undefined | null): number {
  if (!text) return 0;
  const found = new Set<string>();
  for (const m of String(text).matchAll(/\[단계\s*(\d+)\]/g)) found.add(m[1]);
  return found.size;
}

/** 3단계 계약을 지키는 텍스트인가 — 서로 다른 단계 마커가 정확히 3개(1·2·3). */
export function isThreeStepText(text: string | undefined | null): boolean {
  if (!text) return false;
  const nums = new Set<string>();
  for (const m of String(text).matchAll(/\[단계\s*(\d+)\]/g)) nums.add(m[1]);
  return nums.size === 3 && ["1", "2", "3"].every((n) => nums.has(n));
}

/** 원문자 보기 마커 ①~⑮ (객관식 선택지 표기). */
const CHOICE_MARKS = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/g;

/**
 * 생성물이 **객관식 형태**로 나갔는지 검사 — 엄격 판정(검증기용).
 *  · 원문자 마커가 3개 이상이면 보기 나열로 본다(①②③…).
 *  · "고르시오/고른 것은/보기 중에서"처럼 **고르는 행위**를 요구하거나,
 *    "…옳은 것은?"처럼 물음표로 끝나는 선택 발문이면 객관식이다.
 * ※ 오탐 주의: "…변화로 옳은 것을 〈해석 절차〉에 따라 구하시오"는 **서술형**이다
 *   (실측 오탐 — active_lowpass_filter). "옳은 것" 낱말만으로 잡지 않는다.
 * ※ ㉠㉡ 같은 **빈칸 마커**도 대상이 아니다(주관식 문항에서 정상적으로 쓰인다).
 */
export function hasChoiceList(text: string | undefined | null): boolean {
  if (!text) return false;
  const s = String(text);
  const marks = s.match(CHOICE_MARKS);
  if (marks && marks.length >= 3) return true;
  if (/(고르시오|고르세요|고르십시오|고른\s*것은|골라\s*쓰시오|보기\s*(중|에서)|알맞은\s*것은\s*[?？])/.test(s)) return true;
  return /(옳은|알맞은|바른)\s*것은\s*[?？]/.test(s);
}

/**
 * **원본이** 객관식인지 볼 때 쓰는 민감 판정.
 * 원본 판정은 놓치는 쪽이 더 나쁘므로(계약이 아예 발동하지 않는다) 낱말만으로도 인정한다.
 * 생성물 검사(`hasChoiceList`)와 강도를 일부러 다르게 둔다.
 */
export function looksLikeChoicePrompt(text: string | undefined | null): boolean {
  if (!text) return false;
  const s = String(text);
  if (hasChoiceList(s)) return true;
  return /(옳은\s*것은|옳은\s*것을|알맞은\s*것은|바르게\s*나타낸\s*것은|고른\s*것)/.test(s);
}
