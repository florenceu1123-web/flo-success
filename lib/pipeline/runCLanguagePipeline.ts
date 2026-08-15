import { MULTIPLE_CHOICE_TO_THREE_STEP_RULE } from "@/lib/format/threeStep";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { createLogger } from "@/lib/logger";
import { buildContextHint } from "./_common";
import { generateProblemsJson, generateJsonObject, asStr, asStrArray } from "./_gptGen";
import { GENERATION_MODE_LABEL, GENERATION_POLICIES } from "@/types";
import type {
  AnalysisResult,
  CodeBlockDiagram,
  FigureVariant,
  GeneratedProblem,
  GenerationMode,
  TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runCLanguagePipeline");

/**
 * 지문 코드의 최소 분량(실질 줄 수 = 주석·빈 줄 제외).
 *
 * 원본 기출이 "함수 1개 + 단일 for" 수준으로 짧아, 그대로 두면 생성물도 원본을 베낀
 * 10줄짜리가 나온다(사용자 신고 2026-08-03). 임용 실전 난이도를 맞추기 위해 하한을 둔다.
 * ※ 프롬프트 규칙이 1차 방어, 이 상수는 그걸 어겼을 때의 결정론 게이트다.
 */
export const MIN_CODE_LINES = 24;

/**
 * 주석·빈 줄을 제외한 실질 코드 줄 수.
 *
 * 모델이 "줄 수를 늘리라"는 지시를 빈 줄·주석으로 때우는 것을 막기 위해 분량 판정은
 * 항상 이 함수를 쓴다. 문자열 리터럴 안의 `//`는 무시(전처리 지시자·경로 오탐 방지).
 */
/**
 * 원본 지문에 등장하는 **문법 개념**을 결정론으로 판정하는 규칙표.
 *
 * ★ 왜 필요한가 (사용자 신고 2026-08-05): 원본이 "포인터로 배열 합계 + sizeof + 정수 나눗셈"인데
 *   생성물이 **재귀 함수** 문제로 나왔다. 원인은 프롬프트 자체가 재귀를 유도한 것이다 —
 *   난이도 규칙이 "그중 하나는 다른 함수를 호출하거나 **재귀**여야" 라고 적혀 있었고,
 *   변형 모드 예시에도 "**반복↔재귀**"가 있었다. 원본에 없는 개념이 들어가면 같은 학습목표를
 *   시험하지 못한다(절대규칙 0: 구조·원리 유사성).
 *   → 원본 텍스트에서 개념을 뽑아 **허용 목록**을 만들고, 목록에 없는 개념은 프롬프트로 금지 +
 *     결정론 게이트로 재요청한다.
 */
const CONCEPT_RULES: Array<{ key: string; label: string; re: RegExp }> = [
  { key: "recursion", label: "재귀", re: /재귀|recursion|recursive/i },
  { key: "pointer", label: "포인터·주소", re: /포인터|pointer|주소\s*전달|역참조|\*\s*ptr|&\w/i },
  { key: "array", label: "배열", re: /배열|array|\[\s*\d*\s*\]/i },
  { key: "loop", label: "반복문", re: /반복|루프|for\s*\(|while\s*\(|loop/i },
  { key: "branch", label: "조건 분기", re: /조건\s*분기|분기|if\s*\(|else|switch/i },
  { key: "struct", label: "구조체", re: /구조체|struct\b/i },
  { key: "bitwise", label: "비트 연산", re: /비트\s*연산|시프트|<<|>>|\bXOR\b|\|=|&=/i },
  { key: "string", label: "문자열·문자", re: /문자열|string|char\b|%[cs]\b/i },
  { key: "staticVar", label: "static·전역 변수", re: /static\b|전역\s*변수|global/i },
  { key: "sizeof", label: "sizeof·크기 계산", re: /sizeof/i },
];

/** 텍스트(원본 분석 컨텍스트 또는 C 코드)에 등장하는 문법 개념 키 집합. */
export function detectConcepts(text: string): Set<string> {
  const s = String(text ?? "");
  const out = new Set<string>();
  for (const r of CONCEPT_RULES) if (r.re.test(s)) out.add(r.key);
  return out;
}

/** 개념 키 → 사람이 읽는 이름. */
export function conceptLabel(key: string): string {
  return CONCEPT_RULES.find((r) => r.key === key)?.label ?? key;
}

/**
 * 코드에서 **자기 자신을 호출하는 함수**(재귀)를 찾는다.
 *
 * 낱말("재귀")이 아니라 **호출 구조**로 판정한다 — 모델은 재귀를 쓰면서 그 낱말을 쓰지 않는다.
 * 함수 정의를 훑어 이름을 모으고, 각 정의 본문에서 자기 이름 호출이 있으면 재귀로 본다.
 */
export function detectSelfRecursion(code: string): string[] {
  const src = String(code ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const found: string[] = [];
  // `타입 이름(...) {` 형태의 정의를 찾고 중괄호 균형으로 본문을 잘라낸다(선언문 `;`는 건너뜀).
  const defRe = /\b[A-Za-z_][A-Za-z0-9_ *]*\s+([A-Za-z_]\w*)\s*\([^;{)]*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = defRe.exec(src)) !== null) {
    const name = m[1];
    if (name === "main" || /^(if|for|while|switch|return|sizeof)$/.test(name)) continue;
    let depth = 1;
    let i = defRe.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    const body = src.slice(defRe.lastIndex, i);
    if (new RegExp(`\\b${name}\\s*\\(`).test(body)) found.push(name);
  }
  return [...new Set(found)];
}

/**
 * C 소스에서 **주석·문자열/문자 리터럴을 공백으로** 지운다 (길이·위치는 보존).
 * 구조 파싱 전처리 — 리터럴 안의 `{`·`case`·`break` 때문에 오판하지 않게 한다.
 */
export function stripCNoise(code: string): string {
  let s = String(code ?? "");
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  s = s.replace(/\/\*[\s\S]*?\*\//g, blank);
  s = s.replace(/\/\/[^\n]*/g, blank);
  s = s.replace(/"(?:\\.|[^"\\\n])*"/g, blank);
  s = s.replace(/'(?:\\.|[^'\\\n])*'/g, blank);
  return s;
}

/** 각 문자 위치의 중괄호 깊이 (여는 `{`는 그 다음부터, 닫는 `}`는 그 위치부터 바깥 깊이). */
function braceDepths(s: string): number[] {
  const d = new Array<number>(s.length);
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "}") depth -= 1;
    d[i] = depth;
    if (ch === "{") depth += 1;
  }
  return d;
}

/** switch 본문 안에서 **최상위**(depth 0) `case ...:` / `default:` 라벨의 위치. */
function topLevelLabels(body: string): Array<{ start: number; end: number }> {
  const depths = braceDepths(body);
  const re = /(?:\bcase\b[^:{}]*:|\bdefault\s*:)/g;
  const out: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (depths[m.index] === 0) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** switch를 빠져나가는 문장 — 이게 하나도 없으면 다음 라벨로 흘러간다. */
const SWITCH_EXIT_RE = /\b(break|return|continue|goto|exit|abort)\b/;

/**
 * C 코드에 **switch fall-through**(break 없이 다음 라벨로 이어지는 case)가 있는가.
 *
 * 판정은 낱말이 아니라 **구조**다(CLAUDE.md 규칙 2). 라벨과 라벨 사이 구간에 종료 문장이
 * 하나도 없고 내용이 비어 있지 않으면 fall-through로 본다.
 *
 * ★ 보수적으로 판정한다 — 중첩 반복문 안의 `break`(switch가 아니라 그 반복문을 빠져나간다)도
 *   "종료 있음"으로 세므로 **실제 fall-through를 놓칠 수는 있어도**(재요청 1회 낭비)
 *   **없는 것을 있다고 하지는 않는다**. 게이트는 이 방향으로 틀리는 편이 안전하다.
 * ★ `case 1: case 2:` 처럼 **내용이 빈 연속 라벨**은 fall-through로 세지 않는다 —
 *   그건 관용적인 묶음 표기일 뿐 원본의 채점 포인트가 아니다.
 */
/** 한 switch의 라벨별 구간 (라벨 텍스트 + 그 라벨이 지배하는 본문). */
type SwitchSegment = { label: string; body: string };

/** 코드 안의 모든 switch를 라벨 구간으로 쪼갠다 (구조 판정의 공용 기반). */
function switchSegments(code: string): SwitchSegment[][] {
  const src = stripCNoise(code);
  const swRe = /\bswitch\s*\([^)]*\)\s*\{/g;
  const out: SwitchSegment[][] = [];
  while (swRe.exec(src) !== null) {
    // 중괄호 균형으로 switch 본문을 잘라낸다.
    let depth = 1;
    let i = swRe.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") depth -= 1;
      i += 1;
    }
    const body = src.slice(swRe.lastIndex, Math.max(swRe.lastIndex, i - 1));
    const labels = topLevelLabels(body);
    out.push(
      labels.map((lab, k) => ({
        label: body.slice(lab.start, lab.end),
        body: body.slice(lab.end, k + 1 < labels.length ? labels[k + 1].start : body.length),
      })),
    );
  }
  return out;
}

export function hasSwitchFallThrough(code: string): boolean {
  for (const segs of switchSegments(code)) {
    // 마지막 라벨은 흘러갈 곳이 없으므로 제외한다.
    for (let k = 0; k < segs.length - 1; k += 1) {
      if (segs[k].body.trim().length === 0) continue;   // 빈 연속 라벨 = 묶음 표기
      if (!SWITCH_EXIT_RE.test(segs[k].body)) return true;
    }
  }
  return false;
}

/** 상태를 바꾸는 문장(대입·복합대입·증감)이 있는가 — printf만 있으면 false. */
function changesState(seg: string): boolean {
  const s = seg.replace(/\b(?:printf|puts|fprintf|putchar)\s*\([^;]*\);?/g, " ");
  return /(\+\+|--|[+\-*/%|&^]=|<<=|>>=|[^=!<>+\-*/%&|^]=[^=])/.test(s);
}

/**
 * fall-through가 **결과에 관여**하는가 — 흘러간 다음 라벨이 상태를 바꿔야 한다.
 *
 * ★ 실측(사용자 신고 2026-08-13 2차): 게이트가 "fall-through 존재"만 보니
 *   `default: printf("Default operation.\n"); break;` 처럼 **출력만 하는 장식용**이 통과했다.
 *   원본은 default에서 `sum += score[i]`로 다시 누적하기 때문에 답이 갈린다.
 */
export function fallThroughIsConsequential(code: string): boolean {
  for (const segs of switchSegments(code)) {
    for (let k = 0; k < segs.length - 1; k += 1) {
      if (segs[k].body.trim().length === 0) continue;
      if (SWITCH_EXIT_RE.test(segs[k].body)) continue;
      // k가 흘러 들어가는 이후 라벨 중 하나라도 상태를 바꾸면 인정.
      for (let j = k + 1; j < segs.length; j += 1) {
        if (changesState(segs[j].body)) return true;
        if (SWITCH_EXIT_RE.test(segs[j].body)) break;   // 여기서 switch를 빠져나간다
      }
    }
  }
  return false;
}

/** 부분 초기화 배열 — `T name[N] = {v1..vk}` 에서 k < N (뒤쪽이 0으로 채워진다). */
export type PartialArray = { name: string; size: number; initCount: number };

export function findPartialArrays(code: string): PartialArray[] {
  const src = stripCNoise(code);
  const re = /\b[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]\s*=\s*\{([^{}]*)\}/g;
  const out: PartialArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const size = Number(m[2]);
    const items = m[3].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (Number.isFinite(size) && items.length > 0 && items.length < size) {
      out.push({ name: m[1], size, initCount: items.length });
    }
  }
  return out;
}

