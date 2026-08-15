import type { BjtSwitchLogicCircuitDiagram, GenerationMode, TruthTableDiagram, LogicNetworkDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * BJT 이상적 스위치 응용 회로 → 진리표 빈칸 + **동일 동작 논리게이트** (임용 2번) 전용 archetype.
 * GPT 없음(스위치 동작을 규칙으로 계산).
 *
 *  (가) 회로 — 구성(config)별 고정 토폴로지:
 *   · `pnp_high_side` (**원본**): +V_CC — PNP **이미터**, 베이스 ← R_B ← X, **컬렉터** → Y → R_C → 접지
 *       X=H → V_EB=0 → OFF → Y=0(L) / X=L → V_EB=V_CC → 포화 → Y≈V_CC(H)  ⇒ **NOT**
 *   · `npn_low_side`: +V_CC — R_C — Y — NPN **컬렉터**, 베이스 ← R_B ← X, **이미터** → 접지
 *       X=H → 포화 → Y≈0(L) / X=L → OFF → Y=V_CC(H)  ⇒ **NOT** (소자·배치 교환)
 *   · `npn_series2`: R_C 풀업 아래에 NPN 2개가 **직렬** (X₁·X₂) → 둘 다 H일 때만 Y=L  ⇒ **NAND**
 *   · `npn_parallel2`: R_C 풀업 아래에 NPN 2개가 **병렬** (X₁·X₂) → 하나라도 H면 Y=L  ⇒ **NOR**
 *
 * ★ 원본 판독(이미지 6배 확대): 화살표가 **베이스를 향하고** 그 리드가 +5V로 올라간다 →
 *   **PNP·이미터가 위**. 그래서 하이사이드 스위치이고 답은 인버터다([[feedback_verify_wiring_by_zoom]]).
 *   (NPN으로 잘못 읽으면 이미터 팔로워가 되어 **버퍼**라는 정반대 답이 나온다.)
 *
 * ★ 값은 규칙 열거 — 유사는 원본 구성을 유지하고 **전원 전압·저항값**만 바꾼다(원본 5V 제외).
 */

export type BjtSwitchConfig = "pnp_high_side" | "npn_low_side" | "npn_series2" | "npn_parallel2";

export type BjtSwitchLogicGeneration = {
  values: { config: BjtSwitchConfig; vcc: number; rb: number; rc: number };
  answer: {
    gate: "NOT" | "NAND" | "NOR";
    gateLabel: string;
    inputs: string[];                       // ["X"] 또는 ["X_1","X_2"]
    /** 진리표 각 행의 정답(H/L) — 빈칸 기호 순서와 같다. */
    rows: Array<{ inputs: string[]; out: "H" | "L" }>;
    blankSymbols: string[];                 // ㉠㉡(㉢㉣)
    onCondition: string;                    // 도통 조건 서술
  };
  circuitDiagram: BjtSwitchLogicCircuitDiagram;
  truthTable: TruthTableDiagram;
  gateDiagram: LogicNetworkDiagram;         // 정답(동일 동작 게이트) — solutionFigure
};

const BLANKS = ["㉠", "㉡", "㉢", "㉣"];

type Family = { config: BjtSwitchConfig; vcc: number; rb: number; rc: number };

// 원본 튜플 (참조·검증 전용) — 원본은 저항값이 기호(R_B·R_C)로만 주어지고 V_CC=5V다.
const ORIGINAL: Family = { config: "pnp_high_side", vcc: 5, rb: 10, rc: 1 };

/** 구성별 논리 함수 — 이상적 스위치 동작에서 규칙으로 도출한다(예시 하드코딩 아님). */
function logicOf(config: BjtSwitchConfig): {
  gate: "NOT" | "NAND" | "NOR";
  inputs: string[];
  fn: (v: boolean[]) => boolean;            // true = H
  onCondition: string;
} {
  switch (config) {
    case "pnp_high_side":
      return {
        gate: "NOT", inputs: ["X"],
        fn: (v) => !v[0],
        onCondition:
          "PNP는 이미터가 전원(V_CC)에 붙어 있으므로 베이스가 **L(0V)** 일 때 V_EB = V_CC가 되어 도통(포화)하고, " +
          "베이스가 H(V_CC)이면 V_EB = 0이라 차단된다.",
      };
    case "npn_low_side":
      return {
        gate: "NOT", inputs: ["X"],
        fn: (v) => !v[0],
        onCondition:
          "NPN은 이미터가 접지이므로 베이스가 **H** 일 때 V_BE > 0으로 도통(포화)하여 출력이 접지로 끌려 내려가고, " +
          "베이스가 L이면 차단되어 출력이 R_C를 통해 V_CC로 올라간다.",
      };
    case "npn_series2":
      return {
        gate: "NAND", inputs: ["X_1", "X_2"],
        fn: (v) => !(v[0] && v[1]),
        onCondition:
          "두 NPN이 **직렬**이므로 X₁과 X₂가 **모두 H**일 때만 전류 경로가 만들어져 출력이 접지로 끌려 내려간다. " +
          "하나라도 L이면 경로가 끊겨 출력은 R_C를 통해 V_CC로 올라간다.",
      };
    case "npn_parallel2":
      return {
        gate: "NOR", inputs: ["X_1", "X_2"],
        fn: (v) => !(v[0] || v[1]),
        onCondition:
          "두 NPN이 **병렬**이므로 X₁·X₂ 중 **하나라도 H**이면 그 트랜지스터가 도통해 출력이 접지로 끌려 내려간다. " +
          "둘 다 L이어야 출력이 R_C를 통해 V_CC로 올라간다.",
      };
  }
}

function solve(f: Family): BjtSwitchLogicGeneration {
  const { config, vcc, rb, rc } = f;
  const { gate, inputs, fn, onCondition } = logicOf(config);

  // 입력 조합 — 원본처럼 H를 먼저 쓴다(H, L 순).
  const combos: boolean[][] = inputs.length === 1
    ? [[true], [false]]
    : [[true, true], [true, false], [false, true], [false, false]];
  const rows = combos.map((c) => ({
    inputs: c.map((b) => (b ? "H" : "L")),
    out: (fn(c) ? "H" : "L") as "H" | "L",
  }));
  const blankSymbols = rows.map((_, i) => BLANKS[i]);

  const circuitDiagram: BjtSwitchLogicCircuitDiagram = {
    config,
    vccLabel: `+${vcc}V`,
    rbLabel: "R_B", rcLabel: "R_C",
    inputLabels: inputs.map((s) => s.replace("_", "_")),
    outputLabel: "출력 Y",
  };

  const truthTable: TruthTableDiagram = {
    variables: inputs,
    rows: rows.map((r, i) => ({ inputs: r.inputs, output: blankSymbols[i] })),
    outputLabel: "Y",
  };

  const gateDiagram: LogicNetworkDiagram = {
    inputs: [...inputs],
    outputs: ["Y"],
    gates: [{ id: "g1", type: gate, inputs: [...inputs], output: "Y" }],
  };

  return {
    values: { config, vcc, rb, rc },
    answer: {
      gate,
      gateLabel: gate === "NOT" ? "인버터(NOT 게이트)" : `${gate} 게이트`,
      inputs, rows, blankSymbols, onCondition,
    },
    circuitDiagram, truthTable, gateDiagram,
  };
}

/**
 * 값 공간 — 규칙 열거.
 *   · exam_similar: **원본 구성(pnp_high_side) 유지**, 전원 전압·저항값만 변경.
 *     원본이 V_CC=5V이므로 유사는 5V를 쓰지 않는다(원본 그대로의 재생산 금지).
 *   · exam_variant: **소자·구성 교환** — NPN 로우사이드(NOT)·직렬 2개(NAND)·병렬 2개(NOR).
 */
function buildSpace(mode: GenerationMode): Family[] {
  const out: Family[] = [];
  const configs: BjtSwitchConfig[] = mode === "exam_variant"
    ? ["npn_low_side", "npn_series2", "npn_parallel2"]
    : ["pnp_high_side"];
  const vccs = mode === "exam_variant" ? [3, 5, 9, 12] : [3, 9, 12];
  for (const config of configs)
    for (const vcc of vccs)
      for (const rb of [1, 2.2, 4.7, 10])
        for (const rc of [1, 2.2, 4.7, 10]) {
          if (rb === rc) continue;                       // 두 저항이 같으면 역할 구분이 흐려진다
          if (config === ORIGINAL.config && vcc === ORIGINAL.vcc) continue;   // 원본 튜플 제외
          out.push({ config, vcc, rb, rc });
        }
  return out;
}
const SIMILAR_SPACE = buildSpace("exam_similar");
const VARIANT_SPACE = buildSpace("exam_variant");

export function generateBjtSwitchLogicGate(args: { seed?: number; mode: GenerationMode }): BjtSwitchLogicGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const pool = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  return solve(pick(pool.length ? pool : SIMILAR_SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalBjtSwitchForVerify(): BjtSwitchLogicGeneration {
  return solve(ORIGINAL);
}
/** 스모크용 — 생성 풀 크기. */
export function __bjtSwitchPoolSizes(): { similar: number; variant: number } {
  return { similar: SIMILAR_SPACE.length, variant: VARIANT_SPACE.length };
}
