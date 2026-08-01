import type { WaveformDiagram, JkStateDiagram } from "@/types";
import { makeRand } from "./_helpers";

/**
 * JK 동기식 카운터 — 비순환(전이) 상태가 있는 상태분석형 (원본 임용 6번 유형, exam_similar).
 *
 * 원본: JK-FF 3개(Q₂Q₁Q₀) 공통 CP. J·K가 하위/상위 비트로 배선되어, 000에서 시작하는 **6-사이클**을
 * 돌고 나머지 2개 상태(예: 011·111)는 사이클에 안 들어가는 "순환하지 않는 상태값". 학생은 타이밍
 * 도표를 완성하고 상태도(다)에서 순환하지 않는 상태 2개를 구한다.
 *
 * ★ 회로를 깔끔히 그리기 위해 J·K를 **단일 신호(High/Qᵢ/Q̄ᵢ 직결, 게이트 없음)**로 제한하고,
 *   그중 "000 포함 6-사이클 + 비순환 정확히 2개"를 만드는 구성만 사용한다(런타임 탐색, 하드코딩 예시 아님).
 */

export type JkSignal = "1" | "Q0" | "nQ0" | "Q1" | "nQ1" | "Q2" | "nQ2";
export type JkConfig = { J0: JkSignal; K0: JkSignal; J1: JkSignal; K1: JkSignal; J2: JkSignal; K2: JkSignal };

const SIGS: JkSignal[] = ["1", "Q0", "nQ0", "Q1", "nQ1", "Q2", "nQ2"];

function evalSig(sig: JkSignal, q: [number, number, number]): number {
  switch (sig) {
    case "1": return 1;
    case "Q0": return q[0];
    case "nQ0": return 1 - q[0];
    case "Q1": return q[1];
    case "nQ1": return 1 - q[1];
    case "Q2": return q[2];
    case "nQ2": return 1 - q[2];
  }
}
const jkNext = (Q: number, J: number, K: number) => (J & (1 - Q)) | ((1 - K) & Q);

/** 상태 s(0..7, Q0=LSB)의 다음 상태. */
export function nextState(s: number, c: JkConfig): number {
  const q: [number, number, number] = [s & 1, (s >> 1) & 1, (s >> 2) & 1];
  const n0 = jkNext(q[0], evalSig(c.J0, q), evalSig(c.K0, q));
  const n1 = jkNext(q[1], evalSig(c.J1, q), evalSig(c.K1, q));
  const n2 = jkNext(q[2], evalSig(c.J2, q), evalSig(c.K2, q));
  return n0 | (n1 << 1) | (n2 << 2);
}

/** Q2Q1Q0 2진 문자열. */
export function stateBits(s: number): string {
  return [(s >> 2) & 1, (s >> 1) & 1, s & 1].join("");
}

type Analysis = { cycle: number[]; nonCyclic: number[]; nxt: number[] };
function analyze(c: JkConfig): Analysis {
  const nxt: number[] = [];
  for (let s = 0; s < 8; s++) nxt[s] = nextState(s, c);
  const seen: number[] = [];
  let cur = 0;
  while (!seen.includes(cur)) { seen.push(cur); cur = nxt[cur]; }
  const cycle = seen.slice(seen.indexOf(cur));
  const inCycle = new Set(cycle);
  const nonCyclic: number[] = [];
  for (let s = 0; s < 8; s++) if (!inCycle.has(s)) nonCyclic.push(s);
  return { cycle, nonCyclic, nxt };
}

/**
 * 원본(임용 6번) 재현 타깃 — 사용자 지정 배선(J1=Q0, J2=K2=Q1)에 맞춰 풀어낸 구성:
 *  J0=Q̄1, K0=1, J1=Q0, K1=1, J2=Q1, K2=Q1 (게이트 없는 단일 신호).
 *  사이클 000→001→010→100→101→110→000, 비순환 정확히 {011,111} (사용자 답 일치).
 *  대부분 인접 FF 직결(J1=Q0: FF0→FF1, J2=K2=Q1: FF1→FF2), J0=Q̄1만 뒤로(FF1→FF0).
 */
const TARGET: JkConfig = { J0: "nQ1", K0: "1", J1: "Q0", K1: "1", J2: "Q1", K2: "Q1" };

const configKey = (c: JkConfig) => `${c.J0}|${c.K0}|${c.J1}|${c.K1}|${c.J2}|${c.K2}`;

