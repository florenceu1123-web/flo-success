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
  };
};

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
