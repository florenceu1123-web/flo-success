import type { AnalysisResult, GenerationMode } from "@/types";

/**
 * 임용 28번 — **n채널 JFET의 V_DS에 따른 공핍층 변화** 개념 문항.
 *
 * ## 원본
 *   (가)~(라) 네 그림이 V_DS = 1·3·5·10[V]에서의 공핍층을 개념적으로 보여 준다.
 *   조건: V_GS = 0, 선형동작구간 V_DS = 0~2[V], 핀치오프 전압 5[V].
 *   〈보기〉 ㄱ~ㄹ의 참·거짓을 가려 고르는 **객관식** → **정답 ① (ㄱ, ㄴ)**.
 *   ㄱ (가)는 선형구간이라 채널 저항이 일정 (참)
 *   ㄴ (나)는 게이트-드레인 역바이어스로 채널이 드레인 쪽으로 좁아진다 (참)
 *   **ㄷ V_GS<0의 핀치오프 전압이 V_GS=0보다 높다 ← 거짓** (V_DS,pinch = V_GS + V_P 이므로 **낮아진다**)
 *   **ㄹ (라)의 드레인 전류가 (다)보다 줄어든다 ← 거짓** (포화 영역이라 **거의 일정**)
 *
 * ## ★ 사용자 지정 (2026-08-14): **빈칸 채우기**로 출제
 *   〈보기〉 구조를 그대로 두고 핵심 용어·수식·값을 **㉠~㉤ 빈칸**으로 비운다.
 *   원본의 거짓 항목(ㄷ·ㄹ)은 **올바른 서술로 고쳐** 담는다 — 빈칸형에서는 모든 문장이 참이어야
 *   학생이 정확한 개념을 써 넣을 수 있다(`bjt_early_effect_fill_blank`와 같은 처리).
 *
 * ## 값은 규칙 열거
 *   핀치오프 전압 V_P·선형구간 상한·네 패널의 V_DS·예시 V_GS를 열거하고,
 *   **네 패널이 선형·테이퍼·핀치오프·포화 네 영역을 하나씩** 대표하도록 필터한다.
 */

export type JfetFact = {
  /** 〈보기〉 문장 — `( )` 자리에 정답이 들어간다. */
  sentence: (v: JfetValues) => string;
  answer: (v: JfetValues) => string;
  why: (v: JfetValues) => string;
};

export type JfetValues = {
  /** 핀치오프 전압 [V] (V_GS=0 기준) */
  vp: number;
  /** 선형(옴) 동작구간 상한 [V] */
  linearMax: number;
  /** 네 패널의 V_DS [V] — 선형·테이퍼·핀치오프·포화 */
  vdsList: [number, number, number, number];
  /** ㄷ 항목에서 예로 드는 음의 게이트 전압 [V] */
  vgsExample: number;
};

