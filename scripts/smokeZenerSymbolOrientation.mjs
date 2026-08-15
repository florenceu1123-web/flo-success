/**
 * smokeZenerSymbolOrientation — 제너다이오드 심볼 **방향** 회귀 스모크.
 *
 * ★ 왜 필요한가 (사용자 신고 2026-08-04 "제너 다이오드 방향이 반대 아니야?"):
 *   임용 8번 원본(6배 확대로 확인)은 **캐소드 바가 위 · 삼각형 꼭짓점이 위**다.
 *   션트 레귤레이터에서 항복 전류가 A 노드(+)에서 아래로 흐르므로 캐소드가 위여야 한다.
 *   그런데 `zenerBjtRegulator`·`opampSeriesRegulator` 두 렌더러가 꼭짓점을 **아래(cy+h)** 에 찍고
 *   bar를 삼각형 **밑변 쪽**에 붙여, 주석("cathode 위")과 반대로 그려져 있었다.
 *   ※ 다이오드 심볼의 규칙: **bar(캐소드)는 삼각형의 꼭짓점 쪽**에 붙는다. 밑변 쪽에 붙으면
 *     방향이 뒤집힌 그림이 된다.
 *
 * 검사: 세로 제너 심볼의 (a) 꼭짓점 y < 밑변 y (꼭짓점이 위) (b) 캐소드 bar가 꼭짓점 y와 일치.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeZenerSymbolOrientation.mjs
 */
import { renderZenerBjtRegulatorCircuit } from "../lib/renderers/zenerBjtRegulatorCircuitRenderer.ts";
import { renderOpampSeriesRegulatorCircuit } from "../lib/renderers/opampSeriesRegulatorCircuitRenderer.ts";
import { renderZenerShuntRegulatorCircuit } from "../lib/renderers/zenerShuntRegulatorCircuitRenderer.ts";

let pass = 0;
let fail = 0;
const ok = (name) => { pass++; console.log(`  ok   ${name}`); };
const bad = (name, why) => { fail++; console.log(`  FAIL ${name} — ${why}`); };

/** SVG에서 세로 삼각형(꼭짓점 1개가 x축 중앙) polygon/path를 모두 뽑아 기하를 돌려준다. */
function verticalTriangles(svg) {
  const tris = [];
  for (const m of svg.matchAll(/<polygon points="([^"]+)"/g)) {
    const pts = m[1].trim().split(/\s+/).map((p) => p.split(",").map(Number));
    if (pts.length === 3 && pts.every((p) => p.length === 2 && p.every(Number.isFinite))) tris.push(pts);
  }
  for (const m of svg.matchAll(/<path d="M([\d.-]+),([\d.-]+) L([\d.-]+),([\d.-]+) L([\d.-]+),([\d.-]+) Z"/g)) {
    tris.push([[+m[1], +m[2]], [+m[3], +m[4]], [+m[5], +m[6]]]);
  }
  // 세로 심볼: 두 점의 y가 같고(밑변) 나머지 한 점이 그 사이 x에 있는 것.
  return tris
    .map((pts) => {
      for (let i = 0; i < 3; i++) {
        const a = pts[i], b = pts[(i + 1) % 3], apex = pts[(i + 2) % 3];
        if (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(a[0] - b[0]) > 8) {
          return { baseY: a[1], apexY: apex[1], apexX: apex[0], width: Math.abs(a[0] - b[0]) };
        }
      }
      return null;
    })
    .filter(Boolean);
}

/** 제너 심볼 판정: 삼각형 꼭짓점 y에 가로 bar(line)가 있는가. */
function hasBarAt(svg, y, x) {
  for (const m of svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)) {
    const [x1, y1, x2, y2] = [+m[1], +m[2], +m[3], +m[4]];
    if (Math.abs(y1 - y2) < 0.01 && Math.abs(y1 - y) < 1.5 && Math.abs(x1 - x2) > 8 &&
        x > Math.min(x1, x2) - 6 && x < Math.max(x1, x2) + 6) return true;
  }
  // path 로 그린 Z 형 bar (zenerShunt) — d의 모든 좌표를 뽑아 **연속한 두 점**이 수평인지 본다.
  for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
    const pts = [...m[1].matchAll(/[ML]\s*([\d.-]+),([\d.-]+)/g)].map((p) => [+p[1], +p[2]]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      if (Math.abs(y1 - y2) < 0.01 && Math.abs(y1 - y) < 1.5 && Math.abs(x1 - x2) > 8 &&
          x > Math.min(x1, x2) - 6 && x < Math.max(x1, x2) + 6) return true;
    }
  }
  return false;
}

