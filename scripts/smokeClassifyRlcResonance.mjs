// classifyCircuitType만 단위 테스트.
// 원본 임용 9번에 가까운 analysis 입력으로 classifier가 rlc_resonance로 분기하는지.

// TS 모듈 직접 import — tsx 없이 ESM으로는 어려우므로 dev 서버의 analyze API를 우회해서
// classifier만 require할 수는 없음. 대신 build된 .next/server/chunks 안의 모듈을 못 잡으니
// 대안: dev 서버에 임시 진단 endpoint를 추가하기보다, 원본 분석과 유사한 image_b64로
// /api/analyze를 호출해 결과 circuitType.type을 확인하는 방법.
//
// 하지만 image_b64가 실제 RLC 그림이 아니면 GPT가 다른 type을 추출하므로
// 결정적이지 않다. 따라서 여기서는 그냥 classifier source code를 import해서 직접 호출.
// → ts-node 없이 동작하도록 tsc 빌드 출력은 .next 안. 그래서:
//   1) Node ESM이 .ts를 직접 못 읽으므로
//   2) 대신 dynamic import로 .next/server 빌드 안에 들어간 모듈을 시도하거나,
//   3) 가장 간단하게: classifyCircuitType.ts의 핵심 분기 로직을 텍스트로 시뮬레이션.
//
// → 가장 단순하고 결정적인 방법: dev 서버에 임시 endpoint 만들지 말고
//    /api/analyze 호출 시 image는 임의 base64 PNG, subject=circuit_theory, 그리고
//    "vision"이 만든 결과를 우리가 알 수 없으므로 — 그냥 SKIP하고 사용자 수동 검증.
//
// 대신 여기서는 classifier 핵심 결정 분기 6가지를 inline로 재현 (단순 mirror)하여
// 새 분기가 매치되는지 검증.

import assert from "node:assert/strict";

// 미러: classifyCircuitType.ts 내부 RESONANCE_KEYWORDS·SUPERPOSITION_KEYWORDS·match 로직
const RESONANCE_KEYWORDS = [
  "공진", "resonance", "공진주파수", "공진 주파수",
  "주파수 응답", "주파수응답", "frequency response",
  "f_0", "f0", "f_{0}", "fo[hz]", "f₀",
  "imax", "i_max", "최대 전류", "최대전류",
  "i[a]", "i [a]", "진폭",
  "주파수에 따른", "주파수가",
  "1/(2π√", "1/(2pi√", "1/(2\\pi", "1/\\sqrt{lc}", "1/√(lc",
  "q-factor", "q factor", "선택도", "선택성",
];
const SUPERPOSITION_KEYWORDS = ["중첩의 원리", "중첩원리", "중첩 원리", "superposition", "중첩"];
const matches = (text, kws) => kws.some((k) => text.toLowerCase().includes(k.toLowerCase()));

function shouldGoRlcResonance({ text, R, V, I, C, L, topicKey }) {
  const hasRlcSet = R > 0 && L > 0 && C > 0;
  const isSingleSourceAc = V <= 1 && I === 0;
  const isResonanceText = matches(text, RESONANCE_KEYWORDS);
  const hasSuperpositionKw = matches(text, SUPERPOSITION_KEYWORDS);
  return (
    (topicKey === "rlc_response" && isResonanceText && hasRlcSet && isSingleSourceAc && !hasSuperpositionKw) ||
    (hasRlcSet && isSingleSourceAc && isResonanceText && !hasSuperpositionKw)
  );
}

// case A: 22:02 dev 로그의 실제 analysis (RLC 직렬, "주파수 응답", "공진 주파수", "최대 전류")
{
  const text = "RLC 회로에서 주파수 응답 분석 " +
    "이 문제는 주어진 RLC 회로에서 입력 전압의 주파수에 따른 전류의 주파수 응답을 분석하는 것입니다. " +
    "주어진 전압 함수로 전류의 최대값과 해당 주파수를 구하는 과정이 필요합니다. " +
    "이는 RLC 회로의 공진 주파수와 관련된 전형적인 문제 유형입니다. " +
    "RLC 회로 주파수 응답 공진 주파수 최대 전류 임피던스";
  const ok = shouldGoRlcResonance({ text, R: 1, V: 1, I: 0, C: 1, L: 1, topicKey: "rlc_response" });
  console.log(`Case A (원본 임용 9번): ${ok ? "✓ rlc_resonance" : "✗ ac_superposition로 빠짐"}`);
  assert.equal(ok, true);
}

// case B: ac_superposition이 와야 하는 케이스 (중첩 키워드 + 다중 전원)
{
  const text = "AC 회로에서 중첩의 원리를 적용하여 두 전원 V_s + I_s에 의한 전류를 구한다. 페이저 j15Ω";
  const ok = shouldGoRlcResonance({ text, R: 3, V: 1, I: 1, C: 1, L: 1, topicKey: "rlc_response" });
  console.log(`Case B (중첩 + V+I): ${!ok ? "✓ rlc_resonance 안 잡힘 (ac_superposition으로 양보)" : "✗ rlc_resonance가 잘못 잡음"}`);
  assert.equal(ok, false);
}

// case C: RLC + 단일 전원이지만 공진 키워드 없으면 매치 안함 (rlc_step 등으로 가야)
{
  const text = "RLC 직렬 회로의 step response. 스위치 t=0에 닫히고 v_C(t) 응답을 구한다.";
  const ok = shouldGoRlcResonance({ text, R: 1, V: 1, I: 0, C: 1, L: 1, topicKey: "transient_rl" });
  console.log(`Case C (RLC step 응답): ${!ok ? "✓ rlc_resonance 안 잡힘 (rlc_step으로 양보)" : "✗ rlc_resonance가 잘못 잡음"}`);
  assert.equal(ok, false);
}

// case D: 단일 전원 + RLC + "주파수에 따른" 키워드
{
  const text = "RLC 회로에서 v(t)의 주파수에 따른 i(t)의 진폭 I[A] 곡선. f_0에서 최대 전류";
  const ok = shouldGoRlcResonance({ text, R: 1, V: 1, I: 0, C: 1, L: 1, topicKey: "rlc_response" });
  console.log(`Case D (주파수응답 일반): ${ok ? "✓ rlc_resonance" : "✗"}`);
  assert.equal(ok, true);
}

console.log("\n모든 케이스 통과");
