import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildContextHint } from "./_common";
import { generateProblemsJson, generateJsonObject, asStr, asStrArray } from "./_gptGen";
import { SUBJECT_LABEL } from "@/types";
import type {
  AnalysisResult,
  CircuitComponent,
  CircuitNetlist,
  FigureVariant,
  GeneratedProblem,
  LogicGate,
  LogicNetworkDiagram,
  SubjectKey,
  TopicKey,
  TruthTableDiagram,
  WaveformDiagram,
} from "@/types";

const log = createLogger("lib/pipeline/runGptFreePipeline");

/**
 * GPT 자유 생성 파이프라인 (모드: gpt_generated / "GPT생성유형").
 *
 * 업로드한 원본과 **같은 주제·학습목표**를 유지하되 구조는 자유롭게 GPT가 새 문제를 출제한다.
 * 그림이 필요한 문제(타이밍 도표·진리표)는 GPT가 **구조화된 figure**로 함께 출력 → 렌더한다.
 * (회로도 netlist는 GPT 신뢰성이 낮아 제외 — 필요하면 본문 텍스트로 서술.)
 *
 * @returns count개 문제 (필요시 waveform/truth_table 그림 포함)
 */
export async function runGptFreePipeline(args: {
  analysis?: AnalysisResult | null;
  subjectKey: SubjectKey;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, subjectKey, count, topicKey } = args;
  const subjectLabel = SUBJECT_LABEL[subjectKey];
  const topic = analysis?.topic?.trim();
  const ctx =
    buildContextHint(analysis) ??
    "(원본 컨텍스트 없음 — 과목의 일반적인 핵심 주제로 출제)";
  log.info("dispatch", { subject: subjectKey, count, topicKey, topic });

  const system = `당신은 대한민국 중등교사 임용시험 「${subjectLabel}」 과목의 문제 출제·해설 전문가입니다.
주어진 **원본 문제와 같은 주제·학습목표**를 유지하되, 회로/구조/수치는 자유롭게 새로 구성한 문제를 만듭니다.
- ★★ 원본 주제 고정(최우선): 생성 문제는 **반드시 원본과 같은 개념·원리 영역**이어야 합니다. 원본이 다루는 소자·현상·해석 기법을 그대로 시험하세요. 주제를 절대 바꾸지 마세요.
- ★★ **문제 유형(구조) 보존**: 원본의 **소자 구성과 해석 방법**을 유지하세요. 원본에 없던 소자(예: 저항)를 추가하거나 빼서 **문제 유형을 바꾸지 마세요**. 예: 원본이 "이상 인덕터에 전압 파형 v(t)를 주고 i=(1/L)∫v dt로 전류 도출"이면, 저항을 넣어 RL 스텝응답(지수) 문제로 바꾸면 안 됨 — 같은 "인덕터 전압·전류 적분" 유형을 유지하되 파형·값만 변경.
- ★ 핵심 개념 위주: 단순 대입·산수가 아니라, 그 주제를 이해했는지 판별하는 원리·정의·조건·인과관계, 빈출 고난도 논점·오개념을 물으세요.
- ★ 그림: 문제가 그림을 필요로 하면 아래 스키마의 "figures"(배열)로 **구조화해서 출력**하세요(그림으로 렌더됨). 한 문제에 여러 그림 가능(예: 회로도 + 타이밍 도표).
  · **디지털 회로도** → type="logic_network" (플립플롭 JKFF/DFF/TFF·게이트 AND/OR/NOT 등). 신호 연결을 정확히.
  · **아날로그 회로도** → type="analog_circuit" (R·L·C·V(전압원)·I(전류원)·SW·D 등 2단자 소자). 각 소자가 연결되는 두 노드를 지정.
  · **타이밍 도표** → type="waveform". · **진리표/상태표** → type="truth_table".
- ★★ **일관성 필수**: 본문에서 "다음 회로는" / "아래 회로" / "다음 그림"처럼 **그림을 가리키면 반드시 그에 해당하는 figure(logic_network 등)를 함께 출력**하세요. figure를 낼 자신이 없으면, 그림을 가리키지 말고 소자 구성·연결을 본문·조건에 **말로 완전히 서술**하세요(그 서술만으로 회로가 특정되도록). 회로도(logic_network)는 간단하고 배선이 정확할 때만.
- 답과 풀이는 정확해야 하며, 풀이는 근거와 함께 단계적으로 서술하세요.
- ★ 용어(한국어 표준): 외래어 음차 대신 **표준 한국어 물리·전공 용어**를 사용하세요. 특히 "플럭스" → **"선속"**(전기 선속·자기 선속) 또는 문맥에 따라 **"전기력선의 총수"**로 쓰고, 그 외 번역 가능한 외래어(예: "포텐셜"→"전위")도 한국어 용어로 표기하세요. (전문 약어·기호 D·E·V 등은 그대로.)
- 출력은 반드시 JSON 하나. 마크다운 코드펜스 없이 순수 JSON만.`;

  const user = `[원본 분석 컨텍스트]
${ctx}

[생성 요청]
- 과목: ${subjectLabel}
- 원본 주제(반드시 유지): ${topic ?? "(위 컨텍스트의 주제)"}
- 생성 모드: GPT생성유형 (원본과 같은 주제로 구조 자유롭게 새 문제)
- 개수: ${count}개 (서로 상황·수치·발문이 다르게)
- 세부 주제(topicKey): ${topicKey ?? "원본과 동일 주제 유지"}
- ★ 출제 방향: 원본의 **정답·핵심 개념을 앵커**로, 같은 개념 영역의 중요한 인접·심화 개념까지. 단, 원본 주제 영역을 벗어나지 마세요.

[출력 JSON 스키마]
{
  "problems": [
    {
      "content": "문제 상황·제시문. (회로도가 필요하면 여기에 텍스트로 정확히 서술)",
      "conditions": ["주어진 조건·단서 (없으면 빈 배열)"],
      "question": "구하는 것(발문).",
      "answer": "핵심 정답(요지).",
      "solution": "모범 풀이·해설 — 근거와 함께 단계적으로.",
      "figures": [
        // 선택 — 그림이 필요할 때만. 필요없으면 빈 배열 [] 또는 생략.
        // (1) 회로도:
        {
          "type": "logic_network",
          "inputs": ["1"],                 // 외부 입력 신호 (High는 "1", 클럭은 "CLK")
          "outputs": ["Q2","Q1","Q0"],     // 외부 출력 신호
          "gates": [                        // 각 소자: id·type·inputs(신호명)·output(신호명)
            { "id":"FF0", "type":"JKFF", "inputs":["1","1"], "output":"Q0" },
            { "id":"FF1", "type":"JKFF", "inputs":["Q0","Q0"], "output":"Q1" },
            { "id":"G1",  "type":"AND",  "inputs":["Q0","Q1"], "output":"c" },
            { "id":"FF2", "type":"JKFF", "inputs":["c","c"], "output":"Q2" }
          ]
        },
        // (1b) 아날로그 회로도 (R·L·C·전압원 V·전류원 I 등, 각 소자의 두 노드 지정. 접지는 ground):
        {
          "type": "analog_circuit", "ground": "0",
          "components": [
            { "id":"Vs", "kind":"V", "value":"√2∠45°V", "nodes":["1","0"] },
            { "id":"R1", "kind":"R", "value":"1Ω", "nodes":["1","2"] },
            { "id":"L",  "kind":"L", "value":"j2Ω", "nodes":["2","0"] },
            { "id":"Is", "kind":"I", "value":"Is", "nodes":["0","2"] }
          ]
        },
        // (2) 타이밍 도표:
        { "type": "waveform", "signals": [ { "name": "CP", "seq": [1,0,1,0] }, { "name": "Q0", "seq": [0,1,0,1] } ] },
        // (3) 진리표/상태표:
        { "type": "truth_table", "inputs": ["A","B"], "outputs": ["F"], "rows": [ { "in": [0,0], "out": [1] } ] }
      ]
    }
  ]
}
규칙: figures는 그림이 꼭 필요한 문제에만. 각 그림은 해당 type의 키만 채우세요. logic_network는 모든 게이트 입력·output 신호명이 서로 연결되게(입력은 외부입력이거나 다른 게이트 output). 정확히 ${count}개의 problems를 생성.`;

  const raw = await generateProblemsJson({ system, user, label: `gpt_free:${subjectKey}` });

  const problems: GeneratedProblem[] = raw.slice(0, count).map((p, i) => {
    const specs = Array.isArray(p.figures) ? p.figures : p.figure ? [p.figure] : [];
    const figs = specs
      .map((fs, k) => normalizeFigure(fs, i, k))
      .filter((f): f is FigureVariant => f !== null);
    return {
      id: randomUUID(),
      content: normalizeKoreanTerms(asStr(p.content)),
      conditions: asStrArray(p.conditions).map(normalizeKoreanTerms),
      question: normalizeKoreanTerms(asStr(p.question)),
      answer: normalizeKoreanTerms(asStr(p.answer)),
      solution: normalizeKoreanTerms(asStr(p.solution)),
      topicKey,
      figureVariants: figs,
    } satisfies GeneratedProblem;
  });

  // ★ 회로도 안전망: 회로 subject인데 GPT가 본문 생성에 몰려 figure를 빠뜨리는 일이 잦다.
  //   본문이 회로를 서술하는데 렌더 가능한 회로 figure가 없으면, **figure만 별도 focused 호출**로
  //   추출(structured extraction 분리 → 신뢰성↑). 병렬 처리, 실패 시 graceful skip.
  if (CIRCUIT_SUBJECTS.has(subjectKey)) {
    await Promise.all(
      problems.map(async (p, i) => {
        const figs = p.figureVariants ?? [];
        if (figs.some((f) => CIRCUIT_DIAGRAM_TYPES.has(f.diagramType))) return; // 이미 회로도 있음
        const text = `${p.content}\n${p.conditions.join("\n")}\n${p.question}`;
        if (!CIRCUIT_TEXT_RE.test(text)) return; // 회로를 서술하지 않는 문제(순수 공식/개념) → 생략
        const fig = await extractCircuitFigure({ problem: p, subjectKey, subjectLabel, idx: i });
        if (fig) p.figureVariants = [fig, ...figs];
      }),
    );
  }

  return problems;
}