function checkZener(name, svg) {
  // 제너 삼각형 = 꼭짓점 y에 가로 bar가 붙어 있는 세로 삼각형 (BJT 화살촉·전류 화살표 제외).
  const tris = verticalTriangles(svg);
  const zeners = tris.filter((t) => hasBarAt(svg, t.apexY, t.apexX) || hasBarAt(svg, t.baseY, t.apexX));
  if (zeners.length === 0) { bad(name, "제너 삼각형을 찾지 못함"); return; }
  for (const z of zeners) {
    if (!(z.apexY < z.baseY)) {
      bad(name, `꼭짓점이 아래(apexY=${z.apexY} ≥ baseY=${z.baseY}) — 방향 뒤집힘`);
      return;
    }
    if (!hasBarAt(svg, z.apexY, z.apexX)) {
      bad(name, `캐소드 bar가 꼭짓점(y=${z.apexY})이 아니라 밑변 쪽에 붙음 — 방향 뒤집힘`);
      return;
    }
  }
  ok(`${name} (제너 ${zeners.length}개: 꼭짓점 위 + 캐소드 bar가 꼭짓점 쪽)`);
}

console.log("=== 제너 심볼 방향 (캐소드=위, 꼭짓점=위) ===");

checkZener(
  "zener_bjt_regulator (임용 8번)",
  renderZenerBjtRegulatorCircuit({
    vinLabel: "20V", vzLabel: "V_z = 7.3V", r1Label: "R₁ 120Ω", r2Label: "R₂ 500Ω",
    r3Label: "R₃ 150Ω", r4Label: "R₄", voLabel: "V_o", ilLabel: "I_L", i1Label: "I₁", izLabel: "I_z",
  }),
);

checkZener(
  "opamp_series_regulator (임용 30번)",
  renderOpampSeriesRegulatorCircuit({
    vddLabel: "30V", vzLabel: "V_z = 10V", raLabel: "R_a 20kΩ", rbLabel: "R_b 20kΩ",
    rsLabel: "R_s 1kΩ", rlLabel: "R_L", voLabel: "V_o", unknownRa: false,
  }),
);

checkZener(
  "zener_shunt_regulator (임용 2번, 기준 구현)",
  renderZenerShuntRegulatorCircuit({
    zenerCount: 2, viLabel: "40V", vzLabel: "V_Z = 5V", aLabel: "a", rlLabel: "R_L",
    vrlLabel: "V_RL", izmLabel: "I_ZM = 8mA",
  }),
);

// ★ 자체 검증 — 신고 당시의 잘못된 기하(꼭짓점 아래 + bar가 밑변 쪽)를 반드시 잡아야 한다.
//   이 검사가 없으면 "검사기가 아무것도 안 잡는" 상태로도 스모크가 초록이 된다.
{
  const cx = 100, cy = 100, h = 14;
  const buggy =
    `<svg><polygon points="${cx},${cy + h} ${cx - 10},${cy - h} ${cx + 10},${cy - h}" fill="white"/>` +
    `<line x1="${cx - 11}" y1="${cy - h}" x2="${cx + 11}" y2="${cy - h}" stroke="#111"/></svg>`;
  const before = fail;
  checkZener("(자체검증) 뒤집힌 제너는 FAIL 이어야 함", buggy);
  if (fail > before) {
    fail = before; pass++;
    console.log("  ok   (자체검증) 뒤집힌 기하를 정상적으로 검출함");
  } else {
    pass--; fail++;
    console.log("  FAIL (자체검증) 뒤집힌 기하를 못 잡았다 — 검사기가 무력하다");
  }
}

console.log(`\n=== ${pass}/${pass + fail} pass ===`);
if (fail > 0) process.exit(1);
