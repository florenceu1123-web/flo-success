/**
 * **접지 기호는 하나만** — generic netlist 렌더러 회귀 스모크 (사용자 지정 2026-08-10).
 *
 * 예전에는 GND에 붙은 핀마다 기호를 따로 찍어(분산 GND), 같은 전위인데 접지가 여러 개처럼 보였다.
 * 이제 각 핀을 짧은 세로 도선으로 **공통 rail**에 모으고 기호는 rail 중앙에 하나만 그린다.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSingleGroundSymbol.mjs
 */
import { renderNetlistEdgeSVG } from "@/lib/renderers/netlistEdgeRenderer";

let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fail += 1;
};

/** 접지 글리프 개수 = 가장 넓은 가로선(-10 → 10) 등장 횟수. */
const countGnd = (svg) => (svg.match(/x1="-10"/g) ?? []).length;

/** viewBox = "minX minY w h" */
const viewBox = (svg) => {
  const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
  return m ? { minX: +m[1], minY: +m[2], w: +m[3], h: +m[4] } : null;
};

// ─── 1. GND 핀이 여러 개인 회로 ────────────────────────────────────────
console.log("[1] GND 핀 3개 — 기호는 1개로 병합");
{
  const netlist = {
    nodes: ["n1", "n2", "n3", "GND"],
    ground: "GND",
    components: [
      { id: "V1", type: "V", value: "10V", pins: [{ id: "p1", node: "n1", side: "left" }, { id: "p2", node: "GND", side: "right" }] },
      { id: "R1", type: "R", value: "1Ω", pins: [{ id: "p1", node: "n1", side: "left" }, { id: "p2", node: "n2", side: "right" }] },
      { id: "R2", type: "R", value: "2Ω", pins: [{ id: "p1", node: "n2", side: "left" }, { id: "p2", node: "GND", side: "right" }] },
      { id: "R3", type: "R", value: "3Ω", pins: [{ id: "p1", node: "n2", side: "left" }, { id: "p2", node: "n3", side: "right" }] },
      { id: "R4", type: "R", value: "4Ω", pins: [{ id: "p1", node: "n3", side: "left" }, { id: "p2", node: "GND", side: "right" }] },
    ],
    edges: [],
  };
  const svg = renderNetlistEdgeSVG(netlist);
  const n = countGnd(svg);
  check("접지 기호가 정확히 1개", n === 1, `${n}개`);
  check("SVG가 정상 생성", svg.startsWith("<svg") && svg.endsWith("</svg>"));

  // rail이 캔버스 안에 있어야 한다 (아래로 잘리면 접지가 안 보인다).
  const vb = viewBox(svg);
  const glyphY = [...svg.matchAll(/translate\(([-\d.]+),([-\d.]+)\)/g)].map((m) => +m[2]);
  const lowest = Math.max(...glyphY);
  check("접지 기호가 캔버스 안 (잘리지 않음)", vb && lowest + 20 <= vb.minY + vb.h,
    `기호 y=${lowest}, 캔버스 하단=${vb ? vb.minY + vb.h : "?"}`);
}

// ─── 2. GND 핀이 하나뿐이면 기존과 동일 ───────────────────────────────
console.log("\n[2] GND 핀 1개 — 기존 그림 그대로 (rail 없음)");
{
  const netlist = {
    nodes: ["n1", "GND"],
    ground: "GND",
    components: [
      { id: "V1", type: "V", value: "10V", pins: [{ id: "p1", node: "n1", side: "left" }, { id: "p2", node: "GND", side: "right" }] },
      { id: "R1", type: "R", value: "1Ω", pins: [{ id: "p1", node: "n1", side: "left" }, { id: "p2", node: "GND", side: "right" }] },
    ],
    edges: [],
  };
  const svg = renderNetlistEdgeSVG(netlist);
  const n = countGnd(svg);
  check("접지 기호 1개", n === 1, `${n}개`);
}

