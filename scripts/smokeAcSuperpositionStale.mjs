// AC 중첩(임용 10번) — stale circuitType 방어 + 3단계·수치 정답 검증
//   신고: 원본이 "중첩의 원리 3단계"인데 생성물은 "공진 주파수·최대 전력 전달"로 나오고
//   단계 구분도 없었다. 프론트가 캐시한 이전 분석(universal_ac 등)이 generic 경로로 흘렀기 때문.
const BASE = {
  topic: "교류 회로의 전류 및 전압 계산",
  interpretation:
    "이 문제는 교류 전압원과 전류원이 포함된 회로에서 주어진 절차에 따라 전류와 전압을 계산하는 문제입니다. 각 단계에서는 전류원 I_s를 개방하거나 전압원 V_s를 단락시켜 마디 a에서 b로 흐르는 전류를 구하고, 이를 통해 전력 계산을 수행합니다.",
  relatedConcepts: ["교류 회로", "페이저 해석", "전압원 단락", "전류원 개방", "전력 계산"],
  fillInTheBlanks: [{ sentence: "전류원을 개방했을 때 마디 a에서 b로 흐르는 전류를 구한다.", answer: "" }],
  componentInventory: [
    { type: "V", value: "20∠-90°V" }, { type: "L", value: "j5Ω" }, { type: "R", value: "5Ω" },
    { type: "R", value: "5Ω" }, { type: "I", value: "4∠0°A" }, { type: "R", value: "5Ω" }, { type: "C", value: "-j5Ω" },
  ],
  subjectKey: "circuit_theory",
};
const STALE = ["universal_ac", "dc_mesh", "topology_driven"];
let pass = 0;
for (const stale of STALE) {
  const analysis = { ...BASE, circuitType: { type: stale, params: {}, confidence: "high", reasoning: "stale 재현" } };
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "dummy", subject: "circuit_theory", mode: "exam_similar", count: 1, analysis }),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  const q = String(p?.question ?? "");
  const ans = String(p?.answer ?? "");
  // [단계 3] 문장이 "[단계 1]과 [단계 2]를 이용하여"로 앞 단계를 인용하므로 **줄 머리**만 센다.
  const steps = q.split("\n").filter((l) => /^\s*\[단계 \d\]/.test(l)).length;
  const numeric = /∠/.test(ans) && /\d/.test(ans) && !/풀이 참조/.test(ans);
  const noResonance = !/공진|최대 ?전력 ?전달/.test(q);
  const ok = r.status === 200 && steps === 3 && numeric && noResonance && (d.summary?.totalIssues ?? 1) === 0;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} stale=${stale} 단계=${steps} 수치정답=${numeric} 공진문구없음=${noResonance} issues=${d.summary?.totalIssues ?? "-"}`);
  if (!ok) console.log(`    q: ${q.replace(/\s+/g, " ").slice(0, 110)}\n    a: ${ans.replace(/\s+/g, " ").slice(0, 110)}`);
}
console.log(`${pass}/${STALE.length} ${pass === STALE.length ? "PASS" : "FAIL"}`);
process.exit(pass === STALE.length ? 0 : 1);
