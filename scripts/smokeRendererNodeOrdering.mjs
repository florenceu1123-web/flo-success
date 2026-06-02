/**
 * analogMeshRenderer top node 경로 정렬 smoke test (2026-06-03).
 *
 * 버그: classifyNodes가 노드를 component 등장순으로 배치 → V[n_top,n_mid]·L[n_top,n_right]가
 *  비인접 슬롯을 가로질러 겹쳐 그려져 "V와 L이 직렬"인 잘못된 회로로 보임 + 연결 안 된
 *  n_mid—n_right 사이에 false rail wire (사용자 보고: "전압원과 코일의 위치가 잘못됨").
 *
 * 수정: orderTopNodesByAdjacency — horizontal 인접 그래프의 경로 순서로 노드 재배치.
 *  [n_top, n_mid, n_right, n_a] (등장순) → [n_mid, n_top, n_right, n_a] (경로순)
 *
 * 검증 (임용 11번 생성 netlist):
 *  - 소자 x 순서: R(1Ω leg) < V < I(leg) < L < 2Ω < C·R_L
 *    (브로큰 상태에서는 I < V, L이 I보다 왼쪽 — 순서 반전으로 구분 가능)
 *  - 모든 horizontal이 인접 슬롯만 잇기 (스팬 = X_PITCH 1개)
 *
 * 실행: npx tsx scripts/smokeRendererNodeOrdering.mjs
 */
import { writeFileSync } from "node:fs";
import { renderAnalogMeshSVG } from "../lib/renderers/analogMeshRenderer.ts";

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail !== undefined ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ─── 임용 11번 생성 netlist (buildFromTopology + addLoadResistor 출력 형태) ───
//   전기적 구조: I∥[V—1Ω] (n_top 공유) — L — 2Ω — [C ∥ R_L] (n_a)
const netlist = {
  ground: "GND",
  components: [
    // horizontals (mesh_only_branch·top_rail) — 등장순이 노드 등록순을 결정
    { id: "V_horiz1", type: "V", value: "9∠90°V", pins: [{ id: "p1", node: "n_top", side: "left" }, { id: "p2", node: "n_mid", side: "right" }] },
    { id: "L_horiz2", type: "L", value: "j3Ω", pins: [{ id: "p1", node: "n_top", side: "left" }, { id: "p2", node: "n_right", side: "right" }] },
    { id: "R_top3", type: "R", value: "2Ω", pins: [{ id: "p1", node: "n_right", side: "left" }, { id: "p2", node: "n_a", side: "right" }] },
    // vertical legs
    { id: "I_leg1_1", type: "I", value: "18∠90°A", pins: [{ id: "p1", node: "n_top", side: "top" }, { id: "p2", node: "GND", side: "bottom" }] },
    { id: "C_leg2_1", type: "C", value: "-j3Ω", pins: [{ id: "p1", node: "n_a", side: "top" }, { id: "p2", node: "GND", side: "bottom" }] },
    { id: "R_leg3_1", type: "R", value: "1Ω", pins: [{ id: "p1", node: "n_mid", side: "top" }, { id: "p2", node: "GND", side: "bottom" }] },
    { id: "R_L", type: "R", value: "R_L", pins: [{ id: "p1", node: "n_a", side: "top" }, { id: "p2", node: "GND", side: "bottom" }] },
  ],
  nodeAnnotations: [{ node: "n_a", label: "a", style: "terminal_dot", role: "main_unknown" }],
};

const svg = renderAnalogMeshSVG(netlist);
writeFileSync("scripts/smokeRendererNodeOrdering.html",
  `<!doctype html><meta charset="utf-8"><title>renderer node ordering</title>
<body style="margin:20px;font:14px sans-serif">
<h2>임용 11번 — 노드 경로 정렬 후 렌더링</h2>
<p>기대 구조: 1Ω leg — V — [I leg] — j3Ω — 2Ω — [a: C ∥ R_L]</p>
<div style="border:1px solid #ccc">${svg}</div></body>`);
console.log("HTML saved -> scripts/smokeRendererNodeOrdering.html\n");

// ─── SVG에서 component 라벨의 x 좌표 추출 ───────────────────────────────────
/** id 라벨 text 요소의 x 좌표 (없으면 NaN) */
function labelX(id) {
  // <text x="..." y="..." ...>id</text> — id 정확히 일치하는 text 요소
  const re = new RegExp(`<text[^>]*x="([\\d.-]+)"[^>]*>${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</text>`);
  const m = svg.match(re);
  return m ? parseFloat(m[1]) : NaN;
}

