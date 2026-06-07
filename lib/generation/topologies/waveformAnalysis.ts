import type {
  CircuitTypeParams,
  KmapDiagram,
  LogicNetworkDiagram,
  WaveformDiagram,
} from "@/types";
import {
  buildKmap,
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
  /** 중간신호 Y(첫 AND 출력)의 sequence — 학생이 단계1에서 그릴 정답. null이면 Y 없음. */
  ySequence: number[] | null;
  logicNetworkDiagram: LogicNetworkDiagram;
  waveformDiagram: WaveformDiagram;
  /** (다) 빈 카르노맵 (학생이 채움) */
  kmapDiagram: KmapDiagram;
  /** 정답 카르노맵 (값 채워짐, 풀이용) */
  kmapAnswer: KmapDiagram;
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

  // 3변수 함수: minterm 셋 랜덤 (4~6개). ★ 회로가 너무 단순하지 않게 SOP ≥ 3항 선호 (재시도) —
  //   ㉠ 출력 게이트가 여러 AND를 결합하는 실제 게이트가 되고, 각 항도 ≥2 literal로 AND 게이트 생성.
  const N = 8;
  let minterms: number[] = [];
  let func!: BooleanFunction;
  let sop!: ReturnType<typeof minimizeSop>;
  let best: { mt: number[]; f: BooleanFunction; s: ReturnType<typeof minimizeSop> } | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = 4 + Math.floor(rand() * 3);  // 4~6 minterm
    const pool = Array.from({ length: N }, (_, i) => i);
    const mt: number[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rand() * pool.length);
      mt.push(pool.splice(idx, 1)[0]);
    }
    mt.sort((a, b) => a - b);
    const f: BooleanFunction = { vars: 3, varNames: VAR_NAMES, minterms: mt, dontCares: [] };
    const s = minimizeSop(f);
    // 항마다 2 literal 이상(실제 AND 게이트) + 항 수 많을수록 선호.
    const litCount = (t: SopTerm) => t.pattern.split("").filter((p) => p !== "X").length;
    const multiLiteralTerms = s.filter((t) => litCount(t) >= 2).length;
    if (!best || multiLiteralTerms > best.s.filter((t) => litCount(t) >= 2).length) {
      best = { mt, f, s };
    }
    if (s.length >= 3 && multiLiteralTerms >= 2) { minterms = mt; func = f; sop = s; break; }
  }
  if (minterms.length === 0 && best) { minterms = best.mt; func = best.f; sop = best.s; }
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
  // ★ 빈칸(㉠) 게이트 — 출력 게이트(마지막, 원본 임용 5번 형식). 학생이 타이밍 도표로 도출.
  const outGate = logicNetworkDiagram.gates.find((g) => g.output === "F");
  if (outGate) {
    logicNetworkDiagram.blanks = [
      { symbol: "㉠", gateIds: [outGate.id], answer: outGate.type },
    ];
  }

  // ★ 중간신호 Y — 첫 AND 게이트 출력을 "Y"로 명명 (학생이 단계1에서 파형 도출).
  //   회로에 Y 라벨 표시 + 파형에 Y blank 트랙 추가.
  const yGate = logicNetworkDiagram.gates.find((g) => g.type === "AND");
  let ySamples: Array<{ t: number; v: number }> | null = null;
  if (yGate) {
    logicNetworkDiagram.signalLabels = { ...(logicNetworkDiagram.signalLabels ?? {}), [yGate.output]: "Y" };
    // Y(t) = AND of yGate.inputs (각 입력 신호의 t별 값). 입력은 변수(A/B/C) 또는 보수(A_n 등).
    const evalSig = (sig: string, t: number): number => {
      const negated = sig.endsWith("_n");
      const base = negated ? sig.slice(0, -2) : sig;
      const idx = VAR_NAMES.indexOf(base);
      if (idx < 0) return 0;
      const bit = (t >> idx) & 1;
      return negated ? 1 - bit : bit;
    };
    ySamples = [];
    for (let t = 0; t < 8; t++) {
      ySamples.push({ t, v: yGate.inputs.every((s) => evalSig(s, t) === 1) ? 1 : 0 });
    }
    ySamples.push({ t: 8, v: ySamples[ySamples.length - 1].v });
  }

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
      { name: "A", samples: aSamples, shape: "step" },
      { name: "B", samples: bSamples, shape: "step" },
      { name: "C", samples: cSamples, shape: "step" },
      { name: "F", samples: fSamples, shape: "step" },
      // 중간신호 Y — 학생이 단계1에서 도출할 빈칸 트랙 (lane만, 신호선 없음).
      ...(ySamples ? [{ name: "Y", samples: [] as Array<{ t: number; v: number }>, shape: "step" as const, blank: true, vRange: { min: 0, max: 1 } }] : []),
    ],
    unit: { time: "T", value: "" },
  };
  // Y 정답 시퀀스 (학생이 그려야 할 파형) — 풀이용.
  const ySequence = ySamples ? ySamples.slice(0, 8).map((s) => s.v) : null;

  // (다) 카르노맵 — 학생이 단계3에서 채울 빈 K-map (모든 셀 ""). 구조는 buildKmap에서.
  const km = buildKmap(func);
  const kmapDiagram: KmapDiagram = {
    title: "",
    variables: VAR_NAMES,
    rowVars: km.rowVars,
    colVars: km.colVars,
    rowOrder: km.rowOrder,
    colOrder: km.colOrder,
    rows: km.cells.map((cells, ri) => ({ label: km.rowOrder[ri], values: cells.map(() => "" as const) })),
  };
  // 정답 K-map (풀이용 — 값 채워짐).
  const kmapAnswer: KmapDiagram = {
    ...kmapDiagram,
    rows: km.cells.map((cells, ri) => ({ label: km.rowOrder[ri], values: cells })),
  };

  return {
    func, sop, fExpression,
    outputSequence,
    ySequence,
    logicNetworkDiagram, waveformDiagram, kmapDiagram, kmapAnswer,
    archetype,
    values: { mintermCount: minterms.length, sopTerms: sop.length },
  };
}