/** 유효 구성: 000 포함 6-사이클 + 비순환 정확히 2개. TARGET을 맨 앞에(원본 재현), 나머지 결정론 순서. */
let VALID_CACHE: Array<{ c: JkConfig; a: Analysis }> | null = null;
function validConfigs(): Array<{ c: JkConfig; a: Analysis }> {
  if (VALID_CACHE) return VALID_CACHE;
  const rest: Array<{ c: JkConfig; a: Analysis }> = [];
  for (const J0 of SIGS) for (const K0 of SIGS)
  for (const J1 of SIGS) for (const K1 of SIGS)
  for (const J2 of SIGS) for (const K2 of SIGS) {
    const c: JkConfig = { J0, K0, J1, K1, J2, K2 };
    const a = analyze(c);
    if (a.cycle.length !== 6 || !a.cycle.includes(0) || a.nonCyclic.length !== 2) continue;
    if (configKey(c) === configKey(TARGET)) continue; // 타깃은 맨 앞에 별도로
    rest.push({ c, a });
  }
  VALID_CACHE = [{ c: TARGET, a: analyze(TARGET) }, ...rest];
  return VALID_CACHE;
}

// =====================================================================
// 변형유형(exam_variant): 단일신호 카운터에 2입력 게이트 1개 추가.
//   구조: J0=K0=1, J1=K1=s(단일, FF2에서), J2=K2=gate(Q1,Q2). 게이트 딱 1개(J2·K2 묶임).
// =====================================================================
export type GateOp = "AND" | "OR" | "XOR" | "NAND" | "NOR" | "XNOR";
export type JkGate = { op: GateOp; a: JkSignal; b: JkSignal };
export type JkInput = JkSignal | JkGate;
export type JkConfigG = { J0: JkInput; K0: JkInput; J1: JkInput; K1: JkInput; J2: JkInput; K2: JkInput };

const isGate = (x: JkInput): x is JkGate => typeof x === "object";
function applyOp(op: GateOp, a: number, b: number): number {
  switch (op) {
    case "AND": return a & b;
    case "OR": return a | b;
    case "XOR": return a ^ b;
    case "NAND": return 1 - (a & b);
    case "NOR": return 1 - (a | b);
    case "XNOR": return 1 - (a ^ b);
  }
}
function evalInput(inp: JkInput, q: [number, number, number]): number {
  return isGate(inp) ? applyOp(inp.op, evalSig(inp.a, q), evalSig(inp.b, q)) : evalSig(inp, q);
}
function nextStateG(s: number, c: JkConfigG): number {
  const q: [number, number, number] = [s & 1, (s >> 1) & 1, (s >> 2) & 1];
  const n0 = jkNext(q[0], evalInput(c.J0, q), evalInput(c.K0, q));
  const n1 = jkNext(q[1], evalInput(c.J1, q), evalInput(c.K1, q));
  const n2 = jkNext(q[2], evalInput(c.J2, q), evalInput(c.K2, q));
  return n0 | (n1 << 1) | (n2 << 2);
}
function analyzeG(c: JkConfigG): Analysis {
  const nxt: number[] = [];
  for (let s = 0; s < 8; s++) nxt[s] = nextStateG(s, c);
  const seen: number[] = [];
  let cur = 0;
  while (!seen.includes(cur)) { seen.push(cur); cur = nxt[cur]; }
  const cycle = seen.slice(seen.indexOf(cur));
  const inCycle = new Set(cycle);
  const nonCyclic: number[] = [];
  for (let s = 0; s < 8; s++) if (!inCycle.has(s)) nonCyclic.push(s);
  return { cycle, nonCyclic, nxt };
}

const GATE_OPS: GateOp[] = ["NAND", "NOR", "XNOR", "AND", "OR", "XOR"];
/**
 * 변형 pool: **유사유형 TARGET을 그대로 두고 J2=K2만 gate(Q0,Q1)로 교체**(게이트 1개 추가).
 *  이러면 Q0(J1·게이트)·Q1(J0·게이트) 모두 사용되어 끊긴 FF가 없다. 게이트는 전방향(FF0·FF1→FF2)
 *  이라 자기루프도 없다. 6-사이클 되는 op만(NAND/NOR/XNOR).
 */
let VARIANT_CACHE: Array<{ c: JkConfigG; a: Analysis }> | null = null;
function variantConfigs(): Array<{ c: JkConfigG; a: Analysis }> {
  if (VARIANT_CACHE) return VARIANT_CACHE;
  const out: Array<{ c: JkConfigG; a: Analysis }> = [];
  for (const op of GATE_OPS) {
    const g: JkGate = { op, a: "Q0", b: "Q1" };
    // 유사 TARGET base (J0=Q̄1, K0=1, J1=Q0, K1=1) + J2=K2=gate.
    const c: JkConfigG = { J0: "nQ1", K0: "1", J1: "Q0", K1: "1", J2: g, K2: g };
    const a = analyzeG(c);
    if (a.cycle.length !== 6 || !a.cycle.includes(0) || a.nonCyclic.length !== 2) continue;
    out.push({ c, a });
  }
  VARIANT_CACHE = out;
  return out;
}

const BITS = 3;
const CLK_MARGIN = 1; // 사이클(6) 뒤 여유 클럭

