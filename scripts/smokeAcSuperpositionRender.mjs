// AC 중첩(임용 10번) — 원본 배치 렌더 검증 (단자 a·b + 점선 박스)
//   신고: 단자 b가 안 그려지고 배치가 원본과 달랐다(도선으로 접지에 병합되며 좌표 상실).
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcSuperpositionRender.mjs
import { generateAcSuperposition } from "../lib/generation/topologies/acSuperposition.ts";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer.ts";

let pass = 0;
const SEEDS = [1, 7, 42, 99];
for (const seed of SEEDS) {
  const gen = generateAcSuperposition({ seed });
  const svg = renderAnalogMeshSVG(gen.netlist);
  const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].trim());
  const hasA = texts.includes("a");
  const hasB = texts.includes("b");
  const dashed = /stroke-dasharray/.test(svg);           // 점선 박스
  const dots = (svg.match(/r="4.5"/g) || []).length;      // 단자 점 2개
  const srcs = (svg.match(/<circle[^>]*r="24"/g) || []).length;  // AC 전원 2개
  const ok = hasA && hasB && dashed && dots >= 2 && srcs === 2;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} seed=${seed} a=${hasA ? "O" : "X"} b=${hasB ? "O" : "X"} 점선박스=${dashed ? "O" : "X"} 단자점=${dots} 전원=${srcs}`);
}
console.log(`${pass}/${SEEDS.length} ${pass === SEEDS.length ? "PASS" : "FAIL"}`);
process.exit(pass === SEEDS.length ? 0 : 1);
