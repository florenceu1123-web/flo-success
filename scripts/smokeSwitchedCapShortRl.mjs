/**
 * 스위치가 **커패시터를 단락** → 1차 RL 계단응답 (임용 7번 회로이론) 전용 archetype 스모크.
 *
 * 배경 (사용자 신고 2026-08-10, analyze→generate E2E 실측):
 *   전용 항목이 없어 `switched_rlc_step`(v1: SPDT + 전류원)이 가로챘고, 원본에 **없는 전류원 2A와
 *   SPDT 스위치**가 들어간 회로가 생성됐다(묻는 양도 i_L(t) → v_C(t)). Vision 요약·인벤토리는
 *   정확했다(V:12V·R:4Ω·C:1F·L:2H) — 받아 줄 항목이 없던 것이 원인이다.
 *
 * 검증: 라우팅(실측 요약 포함) · 형제 미탈취 · 원본 물리 · 생성물 독립 재검산 · 표기 · 렌더 구조.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSwitchedCapShortRl.mjs
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { detectSwitchedCapShortRl } from "@/lib/pipeline/runSwitchedCapShortRlPipeline";
import { generateSwitchedCapShortRl } from "@/lib/generation/topologies/switchedCapShortRl";
import { renderSwitchedCapShortRlCircuit } from "@/lib/renderers/switchedCapShortRlCircuitRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fail += 1;
};

const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [],
  componentInventory: inventory, tags: [], learningObjective: {},
});
const inv = (...items) =>
  items.map((s, i) => {
    const idx = s.indexOf(":");
    return { id: `c${i}`, type: s.slice(0, idx), value: s.slice(idx + 1) };
  });

const ORIG_INV = inv("V:12V", "R:4Ω", "C:1F", "L:2H");
const routes = (a, subject = "circuit_theory") =>
  classifyCircuitType(a, subject).type === "switched_cap_short_rl" || detectSwitchedCapShortRl(a);

// ─── 1. 라우팅 ─────────────────────────────────────────────────────────
console.log("[1] 라우팅 — 신고 회차 실측 요약");
const reported = mk(
  "RLC 회로의 과도 응답 분석",
  "이 문제는 스위치가 닫힐 때 RLC 회로의 과도 응답을 분석하는 문제입니다. 인덕터에 흐르는 전류의 초기값을 구하고, " +
    "기초 회로 이론을 이용해 전류의 미분 방정식을 세워 풀이합니다. 마지막으로 초기값을 이용해 완전한 전류 응답을 구합니다.",
  ["과도 응답", "인덕터 전류", "미분 방정식", "직류 정상상태"],
  ORIG_INV,
);
check("실측 요약 → 전용 archetype", routes(reported));
check("과목을 잘못 골라도(전자회로) 잡힌다", routes(reported, "electronics"));

const terse = mk(
  "직류 RLC 회로 해석",
  "스위치가 t=0에서 닫힌 뒤 인덕터에 흐르는 전류 i_L(t)를 구하는 문제이다. t<0에서 회로는 직류 정상상태이다.",
  ["과도응답"],
  ORIG_INV,
);
check("짧은 요약도 잡힌다", routes(terse));

const voltAsk = mk(
  "RLC 과도 응답",
  "스위치가 닫힐 때 인덕터 양단의 전압 v_L(t)를 구하는 과도 응답 문제입니다. 초기값과 시정수를 이용한다.",
  ["과도"],
  ORIG_INV,
);
check("인덕터 '전압'을 묻는 표현도 잡힌다", routes(voltAsk));

// ─── 2. 형제 미탈취 ────────────────────────────────────────────────────
console.log("\n[2] 형제 archetype 양보");

// 임용 5번 — 같은 소자 구성이지만 스위치가 **열린다**(무전원 자연응답).
const sourceFree = mk(
  "RLC 회로의 자연 응답",
  "t=0에서 스위치가 개방되어 전원이 분리된 뒤, 무전원 직렬 RLC 회로의 자연 응답 i(t)를 구하는 문제이다. " +
    "인덕터 전류와 커패시터 전압의 초기값을 구하고 2차 미분방정식을 세운다.",
  ["자연 응답", "임계 제동"],
  inv("V:25V", "R:10Ω", "R:40Ω", "R:60Ω", "C:2mF", "L:5H"),
);
check("스위치가 '열리는' 유형(source_free) 안 뺏김", !routes(sourceFree));

// 임용 9번 v1 — 전류원이 있는 SPDT 유형.
const rlcStep = mk(
  "스위치 RLC 회로의 과도 응답",
  "t=0에서 스위치가 단자 A에서 단자 B로 이동할 때 커패시터 양단 전압 v_C(t)를 구한다. 인덕터 전류의 초기값도 구한다.",
  ["과도 응답", "2차 미분방정식"],
  inv("V:4V", "I:2A", "R:1Ω", "R:1Ω", "R:1Ω", "C:1F", "L:1H"),
);
check("전류원 있는 SPDT 유형(switched_rlc_step) 안 뺏김", !routes(rlcStep));

// 2022 B-5 — 전압원 2개 + 스위치 2개.
const dualSwitch = mk(
  "스위치 2개 RLC 회로의 과도 응답",
  "SW₁이 t=0에서 닫히고 SW₂가 접점 b에서 접점 c로 이동할 때 커패시터 전압 v_c(t)와 인덕터 전류 i₁(t)를 구한다. " +
    "라플라스 변환을 이용한 미분방정식 해석이 필요하다.",
  ["과도 응답", "라플라스"],
  inv("V:1V", "V:2V", "R:4Ω", "R:2Ω", "C:0.5F", "L:1H"),
);
check("전압원 2개 유형(dual_switch) 안 뺏김", !routes(dualSwitch));

// 상태방정식 유형(임용 6번) — 같은 소자 구성이지만 요구가 다르다.
const stateEq = mk(
  "RLC 회로의 상태 방정식",
  "직류 전압원과 전류원을 포함한 RLC 회로에서 인덕터 전류와 커패시터 전압을 상태변수로 하는 상태 방정식의 " +
    "행렬 A와 B를 구하는 문제이다.",
  ["상태 방정식"],
  inv("V:1V", "I:1A", "R:1Ω", "R:2Ω", "C:0.5F", "L:0.2H"),
);
check("상태방정식 유형 안 뺏김", !routes(stateEq));

// C가 없는 RL 스위칭 — 이 archetype이 아니다.
const rlOnly = mk(
  "RL 회로의 과도 응답",
  "스위치가 t=0에서 닫힐 때 인덕터에 흐르는 전류 i_L(t)를 구하는 문제이다.",
  ["과도"],
  inv("V:10V", "R:5Ω", "L:1H"),
);
check("커패시터 없는 RL 유형 안 뺏김", !routes(rlOnly));

// 교류 페이저 유형 — 직류가 아니다.
const acCase = mk(
  "교류 RLC 회로의 페이저 해석",
  "페이저 전압원이 인가된 RLC 회로에서 인덕터 양단의 전압을 구한다. 스위치가 닫힌 상태로 가정한다.",
  ["페이저"],
  inv("V:10∠0°V", "R:1Ω", "C:-j1Ω", "L:j2Ω"),
);
check("교류 페이저 유형 안 뺏김", !routes(acCase));

// ─── 3. 원본 물리 (직접 손검산) ────────────────────────────────────────
console.log("\n[3] 원본 물리 — 12V·4Ω·1F·2H");
{
  const Vs = 12, R = 4, L = 2;
  const iInf = Vs / R, rate = R / L;
  check("i_L(0⁻) = 0 (C가 직류 차단)", true, "정의상 0");
  check("I_∞ = V_s/R = 3A", iInf === 3, `${iInf}`);
  check("1/τ = R/L = 2", rate === 2, `${rate}`);
  const iAt = (t) => iInf * (1 - Math.exp(-rate * t));
  check("i_L(0)=0", Math.abs(iAt(0)) < 1e-12);
  check("i_L(∞)→3", Math.abs(iAt(50) - 3) < 1e-9, `${iAt(50).toFixed(6)}`);
  // v_L(t) = L di/dt = V_s e^{-t/τ}
  const vAt = (t) => L * iInf * rate * Math.exp(-rate * t);
  check("v_L(0) = V_s = 12V", Math.abs(vAt(0) - 12) < 1e-12, `${vAt(0)}`);
}

// ─── 4. 생성물 독립 재검산 ─────────────────────────────────────────────
console.log("\n[4] 생성물 재검산 (양모드 × 24개)");
{
  let bad = 0, origLeak = 0, decimal = 0, sameAsOriginal = 0;
  const seen = { exam_similar: new Set(), exam_variant: new Set() };
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let i = 0; i < 24; i += 1) {
      const g = generateSwitchedCapShortRl({ seed: 1000 + i * 7, index: i, mode });
      const { Vs, R, L, C } = g.values;
      const a = g.answer;
      seen[mode].add(`${Vs}|${R}|${L}|${C}`);

      // 닫힌형 독립 재검산
      const iInf = Vs / R, rate = R / L;
      if (Math.abs(iInf - a.iInf) > 1e-9 || Math.abs(rate - a.rate) > 1e-9) bad += 1;
      if (a.vC0 !== Vs) bad += 1;
      if (a.iL0 !== 0) bad += 1;
      // 정수성 (전역 분수 변환기가 손댈 소수를 만들지 않기 위한 값 규칙)
      if (!Number.isInteger(a.iInf) || !Number.isInteger(a.rate)) decimal += 1;
      // 원본 튜플·원본 도출량 제외
      if (Vs === 12 && R === 4 && L === 2) origLeak += 1;
      if (a.iInf === 3 && a.rate === 2) sameAsOriginal += 1;
      // 최종식 문자열이 값과 일치하는지
      if (!a.iLTex.startsWith(String(a.iInf))) bad += 1;
      if (!a.vLTex.startsWith(String(Vs))) bad += 1;
      // 변형은 전압을 묻는다
      if ((mode === "exam_variant") !== g.asksVoltage) bad += 1;
    }
  }
  check("닫힌형 재검산 불일치 0", bad === 0, `${bad}건`);
  check("I_∞·1/τ가 모두 정수", decimal === 0, `${decimal}건`);
  check("원본 튜플 미생성", origLeak === 0, `${origLeak}건`);
  check("원본과 같은 도출량 미생성", sameAsOriginal === 0, `${sameAsOriginal}건`);
  const overlap = [...seen.exam_similar].filter((k) => seen.exam_variant.has(k));
  check("유사/변형 값 풀 비중첩", overlap.length === 0, `겹침 ${overlap.length}`);
}

// ─── 5. 렌더 구조 ──────────────────────────────────────────────────────
console.log("\n[5] 렌더 구조");
{
  const g = generateSwitchedCapShortRl({ seed: 7, index: 0, mode: "exam_similar" });
  const svg = renderSwitchedCapShortRlCircuit(g.circuitDiagram);
  check("SVG 생성", svg.startsWith("<svg") && svg.endsWith("</svg>"));
  check("소자 라벨 4종 표시",
    [g.circuitDiagram.vLabel, g.circuitDiagram.rLabel, g.circuitDiagram.cLabel, g.circuitDiagram.lLabel]
      .every((l) => svg.includes(l)));
  check("스위치 t=0 라벨", svg.includes("t=0"));
  check("i_L(t) 화살표 라벨", svg.includes("i_L(t)"));
  // ★ 회로이론 관례 — 접지 기호는 하나만.
  const gndCount = (svg.match(/M -10 9|x1="-10" y1="9"/g) ?? []).length;
  check("접지 기호는 정확히 1개", gndCount === 1, `${gndCount}개`);

  const gv = generateSwitchedCapShortRl({ seed: 7, index: 0, mode: "exam_variant" });
  const svgV = renderSwitchedCapShortRlCircuit(gv.circuitDiagram);
  check("변형은 v_L(t) 극성 표시", svgV.includes("v_L(t)") && svgV.includes("+") && svgV.includes("−"));
  check("유사 모드에는 전압 라벨 없음", !svg.includes("v_L(t)"));

  // ★ 라벨 겹침 0 (규칙 #6) — 변형에서 v_L(t)가 인덕터 값 라벨과 포개진 적이 있다(시각검증에서 발견).
  let overlaps = 0, sample = "";
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let i = 0; i < 8; i += 1) {
      const gg = generateSwitchedCapShortRl({ seed: 100 + i * 13, index: i, mode });
      const hits = findLabelOverlaps(renderSwitchedCapShortRlCircuit(gg.circuitDiagram));
      if (hits.length) { overlaps += hits.length; sample = JSON.stringify(hits[0]); }
    }
  }
  check("라벨 겹침 0 (16 케이스)", overlaps === 0, sample);
}

console.log(fail === 0 ? "\n=== SWITCHED-CAP-SHORT-RL SMOKE PASS ===" : `\n=== ${fail} FAILURE(S) ===`);
process.exit(fail === 0 ? 0 : 1);