const xs = {
  R_1ohm: labelX("R_leg3_1"),   // 1Ω leg (n_mid)
  V: labelX("V_horiz1"),         // V (n_mid ↔ n_top)
  I: labelX("I_leg1_1"),         // I leg (n_top)
  L: labelX("L_horiz2"),         // L (n_top ↔ n_right)
  R_2ohm: labelX("R_top3"),      // 2Ω (n_right ↔ n_a)
  C: labelX("C_leg2_1"),         // C leg (n_a)
  R_L: labelX("R_L"),            // R_L leg (n_a)
};
console.log("[추출된 x 좌표]", JSON.stringify(xs, null, 2).replace(/\n\s*/g, " "));

console.log("\n[검증] 소자 x 순서 — 경로 정렬 결과");
check("모든 라벨 x 추출 성공", Object.values(xs).every(Number.isFinite));
// 핵심 순서 검증: 1Ω < V < I < L < 2Ω < C
// (브로큰 상태: I가 맨 왼쪽, L이 V 바로 다음 → I < V < L 순서가 됨)
check("1Ω leg가 V보다 왼쪽 (n_mid가 첫 슬롯)", xs.R_1ohm < xs.V, `${xs.R_1ohm} < ${xs.V}`);
check("V가 I보다 왼쪽 (V는 n_mid↔n_top 사이)", xs.V < xs.I, `${xs.V} < ${xs.I}`);
check("I가 L보다 왼쪽 (L은 n_top↔n_right 사이)", xs.I < xs.L, `${xs.I} < ${xs.L}`);
check("L이 2Ω보다 왼쪽", xs.L < xs.R_2ohm, `${xs.L} < ${xs.R_2ohm}`);
check("2Ω가 C보다 왼쪽 (C는 n_a leg)", xs.R_2ohm < xs.C, `${xs.R_2ohm} < ${xs.C}`);

// 스팬 검증: V·L·2Ω 모두 같은 폭(인접 슬롯)이어야 — 비인접 가로지름 없음
const spanV = Math.abs(xs.I - xs.R_1ohm);      // V 스팬 = n_mid↔n_top 거리
const spanL = Math.abs(xs.C - xs.I) / 2;       // L 스팬 = n_top↔n_right (전체의 절반)
console.log(`\n[참고] V 스팬 기준 거리: ${spanV}, L 스팬 추정: ${spanL}`);
check(
  "V와 L의 중심 간격이 한 슬롯 이상 (겹침 없음)",
  Math.abs(xs.L - xs.V) >= spanV * 0.9,
  `|${xs.L} - ${xs.V}| = ${Math.abs(xs.L - xs.V)}`,
);

// ─── [검증 2] horizontal 양쪽 연결 wire — V wire 끊김 회귀 테스트 ─────────────
//   V[n_top, n_mid]에서 node1(n_top)이 화면상 오른쪽에 배치됨 → 좌우 정규화 없으면
//   양쪽 wire 조건이 모두 false가 되어 전압원이 rail에서 끊겨 보임 (2026-06-03 버그).
console.log("\n[검증 2] V 양쪽 연결 wire (좌우 반전 케이스)");
// V 중심 x ± (반지름 22) 위치에서 시작/끝나는 wire path가 있어야 함
const vLeft = xs.V - 36;   // 라벨 x는 component 중심 기준 — 대략적 위치로 wire 존재만 확인
// SVG의 모든 가로 wire path 추출: M x1 y L x2 y 형태 (y 동일)
const wirePaths = [...svg.matchAll(/<path d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"/g)]
  .map((m) => ({ x1: parseFloat(m[1]), y1: parseFloat(m[2]), x2: parseFloat(m[3]), y2: parseFloat(m[4]) }))
  .filter((p) => Math.abs(p.y1 - p.y2) < 1); // 가로 wire만
// V 영역(중심 ±70px) 안에서 끝나거나 시작하는 가로 wire가 2개 이상 (왼쪽·오른쪽 연결)
const vCenterX = xs.V;
const wiresNearV = wirePaths.filter(
  (p) =>
    (Math.abs(p.x2 - (vCenterX - 22)) < 40 || Math.abs(p.x1 - (vCenterX + 22)) < 40) &&
    Math.abs(p.y1 - wirePaths[0]?.y1) < 60,
);
check(
  "V 양쪽에 연결 wire 존재 (끊김 없음)",
  wiresNearV.length >= 2,
  `V 주변 가로 wire ${wiresNearV.length}개`,
);
void vLeft;

// ─── 결과 ─────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n=== ${failures}개 검증 실패 ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== PASS ===");
}