// ─── 3. GND가 아예 없는 회로 ───────────────────────────────────────────
console.log("\n[3] GND 없는 회로 — 기호 0개");
{
  const netlist = {
    nodes: ["n1", "n2"],
    components: [
      { id: "V1", type: "V", value: "10V", pins: [{ id: "p1", node: "n1", side: "left" }, { id: "p2", node: "n2", side: "right" }] },
      { id: "R1", type: "R", value: "1Ω", pins: [{ id: "p1", node: "n1", side: "left" }, { id: "p2", node: "n2", side: "right" }] },
    ],
    edges: [],
  };
  const svg = renderNetlistEdgeSVG(netlist);
  check("접지 기호 0개", countGnd(svg) === 0, `${countGnd(svg)}개`);
}

// ─── 4. 회로이론 **전용** 렌더러도 접지 1개 ────────────────────────────
//   ※ 전자회로(OPAMP·BJT) 렌더러는 대상이 아니다 — 다중 접지가 관례이고, 억지로 묶으면
//     세로 도선이 소자·OPAMP 본체를 관통한다(시각검증으로 확인, 사용자 지정 2026-08-10).
console.log("\n[4] 회로이론 전용 렌더러 — 그림당 접지 1개");
{
  const { countGroundGlyphs } = await import("./_groundGlyphs.mjs");

  const cases = [];
  const add = async (name, load) => {
    try { cases.push({ name, svg: await load() }); }
    catch (e) { check(`${name} 렌더 가능`, false, String(e).slice(0, 70)); }
  };

  await add("switched_cap_short_rl (임용 7번)", async () => {
    const g = await import("../lib/generation/topologies/switchedCapShortRl.ts");
    const r = await import("../lib/renderers/switchedCapShortRlCircuitRenderer.ts");
    return r.renderSwitchedCapShortRlCircuit(
      g.generateSwitchedCapShortRl({ seed: 1, index: 0, mode: "exam_similar" }).circuitDiagram);
  });
  await add("ac_thevenin_two_box (임용 10번)", async () => {
    const g = await import("../lib/generation/topologies/acTheveninTwoBox.ts");
    const r = await import("../lib/renderers/acTheveninTwoBoxCircuitRenderer.ts");
    return r.renderAcTheveninTwoBoxCircuit(
      g.generateAcTheveninTwoBox({ seed: 1, mode: "exam_similar" }).circuitDiagram);
  });
  // ※ 이 둘은 생성기가 diagram payload를 따로 만들지 않아(파이프라인이 조립) 라벨을 직접 넣는다.
  await add("switched_rlc_source_free (임용 5번)", async () => {
    const r = await import("../lib/renderers/switchedRlcSourceFreeCircuitRenderer.ts");
    return r.renderSwitchedRlcSourceFreeCircuit({
      vsLabel: "25[V]", rsLabel: "10[Ω]", rpLabel: "40[Ω]", r3Label: "60[Ω]",
      cLabel: "2×10⁻³[F]", lLabel: "5[H]",
    });
  });
  await add("rlc_state_equation (임용 6번)", async () => {
    const r = await import("../lib/renderers/rlcStateEquationCircuitRenderer.ts");
    return r.renderRlcStateEquationCircuit({
      r1Label: "1[Ω]", lLabel: "1/5[H]", cLabel: "1/2[F]", r2Label: "2[Ω]",
      vLabel: "V₁[V]", iLabel: "I₁[A]",
    });
  });

  for (const c of cases) {
    const n = countGroundGlyphs(c.svg);
    // ※ 0개는 "접지가 없다"가 아니라 **탐지기가 그 글리프 모양을 모른다**는 뜻일 수도 있다
    //   (렌더러마다 선 폭·간격이 달라 탐지기는 보수적으로 잡는다). 이 단언은 "여러 개가 아니다"만 보장한다.
    check(`${c.name} — 접지 1개 이하`, n <= 1, `${n}개`);
  }
}

console.log(fail === 0 ? "\n=== SINGLE-GROUND SMOKE PASS ===" : `\n=== ${fail} FAILURE(S) ===`);
process.exit(fail === 0 ? 0 : 1);
