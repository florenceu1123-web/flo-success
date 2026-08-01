/**
 * 두 유전체 적층 커패시터 전위 분포(임용 24번) 도식 렌더 → HTML (시각 검증용).
 *  실행: npx tsx scripts/renderDielectricPotential.tsx
 */
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics";
import { renderFigure } from "../lib/renderers";
import type { FigureVariant } from "../types";

function svgOf(fig: FigureVariant): string {
  const m = renderToStaticMarkup(renderFigure(fig as never) as never);
  return m.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? m;
}

function section(title: string, mode: "exam_similar" | "exam_variant", seed: number): string {
  const inst = generateElectromagnetics({
    seed, mode,
    entryId: "dielectric_two_region_cap",
    hints: { dielectricStructure: "potential_distribution" },
  });
  if (!inst.diagram) return `<h2>${title}</h2><p style="color:red">diagram 없음!</p>`;
  const fig: FigureVariant = {
    id: "f", label: inst.title, role: "concept_diagram",
    diagramType: "em_field_diagram", diagram: inst.diagram,
  };
  return `<h2>${title}</h2>
    <div style="max-width:820px">
      <div style="color:#334155;font-size:13px">${inst.question}</div>
      <div style="color:#1e3a8a;font-size:13px;margin:6px 0">정답: ${inst.answer}</div>
      ${svgOf(fig)}
    </div>`;
}

const html = `<!doctype html><meta charset="utf-8">
<body style="font-family:sans-serif;background:#fff;padding:20px">
${section("exam_similar (유사 — 경계전위 given → V(z))", "exam_similar", 1)}
<hr>
${section("exam_variant (변형 — E_0 given → V(z)+상단 전위)", "exam_variant", 3)}
</body>`;

writeFileSync("scripts/_diel_render.html", html);
console.log("wrote scripts/_diel_render.html");
