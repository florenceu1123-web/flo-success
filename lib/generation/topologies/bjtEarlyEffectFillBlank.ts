import type { AnalysisResult, GenerationMode } from "@/types";

/**
 * 임용 27번 — npn BJT 공통 이미터(CE) 접속의 **Early 효과** 개념 문항.
 *
 * ## 원본
 *   (가) BJT 단면도 — Collector/Base/Emitter 영역, CBJ·EBJ 공핍층, 유효 베이스폭 W_B^eff
 *   (나) 출력특성곡선 — 활성영역 직선을 왼쪽으로 연장하면 V_CE축과 −V_A에서 만난다.
 *        기울기의 역수가 동적출력저항 r_o = 1/(dI_C/dV_CE).
 *   〈보기〉 ㄱ~ㅁ의 참·거짓을 가려 고르는 **객관식**(정답 ② ㄱ·ㄴ·ㅁ). 다루는 지식점은
 *   ㄱ V_A = Early 전압 (참)
 *   ㄴ V_CE 증가 → 유효 베이스폭 감소 (참)
 *   ㄷ r_o → ∞ 일 때 Early 효과가 나타난다 ← **거짓** (r_o가 유한해야 나타난다)
 *   ㄹ W_B^eff = W_B 일 때 Punch Through ← **거짓** (W_B^eff → 0 일 때다)
 *   ㅁ V_CE 증가 → 베이스 내 소수캐리어 농도 기울기 증가 (참)
 *
 * ## ★ 사용자 지정 (2026-08-13): **빈칸 채우기**로 출제 — 임용 24·27번과 같은 처리
 *   〈보기〉 5항목 구조를 그대로 두고 핵심 용어·수식을 **㉠~㉤ 빈칸**으로 비운다.
 *   원본은 참·거짓 판별이라 ㄷ·ㄹ처럼 **틀린 서술**을 읽혀야 하지만, 빈칸형에서는 모든 문장이
 *   **참인 서술**이 되고 학생이 정확한 용어·수식을 직접 써야 한다(개념 확인이 더 정밀해진다).
 *   ★ 그림 (가)·(나)는 **유지**한다(사용자 지정) — 원본의 구조·원리를 그대로 두고 형식만 바꾼다.
 *
 * ## 값은 규칙 열거 — 사실 표에서 **어느 항목을 비울지**를 조합한다(예시 하드코딩 아님)
 *   지식 축 5개(Early 전압 / 공핍층·유효 베이스폭 / 소수캐리어 / 동적출력저항 / Punch Through)를
 *   그룹으로 두고 각 그룹에서 하나씩 뽑는다. 원본의 5항목 축을 그대로 보존한다.
 *
 * ## ★★ 정답 노출 금지 — 두 방향을 모두 막는다
 *   (1) **문항 안에서**: 어떤 보기 문장도 다른 보기의 정답 문자열을 담지 않도록 표를 짰다
 *       (예: "베이스폭 변조"가 정답인 항목이 있으므로 다른 문장은 그 말을 쓰지 않는다).
 *       발문·조건도 "Early"를 쓰지 않는다 — 그 말 자체가 정답인 항목이 있다.
 *   (2) **그림에서**: (나)의 `r_o = 1/(dI_C/dV_CE)` 주석은 그대로 두면 D1의 정답이 그림에 찍힌다.
 *       그 항목이 뽑힌 문항에서는 주석을 **빈칸 기호로 바꿔** 내보낸다(`figureMask`).
 *       CLAUDE.md의 `thevenin_dep_graph_max_power`에서 학생이 구할 절편을 기호로만 찍은 것과 같은 처리다.
 */

/** 그림에 찍히는 주석 중 **정답과 겹치는** 자리. 그 항목이 뽑히면 빈칸 기호로 바꿔 내보낸다. */
export type BjtEarlyFigureMask = "roFormula";

export type BjtEarlyFact = {
  /** 〈보기〉 항목 문장 — {} 자리에 정답이 들어간다. */
  sentence: string;
  answer: string;
  /** 풀이 근거 */
  why: string;
  /** 이 항목이 뽑히면 가려야 할 그림 주석 */
  figureMask?: BjtEarlyFigureMask;
};

/**
 * ★ 사실 표 — 모든 문장은 **참**이다(원본 ㄷ·ㄹ의 오류 서술은 올바른 형태로 고쳐 담았다).
 *   그룹 = 지식 축. 한 문항은 그룹마다 하나씩 뽑아 5개의 빈칸을 만든다.
 */
