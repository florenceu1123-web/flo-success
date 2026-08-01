// 테브난+최대전력+종속전원 — 원본 배치(사다리 + 단자 a·b + R_L) 렌더 검증
//   신고: "회로가 엉망이야" — generic mesh가 세로 가지로 펼쳐 원본 구조·단자가 사라졌다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTheveninDependentRender.mjs
import { readFileSync } from "node:fs";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer.ts";
const img = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/13.png").toString("base64");
const N = 3;
let ok = 0, gen = 0;
for (let i = 0; i < N; i++) {
  const ar = await fetch("http://localhost:3000/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: img, subject: "circuit_theory" }) });
  const a = await ar.json();
  if (a.error) { console.log(`#${i} analyze 실패`); continue; }
  const gr = await fetch("http://localhost:3000/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: img, subject: "circuit_theory", mode: "exam_similar", count: 1, analysis: a }) });
  const d = await gr.json();
  if (!d.problems?.length) { console.log(`#${i} generate 실패: ${d.error ?? "-"}`); continue; }
  gen++;
  const net = d.problems[0].figureVariants?.[0]?.diagram;
  const svg = renderAnalogMeshSVG(net);
  const labels = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].trim());
  const has = (k) => labels.includes(k);
  const terminals = (svg.match(/r="4.5"/g) || []).length;   // 단자 원 2개
  const good = has("a") && has("b") && has("R_L") && has("i_x") && terminals === 2 && /stroke-dasharray/.test(svg);
  if (good) ok++;
  console.log(`${good ? "✓" : "✗"} #${i} a/b/R_L/i_x=${[has("a"), has("b"), has("R_L"), has("i_x")].map(v => v ? "O" : "X").join("")} 단자원=${terminals} 종속원=${net.components.find((c) => ["CCCS","CCVS","VCCS","VCVS"].includes(c.type))?.type ?? "없음"}`);
}
console.log(`${ok}/${gen} (생성 성공 ${gen}/${N}) ${ok === gen && gen > 0 ? "PASS" : "FAIL"}`);
process.exit(ok === gen && gen > 0 ? 0 : 1);
