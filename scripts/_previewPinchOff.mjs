// 시각 검증용 — MOSFET 해석 절차형 특성곡선 + 영역 명칭형(겹침 회귀) 덤프.
//   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_previewPinchOff.mjs <out.html>
import { writeFileSync } from "node:fs";
import { generateBjtCharacteristicCurve } from "../lib/generation/topologies/bjtCharacteristicCurve.ts";
import { renderCharacteristicCurveSVG } from "../lib/renderers/characteristicCurveRenderer.ts";

const out = process.argv[2];
const blocks = [];
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateBjtCharacteristicCurve({ mode, seed: 3, index: 0, structure: "pinch_off_procedure" });
  blocks.push(`<h3 style="font:600 14px sans-serif">해석 절차형 · ${mode} — ${g.values.channelKind} · V_GS=${(g.values.vgsValues ?? []).join(", ")}</h3>` +
    `<div style="width:640px">${renderCharacteristicCurveSVG(g.diagram)}</div>`);
}
const naming = generateBjtCharacteristicCurve({ mode: "exam_variant", seed: 2, index: 1, params: { device: "mosfet" } });
blocks.push(`<h3 style="font:600 14px sans-serif">영역 명칭형 · MOSFET (겹침 회귀 확인: ㉠=선형, ㉡=포화)</h3>` +
  `<div style="width:640px">${renderCharacteristicCurveSVG(naming.diagram)}</div>`);
writeFileSync(out, `<html><body style="background:#fff;margin:0;padding:12px">${blocks.join("")}</body></html>`, "utf8");
console.log("written:", out);