/** GPT 출력 용어 정규화 — 외래어 음차를 표준 한국어 전공 용어로 (프롬프트 규칙의 결정론적 안전망).
 *  [[feedback_gpt_format_normalization]]: GPT 형식 흔들림은 정규화로 흡수. */
function normalizeKoreanTerms(s: string): string {
  if (!s) return s;
  return s
    .replace(/플럭스/g, "선속")
    .replace(/포텐셜/g, "전위")
    .replace(/디스플레이스먼트/g, "변위");
}

/** 회로도가 기본으로 있는(=figure 안전망 대상) subject. */
const CIRCUIT_SUBJECTS = new Set<SubjectKey>([
  "electronics",
  "circuit_theory",
  "digital_logic",
  "mixed_signal",
]);

/** normalizeFigure가 "회로도"로 렌더하는 diagramType 집합(이미 있으면 안전망 생략). */
const CIRCUIT_DIAGRAM_TYPES = new Set<string>([
  "analog_netlist",
  "logic_network",
  "jk_sync_counter_circuit",
  "clean_counter_circuit",
]);

/** 본문이 회로를 서술하는지 판별(회로 소자·구성 키워드). */
const CIRCUIT_TEXT_RE =
  /회로|전압원|전류원|저항|인덕터|커패시터|캐패시터|콘덴서|다이오드|트랜지스터|증폭기|op-?amp|연산\s?증폭|플립\s?플롭|논리\s?게이트|게이트|카운터|레지스터|멀티플렉서|circuit|resistor|inductor|capacitor/i;