/** ★ 사실 표 — 모든 문장이 **참**이다. 그룹 = 지식 축(원본 ㄱ~ㄹ + 핀치오프 식). */
const GROUPED: JfetFact[][] = [
  // 축 1. 선형(옴) 영역 — 원본 ㄱ
  [
    {
      // ★ 정답을 "선형"으로 두면 **조건문의 "선형동작구간"이 그대로 답을 알려 준다**(스모크가 잡음).
      //   원본이 그 구간을 조건으로 주므로 낱말을 지울 수 없다 → 같은 지식(옴 영역의 성질)을
      //   노출 없이 묻도록 전류-전압 관계를 물어본다.
      sentence: (v) => `(가)의 \\( V_{DS} = ${v.vdsList[0]} \\)[V]는 핀치오프 전압보다 훨씬 작아 공핍층 모양이 거의 변하지 않는다. 이때 드레인 전류는 \\( V_{DS} \\)에 거의 ( )한다.`,
      answer: () => "비례",
      why: (v) => `\\( V_{DS} \\)가 \\( V_P = ${v.vp} \\)[V]에 비해 매우 작으면 채널 폭이 균일하게 유지되어 전류가 전압에 비례한다. ` +
        `문제의 조건에서도 선형동작구간을 \\( 0 \\sim ${v.linearMax} \\)[V]로 주었다.`,
    },
    {
      sentence: () => "이 구간에서 JFET는 게이트 전압으로 크기를 조절할 수 있는 ( )처럼 동작한다.",
      answer: () => "가변저항",
      why: () => "채널이 균일한 막대 도체처럼 행동하고, \\( V_{GS} \\)로 그 단면적을 조절할 수 있기 때문이다.",
    },
  ],
  // 축 2. 채널 테이퍼링 — 원본 ㄴ
  [
    {
      sentence: (v) => `(나)에서 게이트-드레인 간 전압은 \\( V_{GD} = V_{GS} - V_{DS} = \\) ( )[V]이다.`,
      answer: (v) => `${-v.vdsList[1]}`,
      why: (v) => `\\( V_{GS} = 0 \\)이므로 \\( V_{GD} = 0 - ${v.vdsList[1]} = ${-v.vdsList[1]} \\)[V]로 역바이어스가 걸린다.`,
    },
    {
      sentence: () => "역바이어스는 드레인 쪽에서 가장 크므로 공핍층은 드레인 쪽으로 갈수록 ( ).",
      answer: () => "두꺼워진다(넓어진다)",
      why: () => "공핍층 두께는 접합에 걸린 역바이어스가 클수록 두꺼워진다. 드레인 쪽 전위가 높아 그쪽 역바이어스가 가장 크다.",
    },
    {
      sentence: () => "그 결과 채널은 쐐기 모양이 되어, 소스에서 드레인으로 갈수록 단위 길이당 저항이 ( )한다.",
      answer: () => "증가",
      why: () => "채널 단면적이 좁아질수록 저항이 커지므로, 좁아지는 드레인 쪽의 단위 길이당 저항이 더 크다.",
    },
  ],
  // 축 3. 핀치오프 조건 — 원본 ㄷ(오류를 바로잡아 담음)
  [
    {
      sentence: () => "핀치오프는 게이트-드레인 전압이 \\( -V_P \\)에 도달할 때 일어나므로, 핀치오프가 시작되는 드레인 전압은 \\( V_{DS} = \\) ( )이다.",
      answer: () => "\\( V_{GS} + V_P \\)",
      why: () => "\\( V_{GD} = V_{GS} - V_{DS} = -V_P \\)를 \\( V_{DS} \\)에 대해 풀면 \\( V_{DS} = V_{GS} + V_P \\)다.",
    },
    {
      sentence: () => "따라서 \\( V_{GS} \\)가 음(−)으로 갈수록 핀치오프가 시작되는 \\( V_{DS} \\)는 ( ).",
      answer: () => "낮아진다",
      why: () => `\\( V_{DS} = V_{GS} + V_P \\)에서 \\( V_{GS} \\)가 음수면 그만큼 작아진다. ` +
        `★ 원본 ㄷ은 이 관계를 거꾸로("더 높다") 서술한 거짓 항목이었다.`,
    },
    {
      sentence: (v) => `\\( V_{GS} = ${v.vgsExample} \\)[V]이면 핀치오프가 시작되는 \\( V_{DS} \\)는 ( )[V]이다.`,
      answer: (v) => `${v.vgsExample + v.vp}`,
      why: (v) => `\\( V_{DS} = V_{GS} + V_P = ${v.vgsExample} + ${v.vp} = ${v.vgsExample + v.vp} \\)[V].`,
    },
  ],
  // 축 4. 포화 영역 — 원본 ㄹ(오류를 바로잡아 담음)
  [
    {
      sentence: (v) => `(라)처럼 \\( V_{DS} \\)가 핀치오프 전압을 넘어서면, \\( V_{DS} \\)가 커져도 드레인 전류는 거의 ( )하다.`,
      answer: () => "일정",
      why: () => `\\( V_{DS} \\)가 늘어난 만큼 공핍 영역이 드레인 쪽으로 길어져 **채널 양단에 걸리는 전압은 거의 그대로**다. ` +
        `★ 원본 ㄹ은 전류가 "줄어든다"고 한 거짓 항목이었다.`,
    },
    {
      sentence: () => "핀치오프 이후에도 전류가 흐르는 것은, 좁아진 지점의 강한 ( )가 캐리어를 드레인 쪽으로 끌어당기기 때문이다.",
      answer: () => "전계(전기장)",
      why: () => "채널이 완전히 끊기는 것이 아니라 공핍 영역을 캐리어가 표류(drift)해 건너간다.",
    },
  ],
  // 축 5. 소자 구조
  [
    {
      sentence: () => "n채널 JFET의 게이트는 ( ) 형 반도체이며, 게이트-채널 접합은 항상 역바이어스로 동작시킨다.",
      answer: () => "p(p⁺)",
      why: () => "게이트 접합이 순바이어스가 되면 게이트 전류가 흘러 입력 임피던스가 무너지므로 항상 역바이어스로 쓴다.",
    },
  ],
];

