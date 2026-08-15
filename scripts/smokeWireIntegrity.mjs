// 디지털 논리회로 figure **배선 무결성** 회귀 — 겹침·끊김·관통을 검사한다.
//
// ★ 왜 (2026-08-13): 공유 `logicNetworkRenderer`의 라우팅을 고칠 때마다 다른 archetype이 조용히
//   깨졌다. 기존 디지털 스모크는 값·구조만 보고 **배선 연결성을 전혀 검사하지 않아** 끊긴 선이
//   그대로 통과했다(사용자가 눈으로 발견). 이 스모크가 그 구멍을 막는다.
//
// ★ 파이프라인을 실제로 돌려 `logic_network` figure를 **전부** 훑는다 — generator마다 payload
//   모양이 달라(어떤 건 circuitDiagram, 어떤 건 diagram) 직접 import하면 형태를 맞추기 어렵다.
import { checkWireIntegrity } from "./_wireIntegrity.mjs";
import { renderLogicNetworkSVG } from "../lib/renderers/logicNetworkRenderer.ts";

import { runFfReachableStatesPipeline } from "../lib/pipeline/runFfReachableStatesPipeline.ts";
import { runTffStateDesignInputPipeline } from "../lib/pipeline/runTffStateDesignInputPipeline.ts";
import { runJkExcitationSopPosPipeline } from "../lib/pipeline/runJkExcitationSopPosPipeline.ts";
import { runJkTwoPhaseClockPipeline } from "../lib/pipeline/runJkTwoPhaseClockPipeline.ts";
import { runDffPresetClearRegionsPipeline } from "../lib/pipeline/runDffPresetClearRegionsPipeline.ts";
import { runFlipflopMixedPipeline } from "../lib/pipeline/runFlipflopMixedPipeline.ts";

const TARGETS = [
  ["ff_reachable_states", runFfReachableStatesPipeline],
  ["tff_state_design_input", runTffStateDesignInputPipeline],
  ["jk_excitation_sop_pos", runJkExcitationSopPosPipeline],
  ["jk_two_phase_clock", runJkTwoPhaseClockPipeline],
  ["dff_preset_clear_regions", runDffPresetClearRegionsPipeline],
  ["flipflop_mixed_app", runFlipflopMixedPipeline],
];

let checked = 0;
const rows = [];

for (const [name, run] of TARGETS) {
  for (const mode of ["exam_similar", "exam_variant"]) {
    let problems = [];
    try {
      problems = await run({ analysis: null, mode, count: 2 });
    } catch (e) {
      rows.push({ name: `${name}/${mode}`, err: (e).message.slice(0, 60) });
      continue;
    }
    problems.forEach((p, i) => {
      const figs = [...(p.figureVariants ?? []), ...(p.solutionFigures ?? [])]
        .filter((f) => f.diagramType === "logic_network");
      figs.forEach((f, k) => {
        let r;
        try {
          r = checkWireIntegrity(renderLogicNetworkSVG(f.diagram));
        } catch (e) {
          rows.push({ name: `${name}/${mode}#${i}.${k}`, err: (e).message.slice(0, 60) });
          return;
        }
        checked += 1;
        rows.push({
          name: `${name}/${mode}#${i}.${k}`,
          floating: r.floating.length, overlaps: r.overlaps.length, through: r.through.length,
          sample: [
            r.floating[0] ? `끊김(${r.floating[0].x},${r.floating[0].y})` : "",
            r.overlaps[0] ? `겹침${r.overlaps[0].len}px` : "",
            r.through[0] ? `관통 ${r.through[0].seg}` : "",
          ].filter(Boolean).join(" / "),
        });
      });
    });
  }
}

console.log(`\n검사한 logic_network figure: ${checked}개\n`);
let bad = 0;
for (const r of rows) {
  if (r.err) { console.log(`  ⚠ ${r.name}: ${r.err}`); continue; }
  const total = r.floating + r.overlaps + r.through;
  if (total > 0) {
    bad += 1;
    console.log(`  ✗ ${r.name.padEnd(38)} 끊김 ${r.floating} · 겹침 ${r.overlaps} · 관통 ${r.through}   ${r.sample}`);
  }
}
if (bad === 0) console.log("  ✓ 모든 figure에서 끊김·겹침·관통 0");
console.log(`\n=== WIRE INTEGRITY: ${checked - bad}/${checked} clean ===`);
process.exit(bad === 0 ? 0 : 1);