/**
 * 문제 하나의 회로도를 **focused 2차 호출**로 추출·정규화한다.
 * 본문 생성과 분리해 모델이 회로 구조화에만 집중 → figure 누락/오류를 크게 줄인다.
 * 회로가 불필요하거나 정규화 실패면 null.
 */
async function extractCircuitFigure(args: {
  problem: GeneratedProblem;
  subjectKey: SubjectKey;
  subjectLabel: string;
  idx: number;
}): Promise<FigureVariant | null> {
  const { problem, subjectKey, subjectLabel, idx } = args;
  const isDigital = subjectKey === "digital_logic";
  const allowBoth = subjectKey === "mixed_signal";

  const analogSchema = `아날로그 회로도 (R·L·C·전압원 V·전류원 I·스위치 SW·다이오드 D 등 2단자 소자, 각 소자의 두 노드 지정, 접지는 ground):
{ "type":"analog_circuit", "ground":"0",
  "components":[
    { "id":"Vs", "kind":"V", "value":"10V",  "nodes":["1","0"] },
    { "id":"R1", "kind":"R", "value":"5Ω",   "nodes":["1","2"] },
    { "id":"L1", "kind":"L", "value":"2H",   "nodes":["2","0"] }
  ] }`;
  const logicSchema = `디지털 회로도 (플립플롭 JKFF/DFF/TFF·게이트 AND/OR/NOT/NAND/NOR/XOR·멀티플렉서 MUX):
{ "type":"logic_network",
  "inputs":["CLK"], "outputs":["Q2","Q1","Q0"],
  "gates":[
    { "id":"FF0","type":"TFF","inputs":["1"],      "output":"Q0" },
    { "id":"FF1","type":"TFF","inputs":["Q0"],     "output":"Q1" },
    { "id":"FF2","type":"TFF","inputs":["Q1"],     "output":"Q2" }
  ] }`;
  const schema = isDigital ? logicSchema : allowBoth ? `${analogSchema}\n또는\n${logicSchema}` : analogSchema;

  const system = `당신은 임용시험 「${subjectLabel}」 회로 문제의 **회로도를 구조화된 JSON으로 변환**하는 도구입니다.
주어진 문제 본문에 서술된 소자·값·연결을 **정확히** 반영한 회로도 figure 하나만 출력합니다.
- 본문에 등장하는 모든 소자를 포함하고, 소자 사이 연결(노드)을 올바르게 지정하세요.
- 소자 값이 본문에 있으면 그대로, 미지수면 기호(예: "R","C")로.
- 설명·마크다운 없이 **순수 JSON 객체 하나만** 출력.`;
  const user = `[문제 본문]
${problem.content}
${problem.conditions.length ? `[조건]\n${problem.conditions.join("\n")}\n` : ""}[질문]
${problem.question}

위 문제의 회로도를 아래 스키마 중 하나의 JSON 객체로만 출력하세요.
${schema}
회로도가 필요 없는 순수 공식·개념 문제라면 {"type":"none"} 만 출력하세요.`;

  const obj = await generateJsonObject({
    system,
    user,
    label: `gpt_free_figure:${subjectKey}`,
    temperature: 0.3,
  });
  if (!obj) return null;
  // {figure:{...}} / {circuit:{...}} / {diagram:{...}} 같은 흔한 래핑 언랩
  const rawFig =
    typeof obj.type === "string"
      ? obj
      : (obj.figure ?? obj.circuit ?? obj.diagram ?? null);
  if (!rawFig || typeof rawFig !== "object") return null;
  if ((rawFig as Record<string, unknown>).type === "none") return null;
  return normalizeFigure(rawFig, idx, 0);
}

