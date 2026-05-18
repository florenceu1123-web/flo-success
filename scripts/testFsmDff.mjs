// FSM DFF wrap + render 검증.
//   1. generateFsm() 호출
//   2. logicNetworkDiagram에 DFF gate 2개 있고 Q1/Q0 inputs에서 빠졌는지
//   3. validateLogicNetwork·renderLogicNetworkSVG가 throw 없이 통과하는지
import { register } from "node:module";
register("@swc-node/register/esm", import.meta.url);

const { generateFsm } = await import("../lib/generation/topologies/fsm.ts");
const { validateLogicNetwork, renderLogicNetworkSVG } = await import("../lib/renderers/logicNetworkRenderer.ts");

const result = generateFsm({ archetype: "mealy_4state", seed: 42 });
const net = result.logicNetworkDiagram;

const dffs = net.gates.filter((g) => g.type === "DFF");
console.log("DFF count:", dffs.length);
console.log("DFF gates:", JSON.stringify(dffs, null, 2));
console.log("inputs:", net.inputs);
console.log("outputs:", net.outputs);

const v = validateLogicNetwork(net);
console.log("validate ok:", v.ok);
if (!v.ok) console.log("errors:", v.errors);

try {
  const svg = renderLogicNetworkSVG(net);
  console.log("render OK, svg length:", svg.length);
  console.log("svg starts with <svg?", svg.startsWith("<svg"));
} catch (e) {
  console.log("render THREW:", e.message);
}
