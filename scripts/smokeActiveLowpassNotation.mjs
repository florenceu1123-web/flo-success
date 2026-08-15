/**
 * 임용 31번 1차 능동 저역통과 필터 — **표기 계약 + 3단계 서술형** 정적 스모크.
 *
 * ★ 이 스모크가 지키는 것 (CLAUDE.md 1-4-3):
 *   route의 전역 분수 변환기는 answer·solution에만 걸리고 **대괄호 단위가 바로 뒤에 붙은 소수만**
 *   보호한다. 실측에서 "398.1 Hz" → 3981/10, "796.2 Hz" → 3981/5, "π=3.14" → π=157/50 로 뭉개졌다.
 *   ⇒ 생성물을 실제로 `fractionizeText`에 통과시켜 **한 글자도 바뀌지 않음**을 단언한다.
 *
 * ※ 기존 `smokeActiveLowpassFilter.mjs`는 이미지 기반 E2E라 옛 세션 캐시가 사라지면 실행 자체가 죽는다.
 *   이 스모크는 API·이미지 없이 파이프라인만 직접 돌린다.
 */
import { runActiveLowpassFilterPipeline } from "../lib/pipeline/runActiveLowpassFilterPipeline.ts";
import { fractionizeText } from "../lib/format/fraction.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass += 1; } else { fail += 1; console.log("  ✗", m); } };

const analysis = {
  topic: "1차 능동 저역통과 필터의 대역폭 변화",
  interpretation: "연산증폭기를 이용한 1차 저역통과 필터에서 커패시터를 바꾸었을 때 대역폭의 변화를 구한다.",
  relatedConcepts: ["저역통과 필터", "차단주파수", "대역폭"],
  fillInTheBlanks: [],
  componentInventory: [{ type: "OPAMP", value: "" }, { type: "R", value: "50kΩ" }, { type: "C", value: "8nF" }],
  subjectKey: "electronics",
  topicKey: "opamp",
};

for (const mode of ["exam_similar", "exam_variant"]) {
  const probs = await runActiveLowpassFilterPipeline({ analysis, mode, count: 8 });
  ok(probs.length === 8, `${mode} 생성 개수 ${probs.length}`);

  for (const [i, p] of probs.entries()) {
    const tag = `${mode}#${i}`;
    const both = `${p.answer}\n${p.solution}`;

    // ── 1. 표기 계약 — 분수 변환기가 손댈 것이 없어야 한다 ──
    ok(fractionizeText(p.answer) === p.answer, `${tag} answer가 분수 변환기에 뭉개짐`);
    ok(fractionizeText(p.solution) === p.solution, `${tag} solution이 분수 변환기에 뭉개짐`);

    // 주파수 수치 뒤에는 반드시 대괄호 단위가 붙어야 한다(맨 단위 "123 Hz" 금지)
    ok(!/\d\s+Hz\b/.test(both), `${tag} 보호되지 않는 "숫자 Hz" 표기`);
    // π를 십진수로 적으면 변환기가 157/50으로 바꾼다 — 풀이에서는 기호로만
    ok(!/3\.14/.test(both), `${tag} 풀이·정답에 π의 십진값(3.14) 노출`);
    // 음수는 유니코드 마이너스로 통일
    ok(!/-\d/.test(both), `${tag} ASCII 하이픈 음수`);

    // ── 2. 3단계 서술형 계약 (객관식 원본 → 단계별 주관식) ──
    for (const k of [1, 2, 3]) {
      ok(p.question.includes(`[단계 ${k}]`), `${tag} 발문에 [단계 ${k}] 없음`);
      ok(p.answer.includes(`[단계 ${k}]`), `${tag} 정답에 [단계 ${k}] 없음`);
      ok(p.solution.includes(`[단계 ${k}]`), `${tag} 풀이에 [단계 ${k}] 없음`);
    }
    ok(!/고르시오|고른 것은|보기 중|①|②|③|④|⑤/.test(`${p.content}\n${p.question}`), `${tag} 객관식 잔존`);

    // ── 3. 물리 재검산 — 정답의 f_c가 1/(2πRC)와 맞는가 ──
    //   조건 문자열에서 R·C를 되읽어 독립 계산한다(생성기 내부값에 기대지 않는다).
    const nums = [...p.answer.matchAll(/≈\s*([\d.]+)\[Hz\]/g)].map((m) => parseFloat(m[1]));
    ok(nums.length >= 2, `${tag} 정답에서 f_c 두 개를 못 읽음`);
    if (nums.length >= 2) {
      const cond = (p.conditions ?? []).join(" ");
      const rs = [...cond.matchAll(/([\d.]+)kΩ/g)].map((m) => parseFloat(m[1]) * 1000);
      const cs = [...cond.matchAll(/([\d.]+)nF/g)].map((m) => parseFloat(m[1]) * 1e-9);
      const fc = (R, C) => 1 / (2 * 3.14 * R * C);
      // C 변경형: R 하나(+R_f) · C 둘 / R 변경형: R 셋(전·후·R_f) · C 하나
      const cChanged = cs.length >= 2;
      const expect = cChanged
        ? [fc(rs[0], cs[0]), fc(rs[0], cs[1])]
        : [fc(rs[1], cs[0]), fc(rs[2], cs[0])];
      ok(Math.abs(expect[0] - nums[0]) < 0.15, `${tag} f_c(전) 불일치 ${nums[0]} vs ${expect[0].toFixed(1)}`);
      ok(Math.abs(expect[1] - nums[1]) < 0.15, `${tag} f_c(후) 불일치 ${nums[1]} vs ${expect[1].toFixed(1)}`);
      // 증가/감소 방향이 실제 부호와 맞는가
      const dir = expect[1] > expect[0] ? "증가" : "감소";
      ok(p.answer.includes(dir), `${tag} 변화 방향 불일치(기대 ${dir})`);
    }

    // ── 4. figure ──
    ok((p.figureVariants ?? []).length === 1, `${tag} figure 1개 아님`);
    ok(p.figureVariants[0].diagramType === "active_lowpass_filter_circuit", `${tag} diagramType 불일치`);
  }
}

console.log(`\n=== ACTIVE LPF NOTATION/3STEP: ${pass} pass / ${fail} fail ===`);
if (fail > 0) process.exit(1);