const GATE_TYPES = new Set(["NOT", "AND", "OR", "NAND", "NOR", "XOR", "XNOR", "DFF", "TFF", "JKFF", "MUX"]);
const FF_TYPES = new Set(["JKFF", "DFF", "TFF"]);

/** 조합 게이트 평가 (FF·MUX 제외). */
function evalCombGate(type: string, ins: number[]): number | undefined {
  switch (type) {
    case "AND": return ins.reduce((a, b) => a & b, 1);
    case "OR": return ins.reduce((a, b) => a | b, 0);
    case "NAND": return 1 - ins.reduce((a, b) => a & b, 1);
    case "NOR": return 1 - ins.reduce((a, b) => a | b, 0);
    case "XOR": return ins.reduce((a, b) => a ^ b, 0);
    case "XNOR": return 1 - ins.reduce((a, b) => a ^ b, 0);
    case "NOT": return 1 - (ins[0] ?? 0);
    default: return undefined; // MUX 등 미지원
  }
}

/**
 * GPT logic_network가 **표준 3비트 2진 카운터**(FF 출력 Q0·Q1·Q2, 전체 8상태 순환)인지 판별.
 *  맞으면 "up"(000→001→…→111→000) / "down"(000→111→…→001→000), 아니면 null.
 *  → 전용 jk_sync_counter_circuit 렌더러로 깔끔하게 그리기 위함.
 */
