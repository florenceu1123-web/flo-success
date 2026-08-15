/**
 * 임용 3번 회로이론(2전원 중첩 → V_L=0 되는 전류원 역산) 원본으로 유사문제 생성.
 * analysis는 이 원본의 실측 Vision 요약(smokeOriginalRouting과 동일)을 그대로 쓴다.
 *
 * 실행: dev 서버 기동 상태에서  node scripts/_genNullSource.mjs [exam_similar|exam_variant] [count]
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const mode = process.argv[2] ?? "exam_similar";
const count = Number(process.argv[3] ?? 1);

const analysis = {
  topic: "RLC 회로의 페이저 해석",
  interpretation:
    "이 문제는 주어진 RLC 회로에서 페이저 전압과 전류를 구하는 문제입니다. 주어진 전압원과 " +
    "인덕터 양단의 전압이 0이 될 때의 전류원을 구하는 과정입니다. 페이저 해석을 통해 복소수 " +
    "형태의 전압과 전류를 계산하며, 중첩의 원리를 이용해 전류원이 개방된 경우와 전압원이 " +
    "단락된 경우를 각각 해석한다.",
  relatedConcepts: ["페이저 해석", "중첩의 원리", "복소수 전압", "복소수 전류", "인덕턴스"],
  fillInTheBlanks: [],
  componentInventory: [
    { id: "c0", type: "V", value: "√2∠45°" },
    { id: "c1", type: "R", value: "1" },
    { id: "c2", type: "R", value: "1" },
    { id: "c3", type: "L", value: "j2" },
    { id: "c4", type: "C", value: "-j1" },
    { id: "c5", type: "C", value: "-j1" },
    { id: "c6", type: "I", value: "i_s" },
  ],
  tags: [],
  learningObjective: {},
};

const res = await fetch(`${BASE}/api/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    image: "data:image/png;base64,placeholder",
    subject: "circuit_theory",
    mode,
    count,
    analysis,
  }),
});
const data = await res.json();
if (!res.ok || data.error) {
  console.error(`HTTP ${res.status} — ${data.error ?? "(no error field)"}`);
  process.exit(1);
}

for (const [i, p] of (data.problems ?? []).entries()) {
  console.log(`\n${"=".repeat(72)}\n[${mode}] 문제 ${i + 1}\n${"=".repeat(72)}`);
  console.log(`\n【본문】\n${p.content}`);
  if (p.conditions?.length) console.log(`\n【조건】\n- ${p.conditions.join("\n- ")}`);
  console.log(`\n【문항】\n${p.question}`);
  console.log(`\n【정답】\n${p.answer}`);
  console.log(`\n【풀이】\n${p.solution}`);
  console.log(
    `\n【figure】 ${(p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", ") || "없음"}`,
  );
}
const issues = data.summary?.totalIssues;
console.log(`\n--- 검증: issues=${issues ?? "?"} ---`);
