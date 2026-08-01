// t=0 스위치 개방 RC (임용 2번) — stale circuitType 방어 안전망 검증
//
//   사용자 신고: 원본(5V+1Ω ∥ 4A ─SW─ 2.5F ∥ 2Ω, v_c(0⁻)·v_o(t))인데
//   생성 결과가 generic netlist(C가 직렬로 그려지고 v_c(0⁻) 소문항 소실)였다.
//   fresh 분석은 3/3 switched_rc_dc_transient로 정상 → 프론트가 캐시한
//   stale circuitType이 generate로 넘어간 경우. route 재검출 안전망으로 교정한다.
//
//   기대: stale(transient_rc)로 보내도 전용 figure(switched_rc_dc_circuit) + 2단계 발문.
const BASE = {
  topic: "t=0 스위치 개방 RC 회로의 과도응답",
  interpretation:
    "t=0에서 스위치가 개방되는 RC 회로이다. t<0에서 회로는 직류 정상 상태로 가정하며, 커패시터 전압의 초깃값 v_c(0⁻)를 구하고 t≥0에서 전압 v_o(t)를 구한다.",
  relatedConcepts: ["RC 과도응답", "정상 상태", "방전", "시정수"],
  fillInTheBlanks: [
    { sentence: "t<0에서 커패시터는 개방으로 보고 v_c(0⁻)를 구한다.", answer: "정상 상태" },
  ],
  componentInventory: [
    { type: "V", value: "5V" },
    { type: "R", value: "1Ω" },
    { type: "I", value: "4A" },
    { type: "SW" },
    { type: "C", value: "2.5F" },
    { type: "R", value: "2Ω" },
  ],
  subjectKey: "circuit_theory",
};

const STALE_TYPES = ["transient_rc", "switched_rc", "topology_driven"];
let pass = 0;
for (const stale of STALE_TYPES) {
  const analysis = {
    ...BASE,
    circuitType: { type: stale, params: {}, confidence: "high", reasoning: "stale(프론트 state 캐시 재현)" },
  };
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "dummy", subject: "circuit_theory", mode: "exam_similar", count: 1, analysis }),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  const figs = (p?.figureVariants ?? []).map((f) => f.diagramType).join(",");
  const q = String(p?.question ?? "");
  const ok =
    r.status === 200 &&
    figs.includes("switched_rc_dc_circuit") &&
    /v_c\(0/.test(q) &&
    /v_o\(t\)/.test(q) &&
    (d.summary?.totalIssues ?? 1) === 0;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} stale=${stale} → figs=[${figs || "none"}] issues=${d.summary?.totalIssues ?? "-"}`);
  console.log(`    question: ${q.replace(/\s+/g, " ").slice(0, 120)}`);
}
// ── 음성 케이스 — 형제 유형을 가로채면 안 된다(감지기 직접 호출).
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSwitchedRcStale.mjs
const { detectSwitchedRcDcTransient } = await import("../lib/pipeline/runSwitchedRcDcTransientPipeline.ts");
const NEGATIVE = [
  {
    name: "테브난 등가 + 점선박스 RC (thevenin_switched_rc 소관)",
    a: {
      ...BASE,
      topic: "테브난 등가회로를 이용한 스위치 RC 과도응답",
      interpretation:
        "점선 박스 부분을 테브난 등가회로로 바꾼 뒤, t=0에서 스위치가 동작하는 RC 회로의 v_c(0⁻)와 정상 상태를 구한다.",
    },
  },
  {
    name: "스위치 RL (인덕터 — RC 아님)",
    a: {
      ...BASE,
      topic: "t=0 스위치 RL 회로의 과도응답",
      interpretation: "t=0에서 스위치가 개방되는 RL 회로에서 인덕터 전류의 초깃값과 정상 상태를 구한다.",
      componentInventory: [
        { type: "V", value: "5V" }, { type: "R", value: "1Ω" },
        { type: "I", value: "4A" }, { type: "SW" }, { type: "L", value: "3H" },
      ],
    },
  },
  {
    name: "교류 전원 RC (중첩·페이저 계열)",
    a: {
      ...BASE,
      topic: "교류 전원을 갖는 RC 회로",
      interpretation: "교류 전원 v(t)=10√2 cos(ωt)와 직류 전원이 있는 RC 회로에서 정상 상태 전류를 중첩의 원리로 구한다.",
    },
  },
];
let negPass = 0;
for (const c of NEGATIVE) {
  const got = detectSwitchedRcDcTransient(c.a);
  const ok = got === false;
  if (ok) negPass++;
  console.log(`${ok ? "✓" : "✗"} [음성] ${c.name} → 감지=${got}`);
}

const total = STALE_TYPES.length + NEGATIVE.length;
const allPass = pass + negPass;
console.log(`${allPass}/${total} ${allPass === total ? "PASS" : "FAIL"}`);
process.exit(allPass === total ? 0 : 1);
