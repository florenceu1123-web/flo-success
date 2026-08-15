// 임용 24번 — Maxwell 방정식 개념 빈칸 채우기 (maxwell_concept_fill_blank), ★그림 없음★
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { __spaces, generateMaxwellConceptFillBlank, matchesMaxwellConceptFillBlank }
  from "../lib/generation/topologies/maxwellConceptFillBlank.ts";
import { detectMaxwellConceptFillBlank, runMaxwellConceptFillBlankPipeline }
  from "../lib/pipeline/runMaxwellConceptFillBlankPipeline.ts";
import { isPrincipleNamingAnalysis } from "../lib/analysis/deviceIdentity.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv, tags: [], learningObjective: {} });
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });

const POS = [
  ["실측 요약", mk("Maxwell 방정식에 대한 설명",
    "Maxwell 방정식에서 변위전류밀도, 전류 연속방정식, 유도 기전력, 도체 내 표피 깊이(skin depth)에 대한 설명 중 옳은 것을 고르는 문제이다.",
    ["Maxwell 방정식", "변위전류"], inv())],
  ["미분형 언급", mk("맥스웰 방정식의 미분형",
    "네 가지 방정식의 미분형과 회전·발산의 의미를 설명한다.", [], inv())],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesMaxwellConceptFillBlank(a) === true);
  ok(`안전망: ${n}`, detectMaxwellConceptFillBlank(a) === true);
  for (const s of ["electromagnetics", "circuit_theory"]) {
    ok(`분류 ${s}: ${n}`, classifyCircuitType({ ...a, subjectKey: s }, s)?.type === "maxwell_concept_fill_blank",
      `got ${classifyCircuitType({ ...a, subjectKey: s }, s)?.type}`);
  }
  // ★ 개념 명칭형보다 앞이어야 한다 — 그쪽이 먼저 잡으면 route에서 가로챈다.
  ok(`개념 명칭형이 잡아도 분류는 우선 (${n})`, classifyCircuitType({ ...a, subjectKey: "electromagnetics" }, "electromagnetics")?.type === "maxwell_concept_fill_blank");
  void isPrincipleNamingAnalysis;
}
const NEG = [
  ["EM 계산 (면전하+선전하)", mk("면전하와 선전하의 합성 전계", "합성 전계가 0이 되는 선전하밀도를 구하시오.", [], inv())],
  ["EM 계산 (표피깊이 수치)", mk("도체의 표피 깊이 계산", "도전율과 투자율이 주어질 때 표피 깊이를 구하시오. 단위는 [m]이다.", [], inv())],
  ["회로", mk("RLC 회로의 정상상태", "Maxwell 방정식과 무관한 회로 해석으로 커패시터 전압을 구한다.", [], inv("R", "L", "C"))],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesMaxwellConceptFillBlank(a) === false);
  ok(`양보(분류) ${n}`, classifyCircuitType({ ...a, subjectKey: "electromagnetics" }, "electromagnetics")?.type !== "maxwell_concept_fill_blank");
}

// 사실 표 무결성 — 모든 문장에 {} 자리가 있고 정답이 비어 있지 않아야 한다
{
  let bad = 0;
  for (const f of __spaces.FACTS) { if (!f.sentence.includes("{}") || !f.answer || !f.why) bad++; }
  ok("사실 표 무결성", bad === 0, `${bad}건`);
  ok("사실 수 충분", __spaces.FACTS.length >= 8, `${__spaces.FACTS.length}`);
  ok("값 공간 충분", __spaces.SPACE.length >= 10, `${__spaces.SPACE.length}`);
}

// 원본 4지식점이 모두 표에 있는가 (유형 보존)
{
  const all = __spaces.FACTS.map((f) => f.sentence + f.answer).join(" ");
  ok("원본 ㄱ 지식점(전도 vs 변위)", /전도전류밀도/.test(all));
  ok("원본 ㄴ 지식점(연속방정식)", /연속방정식/.test(all));
  ok("원본 ㄷ 지식점(면적 변화)", /단면적/.test(all));
  ok("원본 ㄹ 지식점(표피 깊이)", /표피\s*깊이/.test(all));
}

// 생성물 검사
let dupBad = 0, blankBad = 0, checked = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 12; seed++) {
    const g = generateMaxwellConceptFillBlank({ seed: seed * 7919, index: seed % 3, mode });
    checked++;
    // 빈칸 5개, 마크 중복 없음, 사실 중복 없음
    if (new Set(g.values.picks).size !== 5) dupBad++;
    if (g.items.length !== 5 || g.answers.length !== 5) blankBad++;
    for (let i = 0; i < 5; i++) if (!g.items[i].includes(g.answers[i].mark)) blankBad++;
    // 정답 문자열이 문항에 노출되면 안 된다
    for (const a of g.answers) if (g.items.join(" ").includes(a.value)) blankBad++;
  }
}
ok("사실 중복 없음", dupBad === 0);
ok("빈칸·정답 대응", blankBad === 0, `${blankBad}건`);

const CHOICE = /[①②③④⑤]|고르시오|고른\s*것은|있는\s*대로/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runMaxwellConceptFillBlankPipeline({ analysis: null, mode, count: 1, topicKey: "em_wave" });
  ok(`빈칸 5개 (${mode})`, ["㉠", "㉡", "㉢", "㉣", "㉤"].every((m) => p.content.includes(m) && p.question.includes(m)));
  ok(`객관식 아님 (${mode})`, !CHOICE.test(p.question) && !CHOICE.test(p.content));
  ok(`그림 없음 (${mode})`, (p.figureVariants ?? []).length === 0);
  ok(`〈보기〉 5항목 (${mode})`, ["ㄱ.", "ㄴ.", "ㄷ.", "ㄹ.", "ㅁ."].every((k) => p.content.includes(k)));
  ok(`정답 5줄 (${mode})`, p.answer.split("\n").filter((l) => l.trim()).length === 5);
  ok(`풀이에 근거 (${mode})`, p.solution.includes("·"));
  ok(`기호 정의 조건 (${mode})`, p.conditions.some((c) => c.includes("전속밀도")));
}
console.log(`\n${fail === 0 ? "✅" : "❌"} maxwell_concept_fill_blank smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
