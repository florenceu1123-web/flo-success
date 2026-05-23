import { generateRlcResonanceMaxPower } from "@/lib/generation/topologies/rlcResonanceMaxPower";
import { renderFigure } from "@/lib/renderers";
import type { FigureVariant } from "@/types";

/**
 * 개발 전용 테스트 페이지 — rlc_resonance_max_power_circuit renderer 시각 검증.
 *   URL: /test/rlc-resonance-max-power
 *   4 variant (idx 0..3) 표시.
 */
export default function RlcResonanceMaxPowerTestPage() {
  const scenarios = [0, 1, 2, 3].map((i) => ({
    idx: i,
    gen: generateRlcResonanceMaxPower({ mode: "exam_similar", index: i, seed: i * 31 + 1 }),
  }));

  return (
    <main className="min-h-screen bg-blue-50 p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <header>
          <h1 className="text-2xl font-bold text-blue-900 mb-2">
            RLC 공진 + 최대전력 (임용 7번) renderer 시각 검증
          </h1>
          <p className="text-sm text-blue-700">
            5R Wheatstone + C + R_L(점선) + L(코일) + AC source + GND
          </p>
        </header>

        {scenarios.map(({ idx, gen }) => {
          const fig: FigureVariant = {
            id: `rlc-${idx}`,
            label: `Variant idx ${idx}`,
            role: "main_circuit",
            diagramType: "rlc_resonance_max_power_circuit",
            diagram: gen.circuitDiagram,
          };
          return (
            <section key={idx} className="space-y-3 border-t border-blue-200 pt-6">
              <h2 className="text-base font-semibold text-blue-900">
                idx={idx} — R=[{gen.values.Rlabels.join(", ")}], L={gen.values.Llabel},
                ω₀={gen.values.omega0Label}, V_peak={gen.values.Vpeak}V
              </h2>
              <p className="text-sm text-blue-800">
                정답 → C = <b>{gen.answer.Clabel}</b>, r_S = <b>{gen.answer.rS}Ω</b>,
                R_L = <b>{gen.answer.RL}Ω</b>, P_max = <b>{gen.answer.PmaxLabel}</b>
              </p>
              {renderFigure(fig)}
            </section>
          );
        })}
      </div>
    </main>
  );
}
