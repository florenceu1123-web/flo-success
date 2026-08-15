import type {
  AnalysisResult, GenerationMode, JkTwoPhaseClockCircuitDiagram, WaveformDiagram,
} from "@/types";

/**
 * 임용 30번 — JK 플립플롭 + **2상 클럭발생기** + 출력 게이트 2개.
 *
 * ## 원본 고정 토폴로지 (확대 확정 — [[feedback_verify_wiring_by_zoom]])
 *   · JK₁ : J₁·K₁는 외부 입력, CLK 핀에 **버블 → 하강 에지** 트리거. 출력 Q₁·Q̄₁.
 *   · 점선 박스 = **2상 클럭발생기** : JK₂의 **J₂ = K₂ = High**(항상 토글),
 *     JK₂의 CLK 핀은 버블이 **없다 → Q₁의 상승 에지**마다 토글(= 2분주).
 *   · 출력 게이트 2개 : 위 = (Q₁, Q₂) → **Y₁**,  아래 = (Q₁, Q̄₂) → **Y₂**.
 *     원본은 AND라 Y₁·Y₂가 겹치지 않는 2상 클럭이 된다.
 *
 * ## ★ 사용자 지정 변경 (2026-08-12)
 *   ① AND 2개 → **EX-OR 2개**  ⇒ **Y₁ = Q₁ ⊕ Q₂**, **Y₂ = Q₁ ⊕ Q̄₂ = (Q₁ ⊕ Q₂)′ = Y₁′**
 *      (두 출력이 서로 **보수**가 되는 것이 EX-OR 버전의 성질이고, 그대로 채점 포인트가 된다.)
 *   ② 객관식 → **출력 파형을 직접 도시**하는 서술형. (나)의 Y₁·Y₂는 **빈 트랙**으로 주고
 *      정답 파형은 solutionFigures로 분리한다.
 *   ③ **문항마다 J₁·K₁ 입력 파형이 달라야 한다** → 비트열 자체를 값 공간에 넣어 열거·필터한다.
 *
 * ## 시뮬레이션 규약
 *   펄스 i는 [2i, 2i+2) 를 차지하고 **CLK 상승 = 2i, 하강 = 2i+1**.
 *   J₁·K₁는 **펄스 경계(2i)** 에서만 바뀐다 → FF가 동작하는 하강 에지(2i+1)와 겹치지 않는다.
 *   Q₁은 하강 에지에서, Q₂는 Q₁의 상승 직후(ε)에 바뀐다(캐스케이드 지연을 파형에서 구분).
 */

export type GateKind = "XOR" | "XNOR";

export type JkTwoPhaseValues = {
  /** 클럭 펄스 수 */
  n: number;
  /** 각 펄스에서의 J₁ (길이 n) */
  j1: number[];
  /** 각 펄스에서의 K₁ (길이 n) */
  k1: number[];
  gate: GateKind;
};

export type JkTwoPhaseSim = {
  /** 각 하강 에지 직후의 Q₁ (길이 n) */
  q1: number[];
  /** 각 하강 에지 직후의 Q₂ (길이 n) */
  q2: number[];
  /** 각 구간에서의 Y₁ (길이 n) — 하강 에지 직후 값 */
  y1: number[];
  y2: number[];
  /** 펄스별 JK₁ 동작 이름 */
  modes: string[];
};

const JK_MODE = (j: number, k: number) =>
  j === 0 && k === 0 ? "유지" : j === 1 && k === 0 ? "세트" : j === 0 && k === 1 ? "리셋" : "토글";

const jkNext = (q: number, j: number, k: number) =>
  j === 0 && k === 0 ? q : j === 1 && k === 0 ? 1 : j === 0 && k === 1 ? 0 : q ^ 1;

const gateOf = (kind: GateKind, a: number, b: number) => (kind === "XOR" ? a ^ b : (a ^ b) ^ 1);

/** 결정론 시뮬레이션 — 초기 Q₁ = Q₂ = 0. */
export function simulate(v: JkTwoPhaseValues): JkTwoPhaseSim {
  let q1 = 0, q2 = 0;
  const Q1: number[] = [], Q2: number[] = [], Y1: number[] = [], Y2: number[] = [], modes: string[] = [];
  for (let i = 0; i < v.n; i++) {
    const prevQ1 = q1;
    q1 = jkNext(q1, v.j1[i], v.k1[i]);          // CLK 하강 에지
    if (prevQ1 === 0 && q1 === 1) q2 = q2 ^ 1;  // Q₁ 상승 에지 → JK₂ 토글 (J₂=K₂=1)
    Q1.push(q1); Q2.push(q2);
    Y1.push(gateOf(v.gate, q1, q2));
    Y2.push(gateOf(v.gate, q1, q2 ^ 1));
    modes.push(JK_MODE(v.j1[i], v.k1[i]));
  }
  return { q1: Q1, q2: Q2, y1: Y1, y2: Y2, modes };
}

