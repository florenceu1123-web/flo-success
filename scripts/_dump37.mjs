import { readFileSync } from "node:fs";
const img = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/37.png").toString("base64");
const a = await (await fetch("http://localhost:3000/api/analyze", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: img, subject: "circuit_theory" }),
})).json();
console.log(JSON.stringify({
  topic: a.topic, interpretation: a.interpretation, relatedConcepts: a.relatedConcepts,
  inventory: a.componentInventory, blanks: (a.fillInTheBlanks ?? []).map(b => b?.sentence),
  circuitType: a.circuitType?.type,
}, null, 1));
const { isPrincipleNamingAnalysis } = await import("../lib/analysis/deviceIdentity.ts");
console.log("판정 =", isPrincipleNamingAnalysis(a));