/**
 * 0으로 채워진 뒤쪽 구간이 **정답에 관여하지 않으면** true (장식).
 *
 * ★ 실측: `int score[10] = {3,5,7,2};` 로 부분 초기화해 놓고 `getSum(score, 4)` 처럼
 *   **초기화한 개수를 크기로 넘겨** 0 구간을 아예 지나가지 않는 코드가 나왔다.
 *   그러면 "왜 뒤가 0인가"라는 원본의 채점 포인트가 사라진다.
 *   판정은 보수적 — 초기화 개수가 그 배열의 순회 상한으로 쓰인 흔적을 찾는다.
 */
export function zeroTailIsDecorative(code: string, arr: PartialArray): boolean {
  const src = stripCNoise(code);
  const k = String(arr.initCount);
  // (a) 그 배열과 함께 넘기는 크기 인자가 초기화 개수와 같다.
  const callRe = new RegExp(`\\b[A-Za-z_]\\w*\\s*\\(([^()]*\\b${arr.name}\\b[^()]*)\\)`, "g");
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src)) !== null) {
    if (m[1].split(",").map((s) => s.trim()).includes(k)) return true;
  }
  // (b) 그 배열을 인덱싱하는 for의 상한이 초기화 개수다.
  const forRe = /\bfor\s*\([^;]*;[^;]*?<\s*(\d+)\s*;[^)]*\)\s*(\{[^{}]*\}|[^;]*;)/g;
  while ((m = forRe.exec(src)) !== null) {
    if (m[1] === k && new RegExp(`\\b${arr.name}\\s*\\[`).test(m[2])) return true;
  }
  return false;
}

/**
 * 지문 코드에서 **답을 알려주는 주석**을 지운다.
 * 실측: 생성물에 `// No break, fall through` 가 박혀 있었다 — 원본에는 없고, 학생이 스스로
 * 찾아야 할 흐름을 그대로 알려 준다. 주석은 실행에 영향이 없으므로 재요청 없이 제거한다.
 */
export function stripGiveawayComments(code: string): string {
  const re = /[ \t]*\/\/[^\n]*(?:fall[\s-]?through|no\s*break|break\s*(?:가|이|을|를)?\s*없|break\s*생략|의도적으로\s*break)[^\n]*/gi;
  return String(code ?? "").replace(re, "").replace(/[ \t]+$/gm, "");
}

/**
 * ★★ 원본이 쓰는 **핵심 문법 구조**는 생성물에도 반드시 있어야 한다.
 *
 * 기존 `CONCEPT_RULES`는 **원본에 없는 개념을 금지**하는 한 방향뿐이라, 원본의 구조가 사라지는 것은
 * 못 막았다. 실측(사용자 신고 2026-08-13 3차): 원본이 switch 문제인데 **switch가 아예 없는
 * 배열 문제**가 생성됐다 — `CONCEPT_RULES`의 `branch`가 `if|else|switch`를 모두 매치해서
 * `if`만 써도 "분기 개념 유지"로 통과했기 때문이다.
 *
 * 여기 담는 것은 **눈으로 확인 가능한 구조**뿐이다(배열·반복처럼 흔한 것은 요구해도 의미가 없다).
 */
