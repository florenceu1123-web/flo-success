// T-FF + JK-FF 혼합 응용회로(임용 9번) 라우팅 검증 (API 호출 없음)
//   ★ ff_with_waveform(임용 8번, 단일 Q)이 "FF+파형" 넓은 조건으로 가로채던 회귀 방지.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeFfMixedRouting.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

const A = (o) => ({ relatedConcepts: [], fillInTheBlanks: [], componentInventory: [], ...o });

// ★ 신고 재현 — 실제 Vision 요약(로그: topic "T 플립플롭 회로 분석")
const reported = A({
  topic: "T 플립플롭 회로 분석",
  interpretation:
    "그림 (가)는 T 플립플롭과 JK 플립플롭을 이용한 응용회로이고, 그림 (나)는 (가)의 상태표이다. 그림 (다)와 같은 입력과 클록이 인가될 때 상태표의 ㉠~㉣과 ㉮~㉱를 구하고, 출력 Q_A와 Q_B의 파형을 도시한다.",
  relatedConcepts: ["T 플립플롭", "JK 플립플롭", "상태표", "타이밍도"],
  signals: { inputs: ["X", "클록"], outputs: ["Q_A", "Q_B"] },
  semantic: { hasStateTransition: true },
});
// 표현이 흔들린 실행(‘파형’ 강조, FF 종류는 한 번씩만 언급)
const looser = A({
  topic: "플립플롭 응용회로의 출력 파형",
  interpretation: "T-FF와 JK-FF로 구성된 회로에서 Q_A, Q_B의 출력 파형을 도시하는 문제이다.",
  signals: { inputs: ["X"], outputs: ["Q_A", "Q_B"] },
});
// ★ 회귀 — 임용 8번(단일 Q + 비동기 RESET + 파형)은 그대로 ff_with_waveform이어야 한다.
const imyong8 = A({
  topic: "플립플롭과 입력 파형",
  interpretation: "D 플립플롭과 비동기 RESET이 있는 회로에 입력 A, B, C와 클록이 인가될 때 출력 Q의 파형을 도시하는 문제이다.",
  relatedConcepts: ["D 플립플롭", "비동기 RESET", "타이밍도"],
  signals: { inputs: ["A", "B", "C"], outputs: ["Q"] },
});

const cases = [
  ["[신고 재현] T+JK 혼합 → flipflop_mixed_app", classifyCircuitType(reported, "digital_logic")?.type, "flipflop_mixed_app"],
  ["[표현 변형] T-FF·JK-FF + Q_A·Q_B → flipflop_mixed_app", classifyCircuitType(looser, "digital_logic")?.type, "flipflop_mixed_app"],
  ["[회귀] 임용8 단일 Q + RESET → ff_with_waveform 유지", classifyCircuitType(imyong8, "digital_logic")?.type, "ff_with_waveform"],
];

// ── 생성물 구조 검증 — 전용 archetype이 실제로 FF **2개**(T_A + JK_B)를 그리는가 ──
import { renderFfMixedAppCircuit } from "../lib/renderers/ffMixedAppCircuitRenderer.ts";
import { generateFfMixedApplication } from "../lib/generation/topologies/ffMixedApplication.ts";

let pass2 = 0;
const structCases = [];
try {
  const gen = generateFfMixedApplication({ seed: 1 });
  const d = gen.circuitDiagram ?? gen.diagram ?? gen;
  const svg = renderFfMixedAppCircuit(d);
  structCases.push(
    ["T 플립플롭(T_A) 표기", /T[_\s-]?A|T-FF/.test(svg), true],
    ["JK 플립플롭(J_B·K_B) 표기", /J[_\s-]?B/.test(svg) && /K[_\s-]?B/.test(svg), true],
    ["출력 Q_A·Q_B 둘 다 표기", /Q[_\s-]?A/.test(svg) && /Q[_\s-]?B/.test(svg), true],
    ["조합부 3개 정의(T_A·J_B·K_B)", Boolean(d?.taGate && d?.jbGate && d?.kbGate), true],
  );
} catch (e) {
  structCases.push(["렌더 성공", `실패: ${e?.message}`, true]);
}
for (const [name, got, want] of structCases) {
  const ok = got === want; if (ok) pass2++;
  console.log(`${ok ? "✓" : "✗"} ${name} (실제=${got})`);
}
console.log(`구조 ${pass2}/${structCases.length} ${pass2 === structCases.length ? "PASS" : "FAIL"}`);

let pass = 0;
for (const [name, got, want] of cases) {
  const ok = got === want; if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${name} (실제=${got})`);
}
const total = pass + pass2, want = cases.length + structCases.length;
console.log(`${total}/${want} ${total === want ? "PASS" : "FAIL"}`);
process.exit(total === want ? 0 : 1);
