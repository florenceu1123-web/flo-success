/**
 * 스모크 — **객관식 원본 → 3단계 단계별 주관식** 계약 (사용자 지정 2026-08-12).
 *
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeThreeStepMultipleChoice.mjs
 *
 * 검사 범위(전부 API 없는 정적 검사):
 *  A. EM 레지스트리 **전 항목 × 2모드 × 하위구조 힌트** — 발문·정답이 정확히 3단계, 선택지 0개.
 *  B. 계약 헬퍼(countStepMarkers·isThreeStepText·hasChoiceList)의 경계 동작.
 *  C. 객관식 원본 감지기 — 실측형 요약(마커 잔존·"옳은 것은"·형식 언급) + 주관식 원본 음성 5종.
 *  D. 검증기 규칙 — missing_three_step_question·multiple_choice_output이 실제로 발화/미발화.
 *  E. 임용 24번(유전체 전위 분포) 물리 재검산 — 형식만 바꾸고 답은 그대로인지 확인.
 */
import { EM_FORMULA_REGISTRY, generateElectromagnetics } from "@/lib/generation/topologies/electromagnetics";
import { countStepMarkers, hasChoiceList, isThreeStepText } from "@/lib/format/threeStep";
import { detectMultipleChoiceOriginal, isMultipleChoiceText } from "@/lib/analysis/multipleChoice";
import { validateProblem } from "@/lib/validators/validateProblem";

