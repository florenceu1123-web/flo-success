// Fork 병렬 펜던트 레그 렌더 회귀 가드 (2026-07-23)
//   버그: hub(n2)에 직렬 pendant 레그(R_top+R_leg)가 여러 개 매달리면 R_top들이 같은 rail에서
//   겹쳐 그려지고 한쪽 R_top이 leg 노드를 가로질러 "저항 몸통 중앙에서 leg가 빠지는" 것처럼 보였다.
//   수정: 그런 레그를 병렬 vertical chain으로 렌더 → 상단에 수평 저항 없음 + 저항 몸통과 dot 비겹침.
// 사용: node scripts/smokeForkParallelLegs.mjs   (tsx 없이도 동작 — 아래 tsx 안내 참고)
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer.ts";

const pin = (id, node) => ({ id, node });
const R = (id, value, a, b) => ({ id, type: "R", value, pins: [pin("a", a), pin("b", b)] });
const V = (id, value, a, b) => ({ id, type: "V", value, pins: [pin("p", a), pin("n", b)] });

// 실제 신고 netlist (topology_driven, 두 fork hub n2·n6, 각 3개 병렬 직렬 레그)
const netlist = {
  ground: "GND",
  components: [
    R("R_top1", "4Ω", "n1", "n2"),
    R("R_top2", "20Ω", "n2", "n3"),
    R("R_top3", "8Ω", "n2", "n4"),
    R("R_top4", "20Ω", "n5", "n6"),
    R("R_top5", "20Ω", "n6", "n7"),
    R("R_top6", "20Ω", "n6", "n8"),
    V("V_leg1_1", "10V", "n1", "GND"),
    R("R_leg2_1", "8Ω", "n3", "GND"),
    R("R_leg3_1", "15Ω", "n4", "GND"),
    V("V_leg4_1", "24V", "n5", "GND"),
    R("R_leg5_1", "10Ω", "n7", "GND"),
    R("R_leg6_1", "15Ω", "n8", "GND"),
    { id: "GND", type: "GND", pins: [pin("g", "GND")] },
  ],
};

const svg = renderAnalogMeshSVG(netlist);
const TOP_Y = 80;

// 1) 상단 rail에 수평 저항 몸통이 없어야 함 (모두 병렬 vertical chain으로 흡수).
const horizBodies = [...svg.matchAll(/M ([\d.-]+) 80 L [\d.-]+ 70 L/g)].map((m) => +m[1] + 28);
// 2) top dot이 어떤 수평 저항 몸통 중앙(±28)과 겹치지 않아야 함.
const topDots = [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="3\.5"/g)]
  .map((m) => ({ x: +m[1], y: +m[2] }))
  .filter((d) => Math.abs(d.y - TOP_Y) < 5);
const overlaps = topDots.filter((d) => horizBodies.some((b) => Math.abs(b - d.x) <= 28));

let fail = 0;
if (horizBodies.length !== 0) {
  console.error(`FAIL: 상단 수평 저항 몸통이 남아있음 (${horizBodies.length}개) — 병렬 레그 흡수 실패`);
  fail++;
}
if (overlaps.length !== 0) {
  console.error(`FAIL: top dot이 저항 몸통과 겹침 (${overlaps.length}곳)`);
  fail++;
}
// 3) 두 fork hub의 fan-out dot 2개 존재.
if (topDots.length !== 2) {
  console.error(`FAIL: fan-out dot 개수 예상 2, 실제 ${topDots.length}`);
  fail++;
}

if (fail === 0) {
  console.log(`PASS: fork 병렬 레그 clean render (수평저항 0, dot 겹침 0, fan-out dot ${topDots.length})`);
  process.exit(0);
} else {
  process.exit(1);
}
