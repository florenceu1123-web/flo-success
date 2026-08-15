/**
 * **(+)단자 3입력 평균** 비반전 증폭 → 2단 중첩으로 미지 저항 R 도출
 * (임용 8번 전자회로 — `opamp_avg_superposition_r`) 전용 결정론 generator. GPT 없음.
 *
 * ── 원본 배선 (원본 이미지 5배 확대로 확정, [[feedback_verify_wiring_by_zoom]])
 *   1단 U₁ — ★**(+)단자에 입력이 3개**★: `3V─3kΩ─`, `2V─3kΩ─`, `1V─3kΩ─` 가 **한 마디에 모여** (+)로.
 *            (+) 마디에서 접지로 내려가는 저항은 **없다**.
 *            (−)단자: `접지 ─ 2kΩ ─ (−)`, `(−) ─ 2kΩ 궤환 ─ V₁`.
 *   2단 U₂ — `V₁ ─ R ─ (−)`, `(−) ─ 3kΩ 궤환 ─ 단자 a(V_o)`, (+)에는 직류 전원 V₂(3V).
 *   〈해석 절차〉 [1] V₁ [2] a점에서 V₁에 의한 전압과 V₂에 의한 전압을 **각각 R의 식으로** [3] R[kΩ].
 *
 * ── 물리 (이상 연산증폭기, 닫힌형)
 *   · (+) 마디는 이상 OPAMP라 전류가 흘러들지 않는다 → 세 가지의 전류 합이 0:
 *     Σ(V_i − V₊)/R_in = 0 → **V₊ = (ΣV_i)/3** (저항이 모두 같으므로 단순 평균)
 *   · 1단은 (−)가 접지-R_g, 궤환 R_f1인 **비반전 증폭기** → **V₁ = (1 + R_f1/R_g)·V₊**
 *   · 2단은 중첩으로 나눈다(원본 [단계 2]가 정확히 이것을 요구한다):
 *       V₂ = 0 → 반전 증폭  **V_o(V₁) = −(R_f2/R)·V₁**
 *       V₁ = 0 → 비반전 증폭 **V_o(V₂) = (1 + R_f2/R)·V₂**
 *     합쳐서 **V_o = V₂ + (R_f2/R)(V₂ − V₁)** → 역으로 **R = R_f2(V₂ − V₁)/(V_o − V₂)**.
 *   원본 검산(3·2·1V, 3kΩ, R_g=R_f1=2kΩ, R_f2=3kΩ, V₂=3V, 목표 V_o=1.5V):
 *   V₊ = 2V → **V₁ = 4V**, V_o = 3 − 3/R = 1.5 → **R = 2[kΩ]**.
 *
 * ── 형제와의 판별선
 *   `opamp_two_stage_rx`(임용 2번)는 (+) 마디에 **접지로 내려가는 미지 R_X**가 있고 그것을 구한다.
 *   이 유형은 (+)에 **접지 저항이 없고**, 미지 저항 R은 **2단의 입력 경로**에 있다.
 *   `opamp_three_stage_sum`은 3단·반전 가산, `opamp_summer_tfeedback`은 T형 궤환 + 부하 전류다.
 */

import { q, qAdd, qDiv, qMul, qNum, qSub, qTex, type Q } from "@/lib/format/rational";

export type OasMode = "exam_similar" | "exam_variant";

/** 회로 payload — 전용 렌더러가 그대로 받는다. */
export type OpampAvgSuperpositionCircuitDiagram = {
  inputs: number[];        // (+)단자에 붙는 입력 전압들 [V] (위→아래)
  Rin: number;             // 각 입력 직렬 저항 [kΩ] (모두 같다 → 단순 평균)
  Rg: number;              // 1단 (−)↔접지 [kΩ]
  Rf1: number;             // 1단 궤환 [kΩ]
  Rf2: number;             // 2단 궤환 [kΩ]
  V2: number;              // 2단 (+) 직류 전원 [V]
  /** 미지 소자 라벨 — 값 없이 기호만 찍는다(값을 적으면 답이 노출된다). */
  unknown: "R" | "Rf2";
  seriesLabel: string;     // 2단 입력 직렬 저항 표기 ("R" 또는 "2kΩ")
  feedbackLabel: string;   // 2단 궤환 저항 표기 ("3kΩ" 또는 "R_f")
};

export type OasAnswer = {
  Vplus: Q;   // (+) 마디 전압
  V1: Q;      // 1단 출력
  Vo: Q;      // 목표 출력
  R: Q;       // 2단 입력 직렬 저항 [kΩ]
  Rf2: Q;     // 2단 궤환 저항 [kΩ]
  byV1: Q;    // a점에서 V₁에 의한 전압 (R 대입 후)
  byV2: Q;    // a점에서 V₂에 의한 전압 (R 대입 후)
};

export type OasGenerated = {
  values: { inputs: number[]; Rin: number; Rg: number; Rf1: number; Rf2: number; V2: number; R: number; Vo: Q };
  /** 무엇이 미지인가 — "R"(원본) / "Rf2"(변형: 구하는 양 교환) */
  unknown: "R" | "Rf2";
  answer: OasAnswer;
  circuit: OpampAvgSuperpositionCircuitDiagram;
};

