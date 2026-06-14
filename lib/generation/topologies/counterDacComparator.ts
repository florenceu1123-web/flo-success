import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  GenerationMode,
  LogicGate,
  LogicNetworkDiagram,
  MixedCircuitDiagram,
  NodeAnnotation,
  WaveformDiagram,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 임용 8번 형식: N-bit 동기식 JK 카운터 + R-2R DAC + OPAMP 비교기.
 *
 *  exam_similar: 2-bit (원본 임용 8번) — JK_A·JK_B + V_DAC = V_CC·(Q_B·2+Q_A)/4
 *  exam_variant: 3-bit (확장) — JK_A·JK_B·JK_C + V_DAC = V_CC·(Q_C·4+Q_B·2+Q_A)/8
 *
 *  JK 카운터 토글 조건 (binary 동기식):
 *    JK_A: J=K=V_CC=1 → 매 클럭 토글 (LSB)
 *    JK_B: J=K=Q_A → Q_A=1일 때 토글
 *    JK_C: J=K=Q_A·Q_B → 두 LSB 모두 1일 때 토글
 *
 *  학생 단계 (원본 패턴 유지):
 *    [단계 1] (가)의 Q_A'·Q_B'(·Q_C') 파형을 (나)의 전체 구간에 도시.
 *    [단계 2] (나)의 특정 시점 ㉠에서 비교기 입력 단자 중앙(+) 전압.
 *    [단계 3] (가)의 비교기 출력 V_o 파형을 (나)의 전체 구간에 도시.
 */

export type CounterDacComparatorGeneration = {
  mixedCircuit: MixedCircuitDiagram;
  waveformTemplate: WaveformDiagram;
  waveformSolution: WaveformDiagram;
  answer: {
    Vplus_at_marker: number;
    Vo_sequence: number[];
  };
  values: {
    bits: number;          // 2 (exam_similar) or 3 (exam_variant)
    V_CC: number;
    V_REF: number;
    R_unit_kohm: number;
    /** "jk_counter"(임용8 — JK 카운터+비교기) | "d_shift_register"(임용10 — D 시프트레지스터+아날로그 DAC) */
    structure?: "jk_counter" | "d_shift_register";
    /** d_shift_register 전용 — 논릿값 1 전압(V) 및 V_o DAC step(V). 비교기 없음. */
    vLogicHigh?: number;
    vStep?: number;
    /** 시프트레지스터 입력 A·출력 Q 라벨 (텍스트라이터용) */
    qLabels?: string[];
    voFormula?: string;
  };
};

/**
 * 임용 10번 형식: N-bit D 플립플롭 시프트레지스터 + R-2R DAC + OPAMP(아날로그 버퍼).
 *
 *  원본 구조: 입력 A → D_0 → D_1 → D_2 (클럭 동기 시프트). Q_0·Q_1·Q_2가 R-2R 사다리로
 *  합산되어 OPAMP를 거쳐 아날로그 출력 V_o(여러 레벨). JK 카운터(토글)와 근본적으로 다름 —
 *  상태는 카운터 순환이 아니라 입력 A의 시프트로 결정. V_o는 0/V_CC 비교기 출력이 아니라
 *  Q들의 가중합 아날로그 전압.
 *
 *  학생 단계(원본 패턴):
 *    [단계 1] (나) ㉠ 구간에서 Q_1의 출력 논릿값을 시간 순서대로 (시프트 추적).
 *    [단계 2] Q_0·Q_1·Q_2에 의한 V_o의 식 (DAC 가중합).
 *    [단계 3] (나) ㉡ 지점의 Q_0·Q_1·Q_2 → V_o[V] 수치.
 */
export function generateShiftRegisterDac(args: {
  bits?: number;
  seed?: number;
  mode?: GenerationMode;
}): CounterDacComparatorGeneration {
  const rand = makeRand(args.seed);
  const bits = Math.min(4, Math.max(2, args.bits ?? 3));
  const V_high = pick([5, 10], rand);   // 논릿값 1 전압
  const R = pick([1, 2], rand);
  // Q_{bits-1}=MSB … Q_0=LSB. V_step = V_high / 2^bits → V_o = (Σ Q_b·2^b)·V_step.
  const vStep = V_high / (1 << bits);
  const qLabels = Array.from({ length: bits }, (_, b) => `Q_${b}`); // Q_0 … Q_{bits-1}

  const dacValue = (qbits: number[]): number => {
    let w = 0;
    for (let b = 0; b < bits; b++) w += qbits[b] * (1 << b); // Q_0=LSB
    return +(w * vStep).toFixed(4);
  };
  const voFormula = `V_o = (${Array.from({ length: bits }, (_, b) => `${1 << b}·Q_${b}`).reverse().join(" + ")})·${vStep}`;

  // ─── (가-1) logic_network: D-FF 시프트레지스터 (A→D_0→D_1→…) ──────────
  const gates: LogicGate[] = [];
  for (let b = 0; b < bits; b++) {
    gates.push({
      id: `D${b}`,
      type: "DFF",
      inputs: [b === 0 ? "A" : `Q_${b - 1}`],
      output: `Q_${b}`,
      clockSignal: "CLK",
    });
  }
  const signalLabels: Record<string, string> = {};
  for (let b = 0; b < bits; b++) signalLabels[`Q_${b}`] = `Q_${b}`;
  const logicNetlist: LogicNetworkDiagram = {
    inputs: ["A", "CLK"],
    outputs: qLabels,
    gates,
    signalLabels,
  };

  // ─── (가-2) analog: ★ R-2R 사다리 ★ DAC + OPAMP voltage follower (V_o = V_DAC) ──
  //   원본 형태: 직렬 R로 이어진 ladder 노드 + 각 비트의 2R 다리 + 좌측 끝 2R 종단(→GND).
  //   출력(opamp +)은 MSB 쪽 끝(lad_{bits-1}). binary-weighted 단일 저항이 아니라 ladder 형상.
  const R2 = 2 * R; // 2R (다리·종단)
  const components: CircuitComponent[] = [];
  const bridgeNodes: Record<string, string> = {};
  // 각 비트: Q_b → 2R 다리 → lad_b (Q_0=LSB는 종단 쪽 lad_0, Q_{bits-1}=MSB는 출력 쪽)
  for (let b = 0; b < bits; b++) {
    components.push({
      id: `R_leg${b}`,
      type: "R",
      value: `${R2}kΩ`,
      pins: [
        { id: "p", node: `Q_${b}_in`, side: "bottom" },
        { id: "n", node: `lad_${b}`, side: "top" },
      ],
    });
    bridgeNodes[`Q_${b}`] = `Q_${b}_in`;
  }
  // ladder 노드 직렬 R
  for (let b = 0; b < bits - 1; b++) {
    components.push({
      id: `R_ser${b}`,
      type: "R",
      value: `${R}kΩ`,
      pins: [
        { id: "p", node: `lad_${b}`, side: "left" },
        { id: "n", node: `lad_${b + 1}`, side: "right" },
      ],
    });
  }
  // 좌측 끝 2R 종단 → GND
  components.push({
    id: "R_term",
    type: "R",
    value: `${R2}kΩ`,
    pins: [
      { id: "p", node: "lad_0", side: "left" },
      { id: "n", node: "GND", side: "left" },
    ],
  });
  const dacOutNode = `lad_${bits - 1}`;
  components.push({
    id: "U1", type: "OPAMP",
    pins: [
      { id: "vp", node: dacOutNode, side: "left", role: "non_inverting" },
      { id: "vn", node: "V_o_node", side: "left", role: "inverting" }, // 전압 폴로워 피드백
      { id: "vo", node: "V_o_node", side: "right" },
    ],
  });
  const nodeAnnotations: NodeAnnotation[] = [];
  for (let b = 0; b < bits; b++) {
    nodeAnnotations.push({ node: `Q_${b}_in`, label: `Q_${b}`, style: "label_only" });
  }
  nodeAnnotations.push({ node: "V_o_node", label: "V_o", style: "label_only" });
  const analogNetlist: CircuitNetlist = { components, ground: "GND", nodeAnnotations };

  // ─── 시뮬레이션: 입력 A 시프트 ─────────────────────────────
  const CYCLES = bits === 2 ? 8 : bits === 3 ? 10 : 12;
  // 입력 A 패턴 — seed 기반 결정론 비트열 (다양한 시프트 유도). bit 16 추출로 LSB 편향 회피.
  const aBit = (t: number): number => {
    const h = (((args.seed ?? 0) + 1) * 0x9e3779b1 + t * 0x85ebca77) >>> 0;
    return (h >>> 16) & 1;
  };
  let aSeq: number[] = Array.from({ length: CYCLES }, (_, t) => aBit(t));
  // 퇴화(전부 0/1) 회피 — V_o가 항상 같으면 문제가 무의미. 변화 보장 패턴으로 폴백.
  const aSum = aSeq.reduce((s, x) => s + x, 0);
  if (aSum === 0 || aSum === CYCLES) {
    aSeq = Array.from({ length: CYCLES }, (_, t) => ((t + (args.seed ?? 0)) % 3 === 0 ? 1 : t % 2));
  }
  // Q 상태 추적 (초깃값 0). 매 클럭: Q_{b}=이전 Q_{b-1}, Q_0=A.
  const qSeqs: number[][] = Array.from({ length: bits }, () => []);
  const voSeq: number[] = [];
  let q = Array<number>(bits).fill(0);
  for (let t = 0; t < CYCLES; t++) {
    const next = Array<number>(bits).fill(0);
    next[0] = aSeq[t];
    for (let b = 1; b < bits; b++) next[b] = q[b - 1];
    q = next;
    for (let b = 0; b < bits; b++) qSeqs[b].push(q[b]);
    voSeq.push(dacValue(q));
  }
  // ㉡ 마커 — V_o≠0(여러 Q 셋)인 중앙부 지점 선호 ([단계3]이 자명한 0이 되지 않도록).
  const mid = Math.floor(CYCLES / 2);
  let markerIdx = mid;
  let bestScore = -1;
  for (let t = Math.max(1, mid - 2); t < Math.min(CYCLES, mid + 3); t++) {
    const bitsSet = qSeqs.reduce((s, qs) => s + qs[t], 0);
    if (bitsSet > bestScore) { bestScore = bitsSet; markerIdx = t; }
  }
  const Vplus_at_marker = voSeq[markerIdx];
  const V_o_max = (((1 << bits) - 1) * vStep);

  // ─── (나) waveform ─────────────────────────────────────────
  const stepSamples = (arr: number[]) => {
    const out = arr.map((v, i) => ({ t: i, v }));
    if (arr.length > 0) out.push({ t: arr.length, v: arr[arr.length - 1] });
    return out;
  };
  const clkSeq = Array.from({ length: CYCLES }, (_, t) => t % 2);
  // ㉠ = 단계1이 Q_1 파형을 읽는 이른 구간 점, ㉡ = 단계3이 V_o를 읽는 중앙 지점.
  const markers = [
    { t: 2.5, label: "㉠" },
    { t: markerIdx + 0.5, label: "㉡" },
  ];

  // 문제 템플릿 — 클럭·A 채움, Q·V_o blank
  const templateSignals: WaveformDiagram["signals"] = [
    { name: "클럭", samples: stepSamples(clkSeq), shape: "step" },
    { name: "A", samples: stepSamples(aSeq), shape: "step" },
  ];
  for (let b = 0; b < bits; b++) {
    templateSignals.push({ name: `Q_${b}`, samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } });
  }
  templateSignals.push({ name: "V_o", samples: [], shape: "step", blank: true, vRange: { min: 0, max: V_o_max } });
  const waveformTemplate: WaveformDiagram = { signals: templateSignals, unit: { time: "t" }, markers };

  // 정답 파형 — Q·V_o 채움
  const solutionSignals: WaveformDiagram["signals"] = [
    { name: "클럭", samples: stepSamples(clkSeq), shape: "step" },
    { name: "A", samples: stepSamples(aSeq), shape: "step" },
  ];
  for (let b = 0; b < bits; b++) solutionSignals.push({ name: `Q_${b}`, samples: stepSamples(qSeqs[b]), shape: "step" });
  solutionSignals.push({ name: "V_o", samples: stepSamples(voSeq), shape: "step", vRange: { min: 0, max: V_o_max } });
  const waveformSolution: WaveformDiagram = { signals: solutionSignals, unit: { time: "t" }, markers };

  const mixedCircuit: MixedCircuitDiagram = { logic: logicNetlist, analog: analogNetlist, bridgeNodes };

  return {
    mixedCircuit,
    waveformTemplate,
    waveformSolution,
    answer: { Vplus_at_marker, Vo_sequence: voSeq },
    values: {
      bits, V_CC: V_high, V_REF: 0, R_unit_kohm: R,
      structure: "d_shift_register", vLogicHigh: V_high, vStep, qLabels, voFormula,
    },
  };
}

