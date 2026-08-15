/** 관통 세그먼트를 만든 SVG 조각을 그대로 찾아 어느 배선 계열인지 특정한다 (일회성). */
import { __debugGateBoxes, renderLogicNetworkSVG } from "@/lib/renderers/logicNetworkRenderer";
import { generateDffNandMuxPair } from "@/lib/generation/topologies/dffNandMuxPair";

const g = generateDffNandMuxPair({ seed: 104729, mode: "exam_similar" });
const svg = renderLogicNetworkSVG(g.circuit);
const boxes = __debugGateBoxes(g.circuit);
console.log("박스 g1_b/g1_f:", JSON.stringify(boxes.filter((b) => b.id === "g1_b" || b.id === "g1_f")));

// y=164 근처를 지나는 마크업 조각 출력
const frags = svg.split(/(?=<)/).filter((f) => /16[0-9]/.test(f) && /(line|path)/.test(f));
console.log(`\ny=16x 포함 조각 ${frags.length}개:`);
for (const f of frags.slice(0, 14)) console.log("  " + f.trim().slice(0, 160));
