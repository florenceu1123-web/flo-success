/**
 * smokeAsyncPresetRouting — 비동기 SET/RESET D-FF 응용회로(임용 10번, `async_preset_ripple_counter`)
 * 라우팅 회귀 스모크.
 *
 * ★ 왜 필요한가 (실측 신고 2026-08-04, "유사문제가 생성이 안돼"):
 *   서버 로그에서 같은 원본이 회차마다 다르게 분류됐다.
 *     · 정상 회차 → async_preset_ripple_counter (5/5 재현)
 *     · 실패 회차 → **ff_with_waveform** (topic="비동기식 D 플립플롭 회로", topicKey=switching_circuit)
 *       → ff_with_waveform_pipeline dispatch → FF 1개짜리 다른 문제가 totalIssues=0으로 조용히 생성.
 *   원인은 **아래첨자 표기**다. Vision은 회차에 따라 `I_0, I_1, I_2`(ASCII)로도, `I₀, I₁, I₂`
 *   (유니코드 아래첨자 + 쉼표)로도 쓴다. 기존 조건은 `/i_?0\b/`(ASCII)와 `/i₀\s*i₁\s*i₂/`(공백만
 *   허용)뿐이라 **쉼표로 나열된 아래첨자 표기에서 구조 신호가 통째로 미발화**했고, 그 회차에
 *   "SET" 낱말까지 빠지면 넓은 분기(ff_with_waveform)가 가져갔다.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAsyncPresetRouting.mjs
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

let pass = 0;
let fail = 0;
const check = (name, got, want) => {
  if (got === want) {
    pass++;
    console.log(`  ok   ${name} → ${got}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} → ${got} (기대: ${want})`);
  }
};

const mk = (o) => ({
  topic: "",
  interpretation: "",
  relatedConcepts: [],
  fillInTheBlanks: [],
  signals: { inputs: [], outputs: [] },
  componentInventory: [],
  ...o,
});

console.log("=== 1. 신고 회차 재현 (아래첨자 + 쉼표 표기) ===");
// 로그 실측: topic="비동기식 D 플립플롭 회로", topicKey="switching_circuit", 마커 없음.
// SET 낱말이 빠지고 I·Q가 아래첨자+쉼표로 나열된 형태.
check(
  "아래첨자 I₀,I₁,I₂ + Q₀,Q₁,Q₂ (SET 없음)",
  classifyCircuitType(
    mk({
      topic: "비동기식 D 플립플롭 회로",
      topicKey: "switching_circuit",
      interpretation:
        "D 플립플롭 3개를 이용한 회로로, 입력 I₀, I₁, I₂가 주어질 때 각 플립플롭의 출력 Q₀, Q₁, Q₂를 " +
        "클럭 파형에 따라 구하는 문제이다. 초깃값은 0이다.",
      relatedConcepts: ["D 플립플롭", "비동기 회로", "리셋", "출력 파형", "클럭"],
    }),
    "digital_logic",
  ).type,
  "async_preset_ripple_counter",
);
check(
  "아래첨자 Q만 (I 입력 언급 없음, SET 없음)",
  classifyCircuitType(
    mk({
      topic: "비동기식 D 플립플롭 회로",
      interpretation:
        "비동기 입력을 갖는 D 플립플롭 응용회로에서 출력 Q₀, Q₁, Q₂의 파형을 구간별로 도시하는 문제이다. " +
        "리셋 동작이 포함된다.",
      relatedConcepts: ["D 플립플롭", "비동기", "파형"],
    }),
    "digital_logic",
  ).type,
  "async_preset_ripple_counter",
);
check(
  "가운뎃점 구분 I₀·I₁·I₂",
  classifyCircuitType(
    mk({
      topic: "D 플립플롭 응용회로",
      interpretation: "입력 I₀·I₁·I₂ = 101일 때 플립플롭 출력의 변화를 구한다. 클럭 파형이 주어진다.",
      relatedConcepts: ["플립플롭", "비동기", "리셋"],
    }),
    "digital_logic",
  ).type,
  "async_preset_ripple_counter",
);

console.log("\n=== 2. 기존(정상) 회차 무회귀 ===");
check(
  "ASCII I_0,I_1,I_2 + SET/RESET 명시 (실측 요약)",
  classifyCircuitType(
    mk({
      topic: "D 플립플롭을 이용한 순서회로",
      interpretation:
        "주어진 회로는 비동기식 SET과 RESET을 가진 D 플립플롭을 이용하여 특정 입력 조건에서의 출력 상태를 " +
        "분석하는 문제입니다. 초기 상태에서 모든 플립플롭의 출력이 0으로 설정되어 있으며, 입력 I_0, I_1, I_2가 " +
        "101일 때 각 플립플롭의 상태 변화를 구하는 것이 목표입니다.",
      relatedConcepts: ["D 플립플롭", "비동기식 회로", "SET과 RESET", "순서회로", "타이밍 다이어그램"],
    }),
    "digital_logic",
  ).type,
  "async_preset_ripple_counter",
);
check(
  "signals.inputs 로만 I0/I1/I2 전달",
  classifyCircuitType(
    mk({
      topic: "D 플립플롭 응용회로",
      interpretation: "플립플롭의 출력 상태를 클럭에 따라 구한다.",
      signals: { inputs: ["I0", "I1", "I2", "CLK"], outputs: ["Q0", "Q1", "Q2"] },
    }),
    "digital_logic",
  ).type,
  "async_preset_ripple_counter",
);

console.log("\n=== 3. 형제 유형 미탈취 (회귀) ===");
check(
  "임용 8번 ff_with_waveform (단일 Q + 비동기 RESET + 입력 A·B·C)",
  classifyCircuitType(
    mk({
      topic: "플립플롭과 파형 분석",
      interpretation:
        "비동기 RESET을 갖는 플립플롭 회로에서 입력 파형 A, B, C가 주어질 때 출력 Q의 파형을 도시한다.",
      relatedConcepts: ["플립플롭", "비동기 리셋", "파형"],
      signals: { inputs: ["A", "B", "C"], outputs: ["Q"] },
    }),
    "digital_logic",
  ).type,
  "ff_with_waveform",
);
// D-FF **2비트**(Q₁Q₀) 형식은 이 archetype이 아니다. 어느 형제로 가든 상관없지만
// async_preset_ripple_counter가 뺏으면 안 된다(3비트 Q가 판별선이므로).
{
  const got = classifyCircuitType(
    mk({
      topic: "D 플립플롭 순서회로 분석",
      interpretation:
        "D 플립플롭 2개로 구성된 회로에서 상태 Q₁, Q₀의 변화를 입력 파형에 따라 분석하고, 점선 부분을 " +
        "최소한의 AND 게이트와 OR 게이트로 재구성하여 도시한다.",
      relatedConcepts: ["D 플립플롭", "순서논리", "타이밍"],
    }),
    "digital_logic",
  ).type;
  if (got !== "async_preset_ripple_counter") {
    pass++;
    console.log(`  ok   D-FF 2비트(Q₁Q₀)는 미탈취 → ${got}`);
  } else {
    fail++;
    console.log(`  FAIL D-FF 2비트(Q₁Q₀)를 async_preset이 탈취`);
  }
}
check(
  "JK 동기식 카운터",
  classifyCircuitType(
    mk({
      topic: "JK 플립플롭 동기식 카운터",
      interpretation: "JK 플립플롭 3개로 구성된 동기식 카운터의 타이밍 도표에 출력을 도시한다.",
      relatedConcepts: ["JK 플립플롭", "카운터", "타이밍"],
    }),
    "digital_logic",
  ).type,
  "jk_sync_counter",
);
check(
  "T-FF + JK-FF 혼합 (임용 9번)",
  classifyCircuitType(
    mk({
      topic: "T 플립플롭과 JK 플립플롭 응용회로",
      interpretation: "T 플립플롭과 JK 플립플롭으로 구성된 회로의 상태표 ㉠~㉣을 채우고 파형을 도시한다.",
      relatedConcepts: ["T 플립플롭", "JK 플립플롭", "상태표"],
    }),
    "digital_logic",
  ).type,
  "flipflop_mixed_app",
);
check(
  "mod-N 카운터 + 미사용 상태 리셋",
  classifyCircuitType(
    mk({
      topic: "mod-6 동기식 카운터",
      interpretation: "사용되지 않는 상태를 리셋으로 처리하는 mod-6 카운터를 설계한다.",
      relatedConcepts: ["카운터", "리셋"],
    }),
    "digital_logic",
  ).type,
  "mod_n_counter_reset",
);

console.log(`\n=== ${pass}/${pass + fail} pass ===`);
if (fail > 0) process.exit(1);
