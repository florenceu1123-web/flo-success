import type {
  AnalysisResult,
  DffPresetClearCircuitDiagram,
  DffPresetClearGateInput,
  GenerationMode,
  WaveformDiagram,
} from "@/types";

/**
 * 임용 27번 — D 플립플롭 + **비동기 PR·CLR** + A·B 조합논리 → 구간 ㉠~㉢의 출력 Q 파형.
 *
 * ## 원본 구조 (가)
 *   · D-FF 하나. **D ← Q̄ 되먹임** 이므로 PR·CLR이 모두 비활성일 때는 **클럭마다 토글**한다.
 *   · PR(위)·CLR(아래)은 **비동기**이고 핀에 버블이 있다(= active-low).
 *     따라서 이들을 구동하는 게이트는 **NAND** 다: PR̄ = (곱항)′, CLR̄ = (곱항)′.
 *   · 곱항은 입력 A·B(및 그 보수)로 만든다. 원본은 A가 **인에이블** 역할을 한다:
 *       CLR̄ = (Ā·B̄)′  → A=0,B=0에서 CLR 활성 → **리셋**
 *       PR̄  = (Ā·B)′   → A=0,B=1에서 PR 활성  → **세트**
 *       A=1 → 두 곱항이 모두 0 → PR̄=CLR̄=1(비활성) → **토글**
 *
 * ## (나)와 요구
 *   CLK·A·B가 구간 ㉠·㉡·㉢에 걸쳐 주어지고, 학생이 **Q 파형을 도시**한다.
 *   원본은 보기 ①~⑤ 객관식이지만, CLAUDE.md 절대원칙(객관식 → 3단계 주관식)에 따라
 *   〈해석 절차〉 3단계 서술형으로 낸다.
 *
 * ## 왜 전용 archetype인가
 *   형제 어느 것도 재현 못 한다 — `ff_with_waveform`(임용 8번)은 **비동기 RESET만** 있고
 *   입력이 A·B·C 3개이며 게이트 출력이 클럭이다. `async_preset_ripple_counter`는 FF 3개 +
 *   NOR 자동재적재. `jk_sync_counter`는 JK 카운터. **PR·CLR 두 비동기 입력을 A·B로 디코드해
 *   리셋/세트/토글 세 동작을 구간별로 판정**하는 형식은 이 유형뿐이다.
 *   (실측: 이 원본은 분류에서 `unsupported`로 떨어져 digital이면 `universal_digital`로 코어션된다.)
 *
 * ## 값은 규칙 열거 + 필터 (예시 hardcode 금지)
 *   (A,B) 조합 4개에서 **구간 3개의 순서열**을 전수 열거하고
 *     · 이웃 구간의 (A,B)가 서로 다를 것
 *     · 첫 구간은 세트 또는 리셋일 것 (Q 초깃값에 의존하지 않게 — 원본 ㉠도 리셋이다)
 *     · 세 구간이 **리셋·세트·토글을 모두 포함**할 것 (원본의 학습목표 보존)
 *   로 거른 뒤, 구간별 클럭 펄스 수를 곱해 값 공간을 만든다. **원본 튜플은 제외**한다.
 */

export type PrClrMode = "reset" | "set" | "toggle";

/** (A,B) 곱항 하나 — 각 변수의 요구 논릿값. */
type Term = { a: 0 | 1; b: 0 | 1 };

/** PR̄·CLR̄를 만드는 곱항 쌍. 두 곱항은 서로 달라야 한다(같으면 세트·리셋이 동시 활성). */
export type Decode = { presetTerm: Term; clearTerm: Term };

/** exam_similar — 원본 결선: A가 인에이블(A=0일 때만 PR/CLR 동작, A=1이면 토글). */
export const DECODE_SIMILAR: Decode = {
  presetTerm: { a: 0, b: 1 }, // PR̄ = (Ā·B)′
  clearTerm: { a: 0, b: 0 },  // CLR̄ = (Ā·B̄)′
};

/**
 * exam_variant — **인에이블 극성 교환**(소자 결선 1곳 변경).
 * A=1일 때만 PR/CLR이 동작하고 A=0이면 토글한다. 구조·해석 절차는 동일하고 답만 거울.
 */
export const DECODE_VARIANT: Decode = {
  presetTerm: { a: 1, b: 0 }, // PR̄ = (A·B̄)′
  clearTerm: { a: 1, b: 1 },  // CLR̄ = (A·B)′
};

