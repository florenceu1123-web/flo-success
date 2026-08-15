import type { AnalysisResult, GenerationMode, LogicGateType, LogicNetworkDiagram } from "@/types";

/**
 * 임용 24번 — **동기식 순서논리회로의 발생 가능한 상태**. ★결정론 archetype (GPT 없음)★
 *
 * ## 원본
 *   D 플립플롭 2개. `D_A = X`, 인버터로 만든 `X̄`와 `Q_A`를 AND 하여 `D_B = X̄ · Q_A`.
 *   초기 `(Q_A, Q_B) = (0, 0)`에서 X가 임의로 변할 때 **발생 가능한 (Q_A, Q_B)** 를 보기에서 모두 고른다.
 *   → 도달 가능 `(0,0) (0,1) (1,0)`, **(1,1)은 불가능** → **정답 ② (ㄱ, ㄴ, ㄷ)**.
 *   (Q_A⁺=1이려면 X=1인데, 그러면 X̄·Q_A = 0이라 Q_B⁺=0 — 둘이 동시에 1이 될 수 없다.)
 *
 * ## ★ 사용자 지정 (2026-08-13)
 *   ① **두 D 플립플롭 중 하나를 T 플립플롭**으로 바꾼다 — T는 여기(excitation)라
 *      `Q(t+1) = Q ⊕ T`를 한 단계 더 따져야 해서 교육 포인트가 깊어진다.
 *   ② **게이트 종류를 바꾼다**(AND·OR·NAND·NOR·XOR·XNOR).
 *   ③ **초기 상태 (Q_A, Q_B)를 문제마다 다르게** 준다.
 *   구조(FF 2개 + 인버터 + 게이트 1개 + 공통 CLK)와 요구(발생 가능한 상태)는 원본 그대로 둔다.
 *
 * ## 값은 규칙 열거 + 필터
 *   (T-FF 위치) × (게이트 6종) × (인버터 위치) × (초기 상태 4종)을 전수 열거하고
 *   **도달 가능 상태가 2개 또는 3개**인 것만 채택한다 —
 *   · 1개면 상태가 갇혀 문제가 되지 않고, 4개면 "전부 가능"이라 변별력이 없다.
 *   또 **X에 실제로 의존**해야 한다(X와 무관하면 순서회로 문제가 아니다).
 */

export type FfKind = "D" | "T";
export type FfGate = Extract<LogicGateType, "AND" | "OR" | "NAND" | "NOR" | "XOR" | "XNOR">;

export type FfReachValues = {
  /** T 플립플롭이 놓이는 자리 — 나머지 하나는 D 플립플롭. */
  tffAt: "A" | "B";
  /** 두 번째 FF의 입력을 만드는 게이트 종류. */
  gate: FfGate;
  /** 게이트의 첫 입력이 X̄인가(원본 배치) 아니면 X 그대로인가. */
  invertX: boolean;
  /** 초기 상태 [Q_A, Q_B]. */
  init: [number, number];
  /** ★ 클럭마다 인가되는 입력 X의 값 (문제마다 다르다 — 사용자 지정). */
  xSeq: number[];
};

export type FfReachGeneration = {
  values: FfReachValues;
  /** 도달 가능한 상태들 (`"00"` 형식, 사전순). */
  reachable: string[];
  /** 도달 불가능한 상태들. */
  unreachable: string[];
  /** 상태 전이표 — 각 (Q_A,Q_B,X)에 대한 입력값과 다음 상태. */
  transitions: Array<{
    qa: number; qb: number; x: number;
    inA: number; inB: number; nqa: number; nqb: number;
  }>;
  /** 클럭별 추적 — `steps[k]`는 k번째 클럭 에지 직후의 상태(steps[0]=초기). */
  steps: Array<{ qa: number; qb: number; x: number; inA: number; inB: number }>;
  diagram: LogicNetworkDiagram;
};

const GATES: FfGate[] = ["AND", "OR", "NAND", "NOR", "XOR", "XNOR"];

/** 게이트 2입력 진리값. */
export function gateEval(g: FfGate, a: number, b: number): number {
  switch (g) {
    case "AND": return a & b;
    case "OR": return a | b;
    case "NAND": return 1 - (a & b);
    case "NOR": return 1 - (a | b);
    case "XOR": return a ^ b;
    case "XNOR": return 1 - (a ^ b);
  }
}

/** FF 다음 상태 — D는 입력 그대로, T는 여기(Q ⊕ T). */
function ffNext(kind: FfKind, q: number, input: number): number {
  return kind === "D" ? input : (q ^ input);
}

/** (Q_A, Q_B, X) → { 입력값, 다음 상태 } — 회로 구조를 그대로 따른다. */
export function stepOf(v: FfReachValues, qa: number, qb: number, x: number) {
  const kindA: FfKind = v.tffAt === "A" ? "T" : "D";
  const kindB: FfKind = v.tffAt === "B" ? "T" : "D";
  const inA = x;                                   // FF_A 입력은 X 직결 (원본 그대로)
  const inB = gateEval(v.gate, v.invertX ? 1 - x : x, qa);
  return { inA, inB, nqa: ffNext(kindA, qa, inA), nqb: ffNext(kindB, qb, inB) };
}