const GROUPED_FACTS: BjtEarlyFact[][] = [
  // ── 축 1. Early 전압 (원본 ㄱ) ─────────────────────────────
  [
    {
      sentence:
        "(나)에서 활성영역의 특성곡선을 왼쪽으로 연장하면 \\( V_{CE} \\)축과 \\( -V_A \\)에서 만난다. 이때 \\( V_A \\)를 ( ) 전압이라 한다.",
      answer: "Early(얼리)",
      why:
        "활성영역의 \\( I_C \\)–\\( V_{CE} \\) 직선을 왼쪽으로 외삽하면 여러 곡선이 \\( V_{CE} = -V_A \\) 한 점에서 만난다. " +
        "이 절편의 크기 \\( V_A \\)를 Early 전압이라 하며, 베이스폭 변조의 세기를 나타내는 소자 상수다.",
    },
    {
      sentence:
        "같은 \\( V_{CE} \\) 변화에 대해 \\( V_A \\)가 큰 소자일수록 \\( I_C \\)의 변화량은 ( ).",
      answer: "작다(작아진다)",
      why:
        "활성영역에서 \\( I_C = I_S e^{V_{BE}/V_T}\\left(1 + \\dfrac{V_{CE}}{V_A}\\right) \\)이므로 " +
        "\\( \\dfrac{dI_C}{dV_{CE}} = \\dfrac{I_S e^{V_{BE}/V_T}}{V_A} \\)다. \\( V_A \\)가 클수록 기울기가 작아져 특성곡선이 수평에 가까워진다.",
    },
  ],
  // ── 축 2. CBJ 공핍층 · 유효 베이스폭 (원본 ㄴ) ──────────────
  [
    {
      // ★ 처음에는 "( ) 영역 쪽으로 넓어진다 → 베이스"로 두었는데, 다른 보기 문장에도
      //   "베이스"가 널려 있어(유효 베이스폭·베이스 내 소수캐리어) 사실상 답이 노출됐다(스모크가 잡음).
      //   원인이 되는 물리량 쪽을 비우면 노출도 없고 개념 확인도 정확해진다.
      sentence:
        "\\( V_{CE} \\)가 증가하면 CBJ(컬렉터–베이스 접합)의 ( )가 커져 공핍층이 베이스 영역 쪽으로 넓어진다.",
      answer: "역방향 바이어스(역바이어스)",
      why:
        "CE 접속에서 \\( V_{CB} = V_{CE} - V_{BE} \\)이고 \\( V_{BE} \\)는 거의 일정하므로 \\( V_{CE} \\) 증가는 곧 CBJ의 역바이어스 증가다. " +
        "역바이어스가 커지면 공핍층이 넓어지고, 불순물 농도가 낮은 베이스 쪽으로 더 많이 확장된다.",
    },
    {
      sentence:
        "\\( V_{CE} \\)의 증가는 (가)의 유효 베이스폭 \\( W_B^{eff} \\)를 ( )시킨다.",
      answer: "감소",
      why:
        "CBJ 공핍층이 베이스 쪽으로 넓어진 만큼 중성 베이스 영역이 줄어든다. " +
        "즉 \\( W_B^{eff} \\)는 \\( V_{CE} \\)가 커질수록 좁아진다(원본 ㄴ의 참인 서술).",
    },
    {
      sentence:
        "유효 베이스폭이 \\( V_{CE} \\)에 따라 달라지는 이 현상을 ( )라고 한다.",
      answer: "베이스폭 변조(base-width modulation)",
      why:
        "Early 효과의 물리적 원인이 곧 베이스폭 변조다. 바이어스에 따라 중성 베이스폭이 변하고, 그 결과 \\( I_C \\)가 \\( V_{CE} \\)에 의존하게 된다.",
    },
  ],
  // ── 축 3. 소수캐리어 농도 기울기 (원본 ㅁ) ──────────────────
  [
    {
      // ★ 정답을 "증가"로 두면 다른 문장의 "V_CE가 증가하면"·"I_C가 증가한다"에 그대로 노출된다(스모크가 잡음).
      //   뜻이 같으면서 이 문항에만 쓰이는 표현으로 바꿨다.
      sentence:
        "유효 베이스폭이 좁아지면 베이스 내 소수캐리어 농도의 기울기는 ( ).",
      answer: "가팔라진다(증가한다)",
      why:
        "베이스 양단의 소수캐리어 농도는 접합 전압이 정하므로 거의 그대로인데 폭만 좁아진다. " +
        "따라서 농도 분포의 기울기 \\( \\dfrac{dn}{dx} \\)가 가팔라진다(원본 ㅁ의 참인 서술).",
    },
    {
      sentence:
        "베이스 내 소수캐리어 농도의 기울기가 커지면 베이스를 가로지르는 ( ) 전류가 늘어 \\( I_C \\)가 커진다.",
      answer: "확산(diffusion)",
      why:
        "베이스를 건너는 소수캐리어 수송은 확산이 지배하며 \\( J = qD\\dfrac{dn}{dx} \\)다. " +
        "기울기가 가팔라지면 확산 전류가 커지고 그것이 곧 컬렉터 전류의 증가로 나타난다.",
    },
  ],
  // ── 축 4. 동적출력저항 r_o (원본 ㄷ — 오류 서술을 바로잡아 담았다) ──
  [
    {
      sentence:
        "(나)에서 동적출력저항 \\( r_o \\)는 활성영역 기울기의 역수인 ( )로 정의된다.",
      answer: "\\( 1/(dI_C/dV_{CE}) \\)",
      why:
        "\\( r_o \\)는 출력 단자에서 본 소신호 저항이므로 \\( r_o = \\dfrac{\\partial V_{CE}}{\\partial I_C} = \\dfrac{1}{dI_C/dV_{CE}} \\)다.",
      figureMask: "roFormula",
    },
    {
      sentence:
        "\\( r_o \\)가 ( )이면 활성영역의 특성곡선이 완전히 수평이 되어 \\( I_C \\)가 \\( V_{CE} \\)에 무관해진다.",
      answer: "∞(무한대)",
      why:
        "\\( r_o \\to \\infty \\)는 \\( \\dfrac{dI_C}{dV_{CE}} \\to 0 \\)을 뜻한다. " +
        "★ 이는 Early 효과가 **나타나지 않는** 이상적인 경우다 — 원본 ㄷ은 이 관계를 거꾸로 서술한 거짓 항목이었다.",
    },
    {
      sentence:
        "\\( V_A \\)와 \\( I_C \\)로 나타내면 활성영역에서 \\( r_o \\approx \\) ( )이다.",
      answer: "\\( V_A/I_C \\)",
      why:
        "\\( \\dfrac{dI_C}{dV_{CE}} = \\dfrac{I_C}{V_A + V_{CE}} \\)이고 보통 \\( V_A \\gg V_{CE} \\)이므로 " +
        "\\( r_o = \\dfrac{V_A + V_{CE}}{I_C} \\approx \\dfrac{V_A}{I_C} \\)다.",
    },
  ],
  // ── 축 5. Punch Through (원본 ㄹ — 오류 서술을 바로잡아 담았다) ──
  [
    {
      sentence:
        "\\( V_{CE} \\)가 지나치게 커져 유효 베이스폭이 ( )에 가까워지면 Punch Through가 발생하여 트랜지스터의 기능을 상실한다.",
      answer: "0",
      why:
        "★ 원본 ㄹ은 \\( W_B^{eff} = W_B \\)일 때라고 했으나 그때는 공핍층이 베이스를 잠식하기 전인 **정상 상태**다. " +
        "Punch Through는 반대로 \\( W_B^{eff} \\to 0 \\)일 때 일어난다.",
    },
    {
      sentence:
        "CBJ의 공핍층이 베이스를 가로질러 EBJ의 공핍층과 맞닿아 트랜지스터의 기능을 상실하는 현상을 ( )라 한다.",
      answer: "Punch Through(펀치 스루)",
      why:
        "두 공핍층이 맞닿으면 중성 베이스가 사라져 베이스 전류로 컬렉터 전류를 제어할 수 없게 된다. " +
        "\\( I_C \\)는 \\( V_{CE} \\)에 따라 급격히 늘어난다.",
    },
  ],
];

