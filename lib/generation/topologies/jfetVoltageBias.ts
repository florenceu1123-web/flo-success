import type { GenerationMode, JfetBiasCircuitDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * JFET 전압(분압) 바이어스 회로 (임용 2번 형식) 전용 archetype — 결정론 생성, GPT 없음.
 *
 *  회로: +V_DD ─ R₁ ─ G ─ R₂ ─ GND (분압) / +V_DD ─ R_D ─ D ─[JFET]─ S ─ R_S ─ GND.
 *        게이트 전류는 무시(JFET 게이트는 역바이어스 접합) → 분압비가 그대로 V_G.
 *
 *  ★ 기존 `mosfet_bias`와 **모델이 다르다** — 실측 신고(2026-08-01)에서 이 원본이 mosfet_bias로 가서
 *    소스 접지 NMOS + 제곱법칙 I_D=K(V_GS−V_TH)² 문제로 변질됐다(분압·R_S가 통째로 사라짐).
 *    이 유형은 **제곱법칙을 쓰지 않는다** — V_GS가 주어지므로 I_D는 소스 저항에서 바로 나온다.
 *
 *  ★ 물리(닫힌형, 손계산 검증):
 *      V_G  = V_DD · R₂/(R₁+R₂)          (게이트 전류 무시)
 *      V_S  = V_G − V_GS                  (V_GS = V_G − V_S)
 *      I_D  = V_S / R_S                   (게이트 전류 0 → I_D = I_S)
 *      R_D  = (V_DD − V_D) / I_D
 *      V_DS = V_D − V_S
 *    원본(V_DD=15, R₁=180k, R₂=120k, V_GS=−4, R_S=1k, V_D=13) → V_G=6V, V_S=10V, I_D=10mA, **R_D=200Ω**.
 *
 *  ★ 모드: 유사 = 원본과 같은 요구(V_G·R_D) / 변형 = R_D가 주어지고 **V_G·V_DS**를 구한다(구하는 양 교환).
 */

export type JfetVoltageBiasGeneration = {
  values: {
    vdd: number;      // [V]
    r1k: number;      // 상단 분압 저항 [kΩ]
    r2k: number;      // 하단 분압 저항 [kΩ]
    vgs: number;      // 게이트-소스 전압 [V] (음수)
    rsk: number;      // 소스 저항 [kΩ]
    rdk: number;      // 드레인 저항 [kΩ]
    vd: number;       // 드레인 전압 [V]
  };
  derived: {
    vg: number;       // 게이트 전압 [V]
    vs: number;       // 소스 전압 [V]
    idMa: number;     // 드레인 전류 [mA]
    vds: number;      // 드레인-소스 전압 [V]
  };
  /** 저항 표기 (R_D는 <1kΩ면 Ω 단위로) */
  labels: { rd: string; rs: string; r1: string; r2: string };
  circuitDiagram: JfetBiasCircuitDiagram;
};

/** kΩ 값을 사람이 읽는 표기로 — 1kΩ 미만은 Ω 단위. */
function ohmLabel(kOhm: number): string {
  if (kOhm >= 1) return `${trim(kOhm)}\\,[\\mathrm{k\\Omega}]`;
  return `${trim(kOhm * 1000)}\\,[\\Omega]`;
}
function trim(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}
/** 값이 "깔끔한가" — 정수 또는 .5 단위. */
function isNice(x: number): boolean {
  return Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
}

type JfetSet = {
  vdd: number; r1k: number; r2k: number; vgs: number; rsk: number; rdk: number;
  vg: number; vs: number; idMa: number; vd: number; vds: number;
};

/** 분압쌍 후보 (kΩ) — 임용 문제에 흔한 값. */
const DIVIDERS: Array<[number, number]> = [
  [180, 120], [120, 180], [200, 100], [100, 200], [150, 150],
  [240, 120], [120, 240], [270, 180], [160, 80], [90, 60], [300, 150], [100, 100],
];
const VDDS = [12, 15, 18, 20, 24];
const VGSS = [-1, -2, -3, -4, -5];
const RSS = [0.5, 1, 2];
const RDS = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.8, 1, 1.2, 1.5, 2];

