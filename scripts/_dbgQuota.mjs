// 최소 비용 프로브 — 쿼터/키 상태만 확인 (max_tokens=1)
import { readFileSync } from "node:fs";
for (const f of [".env.local", ".env"]) {
  try {
    for (const ln of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(ln);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {}
}
const key = process.env.OPENAI_API_KEY ?? "";
console.log("KEY:", key.slice(0, 8) + "…" + key.slice(-4), "| 길이:", key.length);
const r = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
});
const j = await r.json();
console.log("HTTP", r.status, "|", j.error ? `${j.error.code}: ${j.error.message}` : "정상 (쿼터 OK)");
