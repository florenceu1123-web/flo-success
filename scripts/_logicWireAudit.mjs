/**
 * logic_network 배선 품질 감사 — **배선이 게이트 몸통을 지나가는 횟수**를 센다.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_logicWireAudit.mjs
 *
 * 왜 있는가: "게이트에 가려 노드가 안 보인다"는 신고를 개별 패치로 대응하다 보니 고쳤는지
 * 객관적으로 잴 수가 없었다. 이 지표를 0으로 만드는 것을 목표로 라우터를 고친다.
 *
 * 측정 방법: 렌더된 SVG에서 직선 세그먼트(<line>, <path d="M .. L ..">)를 모두 뽑고,
 *   게이트 박스(그 게이트 자신의 핀 stub 영역은 제외)의 **내부를 관통**하는 세그먼트를 센다.
 */
import { __debugGateBoxes, renderLogicNetworkSVG } from "@/lib/renderers/logicNetworkRenderer";

/** SVG에서 직선 세그먼트 추출. */
export function extractSegments(svg) {
  const segs = [];
  for (const m of svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)) {
    segs.push({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] });
  }
  for (const m of svg.matchAll(/<path d="M ?([-\d.]+) ([-\d.]+)((?: L ?[-\d.]+ [-\d.]+)+)"/g)) {
    let cx = +m[1], cy = +m[2];
    for (const p of m[3].matchAll(/L ?([-\d.]+) ([-\d.]+)/g)) {
      const nx = +p[1], ny = +p[2];
      segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
      cx = nx; cy = ny;
    }
  }
  return segs;
}

/** 축 평행 세그먼트가 박스 내부를 관통하는가 (경계 접촉은 제외). */
function crossesBox(s, b, pad = 3) {
  const L = b.x + pad, R = b.x + b.width - pad, T = b.y + pad, B = b.y + b.height - pad;
  if (R <= L || B <= T) return false;
  const horiz = Math.abs(s.y1 - s.y2) < 0.5;
  const vert = Math.abs(s.x1 - s.x2) < 0.5;
  if (horiz) {
    const y = s.y1, x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2);
    return y > T && y < B && x1 < R && x2 > L;
  }
  if (vert) {
    const x = s.x1, y1 = Math.min(s.y1, s.y2), y2 = Math.max(s.y1, s.y2);
    return x > L && x < R && y1 < B && y2 > T;
  }
  return false;
}

/** 한 다이어그램의 관통 건수. */
export function auditDiagram(diagram) {
  const svg = renderLogicNetworkSVG(diagram);
  const boxes = __debugGateBoxes(diagram);
  const segs = extractSegments(svg);
  const hits = [];
  for (const b of boxes) {
    for (const s of segs) if (crossesBox(s, b)) hits.push({ gate: b.id, seg: s });
  }
  return { hits, segCount: segs.length, boxCount: boxes.length };
}

// ── 대표 다이어그램 모음 (여러 archetype) ────────────────────────────────────
const { generateDffNandMuxPair } = await import("@/lib/generation/topologies/dffNandMuxPair");
const { generateShiftRegisterDac, generateCounterDacComparator } =
  await import("@/lib/generation/topologies/counterDacComparator");

const CASES = [];
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let s = 1; s <= 4; s++) {
    const g = generateDffNandMuxPair({ seed: s * 104729, mode });
    CASES.push([`dffNandMux/${mode}/${s}(문제)`, g.circuit]);
    CASES.push([`dffNandMux/${mode}/${s}(정답)`, g.circuitFilled]);
  }
}
for (let s = 1; s <= 3; s++) {
  CASES.push([`tffDac/${s}`, generateShiftRegisterDac({ bits: 3, seed: s * 613, mode: "exam_similar" }).mixedCircuit.logic]);
  CASES.push([`jkCounter/${s}`, generateCounterDacComparator({ seed: s * 7, mode: "exam_similar" }).mixedCircuit.logic]);
}

let total = 0;
const worst = [];
for (const [name, d] of CASES) {
  const { hits } = auditDiagram(d);
  total += hits.length;
  if (hits.length) worst.push(`${name}: ${hits.length}건 (${[...new Set(hits.map((h) => h.gate))].join(",")})`);
}
console.log(`WIRE_THROUGH_GATE=${total}  (케이스 ${CASES.length}개)`);
for (const w of worst.slice(0, 12)) console.log("  " + w);
