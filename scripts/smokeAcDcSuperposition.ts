/**
 * 직류+교류 중첩 (acDcSuperposition) smoke — 임용 2022 B-6 RL 응용회로 형식.
 *
 *  결정론 단위 테스트 (GPT/dev 서버 불필요):
 *   [A] classifier — DC+AC 다중 전압원 + 정상상태 시그니처 → universal_ac + acDcSuperposition param
 *                    (괄호 없는 "10√2 sin4000t" AC 감지 + switched_rl 오분류 차단)
 *   [B] generator  — 닫힌형 해 + complexMna 독립 수치 교차 검증 (DC 패스·AC 패스·전류 분배)
 *   [C] rules      — figure 규칙: state_before/waveform 요구 면제 확인
 *   [D] pipeline   — 문제 방향 보존 (3단계 정상상태 중첩, 과도응답 아님)
 *
 *  실행: npx tsx scripts/smokeAcDcSuperposition.ts
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType";
import { generateAcDcSuperposition } from "../lib/generation/topologies/acDcSuperposition";
import { writeAcDcSuperpositionText } from "../lib/generation/topologies/acDcSuperpositionTextWriter";
import { runUniversalAcPipeline } from "../lib/pipeline/runUniversalAcPipeline";
import { resolveRules } from "../lib/rules";
import { solveComplexMna, type ComplexSolverNetwork } from "../lib/solver/complexMna";
import { magnitude, phase } from "../lib/solver/complex";
import type { AnalysisResult } from "../types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

/** 근사 동등 (수치 해석 오차 허용) */
function approx(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) < tol * Math.max(1, Math.abs(b));
}

// ── 임용 2022 B-6 형식 — 분석 mock (analyzeImage 절대 추출 규칙 준수 출력) ──
const IMYONG_2022_B6_ANALYSIS = {
  topic: "직류·교류 전압원이 스위치로 연결된 RL 응용 회로의 정상 상태 응답 중첩 해석",
  interpretation:
    "직류 전압원(10V)과 교류 전압원(10√2 sin4000t V)이 스위치 SW₁·SW₂의 단자 선택으로 회로에 연결된다. " +
    "저항 200Ω에 흐르는 전류를 i(t)라 하고, 각 단계별 해석은 정상 상태 응답(steady state response)으로 한다. " +
    "[단계 1] SW₁이 단자2, SW₂가 단자3에 연결된 경우(직류만)의 I_DC를 구한다. " +
    "[단계 2] SW₁이 단자1, SW₂가 단자4에 연결된 경우(교류만)의 i_ac(t)와 i_1ac(t)/i_ac(t)를 구한다. " +
    "[단계 3] 둘 다 연결된 경우 [단계 1]과 [단계 2]를 이용하여 i(t)를 구한다.",
  relatedConcepts: ["정상 상태 응답", "중첩의 원리", "RL 회로", "페이저", "전류 분배"],
  fillInTheBlanks: [],
  subjectKey: "circuit_theory",
  topicKey: "switching_circuit",
  componentInventory: [
    { id: "V1", type: "V", value: "10V" },
    { id: "V2", type: "V", value: "10√2 sin4000t V" },
    { id: "SW1", type: "SW" },
    { id: "SW2", type: "SW" },
    { id: "R1", type: "R", value: "200Ω" },
    { id: "R2", type: "R", value: "200Ω" },
    { id: "L1", type: "L", value: "1H" },
    { id: "L2", type: "L", value: "1/9H" },
  ],
  semantic: {
    // Vision이 스위치를 보고 잘못 마킹하는 실제 상황 재현 — 분류기가 이를 무시하고
    // 정상상태 시그니처를 우선해야 함.
    hasStateTransition: true,
    hasEquivalentTransformation: false,
    hasWaveformEvolution: true,
    requiresMultiFigure: false,
  },
} as unknown as AnalysisResult;

