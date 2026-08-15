// 임용 27번 — D-FF + 비동기 PR·CLR + A·B 조합논리 → 구간 ㉠~㉢ Q 파형 (dff_preset_clear_regions)
//
//  실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDffPresetClearRegions.mjs
//
//  ★ 재검산은 **생성기를 쓰지 않고** 이 파일 안에 독립 시뮬레이터를 따로 짜서 대조한다
//    (같은 코드를 두 번 부르면 검증이 아니다).
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  DECODE_SIMILAR, DECODE_VARIANT, __spaces,
  generateDffPresetClearRegions, matchesDffPresetClearSignature, modeOf,
} from "../lib/generation/topologies/dffPresetClearRegions.ts";
import { detectDffPresetClearRegions } from "../lib/pipeline/runDffPresetClearRegionsPipeline.ts";
import { renderDffPresetClearCircuit } from "../lib/renderers/dffPresetClearCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
  tags: [], learningObjective: {},
});
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});

// ─────────────────────────────────────────────────────────────
// 1. 라우팅 — 실측 가능한 Vision 요약 변형 (PR·CLR을 흘린 회차 포함)
// ─────────────────────────────────────────────────────────────
const POSITIVE = [
  ["PR/CLR 명시", mk(
    "D 플립플롭 응용 회로의 출력 파형 분석",
    "그림 (가)의 D 플립플롭은 PR(프리셋)과 CLR(클리어) 비동기 입력을 가지며, Q' 출력이 D 입력으로 되먹임된다. 입력 A, B가 논리 게이트를 거쳐 PR과 CLR을 구동한다. 구간 ㉠, ㉡, ㉢에서의 출력 Q의 값을 구한다.",
    ["플립플롭", "비동기 프리셋", "비동기 클리어"], inv("FF", "GATE", "GATE"))],
  ["세트/리셋 어투", mk(
    "플립플롭과 논리 게이트로 구성된 회로의 출력 파형",
    "클럭 신호와 입력 신호 A, B가 주어졌을 때 구간 ㉠~㉢에서 플립플롭 출력 Q의 파형을 구하는 문제이다. 플립플롭의 세트와 리셋 입력이 게이트 출력으로 제어된다.",
    ["순서 논리 회로"], inv("FF", "GATE"))],
  ["★ PR·CLR 통째로 흘린 회차", mk(
    "D 플립플롭 회로의 타이밍 분석",
    "그림 (가) 회로에 인가되는 클럭(CLK)과 입력 신호 A, B의 값이 그림 (나)와 같을 때 구간 ㉠~㉢에서의 출력 Q의 값으로 옳은 것을 고른다.",
    ["D 플립플롭", "파형"], inv("FF"))],
  ["영문 혼용", mk(
    "Flip-flop application circuit",
    "The D flip-flop has asynchronous PRESET and CLEAR inputs driven by gates from A, B. 구간 ㉠·㉡·㉢ 에서의 출력 Q 파형을 구한다.",
    [], inv("FF", "GATE"))],
];
for (const [name, a] of POSITIVE) {
  ok(`감지: ${name}`, matchesDffPresetClearSignature(a) === true);
  ok(`안전망: ${name}`, detectDffPresetClearRegions(a) === true);
  for (const subject of ["digital_logic", "electronics", "mixed_signal"]) {
    const c = classifyCircuitType({ ...a, subjectKey: subject }, subject);
    ok(`분류 ${subject}: ${name}`, c?.type === "dff_preset_clear_regions", `got ${c?.type}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. 형제 양보 — 다른 유형을 뺏지 않는다
// ─────────────────────────────────────────────────────────────
const NEGATIVE = [
  ["ff_with_waveform (임용 8번, A·B·C + 비동기 RESET)", mk(
    "D 플립플롭 + 비동기 RESET 응용 회로",
    "외부 입력 A, B, C로 만든 X가 클럭이 되고 Y가 비동기 RESET을 구동한다. 구간 전체에서 X·Y·Q를 도시하고 X의 최소화된 논리식을 구한다.",
    ["카르노맵"], inv("FF", "GATE", "GATE"))],
  ["async_preset_ripple_counter (FF 3개 카운터)", mk(
    "비동기 SET/RESET D 플립플롭 응용회로",
    "D 플립플롭 3개와 NOR 게이트로 구성된 리플 카운터이다. I₀, I₁, I₂를 비동기로 적재하고 구간 ㉠·㉡에서 출력 Q를 도시한다.",
    ["카운터"], inv("FF", "FF", "FF"))],
  ["jk_sync_counter", mk(
    "JK 플립플롭 동기식 카운터",
    "JK 플립플롭 3개로 구성된 동기식 카운터의 타이밍 도표에서 출력 Q의 파형을 구한다.",
    ["카운터", "상태표"], inv("FF", "FF", "FF"))],
  ["dff_state_design (자율 상태도)", mk(
    "D 플립플롭 2개 상태도 순서회로 설계",
    "상태도를 보고 상태표의 다음 상태 ㉠~㉣을 채우고, D 입력을 카르노맵으로 간략화하여 게이트 ㉮·㉯를 구한다.",
    ["상태도"], inv("FF", "FF"))],
  ["mux_implementation", mk(
    "조합논리회로의 4×1 MUX 등가 구현",
    "주어진 조합논리회로와 동일한 동작을 하는 4×1 MUX 구현에서 ㉠, ㉡의 데이터 입력을 구한다.",
    ["MUX"], inv("GATE"))],
  ["jk_excitation_sop_pos", mk(
    "JK 플립플롭 상태 여기표와 조합논리",
    "여기표의 빈칸 ㉠~㉣을 채우고 J_A의 최소항의 합을 구한 뒤 분배 법칙으로 합의 곱으로 나타낸다.",
    ["여기표"], inv("FF", "FF"))],
  ["logic_condition_sop", mk(
    "동작 조건에 따른 조합논리 간소화",
    "A가 1이면 출력이 1이고 A가 0이면 B와 C가 다를 때만 1이 되는 F의 논리식을 가장 간소화하여 구한다.",
    [], inv())],
];
for (const [name, a] of NEGATIVE) {
  ok(`양보: ${name}`, matchesDffPresetClearSignature(a) === false);
  const c = classifyCircuitType({ ...a, subjectKey: "digital_logic" }, "digital_logic");
  ok(`양보(분류) ${name}`, c?.type !== "dff_preset_clear_regions", `got ${c?.type}`);
}

// ─────────────────────────────────────────────────────────────
// 3. 원본 동작 재현 — 결선이 곧 리셋/세트/토글 판정
// ─────────────────────────────────────────────────────────────
ok("원본 결선: (0,0) → 리셋", modeOf(DECODE_SIMILAR, 0, 0) === "reset");
ok("원본 결선: (0,1) → 세트", modeOf(DECODE_SIMILAR, 0, 1) === "set");
ok("원본 결선: (1,0) → 토글", modeOf(DECODE_SIMILAR, 1, 0) === "toggle");
ok("원본 결선: (1,1) → 토글", modeOf(DECODE_SIMILAR, 1, 1) === "toggle");
// 변형은 인에이블 극성 교환 — A=0에서 토글
ok("변형 결선: (1,1) → 리셋", modeOf(DECODE_VARIANT, 1, 1) === "reset");
ok("변형 결선: (1,0) → 세트", modeOf(DECODE_VARIANT, 1, 0) === "set");
ok("변형 결선: (0,0) → 토글", modeOf(DECODE_VARIANT, 0, 0) === "toggle");
ok("유사·변형 결선이 다르다", JSON.stringify(DECODE_SIMILAR) !== JSON.stringify(DECODE_VARIANT));

ok("값 공간 비어있지 않음(유사)", __spaces.SIMILAR_SPACE.length > 20, `${__spaces.SIMILAR_SPACE.length}`);
ok("값 공간 비어있지 않음(변형)", __spaces.VARIANT_SPACE.length > 20, `${__spaces.VARIANT_SPACE.length}`);

// ─────────────────────────────────────────────────────────────
// 4. 생성물 독립 재검산
// ─────────────────────────────────────────────────────────────
/** 파형 step 샘플에서 시각 t의 값을 읽는다 (zero-order hold). */
function valueAt(samples, t) {
  let v = samples.length ? samples[0].v : 0;
  for (const s of samples) { if (s.t <= t + 1e-9) v = s.v; else break; }
  return v;
}

/** 독립 시뮬레이터 — 생성기 코드를 쓰지 않고 규칙만으로 Q를 다시 만든다. */
function independentQ(regions, decode, initialQ, edgeOffset) {
  const out = []; // {t, q} — 각 클럭 에지 직후의 Q + 구간 시작 시 강제값
  let q = initialQ, pulse = 0;
  for (const r of regions) {
    const from = 2 * pulse;
    const isSet = decode.presetTerm.a === r.a && decode.presetTerm.b === r.b;
    const isClr = decode.clearTerm.a === r.a && decode.clearTerm.b === r.b;
    if (isSet) q = 1;
    else if (isClr) q = 0;
    out.push({ t: from + 0.01, q });
    for (let i = 0; i < r.pulses; i++) {
      const t = 2 * (pulse + i) + edgeOffset;
      if (!isSet && !isClr) q = q === 1 ? 0 : 1;
      out.push({ t: t + 0.01, q });
    }
    pulse += r.pulses;
  }
  return out;
}

let checked = 0, mismatches = 0, monotonicBad = 0, edgeCollide = 0, choiceLeak = 0, stepMissing = 0;
const seenOriginalTuple = [];
const variantDecodesSeen = new Set();
let nandCountBad = 0, similarDecodeDrift = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 0; seed < 24; seed++) {
    const g = generateDffPresetClearRegions({ seed: seed * 7919, index: seed % 3, mode });
    // ★ 결선이 값 공간의 일부다 — 재검산은 생성물이 실제로 쓴 decode로 해야 한다.
    const decode = g.decode;
    checked++;

    // NAND는 원본처럼 항상 4개 (PR·CLR 2개 + 여분 2개)
    const nandTotal = 2 + (g.circuitDiagram.spareGates ?? []).length;
    if (nandTotal !== 4) nandCountBad++;
    if (mode === "exam_variant") variantDecodesSeen.add(`${g.presetExpr}/${g.clearExpr}`);
    // 유사는 원본 결선을 그대로 유지해야 한다(절대규칙 0)
    if (mode === "exam_similar" && JSON.stringify(decode) !== JSON.stringify(DECODE_SIMILAR)) similarDecodeDrift++;

    // (a) Q 파형 = 독립 시뮬레이션
    const qSig = g.waveformSolution.signals.find((s) => s.name === "Q");
    const expect = independentQ(g.regions, decode, g.initialQ, g.clockEdge === "rising" ? 0.5 : 1.5);
    for (const e of expect) {
      if (valueAt(qSig.samples, e.t) !== e.q) { mismatches++; break; }
    }

    // (b) 모든 신호의 t가 순증가 (waveform_time_not_monotonic 방지)
    for (const s of [...g.waveformTemplate.signals, ...g.waveformSolution.signals]) {
      for (let i = 1; i < (s.samples ?? []).length; i++) {
        if (!(s.samples[i].t > s.samples[i - 1].t)) { monotonicBad++; break; }
      }
    }

    // (c) 구간 경계가 클럭 에지와 겹치지 않는다 (경합 문항 방지)
    const edges = [];
    for (let i = 0; i < g.sim.totalPulses; i++) edges.push(2 * i + 0.5, 2 * i + 1.5);
    for (const b of g.sim.bounds) {
      if (edges.some((e) => Math.abs(e - b.from) < 1e-9 || Math.abs(e - b.to) < 1e-9)) edgeCollide++;
    }

    // (d) 원본 튜플 미생성
    const combos = g.regions.map((r) => `${r.a}${r.b}`).join("");
    const pulses = g.regions.map((r) => r.pulses).join("");
    if (combos === "000111" && pulses === "334") seenOriginalTuple.push(`${mode}/${seed}`);

    // (e) 세 동작이 모두 나온다 (원본 학습목표 보존)
    const modes = new Set(g.sim.modes);
    if (modes.size !== 3) mismatches++;
  }
}
ok("생성물 Q 파형 = 독립 시뮬레이션", mismatches === 0, `${mismatches}/${checked} 불일치`);
ok("파형 시각 순증가", monotonicBad === 0, `${monotonicBad}건`);
ok("구간 경계 ≠ 클럭 에지", edgeCollide === 0, `${edgeCollide}건`);
ok("원본 튜플 미생성", seenOriginalTuple.length === 0, seenOriginalTuple.join(","));
ok("NAND는 항상 4개 (원본 부품 수)", nandCountBad === 0, `${nandCountBad}건`);
ok("유사는 원본 결선 유지", similarDecodeDrift === 0, `${similarDecodeDrift}건`);
ok("변형은 결선(인버터 배치)이 다양", variantDecodesSeen.size >= 5, `${variantDecodesSeen.size}종`);
ok("변형 결선에 원본 결선 미포함", !variantDecodesSeen.has("(Ā·B)′/(Ā·B̄)′"));

// ─────────────────────────────────────────────────────────────
// 5. 발문·정답 — 보기 없음 + 3단계 + Q 도시 요구
// ─────────────────────────────────────────────────────────────
const CHOICE_RE = /[①②③④⑤]|고르시오|고른\s*것은|옳은\s*것은|보기\s*중/;
for (const mode of ["exam_similar", "exam_variant"]) {
  const g = generateDffPresetClearRegions({ seed: 5, index: 0, mode });
  // 파이프라인 텍스트는 buildText가 만든다 — 파이프라인을 통째로 부르지 않고 같은 조립을 확인하기 위해
  // 여기서는 생성물 구조(파형 blank·figure 라벨)와 값만 본다. 발문 검사는 아래 pipeline 호출로.
  const qBlank = g.waveformTemplate.signals.find((s) => s.name === "Q");
  ok(`(나) Q는 빈 트랙 (${mode})`, qBlank?.blank === true);
  ok(`(나) 구간 표시 3개 (${mode})`, (g.waveformTemplate.regions ?? []).length === 3);
  ok(`(나) 구간 라벨 ㉠㉡㉢ (${mode})`,
    (g.waveformTemplate.regions ?? []).map((r) => r.label).join("") === "㉠㉡㉢");
  ok(`(가) 인버터 개수 = 반전 입력 수 (${mode})`, (() => {
    const d = g.circuitDiagram;
    const pins = [...d.presetInputs, ...d.clearInputs, ...(d.spareGates ?? []).flat()];
    const wanted = pins.filter((p) => p.inverted).length;
    const svg = renderDffPresetClearCircuit(d);
    // 좌향 인버터는 polygon 3점 + 버블. polygon 개수로 센다(클럭 핀 삼각형 1개 제외).
    const polys = (svg.match(/<polygon /g) ?? []).length;
    return polys === wanted + 1;
  })());
  ok(`(가) NAND 4개 (${mode})`, (() => {
    const svg = renderDffPresetClearCircuit(g.circuitDiagram);
    return (svg.match(/<path d="M676,/g) ?? []).length === 4;
  })());
  void CHOICE_RE;
}

// 파이프라인 텍스트 (GPT 없음 — 결정론)
const { runDffPresetClearRegionsPipeline } = await import("../lib/pipeline/runDffPresetClearRegionsPipeline.ts");
for (const mode of ["exam_similar", "exam_variant"]) {
  const [p] = await runDffPresetClearRegionsPipeline({ analysis: null, mode, count: 1, topicKey: "flipflop_counter" });
  ok(`발문 3단계 (${mode})`, ["[단계 1]", "[단계 2]", "[단계 3]"].every((s) => p.question.includes(s)));
  ok(`발문에 보기 없음 (${mode})`, !CHOICE_RE.test(p.question), p.question.slice(0, 80));
  ok(`발문이 Q 도시를 요구 (${mode})`, /출력\s*Q의\s*파형을[^]*도시/.test(p.question));
  ok(`정답 3단계 (${mode})`, ["[단계 1]", "[단계 2]", "[단계 3]"].every((s) => p.answer.includes(s)));
  ok(`figure 2개 (${mode})`, p.figureVariants.length === 2);
  ok(`(가) 전용 diagramType (${mode})`, p.figureVariants[0].diagramType === "dff_preset_clear_circuit");
  ok(`(나) waveform (${mode})`, p.figureVariants[1].diagramType === "waveform");
  ok(`정답 파형 solutionFigures (${mode})`, (p.solutionFigures ?? []).length === 1);
  ok(`정답 파형에 Q 채워짐 (${mode})`,
    (p.solutionFigures[0].diagram.signals.find((s) => s.name === "Q")?.samples ?? []).length > 0);
}

// ─────────────────────────────────────────────────────────────
// 6. 렌더 구조
// ─────────────────────────────────────────────────────────────
{
  const g = generateDffPresetClearRegions({ seed: 3, index: 0, mode: "exam_similar" });
  const svg = renderDffPresetClearCircuit(g.circuitDiagram);
  ok("렌더: PR 라벨", svg.includes(">PR<"));
  ok("렌더: CLR 라벨", svg.includes(">CLR<"));
  ok("렌더: NAND 4개 (원본 부품 수)", (svg.match(/<path d="M676,/g) ?? []).length === 4);
  // ★ 사용자 지정 — 게이트 입력 옆 신호 부호(A / Ā)는 찍지 않는다.
  //   버스 머리 라벨 "A"·"B"만 각각 1개씩 남아야 한다.
  ok("렌더: 게이트 입력 부호 미표기 (A는 버스 라벨 1개뿐)", (svg.match(/>A</g) ?? []).length === 1,
    `${(svg.match(/>A</g) ?? []).length}개`);
  ok("렌더: 게이트 입력 부호 미표기 (B는 버스 라벨 1개뿐)", (svg.match(/>B</g) ?? []).length === 1,
    `${(svg.match(/>B</g) ?? []).length}개`);
  ok("렌더: 보수 라벨(Ā·B̄) 없음", !svg.includes(">Ā<") && !svg.includes(">B̄<"));
  ok("렌더: D-FF 박스", svg.includes(">D-FF<"));
  ok("렌더: 되먹임 표기", svg.includes("토글 동작"));
  ok("렌더: 입력 버스 A·B", svg.includes(">A<") && svg.includes(">B<"));
  ok("렌더: 클럭 버블 없음(상승 에지)", (svg.match(/<circle /g) ?? []).length >= 4);
  const overlaps = findLabelOverlaps(svg);
  ok("렌더: 라벨 겹침 0", overlaps.length === 0, JSON.stringify(overlaps.slice(0, 3)));

  const falling = renderDffPresetClearCircuit({ ...g.circuitDiagram, clockEdge: "falling" });
  ok("렌더: 하강 에지면 클럭 버블 추가",
    (falling.match(/<circle /g) ?? []).length === (svg.match(/<circle /g) ?? []).length + 1);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} dff_preset_clear_regions smoke: ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;

// ─────────────────────────────────────────────────────────────
// 7. substring 함정 + 2/3 구조 신호 회귀 (2026-08-12 사용자 신고)
// ─────────────────────────────────────────────────────────────
{
  // ★ "리셋"에는 "셋"이 들어 있다 — 리셋만 있는 형제를 PR도 있다고 오판하면 안 된다.
  const resetOnly = mk(
    "D 플립플롭과 비동기 리셋을 갖는 순서 회로",
    "게이트 출력 Y가 플립플롭의 비동기 리셋을 구동하고, 외부 입력 A, B, C로 만든 X가 클럭이 된다. 전체 구간에서 출력 Q를 도시한다.",
    [], inv("FF"));
  ok("함정: '리셋'의 '셋'을 PRESET으로 오판하지 않음", matchesDffPresetClearSignature(resetOnly) === false);

  // 구간 마커를 흘려도 (PR·CLR) + (입력 A·B) 두 신호로 잡힌다 — 신고 회차 재현
  const noRegion = mk(
    "D 플립플롭 응용 회로",
    "프리셋(PR)과 클리어(CLR) 비동기 입력을 갖는 D 플립플롭 회로로, 입력 A, B가 게이트를 거쳐 두 입력을 구동한다. 클럭에 따른 출력 Q를 분석한다.",
    [], inv("FF"));
  ok("신고 재현: 구간 마커 없어도 감지", matchesDffPresetClearSignature(noRegion) === true);

  // PR·CLR을 흘려도 (입력 A·B) + (구간별 출력 Q)로 잡힌다
  const noAsync = mk(
    "플립플롭 회로의 타이밍 분석",
    "클럭(CLK)과 입력 신호 A, B가 주어질 때 구간 ㉠~㉢에서의 출력 Q의 파형을 구한다.",
    [], inv("FF"));
  ok("신고 재현: PR·CLR 흘려도 감지", matchesDffPresetClearSignature(noAsync) === true);

  // 신호가 하나뿐이면 발화하지 않는다 (형제 잠식 방지)
  const oneSignalOnly = mk(
    "플립플롭 출력 파형",
    "클럭에 따른 플립플롭의 출력 Q를 구간 ㉠~㉢에서 도시한다.",
    [], inv("FF"));
  ok("신호 1개면 미발화(형제 보호)", matchesDffPresetClearSignature(oneSignalOnly) === false);
}
console.log(`\n${fail === 0 ? "✅" : "❌"} (누적) ${pass}/${pass + fail}`);
if (fail > 0) process.exitCode = 1;
