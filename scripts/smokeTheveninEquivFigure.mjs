// generic thevenin 경로가 (나) 등가회로 figure를 내는지 확인
//   신고: missing_figure_variant: equivalent_circuit (or thevenin_equivalent/norton_equivalent)
//   원인: runTheveninPipeline이 (가) 1개만 냈는데, 테브난 문제는 equivalent_circuit role이 필수.
const analysis = {
  topic: "테브난 등가회로",
  interpretation: "단자 a-b에서 본 테브난 등가회로(V_th, R_th)를 구하는 문제. 전압원과 저항 2개로 구성된 분압 회로.",
  relatedConcepts: ["테브난 등가", "등가회로", "V_th", "R_th"],
  fillInTheBlanks: [{ sentence: "단자 a-b의 테브난 등가 전압 V_th를 구하시오.", answer: "" }],
  componentInventory: [{ type: "V", value: "10V" }, { type: "R", value: "4Ω" }, { type: "R", value: "6Ω" }],
  subjectKey: "circuit_theory",
  circuitType: { type: "thevenin", params: {}, confidence: "high", reasoning: "smoke" },
};
let pass = 0;
const MODES = ["exam_similar", "exam_variant"];
for (const mode of MODES) {
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "dummy", subject: "circuit_theory", mode, count: 1, topicKey: "dc_resistive", analysis }),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  const roles = (p?.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`);
  const issues = (d.validations ?? []).flatMap((v) => [...(v.problem?.issues ?? []), ...(v.figures?.issues ?? [])]);
  const missing = issues.filter((i) => i.rule === "missing_figure_variant");
  const ok = r.status === 200 && roles.some((x) => x.startsWith("equivalent_circuit")) && missing.length === 0;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${mode} figs=[${roles.join(", ")}] missing_figure_variant=${missing.length} totalIssues=${d.summary?.totalIssues ?? "-"}`);
  if (issues.length) console.log(`    이슈: ${issues.map((i) => i.rule).join(", ")}`);
}
console.log(`${pass}/${MODES.length} ${pass === MODES.length ? "PASS" : "FAIL"}`);
process.exit(pass === MODES.length ? 0 : 1);