const REQUIRED_CONSTRUCTS: Array<{ key: string; label: string; inOriginal: RegExp; inCode: RegExp }> = [
  { key: "switch", label: "switch 문", inOriginal: /\bswitch\b|스위치\s*문/i, inCode: /\bswitch\s*\(/ },
  { key: "struct", label: "구조체", inOriginal: /구조체|\bstruct\b/i, inCode: /\bstruct\b/ },
  { key: "static", label: "static·전역 상태", inOriginal: /\bstatic\b|전역\s*변수/i, inCode: /\bstatic\b/ },
  {
    key: "bitwise", label: "비트 연산",
    inOriginal: /비트\s*연산|시프트|<<|>>|\bXOR\b/i,
    inCode: /<<|>>|(?<![&|])[&|^](?![&|=])/,
  },
];

/** 원본 컨텍스트가 쓰는 핵심 구조 키 집합. */
export function detectRequiredConstructs(text: string): string[] {
  const t = String(text ?? "");
  return REQUIRED_CONSTRUCTS.filter((r) => r.inOriginal.test(t)).map((r) => r.key);
}

/** 생성 코드에서 **빠진** 필수 구조의 사람이 읽는 이름 목록. */
export function missingConstructs(code: string, required: string[]): string[] {
  const src = stripCNoise(code);
  return REQUIRED_CONSTRUCTS
    .filter((r) => required.includes(r.key) && !r.inCode.test(src))
    .map((r) => r.label);
}

/** 원본이 **부분 초기화 배열**(뒤쪽 0)을 쓰는 문제인가 — 구조 우선, 낱말 보조. */
export function detectPartialArrayIntent(text: string): boolean {
  const t = String(text ?? "");
  if (findPartialArrays(t).length > 0) return true;
  return /부분\s*초기화|나머지\s*(?:원소|값)?\s*는?\s*0|자동\s*으?로?\s*0|초기화하지\s*않은\s*(?:원소|나머지)/i.test(t);
}

/** 원본 컨텍스트가 fall-through를 쓰는 문제임을 나타내는 낱말 (구조 신호가 없을 때의 보조). */
// ★ 조사(가·이·을·를)까지 받아 준다 — "break를 생략했기 때문에"를 놓쳐 스모크가 잡았다.
const FALL_THROUGH_WORDS =
  /fall[\s-]?through|폴\s*스루|break\s*(?:문)?\s*(?:가|이|을|를)?\s*(?:없|생략|빠져|누락)|break\s*없이|다음\s*case\s*로\s*이어|아래\s*case\s*로\s*이어|default\s*(?:문)?\s*(?:으)?로?\s*이어|case\s*를?\s*빠져나가지\s*않/i;

/**
 * 원본이 **switch fall-through를 채점 포인트로 쓰는 문제**인가.
 *
 * ★ 1순위는 **구조**다 — analyzeImage가 "지문의 C 코드 전체를 interpretation에 그대로 보존"하므로
 *   컨텍스트 안에 원본 코드가 남아 있으면 그걸 직접 파싱한다(낱말보다 훨씬 안정적이다).
 *   Vision이 코드를 줄여 적은 회차를 위해 낱말 신호를 보조로 둔다.
 */
export function detectFallThroughIntent(text: string): boolean {
  const t = String(text ?? "");
  if (!/switch/i.test(t)) return false;
  return hasSwitchFallThrough(t) || FALL_THROUGH_WORDS.test(t);
}

export function countEffectiveCodeLines(code: string): number {
  if (!code) return 0;
  const withoutBlockComments = code.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlockComments
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'])\/\/.*$/, "$1").trim())
    .filter((line) => line.length > 0).length;
}

/**
 * C언어 파이프라인 — GPT 기반 코드 분석·출력 예측 문제 생성.
 *
 * 회로가 아니라 프로그래밍이므로 결정론 archetype이 없다. 원본 분석(주제·해석·개념)을
 * 컨텍스트로 GPT에게 count개 서로 다른 문제를 요청한다. 각 문제는 컴파일 가능한 C 코드
 * 스니펫(code_block figure)과 그 실행 결과·변수값을 정답으로 갖는다.
 *
 * exam_similar=같은 문법 개념·구조, 값/코드만 변형 / exam_variant=같은 개념, 코드 구조 일부 변형.
 * 두 모드 모두 원본이 짧더라도 아래 [난이도·분량 규칙]의 하한을 지킨다(원본 복사 금지).
 */
export async function runCLanguagePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const ctx = buildContextHint(analysis) ?? "(원본 컨텍스트 없음 — 일반적인 C 코드 분석 문제)";
  const policy = GENERATION_POLICIES[mode];

  // ★ 원본 개념 스코프 — 원본에 없는 개념(특히 재귀)이 생성물에 들어가는 것을 막는다.
  //   (사용자 신고 2026-08-05: 포인터·배열·sizeof 원본에서 **재귀 함수** 문제가 생성됐다.)
  // ★ 원본의 제어 흐름 특징 — switch fall-through는 그 자체가 채점 포인트라 반드시 보존해야 한다.
  //   (사용자 신고 2026-08-13: 원본은 case 2에 break가 없어 default로 이어지는데, 생성물은
  //    모든 case에 break를 넣어 학습목표가 통째로 사라졌다. 실행 검증은 "정답↔코드" 일치만 보므로
  //    조용히 통과했다.)
  const needsFallThrough = detectFallThroughIntent(ctx);
  const origConcepts = detectConcepts(ctx);
  const bannedConcepts = CONCEPT_RULES.map((r) => r.key).filter((k) => !origConcepts.has(k));
  const allowRecursion = origConcepts.has("recursion");
  const conceptScopeRule = [
    `- 원본에서 확인된 개념: ${[...origConcepts].map(conceptLabel).join(" · ") || "(불명확 — 원본 서술을 그대로 따를 것)"}`,
    `- 새로 도입 금지: ${bannedConcepts.map(conceptLabel).join(" · ") || "(없음)"}`,
    allowRecursion
      ? `- 재귀는 원본에 있으므로 사용해도 됩니다.`
      : `- ★★ **재귀 함수 금지** — 원본은 재귀를 쓰지 않습니다. 함수가 자기 자신을 호출하면 그 문항은 폐기됩니다.\n` +
        `  깊이는 재귀가 아니라 **함수 분리·중간 상태 누적·다단계 호출**로 만드십시오.`,
    `- 난이도는 원본 개념 **안에서** 올립니다(값·단계 수·누적 구조). 새 문법을 끌어오지 마십시오.`,
  ].join("\n");

  // ★ 이 규칙은 [난이도·분량 규칙]보다 **뒤**에 놓는다 — 그 규칙이 "함수 2개 이상·30~55줄"로
  //   구조를 다시 짜라고 밀기 때문에, 앞에 두면 재작성 과정에서 그대로 묻힌다
  //   (2026-08-12 `STEP_QUESTION_RULE`에서 "예시 뒤에 오는 규칙이 예시를 덮어쓴다"로 얻은 교훈).
  const fallThroughRule = needsFallThrough
    ? `
[원본 핵심 보존 규칙 — 두 가지 모두 **정답에 실제로 관여**해야 한다. 위반 시 재생성]
이 원본의 채점 포인트는 정확히 두 가지다. 형식만 흉내 내고 결과에 영향이 없으면 **장식이며 폐기**한다.

(1) **switch fall-through** — break를 생략한 case가 다음 라벨로 이어진다.
  - break를 생략한 case를 **최소 1개** 두어라.
  - ★ 흘러 들어간 **다음 라벨은 반드시 상태를 바꿔야 한다**(누적 합 갱신 등).
    \`default: printf("..."); break;\` 처럼 **출력만 하는 라벨로 흘러가는 것은 인정하지 않는다.**
    앞 case에서 만든 값이 다음 라벨에서 **계속 누적되어** 최종 출력이 달라져야 한다.

(2) **배열 부분 초기화** — \`int a[N] = {v1..vk};\` (k < N) 이면 뒤쪽 N-k개는 **자동으로 0**이다.
  - ★★ 배열을 순회하는 반복문의 상한은 **반드시 배열 전체 크기 N**이어야 한다.
    **초기화한 개수 k를 크기로 넘기지 마라** — \`getSum(a, k)\` 처럼 쓰면 0인 구간을 아예 지나가지 않아
    "왜 뒤가 0인가"라는 핵심이 사라진다. 반드시 **0인 원소를 실제로 더하거나 읽는** 구간이 있어야 한다.
  - 함수로 크기를 넘길 때도 N을 넘겨라(\`getSum(a, N)\`).

- solution에는 두 가지를 모두 명시하라: "case N에는 break가 없으므로 … 로 이어진다" + "a[k]~a[N-1]은 0이다".
- ★ 지문 코드에 \`// No break, fall through\` 같은 **흐름을 설명하는 주석을 쓰지 마라.** 학생이 스스로 찾아야 한다.`
    : "";

  log.info("dispatch", {
    mode, count, topicKey,
    origConcepts: [...origConcepts].join(","), allowRecursion, needsFallThrough,
  });

  const system = `당신은 중등 정보·전자 임용시험 C언어 출제·해설 전문가입니다.
주어진 원본 문제와 같은 문법 개념·학습목표를 유지하면서 새로운 "코드 분석·출력 예측" 문제를 만듭니다.
반드시 컴파일·실행 가능한 정확한 C 코드를 제시하고, 그 실행 결과(표준출력) 또는 지정된 변수의 최종 값을 정확히 계산해 정답으로 냅니다.
- 코드의 실제 실행 결과를 직접 손으로 추적해 정답을 도출하세요(추측 금지). 포인터·증감연산자·연산자 우선순위·형변환·정수 나눗셈·오버플로에 주의.
- 회로도·수식 도식은 없습니다. 지문 코드가 곧 figure입니다.
- 출력은 반드시 JSON 하나. 마크다운 코드펜스(\`\`\`) 없이 순수 JSON만.

[난이도·분량 규칙 — 위반 시 재생성]
원본 기출이 짧고 단순해도 **원본 수준으로 짧게 내지 마십시오.** 실전 임용 난이도로 확장합니다.
1. 지문 코드는 **주석·빈 줄을 제외하고 최소 ${MIN_CODE_LINES}줄**(권장 30~55줄). 빈 줄·주석으로 줄 수를 채우지 마십시오.
2. **사용자 정의 함수 2개 이상**(main 제외). 그중 하나는 **다른 함수를 호출**해야 합니다 — 호출 깊이 2단계 이상.
3. 다음 문법 요소 중 **서로 다른 3가지 이상**을 실제로 결과에 영향을 주도록 사용:
   배열 / 포인터·주소 / 이중(중첩) 반복 / 조건 분기(if-else·switch) / static·전역 변수의 상태 유지 /
   문자열·문자 처리 / 비트 연산 / 구조체. (장식이 아니라 정답이 달라지도록 사용할 것.)
   ★ 단, 아래 [개념 범위 규칙]에서 금지된 요소는 제외합니다.
4. **단일 패스 금지** — "for로 f(i)를 i=0..4까지 돌며 한 줄씩 출력"처럼 한 번의 단순 루프로 끝나는 구조는 금지합니다.
   중간 상태가 누적되거나(누적 합·배열 갱신·static 카운터), 단계가 두 번 이상 이어지는 흐름이어야 합니다.
5. **표준출력은 2줄 이상**이고, 값이 단순 증가 수열이 아니어야 합니다(추적 없이 눈으로 답이 보이면 실패).
6. 발문은 **소문항 2개 이상**으로 나눕니다. 예: [1] 특정 시점의 중간 변수/함수 반환값 → [2] 프로그램 전체 표준출력.
   각 소문항은 앞 단계 결과를 써야 풀리도록 연결합니다.
7. content(문제 상황)와 question(구하는 것)에 **같은 문장을 중복해 쓰지 마십시오**.
   content = 상황·전제·주의사항만, question = 소문항 목록만.

[개념 범위 규칙 — 위반 시 폐기]
★ **원본 지문에 등장하지 않는 문법 개념을 새로 도입하지 마십시오.** 같은 학습목표를 시험해야 합니다.
${conceptScopeRule}

[정답 정확성 규칙 — 분량이 늘어난 만큼 더 엄격히]
★ 난이도는 **제어 흐름(호출 순서·분기·누적)의 복잡도**로 올리고, **산술의 크기로 올리지 마십시오.**
  큰 수 계산은 문제의 변별력을 높이지 않고 오답만 만듭니다.
- 모든 중간값·최종값은 **|값| ≤ 200인 정수**로 유지합니다. 한 수식에 곱셈은 최대 1개(예: \`x*x\` 또는 \`3*x\` 중 하나).
  제곱·세제곱 누적, 세 항 이상의 곱, 큰 수 나눗셈은 쓰지 마십시오.
- ★ **반드시 종료해야 합니다.** 재귀는 **호출될 수 있는 모든 인자**에 대해 종료 조건에 도달해야 합니다.
  (예: n을 2씩 줄이며 \`n == 0\`에서만 멈추면 홀수 인자에서 무한 재귀입니다 — \`n <= 0\`으로 쓰십시오.)
  반복문의 종료 조건도 유한 횟수 안에 성립해야 합니다. 종료하지 않는 코드는 정답이 없어 폐기됩니다.
- **미정의·구현 정의 동작 금지**: 초기화하지 않은 변수 사용, 한 식에서 같은 변수 두 번 수정(\`i++ + i++\`),
  배열 범위 밖 접근, 부호 있는 정수 오버플로, char 부호 의존, 포인터 크기 의존 코드를 쓰지 마십시오.
- 서식 지정자는 %d·%c·%s·%u·%ld·%f(자릿수 명시)만 쓰고, 실수 비교·부동소수 누적은 피하십시오.
- solution에는 **반복 회차·함수 호출마다 변수 추적표**를 순서대로 적고, 마지막에 그 추적에서 나온 출력을 그대로 모아
  answer·expectedOutput과 문자 단위로 일치시키십시오.
- ★★ **추적 결과와 answer가 어긋나면 answer를 추적 결과로 고치십시오.** "착오", "잘못 계산", "무시하고" 같은
  변명을 solution에 쓰는 것은 **절대 금지**입니다. 어긋난 채로 제출하면 그 문제는 폐기됩니다.
- expectedOutput은 실제 표준출력 **그 자체**(공백·개행 그대로, 설명·번호 없이)입니다.
${fallThroughRule}
${MULTIPLE_CHOICE_TO_THREE_STEP_RULE}`;

  const user = `[원본 분석 컨텍스트]
${ctx}

[생성 요청]
- 생성 모드: ${GENERATION_MODE_LABEL[mode]} (${policy.description})
- 개수: ${count}개 (서로 값·코드가 다르게)
- 세부 주제(topicKey): ${topicKey ?? "원본과 동일 개념 유지"}
- 모드 규칙(★ 두 모드 모두 위 [난이도·분량 규칙]을 지킨다 — 원본이 짧아도 확장):
  · exam_similar(기출유사유형): 원본과 같은 문법 개념·학습목표·코드 구조를 유지하되, 값·리터럴·연산을 바꾸고
    **원본보다 깊게 확장**한다(함수 분리·중간 상태 누적·출력 단계 추가). 원본 코드를 그대로 옮겨 쓰지 않는다.
  · exam_variant(기출변형유형): 같은 학습목표를 유지하되 코드 구조를 일부 변형
    (배열 인덱싱 ↔ 포인터 산술, 값 전달 ↔ 주소 전달, 함수 분리 방식, 누적 순서 등) 가능.
    ★ 변형이라도 **[개념 범위 규칙]을 벗어나지 않는다** — 원본에 없는 문법을 끌어오는 것은 변형이 아니라 다른 문제다.
    역시 위 분량·소문항 규칙을 지킨다.

[출력 JSON 스키마]
{
  "problems": [
    {
      "content": "문제 상황·전제 설명. 코드가 아래 figure로 제시됨을 전제. question과 같은 문장을 반복하지 말 것.",
      "code": "완전한 C 코드 문자열 (개행 \\n·들여쓰기 포함, #include 포함, main 포함, 컴파일 가능). 주석·빈 줄 제외 ${MIN_CODE_LINES}줄 이상.",
      "codeCaption": "코드 상단 캡션 (예: '[프로그램]') — 선택",
      "conditions": ["추가 조건·가정 (없으면 빈 배열)"],
      "question": "소문항 2개 이상. 예: '[1] 함수 g가 세 번째로 호출될 때의 반환값을 쓰시오.\\n[2] 프로그램의 전체 출력을 쓰시오.'",
      "answer": "각 소문항의 정답을 소문항 번호와 함께. 표준출력은 공백·개행까지 그대로.",
      "expectedOutput": "프로그램의 표준출력 원문만 (소문항 번호·설명 없이, 공백·개행 그대로).",
      "solution": "단계별 풀이 — 반복 회차·함수 호출별 변수 추적표를 순서대로 적고 마지막에 출력을 모은다."
    }
  ]
}
정확히 ${count}개의 problems를 생성하세요. code는 반드시 실제로 실행했을 때 answer가 나오도록 검증하세요.`;

  const raw = await generateProblemsJson({ system, user, label: "c_language" });
  const lengthGated = await enforceCodeLength({ raw, count, system, user });
  // ★ 개념 스코프 게이트 — 프롬프트를 어기고 재귀가 들어오면 한 번만 재요청한다(분량 게이트와 같은 방식).
  const scopeGated = await enforceConceptScope({ raw: lengthGated, count, system, user, allowRecursion });
  // ★ 제어 흐름 게이트 — 원본이 fall-through 문제인데 생성물이 모든 case에 break를 넣었으면 재요청한다.
  //   프롬프트만으로는 부족하다(실측 재현 2회 중 1회가 구조를 잃었다 — 분량 규칙이 재작성을 강제하기 때문).
  const flowGated = await enforceFallThrough({ raw: scopeGated, count, system, user, needsFallThrough });
  const verified = await verifyAndRepairOutputs({ items: flowGated });
  const picked = await refillDiscarded({ kept: verified, count, system, user });

  const problems: GeneratedProblem[] = picked.map((p, i) => {
    // ★ 흐름을 알려주는 주석(`// No break, fall through`)은 제거한다 — 학생이 스스로 찾아야 할 부분이다.
    //   주석은 실행에 영향이 없으므로 재요청 없이 지운다(실측: 생성물에 그대로 박혀 나왔다).
    const code = stripGiveawayComments(asStr(p.code));
    const figureVariants: FigureVariant[] = [];
    if (code.trim()) {
      // caption은 figure label로만 표기한다 — diagram.caption에도 넣으면 렌더러가
      // FigureHeader(label)와 caption을 연달아 그려 "[프로그램]"이 두 번 찍힌다(실측).
      const diagram: CodeBlockDiagram = { code, language: "c" };
      figureVariants.push({
        id: `fig_code_${i + 1}`,
        label: asStr(p.codeCaption) || "프로그램 코드",
        role: "concept_diagram",
        diagramType: "code_block",
        diagram,
      });
    }
    return {
      id: randomUUID(),
      content: asStr(p.content),
      conditions: asStrArray(p.conditions),
      question: asStr(p.question),
      answer: asStr(p.answer),
      solution: asStr(p.solution),
      topicKey: topicKey,
      figureVariants,
    } satisfies GeneratedProblem;
  });

  return problems;
}

