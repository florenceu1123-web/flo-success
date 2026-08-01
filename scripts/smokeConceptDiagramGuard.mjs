// 빈 concept_diagram 검증 + 임용11(유한 개방루프) stale 감지 — API 호출 없음(정적 검증)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeConceptDiagramGuard.mjs
import { validateFigures } from "../lib/validators/validateFigures.ts";
import { detectOpampFiniteGainBlock } from "../lib/pipeline/runOpampFiniteGainBlockPipeline.ts";

const fig = (diagram) => [{ id: "fig1", label: "도식", role: "state_diagram", diagramType: "concept_diagram", diagram }];
const hasEmpty = (figs) => (validateFigures(figs).issues ?? []).some((i) => i.rule === "concept_diagram_empty");

const CASES = [
  { name: "nodes 없음 → 잡혀야 함", got: hasEmpty(fig({ edges: [] })), expect: true },
  { name: "nodes 빈 배열 → 잡혀야 함", got: hasEmpty(fig({ nodes: [], edges: [] })), expect: true },
  { name: "diagram 자체 없음 → 잡혀야 함", got: hasEmpty(fig(null)), expect: true },
  { name: "정상 상태도 → 통과", got: hasEmpty(fig({ nodes: [{ id: "s0", label: "00" }], edges: [] })), expect: false },
  {
    name: "[stale 감지] 임용11 텍스트 → 전용 archetype으로 교정",
    got: detectOpampFiniteGainBlock({
      topic: "연산 증폭기 응용 회로와 블록도",
      interpretation: "개방 루프 이득 A(s) = A₀ω₀/(s+ω₀)인 연산 증폭기의 반전 입력 전압을 중첩의 원리로 구하고 α, β를 R₁·R₂로 표현한다.",
      relatedConcepts: ["개방 루프 이득", "블록도", "중첩의 원리"],
      fillInTheBlanks: [],
    }),
    expect: true,
  },
  {
    name: "[완화] 블록도·α·β 없이 개방루프 이득만 언급 → 감지돼야 함",
    got: detectOpampFiniteGainBlock({
      topic: "연산 증폭기 개방 루프 이득 해석",
      interpretation: "연산 증폭기의 개방 루프 이득 A(s)를 고려하여 반전 입력 단자의 전압을 구한다.",
      relatedConcepts: ["개방 루프 이득", "연산 증폭기"],
      fillInTheBlanks: [],
    }),
    expect: true,
  },
  {
    name: "[오탐 방지] 능동 저역통과 필터(차단주파수·대역폭) → 감지 안 됨",
    got: detectOpampFiniteGainBlock({
      topic: "1차 능동 저역통과 필터의 대역폭",
      interpretation: "연산 증폭기와 RC로 구성된 저역통과 필터에서 커패시터를 바꿀 때 차단 주파수(대역폭) 변화를 구한다.",
      relatedConcepts: ["저역통과 필터", "대역폭", "차단 주파수"],
      fillInTheBlanks: [],
    }),
    expect: false,
  },
  {
    name: "[오탐 방지] 일반 반전증폭기 → 감지 안 됨",
    got: detectOpampFiniteGainBlock({
      topic: "반전 증폭기의 전압 이득",
      interpretation: "이상적 연산 증폭기의 가상 단락을 이용해 V_o/V_i를 구하는 문제.",
      relatedConcepts: ["반전 증폭기"],
      fillInTheBlanks: [],
    }),
    expect: false,
  },
];
let pass = 0;
for (const c of CASES) {
  const ok = c.got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name} (실제=${c.got})`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
