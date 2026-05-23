import { buildFromTopology } from "@/lib/generation/topologyDriven/buildFromTopology";
import { findVariableResistor } from "@/lib/generation/topologyDriven/inferDcQueries";
import { perturbTopology } from "@/lib/generation/topologyDriven/perturbTopology";
import { renderFigure } from "@/lib/renderers";
import type { FigureVariant, TopologySignature } from "@/types";

/**
 * 개발 전용 테스트 페이지 — universal DC pipeline 시각 검증.
 *
 *  Scenario A: 단순 분압 회로 (V, R_top, R_var) — solvable
 *  Scenario B: 임용 10번 시뮬레이션 (V + I + 5R + 가변 R)
 *
 *  variable R은 보라색 점선 박스로 회로 위쪽에 표시되어야 함.
 */
export default function UniversalDcTestPage() {
  const scenarios = [
    {
      title: "Scenario A — 단순 분압 (V_1=5V 되는 R 도출)",
      topology: {
        subjectKey: "circuit_theory",
        family: "dc_resistive",
        features: { hasGround: true, hasMesh: true, meshCount: 1 },
        branches: [
          { role: "top_rail_resistor", components: [{ type: "R", value: "4Ω" }] },
          { role: "voltage_source_leg", components: [{ type: "V", value: "10V" }] },
          { role: "load_leg", components: [{ type: "R", value: "4Ω" }] },
        ],
      } as TopologySignature,
    },
    {
      title: "Scenario B — 임용 10번 시뮬 (V_s + I_s + 4R + 가변 R, 2×2 cells)",
      topology: {
        subjectKey: "circuit_theory",
        family: "dc_resistive",
        features: { hasGround: true, hasMesh: true, meshCount: 4 },
        branches: [
          { role: "top_rail_resistor", components: [{ type: "R", value: "20Ω" }], betweenNodes: ["n_left", "n_v1"] },
          { role: "top_rail_resistor", components: [{ type: "R", value: "20Ω" }], betweenNodes: ["n_v1", "n_v3"] },
          { role: "mesh_only_branch",  components: [{ type: "I", value: "0.5A" }], betweenNodes: ["n_v1", "n_v3"] },
          { role: "voltage_source_leg", components: [{ type: "V", value: "20V" }], betweenNodes: ["n_left", "GND"] },
          { role: "load_leg", components: [{ type: "R", value: "R" }], betweenNodes: ["n_v1", "GND"] },
          { role: "load_leg", components: [{ type: "R", value: "10Ω" }], betweenNodes: ["n_v3", "GND"] },
        ],
      } as TopologySignature,
    },
  ];

  return (
    <main className="min-h-screen bg-blue-50 p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <header>
          <h1 className="text-2xl font-bold text-blue-900 mb-2">
            Universal DC + 가변 R 시각화 검증
          </h1>
          <p className="text-sm text-blue-700">
            가변 R은 보라색 점선 박스로 회로 위쪽에 "R" 라벨과 함께 표시됨 (loadPlaceholder).
          </p>
        </header>

        {scenarios.map((scn, i) => {
          const perturbed = perturbTopology(scn.topology, "exam_similar", i * 13 + 5);
          const gen = buildFromTopology({ topology: perturbed, mode: "exam_similar", seed: i * 13 + 5 });
          // pipeline과 동일 — placeholder 박스 없이 variable R 값 hide 만.
          const varR = findVariableResistor(gen.netlistOpen, { loadPlaceholders: [] } as never);
          if (varR) {
            const c = gen.netlistOpen.components.find((x) => x.id === varR);
            if (c) c.value = "R";
          }
          gen.netlistOpen.loadPlaceholders = [];
          const fig: FigureVariant = {
            id: `udc-${i}`,
            label: scn.title,
            role: "original_circuit",
            diagramType: "analog_netlist",
            diagram: gen.netlistOpen,
          };
          return (
            <section key={i} className="space-y-3 border-t border-blue-200 pt-6">
              <h2 className="text-base font-semibold text-blue-900">{scn.title}</h2>
              <p className="text-sm text-blue-800">
                Variable R id: <code className="font-mono">{varR ?? "(none)"}</code>
              </p>
              {renderFigure(fig)}
            </section>
          );
        })}
      </div>
    </main>
  );
}