// ── 값 공간 ─────────────────────────────────────────────
function buildSpace(): JfetValues[] {
  const out: JfetValues[] = [];
  for (const vp of [4, 5, 6, 8]) {
    for (const linearMax of [1, 2, 3]) {
      if (linearMax >= vp - 1) continue;
      for (const v1 of [1, 2]) {
        if (v1 > linearMax) continue;
        for (const v2 of [3, 4]) {
          if (v2 <= linearMax || v2 >= vp) continue;          // 테이퍼 구간
          for (const v4 of [10, 12, 15]) {
            if (v4 <= vp + 2) continue;                        // 확실한 포화
            for (const vgsExample of [-1, -2]) {
              if (vgsExample + vp <= linearMax) continue;      // 예시가 의미 있게
              out.push({ vp, linearMax, vdsList: [v1, v2, vp, v4], vgsExample });
            }
          }
        }
      }
    }
  }
  return out;
}

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k).map((p) => p.x);
}

const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, GROUPED };

// ── 생성 ────────────────────────────────────────────────
const MARKS = ["㉠", "㉡", "㉢", "㉣", "㉤"];
const ITEM_KEYS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ"];

export type JfetGeneration = {
  values: JfetValues;
  items: string[];
  answers: Array<{ mark: string; value: string; why: string }>;
  /** 이번 문항이 고른 사실들 — 스모크가 지식 축 중복·정답 노출을 검사한다. */
  facts: JfetFact[];
};

export function generateJfetDepletionFillBlank(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): JfetGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const base = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211);
  const values = space[base % space.length];

  const items: string[] = [];
  const answers: JfetGeneration["answers"] = [];
  const facts: JfetFact[] = [];
  // ★ 사실 회전은 **index만** 쓴다 — seed를 섞으면 배치 안 문항이 전부 같은 조합이 된다(실측).
  //   값(values)은 seed 기반이라 수치는 문항마다 다르다.
  //   변형은 회전을 한 칸 밀어 유사와 **다른 빈칸 조합**을 낸다(값 공간도 이미 분리돼 있다).
  const rot = Math.abs(args.index ?? 0) + (args.mode === "exam_variant" ? 1 : 0);
  GROUPED.forEach((group, gi) => {
    const f = group[(rot + gi) % group.length];
    items.push(`${ITEM_KEYS[gi]}. ${f.sentence(values).replace("( )", `( ${MARKS[gi]} )`)}`);
    answers.push({ mark: MARKS[gi], value: f.answer(values), why: f.why(values) });
    facts.push(f);
  });
  return { values, items, answers, facts };
}

// ── 공용 매처 ────────────────────────────────────────────
export function jfetText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

const JFET_RE = /jfet|접합\s*전계효과|전계효과\s*트랜지스터|fet\b/i;
/** 이 유형의 고유 신호 — **공핍층 변화 + 핀치오프**. */
const CONCEPT_RE = /공핍층|공핍\s*영역|핀치\s*오프|pinch[\s-]?off|채널\s*폭|선형\s*동작|포화\s*영역/i;
/** 형제 양보 — JFET **바이어스 계산**(분압·I_D·R_D)은 `jfet_voltage_bias`가 담당한다. */
const YIELD_RE =
  /바이어스|분압|동작점|구하시오|구한다|계산하|\br_?d\b|\br_?s\b|소신호|이득|증폭/i;

/** 구조 시그니처 — **JFET + 공핍층/핀치오프 개념 서술**. */
export function matchesJfetDepletionFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  const t = jfetText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  return JFET_RE.test(t) && CONCEPT_RE.test(t);
}
