import type { AnalysisResult, GenerationMode } from "@/types";

/**
 * 임용 33번 — **switch fall-through + 배열 부분 초기화** 출력 예측. ★결정론 archetype (GPT 없음)★
 *
 * ## 원본
 * ```c
 * int score[10] = {1, 2, 3, 4, 5};
 * int i, op=2, sum=0;
 * switch(op) {
 *   case 1 : for(i=0; i<10; i++) sum += score[i]; printf("%d \n", sum); break;
 *   case 2 : for(i=3; i<10; i++) sum += score[i]; printf("%d \n", sum);   // ★ break 없음
 *   default: for(i=5; i<10; i++) sum += score[i]; printf("%d \n", sum); break;
 * }
 * ```
 * 출력 **9, 9** (보기 ④). 채점 포인트는 정확히 **두 가지**다.
 *   (1) `case 2`에 **break가 없어 `default`로 이어진다**(fall-through) — 그래서 출력이 두 줄이다.
 *   (2) `score[10]`을 5개만 초기화해 **뒤 5개는 0**이다 — 그래서 두 합이 모두 9로 같다.
 *
 * ## ★★ 왜 전용 archetype인가 (사용자 지정 2026-08-13)
 *   GPT 경로(`runCLanguagePipeline`)는 이 두 핵심을 반복해서 잃었다 —
 *   ① 모든 case에 break를 넣거나(구조 소실) ② 출력만 하는 라벨로 흘러가거나(장식) ③ 초기화 개수를
 *   크기로 넘겨 0 구간을 지나가지 않거나 ④ 아예 switch 없는 배열 문제를 만들었다.
 *   근본 원인은 [난이도·분량 규칙](24줄 이상·함수 2개 이상)이 원본을 통째로 재작성하게 만드는 것이라
 *   프롬프트·게이트로는 안정화되지 않았다. ⇒ **코드로 구조를 확정**한다.
 *   (`logic_condition_sop`·`periodic_signal_dc_rms`처럼 "generic 경로로 흡수 불가"한 예외 사례.)
 *
 * ## 값은 규칙 열거 + 필터 (예시 하드코딩 아님)
 *   배열 크기 N·초기화 개수 k·값·두 반복문의 시작 인덱스를 열거하고, 아래를 만족하는 것만 채택한다.
 *   · `case 2`의 시작 인덱스는 **초기화 구간과 0 구간에 걸친다**(a2 < k) — 0을 실제로 더해야 핵심이 산다.
 *   · 출력이 지저분하지 않게 값 상한을 둔다.
 *   · **원본 튜플은 생성 풀에서 제외**한다(참조·검산 전용).
 */

/** 한 문항의 구조 파라미터. */
export type CSwitchValues = {
  /** 배열 크기 */
  size: number;
  /** 초기화한 원소들 (길이 k < size, 나머지는 0) */
  init: number[];
  /** switch에 넣는 값 — 원본과 같이 2 (case 2로 진입해 default로 흘러간다) */
  op: number;
  /** case 1 반복문 시작 인덱스 (실행되지 않는 distractor) */
  startCase1: number;
  /** case 2 반복문 시작 인덱스 — 초기화 구간과 0 구간에 걸쳐야 한다 */
  startCase2: number;
  /** default 반복문 시작 인덱스 */
  startDefault: number;
  /** 배열 변수 이름 */
  arrayName: string;
};

export type CSwitchGeneration = {
  values: CSwitchValues;
  /** 지문 C 코드 */
  code: string;
  /** 배열의 실제 원소 (뒤쪽 0 포함) */
  elements: number[];
  /** 첫 번째 출력 (case 2 구간 합) */
  out1: number;
  /** 두 번째 출력 (default 구간까지 누적) */
  out2: number;
  /** default 구간이 0만 더하는가 — true면 두 출력이 같다(원본의 성질) */
  defaultAddsZeroOnly: boolean;
};

// ── 값 공간 ─────────────────────────────────────────────
const NAMES = ["score", "data", "value", "num"];

