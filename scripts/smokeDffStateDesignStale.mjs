// D-FF 상태도 설계(임용 9번) — stale circuitType 방어 안전망 검증
//   신고: 원본인데 generic FSM(입력 X·출력 Z 날조) 문제가 생성됨.
//   분류기는 고쳤지만 프론트가 캐시한 stale analysis도 방어해야 한다.
const BASE = {
  topic: "상태 전이도와 D 플립플롭",
  interpretation:
    "상태 전이도를 기반으로 D 플립플롭 2개와 논리 게이트를 사용하여 순서 논리 회로를 설계하는 문제이다. 상태도(가), 상태표(나)의 빈칸과 회로(다)의 게이트를 구한다.",
  relatedConcepts: ["상태 전이도", "D 플립플롭", "상태표", "순차 회로", "논리 게이트", "Mealy 머신"],
  fillInTheBlanks: [{ sentence: "상태표에서 ㉠~㉣에 들어갈 다음 상태를 구하시오.", answer: "" }],
  componentInventory: [],
  subjectKey: "digital_logic",
};
const STALE = ["fsm", "sequential_dff_generic", "universal_digital"];
let pass = 0;
for (const stale of STALE) {
  const analysis = { ...BASE, circuitType: { type: stale, params: {}, confidence: "high", reasoning: "stale 재현" } };
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "dummy", subject: "digital_logic", mode: "exam_similar", count: 1, analysis }),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  const figs = (p?.figureVariants ?? []).map((f) => f.diagramType).join(",");
  const q = String(p?.question ?? "");
  const ok = r.status === 200 && figs.includes("dff_state_design_circuit") && !/입력\s*x|출력\s*z/i.test(q)
    && (d.summary?.totalIssues ?? 1) === 0;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} stale=${stale} → figs=[${figs || "none"}] issues=${d.summary?.totalIssues ?? "-"}`);
}
console.log(`${pass}/${STALE.length} ${pass === STALE.length ? "PASS" : "FAIL"}`);
process.exit(pass === STALE.length ? 0 : 1);
