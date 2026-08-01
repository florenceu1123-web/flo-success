// ★ inventory 추출 실패(schema_fail) 대비 — 텍스트에서 최소 inventory 합성 + 분류 복구
//   실측 2건: 임용 9번(RLC 주파수응답) → unsupported, 임용 10번(NMOS 캐스코드) → dc_dependent_source
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeInventoryFallback.mjs
import { inferInventoryFromText } from "../lib/analysis/inventoryFromText.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

const rlc = {
  topic: "RLC 회로의 주파수 응답 분석",
  interpretation: "1 kΩ 저항과 2 H 인덕터, 커패시터 C로 구성된 RLC 회로에서 주파수에 따른 전류 진폭 그래프로 정전용량과 공진 주파수를 구한다. v(t)=10√2 cos(ωt) [V].",
  relatedConcepts: ["RLC", "공진", "정전용량"],
  fillInTheBlanks: [],
};
const nmos = {
  topic: "포화 영역 NMOS 회로 해석",
  interpretation: "포화 영역에서 동작하는 NMOS M₁·M₂·M₃를 사용한 회로이다. 10 V 전원, 20 kΩ 저항 2개와 40 kΩ 저항, 0.1 mA 전류원이 있다. M₁의 게이트-소스 전압과 저항 R을 구하고, M₃의 드레인 전압과 소스 전압을 구한다.",
  relatedConcepts: ["NMOS", "포화 영역", "전류 미러"],
  fillInTheBlanks: [],
};

const CASES = [
  { name: "임용9 RLC — 합성 inventory", a: rlc, subject: "circuit_theory", expect: "rlc_resonance", needTypes: ["R", "L", "C"] },
  { name: "임용10 NMOS 캐스코드 — 합성 inventory", a: nmos, subject: "electronics", expect: "mosfet_cascode_mirror", needTypes: ["MOSFET", "R"] },
];

let pass = 0;
for (const c of CASES) {
  const text = [c.a.topic, c.a.interpretation, c.a.relatedConcepts.join(" ")].join(" ");
  const inv = inferInventoryFromText(text);
  const types = [...new Set(inv.map((x) => x.type))];
  const hasTypes = c.needTypes.every((t) => types.includes(t));
  const got = classifyCircuitType({ ...c.a, componentInventory: inv }, c.subject)?.type;
  const ok = hasTypes && got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}`);
  console.log(`    합성=[${inv.map((x) => x.type + (x.value ? "=" + x.value : "")).join(", ")}]`);
  console.log(`    분류=${got} (기대=${c.expect})`);
}
// 회귀: 종속전원 feature가 있어도(회로이론 분기 유혹) MOSFET 유형 유지
const withDep = classifyCircuitType({ ...nmos, componentInventory: [], topologySignature: { features: { hasDependentSource: true } } }, "circuit_theory")?.type;
console.log(`${withDep === "mosfet_cascode_mirror" ? "✓" : "✗"} [회귀] 종속전원 feature + 회로이론 과목 → ${withDep}`);
// 회귀: 정상 inventory가 있으면 합성하지 않는다(호출부에서 분기) — 합성 자체는 텍스트 없으면 빈 배열
const empty = inferInventoryFromText("");
console.log(`${empty.length === 0 ? "✓" : "✗"} 빈 텍스트 → 합성 안 함 (${empty.length})`);
console.log(`${pass === CASES.length && empty.length === 0 ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length && empty.length === 0 ? 0 : 1);
