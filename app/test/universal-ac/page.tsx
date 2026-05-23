import { buildFromTopology } from "@/lib/generation/topologyDriven/buildFromTopology";
import { perturbTopology } from "@/lib/generation/topologyDriven/perturbTopology";
import { findVariableResistor } from "@/lib/generation/topologyDriven/inferDcQueries";
import { renderFigure } from "@/lib/renderers";
import type { FigureVariant, TopologySignature } from "@/types";

/**
 * Universal AC pipeline 출력 시각 검증.
 *   분리된 archetype에 의존하지 않고 generic analog_netlist renderer가 R/L/C/V/I 회로를
 *   어떻게 layout하는지 확인.
 */
export default function UniversalAcTestPage() {
  const scenarios: Array<{ title: string; topology: TopologySignature }> = [
    {
      title: "Scenario A — 직렬 RLC (R-L-C 직렬, V 좌측)",
      topology: {
        subjectKey: "circuit_theory",
        family: "rlc_response",
        features: { hasGround: true, hasMesh: true, meshCount: 1 },
        branches: [
          { role: "top_rail_resistor", components: [{ type: "R", value: "5Ω" }] },
          { role: "top_rail_resistor", components: [{ type: "L", value: "100mH" }] },
          { role: "top_rail_resistor", components: [{ type: "C", value: "0.1μF" }] },
          { role: "voltage_source_leg", components: [{ type: "V", value: "10V" }] },
        ],
      },
    },
    {
      title: "Scenario B — 병렬 RLC (V·R·L·C 모두 vertical, 1 node)",
      topology: {
        subjectKey: "circuit_theory",
        family: "rlc_response",
        features: { hasGround: true, hasMesh: true, meshCount: 1 },
        branches: [
          { role: "voltage_source_leg", components: [{ type: "V", value: "10V" }] },
          { role: "load_leg", components: [{ type: "R", value: "200Ω" }] },
          { role: "load_leg", components: [{ type: "L", value: "500mH" }] },
          { role: "load_leg", components: [{ type: "C", value: "0.5μF" }] },
        ],
      },
    },
    {
      title: "Scenario C — Series RLC + R_L 가변 (임용 7번 단순화)",
      topology: {
        subjectKey: "circuit_theory",
        family: "rlc_response",
        features: { hasGround: true, hasMesh: true, meshCount: 1 },
        branches: [
          { role: "top_rail_resistor", components: [{ type: "R", value: "8Ω" }] },
          { role: "top_rail_resistor", components: [{ type: "C", value: "0.1μF" }] },
          { role: "voltage_source_leg", components: [{ type: "V", value: "5V" }] },
          { role: "load_leg", components: [{ type: "R", value: "8Ω" }] },
          { role: "load_leg", components: [{ type: "L", value: "100mH" }] },
        ],
      },
    },
  ];

  return (
    <main className="min-h-screen bg-blue-50 p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <header>
          <h1 className="text-2xl font-bold text-blue-900 mb-2">
            Universal AC layout 검증 (기존 analog_netlist renderer)
          </h1>
          <p className="text-sm text-blue-700">
            R/L/C/V 혼합 회로가 generic renderer로 어떻게 그려지는지 확인.
          </p>
        </header>

        {scenarios.map((scn, i) => {
          const perturbed = perturbTopology(scn.topology, "exam_similar", i * 17 + 5);
          const gen = buildFromTopology({ topology: perturbed, mode: "exam_similar", seed: i * 17 + 5 });
          const varR = findVariableResistor(gen.netlistOpen, { loadPlaceholders: [] } as never);
          if (varR) {
            const c = gen.netlistOpen.components.find((x) => x.id === varR);
            if (c && c.pins.length >= 2) {
              const a = c.pins[0].node;
              const b = c.pins[1].node;
              gen.netlistOpen.loadPlaceholders = [
                ...(gen.netlistOpen.loadPlaceholders ?? []),
                { betweenNodes: [a, b], label: "R", emphasize: true },
              ];
            }
          }
          const fig: FigureVariant = {
            id: `uac-${i}`,
            label: scn.title,
            role: "original_circuit",
            diagramType: "analog_netlist",
            diagram: gen.netlistOpen,
          };
          return (
            <section key={i} className="space-y-3 border-t border-blue-200 pt-6">
              <h2 className="text-base font-semibold text-blue-900">{scn.title}</h2>
              <p className="text-xs text-blue-700">
                components: {gen.netlistOpen.components.map((c) => `${c.id}=${c.value ?? "?"}`).join(", ")}
              </p>
              {renderFigure(fig)}
            </section>
          );
        })}
      </div>
    </main>
  );
}