function buildJfetSpace(): JfetSet[] {
  const out: JfetSet[] = [];
  for (const vdd of VDDS) {
    for (const [r1k, r2k] of DIVIDERS) {
      const vg = (vdd * r2k) / (r1k + r2k);
      if (!Number.isInteger(vg) || vg <= 0) continue;      // V_G는 정수만
      for (const vgs of VGSS) {
        const vs = vg - vgs;                                // V_GS < 0 → V_S > V_G
        if (vs <= 0 || vs >= vdd) continue;
        for (const rsk of RSS) {
          const idMa = vs / rsk;                            // [mA] (V / kΩ)
          if (!isNice(idMa) || idMa <= 0 || idMa > 20) continue;
          for (const rdk of RDS) {
            const vd = vdd - idMa * rdk;                    // [V] (mA · kΩ)
            // ★ V_D는 **정수**만 (원본이 13[V]). 23.5[V] 같은 소수는 문제 값으로 지저분하다.
            //   동시에 R_D 양단 전압(V_DD−V_D)이 최소 1V는 되게 해 R_D가 극단적으로 작아지지 않도록.
            if (!Number.isInteger(vd)) continue;
            if (vdd - vd < 1) continue;
            const vds = vd - vs;
            // JFET가 핀치오프(포화) 영역에서 동작하도록 여유를 둔다. V_DS ≥ |V_GS| + 1 이면 충분히 안전.
            if (vds < Math.abs(vgs) + 1) continue;
            if (vd >= vdd) continue;
            // 원본 튜플 제외 — 원본과 똑같은 문제가 나오면 안 된다.
            if (vdd === 15 && r1k === 180 && r2k === 120 && vgs === -4 && rsk === 1 && Math.abs(rdk - 0.2) < 1e-9) continue;
            out.push({ vdd, r1k, r2k, vgs, rsk, rdk, vg, vs, idMa, vd, vds });
          }
        }
      }
    }
  }
  return out;
}
const JFET_SPACE = buildJfetSpace();

export function generateJfetVoltageBias(args: { seed?: number; mode: GenerationMode }): JfetVoltageBiasGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  if (JFET_SPACE.length === 0) {
    // 값 공간은 코드로 고정돼 있어 도달 불가 — 조건을 바꿀 때 조용히 깨지지 않도록 명시적으로 막는다.
    throw new Error("jfetVoltageBias: 값 공간이 비었다 (필터가 과하게 좁아졌는지 확인)");
  }
  const s = pick(JFET_SPACE, rand);
  const variant = args.mode === "exam_variant";

  const labels = {
    rd: ohmLabel(s.rdk),
    rs: ohmLabel(s.rsk),
    r1: `${s.r1k}\\,[\\mathrm{k\\Omega}]`,
    r2: `${s.r2k}\\,[\\mathrm{k\\Omega}]`,
  };

  const circuitDiagram: JfetBiasCircuitDiagram = {
    vddLabel: `+${s.vdd}\\,[\\mathrm{V}]`,
    r1Label: labels.r1,
    r2Label: labels.r2,
    // 유사 = R_D 미지(기호) / 변형 = R_D 주어짐
    rdLabel: variant ? labels.rd : "R_D",
    rsLabel: labels.rs,
    vgsLabel: "V_{GS}",
    channel: "n",
  };

  return {
    values: { vdd: s.vdd, r1k: s.r1k, r2k: s.r2k, vgs: s.vgs, rsk: s.rsk, rdk: s.rdk, vd: s.vd },
    derived: { vg: s.vg, vs: s.vs, idMa: s.idMa, vds: s.vds },
    labels,
    circuitDiagram,
  };
}