// ─────────────────────────────────────────────────────────────
// 값 공간 — J₁·K₁ 비트열을 규칙 열거 + 필터
// ─────────────────────────────────────────────────────────────

const N = 8;

/** 원본 (나)에서 읽은 J₁·K₁ (참조·검산용) — 생성 풀에서 제외한다. */
const ORIGINAL: { j1: number[]; k1: number[] } = {
  j1: [1, 1, 0, 0, 1, 1, 1, 0],
  k1: [1, 0, 0, 1, 1, 0, 0, 1],
};

/** 입력이 한 구간만 바뀌는 지루한 파형을 거르기 위한 전이 횟수. */
const transitions = (bits: number[]) => bits.reduce((n, b, i) => n + (i > 0 && b !== bits[i - 1] ? 1 : 0), 0);
const isConst = (xs: number[]) => xs.every((x) => x === xs[0]);

function buildSpace(gate: GateKind): JkTwoPhaseValues[] {
  const out: JkTwoPhaseValues[] = [];
  // 8비트 전수(256×256)는 과하다 — **구간 단위(2펄스씩 4구간)** 로 열거해 파형이 읽히게 한다.
  const segs = [0, 1];
  for (const a0 of segs) for (const a1 of segs) for (const a2 of segs) for (const a3 of segs) {
    const j1 = [a0, a0, a1, a1, a2, a2, a3, a3];
    for (const b0 of segs) for (const b1 of segs) for (const b2 of segs) for (const b3 of segs) {
      const k1 = [b0, b0, b1, b1, b2, b2, b3, b3];
      // 입력이 최소 한 번씩은 변해야 문항이 성립한다.
      if (transitions(j1) < 1 || transitions(k1) < 1) continue;
      const v: JkTwoPhaseValues = { n: N, j1, k1, gate };
      const s = simulate(v);
      // 출력이 상수면 그릴 것이 없다. Q₂도 변해야 2상 클럭발생기가 의미를 갖는다.
      if (isConst(s.q1) || isConst(s.q2) || isConst(s.y1)) continue;
      // 네 가지 동작(유지·세트·리셋·토글) 중 3가지 이상이 나오면 학습 가치가 크다.
      if (new Set(s.modes).size < 3) continue;
      // ★ **파형을 그리는** 문항이므로 출력이 충분히 움직여야 한다 — 전이가 한 번뿐이면
      //   (예: Y₁ = 00000001) 그릴 것이 거의 없다(실측: 시각검증에서 발견).
      if (transitions(s.q1) < 2 || transitions(s.q2) < 2 || transitions(s.y1) < 2) continue;
      // ★ 원본 입력 튜플 제외
      if (j1.join("") === ORIGINAL.j1.join("") && k1.join("") === ORIGINAL.k1.join("")) continue;
      out.push(v);
    }
  }
  return out;
}

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 })).sort((p, q) => p.k - q.k).map((p) => p.x);
}

const SIMILAR_SPACE = shuffleDet(buildSpace("XOR"));
const VARIANT_SPACE = shuffleDet(buildSpace("XNOR"));
export const __spaces = { SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL, N };

// ─────────────────────────────────────────────────────────────
// 파형
// ─────────────────────────────────────────────────────────────

const EPS = 0.08;   // Q₂가 Q₁ 상승 **직후** 바뀌는 것을 파형에서 구분

/** step 샘플 — 값이 바뀌는 시각에만 찍고 t는 항상 증가시킨다. */
function step(points: Array<{ t: number; v: number }>, tEnd: number): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - p.t) < 1e-9) { last.v = p.v; continue; }
    if (last && last.v === p.v) continue;
    out.push({ ...p });
  }
  if (out.length && out[out.length - 1].t !== tEnd) out.push({ t: tEnd, v: out[out.length - 1].v });
  return out;
}

export type JkTwoPhaseWaveforms = { template: WaveformDiagram; solution: WaveformDiagram };