const COMBOS: Array<{ a: 0 | 1; b: 0 | 1 }> = [
  { a: 0, b: 0 },
  { a: 0, b: 1 },
  { a: 1, b: 0 },
  { a: 1, b: 1 },
];

/** 원본 (나)의 구간 (A,B) 순서열 — 생성 풀에서 제외한다. */
const ORIGINAL_COMBOS: Array<[number, number]> = [[0, 0], [0, 1], [1, 1]];
/** 원본 구간별 클럭 펄스 수(도표에서 읽은 대략값) — 조합이 같고 펄스도 같으면 원본 복사다. */
const ORIGINAL_PULSES: [number, number, number] = [3, 3, 4];

const matchesTerm = (t: Term, a: number, b: number) => t.a === a && t.b === b;

/** 그 (A,B)에서 플립플롭이 하는 일. PR·CLR은 비동기라 구간 내내 값을 붙든다. */
export function modeOf(decode: Decode, a: number, b: number): PrClrMode {
  if (matchesTerm(decode.presetTerm, a, b)) return "set";
  if (matchesTerm(decode.clearTerm, a, b)) return "reset";
  return "toggle";
}

/** PR̄ 논릿값 (active-low: 0이면 세트 활성). */
export const presetBar = (d: Decode, a: number, b: number) => (matchesTerm(d.presetTerm, a, b) ? 0 : 1);
/** CLR̄ 논릿값 (active-low: 0이면 리셋 활성). */
export const clearBar = (d: Decode, a: number, b: number) => (matchesTerm(d.clearTerm, a, b) ? 0 : 1);

export const MODE_LABEL: Record<PrClrMode, string> = {
  reset: "리셋(Q = 0 유지)",
  set: "세트(Q = 1 유지)",
  toggle: "토글(클럭마다 반전)",
};

// ─────────────────────────────────────────────────────────────
// 값 공간 — 규칙 열거 + 필터
// ─────────────────────────────────────────────────────────────

export type RegionSpec = { a: 0 | 1; b: 0 | 1; pulses: number };
export type ParamSet = { decode: Decode; regions: [RegionSpec, RegionSpec, RegionSpec] };

const PULSE_CHOICES = [2, 3, 4];
const REGION_MARKS = ["㉠", "㉡", "㉢"];

/** 구간 3개 순서열을 전수 열거하고 규칙으로 거른다. */
function buildSpace(decode: Decode): ParamSet[] {
  const out: ParamSet[] = [];
  for (const c0 of COMBOS) {
    // 첫 구간은 비동기 강제 구간이어야 Q 초깃값에 답이 의존하지 않는다.
    if (modeOf(decode, c0.a, c0.b) === "toggle") continue;
    for (const c1 of COMBOS) {
      if (c1.a === c0.a && c1.b === c0.b) continue;         // 이웃 구간은 달라야 한다
      for (const c2 of COMBOS) {
        if (c2.a === c1.a && c2.b === c1.b) continue;
        const modes = [
          modeOf(decode, c0.a, c0.b),
          modeOf(decode, c1.a, c1.b),
          modeOf(decode, c2.a, c2.b),
        ];
        // 세 동작(리셋·세트·토글)이 모두 나와야 원본의 학습목표가 유지된다.
        if (new Set(modes).size !== 3) continue;
        for (const p0 of PULSE_CHOICES) {
          for (const p1 of PULSE_CHOICES) {
            for (const p2 of PULSE_CHOICES) {
              // 토글 구간은 반전이 눈에 보이도록 3펄스 이상.
              const pulses = [p0, p1, p2];
              const tooShortToggle = modes.some((m, i) => m === "toggle" && pulses[i] < 3);
              if (tooShortToggle) continue;
              if (p0 + p1 + p2 > 10) continue;              // 도표 가독성
              const combos: Array<[number, number]> = [[c0.a, c0.b], [c1.a, c1.b], [c2.a, c2.b]];
              const sameCombos = combos.every((c, i) => c[0] === ORIGINAL_COMBOS[i][0] && c[1] === ORIGINAL_COMBOS[i][1]);
              // ★ 원본 튜플 제외 — 조합·펄스가 모두 같으면 원본 그대로다.
              if (sameCombos && pulses.every((p, i) => p === ORIGINAL_PULSES[i])) continue;
              out.push({
                decode,
                regions: [
                  { a: c0.a, b: c0.b, pulses: p0 },
                  { a: c1.a, b: c1.b, pulses: p1 },
                  { a: c2.a, b: c2.b, pulses: p2 },
                ],
              });
            }
          }
        }
      }
    }
  }
  return out;
}

