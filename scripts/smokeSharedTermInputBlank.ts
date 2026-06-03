/**
 * 공유항·입력결정 (sharedTermInputBlank) smoke — 임용 7번 다중함수 공유항 형식.
 *
 *  결정론 단위 테스트 (GPT/dev 서버 불필요):
 *   [A] classifier — 임용 7번 시그니처 분석 → universal_digital + sharedTermInputBlank param
 *   [B] generator  — 공유항 함수 생성 + 회로 시뮬레이션 (진리표 일치)
 *   [C] pipeline   — 문제 방향 보존 (중복 항 + 입력변수 결정, 출력 합성 아님)
 *
 *  실행: npx tsx scripts/smokeSharedTermInputBlank.ts
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType";
import { generateSharedTermInputBlank } from "../lib/generation/topologies/sharedTermInputBlank";
import { runUniversalDigitalPipeline } from "../lib/pipeline/runUniversalDigitalPipeline";
import type { AnalysisResult, LogicNetworkDiagram } from "../types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

/** 회로 시뮬레이션 — 입력값 할당으로 모든 게이트 출력 계산. */
function simulate(
  diagram: LogicNetworkDiagram,
  inputValues: Record<string, number>,
): Record<string, number> {
  const signals: Record<string, number> = { ...inputValues };
  let remaining = [...diagram.gates];
  for (let p = 0; p < 10 && remaining.length > 0; p++) {
    const next: typeof remaining = [];
    for (const g of remaining) {
      if (g.inputs.some((s) => signals[s] === undefined)) {
        next.push(g);
        continue;
      }
      const vals = g.inputs.map((s) => signals[s]);
      let out: number;
      switch (g.type) {
        case "NOT": out = vals[0] ? 0 : 1; break;
        case "AND": out = vals.every((v) => v === 1) ? 1 : 0; break;
        case "OR":  out = vals.some((v) => v === 1) ? 1 : 0; break;
        case "XOR": out = vals.reduce((a, b) => a ^ b, 0); break;
        default: throw new Error(`unsupported gate ${g.type}`);
      }
      signals[g.output] = out;
    }
    remaining = next;
  }
  if (remaining.length > 0) throw new Error("simulate: 미해결 게이트 잔존");
  return signals;
}

/** 생성 결과의 회로가 함수 진리표와 일치하는지 (마커→변수 정답 대입). */
function verifyCircuitMatchesFunctions(
  gen: ReturnType<typeof generateSharedTermInputBlank>,
): boolean {
  const vars = gen.varNames;
  for (let m = 0; m < 1 << vars.length; m++) {
    const varVal: Record<string, number> = {};
    vars.forEach((v, i) => {
      varVal[v] = (m >> (vars.length - 1 - i)) & 1;
    });
    const inputVal: Record<string, number> = {};
    for (const { marker, variable } of gen.markerAssignment) inputVal[marker] = varVal[variable];
    const signals = simulate(gen.logicNetworkDiagram, inputVal);
    for (let f = 0; f < gen.funcs.length; f++) {
      const expected = gen.funcs[f].minterms.includes(m) ? 1 : 0;
      if (signals[gen.funcNames[f]] !== expected) return false;
    }
  }
  return true;
}

