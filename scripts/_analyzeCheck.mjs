import { readFileSync } from "node:fs";
const b64 = readFileSync("test-images/imyong6.png").toString("base64");
const r = await fetch("http://localhost:3000/api/analyze", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: b64, subject: "electronics" }),
});
const d = await r.json();
console.log("status =", r.status);
console.log("error  =", d.error ?? "(없음)");
console.log("topic  =", d.analysis?.topic ?? d.topic ?? "(없음)");
