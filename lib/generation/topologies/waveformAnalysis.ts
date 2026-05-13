import type {
  CircuitTypeParams,
  LogicNetworkDiagram,
  WaveformDiagram,
} from "@/types";
import {
  sopToString,
  type BooleanFunction,
  type SopTerm,
} from "@/lib/digital/booleanFunction";
import { buildLogicNetwork } from "@/lib/digital/buildLogicNetwork";
import { minimizeSop } from "@/lib/digital/minimize";
import { makeRand, pick } from "./_helpers";

/**
 * 디지털 입력→출력 파형 분석 generator.
 *
 *  Archetype: "three_input_squarewave"
 *   - 3-입력 (A, B, C) 조합 회로
 *   - 입력 A: 주기 2T 사각파 (toggle every T)
 *   - 입력 B: 주기 4T (toggle every 2T)
 *   - 입력 C: 주기 8T (toggle every 4T)
 *   - 8 클럭 사이클 동안 (A,B,C) = 000, 001, 010, ..., 111 (counter 패턴)
 *   - F는 각 사이클에서 (A,B,C)에 대한 함수값
 *
 *  Figures:
 *   - implementation_circuit (logic_network of F)
 *   - waveform (4 signals: A, B, C 입력 + F 출력, 모두 "step" shape)
 */

export type WaveformArchetype = "three_input_squarewave";

export type WaveformAnalysisGeneration = {
  func: BooleanFunction;
  sop: SopTerm[];
  fExpression: string;
  /** 8 cycle 동안 F의 sequence (각 시점 값) */
  outputSequence: number[];   // 길이 8, F at t=0,1,...,7
  logicNetworkDiagram: LogicNetworkDiagram;
  waveformDiagram: WaveformDiagram;
  archetype: WaveformArchetype;
  values: Record<string, number>;
};

const VAR_NAMES = ["A", "B", "C"];

export function generateWaveformAnalysis(args: {
  params?: CircuitTypeParams;
  archetype?: WaveformArchetype;
  seed?: number;
}): WaveformAnalysisGeneration {
  const rand = makeRand(args.seed);
  const archetype: WaveformArchetype = args.archetype ?? "three_input_squarewave";

  // 3변수 함수: minterm 셋 랜덤 (3~5개) — kmap_sop과 같은 방식
  const N = 8;
  const count = 3 + Math.floor(rand() * 3);
  const pool = Array.from({ length: N }, (_, i) => i);
  const minterms: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rand() * pool.length);
    minterms.push(pool.splice(idx, 1)[0]);
  }
  minterms.sort((a, b) => a - b);

  const func: BooleanFunction = { vars: 3, varNames: VAR_NAMES, minterms, dontCares: [] };
  const sop = minimizeSop(func);
  const fExpression = sopToString(sop, VAR_NAMES);

  // 각 시간 t (0..7)에서 (A,B,C) = (t&1, (t>>1)&1, (t>>2)&1)
  // F(t) = minterms.includes(t) ? 1 : 0
  const outputSequence: number[] = [];
  for (let t = 0; t < 8; t++) {
    outputSequence.push(minterms.includes(t) ? 1 : 0);
  }

  // logic network
  const logicNetworkDiagram = buildLogicNetwork({
    sop, varNames: VAR_NAMES, outputName: "F",
  });

  // waveform diagram — A, B, C, F 4 신호. 각 신호는 step samples.
  // sample format: (t, v) at boundary. shape="step" 또는 "square"로 hold 처리.
  // 8 time units. 각 t=0,1,...,7에서 신호 값 +  t=8에서 종료 sample.
  const aSamples: Array<{ t: number; v: number }> = [];
  const bSamples: Array<{ t: number; v: number }> = [];
  const cSamples: Array<{ t: number; v: number }> = [];
  const fSamples: Array<{ t: number; v: number }> = [];
  for (let t = 0; t < 8; t++) {
    aSamples.push({ t, v: t & 1 });
    bSamples.push({ t, v: (t >> 1) & 1 });
    cSamples.push({ t, v: (t >> 2) & 1 });
    fSamples.push({ t, v: outputSequence[t] });
  }
  // 마지막 종료 샘플 (t=8) — renderer가 hold 표시
  aSamples.push({ t: 8, v: aSamples[aSamples.length - 1].v });
  bSamples.push({ t: 8, v: bSamples[bSamples.length - 1].v });
  cSamples.push({ t: 8, v: cSamples[cSamples.length - 1].v });
  fSamples.push({ t: 8, v: fSamples[fSamples.length - 1].v });

  const waveformDiagram: WaveformDiagram = {
    signals: [
      { name: "A", samples: aSamples },
      { name: "B", samples: bSamples },
      { name: "C", samples: cSamples },
      { name: "F", samples: fSamples },
    ],
    unit: { time: "T", value: "" },
  };

  return {
    func, sop, fExpression,
    outputSequence,
    logicNetworkDiagram, waveformDiagram,
    archetype,
    values: { mintermCount: minterms.length, sopTerms: sop.length },
  };
}