/** 초기 상태에서 X가 임의로 변할 때 도달 가능한 상태 집합 (BFS). */
export function reachableFrom(v: FfReachValues): string[] {
  const start = `${v.init[0]}${v.init[1]}`;
  const seen = new Set([start]);
  const queue: Array<[number, number]> = [[v.init[0], v.init[1]]];
  while (queue.length > 0) {
    const [qa, qb] = queue.shift()!;
    for (const x of [0, 1]) {
      const s = stepOf(v, qa, qb, x);
      const key = `${s.nqa}${s.nqb}`;
      if (!seen.has(key)) { seen.add(key); queue.push([s.nqa, s.nqb]); }
    }
  }
  return [...seen].sort();
}

// ── 값 공간 ─────────────────────────────────────────────
/** 원본 튜플 — 두 FF 모두 D·AND·X̄·초기 (0,0). 참조·검산 전용(사용자 지정으로 T-FF가 들어가 자동 배제되지만 명시해 둔다). */
const ORIGINAL_DESC = "both D + AND + invertX + init(0,0)";

/** 클럭 6개분의 X 입력열 후보 — 값이 최소 2번 바뀌어 파형이 밋밋하지 않은 것만. */
const X_SEQS: number[][] = (() => {
  const out: number[][] = [];
  for (let m = 0; m < 64; m += 1) {
    const seq = Array.from({ length: 6 }, (_, i) => (m >> (5 - i)) & 1);
    let changes = 0;
    for (let i = 1; i < seq.length; i += 1) if (seq[i] !== seq[i - 1]) changes += 1;
    if (changes >= 2 && changes <= 4) out.push(seq);
  }
  return out;
})();

function buildSpace(): FfReachValues[] {
  const out: FfReachValues[] = [];
  for (const tffAt of ["A", "B"] as const) {
    for (const gate of GATES) {
      // ★ 사용자 지정(2026-08-13): **NOT 게이트는 원본처럼 항상 둔다** — 종류를 바꾸는 것은
      //   나머지 게이트 하나뿐이다. (예전엔 invertX=false도 열거해 NOT이 사라진 회로가 나왔다.)
      for (const invertX of [true]) {
        for (const qa of [0, 1]) {
          for (const qb of [0, 1]) {
            const probe: FfReachValues = { tffAt, gate, invertX, init: [qa, qb], xSeq: X_SEQS[0] };
            const reach = reachableFrom(probe);
            // ★ 2~3개만 — 1개면 상태가 갇히고, 4개면 "전부 가능"이라 변별력이 없다.
            if (reach.length < 2 || reach.length > 3) continue;
            // ★ X에 실제로 의존해야 한다(모든 상태에서 X=0·X=1 결과가 같으면 순서회로 문제가 아니다).
            let dependsOnX = false;
            for (const s of reach) {
              const qa2 = Number(s[0]), qb2 = Number(s[1]);
              const a = stepOf(probe, qa2, qb2, 0), b = stepOf(probe, qa2, qb2, 1);
              if (a.nqa !== b.nqa || a.nqb !== b.nqb) { dependsOnX = true; break; }
            }
            if (!dependsOnX) continue;
            for (const xSeq of X_SEQS) {
              const v: FfReachValues = { tffAt, gate, invertX, init: [qa, qb], xSeq };
              const tr = simulate(v);
              // ★ 파형을 그리는 문제이므로 **두 출력이 모두 최소 한 번은 바뀌어야** 한다.
              //   상수 트랙은 그릴 것이 없다.
              const qaTr = tr.filter((s, i) => i > 0 && s.qa !== tr[i - 1].qa).length;
              const qbTr = tr.filter((s, i) => i > 0 && s.qb !== tr[i - 1].qb).length;
              if (qaTr < 1 || qbTr < 1) continue;
              out.push(v);
            }
          }
        }
      }
    }
  }
  return out;
}

/**
 * 주어진 X 입력열을 클럭마다 인가했을 때의 상태 열.
 * `steps[k]`는 **k번째 클럭 에지 직후**의 상태이고, `steps[0]`은 초기 상태다.
 */
export function simulate(v: FfReachValues): Array<{ qa: number; qb: number; x: number; inA: number; inB: number }> {
  const out: Array<{ qa: number; qb: number; x: number; inA: number; inB: number }> = [];
  let qa = v.init[0], qb = v.init[1];
  out.push({ qa, qb, x: v.xSeq[0], inA: 0, inB: 0 });
  for (let k = 0; k < v.xSeq.length; k += 1) {
    const x = v.xSeq[k];
    const r = stepOf(v, qa, qb, x);
    qa = r.nqa; qb = r.nqb;
    out.push({ qa, qb, x: v.xSeq[Math.min(k + 1, v.xSeq.length - 1)], inA: r.inA, inB: r.inB });
  }
  return out;
}

function shuffleDet<T>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, GATES, ORIGINAL_DESC };