/** 결정론 해시 — 열거 순서대로 두면 앞쪽이 전부 비슷해서 다양성이 없다. */
function shuffleDeterministic<T>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

const sameDecode = (x: Decode, y: Decode) =>
  x.presetTerm.a === y.presetTerm.a && x.presetTerm.b === y.presetTerm.b &&
  x.clearTerm.a === y.clearTerm.a && x.clearTerm.b === y.clearTerm.b;

/**
 * exam_variant의 결선 후보 — PR·CLR을 구동하는 **곱항 쌍을 전부 열거**한다(서로 다른 두 항, 4×3 = 12).
 *   ★ 사용자 지정(2026-08-12): "변형은 A·B 파형뿐 아니라 **회로도의 인버터 유무도** 다양해야 한다".
 *     곱항이 바뀌면 그 입력의 반전 여부가 바뀌므로 (가) 회로의 인버터 배치가 자동으로 달라진다.
 *     원본(유사) 결선은 제외 — 변형이 유사와 같은 회로가 되면 안 된다.
 */
const VARIANT_DECODES: Decode[] = COMBOS.flatMap((p) =>
  COMBOS.filter((c) => !(c.a === p.a && c.b === p.b)).map((c) => ({ presetTerm: p, clearTerm: c })),
).filter((d) => !sameDecode(d, DECODE_SIMILAR));

const SIMILAR_SPACE = shuffleDeterministic(buildSpace(DECODE_SIMILAR));
const VARIANT_SPACE = shuffleDeterministic(VARIANT_DECODES.flatMap((d) => buildSpace(d)));

/** 스모크 전용 — 값 공간 노출. */
export const __spaces = { SIMILAR_SPACE, VARIANT_SPACE };

// ─────────────────────────────────────────────────────────────
// 시뮬레이션 + 파형
// ─────────────────────────────────────────────────────────────

/**
 * 시간축 규약 (구간 경계와 클럭 에지가 **절대 겹치지 않게** 잡는다):
 *   · 펄스 i는 [2i, 2i+2) 를 차지하고 **상승 에지 t = 2i + 0.5**, 하강 에지 t = 2i + 1.5.
 *   · 구간 경계는 **짝수 정수 t = 2·(누적 펄스 수)** — 에지(반정수)와 겹치지 않는다.
 *   경계와 에지가 같은 시각이면 "그 에지가 어느 구간에 속하는가"라는 경합이 생기고,
 *   학생이 풀 수 없는 문항이 된다. 시간축 설계로 원천 차단한다.
 */
const RISE_OFFSET = 0.5;
const FALL_OFFSET = 1.5;

export type SimResult = {
  /** 구간별 시작·끝 시각. */
  bounds: Array<{ from: number; to: number }>;
  /** 구간별 동작. */
  modes: PrClrMode[];
  /** 구간별 (PR̄, CLR̄). */
  bars: Array<{ pr: number; clr: number }>;
  /** 구간별 Q 값 열 — 리셋·세트면 [v], 토글이면 각 에지 직후 값들. */
  qPerRegion: number[][];
  /** 구간 끝에서의 Q. */
  qAtEnd: number[];
  totalPulses: number;
  tEnd: number;
};

