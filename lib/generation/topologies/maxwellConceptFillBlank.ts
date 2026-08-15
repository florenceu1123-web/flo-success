import type { AnalysisResult, GenerationMode } from "@/types";

/**
 * 임용 24번 — **Maxwell 방정식**에 대한 개념 문항. ★그림 없음★
 *
 * ## 원본
 *   〈보기〉 ㄱ~ㄹ의 참·거짓을 가려 고르는 객관식. 다루는 지식점은
 *   ㄱ 변위전류밀도의 **정체**(체적전하 이동이 아니다 — 그것은 전도전류밀도다) ← 원본의 **거짓** 항목
 *   ㄴ ∇×H = J + ∂D/∂t 에서 ∂D/∂t를 도입한 **이유**(전류 연속방정식과의 정합)
 *   ㄷ 패러데이 — 자속밀도가 시불변이어도 **면적**이 변하면 기전력이 생긴다
 *   ㄹ Maxwell 방정식의 해로 도체 내 **표피 깊이(skin depth)** 를 예측
 *
 * ## ★ 사용자 지정 (2026-08-12): **빈칸 채우기**로 출제 — 임용 27번과 같은 처리
 *   〈보기〉 4항목 구조를 그대로 두고 핵심 용어·수식을 **㉠~㉤ 빈칸**으로 비운다.
 *   원본은 참·거짓 판별이라 ㄱ처럼 **틀린 서술**을 읽혀야 하지만, 빈칸형으로 바꾸면 모든 문장이
 *   **참인 서술**이 되고 학생은 정확한 용어·수식을 직접 써야 한다(개념 확인이 더 정밀해진다).
 *
 * ## 값은 규칙 열거 — 사실 표에서 **어느 항목을 비울지**를 조합한다(예시 하드코딩 아님)
 *   Maxwell 4방정식 + 보조 개념(변위전류·연속방정식·표피깊이)을 사실 표로 두고,
 *   문항마다 서로 다른 다섯 자리를 비운다. 정답은 표에서 그대로 나오므로 **결정론**이다.
 */

export type MaxwellFact = {
  /** 〈보기〉 항목 문장 — {} 자리에 정답이 들어간다. */
  sentence: string;
  answer: string;
  /** 풀이 근거 */
  why: string;
};

/** ★ 사실 표 — 모든 문장은 **참**이다(원본 ㄱ의 오류 서술은 올바른 형태로 고쳐 담았다). */
const FACTS: MaxwellFact[] = [
  {
    sentence: "체적전하의 이동으로 발생하는 전류밀도를 {}(이)라 하고, 이는 변위전류밀도와 구별된다.",
    answer: "전도전류밀도(J)",
    why: "변위전류밀도 ∂D/∂t는 전하의 **이동**이 아니라 시간에 따라 변하는 전속밀도에서 생긴다. " +
      "체적전하의 이동으로 생기는 것은 전도전류밀도 J다(원본 ㄱ이 이 둘을 바꿔 서술한 오답 항목이었다).",
  },
  {
    sentence: "앙페르–맥스웰 법칙은 ∇ × H = J + {} 로 쓴다.",
    answer: "∂D/∂t",
    why: "정자계의 ∇ × H = J 만으로는 전류 연속방정식과 모순이 생겨 Maxwell이 변위전류항 ∂D/∂t를 더했다.",
  },
  {
    sentence: "∇ × H = J + ∂D/∂t 에서 ∂D/∂t 항은 {}을(를) 만족시키기 위해 도입된 개념이다.",
    answer: "전류 연속방정식(∇·J + ∂ρ/∂t = 0)",
    why: "∇·(∇×H) = 0 이므로 ∇·J + ∇·(∂D/∂t) = 0 이고, ∇·D = ρ를 대입하면 연속방정식이 그대로 나온다.",
  },
  {
    sentence: "폐루프를 쇄교하는 **자속밀도가 시불변**이더라도 폐루프의 {}이(가) 시간에 따라 변하면 유도 기전력이 발생할 수 있다.",
    answer: "단면적",
    why: "기전력은 e = −dΦ/dt 이고 Φ = ∫B·dA 이므로, B가 일정해도 면적 A가 변하면 Φ가 변해 기전력이 생긴다.",
  },
  {
    sentence: "시변 전계·자계에 대한 편미분 방정식인 Maxwell 방정식의 해로부터, 도체 내 전자파의 진행 특성인 {}을(를) 예측할 수 있다.",
    answer: "표피 깊이(skin depth)",
    why: "양도체에서 전자파의 진폭이 1/e로 줄어드는 깊이 δ = √(2/(ωμσ)) 를 표피 깊이라 한다.",
  },
  {
    sentence: "양도체에서 표피 깊이 δ는 각주파수 ω, 투자율 μ, 도전율 σ에 대하여 δ = {} 이다.",
    answer: "√(2/(ωμσ))",
    why: "감쇠상수 α = √(ωμσ/2) 이고 δ = 1/α 이므로 δ = √(2/(ωμσ)).",
  },
  {
    sentence: "가우스 법칙(전계)은 미분형으로 ∇ · D = {} 이다.",
    answer: "ρ_v (체적전하밀도)",
    why: "전속밀도의 발산은 그 점의 체적전하밀도와 같다.",
  },
  {
    sentence: "자계에 대한 가우스 법칙은 ∇ · B = {} 이며, 이는 고립된 자하가 존재하지 않음을 뜻한다.",
    answer: "0",
    why: "자기력선은 끊기지 않고 닫힌 곡선을 이루므로 발산이 0이다.",
  },
  {
    sentence: "패러데이 법칙의 미분형은 ∇ × E = {} 이다.",
    answer: "−∂B/∂t",
    why: "시간에 따라 변하는 자속밀도가 전계의 회전을 만든다(음부호는 렌츠의 법칙).",
  },
];

