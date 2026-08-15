import type { AnalysisResult, GenerationMode, LogicGateType, LogicNetworkDiagram } from "@/types";

/**
 * 임용 26번 — **되먹임 + 2단 플립플롭** 동기식 순서논리회로의 출력 Z 파형. ★결정론 archetype★
 *
 * ## 원본 (확대 확인)
 * ```
 *   D₁ = (Ā AND Z) OR (A AND B)      ← 출력 Z가 위쪽 게이트로 **되먹임**
 *   D₂ = Q₁                           ← 2단 파이프라인(한 클럭 더 지연)
 *   Z  = Q₂,   CLR̄ = 0 이면 두 FF 모두 0 (비동기 리셋)
 * ```
 *   입력 파형(CLR̄·CLK·A·B)이 주어지고 구간 T₁·T₂·T₃의 Z 값을 고르는 **객관식**.
 *   ★ 동작이 세 갈래로 갈리는 것이 이 회로의 교육 포인트다:
 *     · A=0     → D₁ = Z      (되먹임으로 **현재 값을 붙잡는다**)
 *     · A=1·B=0 → D₁ = 0      (0으로 밀어냄)
 *     · A=1·B=1 → D₁ = 1      (1로 세트)
 *   여기에 **Q₁ → Q₂ 2클럭 지연**이 겹쳐 A·B 변화가 두 클럭 뒤에야 Z에 나타난다.
 *
 * ## ★ 사용자 지정 (2026-08-13)
 *   ① NOT을 제외한 **게이트 종류를 바꾼다**(위·아래·결합 게이트 3개).
 *   ② **플립플롭을 D+T 혼합**으로 바꾼다 — T는 여기(`Q(t+1) = Q ⊕ T`)라 한 단계 더 따져야 한다.
 *   ③ **A·B에 따른 출력 Z를 그리는 서술형**으로 바꾼다(객관식 → 3단계, 절대원칙).
 *   구조(되먹임 + 2단 종속 + 비동기 CLR̄)와 요구(Z 파형)는 원본 그대로 둔다.
 */

export type FbGate = Extract<LogicGateType, "AND" | "OR" | "NAND" | "NOR" | "XOR" | "XNOR">;
const GATES: FbGate[] = ["AND", "OR", "NAND", "NOR", "XOR", "XNOR"];

export function gateEval(g: FbGate, a: number, b: number): number {
  switch (g) {
    case "AND": return a & b;
    case "OR": return a | b;
    case "NAND": return 1 - (a & b);
    case "NOR": return 1 - (a | b);
    case "XOR": return a ^ b;
    case "XNOR": return 1 - (a ^ b);
  }
}

export type FbValues = {
  /** 위쪽 게이트 — 입력은 (Ā, Z). 원본은 AND. */
  gTop: FbGate;
  /** 아래쪽 게이트 — 입력은 (A, B). 원본은 AND. */
  gBot: FbGate;
  /** 두 게이트를 합쳐 앞단 FF 입력을 만드는 게이트. 원본은 OR. */
  gJoin: FbGate;
  /** T 플립플롭이 놓이는 자리 — 나머지 하나는 D 플립플롭 (사용자 지정: D+T 혼합). */
  tffAt: "front" | "back";
  /** 클럭마다 인가되는 (A, B). */
  ab: Array<[number, number]>;
  /** CLR̄ 이 0(리셋)인 클럭 수 — 앞쪽 몇 클럭 동안 리셋을 걸어 둔다. */
  clrLow: number;
};

export type FbStep = {
  clrn: number; a: number; b: number;
  gt: number; gb: number; in1: number; in2: number;
  q1: number; q2: number; z: number;
};

export type FbGeneration = {
  values: FbValues;
  /** steps[k]는 **k번째 클럭 에지 직후**의 상태. steps[0]은 초기(리셋) 상태. */
  steps: FbStep[];
  diagram: LogicNetworkDiagram;
};

/** 한 클럭의 조합 논리 + 상태 갱신. */
export function stepOnce(v: FbValues, q1: number, q2: number, a: number, b: number) {
  const z = q2;
  const gt = gateEval(v.gTop, 1 - a, z);
  const gb = gateEval(v.gBot, a, b);
  const in1 = gateEval(v.gJoin, gt, gb);   // 앞단 FF 입력 (D₁ 또는 T₁)
  const in2 = q1;                           // 뒷단 FF 입력 (D₂ 또는 T₂)
  const nq1 = v.tffAt === "front" ? (q1 ^ in1) : in1;
  const nq2 = v.tffAt === "back" ? (q2 ^ in2) : in2;
  return { gt, gb, in1, in2, nq1, nq2 };
}

/** 입력열을 클럭 순서대로 인가한 추적. */
export function simulate(v: FbValues): FbStep[] {
  const out: FbStep[] = [];
  let q1 = 0, q2 = 0;
  out.push({ clrn: 0, a: v.ab[0][0], b: v.ab[0][1], gt: 0, gb: 0, in1: 0, in2: 0, q1, q2, z: q2 });
  for (let k = 0; k < v.ab.length; k += 1) {
    const [a, b] = v.ab[k];
    const clrn = k < v.clrLow ? 0 : 1;
    if (clrn === 0) {
      // ★ 비동기 리셋 — 클럭과 무관하게 두 FF를 0으로 만든다.
      q1 = 0; q2 = 0;
      out.push({ clrn, a, b, gt: 0, gb: 0, in1: 0, in2: 0, q1, q2, z: q2 });
      continue;
    }
    const r = stepOnce(v, q1, q2, a, b);
    q1 = r.nq1; q2 = r.nq2;
    out.push({ clrn, a, b, gt: r.gt, gb: r.gb, in1: r.in1, in2: r.in2, q1, q2, z: q2 });
  }
  return out;
}