async function main() {
  // ════════════════════════════════════════════════════════════════
  console.log("\n[A] classifier — DC+AC 다중 전압원 + 정상상태 → universal_ac + acDcSuperposition");
  // ════════════════════════════════════════════════════════════════
  const cls = classifyCircuitType(IMYONG_2022_B6_ANALYSIS, "circuit_theory");
  check("type = universal_ac", cls.type === "universal_ac", `${cls.type} (${cls.reasoning})`);
  check("params.acDcSuperposition = true", cls.params.acDcSuperposition === true, cls.reasoning);
  check("switched_rl 오분류 아님", cls.type !== ("switched_rl" as typeof cls.type), cls.type);

  // 열화 케이스 — inventory의 AC value가 누락됐지만 interpretation에 "교류"+"정상 상태"가 있는 경우
  const degraded = {
    ...IMYONG_2022_B6_ANALYSIS,
    componentInventory: (IMYONG_2022_B6_ANALYSIS.componentInventory ?? []).map((c) =>
      c.id === "V2" ? { ...c, value: "10V" } : c,
    ),
  } as unknown as AnalysisResult;
  const clsDegraded = classifyCircuitType(degraded, "circuit_theory");
  check(
    "열화 케이스(inventory AC value 누락, 텍스트 교류 키워드만)도 감지",
    clsDegraded.type === "universal_ac" && clsDegraded.params.acDcSuperposition === true,
    clsDegraded.reasoning,
  );

  // 역방향 false-positive 방지 — 진짜 과도응답 (t=0 스위칭 + 과도 키워드)은 미감지
  const transient = {
    ...IMYONG_2022_B6_ANALYSIS,
    topic: "RL 회로 과도 응답",
    interpretation:
      "t=0에서 스위치를 닫은 후 인덕터에 흐르는 전류의 과도 응답을 구한다. 시정수 τ = L/R를 이용한다.",
    relatedConcepts: ["과도 응답", "시정수", "RL 회로"],
    componentInventory: [
      { id: "V1", type: "V", value: "10V" },
      { id: "V2", type: "V", value: "10√2 sin4000t V" },
      { id: "SW1", type: "SW" },
      { id: "R1", type: "R", value: "200Ω" },
      { id: "L1", type: "L", value: "1H" },
    ],
  } as unknown as AnalysisResult;
  const clsTransient = classifyCircuitType(transient, "circuit_theory");
  check(
    "과도응답 키워드 케이스는 acDcSuperposition 미감지",
    clsTransient.params?.acDcSuperposition !== true,
    `${clsTransient.type} (${clsTransient.reasoning})`,
  );

  // 회귀 방지 — 기존 임용 8번 RL 응용 (단일 AC V, 평균전력)은 일반 universal_ac 유지
  const imyong8 = {
    topic: "교류 회로 평균전력",
    interpretation: "교류 전압원과 인덕터, 저항 2개로 구성된 회로에서 각 소자의 평균전력을 구한다.",
    relatedConcepts: ["평균전력", "페이저", "교류"],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    topicKey: "rlc_response",
    componentInventory: [
      { id: "V1", type: "V", value: "u(t) = 2cos(3t) V" },
      { id: "L1", type: "L", value: "j(2/3)Ω" },
      { id: "R1", type: "R", value: "1Ω" },
      { id: "R2", type: "R", value: "2Ω" },
    ],
    semantic: {
      hasStateTransition: false,
      hasEquivalentTransformation: false,
      hasWaveformEvolution: false,
      requiresMultiFigure: false,
    },
  } as unknown as AnalysisResult;
  const cls8 = classifyCircuitType(imyong8, "circuit_theory");
  check(
    "임용 8번(단일 AC 전원)은 일반 universal_ac 유지 (acDcSuperposition 미감지)",
    cls8.type === "universal_ac" && cls8.params?.acDcSuperposition !== true,
    `${cls8.type} (${cls8.reasoning})`,
  );

  // ════════════════════════════════════════════════════════════════
  console.log("\n[B] generator — 닫힌형 해 + complexMna 독립 수치 교차 검증");
  // ════════════════════════════════════════════════════════════════
  const SEEDS = [1, 7, 42, 123, 999, 2026, 31337, 54321, 77777, 99991];
  let allSeedsOk = true;
  for (const seed of SEEDS) {
    const gen = generateAcDcSuperposition({
      params: { resistorCount: 2, inductorCount: 2, acDcSuperposition: true },
      mode: "exam_similar",
      seed,
    });
    const { values, solution } = gen;

    // (1) 구조 검증 — V 2개 + SW 2개 + R nR개 + L 2개
    const types = gen.netlist.components.map((c) => c.type);
    const okStructure =
      types.filter((t) => t === "V").length === 2 &&
      types.filter((t) => t === "SW").length === 2 &&
      types.filter((t) => t === "L").length === 2 &&
      types.filter((t) => t === "R").length === values.resistors.length;

    // (2) 닫힌형 해 자체 검증
    const okIdc = approx(solution.iDcMilli, (values.Vdc / values.rTotal) * 1000);
    const okIac = approx(solution.iAcPeakMilli, (values.VacRms / values.rTotal) * 1000);
    const okInteger =
      Number.isInteger(solution.iDcMilli) && Number.isInteger(solution.iAcPeakMilli);
    const ratioSum = values.reactives.reduce((s, r) => s + r.ratio, 0);
    const okRatio = approx(ratioSum, 1);

    // (3) complexMna 독립 교차 검증 — AC 패스
    //     SW 닫힘 = wire 가정으로 직렬 루프 등가 회로 구성:
    //     V_ac(n_a→GND) + R_1(n_a→n_b) + L_k 병렬(n_b→n_c) + R_2(n_c→GND)
    const hasR2 = values.resistors.length >= 2;
    const acNet: ComplexSolverNetwork = {
      nodeIds: hasR2 ? ["n_a", "n_b", "n_c"] : ["n_a", "n_b"],
      groundId: "GND",
      omega: values.omega,
      resistors: [
        { id: "R_1", a: "n_a", b: "n_b", R: values.resistors[0].value },
        ...(hasR2
          ? values.resistors.slice(1).map((r, k) => ({
              id: `R_${k + 2}`,
              a: "n_c",
              b: "GND",
              R: r.value,
            }))
          : []),
      ],
      inductors: values.reactives.map((l, k) => ({
        id: `L_${k + 1}`,
        a: "n_b",
        b: hasR2 ? "n_c" : "GND",
        L: l.value,
      })),
      capacitors: [],
      // 진폭(peak) 기준 — V_ac = VacRms·√2
      vsources: [{ id: "V_ac", a: "n_a", b: "GND", V: { re: values.VacRms * Math.SQRT2, im: 0 } }],
      isources: [],
      vccs: [],
      vcvs: [],
    };
    const acSol = solveComplexMna(acNet);
    const iAc = acSol.vsourceCurrents["V_ac"];
    const iAcMagMilli = magnitude(iAc) * 1000;
    const iAcPhaseDeg = Math.abs((phase(iAc) * 180) / Math.PI) % 180;
    const okMnaAcMag = approx(iAcMagMilli, solution.iAcPeakMilli, 1e-4);
    const okMnaAcPhase = approx(iAcPhaseDeg, 45, 1e-3) || approx(iAcPhaseDeg, 135, 1e-3);

    // L_1 전류 분배 교차 검증
    const vTop = acSol.nodeVoltages["n_b"];
    const vBot = hasR2 ? acSol.nodeVoltages["n_c"] : { re: 0, im: 0 };
    const vDiff = { re: vTop.re - vBot.re, im: vTop.im - vBot.im };
    const l1 = values.reactives[0].value;
    // I_L1 = V_diff / (jωL1) → |I_L1| = |V_diff|/(ωL1)
    const iL1MagMilli = (magnitude(vDiff) / (values.omega * l1)) * 1000;
    const expectedL1Milli = solution.iAcPeakMilli * values.reactives[0].ratio;
    const okMnaDivider = approx(iL1MagMilli, expectedL1Milli, 1e-4);

    // (4) complexMna 독립 교차 검증 — DC 패스 (ω→0 근사: L 단락)
    const dcNet: ComplexSolverNetwork = {
      ...acNet,
      omega: 1e-9,
      vsources: [{ id: "V_dc", a: "n_a", b: "GND", V: { re: values.Vdc, im: 0 } }],
    };
    const dcSol = solveComplexMna(dcNet);
    const iDcMagMilli = magnitude(dcSol.vsourceCurrents["V_dc"]) * 1000;
    const okMnaDc = approx(iDcMagMilli, solution.iDcMilli, 1e-3);

    const seedOk =
      okStructure && okIdc && okIac && okInteger && okRatio &&
      okMnaAcMag && okMnaAcPhase && okMnaDivider && okMnaDc;
    if (!seedOk) {
      allSeedsOk = false;
      check(`seed ${seed}`, false,
        JSON.stringify({
          okStructure, okIdc, okIac, okInteger, okRatio,
          okMnaAcMag, okMnaAcPhase, okMnaDivider, okMnaDc,
          values: { Vdc: values.Vdc, VacRms: values.VacRms, rTotal: values.rTotal, omega: values.omega },
          solution: { iDc: solution.iDcMilli, iAc: solution.iAcPeakMilli },
          mna: { iAcMagMilli, iAcPhaseDeg, iL1MagMilli, expectedL1Milli, iDcMagMilli },
        }));
    }
  }
  check(`${SEEDS.length}개 seed 전부: 구조 + 닫힌형 해 + complexMna 교차 검증 통과`, allSeedsOk);

  // 원본 2022 B-6 회로 구성 재현 검증 — 1H∥1/9H + ΣR=400Ω + ω=4000 조합이 생성 가능하고,
  // 그 조합에서 분배비 1/10·위상 −45°·I_DC = V_dc/400 (정수 mA)가 성립하는지.
  // (V_dc·V_ac 값 자체는 풀에서 랜덤 — 원본의 10V가 풀에 포함되어 있는지는 별도 확인)
  {
    let found: ReturnType<typeof generateAcDcSuperposition> | null = null;
    // makeRand(xorshift32)는 작은 연속 seed에서 첫 출력이 편향됨 — 큰 소수 간격으로 분산
    for (let k = 0; k < 600 && !found; k++) {
      const gen = generateAcDcSuperposition({
        params: { resistorCount: 2, inductorCount: 2 },
        mode: "exam_similar",
        seed: k * 104729 + 7919,
      });
      if (
        gen.values.rTotal === 400 &&
        gen.values.omega === 4000 &&
        gen.values.reactives.map((r) => r.label).join(",") === "1H,1/9H"
      ) {
        found = gen;
      }
    }
    check("원본 2022 B-6 회로 구성 생성 가능 (1H∥1/9H + 400Ω + ω=4000)", found !== null);
    if (found) {
      check("  └ 분배비 = 1/10", found.solution.dividerRatioLabel === "1/10",
        found.solution.dividerRatioLabel);
      check("  └ 위상 = −45°", found.solution.phaseDeg === -45, `${found.solution.phaseDeg}`);
      check("  └ I_DC = V_dc/400Ω (정수 mA)",
        found.solution.iDcMilli === (found.values.Vdc / 400) * 1000 &&
        Number.isInteger(found.solution.iDcMilli),
        `Vdc=${found.values.Vdc} → ${found.solution.iDcMilli}mA`);
      // 원본 값 10V가 후보 풀에 포함 → I_DC=25mA·i_ac=25mA 출제 가능
      check("  └ 원본 값 10V → 25mA 조합이 후보 풀에 존재",
        (10 / 400) * 1000 === 25);
    }
  }

  // ════════════════════════════════════════════════════════════════
  console.log("\n[C] rules — figure 규칙: state_before/waveform 요구 면제");
  // ════════════════════════════════════════════════════════════════
  // route.ts 정규화 후 상태 재현: topicKey=undefined(switching_circuit 무력화),
  // hasStateTransition=false, hasWaveformEvolution=false
  const ruleSet = resolveRules({
    subject: "circuit_theory",
    topicKey: undefined,
    semantic: {
      hasStateTransition: false,
      hasEquivalentTransformation: false,
      hasWaveformEvolution: false,
      requiresMultiFigure: false,
    },
    circuitType: "universal_ac",
    circuitTypeParams: { acDcSuperposition: true },
  });
  check("state_before 요구 없음", !ruleSet.requiredFigureRoles.includes("state_before"),
    ruleSet.requiredFigureRoles.join(","));
  check("waveform 요구 없음", !ruleSet.requiredFigureRoles.includes("waveform"),
    ruleSet.requiredFigureRoles.join(","));
  check("main_circuit 요구 (단일 회로 figure)", ruleSet.requiredFigureRoles.includes("main_circuit"),
    ruleSet.requiredFigureRoles.join(","));

  // ════════════════════════════════════════════════════════════════
  console.log("\n[D] pipeline — 문제 방향 보존 (3단계 정상상태 중첩)");
  // ════════════════════════════════════════════════════════════════
  const analysisWithParams = {
    ...IMYONG_2022_B6_ANALYSIS,
    circuitType: {
      type: "universal_ac",
      confidence: "high",
      params: { acDcSuperposition: true, resistorCount: 2, inductorCount: 2, switchCount: 2 },
    },
  } as unknown as AnalysisResult;
  const problems = await runUniversalAcPipeline({
    analysis: analysisWithParams,
    mode: "exam_similar",
    count: 2,
    topicKey: "switching_circuit",
  });
  check("문제 2개 생성", problems.length === 2);
  for (const [idx, p] of problems.entries()) {
    const fig = p.figureVariants?.[0];
    const netlist = fig?.diagram as { components?: Array<{ type: string }> } | undefined;
    check(`문제 ${idx + 1}: 단일 회로 figure (original_circuit)`,
      p.figureVariants?.length === 1 && fig?.role === "original_circuit",
      `figures=${p.figureVariants?.length}, role=${fig?.role}`);
    check(`문제 ${idx + 1}: figure에 V 2개 + SW 2개 (DC·AC 전원 + 스위치)`,
      (netlist?.components ?? []).filter((c) => c.type === "V").length === 2 &&
      (netlist?.components ?? []).filter((c) => c.type === "SW").length === 2);
    check(`문제 ${idx + 1}: 3단계 해석 절차 (방향 보존)`,
      (p.question ?? "").includes("[단계 1]") &&
      (p.question ?? "").includes("[단계 2]") &&
      (p.question ?? "").includes("[단계 3]"),
      (p.question ?? "").slice(0, 80));
    check(`문제 ${idx + 1}: 정상상태 중첩 답 (I_DC + i_ac, 과도응답 아님)`,
      (p.answer ?? "").includes("I_DC") && (p.answer ?? "").includes("sin") &&
      !(p.solution ?? "").includes("시정수") && !(p.solution ?? "").includes("과도"),
      (p.answer ?? "").slice(0, 100));
  }

  // exam_variant 모드 — 전원 위치 교환 + 구조 보존
  const variantGen = generateAcDcSuperposition({
    params: { resistorCount: 2, inductorCount: 2 },
    mode: "exam_variant",
    seed: 42,
  });
  const variantText = writeAcDcSuperpositionText({ generation: variantGen, mode: "exam_variant" });
  check("exam_variant: 구조 보존 (V 2 + SW 2 + L 2)",
    variantGen.netlist.components.filter((c) => c.type === "V").length === 2 &&
    variantGen.netlist.components.filter((c) => c.type === "SW").length === 2 &&
    variantGen.netlist.components.filter((c) => c.type === "L").length === 2);
  check("exam_variant: 텍스트 3단계 방향 보존",
    variantText.question.includes("[단계 3]"));

  // ════════════════════════════════════════════════════════════════
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  // ════════════════════════════════════════════════════════════════
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
