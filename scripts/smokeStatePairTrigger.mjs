// state_before/state_after 요구 트리거 회귀 테스트 (API 없음)
//
//   사용자 신고(2026-07-29): "필수 figure role 누락: state_before / state_after".
//   로그: route=ac_superposition_pipeline, topicKey=**switching_circuit**, totalIssues=2.
//   원인: roleTriggers가 topicKey=switching_circuit 하나만으로 상태쌍을 무조건 요구했는데,
//   페이저 중첩(ac_superposition)은 스위치가 없는 단일 정상상태 회로다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeStatePairTrigger.mjs
import { resolveRequiredFigureRoles } from "../lib/rules/roleTriggers.ts";
import { resolveRules } from "../lib/rules/index.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const hasStatePair = (roles) => roles.includes("state_before") || roles.includes("state_after");

const AC_SUP_TEXT =
  "교류 전압원과 전류원이 포함된 회로에서 중첩의 원리로 마디 a에서 b로 흐르는 전류와 평균 전력을 구한다. 페이저 해석, 정상상태.";
const SWITCH_TEXT =
  "스위치가 t=0에서 닫힌 후 회로의 응답을 구한다. t<0에서 정상상태였고 스위치가 열려 있었다.";

console.log("\n[1] 신고 재현 — topicKey=switching_circuit 오판 + 페이저 정상상태(semantic 상태전이 false)");
{
  const roles = resolveRequiredFigureRoles({
    subjectKey: "circuit_theory", topicKey: "switching_circuit", text: AC_SUP_TEXT,
    semantic: { hasStateTransition: false, hasWaveformEvolution: false, hasEquivalentTransformation: false },
  });
  ok("상태쌍 요구 안 함", !hasStatePair(roles), `roles=${roles.join(",")}`);
  const rs = resolveRules({
    subject: "circuit_theory", topicKey: "switching_circuit", text: AC_SUP_TEXT,
    semantic: { hasStateTransition: false, hasWaveformEvolution: false, hasEquivalentTransformation: false, requiresMultiFigure: false },
    circuitType: "ac_superposition",
  });
  ok("resolveRules에도 상태쌍 없음", !hasStatePair(rs.requiredFigureRoles ?? []), `roles=${(rs.requiredFigureRoles ?? []).join(",")}`);
}

console.log("\n[2] 회귀 — 진짜 스위칭 문제는 그대로 상태쌍 요구");
{
  const roles = resolveRequiredFigureRoles({
    subjectKey: "circuit_theory", topicKey: "switching_circuit", text: SWITCH_TEXT,
    semantic: { hasStateTransition: true, hasWaveformEvolution: false, hasEquivalentTransformation: false },
  });
  ok("topicKey=switching_circuit + 상태전이 true → 상태쌍 요구", hasStatePair(roles), `roles=${roles.join(",")}`);

  // semantic 미지정(undefined)이어도 topicKey가 switching_circuit이면 기존대로 요구(보수적 동작 유지).
  const roles2 = resolveRequiredFigureRoles({
    subjectKey: "circuit_theory", topicKey: "switching_circuit", text: SWITCH_TEXT, semantic: {},
  });
  ok("semantic 미지정 → 기존대로 상태쌍 요구", hasStatePair(roles2), `roles=${roles2.join(",")}`);

  // 스위치 본문 + 상태어 (topicKey는 다른 값) → 일반 경로로 여전히 요구
  const roles3 = resolveRequiredFigureRoles({
    subjectKey: "circuit_theory", topicKey: "transient_rc", text: SWITCH_TEXT,
    semantic: { hasStateTransition: true },
  });
  ok("본문 스위치+상태어 → 상태쌍 요구(일반 경로)", hasStatePair(roles3), `roles=${roles3.join(",")}`);
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
