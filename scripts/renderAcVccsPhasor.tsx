/**
 * 종속전류원 2단 구동 페이저 회로 렌더 → HTML (시각 검증용).
 *  실행: npx tsx scripts/renderAcVccsPhasor.tsx
 */
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { generateAcVccsPhasor } from "../lib/generation/topologies/acVccsPhasor";
import { renderFigure } from "../lib/renderers";
import type { FigureVariant, GenerationMode } from "../types";

function svgOf(fig: FigureVariant): string {
  const m = renderToStaticMarkup(renderFigure(fig as never) as never);
  return m.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? m;
}

function section(title: string, mode: GenerationMode, seed: number): string {
  const g = generateAcVccsPhasor({ seed, mode });
  const fig: FigureVariant = {
    id: "c", label: "회로", role: "original_circuit",
    diagramType: "ac_vccs_phasor_circuit", diagram: g.diagram,
  };
  return `<h2>${title}</h2>
    <div style="color:#374151;font:13px system-ui">
      V_s=${g.vals.vsMag}∠${g.vals.vsAng}° · R₁=${g.vals.r1}Ω · shunt ${g.shuntKind} ${g.vals.xSh}Ω×2 ·
      g=${g.vals.g} · R₂=${g.vals.r2}Ω · 부하 ${g.loadKind} ${g.vals.xLd}Ω<br/>
      <b>V_c = ${g.vc.text} · I_R = ${g.ir.text} · i_R(t) = ${g.irTimeText}</b>
    </div>
    ${svgOf(fig)}<hr/>`;
}

const html = `<!doctype html><meta charset="utf-8">
<body style="font:14px system-ui;padding:20px;background:#fff">
<h1>ac_vccs_phasor — 회로 렌더 검증</h1>
${section("기출유사유형 (shunt=C, 부하=L) #1", "exam_similar", 1)}
${section("기출유사유형 #2", "exam_similar", 7)}
${section("기출변형유형 (shunt=L, 부하=C) #1", "exam_variant", 1)}
${section("기출변형유형 #2", "exam_variant", 7)}
</body>`;

const out = "scripts/renderAcVccsPhasor.html";
writeFileSync(out, html, "utf8");
console.log("wrote", out);
