/**
 * 임용 11번(폐경로 선적분→∇×H) E2E — 실제 /api/generate 통과 확인.
 *  실행: node scripts/_curlE2E.mjs   (dev 서버가 :3000에서 떠 있어야 함)
 * analysis는 서버 로그에 남은 실제 Vision 요약(straight_wire_B로 새던 것)을 그대로 사용.
 */
import { writeFileSync } from "node:fs";

const analysis = {
  topic: "자계 합성 및 경로 적분",
  topicKey: "magnetostatics",
  subjectKey: "electromagnetics",
  interpretation:
    "자유공간상에 자계 H=20x²a_z [A/m]가 있고 한 변의 길이가 1인 정사각형 abcd의 중심 좌표가 (x₀,0,0)입니다. 정사각형 경로 a-b-c-d-a를 따라 ∮H·dl을 구하고, 그 결과를 면적 S로 나눈 값과 면의 방향 단위 벡터 a_n을 구한 뒤, x₀=2일 때 ∇×H를 구합니다.",
  relatedConcepts: ["선적분", "회전", "암페어 법칙의 미분형", "단위 벡터", "자계"],
  fillInTheBlanks: [],
};

async function gen(mode) {
  const body = { image: "d", subject: "electromagnetics", mode, count: 2, topicKey: "magnetostatics", analysis };
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  console.log(`[${mode}] status=${r.status} returned=${d.problems?.length} issues=${d.summary?.totalIssues} fig=${(p?.figureVariants || []).map((f) => f.diagramType).join(",")}`);
  console.log("  본문:", (p?.content || "").slice(0, 150).replace(/\s+/g, " "), "...");
  console.log("  Q:", (p?.question || "").split("\n").join("\n     "));
  console.log("  A:", (p?.answer || "").split("\n").join("\n     "));
  const f = p?.figureVariants?.[0];
  if (f) writeFileSync(`scripts/_curlfig_${mode}.json`, JSON.stringify(f));
  return d;
}

const s = await gen("exam_similar");
const v = await gen("exam_variant");
const bad = [s, v].some((d) => (d.summary?.totalIssues ?? 1) !== 0 || !d.problems?.length);
console.log(bad ? "\n=== FAIL ===" : "\n=== OK: 양모드 issues=0 ===");
process.exit(bad ? 1 : 0);