// ── figure ──────────────────────────────────────────────
/**
 * (가) 논리회로 — 기존 `logic_network` 렌더러를 재사용한다(DFF·TFF·게이트 모두 지원).
 * ★ 신호 이름을 그대로 두어 학생이 어느 선이 X̄인지 읽을 수 있게 한다.
 */
function buildDiagram(v: FfReachValues): LogicNetworkDiagram {
  const kindA = v.tffAt === "A" ? "TFF" : "DFF";
  const kindB = v.tffAt === "B" ? "TFF" : "DFF";
  const gates: LogicNetworkDiagram["gates"] = [];
  const gateIn1 = v.invertX ? "Xb" : "X";
  if (v.invertX) gates.push({ id: "g_not", type: "NOT", inputs: ["X"], output: "Xb" });
  gates.push({ id: "ff_a", type: kindA, inputs: ["X"], output: "Q_A" });
  gates.push({ id: "g_mix", type: v.gate, inputs: [gateIn1, "Q_A"], output: "S" });
  gates.push({ id: "ff_b", type: kindB, inputs: ["S"], output: "Q_B" });
  // ★★ `outputs`로 선언하면 렌더러가 **회로 우측 끝에 외부 단자 열**을 만들고 거기까지 배선을 끈다.
  //   그 결과 Q_A는 앞쪽 열에서 오른쪽 끝까지 길게 가로지르고, Q_B는 아래로 크게 우회한다(실측).
  //   Q_A·Q_B는 FF 출력 핀 바로 옆에 **신호 라벨**로 적으면 배선이 아예 필요 없다
  //   (CLAUDE.md: signalLabels는 외부 단자로 그려지지 않고 게이트 output 핀 옆에 표시된다).
  //   ⇒ 공유 렌더러(형제 12종이 함께 쓴다)를 건드리지 않고 payload만으로 직선화한다.
  return {
    inputs: ["X", "CLK"],
    outputs: [],
    gates,
    signalLabels: v.invertX
      ? { Xb: "X̄", S: "S", Q_A: "Q_A", Q_B: "Q_B" }
      : { S: "S", Q_A: "Q_A", Q_B: "Q_B" },
    // ※ 크기 배율은 주지 않는다 — "FF를 게이트보다 크게"는 사용자 지정으로 **렌더러 기본값**이 되었다
    //   (2026-08-13, 디지털 전반 적용). 여기서 덧씌우면 형제와 크기가 어긋난다.
    // ★ Q_A가 NOT 게이트 **위로** 크게 돌던 것을 아래쪽 채널로 내린다(사용자 지정 2026-08-13).
    routeForwardBelow: true,
  };
}

export function generateFfReachableStates(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): FfReachGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211) % space.length;
  const values = space[idx];

  const reachable = reachableFrom(values);
  const all = ["00", "01", "10", "11"];
  const unreachable = all.filter((s) => !reachable.includes(s));

  // 전이표는 **도달 가능한 상태에 대해서만** 만든다 — 학생이 실제로 따라가는 경로다.
  const transitions: FfReachGeneration["transitions"] = [];
  for (const s of reachable) {
    const qa = Number(s[0]), qb = Number(s[1]);
    for (const x of [0, 1]) {
      const r = stepOf(values, qa, qb, x);
      transitions.push({ qa, qb, x, inA: r.inA, inB: r.inB, nqa: r.nqa, nqb: r.nqb });
    }
  }

  return {
    values, reachable, unreachable, transitions,
    steps: simulate(values),
    diagram: buildDiagram(values),
  };
}

// ── 공용 매처 ────────────────────────────────────────────
export function ffReachText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}

const FF_RE = /플립플롭|flip[\s-]?flop|f\/f|\bff\b/i;
const SYNC_RE = /동기식|순서\s*논리|순차\s*논리|synchronous|상태/i;
/** 이 유형의 고유 요구 — **발생(도달) 가능한 상태**를 모두 고르기. */
const REACH_RE =
  /발생할?\s*수\s*있는|발생\s*가능|도달\s*가능|가능한\s*상태|나타날?\s*수\s*있는|모두\s*고른/i;
/**
 * 형제 양보 — 상태도·여기표·카르노맵으로 **설계**하는 유형, 카운터·시퀀스 검출기,
 * MUX 구현, 비동기 PR/CLR, 2상 클럭 등은 각자 archetype이 있다.
 */
const YIELD_RE =
  /상태도|상태\s*전이도|여기표|카르노맵|k-?map|최소항|불\s*함수|논리식을\s*구|카운터|시퀀스\s*검출|mux|멀티플렉서|비동기|프리셋|preset|2상\s*클럭|클럭발생기|파형을?\s*도시/i;

/**
 * 구조 시그니처 — **플립플롭 + 동기식 순서논리 + "발생 가능한 상태" 요구**.
 * 원본이 보기에서 상태를 고르는 형식이라 요구 문구가 판별의 핵심이다.
 */
export function matchesFfReachableStates(a?: Partial<AnalysisResult> | null): boolean {
  const t = ffReachText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  return FF_RE.test(t) && SYNC_RE.test(t) && REACH_RE.test(t);
}
