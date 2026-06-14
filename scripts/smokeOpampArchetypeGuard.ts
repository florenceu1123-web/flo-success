/**
 * detectOpampArchetype 회귀 가드 — 차동증폭기·캡 없는 회로가 Wien Bridge로 오매치되지 않는지.
 *
 *  실행: npx tsx scripts/smokeOpampArchetypeGuard.ts
 */
import { detectOpampArchetype } from "../lib/analysis/detectOpampArchetype";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("  ✗ FAIL:", msg); failed++; }
  else console.log("  ✓", msg);
}

// 1. 차동증폭기 (임용 9번) — 차동/공통모드 이득. Wien·archetype 아님 → null (→ opamp_generic).
const diffAmp = {
  componentInventory: [
    { type: "OPAMP" }, { type: "V" }, { type: "I" },
    { type: "R" }, { type: "R" }, { type: "R" }, { type: "R" }, { type: "R" },
  ],
};
const diffText = ["연산증폭기 차동모드 이득과 공통모드 이득을 구한다. 출력 V_o를 식으로 나타낸다."];
assert(detectOpampArchetype(diffAmp, diffText) === null, "차동증폭기 → null (Wien 오매치 차단)");

// 2. 캡 없는데 '피드백/루프' 키워드만 있는 OPAMP → Wien(발진기) 아님 → null.
const noCapFeedback = {
  componentInventory: [{ type: "OPAMP" }, { type: "R" }, { type: "R" }, { type: "R" }, { type: "R" }, { type: "R" }],
};
const fbText = ["출력이 되먹임되는 루프 회로. 피드백 조건."];
const r2 = detectOpampArchetype(noCapFeedback, fbText);
assert(r2 !== "WIEN_BRIDGE_OSCILLATOR", `캡 없는 피드백 회로 → Wien 아님 (got ${r2})`);

// 3. 진짜 Wien Bridge (R≥4·C=2·OPAMP) + 발진 키워드 — 여전히 매치 (회귀 아님 확인).
const wien = {
  componentInventory: [
    { type: "OPAMP" }, { type: "R" }, { type: "R" }, { type: "R" }, { type: "R" },
    { type: "C" }, { type: "C" },
  ],
};
const wienText = ["빈 브리지 발진기. RC 회로망 피드백 루프. 발진 조건 barkhausen β."];
const r3 = detectOpampArchetype(wien, wienText);
assert(r3 === "WIEN_BRIDGE_OSCILLATOR", `진짜 Wien Bridge → 매치 유지 (got ${r3})`);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
if (failed > 0) process.exit(1);