export type MaxwellValues = {
  /** 비울 사실의 인덱스 5개 (FACTS 기준) */
  picks: number[];
};

// ── 값 공간 — 5개 조합을 규칙 열거 ─────────────
/** 각 문항이 다루는 지식 축이 겹치지 않도록 그룹을 나눠 하나씩 뽑는다. */
const GROUPS: number[][] = [
  [0],           // 전도 vs 변위 전류밀도
  [1, 2],        // 앙페르–맥스웰 / 도입 이유
  [3],           // 패러데이 — 면적 변화
  [4, 5],        // 표피 깊이 (용어 / 식)
  [6, 7, 8],     // 나머지 Maxwell 방정식
];

function buildSpace(): MaxwellValues[] {
  const out: MaxwellValues[] = [];
  const rec = (gi: number, acc: number[]) => {
    if (gi === GROUPS.length) { out.push({ picks: [...acc] }); return; }
    for (const idx of GROUPS[gi]) rec(gi + 1, [...acc, idx]);
  };
  rec(0, []);
  return out;
}

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 })).sort((p, q) => p.k - q.k).map((p) => p.x);
}
const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, FACTS };

// ── 생성 ─────────────────────────────────────
const MARKS = ["㉠", "㉡", "㉢", "㉣", "㉤"];
const ITEM_KEYS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ"];

export type MaxwellGeneration = {
  values: MaxwellValues;
  items: string[];
  answers: Array<{ mark: string; value: string; why: string }>;
};

export function generateMaxwellConceptFillBlank(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): MaxwellGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211) % space.length;
  const values = space[idx];

  const items: string[] = [];
  const answers: MaxwellGeneration["answers"] = [];
  values.picks.forEach((factIdx, i) => {
    const f = FACTS[factIdx];
    items.push(`${ITEM_KEYS[i]}. ${f.sentence.replace("{}", `( ${MARKS[i]} )`)}`);
    answers.push({ mark: MARKS[i], value: f.answer, why: f.why });
  });
  return { values, items, answers };
}

// ── 공용 매처 ────────────────────────────────
export function maxwellText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

const MAXWELL_RE = /maxwell|맥스웰|막스웰/i;
/** 이 유형의 뼈대 — Maxwell 방정식 **자체**를 설명하는 개념 문항. */
const CONCEPT_RE = /변위\s*전류|연속\s*방정식|표피\s*깊이|skin\s*depth|∇\s*×|회전|발산|미분형|네\s*가지\s*방정식|4개의?\s*방정식/i;
/**
 * 형제 양보 — EM **계산** 유형(레지스트리)은 수치를 주고 값을 구한다. 그쪽에 넘긴다.
 * 회로 낱말도 마찬가지.
 */
const YIELD_RE =
  /구하시오|구한다|계산하|\[V\/m\]|\[A\/m\]|\[Wb\]|\[T\]|\[C\]|점전하|선전하|면전하|도선|루프의?\s*반지름|정전용량|인덕턴스\s*를|자계의?\s*세기를|전계의?\s*세기를|플립플롭|게이트|저항|커패시터/i;

/**
 * 구조 시그니처 — **Maxwell + 개념 서술**(변위전류·연속방정식·표피깊이·미분형).
 * 수치를 주고 값을 구하는 EM 계산 문항이면 양보한다(그쪽은 EM 레지스트리가 담당).
 */
export function matchesMaxwellConceptFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  const t = maxwellText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  return MAXWELL_RE.test(t) && CONCEPT_RE.test(t);
}
