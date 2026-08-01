import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

const bjt = (id) => ({ id, type: "BJT" });
const R = (id, v) => ({ id, type: "R", value: v });
const mk = (o) => ({
  topic: o.topic ?? "", interpretation: o.interp ?? "",
  relatedConcepts: o.rel ?? [], fillInTheBlanks: o.blanks ?? [],
  componentInventory: o.inv ?? [], topicKey: o.topicKey,
  signals: { inputs: [], outputs: [] },
});

const cases = [
  { name: "A. 2-BJT 바이어스(이 문제) electronics", subj: "electronics",
    a: mk({ topic:"쌍극성 접합 트랜지스터 회로 해석", topicKey:"bjt_bias",
      interp:"BJT 2개를 이용한 회로에서 스위치 상태에 따라 각 트랜지스터가 활성 영역에서 동작하며 베이스-이미터 전압 V_EB=0.7을 고려하고 I_C1=I_E1 근사로 R_5·V_CE1을 단계별로 구한다",
      inv:[{id:"SW",type:"SW"},R("R1","1kΩ"),R("R2","9kΩ"),R("R5","3kΩ"),R("R6","2.1kΩ"),bjt("Q1"),bjt("Q2")] }),
    expect: "bjt_bias" },
  { name: "B. 2-BJT 바이어스(이 문제) circuit_theory(오선택)", subj: "circuit_theory",
    a: mk({ topic:"쌍극성 접합 트랜지스터 회로 해석", topicKey:"switching_circuit",
      interp:"스위치 상태에 따라 트랜지스터의 활성 영역 동작을 분석하여 베이스-이미터 전압으로 전류를 계산",
      inv:[{id:"SW",type:"SW"},R("R1","1kΩ"),bjt("Q1"),bjt("Q2")] }),
    expect: "bjt_bias" },
  { name: "C. 진짜 출력특성곡선 (회귀 확인)", subj: "electronics",
    a: mk({ topic:"BJT 출력특성곡선 해석", topicKey:"bjt_bias",
      interp:"출력특성곡선에서 여러 개의 I_B에 대한 I_C-V_CE 곡선의 포화 영역·활성 영역·차단 영역을 식별하고 ㉠㉡㉢ 영역의 명칭을 구한다",
      inv:[bjt("Q1")] }),
    expect: "bjt_characteristic_curve" },
  { name: "D. 순수 R 스위치 DC (switched_dc 유지)", subj: "circuit_theory",
    a: mk({ topic:"스위치 DC 두 상태 비교", topicKey:"switching_circuit",
      interp:"스위치가 열리고 닫힐 때 저항 회로의 두 정상상태 전압을 비교",
      inv:[{id:"SW",type:"SW"},R("R1","2kΩ"),R("R2","3kΩ")] }),
    expect: "switched_dc" },
];

let fail = 0;
for (const c of cases) {
  const r = classifyCircuitType(c.a, c.subj);
  const ok = r.type === c.expect;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.name}: got=${r.type} expect=${c.expect}`);
  if (!ok) console.log("   reason:", r.reasoning);
}
process.exit(fail ? 1 : 0);
