/** 현재 설정에서 logic_network 라벨 겹침을 세고, 겹치는 쌍을 출력한다 (일회성 튜닝 도구). */
import { generateDffNandMuxPair } from "@/lib/generation/topologies/dffNandMuxPair";
import { renderLogicNetworkSVG } from "@/lib/renderers/logicNetworkRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let n = 0;
const samples = [];
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let s = 1; s <= 6; s++) {
    const g = generateDffNandMuxPair({ seed: s * 104729, mode });
    const ov = findLabelOverlaps(renderLogicNetworkSVG(g.circuit));
    n += ov.length;
    if (samples.length < 6) for (const o of ov.slice(0, 3)) samples.push(JSON.stringify(o));
  }
}
console.log(`OVERLAP=${n}`);
for (const s of samples) console.log("  " + s);
