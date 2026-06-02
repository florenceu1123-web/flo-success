/**
 * 계정에서 사용 가능한 vision 모델 나열 (DEFAULT_MODEL 업그레이드 후보 확인용).
 * 실행: node scripts/listVisionModels.mjs
 */
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const key = env.match(/OPENAI_API_KEY\s*=\s*(.+)/)[1].trim().replace(/^["']|["']$/g, "");

const res = await fetch("https://api.openai.com/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
const data = await res.json();
if (!res.ok) {
  console.log("오류:", JSON.stringify(data));
  process.exit(1);
}
const ids = data.data.map((m) => m.id);
const vision = ids.filter(
  (id) =>
    /^(gpt-5|gpt-4\.1|gpt-4o|o3|o4)/.test(id) &&
    !/audio|realtime|tts|transcribe|search|mini-2024|preview-2024/.test(id),
);
console.log(vision.sort().join("\n"));
