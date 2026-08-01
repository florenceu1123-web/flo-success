// MOSFET 출력특성곡선 〈해석 절차〉 3단계 (임용 6번) — 하위 구조 스모크 (API 없음)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeMosfetPinchOffProcedure.mjs
import { detectPinchOffProcedure } from "../lib/pipeline/runBjtCharacteristicCurvePipeline.ts";
import { generateBjtCharacteristicCurve } from "../lib/generation/topologies/bjtCharacteristicCurve.ts";
import { renderCharacteristicCurveSVG } from "../lib/renderers/characteristicCurveRenderer.ts";

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✅ ${l}`); } else { fail++; console.log(`  ❌ ${l}`); } };
const mk = (topic, interpretation, concepts = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: [],
});

// ── (1) 하위 구조 판별 ────────────────────────────────────────────────
console.log("\n[1] 하위 구조 판별 (해석 절차형 ↔ 영역 명칭형)");
const PROC = [
  ["실측형 — 채널 타입/점선/핀치오프", mk("MOSFET 출력특성곡선 해석",
    "게이트 바이어스 V_GS에 따른 드레인 전압 V_DS과 전류 I_D의 특성에서 채널 타입을 판별하고, 드레인 전류가 일정하게 유지되는 지점을 이은 점선의 V_DS·V_GS·V_T 관계식을 구한 뒤 ㉠에 해당하는 채널 상태 용어를 쓴다.",
    ["문턱전압", "채널 형성", "핀치오프", "해석 절차"])],
  ["표현 변형 — '핀치오프' 없이 단계만", mk("MOSFET 채널 형성 관계 해석",
    "V_GS와 V_DS 조건에 따른 채널 형성 관계를 단계별로 해석한다. 드레인 전류가 일정해지는 포화 시작점을 점선으로 표시했고, V_T는 문턱전압이다.",
    ["채널 타입", "문턱전압", "포화 시작"])],
  ["표현 변형 — 관계식 중심", mk("MOSFET 출력특성",
    "각 게이트 전압 조건에서 드레인 전류가 일정하게 유지되기 시작하는 V_DS를 이은 점선의 관계식 V_DS = V_GS - V_T를 구하고 채널 상태를 표현하는 용어를 쓴다.",
    ["드레인", "문턱전압"])],
];
for (const [name, a] of PROC) ok(detectPinchOffProcedure(a) === true, `${name} → 해석 절차형`);

const NAMING = [
  ["기존 형식 — 영역 명칭 + ON/OFF", mk("MOSFET 출력특성곡선 영역 식별",
    "여러 V_GS 값에 따른 I_D-V_DS 특성 곡선에서 ㉠과 ㉡으로 표시된 영역의 명칭과 각 영역에서의 MOSFET 스위칭 동작(ON/OFF)을 쓰시오.",
    ["포화 영역", "차단 영역", "스위칭 동작"])],
  ["기존 형식 — BJT 영역 식별", mk("BJT 출력특성곡선",
    "I_B에 따른 I_C-V_CE 특성 곡선에서 ㉠과 ㉡ 영역의 이름과 BJT의 스위칭 동작(ON/OFF)을 답하시오.",
    ["활성 영역", "포화 영역"])],
  ["비관련 — MOSFET 바이어스 계산", mk("NMOS 바이어스",
    "V_DD와 R_D가 주어진 NMOS 공통소스 회로에서 I_D와 V_D를 구한다.",
    ["포화 영역", "바이어스"])],
];
for (const [name, a] of NAMING) ok(detectPinchOffProcedure(a) === false, `${name} → 기존(영역 명칭)형 유지`);

// ── (2) 생성물 구조 ───────────────────────────────────────────────────
console.log("\n[2] 생성물 구조 (양 모드)");
{
  for (const mode of ["exam_similar", "exam_variant"]) {
    const g = generateBjtCharacteristicCurve({ mode, seed: 3, index: 0, structure: "pinch_off_procedure" });
    const p = g.procedureAnswers;
    ok(g.structure === "pinch_off_procedure", `[${mode}] structure = pinch_off_procedure`);
    ok(g.diagram.device === "mosfet", `[${mode}] device = mosfet`);
    ok((g.diagram.regions ?? []).length === 0, `[${mode}] 영역 음영 없음 (원본은 점선+㉠만)`);
    ok(g.diagram.pinchOffLocus?.marker === "㉠", `[${mode}] 점선 궤적 위 ㉠ 단일 marker`);
    ok(!!p && p.relation === "V_{DS} = V_{GS} - V_T", `[${mode}] 단계2 관계식 V_DS=V_GS−V_T`);
    ok(!!p && /핀치오프/.test(p.termKr), `[${mode}] 단계3 용어 = 핀치오프`);
    const expectKind = mode === "exam_variant" ? "n_depletion" : "n_enhancement";
    ok(g.values.channelKind === expectKind, `[${mode}] 채널 타입 = ${expectKind}`);
    // 곡선: V_GS 수치 라벨 + 차단 trace
    const labels = g.diagram.curves.map((c) => c.label);
    ok(labels.every((l) => /V_GS\s*(=|<)/.test(l)), `[${mode}] 곡선 라벨이 V_GS 수치 표기`);
    ok(labels[labels.length - 1] === "V_GS < V_T", `[${mode}] 마지막은 차단 trace`);
    // knee가 V_GS에 비례해 증가 → 점선 궤적이 우상향 (V_DS=V_GS−V_T)
    const inner = g.diagram.curves.slice(0, -1);
    const kneesDesc = inner.map((c) => c.knee ?? 0);
    ok(kneesDesc.every((k, i) => i === 0 || k <= kneesDesc[i - 1] + 1e-9),
      `[${mode}] 큰 V_GS일수록 포화 시작 V_DS가 큼 (궤적 우상향)`);
  }
  // 증가형은 V_GS가 모두 양수, 공핍형은 0 이하를 포함
  const sim = generateBjtCharacteristicCurve({ mode: "exam_similar", seed: 1, index: 1, structure: "pinch_off_procedure" });
  const varn = generateBjtCharacteristicCurve({ mode: "exam_variant", seed: 1, index: 1, structure: "pinch_off_procedure" });
  ok((sim.values.vgsValues ?? []).every((v) => v > 0), "증가형: V_GS 전부 양수");
  ok((varn.values.vgsValues ?? []).some((v) => v <= 0), "공핍형: V_GS ≤ 0 포함 (V_T<0 근거)");
  // 원본 튜플 제외
  let origHit = 0;
  for (let i = 0; i < 8; i++) {
    const g = generateBjtCharacteristicCurve({ mode: "exam_similar", seed: i, index: i, structure: "pinch_off_procedure" });
    const v = [...(g.values.vgsValues ?? [])].sort((a, b) => a - b).join(",");
    if (v === "2,4,6,8") origHit++;
  }
  ok(origHit === 0, "원본 V_GS 세트(+2,+4,+6,+8) 미생성");
}

// ── (3) 렌더 ──────────────────────────────────────────────────────────
console.log("\n[3] 렌더");
{
  const g = generateBjtCharacteristicCurve({ mode: "exam_similar", seed: 3, index: 0, structure: "pinch_off_procedure" });
  const svg = renderCharacteristicCurveSVG(g.diagram);
  ok(svg.startsWith("<svg"), "SVG 생성");
  ok(svg.includes("stroke-dasharray"), "점선 궤적 렌더");
  ok(svg.includes("㉠"), "㉠ marker 렌더");
  ok(!svg.includes("㉡"), "㉡ 없음 (원본은 marker 1개)");
  ok(svg.includes("V_GS = "), "V_GS 수치 라벨");

  // ★ 회귀: MOSFET 영역 명칭형에서 triode·saturation이 **서로 다른 사각형**이어야 한다
  //   (예전엔 둘 다 좌측 띠로 그려져 ㉡이 ㉠ 위에 덧칠 → ㉠ 소실, 사용자 신고).
  const naming = generateBjtCharacteristicCurve({
    mode: "exam_variant", seed: 2, index: 1, params: { device: "mosfet" },
  });
  const nsvg = renderCharacteristicCurveSVG(naming.diagram);
  const polys = [...nsvg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1]);
  ok(naming.diagram.regions.length === 2, "영역 명칭형: 영역 2개");
  ok(polys.length === 2, `영역 음영 polygon 2개 (실제 ${polys.length})`);
  ok(polys.length === 2 && polys[0] !== polys[1], "★ 두 영역이 서로 다른 위치 (겹침 회귀)");
  ok(nsvg.includes("㉠") && nsvg.includes("㉡"), "㉠·㉡ 둘 다 보임");

  // BJT는 기존 동작 유지 (saturation=좌측 띠, active=우측 평탄)
  const bjt = generateBjtCharacteristicCurve({ mode: "exam_similar", seed: 1, index: 1, params: { device: "bjt" } });
  const bsvg = renderCharacteristicCurveSVG(bjt.diagram);
  const bpolys = [...bsvg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1]);
  ok(bpolys.length === 2 && bpolys[0] !== bpolys[1], "BJT 영역 2개도 서로 다른 위치 (무회귀)");
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
