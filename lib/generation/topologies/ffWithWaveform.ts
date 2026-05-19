import type {
  CircuitTypeParams,
  GenerationMode,
  LogicGate,
  LogicNetworkDiagram,
  WaveformDiagram,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 임용 8번 형식: D-FF + 비동기 RESET + 게이트 응용 회로 + 파형.
 *
 * 외부 입력:   A, B, C  (3개만 — CLK는 외부 입력이 아님)
 * 내부 신호:
 *   X = SOP(A, B, C)  → D-FF의 CLK 핀 (▷)에 연결 (게이트 출력이 곧 클럭)
 *   Y = SOP(A, B, C)  → D-FF의 R 핀 (비동기 RESET)
 *   D 핀 ← Q'(자기 피드백, T-FF처럼 토글 동작)
 * 외부 출력: Q
 *
 * 학생이 요구하는 것:
 *  [단계 1] X에 대한 최소화된 PoS(곱의 합) 형태 구하기 + (나)의 전체 구간에서 X 도시.
 *  [단계 2] (가)의 출력 Y와 D 플립플롭의 출력 Q를 (나)의 전체 구간에서 도시.
 *
 * waveform: A, B, C, CLK, X, Y, Q (CLK는 X와 동일 — 게이트 출력이 클럭).
 */

export type FfWithWaveformGeneration = {
  logicNetworkDiagram: LogicNetworkDiagram;
  /** (나) 문제 템플릿 — 입력 A·B·C·CLK는 채워지고, 학생 도출 대상(X·Y·Q)은 blank */
  waveformTemplate: WaveformDiagram;
  /** (나) 정답 — 모든 신호 채워짐 */
  waveformSolution: WaveformDiagram;
  /** FF 종류 — exam_similar='D', exam_variant='T'. */
  ffType: "D" | "T";
  /** X = SOP(A, B, C) 식 (사람 읽기용) */
  xExpression: string;
  /** Y = SOP(A, B, C) 식 (사람 읽기용) */
  yExpression: string;
  /** 비동기 RESET 포함 — 항상 true (원본 8번 핵심 구조) */
  hasReset: true;
};

/** 3변수 (A, B, C) SOP 후보 — X·Y 식 둘 다 같은 pool에서 추출. 단일 변수형은 제외(학습 가치). */
type Form = {
  expr: string;
  eval: (a: number, b: number, c: number) => number;
};
const SOP_FORMS: Form[] = [
  { expr: "A·B",          eval: (a, b) => a & b },
  { expr: "A·C",          eval: (a, _b, c) => a & c },
  { expr: "B·C",          eval: (_a, b, c) => b & c },
  { expr: "A'·B",         eval: (a, b) => (1 - a) & b },
  { expr: "A'·C",         eval: (a, _b, c) => (1 - a) & c },
  { expr: "B'·C",         eval: (_a, b, c) => (1 - b) & c },
  { expr: "A ⊕ B",        eval: (a, b) => a ^ b },
  { expr: "B ⊕ C",        eval: (_a, b, c) => b ^ c },
  { expr: "A·B + C",      eval: (a, b, c) => (a & b) | c },
  { expr: "A·B + A'·C",   eval: (a, b, c) => (a & b) | ((1 - a) & c) },
  { expr: "A·B + B·C",    eval: (a, b, c) => (a & b) | (b & c) },
  { expr: "A·C + B·C'",   eval: (a, b, c) => (a & c) | (b & (1 - c)) },
  { expr: "A'·B + B·C",   eval: (a, b, c) => ((1 - a) & b) | (b & c) },
];

export function generateFfWithWaveform(args: {
  params?: CircuitTypeParams;
  seed?: number;
  mode?: GenerationMode;
}): FfWithWaveformGeneration {
  const rand = makeRand(args.seed);
  // exam_variant: 사용자 정정 패턴 — ff_type='T' + 게이트 중 하나 XOR(⊕) 강제.
  const isVariant = args.mode === "exam_variant";
  const ffType: "D" | "T" = isVariant ? "T" : "D";

  // X 식과 Y 식 — 서로 다른 식 + 두 식이 합쳐서 A·B·C 셋 모두 변수로 사용.
  // (어느 변수가 어떤 게이트에도 안 들어가면 회로 그림에서 그 입력이 dangling 상태로 보임.)
  const usesAllVars = (xExpr: string, yExpr: string): boolean => {
    const combined = `${xExpr}+${yExpr}`;
    return ["A", "B", "C"].every((v) => new RegExp(`(^|[^A-Z])${v}(?![A-Z])`).test(combined));
  };
  const XOR_FORMS = SOP_FORMS.filter((f) => f.expr.includes("⊕"));
  const NON_XOR_FORMS = SOP_FORMS.filter((f) => !f.expr.includes("⊕"));
  // exam_variant: xForm 또는 yForm 중 하나 강제 XOR.
  let xForm: Form, yForm: Form;
  if (isVariant) {
    xForm = pick(XOR_FORMS, rand);
    yForm = pick(NON_XOR_FORMS, rand);
  } else {
    xForm = pick(SOP_FORMS, rand);
    yForm = pick(SOP_FORMS, rand);
  }
  for (let tries = 0; tries < 40; tries++) {
    if (yForm.expr !== xForm.expr && usesAllVars(xForm.expr, yForm.expr)) break;
    // yForm만 재추출 → 그래도 안 되면 xForm도 재추출
    yForm = pick(isVariant ? NON_XOR_FORMS : SOP_FORMS, rand);
    if (tries % 3 === 2) xForm = pick(isVariant ? XOR_FORMS : SOP_FORMS, rand);
  }
  // 최후 fallback
  if (yForm.expr === xForm.expr || !usesAllVars(xForm.expr, yForm.expr)) {
    if (isVariant) {
      xForm = SOP_FORMS.find((f) => f.expr === "A ⊕ B") ?? xForm;
      yForm = SOP_FORMS.find((f) => f.expr === "B·C") ?? yForm;
    } else {
      xForm = SOP_FORMS.find((f) => f.expr === "A·B + C") ?? xForm;
      yForm = SOP_FORMS.find((f) => f.expr === "B·C") ?? yForm;
    }
  }

  // ===== logic_network 구성 =====
  // A, B, C → X·Y SOP gates. NOT 게이트는 필요한 변수만 자동 추가.
  // Q의 피드백을 위해 NOT(Q)→Q_n도 추가. D-FF: inputs=[Q_n, Y], output=Q, clockSignal=X.
  const gates: LogicGate[] = [];
  const needsNot = new Set<string>();
  const considerNot = (expr: string) => {
    if (expr.includes("A'")) needsNot.add("A");
    if (expr.includes("B'")) needsNot.add("B");
    if (expr.includes("C'")) needsNot.add("C");
  };
  considerNot(xForm.expr);
  considerNot(yForm.expr);
  for (const v of needsNot) {
    gates.push({ id: `G_not_${v}`, type: "NOT", inputs: [v], output: `${v}_n` });
  }

  // SOP expression → 단일 게이트(또는 AND-OR 조합).
  // "A·B" → AND, "A·B + C" → 2 inner gates + 1 OR, "A ⊕ B" → XOR, "A" → alias(=신호 그대로).
  const exprToSignal = (expr: string, outputName: string): string => {
    const norm = expr.replace(/\s+/g, "");
    const sigOf = (s: string) => (s.endsWith("'") ? `${s.slice(0, -1)}_n` : s);
    if (norm.includes("+")) {
      // 각 part가 AND term ("X·Y") 또는 단일 변수.
      const parts = norm.split("+");
      const partOutputs: string[] = [];
      parts.forEach((p, i) => {
        if (p.includes("·")) {
          const ops = p.split("·").map(sigOf);
          const id = `G_and_${outputName}_${i}`;
          const out = `and_${outputName}_${i}`;
          gates.push({ id, type: "AND", inputs: ops, output: out });
          partOutputs.push(out);
        } else {
          partOutputs.push(sigOf(p));
        }
      });
      gates.push({ id: `G_or_${outputName}`, type: "OR", inputs: partOutputs, output: outputName });
      return outputName;
    }
    if (norm.includes("·")) {
      const ops = norm.split("·").map(sigOf);
      gates.push({ id: `G_and_${outputName}`, type: "AND", inputs: ops, output: outputName });
      return outputName;
    }
    if (norm.includes("⊕")) {
      const ops = norm.split("⊕").map(sigOf);
      gates.push({ id: `G_xor_${outputName}`, type: "XOR", inputs: ops, output: outputName });
      return outputName;
    }
    return sigOf(norm);
  };
  const xSig = exprToSignal(xForm.expr, "X");
  const ySig = exprToSignal(yForm.expr, "Y");

  // FF: ffType에 따라 D-FF (피드백) 또는 T-FF (T=1 고정 토글).
  if (ffType === "D") {
    // D-FF + 피드백 (D=Q'): 매 rising edge마다 Q toggle. 원본 임용 8번.
    gates.push({ id: "G_not_Q", type: "NOT", inputs: ["Q"], output: "Q_n" });
    gates.push({
      id: "G_dff_Q",
      type: "DFF",
      inputs: ["Q_n", ySig],   // [D, R]
      output: "Q",
      clockSignal: xSig,
    });
  } else {
    // T-FF: T=Q_n (피드백 유지 — D-FF와 동일한 토글 동작). 임용 변형.
    gates.push({ id: "G_not_Q", type: "NOT", inputs: ["Q"], output: "Q_n" });
    gates.push({
      id: "G_tff_Q",
      type: "TFF",
      inputs: ["Q_n", ySig],   // [T, R] — T=Q_n로 항상 토글
      output: "Q",
      clockSignal: xSig,
    });
  }

  const logicNetworkDiagram: LogicNetworkDiagram = {
    inputs: ["A", "B", "C"], // CLK는 외부 입력이 아님 (내부 신호 X가 ▷ 핀으로)
    outputs: ["Q"],          // 외부 단자는 Q만. X·Y는 중간 wire 라벨로 표기.
    gates,
    signalLabels: { X: "X", Y: "Y" },
  };

  // ===== waveform 시뮬레이션 =====
  // CYCLES 클럭 단위 시간. A·B·C는 매 단위마다 임의 0/1. CLK는 X 신호와 동일 (게이트 출력이 클럭).
  const CYCLES = 8;
  const aSeq: number[] = [];
  const bSeq: number[] = [];
  const cSeq: number[] = [];
  for (let i = 0; i < CYCLES; i++) {
    aSeq.push(Math.floor(rand() * 2));
    bSeq.push(Math.floor(rand() * 2));
    cSeq.push(Math.floor(rand() * 2));
  }
  // 단조 시퀀스 방지 — 모두 같은 값이면 중간에 토글
  const ensureChange = (seq: number[]) => {
    if (seq.every((v) => v === seq[0])) seq[Math.floor(CYCLES / 2)] = 1 - seq[0];
  };
  ensureChange(aSeq);
  ensureChange(bSeq);
  ensureChange(cSeq);

  const xSeq = aSeq.map((_, i) => xForm.eval(aSeq[i], bSeq[i], cSeq[i]));
  const ySeq = aSeq.map((_, i) => yForm.eval(aSeq[i], bSeq[i], cSeq[i]));
  const clkSeq = xSeq.slice(); // CLK = X (게이트 출력이 클럭)

  // Q 시뮬레이션: 초기 Q=0. Y=1이면 비동기 RESET → Q=0. CLK rising edge에서 D=Q' 캡쳐 → Q 토글.
  let q = 0;
  const qSeq: number[] = [q];
  for (let i = 1; i < CYCLES; i++) {
    if (ySeq[i] === 1) {
      q = 0;
    } else if (clkSeq[i - 1] === 0 && clkSeq[i] === 1) {
      q = 1 - q;
    }
    qSeq.push(q);
  }

  // step samples — 마지막 시점 hold (renderer가 끝까지 유지하도록)
  const stepSamples = (arr: number[]) => {
    const out = arr.map((v, i) => ({ t: i, v }));
    if (arr.length > 0) out.push({ t: arr.length, v: arr[arr.length - 1] });
    return out;
  };

  const markers = [
    { t: 2, label: "t_p" },
    { t: 5, label: "t_p" },
  ];

  // (나) 문제 템플릿 — 학생이 도시할 X·Y·Q는 blank, 나머지(A·B·C·CLK)는 filled.
  // 단계 1: X 도시 / 단계 2: Y와 Q 도시.
  const waveformTemplate: WaveformDiagram = {
    signals: [
      { name: "A",   samples: stepSamples(aSeq),   shape: "step" },
      { name: "B",   samples: stepSamples(bSeq),   shape: "step" },
      { name: "C",   samples: stepSamples(cSeq),   shape: "step" },
      { name: "CLK", samples: stepSamples(clkSeq), shape: "step" },
      { name: "X",   samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } },
      { name: "Y",   samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } },
      { name: "Q",   samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } },
    ],
    unit: { time: "T" },
    markers,
  };

  // (나) 정답 — 전체 채워짐.
  const waveformSolution: WaveformDiagram = {
    signals: [
      { name: "A",   samples: stepSamples(aSeq),   shape: "step" },
      { name: "B",   samples: stepSamples(bSeq),   shape: "step" },
      { name: "C",   samples: stepSamples(cSeq),   shape: "step" },
      { name: "CLK", samples: stepSamples(clkSeq), shape: "step" },
      { name: "X",   samples: stepSamples(xSeq),   shape: "step" },
      { name: "Y",   samples: stepSamples(ySeq),   shape: "step" },
      { name: "Q",   samples: stepSamples(qSeq),   shape: "step" },
    ],
    unit: { time: "T" },
    markers,
  };

  return {
    logicNetworkDiagram,
    waveformTemplate,
    waveformSolution,
    ffType,
    xExpression: xForm.expr,
    yExpression: yForm.expr,
    hasReset: true,
  };
}
