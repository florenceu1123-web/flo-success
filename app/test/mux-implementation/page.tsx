import { generateMuxImplementation } from "@/lib/generation/topologies/muxImplementation";
import { renderFigure } from "@/lib/renderers";
import type { FigureVariant } from "@/types";

/**
 * 개발 전용 테스트 페이지 — mux_implementation renderer 시각 검증.
 *
 * URL: /test/mux-implementation
 *
 * 4개 variant (idx 0..3) 각각 (가) logic_network + (나) mux_diagram 두 figure 표시.
 * 빌드 후 제거 권장.
 */

export default function MuxImplementationTestPage() {
  const scenarios = [0, 1, 2, 3].map((i) => ({
    idx: i,
    gen: generateMuxImplementation({ mode: "exam_similar", index: i, seed: i * 17 + 1 }),
  }));

  return (
    <main className="min-h-screen bg-blue-50 p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <header>
          <h1 className="text-2xl font-bold text-blue-900 mb-2">
            4×1 MUX 등가구현 renderer 시각 검증
          </h1>
          <p className="text-sm text-blue-700">
            idx 0..3 — (가) 조합논리회로 + (나) 4×1 MUX 두 figure가 모두 정확히 그려지는지 확인.
          </p>
        </header>

        {scenarios.map(({ idx, gen }) => {
          const garFig: FigureVariant = {
            id: `gar-${idx}`,
            label: `(가) 조합논리회로 — idx ${idx}`,
            role: "main_circuit",
            diagramType: "mux_gar_circuit",
            diagram: gen.garDiagram,
          };
          const naFig: FigureVariant = {
            id: `na-${idx}`,
            label: `(나) 4×1 MUX 등가회로 — idx ${idx}`,
            role: "implementation_circuit",
            diagramType: "mux_diagram",
            diagram: gen.naDiagram,
          };
          return (
            <section key={idx} className="space-y-3 border-t border-blue-200 pt-6">
              <h2 className="text-base font-semibold text-blue-900">
                Variant idx={idx} — POS:{" "}
                <code className="text-xs bg-white border border-blue-100 px-1.5 py-0.5 rounded">
                  {gen.values.posExpr}
                </code>
              </h2>
              <p className="text-sm text-blue-800">
                정답 → ㉠ = <b>{gen.answer.blank1}</b>, ㉡ = <b>{gen.answer.blank2}</b>
                {" · "}
                SOP:{" "}
                <code className="text-xs bg-white border border-blue-100 px-1.5 py-0.5 rounded">
                  {gen.values.sopExpr}
                </code>
              </p>
              {renderFigure(garFig)}
              {renderFigure(naFig)}
            </section>
          );
        })}
      </div>
    </main>
  );
}
