import type { DcWheatstoneBalanceCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * DC 휘트스톤 브리지 평형 → 미지 저항 R_x + 출력 전압 V_o (임용 3번 회로이론) — 전용 archetype.
 *
 *  고정 토폴로지 (원본 이미지 그대로):
 *    V_s(+) ─ R_s ─ T(상단 레일) ─────────────┬── + V_o (개방 단자)
 *                    ╱ R1        ╲ R_TR      R_p (미지 암과 병렬)
 *                   L ─── R_g ─── R ──────────┴── − V_o
 *          R3a(L→B) │ R3b(L→GND)   │ R_RB
 *                   B ───── GND rail
 *
 *  · 평형(브리지 암 R_g에 전류 0) 조건: R1/R3eq = R_TR/R_RB  (R3eq = R3a∥R3b)
 *  · 미지 저항은 병렬쌍(R_x∥R_p) 안에 있다 → R_x = 1/(1/R_target − 1/R_p)
 *  · 평형 시 R_g 가지 전류가 0이므로 두 분압기는 독립 → 등가저항 R_par=(R1+R3eq)∥(R_TR+R_RB)
 *    V_T = V_s·R_par/(R_s+R_par),  V_o = V_T − V_R = V_T·R_TR/(R_TR+R_RB)
 *
 *  ★ 왜 전용 archetype인가 (실측 로그 기반):
 *    분류가 dc_resistive → **dc_nodal fallback(confidence low)** → topology_driven으로 dispatch되어
 *    (inventoryCount 8 ≥ 7 게이트) 브리지 다이아몬드·미지저항 R_x·출력단자 V_o가 전부 소실된
 *    임의 저항망이 생성됐다(totalIssues=0 — 에러 없이 조용히 변질). 형제 `ac_bridge_max_power`는
 *    교류(L·C)+테브난·최대전력 전용이라 순저항 DC 평형 문제를 재현할 수 없다.
 *
 *  ★ 값은 예시 하드코딩이 아니라 **규칙 열거 + 필터**(R_x 정수·V_T·V_o 정수), 원본 튜플 제외.
 */

/** 미지 저항이 놓인 암. 유사=상단 우측(원본), 변형=하단 우측(구하는 위치 교환). */
export type UnknownArm = "upper_right" | "lower_right";

export type DcWheatstoneBalanceGeneration = {
  values: {
    Vs: number; Rs: number;      // 전원 + 직렬 저항
    R1: number;                  // 상단 좌측 암 (T→L)
    R3a: number; R3b: number;    // 하단 좌측 암 (L→B) ∥ (L→GND)
    Rtr: number;                 // 상단 우측 암 합성 (T→R)
    Rrb: number;                 // 하단 우측 암 합성 (R→B)
    Rp: number;                  // 미지 암과 병렬인 보조 저항
    Rg: number;                  // 브리지 암 (L→R) — 평형이므로 답에 무관
    unknownArm: UnknownArm;
  };
  answer: { Rx: number; Vo: number; Vt: number; R3eq: number; Rpar: number };
  circuitDiagram: DcWheatstoneBalanceCircuitDiagram;
};

type Params = {
  Vs: number; Rs: number; R1: number; R3a: number; R3b: number;
  Rtr: number; Rrb: number; Rp: number; Rg: number; unknownArm: UnknownArm;
};

// 원본 튜플 (참조·검증 전용, 생성 풀에서 제외):
//   22V·4Ω 직렬 / 상단좌 4Ω / 하단좌 12Ω∥6Ω(=4Ω) / 상단우 R_x∥15Ω / 하단우 6Ω / 브리지 5Ω
//   → 평형 R_TR = R1·R_RB/R3eq = 4·6/4 = 6Ω → R_x = 1/(1/6 − 1/15) = 10Ω,
//     R_par = 8∥12 = 4.8Ω, V_T = 22·4.8/8.8 = 12V, V_o = 12·6/12 = 6V.
const ORIGINAL: Params = {
  Vs: 22, Rs: 4, R1: 4, R3a: 12, R3b: 6, Rtr: 6, Rrb: 6, Rp: 15, Rg: 5,
  unknownArm: "upper_right",
};

function par(a: number, b: number): number { return (a * b) / (a + b); }
function r3(x: number): number { return Math.round(x * 1000) / 1000; }
function isInt(x: number): boolean { return Math.abs(x - Math.round(x)) < 1e-9; }

function solve(p: Params): DcWheatstoneBalanceGeneration {
  const R3eq = par(p.R3a, p.R3b);
  // 미지 암의 합성값 = 평형 조건이 요구하는 값. 그 안에서 R_p와 병렬인 R_x를 역산.
  const target = p.unknownArm === "upper_right" ? p.Rtr : p.Rrb;
  const Rx = (target * p.Rp) / (p.Rp - target);

  const Rpar = par(p.R1 + R3eq, p.Rtr + p.Rrb);
  const Vt = (p.Vs * Rpar) / (p.Rs + Rpar);
  const Vo = (Vt * p.Rtr) / (p.Rtr + p.Rrb);

  const ohm = (v: number) => `${v}[Ω]`;
  const circuitDiagram: DcWheatstoneBalanceCircuitDiagram = {
    vsLabel: `${p.Vs}[V]`,
    rsLabel: ohm(p.Rs),
    r1Label: ohm(p.R1),
    // 하단 좌측 병렬쌍 — 원본 배치(큰 값이 세로, 작은 값이 다이아몬드 대각)에 맞춘다. 병렬이라 물리는 동일.
    r3aLabel: ohm(Math.min(p.R3a, p.R3b)),  // 대각 (L→B)
    r3bLabel: ohm(Math.max(p.R3a, p.R3b)),  // 세로 (L→GND)
    // 미지 암은 "R_x", 반대쪽은 수치. 병렬 보조 R_p는 미지 암 쪽에 붙는다.
    rtrLabel: p.unknownArm === "upper_right" ? "R_x" : ohm(p.Rtr),
    rrbLabel: p.unknownArm === "lower_right" ? "R_x" : ohm(p.Rrb),
    rpLabel: ohm(p.Rp),
    rgLabel: ohm(p.Rg),
    unknownArm: p.unknownArm,
    voLabel: "V_o",
  };

  return {
    values: { ...p },
    answer: { Rx: r3(Rx), Vo: r3(Vo), Vt: r3(Vt), R3eq: r3(R3eq), Rpar: r3(Rpar) },
    circuitDiagram,
  };
}

/**
 * 규칙 열거 + 필터 — 특정 예시를 박지 않는다.
 *   필터: R_x 정수(2~60)·R_p보다 작음 / V_T 정수 / V_o 정수 / 평형 합성값 0.5 배수.
 *   ★ 원본 튜플은 제외(참조 전용).
 */
function buildSpace(unknownArm: UnknownArm): Params[] {
  const out: Params[] = [];
  const R1s = [2, 3, 4, 5, 6, 8];
  // 하단 좌측 병렬쌍 — 합성이 정수인 조합만 (원본 12∥6=4 계열).
  const pairs: Array<[number, number]> = [[12, 6], [6, 3], [12, 12], [20, 5], [24, 8], [10, 15], [18, 9], [8, 8]];
  const Rrbs = [3, 4, 5, 6, 8, 10, 12];
  const Rps = [10, 12, 15, 20, 24, 30, 40];
  const Rss = [2, 3, 4, 5, 6];
  const Vss = [12, 18, 20, 22, 24, 30, 36, 44];
  const Rgs = [4, 5, 8, 10];

  for (const R1 of R1s)
    for (const [R3a, R3b] of pairs) {
      const R3eq = par(R3a, R3b);
      if (!isInt(R3eq)) continue;
      for (const Rrb of Rrbs) {
        // 평형 조건이 요구하는 상단 우측 합성값.
        const Rtr = (R1 * Rrb) / R3eq;
        if (!isInt(Rtr * 2) || Rtr <= 0) continue;
        const target = unknownArm === "upper_right" ? Rtr : Rrb;
        for (const Rp of Rps) {
          if (Rp <= target) continue;                       // R_x가 양수이려면 R_p > 합성값
          const Rx = (target * Rp) / (Rp - target);
          if (!isInt(Rx) || Rx < 2 || Rx > 60 || Rx === Rp) continue;
          const Rpar = par(R1 + R3eq, Rtr + Rrb);
          for (const Rs of Rss)
            for (const Vs of Vss) {
              const Vt = (Vs * Rpar) / (Rs + Rpar);
              if (!isInt(Vt) || Vt < 4 || Vt > 40) continue;
              const Vo = (Vt * Rtr) / (Rtr + Rrb);
              if (!isInt(Vo) || Vo < 2) continue;
              const Rg = Rgs[(R1 + Rrb + Rs) % Rgs.length];
              const p: Params = { Vs, Rs, R1, R3a, R3b, Rtr, Rrb, Rp, Rg, unknownArm };
              if (
                unknownArm === ORIGINAL.unknownArm &&
                p.Vs === ORIGINAL.Vs && p.Rs === ORIGINAL.Rs && p.R1 === ORIGINAL.R1 &&
                p.R3a === ORIGINAL.R3a && p.R3b === ORIGINAL.R3b &&
                p.Rtr === ORIGINAL.Rtr && p.Rrb === ORIGINAL.Rrb && p.Rp === ORIGINAL.Rp
              ) continue;  // ★ 원본 그대로는 생성하지 않는다
              out.push(p);
              if (out.length >= 800) return out;
            }
        }
      }
    }
  return out;
}

// exam_similar = 원본 구조(미지 저항이 상단 우측 암, R_p와 병렬).
// exam_variant = 구하는 위치 교환(미지 저항이 하단 우측 암) — 구조·원리 동일, 평형식 방향만 바뀜.
const SIMILAR_SPACE = buildSpace("upper_right");
const VARIANT_SPACE = buildSpace("lower_right");

export function generateDcWheatstoneBalance(args: { seed?: number; mode: GenerationMode }): DcWheatstoneBalanceGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  return solve(pick(space.length ? space : SIMILAR_SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플: R_x=10Ω·V_o=6V). */
export function __originalDcWheatstoneForVerify(): DcWheatstoneBalanceGeneration {
  return solve(ORIGINAL);
}
