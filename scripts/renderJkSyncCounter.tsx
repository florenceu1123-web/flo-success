/**
 * JK 동기식 카운터 회로+파형 렌더 → HTML (시각 검증용).
 *  실행: npx tsx scripts/renderJkSyncCounter.tsx
 */
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { generateJkSyncCounter, stateBits } from "../lib/generation/topologies/jkSyncCounter";
import { renderFigure } from "../lib/renderers";
import type { FigureVariant } from "../types";

function svgOf(fig: FigureVariant): string {
  const m = renderToStaticMarkup(renderFigure(fig as never) as never);
  return m.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? m;
}

function section(title: string, mode: "exam_similar" | "exam_variant", seed: number): string {
  const gen = generateJkSyncCounter({ seed, mode });
  const circuit: FigureVariant = {
    id: "c", label: "(가) 회로", role: "implementation_circuit",
    diagramType: "jk_sync_counter_circuit", diagram: { direction: gen.direction },
  };
  const wave: FigureVariant = {
    id: "w", label: "(나) 정답 파형", role: "solution_waveform",
    diagramType: "waveform", diagram: gen.waveformSolution,
  };
  const seq = gen.states.map(stateBits).join(" → ");
  return `<h2>${title} — ${gen.direction} · 초기 ${stateBits(gen.initialState)} · ${seq}</h2>
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
      <div><div>(가) 회로</div>${svgOf(circuit)}</div>
      <div><div>(나) 정답 타이밍 도표</div>${svgOf(wave)}</div>
    </div>`;
}

const html = `<!doctype html><meta charset="utf-8">
<body style="font-family:sans-serif;background:#fff;padding:20px">
${section("exam_similar (상향)", "exam_similar", 1)}
<hr>
${section("exam_variant (하향)", "exam_variant", 3)}
</body>`;

writeFileSync("scripts/_jk_render.html", html);
console.log("wrote scripts/_jk_render.html");
