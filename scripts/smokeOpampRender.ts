/**
 * OPAMP generic 렌더러 전원 겹침 수정 검증 (GPT 불필요 — 고정 netlist 렌더만).
 *  실행: npx tsx scripts/smokeOpampRender.ts
 */
import { writeFileSync } from "node:fs";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer";
import type { CircuitNetlist } from "../types";

const pin = (id: string, nodes: string[], type: string) =>
  ({ id, type: type as never, pins: nodes.map((node, i) => ({ id: `${id}_p${i + 1}`, node, side: (type === "OPAMP" ? (i === 2 ? "right" : "left") : i === 0 ? "left" : "right") as never })) });

// 임용 8번 구조 (GPT가 추출한 것과 동일): 가산기 3입력 + 차동.
const netlist: CircuitNetlist = {
  ground: "GND",
  components: [
    { ...pin("U1", ["GND", "M1", "O1"], "OPAMP") },
    { ...pin("U2", ["P2", "M2", "O2"], "OPAMP") },
    { ...pin("Ra", ["A", "M1"], "R"), value: "3kΩ" },
    { ...pin("Rb", ["B", "M1"], "R"), value: "3kΩ" },
    { ...pin("Rc", ["C", "M1"], "R"), value: "3kΩ" },
    { ...pin("Rf1", ["M1", "O1"], "R"), value: "2kΩ" },
    { ...pin("Rx", ["O1", "M2"], "R"), value: "R" },
    { ...pin("Rf2", ["M2", "O2"], "R"), value: "3kΩ" },
    { ...pin("Va", ["A", "GND"], "V"), value: "3V" },
    { ...pin("Vb", ["B", "GND"], "V"), value: "2V" },
    { ...pin("Vc", ["C", "GND"], "V"), value: "1V" },
    { ...pin("V2", ["P2", "GND"], "V"), value: "3V" },
  ],
  nodeAnnotations: [{ node: "O2", label: "a", style: "terminal_dot" }],
};

const svg = renderAnalogMeshSVG(netlist);
writeFileSync("opamp_generic.svg", svg);
console.log("SVG → opamp_generic.svg (", svg.length, "bytes,", svg.includes("<pre>") ? "⚠ <pre> 에러" : "✓ 렌더 정상", ")");

// 전원 심볼(circle r≈22) 위치 추출 — 중심 간 거리로 겹침 검사.
const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="2[0-9]"/g)]
  .map((m) => ({ x: +m[1], y: +m[2] }));
let minDist = Infinity;
for (let i = 0; i < circles.length; i++)
  for (let j = i + 1; j < circles.length; j++) {
    const d = Math.hypot(circles[i].x - circles[j].x, circles[i].y - circles[j].y);
    if (d < minDist) minDist = d;
  }
console.log(`전원/소스 심볼 ${circles.length}개, 최소 중심거리 = ${minDist === Infinity ? "n/a" : minDist.toFixed(1)}px`,
  minDist >= 60 ? "✓ 분리됨" : "⚠ 겹칠 수 있음");
