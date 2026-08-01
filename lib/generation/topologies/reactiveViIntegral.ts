import type { GenerationMode, ReactiveViIntegralCircuitDiagram, WaveformDiagram } from "@/types";

/**
 * 이상 인덕터/커패시터 v-i 적분 (임용 3번류).
 *
 * exam_similar (인덕터): 이상 인덕터 L에 전압 v(t)가 파형으로 주어질 때 i(t)=(1/L)∫₀ᵗ v dτ 도출.
 * exam_variant (커패시터, 쌍대): 이상 커패시터 C에 전류 i(t)가 파형으로 주어질 때 v(t)=(1/C)∫₀ᵗ i dτ 도출.
 *  (저항 없음. 초기값 0. 입력은 사다리꼴 조각선형 파형. 특정 구간의 출력 식(2차식)을 구함.)
 *
 * 결정론 계산(GPT 없음) — 조각선형 파형을 정확히 적분해 출력을 2차식으로 도출.
 */

export type ReactiveViIntegralGeneration = {
  element: "L" | "C";
  elemValue: number;        // L[H] 또는 C[F]
  ts: number[];             // 파형 브레이크포인트 시각 [0, t1, t2, t3]
  vs: number[];             // 각 브레이크포인트 입력값
  segIdx: number;           // 정답 구간(세그먼트 인덱스)
  outStart: number;         // 구간 시작에서의 출력값
  outEnd: number;           // 구간 끝에서의 출력값
  exprLatex: string;        // 출력 식 (예: "\\frac{-t^2+6t-5}{5}")
  circuitDiagram: ReactiveViIntegralCircuitDiagram;
  inputWaveform: WaveformDiagram;
  inputName: string;        // "v(t)" / "i(t)"
  outputName: string;       // "i(t)" / "v(t)"
  inputUnit: string;        // "V" / "A"
  outputUnit: string;       // "A" / "V"
};

/** 사다리꼴 입력 파형 파라미터 세트. 첫째=원본(L=5,Vp=2,[0,1,2,3]). */
const SETS: Array<{ val: number; peak: number; ts: number[] }> = [
  { val: 5, peak: 2, ts: [0, 1, 2, 3] },   // 원본: i(t)=(-t²+6t-5)/5, 구간[2,3]
  { val: 2, peak: 4, ts: [0, 1, 3, 4] },
  { val: 4, peak: 8, ts: [0, 2, 4, 6] },
  { val: 5, peak: 3, ts: [0, 2, 4, 6] },
  { val: 2, peak: 2, ts: [0, 1, 2, 4] },
];

const fmtNum = (n: number): string => {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? `${r}` : `${r}`;
};

/** 조각선형 파형(ts,vs)을 적분해 각 브레이크포인트 누적 출력 + 세그먼트별 2차 계수. */
function integrate(ts: number[], vs: number[], k: number) {
  const out: number[] = [0];
  for (let i = 0; i < ts.length - 1; i++) {
    const area = ((vs[i] + vs[i + 1]) / 2) * (ts[i + 1] - ts[i]); // 사다리꼴 면적
    out.push(out[i] + area / k);
  }
  return out;
}

/** 세그먼트 seg의 출력 i(t)=A t²+B t+C 계수 (k=L 또는 C). */
function segCoef(ts: number[], vs: number[], seg: number, k: number, outAt: number[]) {
  const t0 = ts[seg], v0 = vs[seg];
  const slope = (vs[seg + 1] - vs[seg]) / (ts[seg + 1] - ts[seg]);
  const A = slope / (2 * k);
  const B = (v0 - slope * t0) / k;
  const C = outAt[seg] + (-v0 * t0 + (slope / 2) * t0 * t0) / k;
  return { A, B, C };
}

/** A t²+B t+C 를 사람이 읽는 문자열로 (0 계수 생략). */
function polyStr(A: number, B: number, C: number): string {
  const parts: string[] = [];
  const term = (c: number, suf: string) => {
    const r = Math.round(c * 1000) / 1000;
    if (r === 0) return;
    const sign = parts.length === 0 ? (r < 0 ? "-" : "") : (r < 0 ? " - " : " + ");
    const mag = Math.abs(r);
    const magS = suf && mag === 1 ? "" : fmtNum(mag);
    parts.push(`${sign}${magS}${suf}`);
  };
  term(A, "t²");
  term(B, "t");
  term(C, "");
  return parts.length ? parts.join("") : "0";
}

export function generateReactiveViIntegral(args: { index?: number; mode?: GenerationMode }): ReactiveViIntegralGeneration {
  const isCap = args.mode === "exam_variant";
  const set = SETS[(args.index ?? 0) % SETS.length];
  const { val, peak, ts } = set;
  const vs = [0, peak, peak, 0]; // 사다리꼴: 0→peak(램프업)→peak(유지)→0(램프다운)

  const outAt = integrate(ts, vs, val);
  const seg = 2; // 정답 구간 = 램프다운 [t2,t3] (원본과 동일)
  const { A, B, C } = segCoef(ts, vs, seg, val, outAt);
  const expr = polyStr(A, B, C);

  const element: "L" | "C" = isCap ? "C" : "L";
  const inputName = isCap ? "i(t)" : "v(t)";
  const outputName = isCap ? "v(t)" : "i(t)";
  const inputUnit = isCap ? "A" : "V";
  const outputUnit = isCap ? "V" : "A";
  const elemLabel = isCap ? `${val}F` : `${val}H`;

  const circuitDiagram: ReactiveViIntegralCircuitDiagram = {
    element,
    sourceLabel: inputName,
    elemLabel,
    measureLabel: outputName,
  };

  // (나) 입력 파형 (사다리꼴). step 아님 — linear(조각선형).
  const inputWaveform: WaveformDiagram = {
    signals: [{ name: inputName, shape: "linear", samples: ts.map((t, i) => ({ t, v: vs[i] })) }],
    unit: { time: "s", value: inputUnit },
    xAxis: { symbol: "t", unit: "s" },
  };

  return {
    element, elemValue: val, ts, vs, segIdx: seg,
    outStart: Math.round(outAt[seg] * 1000) / 1000,
    outEnd: Math.round(outAt[seg + 1] * 1000) / 1000,
    exprLatex: expr, circuitDiagram, inputWaveform,
    inputName, outputName, inputUnit, outputUnit,
  };
}
