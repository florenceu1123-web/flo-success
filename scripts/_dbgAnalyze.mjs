// analyze 실패의 실제 원인 출력 (API 라우트가 메시지를 감싸므로 직접 호출)
import { readFileSync } from "node:fs";
for (const f of [".env.local", ".env"]) {
  try {
    for (const ln of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(ln);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {}
}
const img = readFileSync(process.argv[2]).toString("base64");
console.log("이미지:", Math.round(img.length / 1024), "KB(base64) | KEY:", (process.env.OPENAI_API_KEY ?? "").slice(0, 7) || "(없음)");
const { analyzeImage } = await import("../lib/analysis/analyzeImage.ts");
try {
  const r = await analyzeImage({ image: img, subject: "circuit_theory" });
  console.log("OK topic:", r.topic, "| 분류:", r.circuitType?.type);
} catch (e) {
  console.log("ERROR name:", e?.name, "| msg:", e?.message);
  console.log("status:", e?.status, "| code:", e?.code, "| type:", e?.type);
  if (e?.error) console.log("api error:", JSON.stringify(e.error).slice(0, 500));
  console.log(String(e?.stack).split("\n").slice(0, 4).join("\n"));
}