/** 결정론 시뮬레이션 — 비동기 PR/CLR 우선, 그 외에는 활성 에지마다 토글. */
export function simulate(
  regions: RegionSpec[],
  decode: Decode,
  opts: { initialQ?: number; clockEdge?: "rising" | "falling" } = {},
): SimResult {
  // 에지 종류는 **펄스 개수**에 영향을 주지 않는다(구간 경계가 에지와 겹치지 않게 설계했으므로).
  // 파형 샘플 시각에만 쓰이므로 여기서는 필요 없다.
  const initialQ = opts.initialQ ?? 0;
  let q = initialQ;
  let pulse = 0;
  const bounds: Array<{ from: number; to: number }> = [];
  const modes: PrClrMode[] = [];
  const bars: Array<{ pr: number; clr: number }> = [];
  const qPerRegion: number[][] = [];
  const qAtEnd: number[] = [];

  for (const r of regions) {
    const from = 2 * pulse;
    const to = 2 * (pulse + r.pulses);
    const mode = modeOf(decode, r.a, r.b);
    bounds.push({ from, to });
    modes.push(mode);
    bars.push({ pr: presetBar(decode, r.a, r.b), clr: clearBar(decode, r.a, r.b) });

    if (mode === "set") {
      q = 1;
      qPerRegion.push([1]);
    } else if (mode === "reset") {
      q = 0;
      qPerRegion.push([0]);
    } else {
      const seq: number[] = [];
      for (let i = 0; i < r.pulses; i++) {
        q = q === 1 ? 0 : 1;
        seq.push(q);
      }
      qPerRegion.push(seq);
    }
    qAtEnd.push(q);
    pulse += r.pulses;
  }

  return { bounds, modes, bars, qPerRegion, qAtEnd, totalPulses: pulse, tEnd: 2 * pulse, };
}

/** step 파형 샘플 — 값이 바뀌는 시각에만 샘플을 찍는다(t는 항상 증가). */
function stepSamples(points: Array<{ t: number; v: number }>, tEnd: number): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.t === p.t) { last.v = p.v; continue; }
    if (last && last.v === p.v) continue;
    out.push({ ...p });
  }
  if (out.length && out[out.length - 1].t !== tEnd) out.push({ t: tEnd, v: out[out.length - 1].v });
  return out;
}

function clockSamples(totalPulses: number): Array<{ t: number; v: number }> {
  const pts: Array<{ t: number; v: number }> = [{ t: 0, v: 0 }];
  for (let i = 0; i < totalPulses; i++) {
    pts.push({ t: 2 * i + RISE_OFFSET, v: 1 });
    pts.push({ t: 2 * i + FALL_OFFSET, v: 0 });
  }
  return stepSamples(pts, 2 * totalPulses);
}

function inputSamples(
  regions: RegionSpec[],
  bounds: Array<{ from: number; to: number }>,
  pick: (r: RegionSpec) => number,
  tEnd: number,
): Array<{ t: number; v: number }> {
  const pts = regions.map((r, i) => ({ t: bounds[i].from, v: pick(r) }));
  return stepSamples(pts, tEnd);
}

function qSamples(sim: SimResult, regions: RegionSpec[], edgeOffset: number): Array<{ t: number; v: number }> {
  const pts: Array<{ t: number; v: number }> = [];
  let pulse = 0;
  sim.modes.forEach((mode, k) => {
    const { from } = sim.bounds[k];
    if (mode === "set") pts.push({ t: from, v: 1 });
    else if (mode === "reset") pts.push({ t: from, v: 0 });
    else {
      sim.qPerRegion[k].forEach((v, i) => pts.push({ t: 2 * (pulse + i) + edgeOffset, v }));
    }
    pulse += regions[k].pulses;
  });
  return stepSamples(pts, sim.tEnd);
}

export type DffPresetClearGeneration = {
  decode: Decode;
  regions: RegionSpec[];
  regionMarks: string[];
  sim: SimResult;
  clockEdge: "rising" | "falling";
  initialQ: number;
  circuitDiagram: DffPresetClearCircuitDiagram;
  /** (나) 문제 템플릿 — CLK·A·B는 주어지고 Q는 blank(학생이 도시). */
  waveformTemplate: WaveformDiagram;
  /** (나) 정답 — Q까지 채워진 형태. */
  waveformSolution: WaveformDiagram;
  presetExpr: string;   // "(Ā·B)′"
  clearExpr: string;    // "(Ā·B̄)′"
};

const OVERBAR = (s: string) => `${s}̄`; // A → Ā

function termExpr(t: Term, names: string[]): string {
  const a = t.a === 1 ? names[0] : OVERBAR(names[0]);
  const b = t.b === 1 ? names[1] : OVERBAR(names[1]);
  return `${a}·${b}`;
}

function gateInputs(t: Term, names: string[]): [DffPresetClearGateInput, DffPresetClearGateInput] {
  return [
    { name: names[0], inverted: t.a === 0 },
    { name: names[1], inverted: t.b === 0 },
  ];
}

