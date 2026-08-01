// GPT생성유형(gpt_generated) 모드 E2E 스모크. 실행 중인 dev 서버(3000)에 요청.
// 1x1 투명 PNG (route가 image 존재만 요구, gpt_free는 analysis만 사용).
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const base = process.env.BASE ?? "http://localhost:3000";

async function run(subject, analysis) {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image: PNG_1x1,
      subject,
      mode: "gpt_generated",
      count: 2,
      analysis,
      topicKey: analysis.topicKey,
    }),
  });
  const json = await res.json();
  console.log(`\n===== ${subject} (HTTP ${res.status}) =====`);
  if (!res.ok) {
    console.log("ERROR:", json.error);
    return false;
  }
  console.log("mode:", json.mode, "| problems:", json.summary?.problems, "| totalIssues:", json.summary?.totalIssues);
  const p = json.problems?.[0];
  if (p) {
    console.log("Q1 content:", (p.content ?? "").slice(0, 120));
    console.log("Q1 question:", (p.question ?? "").slice(0, 120));
    console.log("Q1 answer:", (p.answer ?? "").slice(0, 80));
    console.log("figureVariants:", (p.figureVariants ?? []).length);
  }
  return res.ok && json.summary?.problems > 0;
}

const cases = [
  ["circuit_theory", {
    topic: "테브난 등가회로와 최대전력 전달",
    interpretation: "저항 회로에서 부하에 전달되는 최대 전력을 구하기 위해 테브난 등가회로를 구한다.",
    relatedConcepts: ["테브난 정리", "최대전력전달정리", "등가저항"],
    topicKey: "mesh_analysis",
  }],
  ["electronics", {
    topic: "반전 증폭기 이득 계산",
    interpretation: "연산증폭기 반전 증폭기의 전압 이득을 저항비로 구한다.",
    relatedConcepts: ["가상 단락", "반전 증폭기", "전압 이득"],
    topicKey: "opamp",
  }],
];

let allOk = true;
for (const [subject, analysis] of cases) {
  const ok = await run(subject, analysis);
  allOk = allOk && ok;
}
console.log("\n==== RESULT:", allOk ? "PASS" : "FAIL", "====");
process.exit(allOk ? 0 : 1);
