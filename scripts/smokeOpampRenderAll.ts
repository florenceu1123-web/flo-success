/**
 * OPAMP generic 렌더러 회귀 검증 — 기존 archetype 6종 netlist 렌더 (접지핀 수정 영향 확인).
 *  실행: npx tsx scripts/smokeOpampRenderAll.ts
 */
import { generateOpamp, type OpampArchetype } from "../lib/generation/topologies/opamp";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer";

const ARCHETYPES: OpampArchetype[] = ["inverting", "non_inverting", "summing", "difference", "voltage_follower", "cascade"];
let fail = 0;
for (const a of ARCHETYPES) {
  const gen = generateOpamp({ seed: 3, archetype: a });
  const svg = renderAnalogMeshSVG(gen.netlist);
  const hasErr = svg.includes("<pre>");
  // 전원/소스 심볼 분리도
  const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="2[0-9]"/g)].map((m) => ({ x: +m[1], y: +m[2] }));
  let minD = Infinity;
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++)
    minD = Math.min(minD, Math.hypot(circles[i].x - circles[j].x, circles[i].y - circles[j].y));
  const ok = !hasErr && svg.length > 500;
  if (!ok) fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${a}: ${svg.length}b${hasErr ? " ⚠<pre>" : ""}  심볼 ${circles.length}개 최소거리 ${minD === Infinity ? "n/a" : minD.toFixed(0)}px`);
}
console.log(`\n${ARCHETYPES.length - fail}/${ARCHETYPES.length} 렌더 정상`);
process.exit(fail > 0 ? 1 : 0);
