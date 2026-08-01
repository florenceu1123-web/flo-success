/**
 * 제너 클리퍼 + 적분기(삼각파) — 임용 2번 전자회로 전용 archetype.
 *
 * 원본 구조 (고정):
 *   (가) v_s ──R_in── OPAMP1(−)  피드백에 **제너 2개 역직렬**(V_Z1=V_Z2=V_Z) → v_1
 *        v_1 ──R_int── OPAMP2(−) 피드백에 **커패시터 C** (적분기)        → v_o
 *        두 OPAMP의 (+)는 접지, 이상적으로 동작
 *   (나) v_s(t) = 진폭 A, 주기 T 의 정현파
 *
 * ★ 기존 `functionGenerator`와 다르다 — 그건 비교기+적분기가 **피드백 루프**로 묶인 자체
 *   발진기다. 이쪽은 **외부 입력 v_s가 들어오는 개루프 종속 연결**이라 구조·물리가 다르다.
 *
 * 물리 (수치 시간영역 시뮬레이션으로 독립 검증 완료):
 *   1단: 제너 역직렬 피드백 → 한쪽은 항복(V_Z), 다른 쪽은 순방향(V_D=0.7)
 *        |v_1| = V_Z + V_D = V_clip,  v_1 은 v_s 의 **반전 구형파** (±V_clip)
 *   2단: 적분기 v_o' = −v_1/(R_int·C) → v_1 이 일정하므로 **일정 기울기 램프**
 *        반주기 동안의 변화량 ΔV = V_clip · (T/2)/(R_int·C)
 *        커패시터 초깃값 0 → v_o 는 0 ↔ ΔV 를 오가는 **삼각파**
 *   ⇒ ΔV = V_clip·(T/2)/(R_int·C),  v_o(T/2) = ΔV  (0에서 시작해 반주기에 최대)
 *
 *   ★★ **원본이 묻는 V_PP 는 v_1(구형파)의 peak-to-peak = 2·V_clip 이다** — v_o 의 것이 아니다.
 *      발문: "v_1(t) 파형의 양의 최대 전압에서 음의 최대 전압까지의 최대 변동값".
 *      (이 구분을 놓치면 답이 절반이 된다. 실제로 인계 메모에 잘못 적었다가 발문에서 잡았다.)
 *
 *   원본(V_Z=5, R_int=10kΩ, C=0.01μF, T=200μs) → RC=100μs = T/2, V_clip=5.7V
 *        → **V_PP = 2×5.7 = 11.4[V]**,  **v_o(100μs) = ΔV = 5.7[V]** ✅
 */
import type { GenerationMode } from "@/types";

/** 다이오드 순방향 전압 강하 [V] — 원본 단서에 명시된 값. */
export const V_DIODE = 0.7;

export type ZenerClipperParams = {
  /** 제너 항복 전압 [V] (두 제너 동일) */
  vz: number;
  /** 입력 저항 [kΩ] — 1단 */
  rin: number;
  /** 적분기 저항 [kΩ] */
  rint: number;
  /** 적분기 커패시터 [μF] */
  cap: number;
  /** 입력 정현파 주기 [μs] */
  period: number;
  /** 입력 정현파 진폭 [V] */
  amp: number;
};

export type ZenerClipperInstance = {
  params: ZenerClipperParams;
  /** 클리핑 전압 V_clip = V_Z + 0.7 [V] */
  vClip: number;
  /** 적분기 시정수 [μs] */
  rcUs: number;
  /** v_o 램프의 반주기 변화량 ΔV [V] — v_o 삼각파의 peak-to-peak 이기도 하다.
   *  ★ 원본이 묻는 V_PP 는 **v_1(구형파)의** peak-to-peak(= 2·V_clip)로 이것과 다르다. */
  voPeak: number;
  /** 반주기 시각 [μs] — 이 시점에 v_o 가 최대 */
  halfUs: number;
};

/** 닫힌형 해. */
export function solveZenerClipper(p: ZenerClipperParams): ZenerClipperInstance {
  // 부동소수 꼬리를 만들지 않도록 자릿수를 정리한다 (kΩ·μF → μs 는 ×1000).
  const round = (v: number, d = 6) => Number(v.toFixed(d));
  const vClip = round(p.vz + V_DIODE);
  const rcUs = round(p.rint * p.cap * 1000);
  const halfUs = p.period / 2;
  return { params: p, vClip, rcUs, voPeak: round((vClip * halfUs) / rcUs), halfUs };
}

const isMul = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9;

/** 원본 튜플 — 유사·변형 모두 제외. */
const ORIGINAL = { vz: 5, rint: 10, cap: 0.01, period: 200 };

/**
 * 규칙 열거 + 필터 — V_PP 가 0.1V 단위로 깔끔하고 시정수도 자연스러운 조합만.
 * (V_clip 은 항상 x.7 이므로 V_PP 도 소수 한 자리로 떨어지게 비율을 정수·반정수로 제한한다.)
 */
export const ZENER_CLIPPER_SPACE: ZenerClipperInstance[] = (() => {
  const out: ZenerClipperInstance[] = [];
  for (const vz of [3, 4, 5, 6, 8, 9, 12]) {
    for (const rint of [5, 10, 20, 40]) {
      for (const cap of [0.005, 0.01, 0.02, 0.05]) {
        for (const period of [100, 200, 400, 500, 800]) {
          const inst = solveZenerClipper({ vz, rin: 10, rint, cap, period, amp: 1 });
          const ratio = inst.halfUs / inst.rcUs;
          // 비율은 0.5·1·1.5·2 처럼 깔끔하게 (문제 풀이가 단순해야 한다)
          if (!isMul(ratio, 0.5) || ratio < 0.5 || ratio > 2) continue;
          if (!isMul(inst.voPeak, 0.1)) continue;
          if (inst.voPeak < 1.5 || inst.voPeak > 30) continue;
          if (inst.rcUs < 25 || inst.rcUs > 500) continue;
          if (vz === ORIGINAL.vz && rint === ORIGINAL.rint && cap === ORIGINAL.cap && period === ORIGINAL.period) continue;
          out.push(inst);
        }
      }
    }
  }
  // ★ (V_Z, 비율)이 같으면 답(V_PP)이 같아 사실상 같은 문제다 — 조합마다 하나씩만 남겨
  //   후보끼리 답이 겹치지 않게 한다.
  const seen = new Set<string>();
  return out.filter((i) => {
    const key = `${i.params.vz}|${(i.halfUs / i.rcUs).toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
})();

/** 소수 꼬리 없는 표기. */
export function num(v: number): string {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return String(r);
  return String(Number(v.toFixed(4)));
}

/** 모드별 후보 (유사·변형 풀 분리). */
export function pickZenerClipper(mode: GenerationMode, seed: number): ZenerClipperInstance {
  const space = ZENER_CLIPPER_SPACE;
  if (space.length === 0) return solveZenerClipper({ vz: 6, rin: 10, rint: 10, cap: 0.01, period: 200, amp: 1 });
  const half = Math.ceil(space.length / 2);
  const pool = mode === "exam_variant" ? space.slice(half) : space.slice(0, half);
  const use = pool.length > 0 ? pool : space;
  return use[Math.abs(seed) % use.length];
}
