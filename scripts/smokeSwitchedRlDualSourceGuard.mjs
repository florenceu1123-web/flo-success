// 2전원 SPDT 감지기 — bare SW로 모든 스위치 RL을 가로채던 버그 방지
//   신고: 임용 2번(i(t) 램프 → L 도출)이 switched_rl_dual_src_circuit로 생성됐다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSwitchedRlDualSourceGuard.mjs
import { detectSwitchedRlDualSource } from "../lib/pipeline/runSwitchedRlSourceSwitchPipeline.ts";

const mk = (topic, interpretation, inv) => ({
  topic, interpretation, relatedConcepts: [], fillInTheBlanks: [], componentInventory: inv,
});
const V = { type: "V" }, SW = { type: "SW" }, R = { type: "R" }, L = { type: "L" };

const CASES = [
  {
    name: "임용3 2전원 SPDT (전원 2개) → 잡아야 함",
    expect: true,
    a: mk("2전원 스위치 RL", "두 직류 전압원이 스위치로 선택되어 R+L을 구동한다.", [V, V, SW, R, L]),
  },
  {
    name: "임용3 — 전원 1개로 읽혔지만 '단자 A↔B' 텍스트 → 잡아야 함",
    expect: true,
    a: mk("스위치 RL", "스위치 S가 단자 A에서 단자 B로 이동할 때 인덕터 전류를 구한다.", [V, SW, R, L]),
  },
  {
    name: "[신고 재현] 임용2 i(t) 램프 (단일 전원 + SW) → 잡으면 안 됨",
    expect: false,
    a: mk("RL 회로의 과도 응답 분석", "스위치가 닫힌 후 전류 파형으로 인덕턴스를 구하고 특정 시간의 인덕터 전압을 구한다.", [V, SW, R, L]),
  },
  {
    name: "[회귀] 일반 지수응답 RL (단일 전원 + SW) → 잡으면 안 됨",
    expect: false,
    a: mk("RL 과도응답", "스위치를 닫은 후 시정수 τ=L/R로 전류가 지수적으로 증가한다.", [V, SW, R, L]),
  },
  {
    name: "[회귀] 종속전원 있는 스위치 RL → 별도 archetype에 양보",
    expect: false,
    a: mk("종속전원 RL", "스위치와 종속 전압원이 있는 RL 회로.", [V, V, SW, R, L, { type: "CCVS" }]),
  },
];

let pass = 0;
for (const c of CASES) {
  const got = detectSwitchedRlDualSource(c.a);
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name} (실제=${got})`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