export function buildWaveforms(v: JkTwoPhaseValues, s: JkTwoPhaseSim): JkTwoPhaseWaveforms {
  const tEnd = 2 * v.n;
  const clk: Array<{ t: number; v: number }> = [];
  for (let i = 0; i < v.n; i++) { clk.push({ t: 2 * i, v: 1 }); clk.push({ t: 2 * i + 1, v: 0 }); }

  const inputPts = (bits: number[]) => bits.map((b, i) => ({ t: 2 * i, v: b }));

  // Q₁·Q₂·Y는 하강 에지(2i+1)에서 바뀐다. Q₂는 그 직후(ε).
  const q1Pts = [{ t: 0, v: 0 }, ...s.q1.map((q, i) => ({ t: 2 * i + 1, v: q }))];
  const q2Pts = [{ t: 0, v: 0 }, ...s.q2.map((q, i) => ({ t: 2 * i + 1 + EPS, v: q }))];
  const yPts = (ys: number[], init: number) =>
    [{ t: 0, v: init }, ...ys.map((y, i) => ({ t: 2 * i + 1 + EPS, v: y }))];

  const gate = v.gate;
  const y1Init = gate === "XOR" ? 0 : 1;          // 초기 Q₁=Q₂=0
  const y2Init = gate === "XOR" ? 1 : 0;          // Q̄₂ = 1

  const lane = (name: string, pts: Array<{ t: number; v: number }>) =>
    ({ name, samples: step(pts, tEnd), shape: "step" as const, vRange: { min: 0, max: 1 } });
  const blank = (name: string) =>
    ({ name, samples: [] as Array<{ t: number; v: number }>, shape: "step" as const, blank: true, vRange: { min: 0, max: 1 } });

  const given = [lane("CLK", clk), lane("J₁", inputPts(v.j1)), lane("K₁", inputPts(v.k1))];

  return {
    template: { signals: [...given, blank("Y₁"), blank("Y₂")] },
    solution: {
      signals: [
        ...given,
        lane("Q₁", q1Pts), lane("Q₂", q2Pts),
        lane("Y₁", yPts(s.y1, y1Init)), lane("Y₂", yPts(s.y2, y2Init)),
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 생성
// ─────────────────────────────────────────────────────────────

export type JkTwoPhaseGeneration = {
  values: JkTwoPhaseValues;
  sim: JkTwoPhaseSim;
  waveforms: JkTwoPhaseWaveforms;
  circuitDiagram: JkTwoPhaseClockCircuitDiagram;
};

export function generateJkTwoPhaseClockXor(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): JkTwoPhaseGeneration {
  const gate: GateKind = args.mode === "exam_variant" ? "XNOR" : "XOR";
  const space = gate === "XNOR" ? VARIANT_SPACE : SIMILAR_SPACE;
  // ★ 문항마다 J₁·K₁이 달라야 한다 — index를 곱해 서로 다른 항목을 고른다.
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 977) % space.length;
  const values = space[idx];
  const sim = simulate(values);
  return {
    values, sim,
    waveforms: buildWaveforms(values, sim),
    circuitDiagram: {
      gate,
      clockEdge1: "falling",
      clockEdge2: "rising",
      highLabel: "High",
      blockLabel: "2상 클럭발생기",
      out1Label: "Y₁",
      out2Label: "Y₂",
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 공용 매처
// ─────────────────────────────────────────────────────────────

export function jkTwoPhaseText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

/** 이 유형의 고유 신호 — **2상 클럭발생기**. 다른 어떤 형제도 이 낱말을 쓰지 않는다. */
const TWO_PHASE_RE = /2\s*상\s*클럭|two[\s-]?phase\s*clock|이상\s*클럭\s*발생/i;
const JK_RE = /JK\s*플립플롭|J-?K\s*플립플롭|\bJK\b|J₁|J_1/i;
const OUT_ASK_RE = /출력\s*Y|Y₁|Y_1|파형/i;
/** 형제 양보 — 카운터·상태도·여기표·MUX·DAC는 각자 전용 유형이 있다. */
const YIELD_RE =
  /카운터|counter|리플|ripple|상태도|상태표|여기표|카르노|K-?map|MUX|먹스|디먹스|DAC|시퀀스\s*검출|Mealy|Moore|프리셋|클리어|비동기\s*(SET|RESET|리셋)/i;

/**
 * 구조 시그니처 — **2상 클럭발생기 + JK 플립플롭**이 뼈대다(CLAUDE.md 규칙 2).
 * 인벤토리를 흘린 회차 대비로 텍스트만으로도, 구조(FF 2개 + 게이트 2개)만으로도 인정한다.
 */
export function matchesJkTwoPhaseClock(a?: Partial<AnalysisResult> | null): boolean {
  const t = jkTwoPhaseText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;

  const inv = a?.componentInventory ?? [];
  const nFf = inv.filter((c) => /^(FF|DFF|TFF|JKFF|FLIPFLOP)$/i.test(String(c?.type ?? ""))).length;
  const nGate = inv.filter((c) => /^(GATE|AND|OR|XOR|NAND|NOR)$/i.test(String(c?.type ?? ""))).length;

  if (TWO_PHASE_RE.test(t)) return true;                    // 고유 낱말 하나로 확정
  // 낱말을 흘린 회차 — JK 2개 + 게이트 2개 + 출력 Y 파형 요구
  return JK_RE.test(t) && nFf >= 2 && nGate >= 2 && OUT_ASK_RE.test(t);
}
