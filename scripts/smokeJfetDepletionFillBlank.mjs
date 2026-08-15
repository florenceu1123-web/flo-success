/**
 * 임용 28번 — n채널 JFET 공핍층 개념 빈칸 채우기 archetype 스모크.
 *  · 라우팅(실측형 요약 × 3과목) · 형제 양보 · 값 공간 · 생성물 정답 노출 0 · 렌더 구조
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectJfetDepletionFillBlank, runJfetDepletionFillBlankPipeline } from "../lib/pipeline/runJfetDepletionFillBlankPipeline.ts";
import { generateJfetDepletionFillBlank, __spaces } from "../lib/generation/topologies/jfetDepletionFillBlank.ts";
import { renderJfetDepletionPanels } from "../lib/renderers/jfetDepletionPanelsRenderer.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass += 1; } else { fail += 1; console.log("  ✗", m); } };

const mk = (o) => ({
  topic: o.topic ?? "", interpretation: o.interpretation ?? "", relatedConcepts: o.rc ?? [],
  fillInTheBlanks: o.fib ?? [], componentInventory: o.inv ?? [], subjectKey: o.subject ?? "electronics",
  topicKey: o.topicKey, circuitType: o.ct,
});

// ── 1. 감지 (실측형 요약 변형) ──────────────────────────────
const positives = [
  mk({ topic: "n채널 JFET의 V_DS에 따른 공핍층 변화",
       interpretation: "게이트-소스 전압이 0인 상태에서 V_DS를 증가시킬 때 공핍층이 드레인 쪽에서 넓어지고 핀치오프가 발생하는 과정을 설명한다.",
       rc: ["JFET", "공핍층", "핀치오프", "선형 영역", "포화 영역"] }),
  mk({ topic: "전계효과 트랜지스터 동작 영역",
       interpretation: "접합형 FET의 채널과 공핍층, 드레인 전류의 포화에 대한 설명이다.",
       rc: ["접합형 전계효과 트랜지스터", "채널", "핀치오프 전압"] }),
  mk({ topic: "JFET 특성", interpretation: "선형 동작 구간과 핀치오프에 대한 보기 ㄱ~ㄹ의 옳고 그름을 판단한다.",
       rc: ["공핍 영역", "드레인 전류"] }),
];
positives.forEach((a, i) => ok(detectJfetDepletionFillBlank(a), `positive#${i + 1} 감지 실패`));

// 3과목 분류
for (const subject of ["electronics", "circuit_theory", "digital_logic"]) {
  const a = { ...positives[0], subjectKey: subject };
  const r = classifyCircuitType(a);
  ok(r?.type === "jfet_depletion_fill_blank", `분류 ${subject} → ${r?.type}`);
}

// ── 2. 형제 양보 ────────────────────────────────────────────
const negatives = [
  ["JFET 바이어스 계산", mk({ topic: "JFET 전압 분배 바이어스 회로", interpretation: "R_1·R_2 분압으로 V_GS를 구하고 I_D를 계산하시오.", inv: [{ type: "R", value: "1MΩ" }, { type: "R", value: "500kΩ" }, { type: "V", value: "20V" }] })],
  ["BJT Early", mk({ topic: "npn BJT의 Early 효과", interpretation: "유효 베이스폭 변조와 동적 출력저항에 대한 설명이다.", rc: ["Early 전압", "베이스폭 변조"] })],
  ["MOSFET 바이어스", mk({ topic: "NMOS 바이어스", interpretation: "포화 영역에서 I_D를 구하시오.", inv: [{ type: "R", value: "10kΩ" }, { type: "V", value: "12V" }] })],
  ["다이오드 클램퍼", mk({ topic: "다이오드 클램퍼 회로", interpretation: "출력 파형을 그리시오." })],
  ["논리 게이트", mk({ topic: "조합 논리 회로 간소화", interpretation: "카르노맵으로 최소 SOP를 구하시오." })],
];
for (const [name, a] of negatives) ok(!detectJfetDepletionFillBlank(a), `negative ${name} 오탐`);

// ── 3. 값 공간 ─────────────────────────────────────────────
const { SIMILAR_SPACE: similar, VARIANT_SPACE: variant } = __spaces;
ok(similar.length >= 6, `유사 풀 부족 ${similar.length}`);
ok(variant.length >= 6, `변형 풀 부족 ${variant.length}`);
const key = (v) => `${v.vp}|${v.linearMax}|${v.vdsList.join(",")}|${v.vgsExample}`;
ok(!similar.some((s) => variant.some((v) => key(s) === key(v))), "유사/변형 풀 중첩");

// ── 4. 생성물 검증 ──────────────────────────────────────────
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let i = 0; i < 12; i += 1) {
    const g = generateJfetDepletionFillBlank({ seed: 1000 + i * 7919, index: i, mode });
    const marks = ["㉠", "㉡", "㉢", "㉣", "㉤"];
    ok(g.answers.length === 5, `${mode}#${i} 정답 5개 아님 (${g.answers.length})`);
    ok(g.answers.every((a, k) => a.mark === marks[k]), `${mode}#${i} 마커 순서`);
    // 빈칸 개수 = 정답 개수
    const body = g.items.join("\n");
    ok(marks.every((m) => body.includes(m)), `${mode}#${i} 본문에 마커 누락`);
    // ★ 정답 노출 0 — 어떤 정답 문자열도 문항 본문·조건에 등장하면 안 된다.
    //   LaTeX(\( … \))·괄호 대체표기를 벗겨 낸 **핵심어**로 검사한다(2글자 미만은 검사 생략).
    const cond = [
      `선형동작구간은 V_DS = 0 ~ ${g.values.linearMax} [V]이며, 핀치오프 전압은 V_P = ${g.values.vp} [V]`,
      `V_GS = 0 [V]`,
      `(가)~(라)의 V_DS는 각각 ${g.values.vdsList.join(", ")} [V]`,
    ].join(" / ");
    for (const a of g.answers) {
      const core = a.value.replace(/\\[()]/g, "").split("(")[0].trim();
      if (core.length < 2) continue;
      ok(!body.includes(core), `${mode}#${i} 정답이 본문에 노출: ${core}`);
      ok(!cond.includes(core), `${mode}#${i} 정답이 조건에 노출: ${core}`);
    }
    // 사실은 지식 축(그룹)마다 정확히 하나씩
    ok(g.facts.length === 5, `${mode}#${i} 사실 5개 아님`);
    ok(g.facts.every((f, k) => __spaces.GROUPED[k].includes(f)), `${mode}#${i} 축별 1개 규칙 위반`);
    // 값 무결성
    const v = g.values;
    ok(v.vdsList.length === 4 && v.vdsList.every((x, k) => k === 0 || x > v.vdsList[k - 1]), `${mode}#${i} V_DS 단조 증가 아님`);
    ok(v.vdsList[v.vdsList.length - 1] >= v.vp, `${mode}#${i} 마지막 패널이 포화 아님`);
    ok(v.vdsList[0] < v.vp, `${mode}#${i} 첫 패널이 이미 핀치오프`);
    ok(v.linearMax > 0 && v.linearMax < v.vp, `${mode}#${i} 선형구간 상한 이상`);
  }
}

// ── 4-2. 같은 index에서 유사↔변형은 빈칸 조합이 달라야 한다 ─────
for (let i = 0; i < 6; i += 1) {
  const a = generateJfetDepletionFillBlank({ seed: 5000 + i * 7919, index: i, mode: "exam_similar" });
  const b = generateJfetDepletionFillBlank({ seed: 5000 + i * 7919, index: i, mode: "exam_variant" });
  ok(a.facts.some((f, k) => f !== b.facts[k]), `index#${i} 유사/변형 빈칸 조합 동일`);
  ok(key(a.values) !== key(b.values), `index#${i} 유사/변형 값 동일`);
}

// ── 5. 파이프라인 (발문·조건·정답) ───────────────────────────
const probs = await runJfetDepletionFillBlankPipeline({ analysis: positives[0], mode: "exam_similar", count: 3 });
ok(probs.length === 3, `파이프라인 개수 ${probs.length}`);
for (const p of probs) {
  ok(/㉠/.test(p.question) && /㉤/.test(p.question), "발문에 마커 없음");
  ok(!/고르시오|고른 것은|보기 중|①|②|③/.test(`${p.content}\n${p.question}`), "객관식 잔존");
  ok((p.figureVariants ?? []).length === 1, "figure 1개 아님");
  ok(p.figureVariants[0].diagramType === "jfet_depletion_panels", "diagramType 불일치");
  ok(p.answer.split("\n").length === 5, "정답 5줄 아님");
  ok(/빈칸|들어갈|알맞은/.test(p.question), "빈칸 발문 아님");
}
// 배치 내 문항이 서로 다른가
ok(new Set(probs.map((p) => p.answer)).size === probs.length, "배치 내 정답 동일");

// ── 6. 렌더 ────────────────────────────────────────────────
for (const [vds, vp] of [[[1, 3, 5, 10], 5], [[1, 2, 4, 8], 4], [[2, 4, 6, 12], 6]]) {
  const svg = renderJfetDepletionPanels({ vdsList: vds, pinchOff: vp, vgs: 0 });
  ok(svg.startsWith("<svg"), "SVG 아님");
  ok((svg.match(/핀치오프/g) ?? []).length >= 1, "핀치오프 표시 없음");
  ok(vds.every((x) => svg.includes(`V_DS=${x}V`)), "V_DS 라벨 누락");
  ok(["(가)", "(나)", "(다)", "(라)"].every((l) => svg.includes(l)), "패널 라벨 누락");
  // 핀치오프 표시는 V_DS >= V_P 인 패널 수와 같아야
  const expect = vds.filter((x) => x >= vp).length;
  ok((svg.match(/핀치오프/g) ?? []).length === expect, `핀치오프 개수 ${expect} 아님`);
}

console.log(`\n${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