/** 원본 튜플 — 생성 풀에서 제외한다(참조·검산 전용). */
const ORIGINAL: Pick<CSwitchValues, "size" | "init" | "startCase2" | "startDefault"> = {
  size: 10, init: [1, 2, 3, 4, 5], startCase2: 3, startDefault: 5,
};

/**
 * ★ 원본과 **같은 데이터**는 통째로 배제한다.
 *   시작 인덱스 하나만 달라도 배열과 case 2 구간이 원본과 같으면 첫 출력이 9로 똑같아
 *   "원본을 그대로 베낀" 문항이 된다(실측: 변형에서 `{1,2,3,4,5}` + `i=3`이 그대로 나왔다).
 *   `viTheveninMaxPower`에서 "도출량이 같은 조합도 제외"한 것과 같은 처리.
 */
function sameAsOriginal(v: CSwitchValues): boolean {
  return v.init.join(",") === ORIGINAL.init.join(",");
}

/** 시작 인덱스 s부터 끝까지의 합. */
function sumFrom(elements: number[], s: number): number {
  let t = 0;
  for (let i = s; i < elements.length; i += 1) t += elements[i];
  return t;
}

function elementsOf(v: CSwitchValues): number[] {
  const a = new Array<number>(v.size).fill(0);
  v.init.forEach((x, i) => { a[i] = x; });
  return a;
}

/**
 * 값 공간을 규칙으로 열거한다.
 *
 * @param zeroTailOnly true면 default가 **0만** 더한다(두 출력이 같다 — 원본의 성질).
 *                     false면 default가 초기화 구간까지 거슬러 올라가 **두 출력이 달라진다**.
 */
function buildSpace(zeroTailOnly: boolean): CSwitchValues[] {
  const out: CSwitchValues[] = [];
  for (const size of [8, 10]) {
    for (const k of [4, 5]) {
      if (k >= size) continue;
      for (const step of [1, 2, 3]) {
        for (const base of [1, 2, 3]) {
          // 초기화 값은 등차로 만든다 — 학생이 표를 그리기 쉽고 합이 깔끔하다.
          const init = Array.from({ length: k }, (_, i) => base + i * step);
          // case 2는 **초기화 구간과 0 구간에 걸쳐야** 한다(0을 실제로 더한다).
          for (let a2 = 1; a2 < k; a2 += 1) {
            // ★ default 구간은 최소 2개 원소를 돌게 한다 — `for(i=9; i<10; i++)`처럼 한 번만
            //   도는 반복문은 퇴화해 보이고 추적표를 그리는 재미도 없다(실측에서 나왔다).
            const starts = zeroTailOnly
              ? Array.from({ length: Math.max(0, size - k - 1) }, (_, i) => k + i)  // 0 구간에서 시작
              : Array.from({ length: k - 1 }, (_, i) => i + 1);                      // 초기화 구간에서 시작
            for (const a3 of starts) {
              for (const arrayName of NAMES) {
                const v: CSwitchValues = {
                  size, init, op: 2, startCase1: 0, startCase2: a2, startDefault: a3, arrayName,
                };
                const el = elementsOf(v);
                const out1 = sumFrom(el, a2);
                const out2 = out1 + sumFrom(el, a3);
                if (out1 <= 0 || out1 > 120 || out2 > 200) continue;   // 값이 지저분해지지 않게
                if (!zeroTailOnly && out2 === out1) continue;          // 변형은 두 출력이 달라야 한다
                if (sameAsOriginal(v)) continue;                        // ★ 원본 튜플 제외
                out.push(v);
              }
            }
          }
        }
      }
    }
  }
  return out;
}

/** 결정론 셔플 — 열거 순서대로 두면 앞쪽 문항이 전부 비슷해진다. */
function shuffleDet<T>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

/** 유사 = 원본의 성질(두 출력이 같다) / 변형 = default가 초기화 구간까지 거슬러 두 출력이 다르다. */
const SIMILAR_SPACE = shuffleDet(buildSpace(true));
const VARIANT_SPACE = shuffleDet(buildSpace(false));
export const __spaces = { SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL, buildSpace, elementsOf, sumFrom };

