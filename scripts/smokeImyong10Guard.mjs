// detectImyong10Archetype 하드 게이트 회귀 (2026-08-02 실측 신고)
//   진짜 임용10(가변저항 + 목표전압)은 계속 잡고, 가변저항 없는 V·I DC 회로는 universal_dc에 양보.
import { detectImyong10Archetype, countInventoryByType } from "../lib/analysis/detectImyong10Archetype.ts";
const inv = (...s) => s.map((t,i)=>({id:`c${i}`, type:t}));
const run = (a, extra=[]) => detectImyong10Archetype({ analysis:a, inventoryCounts:countInventoryByType(a.componentInventory), extraText:extra });
const cases = [
  ["임용10 원본(가변 R + 목표전압)", {
    topic:"2전원 회로의 노드 해석", interpretation:"가변 저항 R을 조정하여 V_2 = 3.8V가 되도록 한다. V_1·V_2를 구하고 전체 소비 전력을 구한다.",
    componentInventory: inv("V","I","R","R","R","R","R"), nodeAnnotations:[{node:"n1",label:"V_1"},{node:"n2",label:"V_2"}],
  }, true],
  ["임용10류(가변저항만 명시)", {
    topic:"가변 저항 회로", interpretation:"전압원과 전류원이 있는 회로에서 가변 저항 R의 값을 조정하며 V_1, V_2를 구한다.",
    componentInventory: inv("V","I","R","R","R","R","R"), nodeAnnotations:[{node:"n1",label:"V_1"},{node:"n2",label:"V_2"}],
  }, true],
  ["★신고: 가변저항 없는 V·I DC 전류 문제", {
    topic:"저항 회로의 전류 계산", interpretation:"전압원과 전류원이 포함된 저항 회로에서 저항 4kΩ에 흐르는 전류 I1과 저항 3kΩ에 흐르는 전류 I2를 구한다.",
    componentInventory: inv("V","I","R","R","R","R","R"), nodeAnnotations:[{node:"n1",label:"V_1"},{node:"n2",label:"V_2"}],
  }, false],
];
let ok=0, ng=0;
for (const [name,a,want] of cases) {
  const got = run(a);
  const hit = (got !== null) === want;
  console.log(`${hit?"✅":"❌"} ${name} → ${got ?? "null"} (기대 ${want?"발화":"양보"})`);
  hit?ok++:ng++;
}
console.log(`\n${ok}/${ok+ng} 통과`);
process.exit(ng===0?0:1);
