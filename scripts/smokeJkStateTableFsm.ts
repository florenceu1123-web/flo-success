/**
 * JK 상태표 FSM (임용 9번 전자) smoke — J-K 플립플롭 상태도 + 상태표 빈칸 형식.
 *
 *  결정론 단위 테스트 (GPT/dev 서버 불필요):
 *   [A] classifier — JK 상태도 시그니처 → fsm + ffTypes=["JK"]·hasStateTable
 *       + 오분류 시나리오 방어 (topicKey=switching_circuit + subject=circuit_theory 교정)
 *   [B] generator  — JK excitation 정합성 (전이 시뮬레이션) + 상태표·상태도·빈칸
 *   [C] pipeline   — 문제 방향 보존 (빈칸 → y 논리식 → J_A·J_B 식)
 *
 *  실행: npx tsx scripts/smokeJkStateTableFsm.ts
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType";
import { generateJkStateTableFsm } from "../lib/generation/topologies/fsm";
import { runFsmPipeline } from "../lib/pipeline/runFsmPipeline";
import { resolveRules } from "../lib/rules";
import { validateProblem } from "../lib/validators";
import type { AnalysisResult, SemanticStructure } from "../types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

// ── 임용 9번 전자 형식 — 분석 mock (analyzeImage 절대 추출 규칙 준수 출력) ──
const IMYONG9_ANALYSIS = {
  topic: "J-K 플립플롭 상태도와 상태표 해석",
  interpretation:
    "그림 (가)는 출력 A를 갖는 J-K 플립플롭과 출력 B를 갖는 J-K 플립플롭으로 구성된 순서논리회로의 상태도이다. " +
    "그림 (나)는 (가)를 상태표로 나타낸 것이다. " +
    "[단계 1] (나)의 ㉠, ㉡, ㉢, ㉣, ㉤, ㉥을 순서대로 구한다. " +
    "[단계 2] (나)를 이용하여 출력 y의 논리식을 구한다. " +
    "[단계 3] J-K 플립플롭의 출력 A와 출력 B에 대한 입력 J_A와 입력 J_B의 최소화된 논리식을 각각 순서대로 구한다.",
  relatedConcepts: ["J-K 플립플롭", "상태도", "상태표", "Mealy", "순서논리회로", "여기표", "K-map 최소화"],
  fillInTheBlanks: [
    { sentence: "[단계 1] (나)의 ㉠, ㉡, ㉢, ㉣, ㉤, ㉥을 순서대로 구한다.", answer: "" },
    { sentence: "[단계 3] 입력 J_A와 입력 J_B의 최소화된 논리식을 각각 순서대로 구한다.", answer: "" },
  ],
  subjectKey: "digital_logic",
  topicKey: "fsm",
  componentInventory: [
    { id: "JKFF_A", type: "JKFF" },
    { id: "JKFF_B", type: "JKFF" },
  ],
  signals: { inputs: ["x", "CLK"], outputs: ["A", "B", "y"] },
  semantic: {
    hasStateTransition: true,
    hasEquivalentTransformation: false,
    hasWaveformEvolution: false,
    requiresMultiFigure: true,
  },
} as unknown as AnalysisResult;

async function main() {
  // ════════════════════════════════════════════════════════════════
  console.log("\n[A] classifier — JK 상태도 시그니처 → fsm (JK 상태표 모드)");
  // ════════════════════════════════════════════════════════════════
  const cls = classifyCircuitType(IMYONG9_ANALYSIS, "digital_logic");
  check("type = fsm", cls.type === "fsm", cls.type);
  check("params.ffTypes = [JK]", JSON.stringify(cls.params.ffTypes) === JSON.stringify(["JK"]), cls.reasoning);
  check("params.hasStateTable = true", cls.params.hasStateTable === true);

  // 오분류 시나리오 1 — GPT가 topicKey=switching_circuit으로 잘못 분석 (실제 사례, dev 로그 07:03)
  const misclassified = {
    ...IMYONG9_ANALYSIS,
    topicKey: "switching_circuit",
  } as unknown as AnalysisResult;
  const clsMis = classifyCircuitType(misclassified, "digital_logic");
  check("topicKey=switching_circuit 잘못 와도 fsm으로 분류",
    clsMis.type === "fsm" && clsMis.params.ffTypes?.includes("JK") === true, clsMis.reasoning);

  // 오분류 시나리오 2 — subject가 circuit_theory로 잘못 선택·분석된 경우 (PRE-SUBJECT 교정)
  const clsWrongSubject = classifyCircuitType(misclassified, "circuit_theory");
  check("subject=circuit_theory로 와도 디지털 교정 → fsm",
    clsWrongSubject.type === "fsm", `${clsWrongSubject.type} (${clsWrongSubject.reasoning})`);
  check("switched_dc 오분류 아님", clsWrongSubject.type !== "switched_dc");

  // 오분류 시나리오 3 — GPT가 "시퀀스 검출기"로 완전 오해석 (실제 사례, dev 로그 07:50)
  //   topic·topicKey 모두 sequence_detector + 추출 규칙이 강제한 D 플립플롭 언급까지 포함.
  //   J-K 키워드가 남아있으면 jkFfGuard로, 없어도 검출 패턴('110')·블록도 부재로 차단되어야 함.
  const seqPoisoned = {
    ...IMYONG9_ANALYSIS,
    topic: "시퀀스 검출기와 상태 전이 해석",
    topicKey: "sequence_detector",
    interpretation:
      "시퀀스 검출기의 상태 전이를 분석하는 문제입니다. J-K 플립플롭 2개로 구성된 순서논리회로의 상태도와 " +
      "상태표를 통해 입력 x에 따른 출력 y를 구하고, D 플립플롭 입력 논리식을 도출하는 과정입니다. " +
      "상태표의 ㉠, ㉡, ㉢, ㉣, ㉤, ㉥ 빈칸을 채웁니다.",
    relatedConcepts: ["시퀀스 검출기", "D 플립플롭", "상태 전이도", "상태표", "Mealy"],
    componentInventory: [
      { id: "DFF_A", type: "DFF" },
      { id: "DFF_B", type: "DFF" },
    ],
  } as unknown as AnalysisResult;
  const clsSeqPoisoned = classifyCircuitType(seqPoisoned, "digital_logic");
  check("시퀀스 검출기 오해석(J-K 언급 잔존)도 sequence_detector 아님 → fsm",
    clsSeqPoisoned.type !== "sequence_detector" && clsSeqPoisoned.type === "fsm", clsSeqPoisoned.type);

  // 완전 오염 (J-K 언급조차 없음) — 검출 패턴·블록도 부재로 sequence_detector만은 차단
  const seqFullyPoisoned = {
    ...seqPoisoned,
    interpretation:
      "시퀀스 검출기의 상태 전이를 분석하는 문제입니다. 상태도와 상태표를 통해 입력에 따른 출력을 구하고, " +
      "D 플립플롭 입력 논리식을 도출합니다. 상태표의 ㉠, ㉡, ㉢, ㉣ 빈칸을 채웁니다.",
    fillInTheBlanks: [],
  } as unknown as AnalysisResult;
  const clsSeqFully = classifyCircuitType(seqFullyPoisoned, "digital_logic");
  check("완전 오염(검출 패턴·블록도 없음)이어도 sequence_detector 차단",
    clsSeqFully.type !== "sequence_detector", clsSeqFully.type);

  // 진짜 시퀀스 검출기 문제 (임용 8번 정보과)는 여전히 sequence_detector로 분류
  const realSeqDetector = {
    topic: "시퀀스 검출기 상태도·상태표 빈칸",
    interpretation:
      "입력 y가 '110'의 순서로 입력될 때 출력 z=1이 되는 시퀀스 검출기. (가) 블록도(y → 검출기 → z), " +
      "(나) 상태도의 ㉠, ㉡, ㉢, ㉣ 빈칸, (다) 상태표(don't care 포함)를 채운다. D 플립플롭 2개(Q_A·Q_B) 사용.",
    relatedConcepts: ["시퀀스 검출기", "D 플립플롭", "상태 전이도", "Mealy", "don't care"],
    fillInTheBlanks: [],
    subjectKey: "digital_logic",
    topicKey: "sequence_detector",
    componentInventory: [
      { id: "DFF_A", type: "DFF" },
      { id: "DFF_B", type: "DFF" },
    ],
    signals: { inputs: ["y", "CLK"], outputs: ["z"] },
  } as unknown as AnalysisResult;
  const clsRealSeq = classifyCircuitType(realSeqDetector, "digital_logic");
  check("진짜 시퀀스 검출기(블록도+'110' 패턴)는 sequence_detector 유지",
    clsRealSeq.type === "sequence_detector", clsRealSeq.type);

  // false-positive 방어 — T-FF 상태표 (임용 7번 정보과)는 tff_state_table_blank 유지
  const tffAnalysis = {
    topic: "T 플립플롭 상태표 해석",
    interpretation:
      "T 플립플롭 A와 B 2개 + 입력 C로 구성된 순서논리회로. (나) 상태표의 ㉠~㉧ 빈칸을 채우고 " +
      "Q_A(t+1)·Q_B(t+1)의 카르노맵을 작성하여 최소화된 불 함수를 구한다. 현재 상태와 다음 상태 분석.",
    relatedConcepts: ["T 플립플롭", "상태표", "K-map 최소화"],
    fillInTheBlanks: [],
    subjectKey: "digital_logic",
    topicKey: "flipflop_counter",
    componentInventory: [
      { id: "TFF_A", type: "TFF" },
      { id: "TFF_B", type: "TFF" },
    ],
    signals: { inputs: ["C", "CLK"], outputs: ["Q_A", "Q_B"] },
  } as unknown as AnalysisResult;
  const clsTff = classifyCircuitType(tffAnalysis, "digital_logic");
  check("T-FF 상태표 (임용 7번 정보과)는 tff_state_table_blank 유지",
    clsTff.type === "tff_state_table_blank", clsTff.type);

  // ════════════════════════════════════════════════════════════════
  console.log("\n[B] generator — JK excitation 정합성 + 상태표·상태도");
  // ════════════════════════════════════════════════════════════════
  const gen = generateJkStateTableFsm({ seed: 42, mode: "exam_similar" });

  check("상태도 노드 4개 (비트 라벨)", gen.stateDiagram.nodes.length === 4,
    gen.stateDiagram.nodes.map((n) => n.label).join(","));
  check("상태도 에지 8개 (x/y 라벨)", gen.stateDiagram.edges.length === 8);
  check("상태표 4행 × 6 출력 컬럼", gen.stateTable.rows.length === 4 &&
    gen.stateTable.rows.every((r) => (r.outputs ?? []).length === 6));
  check("빈칸 ㉠~㉥ 6개", gen.blankAnswers.length === 6,
    gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`).join(","));
  const blankCellCount = gen.stateTable.rows.reduce(
    (acc, r) => acc + (r.outputs ?? []).filter((v) => typeof v === "string").length, 0);
  check("상태표에 빈칸 셀 6개 (한 행)", blankCellCount === 6);
  check("풀이 상태표는 빈칸 없음", gen.solutionStateTable.rows.every(
    (r) => (r.outputs ?? []).every((v) => typeof v === "number")));
  check("y 논리식 non-trivial", /[+·]/.test(gen.yExpression) || gen.yExpression.length >= 2, gen.yExpression);
  check("J_A·J_B 식 존재", gen.jkExpressions.JA.length > 0 && gen.jkExpressions.JB.length > 0,
    `J_A=${gen.jkExpressions.JA}, J_B=${gen.jkExpressions.JB}`);

  // ── JK excitation 정합성 — J/K 식으로 상태 전이를 시뮬레이션하면 원래 nextState와 일치해야 함
  console.log("\n  [시뮬레이션] JK 여기식 → 전이 재구성 일치");
  const evalSop = (expr: string, a: number, b: number, x: number): number => {
    // sopToString 출력 파싱: "AB' + Ax" 형식. 변수: A, B, x (각 1글자, ' = 보수)
    if (expr === "0") return 0;
    if (expr === "1") return 1;
    const valueOf: Record<string, number> = { A: a, B: b, x };
    return expr.split("+").some((term) => {
      const t = term.trim();
      // term을 literal로 분해: 변수명(1글자) + 선택적 '
      let i = 0;
      while (i < t.length) {
        const v = t[i];
        const inverted = t[i + 1] === "'";
        const val = valueOf[v];
        if (val === undefined) return false;
        if ((inverted ? 1 - val : val) !== 1) return false;
        i += inverted ? 2 : 1;
      }
      return true;
    }) ? 1 : 0;
  };
  let excitationOk = true;
  for (let m = 0; m < 8; m++) {
    const a = (m >> 2) & 1;
    const b = (m >> 1) & 1;
    const x = m & 1;
    const s = (a << 1) | b;
    const expected = gen.nextState[(s << 1) | x];
    // JK 특성식: Q(t+1) = J·Q' + K'·Q
    const ja = evalSop(gen.jkExpressions.JA, a, b, x);
    const ka = evalSop(gen.jkExpressions.KA, a, b, x);
    const jb = evalSop(gen.jkExpressions.JB, a, b, x);
    const kb = evalSop(gen.jkExpressions.KB, a, b, x);
    const aNext = (ja & (1 - a)) | ((1 - ka) & a);
    const bNext = (jb & (1 - b)) | ((1 - kb) & b);
    const actual = (aNext << 1) | bNext;
    if (actual !== expected) {
      excitationOk = false;
      console.log(`    ✗ (A=${a},B=${b},x=${x}): expected ${expected}, got ${actual}`);
    }
  }
  check("JK 특성식 Q(t+1)=JQ'+K'Q로 전이 완전 재구성", excitationOk);

  // seed 다양성
  let allOk = true;
  const sigs = new Set<string>();
  for (let sd = 0; sd < 10; sd++) {
    const g = generateJkStateTableFsm({ seed: 5000 + sd * 7919, mode: sd % 2 === 0 ? "exam_similar" : "exam_variant" });
    sigs.add(g.nextState.join("") + g.output.join(""));
    if (g.blankAnswers.length !== 6) allOk = false;
  }
  check("seed 10개 모두 생성 성공", allOk);
  check("전이 다양성 ≥ 8종", sigs.size >= 8, `${sigs.size}종`);

  // ════════════════════════════════════════════════════════════════
  console.log("\n[C] pipeline — 문제 방향 보존 (빈칸 → y 논리식 → J_A·J_B)");
  // ════════════════════════════════════════════════════════════════
  const analysisWithCls = {
    ...IMYONG9_ANALYSIS,
    circuitType: cls,
  } as unknown as AnalysisResult;
  const problems = await runFsmPipeline({
    analysis: analysisWithCls,
    mode: "exam_similar",
    count: 2,
    topicKey: "fsm",
  });
  check("문제 2개 생성", problems.length === 2);
  const p = problems[0];
  check("본문: J-K 플립플롭 (D 플립플롭 아님)", p.content.includes("J-K 플립플롭") && !p.content.includes("D 플립플롭"));
  check("[단계 1] 상태표 빈칸 방향", p.question.includes("㉠"), p.question.split("\n")[0]);
  check("[단계 2] 출력 y 논리식 방향", p.question.includes("출력 y의 논리식"));
  check("[단계 3] J_A·J_B 방향 (MUX·D_A 아님)", p.question.includes("J_A") && !p.question.includes("MUX") && !p.question.includes("D_A"),
    p.question.split("\n")[2]);
  check("정답: 빈칸 + y + J 식", p.answer.includes("㉠") && p.answer.includes("y =") && p.answer.includes("J_A ="));
  const figs = p.figureVariants ?? [];
  const stateDiagramFig = figs.find((f) => f.diagramType === "concept_diagram");
  check("figure: 상태도 (노드 채워짐)", Boolean(stateDiagramFig) &&
    ((stateDiagramFig?.diagram as { nodes?: unknown[] })?.nodes?.length ?? 0) === 4,
    figs.map((f) => `${f.role}(${f.diagramType})`).join(", "));
  check("figure: 상태표", figs.some((f) => f.diagramType === "truth_table"));
  check("MUX·구현회로 figure 없음 (원본 형식)", !figs.some((f) => f.diagramType === "logic_network"));
  check("풀이 figure: 완성된 상태표", (p.solutionFigures ?? []).length >= 1);
  check("문제 간 값 다양성", problems[0].answer !== problems[1].answer);

  // ════════════════════════════════════════════════════════════════
  console.log("\n[D] validator — 필수 figure role 충족 (missing_figure_variant 회귀 방지)");
  // ════════════════════════════════════════════════════════════════
  //   route.ts와 동일하게 resolveRules에 circuitType + params 전달 (text 없음).
  const semantic: SemanticStructure = {
    hasStateTransition: true,
    hasEquivalentTransformation: false,
    hasWaveformEvolution: false,
    requiresMultiFigure: true,
  };
  const ruleSet = resolveRules({
    subject: "digital_logic",
    topicKey: "fsm",
    semantic,
    circuitType: cls.type,
    circuitTypeParams: cls.params,
  });
  check("ruleSet: implementation_circuit 요구 안 함",
    !ruleSet.requiredFigureRoles.includes("implementation_circuit"),
    ruleSet.requiredFigureRoles.join(", "));
  check("ruleSet: 상태도 + 상태표 요구",
    ruleSet.requiredFigureRoles.includes("state_diagram") && ruleSet.requiredFigureRoles.includes("truth_table"));
  const validation = validateProblem({
    problem: p,
    expected: { subject: "digital_logic", topicKey: "fsm", ruleSet },
  });
  check("validateProblem 통과 (이슈 0)", validation.ok,
    validation.ok ? undefined : validation.issues.map((i) => `${i.rule}: ${i.message}`).join(" / "));

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