type Tuple = { inputs: number[]; Rin: number; Rg: number; Rf1: number; Rf2: number; V2: number; R: number };

/** 원본 튜플 — 참조·검증 전용, 생성 풀에서 제외한다. */
const ORIGINAL: Tuple = { inputs: [3, 2, 1], Rin: 3, Rg: 2, Rf1: 2, Rf2: 3, V2: 3, R: 2 };
const sameTuple = (a: Tuple, b: Tuple) =>
  a.inputs.join(",") === b.inputs.join(",") && a.Rin === b.Rin && a.Rg === b.Rg &&
  a.Rf1 === b.Rf1 && a.Rf2 === b.Rf2 && a.V2 === b.V2 && a.R === b.R;

/** 한 조합의 닫힌형 해. */
export function solveOas(t: Tuple): OasAnswer {
  const sum = t.inputs.reduce((s, x) => s + x, 0);
  const Vplus = q(sum, t.inputs.length);                        // 저항이 모두 같으므로 단순 평균
  const V1 = qMul(qAdd(q(1), q(t.Rf1, t.Rg)), Vplus);           // 비반전 증폭
  const ratio = q(t.Rf2, t.R);                                  // R_f2 / R
  const byV1 = qMul(q(-1), qMul(ratio, V1));                    // 반전 성분
  const byV2 = qMul(qAdd(q(1), ratio), q(t.V2));                // 비반전 성분
  const Vo = qAdd(byV1, byV2);
  return { Vplus, V1, Vo, R: q(t.R), Rf2: q(t.Rf2), byV1, byV2 };
}

const INPUT_SETS: number[][] = [];
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
  if (a === b || b === c || a === c) continue;                  // 세 입력이 서로 달라야 문제가 된다
  if ((a + b + c) % 3 !== 0) continue;                          // 평균이 정수
  if (a < b || b < c) continue;                                 // 내림차순 하나만(순열 중복 제거)
  INPUT_SETS.push([a, b, c]);
}
const RIN = [1, 2, 3, 4, 5];
const RG = [1, 2, 3, 4];
const RF1 = [1, 2, 3, 4, 6];
const RF2 = [1, 2, 3, 4, 6];
const V2S = [1, 2, 3, 4, 5, 6];
const RS = [1, 2, 3, 4, 6, 8];

/**
 * 값 공간 — 규칙으로 열거하고 **품질 필터**만 건다(예시 목록이 아니다).
 *  · V₊·V₁ 정수 · V₁ ≠ V₂ (아니면 2단 입력차가 0이라 R이 결정되지 않는다)
 *  · 목표 V_o가 0.5 배수이고 V₂와 다를 것 · |V_o| ≤ 20
 *  · 중첩 두 성분이 **서로 다른 부호**가 되도록(반전/비반전 대비가 드러나야 [단계 2]가 의미 있다)
 */
export function buildOasSpace(): Tuple[] {
  const out: Tuple[] = [];
  for (const inputs of INPUT_SETS) for (const Rin of RIN) for (const Rg of RG) for (const Rf1 of RF1)
    for (const Rf2 of RF2) for (const V2 of V2S) for (const R of RS) {
      const t = { inputs, Rin, Rg, Rf1, Rf2, V2, R };
      if (sameTuple(t, ORIGINAL)) continue;
      const a = solveOas(t);
      if (a.V1.d !== 1) continue;
      if (qNum(a.V1) === V2) continue;
      const vo = a.Vo;
      if (vo.d !== 1 && vo.d !== 2) continue;                   // 0.5 배수까지만
      if (Math.abs(qNum(vo)) > 20) continue;
      if (qNum(vo) === V2) continue;
      if (qNum(vo) === 0) continue;                            // 목표가 0이면 "출력이 0V일 때의 R"이 되어 밋밋하다
      if (qNum(a.byV1) >= 0 || qNum(a.byV2) <= 0) continue;     // 반전 성분 < 0 < 비반전 성분
      out.push(t);
    }
  return out;
}

/**
 * 열거 순서대로 두면 앞쪽이 전부 같은 입력 집합·같은 저항이라 생성물이 비슷해 보인다.
 * **결정론 해시로 재정렬**해 인접한 seed가 서로 다른 값 조합을 뽑게 한다(무작위 아님 — 재현 가능).
 */