export type BjtEarlyValues = {
  /** 그룹별로 고른 사실의 인덱스 (그룹 순서와 같은 길이). */
  picks: number[];
};

// ── 값 공간 — 그룹마다 하나씩 뽑는 조합을 규칙 열거 ──────────────
function buildSpace(): BjtEarlyValues[] {
  const out: BjtEarlyValues[] = [];
  const rec = (gi: number, acc: number[]) => {
    if (gi === GROUPED_FACTS.length) {
      out.push({ picks: [...acc] });
      return;
    }
    for (let i = 0; i < GROUPED_FACTS[gi].length; i += 1) rec(gi + 1, [...acc, i]);
  };
  rec(0, []);
  return out;
}

/** 결정론 셔플 — 열거 순서대로 두면 앞쪽 문항이 전부 비슷해진다. */
function shuffleDet<T>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, GROUPED_FACTS };

// ── 생성 ────────────────────────────────────────────────────
const MARKS = ["㉠", "㉡", "㉢", "㉣", "㉤"];
const ITEM_KEYS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ"];

/** (나) 특성곡선의 r_o 주석 원문 — 이 문자열이 D1의 정답과 겹친다. */
export const RO_FORMULA_NOTE = "r_o = 1/(dI_C/dV_CE)";

export type BjtEarlyGeneration = {
  values: BjtEarlyValues;
  /** 〈보기〉 문장 5개 (ㄱ~ㅁ) */
  items: string[];
  answers: Array<{ mark: string; value: string; why: string }>;
  /** (나) 그림에 찍을 r_o 주석 — 그 항목이 빈칸이면 기호로 바뀐다. */
  roNote: string;
};