// ── 임용 7번 다중함수 공유항 형식 — 분석 mock (analyzeImage 절대 추출 규칙 준수 출력) ──
const IMYONG7_ANALYSIS = {
  topic: "다중 불 함수 카르노맵 최소화와 조합논리회로 입력 결정",
  interpretation:
    "식 (가)는 3개의 입력변수(X, Y, Z)를 공통으로 갖는 2개의 불 함수 F(X, Y, Z) = Σm(2, 4, 5), " +
    "G(X, Y, Z) = Σm(2, 6, 7)이고, 그림 (나)는 3입력변수 카르노 도(Karnaugh map)에 대한 표현이다. " +
    "그림 (다)는 (가)를 1개의 조합논리회로로 구성한 것이다. " +
    "[단계 1] (나)를 이용하여 F(X, Y, Z)와 G(X, Y, Z)의 카르노 도를 각각 순서대로 구한다. " +
    "[단계 2] [단계 1]의 카르노 도에서 중복되는 논리식 항을 구한다. " +
    "[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여 (다)의 ㉠, ㉡, ㉢에 들어갈 입력변수를 순서대로 구한다.",
  relatedConcepts: ["카르노 맵", "최소화", "불 함수", "조합논리회로", "중복 항", "AND 게이트", "OR 게이트", "NOT 게이트"],
  fillInTheBlanks: [
    { sentence: "[단계 2] [단계 1]의 카르노 도에서 중복되는 논리식 항을 구한다.", answer: "" },
    { sentence: "[단계 3] (다)의 ㉠, ㉡, ㉢에 들어갈 입력변수를 순서대로 구한다.", answer: "" },
  ],
  subjectKey: "digital_logic",
  topicKey: "kmap_sop",
  signals: { inputs: ["X", "Y", "Z"], outputs: ["F", "G"] },
  semantic: {
    hasStateTransition: false,
    hasEquivalentTransformation: false,
    hasWaveformEvolution: false,
    requiresMultiFigure: true,
  },
} as unknown as AnalysisResult;