/**
 * 개념 스코프 게이트 — 원본에 없는 개념(현재는 **재귀**)이 들어오면 **한 번만** 재요청한다.
 *
 * ★ 프롬프트만으로는 부족하다(이 저장소의 반복 교훈): 난이도 규칙이 "깊게"를 요구하면 모델이
 *   가장 쉬운 방법으로 재귀를 집어넣는다. 판정은 낱말이 아니라 **호출 구조**(`detectSelfRecursion`)로 한다.
 *
 * 재요청 결과도 재귀면 **재귀가 없는 쪽**을 문항별로 채택하고, 둘 다 재귀면 경고만 남긴다
 * (여기서 폐기하면 사용자에게 "생성 실패"가 뜨는데, 그건 더 나쁜 결과다 — 뒤의 실행 검증·보충 단계가 있다).
 */
async function enforceConceptScope(args: {
  raw: Record<string, unknown>[];
  count: number;
  system: string;
  user: string;
  allowRecursion: boolean;
}): Promise<Record<string, unknown>[]> {
  const { raw, count, system, user, allowRecursion } = args;
  const picked = raw.slice(0, count);
  if (allowRecursion) return picked;

  const recOf = (p: Record<string, unknown>) => detectSelfRecursion(asStr(p.code));
  const badIdx = picked.map((p, i) => (recOf(p).length > 0 ? i : -1)).filter((i) => i >= 0);
  if (badIdx.length === 0) return picked;

  log.warn("recursion_out_of_scope_retry", {
    badCount: badIdx.length,
    fns: badIdx.map((i) => recOf(picked[i]).join("/")).join(", "),
  });

  const retryUser = `${user}

[재생성 지시 — 반드시 반영]
직전 생성물의 지문 코드가 **재귀 함수**를 사용했습니다(자기 자신을 호출: ${badIdx.map((i) => recOf(picked[i]).join(", ")).join(" / ")}).
원본 지문에는 재귀가 없습니다. [개념 범위 규칙]을 다시 읽고 ${count}개를 새로 생성하십시오.
- **어떤 함수도 자기 자신을 (직접·간접으로) 호출하지 않는다.**
- 깊이는 함수 분리·중간 상태 누적·다단계 호출로 만든다.
- 나머지 규칙(분량·소문항·정답 정확성)은 그대로 지킨다.`;

  let retry: Record<string, unknown>[] = [];
  try {
    retry = await generateProblemsJson({ system, user: retryUser, label: "c_language_scope_retry" });
  } catch (e) {
    log.warn("recursion_retry_failed", { message: (e as Error).message });
    return picked;
  }

  // 문항별로 **재귀가 없는 쪽**을 채택 — 재요청이 더 나빠도 퇴보하지 않는다.
  const out = picked.map((p, i) => {
    if (recOf(p).length === 0) return p;
    const cand = retry[i];
    if (cand && detectSelfRecursion(asStr(cand.code)).length === 0) return cand;
    return p;
  });
  const still = out.filter((p) => recOf(p).length > 0).length;
  if (still > 0) log.warn("recursion_still_present", { count: still });
  return out;
}

