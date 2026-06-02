/**
 * 변형유형(V↔I·L↔C 교환) topology의 렌더링 검증 (2026-06-03).
 *
 * 사용자 보고: 변형문제에서 코일·전류원이 안 보임 (다른 소자와 겹침 의심).
 *
 * 검증: 교환 후 topology를 buildFromTopology + addLoadResistor + renderAnalogMeshSVG로
 *       렌더링했을 때 모든 소자가 서로 겹치지 않는 위치에 그려지는지.
 *
 * 실행: npx tsx scripts/smokeVariantRendering.mjs
 */
import { writeFileSync } from "node:fs";
import { buildFromTopology } from "../lib/generation/topologyDriven/buildFromTopology.ts";
import { addLoadResistor } from "../lib/generation/topologyDriven/addLoadResistor.ts";
import { applySourceReactiveSwapVariant } from "../lib/analysis/topologyRecovery.ts";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer.ts";

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail !== undefined ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ─── 임용 11번 원본 topology (18:26 로그 — dangling 수리 후) ──────────────────
const originalTopology = {
  subjectKey: "circuit_theory",
  family: "rlc_response",
  features: { hasGround: true, hasMesh: true, meshCount: 1 },
  branches: [
    { role: "current_source_leg", components: [{ type: "I", value: "18∠90°A" }], betweenNodes: ["n_top", "GND"] },
    { role: "mesh_only_branch", components: [{ type: "V", value: "9∠90°V" }], betweenNodes: ["n_top", "n_mid"] },
    { role: "load_leg", components: [{ type: "R", value: "0.25Ω" }], betweenNodes: ["n_mid", "GND"] },
    { role: "top_rail_resistor", components: [{ type: "L", value: "j3Ω" }], betweenNodes: ["n_top", "n_right"] },
    { role: "top_rail_resistor", components: [{ type: "R", value: "2Ω" }], betweenNodes: ["n_right", "n_a"] },
    { role: "load_leg", components: [{ type: "C", value: "-j3Ω" }], betweenNodes: ["n_a", "GND"] },
  ],
};

// ─── 변형 적용 (V↔I·L↔C) + netlist 생성 + R_L 추가 ──────────────────────────
const swapped = applySourceReactiveSwapVariant(originalTopology);
check("변형 적용됨", swapped !== null);

const gen = buildFromTopology({ topology: swapped, mode: "exam_variant", seed: 42 });
const netlist = gen.netlistOpen;
addLoadResistor(netlist, { loadPlaceholders: [] });

console.log(
  "\n  netlist components:",
  netlist.components.map((c) => `${c.id}[${c.pins.map((p) => p.node).join(",")}]`).join(", "),
);

// ─── 렌더링 + 겹침 검사 ──────────────────────────────────────────────────────
const svg = renderAnalogMeshSVG(netlist);
writeFileSync(
  "scripts/smokeVariantRendering.html",
  `<!doctype html><meta charset="utf-8"><title>variant rendering</title>
<body style="margin:20px;font:14px sans-serif">
<h2>변형유형 (V↔I·L↔C 교환) 렌더링</h2>
<p>기대: 모든 소자가 겹치지 않고, I(가로)·C(가로)·V(세로)·L(세로) 모두 보여야 함</p>
<div style="border:1px solid #ccc">${svg}</div></body>`,
);
console.log("  HTML saved -> scripts/smokeVariantRendering.html\n");

/** 라벨 text 요소의 x 좌표 */
function labelX(id) {
  const re = new RegExp(`<text[^>]*x="([\\d.-]+)"[^>]*>${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</text>`);
  const m = svg.match(re);
  return m ? parseFloat(m[1]) : NaN;
}

console.log("[검증] 모든 소자 라벨 존재 + 위치 겹침 없음");
const ids = netlist.components.map((c) => c.id);
const positions = {};
for (const id of ids) {
  positions[id] = labelX(id);
}
console.log("  라벨 x 좌표:", JSON.stringify(positions).replace(/,"/g, ', "'));

check("모든 소자 라벨이 SVG에 존재", ids.every((id) => Number.isFinite(positions[id])),
  ids.filter((id) => !Number.isFinite(positions[id])).join(", ") || "전부 존재");

// 겹침 검사 — ★ 같은 방향(가로끼리·세로끼리)의 소자만 비교 ★
//   가로 소자(top rail 위)와 세로 소자(leg, 중간 높이)는 y가 달라서 x가 가까워도 시각적으로 안 겹침.
const horizontalIds = ids.filter((id) => /horiz|top/i.test(id));
const verticalIds = ids.filter((id) => !/horiz|top/i.test(id));
const overlaps = [];
const checkGroup = (group) => {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const xi = positions[group[i]];
      const xj = positions[group[j]];
      if (!Number.isFinite(xi) || !Number.isFinite(xj)) continue;
      if (Math.abs(xi - xj) < 40) {
        overlaps.push(`${group[i]}(${xi}) ↔ ${group[j]}(${xj})`);
      }
    }
  }
};
checkGroup(horizontalIds);
checkGroup(verticalIds);
check("같은 방향 소자끼리 겹침 없음 (40px 이상 분리)", overlaps.length === 0, overlaps.join(" / ") || "겹침 없음");

// I와 C는 가로(horiz), V와 L은 세로(leg)
const iComp = netlist.components.find((c) => c.type === "I");
const cComp = netlist.components.find((c) => c.type === "C");
const vComp = netlist.components.find((c) => c.type === "V");
const lComp = netlist.components.find((c) => c.type === "L");
check("I는 가로(horiz) 위치", /horiz/i.test(iComp?.id ?? ""), iComp?.id);
check("C는 가로(horiz/top) 위치", /horiz|top/i.test(cComp?.id ?? ""), cComp?.id);
check("V는 세로(leg) 위치", /leg/i.test(vComp?.id ?? ""), vComp?.id);
check("L은 세로(leg) 위치", /leg/i.test(lComp?.id ?? ""), lComp?.id);

// ─── 결과 ─────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n=== ${failures}개 검증 실패 ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== PASS ===");
}
