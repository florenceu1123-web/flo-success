import type { DcTwoSourceLadderCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 전압원 + 전류원이 함께 있는 DC 저항 사다리 → 두 저항의 전류 I₁·I₂ (임용 3번 회로이론) 전용 archetype.
 * GPT 없음(닫힌형).
 *
 *  (가) 고정 토폴로지 (원본 그대로):
 *      좌측 세로: V_s(+ 위) — 마디 A
 *      상단 가로: 마디 A —R_a(전류 I₁ →)— 마디 M —R_b— 마디 B
 *      우측 세로: 마디 B — I_s(↑, 전류원)
 *      마디 M 아래 세로: R_c — 마디 N
 *      마디 N 아래: R_d ∥ R_e (R_e에 전류 I₂ ↓) — 하단 rail(접지)
 *   원본: V_s=24V, R_a=4kΩ, R_b=1kΩ, I_s=12mA, R_c=2kΩ, R_d=6kΩ, R_e=3kΩ.
 *
 * ★ 물리(닫힌형): 하단 병렬 R_p = R_d∥R_e.
 *     마디 B는 전류원과 R_b뿐 → R_b에는 **I_s가 그대로** 흐른다(마디 M으로 유입).
 *     마디 M KCL: (V_s−V_M)/R_a + I_s = V_M/(R_c+R_p)
 *       → **V_M = (V_s/R_a + I_s) / (1/R_a + 1/(R_c+R_p))**
 *     **I₁ = (V_s − V_M)/R_a** (A→M 방향, 음수면 반대 방향),  V_N = V_M·R_p/(R_c+R_p),
 *     **I₂ = V_N/R_e**,  I_Rd = V_N/R_d,  I_Rc = V_M/(R_c+R_p).
 *   ★ R_b는 답에 영향이 없다(이상 전류원과 직렬) — 원본 그대로의 distractor.
 *   원본 검산: R_p=2k, R_c+R_p=4k → V_M=(6+12)/(0.25+0.25)=36V, **I₁=−3mA**, V_N=18V, **I₂=6mA**.
 *
 * ★ 왜 전용 archetype인가: universal_dc는 회로 자체는 정확히 재현하지만(연결 관계 동일 확인),
 *   generic netlist 렌더러가 "hub + 직렬 pendant leg"를 세로 체인으로 접어 그려 **원본 사다리 그림과
 *   전혀 다르게** 보인다(사용자 신고 2회). 그림을 원본에 맞추려면 고정 슬롯 렌더러가 필요하다.
 *
 * ★ 값은 예시 hardcode가 아니라 ★규칙 열거+정수 필터★ — 원본 튜플 제외.
 */

export type DcTwoSourceLadderGeneration = {
  values: {
    Vs: number; Ra: number; Rb: number; Is: number; Rc: number; Rd: number; Re: number;
    vsLabel: string; raLabel: string; rbLabel: string; isLabel: string;
    rcLabel: string; rdLabel: string; reLabel: string;
  };
  answer: {
    Rp: number; Vm: number; Vn: number;
    I1: number; I2: number;      // 유사: R_a·R_e 전류
    Irc: number; Ird: number;    // 변형: R_c·R_d 전류
    i1Label: string; i2Label: string;
    i1Value: number; i2Value: number;  // 모드별 실제 정답
  };
  circuitDiagram: DcTwoSourceLadderCircuitDiagram;
};

type Family = { Vs: number; Ra: number; Rb: number; Is: number; Rc: number; Rd: number; Re: number };

// 원본 튜플 (참조·검증 전용, 생성 풀 제외).
const ORIGINAL: Family = { Vs: 24, Ra: 4, Rb: 1, Is: 12, Rc: 2, Rd: 6, Re: 3 };

/** kΩ·mA·V 단위계 — R[kΩ], I[mA], V[V]이면 옴의 법칙이 그대로 성립한다. */
function solve(f: Family, mode: GenerationMode): DcTwoSourceLadderGeneration {
  const { Vs, Ra, Rb, Is, Rc, Rd, Re } = f;
  const Rp = (Rd * Re) / (Rd + Re);
  const Rser = Rc + Rp;
  const Vm = (Vs / Ra + Is) / (1 / Ra + 1 / Rser);
  const I1 = (Vs - Vm) / Ra;
  const Irc = Vm / Rser;
  const Vn = Vm * (Rp / Rser);
  const I2 = Vn / Re;
  const Ird = Vn / Rd;

  const variant = mode === "exam_variant";
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const circuitDiagram: DcTwoSourceLadderCircuitDiagram = {
    vsLabel: `${Vs}[V]`, raLabel: `${Ra}[kΩ]`, rbLabel: `${Rb}[kΩ]`, isLabel: `${Is}[mA]`,
    rcLabel: `${Rc}[kΩ]`, rdLabel: `${Rd}[kΩ]`, reLabel: `${Re}[kΩ]`,
    i1Label: "I₁", i2Label: "I₂",
    i1On: variant ? "Rc" : "Ra",
    i2On: variant ? "Rd" : "Re",
  };

  return {
    values: {
      Vs, Ra, Rb, Is, Rc, Rd, Re,
      vsLabel: circuitDiagram.vsLabel, raLabel: circuitDiagram.raLabel, rbLabel: circuitDiagram.rbLabel,
      isLabel: circuitDiagram.isLabel, rcLabel: circuitDiagram.rcLabel,
      rdLabel: circuitDiagram.rdLabel, reLabel: circuitDiagram.reLabel,
    },
    answer: {
      Rp: r3(Rp), Vm: r3(Vm), Vn: r3(Vn),
      I1: r3(I1), I2: r3(I2), Irc: r3(Irc), Ird: r3(Ird),
      i1Label: "I₁", i2Label: "I₂",
      i1Value: r3(variant ? Irc : I1),
      i2Value: r3(variant ? Ird : I2),
    },
    circuitDiagram,
  };
}

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *   · V_M·V_N이 정수, I₁·I₂·I_Rc·I_Rd가 모두 0.5 배수(깔끔한 답)
 *   · R_d ≠ R_e (병렬 뱅크가 의미 있게), R_p가 0.5 배수
 *   · |I₁| ≥ 0.5 (0이면 문제가 무의미), 모든 전류 |·| ≤ 40mA
 *   · 원본 튜플 제외
 */
function buildSpace(): Family[] {
  const out: Family[] = [];
  const half = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
  const RS = [1, 2, 3, 4, 5, 6, 8, 12];
  for (const Vs of [12, 18, 20, 24, 30, 36])
    for (const Ra of [1, 2, 3, 4, 5, 6])
      for (const Is of [2, 4, 5, 6, 8, 10, 12, 15])
        for (const Rc of [1, 2, 3, 4])
          for (const Rd of RS)
            for (const Re of RS) {
              if (Rd === Re) continue;
              const Rp = (Rd * Re) / (Rd + Re);
              if (!half(Rp)) continue;
              const f: Family = { Vs, Ra, Rb: 1, Is, Rc, Rd, Re };
              const a = solve(f, "exam_similar").answer;
              if (!Number.isInteger(a.Vm) || !Number.isInteger(a.Vn)) continue;
              if (![a.I1, a.I2, a.Irc, a.Ird].every((x) => half(x) && Math.abs(x) <= 40)) continue;
              if (Math.abs(a.I1) < 0.5 || a.I2 <= 0) continue;
              if (
                Vs === ORIGINAL.Vs && Ra === ORIGINAL.Ra && Is === ORIGINAL.Is &&
                Rc === ORIGINAL.Rc && Rd === ORIGINAL.Rd && Re === ORIGINAL.Re
              ) continue;                                     // 원본 튜플 제외
              // R_b는 답에 무관한 distractor — 값만 다양하게 (결정론적으로 순환)
              out.push({ ...f, Rb: [1, 2, 3][out.length % 3] });
              if (out.length >= 4000) return out;
            }
  return out;
}
const SPACE = buildSpace();

/**
 * 유사·변형 모두 **같은 회로**(원본 보존). 모드는 ★구하는 대상 저항★만 바꾼다:
 *   exam_similar = R_a에 흐르는 I₁ · R_e에 흐르는 I₂ (원본)
 *   exam_variant = R_c에 흐르는 I₁ · R_d에 흐르는 I₂ (구하는 양 교환)
 * 값 풀은 절반씩 나눠 두 모드가 서로 다른 수치를 쓴다.
 */
export function generateDcTwoSourceLadder(args: { seed?: number; mode: GenerationMode }): DcTwoSourceLadderGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const halfN = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8 ? SPACE : args.mode === "exam_variant" ? SPACE.slice(halfN) : SPACE.slice(0, halfN);
  return solve(pick(pool.length ? pool : SPACE, rand), args.mode);
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalDcTwoSourceLadderForVerify(): DcTwoSourceLadderGeneration {
  return solve(ORIGINAL, "exam_similar");
}
/** 스모크용 — 생성 풀 크기. */
export function __dcTwoSourceLadderPoolSize(): number { return SPACE.length; }