/**
 * 제어 흐름 게이트 — 원본이 **switch fall-through** 문제인데 생성물이 그 구조를 잃으면 **한 번만** 재요청한다.
 *
 * ★ 왜 필요한가 (사용자 신고 2026-08-13, 재현 2/2회 중 1회 소실):
 *   [난이도·분량 규칙]이 "함수 2개 이상·30~55줄"로 코드를 다시 쓰게 만드는데, 그 과정에서 모델은
 *   switch를 **관용적으로**(모든 case에 break) 쓴다. 그러면 원본의 채점 포인트가 통째로 사라진다.
 *   실행 검증(`verifyAndRepairOutputs`)은 "정답이 그 코드와 맞는가"만 보므로 이 실패를 **조용히 통과**시킨다
 *   — 이 저장소가 반복해 겪은 "generic 경로는 실패해도 validator를 통과한다"와 같은 패턴이다.
 *
 * 판정은 낱말이 아니라 구조(`hasSwitchFallThrough`)로 하고, 재요청 결과도 구조를 잃었으면
 * **문항별로 구조를 지킨 쪽을 채택**해 재요청이 더 나빠도 퇴보하지 않게 한다(다른 두 게이트와 같은 방식).
 * 둘 다 실패해도 폐기하지 않는다 — 여기서 버리면 사용자 화면에 "생성 실패"가 뜨는데 그게 더 나쁘다.
 */
async function enforceFallThrough(args: {
  raw: Record<string, unknown>[];
  count: number;
  system: string;
  user: string;
  needsFallThrough: boolean;
}): Promise<Record<string, unknown>[]> {
  const { raw, count, system, user, needsFallThrough } = args;
  const picked = raw.slice(0, count);
  if (!needsFallThrough) return picked;

  // ★ "존재"만 보면 안 된다 — 실측에서 장식용 fall-through와 장식용 부분 초기화가 통과했다.
  //   두 핵심이 **정답에 실제로 관여**하는지까지 본다.
  const defectsOf = (p: Record<string, unknown>): string[] => {
    const code = asStr(p.code);
    const bad: string[] = [];
    if (!hasSwitchFallThrough(code)) bad.push("fall-through 없음");
    else if (!fallThroughIsConsequential(code)) bad.push("fall-through가 장식(다음 라벨이 출력만)");
    const arrays = findPartialArrays(code);
    if (arrays.length === 0) bad.push("부분 초기화 배열 없음");
    else if (arrays.every((a) => zeroTailIsDecorative(code, a))) bad.push("0 구간을 순회하지 않음");
    return bad;
  };

  const badIdx = picked.map((p, i) => (defectsOf(p).length > 0 ? i : -1)).filter((i) => i >= 0);
  if (badIdx.length === 0) return picked;

  log.warn("original_core_lost_retry", {
    badCount: badIdx.length, total: picked.length,
    defects: badIdx.map((i) => `#${i + 1}:${defectsOf(picked[i]).join("+")}`).join(", "),
  });

  const retryUser = `${user}

[재생성 지시 — 반드시 반영]
직전 생성물이 원본의 핵심을 잃었습니다: ${badIdx.map((i) => defectsOf(picked[i]).join(" / ")).join(" || ")}
${count}개를 새로 생성하되 **아래 두 가지가 모두 정답에 실제로 관여**하게 하십시오.
1. break를 생략한 case를 두고, **흘러 들어간 다음 라벨이 상태를 바꾸어**(누적 갱신) 최종 출력이 달라지게 하라.
   출력만 하는 라벨로 흘러가는 장식용 fall-through는 인정하지 않는다.
2. \`int a[N] = {v1..vk};\` (k < N)로 부분 초기화하고, **순회 상한을 N으로** 하여 0인 원소를 실제로 더하라.
   초기화 개수 k를 크기 인자·반복 상한으로 쓰면 0 구간을 지나가지 않아 핵심이 사라진다.
- 흐름을 설명하는 주석(\`// fall through\` 등)은 코드에 쓰지 마라.
- 나머지 규칙(분량·개념 범위·소문항·정답 정확성)은 그대로 지킨다.`;

  let retry: Record<string, unknown>[] = [];
  try {
    retry = await generateProblemsJson({ system, user: retryUser, label: "c_language_flow_retry" });
  } catch (e) {
    log.warn("original_core_retry_failed", { message: (e as Error).message });
    return picked;
  }

  // 문항별로 **결함이 더 적은 쪽**을 채택 — 재요청이 나빠도 퇴보하지 않는다.
  const out = picked.map((p, i) => {
    const mine = defectsOf(p);
    if (mine.length === 0) return p;
    const cand = retry[i];
    if (cand && defectsOf(cand).length < mine.length) return cand;
    return p;
  });
  const still = out.filter((p) => defectsOf(p).length > 0);
  if (still.length > 0) {
    log.warn("original_core_still_lost", {
      count: still.length, defects: still.map((p) => defectsOf(p).join("+")).join(", "),
    });
  }
  return out;
}