export function generateCounterDacComparator(args: {
  params?: CircuitTypeParams;
  seed?: number;
  mode?: GenerationMode;
}): CounterDacComparatorGeneration {
  const rand = makeRand(args.seed);
  const bits = args.mode === "exam_variant" ? 3 : 2;
  const nStates = 1 << bits;  // 4 or 8

  const V_CC = pick([5, 10], rand);
  // V_REF candidates — counter 8(또는 4) state 중 일부 트리거되도록.
  const refCandidates: number[] = [];
  for (let k = 1; k < nStates; k++) refCandidates.push((V_CC * k) / nStates);
  const V_REF = pick(refCandidates, rand);
  const R = pick([1, 2, 5], rand);

  // count states: bits=2 → [00,01,10,11], bits=3 → [000,001,...,111]
  // 각 state는 [Q_A, Q_B, Q_C?] (LSB first)
  const counts: number[][] = [];
  for (let i = 0; i < nStates; i++) {
    const bitArr: number[] = [];
    for (let b = 0; b < bits; b++) bitArr.push((i >> b) & 1);
    counts.push(bitArr);
  }
  const computeVdac = (bs: number[]) => {
    let val = 0;
    for (let b = 0; b < bits; b++) val += bs[b] * (1 << b);  // LSB first
    return (V_CC * val) / nStates;
  };
  const Vo_sequence = counts.map((bs) => (computeVdac(bs) > V_REF ? V_CC : 0));
  // Marker 시점 — 가운데쯤
  const markerCount = Math.floor(nStates / 2);
  const Vplus_at_marker = computeVdac(counts[markerCount]);

  // ─── (가-1) logic_network: N개 JK-FF + 카운터 동기 ──────────
  const ffLabels = ["A", "B", "C"]; // 최대 3-bit
  const gates: LogicGate[] = [];
  // JK_A: J=K=V_CC
  gates.push({
    id: "JK_A", type: "JKFF",
    inputs: ["V_CC", "V_CC"],
    output: "Q_A",
    clockSignal: "CLK",
  });
  // JK_B: J=K=Q_A
  gates.push({
    id: "JK_B", type: "JKFF",
    inputs: ["Q_A", "Q_A"],
    output: "Q_B",
    clockSignal: "CLK",
  });
  if (bits >= 3) {
    // Q_A·Q_B AND 게이트 → JK_C의 J·K
    gates.push({
      id: "G_QA_QB", type: "AND",
      inputs: ["Q_A", "Q_B"],
      output: "Q_AB",
    });
    gates.push({
      id: "JK_C", type: "JKFF",
      inputs: ["Q_AB", "Q_AB"],
      output: "Q_C",
      clockSignal: "CLK",
    });
  }
  // NOT 게이트 — 모든 bit마다 Q'_x 생성
  for (let b = 0; b < bits; b++) {
    const lbl = ffLabels[b];
    gates.push({ id: `NOT_Q${lbl}`, type: "NOT", inputs: [`Q_${lbl}`], output: `Q_${lbl}_bar` });
  }

  const outputBars: string[] = [];
  for (let b = 0; b < bits; b++) outputBars.push(`Q_${ffLabels[b]}_bar`);
  const signalLabels: Record<string, string> = {};
  for (let b = 0; b < bits; b++) signalLabels[`Q_${ffLabels[b]}`] = `Q_${ffLabels[b]}`;

  const logicNetlist: LogicNetworkDiagram = {
    inputs: ["V_CC", "CLK"],
    outputs: outputBars,
    gates,
    signalLabels,
  };

  // ─── (가-2) analog_netlist: R-2R DAC + OPAMP 비교기 ─────────
  //   bits=2: R_QA=2R, R_QB=R
  //   bits=3: R_QA=4R, R_QB=2R, R_QC=R (binary-weighted; 실제 R-2R 사다리도 등가)
  const components: CircuitComponent[] = [];
  const bridgeNodes: Record<string, string> = {};
  for (let b = 0; b < bits; b++) {
    const lbl = ffLabels[b];
    const weight = 1 << (bits - 1 - b);  // MSB는 R, LSB는 2^(bits-1)·R
    components.push({
      id: `R_Q${lbl}`,
      type: "R",
      value: `${weight * R}kΩ`,
      pins: [
        { id: "p", node: `Q_${lbl}_in`, side: "left" },
        { id: "n", node: "V_DAC_node", side: "right" },
      ],
    });
    bridgeNodes[`Q_${lbl}`] = `Q_${lbl}_in`;
  }
  components.push({
    id: "U1", type: "OPAMP",
    pins: [
      { id: "vp", node: "V_DAC_node", side: "left", role: "non_inverting" },
      { id: "vn", node: "Vref_node",  side: "left", role: "inverting" },
      { id: "vo", node: "V_o_node",   side: "right" },
    ],
  });
  const nodeAnnotations: NodeAnnotation[] = [];
  for (let b = 0; b < bits; b++) {
    nodeAnnotations.push({ node: `Q_${ffLabels[b]}_in`, label: `Q_${ffLabels[b]}`, style: "label_only" });
  }
  nodeAnnotations.push({ node: "Vref_node", label: `V_REF = ${V_REF.toFixed(2)}V`, style: "label_only" });
  nodeAnnotations.push({ node: "V_o_node", label: "V_o", style: "label_only" });

  const analogNetlist: CircuitNetlist = {
    components,
    ground: "GND",
    nodeAnnotations,
  };

  // ─── (나) waveform: 클럭·Q_A'·Q_B'(·Q_C')·V_o ────────────────
  const CYCLES = bits === 2 ? 8 : 16;  // 2 cycles of state-rotation
  const clkSeq: number[] = [];
  const QbarSeqs: number[][] = Array.from({ length: bits }, () => []);
  const Vo_seq: number[] = [];
  for (let i = 0; i < CYCLES; i++) {
    clkSeq.push(i % 2);
    const countIdx = i % nStates;
    const bs = counts[countIdx];
    for (let b = 0; b < bits; b++) QbarSeqs[b].push(1 - bs[b]);
    Vo_seq.push(Vo_sequence[countIdx] === V_CC ? 1 : 0);
  }

  const stepSamples = (arr: number[]) => {
    const out = arr.map((v, i) => ({ t: i, v }));
    if (arr.length > 0) out.push({ t: arr.length, v: arr[arr.length - 1] });
    return out;
  };

  const markers = [{ t: markerCount + 0.5, label: "㉠" }];

  // (나) 문제 템플릿 — 클럭만 채워지고 나머지 blank.
  const templateSignals: WaveformDiagram["signals"] = [
    { name: "클럭", samples: stepSamples(clkSeq), shape: "step" },
  ];
  for (let b = 0; b < bits; b++) {
    templateSignals.push({
      name: `Q_${ffLabels[b]}'`,
      samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 },
    });
  }
  templateSignals.push({ name: "V_o", samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } });
  const waveformTemplate: WaveformDiagram = {
    signals: templateSignals,
    unit: { time: "t" },
    markers,
  };

  // (나) 정답
  const solutionSignals: WaveformDiagram["signals"] = [
    { name: "클럭", samples: stepSamples(clkSeq), shape: "step" },
  ];
  for (let b = 0; b < bits; b++) {
    solutionSignals.push({ name: `Q_${ffLabels[b]}'`, samples: stepSamples(QbarSeqs[b]), shape: "step" });
  }
  solutionSignals.push({ name: "V_o", samples: stepSamples(Vo_seq), shape: "step" });
  const waveformSolution: WaveformDiagram = {
    signals: solutionSignals,
    unit: { time: "t" },
    markers,
  };

  const mixedCircuit: MixedCircuitDiagram = {
    logic: logicNetlist,
    analog: analogNetlist,
    bridgeNodes,
  };

  return {
    mixedCircuit,
    waveformTemplate,
    waveformSolution,
    answer: { Vplus_at_marker, Vo_sequence },
    values: { bits, V_CC, V_REF, R_unit_kohm: R },
  };
}
