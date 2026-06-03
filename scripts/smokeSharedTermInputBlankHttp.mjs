// 공유항·입력결정 (sharedTermInputBlank) HTTP smoke — 임용 7번 다중함수 공유항 형식.
// dev 서버 필요 (localhost:3000). 분석 mock을 /api/generate에 직접 POST.
const BODY = {
  image: "dummy", subject: "digital_logic", mode: "exam_similar", count: 1, topicKey: "kmap_sop",
  analysis: {
    topic: "다중 불 함수 카르노맵 최소화와 조합논리회로 입력 결정",
    interpretation:
      "식 (가)는 3개의 입력변수(X, Y, Z)를 공통으로 갖는 2개의 불 함수 F(X, Y, Z) = Σm(2, 4, 5), " +
      "G(X, Y, Z) = Σm(2, 6, 7)이고, 그림 (나)는 3입력변수 카르노 도(Karnaugh map)에 대한 표현이다. " +
      "그림 (다)는 (가)를 1개의 조합논리회로로 구성한 것이다. " +
      "[단계 2] 카르노 도에서 중복되는 논리식 항을 구한다. " +
      "[단계 3] (다)의 ㉠, ㉡, ㉢에 들어갈 입력변수를 순서대로 구한다.",
    relatedConcepts: ["카르노 맵", "최소화", "불 함수", "조합논리회로", "중복 항"],
    fillInTheBlanks: [
      { sentence: "[단계 2] 카르노 도에서 중복되는 논리식 항을 구한다.", answer: "" },
      { sentence: "[단계 3] (다)의 ㉠, ㉡, ㉢에 들어갈 입력변수를 순서대로 구한다.", answer: "" },
    ],
    subjectKey: "digital_logic",
    topicKey: "kmap_sop",
    circuitType: {
      type: "universal_digital",
      params: { sharedTermInputBlank: true },
      confidence: "high",
      reasoning: "smoke",
    },
    signals: { inputs: ["X", "Y", "Z"], outputs: ["F", "G"] },
    semantic: { hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: false, requiresMultiFigure: true },
  },
};

const r = await fetch("http://localhost:3000/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(BODY),
});
console.log(`HTTP ${r.status}`);
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const data = await r.json();
const p = data.problems?.[0];
console.log("question:", (p?.question ?? "").replace(/\n/g, " / "));
console.log("answer:", (p?.answer ?? "").replace(/\n/g, " / "));
const figs = p?.figureVariants ?? [];
for (const f of figs) console.log(`  - ${f.role} (${f.diagramType}): ${f.label}`);

const checks = [
  ["problem returned", Boolean(p)],
  ["totalIssues = 0", data.summary?.totalIssues === 0],
  ["방향: 중복되는 항", p?.question?.includes("중복되는")],
  ["방향: 입력변수 결정", p?.question?.includes("입력변수")],
  ["방향: 출력 합성 아님", !p?.question?.includes("multi-stage")],
  ["빈 K-map figure", figs.some((f) => f.diagramType === "kmap")],
  ["입력 빈칸 회로 figure", figs.some((f) => f.diagramType === "logic_network")],
  ["정답 ㉠ 매핑", p?.answer?.includes("㉠")],
];
let fail = 0;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) fail++;
}
process.exit(fail > 0 ? 1 : 0);