function detectBinaryCounter(d: LogicNetworkDiagram): "up" | "down" | null {
  const ffs = d.gates.filter((g) => FF_TYPES.has(g.type));
  if (ffs.length !== 3) return null;
  const comb = d.gates.filter((g) => !FF_TYPES.has(g.type));
  if (comb.some((g) => g.type === "MUX")) return null;
  const bitOf = (name: string): number => { const m = name.match(/(\d)/); return m ? parseInt(m[1], 10) : -1; };
  const ffByBit: (LogicGate | undefined)[] = [undefined, undefined, undefined];
  for (const ff of ffs) { const b = bitOf(ff.output); if (b < 0 || b > 2 || ffByBit[b]) return null; ffByBit[b] = ff; }
  if (!ffByBit[0] || !ffByBit[1] || !ffByBit[2]) return null;

  const nextOf = (state: number): number | null => {
    const sig = new Map<string, number>();
    for (const inp of d.inputs) { if (inp === "1") sig.set(inp, 1); else if (inp === "0") sig.set(inp, 0); }
    for (let b = 0; b < 3; b++) sig.set(ffByBit[b]!.output, (state >> b) & 1);
    // 조합 게이트 위상 평가
    const done = new Set<string>();
    for (let iter = 0; iter < comb.length + 2; iter++) {
      let progress = false;
      for (const g of comb) {
        if (done.has(g.id)) continue;
        if (g.inputs.every((s) => sig.has(s))) {
          const v = evalCombGate(g.type, g.inputs.map((s) => sig.get(s)!));
          if (v === undefined) return null;
          sig.set(g.output, v); done.add(g.id); progress = true;
        }
      }
      if (!progress) break;
    }
    let ns = 0;
    for (let b = 0; b < 3; b++) {
      const ff = ffByBit[b]!; const q = (state >> b) & 1;
      let nq: number;
      if (ff.type === "JKFF") {
        const J = sig.get(ff.inputs[0]), K = sig.get(ff.inputs[1]);
        if (J === undefined || K === undefined) return null;
        nq = (J & (1 - q)) | ((1 - K) & q);
      } else if (ff.type === "TFF") {
        const T = sig.get(ff.inputs[0]); if (T === undefined) return null; nq = q ^ T;
      } else {
        const D = sig.get(ff.inputs[0]); if (D === undefined) return null; nq = D;
      }
      ns |= nq << b;
    }
    return ns;
  };

  const seq: number[] = [];
  let s = 0;
  for (let i = 0; i < 8; i++) { seq.push(s); const n = nextOf(s); if (n === null) return null; s = n; }
  if (s !== 0) return null; // 8클럭 후 000 복귀(전체 순환)
  if (seq.every((v, i) => v === i)) return "up";
  if (seq.every((v, i) => v === (8 - i) % 8)) return "down";
  return null;
}