export function generateBjtEarlyEffectFillBlank(args: {
  seed?: number;
  index?: number;
  mode: GenerationMode;
}): BjtEarlyGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211) % space.length;
  const values = space[idx];

  const items: string[] = [];
  const answers: BjtEarlyGeneration["answers"] = [];
  let roNote = RO_FORMULA_NOTE;

  values.picks.forEach((factIdx, i) => {
    const f = GROUPED_FACTS[i][factIdx];
    items.push(`${ITEM_KEYS[i]}. ${f.sentence.replace("{}", "").replace("( )", `( ${MARKS[i]} )`)}`);
    answers.push({ mark: MARKS[i], value: f.answer, why: f.why });
    // ★ 정답이 그림에 찍히면 그림 쪽을 빈칸 기호로 바꾼다 (문항이 스스로 답을 알려주지 않게).
    if (f.figureMask === "roFormula") roNote = `r_o = ( ${MARKS[i]} )`;
  });

  return { values, items, answers, roNote };
}

// ── 공용 매처 (분류기·route 안전망이 함께 쓴다) ────────────────
export function bjtEarlyText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}

/** BJT 문맥 — 이 유형은 회로도가 아니라 소자 단면도·특성곡선이라 소자명이 유일한 닻이다. */
const BJT_CTX_RE = /bjt|쌍극성|접합\s*트랜지스터|npn|pnp|공통\s*이미터|common[\s-]?emitter|트랜지스터/i;
/**
 * 이 유형의 고유 신호. ★ `early`는 **단어 경계**로 검사한다 —
 * 경계 없이 쓰면 "clearly"·"nearly" 같은 영문 낱말에 걸린다
 * (CLAUDE.md의 "비정현파 ⊃ 정현파"·"개루프 이득 ⊃ 루프 이득"과 같은 함정).
 */
const EARLY_RE =
  /\bearly\b|얼리\s*효과|얼리\s*전압|베이스\s*폭\s*변조|베이스폭\s*변조|base[\s-]?width\s*modulation|유효\s*베이스\s*폭|punch\s*through|펀치\s*스루/i;
/** 곁들여 나오는 개념 신호 — 위 고유 신호가 흔들린 회차의 보조 닻. */
const CONCEPT_RE =
  /동적\s*출력\s*저항|출력\s*저항|\br_?o\b|\bv_?a\b|공핍층|소수\s*캐리어|소수\s*반송자|w_b|활성\s*영역/i;
/**
 * 형제 양보 — BJT **계산·설계** 유형은 수치를 주고 값을 구한다.
 *  · `bjt_bias`·`bjt_thevenin_bias` — 바이어스·동작점·저항 설계
 *  · `bjt_characteristic_curve` — 특성곡선의 **영역 이름**을 묻는 유형(개념 낱말이 없다)
 *  · `zener_bjt_regulator`·`opamp_series_regulator` — 정전압
 *  · `bjt_switch_logic_gate` — 스위치·논리게이트
 */
const YIELD_RE =
  /바이어스|동작점|소신호\s*등가|전압\s*이득|증폭률|제너|레귤레이터|정전압|논리\s*게이트|진리표|스위치|테브난|구하시오|구한다|계산하/i;

/**
 * 구조 시그니처 — **BJT 문맥 + Early 효과 고유 낱말**(베이스폭 변조·유효 베이스폭·Punch Through).
 * 형제 BJT 계산 유형은 수치를 주고 값을 구하므로 양보한다.
 */
export function matchesBjtEarlyEffectFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  const t = bjtEarlyText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  if (!BJT_CTX_RE.test(t)) return false;
  // 고유 낱말이 하나라도 있으면 확정. 없으면 개념 신호만으로는 잡지 않는다
  // (활성영역·출력저항은 형제 특성곡선 유형도 쓴다).
  return EARLY_RE.test(t) && CONCEPT_RE.test(t);
}