async function main() {
  // ════════════════════════════════════════════════════════════════
  console.log("\n[A] classifier — 임용 7번 시그니처 → universal_digital + sharedTermInputBlank");
  // ════════════════════════════════════════════════════════════════
  const cls = classifyCircuitType(IMYONG7_ANALYSIS, "digital_logic");
  check("type = universal_digital", cls.type === "universal_digital", cls.type);
  check("params.sharedTermInputBlank = true", cls.params.sharedTermInputBlank === true, cls.reasoning);

  // 부분 열화 케이스 — GPT가 마커를 ⓐⓑⓒ로, "게이트를 결정"으로 잘못 읽었지만 Σm은 보존된 경우
  const degraded = {
    ...IMYONG7_ANALYSIS,
    interpretation:
      "세 개의 입력 변수를 가진 두 개의 불 함수 F(X, Y, Z) = Σm(2, 4, 5)와 G(X, Y, Z) = Σm(2, 6, 7)를 카르노 맵을 통해 " +
      "최소화하고, 논리회로를 구성하여 ⓐ, ⓑ, ⓒ에 들어갈 게이트를 결정하는 문제이다.",
    fillInTheBlanks: [],
    signals: { inputs: [], outputs: [] },
  } as unknown as AnalysisResult;
  const clsDegraded = classifyCircuitType(degraded, "digital_logic");
  check("열화 분석(마커 오독 + Σm 보존)도 감지", clsDegraded.params.sharedTermInputBlank === true,
    clsDegraded.reasoning);

  // 역방향 false-positive 방지 — 임용 8번 (multi-stage 출력 계산, 마커 없음)은 미감지
  const imyong8 = {
    topic: "4-변수 boolean 함수 OR 결합",
    interpretation:
      "ABCD 4-변수 입력에 대해 f_1, f_2, f_3, f_4의 4개 boolean 함수를 K-map으로 표현하고, " +
      "이를 OR 결합하여 최종 출력 Z를 만든다. 각 함수의 최소 SOP를 구하고 Σm(...) 표기를 이용한다.",
    relatedConcepts: ["K-map", "최소 SOP", "Σm", "OR 결합"],
    fillInTheBlanks: [],
    subjectKey: "digital_logic",
    topicKey: "combinational_gate",
    signals: { inputs: ["A", "B", "C", "D"], outputs: ["Z"] },
  } as unknown as AnalysisResult;
  const cls8 = classifyCircuitType(imyong8, "digital_logic");
  check("임용 8번(출력 계산 형식)은 sharedTermInputBlank 미감지",
    cls8.type === "universal_digital" && !cls8.params.sharedTermInputBlank, cls8.reasoning);

  // ════════════════════════════════════════════════════════════════
  console.log("\n[B] generator — 공유항 구조 + 회로 시뮬레이션");
  // ════════════════════════════════════════════════════════════════
  const gen = generateSharedTermInputBlank({
    seed: 42,
    varNames: ["X", "Y", "Z"],
    funcNames: ["F", "G"],
    originalMinterms: [[2, 4, 5], [2, 6, 7]],
    mode: "exam_similar",
  });
  check("함수 2개·3변수", gen.funcs.length === 2 && gen.varNames.length === 3,
    gen.mintermExpressions.join(" / "));
  check("공유항 존재", gen.sharedExpression.length > 0, gen.sharedExpression);
  check("마커 ㉠㉡㉢ + 정답 매핑", gen.markerAssignment.length === 3,
    gen.markerAssignment.map((m) => `${m.marker}=${m.variable}`).join(", "));
  check("빈 K-map (학생 채움)", gen.blankKmapDiagram.rows.every((r) => r.values.every((v) => v === "")));
  const sharedGates = gen.logicNetworkDiagram.gates.filter((g) => g.shared);
  const sharedConsumers = gen.logicNetworkDiagram.gates.filter(
    (g) => sharedGates[0] && g.inputs.includes(sharedGates[0].output),
  );
  check("공유 AND 1개가 F·G 양쪽 OR에 연결", sharedGates.length === 1 && sharedConsumers.length === 2);
  check("회로 ≡ 함수 (전체 진리표 시뮬레이션)", verifyCircuitMatchesFunctions(gen));

  // seed 다양성 — 10개 모두 통과 + 서로 다른 값
  let allOk = true;
  const sigs = new Set<string>();
  for (let s = 0; s < 10; s++) {
    const g = generateSharedTermInputBlank({
      seed: 1000 + s * 7919,
      originalMinterms: [[2, 4, 5], [2, 6, 7]],
      mode: s % 2 === 0 ? "exam_similar" : "exam_variant",
    });
    sigs.add(g.mintermExpressions.join("|"));
    if (!verifyCircuitMatchesFunctions(g)) allOk = false;
  }
  check("seed 10개 (similar·variant 혼합) 모두 시뮬레이션 통과", allOk);
  check("값 다양성 ≥ 5종", sigs.size >= 5, `${sigs.size}종`);

  // ════════════════════════════════════════════════════════════════
  console.log("\n[C] pipeline — 문제 방향 보존 (중복 항 + 입력변수 결정)");
  // ════════════════════════════════════════════════════════════════
  const analysisWithCls = {
    ...IMYONG7_ANALYSIS,
    circuitType: cls,
  } as unknown as AnalysisResult;
  const problems = await runUniversalDigitalPipeline({
    analysis: analysisWithCls,
    mode: "exam_similar",
    count: 2,
    topicKey: "kmap_sop",
  });
  check("문제 2개 생성", problems.length === 2);
  const p = problems[0];
  check("[단계 2] 중복되는 항 방향", p.question.includes("중복되는"), p.question.split("\n")[1]);
  check("[단계 3] 입력변수 결정 방향", p.question.includes("입력변수"), p.question.split("\n")[2]);
  check("출력 합성(multi-stage Z) 방향 아님", !p.question.includes("multi-stage") && !p.question.includes("최종 출력"));
  check("3변수·2함수 앵커", p.conditions.some((c) => c.includes("3개")) && p.conditions.some((c) => c.includes("함수 개수: 2")),
    p.conditions.join(" | "));
  check("정답에 ㉠ 마커 매핑", p.answer.includes("㉠"), p.answer.split("\n")[2]);
  const figs = p.figureVariants ?? [];
  check("figure: 빈 K-map + 회로", figs.some((f) => f.diagramType === "kmap") && figs.some((f) => f.diagramType === "logic_network"),
    figs.map((f) => `${f.role}(${f.diagramType})`).join(", "));
  check("풀이 figure: 채워진 K-map ≥ 2", (p.solutionFigures ?? []).length >= 2);
  // 두 문제가 서로 다른 값 (minterm 셋)
  check("문제 간 값 다양성", problems[0].answer !== problems[1].answer);

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