export function generateDffPresetClearRegions(args: {
  seed?: number;
  index?: number;
  mode: GenerationMode;
  clockEdge?: "rising" | "falling";
}): DffPresetClearGeneration {
  const mode = args.mode;
  const space = mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 101) % space.length;
  // ★ 결선(decode)도 값 공간의 일부다 — 변형은 PR·CLR 곱항이 매번 달라져 인버터 배치가 바뀐다.
  const { regions, decode } = space[idx];
  const clockEdge = args.clockEdge ?? "rising";
  const initialQ = 0;
  const names = ["A", "B"];

  const sim = simulate(regions, decode, { initialQ, clockEdge });
  const edgeOffset = clockEdge === "rising" ? RISE_OFFSET : FALL_OFFSET;

  const regionBars = sim.bounds.map((b, i) => ({ from: b.from, to: b.to, label: REGION_MARKS[i] }));
  const clk = { name: "CLK", samples: clockSamples(sim.totalPulses), shape: "step" as const, vRange: { min: 0, max: 1 } };
  const aSig = { name: names[0], samples: inputSamples(regions, sim.bounds, (r) => r.a, sim.tEnd), shape: "step" as const, vRange: { min: 0, max: 1 } };
  const bSig = { name: names[1], samples: inputSamples(regions, sim.bounds, (r) => r.b, sim.tEnd), shape: "step" as const, vRange: { min: 0, max: 1 } };
  const qFilled = { name: "Q", samples: qSamples(sim, regions, edgeOffset), shape: "step" as const, vRange: { min: 0, max: 1 } };

  const waveformTemplate: WaveformDiagram = {
    signals: [clk, aSig, bSig, { name: "Q", samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } }],
    regions: regionBars,
  };
  const waveformSolution: WaveformDiagram = {
    signals: [clk, aSig, bSig, qFilled],
    regions: regionBars,
  };

  // ★ 원본 (가)는 A·B와 그 보수를 받는 **2-to-4 NAND 디코더**(NAND 4개 + 인버터 2개)다.
  //   그중 두 줄만 PR·CLR에 쓰이고 나머지 두 줄은 열린 단자로 남는다 — 부품 수를 원본과 맞춘다.
  //   (동작·정답은 PR·CLR 두 줄만으로 결정되므로 여분 줄은 답에 영향이 없다.)
  const usedTerms = [decode.presetTerm, decode.clearTerm];
  const spareGates = ([{ a: 0, b: 0 }, { a: 0, b: 1 }, { a: 1, b: 0 }, { a: 1, b: 1 }] as Term[])
    .filter((t) => !usedTerms.some((u) => u.a === t.a && u.b === t.b))
    .map((t) => gateInputs(t, names));

  const circuitDiagram: DffPresetClearCircuitDiagram = {
    presetInputs: gateInputs(decode.presetTerm, names),
    clearInputs: gateInputs(decode.clearTerm, names),
    spareGates,
    inputNames: names,
    clockEdge,
    qLabel: "Q",
    qBarLabel: "Q̄",
    clockLabel: "CLK",
    caption: "D 플립플롭 + 비동기 PR·CLR (D = Q̄ 되먹임 → 토글)",
  };

  return {
    decode,
    regions,
    regionMarks: REGION_MARKS.slice(0, regions.length),
    sim,
    clockEdge,
    initialQ,
    circuitDiagram,
    waveformTemplate,
    waveformSolution,
    presetExpr: `(${termExpr(decode.presetTerm, names)})′`,
    clearExpr: `(${termExpr(decode.clearTerm, names)})′`,
  };
}

// ─────────────────────────────────────────────────────────────
// 공용 매처 — 분류기와 감지기가 **같은 함수**를 쓴다 (복제하면 조용히 드리프트한다)
// ─────────────────────────────────────────────────────────────

