import type { GenerationMode, LogicGate, LogicNetworkDiagram, WaveformDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * D 플립플롭 2개 + **3-NAND 입력망**(2:1 MUX 형태) + 입력 파형 → Q₁Q₀ 추적 + 점선부 최소화
 * (임용 12번 디지털) — 전용 결정론 archetype. GPT 없음.
 *
 * ── 고정 구조 (원본 (가) 그대로) ─────────────────────────────────
 *   외부 입력 A·B, 인버터 Ā = NOT(A), 공통 클럭.
 *   각 FF의 D 입력망은 **NAND 3개**:  위 NAND = (1, s),  아래 NAND = (x, y),  최종 NAND = (위, 아래)
 *     ⇒ **D = s + x·y**  (NAND-NAND = 곱의 합)
 *   FF1(Q₁) 입력망은 그대로 보이고, **FF0(Q₀) 입력망이 점선 영역**이다.
 *
 * ── ★ 왜 이 형태인가 ────────────────────────────────────────────
 *   [단계 3]이 "점선 부분을 **최소한의 AND 게이트와 OR 게이트**를 이용한 논리 회로로 도시"라고 요구한다.
 *   `D = s + x·y`는 최소화하면 정확히 **AND 1개 + OR 1개**가 되어 그 요구와 맞아떨어진다.
 *   (위 NAND의 한 입력이 상수 1이라 그 항은 리터럴 s 하나로 남는다.)
 *   ⇒ 값 규칙은 **흡수·퇴화가 일어나지 않는 (s, x, y) 조합만** 채택한다
 *      (s + s̄·y = s + y 처럼 OR 하나로 줄어들면 [단계 3]이 성립하지 않는다).
 *
 * ── 학생 단계 (원본 유지) ───────────────────────────────────────
 *   [1] (나) ㉠ 지점의 Q₁Q₀   [2] ㉡·㉢ 지점의 Q₁Q₀   [3] 점선부를 최소 AND/OR 회로로 도시
 *
 * ── 모드 ─────────────────────────────────────────────────────────
 *   exam_similar : 원본 배치(점선 = FF0 입력망)
 *   exam_variant : **점선 영역을 FF1 입력망으로 교환** — 구조·절차는 동일하고 도시 대상만 바뀐다.
 */

/** 입력망에서 쓸 수 있는 신호 (리터럴). */
export type Lit = "A" | "Abar" | "B" | "Bbar" | "Q1" | "Q0";
const LITS: Lit[] = ["A", "Abar", "B", "Bbar", "Q1", "Q0"];
/** 사람이 읽는 표기. */
export const litTex = (l: Lit): string =>
  ({ A: "A", Abar: "Ā", B: "B", Bbar: "B̄", Q1: "Q₁", Q0: "Q₀" })[l];
/** 보수 리터럴. */
const negOf = (l: Lit): Lit =>
  ({ A: "Abar", Abar: "A", B: "Bbar", Bbar: "B", Q1: "Q1", Q0: "Q0" })[l] as Lit;
/** Q는 보수 신호가 회로에 없다(인버터는 A에만 있다). */
const hasComplement = (l: Lit): boolean => l === "A" || l === "Abar" || l === "B" || l === "Bbar";

/** 한 FF의 입력망: D = s + x·y */
export type InNet = { s: Lit; x: Lit; y: Lit };
export const netTex = (n: InNet): string => `${litTex(n.s)} + ${litTex(n.x)}·${litTex(n.y)}`;

/** 상태(Q1,Q0)와 입력(A,B)에서 리터럴 값. */
function litVal(l: Lit, A: number, B: number, Q1: number, Q0: number): number {
  switch (l) {
    case "A": return A;
    case "Abar": return A ^ 1;
    case "B": return B;
    case "Bbar": return B ^ 1;
    case "Q1": return Q1;
    case "Q0": return Q0;
  }
}
/** D = s + x·y */
export function evalNet(n: InNet, A: number, B: number, Q1: number, Q0: number): number {
  return litVal(n.s, A, B, Q1, Q0) | (litVal(n.x, A, B, Q1, Q0) & litVal(n.y, A, B, Q1, Q0));
}

export type DffNandMuxValues = {
  net1: InNet;              // FF1(Q₁) 입력망
  net0: InNet;              // FF0(Q₀) 입력망
  dashedTarget: 0 | 1;      // 점선(학생이 도시) 대상 FF — 유사=0, 변형=1
  aSeq: number[];           // 클럭별 A
  bSeq: number[];           // 클럭별 B
  points: number[];         // ㉠·㉡·㉢ 지점의 클럭 인덱스
};
export type DffNandMuxAnswer = {
  q1Seq: number[]; q0Seq: number[];
  atPoints: Array<{ sym: string; idx: number; q1: number; q0: number }>;
  dashedNet: InNet;         // 점선부의 논리식 (정답)
};

/** 동기 D-FF 2개 시뮬레이션 — 갱신은 **직전 클럭 상태**로 동시에. */
export function simulate(v: DffNandMuxValues): { q1Seq: number[]; q0Seq: number[] } {
  let Q1 = 0, Q0 = 0;
  const q1Seq: number[] = [], q0Seq: number[] = [];
  for (let t = 0; t < v.aSeq.length; t++) {
    const A = v.aSeq[t], B = v.bSeq[t];
    const n1 = evalNet(v.net1, A, B, Q1, Q0);
    const n0 = evalNet(v.net0, A, B, Q1, Q0);
    Q1 = n1; Q0 = n0;
    q1Seq.push(Q1); q0Seq.push(Q0);
  }
  return { q1Seq, q0Seq };
}

export function solveDffNandMux(v: DffNandMuxValues): DffNandMuxAnswer {
  const { q1Seq, q0Seq } = simulate(v);
  const syms = ["㉠", "㉡", "㉢"];
  return {
    q1Seq, q0Seq,
    atPoints: v.points.map((idx, i) => ({ sym: syms[i], idx, q1: q1Seq[idx], q0: q0Seq[idx] })),
    dashedNet: v.dashedTarget === 0 ? v.net0 : v.net1,
  };
}

// ── 값 공간 (규칙 열거 + 필터) ─────────────────────────────────────
/** 진짜 "AND 1 + OR 1"인가 — 흡수·중복·상수화가 없어야 한다. */
function isProperAndOr(n: InNet): boolean {
  if (n.x === n.y) return false;                       // x·y가 단일 리터럴로 줄어듦
  if (n.x === negOf(n.x)) return false;                // (불가능하지만 방어)
  if (hasComplement(n.x) && n.y === negOf(n.x)) return false;  // x·x̄ = 0
  if (n.s === n.x || n.s === n.y) return false;        // s + s·y = s (흡수)
  if (hasComplement(n.s) && (n.x === negOf(n.s) || n.y === negOf(n.s))) return false; // s + s̄y = s+y
  return true;
}
/** 입력망이 상태에 실제로 반응하는가(외부 입력만 보면 순서회로가 아니다). */
const usesState = (n: InNet): boolean => [n.s, n.x, n.y].some((l) => l === "Q1" || l === "Q0");

const NETS: InNet[] = (() => {
  const out: InNet[] = [];
  for (const s of LITS)
    for (const x of LITS)
      for (const y of LITS) {
        if (LITS.indexOf(x) >= LITS.indexOf(y)) continue;   // x·y 교환대칭 — 한 번만
        const n: InNet = { s, x, y };
        if (!isProperAndOr(n)) continue;
        out.push(n);
      }
  return out;
})();

/** 입력 파형 — 원본처럼 A·B가 각각 한 번씩 바뀌는 계단형. */
function wavesFor(seed: number, N: number): { aSeq: number[]; bSeq: number[] } {
  const r = makeRand(seed);
  for (let i = 0; i < 3; i++) r();
  const aHigh = Math.floor(r() * 2);                    // A의 시작 논릿값
  const aFlip = 2 + Math.floor(r() * (N - 3));          // A가 바뀌는 클럭
  const bHigh = Math.floor(r() * 2);
  const bFlip = 2 + Math.floor(r() * (N - 3));
  const aSeq = Array.from({ length: N }, (_, t) => (t < aFlip ? aHigh : aHigh ^ 1));
  const bSeq = Array.from({ length: N }, (_, t) => (t < bFlip ? bHigh : bHigh ^ 1));
  return { aSeq, bSeq };
}

export type DffNandMuxGeneration = {
  values: DffNandMuxValues;
  answer: DffNandMuxAnswer;
  circuit: LogicNetworkDiagram;          // (가) 문제용 — 점선 안 비움
  circuitFilled: LogicNetworkDiagram;    // (가) 정답용 — 점선 안 채움
  minimalNet: LogicNetworkDiagram;       // [단계 3] 정답 — AND 1 + OR 1
  waveform: WaveformDiagram;             // (나) 문제용 — Q₁·Q₀는 빈 트랙
  waveformSolution: WaveformDiagram;     // (나) 정답용 — Q₁·Q₀ 채움
};

const N_CLOCKS = 6;

/** 3-NAND 입력망 게이트 3개를 만든다. */
function nandNetGates(tag: string, n: InNet, dOut: string): LogicGate[] {
  return [
    { id: `${tag}_t`, type: "NAND", inputs: ["ONE", n.s], output: `${tag}_u` },
    { id: `${tag}_b`, type: "NAND", inputs: [n.x, n.y], output: `${tag}_v` },
    { id: `${tag}_f`, type: "NAND", inputs: [`${tag}_u`, `${tag}_v`], output: dOut },
  ];
}

function build(v: DffNandMuxValues): DffNandMuxGeneration {
  const answer = solveDffNandMux(v);
  const gates: LogicGate[] = [
    { id: "inv_a", type: "NOT", inputs: ["A"], output: "Abar" },
    { id: "inv_b", type: "NOT", inputs: ["B"], output: "Bbar" },
    ...nandNetGates("g1", v.net1, "D1"),
    { id: "ff1", type: "DFF", inputs: ["D1"], output: "Q1", clockSignal: "CLK" },
    ...nandNetGates("g0", v.net0, "D0"),
    { id: "ff0", type: "DFF", inputs: ["D0"], output: "Q0", clockSignal: "CLK" },
  ];
  // ★ Q₁·Q₀는 **외부 출력 라벨**로 이미 우측에 표기된다 — signalLabels에 또 넣으면
  //   FF 박스 캡션("D-FF")과 출력 핀 라벨이 겹친다(스모크가 24건 검출).
  const signalLabels: Record<string, string> = {
    ONE: "1", Abar: "Ā", Bbar: "B̄", D1: "D₁", D0: "D₀",
  };
  const dashedIds = v.dashedTarget === 0 ? ["g0_t", "g0_b", "g0_f"] : ["g1_t", "g1_b", "g1_f"];
  const base: LogicNetworkDiagram = {
    inputs: ["A", "B", "ONE", "CLK"],
    outputs: ["Q1", "Q0"],
    gates,
    signalLabels,
  };
  const dn = answer.dashedNet;
  const dOut = v.dashedTarget === 0 ? "D0" : "D1";
  const tag = v.dashedTarget === 0 ? "g0" : "g1";

  /**
   * ★★ 문제 figure — 도시 대상 FF의 입력망을 **정답 형태(AND→OR)** 로 그리되 **두 게이트를
   *   빈 네모칸으로** 둔다 (사용자 지정 2026-08-04: "게이트가 들어가는 자리마다 각각 네모칸").
   *   · 빈칸 개수(2)가 곧 최소 회로의 게이트 수와 일치한다.
   *   · 회로의 **동작은 동일**하다 — NAND 3개든 AND+OR 2개든 D = s + x·y로 같은 함수라
   *     [단계 1]·[단계 2]의 Q 추적 결과가 바뀌지 않는다.
   *   · 배선은 그대로 보이므로 어떤 신호가 어느 자리로 들어가는지 학생이 읽을 수 있다.
   */
  const blankGates: LogicGate[] = gates
    .filter((g) => !dashedIds.includes(g.id))
    .concat([
      { id: `${tag}_and`, type: "AND", inputs: [dn.x, dn.y], output: `${tag}_m` },
      { id: `${tag}_or`, type: "OR", inputs: [dn.s, `${tag}_m`], output: dOut },
    ]);
  // FF가 D 입력을 참조하므로 게이트 순서를 원래 위치(FF 앞)로 맞춘다.
  const ffId = v.dashedTarget === 0 ? "ff0" : "ff1";
  const ffIdx = blankGates.findIndex((g) => g.id === ffId);
  const added = blankGates.splice(blankGates.length - 2, 2);
  blankGates.splice(ffIdx, 0, ...added);

  const circuit: LogicNetworkDiagram = {
    ...base,
    gates: blankGates,
    blanks: [
      { symbol: "", gateIds: [`${tag}_and`], answer: `AND(${litTex(dn.x)}, ${litTex(dn.y)})` },
      { symbol: "", gateIds: [`${tag}_or`], answer: `OR(${litTex(dn.s)}, ·)` },
    ],
  };
  const circuitFilled: LogicNetworkDiagram = { ...base, dashedRegions: [{ gateIds: dashedIds }] };

  // [단계 3] 정답 — AND 1개 + OR 1개
  const minimalNet: LogicNetworkDiagram = {
    inputs: [dn.s, dn.x, dn.y].filter((l, i, arr) => arr.indexOf(l) === i),
    outputs: [dOut],
    gates: [
      { id: "and1", type: "AND", inputs: [dn.x, dn.y], output: "m" },
      { id: "or1", type: "OR", inputs: [dn.s, "m"], output: dOut },
    ],
    signalLabels: { ...signalLabels, m: `${litTex(dn.x)}·${litTex(dn.y)}` },
  };

  // (나) 파형 — 클럭·A·B는 주어지고 Q는 빈칸(학생 도출). ㉠㉡㉢ 마커.
  const step = (arr: number[]) => {
    const out = arr.map((val, t) => ({ t, v: val }));
    out.push({ t: arr.length, v: arr[arr.length - 1] });
    return out;
  };
  const clk = Array.from({ length: N_CLOCKS }, (_, t) => (t % 2 === 0 ? 1 : 0));
  const markers = v.points.map((idx, i) => ({ t: idx + 0.5, label: ["㉠", "㉡", "㉢"][i] }));
  const given = [
    { name: "클럭", shape: "step" as const, samples: step(clk) },
    { name: "A", shape: "step" as const, samples: step(v.aSeq) },
    { name: "B", shape: "step" as const, samples: step(v.bSeq) },
  ];
  // ★ Q₁·Q₀는 **빈 트랙**으로 둔다 — [단계 1]·[단계 2]가 각 지점의 Q₁Q₀를 묻는데 트랙이 없으면
  //   학생이 상태를 추적해 표시할 자리가 없다(사용자 지적 2026-08-04).
  const waveform: WaveformDiagram = {
    signals: [
      ...given,
      { name: "Q₁", shape: "step", samples: [], blank: true, vRange: { min: 0, max: 1 } },
      { name: "Q₀", shape: "step", samples: [], blank: true, vRange: { min: 0, max: 1 } },
    ],
    xAxis: { symbol: "t", unit: "" },
    markers,
  };
  // 정답 파형 — Q 트랙 채움
  const waveformSolution: WaveformDiagram = {
    signals: [
      ...given,
      { name: "Q₁", shape: "step", samples: step(answer.q1Seq) },
      { name: "Q₀", shape: "step", samples: step(answer.q0Seq) },
    ],
    xAxis: { symbol: "t", unit: "" },
    markers,
  };

  return { values: v, answer, circuit, circuitFilled, minimalNet, waveform, waveformSolution };
}

function buildSpace(dashedTarget: 0 | 1): DffNandMuxValues[] {
  const out: DffNandMuxValues[] = [];
  const points = [1, 3, 5];
  for (let si = 0; si < NETS.length; si++) {
    const net1 = NETS[si];
    if (!usesState(net1) && si % 3 !== 0) continue;    // 다양성 유지하면서 조합 폭 제한
    for (let sj = 0; sj < NETS.length; sj += 7) {
      const net0 = NETS[sj];
      if (!usesState(net0)) continue;                  // 점선 대상은 상태 의존이어야 의미 있다
      for (let seed = 1; seed <= 4; seed++) {
        const { aSeq, bSeq } = wavesFor(seed * 131 + si, N_CLOCKS);
        const v: DffNandMuxValues = { net1, net0, dashedTarget, aSeq, bSeq, points };
        const a = solveDffNandMux(v);
        // 세 지점의 (Q₁Q₀)가 모두 같으면 [단계 1·2]가 무의미 — 최소 2가지 상태
        const uniq = new Set(a.atPoints.map((p) => `${p.q1}${p.q0}`));
        if (uniq.size < 2) continue;
        // Q가 내내 상수면 파형 도출이 무의미
        if (new Set(a.q1Seq).size < 2 && new Set(a.q0Seq).size < 2) continue;
        out.push(v);
      }
    }
  }
  return out;
}
const SPACE_S = buildSpace(0);
const SPACE_V = buildSpace(1);

export function generateDffNandMuxPair(args: { seed?: number; mode: GenerationMode }): DffNandMuxGeneration {
  const variant = args.mode === "exam_variant";
  const space = variant ? SPACE_V : SPACE_S;
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  return build(pick(space, rand));
}

/** 스모크 전용 — 값 공간·구성요소 노출. */
export function __dffNandMuxSpace(variant: boolean): DffNandMuxValues[] {
  return (variant ? SPACE_V : SPACE_S).slice();
}
export const __nets = (): InNet[] => NETS.slice();
export const __isProperAndOr = isProperAndOr;

/**
 * ★★ 판정용 텍스트는 **topic·interpretation만** 쓴다 (CLAUDE.md 1-4).
 *
 *   `relatedConcepts`·`fillInTheBlanks`는 Vision이 만든 **빈칸 학습용 문장**이라 문제의 구조적 사실이
 *   아니다. 실측(2026-08-04, 사용자 신고 "다른 게 나와"): 이 원본의 빈칸에
 *   *"논리 회로의 최소화를 위해 ____를 사용한다 / **카르노맵**"* 이 들어가 있어, 그 낱말 하나로
 *   형제 양보 가드(카르노맵 → 상태도 설계 유형)가 발화하고 감지가 통째로 죽었다.
 */
export function dnmTextOf(analysis: { topic?: string | null; interpretation?: string | null }): string {
  return `${analysis?.topic ?? ""} ${analysis?.interpretation ?? ""}`.toLowerCase();
}

/**
 * ★ 시그니처 매처 — **분류기와 감지기가 공유**한다(복제 금지).
 *
 * ★★ **낱말이 아니라 구조로 잡는다** (실측 2026-08-04, 사용자 신고 "다른 게 나와"):
 *   처음엔 `점선 부분`·`AND/OR 게이트`·`Q1Q0 값`이라는 **발문 문구**를 요구했는데, Vision이 원본을
 *     *"D 플립플롭을 이용한 회로 … 입력 신호 A와 B에 따라 **출력 Q1과 Q0의 상태 변화를 시간에 따라 추적**"*
 *   으로만 요약해 셋 다 없었고(로그 실측), 감지가 통째로 미발화해 형제 `dff_state_design`(자율 상태도
 *   설계)이 가져갔다.
 *   ⇒ 구조 신호 3종으로 판정한다: **D 플립플롭** + **2비트 출력 Q₁·Q₀** + **외부 입력 A·B**.
 *     · 형제 `dff_state_design`(임용 9번)·`dff_mux_sequential`(임용 8번)은 **입력이 없는 자율** 상태기계라
 *       "입력 신호 A와 B"가 나올 수 없다 — 이게 결정적 판별선이다.
 *     · 마지막으로 파형 추적 또는 점선 도시 요구 중 하나면 충분하다.
 */
export function matchesDffNandMuxSignature(text: string): boolean {
  const dff = /d\s*플립플롭|d[-\s]?f\s*\/?\s*f|d\s*flip/.test(text);
  if (!dff) return false;
  // 2비트 출력 Q₁·Q₀ (표기 변형 폭넓게)
  const twoBitQ =
    /q\s*_?1\s*q\s*_?0|q₁\s*q₀|q\s*_?1.{0,6}q\s*_?0|q₁.{0,6}q₀|q\s*_?0.{0,6}q\s*_?1/.test(text);
  // 외부 입력 A·B — 자율 상태기계 형제와 갈리는 지점
  const extInputs =
    /입력\s*(신호\s*)?a\s*(와|,|과|및|and)\s*b|신호\s*a\s*와\s*b|입력\s*a.{0,12}입력\s*b/.test(text);
  const drawAsk =
    /점선\s*부분.*(도시|그리|논리\s*회로)|최소한의?\s*and.*or|and\s*게이트와?\s*or\s*게이트/.test(text);
  const waveTrace = /파형|타이밍|시간에\s*따라|추적/.test(text);
  const pointAsk = /지점|시점/.test(text);
  // ① 점선부 AND/OR 도시 요구는 이 유형 **고유**다 — 그것만으로 확정.
  // ② 그 문구가 없으면 구조로: Q₁·Q₀ 2비트 + (외부 입력 A·B + 파형 추적) 또는 (지점별 값 요구).
  return drawAsk || (twoBitQ && extInputs && waveTrace) || (twoBitQ && pointAsk);
}
/** 형제 양보 — JK·T-FF, MUX 구현, 카운터/DAC, 시퀀스 검출기, 상태도 설계. */
export function yieldsDffNandMuxToSibling(text: string): boolean {
  return (
    /j-?k\s*플립플롭|jk\s*플립플롭|t\s*플립플롭|t-?ff/.test(text) ||
    /멀티플렉서|mux|디멀티|dac|d\/a|비교기/.test(text) ||
    /상태도|상태\s*전이도|여기표|카르노맵|k-?map/.test(text) ||
    /시퀀스\s*검출|카운터|counter/.test(text)
  );
}
