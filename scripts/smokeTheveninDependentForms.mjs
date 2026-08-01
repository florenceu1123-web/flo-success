// 종속전원 + 테브난 + 최대전력 — 원본 형식(그래프 유무)에 따라 구조가 달라지는지 검증
//   신고: 임용 7번(종속 전류원 2i, 그래프 없음, V_oc/I_sc 3단계) 원본이
//   (1) "2i"를 종속원으로 못 읽어 generic max_power로 가서 회로가 깨지고,
//   (2) 전용 경로로 보내도 임용 9번 형식(V-I 그래프 + "R 구하기")으로 나왔다.
const base = {
  componentInventory: [
    { type: "V", value: "25V" }, { type: "R", value: "10Ω" },
    { type: "R", value: "5Ω" }, { type: "I", value: "2i" }, { type: "R", value: "3Ω" },
  ],
  subjectKey: "circuit_theory",
};
const CASES = [
  {
    name: "그래프 없는 원본 (임용 7번류) → figure 1개·V_oc 3단계",
    analysis: {
      ...base,
      topic: "독립 전압원과 종속 전류원이 포함된 회로의 최대전력",
      interpretation: "마디 a-b 개방 시 전압 V_oc, 단락 시 전류 I_sc를 구하고, 부하 R_L에 최대 전력이 전달되는 R_L과 P_L을 구하는 문제.",
      relatedConcepts: ["테브난 등가", "최대전력 전달", "종속 전류원"],
      fillInTheBlanks: [{ sentence: "a-b 개방 시 V_oc를 구한다.", answer: "" }],
      circuitType: { type: "thevenin_dependent_generic", params: {}, confidence: "high", reasoning: "smoke" },
    },
    wantGraph: false,
  },
  {
    name: "그래프 있는 원본 (임용 9번류) → figure 2개·그래프 유지",
    analysis: {
      ...base,
      topic: "종속전원 회로의 테브난 등가와 V-I 그래프",
      interpretation: "그림 (나)의 V_RL–I_RL 직선(절편 V_th, I_sc)을 이용해 가변 저항 R을 구하고, I_sc와 최대전력 P_L을 구하는 문제.",
      relatedConcepts: ["V-I 그래프", "테브난", "최대전력"],
      fillInTheBlanks: [{ sentence: "그래프의 절편으로 R을 구한다.", answer: "" }],
      circuitType: { type: "thevenin_dependent_generic", params: {}, confidence: "high", reasoning: "smoke" },
    },
    wantGraph: true,
  },
];
let pass = 0;
for (const c of CASES) {
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "dummy", subject: "circuit_theory", mode: "exam_similar", count: 1, analysis: c.analysis }),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  const types = (p?.figureVariants ?? []).map((f) => f.diagramType);
  const hasGraph = types.includes("vi_line_graph");
  const comps = (p?.figureVariants?.[0]?.diagram?.components ?? []);
  const hasDep = comps.some((x) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(String(x.type)));
  const q = String(p?.question ?? "");
  const stepsOk = c.wantGraph ? /그래프/.test(q) : (/V_oc|개방/.test(q) && !/그래프/.test(q));
  const ok = r.status === 200 && hasGraph === c.wantGraph && hasDep && stepsOk && (d.summary?.totalIssues ?? 1) === 0;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}`);
  console.log(`    figs=[${types.join(", ")}] 종속원=${hasDep} 발문일치=${stepsOk} issues=${d.summary?.totalIssues ?? "-"}`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