/** GPT가 낸 figure(logic_network/waveform/truth_table)를 검증·정규화. malformed면 null(그림 생략). */
function normalizeFigure(raw: unknown, idx: number, k: number): FigureVariant | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const type = typeof f.type === "string" ? f.type : "";
  const fid = `fig_${idx + 1}_${k + 1}`;

  if (type === "analog_circuit") {
    const ground = typeof f.ground === "string" ? f.ground : undefined;
    const rawComps = Array.isArray(f.components) ? f.components : [];
    const ALLOWED = new Set(["R", "C", "L", "V", "I", "SW", "D"]);
    const comps: CircuitComponent[] = [];
    const nodeSet = new Set<string>();
    for (const c of rawComps) {
      if (!c || typeof c !== "object") continue;
      const co = c as Record<string, unknown>;
      const id = typeof co.id === "string" ? co.id : "";
      const kind = typeof co.kind === "string" ? co.kind.toUpperCase() : "";
      const value = typeof co.value === "string" || typeof co.value === "number" ? co.value : undefined;
      const nodes = Array.isArray(co.nodes) ? co.nodes.filter((x): x is string => typeof x === "string") : [];
      if (!id || !ALLOWED.has(kind) || nodes.length < 2) continue;
      nodes.forEach((n) => nodeSet.add(n));
      comps.push({
        id, type: kind as CircuitComponent["type"], value,
        pins: [{ id: "a", node: nodes[0], side: "left" }, { id: "b", node: nodes[1], side: "right" }],
      });
    }
    if (comps.length < 2) return null;
    if (ground && !nodeSet.has(ground)) return null;
    const diagram: CircuitNetlist = { components: comps, ...(ground ? { ground } : {}) };
    return { id: fid, label: "회로도", role: "original_circuit", diagramType: "analog_netlist", diagram };
  }

  if (type === "logic_network") {
    const inputs = Array.isArray(f.inputs) ? f.inputs.filter((x): x is string => typeof x === "string") : [];
    const outputs = Array.isArray(f.outputs) ? f.outputs.filter((x): x is string => typeof x === "string") : [];
    const rawGates = Array.isArray(f.gates) ? f.gates : [];
    const gates: LogicGate[] = [];
    for (const g of rawGates) {
      if (!g || typeof g !== "object") continue;
      const go = g as Record<string, unknown>;
      const id = typeof go.id === "string" ? go.id : "";
      const gtype = typeof go.type === "string" ? go.type.toUpperCase() : "";
      const gin = Array.isArray(go.inputs) ? go.inputs.filter((x): x is string => typeof x === "string") : [];
      const output = typeof go.output === "string" ? go.output : "";
      if (!id || !GATE_TYPES.has(gtype) || !output || gin.length === 0) continue;
      const gate: LogicGate = { id, type: gtype as LogicGate["type"], inputs: gin, output };
      if (typeof go.clockSignal === "string") gate.clockSignal = go.clockSignal;
      gates.push(gate);
    }
    if (gates.length === 0 || outputs.length === 0) return null;
    // 연결성 검증: 모든 게이트 입력·clockSignal이 어딘가서 생성되는가(외부입력 or 게이트 output).
    const produced = new Set<string>([...inputs, ...gates.map((g) => g.output)]);
    for (const g of gates) {
      for (const sig of g.inputs) if (!produced.has(sig)) return null;
      if (g.clockSignal && !produced.has(g.clockSignal)) return null;
    }
    for (const o of outputs) if (!produced.has(o)) return null;
    const diagram: LogicNetworkDiagram = { inputs, outputs, gates };
    // ★ 회로 렌더 전환(자동 라우터 회피):
    //   ① 표준 3비트 2진 카운터 → jk_sync_counter_circuit (교과서식 fixed).
    //   ② 그 외 FF 포함 회로(mod-N 등) → clean_counter_circuit (범용 버스식 깔끔).
    //   ③ FF 없는 순수 조합회로 → logic_network (기존 자동 라우터).
    const dir = detectBinaryCounter(diagram);
    if (dir) {
      return { id: fid, label: "회로도", role: "implementation_circuit", diagramType: "jk_sync_counter_circuit", diagram: { direction: dir } };
    }
    const hasFF = gates.some((g) => FF_TYPES.has(g.type));
    if (hasFF && !gates.some((g) => g.type === "MUX")) {
      return { id: fid, label: "회로도", role: "implementation_circuit", diagramType: "clean_counter_circuit", diagram };
    }
    return { id: fid, label: "회로도", role: "implementation_circuit", diagramType: "logic_network", diagram };
  }

  if (type === "waveform") {
    const signals = Array.isArray(f.signals) ? f.signals : [];
    const out: WaveformDiagram["signals"] = [];
    for (const sig of signals) {
      if (!sig || typeof sig !== "object") continue;
      const so = sig as Record<string, unknown>;
      const name = typeof so.name === "string" ? so.name : "";
      const seq = Array.isArray(so.seq)
        ? so.seq.map((v) => (Number(v) ? 1 : 0))
        : [];
      if (!name || seq.length === 0) continue;
      const samples = seq.map((v, t) => ({ t, v }));
      samples.push({ t: seq.length, v: seq[seq.length - 1] });
      out.push({ name, samples, shape: "step" });
    }
    if (out.length === 0) return null;
    const diagram: WaveformDiagram = { signals: out, unit: { time: "T" } };
    return { id: fid, label: "타이밍 도표", role: "waveform", diagramType: "waveform", diagram };
  }

  if (type === "truth_table") {
    const inputs = Array.isArray(f.inputs) ? f.inputs.filter((x): x is string => typeof x === "string") : [];
    const outputs = Array.isArray(f.outputs) ? f.outputs.filter((x): x is string => typeof x === "string") : [];
    const rawRows = Array.isArray(f.rows) ? f.rows : [];
    const rows: TruthTableDiagram["rows"] = [];
    for (const r of rawRows) {
      if (!r || typeof r !== "object") continue;
      const ro = r as Record<string, unknown>;
      const inp = Array.isArray(ro.in) ? ro.in.map((v) => (typeof v === "string" ? v : Number(v))) : [];
      const outp = Array.isArray(ro.out) ? ro.out.map((v) => (typeof v === "string" ? v : Number(v))) : [];
      if (inp.length === 0) continue;
      rows.push({ inputs: inp, outputs: outp });
    }
    if (inputs.length === 0 || rows.length === 0) return null;
    const diagram: TruthTableDiagram = {
      variables: inputs,
      rows,
      ...(outputs.length > 0 ? { outputLabels: outputs } : {}),
    };
    return { id: fid, label: "진리표", role: "truth_table", diagramType: "truth_table", diagram };
  }

  return null;
}
