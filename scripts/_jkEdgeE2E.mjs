// JK 카운터 (임용 6번) — 생성 API E2E (결정론 파이프라인이라 GPT 호출 없음).
//   실행: node scripts/_jkEdgeE2E.mjs
const base = "http://localhost:3000";

const mkAnalysis = (interpretation) => ({
  topic: "JK 플립플롭 동기식 카운터 분석",
  interpretation,
  relatedConcepts: ["JK 플립플롭", "동기식 카운터", "상태 전이", "타이밍 도표"],
  fillInTheBlanks: [],
  topicKey: "flipflop_counter",
  circuitType: { type: "jk_sync_counter", confidence: "high" },
  componentInventory: [],
});

const CASES = [
  ["에지 언급 없음(기본값=원본 하강)", "JK 플립플롭 3개로 구성된 동기식 카운터 회로의 상태도를 작성한다."],
  ["하강 에지 명시", "클럭 펄스 CP의 하강 에지에서 세 플립플롭이 동시에 트리거된다."],
  ["상승 에지 명시", "클럭 펄스 CP의 상승 에지에서 세 플립플롭이 동시에 트리거된다."],
];

for (const [name, interp] of CASES) {
  for (const mode of ["exam_similar", "exam_variant"]) {
    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: "data:image/png;base64,iVBORw0KGgo=",
        subject: "digital_logic",
        mode, count: 1,
        analysis: mkAnalysis(interp),
        topicKey: "flipflop_counter",
      }),
    });
    const j = await res.json();
    const p = j.problems?.[0];
    if (!p) { console.log(`[${name}/${mode}] ✗ 실패: ${res.status} ${JSON.stringify(j).slice(0, 200)}`); continue; }
    const circ = p.figureVariants.find((f) => f.diagramType === "jk_state_machine_circuit");
    const wf = p.figureVariants.find((f) => f.role === "solution_waveform");
    const q0 = wf?.diagram?.signals?.find((s) => s.name === "Q0");
    const trans = [];
    for (let i = 1; i < (q0?.samples?.length ?? 0); i++) {
      if (q0.samples[i].v !== q0.samples[i - 1].v) trans.push(q0.samples[i].t);
    }
    const parity = trans.length === 0 ? "-" : trans.every((t) => t % 2 === 1) ? "하강(홀수 t)" : trans.every((t) => t % 2 === 0) ? "상승(짝수 t)" : "혼재!";
    console.log(`[${name}/${mode}] edge=${circ?.diagram?.clockEdge} · Q0 전이=${parity} · issues=${j.validation?.totalIssues ?? "?"}`);
    console.log(`   조건: ${p.conditions[0]}`);
  }
}