let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`); }
};

// ── A. EM 레지스트리 전 항목 3단계 ────────────────────────────────────
const HINTS = [undefined, { dielectricStructure: "potential_distribution" }, { dielectricArrangement: "series" }];
let combos = 0, badStep = [], badChoice = [], badAnswer = [];
for (const entry of EM_FORMULA_REGISTRY) {
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (const hints of HINTS) {
      for (const seed of [3, 11, 29]) {
        const inst = generateElectromagnetics({ seed, mode, entryId: entry.id, hints });
        combos++;
        if (!isThreeStepText(inst.question)) badStep.push(`${entry.id}/${mode}(q:${countStepMarkers(inst.question)})`);
        if (!isThreeStepText(inst.answer)) badAnswer.push(`${entry.id}/${mode}(a:${countStepMarkers(inst.answer)})`);
        const body = [inst.content, inst.question, inst.givens.join(" "), inst.answer].join("\n");
        if (hasChoiceList(body)) badChoice.push(`${entry.id}/${mode}`);
      }
    }
  }
}
console.log(`A. EM 레지스트리 ${EM_FORMULA_REGISTRY.length}항목 × ${combos / EM_FORMULA_REGISTRY.length}조합 = ${combos}건`);
ok(badStep.length === 0, "모든 발문이 3단계", badStep.slice(0, 5).join(", "));
ok(badAnswer.length === 0, "모든 정답이 3단계 라벨", badAnswer.slice(0, 5).join(", "));
ok(badChoice.length === 0, "생성물에 보기(①~⑤)·선택 요구 없음", badChoice.slice(0, 5).join(", "));
// 풀이(steps)도 단계 라벨을 갖는지 — 정답과 대조 가능해야 한다.
{
  const inst = generateElectromagnetics({ seed: 5, mode: "exam_similar", entryId: "point_charge_field" });
  ok(inst.steps.length >= 3 && inst.steps.every((s) => /\[단계\s*\d\]/.test(s)), "풀이 단계에도 [단계 N] 라벨");
  ok(/해석 절차/.test(inst.content), "본문에 〈해석 절차〉 서술 지시문");
}

// ── B. 계약 헬퍼 경계 ─────────────────────────────────────────────────
console.log("B. 계약 헬퍼");
ok(isThreeStepText("[단계 1] a\n[단계 2] b\n[단계 3] c"), "정확히 3단계 → true");
ok(!isThreeStepText("[단계 1] a\n[단계 2] b"), "2단계 → false");
ok(!isThreeStepText("[단계 1] a\n[단계 2] b\n[단계 3] c\n[단계 4] d"), "4단계 → false");
ok(countStepMarkers("[단계 1] a [단계 1] 재언급 [단계 2] b") === 2, "같은 마커 반복은 1개로 셈");
ok(hasChoiceList("① 20z ② −20z ③ 40z"), "원문자 3개 → 객관식");
ok(hasChoiceList("각 영역의 전위로 옳은 것은?"), "'옳은 것은?' → 객관식");
ok(hasChoiceList("보기 중에서 알맞은 것을 고르시오."), "'고르시오' → 객관식");
ok(!hasChoiceList("㉠과 ㉡에 들어갈 값을 구하시오."), "㉠㉡ 빈칸 마커는 객관식이 아님");
ok(!hasChoiceList("[단계 1] 전계를 구하시오."), "일반 서술 발문은 객관식 아님");
// ★ 실측 오탐 회귀 (active_lowpass_filter) — "옳은 것을 … 구하시오"는 서술형이다.
ok(!hasChoiceList("대역폭[Hz]의 변화로 옳은 것을 <해석 절차>에 따라 각 단계별 풀이과정과 함께 구하시오."),
  "서술 지시가 붙은 '옳은 것을 …구하시오'는 오탐 아님");
ok(!hasChoiceList("① 첫째 마디 ② 둘째 마디"), "원문자 2개(마디 번호)는 생성물 위반 아님");
// 원본 판정은 더 민감하다 — 같은 문구라도 **원본 요약**에 있으면 객관식으로 본다.
ok(isMultipleChoiceText("각 유전체 영역의 전위로 옳은 것을 고른다"), "원본 판정은 낱말만으로도 발화(민감)");

// ── C. 객관식 원본 감지 ───────────────────────────────────────────────
console.log("C. 객관식 원본 감지");
const MC_CASES = [
  ["마커 잔존", { topic: "유전체 전위 분포", interpretation: "① 20z ② −20z ③ 40z 중 옳은 것을 고른다." }],
  ["옳은 것은", { topic: "두 유전체 평행판 커패시터", interpretation: "각 유전체 영역에서의 전위 V(z)를 구한 것으로 옳은 것은?" }],
  ["형식 언급", { topic: "전자기학", interpretation: "5지 선다형 문항이다.", relatedConcepts: ["객관식"] }],
  ["보기 중에서", { topic: "자계", interpretation: "보기 중에서 알맞은 것을 고르시오." }],
];
for (const [label, a] of MC_CASES) ok(detectMultipleChoiceOriginal(a), `객관식 감지: ${label}`);
const SUBJ_CASES = [
  ["3단계 서술형", { topic: "테브난 등가", interpretation: "〈해석 절차〉에 따라 [단계 1] Z_th [단계 2] V_th [단계 3] P_max를 서술한다." }],
  ["빈칸 마커", { topic: "JK 여기표", interpretation: "㉠~㉣에 들어갈 값을 쓰고 불함수를 간략화한다." }],
  ["일반 계산", { topic: "RLC 과도응답", interpretation: "스위치를 닫은 뒤 i(t)를 구한다." }],
  ["빈 분석", null],
  ["개념 명칭형", { topic: "중첩의 원리", interpretation: "원리의 이름을 쓰시오." }],
];
for (const [label, a] of SUBJ_CASES) ok(!detectMultipleChoiceOriginal(a), `주관식 원본 미발화: ${label}`);
ok(isMultipleChoiceText("① 가 ② 나"), "원문자 2개도 객관식으로 봄");

// ── D. 검증기 규칙 ────────────────────────────────────────────────────
console.log("D. 검증기 규칙");
const ruleSet = { subject: "electromagnetics", requiredFigureRoles: [], semantic: {} };
const base = {
  id: "p1", content: "본문", conditions: [], answer: "a", solution: "s",
  topicKey: "capacitance", figureVariants: [],
};
const run = (problem, mc) => validateProblem({
  problem, expected: { subject: "electromagnetics", ruleSet, multipleChoiceOriginal: mc },
}).issues.map((i) => i.rule);

const threeStepQ = "[단계 1] 식을 쓰시오.\n[단계 2] 중간량을 구하시오.\n[단계 3] 최종값을 구하시오.";
ok(!run({ ...base, question: threeStepQ }, true).includes("missing_three_step_question"), "3단계 발문 + 객관식 원본 → 통과");
ok(run({ ...base, question: "전위 V(z)를 구하시오." }, true).includes("missing_three_step_question"), "단일 발문 + 객관식 원본 → 위반 보고");
ok(!run({ ...base, question: "전위 V(z)를 구하시오." }, false).includes("missing_three_step_question"), "주관식 원본이면 단일 발문 허용");
ok(run({ ...base, question: "① 20z ② −20z ③ 40z 중 옳은 것은?" }, true).includes("multiple_choice_output"), "생성물이 객관식이면 위반 보고");
ok(!run({ ...base, question: threeStepQ }, false).includes("multiple_choice_output"), "정상 3단계는 객관식 위반 아님");

// ★ 사용자 신고 2026-08-12 재현: "해설은 단계별인데 문제는 단계별이 아니야"
//   (원본이 객관식으로 감지되지 않아도 잡혀야 한다 — 발문↔정답 불일치 자체가 결함이다.)
const stepAnswer = "[단계 1] 정의식\n[단계 2] V_dc = 4.5[V]\n[단계 3] V_rms = 5[V]";
ok(run({ ...base, answer: stepAnswer, question: "이 신호의 직류값 V_dc [V]와 실효값 V_rms [V]를 구하시오." }, false)
  .includes("question_not_step_wise"), "정답만 단계별 + 단일 발문 → 위반 보고(객관식 아니어도)");
ok(run({ ...base, answer: "V_dc = 4.5[V]", solution: stepAnswer, question: "…를 구하시오." }, false)
  .includes("question_not_step_wise"), "풀이만 단계별이어도 발화");
ok(!run({ ...base, answer: stepAnswer, question: threeStepQ }, false).includes("question_not_step_wise"),
  "발문도 단계별이면 통과");
ok(!run({ ...base, answer: "V_dc = 4.5[V], V_rms = 5[V]", question: "…를 구하시오." }, false)
  .includes("question_not_step_wise"), "정답도 단일이면 발화 안 함(단계 요구는 원본 형식을 따른다)");
// ★ 역방향(발문 3단계 + 정답 한 줄)은 **규칙으로 만들지 않는다** — 여러 generic 경로가 솔버 값을
//   한 줄로 강제하므로 정상 동작이 위반으로 찍힌다(실측 smokeAll 29/40). 프롬프트로만 권한다.
ok(run({ ...base, question: threeStepQ, answer: "20z, 50z-30" }, false).length === 0,
  "발문만 단계별 + 솔버 확정 단일 정답 → 위반 아님(오탐 방지)");

// ── E. 임용 24번(전위 분포) — 형식만 바뀌고 물리는 그대로인지 ─────────
console.log("E. 임용 24번 전위 분포 물리 재검산");
let checked = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  for (const mode of ["exam_similar", "exam_variant"]) {
    const inst = generateElectromagnetics({
      seed, mode, entryId: "dielectric_two_region_cap",
      hints: { dielectricStructure: "potential_distribution", dielectricArrangement: "series" },
    });
    const plain = `${inst.content} ${inst.givens.join(" ")} ${inst.answer}`;
    // 두께 d1·dTop, 경계 전위, 기울기를 본문에서 뽑아 V(z)가 두 경계조건을 만족하는지 확인.
    const mThick = plain.match(/두께가 각각 \\\( (\d+)\\,\\mathrm\{mm\} \\\)와 \\\( (\d+)\\,\\mathrm\{mm\} \\\)/);
    const mV = inst.answer.match(/V\(z\)=(-?\d+)z(?:\s*([+-])\s*(\d+))?/g);
    ok(!!mThick, `[seed ${seed}/${mode}] 두께 파싱`);
    ok(!!mV && mV.length >= 1, `[seed ${seed}/${mode}] V(z) 1차식 존재`);
    if (mThick && mV) {
      const d1 = Number(mThick[1]), d2 = Number(mThick[2]);
      const lin = (s) => {
        const m = s.match(/V\(z\)=(-?\d+)z(?:\s*([+-])\s*(\d+))?/);
        const slope = Number(m[1]);
        const inter = m[2] ? (m[2] === "-" ? -Number(m[3]) : Number(m[3])) : 0;
        return { slope, inter };
      };
      const v1 = lin(mV[0]);
      const v2 = mV[1] ? lin(mV[1]) : null;
      if (v2) {
        // 경계 z=d1에서 전위 연속
        ok(Math.abs((v1.slope * d1 + v1.inter) - (v2.slope * d1 + v2.inter)) < 1e-9,
          `[seed ${seed}/${mode}] 경계 z=${d1}에서 전위 연속`);
        // 기울기 비 = 전계 비 k (E2 = k·E0)
        const k = v2.slope / v1.slope;
        ok(Number.isInteger(k) && k >= 2, `[seed ${seed}/${mode}] 기울기 비가 정수 k(=${k})`);
        ok(d1 + d2 > d1, `[seed ${seed}/${mode}] 두께 양수`);
        checked++;
      }
    }
  }
}
ok(checked >= 12, `전위 분포 ${checked}건 재검산`);

console.log(`\n${pass}/${pass + fail} 통과${fail ? ` — ${fail}건 실패` : ""}`);
process.exit(fail ? 1 : 0);
