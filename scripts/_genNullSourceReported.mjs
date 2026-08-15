/**
 * 신고 회차(영 조건이 요약에서 사라진 실측 analyze 결과)로 실제 /api/generate 를 호출해
 * 전용 archetype으로 라우팅되는지 확인한다. — dev 서버 기동 필요.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const analysis = {
  topic: "RLC 회로의 페이저 해석",
  topicKey: "rlc_response",
  interpretation:
    "이 문제는 주파수 영역에서 RLC 회로의 페이저 해석을 통해 페이저 전류 I_S를 구하는 문제입니다. " +
    "주어진 회로에서 페이저 전압원 V_S와 인덕터 양단의 전압 V_L이 주어졌을 때, 회로의 페이저 전류 I_S를 " +
    "해석 절차에 따라 단계적으로 구해야 합니다. 각 단계에서는 회로의 조건에 따라 전압과 전류를 계산하여 최종적으로 I_S를 구합니다.",
  relatedConcepts: ["페이저 해석", "복소수 전압", "복소수 전류", "인덕턴스"],
  fillInTheBlanks: [],
  componentInventory: [
    { id: "V1", type: "V", value: "√2∠45°V" },
    { id: "L1", type: "L", value: "j2Ω" },
    { id: "C1", type: "C", value: "-j1Ω" },
    { id: "R1", type: "R", value: "1Ω" },
    { id: "R2", type: "R", value: "1Ω" },
    { id: "C2", type: "C", value: "-j1Ω" },
    { id: "I1", type: "I", value: "Is[A]" },
  ],
  tags: [],
  learningObjective: {},
};

for (const mode of ["exam_similar", "exam_variant"]) {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: "data:image/png;base64,placeholder",
      subject: "circuit_theory",
      mode,
      count: 1,
      analysis,
    }),
  });
  const data = await res.json();
  const p = (data.problems ?? [])[0];
  const figures = (p?.figureVariants ?? []).map((f) => f.diagramType).join(",");
  console.log(
    `[${mode}] HTTP ${res.status} · figure=${figures || "없음"} · issues=${data.summary?.totalIssues ?? "?"}`,
  );
  console.log(`  본문: ${(p?.content ?? "").slice(0, 70)}…`);
  console.log(`  정답: ${(p?.answer ?? "(없음)").replace(/\n/g, " | ")}\n`);
}
