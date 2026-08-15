/** 감지기 미발화 원인 진단 (일회성). */
import fs from "node:fs";
import {
  matchesDffNandMuxSignature,
  yieldsDffNandMuxToSibling,
} from "@/lib/generation/topologies/dffNandMuxPair";

const j = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const a = j.analysis;
const text = [
  a.topic ?? "",
  a.interpretation ?? "",
  (a.relatedConcepts ?? []).join(" "),
  (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
].join(" ").toLowerCase();

console.log("CONCEPTS:", (a.relatedConcepts ?? []).join(" | "));
console.log("BLANKS:", (a.fillInTheBlanks ?? []).map((b) => `${b.sentence}/${b.answer}`).join(" | ").slice(0, 400));
console.log("signature:", matchesDffNandMuxSignature(text), "| yields:", yieldsDffNandMuxToSibling(text));
const YIELD_RES = [
  [/상태도|상태\s*전이도|여기표|카르노맵|k-?map/, "상태도·여기표·카르노맵"],
  [/j-?k\s*플립플롭|jk\s*플립플롭|t\s*플립플롭|t-?ff/, "JK·T-FF"],
  [/멀티플렉서|mux|디멀티|dac|d\/a|비교기/, "MUX·DAC"],
  [/시퀀스\s*검출|카운터|counter/, "시퀀스·카운터"],
];
for (const [re, name] of YIELD_RES) {
  const hit = text.match(re);
  if (hit) console.log(`  YIELD 원인 [${name}]:`, JSON.stringify(hit[0]));
}