// ── 값 공간 ─────────────────────────────────────────────
/** (A,B) 입력열 후보 — 세 가지 동작(유지·0·1)이 골고루 나오도록 구간 단위로 만든다. */
const AB_SEQS: Array<Array<[number, number]>> = (() => {
  const seg: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const out: Array<Array<[number, number]>> = [];
  // 4구간 × 2클럭 = 8클럭. 구간 순열 중 첫 구간이 리셋 뒤 바로 오는 것들.
  const perms: number[][] = [];
  const rec = (acc: number[], rest: number[]) => {
    if (rest.length === 0) { perms.push(acc); return; }
    rest.forEach((r, i) => rec([...acc, r], rest.filter((_, j) => j !== i)));
  };
  rec([], [0, 1, 2, 3]);
  for (const p of perms) {
    const seq: Array<[number, number]> = [];
    for (const idx of p) { seq.push(seg[idx], seg[idx]); }
    out.push(seq);
  }
  return out;
})();

/** 원본 튜플 — 참조·검산 전용(사용자 지정으로 FF가 D+T라 자동 배제되지만 명시해 둔다). */
const ORIGINAL_DESC = "AND/AND/OR + D,D";

function buildSpace(): FbValues[] {
  const out: FbValues[] = [];
  for (const gTop of GATES) {
    for (const gBot of GATES) {
      for (const gJoin of GATES) {
        for (const tffAt of ["front", "back"] as const) {
          for (let si = 0; si < AB_SEQS.length; si += 4) {   // 입력열은 솎아 쓴다(풀 폭발 방지)
            const v: FbValues = { gTop, gBot, gJoin, tffAt, ab: AB_SEQS[si], clrLow: 2 };
            const steps = simulate(v);
            const zs = steps.map((s) => s.z);
            // ★ Z가 최소 2회 바뀌어야 파형을 그릴 값이 있다(상수 트랙은 문제가 안 된다).
            let changes = 0;
            for (let i = 1; i < zs.length; i += 1) if (zs[i] !== zs[i - 1]) changes += 1;
            if (changes < 2) continue;
            // ★ 앞단·뒷단이 모두 움직여야 2단 구조가 드러난다.
            if (new Set(steps.map((s) => s.q1)).size < 2) continue;
            out.push(v);
          }
        }
      }
    }
  }
  return out;
}

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k).map((p) => p.x);
}

const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, GATES, AB_SEQS, ORIGINAL_DESC };

// ── figure ──────────────────────────────────────────────
function buildDiagram(v: FbValues): LogicNetworkDiagram {
  const ff1 = v.tffAt === "front" ? "TFF" : "DFF";
  const ff2 = v.tffAt === "back" ? "TFF" : "DFF";
  return {
    inputs: ["A", "B", "CLK"],
    outputs: [],
    gates: [
      { id: "g_not", type: "NOT", inputs: ["A"], output: "Ab" },
      { id: "g_top", type: v.gTop, inputs: ["Ab", "Z"], output: "P" },
      { id: "g_bot", type: v.gBot, inputs: ["A", "B"], output: "R" },
      { id: "g_join", type: v.gJoin, inputs: ["P", "R"], output: "S" },
      { id: "ff1", type: ff1, inputs: ["S"], output: "Q1" },
      { id: "ff2", type: ff2, inputs: ["Q1"], output: "Z" },
    ],
    signalLabels: { Ab: "Ā", P: "P", R: "R", S: "S", Q1: "Q₁", Z: "Z" },
    // ★ Q₁·Z는 앞으로 가는 신호다 — 아래 채널로 지나가면 위쪽 입력 배선과 부딪히지 않는다.
    routeForwardBelow: true,
  };
}

export function generateFfFeedbackZ(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): FbGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211) % space.length;
  const values = space[idx];
  return { values, steps: simulate(values), diagram: buildDiagram(values) };
}

// ── 공용 매처 ────────────────────────────────────────────
export function fbText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

const FF_RE = /플립플롭|flip[\s-]?flop|f\/f/i;
const SYNC_RE = /동기식|순서\s*논리|순차\s*논리|synchronous/i;
/** 이 유형의 고유 신호 — **비동기 CLR̄** + 입력 파형에서 **출력 Z**를 읽는 요구. */
const CLR_RE = /clr|비동기\s*(?:식\s*)?리셋|비동기\s*초기화/i;
const Z_RE = /출력\s*z|\bz\s*의?\s*값|z\s*파형|구간\s*에서\s*출력/i;
/** 형제 양보 — 상태도·여기표 설계형, 카운터, MUX, 2상 클럭 등은 각자 archetype이 있다. */
const YIELD_RE =
  /상태도|상태\s*전이도|여기표|카르노맵|k-?map|최소항|불\s*함수|카운터|시퀀스\s*검출|mux|멀티플렉서|2상\s*클럭|클럭발생기|프리셋|preset/i;

/**
 * 구조 시그니처 — **플립플롭 + 동기식 순서논리 + 비동기 CLR + 출력 Z 요구**.
 * 형제 `ff_reachable_states`(임용 24번)는 CLR이 없고 "발생 가능한 상태"를 묻는다 — 그게 판별선이다.
 */
export function matchesFfFeedbackZ(a?: Partial<AnalysisResult> | null): boolean {
  const t = fbText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  return FF_RE.test(t) && SYNC_RE.test(t) && CLR_RE.test(t) && Z_RE.test(t);
}