function stableKey(t: Tuple): number {
  const s = `${t.inputs.join("")}|${t.Rin}|${t.Rg}|${t.Rf1}|${t.Rf2}|${t.V2}|${t.R}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

let SPACE: Tuple[] | null = null;
const space = (): Tuple[] => (SPACE ??= buildOasSpace().sort((a, b) => stableKey(a) - stableKey(b)));

/** 유사·변형이 서로 다른 값을 쓰도록 풀을 절반으로 가른다. */
function sliceFor(mode: OasMode): Tuple[] {
  const all = space();
  const half = Math.floor(all.length / 2);
  return mode === "exam_similar" ? all.slice(0, half) : all.slice(half);
}

/**
 * 결정론 생성.
 *  · exam_similar = 원본 — 2단 **입력 직렬 저항 R**이 미지.
 *  · exam_variant = **구하는 양 교환** — R은 주어지고 2단 **궤환 저항 R_f**가 미지.
 *    회로·중첩 절차는 완전히 같고 미지 소자의 자리만 바뀐다.
 */
export function generateOpampAvgSuperposition(args: { seed?: number; mode: OasMode; index?: number }): OasGenerated {
  const pool = sliceFor(args.mode);
  if (pool.length === 0) throw new Error("opamp_avg_superposition: 값 공간이 비었다");
  const base = Math.abs(Math.floor(args.seed ?? 0)) + (args.index ?? 0);
  const t = pool[base % pool.length];
  const answer = solveOas(t);
  const unknown: "R" | "Rf2" = args.mode === "exam_similar" ? "R" : "Rf2";
  return {
    values: { ...t, Vo: answer.Vo },
    unknown,
    answer,
    circuit: {
      inputs: t.inputs, Rin: t.Rin, Rg: t.Rg, Rf1: t.Rf1, Rf2: t.Rf2, V2: t.V2,
      unknown,
      seriesLabel: unknown === "R" ? "R" : `${t.R}kΩ`,
      feedbackLabel: unknown === "R" ? `${t.Rf2}kΩ` : "R_f",
    },
  };
}

/** 미지 저항의 역산식 — 파이프라인이 풀이에 그대로 쓴다. */
export function unknownFromTarget(t: Tuple, unknown: "R" | "Rf2"): Q {
  const a = solveOas(t);
  const diff = qSub(q(t.V2), a.V1);              // V₂ − V₁
  const gap = qSub(a.Vo, q(t.V2));               // V_o − V₂
  return unknown === "R"
    ? qDiv(qMul(q(t.Rf2), diff), gap)            // R  = R_f2(V₂−V₁)/(V_o−V₂)
    : qDiv(qMul(q(t.R), gap), diff);             // R_f = R(V_o−V₂)/(V₂−V₁)
}

export { qTex, qNum };

// ─────────────────────────── 분류·감지 공용 매처 ───────────────────────────
// ★ 분류기와 route 안전망이 **같은 함수를 import** 한다(정규식 복제 금지 — 드리프트).

/** OPAMP 2단 + (+)단자 다중 입력 + 미지 저항 시그니처. */
export function matchesOasSignature(text: string, opampCount: number, srcCount: number): boolean {
  const opamp = /연산\s*증폭기|op[\s-]?amp|opamp|연산증폭기/i.test(text) || opampCount >= 1;
  if (!opamp) return false;
  // 2단 신호 — 중간 출력 V₁ 또는 OPAMP 2개.
  const twoStage = /v\s*_?\s*1\b|v₁|2\s*단|두\s*개의\s*연산|이\s*단/i.test(text) || opampCount >= 2;
  // 미지 저항 R을 구한다 (원본 [단계 3]).
  const unknownR = /저항\s*r\s*\[?\s*k?\s*ω|r\s*\[k?ω\]|저항\s*값을\s*구|미지\s*저항|r을\s*구/i.test(text);
  // (+)단자 다중 입력 — 전원이 4개 이상이면(3입력 + V₂) 이 형식 고유의 구조 신호.
  const multiInput = /입력이?\s*3\s*개|세\s*개의\s*입력|비반전\s*단자.*입력|\+\s*단자.*입력/i.test(text) || srcCount >= 4;
  return twoStage && (unknownR || multiInput);
}

/** 요구 신호 — 출력 목표값이 주어지고 저항을 구한다 / 중첩으로 각 전원 기여를 구한다. */
export function matchesOasAsk(text: string): boolean {
  return /중첩|superposition|각각\s*r의\s*식|r의\s*식으로|저항\s*값을\s*구|저항\s*r/i.test(text)
    || /출력\s*v\s*_?o\s*가|출력\s*전압이?\s*[\d.]+\s*\[?v/i.test(text);
}

/** 형제 archetype 양보. */
export function yieldsOasToSibling(text: string): boolean {
  if (/r_?x|비반전\s*단자.*접지|분압\s*저항/i.test(text)) return true;          // opamp_two_stage_rx
  if (/t\s*형|t형\s*궤환|부하\s*전류|i_?l\b/i.test(text)) return true;           // opamp_summer_tfeedback
  if (/3\s*단|버퍼|삼\s*단/i.test(text)) return true;                            // opamp_three_stage_sum
  if (/발진|필터|대역폭|차단\s*주파수|적분기|미분기|비교기|제너|정전압|슈미트/i.test(text)) return true;
  if (/개방\s*루프|개루프|블록도|전달\s*함수|안정도|특성\s*방정식/i.test(text)) return true;
  if (/커패시터|인덕터|플립플롭|논리\s*게이트|카르노/i.test(text)) return true;
  return false;
}