export type JkStateMachineGeneration = {
  config: JkConfig;
  /** 변형유형이면 게이트 포함 config (렌더러가 게이트 그림). */
  variantConfig?: JkConfigG;
  /** 000에서 시작하는 사이클 순서 (000 먼저, 길이 6). */
  cycle: number[];
  /** 순환하지 않는 상태값 (정확히 2개) + 각 다음 상태. */
  nonCyclic: Array<{ state: number; next: number }>;
  /** 전체 8상태 다음상태 표. */
  nextTable: number[];
  waveformTemplate: WaveformDiagram;
  waveformSolution: WaveformDiagram;
  /** (다) 상태도 — 사이클 링 + 비순환 진입 (전용 렌더러). */
  stateDiagram: JkStateDiagram;
  /** 학생이 답할 마커: 특정 클럭 시점 상태값. */
  markerStates: Array<{ label: string; clock: number; state: number }>;
};

const numClocksShown = () => 6 + CLK_MARGIN; // 한 바퀴 + 여유

function clockSamples(nClk: number) {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k < nClk; k++) { out.push({ t: 2 * k, v: 1 }); out.push({ t: 2 * k + 1, v: 0 }); }
  out.push({ t: 2 * nClk, v: 0 });
  return out;
}
function bitSamples(seq: number[], bit: number, nClk: number) {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k < nClk; k++) {
    const v = (seq[k] >> bit) & 1;
    out.push({ t: 2 * k, v }); out.push({ t: 2 * k + 1, v });
  }
  out.push({ t: 2 * nClk, v: (seq[nClk - 1] >> bit) & 1 });
  return out;
}

/** 분석(사이클·비순환·다음상태표)에서 타이밍·상태도·마커를 공통 생성. */
function buildResult(a: Analysis, config: JkConfig, variantConfig?: JkConfigG): JkStateMachineGeneration {
  const i0 = a.cycle.indexOf(0);
  const cycle = [...a.cycle.slice(i0), ...a.cycle.slice(0, i0)];
  const nClk = numClocksShown();
  const seq: number[] = [];
  for (let k = 0; k < nClk; k++) seq.push(cycle[k % cycle.length]);

  const mkSignals = (blankQ: boolean) => [
    { name: "CP", samples: clockSamples(nClk), shape: "step" as const },
    ...[2, 1, 0].map((bit) => ({
      name: `Q${bit}`,
      samples: blankQ ? [] : bitSamples(seq, bit, nClk),
      shape: "step" as const,
      ...(blankQ ? { blank: true, vRange: { min: 0, max: 1 } } : {}),
    })),
  ];
  const markerClocks = [2, 3, 5];
  const markers = markerClocks.map((k, i) => ({ t: 2 * k, label: `t_${i + 1}` }));
  const markerStates = markerClocks.map((k, i) => ({ label: `t_${i + 1}`, clock: k, state: seq[k] }));
  const nonCyclic = a.nonCyclic.map((s) => ({ state: s, next: a.nxt[s] }));
  const stateDiagram: JkStateDiagram = {
    cycle: cycle.map(stateBits),
    nonCyclic: nonCyclic.map((n) => ({ state: stateBits(n.state), next: stateBits(n.next) })),
  };
  return {
    config, variantConfig, cycle, nonCyclic, nextTable: a.nxt,
    waveformTemplate: { signals: mkSignals(true), unit: { time: "T" }, markers },
    waveformSolution: { signals: mkSignals(false), unit: { time: "T" }, markers },
    stateDiagram, markerStates,
  };
}

/** exam_similar: 단일신호 비순환 카운터. index 0 = 원본 재현. */
export function generateJkStateMachine(args: { seed?: number; index?: number }): JkStateMachineGeneration {
  const pool = validConfigs();
  const idx = args.index != null ? args.index % pool.length : Math.floor(makeRand(args.seed)() * pool.length);
  const { c, a } = pool[idx];
  return buildResult(a, c);
}

/** exam_variant: 게이트 1개 추가한 카운터 (J2=K2=gate(Q1,Q2)). */
export function generateJkStateMachineVariant(args: { index?: number }): JkStateMachineGeneration {
  const pool = variantConfigs();
  const idx = (args.index ?? 0) % pool.length;
  const { c, a } = pool[idx];
  // config(단일신호 필드)는 게이트를 문자열로 근사 표기(파이프라인 텍스트용). 렌더러는 variantConfig 사용.
  const gstr = (x: JkInput): JkSignal => (isGate(x) ? "Q1" : x);
  const config: JkConfig = { J0: gstr(c.J0), K0: gstr(c.K0), J1: gstr(c.J1), K1: gstr(c.K1), J2: gstr(c.J2), K2: gstr(c.K2) };
  return buildResult(a, config, c);
}
