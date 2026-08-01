/** 비순환 상태형 JK 카운터 회로+상태도+타이밍 렌더 → HTML (시각 검증). */
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { generateJkStateMachine, stateBits } from "../lib/generation/topologies/jkStateMachine";
import { renderJkStateMachineCircuit } from "../lib/renderers/jkStateMachineCircuitRenderer";
import { renderJkStateDiagram } from "../lib/renderers/jkStateDiagramRenderer";
import { renderFigure } from "../lib/renderers";
import type { FigureVariant, JkStateMachineCircuitDiagram } from "../types";

function sigLabel(s: string): string {
  if (s === "1") return "1";
  const inv = s.startsWith("n");
  const idx = s.replace(/^n/, "").replace("Q", "");
  const sub = idx === "0" ? "₀" : idx === "1" ? "₁" : "₂";
  return inv ? `Q̄${sub}` : `Q${sub}`;
}

const gen = generateJkStateMachine({ index: 0 }); // 원본 재현
const circDiag: JkStateMachineCircuitDiagram = {
  j0: gen.config.J0, k0: gen.config.K0, j1: gen.config.J1, k1: gen.config.K1, j2: gen.config.J2, k2: gen.config.K2,
};
const circuitSvg = renderJkStateMachineCircuit(circDiag);
const stateSvg = renderJkStateDiagram(gen.stateDiagram);
const waveFig: FigureVariant = { id: "w", label: "", role: "solution_waveform", diagramType: "waveform", diagram: gen.waveformSolution };
const waveSvg = (renderToStaticMarkup(renderFigure(waveFig as never) as never).match(/<svg[\s\S]*<\/svg>/) ?? [""])[0];

const jk = `J₀=${sigLabel(gen.config.J0)} K₀=${sigLabel(gen.config.K0)} · J₁=${sigLabel(gen.config.J1)} K₁=${sigLabel(gen.config.K1)} · J₂=${sigLabel(gen.config.J2)} K₂=${sigLabel(gen.config.K2)}`;
const seq = gen.cycle.map(stateBits).join(" → ") + " → " + stateBits(gen.cycle[0]);
const nc = gen.nonCyclic.map((n) => `${stateBits(n.state)}→${stateBits(n.next)}`).join(", ");

const html = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#fff;padding:20px">
<h3>비순환 상태형 JK 카운터 (seed 42)</h3>
<p>사이클: <b>${seq}</b><br>순환하지 않는 상태값: <b>${nc}</b><br>J·K: ${jk}</p>
<h4>(가) 회로</h4>${circuitSvg}
<h4>(다) 상태도</h4><div style="max-width:640px">${stateSvg}</div>
<h4>(나) 타이밍 도표 (정답)</h4>${waveSvg}
</body>`;
writeFileSync("scripts/_jksm.html", html);
console.log("seq:", seq);
console.log("nonCyclic:", nc);
console.log("JK:", jk);
console.log("wrote scripts/_jksm.html");
