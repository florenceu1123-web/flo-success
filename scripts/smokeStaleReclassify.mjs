// ★ stale analysis 일반 방어 — generate가 캐시된 circuitType을 재분류로 교정하는지 검증
//   (archetype마다 안전망을 붙이던 것을 대체하는 조치. API 호출 없이 분류기만 검증.)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeStaleReclassify.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

// 실제로 이 세션에서 stale 때문에 샜던 유형들의 분석 텍스트(요약본)
const CASES = [
  {
    name: "얇은 요약 — L[H] 기호만, 파형 언급",
    subject: "circuit_theory",
    expect: "inductor_ramp_slope",
    a: {
      topic: "RL 회로",
      interpretation: "스위치를 닫은 후 인덕터 전류 i(t)가 그림과 같이 주어질 때 L[H]을 구하고 t=4[s]의 인덕터 전압을 구한다.",
      relatedConcepts: ["인덕터", "전류 파형"],
      componentInventory: [{ type: "V" }, { type: "SW" }, { type: "R" }, { type: "L" }],
    },
  },
  {
    name: "임용2 i(t) 램프 → L 도출",
    subject: "circuit_theory",
    expect: "inductor_ramp_slope",
    a: {
      topic: "RL 회로의 인덕턴스 도출",
      interpretation: "스위치 SW가 t=0에서 닫힌 후 인덕터에 흐르는 전류 i(t)가 그림 (나)와 같다. 0≤t≤2에서 인덕터의 전압이 1V일 때 인덕턴스 L을 구하고 t=4초일 때 전압을 구한다.",
      relatedConcepts: ["인덕터", "전류 파형", "스위치"],
      componentInventory: [{ type: "V" }, { type: "SW" }, { type: "R" }, { type: "L" }],
    },
  },
  {
    name: "임용2 램프 — 과목을 전자회로로 오선택해도 동작",
    subject: "electronics",
    expect: "inductor_ramp_slope",
    a: {
      topic: "RL 회로의 인덕턴스 도출",
      interpretation: "스위치가 t=0에서 닫힌 뒤 인덕터 전류 i(t) 그래프가 주어질 때 인덕턴스를 구하는 문제.",
      relatedConcepts: ["인덕터", "그래프"],
      componentInventory: [{ type: "V" }, { type: "SW" }, { type: "R" }, { type: "L" }],
    },
  },
  {
    name: "[회귀] 지수응답 RL (τ) → 램프 archetype 아님",
    subject: "circuit_theory",
    expectNot: "inductor_ramp_slope",
    a: {
      topic: "RL 과도응답",
      interpretation: "스위치를 닫은 후 시정수 τ=L/R로 i(t)가 지수적으로 증가한다. t=0.5s에서 전류를 구한다.",
      relatedConcepts: ["시정수", "지수 응답"],
      componentInventory: [{ type: "V" }, { type: "SW" }, { type: "R" }, { type: "L" }],
    },
  },
  {
    name: "[회귀] 2전원 SPDT RL → 램프 archetype 아님",
    subject: "circuit_theory",
    expectNot: "inductor_ramp_slope",
    a: {
      topic: "2전원 스위치 RL",
      interpretation: "스위치 S가 단자 A에서 단자 B로 이동할 때 인덕터 전류를 구한다. 그래프는 없다.",
      relatedConcepts: ["스위치", "인덕터"],
      componentInventory: [{ type: "V" }, { type: "V" }, { type: "SW" }, { type: "R" }, { type: "L" }],
    },
  },
];

let pass = 0;
for (const c of CASES) {
  const got = classifyCircuitType({ ...c.a, fillInTheBlanks: [] }, c.subject)?.type;
  const ok = c.expectNot ? got !== c.expectNot : got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name} → ${got}`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