/**
 * 분량 하한 게이트 — 프롬프트 규칙을 어긴 짧은 코드가 나오면 **한 번만** 재요청한다.
 *
 * 모델은 "길게"라는 지시를 자주 무시하므로 프롬프트만으로는 부족하다. 그렇다고 무한 재시도는
 * 비용이 크므로 재요청은 1회로 고정하고, 결과는 **문항별로 더 긴 쪽을 채택**해 재요청이
 * 오히려 나쁜 결과를 주는 경우에도 절대 퇴보하지 않게 한다.
 *
 * @returns count개로 잘린 problems (게이트 통과 여부와 무관하게 항상 값을 돌려준다).
 */
async function enforceCodeLength(args: {
  raw: Record<string, unknown>[];
  count: number;
  system: string;
  user: string;
}): Promise<Record<string, unknown>[]> {
  const { raw, count, system, user } = args;
  const picked = raw.slice(0, count);
  const lens = picked.map((p) => countEffectiveCodeLines(asStr(p.code)));
  const shortIdx = lens.map((n, i) => (n < MIN_CODE_LINES ? i : -1)).filter((i) => i >= 0);
  if (shortIdx.length === 0) return picked;

  log.warn("code_too_short_retry", { min: MIN_CODE_LINES, lens, shortCount: shortIdx.length });

  const retryUser = `${user}

[재생성 지시 — 반드시 반영]
직전 생성물의 지문 코드가 너무 짧았습니다(실측 실질 줄 수: ${lens.join(", ")} / 하한 ${MIN_CODE_LINES}줄).
[난이도·분량 규칙]을 다시 읽고, 특히 다음을 지켜 ${count}개를 새로 생성하십시오.
- 주석·빈 줄을 제외한 실질 코드 줄 수 ${MIN_CODE_LINES}줄 이상 (빈 줄·주석으로 채우지 말 것)
- main 외 사용자 정의 함수 2개 이상, 호출 깊이 2단계 이상
- 중간 상태가 누적되는 흐름(단일 for 한 번으로 끝나는 구조 금지)
- 소문항 2개 이상, 표준출력 2줄 이상
- 늘어난 코드의 실행 결과를 회차별로 다시 추적해 answer를 정확히 계산할 것`;

  try {
    const retried = await generateProblemsJson({ system, user: retryUser, label: "c_language_retry" });
    const merged = picked.map((p, i) => {
      const alt = retried[i];
      if (!alt) return p;
      return countEffectiveCodeLines(asStr(alt.code)) > lens[i] ? alt : p;
    });
    log.info("code_length_after_retry", {
      lens: merged.map((p) => countEffectiveCodeLines(asStr(p.code))),
    });
    return merged;
  } catch (err) {
    // 재요청 실패는 치명적이지 않다 — 짧더라도 1차 결과를 그대로 낸다.
    log.warn("code_length_retry_failed", { message: err instanceof Error ? err.message : String(err) });
    return picked;
  }
}

/**
 * 표준출력 비교용 정규화 — CRLF·줄 끝 공백·마지막 빈 줄 차이는 무시한다.
 *
 * 실제 출력의 "의미 있는 차이"(값·줄 수·줄 안의 공백)만 남긴다.
 */
