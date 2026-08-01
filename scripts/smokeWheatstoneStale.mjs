// 신고 재현 E2E — 실측 로그와 동일한 analysis(stale circuitType=dc_nodal + inventory 8개)를 그대로
// /api/generate에 보내, 전용 브리지 archetype으로 교정되는지 확인한다. (Vision 호출 없음 = 비용 0)
//
//   실행: node scripts/smokeWheatstoneStale.mjs   (dev 서버 필요)
const BASE = "http://localhost:3000/api/generate";

// ★ 실측 로그(.next/dev/logs/next-development.log)에 남아 있던 값 그대로.
const analysis = {
  topic: "휘트스톤 브리지 회로 해석",
  interpretation:
    "이 문제는 휘트스톤 브리지 회로에서 평형 조건을 만족시키는 저항 R_x의 값을 구하고, 이때의 출력 전압 V_o를 계산하는 문제입니다. 휘트스톤 브리지는 두 개의 저항 분압기 회로로 구성되며, 평형 상태에서는 두 분압기의 전압이 같아야 합니다.",
  relatedConcepts: ["휘트스톤 브리지", "평형 조건", "저항 분압", "출력 전압"],
  fillInTheBlanks: [],
  componentInventory: [
    { id: "V1", type: "V", value: "22V", pins: ["n1", "GND"] },
    { id: "R1", type: "R", value: "4Ω", pins: ["n1", "n2"] },
    { id: "R2", type: "R", value: "4Ω", pins: ["n2", "n3"] },
    { id: "R3", type: "R", value: "15Ω", pins: ["n2", "n4"] },
    { id: "R4", type: "R", value: "5Ω", pins: ["n3", "n4"] },
    { id: "R5", type: "R", value: "12Ω", pins: ["n3", "GND"] },
    { id: "R6", type: "R", value: "6Ω", pins: ["n3", "GND"] },
    { id: "R7", type: "R", value: "6Ω", pins: ["n4", "GND"] },
  ],
  // ★ 버그 재현 핵심: 프론트가 캐시해 보내던 stale 분류 (로그 실측값).
  circuitType: { type: "dc_nodal", params: {}, confidence: "low", reasoning: "dc_resistive 단순회로 → dc_nodal fallback" },
  semantic: { hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: false, requiresMultiFigure: false },
  topicKey: "dc_resistive",
  // topology_driven을 부르던 branches(8) — 재현 조건 유지.
  topologySignature: {
    features: { hasSwitch: false, hasDependentSource: false, hasGround: true, hasSupermesh: false, hasMesh: true, meshCount: 1 },
    branches: Array.from({ length: 8 }, (_, i) => ({ id: `br${i}` })),
  },
};

let fail = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  // ★ 과목 오선택까지 함께 검증 (0-PRE는 subject 무관이어야 한다).
  for (const subject of ["circuit_theory", "electronics"]) {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "dummy", subject, mode, count: 1, analysis, semantic: analysis.semantic }),
    });
    const json = await res.json();
    const p = json.problems?.[0];
    const figs = (p?.figureVariants ?? []).map((f) => `${f.role}/${f.diagramType}`).join(",");
    const issues = json.summary?.totalIssues ?? "?";
    const okFig = figs.includes("dc_wheatstone_balance_circuit");
    const okAns = /R_x\s*=\s*\d+\s*Ω/.test(p?.answer ?? "") && /V_o\s*=\s*\d+\s*V/.test(p?.answer ?? "");
    const okIssues = issues === 0;
    const good = res.status === 200 && okFig && okAns && okIssues;
    if (!good) fail++;
    console.log(`${good ? "✅" : "❌"} [${res.status}] ${subject}/${mode} issues=${issues}`);
    console.log(`   figs: ${figs || "(없음)"}`);
    console.log(`   ans : ${(p?.answer ?? "").replace(/\n/g, " | ")}`);
    console.log(`   q   : ${(p?.question ?? "").replace(/\n/g, " | ").slice(0, 160)}`);
  }
}
console.log(fail === 0 ? "\n결과: 4/4 통과 (stale dc_nodal → dc_wheatstone_balance 교정)" : `\n결과: ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