// ── 코드 생성 ───────────────────────────────────────────
/**
 * 지문 C 코드. 원본의 배치를 그대로 따른다 —
 * `case 1`(distractor) · `case 2`(**break 없음**) · `default`(break).
 * ★ 흐름을 설명하는 주석은 넣지 않는다 — 학생이 스스로 찾아야 한다.
 */
function buildCode(v: CSwitchValues): string {
  const a = v.arrayName;
  // 들여쓰기: 라벨(6) < 문장(9) < 반복 본문(12). 라벨과 for가 같은 열이면 어긋나 보인다(실측).
  const loop = (start: number) =>
    `         for(i=${start}; i<${v.size}; i++)\n            sum += ${a}[i];`;
  return `#include <stdio.h>

int main(void)
{
   int ${a}[${v.size}] = {${v.init.join(", ")}};
   int i, op=${v.op}, sum=0;
   switch(op)
   {
      case 1 :
${loop(v.startCase1)}
         printf("%d \\n", sum);
         break;

      case 2 :
${loop(v.startCase2)}
         printf("%d \\n", sum);

      default :
${loop(v.startDefault)}
         printf("%d \\n", sum);
         break;
   }
   return 0;
}`;
}

export function generateCSwitchFallThrough(args: {
  seed?: number;
  index?: number;
  mode: GenerationMode;
}): CSwitchGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211) % space.length;
  const values = space[idx];

  const elements = elementsOf(values);
  const out1 = sumFrom(elements, values.startCase2);
  const out2 = out1 + sumFrom(elements, values.startDefault);

  return {
    values,
    code: buildCode(values),
    elements,
    out1,
    out2,
    defaultAddsZeroOnly: values.startDefault >= values.init.length,
  };
}

// ── 공용 매처 (분류기·route 안전망이 함께 쓴다) ──────────────
export function cSwitchText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}

/** C 프로그램 문제 문맥. */
const C_CTX_RE = /c\s*언어|c\s*프로그램|프로그램\s*실행|소스\s*코드|\bstdio\b|\bprintf\b|\bmain\s*\(/i;
/** 이 유형의 뼈대 — switch + 배열 + 실행 결과(출력) 예측. */
const SWITCH_RE = /\bswitch\b|스위치\s*문/i;
const ARRAY_RE = /배열|\barray\b|\[\s*\d+\s*\]|\bint\s+\w+\s*\[/i;
const OUTPUT_RE = /실행\s*결과|출력|결과로\s*옳은|printf/i;
/**
 * 형제 양보 — C 도메인의 **다른 문법 축**이 주인 문제는 그쪽(generic GPT 경로)에 넘긴다.
 * 이 archetype은 switch fall-through + 배열 부분 초기화 **한 형식만** 재현한다.
 */
const YIELD_RE =
  /포인터|pointer|재귀|recursion|구조체|\bstruct\b|비트\s*연산|시프트|문자열\s*처리|\bstrcpy\b|\bstrlen\b|파일\s*입출력|동적\s*할당|malloc/i;

/**
 * 구조 시그니처 — **C 프로그램 + switch + 배열 + 출력 예측**.
 *
 * ★ Vision 요약이 흔들려도 잡히도록 낱말을 넓게 잡았다(CLAUDE.md 규칙 2). 실측 회차의 요약은
 *   `topic="C언어 switch문 실행 결과"` 한 줄뿐이었고, fall-through·부분 초기화는 언급되지 않았다 —
 *   그 회차에서 generic 경로가 **switch가 아예 없는 배열 문제**를 만들었다(사용자 신고 3차).
 */
export function matchesCSwitchFallThrough(a?: Partial<AnalysisResult> | null): boolean {
  const t = cSwitchText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  if (!SWITCH_RE.test(t)) return false;
  // C 문맥은 topic에 "C언어"가 없는 회차도 있어 배열/출력 신호로 보완한다.
  return (C_CTX_RE.test(t) || ARRAY_RE.test(t)) && OUTPUT_RE.test(t);
}
