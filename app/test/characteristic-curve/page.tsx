import { generateBjtCharacteristicCurve } from "@/lib/generation/topologies/bjtCharacteristicCurve";
import { renderFigure } from "@/lib/renderers";
import type { CharacteristicCurveDiagram, FigureVariant } from "@/types";

/**
 * 개발 전용 테스트 페이지 — characteristic_curve renderer 시각 검증용.
 *
 * URL: /test/characteristic-curve
 *
 * 다섯 가지 시나리오를 한 화면에 표시:
 *   1. 원본 임용 4번 재현 — BJT, ㉠ 포화 / ㉡ 차단
 *   2. exam_variant BJT — ㉠ 포화 / ㉡ 활성
 *   3. exam_variant BJT — ㉠ 활성 / ㉡ 차단
 *   4. exam_variant MOSFET — ㉠ triode / ㉡ saturation
 *   5. exam_variant MOSFET — ㉠ saturation / ㉡ cutoff
 *
 * 빌드 후 제거 권장 (CLAUDE.md 절대규칙: 불필요한 페이지 누적 금지).
 */

const SCENARIOS: Array<{ title: string; diagram: CharacteristicCurveDiagram }> = [
  {
    title: "1. 원본 임용 4번 재현 — BJT, ㉠ 포화 / ㉡ 차단",
    diagram: {
      device: "bjt",
      curves: buildCurves("bjt", 7),
      regions: [
        { marker: "㉠", region: "saturation" },
        { marker: "㉡", region: "cutoff" },
      ],
      xLabel: "V_CE",
      yLabel: "I_C",
    },
  },
  {
    title: "2. exam_variant BJT — ㉠ 포화 / ㉡ 활성",
    diagram: {
      device: "bjt",
      curves: buildCurves("bjt", 6),
      regions: [
        { marker: "㉠", region: "saturation" },
        { marker: "㉡", region: "active" },
      ],
      xLabel: "V_CE",
      yLabel: "I_C",
    },
  },
  {
    title: "3. exam_variant BJT — ㉠ 활성 / ㉡ 차단",
    diagram: {
      device: "bjt",
      curves: buildCurves("bjt", 8),
      regions: [
        { marker: "㉠", region: "active" },
        { marker: "㉡", region: "cutoff" },
      ],
      xLabel: "V_CE",
      yLabel: "I_C",
    },
  },
  {
    title: "4. exam_variant MOSFET — ㉠ triode / ㉡ saturation",
    diagram: {
      device: "mosfet",
      curves: buildCurves("mosfet", 7),
      regions: [
        { marker: "㉠", region: "triode" },
        { marker: "㉡", region: "saturation" },
      ],
      xLabel: "V_DS",
      yLabel: "I_D",
    },
  },
  {
    title: "5. generator 무작위 (seed=42) — 출력 검사",
    diagram: generateBjtCharacteristicCurve({ mode: "exam_variant", seed: 42 }).diagram,
  },
];

export default function CharacteristicCurveTestPage() {
  return (
    <main className="min-h-screen bg-blue-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-blue-900 mb-2">
            BJT/MOSFET 출력특성곡선 renderer 시각 검증
          </h1>
          <p className="text-sm text-blue-700">
            5가지 시나리오로 영역 음영·marker(㉠/㉡)·다중 곡선이 정확히 그려지는지 확인.
          </p>
        </header>

        {SCENARIOS.map((scenario, i) => {
          const fig: FigureVariant = {
            id: `test-fig-${i + 1}`,
            label: scenario.title,
            role: "main_circuit",
            diagramType: "characteristic_curve",
            diagram: scenario.diagram,
          };
          return (
            <section key={fig.id} className="space-y-2">
              <h2 className="text-base font-semibold text-blue-900">{scenario.title}</h2>
              {renderFigure(fig)}
              <details className="text-xs text-blue-700 bg-white border border-blue-100 rounded p-2">
                <summary className="cursor-pointer font-mono">diagram JSON</summary>
                <pre className="mt-2 overflow-x-auto">
                  {JSON.stringify(scenario.diagram, null, 2)}
                </pre>
              </details>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function buildCurves(
  device: "bjt" | "mosfet",
  count: number,
): CharacteristicCurveDiagram["curves"] {
  const plateauTop = 0.95;
  const plateauBottomNonZero = 0.12;
  const inner = count - 1;
  const step = (plateauTop - plateauBottomNonZero) / Math.max(inner - 1, 1);
  const knee = 0.08;
  const curves: CharacteristicCurveDiagram["curves"] = [];
  for (let i = 0; i < inner; i++) {
    const plateau = Number((plateauTop - step * i).toFixed(3));
    const label = device === "bjt" ? `I_B${inner - i}` : `V_GS${inner - i}`;
    curves.push({ label, plateau, knee });
  }
  curves.push({
    label: device === "bjt" ? "I_B=0" : "V_GS<V_TH",
    plateau: 0,
    knee,
  });
  return curves;
}