export function normalizeStdout(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * 풀이가 스스로 모순을 인정한 흔적 탐지.
 *
 * 실측(2026-08-03): 모델이 추적으로 44를 구해 놓고 answer는 5로 적은 뒤
 * solution에 "문제상의 착오", "잘못된 50으로 간주"라고 써 놓았다. 이런 문구가 보이면
 * 값 비교를 하기 전에 이미 신뢰할 수 없는 문항이다.
 */
export function hasSelfContradiction(solution: string): boolean {
  return /착오|잘못\s*계산|잘못된|무시하고|규칙상\s*잘못|간주한\s*것이/.test(solution);
}

/**
 * 검증에서 버려진 문항 자리를 **한 번만** 다시 채운다.
 *
 * 무한 재귀 같은 결함 문항을 그냥 내보내면 정답이 존재하지 않는 문제가 사용자에게 간다.
 * 그렇다고 무한 재생성은 비용이 크므로 보충은 1회로 고정하고, 그래도 못 채우면
 * **요청 개수보다 적게** 돌려준다(틀린 문항을 채워 넣는 것보다 낫다).
 */
async function refillDiscarded(args: {
  kept: (Record<string, unknown> | null)[];
  count: number;
  system: string;
  user: string;
}): Promise<Record<string, unknown>[]> {
  const { kept, count, system, user } = args;
  const survivors = kept.filter((p): p is Record<string, unknown> => p !== null);
  const missing = count - survivors.length;
  if (missing <= 0) return survivors;

  log.warn("refill_discarded", { missing, kept: survivors.length, requested: count });
  try {
    const extraUser = `${user}

[보충 생성 — 직전 생성물이 폐기된 이유]
직전 문항의 지문 코드가 **종료하지 않았습니다**(무한 재귀 또는 무한 루프). 정답이 존재하지 않아 폐기했습니다.
${missing}개를 새로 생성하되 다음을 반드시 지키십시오.
- 모든 재귀는 **호출될 수 있는 모든 인자에 대해** 종료 조건에 도달해야 합니다.
  (예: n을 2씩 줄이면서 n == 0 에서만 멈추면 홀수 인자로 호출될 때 영원히 끝나지 않습니다 — n <= 0 으로 쓰십시오.)
- 모든 반복문의 종료 조건이 유한 횟수 안에 성립해야 합니다.
- 나머지 [난이도·분량 규칙]·[정답 정확성 규칙]은 그대로 지킵니다.`;
    const extra = await generateProblemsJson({ system, user: extraUser, label: "c_language_refill" });
    const verifiedExtra = await verifyAndRepairOutputs({ items: extra.slice(0, missing) });
    const usable = verifiedExtra.filter((p): p is Record<string, unknown> => p !== null);
    log.info("refill_result", { added: usable.length, missing });
    return [...survivors, ...usable];
  } catch (err) {
    log.warn("refill_failed", { message: err instanceof Error ? err.message : String(err) });
    return survivors;
  }
}

/** 검증 실행 결과 — 표준출력과, 소문항이 묻는 중간값(probe)들. */
type ExecutionResult = { stdout: string; probes: string[] };

/**
 * 검증 실행의 결말.
 *  - ok: 실행 성공 → stdout·probes가 정답의 기준.
 *  - invalid: **지문 코드 자체가 틀렸다**(무한 재귀·무한 루프·폭주 출력). 정답이 존재하지 않으므로
 *    모델의 손 추적으로 메우면 안 된다 — 그 문항은 버린다.
 *  - unavailable: 번역·파싱 실패 등 검증을 못 한 경우 → 손 추적으로 fallback.
 */
type ExecOutcome =
  | { kind: "ok"; result: ExecutionResult }
  | { kind: "invalid"; reason: string }
  | { kind: "unavailable" };

/** 지문 코드가 종료하지 않거나 폭주함을 뜻하는 런타임 오류 (번역 버그와 구분). */
export const NON_TERMINATING = /Maximum call stack|timed out|output_overflow|probe_overflow/i;

/**
 * 문자열이 아닐 수도 있는 모델 응답 필드를 텍스트로 강제.
 *
 * 실측: 복구 호출이 `answer`를 문자열이 아니라 `{"1": "...", "2": "..."}` 객체로 돌려줘
 * `asStr`이 빈 문자열을 내고 복구가 통째로 버려졌다(로그 `repair_unusable_shape`).
 */
export function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join("\n");
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => {
        const text = asText(val);
        return text ? (/^\d+$/.test(k) ? `[${k}] ${text}` : text) : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * 정답 문구를 소문항 단위로 쪼갠다.
 *
 * `[1]` · `(1)` · `1.` 처럼 줄 머리에 붙은 번호를 경계로 본다. 번호가 전혀 없으면 전체를 한 덩이로.
 * ★ 왜 필요한가: 소문항 [2]가 전체 출력을 나열하므로, [1]의 값을 정답 문자열 **전체**에서 찾으면
 *   [1]이 틀려도 그 값이 [2] 출력줄에 있어 통과해 버린다(실측 — 24를 30으로 적은 문항이 통과).
 */
export function splitSubAnswers(answer: string): string[] {
  const segments: string[] = [];
  let current: string[] | null = null;
  for (const line of answer.split("\n")) {
    if (/^\s*(?:\[\d+\]|\(\d+\)|\d+\s*[.)])\s*/.test(line)) {
      if (current) segments.push(current.join("\n"));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) segments.push(current.join("\n"));
  return segments.length > 0 ? segments : [answer];
}

/**
 * 정답 문구가 특정 값을 실제로 담고 있는지 판정 (소문항 정답 교차 확인용).
 *
 * 숫자는 부분 일치(24가 240·124에 걸리는 것)를 막기 위해 **토큰 경계**로 검사한다.
 */
export function answerMentions(answer: string, value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/^-?\d+$/.test(v)) {
    return new RegExp(`(^|[^\\d-])${v.replace("-", "-?")}(?![\\d])`).test(answer);
  }
  return answer.includes(v);
}

/**
 * probe(검증 실행으로 얻은 중간값)들이 정답의 **해당 소문항 칸**에 들어 있는지 확인.
 *
 * @returns 어긋난 첫 probe 값. 모두 일치하면 undefined.
 */
export function findProbeMismatch(answer: string, probes: string[]): string | undefined {
  if (probes.length === 0) return undefined;
  const segments = splitSubAnswers(answer);
  return probes.find((value, k) => {
    const scope = segments[k] ?? answer;
    return !answerMentions(scope, value);
  });
}

/**
 * 실행 결과 검증·복구 — 지문 코드를 **독립적으로** 다시 실행 추적해 정답을 교차 확인한다.
 *
 * 왜 필요한가: 코드가 길어지자 생성 모델(temperature 0.85)의 손 추적이 자주 틀렸다
 * (실측 — 44를 5로, 102를 50으로). 이 환경에는 C 컴파일러가 없어 실제 실행으로 검증할 수 없으므로,
 * **코드만 보여 주는 낮은 temperature의 전용 검증 호출**로 대신한다(생성물의 정답은 보여주지 않아
 * 앵커링을 막는다). 검증값과 생성값이 다르거나 풀이가 자기모순이면 복구 호출로 answer·solution을 다시 쓴다.
 *
 * 실패(파싱 불가·API 오류)는 graceful — 원본 문항을 그대로 통과시킨다(생성 자체를 막지 않는다).
 */
async function verifyAndRepairOutputs(args: {
  items: Record<string, unknown>[];
}): Promise<(Record<string, unknown> | null)[]> {
  const { items } = args;

  return Promise.all(
    items.map(async (p, i) => {
      const code = asStr(p.code);
      if (!code.trim()) return p;

      const question = asStr(p.question);
      // 1순위: JS로 옮겨 **실제 실행**(결정론). 번역 실패일 때만 모델의 손 추적으로 fallback한다.
      const outcome = await executeViaJsTranslation(code, question, i);
      if (outcome.kind === "invalid") {
        // 종료하지 않는 코드 = 정답이 존재하지 않는 문항. 손 추적으로 메우면 지어낸 답이 된다(실측).
        log.warn("problem_discarded_invalid_code", { index: i, reason: outcome.reason });
        return null;
      }
      const exec =
        outcome.kind === "ok"
          ? outcome.result
          : await traceCode(code, i).then((s) => (s === null ? null : { stdout: s, probes: [] }));
      if (exec === null) return p;

      const claimed = asStr(p.expectedOutput);
      const answer = asStr(p.answer);
      const contradiction = hasSelfContradiction(asStr(p.solution));
      const stdoutOk = claimed.trim().length > 0 && normalizeStdout(claimed) === normalizeStdout(exec.stdout);
      // 소문항 [1]은 표준출력에 안 나오는 중간값을 묻는 경우가 많다 — probe 값이 정답 문구에
      // 실제로 들어 있는지까지 봐야 한다(실측: 출력은 맞는데 [1]만 24를 30으로 적은 문항).
      const missingProbe = findProbeMismatch(answer, exec.probes);
      if (stdoutOk && !contradiction && missingProbe === undefined) return p;

      log.warn("output_mismatch_repair", {
        index: i,
        reason: contradiction
          ? "self_contradiction"
          : !claimed
            ? "no_expected_output"
            : !stdoutOk
              ? "stdout_mismatch"
              : "probe_mismatch",
        claimed: normalizeStdout(claimed).slice(0, 120),
        verified: normalizeStdout(exec.stdout).slice(0, 120),
        probes: exec.probes.slice(0, 4),
      });

      const repaired = await repairAnswer({
        problem: p,
        verifiedStdout: exec.stdout,
        probes: exec.probes,
        index: i,
      });
      return repaired ?? p;
    }),
  );
}

/** 번역 코드 실행 상한 — 무한 루프·폭주 출력 방어. */
const JS_RUN_TIMEOUT_MS = 1000;
const MAX_OUTPUT_CHUNKS = 500;

/**
 * 지문 C 코드를 동등한 JavaScript로 번역시킨 뒤 **실제로 실행해** 표준출력을 얻는다.
 *
 * 왜 이렇게 하는가: 이 환경에는 C 컴파일러가 없고, 모델의 "손 추적"은 코드가 길어지자
 * 실측에서 자주 틀렸다(재귀 함수에서 값이 어긋남). 반면 **번역은 추적보다 훨씬 쉬운 작업**이고,
 * 번역된 코드는 Node가 결정론적으로 실행하므로 산술 오류가 원천적으로 사라진다.
 *
 * 안전장치: `node:vm`의 **완전히 빈 컨텍스트**(호스트 객체를 하나도 주입하지 않는다) + 실행 타임아웃.
 * 호스트 함수를 주입하면 `out.constructor.constructor(...)`로 realm을 빠져나갈 여지가 생기므로,
 * 출력 수집 버퍼·`out` 함수까지 **vm 안에서 정의**하고 결과만 읽어 온다. require·process 같은 전역은
 * 컨텍스트에 존재하지 않으므로 참조 시 그냥 ReferenceError가 난다(식별자 블랙리스트 불필요 —
 * C 코드에 흔한 `process`라는 함수명이 오탐으로 걸리던 문제도 함께 해소).
 *
 * @returns ok(실행 결과) / invalid(지문 코드 자체가 비정상 — 문항 폐기) / unavailable(검증 불가 — 손 추적).
 */
async function executeViaJsTranslation(
  code: string,
  question: string,
  index: number,
): Promise<ExecOutcome> {
  let js = "";
  try {
    const obj = await generateJsonObject({
      label: `c_language_translate_${index}`,
      temperature: 0.1,
      system: `당신은 C→JavaScript 변환기입니다. 주어진 C 코드와 **실행 의미가 완전히 동일한** JavaScript 코드를 만듭니다.
- 계산하지 말고 **그대로 옮기십시오.** 값을 미리 구해 상수로 박아 넣는 것은 금지입니다(반복문·재귀·분기를 그대로 유지).
- 정수 연산: 나눗셈은 Math.trunc(a / b), 나머지는 a % b. 정수 오버플로는 무시(그대로 계산).
- 배열은 JS 배열로, 포인터 인자는 같은 배열 참조로 옮깁니다. 구조체는 객체로.
- **출력은 printf 대신 전역 함수 out(문자열)** 을 호출합니다. printf의 서식(%d·%c·%s·%f·자릿수)과 개행 \\n을
  직접 문자열로 만들어 out에 넘기십시오. printf 한 번 = out 한 번.
- ★ 발문의 소문항이 "전체 출력"이 아닌 **특정 중간값**(예: 어떤 함수가 n번째 호출될 때의 반환값,
  배열의 k번째 원소)을 묻는다면, 그 값이 확정되는 시점에 전역 함수 **probe(문자열)** 를 정확히 한 번 호출해
  그 값을 남기십시오. probe는 표준출력이 아니므로 out과 별개이며, 소문항 순서대로 호출합니다.
  묻는 값이 "전체 출력"뿐이면 probe는 호출하지 않습니다.
  ★ probe에 넘기는 값은 **그 자리에서 접근 가능한 변수**여야 합니다 — 스코프 밖 이름을 쓰면 실행이 실패합니다.
  호출 횟수를 세야 하면 카운터 변수를 직접 선언해 쓰십시오.
- 마지막 줄에서 main()을 호출하십시오.
- require·import·eval·setTimeout 등 외부 API를 절대 쓰지 마십시오. 순수 계산만.
- 출력은 JSON 하나: {"js": "..."} 형태.`,
      user: `[C 코드]
${code}

[발문 — probe로 남길 중간값을 여기서 판단]
${question}

[출력 JSON]
{"js": "위 C 코드와 동일하게 동작하는 JavaScript 전체 코드 (out()으로 출력, 중간값은 probe(), 마지막에 main() 호출)"}`,
    });
    js = obj ? asStr(obj.js) : "";
  } catch (err) {
    log.warn("translate_call_failed", { index, message: err instanceof Error ? err.message : String(err) });
    return { kind: "unavailable" };
  }

  if (!js.trim()) {
    log.warn("translate_empty", { index });
    return { kind: "unavailable" };
  }

  let stdout = "";
  let probes: string[] = [];
  try {
    const context = vm.createContext(Object.create(null));
    // 버퍼·out·probe 정의를 vm 안에 두고, 실행 후 결과 문자열만 꺼내온다(호스트 객체 미주입).
    const wrapped = `
      var __out = [];
      var __probe = [];
      function out(s) {
        __out.push(String(s));
        if (__out.length > ${MAX_OUTPUT_CHUNKS}) { throw new Error("output_overflow"); }
      }
      function probe(v) {
        __probe.push(String(v));
        if (__probe.length > ${MAX_OUTPUT_CHUNKS}) { throw new Error("probe_overflow"); }
      }
      ${js}
      JSON.stringify({ stdout: __out.join(""), probes: __probe });
    `;
    const result: unknown = vm.runInContext(wrapped, context, { timeout: JS_RUN_TIMEOUT_MS });
    const parsed = typeof result === "string" ? JSON.parse(result) : null;
    stdout = asStr(parsed?.stdout);
    probes = Array.isArray(parsed?.probes) ? parsed.probes.map((v: unknown) => String(v)) : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("translated_js_run_failed", { index, message });
    // 무한 재귀·무한 루프·폭주 출력은 **지문 코드의 결함**이지 번역 버그가 아니다.
    // 실측: n을 2씩 줄이며 n==0에서만 멈추는 재귀가 홀수 인자로 호출돼 영원히 끝나지 않았다.
    return NON_TERMINATING.test(message) ? { kind: "invalid", reason: message } : { kind: "unavailable" };
  }

  if (!stdout.trim()) {
    log.warn("translated_js_no_output", { index });
    return { kind: "unavailable" };
  }
  log.info("verified_by_execution", {
    index,
    lines: normalizeStdout(stdout).split("\n").length,
    probes: probes.slice(0, 4),
  });
  return { kind: "ok", result: { stdout, probes } };
}

/**
 * 코드만 주고 표준출력을 독립 추적시키는 검증 호출 (temperature 낮음).
 *
 * @returns 표준출력 문자열. 파싱 실패·오류 시 null(호출부에서 검증 생략).
 */
async function traceCode(code: string, index: number): Promise<string | null> {
  try {
    const obj = await generateJsonObject({
      label: `c_language_verify_${index}`,
      temperature: 0.1,
      system: `당신은 C 컴파일러이자 실행기입니다. 주어진 C 코드를 실제로 실행한 것과 똑같은 표준출력을 만들어야 합니다.
- 반복 회차·함수 호출마다 모든 변수 값을 갱신하며 순서대로 추적하십시오.
- 산술은 **한 연산씩** 계산합니다. 곱셈은 자리별로 확인하고, 뺄셈·나눗셈(정수 나눗셈은 버림)도 한 단계씩 확인하십시오.
- printf 서식(%d·%c·%s·%f)과 개행 위치, 공백을 그대로 재현하십시오.
- 추측하지 말고 추적 결과만 쓰십시오. 출력은 JSON 하나만.`,
      user: `[코드]
${code}

[출력 JSON]
{
  "trace": "회차·호출별 변수 추적 (문자열, 간결하게)",
  "stdout": "이 프로그램의 표준출력 원문. 개행은 \\n으로, 설명·번호 없이 출력 그 자체만."
}`,
    });
    const stdout = obj ? asStr(obj.stdout) : "";
    return stdout.trim().length > 0 ? stdout : null;
  } catch (err) {
    log.warn("verify_call_failed", { index, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * 검증된 표준출력에 맞춰 answer·solution·expectedOutput을 다시 쓰는 복구 호출.
 *
 * 코드·발문은 그대로 두고 **정답과 풀이만** 교체한다(문제 자체를 바꾸면 분량 게이트를 다시 거쳐야 한다).
 * @returns 교체된 문항 객체. 실패 시 null.
 */
async function repairAnswer(args: {
  problem: Record<string, unknown>;
  verifiedStdout: string;
  probes: string[];
  index: number;
}): Promise<Record<string, unknown> | null> {
  const { problem, verifiedStdout, probes, index } = args;
  try {
    // ★ 생성용 system 프롬프트를 재사용하지 말 것 — 그 안의 {"problems":[...]} 스키마를 따라
    //   답이 배열로 감싸여 오고, 평평한 객체를 기대하는 이 호출부가 조용히 null을 냈다(실측).
    const obj = await generateJsonObject({
      label: `c_language_repair_${index}`,
      temperature: 0.2,
      system: `당신은 C언어 문항의 정답·풀이를 교정하는 전문가입니다.
검증된 표준출력이 사실입니다. 그 출력에 맞게 정답과 풀이만 다시 쓰고, 코드·발문은 건드리지 마십시오.
출력은 지정된 키만 가진 **평평한 JSON 객체 하나**입니다. problems 같은 배열로 감싸지 마십시오.`,
      user: `아래 문항은 지문 코드와 발문은 정확하지만 **정답·풀이가 실행 결과와 어긋납니다.**
독립 실행 추적으로 확인된 표준출력은 다음과 같습니다. 이 출력을 사실로 확정하고 정답과 풀이를 다시 쓰십시오.

[지문 코드]
${asStr(problem.code)}

[발문]
${asStr(problem.question)}

[검증된 표준출력 — 이것이 정답의 기준]
${verifiedStdout}
${
  probes.length > 0
    ? `\n[검증된 중간값 — 전체 출력이 아닌 소문항의 정답, 소문항 순서대로]\n${probes
        .map((v, k) => `소문항 ${k + 1}: ${v}`)
        .join("\n")}\n※ 이 값들을 그대로 정답에 쓰십시오. 다시 계산하지 마십시오.`
    : ""
}

[출력 JSON]
{
  "answer": "각 소문항의 정답을 '[1] ...' '[2] ...' 형식으로 번호를 붙여서. [2](전체 출력)은 위 표준출력과 문자 단위로 같아야 한다.",
  "expectedOutput": "위 표준출력 원문 그대로.",
  "solution": "회차·호출별 변수 추적표를 순서대로 적고 그 추적에서 위 출력이 나오는 과정을 보인다. 변명·모순 문구 금지."
}`,
    });
    if (!obj) return null;
    // 모델이 그래도 배열로 감싸는 경우를 관대하게 언랩.
    const flat = (Array.isArray(obj.problems) ? obj.problems[0] : obj) as Record<string, unknown>;
    // asStr이 아니라 asText — 모델이 answer를 객체·배열로 돌려주는 회차가 있다(실측).
    const answer = asText(flat?.answer);
    const solution = asText(flat?.solution);
    if (!answer.trim() || !solution.trim()) {
      log.warn("repair_unusable_shape", { index, keys: Object.keys(obj).slice(0, 6) });
      return null;
    }
    log.info("answer_repaired", { index });
    return {
      ...problem,
      answer,
      solution,
      expectedOutput: asText(flat?.expectedOutput) || verifiedStdout,
    };
  } catch (err) {
    log.warn("repair_call_failed", { index, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
