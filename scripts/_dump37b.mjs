import { readFileSync } from "node:fs";
const img = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/37.png").toString("base64");
const a = await (await fetch("http://localhost:3000/api/analyze", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: img, subject: "circuit_theory" }),
})).json();
const { deviceIdentityTextOf } = await import("../lib/analysis/deviceIdentity.ts");
const t = deviceIdentityTextOf(a);
console.log("TOPIC:", a.topic);
console.log("INTERP:", a.interpretation);
console.log("CONCEPTS:", JSON.stringify(a.relatedConcepts));
const inv = a.componentInventory ?? [];
console.log("INV len:", inv.length, "| 값 있는 소자:", inv.filter(c => c?.value && /\d/.test(String(c.value))).map(c => `${c.id}=${c.value}`).join(",") || "(없음)");
console.log("원리문맥:", /원리|법칙|정리/.test(t));
console.log("단위수치:", (t.match(/\d+(\.\d+)?\s*(k|M|m|µ|u|n|p)?\s*(Ω|ohm|V|A|W|F|H|Hz|s|초)\b/gi) ?? []).join(" | ") || "(없음)");
console.log("도출요구:", (t.match(/(전류|전압|전력|저항|정전용량|인덕턴스|주파수|이득|시정수)[^.]{0,12}(구하|계산|도출)|\[단계\s*\d/g) ?? []).join(" | ") || "(없음)");
console.log("법칙이름:", /키르히호프|중첩의?\s*원리|옴의?\s*법칙|테브[낭난]/.test(t));
