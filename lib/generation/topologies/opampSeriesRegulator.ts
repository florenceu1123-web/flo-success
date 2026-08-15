import type { OpampSeriesRegulatorCircuitDiagram } from "@/types";
import { makeRand, round3 } from "./_helpers";

/**
 * OPAMP(오차증폭기) 기반 직렬형 전압 레귤레이터 (임용 30번 전자회로 형식) — 전용 archetype.
 *
 *  회로: V_DD ── NPN(직렬 패스: C=V_DD, E=V_o) ── V_o
 *        OPAMP: (+)=제너 기준전압 V_z, (−)=피드백 분압 탭 M.  OPAMP 출력 → 베이스, R_s(base bias).
 *        피드백 분압: V_o ─R_a─ M ─R_b─ GND, M → OPAMP(−).  부하 R_L: V_o ─R_L─ GND.
 *
 *  ★ 위 zener_bjt_regulator(임용 8번, 션트형·OPAMP 없음)와 토폴로지·물리가 완전히 다름.
 *    이쪽은 OPAMP 가상단락으로 출력을 감지·되먹임하는 직렬 패스형 → OPAMP 필수.
 *
 *  물리(이상 OPAMP 가상단락):
 *   V_− = V_+ = V_z,  V_− = V_o·R_b/(R_a+R_b)  →  V_o = V_z·(R_a+R_b)/R_b = V_z(1 + R_a/R_b).
 *
 *  3단계 풀이 (닫힌형, GPT 없음):
 *   [단계 1] V_o = V_z(1 + R_a/R_b).
 *   [단계 2] 피드백 분압기 전류 I_f = V_z/R_b (= V_o/(R_a+R_b)),  부하 전류 I_L = V_o/R_L.
 *   [단계 3] 트랜지스터가 공급하는 이미터 전류 I_E = I_L + I_f.
 *
 *  모드:
 *   exam_similar  = V_o·전류 도출 (원본 구조 보존).
 *   exam_variant  = 역문제 — 목표 V_o를 주고 피드백 저항 R_a를 설계(도출). "구하는 양" 교환.
 */

export type OpampSeriesRegulatorGeneration = {
  circuitDiagram: OpampSeriesRegulatorCircuitDiagram;
  mode: "exam_similar" | "exam_variant";
  answer: {
    Vo: number;      // V
    Ra: number;      // kΩ (variant에서 도출 대상)
    If_mA: number;   // 피드백 분압 전류 (mA)
    IL_mA: number;   // 부하 전류 (mA)
    IE_mA: number;   // 이미터 전류 (mA)
  };
  values: { Vdd: number; Vz: number; Ra: number; Rb: number; RL: number; k: number };
};

type Tuple = { Vz: number; Rb: number; k: number; Vdd: number; RL: number };

// ★ 정수만 — 소수 제너전압(2.5)이 있으면 조건에는 "2.5V"로, 정답·풀이에는 전역 분수 변환기(1-4-3)가
//   바꾼 "5/2"로 찍혀 한 문항 안에서 표기가 갈린다(실측). 값 공간에서 소수를 없애는 쪽이 근본 해결.
const V_Z_SET = [2, 3, 4, 5];
const RB_SET = [10, 20]; // kΩ
const K_SET = [1, 2, 3]; // Ra/Rb 비 (소자 비율)
const VDD_SET = [12, 15, 18, 24];
const RL_SET = [2, 4, 5, 10]; // kΩ

// 원본 튜플 (V_z=10·R_a=R_b=20k·V_o=20·V_DD=30) — 생성 풀에서 제외 (참조 전용, feedback_generic_code).
function isOriginal(t: Tuple): boolean {
  return t.Vz === 10 && t.Rb === 20 && t.k === 1 && t.Vdd === 30;
}

/**
 * 규칙 열거 + 필터로 값 공간 구성 (특정 예시 hardcode 금지).
 *  - V_o = V_z(1+k) 는 정수, 4..24
 *  - V_DD 는 V_o보다 3V 이상 여유 (패스 트랜지스터 head-room)
 *  - I_f = V_z/R_b [mA] 는 0.05 배수
 *  - I_L = V_o/R_L [mA] 는 0.5 배수, ≥ 0.5
 */
function buildSpace(): Tuple[] {
  const out: Tuple[] = [];
  for (const Vz of V_Z_SET)
    for (const Rb of RB_SET)
      for (const k of K_SET) {
        const Vo = Vz * (1 + k);
        if (!Number.isInteger(Vo) || Vo < 4 || Vo > 24) continue;
        const If = Vz / Rb; // mA
        if (Math.abs(If / 0.05 - Math.round(If / 0.05)) > 1e-9) continue;
        for (const Vdd of VDD_SET) {
          if (Vdd - Vo < 3) continue;
          for (const RL of RL_SET) {
            const IL = Vo / RL; // mA
            if (IL < 0.5) continue;
            if (Math.abs(IL / 0.5 - Math.round(IL / 0.5)) > 1e-9) continue;
            const t: Tuple = { Vz, Rb, k, Vdd, RL };
            if (isOriginal(t)) continue;
            out.push(t);
          }
        }
      }
  return out;
}

const SPACE = buildSpace();

function solve(t: Tuple, mode: "exam_similar" | "exam_variant"): OpampSeriesRegulatorGeneration {
  const Ra = t.k * t.Rb; // kΩ
  const Vo = t.Vz * (1 + t.k);
  const If_mA = t.Vz / t.Rb; // mA (= Vo/(Ra+Rb))
  const IL_mA = Vo / t.RL; // mA
  const IE_mA = IL_mA + If_mA;

  const raUnknown = mode === "exam_variant";
  const circuitDiagram: OpampSeriesRegulatorCircuitDiagram = {
    vddLabel: `${t.Vdd}V`,
    vzLabel: `${t.Vz}V`,
    rsLabel: "1kΩ",
    raLabel: raUnknown ? "R_a=?" : `${Ra}kΩ`,
    rbLabel: `${t.Rb}kΩ`,
    voLabel: "V_o",
    rlLabel: `${t.RL}kΩ`,
    raUnknown,
  };

  return {
    circuitDiagram,
    mode,
    answer: {
      Vo: round3(Vo),
      Ra: round3(Ra),
      If_mA: round3(If_mA),
      IL_mA: round3(IL_mA),
      IE_mA: round3(IE_mA),
    },
    values: { Vdd: t.Vdd, Vz: t.Vz, Ra, Rb: t.Rb, RL: t.RL, k: t.k },
  };
}

/**
 * 시드·모드·index로 결정론 생성. count개가 서로 다르도록 (offset+index)로 공간을 훑는다.
 */
export function generateOpampSeriesRegulator(args: {
  seed?: number;
  mode: "exam_similar" | "exam_variant";
  index?: number;
}): OpampSeriesRegulatorGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const base = Math.floor(rand() * SPACE.length);
  const offset = args.mode === "exam_variant" ? Math.floor(SPACE.length / 2) : 0;
  const idx = (base + offset + (args.index ?? 0)) % SPACE.length;
  return solve(SPACE[idx], args.mode);
}
