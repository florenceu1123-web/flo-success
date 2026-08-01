import type { WaveformDiagram } from "@/types";

/**
 * i(t) 램프 파형이 주어진 RL 회로 — 기울기로 인덕턴스 L 도출 (임용 2번 회로이론) 전용 archetype.
 *
 *  원본: V_s + SW(t=0에 닫힘) + R + L 직렬. 스위치를 닫은 뒤 인덕터 전류 i(t)가 **그림 (나)**로 주어진다
 *        (0~t₁ 선형 상승 → I_sat에서 포화). 0≤t≤t₁에서 v_L = 1V일 때 L을 구하고, 포화 구간(t=t_q)의 v_L을 구한다.
 *
 *  ★ generic switched_rl/rl_step은 "τ·지수응답" 문제를 만들어 이 구조를 잃는다. 실측 신고에서는
 *    route의 2전원 SPDT 감지기(detectSwitchedRlDualSource)까지 가로채 전혀 다른 회로가 나왔다.
 *
 *  물리(닫힌형, GPT 없음):
 *    v_L = L·di/dt.  램프 구간 기울기 m = I_sat/t₁  →  **L = v_L / m = v_L·t₁ / I_sat**
 *    포화 구간은 di/dt = 0  →  **v_L = 0 V** (이때 전원 전압은 전부 R에 걸린다: V_s = I_sat·R)
 *
 *  모드:
 *    exam_similar  = 원본 구조 (v_L 주어짐 → L 도출, 포화 구간 v_L 질문)
 *    exam_variant  = **쌍대(커패시터)**: v_C(t) 램프 주어짐 → i_C = C·dv/dt → C 도출, 포화 구간 i_C = 0
 */

export type InductorRampGeneration = {
  element: "L" | "C";
  /** 소자 값 (H 또는 F) */
  elemValue: number;
  /** 램프 종료 시각 [s] */
  t1: number;
  /** 포화값 (전류 A 또는 전압 V) */
  sat: number;
  /** 램프 구간에서 주어지는 반대량 (v_L[V] 또는 i_C[A]) */
  given: number;
  /** 질문 시각 [s] — 포화 구간 */
  tq: number;
  /** 직렬 저항 [Ω] */
  R: number;
  /** 전원 [V] 또는 [A] — 포화 시 sat·R (인덕터) / sat/R (커패시터 쌍대) */
  src: number;
  waveform: WaveformDiagram;
  labels: {
    elemKo: string;      // 인덕터 / 커패시터
    elemSym: string;     // L / C
    elemUnit: string;    // H / F
    yName: string;       // i(t) / v(t)
    yUnit: string;       // A / V
    givenSym: string;    // v_L / i_C
    givenUnit: string;   // V / A
    srcSym: string;      // V_s / I_s
  };
};

/** 규칙 열거 + 필터 — 특정 예시 hardcode 금지. 원본 튜플(4A·2s·1V·0.5H)은 생성 풀에서 제외. */
function buildSpace(): Array<{ t1: number; sat: number; given: number; R: number }> {
  const out: Array<{ t1: number; sat: number; given: number; R: number }> = [];
  for (const t1 of [1, 2, 4, 5]) {
    for (const sat of [2, 3, 4, 5, 6, 8]) {
      for (const given of [1, 2, 3, 4, 5, 6]) {
        for (const R of [2, 3, 4, 5, 10]) {
          const slope = sat / t1;                 // A/s
          const L = given / slope;                // H
          // 값이 깔끔한 것만: L이 0.25 배수, 소스 전압 정수·30V 이하
          if (Math.abs(L * 4 - Math.round(L * 4)) > 1e-9) continue;
          if (L < 0.25 || L > 5) continue;
          const src = sat * R;
          if (src > 30 || !Number.isInteger(src)) continue;
          // 원본 튜플 제외 (참조·검증 전용)
          if (t1 === 2 && sat === 4 && given === 1) continue;
          out.push({ t1, sat, given, R });
        }
      }
    }
  }
  return out;
}

const SPACE = buildSpace();

export function generateInductorRampSlope(args: {
  mode: "exam_similar" | "exam_variant";
  index?: number;
  seed?: number;
}): InductorRampGeneration {
  const variant = args.mode === "exam_variant";
  // 모드별로 풀을 반씩 나눠 유사·변형이 같은 값이 되지 않게 한다.
  const half = Math.floor(SPACE.length / 2);
  const pool = variant ? SPACE.slice(half) : SPACE.slice(0, half);
  const idx = ((args.index ?? 0) + (args.seed ?? 0)) % pool.length;
  const p = pool[Math.abs(idx)];

  const slope = p.sat / p.t1;
  const elemValue = round4(p.given / slope);
  const tq = p.t1 * 2;                       // 포화 구간의 한 시점
  const tEnd = Math.max(tq + 1, p.t1 * 2 + 1);

  // (나) 파형 — 램프 후 포화. 꺾이는 점을 정확히 표현하기 위해 3점.
  const waveform: WaveformDiagram = {
    signals: [
      {
        name: variant ? "v(t)" : "i(t)",
        shape: "linear",
        samples: [
          { t: 0, v: 0 },
          { t: p.t1, v: p.sat },
          { t: tEnd, v: p.sat },
        ],
      },
    ],
    unit: { time: "s", value: variant ? "V" : "A" },
    xAxis: { symbol: "t", unit: "s" },
    markers: [
      { t: p.t1, label: `t=${p.t1}` },
      { t: tq, label: `t=${tq}` },
    ],
    yMarkers: [{ v: p.sat, label: `${p.sat}` }],
  };

  return {
    element: variant ? "C" : "L",
    elemValue,
    t1: p.t1,
    sat: p.sat,
    given: p.given,
    tq,
    R: p.R,
    src: variant ? round4(p.sat / p.R) : p.sat * p.R,
    waveform,
    labels: variant
      ? {
          elemKo: "커패시터", elemSym: "C", elemUnit: "F",
          yName: "v(t)", yUnit: "V", givenSym: "i_C", givenUnit: "A", srcSym: "I_s",
        }
      : {
          elemKo: "인덕터", elemSym: "L", elemUnit: "H",
          yName: "i(t)", yUnit: "A", givenSym: "v_L", givenUnit: "V", srcSym: "V_s",
        },
  };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
