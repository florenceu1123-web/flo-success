// GPT생성유형 — 핵심·인접 개념 확장 확인 (제너 항복 → 전자사태 항복 등).
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const base = process.env.BASE ?? "http://localhost:3000";

const analysis = {
  topic: "제너 다이오드 항복 현상",
  interpretation: "역방향 전압이 커지면 제너 항복이 일어나 전압을 일정하게 유지한다.",
  relatedConcepts: ["제너 항복", "역방향 바이어스", "전압 조정"],
  topicKey: "diode",
};

const res = await fetch(`${base}/api/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    image: PNG_1x1, subject: "electronics", mode: "gpt_generated",
    count: 3, analysis, topicKey: analysis.topicKey,
  }),
});
const json = await res.json();
console.log(`HTTP ${res.status} | problems ${json.summary?.problems} | issues ${json.summary?.totalIssues}\n`);
(json.problems ?? []).forEach((p, i) => {
  console.log(`--- Q${i + 1} ---`);
  console.log("content :", (p.content ?? "").slice(0, 160));
  console.log("question:", (p.question ?? "").slice(0, 140));
  console.log("answer  :", (p.answer ?? "").slice(0, 120));
  console.log();
});