const norm = (s: string) => (s ?? "").replace(/[’'`]/g, "′");

export function dffPresetClearText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return norm([
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" "));
}

/**
 * PR·CLR 두 비동기 입력. Vision이 "프리셋/클리어"·"세트/리셋" 어느 말로 써도 잡히게 넓게 둔다.
 * ★★ substring 함정: bare `셋`은 **"리셋"에 그대로 걸린다** — 리셋만 있는 형제(임용 8번)를
 *   "PR도 있다"로 오판하게 만든다. 반드시 `프리셋`처럼 앞말을 붙여 검사할 것.
 *   (CLAUDE.md의 "비정현파 ⊃ 정현파"·"개루프 이득 ⊃ 루프 이득"과 같은 유형의 사고.)
 */
const PRESET_RE = /\bPR\b|프리\s*셋|프리셋|preset|\bSET\b|세트|프리세트/i;
const CLEAR_RE = /\bCLR\b|클리어|clear|\bRESET\b|리셋/i;
/** 구간별 출력 파형을 묻는가. */
const REGION_ASK_RE = /구간\s*[㉠-㉣]|[㉠-㉣]\s*[~∼-]\s*[㉠-㉣]|[㉠-㉣][\s,·]+[㉡-㉣]|구간별|각\s*구간/;
const OUTPUT_ASK_RE = /출력\s*Q|Q\s*의\s*(값|파형|출력|논릿값)|Q\s*파형|파형을\s*(도시|그리)/;
/** 입력이 **A·B 두 개**인가 — 형제 `ff_with_waveform`은 A·B·C 3개다. */
const INPUT_AB_RE = /입력\s*(신호)?\s*[“"']?A[”"']?\s*[,·와과]\s*[“"']?B\b|\bA\s*,\s*B\b|신호\s*A\s*(와|과|,)\s*B/;
/**
 * 형제 양보 — 여러 FF로 만든 카운터·시프트·상태기계, 표·맵을 다루는 설계형은 이 유형이 아니다.
 * ※ bare "플립플롭"은 양보 근거가 못 된다(이 유형도 플립플롭이다).
 */
const SIBLING_YIELD_RE =
  /카운터|counter|시프트|shift|리플|ripple|상태도|상태표|여기표|카르노|K-?map|MUX|먹스|디먹스|demux|DAC|시퀀스\s*검출|상태\s*기계|Mealy|Moore|불\s*함수|논리식을\s*(구하|간략)/i;

/** 인벤토리의 플립플롭 개수. 2개 이상이면 카운터·상태기계 쪽이다. */
export function flipflopCount(a?: Partial<AnalysisResult> | null): number {
  const inv = a?.componentInventory ?? [];
  return inv.filter((c) => /^(FF|DFF|TFF|JKFF|SRFF|FLIPFLOP)$/i.test(String(c?.type ?? ""))).length;
}

/**
 * 구조 시그니처 — 낱말 하나가 아니라 **구조**로 잡는다(CLAUDE.md 규칙 2).
 *
 *  tier 1: PR·CLR **두 비동기 입력**이 함께 언급 + 구간별 출력 Q 요구.
 *  tier 2: PR·CLR을 통째로 흘린 회차 대비 — **단일 FF + 입력 A·B + 구간 마커 + 출력 Q**.
 *          (실측 요약이 "구간 ㉠~㉢에서의 출력 Q의 값"만 남기고 PR·CLR을 안 쓰는 경우가 있다.
 *           형제 중 이 넷을 동시에 갖는 유형은 없다 — ff_with_waveform은 입력이 A·B·C이고
 *           async_preset_ripple_counter는 FF 3개·I₀I₁I₂다.)
 */
export function matchesDffPresetClearSignature(a?: Partial<AnalysisResult> | null): boolean {
  const t = dffPresetClearText(a);
  if (!t) return false;
  if (SIBLING_YIELD_RE.test(t)) return false;
  if (flipflopCount(a) >= 2) return false;
  if (!/플립플롭|flip[\s-]?flop|\bFF\b|D-?FF/i.test(t)) return false;

  // ★★ 구조 신호 3개 중 **2개 이상**이면 이 유형으로 본다.
  //   실측(2026-08-12 사용자 신고): 셋을 모두 요구했더니 Vision이 구간 마커를 흘린 회차에서
  //   통째로 미발화해 형제 `ff_with_waveform`(입력 A·B·C + 비동기 RESET만)이 가져갔다.
  //   반대로 하나만 요구하면 형제를 뺏는다 — 2/3이 균형점이다.
  const signals = [
    PRESET_RE.test(t) && CLEAR_RE.test(t),   // (1) 비동기 입력이 **둘 다** (형제는 RESET 하나뿐)
    INPUT_AB_RE.test(t),                     // (2) 외부 입력이 A·B **2개** (형제는 A·B·C 3개)
    REGION_ASK_RE.test(t) && OUTPUT_ASK_RE.test(t), // (3) 구간별 출력 Q 요구
  ];
  return signals.filter(Boolean).length >= 2;
}
