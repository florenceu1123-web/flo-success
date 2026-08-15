// 임용 3번(2전원 중첩 → V_L=0 되는 I_s) 생성 API E2E — 실측 신고 회차 analysis 그대로.
//   실행: node scripts/_nullSrcE2E.mjs
const base = "http://localhost:3000";
const analysis = {
  topic: "RLC 회로의 페이저 해석",
  interpretation: "이 문제는 주어진 RLC 회로에서 페이저 전압과 전류를 구하는 문제입니다. 주어진 전압원과 인덕터 양단의 전압이 0이 될 때의 전류를 구하는 과정입니다. 페이저 해석을 통해 복소수 형태의 전압과 전류를 계산하며, 종속 전원이 포함되어 있어 이를 고려한 해석이 필요합니다.",
  relatedConcepts: ["페이저 해석", "복소수 전압", "복소수 전류", "종속 전원", "인덕턴스"],
  fillInTheBlanks: [],
  topicKey: "dependent_source",
  circuitType: { type: "universal_ac", confidence: "high" },   // ★ stale(신고 당시 값) 그대로 — 안전망 검증
  componentInventory: [
    { id: "V1", type: "V", value: "√2∠45°" }, { id: "R1", type: "R", value: "1" },
    { id: "R2", type: "R", value: "1" }, { id: "L1", type: "L", value: "j2" },
    { id: "C1", type: "C", value: "-j1" }, { id: "C2", type: "C", value: "-j1" },
    { id: "I1", type: "I", value: "i_s" },
  ],
};

for (const mode of ["exam_similar", "exam_variant"]) {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=", subject: "circuit_theory", mode, count: 1, analysis }),
  });
  const j = await res.json();
  const p = j.problems?.[0];
  if (!p) { console.log(`[${mode}] ✗ ${res.status} ${JSON.stringify(j).slice(0, 300)}`); continue; }
  console.log(`\n══════ ${mode} ══════`);
  console.log("figure :", p.figureVariants.map((f) => f.diagramType).join(", "));
  console.log("본문   :", p.content);
  console.log("질문   :\n" + p.question);
  console.log("정답   :\n" + p.answer);
  console.log("풀이   :\n" + p.solution);
}
